import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
const routes = new Set<string>();
let ids: {
  shardId: number;
  accountId: number;
  restId: number;
  iconId: number;
  mailId: number;
  announcementId: number;
  linkId: number;
  activityId: number;
  codeId: number;
  reportIds: number[];
  batchId: number;
  predictId: number;
};
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
  // 给"收回个性图标"用：管理员那一次调用会真的收回它
  const icon = await ctx.deps.db
    .insertInto('rest_icon')
    .values({ rest_id: restId, icon_key: 'tester' })
    .returning('id')
    .executeTakeFirstOrThrow();
  // 给"撤回邮件"用：管理员那一次调用会真的撤回它
  const mail = await ctx.deps.db
    .insertInto('mail')
    .values({ scope: 'shard', shard_id: shardId, title: '权限测试', body: 'b', source: 'admin' })
    .returning('id')
    .executeTakeFirstOrThrow();
  const announcement = await ctx.deps.db
    .insertInto('announcement')
    .values({
      shard_id: null,
      title: '权限测试',
      body: 'b',
      starts_at: new Date(),
      ends_at: new Date(Date.now() + 3_600_000),
      actor_account_id: target.accountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  // 未开始的活动：编辑、提前结束、删除都能走到业务逻辑（矩阵末尾才删除）
  const activity = await ctx.deps.db
    .insertInto('activity')
    .values({
      shard_id: shardId,
      kind: 'goals',
      title: '权限测试',
      body: 'b',
      starts_at: new Date(Date.now() + 3_600_000),
      ends_at: new Date(Date.now() + 7_200_000),
      def: JSON.stringify(activityBody().def),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const code = await ctx.deps.db
    .insertInto('redeem_code')
    .values({
      code: `PERM${Date.now()}`,
      kind: 'shared',
      items: JSON.stringify({ coin: 1 }),
      note: '',
      actor_account_id: target.accountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const single = await ctx.deps.db
    .insertInto('redeem_code')
    .values({
      code: `PERMB${Date.now()}`,
      kind: 'single',
      items: JSON.stringify({ coin: 1 }),
      note: '',
      max_uses: 1,
      actor_account_id: target.accountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await ctx.deps.db
    .updateTable('redeem_code')
    .set({ batch_id: single.id })
    .where('id', '=', single.id)
    .execute();
  // 举报：解析/驳回各需要一个待处理的案子（管理员那次会真的结案），列表、详情用第一个
  const reportIds: number[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await ctx.deps.db
      .insertInto('report_case')
      .values({
        shard_id: shardId,
        target_type: 'notice',
        target_id: restId + 1_000_000 * (i + 1),
        target_rest_id: restId,
        target_account_id: target.accountId,
        snapshot: '权限测试',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    reportIds.push(c.id);
  }
  // 事件合约：判定、作废都能走到业务逻辑（管理员判定后，作废报 predict_final，也不是 404）
  const predict = await ctx.deps.db
    .insertInto('predict_event')
    .values({
      shard_id: shardId,
      title: '权限测试',
      b: 100,
      unit: 1000,
      p0: 0.5,
      open_at: new Date(),
      close_at: new Date(Date.now() + 3_600_000),
      status: 'open',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const link = await ctx.deps.db
    .insertInto('friend_link')
    .values({ name: '权限测试', url: 'https://example.com' })
    .returning('id')
    .executeTakeFirstOrThrow();
  ids = {
    shardId,
    accountId: target.accountId,
    restId,
    iconId: icon.id,
    mailId: mail.id,
    announcementId: announcement.id,
    linkId: link.id,
    activityId: activity.id,
    codeId: code.id,
    reportIds,
    batchId: single.id,
    predictId: Number(predict.id),
  };
  cookies = {
    player: (await userWithRole(ctx, 'player')).cookie,
    mod: (await userWithRole(ctx, 'mod')).cookie,
    admin: (await userWithRole(ctx, 'admin')).cookie,
  };
});
afterAll(() => ctx.close());

const linkBody = () => ({ name: '权限测试', url: 'https://example.com', note: '', sort: 0 });
const announceBody = () => ({
  shardId: null,
  title: '权限测试',
  body: 'b',
  important: false,
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
});

const activityBody = () => ({
  shardId: null,
  kind: 'goals',
  title: '权限测试',
  body: 'b',
  startsAt: new Date(Date.now() + 3_600_000).toISOString(),
  endsAt: new Date(Date.now() + 7_200_000).toISOString(),
  minLevel: 1,
  def: { goals: [{ key: 'signin', target: 1, award: { coin: 1 } }] },
});

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
    body: () => ({ reason: '权限测试', days: 1 }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/players/:id/unban',
    url: () => `/api/v1/admin/players/${ids.accountId}/unban`,
    body: () => ({}),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/restaurants/:id/rename',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/rename`,
    body: () => ({ name: `权限${ids.restId % 10000}`, reason: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/restaurants/:id/icons',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/icons`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/restaurants/:id/icons',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/icons`,
    body: () => ({ key: 'founder' }),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/restaurants/:id/icons/:iconId/revoke',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/icons/${ids.iconId}/revoke`,
    min: 'admin',
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
  { method: 'GET', route: '/api/v1/admin/mails', url: () => '/api/v1/admin/mails', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/codes', url: () => '/api/v1/admin/codes', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/reports', url: () => '/api/v1/admin/reports', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/launch-check', url: () => '/api/v1/admin/launch-check', min: 'mod' },
  {
    method: 'POST',
    route: '/api/v1/admin/launch-check/fix',
    url: () => '/api/v1/admin/launch-check/fix',
    body: () => ({ shardId: ids.shardId, version: 0 }),
    min: 'admin',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/exchange/frozen',
    url: () => `/api/v1/admin/exchange/frozen?shardId=${ids.shardId}`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/exchange/maker',
    url: () => `/api/v1/admin/exchange/maker?shardId=${ids.shardId}`,
    min: 'mod',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/predict',
    url: () => `/api/v1/admin/predict?shardId=${ids.shardId}`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/predict',
    url: () => '/api/v1/admin/predict',
    body: () => ({
      shardId: ids.shardId,
      title: '权限测试出题',
      closeAt: new Date(Date.now() + 3_600_000).toISOString(),
      p0: 50,
    }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/predict/:id/resolve',
    url: () => `/api/v1/admin/predict/${ids.predictId}/resolve`,
    body: () => ({ outcome: true }),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/predict/:id/void',
    url: () => `/api/v1/admin/predict/${ids.predictId}/void`,
    body: () => ({}),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/exchange/freeze',
    url: () => '/api/v1/admin/exchange/freeze',
    body: () => ({ restId: ids.restId, reason: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/exchange/unfreeze',
    url: () => '/api/v1/admin/exchange/unfreeze',
    body: () => ({ restId: ids.restId }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/exchange/confiscate',
    url: () => '/api/v1/admin/exchange/confiscate',
    body: () => ({ restId: ids.restId }),
    min: 'admin',
  },
  ...(['bar', 'surge', 'multi', 'redeem', 'exchange'] as const).map((k) => ({
    method: 'GET' as const,
    route: `/api/v1/admin/suspicious/${k}`,
    url: () => `/api/v1/admin/suspicious/${k}?shardId=${ids.shardId}`,
    min: 'mod' as const,
  })),
  {
    method: 'GET',
    route: '/api/v1/admin/reports/:id',
    url: () => `/api/v1/admin/reports/${ids.reportIds[0]}`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/reports/:id/resolve',
    url: () => `/api/v1/admin/reports/${ids.reportIds[1]}/resolve`,
    body: () => ({ note: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/reports/:id/reject',
    url: () => `/api/v1/admin/reports/${ids.reportIds[2]}/reject`,
    body: () => ({ note: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/codes',
    url: () => '/api/v1/admin/codes',
    body: () => ({ items: { coin: 1 }, note: '权限测试' }),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/codes/batch',
    url: () => '/api/v1/admin/codes/batch',
    body: () => ({ count: 1, items: { coin: 1 }, note: '权限测试' }),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/codes/:id/disable',
    url: () => `/api/v1/admin/codes/${ids.codeId}/disable`,
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/codes/:id/enable',
    url: () => `/api/v1/admin/codes/${ids.codeId}/enable`,
    min: 'admin',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/codes/batches/:id/export',
    url: () => `/api/v1/admin/codes/batches/${ids.batchId}/export`,
    min: 'admin',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/announcements',
    url: () => '/api/v1/admin/announcements',
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/announcements',
    url: () => '/api/v1/admin/announcements',
    body: () => announceBody(),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/announcements/:id',
    url: () => `/api/v1/admin/announcements/${ids.announcementId}`,
    body: () => announceBody(),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/announcements/:id/delete',
    url: () => `/api/v1/admin/announcements/${ids.announcementId}/delete`,
    min: 'admin',
  },
  {
    method: 'GET',
    route: '/api/v1/admin/links',
    url: () => '/api/v1/admin/links',
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/links',
    url: () => '/api/v1/admin/links',
    body: () => linkBody(),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/links/:id',
    url: () => `/api/v1/admin/links/${ids.linkId}`,
    body: () => linkBody(),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/links/:id/delete',
    url: () => `/api/v1/admin/links/${ids.linkId}/delete`,
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/mails',
    url: () => '/api/v1/admin/mails',
    body: () => ({ scope: 'shard', shardId: ids.shardId, title: '权限测试', body: 'b' }),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/mails/:id/revoke',
    url: () => `/api/v1/admin/mails/${ids.mailId}/revoke`,
    min: 'admin',
  },
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
  { method: 'GET', route: '/api/v1/admin/activities', url: () => '/api/v1/admin/activities', min: 'mod' },
  {
    method: 'GET',
    route: '/api/v1/admin/activities/:id',
    url: () => `/api/v1/admin/activities/${ids.activityId}`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/activities',
    url: () => '/api/v1/admin/activities',
    body: () => activityBody(),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/activities/:id',
    url: () => `/api/v1/admin/activities/${ids.activityId}`,
    body: () => activityBody(),
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/activities/:id/end',
    url: () => `/api/v1/admin/activities/${ids.activityId}/end`,
    min: 'admin',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/activities/:id/delete',
    url: () => `/api/v1/admin/activities/${ids.activityId}/delete`,
    min: 'admin',
  },
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
