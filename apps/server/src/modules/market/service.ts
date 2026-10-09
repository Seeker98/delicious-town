import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { GOODS } from '@dt/config';
import {
  ErrorCode,
  nextSlot,
  seededRng,
  gameDay,
  type ManualStockDto,
  type MarketDto,
  type MarketItemDto,
  type Slot,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { createOp, flushOp, restLog, runOp, runSystemOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { withRestaurants } from '../../db/tx';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { addFoods, cupboardSlotsUsed, foodsMap } from '../cupboard/foods';
import { postNews } from '../news/news';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { validNum } from '../takeaway/common';
import { getDaily } from '../counter/dailyCounter';
import { manualStock } from './manual';
import type { WorldService } from '../world/service';
import { manualCost, personLimit, rollShelf, unitPrice, type Shelf } from './rules';
import { gameSeed } from '../../core/seed';

const deviceSubject = (id: string) => `dev:${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;

/**
 * 特价的同 IP 间隔（规格书 06 §6.2）：记下上次购买的游戏时间，按游戏时间比较（模拟器的虚拟时钟也适用），
 * 检查和写入在一个脚本里原子完成。KEYS[1]=键，ARGV=现在(毫秒)、间隔(毫秒)、键的保留秒数。
 * 可以买时返回 1；还在间隔内时返回 −剩余毫秒
 */
const COOLDOWN_LUA = `
local last = redis.call('GET', KEYS[1])
if last and tonumber(ARGV[1]) - tonumber(last) < tonumber(ARGV[2]) then
  return tonumber(last) + tonumber(ARGV[2]) - tonumber(ARGV[1]) > 0 and -(tonumber(last) + tonumber(ARGV[2]) - tonumber(ARGV[1])) or 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1`;

/** 购买失败回滚时撤销刚写入的间隔：只删自己写的那个值，避免误删别的请求写的 */
const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
return 1`;

/** 限购计数：累加后超过上限就不写入，并报 LIMIT_REACHED（并发时靠行锁串行） */
async function claimLimit(o: Op, itemId: number, subject: string, num: number, limit: number): Promise<void> {
  if (num > limit) throw limitReached('market', { limit });
  const r = await o.tx
    .insertInto('market_buy')
    .values({ market_item_id: itemId, subject, num })
    .onConflict((oc) =>
      oc
        .columns(['market_item_id', 'subject'])
        .doUpdateSet({ num: sql<number>`market_buy.num + excluded.num` })
        .where(sql<boolean>`market_buy.num + excluded.num <= ${limit}`),
    )
    .returning('num')
    .executeTakeFirst();
  if (!r) throw limitReached('market', { limit });
}

export function createMarketService(d: GameDeps, world: WorldService) {
  type Log = { error(obj: object, msg: string): void };

  async function settleGuess(shardId: number, slot: Slot, opened: number[], now: Date, restId: number) {
    await runSystemOp(d, shardId, restId, { source: 'market.guess', now }, async (o) => {
      const g = await o.tx
        .selectFrom('market_guess')
        .selectAll()
        .where('shard_id', '=', shardId)
        .where('period', '=', slot.key)
        .where('rest_id', '=', restId)
        .where('settled_at', 'is', null)
        .executeTakeFirst();
      if (!g) return;
      const hits = g.foods_ids.filter((id) => opened.includes(id)).length;
      const award = o.config.bundle.guessAwards.find((a) => a.hits === hits);
      if (award) await grantAward(o, award.award, { source: 'market.guess' });
      if (o.tuning.market.guessBonusHours.includes(slot.hour)) {
        const bonus = o.config.bundle.guessBonus.find((b) => hits >= b.minHits);
        if (bonus) await grantAward(o, bonus.award, { source: 'market.guess.bonus' });
      }
      await o.tx
        .updateTable('market_guess')
        .set({ hits, settled_at: now })
        .where('shard_id', '=', shardId)
        .where('period', '=', slot.key)
        .where('rest_id', '=', restId)
        .execute();
      restLog(o, 'market.guess', { period: slot.key, hits });
      // 支线“菜场竞猜”（问题记录 515）：一次猜中 3 种以上、5 种以上
      if (hits >= 3) await emitAction(o, 'market.guess.hit3');
      if (hits >= 5) await emitAction(o, 'market.guess.hit5');
    });
  }

  /** 报名的那一轮因为 worker 停机没有开奖：退还报名费，标记已结算（hits 留空） */
  async function refundGuess(shardId: number, period: string, now: Date, restId: number) {
    await runSystemOp(d, shardId, restId, { source: 'market.guess.refund', now }, async (o) => {
      const r = await o.tx
        .updateTable('market_guess')
        .set({ settled_at: now })
        .where('shard_id', '=', shardId)
        .where('period', '=', period)
        .where('rest_id', '=', restId)
        .where('settled_at', 'is', null)
        .returning('rest_id')
        .executeTakeFirst();
      if (!r) return;
      await grantGoodsOp(o, GOODS.mysteryTicket, o.tuning.market.guessCost, {
        source: 'market.guess.refund',
      });
      restLog(o, 'market.guess.refund', { period });
    });
  }

  /**
   * 日常菜场刷新时开奖：本轮的报名按新货架结算；更早还没结算的（错过的轮次）退还报名费。
   * 每个报名单独处理，一个出错只记日志，不影响其他人。
   */
  async function settleGuesses(shardId: number, slot: Slot, opened: number[], now: Date, log?: Log) {
    const guesses = await d.db
      .selectFrom('market_guess')
      .select(['period', 'rest_id'])
      .where('shard_id', '=', shardId)
      .where('period', '<=', slot.key)
      .where('settled_at', 'is', null)
      .execute();
    for (const g of guesses) {
      try {
        if (g.period === slot.key) await settleGuess(shardId, slot, opened, now, g.rest_id);
        else await refundGuess(shardId, g.period, now, g.rest_id);
      } catch (err) {
        log?.error({ err, shardId, period: g.period, restId: g.rest_id }, 'market guess settle failed');
      }
    }
    return guesses.length;
  }

  /** 菜场购买的事务部分；写入特价 IP 间隔后通过 onCooldown 告诉调用方，失败时由调用方撤销 */
  function buyTx(
    ctx: RestCtx,
    b: { itemId: number; num: number },
    onCooldown: (c: { key: string; stamp: string }) => void,
  ) {
    return runOp(d, ctx, { feature: 'market', source: 'market.buy' }, async (o) => {
      const item = await o.tx
        .selectFrom('market_item')
        .selectAll()
        .where('id', '=', b.itemId)
        .where('shard_id', '=', o.shardId)
        .executeTakeFirst();
      if (!item) throw invalidState('item_gone');
      // 手动货：进货人自己买免费、不限购；别人买走 buyManual（这里遇到说明进货人刚换了货）
      const own = item.owner_rest_id === o.rest.id;
      if (item.owner_rest_id !== null && !own) throw invalidState('item_gone');
      const shelf = item.shelf as Shelf;
      const t = o.tuning.market;
      const food = o.config.requireFood(item.foods_id);
      if (shelf === 1) {
        const acc = await o.tx
          .selectFrom('account')
          .select('email_verified_at')
          .where('id', '=', ctx.accountId)
          .executeTakeFirstOrThrow();
        if (!acc.email_verified_at) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
      }
      if (shelf === 2 && !(await hasValidHonor(o, GOODS.loveNecklace)))
        throw requirement('necklace', { goodsId: GOODS.loveNecklace });
      const have = (await foodsMap(o.tx, o.rest.id)).get(food.id)?.num ?? 0;
      if (have === 0 && (await cupboardSlotsUsed(o.tx, o.rest.id)) >= o.rest.cupboard_num)
        throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
      if (have + b.num > o.rest.foods_max_num) throw limitReached('foods_max', { max: o.rest.foods_max_num });
      if (!own) {
        const limit = personLimit(shelf, food, item.opened_at, o.now, t);
        await claimLimit(o, item.id, `rest:${o.rest.id}`, b.num, limit);
        if (ctx.deviceId) await claimLimit(o, item.id, deviceSubject(ctx.deviceId), b.num, limit);
        await claimLimit(o, item.id, `ip:${ctx.ip}`, b.num, limit);
      }
      const sold = await o.tx
        .updateTable('market_item')
        .set({ sold: sql<number>`sold + ${b.num}` })
        .where('id', '=', item.id)
        .where(sql<boolean>`sold + ${b.num} <= stock`)
        .returning('sold')
        .executeTakeFirst();
      if (!sold) throw new AppError(ErrorCode.SOLD_OUT, 400);
      const snap = await world.ensure(o.shardId, o.now, o.tx);
      if (!own) spendCoin(o, Math.ceil(unitPrice(shelf, food, t, snap.weather.effects) * b.num));
      if (shelf === 1) {
        const ok = await d.redis.eval(
          COOLDOWN_LUA,
          1,
          `mkt-ip:${o.shardId}:${ctx.ip}`,
          o.now.getTime(),
          t.specialIpCooldownSec * 1000,
          86_400,
        );
        if (Number(ok) !== 1)
          throw new AppError(ErrorCode.COOLDOWN, 429, {
            what: 'market_special',
            minutes: Math.round(t.specialIpCooldownSec / 60),
            seconds: Math.max(1, Math.ceil(-Number(ok) / 1000)),
          });
        onCooldown({ key: `mkt-ip:${o.shardId}:${ctx.ip}`, stamp: String(o.now.getTime()) });
      }
      await addFoods(o, food.id, b.num);
      await emitAction(o, 'market.buy');
      return { itemId: item.id, foodsId: food.id, num: b.num };
    });
  }

  /**
   * 别人买手动货（设计文档 §2.5）：买家和进货人两家店一起锁；每人每批最多 manualPersonMax 份（只按店计），
   * 付日常价，进货人得 ⌊货款 × manualShare⌋
   */
  async function buyManual(
    ctx: RestCtx,
    b: { itemId: number; num: number },
    ownerId: number,
  ): Promise<OpResult<{ itemId: number; foodsId: number; num: number }>> {
    const settings = await d.shards.ensureFeature(ctx.shardId, 'market');
    return withRestaurants(d.db, [ctx.restaurantId, ownerId], async (tx, rests) => {
      const me = createOp(d, tx, rests.get(ctx.restaurantId)!, settings, { source: 'market.buy', ctx });
      const owner = createOp(d, tx, rests.get(ownerId)!, settings, {
        source: 'market.share',
        now: me.now,
        rng: me.rng,
      });
      const item = await tx
        .selectFrom('market_item')
        .selectAll()
        .where('id', '=', b.itemId)
        .where('shard_id', '=', ctx.shardId)
        .executeTakeFirst();
      if (!item || item.owner_rest_id !== ownerId) throw invalidState('item_gone');
      const t = me.tuning.market;
      const food = me.config.requireFood(item.foods_id);
      const have = (await foodsMap(tx, me.rest.id)).get(food.id)?.num ?? 0;
      if (have === 0 && (await cupboardSlotsUsed(tx, me.rest.id)) >= me.rest.cupboard_num)
        throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
      if (have + b.num > me.rest.foods_max_num)
        throw limitReached('foods_max', { max: me.rest.foods_max_num });
      await claimLimit(me, item.id, `rest:${me.rest.id}`, b.num, t.manualPersonMax);
      const sold = await tx
        .updateTable('market_item')
        .set({ sold: sql<number>`sold + ${b.num}` })
        .where('id', '=', item.id)
        .where(sql<boolean>`sold + ${b.num} <= stock`)
        .returning('sold')
        .executeTakeFirst();
      if (!sold) throw new AppError(ErrorCode.SOLD_OUT, 400);
      const snap = await world.ensure(me.shardId, me.now, tx);
      const paid = Math.ceil(unitPrice(0, food, t, snap.weather.effects) * b.num);
      spendCoin(me, paid);
      const share = Math.floor(paid * t.manualShare);
      gainCoin(owner, share, { event: false });
      await addFoods(me, food.id, b.num);
      await emitAction(me, 'market.buy');
      // 进货人的餐厅动态写明谁买的、分到多少（问题记录 553）
      restLog(owner, 'market.share', {
        itemId: item.id,
        foodsId: food.id,
        num: b.num,
        buyer: me.rest.id,
        by: me.rest.id,
        byName: me.rest.name,
        coin: share,
      });
      await flushOp(me);
      await flushOp(owner);
      return { data: { itemId: item.id, foodsId: food.id, num: b.num }, events: me.events };
    });
  }

  return {
    manualStock(ctx: RestCtx): Promise<OpResult<ManualStockDto>> {
      return runOp(d, ctx, { feature: 'market', source: 'market.manual' }, (o) => manualStock(o));
    },

    async view(ctx: RestCtx): Promise<MarketDto> {
      const now = d.now();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.market;
      const period = nextSlot(now, t.dailyHours).key;
      // 互不依赖的查询一起发（性能第二轮：原来一条接一条，开发服 18 毫秒左右）
      const [snap, rows, rest, mine, slotsUsed, lastSpecial, joined, last] = await Promise.all([
        world.ensure(ctx.shardId, now),
        d.db
          .selectFrom('market_item')
          .selectAll()
          .where('shard_id', '=', ctx.shardId)
          .orderBy('shelf')
          .orderBy('id')
          .execute(),
        d.db
          .selectFrom('restaurant')
          .select(['foods_max_num', 'cupboard_num'])
          .where('id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
        foodsMap(d.db, ctx.restaurantId),
        cupboardSlotsUsed(d.db, ctx.restaurantId),
        // 特价同 IP 间隔（规格书 06：同 IP 两次购买间隔 10 分钟）；页面据此提示还要等多久
        d.redis.get(`mkt-ip:${ctx.shardId}:${ctx.ip}`),
        d.db
          .selectFrom('market_guess')
          .select('foods_ids')
          .where('shard_id', '=', ctx.shardId)
          .where('period', '=', period)
          .where('rest_id', '=', ctx.restaurantId)
          .executeTakeFirst(),
        d.db
          .selectFrom('market_guess')
          .select(['period', 'hits'])
          .where('rest_id', '=', ctx.restaurantId)
          .where('settled_at', 'is not', null)
          .orderBy('settled_at', 'desc')
          .limit(1)
          .executeTakeFirst(),
      ]);
      // 限购按店、设备、网络分别算（claimLimit）；页面要把同一设备 / 网络买过的也算进去
      const own = `rest:${ctx.restaurantId}`;
      const subjects = [own, `ip:${ctx.ip}`, ...(ctx.deviceId ? [deviceSubject(ctx.deviceId)] : [])];
      const ownerIds = [...new Set(rows.map((r) => r.owner_rest_id).filter((x): x is number => x !== null))];
      // 第二段：要用到货架的两条一起发
      const [bought, owners] = await Promise.all([
        rows.length
          ? d.db
              .selectFrom('market_buy')
              .select(['market_item_id', 'subject', 'num'])
              .where('subject', 'in', subjects)
              .where(
                'market_item_id',
                'in',
                rows.map((r) => r.id),
              )
              .execute()
          : [],
        ownerIds.length
          ? d.db.selectFrom('restaurant').select(['id', 'name']).where('id', 'in', ownerIds).execute()
          : [],
      ]);
      const boughtMap = new Map<number, number>();
      const sharedMap = new Map<number, number>();
      for (const b of bought) {
        const m = b.subject === own ? boughtMap : sharedMap;
        m.set(b.market_item_id, Math.max(m.get(b.market_item_id) ?? 0, b.num));
      }
      const cupboardFull = slotsUsed >= rest.cupboard_num;
      const ownerNames = new Map(owners.map((r) => [r.id, r.name] as const));
      const dto = (r: (typeof rows)[number]): MarketItemDto => {
        const food = d.config.requireFood(r.foods_id);
        const shelf = r.shelf as Shelf;
        // 手动货：自己的不限购（以库存为限）；别人的每人 manualPersonMax 份、只按店计
        const own = r.owner_rest_id === ctx.restaurantId;
        const limit =
          r.owner_rest_id === null
            ? personLimit(shelf, food, r.opened_at, now, t)
            : own
              ? r.stock
              : t.manualPersonMax;
        const bought = own ? 0 : (boughtMap.get(r.id) ?? 0);
        const sharedBought = r.owner_rest_id === null ? (sharedMap.get(r.id) ?? 0) : 0;
        const have = mine.get(r.foods_id)?.num ?? 0;
        // 橱柜单种上限（问题记录：显示能买 1000，已有 3 个时实际只能买 996）
        const room = have === 0 && cupboardFull ? 0 : rest.foods_max_num - have;
        return {
          id: r.id,
          shelf,
          foodsId: r.foods_id,
          price: Math.ceil(unitPrice(shelf, food, t, snap.weather.effects)),
          stock: r.stock,
          left: r.stock - r.sold,
          hot: r.hot,
          limit,
          bought,
          sharedBought,
          have,
          canBuy: Math.max(0, Math.min(limit - Math.max(bought, sharedBought), r.stock - r.sold, room)),
          openedAt: r.opened_at.toISOString(),
          owner:
            r.owner_rest_id === null
              ? null
              : { restId: r.owner_rest_id, name: ownerNames.get(r.owner_rest_id) ?? '' },
        };
      };
      const until = lastSpecial ? Number(lastSpecial) + t.specialIpCooldownSec * 1000 : 0;
      return {
        daily: rows.filter((r) => r.shelf === 0).map(dto),
        special: rows.filter((r) => r.shelf === 1).map(dto),
        premium: rows.filter((r) => r.shelf === 2).map(dto),
        nextDaily: nextSlot(now, t.dailyHours).start.toISOString(),
        nextSpecial: nextSlot(now, t.specialHours).start.toISOString(),
        nextPremium: nextSlot(now, t.premiumHours).start.toISOString(),
        specialCooldownUntil: until > now.getTime() ? new Date(until).toISOString() : null,
        specialCooldownMin: Math.round(t.specialIpCooldownSec / 60),
        foodsMaxNum: rest.foods_max_num,
        cupboardFull,
        manual: {
          hasCard: (await validNum(d.db, ctx.restaurantId, GOODS.marketJobHonor, now)) > 0,
          cost: manualCost(await getDaily(d.db, ctx.restaurantId, 'market.manual', gameDay(now)), t),
        },
        guess: {
          period,
          joined: joined?.foods_ids ?? null,
          last: last ?? null,
          cost: t.guessCost,
          maxPick: t.guessMaxPick,
          pool: d.config.bundle.marketGuessFoods,
        },
      };
    },

    /** 货架刷新：删掉同类旧货，按固定种子进货，发新闻；日常菜场顺便开奖竞猜 */
    async refresh(
      shardId: number,
      shelf: Shelf,
      slot: Slot,
      now: Date,
      log?: Log,
    ): Promise<{ foods: number[]; guesses: number; guessError?: true }> {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(gameSeed(shardId, 'market', shelf, slot.key));
      const items = rollShelf(shelf, slot.hour, d.config, tuning.market, rng);
      await d.db.transaction().execute(async (tx) => {
        await tx
          .deleteFrom('market_item')
          .where('shard_id', '=', shardId)
          .where('shelf', '=', shelf)
          .execute();
        if (items.length > 0) {
          await tx
            .insertInto('market_item')
            .values(
              items.map((x) => ({
                shard_id: shardId,
                shelf,
                period: slot.key,
                foods_id: x.foodsId,
                stock: x.stock,
                hot: x.hot,
                opened_at: now,
              })),
            )
            .execute();
        }
        // 高级菜场暂时在页面上隐藏（问题记录 477）：照常进货，但不发新闻，恢复时去掉这个判断（见 docs/backlog.md）
        if (shelf !== 2)
          await postNews(
            tx,
            { shardId, type: 'market.restock', params: { shelf, foods: items.map((x) => x.foodsId) } },
            now,
          );
      });
      const foods = items.map((x) => x.foodsId);
      // 货架已经换好：开奖出错只记日志，这一轮照样算刷新成功（周期任务写完成时间，菜场题不按“没刷新”作废）；
      // 没结算的报名下一轮当作错过的轮次退还（质量期 ②）
      // 出错时带 guessError，写进 job_run.stats，后台看得到（质量期 ② 终审）
      let guesses = 0;
      if (shelf === 0)
        try {
          guesses = await settleGuesses(shardId, slot, foods, now, log);
        } catch (err) {
          log?.error({ err, shardId, period: slot.key }, 'market guess settle failed');
          return { foods, guesses, guessError: true };
        }
      return { foods, guesses };
    },

    async buy(ctx: RestCtx, b: { itemId: number; num: number }) {
      const target = await d.db
        .selectFrom('market_item')
        .select('owner_rest_id')
        .where('id', '=', b.itemId)
        .where('shard_id', '=', ctx.shardId)
        .executeTakeFirst();
      if (target?.owner_rest_id != null && target.owner_rest_id !== ctx.restaurantId)
        return buyManual(ctx, b, target.owner_rest_id);
      let cooldown: { key: string; stamp: string } | null = null;
      try {
        return await buyTx(ctx, b, (c) => (cooldown = c));
      } catch (e) {
        const c = cooldown as { key: string; stamp: string } | null;
        if (c) await d.redis.eval(RELEASE_LUA, 1, c.key, c.stamp);
        throw e;
      }
    },

    joinGuess(ctx: RestCtx, foodsIds: number[]) {
      return runOp(d, ctx, { feature: 'market', source: 'market.guess' }, async (o) => {
        const t = o.tuning.market;
        const ids = [...new Set(foodsIds)];
        if (ids.length === 0 || ids.length > t.guessMaxPick)
          throw invalidState('pick_count', { max: t.guessMaxPick });
        if (ids.some((id) => !o.config.guessFoodIds.has(id))) throw invalidState('bad_food');
        const period = nextSlot(o.now, t.dailyHours).key;
        const r = await o.tx
          .insertInto('market_guess')
          .values({ shard_id: o.shardId, period, rest_id: o.rest.id, foods_ids: ids, created_at: o.now })
          .onConflict((oc) => oc.columns(['shard_id', 'period', 'rest_id']).doNothing())
          .returning('period')
          .executeTakeFirst();
        if (!r) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        await consumeGoods(o, GOODS.mysteryTicket, t.guessCost);
        await emitAction(o, 'market.guess');
        return { period, foodsIds: ids };
      });
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
