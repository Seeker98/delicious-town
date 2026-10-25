/**
 * 游戏接口防脚本的请求签名（设计 2026-10-25）：网页和服务端共用这一份。
 * 只用 globalThis.crypto（浏览器和 Node 都有），不依赖 node:crypto。
 */

/** 签名相关的请求头、响应头 */
export const AB_HEADERS = {
  ts: 'x-dt-ts',
  sig: 'x-dt-sig',
  env: 'x-dt-env',
  idle: 'x-dt-idle',
  build: 'x-dt-client',
  /** 服务器回这个头：网页清掉缓存的签名密钥，下次重新取 */
  resign: 'x-dt-resign',
  /** 被要求人机验证的账号（PR②）：Cloudflare Turnstile 令牌 */
  captcha: 'x-dt-captcha',
} as const;

/** 环境检查的位标记 */
export const ENV_BITS = { webdriver: 1, headless: 2 } as const;
/** 拦截模式下这些位为真就直接拒绝；其余位只记录 */
export const ENV_HARD_MASK = ENV_BITS.webdriver | ENV_BITS.headless;

/** 前端版本号的格式 */
export const BUILD_RE = /^[A-Za-z0-9._-]{3,64}$/;

export interface SignFields {
  /** 按服务器时间校准过的毫秒数 */
  ts: number;
  /** 一次性随机数（就是写请求的 idempotency-key） */
  nonce: string;
  method: string;
  /** 不含域名，含查询串 */
  path: string;
  bodySha256: string;
  build: string;
  env: number;
  /** 距离最近一次真人操作的毫秒数，没有过是 -1 */
  idle: number;
}

/** 签名用的拼串：字段按固定顺序用换行连接，方法转大写 */
export function canonical(f: SignFields): string {
  return [f.ts, f.nonce, f.method.toUpperCase(), f.path, f.bodySha256, f.build, f.env, f.idle].join('\n');
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 返回类型写明 ArrayBuffer：网页的 DOM 类型里 importKey 不收 SharedArrayBuffer 背后的数组 */
function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** HMAC-SHA256，结果是 base64url（无填充） */
export async function hmacSign(keyB64url: string, text: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    fromB64url(keyB64url),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toB64url(new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(text))));
}

/** 新的签名密钥：32 字节随机数，base64url */
export function newSignKey(): string {
  return toB64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}
