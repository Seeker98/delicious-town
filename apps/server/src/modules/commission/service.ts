import { sql } from 'kysely';
import { isFeatureEnabled } from '@dt/config';
import {
  gameDay,
  gameTime,
  nextSlot,
  type CommissionDto,
  type CommissionMember,
  type CommissionNoticeDto,
  type HygieneReportParams,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { dailyHead } from '../daily/read';
import type { WorldService } from '../world/service';

const NOTICES = 10;
/** 全镇的汇总（蟑螂、老鼠、存款）每个区服缓存一分钟：委员会页谁打开都一样，不用每次扫日志 */
const TOWN_TTL_MS = 60_000;

type TownSums = Pick<CommissionDto['brief'], 'hygiene' | 'finance'>;

/** 小镇委员会页（2026-10-16）：公报、各位委员的今日要点、本店最近一次卫生巡查。只读 */
export function createCommissionService(d: GameDeps, world: WorldService) {
  const cache = new Map<number, { day: string; at: number; v: TownSums }>();

  async function townSums(shardId: number, now: Date): Promise<TownSums> {
    const day = gameDay(now);
    const hit = cache.get(shardId);
    if (hit && hit.day === day && now.getTime() - hit.at < TOWN_TTL_MS) return hit.v;
    const from = gameTime(day, 0);
    const [kills, mice, fund, wealth] = await Promise.all([
      d.db
        .selectFrom('daily_counter as c')
        .innerJoin('restaurant as r', 'r.id', 'c.rest_id')
        .select(sql<string>`coalesce(sum(c.count), 0)`.as('n'))
        .where('r.shard_id', '=', shardId)
        .where('c.day', '=', day)
        .where('c.key', '=', 'roach.kill')
        .executeTakeFirstOrThrow(),
      d.db
        .selectFrom('rest_log as l')
        .innerJoin('restaurant as r', 'r.id', 'l.rest_id')
        .select([
          sql<string>`count(*)`.as('visits'),
          sql<string>`count(*) filter (where l.type = 'mouse.steal')`.as('steals'),
        ])
        .where('r.shard_id', '=', shardId)
        .where('l.type', 'in', ['mouse.trap', 'mouse.escape', 'mouse.nothing', 'mouse.steal'])
        .where('l.created_at', '>=', from)
        .executeTakeFirstOrThrow(),
      d.db
        .selectFrom('fund_deposit')
        .select(sql<string>`coalesce(sum(coin), 0)`.as('coin'))
        .where('shard_id', '=', shardId)
        .where('status', '=', 'active')
        .executeTakeFirstOrThrow(),
      d.db
        .selectFrom('wealth_deposit')
        .select(sql<string>`coalesce(sum(coin), 0)`.as('coin'))
        .where('shard_id', '=', shardId)
        .where('status', '=', 'active')
        .executeTakeFirstOrThrow(),
    ]);
    const v: TownSums = {
      hygiene: {
        roachKills: Number(kills.n),
        mouseVisits: Number(mice.visits),
        mouseSteals: Number(mice.steals),
      },
      finance: { coin: Number(fund.coin) + Number(wealth.coin) },
    };
    cache.set(shardId, { day, at: now.getTime(), v });
    return v;
  }

  return {
    async view(ctx: RestCtx): Promise<CommissionDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'town');
      const now = d.now();
      const marketOn = isFeatureEnabled(s, 'market');
      const [notices, sums, snap, specials, daily, mine] = await Promise.all([
        listNotices(d, ctx.shardId, NOTICES),
        townSums(ctx.shardId, now),
        world.ensure(ctx.shardId, now),
        marketOn
          ? d.db
              .selectFrom('market_item')
              .select('foods_id')
              .where('shard_id', '=', ctx.shardId)
              .where('shelf', '=', 1)
              .whereRef('sold', '<', 'stock')
              .orderBy('id')
              .execute()
          : [],
        isFeatureEnabled(s, 'daily') ? dailyHead(d.db, ctx.shardId, now) : null,
        d.db
          .selectFrom('rest_log')
          .select(['params', 'created_at'])
          .where('rest_id', '=', ctx.restaurantId)
          .where('type', '=', 'hygiene.report')
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst(),
      ]);
      return {
        notices,
        brief: {
          ...sums,
          weather: { id: snap.weather.id, until: snap.weatherUntil.toISOString() },
          market: marketOn
            ? {
                foodsIds: specials.map((r) => r.foods_id),
                next: nextSlot(now, s.tuning.market.specialHours).start.toISOString(),
              }
            : null,
          daily,
        },
        myHygiene: mine
          ? { ...(mine.params as unknown as HygieneReportParams), at: mine.created_at.toISOString() }
          : null,
      };
    },
  };
}
export type CommissionService = ReturnType<typeof createCommissionService>;

/** 本区服能看到的公报（发给本区和发给全部区服的），新的在前 */
export async function listNotices(
  d: GameDeps,
  shardId: number,
  limit: number,
): Promise<CommissionNoticeDto[]> {
  const rows = await d.db
    .selectFrom('commission_notice')
    .select(['id', 'member', 'body', 'created_at'])
    .where('deleted_at', 'is', null)
    .where((eb) => eb.or([eb('shard_id', 'is', null), eb('shard_id', '=', shardId)]))
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();
  return rows.map((r) => ({
    id: r.id,
    member: r.member as CommissionMember,
    body: r.body,
    createdAt: r.created_at.toISOString(),
  }));
}
