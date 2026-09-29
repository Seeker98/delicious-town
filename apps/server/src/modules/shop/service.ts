import { goodsEffectHours, GOODS_TYPE, type Goods } from '@dt/config';
import {
  ErrorCode,
  hashSeed,
  latestSlot,
  seededRng,
  type ShopDto,
  type ShopItemDto,
  type ShopSpecialDto,
  type Slot,
} from '@dt/shared';
import { sql } from 'kysely';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin, spendDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { postNews } from '../news/news';
import { assertStoreRoom, consumeGoods, countGoods, grantGoodsOp, removeHonor } from '../store/goods';
import { isPlaque, sellPrice } from '../store/rules';

/** 勋章、牌匾只能一个一个买；永久的已拥有就不能再买；其他道具受持有上限和仓库容量限制 */
async function assertBuyable(o: Op, g: Goods, num: number): Promise<void> {
  const plaque = isPlaque(g);
  const honor = g.type === GOODS_TYPE.honor;
  if ((plaque || honor || !g.stackable) && num > 1) throw invalidState('single', { goodsId: g.id });
  const have = await countGoods(o, g.id);
  const permanent = plaque || (honor && goodsEffectHours(g) === null);
  if (permanent && have > 0) throw limitReached('owned', { goodsId: g.id });
  if (!plaque && !honor && have + num > g.maxNum) throw limitReached('max', { max: g.maxNum });
  await assertStoreRoom(o, g.id);
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
      const rows = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', ctx.restaurantId)
        .execute();
      const owned = new Map(rows.map((r) => [r.goods_id, r.num]));
      const limitOf = (g: Goods) => (isPlaque(g) || g.type === GOODS_TYPE.honor || !g.stackable ? 1 : null);
      const coin: ShopItemDto[] = d.config.bundle.goods
        .filter((g) => g.onSale && g.coin > 0)
        .map((g) => ({ goodsId: g.id, price: g.coin, owned: owned.get(g.id) ?? 0, limit: limitOf(g) }));
      const black: ShopItemDto[] = d.config.bundle.shopPools.black
        .map((id) => d.config.requireGoods(id))
        .filter((g) => g.diamond > 0)
        .map((g) => ({ goodsId: g.id, price: g.diamond, owned: owned.get(g.id) ?? 0, limit: limitOf(g) }));
      return { coin, black };
    },

    async special(ctx: RestCtx): Promise<ShopSpecialDto | null> {
      const r = await specialRow(ctx.shardId);
      if (!r) return null;
      const g = d.config.requireGoods(r.goods_id);
      return {
        day: r.day,
        goodsId: r.goods_id,
        tierName: r.tier_name,
        discount: r.discount,
        price: Math.ceil(g.coin * r.discount),
        stock: r.stock,
        sold: r.sold,
      };
    },

    /** 每日特价（规格书 06 §6.5）：从特价池均匀抽一个，按 [0,1) 随机数落在哪个区间定折扣档 */
    async rollSpecial(shardId: number, slot: Slot, now: Date): Promise<{ goodsId: number; tier: string }> {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(hashSeed(shardId, 'shop-special', slot.day));
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
        await assertBuyable(o, g, b.num);
        spendCoin(o, Math.ceil(g.coin * row.discount) * b.num);
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
        gainCoin(o, Math.floor(g.coin * b.num * o.tuning.shop.sellRate));
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
