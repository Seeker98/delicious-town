import type { ApiResponse } from '@dt/shared';
import { AB_HEADERS, ENV_BITS, canonical, hmacSign, sha256Hex } from '@dt/shared';
import { deviceId } from './device';

/**
 * 写请求签名（防脚本 2026-10-25）：密钥向服务器取一次缓存起来，顺便按服务器时间校准时钟；
 * 签名里带环境检查和“距离最近一次真人操作多久”。服务器默认只记录，打开拦截后签名不对的写请求会被拒
 */

/** 前端版本号：构建时注入（vite.config.ts 的 define） */
export const CLIENT_BUILD: string = __DT_BUILD__;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let cached: { key: string; offset: number } | null = null;
let pending: Promise<{ key: string; offset: number } | null> | null = null;
/** 取密钥时服务器说没登录：记住，换会话（resetSignKey）之前不再白跑 */
let noSession = false;
/** 最近一次真人操作的时间（毫秒）；从没有过是 null */
let lastHuman: number | null = null;

/** 清掉缓存的密钥：服务器回 x-dt-resign、或签名被拒时，下次重新取 */
export function resetSignKey(): void {
  cached = null;
  pending = null;
  noSession = false;
}

/** 只认浏览器标记为真人触发的点击、触摸、按键；脚本派发的事件 isTrusted 为假 */
export function installHumanTracker(target: EventTarget = window): void {
  const mark = (e: Event) => {
    if (e.isTrusted) lastHuman = Date.now();
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart'])
    target.addEventListener(type, mark, { capture: true, passive: true });
}

/** 距离最近一次真人操作的毫秒数；从没有过是 -1，最多一天 */
export function idleMs(now = Date.now()): number {
  return lastHuman === null ? -1 : Math.min(Math.max(0, now - lastHuman), 86_400_000);
}

/** 环境检查：被自动化工具控制、无头浏览器 */
export function envBits(nav: Navigator = navigator): number {
  let bits = 0;
  if (nav.webdriver) bits |= ENV_BITS.webdriver;
  if (/HeadlessChrome/.test(nav.userAgent ?? '')) bits |= ENV_BITS.headless;
  return bits;
}

async function fetchKey(fetchImpl: FetchLike, base: string): Promise<{ key: string; offset: number } | null> {
  try {
    const res = await fetchImpl(`${base}/api/v1/account/sign-key`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'x-device-id': deviceId(), [AB_HEADERS.build]: CLIENT_BUILD },
    });
    const body = (await res.json()) as ApiResponse<{ key: string; serverNow: string }>;
    if (!body.ok && body.code === 'UNAUTHORIZED') noSession = true;
    if (!body.ok || !body.data?.key) return null;
    const server = Date.parse(body.data.serverNow);
    return { key: body.data.key, offset: Number.isNaN(server) ? 0 : server - Date.now() };
  } catch {
    return null;
  }
}

/** 取（或复用）密钥；取不到（没登录、网络错误）返回 null，不缓存失败 */
async function signKey(fetchImpl: FetchLike, base: string) {
  if (cached) return cached;
  if (noSession) return null;
  pending ??= fetchKey(fetchImpl, base).then((k) => {
    pending = null;
    if (k) cached = k;
    return k;
  });
  return pending;
}

/** 一个写请求的签名请求头；取不到密钥时返回空对象（照常发，服务器只记录或拒绝） */
export async function signHeaders(
  fetchImpl: FetchLike,
  base: string,
  i: { method: 'POST'; path: string; bodyText: string; nonce: string },
): Promise<Record<string, string>> {
  const k = await signKey(fetchImpl, base);
  if (!k) return {};
  // 浏览器没有 WebCrypto（非 https 页面）时不签，照常发
  if (!globalThis.crypto?.subtle) return {};
  // 网页端签名出错（有缺陷的内嵌浏览器）也照常不签发出：服务器那边的总开关救不了网页端的故障
  try {
    const ts = Date.now() + k.offset;
    const env = envBits();
    const idle = idleMs();
    const sig = await hmacSign(
      k.key,
      canonical({
        ts,
        nonce: i.nonce,
        method: i.method,
        path: i.path,
        bodySha256: await sha256Hex(i.bodyText),
        build: CLIENT_BUILD,
        env,
        idle,
      }),
    );
    return {
      [AB_HEADERS.ts]: String(ts),
      [AB_HEADERS.env]: String(env),
      [AB_HEADERS.idle]: String(idle),
      [AB_HEADERS.sig]: sig,
    };
  } catch {
    return {};
  }
}
