import { sql, type Kysely } from 'kysely';
import type { GameConfig, Tuning } from '@dt/config';
import {
  achProgressKey,
  ErrorCode,
  gameDay,
  gameTime,
  weekStart,
  type AchievementsDto,
  type GameEvent,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { runOp, type Op } from '../../core/op';
import type { DB, RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { BOARD_SOURCES } from '../rank/boards';
import { rankRows, type RankedRow } from '../rank/ranking';
import { awardAchievements } from './award';
import { achValues, valueOf, type AchValues } from './metrics';

/** 展示柜格数：成就点到了哪一档就开到几格 */
export function shelfSlots(t: Tuning['achieve'], points: number): number {
  let n = 0;
  for (const [need, slots] of t.shelfSlots) if (points >= need) n = slots;
  return n;
}

/**
 * 算一家店现在够得着、还没记下的成就（计数类和状态类都算），记下来。
 * 计数类平时在动作里就记了，这里补漏（比如配置新加的档）；状态类（等级、食谱品级、厨塔……）靠这里
 */
export async function evaluateRest(
  db: Kysely<DB>,
  config: GameConfig,
  t: Tuning['achieve'],
  rest: Pick<
    RestaurantRow,
    'id' | 'shard_id' | 'account_id' | 'level' | 'star_level' | 'renown' | 'street_id' | 'cookbook_counts'
  >,
  o: { now: Date; backfilled: boolean; events?: GameEvent[]; values?: AchValues },
): Promise<string[]> {
  // 可能在调用方的事务里跑：一条一条查，不并发；调用方算过口径值就直接用
  const values = o.values ?? (await achValues(db, config, rest, o.now));
  const have = await db
    .selectFrom('rest_achievement')
    .select('ach_id')
    .where('rest_id', '=', rest.id)
    .execute();
  const got = new Set(have.map((r) => r.ach_id));
  const ids: string[] = [];
  for (const line of config.bundle.achievements)
    for (const tier of line.tiers)
      if (!got.has(tier.id) && valueOf(values, line, tier) >= tier.n) ids.push(tier.id);
  if (ids.length === 0) return [];
  return awardAchievements(db, config, t, {
    shardId: rest.shard_id,
    restId: rest.id,
    ids,
    now: o.now,
    backfilled: o.backfilled,
    events: o.events,
  });
}

/** 区服补发完了没有：补发完以前打开成就页补算的也记成补发（不写动态、不算本周新增） */
export async function shardBackfilled(db: Kysely<DB>, shardId: number): Promise<boolean> {
  return !!(await db
    .selectFrom('ach_shard')
    .select('shard_id')
    .where('shard_id', '=', shardId)
    .executeTakeFirst());
}

export function createAchieveService(d: GameDeps) {
  /** 稀有度缓存：区服 → 成就编号 → 占比 */
  const rarityCache = new Map<number, { at: number; map: Record<string, number> }>();
  /** 成就点榜的名次缓存（和排行页同样的秒数）：成就墙每次打开不重算整张榜 */
  const rankCache = new Map<number, { at: number; rows: RankedRow[] }>();
  /** 网页要的进度键：配置里用到的口径（菜系按街道），别的计数不发 */
  const progressKeys = new Set(
    d.config.bundle.achievements.flatMap((l) =>
      l.tiers.map((x) => achProgressKey(x.metric, x.metric.startsWith('state:cuisine') ? l.streetId : null)),
    ),
  );

  async function rankOf(shardId: number, restId: number, cacheSeconds: number): Promise<number | null> {
    const now = d.now();
    let hit = rankCache.get(shardId);
    if (!hit || now.getTime() - hit.at >= cacheSeconds * 1000) {
      const rows = await BOARD_SOURCES['achieve.points']!({ db: d.db, shardId, now, config: d.config });
      hit = { at: now.getTime(), rows: rankRows(rows) };
      rankCache.set(shardId, hit);
    }
    return hit.rows.find((r) => r.restId === restId)?.rank ?? null;
  }

  async function rarity(shardId: number, t: Tuning['achieve']): Promise<Record<string, number>> {
    const hit = rarityCache.get(shardId);
    const now = d.now().getTime();
    if (hit && now - hit.at < t.rarityCacheSeconds * 1000) return hit.map;
    const { rows } = await sql<{ ach_id: string; n: number; total: number }>`
      select ra.ach_id, count(*)::int as n,
        (select count(*)::int from restaurant where shard_id = ${shardId} and not npc) as total
      from rest_achievement ra join restaurant r on r.id = ra.rest_id
      where r.shard_id = ${shardId} and not r.npc group by ra.ach_id`.execute(d.db);
    const map: Record<string, number> = {};
    for (const r of rows) if (r.total > 0) map[r.ach_id] = Math.round((r.n / r.total) * 1000) / 1000;
    rarityCache.set(shardId, { at: now, map });
    return map;
  }

  async function viewOf(
    db: Kysely<DB>,
    ctx: RestCtx,
    restId: number,
    values: AchValues | null,
  ): Promise<AchievementsDto> {
    const s = await d.shards.settings(ctx.shardId);
    const t = s.tuning.achieve;
    const rest = await db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', restId)
      .where('shard_id', '=', ctx.shardId)
      .executeTakeFirst();
    if (!rest) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
    const now = d.now();
    // 摆展示柜时在事务里：一条一条查
    const got = await db
      .selectFrom('rest_achievement')
      .select(['ach_id', 'achieved_at', 'first_in_shard', 'backfilled', 'pts'])
      .where('rest_id', '=', restId)
      .orderBy('achieved_at', 'desc')
      .execute();
    const stat = await db.selectFrom('rest_ach').selectAll().where('rest_id', '=', restId).executeTakeFirst();
    const rank = await rankOf(ctx.shardId, restId, s.tuning.rank.cacheSeconds);
    const rare = await rarity(ctx.shardId, t);
    const week = gameTime(weekStart(gameDay(now)), 0);
    const points = stat?.points ?? 0;
    const known = got.filter((g) => d.config.achievements.byId.has(g.ach_id));
    return {
      restId,
      name: rest.name,
      mine: restId === ctx.restaurantId,
      points,
      rank,
      rankRule: { minLevel: t.rankMinLevel, minAccountDays: t.rankMinAccountDays },
      weekPoints: known.filter((g) => !g.backfilled && g.achieved_at >= week).reduce((a, g) => a + g.pts, 0),
      got: known.map((g) => ({
        id: g.ach_id,
        at: g.achieved_at.toISOString(),
        first: g.first_in_shard,
        backfilled: g.backfilled,
      })),
      progress: values ? Object.fromEntries([...values].filter(([k]) => progressKeys.has(k))) : {},
      shelf: (stat?.shelf ?? []).filter((k) => d.config.achievements.trophies.has(k)),
      shelfSlots: shelfSlots(t, points),
      shelfNext: (() => {
        const n = t.shelfSlots.find(([need]) => need > points);
        return n ? { points: n[0], slots: n[1] } : null;
      })(),
      rarity: rare,
    };
  }

  /** 自己的成就墙：先补算一遍（打开就能看到刚够上的状态类成就），再读 */
  async function mine(ctx: RestCtx): Promise<AchievementsDto> {
    const values = await d.db.transaction().execute(async (tx) => {
      const rest = await tx
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const s = await d.shards.settings(ctx.shardId, tx);
      const now = d.now();
      const v = await achValues(tx, d.config, rest, now);
      // 区服还没补发完（刚上线）：这时补算出来的也算补发，不刷动态、不进本周新增
      const backfilled = !(await shardBackfilled(tx, ctx.shardId));
      await evaluateRest(tx, d.config, s.tuning.achieve, rest, { now, backfilled, values: v });
      return v;
    });
    return viewOf(d.db, ctx, ctx.restaurantId, values);
  }

  /** 摆展示柜：只能摆自己拿到的奖杯，格数按成就点 */
  async function setShelf(o: Op, trophies: string[]): Promise<AchievementsDto> {
    const keys = [...new Set(trophies)];
    const stat = await o.tx
      .selectFrom('rest_ach')
      .selectAll()
      .where('rest_id', '=', o.rest.id)
      .executeTakeFirst();
    if (keys.length > shelfSlots(o.tuning.achieve, stat?.points ?? 0)) throw invalidState('shelf_full');
    const owned = new Set(
      (
        await o.tx.selectFrom('rest_achievement').select('ach_id').where('rest_id', '=', o.rest.id).execute()
      ).flatMap((r) => {
        const t = o.config.achievements.byId.get(r.ach_id)?.tier.trophy;
        return t ? [t] : [];
      }),
    );
    if (keys.some((k) => !owned.has(k))) throw invalidState('trophy_missing');
    await o.tx
      .insertInto('rest_ach')
      .values({ rest_id: o.rest.id, shelf: JSON.stringify(keys) })
      .onConflict((oc) => oc.column('rest_id').doUpdateSet({ shelf: JSON.stringify(keys) }))
      .execute();
    return viewOf(o.tx, o.ctx!, o.rest.id, null);
  }

  return {
    mine,
    /** 别人的成就墙（只读，不带进度） */
    other: (ctx: RestCtx, restId: number) =>
      restId === ctx.restaurantId ? mine(ctx) : viewOf(d.db, ctx, restId, null),
    shelf: (ctx: RestCtx, trophies: string[]) =>
      runOp(d, ctx, { feature: 'friend', source: 'achieve' }, (o) => setShelf(o, trophies)),
  };
}
export type AchieveService = ReturnType<typeof createAchieveService>;

/** 好友页上的成就点和展示柜（成就系统 2026-10-19）；没有记录时 0 点、空柜 */
export async function achOf(
  db: Kysely<DB>,
  restId: number,
  config: GameConfig,
): Promise<{ points: number; shelf: string[] }> {
  const r = await db
    .selectFrom('rest_ach')
    .select(['points', 'shelf'])
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  return {
    points: r?.points ?? 0,
    shelf: (r?.shelf ?? []).filter((k) => config.achievements.trophies.has(k)),
  };
}
