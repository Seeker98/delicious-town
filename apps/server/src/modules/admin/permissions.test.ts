import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
const routes = new Set<string>();
let ids: { shardId: number; accountId: number; restId: number };
let cookies: Record<'player' | 'mod' | 'admin', string>;

beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.addHook('onRoute', (r) => {
      const methods = Array.isArray(r.method) ? r.method : [r.method];
      if (r.url.startsWith('/api/v1/admin'))
        for (const m of methods) if (m !== 'HEAD') routes.add(`${m} ${r.url}`);
    });
  });
  const shardId = await createShard(ctx.deps.db);
  const target = await registerUser(ctx.app);
  const restId = await createRestaurantFull(ctx.deps.db, shardId, target.accountId);
  ids = { shardId, accountId: target.accountId, restId };
  cookies = {
    player: (await userWithRole(ctx, 'player')).cookie,
    mod: (await userWithRole(ctx, 'mod')).cookie,
    admin: (await userWithRole(ctx, 'admin')).cookie,
  };
});
afterAll(() => ctx.close());

type Case = {
  method: 'GET' | 'POST';
  route: string;
  url: () => string;
  body?: () => unknown;
  min: 'mod' | 'admin';
};
const CASES: Case[] = [
  { method: 'GET', route: '/api/v1/admin/me', url: () => '/api/v1/admin/me', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/shards', url: () => '/api/v1/admin/shards', min: 'mod' },
  {
    method: 'GET',
    route: '/api/v1/admin/shards/:id/settings',
    url: () => `/api/v1/admin/shards/${ids.shardId}/settings`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/shards/:id/override',
    url: () => `/api/v1/admin/shards/${ids.shardId}/override`,
    body: () => ({ override: {}, note: '权限测试', version: 0 }),
    min: 'admin',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/shards/:id/history',
    url: () => `/api/v1/admin/shards/${ids.shardId}/history`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/shards/:id/rollback',
    url: () => `/api/v1/admin/shards/${ids.shardId}/rollback`,
    body: () => ({ version: 1, note: '权限测试' }),
    min: 'admin',
  },
  { method: 'GET', route: '/api/v1/admin/players', url: () => '/api/v1/admin/players?q=x', min: 'mod' },
  {
    method: 'GET',
    route: '/api/v1/admin/players/:id',
    url: () => `/api/v1/admin/players/${ids.accountId}`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/restaurants/:id',
    url: () => `/api/v1/admin/restaurants/${ids.restId}`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/restaurants/:id/ledger',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/ledger`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/restaurants/:id/log',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/log`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/restaurants/:id/income',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/income`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/players/:id/ban',
    url: () => `/api/v1/admin/players/${ids.accountId}/ban`,
    body: () => ({ reason: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/players/:id/unban',
    url: () => `/api/v1/admin/players/${ids.accountId}/unban`,
    body: () => ({}),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/restaurants/:id/rename',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/rename`,
    body: () => ({ name: `权限${ids.restId % 10000}`, reason: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/players/:id/role',
    url: () => `/api/v1/admin/players/${ids.accountId}/role`,
    body: () => ({ role: 'player' }),
    min: 'admin',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/grants/preview',
    url: () => `/api/v1/admin/grants/preview?shardId=${ids.shardId}`,
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/grants',
    url: () => '/api/v1/admin/grants',
    body: () => ({
      shardId: ids.shardId,
      target: 'rest',
      restId: ids.restId,
      items: { coin: 1 },
      reason: '权限测试',
    }),
    min: 'admin',
  },
  { method: 'GET', route: '/api/v1/admin/grants', url: () => '/api/v1/admin/grants', min: 'mod' },
  {
    method: 'GET',
    route: '/api/v1/admin/stats/economy',
    url: () => `/api/v1/admin/stats/economy?shardId=${ids.shardId}&from=2026-06-01&to=2026-06-02`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/stats/distribution',
    url: () => `/api/v1/admin/stats/distribution?shardId=${ids.shardId}`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/stats/settlement',
    url: () => `/api/v1/admin/stats/settlement?shardId=${ids.shardId}`,
    min: 'mod',
  },
  { method: 'GET', route: '/api/v1/admin/audit', url: () => '/api/v1/admin/audit', min: 'mod' },
];

describe('后台权限矩阵', () => {
  it('矩阵覆盖了所有后台路由', () => {
    expect([...routes].sort()).toEqual(CASES.map((c) => `${c.method} ${c.route}`).sort());
  });

  it.each(CASES)('$method $route', async (c) => {
    const run = (cookie?: string) => call(ctx.app, c.method, c.url(), { cookie, body: c.body?.() });
    expect((await run()).status).toBe(401);
    expect((await run(cookies.player)).status).toBe(404);
    const asMod = await run(cookies.mod);
    if (c.min === 'mod') expect([401, 404]).not.toContain(asMod.status);
    else expect(asMod.status).toBe(404);
    const asAdmin = await run(cookies.admin);
    expect([401, 404]).not.toContain(asAdmin.status);
  });
});

describe('审计日志列表', () => {
  it('按操作人和动作筛选，分页', async () => {
    const r = await call(ctx.app, 'GET', '/api/v1/admin/audit?action=player.&limit=1', {
      cookie: cookies.mod,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.items).toHaveLength(1);
    expect(r.json.data.items[0].action.startsWith('player.')).toBe(true);
    expect(r.json.data.nextBefore).not.toBeNull();
    const next = await call(
      ctx.app,
      'GET',
      `/api/v1/admin/audit?action=player.&limit=1&before=${encodeURIComponent(r.json.data.nextBefore)}`,
      { cookie: cookies.mod },
    );
    expect(next.json.data.items[0].id).toBeLessThan(r.json.data.items[0].id);
  });
});
