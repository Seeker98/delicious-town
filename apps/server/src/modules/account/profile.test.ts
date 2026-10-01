import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, cookieOf, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const A = '/api/v1/account';
const login = (username: string, password: string) =>
  call(ctx.app, 'POST', `${A}/login`, { body: { username, password } });
const usernameOf = async (cookie: string) =>
  (await call(ctx.app, 'GET', `${A}/me`, { cookie })).json.data.username as string;
const change = (cookie: string, oldPassword: string, newPassword: string) =>
  call(ctx.app, 'POST', `${A}/change-password`, { cookie, body: { oldPassword, newPassword } });

describe('我的账号（问题记录 178，设计 §6.1）', () => {
  it('profile：用户名、注册时间、各区服的店', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const r = await call(ctx.app, 'GET', `${A}/profile`, { cookie: p.cookie });
    expect(r.status).toBe(200);
    expect(r.json.data.username).toBe(await usernameOf(p.cookie));
    expect(r.json.data.createdAt).toMatch(/^\d{4}-/);
    expect(r.json.data.rests).toEqual([
      expect.objectContaining({ shardId, restId: p.restId, shardOpen: true, level: expect.any(Number) }),
    ]);
  });

  it('改密码：旧密码错报 wrong_password，密码不变；新旧相同报 same_password', async () => {
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const username = await usernameOf(p.cookie);
    const bad = await change(p.cookie, 'nope123', 'newpass123');
    expect(bad.status).toBe(400);
    expect(bad.json.params.reason).toBe('wrong_password');
    const relogin = await login(username, 'secret123');
    expect(relogin.status).toBe(200);
    const same = await change(cookieOf(relogin.res), 'secret123', 'secret123');
    expect(same.json.params.reason).toBe('same_password');
  });

  it('改密码成功：新密码能登录；别的会话失效；本机新 Cookie 保留区服选择（Review Focus 2）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const username = await usernameOf(p.cookie);
    const r = await change(p.cookie, 'secret123', 'newpass123');
    expect(r.status).toBe(200);
    const fresh = cookieOf(r.res);
    const me = await call(ctx.app, 'GET', `${A}/me`, { cookie: fresh });
    expect(me.json.data).toMatchObject({ shardId, restaurantId: p.restId });
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: p.cookie })).status).toBe(401);
    expect((await login(username, 'secret123')).status).toBe(401);
    expect((await login(username, 'newpass123')).status).toBe(200);
  });
});
