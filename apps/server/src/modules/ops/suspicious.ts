import { sql } from 'kysely';
import {
  addDays,
  gameDay,
  gameTime,
  type SuspiciousAcquireRow,
  type SuspiciousBarRow,
  type SuspiciousMultiGroup,
  type SuspiciousRedeemRow,
  type SuspiciousSurgeDto,
  type SuspiciousSurgeRow,
} from '@dt/shared';
import type { Game } from '../../game';

const KEEP_MS = 30 * 86_400_000;
/** 收购拦截最多列出几条（收购 PR 3） */
const ACQUIRE_BLOCKS_MAX = 200;
/** 多号每组最多列出几个账号（最近登录的在前）；总数另给（backlog 6B-2） */
export const MULTI_ACCOUNTS_MAX = 50;
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
      // 一条查询把三种资源按“店 × 来源”一起汇总，每段先限定本区服的店（质量期 ③：原来每种资源两条、各扫一遍当天的流水和收益，共 6 遍）。
      // 结算的银币、经验不进流水（ledger: false），在 income_round 里；按来源 settlement 一起算（终审 I1）。
      // 某种资源没有流水时那一列是 null：只有出现过的店才进那一榜（和原来一致）
      const rows = await sql<{
        rest_id: number;
        source: string;
        coin: string | null;
        diamond: string | null;
        exp: string | null;
      }>`
        with rests as (select id from restaurant where shard_id = ${shardId} and not npc),
        l as (
          select rest_id, source,
            sum(delta) filter (where kind = 'coin') as coin,
            sum(delta) filter (where kind = 'diamond') as diamond,
            sum(delta) filter (where kind = 'exp') as exp
          from ledger
          where kind in ('coin', 'diamond', 'exp') and created_at >= ${from} and created_at < ${to}
            and rest_id in (select id from rests)
          group by rest_id, source
          union all
          select rest_id, 'settlement', sum(coin), null, sum(exp) from income_round
          where created_at >= ${from} and created_at < ${to} and rest_id in (select id from rests)
          group by rest_id
        )
        select rest_id, source, coin, diamond, exp from l`.execute(db);
      // 店 → 资源 → 来源 → 金额（流水和结算都有 settlement 来源时合在一起）
      const by = new Map<number, Record<(typeof SURGE_KINDS)[number], Map<string, number>>>();
      for (const row of rows.rows) {
        let m = by.get(row.rest_id);
        if (!m) by.set(row.rest_id, (m = { coin: new Map(), diamond: new Map(), exp: new Map() }));
        for (const kind of SURGE_KINDS) {
          const v = row[kind];
          if (v === null) continue;
          m[kind].set(row.source, (m[kind].get(row.source) ?? 0) + Number(v));
        }
      }
      const tops = SURGE_KINDS.map((kind) => {
        const list = [...by].flatMap(([restId, m]) =>
          m[kind].size === 0
            ? []
            : [{ restId, sources: m[kind], net: [...m[kind].values()].reduce((a, x) => a + x, 0) }],
        );
        list.sort((x, y) => y.net - x.net || x.restId - y.restId);
        return [kind, list.slice(0, t.topN)] as const;
      });
      const ids = [...new Set(tops.flatMap(([, list]) => list.map((x) => x.restId)))];
      const names = ids.length
        ? await db
            .selectFrom('restaurant as r')
            .innerJoin('account as a', 'a.id', 'r.account_id')
            .select(['r.id', 'r.name', 'a.id as account_id', 'a.username'])
            .where('r.id', 'in', ids)
            .execute()
        : [];
      const nameOf = new Map(names.map((x) => [x.id, x]));
      for (const [kind, list] of tops)
        out[kind] = list.flatMap((x): SuspiciousSurgeRow[] => {
          const n = nameOf.get(x.restId);
          if (!n) return [];
          return [
            {
              restId: x.restId,
              restName: n.name,
              accountId: n.account_id,
              username: n.username,
              net: x.net,
              topSources: [...x.sources]
                .map(([source, delta]) => ({ source, delta }))
                .sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta))
                .slice(0, 3),
            },
          ];
        });
      return out;
    },

    /** 多号：最近 30 天同一 IP 或同一设备登录过不少于门槛个账号；组内至少一个账号在本区服有店 */
    async multi(shardId: number): Promise<SuspiciousMultiGroup[]> {
      const t = (await tuningOf(shardId)).ops.suspicious;
      const since = new Date(game.deps.now().getTime() - KEEP_MS);
      // IP 和设备两种分组先各取前 N 个，合在一起按人数排、再取前 N 个：
      // 以前先填满 IP 分组，设备分组可能被挤掉（backlog 6B-2）
      const found: Array<{ kind: 'ip' | 'device'; key: string; n: number }> = [];
      for (const kind of ['ip', 'device'] as const) {
        const col = kind === 'ip' ? sql.ref('lt.ip') : sql.ref('lt.device_id');
        const keys = await sql<{ key: string; n: string }>`
          select ${col} as key, count(distinct lt.account_id) as n from login_trace lt
          where lt.last_seen >= ${since} and ${col} is not null
          group by ${col}
          having count(distinct lt.account_id) >= ${t.sharedAccounts}
            and bool_or(exists (
              select 1 from restaurant r where r.account_id = lt.account_id and r.shard_id = ${shardId} and not r.npc
            ))
          order by count(distinct lt.account_id) desc
          limit ${t.topN}`.execute(db);
        for (const r of keys.rows) found.push({ kind, key: r.key, n: Number(r.n) });
      }
      found.sort((a, b) => b.n - a.n);
      const groups: SuspiciousMultiGroup[] = [];
      for (const { kind, key, n } of found.slice(0, t.topN)) {
        const col = kind === 'ip' ? sql.ref('lt.ip') : sql.ref('lt.device_id');
        // 每组只列最近登录的 MULTI_ACCOUNTS_MAX 个账号，total 给出总数（backlog 6B-2）
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
            order by max(lt.last_seen) desc
            limit ${MULTI_ACCOUNTS_MAX}`.execute(db);
        groups.push({
          kind,
          key,
          total: n,
          accounts: accounts.rows.map((x) => ({
            accountId: x.account_id,
            username: x.username,
            restId: x.rest_id,
            restName: x.rest_name,
            lastSeen: new Date(x.last_seen).toISOString(),
          })),
        });
      }
      return groups;
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
        if (keys.length === 0) continue;
        // 这一批的计数和剩余时间一次取回（质量期 ③：原来每个键单独 GET、TTL 各一次往返）
        const p = redis.pipeline();
        for (const key of keys) p.get(key).ttl(key);
        const res = (await p.exec()) ?? [];
        keys.forEach((key, i) => {
          const fails = Number(res[i * 2]?.[1] ?? 0);
          if (fails < failLimit) return;
          const accountId = Number(key.slice('redeem:fail:'.length));
          if (!Number.isInteger(accountId)) return;
          found.push({ accountId, fails, ttlSec: Math.max(0, Number(res[i * 2 + 1]?.[1] ?? 0)) });
        });
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

    /** 收购时因为关联账号（共用设备 / IP）被拦下的记录（收购 PR 3）：本区服近 30 天，新的在前 */
    async acquireBlocks(shardId: number): Promise<SuspiciousAcquireRow[]> {
      const since = new Date(game.deps.now().getTime() - KEEP_MS);
      const rows = await db
        .selectFrom('acquire_block as k')
        .innerJoin('restaurant as b', 'b.id', 'k.buyer_rest_id')
        .innerJoin('restaurant as t', 't.id', 'k.target_rest_id')
        .select([
          'k.created_at',
          'k.reason',
          'b.id as buyer_id',
          'b.name as buyer_name',
          'b.account_id as buyer_account',
          't.id as target_id',
          't.name as target_name',
          't.account_id as target_account',
        ])
        .where('k.shard_id', '=', shardId)
        .where('k.created_at', '>=', since)
        .orderBy('k.created_at', 'desc')
        .orderBy('k.id', 'desc')
        .limit(ACQUIRE_BLOCKS_MAX)
        .execute();
      return rows.map((r) => ({
        at: r.created_at.toISOString(),
        reason: r.reason,
        buyer: { restId: r.buyer_id, name: r.buyer_name, accountId: r.buyer_account },
        target: { restId: r.target_id, name: r.target_name, accountId: r.target_account },
      }));
    },
  };
}
