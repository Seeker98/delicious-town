import { timingSafeEqual } from 'node:crypto';
import { AB_HEADERS, BUILD_RE, ENV_HARD_MASK, canonical, hmacSign, sha256Hex } from '@dt/shared';

/** 一个写请求的签名校验结论（防脚本 2026-10-25）；replay 由钩子查 Redis 得出 */
export type Verdict = 'ok' | 'missing' | 'stale' | 'replay' | 'bad' | 'automation' | 'no_build';

export interface JudgeInput {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  /** 原始请求路径（含查询串），和网页签名时用的一样 */
  url: string;
  /** JSON.stringify(req.body ?? {})：网页发出去的就是这个串 */
  bodyText: string;
  /** 会话的签名密钥；会话没有时为空 */
  signKey: string | null;
  nowMs: number;
  skewMs: number;
}

export interface Judgement {
  verdict: Exclude<Verdict, 'replay'>;
  nonce: string | null;
  idle: number | null;
  env: number | null;
  build: string | null;
}

const one = (v: string | string[] | undefined): string | null =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null;

const int = (v: string | null): number | null => (v !== null && /^-?\d{1,16}$/.test(v) ? Number(v) : null);

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * 判定顺序：没版本号 → 缺签名字段 → 时间超窗 → 签名不对 → 自动化环境 → 通过。
 * 只看请求本身，不查 Redis
 */
export async function judge(i: JudgeInput): Promise<Judgement> {
  const h = i.headers;
  const build = one(h[AB_HEADERS.build]);
  const nonce = one(h['idempotency-key']);
  const idle = int(one(h[AB_HEADERS.idle]));
  const env = int(one(h[AB_HEADERS.env]));
  const base = { nonce, idle, env, build };
  if (build === null || !BUILD_RE.test(build)) return { verdict: 'no_build', ...base };
  const ts = int(one(h[AB_HEADERS.ts]));
  const sig = one(h[AB_HEADERS.sig]);
  if (ts === null || sig === null || nonce === null || idle === null || env === null)
    return { verdict: 'missing', ...base };
  if (Math.abs(i.nowMs - ts) > i.skewMs) return { verdict: 'stale', ...base };
  if (!i.signKey) return { verdict: 'bad', ...base };
  const expected = await hmacSign(
    i.signKey,
    canonical({
      ts,
      nonce,
      method: i.method,
      path: i.url,
      bodySha256: await sha256Hex(i.bodyText),
      build,
      env,
      idle,
    }),
  );
  if (!sameText(expected, sig)) return { verdict: 'bad', ...base };
  if ((env & ENV_HARD_MASK) !== 0) return { verdict: 'automation', ...base };
  return { verdict: 'ok', ...base };
}
