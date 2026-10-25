import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { deviceIdOf, userAgentOf } from '../../core/deps';
import type { DB } from '../../db/schema';
import { luaScript } from '../../infra/luaScript';
import type { AntibotSettings } from './hook';
import type { Verdict } from './verify';

/** Redis 计数键的过期时间：汇总任务每 10 分钟跑，3 小时足够 */
const TTL_SEC = 3 * 3600;
/** 间隔不到这么久算一阵猛点，不进“规律程度” */
const BURST_MS = 10_000;
/** 间隔超过这么久不算（离开了） */
const GAP_MAX_MS = 3_600_000;
/** 写请求前这么久内有读请求，算看过页面 */
const VIEW_SEC = 300;

/** 整点键（UTC），例如 2026-10-25T03 */
export function hourKey(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/**
 * 记进“结论”但不算写操作的几项（防脚本 2026-10-25 审阅）：
 * 读请求没带合格的版本号；被点名的号人机验证没带令牌、没通过、通过
 */
export type RhythmTag = 'get_no_build' | 'captcha_missing' | 'captcha_failed' | 'captcha_ok';

export interface RhythmEvent {
  accountId: number;
  at: Date;
  method: 'GET' | 'POST';
  /** 路由模板（带 :id，不带具体值） */
  route: string;
  /** 写请求的签名结论；读请求只会是 get_no_build */
  verdict?: Verdict | 'get_no_build';
  idle?: number | null;
  idleMs: number;
  ua: string | null;
  deviceId: string | null;
  ip: string;
}

const keysOf = (hour: string, accountId: number) => [
  `rh:${hour}:${accountId}`,
  `rhu:${hour}:${accountId}`,
  `rhd:${hour}:${accountId}`,
  `rhi:${hour}:${accountId}`,
];

/**
 * 一次请求的计数，一个 Lua 脚本一次往返（要读上一次写请求的时间算间隔）。
 * KEYS：计数哈希、标识集合、设备集合、IP 集合、上次写请求时间、最近读请求标记
 */
const SCRIPT = luaScript(`
local h = KEYS[1]
if ARGV[4] ~= '' then redis.call('HINCRBY', h, 'v:' .. ARGV[4], 1) end
if ARGV[1] == 'GET' then
  redis.call('HINCRBY', h, 'gets', 1)
  redis.call('SET', KEYS[6], '1', 'EX', ${VIEW_SEC})
else
  redis.call('HINCRBY', h, 'posts', 1)
  redis.call('HINCRBY', h, 'r:' .. ARGV[3], 1)
  local now = tonumber(ARGV[2])
  local last = redis.call('GET', KEYS[5])
  if last then
    local gap = now - tonumber(last)
    if gap >= 0 and gap < ${BURST_MS} then
      redis.call('HINCRBY', h, 'bursts', 1)
    elseif gap >= ${BURST_MS} and gap <= ${GAP_MAX_MS} then
      redis.call('HINCRBY', h, 'gap_n', 1)
      redis.call('HINCRBY', h, 'gap_sum', gap)
      redis.call('HINCRBYFLOAT', h, 'gap_sq', gap * gap)
      local m = redis.call('HGET', h, 'gap_min')
      if (not m) or gap < tonumber(m) then redis.call('HSET', h, 'gap_min', gap) end
    end
  end
  redis.call('SET', KEYS[5], ARGV[2], 'EX', 7200)
  if redis.call('EXISTS', KEYS[6]) == 0 then redis.call('HINCRBY', h, 'no_view', 1) end
  local idle = tonumber(ARGV[5])
  if idle and (idle == -1 or idle > tonumber(ARGV[6])) then redis.call('HINCRBY', h, 'idle_long', 1) end
end
if ARGV[7] ~= '' then redis.call('SADD', KEYS[2], ARGV[7]) end
if ARGV[8] ~= '' then redis.call('SADD', KEYS[3], ARGV[8]) end
redis.call('SADD', KEYS[4], ARGV[9])
for i = 1, 4 do redis.call('EXPIRE', KEYS[i], ${TTL_SEC}) end
return 1
`);

/** 只加一项结论计数 */
const TALLY = luaScript(`
redis.call('HINCRBY', KEYS[1], 'v:' .. ARGV[1], 1)
redis.call('EXPIRE', KEYS[1], ${TTL_SEC})
return 1
`);

const uaHash = (ua: string | null) => (ua ? createHash('sha1').update(ua).digest('hex').slice(0, 16) : '');

/** 记一次请求（防脚本 2026-10-25）：请求里不写数据库，只写 Redis */
type ScriptRedis = Pick<Redis, 'eval' | 'evalsha'>;

export async function recordRhythm(redis: ScriptRedis, e: RhythmEvent): Promise<void> {
  const keys = [...keysOf(hourKey(e.at), e.accountId), `rhl:${e.accountId}`, `rhg:${e.accountId}`];
  await SCRIPT(redis, keys, [
    e.method,
    String(e.at.getTime()),
    e.route,
    e.verdict ?? '',
    e.idle === null || e.idle === undefined ? '' : String(e.idle),
    String(e.idleMs),
    uaHash(e.ua),
    e.deviceId ?? '',
    e.ip,
  ]);
}

/** 记一项不算写操作的结论（人机验证结果） */
export async function tallyRhythm(redis: ScriptRedis, accountId: number, at: Date, tag: RhythmTag) {
  await TALLY(redis, [keysOf(hourKey(at), accountId)[0]!], [tag]);
}

/** 钩子用的两个回调：不等结果，出错只记日志 */
export function trackRhythm(redis: ScriptRedis) {
  const fire = (
    req: FastifyRequest,
    e: Omit<RhythmEvent, 'accountId' | 'route' | 'ua' | 'deviceId' | 'ip'>,
  ) => {
    const accountId = req.session?.data.accountId;
    if (!accountId) return;
    void recordRhythm(redis, {
      ...e,
      accountId,
      route: req.routeOptions.url ?? '',
      ua: userAgentOf(req),
      deviceId: deviceIdOf(req),
      ip: req.clientIp,
    }).catch((err: unknown) => req.log.warn({ err }, 'record rhythm failed'));
  };
  return {
    onRead(req: FastifyRequest, r: { buildOk: boolean }): void {
      fire(req, {
        at: new Date(),
        method: 'GET',
        idleMs: 0,
        verdict: r.buildOk ? undefined : 'get_no_build',
      });
    },
    onJudged(
      req: FastifyRequest,
      r: { verdict: Verdict; idle: number | null; settings: AntibotSettings },
    ): void {
      fire(req, {
        at: new Date(),
        method: 'POST',
        verdict: r.verdict,
        idle: r.idle,
        idleMs: r.settings.idleMs,
      });
    },
    onCaptcha(req: FastifyRequest, outcome: 'missing' | 'failed' | 'ok'): void {
      const accountId = req.session?.data.accountId;
      if (!accountId) return;
      void tallyRhythm(redis, accountId, new Date(), `captcha_${outcome}`).catch((err: unknown) =>
        req.log.warn({ err }, 'record rhythm failed'),
      );
    },
  };
}

/**
 * 把已经结束的小时从 Redis 汇总进 play_rhythm（worker 每 10 分钟跑）。
 * 每个键用 MULTI 读完即删，重复跑不会重复累加；同一小时万一又有数也按累加写
 */
export async function flushRhythm(db: Kysely<DB>, redis: Redis, now: Date): Promise<number> {
  const current = hourKey(now);
  let cursor = '0';
  let written = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'rh:*', 'COUNT', 500);
    cursor = next;
    for (const key of keys) {
      const [, hour, id] = key.split(':');
      if (!hour || !id || hour >= current) continue;
      const accountId = Number(id);
      const [, u, dv, ip] = keysOf(hour, accountId);
      const res = await redis
        .multi()
        .hgetall(key)
        .scard(u!)
        .scard(dv!)
        .scard(ip!)
        .del(key, u!, dv!, ip!)
        .exec();
      if (!res) continue;
      const h = (res[0]![1] ?? {}) as Record<string, string>;
      if (Object.keys(h).length === 0) continue;
      const n = (f: string) => Number(h[f] ?? 0);
      const pick = (prefix: string) =>
        Object.fromEntries(
          Object.entries(h)
            .filter(([k]) => k.startsWith(prefix))
            .map(([k, v]) => [k.slice(prefix.length), Number(v)]),
        );
      const v = {
        account_id: accountId,
        hour: new Date(`${hour}:00:00Z`),
        posts: n('posts'),
        gets: n('gets'),
        routes: JSON.stringify(pick('r:')),
        gap_n: n('gap_n'),
        gap_sum: n('gap_sum'),
        gap_sq: n('gap_sq'),
        gap_min: h.gap_min === undefined ? null : n('gap_min'),
        bursts: n('bursts'),
        no_view: n('no_view'),
        idle_long: n('idle_long'),
        verdicts: JSON.stringify(pick('v:')),
        uas: Number(res[1]![1] ?? 0),
        devices: Number(res[2]![1] ?? 0),
        ips: Number(res[3]![1] ?? 0),
      };
      const sumJson = (col: 'routes' | 'verdicts') =>
        sql<string>`(select coalesce(jsonb_object_agg(k, coalesce((play_rhythm.${sql.raw(col)} ->> k)::int, 0)
          + coalesce((excluded.${sql.raw(col)} ->> k)::int, 0)), '{}'::jsonb)
          from jsonb_object_keys(play_rhythm.${sql.raw(col)} || excluded.${sql.raw(col)}) as k)`;
      await db
        .insertInto('play_rhythm')
        .values(v)
        .onConflict((oc) =>
          oc.columns(['account_id', 'hour']).doUpdateSet({
            posts: sql`play_rhythm.posts + excluded.posts`,
            gets: sql`play_rhythm.gets + excluded.gets`,
            routes: sumJson('routes'),
            gap_n: sql`play_rhythm.gap_n + excluded.gap_n`,
            gap_sum: sql`play_rhythm.gap_sum + excluded.gap_sum`,
            gap_sq: sql`play_rhythm.gap_sq + excluded.gap_sq`,
            gap_min: sql`least(play_rhythm.gap_min, excluded.gap_min)`,
            bursts: sql`play_rhythm.bursts + excluded.bursts`,
            no_view: sql`play_rhythm.no_view + excluded.no_view`,
            idle_long: sql`play_rhythm.idle_long + excluded.idle_long`,
            verdicts: sumJson('verdicts'),
            uas: sql`greatest(play_rhythm.uas, excluded.uas)`,
            devices: sql`greatest(play_rhythm.devices, excluded.devices)`,
            ips: sql`greatest(play_rhythm.ips, excluded.ips)`,
          }),
        )
        .execute();
      written++;
    }
  } while (cursor !== '0');
  return written;
}
