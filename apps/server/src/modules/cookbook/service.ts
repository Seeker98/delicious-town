import type { Kysely } from 'kysely';
import {
  ErrorCode,
  type CookbookDetailDto,
  type CookbookListDto,
  type CookbookListQuery,
  type CookbookRowDto,
  type FoodsNeedDto,
  type FoodsNeedQuery,
  type LearnResultDto,
  type LearnType,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough } from '../../core/errors';
import { runOp, setRest } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { foodsMap, subFoods } from '../cupboard/foods';
import { normalizeCounts } from '../settlement/globals';
import { applyLearn, foodsNeedFor, learnTypeOf, mergeNeed, padLevels, planLearn } from './rules';

const PAGE_SIZE = 40;
/** 排序：可学 → 需要万能食材 → 不能学 → 已满级（规格书 03 §3.7 的 t → l → m → n） */
const ORDER: Record<LearnType, number> = {
  '0': 0,
  '1': 1,
  '2': 1,
  '3': 1,
  '4': 1,
  '5': 1,
  z: 2,
  street: 3,
  max: 4,
};

export function createCookbookService(d: GameDeps) {
  const levelOfFood = (id: number) => d.config.foods.get(id)?.level ?? 0;
  const needOf = (id: number, grade: number) => d.config.requireCookbook(id).needFoods[grade] ?? [];

  async function levelsOf(db: Kysely<DB>, restId: number): Promise<Uint8Array> {
    const r = await db
      .selectFrom('restaurant_cookbooks')
      .select('levels')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    return padLevels(new Uint8Array(r.levels), d.config.maxCookbookId);
  }
  async function haveOf(db: Kysely<DB>, restId: number): Promise<(id: number) => number> {
    const m = await foodsMap(db, restId);
    return (id) => m.get(id)?.num ?? 0;
  }
  const maxGrade = async (shardId: number) => (await d.shards.settings(shardId)).tuning.rest.cookbookMaxGrade;

  /** street：店所在的街道；别的街的菜只能看，不能学也不能升级（问题记录 312） */
  function rowOf(
    id: number,
    levels: Uint8Array,
    have: (id: number) => number,
    max: number,
    street: number,
  ): CookbookRowDto {
    const c = d.config.requireCookbook(id);
    const grade = levels[id] ?? 0;
    if (grade >= max) return { id, name: c.name, grade, next: null, learn: 'max' };
    const need = mergeNeed(needOf(id, grade + 1));
    return {
      id,
      name: c.name,
      grade,
      next: need.map((n) => ({ foodsId: n.foodsId, num: n.num, have: have(n.foodsId) })),
      learn: c.streetId !== street ? 'street' : learnTypeOf(planLearn(need, have, levelOfFood)),
    };
  }

  return {
    async list(ctx: RestCtx, q: CookbookListQuery): Promise<CookbookListDto> {
      const [levels, have, max, rest] = await Promise.all([
        levelsOf(d.db, ctx.restaurantId),
        haveOf(d.db, ctx.restaurantId),
        maxGrade(ctx.shardId),
        d.db
          .selectFrom('restaurant')
          .select(['cookbook_counts', 'street_id'])
          .where('id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
      ]);
      const ids = d.config.cookbookIndex.idsByStreet.get(q.street) ?? [];
      const rows = ids
        .map((id) => rowOf(id, levels, have, max, rest.street_id))
        .filter((r) => {
          const can = r.learn !== 'z' && r.learn !== 'max' && r.learn !== 'street';
          // 可学：没学过的；可升级：已学的（问题记录）
          if (q.filter === 'learnable') return can && r.grade === 0;
          if (q.filter === 'upgradable') return can && r.grade > 0;
          if (q.filter === 'unlearned') return r.grade === 0;
          if (q.filter === 'learned') return r.grade > 0;
          return true;
        })
        .sort(
          (a, b) =>
            ORDER[a.learn] - ORDER[b.learn] ||
            a.grade - b.grade ||
            (a.next?.length ?? 0) - (b.next?.length ?? 0) ||
            a.id - b.id,
        );
      const counts = normalizeCounts(rest.cookbook_counts);
      return {
        street: q.street,
        page: q.page,
        pageSize: PAGE_SIZE,
        total: rows.length,
        items: rows.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE),
        learned: counts.learned,
        streetLearned: counts.street[String(q.street)] ?? 0,
        streetTotal: ids.length,
        allTotal: d.config.cookbooks.size,
        gradeCounts: counts.grade,
      };
    },

    async detail(ctx: RestCtx, id: number): Promise<CookbookDetailDto> {
      const c = d.config.cookbooks.get(id);
      if (!c) throw invalidState('no_cookbook', { id });
      const [levels, have, max, rest] = await Promise.all([
        levelsOf(d.db, ctx.restaurantId),
        haveOf(d.db, ctx.restaurantId),
        maxGrade(ctx.shardId),
        d.db
          .selectFrom('restaurant')
          .select('street_id')
          .where('id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
      ]);
      const row = rowOf(id, levels, have, max, rest.street_id);
      return {
        id,
        name: c.name,
        streetId: c.streetId,
        streetName: d.config.streets.get(c.streetId)?.name ?? '',
        taste: c.taste,
        coin: c.coin,
        level: c.level,
        desc: c.desc,
        grade: row.grade,
        learn: row.learn,
        grades: Array.from({ length: max }, (_, i) => i + 1).map((g) => ({
          grade: g,
          name: d.config.grade(g).name,
          foods: mergeNeed(needOf(id, g)).map((n) => ({
            foodsId: n.foodsId,
            num: n.num,
            have: have(n.foodsId),
          })),
        })),
      };
    },

    async foodsNeed(ctx: RestCtx, q: FoodsNeedQuery): Promise<FoodsNeedDto> {
      const [levels, have, max] = await Promise.all([
        levelsOf(d.db, ctx.restaurantId),
        haveOf(d.db, ctx.restaurantId),
        maxGrade(ctx.shardId),
      ]);
      const target = Math.min(q.target, max);
      const ids =
        q.street === undefined
          ? d.config.cookbookIndex.allIds
          : (d.config.cookbookIndex.idsByStreet.get(q.street) ?? []);
      const items = [...foodsNeedFor(ids, levels, target, needOf)]
        .filter(([id]) => q.foodLevel === undefined || levelOfFood(id) === q.foodLevel)
        .map(([foodsId, need]) => ({
          foodsId,
          need,
          have: have(foodsId),
          lack: Math.max(0, need - have(foodsId)),
        }))
        .sort((a, b) => b.lack - a.lack || a.foodsId - b.foodsId);
      return { target, items };
    },

    learn(ctx: RestCtx, cookbookId: number) {
      return runOp(
        d,
        ctx,
        { feature: 'cookbook', source: 'cookbook.learn' },
        async (op): Promise<LearnResultDto> => {
          const c = op.config.cookbooks.get(cookbookId);
          if (!c) throw invalidState('no_cookbook', { id: cookbookId });
          // 只能学、升级所在街道的菜（问题记录 312）；要学别的街的菜先搬过去
          if (c.streetId !== op.rest.street_id)
            throw invalidState('other_street', { id: cookbookId, streetId: c.streetId });
          const levels = await levelsOf(op.tx, op.rest.id);
          const from = levels[cookbookId] ?? 0;
          const to = from + 1;
          if (to > op.tuning.rest.cookbookMaxGrade) throw new AppError(ErrorCode.COOKBOOK_MAX_GRADE, 400);
          const fm = await foodsMap(op.tx, op.rest.id);
          const plan = planLearn(c.needFoods[to] ?? [], (id) => fm.get(id)?.num ?? 0, levelOfFood);
          if (plan.kind === 'none') {
            const m = plan.missing[0]!;
            throw notEnough('foods', m.num, m.have, m.foodsId);
          }
          for (const x of plan.consume) await subFoods(op, x.foodsId, x.num);
          levels[cookbookId] = to;
          await op.tx
            .updateTable('restaurant_cookbooks')
            .set({ levels: Buffer.from(levels) })
            .where('rest_id', '=', op.rest.id)
            .execute();
          setRest(
            op,
            'cookbook_counts',
            applyLearn(normalizeCounts(op.rest.cookbook_counts), c.streetId, from, to),
          );
          await emitAction(op, 'cookbook.learn');
          return { cookbookId, grade: to, learnType: learnTypeOf(plan) };
        },
      );
    },
  };
}

export type CookbookService = ReturnType<typeof createCookbookService>;
