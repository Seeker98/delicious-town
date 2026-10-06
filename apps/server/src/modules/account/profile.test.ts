import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, cookieOf, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { seededRng } from '@dt/shared';
import { playerIn } from '../../../test/players';
import { ensureNpc } from '../npc/npc';

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

describe('backlog 账号：改密码', () => {
  const accountOf = async (cookie: string) =>
    (await call(ctx.app, 'GET', `${A}/me`, { cookie })).json.data.accountId as number;

  it('审计记下 IP 和设备号', async () => {
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const id = await accountOf(p.cookie);
    const r = await call(ctx.app, 'POST', `${A}/change-password`, {
      cookie: p.cookie,
      body: { oldPassword: 'secret123', newPassword: 'newpass123' },
      headers: { 'x-device-id': 'dev-abcdef0123456789' },
      ip: '10.1.2.3',
    });
    expect(r.status).toBe(200);
    const a = await ctx.deps.db
      .selectFrom('audit_log')
      .select(['ip', 'detail'])
      .where('action', '=', 'account.password')
      .where('target', '=', `account:${id}`)
      .executeTakeFirstOrThrow();
    expect(a.ip).toBe('10.1.2.3');
    expect(a.detail).toMatchObject({ deviceId: 'dev-abcdef0123456789' });
  });

  it('改密码后，之前发出的重置密码链接作废', async () => {
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const id = await accountOf(p.cookie);
    const { email } = await ctx.deps.db
      .selectFrom('account')
      .select('email')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    await call(ctx.app, 'POST', `${A}/forgot-password`, { body: { email, captchaToken: 't' } });
    const token = /token=([\w-]+)/.exec(ctx.mailer.lastTo(email)!.text)![1]!;
    expect((await change(p.cookie, 'secret123', 'newpass123')).status).toBe(200);
    const reset = await call(ctx.app, 'POST', `${A}/reset-password`, {
      body: { token, password: 'hijack123' },
    });
    expect(reset.json.code).toBe('TOKEN_INVALID');
  });

  it('密码已改、换新会话失败：不报"修改失败"，返回 relogin 让前端提示重新登录', async () => {
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const username = await usernameOf(p.cookie);
    const spy = vi.spyOn(ctx.deps.sessions, 'create').mockRejectedValueOnce(new Error('redis down'));
    try {
      const r = await change(p.cookie, 'secret123', 'newpass123');
      expect(r.status).toBe(200);
      expect(r.json.data).toEqual({ relogin: true });
    } finally {
      spy.mockRestore();
    }
    expect((await login(username, 'newpass123')).status).toBe(200);
  });
});

describe('backlog 指引、我的账号：接口层的未登录、未开店', () => {
  it('未登录：/guide/codes 和 /account/profile 都是 401', async () => {
    expect((await call(ctx.app, 'GET', '/api/v1/guide/codes')).status).toBe(401);
    expect((await call(ctx.app, 'GET', `${A}/profile`)).status).toBe(401);
  });

  it('登录了但没选区服：新手码报 NO_SHARD_SELECTED；我的账号照常，店列表为空', async () => {
    const u = await registerUser(ctx.app);
    const codes = await call(ctx.app, 'GET', '/api/v1/guide/codes', { cookie: u.cookie });
    expect(codes.json.code).toBe('NO_SHARD_SELECTED');
    const prof = await call(ctx.app, 'GET', `${A}/profile`, { cookie: u.cookie });
    expect(prof.status).toBe(200);
    expect(prof.json.data.rests).toEqual([]);
  });

  it('选了区服但还没开店：新手码报 RESTAURANT_NOT_FOUND', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await registerUser(ctx.app);
    await call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
    const codes = await call(ctx.app, 'GET', '/api/v1/guide/codes', { cookie: u.cookie });
    expect(codes.json.code).toBe('RESTAURANT_NOT_FOUND');
  });
});

describe('me 带本区服蟹老板餐厅的编号（backlog：网页按语言换 NPC 店名）', () => {
  it('区服有 NPC 店时给它的编号；没选区服、区服没有 NPC 时是 null', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const me = async (cookie: string) => (await call(ctx.app, 'GET', `${A}/me`, { cookie })).json.data;
    expect((await me(p.cookie)).npcRestId).toBeNull();
    const config = ctx.deps.config;
    const npc = await ensureNpc(ctx.deps.db, config, config.tuning.friend.npc, shardId, seededRng(1));
    expect((await me(p.cookie)).npcRestId).toBe(npc.id);
    const u = await registerUser(ctx.app);
    expect((await me(u.cookie)).npcRestId).toBeNull();
  });
});
