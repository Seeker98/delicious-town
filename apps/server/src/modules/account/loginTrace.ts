import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { deviceIdOf } from '../../core/deps';
import { outsideRequestStats } from '../../infra/queryStats';
import type { DB } from '../../db/schema';

const KEEP_MS = 30 * 86_400_000;

/** 记一次登录（设计 §5，多号检测用）：同一账号、IP、设备只一行，再出现时更新最近时间 */
export async function recordLogin(
  db: Kysely<DB>,
  accountId: number,
  ip: string,
  deviceId: string | null,
): Promise<void> {
  await sql`
    insert into login_trace (account_id, ip, device_id) values (${accountId}, ${ip}, ${deviceId})
    on conflict (account_id, ip, device_key) do update set last_seen = now()`.execute(db);
}

/** 删掉 30 天没再出现的记录，返回删了几行 */
export async function cleanLoginTrace(db: Kysely<DB>, now: Date): Promise<number> {
  const r = await db
    .deleteFrom('login_trace')
    .where('last_seen', '<', new Date(now.getTime() - KEEP_MS))
    .executeTakeFirst();
  return Number(r.numDeletedRows);
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
      await recordLogin(db, accountId, req.clientIp, deviceId);
    }).catch((err: unknown) => req.log.warn({ err }, 'record play trace failed'));
  });
}
