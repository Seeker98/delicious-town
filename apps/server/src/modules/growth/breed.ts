import { artBreedOf, type ArtBreed, type GameConfig } from '@dt/config';
import { buildPool, pickWeighted, type Rng } from '@dt/shared';
import { needMapOf } from '../../core/scarcity';
import { restLog, type Op } from '../../core/op';
import { addFoods, foodsMap } from '../cupboard/foods';
import { gradeOf } from '../cookbook/rules';
import { levelsOf } from '../takeaway/common';

const HOUR = 3_600_000;

/**
 * 艺术品孕育食材（乾坤通景巨屏，设计 2026-10-25-art-scroll）：摆放后每 everyHours 小时到点一份，共 times 份；
 * 到期以后不再长，被延时加成拉长也不超过 times
 */
export function breedDue(o: { placedAt: Date; expiresAt: Date | null; now: Date; breed: ArtBreed }): number {
  const end = o.expiresAt && o.expiresAt < o.now ? o.expiresAt : o.now;
  const n = Math.floor((end.getTime() - o.placedAt.getTime()) / (o.breed.everyHours * HOUR));
  return Math.min(Math.max(n, 0), o.breed.times);
}

/** 本店现在所在街道上还没学（品级 0）的菜，学会（1 品）还缺的食材：食材 id → 缺口 */
export async function breedNeed(o: Op): Promise<Map<number, number>> {
  // 同一个事务连接上按顺序读
  const levels = await levelsOf(o.tx, o.rest.id);
  const foods = await foodsMap(o.tx, o.rest.id);
  const { slotOf } = o.config.cookbookIndex;
  const ids = (o.config.cookbookIndex.idsByStreet.get(o.rest.street_id) ?? []).filter(
    (id) => gradeOf(levels, slotOf, id) === 0,
  );
  return needMapOf(
    ids,
    levels,
    slotOf,
    o.tuning.rest.cookbookMaxGrade,
    (id, g) => o.config.requireCookbook(id).needFoods[g] ?? [],
    (id) => foods.get(id)?.num ?? 0,
  );
}

/**
 * 挑 num 个食材：缺料里只留等级 ≤ maxLevel、odds ≤ maxOdds 的，按缺口加权抽、抽一个扣一个；
 * 没有（或扣完了）就从 maxLevel 级、odds ≤ maxOdds 的食材里按权重抽
 */
export function pickBreedFoods(
  need: ReadonlyMap<number, number>,
  num: number,
  rng: Rng,
  foods: GameConfig['foods'],
  breed: ArtBreed,
): number[] {
  const ok = (id: number) => {
    const f = foods.get(id);
    return !!f && !f.retired && f.level <= breed.maxLevel && f.odds <= breed.maxOdds;
  };
  const gaps = new Map([...need].filter(([id, gap]) => gap > 0 && ok(id)));
  const fallback = buildPool(
    [...foods.values()].filter((f) => !f.retired && f.level === breed.maxLevel && f.odds <= breed.maxOdds),
    (f) => f.weight,
  );
  const out: number[] = [];
  for (let i = 0; i < num; i++) {
    if (gaps.size > 0) {
      const id = pickWeighted(
        buildPool([...gaps], ([, gap]) => gap),
        rng,
      )[0];
      const left = gaps.get(id)! - 1;
      if (left > 0) gaps.set(id, left);
      else gaps.delete(id);
      out.push(id);
    } else if (fallback.total > 0) out.push(pickWeighted(fallback, rng).id);
  }
  return out;
}

/** 一个设施位（restaurant_device 的一行） */
export interface BreedRow {
  slot: number;
  goods_id: number;
  placed_at: Date;
  expires_at: Date | null;
  breed_done: number;
}

/**
 * 补发这个位置上到点、还没发的份数：进橱柜（放不下进冰箱），每份一条店铺动态，记下已发份数。
 * 不孕育的道具返回 0；返回补发了几份
 */
export async function grantBreed(op: Op, row: BreedRow): Promise<number> {
  const breed = artBreedOf(op.config.goods.get(row.goods_id)?.effects ?? {});
  if (!breed) return 0;
  const due = breedDue({ placedAt: row.placed_at, expiresAt: row.expires_at, now: op.now, breed });
  if (due <= row.breed_done) return 0;
  const ids = pickBreedFoods(await breedNeed(op), due - row.breed_done, op.rng, op.config.foods, breed);
  for (const [i, foodsId] of ids.entries()) {
    await addFoods(op, foodsId, 1, { source: 'art.breed' });
    restLog(op, 'device.breed', {
      slot: row.slot,
      goodsId: row.goods_id,
      foodsId,
      n: row.breed_done + i + 1,
      of: breed.times,
    });
  }
  await op.tx
    .updateTable('restaurant_device')
    .set({ breed_done: due })
    .where('rest_id', '=', op.rest.id)
    .where('slot', '=', row.slot)
    .where('placed_at', '=', row.placed_at)
    .execute();
  return due - row.breed_done;
}
