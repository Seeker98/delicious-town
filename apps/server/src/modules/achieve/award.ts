import { sql, type Kysely } from 'kysely';
import type { GameConfig, Tuning } from '@dt/config';
import type { GameEvent } from '@dt/shared';
import type { DB } from '../../db/schema';
import { grantIcon } from '../icons/grant';
import { postNews } from '../news/news';

/**
 * 补发的版本：每次成就配置加了能按历史数据补的成就（PR② 的新计数、隐藏成就），加一，
 * 补发任务按新版本把整个区服再算一遍（记成补发）
 */
export const ACH_BACKFILL_VERSION = 2;

/**
 * 区服按当前版本补发完了没有：补发完以前打开成就页补算的也记成补发（不写动态、不算本周新增），也不算首达
 */
export async function shardBackfilled(db: Kysely<DB>, shardId: number): Promise<boolean> {
  return !!(await db
    .selectFrom('ach_shard')
    .select('shard_id')
    .where('shard_id', '=', shardId)
    .where('version', '>=', ACH_BACKFILL_VERSION)
    .executeTakeFirst());
}

export interface AwardInput {
  shardId: number;
  restId: number;
  /** 成就编号 */
  ids: string[];
  now: Date;
  /** 上线补发：不写动态、不算首达、不弹提示 */
  backfilled: boolean;
  /** 操作的得失提示（玩家自己的操作才有）；达成的成就追加进去，网页弹达成提示 */
  events?: GameEvent[];
}

/**
 * 记下达成的成就（已经有的跳过）：加成就点、发称号；不是补发的写动态、看是不是全服首达，
 * 首达的高档成就发小镇新闻。和发起的操作在同一个事务里
 */
export async function awardAchievements(
  tx: Kysely<DB>,
  config: GameConfig,
  t: Tuning['achieve'],
  a: AwardInput,
): Promise<string[]> {
  const tiers = a.ids.map((id) => config.achievements.byId.get(id)).filter((x) => x !== undefined);
  if (tiers.length === 0) return [];
  const added = await tx
    .insertInto('rest_achievement')
    .values(
      tiers.map(({ tier }) => ({
        rest_id: a.restId,
        ach_id: tier.id,
        pts: tier.pts,
        achieved_at: a.now,
        backfilled: a.backfilled,
      })),
    )
    .onConflict((oc) => oc.columns(['rest_id', 'ach_id']).doNothing())
    .returning('ach_id')
    .execute();
  if (added.length === 0) return [];
  const got = added.map((r) => config.achievements.byId.get(r.ach_id)!);
  const pts = got.reduce((s, x) => s + x.tier.pts, 0);
  await tx
    .insertInto('rest_ach')
    .values({ rest_id: a.restId, points: pts, points_at: a.now })
    .onConflict((oc) =>
      oc.column('rest_id').doUpdateSet({ points: sql`rest_ach.points + ${pts}`, points_at: a.now }),
    )
    .execute();
  for (const { tier } of got)
    if (tier.icon) await grantIcon(tx, { restId: a.restId, key: tier.icon, expiresAt: null, now: a.now });
  if (a.backfilled) return got.map((x) => x.tier.id);

  // 首达：补发完的区服里，别的店都还没有这个成就（补发的也算“有”）
  const done = await shardBackfilled(tx, a.shardId);
  const firsts = new Set<string>();
  if (done) {
    const big = got.filter((x) => x.tier.pts >= t.firstMinPts).map((x) => x.tier.id);
    if (big.length > 0) {
      // 两家店同时达成同一档时只算一家首达：按区服 + 成就拿事务级锁，排在后面的等前一家提交后再看
      for (const id of [...big].sort())
        await sql`select pg_advisory_xact_lock(hashtext(${`ach.first:${a.shardId}:${id}`}))`.execute(tx);
      const taken = await tx
        .selectFrom('rest_achievement as ra')
        .innerJoin('restaurant as r', 'r.id', 'ra.rest_id')
        .select('ra.ach_id')
        .distinct()
        .where('ra.ach_id', 'in', big)
        .where('r.shard_id', '=', a.shardId)
        .where('ra.rest_id', '!=', a.restId)
        .execute();
      const takenIds = new Set(taken.map((r) => r.ach_id));
      for (const id of big) if (!takenIds.has(id)) firsts.add(id);
      if (firsts.size > 0)
        await tx
          .updateTable('rest_achievement')
          .set({ first_in_shard: true })
          .where('rest_id', '=', a.restId)
          .where('ach_id', 'in', [...firsts])
          .execute();
    }
  }
  await tx
    .insertInto('rest_log')
    .values(
      got.map(({ tier }) => ({
        rest_id: a.restId,
        type: 'achieve.got',
        params: JSON.stringify({
          id: tier.id,
          pts: tier.pts,
          trophy: tier.trophy,
          first: firsts.has(tier.id),
        }),
        created_at: a.now,
      })),
    )
    .execute();
  for (const { tier } of got)
    // 隐藏成就不发首达新闻（名字会被别的玩家提前看到）
    if (
      firsts.has(tier.id) &&
      tier.pts >= t.newsMinPts &&
      !config.achievements.byId.get(tier.id)?.line.hidden
    )
      await postNews(
        tx,
        { shardId: a.shardId, type: 'achieve.first', restId: a.restId, params: { id: tier.id } },
        a.now,
      );
  for (const { tier } of got)
    a.events?.push({ type: 'gain', kind: 'achievement', key: tier.id, num: tier.pts });
  return got.map((x) => x.tier.id);
}
