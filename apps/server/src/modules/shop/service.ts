import { goodsEffectHours, GOODS_TYPE, takesStoreSlot, type Goods, type Tuning } from '@dt/config';
import {
  ErrorCode,
  gameDay,
  latestSlot,
  seededRng,
  type ShopDto,
  type ShopItemDto,
  type ShopSpecialDto,
  type Slot,
  weekStart,
} from '@dt/shared';
import { sql } from 'kysely';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin, spendDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { getDailies, getDaily, incrementDaily } from '../counter/dailyCounter';
import { postNews } from '../news/news';
import {
  assertStoreRoom,
  consumeGoods,
  countGoods,
  grantGoodsOp,
  looseEquipCount,
  removeHonor,
} from '../store/goods';
import { isPlaque, sellPrice } from '../store/rules';
import { buyCap } from './rules';
import { gameSeed } from '../../core/seed';

/** 勋章、牌匾只能一个一个买；永久的已拥有就不能再买；其他道具受持有上限和仓库容量限制 */
/** 每日特价的单价：折后价，但不低于卖店价 + 1（五折、一折原来买了直接卖店就赚，backlog 2026-10-25） */
function specialPrice(g: Goods, discount: number, tuning: Tuning): number {
  const sell = sellPrice(g, tuning);
  return Math.max(Math.ceil(g.coin * discount), sell === null ? 0 : sell + 1);
}

async function assertBuyable(o: Op, g: Goods, num: number): Promise<void> {
  // 后期海报奖杯按星级可用（问题记录 146）
  if ((g.needStar ?? 0) > o.rest.star_level)
    throw requirement('star', { need: g.needStar, have: o.rest.star_level });
  const plaque = isPlaque(g);
  const honor = g.type === GOODS_TYPE.honor;
  if ((plaque || honor || !g.stackable) && num > 1) throw invalidState('single', { goodsId: g.id });
  const have = await countGoods(o, g.id);
  const permanent = plaque || (honor && goodsEffectHours(g) === null);
  if (permanent && have > 0) throw limitReached('owned', { goodsId: g.id });
  if (!plaque && !honor && have + num > g.maxNum) throw limitReached('max', { max: g.maxNum });
  await assertStoreRoom(o, g.id);
}

/** 每日限购的计数键（daily_counter，天气改版：晴雨签每天 1 个）；每周限购用同一个键记在 weekly_counter */
const dailyKey = (goodsId: number) => `shop.buy:${goodsId}`;
const dailyLimitOf = (o: { tuning: Tuning }, goodsId: number) =>
  new Map(o.tuning.shop.dailyLimit).get(goodsId);
const weeklyLimitOf = (o: { tuning: Tuning }, goodsId: number) =>
  new Map(o.tuning.shop.weeklyLimit).get(goodsId);

/**
 * 限购（每天、每周）检查并记数：银币店和黑市共用计数（道具价格迁移 2026-10-15：体力卡、强化石只在黑市卖也要限）。
 * 周按游戏日所在的周一起算
 */
async function claimLimits(o: Op, goodsId: number, num: number): Promise<void> {
  const day = gameDay(o.now);
  const daily = dailyLimitOf(o, goodsId);
  if (daily !== undefined) {
    const used = await getDaily(o.tx, o.rest.id, dailyKey(goodsId), day);
    if (used + num > daily) throw limitReached('shop_daily', { max: daily, used });
    await incrementDaily(o.tx, o.rest.id, dailyKey(goodsId), num, day);
  }
  const weekly = weeklyLimitOf(o, goodsId);
  if (weekly !== undefined) {
    const week = weekStart(day);
    const row = await o.tx
      .selectFrom('weekly_counter')
      .select('count')
      .where('rest_id', '=', o.rest.id)
      .where('week', '=', week)
      .where('key', '=', dailyKey(goodsId))
      .executeTakeFirst();
    const used = row?.count ?? 0;
    if (used + num > weekly) throw limitReached('shop_weekly', { max: weekly, used });
    await o.tx
      .insertInto('weekly_counter')
      .values({ rest_id: o.rest.id, week, key: dailyKey(goodsId), count: num })
      .onConflict((oc) =>
        oc
          .columns(['rest_id', 'week', 'key'])
          .doUpdateSet((eb) => ({ count: eb('weekly_counter.count', '+', num) })),
      )
      .execute();
  }
}

export function createShopService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'shop', source }, fn);

  async function specialRow(shardId: number) {
    const { tuning } = await d.shards.settings(shardId);
    const day = latestSlot(d.now(), [tuning.shop.specialHour]).day;
    return d.db
      .selectFrom('shop_special')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .executeTakeFirst();
  }

  return {
    async items(ctx: RestCtx): Promise<ShopDto> {
      const now = d.now();
      const day = gameDay(now);
      // 几条读互不依赖，一起发（原来一条接一条，每日限购的道具还一个一个查）
      const settingsP = d.shards.settings(ctx.shardId);
      const [{ tuning }, rest, rows, loose, bought, boughtWeek] = await Promise.all([
        settingsP,
        d.db
          .selectFrom('restaurant')
          .select(['coin', 'diamond', 'store_num', 'star_level'])
          .where('id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
        d.db
          .selectFrom('store_item')
          .select(['goods_id', 'num', 'expires_at'])
          .where('rest_id', '=', ctx.restaurantId)
          .execute(),
        looseEquipCount(d.db, ctx.restaurantId),
        settingsP.then(async (st) => {
          const ids = [...new Map(st.tuning.shop.dailyLimit).keys()];
          if (ids.length === 0) return new Map<number, number>();
          const got = await getDailies(d.db, ctx.restaurantId, ids.map(dailyKey), day);
          return new Map(ids.map((id) => [id, got[dailyKey(id)] ?? 0]));
        }),
        settingsP.then(async (st) => {
          const ids = [...new Map(st.tuning.shop.weeklyLimit).keys()];
          if (ids.length === 0) return new Map<string, number>();
          const weekRows = await d.db
            .selectFrom('weekly_counter')
            .select(['key', 'count'])
            .where('rest_id', '=', ctx.restaurantId)
            .where('week', '=', weekStart(day))
            .where('key', 'in', ids.map(dailyKey))
            .execute();
          return new Map(weekRows.map((r) => [r.key, r.count]));
        }),
      ]);
      const owned = new Map(
        rows.map((r) => [r.goods_id, r.expires_at !== null && r.expires_at <= now ? 0 : r.num]),
      );
      // 仓库占用：与 storeKinds 同一口径（占格道具种数 + 未穿戴厨具件数）
      const kinds =
        rows.filter((r) => r.num > 0 && takesStoreSlot(d.config.goods.get(r.goods_id))).length + loose;
      const storeFull = kinds >= rest.store_num;
      const limits = new Map(tuning.shop.dailyLimit);
      const weeklyLimits = new Map(tuning.shop.weeklyLimit);
      const limitOf = (g: Goods) => (isPlaque(g) || g.type === GOODS_TYPE.honor || !g.stackable ? 1 : null);
      const row = (g: Goods, price: number, money: number): ShopItemDto => {
        const have = owned.get(g.id) ?? 0;
        const limit = limits.get(g.id);
        const left = limit === undefined ? undefined : Math.max(0, limit - (bought.get(g.id) ?? 0));
        const wLimit = weeklyLimits.get(g.id);
        const wLeft =
          wLimit === undefined ? undefined : Math.max(0, wLimit - (boughtWeek.get(dailyKey(g.id)) ?? 0));
        const cap = buyCap(
          g,
          {
            owned: have,
            money,
            price,
            storeFull,
            star: rest.star_level,
            dailyLeft: left,
            weeklyLeft: wLeft,
          },
          tuning.shop.maxBuy,
        );
        return {
          goodsId: g.id,
          price,
          owned: have,
          limit: limitOf(g),
          maxBuy: cap.max,
          blocked: cap.blocked,
          ...(g.needStar ? { needStar: g.needStar } : {}),
          ...(limit !== undefined ? { daily: { limit, left: left! } } : {}),
          ...(wLimit !== undefined ? { weekly: { limit: wLimit, left: wLeft! } } : {}),
        };
      };
      const coin = d.config.bundle.goods
        .filter((g) => g.onSale && g.coin > 0)
        .map((g) => row(g, g.coin, rest.coin));
      const black = d.config.bundle.shopPools.black
        .map((id) => d.config.requireGoods(id))
        .filter((g) => g.diamond > 0)
        .map((g) => row(g, g.diamond, rest.diamond));
      return { coin, black };
    },

    async special(ctx: RestCtx): Promise<ShopSpecialDto | null> {
      const [r, { tuning }] = await Promise.all([specialRow(ctx.shardId), d.shards.settings(ctx.shardId)]);
      if (!r) return null;
      const g = d.config.requireGoods(r.goods_id);
      // 抽好之后道具改成了没有银币价的（节油器改版把 30202、30207 改成黑市钻石货），不再卖
      if (g.coin <= 0) return null;
      return {
        day: r.day,
        goodsId: r.goods_id,
        tierName: r.tier_name,
        // 实际折扣：不低于卖店价时比档位的折扣少（标签按它写几折）
        discount: specialPrice(g, r.discount, tuning) / g.coin,
        price: specialPrice(g, r.discount, tuning),
        stock: r.stock,
        sold: r.sold,
      };
    },

    /** 每日特价（规格书 06 §6.5）：从特价池均匀抽一个，按 [0,1) 随机数落在哪个区间定折扣档 */
    async rollSpecial(shardId: number, slot: Slot, now: Date): Promise<{ goodsId: number; tier: string }> {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(gameSeed(shardId, 'shop-special', slot.day));
      const pool = d.config.bundle.shopPools.special;
      const goodsId = pool.length > 0 ? pool[rng.int(pool.length)]! : tuning.shop.specialFallbackGoods;
      const roll = rng.next();
      const tiers = d.config.bundle.shopSpecialTiers;
      const tier = tiers.find((x) => roll >= x.from && roll < x.to) ?? tiers[0]!;
      await d.db
        .insertInto('shop_special')
        .values({
          shard_id: shardId,
          day: slot.day,
          goods_id: goodsId,
          discount: tier.discount,
          tier_name: tier.name,
          stock: tier.stock,
        })
        .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
        .execute();
      await postNews(d.db, { shardId, type: 'shop.special', params: { goodsId, tier: tier.name } }, now);
      return { goodsId, tier: tier.name };
    },

    buy(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'shop.buy', async (o) => {
        const g = o.config.requireGoods(b.goodsId);
        if (!g.onSale || g.coin <= 0) throw invalidState('not_on_sale', { goodsId: g.id });
        await assertBuyable(o, g, b.num);
        await claimLimits(o, g.id, b.num);
        spendCoin(o, g.coin * b.num);
        await grantGoodsOp(o, g.id, b.num);
        await emitAction(o, 'shop.buy');
        return { goodsId: g.id, num: b.num };
      });
    },

    buySpecial(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'shop.special', async (o) => {
        const day = latestSlot(o.now, [o.tuning.shop.specialHour]).day;
        const row = await o.tx
          .updateTable('shop_special')
          .set({ sold: sql<number>`sold + ${b.num}` })
          .where('shard_id', '=', o.shardId)
          .where('day', '=', day)
          .where(sql<boolean>`sold + ${b.num} <= stock`)
          .returning(['goods_id', 'discount'])
          .executeTakeFirst();
        if (!row) {
          const exists = await o.tx
            .selectFrom('shop_special')
            .select('day')
            .where('shard_id', '=', o.shardId)
            .where('day', '=', day)
            .executeTakeFirst();
          if (!exists) throw invalidState('no_special');
          throw new AppError(ErrorCode.SOLD_OUT, 400);
        }
        const g = o.config.requireGoods(row.goods_id);
        // 没有银币价了就不卖，不然按 0 元白拿（代码审查 2026-10-19）；报错整单回滚，库存不占
        if (g.coin <= 0) throw invalidState('not_on_sale', { goodsId: g.id });
        await assertBuyable(o, g, b.num);
        // 每日特价抽到限购道具（体力卡）也算进同一份每天、每周计数（代码审查 2026-10-15）；超了整单回滚，库存不占
        await claimLimits(o, g.id, b.num);
        spendCoin(o, specialPrice(g, row.discount, o.tuning) * b.num);
        await grantGoodsOp(o, g.id, b.num);
        await emitAction(o, 'shop.buy');
        return { goodsId: g.id, num: b.num };
      });
    },

    buyBlack(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'shop.black', async (o) => {
        const g = o.config.requireGoods(b.goodsId);
        if (!o.config.bundle.shopPools.black.includes(g.id) || g.diamond <= 0)
          throw invalidState('not_on_sale', { goodsId: g.id });
        await assertBuyable(o, g, b.num);
        await claimLimits(o, g.id, b.num);
        spendDiamond(o, g.diamond * b.num);
        await grantGoodsOp(o, g.id, b.num);
        return { goodsId: g.id, num: b.num };
      });
    },

    sell(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'shop.sell', async (o) => {
        const g = o.config.requireGoods(b.goodsId);
        const price = sellPrice(g, o.tuning);
        if (price === null) throw invalidState('not_sellable', { goodsId: g.id });
        if (isPlaque(g) && (await countGoods(o, g.id)) - b.num < 1) throw invalidState('keep_one_plaque');
        await consumeGoods(o, g.id, b.num);
        // 按页面上显示的单价乘数量付，确认框写的数和到账一致（终审）
        gainCoin(o, price * b.num);
        return { goodsId: g.id, num: b.num };
      });
    },

    discard(ctx: RestCtx, b: { goodsId: number }) {
      return op(ctx, 'shop.discard', async (o) => {
        if (!o.tuning.shop.discardable.includes(b.goodsId))
          throw invalidState('not_discardable', { goodsId: b.goodsId });
        if (!(await removeHonor(o, b.goodsId))) throw invalidState('not_owned', { goodsId: b.goodsId });
        return { goodsId: b.goodsId };
      });
    },
  };
}

export type ShopService = ReturnType<typeof createShopService>;
