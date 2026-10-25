import { describe, expect, it } from 'vitest';
import { AB_HEADERS, canonical, hmacSign, newSignKey, sha256Hex } from '@dt/shared';
import { judge } from './verify';

const KEY = newSignKey();
const NOW = 1_800_000_000_000;
const SKEW = 120_000;

/** 现场按协议签一个合法请求，再按 patch 改字段 */
async function request(
  patch: {
    ts?: number;
    env?: number;
    build?: string | null;
    body?: string;
    signBody?: string;
    sig?: string | null;
    serverKey?: string | null;
  } = {},
) {
  const ts = patch.ts ?? NOW;
  const env = patch.env ?? 0;
  const build = patch.build === undefined ? 'b1234' : patch.build;
  const body = patch.body ?? '{"a":1}';
  const fields = {
    ts,
    nonce: 'nonce-12345678',
    method: 'POST',
    path: '/api/v1/x?a=1',
    bodySha256: await sha256Hex(patch.signBody ?? body),
    build: build ?? '',
    env,
    idle: 1500,
  };
  const sig = patch.sig === undefined ? await hmacSign(KEY, canonical(fields)) : patch.sig;
  const headers: Record<string, string> = {
    'idempotency-key': fields.nonce,
    [AB_HEADERS.ts]: String(ts),
    [AB_HEADERS.env]: String(env),
    [AB_HEADERS.idle]: '1500',
  };
  if (build !== null) headers[AB_HEADERS.build] = build;
  if (sig !== null) headers[AB_HEADERS.sig] = sig;
  return judge({
    headers,
    method: 'POST',
    url: '/api/v1/x?a=1',
    bodyText: body,
    signKey: patch.serverKey === undefined ? KEY : patch.serverKey,
    nowMs: NOW,
    skewMs: SKEW,
  });
}

describe('写请求签名判定', () => {
  it('合法请求 → ok，带回随机数、空闲时间、环境位、版本号', async () => {
    expect(await request()).toEqual({ verdict: 'ok', nonce: 'nonce-12345678', idle: 1500, env: 0, build: 'b1234' });
  });

  it('没版本号或版本号格式不对 → no_build', async () => {
    expect((await request({ build: null })).verdict).toBe('no_build');
    expect((await request({ build: 'a b' })).verdict).toBe('no_build');
  });

  it('没签名 → missing', async () => {
    expect((await request({ sig: null })).verdict).toBe('missing');
  });

  it('时间差超过窗口 → stale，窗口边上照常', async () => {
    expect((await request({ ts: NOW - SKEW - 1 })).verdict).toBe('stale');
    expect((await request({ ts: NOW + SKEW })).verdict).toBe('ok');
  });

  it('请求体改了一个字节 → bad', async () => {
    expect((await request({ body: '{"a":2}', signBody: '{"a":1}' })).verdict).toBe('bad');
  });

  it('服务器这边会话没有密钥 → bad', async () => {
    expect((await request({ serverKey: null })).verdict).toBe('bad');
  });

  it('签名正确但浏览器被自动化工具控制 → automation；只有非硬性环境位 → ok', async () => {
    expect((await request({ env: 1 })).verdict).toBe('automation');
    expect((await request({ env: 2 })).verdict).toBe('automation');
    expect((await request({ env: 4 })).verdict).toBe('ok');
  });
});
