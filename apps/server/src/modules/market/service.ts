import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { GOODS } from '@dt/config';
import {
  ErrorCode,
  hashSeed,
  nextSlot,
  seededRng,
  type MarketDto,
  type MarketItemDto,
  type Slot,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, runOp, runSystemOp, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { addFoods, cupboardSlotsUsed, foodsMap } from '../cupboard/foods';
import { postNews } from '../news/news';
import { consumeGoods, hasValidHonor } from '../store/goods';
import type { WorldService } from '../world/service';
import { personLimit, rollShelf, unitPrice, type Shelf } from './rules';

const deviceSubject = (id: string) => `dev:${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;

/**
 * 特价的同 IP 间隔（规格书 06 §6.2）：记下上次购买的游戏时间，按游戏时间比较（模拟器的虚拟时钟也适用），
 * 检查和写入在一个脚本里原子完成。KEYS[1]=键，ARGV=现在(毫秒)、间隔(毫秒)、键的保留秒数
 */
const COOLDOWN_LUA = `
local last = redis.call('GET', KEYS[1])
if last and tonumber(ARGV[1]) - tonumber(last) < tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
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
  async function settleGuesses(shardId: number, slot: Slot, opened: number[], now: Date): Promise<number> {
    const guesses = await d.db
      .selectFrom('market_guess')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('period', '=', slot.key)
      .where('settled_at', 'is', null)
      .execute();
    for (const g of guesses) {
      const hits = g.foods_ids.filter((id) => opened.includes(id)).length;
      await runSystemOp(d, shardId, g.rest_id, { source: 'market.guess', now }, async (o) => {
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
          .where('rest_id', '=', g.rest_id)
          .execute();
        restLog(o, 'market.guess', { period: slot.key, hits });
      });
    }
    return guesses.length;
  }

  return {
    async view(ctx: RestCtx): Promise<MarketDto> {
      const now = d.now();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.market;
      const snap = await world.ensure(ctx.shardId, now);
      const rows = await d.db
        .selectFrom('market_item')
        .selectAll()
        .where('shard_id', '=', ctx.shardId)
        .orderBy('shelf')
        .orderBy('id')
        .execute();
      const bought = rows.length
        ? await d.db
            .selectFrom('market_buy')
            .select(['market_item_id', 'num'])
            .where('subject', '=', `rest:${ctx.restaurantId}`)
            .where(
              'market_item_id',
              'in',
              rows.map((r) => r.id),
            )
            .execute()
        : [];
      const boughtMap = new Map(bought.map((b) => [b.market_item_id, b.num]));
      const dto = (r: (typeof rows)[number]): MarketItemDto => {
        const food = d.config.requireFood(r.foods_id);
        const shelf = r.shelf as Shelf;
        return {
          id: r.id,
          shelf,
          foodsId: r.foods_id,
          price: Math.ceil(unitPrice(shelf, food, t, snap.weather.effects)),
          stock: r.stock,
          left: r.stock - r.sold,
          hot: r.hot,
          limit: personLimit(shelf, food, r.opened_at, now, t),
          bought: boughtMap.get(r.id) ?? 0,
          openedAt: r.opened_at.toISOString(),
        };
      };
      const period = nextSlot(now, t.dailyHours).key;
      const joined = await d.db
        .selectFrom('market_guess')
        .select('foods_ids')
        .where('shard_id', '=', ctx.shardId)
        .where('period', '=', period)
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirst();
      const last = await d.db
        .selectFrom('market_guess')
        .select(['period', 'hits'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('settled_at', 'is not', null)
        .orderBy('settled_at', 'desc')
        .limit(1)
        .executeTakeFirst();
      return {
        daily: rows.filter((r) => r.shelf === 0).map(dto),
        special: rows.filter((r) => r.shelf === 1).map(dto),
        premium: rows.filter((r) => r.shelf === 2).map(dto),
        nextDaily: nextSlot(now, t.dailyHours).start.toISOString(),
        nextSpecial: nextSlot(now, t.specialHours).start.toISOString(),
        nextPremium: nextSlot(now, t.premiumHours).start.toISOString(),
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
    ): Promise<{ foods: number[]; guesses: number }> {
      const { tuning } = await d.shards.settings(shardId);
      const rng = seededRng(hashSeed(shardId, 'market', shelf, slot.key));
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
        await postNews(
          tx,
          { shardId, type: 'market.restock', params: { shelf, foods: items.map((x) => x.foodsId) } },
          now,
        );
      });
      const foods = items.map((x) => x.foodsId);
      const guesses = shelf === 0 ? await settleGuesses(shardId, slot, foods, now) : 0;
      return { foods, guesses };
    },

    buy(ctx: RestCtx, b: { itemId: number; num: number }) {
      return runOp(d, ctx, { feature: 'market', source: 'market.buy' }, async (o) => {
        const item = await o.tx
          .selectFrom('market_item')
          .selectAll()
          .where('id', '=', b.itemId)
          .where('shard_id', '=', o.shardId)
          .executeTakeFirst();
        if (!item) throw invalidState('item_gone');
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
        if (have + b.num > o.rest.foods_max_num)
          throw limitReached('foods_max', { max: o.rest.foods_max_num });
        const limit = personLimit(shelf, food, item.opened_at, o.now, t);
        await claimLimit(o, item.id, `rest:${o.rest.id}`, b.num, limit);
        if (ctx.deviceId) await claimLimit(o, item.id, deviceSubject(ctx.deviceId), b.num, limit);
        await claimLimit(o, item.id, `ip:${ctx.ip}`, b.num, limit);
        const sold = await o.tx
          .updateTable('market_item')
          .set({ sold: sql<number>`sold + ${b.num}` })
          .where('id', '=', item.id)
          .where(sql<boolean>`sold + ${b.num} <= stock`)
          .returning('sold')
          .executeTakeFirst();
        if (!sold) throw new AppError(ErrorCode.SOLD_OUT, 400);
        const snap = await world.ensure(o.shardId, o.now);
        spendCoin(o, Math.ceil(unitPrice(shelf, food, t, snap.weather.effects) * b.num));
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
            throw new AppError(ErrorCode.COOLDOWN, 429, { seconds: t.specialIpCooldownSec });
        }
        await addFoods(o, food.id, b.num);
        await emitAction(o, 'market.buy');
        return { itemId: item.id, foodsId: food.id, num: b.num };
      });
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
