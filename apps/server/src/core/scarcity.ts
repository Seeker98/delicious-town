import type { Tuning } from '@dt/config';
import { buildPool, pickWeighted, type Rng } from '@dt/shared';
import { foodsMap } from '../modules/cupboard/foods';
import { gradeOf } from '../modules/cookbook/rules';
import { levelsOf } from '../modules/takeaway/common';
import { opLuck } from './luck';
import type { Op } from './op';

/**
 * 个人缺料倾向（问题记录 50、68）：玩家自己抽随机食材时，有 p 的概率改成本街学菜正缺的那种。
 * 设计 docs/superpowers/specs/2026-10-05-food-scarcity-design.md §3
 */
export type NeedMap = ReadonlyMap<number, number>;

/** 缺料清单：本街每道菜下一品级的需要合计，减去已有；满级的菜不算。食材 id → 缺口 */
export function needMapOf(
  ids: readonly number[],
  levels: Uint8Array,
  slotOf: Int32Array,
  maxGrade: number,
  needOf: (id: number, grade: number) => ReadonlyArray<{ foodsId: number; num: number }>,
  have: (foodsId: number) => number,
): Map<number, number> {
  const total = new Map<number, number>();
  for (const id of ids) {
    const next = gradeOf(levels, slotOf, id) + 1;
    if (next > maxGrade) continue;
    for (const x of needOf(id, next)) total.set(x.foodsId, (total.get(x.foodsId) ?? 0) + x.num);
  }
  const out = new Map<number, number>();
  for (const [id, n] of total) if (n > have(id)) out.set(id, n - have(id));
  return out;
}

/** 命中概率：min(上限, 基础 + 幸运率 × 系数)，幸运为负按 0 */
export function needChance(t: Tuning['scarcity'], luckRate: number): number {
  return Math.min(t.needMax, t.needBase + Math.max(0, luckRate) * t.needLuckFactor);
}

/**
 * 抽一个食材：按 p 判定，中了就在 accept 范围内的缺料里按缺口加权抽；没中或范围里没有缺料时用 fallback。
 * p 为 0 或没有缺料时不消耗随机数
 */
export function pickWithNeed(
  need: NeedMap,
  accept: (foodsId: number) => boolean,
  p: number,
  rng: Rng,
  fallback: () => number,
): number {
  if (p <= 0 || need.size === 0 || !rng.chance(p)) return fallback();
  const pool = buildPool(
    [...need].filter(([id]) => accept(id)),
    ([, gap]) => gap,
  );
  return pool.total > 0 ? pickWeighted(pool, rng)[0] : fallback();
}

/**
 * 街市补给包（理财设计 §1.1）：在缺料清单的 level 级食材里按缺口加权抽 num 个，抽一个扣一个（缺口扣完的不再抽）；
 * 这一级没有缺料、或者都扣完了时用 fallback。不改传入的清单
 */
export function drawNeedFoods(
  need: NeedMap,
  levelOf: (foodsId: number) => number,
  level: number,
  num: number,
  rng: Rng,
  fallback: () => number,
): Map<number, number> {
  const gaps = new Map([...need].filter(([id]) => levelOf(id) === level));
  const got = new Map<number, number>();
  for (let i = 0; i < num; i++) {
    let id: number;
    if (gaps.size > 0) {
      id = pickWeighted(
        buildPool([...gaps], ([, gap]) => gap),
        rng,
      )[0];
      const left = gaps.get(id)! - 1;
      if (left > 0) gaps.set(id, left);
      else gaps.delete(id);
    } else id = fallback();
    got.set(id, (got.get(id) ?? 0) + 1);
  }
  return got;
}

/** 本店现在的缺料清单：按店现在所在的街道（理财设计 §1.1：开包时的街道）。同一个事务连接上按顺序读 */
export async function opNeedMap(
  o: Op,
  known?: { foods?: ReadonlyMap<number, { num: number }> },
): Promise<Map<number, number>> {
  // 同一个事务连接上不能并发查询（pg 会排队并警告，pg@9 会报错），按顺序读
  const levels = await levelsOf(o.tx, o.rest.id);
  const foods = known?.foods ?? (await foodsMap(o.tx, o.rest.id));
  return needMapOf(
    o.config.cookbookIndex.idsByStreet.get(o.rest.street_id) ?? [],
    levels,
    o.config.cookbookIndex.slotOf,
    o.tuning.rest.cookbookMaxGrade,
    (id, g) => o.config.requireCookbook(id).needFoods[g] ?? [],
    (id) => foods.get(id)?.num ?? 0,
  );
}

export type NeedPick = (accept: (foodsId: number) => boolean, fallback: () => number) => number;

/**
 * 一次操作里的缺料抽取器：缺料清单和概率只算一次（缓存在 op 上；同一次操作里抽到的不回头改清单）。
 * foods：调用方已经读过的橱柜（合成），给了就不再读一遍（质量期 ③）
 */
export async function opNeedPick(
  o: Op,
  known?: { foods?: ReadonlyMap<number, { num: number }> },
): Promise<NeedPick> {
  const hit = o.cache.get('needPick') as NeedPick | undefined;
  if (hit) return hit;
  const p = needChance(o.tuning.scarcity, (await opLuck(o)).rate);
  let need: NeedMap = new Map();
  if (p > 0) need = await opNeedMap(o, known);
  const pick: NeedPick = (accept, fallback) => pickWithNeed(need, accept, p, o.rng, fallback);
  o.cache.set('needPick', pick);
  return pick;
}
