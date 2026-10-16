import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const traces = (accountId: number, deviceId: string) =>
  ctx.deps.db
    .selectFrom('login_trace')
    .select(['ip', 'device_id'])
    .where('account_id', '=', accountId)
    .where('device_id', '=', deviceId)
    .execute();
/** 写记录不等请求结束：等一下再查 */
const settle = () => new Promise((r) => setTimeout(r, 200));

describe('游玩时也记登录记录（收购改版 2026-10-16）', () => {
  it('带会话的请求记下这次的 IP 和设备；同一账号、IP、设备一小时内只写一次；没登录的不记', async () => {
    const u = await registerUser(ctx.app);
    const dev = `dev-play-${Date.now()}`;
    const me = () =>
      call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie, headers: { 'x-device-id': dev } });
    expect((await me()).status).toBe(200);
    await settle();
    expect(await traces(u.accountId, dev)).toHaveLength(1);
    // 一小时内再来：Redis 占着位，删掉的那行不会被补回来
    await ctx.deps.db.deleteFrom('login_trace').where('device_id', '=', dev).execute();
    await me();
    await settle();
    expect(await traces(u.accountId, dev)).toHaveLength(0);
    // 换一台设备就是新的一行
    const dev2 = `${dev}-b`;
    await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie, headers: { 'x-device-id': dev2 } });
    await settle();
    expect(await traces(u.accountId, dev2)).toHaveLength(1);
    // 没带会话：不记
    const anon = `${dev}-anon`;
    await call(ctx.app, 'GET', '/api/v1/account/me', { headers: { 'x-device-id': anon } });
    await settle();
    expect(
      await ctx.deps.db
        .selectFrom('login_trace')
        .select('account_id')
        .where('device_id', '=', anon)
        .execute(),
    ).toEqual([]);
  });
});
