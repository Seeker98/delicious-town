import { sql } from 'kysely';
import {
  ErrorCode,
  gameDay,
  pickWeighted,
  type CupboardDto,
  type FridgeDto,
  type HandleResultDto,
  type ThawResultDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, spendCoin, spendStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { foodsNeedFor, streetTargetGrade } from '../cookbook/rules';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import type { WorldService } from '../world/service';
import { addFoods, cupboardSlotsUsed, foodsMap, subFoods } from './foods';
import { handleTargetLevel, runHandle, type HandleWay } from './rules';

const HANDLE_KEY = 'foods.handle';

export function createCupboardService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'cupboard', source }, fn);
  const needOf = (id: number, grade: number) => d.config.requireCookbook(id).needFoods[grade] ?? [];
  const freeHandles = (star: number, t: { freeHandleBase: number; freeHandlePerStar: number }) =>
    t.freeHandleBase + t.freeHandlePerStar * star;

  return {
    async list(ctx: RestCtx): Promise<CupboardDto> {
      const rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const rows = await foodsMap(d.db, rest.id);
      const cb = await d.db
        .selectFrom('restaurant_cookbooks')
        .select('levels')
        .where('rest_id', '=', rest.id)
        .executeTakeFirstOrThrow();
      const levels = new Uint8Array(cb.levels);
      const streetIds = d.config.cookbookIndex.idsByStreet.get(rest.street_id) ?? [];
      const targetGrade = streetTargetGrade(levels, streetIds, tuning.rest.cookbookMaxGrade);
      const needMap = foodsNeedFor(streetIds, levels, targetGrade, needOf);
      const used = await getDaily(d.db, rest.id, HANDLE_KEY, gameDay(d.now()));
      const all = [...rows];
      return {
        slotsUsed: all.filter(([, r]) => r.num > 0).length,
        slots: rest.cupboard_num,
        lockUsed: all.filter(([, r]) => r.locked).length,
        lockSlots: rest.foods_lock_num,
        foodsMaxNum: rest.foods_max_num,
        targetGrade,
        fridgeCount: all.filter(([, r]) => r.fridge > 0).length,
        fridgeUnread:
          (await d.db
            .selectFrom('cupboard_food')
            .select('foods_id')
            .where('rest_id', '=', rest.id)
            .where('fridge_unread', '=', true)
            .where('fridge_num', '>', 0)
            .executeTakeFirst()) !== undefined,
        freeHandleLeft: Math.max(0, freeHandles(rest.star_level, tuning.cupboard) - used),
        items: all
          .filter(([, r]) => r.num > 0)
          .map(([foodsId, r]) => ({
            foodsId,
            num: r.num,
            locked: r.locked,
            streetNeed: needMap.get(foodsId) ?? 0,
          }))
          .sort(
            (a, b) =>
              (d.config.foods.get(a.foodsId)?.level ?? 0) - (d.config.foods.get(b.foodsId)?.level ?? 0) ||
              a.foodsId - b.foodsId,
          ),
      };
    },

    async fridge(ctx: RestCtx): Promise<FridgeDto> {
      const rows = await d.db
        .selectFrom('cupboard_food')
        .select(['foods_id', 'fridge_num'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('fridge_num', '>', 0)
        .orderBy('foods_id')
        .execute();
      return { items: rows.map((r) => ({ foodsId: r.foods_id, num: r.fridge_num })) };
    },

    readFridge(ctx: RestCtx) {
      return op(ctx, 'fridge.read', async (o) => {
        await o.tx
          .updateTable('cupboard_food')
          .set({ fridge_unread: false })
          .where('rest_id', '=', o.rest.id)
          .execute();
        return { ok: true };
      });
    },

    lock(ctx: RestCtx, foodsId: number) {
      return op(ctx, 'foods.lock', async (o) => {
        const m = await foodsMap(o.tx, o.rest.id);
        const row = m.get(foodsId);
        if (!row || row.num <= 0) throw invalidState('no_food', { foodsId });
        if (row.locked) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        const locked = [...m.values()].filter((r) => r.locked).length;
        if (locked >= o.rest.foods_lock_num) throw limitReached('lock', { max: o.rest.foods_lock_num });
        await o.tx
          .updateTable('cupboard_food')
          .set({ locked: true })
          .where('rest_id', '=', o.rest.id)
          .where('foods_id', '=', foodsId)
          .execute();
        return { foodsId, locked: true };
      });
    },

    unlock(ctx: RestCtx, foodsId: number) {
      return op(ctx, 'foods.unlock', async (o) => {
        const row = (await foodsMap(o.tx, o.rest.id)).get(foodsId);
        if (!row || !row.locked) throw invalidState('not_locked', { foodsId });
        // 食材已经用完的锁：直接删掉这一行，释放锁定格（规格书 05 §5.3）
        if (row.num === 0 && row.fridge === 0) {
          await o.tx
            .deleteFrom('cupboard_food')
            .where('rest_id', '=', o.rest.id)
            .where('foods_id', '=', foodsId)
            .execute();
        } else {
          await o.tx
            .updateTable('cupboard_food')
            .set({ locked: false })
            .where('rest_id', '=', o.rest.id)
            .where('foods_id', '=', foodsId)
            .execute();
        }
        return { foodsId, locked: false };
      });
    },

    thaw(ctx: RestCtx, foodsId: number) {
      return op(ctx, 'fridge.thaw', async (o): Promise<ThawResultDto> => {
        const row = (await foodsMap(o.tx, o.rest.id)).get(foodsId);
        if (!row || row.fridge <= 0) throw invalidState('fridge_empty', { foodsId });
        if (row.num === 0 && (await cupboardSlotsUsed(o.tx, o.rest.id)) >= o.rest.cupboard_num)
          throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
        const moved = Math.min(row.fridge, o.rest.foods_max_num - row.num);
        if (moved <= 0) throw limitReached('foods_max', { max: o.rest.foods_max_num });
        const coin = Math.ceil(moved * o.config.requireFood(foodsId).coin * o.tuning.cupboard.thawCoinRate);
        spendCoin(o, coin);
        await o.tx
          .updateTable('cupboard_food')
          .set({ num: sql<number>`num + ${moved}`, fridge_num: sql<number>`fridge_num - ${moved}` })
          .where('rest_id', '=', o.rest.id)
          .where('foods_id', '=', foodsId)
          .execute();
        return { foodsId, moved, coin };
      });
    },

    handle(ctx: RestCtx, b: { foodsId: number; way: HandleWay; num: number }) {
      return op(ctx, 'foods.handle', async (o): Promise<HandleResultDto> => {
        const food = o.config.requireFood(b.foodsId);
        const target = handleTargetLevel(b.way, food.level);
        if (target === null) throw invalidState('cannot_handle', { foodsId: b.foodsId });
        if (b.way === 'compose' && b.num % 2 !== 0) throw invalidState('odd_num');
        if (o.rest.coin <= 0) throw notEnough('coin', 1, o.rest.coin);
        await subFoods(o, b.foodsId, b.num);
        const used = await incrementDaily(o.tx, o.rest.id, HANDLE_KEY, 1, gameDay(o.now));
        const strengthUsed = used > freeHandles(o.rest.star_level, o.tuning.cupboard) ? 1 : 0;
        spendStrength(o, strengthUsed);
        const snap = await world.ensure(o.shardId, o.now, o.tx);
        const agg = await opAgg(o);
        const { rate } = await opLuck(o);
        const outcome = runHandle(
          {
            way: b.way,
            num: b.num,
            star: o.rest.star_level,
            foodCoin: food.coin,
            weatherRate: snap.weather.effects.foodsOperRate ?? 0,
            luckRate: rate,
            extraRate: (b.way === 'decompose' ? agg.operFoodsAddRate : agg.composeFoodsRate) ?? 0,
            tuning: o.tuning,
          },
          o.config.foodPools.get(target)!,
          o.rng,
        );
        const gained = new Map<number, number>();
        for (const id of outcome.picks) gained.set(id, (gained.get(id) ?? 0) + 1);
        for (const [id, n] of gained) await addFoods(o, id, n);
        gainCoin(o, outcome.failCoin);
        await emitAction(o, 'foods.handle');
        return {
          chances: outcome.chances,
          success: outcome.success,
          lucky: outcome.lucky,
          failCoin: outcome.failCoin,
          strengthUsed,
          gained: [...gained].map(([foodsId, num]) => ({ foodsId, num })),
        };
      });
    },

    exchange(ctx: RestCtx, b: { foodsId: 467 | 468; times: number }) {
      return op(ctx, 'foods.exchange.master', async (o) => {
        await subFoods(o, b.foodsId, 2 * b.times);
        const pool = o.config.rareFoodPools.get(b.foodsId === 467 ? 2 : 3)!;
        const got = new Map<number, number>();
        for (let i = 0; i < b.times; i++) {
          const f = pickWeighted(pool, o.rng);
          got.set(f.id, (got.get(f.id) ?? 0) + 1);
        }
        for (const [id, n] of got) await addFoods(o, id, n);
        return { gained: [...got].map(([foodsId, num]) => ({ foodsId, num })) };
      });
    },
  };
}

export type CupboardService = ReturnType<typeof createCupboardService>;
