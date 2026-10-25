import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AB_HEADERS } from '@dt/shared';
import { testDb } from '../../../test/db';
import { call, createTestApp, registerUser, testEnvWith, type TestContext } from '../../../test/helpers';
import { ok } from '../../http/reply';
import { createChallengeList } from './challenge';
import type { AntibotMode } from './hook';

let mode: AntibotMode = 'log';
const settings = async () => ({ mode, skewSec: 120, idleMs: 60000, captchaEveryMin: 60 });
/** 假的 Turnstile：ok 通过、no 不通过、throw 抛错 */
let captcha: 'ok' | 'no' | 'throw' = 'ok';
const fakeCaptcha = {
  verify: async () => {
    if (captcha === 'throw') throw new Error('turnstile down');
    return captcha === 'ok';
  },
};
const routes = (app: Parameters<NonNullable<Parameters<typeof createTestApp>[1]>>[0]) => {
  app.post('/t/act', async () => ok({ done: true }));
  app.post('/api/v1/admin/t/act', async () => ok({ done: true }));
};

const db = testDb();
const challenges = createChallengeList(db);
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp(
    { antibotFor: settings, captcha: fakeCaptcha, antibotChallenges: challenges },
    routes,
  );
});
afterAll(async () => {
  await ctx.close();
  challenges.close();
  await db.destroy();
});

/** 注册一个号并放进人机验证名单（一小时后到期） */
async function challenged(app = ctx.app) {
  const u = await registerUser(app);
  await db
    .insertInto('antibot_challenge')
    .values({ account_id: u.accountId, until: new Date(Date.now() + 3_600_000) })
    .execute();
  await challenges.refresh();
  return u;
}
const post = (cookie: string, path: string, headers: Record<string, string> = {}, app = ctx.app) =>
  call(app, 'POST', path, { cookie, headers, body: {} });

describe('可疑号写请求要过人机验证（防脚本 PR② 2026-10-25）', () => {
  it('名单里的号不带令牌 → 403 missing；只记录模式下也一样', async () => {
    for (const m of ['log', 'enforce'] as const) {
      mode = m;
      const u = await challenged();
      const r = await post(u.cookie, '/t/act');
      expect(r.status).toBe(403);
      expect(r.json.code).toBe('CAPTCHA_REQUIRED');
      expect(r.json.params.reason).toBe('missing');
    }
  });

  it('带令牌通过后，一段时间内不带令牌也放行', async () => {
    mode = 'log';
    captcha = 'ok';
    const u = await challenged();
    expect((await post(u.cookie, '/t/act', { [AB_HEADERS.captcha]: 'tok' })).status).toBe(200);
    expect((await post(u.cookie, '/t/act')).status).toBe(200);
  });

  it('令牌不通过或 Turnstile 出错 → 403 failed，不是 500', async () => {
    mode = 'log';
    const u = await challenged();
    captcha = 'no';
    const a = await post(u.cookie, '/t/act', { [AB_HEADERS.captcha]: 'tok' });
    expect(a.status).toBe(403);
    expect(a.json.params.reason).toBe('failed');
    captcha = 'throw';
    const b = await post(u.cookie, '/t/act', { [AB_HEADERS.captcha]: 'tok' });
    expect(b.status).toBe(403);
    expect(b.json.params.reason).toBe('failed');
    captcha = 'ok';
  });

  it('名单里的号注销、用后台照常；不在名单里的号不要求', async () => {
    mode = 'log';
    const u = await challenged();
    expect((await post(u.cookie, '/api/v1/admin/t/act')).status).toBe(200);
    expect((await post(u.cookie, '/api/v1/account/logout')).status).toBe(200);
    const plain = await registerUser(ctx.app);
    expect((await post(plain.cookie, '/t/act')).status).toBe(200);
  });

  it('白名单的号、环境变量总开关打开时：不要求', async () => {
    mode = 'log';
    const w = await challenged();
    await db.insertInto('antibot_whitelist').values({ account_id: w.accountId }).execute();
    await ctx.deps.antibotWhitelist!.refresh();
    expect((await post(w.cookie, '/t/act')).status).toBe(200);
    const forced = await createTestApp(
      { env: testEnvWith({ ANTIBOT_FORCE_LOG: true }), antibotFor: settings, antibotChallenges: challenges },
      routes,
    );
    try {
      const u = await challenged(forced.app);
      expect((await post(u.cookie, '/t/act', {}, forced.app)).status).toBe(200);
    } finally {
      await forced.close();
    }
  });
});
