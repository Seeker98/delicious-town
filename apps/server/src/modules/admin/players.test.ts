import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { gid } from '../../../test/items';

let ctx: TestContext;
let admin: { cookie: string; accountId: number };
let mod: { cookie: string; accountId: number };
let shardId: number;
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
  shardId = await createShard(ctx.deps.db);
});
afterAll(() => ctx.close());

const A = '/api/v1/admin';
const get = (cookie: string, path: string) => call(ctx.app, 'GET', `${A}${path}`, { cookie });
const post = (cookie: string, path: string, body: unknown) =>
  call(ctx.app, 'POST', `${A}${path}`, { cookie, body });

async function playerWithShop(name: string) {
  const u = await registerUser(ctx.app);
  const restId = await createRestaurantFull(ctx.deps.db, shardId, u.accountId, { patch: { name } });
  return { ...u, restId };
}

describe('玩家查询', () => {
  it('按账号 id、用户名（不分大小写）、邮箱、店名片段搜索', async () => {
    const shop = `搜索${Date.now() % 1_000_000}`;
    const p = await playerWithShop(shop);
    const ids = async (q: string) =>
      (await get(mod.cookie, `/players?q=${encodeURIComponent(q)}`)).json.data.map(
        (x: { accountId: number }) => x.accountId,
      );
    expect(await ids(String(p.accountId))).toEqual([p.accountId]);
    expect(await ids(p.username.toUpperCase())).toContain(p.accountId);
    expect(await ids(p.email.split('@')[0]!)).toContain(p.accountId);
    expect(await ids(shop.slice(1))).toContain(p.accountId);
    const hit = (await get(mod.cookie, `/players?q=${p.accountId}`)).json.data[0];
    expect(hit.restaurants[0]).toMatchObject({ id: p.restId, shardId, name: shop });
  });

  it('输入里的 % 和 _ 按字面匹配（Review Focus 1）', async () => {
    const p = await playerWithShop('通配测试店');
    // 测试库是共用的（好友测试会建名字带 % 的店），所以不断言"搜不到"，而是断言搜到的都真含这个字符：
    // 被当成通配符时，所有玩家都会被搜出来，其中就有这家不含 % 和 _ 的店
    type Hit = { accountId: number; username: string; email: string; restaurants: Array<{ name: string }> };
    for (const ch of ['%', '_']) {
      const hits = (await get(mod.cookie, `/players?q=${encodeURIComponent(ch)}`)).json.data as Hit[];
      expect(hits.map((h) => h.accountId)).not.toContain(p.accountId);
      for (const h of hits)
        expect(
          h.username.toLowerCase().startsWith(ch) ||
            h.email.startsWith(ch) ||
            h.restaurants.some((r) => r.name.includes(ch)),
        ).toBe(true);
    }
  });

  it('详情、餐厅、流水（按类型筛选）', async () => {
    const p = await playerWithShop('详情测试店');
    await ctx.deps.db
      .insertInto('ledger')
      .values([
        { rest_id: p.restId, kind: 'coin', delta: 5, source: 'x' },
        { rest_id: p.restId, kind: 'goods', item_id: 1, delta: 1, source: 'y' },
      ])
      .execute();
    const d = (await get(mod.cookie, `/players/${p.accountId}`)).json.data;
    expect(d).toMatchObject({ accountId: p.accountId, role: 'player', banned: false, banReason: null });
    const rest = (await get(mod.cookie, `/restaurants/${p.restId}`)).json.data;
    expect(rest.overview.name).toBe('详情测试店');
    // 发补偿前要能确认对象：返回店主和区服
    expect(rest.owner).toEqual({ accountId: p.accountId, username: p.username });
    expect(typeof rest.shardName).toBe('string');
    expect(Array.isArray(rest.store)).toBe(true);
    // 厨具不在仓库表里：后台要能看到（终审 Important 1）
    await ctx.deps.db
      .insertInto('equip')
      .values({ rest_id: p.restId, goods_id: gid('见习之铲'), part: 1, stress: 2, worn: true })
      .execute();
    const rest2 = (await get(mod.cookie, `/restaurants/${p.restId}`)).json.data;
    expect(rest2.equips).toEqual([
      expect.objectContaining({
        goodsId: gid('见习之铲'),
        name: null,
        part: 1,
        stress: 2,
        worn: true,
        locked: false,
        gems: 0,
      }),
    ]);
    const ledger = (await get(mod.cookie, `/restaurants/${p.restId}/ledger?kind=goods`)).json.data;
    expect(ledger.items).toEqual([expect.objectContaining({ kind: 'goods', itemId: 1, source: 'y' })]);
    expect((await get(mod.cookie, '/players/999999999')).status).toBe(404);
  });
});

describe('封号', () => {
  it('封号：会话失效、登录报原因；管理员解封后能登录', async () => {
    const p = await registerUser(ctx.app, { password: 'secret123' });
    const r = await post(mod.cookie, `/players/${p.accountId}/ban`, { reason: '刷分', days: 7 });
    expect(r.status).toBe(200);
    expect((await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: p.cookie })).status).toBe(401);
    const login = () =>
      call(ctx.app, 'POST', '/api/v1/account/login', {
        body: { username: p.username, password: 'secret123' },
      });
    expect((await login()).json).toMatchObject({ code: 'ACCOUNT_BANNED', params: { reason: '刷分' } });
    await post(admin.cookie, `/players/${p.accountId}/unban`, {});
    expect((await login()).status).toBe(200);
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `account:${p.accountId}`)
      .orderBy('id')
      .execute();
    expect(audit.map((x) => x.action)).toEqual(['player.ban', 'player.unban']);
  });

  it('mod 不能解封（6B-1 起解封只有管理员，后台路由对 mod 返回 404）', async () => {
    const other = await userWithRole(ctx, 'admin');
    expect((await post(admin.cookie, `/players/${other.accountId}/ban`, { reason: '账号被盗' })).status).toBe(
      200,
    );
    expect((await post(mod.cookie, `/players/${other.accountId}/unban`, {})).status).toBe(404);
    expect((await post(admin.cookie, `/players/${other.accountId}/unban`, {})).status).toBe(200);
  });

  it('mod 不能封 admin；谁都不能封自己', async () => {
    expect((await post(mod.cookie, `/players/${admin.accountId}/ban`, { reason: 'x', days: 1 })).status).toBe(
      403,
    );
    expect((await post(admin.cookie, `/players/${admin.accountId}/ban`, { reason: 'x' })).status).toBe(403);
  });
});

describe('强制改名和改角色', () => {
  it('改名：不收费，写个人日志和审计；重名 409；非法名 400', async () => {
    const p = await playerWithShop('改名前店');
    await playerWithShop('已被占用店');
    const r = await post(mod.cookie, `/restaurants/${p.restId}/rename`, {
      name: '改名后店',
      reason: '名字违规',
    });
    expect(r.json.data).toEqual({ name: '改名后店' });
    const log = await ctx.deps.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', p.restId)
      .where('type', '=', 'admin.rename')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ from: '改名前店', to: '改名后店', reason: '名字违规' });
    const taken = await post(mod.cookie, `/restaurants/${p.restId}/rename`, {
      name: '已被占用店',
      reason: 'x',
    });
    expect(taken.status).toBe(409);
    const bad = await post(mod.cookie, `/restaurants/${p.restId}/rename`, { name: 'a b!', reason: 'x' });
    expect(bad.json.code).toBe('RESTAURANT_NAME_INVALID');
  });

  it('改角色只有 admin；不能改自己', async () => {
    const p = await registerUser(ctx.app);
    expect((await post(mod.cookie, `/players/${p.accountId}/role`, { role: 'mod' })).status).toBe(404);
    expect((await post(admin.cookie, `/players/${p.accountId}/role`, { role: 'mod' })).json.data).toEqual({
      role: 'mod',
    });
    expect((await post(admin.cookie, `/players/${admin.accountId}/role`, { role: 'player' })).status).toBe(
      403,
    );
  });
});
