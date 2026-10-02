import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { rankRows } from './rules';

/** 本区服的店在这个活动里的个人贡献 */
const pointsOf = (db: Kysely<DB>, activityId: number, shardId: number) =>
  db
    .selectFrom('activity_counter as c')
    .innerJoin('restaurant as r', 'r.id', 'c.rest_id')
    .where('c.activity_id', '=', activityId)
    .where('c.key', '=', 'points')
    .where('r.shard_id', '=', shardId);

/** 本区服全服总分（148-3 设计 §5.1）：读取时求和，不另设一行累加 */
export async function poolOf(db: Kysely<DB>, activityId: number, shardId: number): Promise<number> {
  const r = await pointsOf(db, activityId, shardId)
    .select(sql<string>`coalesce(sum(c.count), 0)`.as('n'))
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export interface RankedRow {
  rank: number;
  restId: number;
  name: string;
  points: number;
}

/** 本区服贡献榜：积分从高到低、同分按店 id；limit 不填时取全部 */
export async function rankedOf(
  db: Kysely<DB>,
  activityId: number,
  shardId: number,
  limit?: number,
): Promise<RankedRow[]> {
  let q = pointsOf(db, activityId, shardId)
    .select(['c.rest_id', 'r.name', 'c.count'])
    .where('c.count', '>', '0')
    .orderBy('c.count', 'desc')
    .orderBy('c.rest_id');
  if (limit !== undefined) q = q.limit(limit);
  const rows = await q.execute();
  return rankRows(rows.map((x) => ({ restId: x.rest_id, name: x.name, points: Number(x.count) })));
}

/** 我的名次 = 积分比我高的店数 + 1；积分 0 没有名次 */
export async function myRankOf(
  db: Kysely<DB>,
  activityId: number,
  shardId: number,
  mine: number,
): Promise<number | null> {
  if (mine <= 0) return null;
  const r = await pointsOf(db, activityId, shardId)
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('c.count', '>', String(mine))
    .executeTakeFirstOrThrow();
  return Number(r.n) + 1;
}
