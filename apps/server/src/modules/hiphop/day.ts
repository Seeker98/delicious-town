import { sql, type Kysely, type Selectable } from 'kysely';
import { GOODS, type Tuning } from '@dt/config';
import { buildPool, gameDay, gameParts, hashSeed, pickWeighted, seededRng, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opNews, runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { grantGoodsOp } from '../store/goods';
import { rollWorth } from './rules';

export type HiphopDayRow = Selectable<DB['hiphop_day']>;

/** 地点 9：某家餐厅 */
export const HIPHOP_RESTAURANT = 9;

/** 今天的记录（不管时段）；没有返回 null */
export async function hiphopDay(db: Kysely<DB>, shardId: number, now: Date): Promise<HiphopDayRow | null> {
  const r = await db
    .selectFrom('hiphop_day')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('day', '=', gameDay(now))
    .executeTakeFirst();
  return r ?? null;
}

/** 现在是否在出没时段：hour ≤ 当前游戏小时 < closeHour */
export function hiphopOut(now: Date, t: Tuning['hiphop']): boolean {
  const { hour } = gameParts(now);
  return hour >= t.hour && hour < t.closeHour;
}

function pickPlace(weights: ReadonlyArray<readonly [number, number]>, rng: Rng): number {
  return pickWeighted(
    buildPool(weights, (w) => w[1]),
    rng,
  )[0];
}

/** 近期有结算收益的玩家店（不含 NPC、封禁账号），按店号排序 */
async function activeRests(db: Kysely<DB>, shardId: number, since: Date): Promise<number[]> {
  const rows = await db
    .selectFrom('income_round as i')
    .innerJoin('restaurant as r', 'r.id', 'i.rest_id')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select('i.rest_id')
    .distinct()
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('a.banned_at', 'is', null)
    .where('i.created_at', '>=', since)
    .orderBy('i.rest_id')
    .execute();
  return rows.map((r) => r.rest_id);
}

/**
 * 生成今天的记录（设计文档 §2.1）：已有就不动。地点按权重抽；抽到餐厅时从近 restActiveDays 天活跃的玩家店里
 * 均匀挑一家，给它"嘻哈文化"并写新闻；没有可挑的店就去掉餐厅重抽。想要的食材在 1~5 级里均匀挑
 */
export async function rollHiphopDay(
  d: GameDeps,
  shardId: number,
  day: string,
  now: Date,
): Promise<{ created: boolean; place: number; restId: number | null }> {
  const exist = await d.db
    .selectFrom('hiphop_day')
    .select(['place', 'rest_id'])
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .executeTakeFirst();
  if (exist) return { created: false, place: exist.place, restId: exist.rest_id };
  const { tuning } = await d.shards.settings(shardId);
  const t = tuning.hiphop;
  const rng = seededRng(hashSeed(shardId, 'hiphop', day));
  let place = pickPlace(t.placeWeights, rng);
  let restId: number | null = null;
  if (place === HIPHOP_RESTAURANT) {
    const rests = await activeRests(d.db, shardId, new Date(now.getTime() - t.restActiveDays * 86_400_000));
    if (rests.length > 0) restId = rests[rng.int(rests.length)]!;
    else
      place = pickPlace(
        t.placeWeights.filter(([p]) => p !== HIPHOP_RESTAURANT),
        rng,
      );
  }
  const foods = [1, 2, 3, 4, 5]
    .flatMap((lv) => d.config.foodPools.get(lv)?.items ?? [])
    .map((f) => f.id)
    .sort((a, b) => a - b);
  const foodsId = foods[rng.int(foods.length)]!;
  const inserted = await d.db
    .insertInto('hiphop_day')
    .values({
      shard_id: shardId,
      day,
      place,
      rest_id: restId,
      foods_id: foodsId,
      worth: rollWorth(rng.next(), t),
      created_at: now,
    })
    .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
    .returning('place')
    .executeTakeFirst();
  // 并发时别人先写了：以已有记录为准
  if (!inserted) return rollHiphopDay(d, shardId, day, now);
  if (restId !== null) {
    await runSystemOp(d, shardId, restId, { source: 'hiphop.event', now }, async (o) => {
      await grantGoodsOp(o, GOODS.hiphopCulture, 1);
      opNews(o, 'hiphop.event', {});
    });
  }
  return { created: true, place, restId };
}

/** 测试接口用：覆盖今天的地点（没有就新建）；不传的食材、门槛保留原值 */
export async function forceHiphopDay(
  db: Kysely<DB>,
  shardId: number,
  now: Date,
  v: { place: number; restId?: number | null; foodsId?: number; worth?: number },
): Promise<void> {
  const row = {
    shard_id: shardId,
    day: gameDay(now),
    place: v.place,
    rest_id: v.restId ?? null,
    foods_id: v.foodsId ?? 1,
    worth: v.worth ?? 50_000,
    created_at: now,
  };
  await db
    .insertInto('hiphop_day')
    .values(row)
    .onConflict((oc) =>
      oc.columns(['shard_id', 'day']).doUpdateSet({
        place: row.place,
        rest_id: row.rest_id,
        foods_id: sql<number>`coalesce(${v.foodsId ?? null}::integer, hiphop_day.foods_id)`,
        worth: sql<number>`coalesce(${v.worth ?? null}::integer, hiphop_day.worth)`,
      }),
    )
    .execute();
}
