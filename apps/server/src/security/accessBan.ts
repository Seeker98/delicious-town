import { BlockList, isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { deviceIdOf } from '../core/deps';
import type { DB } from '../db/schema';
import { AppError } from '../http/errors';

/** 封禁名单多久重新读一次；后台改了名单当场 refresh，别的进程最多晚这么久 */
const REFRESH_MS = 30_000;

export interface AccessGuard {
  /** 命中返回封禁的类型（ip / device），没命中返回 null */
  blocked(ip: string, deviceId: string | null): Promise<'ip' | 'device' | null>;
  /** 重新读名单（后台改了名单以后） */
  refresh(): Promise<void>;
  close(): void;
}

/** 一条 IP 规则写进 BlockList：单个地址或 CIDR 段；写错的跳过（后台加的时候已经校验过） */
function addRule(list: BlockList, value: string): void {
  const [addr, bits] = value.split('/');
  const family = isIP(addr ?? '');
  if (family === 0) return;
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (bits === undefined) list.addAddress(addr!, type);
  else list.addSubnet(addr!, Number(bits), type);
}

/** 校验后台填的 IP 或 CIDR；合法时返回规范写法 */
export function normalizeIpRule(value: string): string | null {
  const v = value.trim();
  const [addr, bits, extra] = v.split('/');
  if (extra !== undefined) return null;
  const family = isIP(addr ?? '');
  if (family === 0) return null;
  if (bits === undefined) return addr!;
  const n = Number(bits);
  const max = family === 4 ? 32 : 128;
  if (!/^\d+$/.test(bits) || n < 8 || n > max) return null;
  return `${addr}/${n}`;
}

export function createAccessGuard(db: Kysely<DB>): AccessGuard {
  type Lists = { ips: BlockList; devices: Set<string> };
  let cache: Lists | null = null;
  let loading: Promise<Lists> | null = null;
  let timer: NodeJS.Timeout | null = null;

  async function load(): Promise<Lists> {
    const rows = await db.selectFrom('access_ban').select(['kind', 'value']).execute();
    const ips = new BlockList();
    const devices = new Set<string>();
    for (const r of rows) {
      if (r.kind === 'ip') addRule(ips, r.value);
      else devices.add(r.value);
    }
    return { ips, devices };
  }
  // 同时进来的请求、定时刷新共用一次读取
  const reload = (): Promise<Lists> =>
    (loading ??= load()
      .then((l) => (cache = l))
      .finally(() => (loading = null)));

  return {
    async blocked(ip, deviceId) {
      // 名单在后台定时刷新，请求只在第一次时等读取（不给每个请求多一条查询）
      if (!timer) {
        timer = setInterval(() => void reload().catch(() => undefined), REFRESH_MS);
        timer.unref();
      }
      const lists = cache ?? (await reload());
      const family = isIP(ip);
      if (family !== 0 && lists.ips.check(ip, family === 4 ? 'ipv4' : 'ipv6')) return 'ip';
      if (deviceId && lists.devices.has(deviceId)) return 'device';
      return null;
    },
    async refresh() {
      await reload();
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

/** 每个接口请求先查封禁名单（健康检查除外）：命中报 ACCESS_BANNED，登录、注册、已登录的请求都挡 */
export function registerAccessGuard(app: FastifyInstance, guard: AccessGuard): void {
  app.addHook('onClose', async () => guard.close());
  app.addHook('onRequest', async (req) => {
    // 按匹配到的路由判断，不看原始 url：/%61pi/... 解码后照样进 /api 的路由（代码审查 2026-10-19）
    if (!req.routeOptions.url?.startsWith('/api/')) return;
    const hit = await guard.blocked(req.clientIp, deviceIdOf(req));
    if (hit) throw new AppError(ErrorCode.ACCESS_BANNED, 403, { kind: hit });
  });
}
