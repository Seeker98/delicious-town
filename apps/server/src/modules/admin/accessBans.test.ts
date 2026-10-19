import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { uniqueName } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { normalizeIpRule } from '../../security/accessBan';

let ctx: TestContext;
let admin: { cookie: string; accountId: number };
let mod: { cookie: string; accountId: number };
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());
const A = '/api/v1/admin';
const post = (cookie: string, path: string, body: unknown) =>
  call(ctx.app, 'POST', `${A}${path}`, { cookie, body });
/** 测试共用一个数据库：只用文档专用的 IP 段（203.0.113.0/24），别的测试都从 127.0.0.1 来 */
let n = 0;
const testIp = () => `203.0.113.${(++n % 250) + 1}`;
const me = (cookie: string, ip?: string, device?: string) =>
  call(ctx.app, 'GET', '/api/v1/account/me', {
    cookie,
    ip,
    headers: device ? { 'x-device-id': device } : {},
  });

describe('IP、设备封禁（2026-10-16 小号刷一番赏）', () => {
  it('规则写法：单个地址、CIDR 段；写错、段太大都不认', () => {
    expect(normalizeIpRule(' 38.28.221.33 ')).toBe('38.28.221.33');
    expect(normalizeIpRule('38.28.0.0/16')).toBe('38.28.0.0/16');
    expect(normalizeIpRule('2001:db8::/64')).toBe('2001:db8::/64');
    expect(normalizeIpRule('38.28.0.0/4')).toBeNull();
    expect(normalizeIpRule('38.28.0.0/33')).toBeNull();
    expect(normalizeIpRule('not-an-ip')).toBeNull();
    expect(normalizeIpRule('1.2.3.4/8/1')).toBeNull();
  });

  it('封 IP：这个 IP 来的请求（已登录的、注册、登录）都报 ACCESS_BANNED；别的 IP 照常；解封后恢复', async () => {
    const ip = testIp();
    const u = await registerUser(ctx.app, { ip });
    expect((await me(u.cookie, ip)).status).toBe(200);
    const r = await post(admin.cookie, '/access-bans', { kind: 'ip', value: ip, reason: '刷号' });
    expect(r.status).toBe(200);
    expect(r.json.data.ban).toMatchObject({ kind: 'ip', value: ip, reason: '刷号', accounts: 1 });
    const blocked = await me(u.cookie, ip);
    expect(blocked.status).toBe(403);
    expect(blocked.json.code).toBe('ACCESS_BANNED');
    // 路径用百分号编码也挡（代码审查 2026-10-19：原来只看原始 url，/%61pi/... 能绕过）
    for (const path of ['/%61pi/v1/account/me', '/ap%69/v1/account/me'])
      expect((await call(ctx.app, 'GET', path, { cookie: u.cookie, ip })).json.code).toBe('ACCESS_BANNED');
    const reg = await call(ctx.app, 'POST', '/api/v1/account/register', {
      body: {
        username: uniqueName('u'),
        password: 'secret123',
        email: `${uniqueName('m')}@test.local`,
        captchaToken: 't',
      },
      ip,
    });
    expect(reg.json.code).toBe('ACCESS_BANNED');
    expect((await me(u.cookie, testIp())).status).toBe(200);
    const list = (await call(ctx.app, 'GET', `${A}/access-bans`, { cookie: mod.cookie })).json.data;
    const row = list.find((x: { value: string }) => x.value === ip);
    expect(row).toMatchObject({ kind: 'ip', reason: '刷号' });
    expect((await post(admin.cookie, `/access-bans/${row.id}/remove`, {})).json.data).toEqual({
      removed: true,
    });
    expect((await me(u.cookie, ip)).status).toBe(200);
  });

  it('封 IP 段并一并封账号：最近 30 天用这一段登录过的玩家永久封号、踢下线；管理员不封', async () => {
    const a = await registerUser(ctx.app, { ip: '203.0.113.201' });
    const b = await registerUser(ctx.app, { ip: '203.0.113.202' });
    const r = await post(admin.cookie, '/access-bans', {
      kind: 'ip',
      value: '203.0.113.200/29',
      reason: '同一段批量注册',
      banAccounts: true,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.bannedAccounts).toEqual(expect.arrayContaining([a.accountId, b.accountId]));
    const rows = await ctx.deps.db
      .selectFrom('account')
      .select(['id', 'banned_at', 'banned_until', 'ban_reason'])
      .where('id', 'in', [a.accountId, b.accountId])
      .execute();
    expect(
      rows.every((x) => x.banned_at !== null && x.banned_until === null && x.ban_reason === '同一段批量注册'),
    ).toBe(true);
    // 换个 IP 也登不进来：会话已经清掉
    expect((await me(a.cookie, testIp())).status).toBe(401);
    await post(admin.cookie, `/access-bans/${r.json.data.ban.id}/remove`, {});
  });

  it('封设备：带这个设备号的请求都挡；设备号写错报 ban_value', async () => {
    const dev = `dev-${uniqueName('x')}`.slice(0, 40);
    const u = await registerUser(ctx.app, { ip: testIp() });
    const r = await post(admin.cookie, '/access-bans', { kind: 'device', value: dev, reason: '刷号' });
    expect(r.status).toBe(200);
    expect((await me(u.cookie, testIp(), dev)).json.code).toBe('ACCESS_BANNED');
    expect((await me(u.cookie, testIp(), 'dev-other-123456')).status).toBe(200);
    const bad = await post(admin.cookie, '/access-bans', { kind: 'device', value: 'a b', reason: 'x' });
    expect(bad.json.params).toMatchObject({ reason: 'ban_value' });
    await post(admin.cookie, `/access-bans/${r.json.data.ban.id}/remove`, {});
  });

  it('不能把自己当前的 IP、设备封进去；协管只能看、不能加', async () => {
    const self = await post(admin.cookie, '/access-bans', { kind: 'ip', value: '127.0.0.0/8', reason: 'x' });
    expect(self.json.params).toMatchObject({ reason: 'ban_self' });
    const rows = await ctx.deps.db
      .selectFrom('access_ban')
      .select('id')
      .where('value', '=', '127.0.0.0/8')
      .execute();
    expect(rows).toEqual([]);
    // 自己这台设备也封不了
    const dev = `dev-${uniqueName('s')}`.slice(0, 40);
    const selfDev = await call(ctx.app, 'POST', `${A}/access-bans`, {
      cookie: admin.cookie,
      body: { kind: 'device', value: dev, reason: 'x' },
      headers: { 'x-device-id': dev },
    });
    expect(selfDev.json.params).toMatchObject({ reason: 'ban_self' });
    // 后台对权限不够的请求一律报 404
    expect(
      (await post(mod.cookie, '/access-bans', { kind: 'ip', value: testIp(), reason: 'x' })).status,
    ).toBe(404);
  });
});
