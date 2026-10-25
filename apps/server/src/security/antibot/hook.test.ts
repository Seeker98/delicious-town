import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AB_HEADERS, canonical, hmacSign, sha256Hex } from '@dt/shared';
import {
  call,
  cookieOf,
  createTestApp,
  registerUser,
  testEnvWith,
  type TestContext,
} from '../../../test/helpers';
import { ok } from '../../http/reply';
import type { AntibotMode } from './hook';
import { flushRhythm } from './rhythm';

let mode: AntibotMode = 'log';
const settings = async () => ({ mode, skewSec: 120, idleMs: 60000 });
const routes = (app: Parameters<NonNullable<Parameters<typeof createTestApp>[1]>>[0]) => {
  app.post('/t/act', async () => ok({ done: true }));
  app.post('/api/v1/admin/t/act', async () => ok({ done: true }));
};

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({ antibotFor: settings }, routes);
});
afterAll(() => ctx.close());

let seq = 0;
const nonce = () => `n${Date.now().toString(36)}${(++seq).toString(36)}xx`;

/** 按协议签一个写请求的请求头；over 改签名里的字段 */
async function signed(
  cookie: string,
  path: string,
  body: unknown,
  over: { key?: string; env?: number; nonce?: string } = {},
): Promise<Record<string, string>> {
  const key = over.key ?? (await call(ctx.app, 'GET', '/api/v1/account/sign-key', { cookie })).json.data.key;
  const f = {
    ts: Date.now(),
    nonce: over.nonce ?? nonce(),
    method: 'POST',
    path,
    bodySha256: await sha256Hex(JSON.stringify(body ?? {})),
    build: 'test1',
    env: over.env ?? 0,
    idle: 800,
  };
  return {
    'idempotency-key': f.nonce,
    [AB_HEADERS.ts]: String(f.ts),
    [AB_HEADERS.env]: String(f.env),
    [AB_HEADERS.idle]: String(f.idle),
    [AB_HEADERS.build]: f.build,
    [AB_HEADERS.sig]: await hmacSign(key, canonical(f)),
  };
}

const post = (cookie: string, path: string, headers: Record<string, string> = {}, body: unknown = { a: 1 }) =>
  call(ctx.app, 'POST', path, { cookie, headers, body });

describe('写请求签名钩子（防脚本 2026-10-25）', () => {
  it('只记录模式：不签名照常执行', async () => {
    mode = 'log';
    const u = await registerUser(ctx.app);
    expect((await post(u.cookie, '/t/act')).status).toBe(200);
  });

  it('拦截模式：什么都不带 → 403 no_build', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const r = await post(u.cookie, '/t/act');
    expect(r.status).toBe(403);
    expect(r.json.params.reason).toBe('no_build');
  });

  it('拦截模式：带版本号但不签名 → 403 missing，并让网页重取密钥', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const r = await post(u.cookie, '/t/act', { [AB_HEADERS.build]: 'test1' });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('CLIENT_UNVERIFIED');
    expect(r.json.params.reason).toBe('missing');
    expect(r.res.headers[AB_HEADERS.resign]).toBe('1');
  });

  it('拦截模式：签名正确 → 200；同一个 idempotency-key 原样重发拿缓存响应，不算重放', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const h = await signed(u.cookie, '/t/act', { a: 1 });
    expect((await post(u.cookie, '/t/act', h)).status).toBe(200);
    const again = await post(u.cookie, '/t/act', h);
    expect(again.status).toBe(200);
    expect(again.res.headers['idempotent-replay']).toBe('true');
  });

  it('拦截模式：换了随机数但不重签 → 403 bad', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const h = await signed(u.cookie, '/t/act', { a: 1 });
    const r = await post(u.cookie, '/t/act', { ...h, 'idempotency-key': nonce() });
    expect(r.status).toBe(403);
    expect(r.json.params.reason).toBe('bad');
  });

  it('拦截模式：重新登录后用旧密钥签 → 403 bad，并让网页重取密钥', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const oldKey = (await call(ctx.app, 'GET', '/api/v1/account/sign-key', { cookie: u.cookie })).json.data
      .key;
    const login = await call(ctx.app, 'POST', '/api/v1/account/login', {
      body: { username: u.username, password: 'secret123' },
    });
    const cookie = cookieOf(login.res);
    const r = await post(cookie, '/t/act', await signed(cookie, '/t/act', { a: 1 }, { key: oldKey }));
    expect(r.status).toBe(403);
    expect(r.json.params.reason).toBe('bad');
    expect(r.res.headers[AB_HEADERS.resign]).toBe('1');
  });

  it('时间戳过期也让网页重取密钥（顺带重新校准时钟）', async () => {
    mode = 'log';
    const u = await registerUser(ctx.app);
    const h = await signed(u.cookie, '/t/act', { a: 1 });
    h[AB_HEADERS.ts] = String(Date.now() - 10 * 60_000);
    const r = await post(u.cookie, '/t/act', h);
    expect(r.status).toBe(200);
    expect(r.res.headers[AB_HEADERS.resign]).toBe('1');
  });

  it('拦截模式：浏览器被自动化工具控制 → 403 automation', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const r = await post(u.cookie, '/t/act', await signed(u.cookie, '/t/act', { a: 1 }, { env: 1 }));
    expect(r.status).toBe(403);
    expect(r.json.params.reason).toBe('automation');
  });

  it('拦截模式：随机数已经用过 → 403 replay', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    const n = nonce();
    await ctx.deps.redis.set(`abn:${u.accountId}:${n}`, '1', 'EX', 60);
    const r = await post(u.cookie, '/t/act', await signed(u.cookie, '/t/act', { a: 1 }, { nonce: n }));
    expect(r.status).toBe(403);
    expect(r.json.params.reason).toBe('replay');
  });

  it('拦截模式下照常：后台接口、注册、白名单账号', async () => {
    mode = 'enforce';
    const u = await registerUser(ctx.app);
    expect((await post(u.cookie, '/api/v1/admin/t/act')).status).toBe(200);
    expect((await registerUser(ctx.app)).cookie).toMatch(/^dt_sid=/);
    const w = await registerUser(ctx.app);
    await ctx.deps.db
      .insertInto('antibot_whitelist')
      .values({ account_id: w.accountId, note: 't' })
      .execute();
    await ctx.deps.antibotWhitelist!.refresh();
    expect((await post(w.cookie, '/t/act')).status).toBe(200);
  });

  it('环境变量总开关打开时：拦截模式也只记录', async () => {
    mode = 'enforce';
    const forced = await createTestApp(
      { env: testEnvWith({ ANTIBOT_FORCE_LOG: true }), antibotFor: settings },
      routes,
    );
    try {
      const u = await registerUser(forced.app);
      expect((await call(forced.app, 'POST', '/t/act', { cookie: u.cookie, body: {} })).status).toBe(200);
    } finally {
      await forced.close();
    }
  });

  it('读写请求都进节奏统计（汇总后能查到）', async () => {
    mode = 'log';
    const u = await registerUser(ctx.app);
    await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    await post(u.cookie, '/t/act', await signed(u.cookie, '/t/act', { a: 1 }));
    await new Promise((r) => setTimeout(r, 50));
    await flushRhythm(ctx.deps.db, ctx.deps.redis, new Date(Date.now() + 3_600_000));
    const r = await ctx.deps.db
      .selectFrom('play_rhythm')
      .select(['gets', 'posts', 'verdicts'])
      .where('account_id', '=', u.accountId)
      .executeTakeFirstOrThrow();
    expect(r.gets).toBeGreaterThanOrEqual(2);
    expect(r.posts).toBe(1);
    expect(r.verdicts).toEqual({ ok: 1 });
  });

  it('跨域时让网页读得到 x-dt-resign 响应头', async () => {
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', '/t/act', {
      cookie: u.cookie,
      body: {},
      headers: { origin: ctx.deps.env.WEB_ORIGIN },
    });
    expect(String(r.res.headers['access-control-expose-headers'])).toContain(AB_HEADERS.resign);
  });
});
