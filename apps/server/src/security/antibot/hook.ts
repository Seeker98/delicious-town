import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { AB_HEADERS, ErrorCode } from '@dt/shared';
import type { Env } from '../../env';
import { AppError } from '../../http/errors';
import type { SessionStore } from '../sessionStore';
import { judge, type Verdict } from './verify';
import type { Whitelist } from './whitelist';

export type AntibotMode = 'log' | 'enforce';

export interface AntibotSettings {
  mode: AntibotMode;
  skewSec: number;
  idleMs: number;
}

/** 会话还没选区服时按这个（只记录） */
export const ANTIBOT_DEFAULTS: AntibotSettings = { mode: 'log', skewSec: 120, idleMs: 60000 };

export interface AntibotDeps {
  redis: Redis;
  env: Env;
  now: () => Date;
  whitelist: Whitelist;
  sessions: SessionStore;
  settingsFor(shardId: number | null): Promise<AntibotSettings>;
  /** 带会话的读请求调一次（节奏统计用）；出错不影响请求 */
  onRead?(req: FastifyRequest): void;
  /** 每个校验过的写请求调一次（节奏统计用）；出错不影响请求 */
  onJudged?(
    req: FastifyRequest,
    r: { verdict: Verdict; idle: number | null; settings: AntibotSettings },
  ): void;
}

/** 不签、不校验的路由：开放接口、测试接口 */
const SKIP = ['/api/v1/open/', '/api/v1/test/'];
const ADMIN = '/api/v1/admin/';

/**
 * 游戏接口防脚本（设计 2026-10-25）：带登录会话的写请求校验签名。
 * 挂在防重复提交之后：同一个 idempotency-key 的合法重试拿缓存响应，到不了这里，不会被当成重放。
 * 只记录模式、后台接口、白名单、环境变量总开关都只记录；拦截时只让这一下操作失败
 */
export function registerAntiBot(app: FastifyInstance, d: AntibotDeps): void {
  app.addHook('onClose', async () => d.whitelist.close());
  app.addHook('preHandler', async (req, reply) => {
    if (!req.session) return;
    // 按匹配到的路由判断，不看原始 url（和封禁名单一样，防 /%61pi/... 这种写法）
    const route = req.routeOptions.url ?? '';
    if (SKIP.some((p) => route.startsWith(p))) return;
    if (req.method === 'GET') {
      try {
        d.onRead?.(req);
      } catch (err) {
        req.log.warn({ err }, 'antibot onRead failed');
      }
      return;
    }
    if (req.method !== 'POST') return;
    const { accountId, shardId } = req.session.data;
    const settings = await d.settingsFor(shardId);
    const r = await judge({
      headers: req.headers,
      method: req.method,
      // 签名用原始路径：网页签的就是它发出去的路径
      url: req.url,
      bodyText: JSON.stringify(req.body ?? {}),
      signKey: await d.sessions.ensureSignKey(req.session.token),
      nowMs: d.now().getTime(),
      skewMs: settings.skewSec * 1000,
    });
    let verdict: Verdict = r.verdict;
    if (verdict === 'ok' && r.nonce !== null) {
      const fresh = await d.redis.set(`abn:${accountId}:${r.nonce}`, '1', 'EX', settings.skewSec * 2, 'NX');
      if (fresh !== 'OK') verdict = 'replay';
    }
    // 网页清掉缓存的密钥、下次重新取（stale：顺带按服务器时间重新校准时钟）
    if (verdict === 'missing' || verdict === 'bad' || verdict === 'stale')
      reply.header(AB_HEADERS.resign, '1');
    try {
      d.onJudged?.(req, { verdict, idle: r.idle, settings });
    } catch (err) {
      req.log.warn({ err }, 'antibot onJudged failed');
    }
    if (verdict === 'ok') return;
    if (d.env.ANTIBOT_FORCE_LOG || route.startsWith(ADMIN) || settings.mode === 'log') return;
    if (await d.whitelist.has(accountId)) return;
    throw new AppError(ErrorCode.CLIENT_UNVERIFIED, 403, { reason: verdict });
  });
}
