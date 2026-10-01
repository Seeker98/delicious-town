import { sql, type Kysely, type Selectable } from 'kysely';
import { GOODS, type Tuning } from '@dt/config';
import { buildPool, gameDay, gameParts, pickWeighted, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opNews, restLog, runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { grantGoodsOp } from '../store/goods';
import { rollWorth } from './rules';
import { notBannedSql } from '../admin/ban';

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
    .where(notBannedSql())
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
  log?: { error(obj: object, msg: string): void },
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
  // 用服务端随机源，不用区服号 + 日期做种子：那样有源码就能提前算出地点（终审 I1）；幂等靠主键
  const rng = d.rng();
  const publicPlace = () =>
    pickPlace(
      t.placeWeights.filter(([p]) => p !== HIPHOP_RESTAURANT),
      rng,
    );
  let place = pickPlace(t.placeWeights, rng);
  let restId: number | null = null;
  if (place === HIPHOP_RESTAURANT) {
    const rests = await activeRests(d.db, shardId, new Date(now.getTime() - t.restActiveDays * 86_400_000));
    if (rests.length > 0) restId = rests[rng.int(rests.length)]!;
    else place = publicPlace();
  }
  const foods = [1, 2, 3, 4, 5]
    .flatMap((lv) => d.config.foodPools.get(lv)?.items ?? [])
    .map((f) => f.id)
    .sort((a, b) => a - b);
  const foodsId = foods[rng.int(foods.length)]!;
  const row = {
    shard_id: shardId,
    day,
    place,
    rest_id: restId,
    foods_id: foodsId,
    worth: rollWorth(rng.next(), t),
    created_at: now,
  };
  const insert = (db: Kysely<DB>) =>
    db
      .insertInto('hiphop_day')
      .values(row)
      .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
      .returning('place')
      .executeTakeFirst();
  // 餐厅地点：写地点和给那家店发"嘻哈文化"放在同一个事务里，任一步失败都不留半截（PR29 遗留）
  let inserted: { place: number } | undefined;
  if (restId !== null) {
    try {
      inserted = await runSystemOp(d, shardId, restId, { source: 'hiphop.event', now }, async (o) => {
        const r = await insert(o.tx);
        if (!r) return r;
        await grantGoodsOp(o, GOODS.hiphopCulture, 1);
        opNews(o, 'hiphop.event', {});
        restLog(o, 'hiphop.event', { day });
        return r;
      });
    } catch (err) {
      // 发放失败（锁超时、连接中断等）不能让全区当天没有嘻哈男孩：改抽公共地点（终审 I3）
      log?.error({ err, shardId, restId, day }, 'hiphop restaurant place failed, fallback to public place');
      restId = null;
      place = publicPlace();
      Object.assign(row, { place, rest_id: null });
    }
  }
  if (restId === null) inserted = await insert(d.db);
  // 并发时别人先写了：以已有记录为准
  if (!inserted) return rollHiphopDay(d, shardId, day, now, log);
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
