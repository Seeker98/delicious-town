import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { deviceIdOf, userAgentOf } from '../../core/deps';
import { outsideRequestStats } from '../../infra/queryStats';
import type { DB } from '../../db/schema';

const KEEP_MS = 30 * 86_400_000;

/** 记一次登录（设计 §5，多号检测用）：同一账号、IP、设备只一行，再出现时更新最近时间 */
export async function recordLogin(
  db: Kysely<DB>,
  accountId: number,
  ip: string,
  deviceId: string | null,
  userAgent: string | null = null,
): Promise<void> {
  // 浏览器标识记最近一次的（接口调用记录 2026-10-24）
  await sql`
    insert into login_trace (account_id, ip, device_id, user_agent) values (${accountId}, ${ip}, ${deviceId}, ${userAgent})
    on conflict (account_id, ip, device_key) do update
      set last_seen = now(), user_agent = coalesce(excluded.user_agent, login_trace.user_agent)`.execute(db);
}

/**
 * 开放接口调用记一笔（2026-10-24）：同一游戏日、IP、标识、来源网页、带没带 lang 合成一行加次数。
 * 来源取 Origin，没有时取 Referer 的源（只留协议和域名，不存路径）
 */
export async function recordOpenCall(
  db: Kysely<DB>,
  call: { day: string; ip: string; userAgent: string | null; origin: string | null; lang: boolean },
): Promise<void> {
  await sql`
    insert into open_trace (day, ip, user_agent, origin, lang)
    values (${call.day}, ${call.ip}, ${call.userAgent ?? ''}, ${call.origin ?? ''}, ${call.lang})
    on conflict (day, ip, user_agent, origin, lang) do update set n = open_trace.n + 1, last_seen = now()`.execute(
    db,
  );
}

/** 请求来自哪个网页：Origin，没有时 Referer 的源；都没有或写坏了是 null */
export function originOf(headers: {
  origin?: string | string[];
  referer?: string | string[];
}): string | null {
  for (const v of [headers.origin, headers.referer]) {
    if (typeof v !== 'string' || v === '' || v === 'null') continue;
    try {
      return new URL(v).origin.slice(0, 200);
    } catch {
      continue;
    }
  }
  return null;
}

/** 删掉 30 天没再出现的记录，返回删了几行 */
export async function cleanLoginTrace(db: Kysely<DB>, now: Date): Promise<number> {
  const before = new Date(now.getTime() - KEEP_MS);
  const r = await db.deleteFrom('login_trace').where('last_seen', '<', before).executeTakeFirst();
  // 开放接口调用记录一样只留 30 天
  const o = await db.deleteFrom('open_trace').where('last_seen', '<', before).executeTakeFirst();
  // 操作节奏（防脚本 2026-10-25）也只留 30 天
  const p = await db.deleteFrom('play_rhythm').where('hour', '<', before).executeTakeFirst();
  return Number(r.numDeletedRows) + Number(o.numDeletedRows) + Number(p.numDeletedRows);
}

/** 游玩时同一账号、IP、设备多久记一次（秒） */
export const PLAY_TRACE_SEC = 3600;

/**
 * 游玩时也记登录记录（收购改版 2026-10-16 定）：原来只在注册、登录那一下记，登录后换了网络、设备，
 * 关联检查（收购、交易所、点赞）就看不到。带会话的请求按 账号 + IP + 设备 每小时最多写一次（Redis 占位），
 * 不等它写完、写失败只记日志，不影响请求
 */
export function registerPlayTrace(app: FastifyInstance, db: Kysely<DB>, redis: Redis): void {
  app.addHook('onRequest', async (req) => {
    const accountId = req.session?.data.accountId;
    if (!accountId) return;
    const deviceId = deviceIdOf(req);
    const key = `lt:${accountId}:${req.clientIp}:${deviceId ?? '-'}`;
    // 不算进这次请求的查询条数（查询统计、性能预算测试只看请求自己的）
    void outsideRequestStats(async () => {
      if ((await redis.set(key, '1', 'EX', PLAY_TRACE_SEC, 'NX')) !== 'OK') return;
      await recordLogin(db, accountId, req.clientIp, deviceId, userAgentOf(req));
    }).catch((err: unknown) => req.log.warn({ err }, 'record play trace failed'));
  });
}
