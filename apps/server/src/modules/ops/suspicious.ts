import { sql } from 'kysely';
import {
  addDays,
  gameDay,
  gameTime,
  type SuspiciousBarRow,
  type SuspiciousMultiGroup,
  type SuspiciousRedeemRow,
  type SuspiciousSurgeDto,
  type SuspiciousSurgeRow,
} from '@dt/shared';
import type { Game } from '../../game';

const KEEP_MS = 30 * 86_400_000;
const SURGE_KINDS = ['coin', 'diamond', 'exp'] as const;

/** 可疑数据（设计 §5）：只读查询，按区服；门槛在 tuning.ops.suspicious */
export function createSuspicious(game: Game) {
  const db = game.app.db;
  const tuningOf = async (shardId: number) => (await game.shards.settings(shardId)).tuning;

  return {
    /** 酒吧：最近 7 个游戏日"记忆调酒三关全过""飞镖 50 分"的合计和单日最高 */
    async bar(shardId: number): Promise<SuspiciousBarRow[]> {
      const t = (await tuningOf(shardId)).ops.suspicious;
      const today = gameDay(game.deps.now());
      const rows = await sql<{
        rest_id: number;
        name: string;
        account_id: number;
        username: string;
        perfect_sum: string;
        perfect_max: number;
        bull_sum: string;
        bull_max: number;
      }>`
        select r.id as rest_id, r.name, a.id as account_id, a.username,
          coalesce(sum(c.count) filter (where c.key = 'bar.memory.perfect'), 0) as perfect_sum,
          coalesce(max(c.count) filter (where c.key = 'bar.memory.perfect'), 0) as perfect_max,
          coalesce(sum(c.count) filter (where c.key = 'bar.darts.bull'), 0) as bull_sum,
          coalesce(max(c.count) filter (where c.key = 'bar.darts.bull'), 0) as bull_max
        from daily_counter c
        join restaurant r on r.id = c.rest_id
        join account a on a.id = r.account_id
        where r.shard_id = ${shardId} and not r.npc
          and c.key in ('bar.memory.perfect', 'bar.darts.bull')
          and c.day >= ${addDays(today, -6)} and c.day <= ${today}
        group by r.id, r.name, a.id, a.username`.execute(db);
      const score = (r: { perfect_max: number; bull_max: number }) =>
        Math.max(r.perfect_max / t.barPerfectDaily, r.bull_max / t.dartsBullDaily);
      return rows.rows
        .map((r) => ({
          restId: r.rest_id,
          restName: r.name,
          accountId: r.account_id,
          username: r.username,
          perfectSum: Number(r.perfect_sum),
          perfectMax: Number(r.perfect_max),
          bullSum: Number(r.bull_sum),
          bullMax: Number(r.bull_max),
          flagged: r.perfect_max > t.barPerfectDaily || r.bull_max > t.dartsBullDaily,
          score: score(r),
        }))
        .sort((x, y) => Number(y.flagged) - Number(x.flagged) || y.score - x.score)
        .slice(0, t.topN)
        .map(({ score: _score, ...r }) => r);
    },

    /** 资源暴涨：某个游戏日银币、钻石、经验净增最多的店，附金额最大的 3 个来源 */
    async surge(shardId: number, dayIn?: string): Promise<SuspiciousSurgeDto> {
      const t = (await tuningOf(shardId)).ops.suspicious;
      const day = dayIn ?? addDays(gameDay(game.deps.now()), -1);
      const from = gameTime(day, 0);
      const to = gameTime(addDays(day, 1), 0);
      const out: SuspiciousSurgeDto = { day, coin: [], diamond: [], exp: [] };
      for (const kind of SURGE_KINDS) {
        // 结算的银币、经验不进流水（ledger: false），在 income_round 里；按来源 settlement 一起算（终审 I1）
        const ledgerPart = sql`select rest_id, delta, source from ledger
          where kind = ${kind} and created_at >= ${from} and created_at < ${to}`;
        const src =
          kind === 'diamond'
            ? ledgerPart
            : sql`${ledgerPart}
              union all
              select rest_id, ${sql.ref(kind)} as delta, 'settlement' as source from income_round
              where created_at >= ${from} and created_at < ${to}`;
        const top = await sql<{
          rest_id: number;
          name: string;
          account_id: number;
          username: string;
          net: string;
        }>`
          select r.id as rest_id, r.name, a.id as account_id, a.username, sum(l.delta) as net
          from (${src}) l
          join restaurant r on r.id = l.rest_id
          join account a on a.id = r.account_id
          where r.shard_id = ${shardId} and not r.npc
          group by r.id, r.name, a.id, a.username
          order by sum(l.delta) desc
          limit ${t.topN}`.execute(db);
        const ids = top.rows.map((r) => r.rest_id);
        const sources = ids.length
          ? await sql<{ rest_id: number; source: string; delta: string }>`
              select rest_id, source, sum(delta) as delta from (${src}) l
              where rest_id in (${sql.join(ids)})
              group by rest_id, source`.execute(db)
          : { rows: [] };
        const bySource = new Map<number, Array<{ source: string; delta: number }>>();
        for (const s of sources.rows) {
          const list = bySource.get(s.rest_id) ?? [];
          list.push({ source: s.source, delta: Number(s.delta) });
          bySource.set(s.rest_id, list);
        }
        out[kind] = top.rows.map((r): SuspiciousSurgeRow => ({
          restId: r.rest_id,
          restName: r.name,
          accountId: r.account_id,
          username: r.username,
          net: Number(r.net),
          topSources: (bySource.get(r.rest_id) ?? [])
            .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
            .slice(0, 3),
        }));
      }
      return out;
    },

    /** 多号：最近 30 天同一 IP 或同一设备登录过不少于门槛个账号；组内至少一个账号在本区服有店 */
    async multi(shardId: number): Promise<SuspiciousMultiGroup[]> {
      const t = (await tuningOf(shardId)).ops.suspicious;
      const since = new Date(game.deps.now().getTime() - KEEP_MS);
      const groups: SuspiciousMultiGroup[] = [];
      for (const kind of ['ip', 'device'] as const) {
        const col = kind === 'ip' ? sql.ref('lt.ip') : sql.ref('lt.device_id');
        const keys = await sql<{ key: string }>`
          select ${col} as key from login_trace lt
          where lt.last_seen >= ${since} and ${col} is not null
          group by ${col}
          having count(distinct lt.account_id) >= ${t.sharedAccounts}
            and bool_or(exists (
              select 1 from restaurant r where r.account_id = lt.account_id and r.shard_id = ${shardId} and not r.npc
            ))
          order by count(distinct lt.account_id) desc
          limit ${t.topN}`.execute(db);
        for (const { key } of keys.rows) {
          const accounts = await sql<{
            account_id: number;
            username: string;
            rest_id: number | null;
            rest_name: string | null;
            last_seen: Date;
          }>`
            select a.id as account_id, a.username, r.id as rest_id, r.name as rest_name, max(lt.last_seen) as last_seen
            from login_trace lt
            join account a on a.id = lt.account_id
            left join restaurant r on r.account_id = a.id and r.shard_id = ${shardId} and not r.npc
            where ${col} = ${key} and lt.last_seen >= ${since}
            group by a.id, a.username, r.id, r.name
            order by max(lt.last_seen) desc`.execute(db);
          groups.push({
            kind,
            key,
            accounts: accounts.rows.map((x) => ({
              accountId: x.account_id,
              username: x.username,
              restId: x.rest_id,
              restName: x.rest_name,
              lastSeen: new Date(x.last_seen).toISOString(),
            })),
          });
        }
      }
      return groups.slice(0, t.topN);
    },

    /** 兑换码输错被锁的账号（按账号计，不分区服；门槛用这个区服的 failLimit） */
    async redeemLocked(shardId: number): Promise<SuspiciousRedeemRow[]> {
      const { failLimit } = (await tuningOf(shardId)).redeem;
      const redis = game.app.redis;
      const found: Array<{ accountId: number; fails: number; ttlSec: number }> = [];
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'redeem:fail:*', 'COUNT', 200);
        cursor = next;
        for (const key of keys) {
          const fails = Number((await redis.get(key)) ?? 0);
          if (fails < failLimit) continue;
          const accountId = Number(key.slice('redeem:fail:'.length));
          if (!Number.isInteger(accountId)) continue;
          found.push({ accountId, fails, ttlSec: Math.max(0, await redis.ttl(key)) });
        }
      } while (cursor !== '0');
      if (found.length === 0) return [];
      const names = await db
        .selectFrom('account')
        .select(['id', 'username'])
        .where(
          'id',
          'in',
          found.map((f) => f.accountId),
        )
        .execute();
      const nameOf = new Map(names.map((n) => [n.id, n.username]));
      return found
        .filter((f) => nameOf.has(f.accountId))
        .map((f) => ({ ...f, username: nameOf.get(f.accountId)! }))
        .sort((x, y) => y.fails - x.fails);
    },
  };
}
