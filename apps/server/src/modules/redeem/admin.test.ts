import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('后台兑换码（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());
  const post = (cookie: string, path: string, body: unknown) =>
    call(ctx.app, 'POST', `/api/v1/admin${path}`, { cookie, body });

  it('建通用码：自定码转大写；重复报错；不填就随机；mod 不能建', async () => {
    const mine = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    const r = await post(admin.cookie, '/codes', {
      code: mine.toLowerCase(),
      items: { coin: 1 },
      note: '开服',
      maxUses: 100,
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ kind: 'shared', code: mine, maxUses: 100, usedCount: 0 });
    expect(
      (await post(admin.cookie, '/codes', { code: mine, items: { coin: 1 }, note: '' })).status,
    ).toBeGreaterThanOrEqual(400);
    const rnd = await post(admin.cookie, '/codes', { items: { coin: 1 }, note: '' });
    expect(rnd.json.data.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect((await post(mod.cookie, '/codes', { items: { coin: 1 }, note: '' })).status).toBe(404);
    expect(
      (await post(admin.cookie, '/codes', { items: { goods: [{ id: 999999, num: 1 }] }, note: '' })).status,
    ).toBe(400);
  });

  it('批量一次性码：列表合成一行；导出整批；停用一个就整批停用', async () => {
    const b = await post(admin.cookie, '/codes/batch', {
      count: 3,
      items: { hats: [{ tier: 'jade', name: '大橘' }] },
      note: '赞助',
    });
    expect(b.status).toBe(200);
    expect(b.json.data).toMatchObject({ kind: 'single', code: null, count: 3, usedCount: 0, maxUses: 1 });
    const batchId = b.json.data.batchId as number;
    const ex = await call(ctx.app, 'GET', `/api/v1/admin/codes/batches/${batchId}/export`, {
      cookie: admin.cookie,
    });
    expect(ex.json.data.codes).toHaveLength(3);
    expect(
      (await call(ctx.app, 'GET', `/api/v1/admin/codes/batches/${batchId}/export`, { cookie: mod.cookie }))
        .status,
    ).toBe(404);
    await post(admin.cookie, `/codes/${b.json.data.id}/disable`, {});
    const list = await call(ctx.app, 'GET', '/api/v1/admin/codes', { cookie: mod.cookie });
    expect(list.json.data.find((c: { batchId: number | null }) => c.batchId === batchId)).toMatchObject({
      disabled: true,
      count: 3,
    });
    const rows = await ctx.deps.db
      .selectFrom('redeem_code')
      .select('disabled_at')
      .where('batch_id', '=', batchId)
      .execute();
    expect(rows.every((r) => r.disabled_at !== null)).toBe(true);
  });
});

describe('后台兑换码：按码搜索、重新启用（backlog 新手码）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());
  const post = (cookie: string, path: string, body: unknown) =>
    call(ctx.app, 'POST', `/api/v1/admin${path}`, { cookie, body });
  const list = async (q: string) =>
    (await call(ctx.app, 'GET', `/api/v1/admin/codes?q=${encodeURIComponent(q)}`, { cookie: mod.cookie }))
      .json.data as Array<{ id: number; code: string | null; batchId: number | null; disabled: boolean }>;

  it('按码搜索：不分大小写、去掉空格和连字符；一次性码搜到时列出它那一批', async () => {
    const mine = `S${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    await post(admin.cookie, '/codes', { code: mine, items: { coin: 1 }, note: '' });
    const found = await list(` ${mine.slice(0, 4).toLowerCase()}-${mine.slice(4)} `);
    expect(found.map((c) => c.code)).toEqual([mine]);

    const b = await post(admin.cookie, '/codes/batch', { count: 2, items: { coin: 1 }, note: '' });
    const batchId = b.json.data.batchId as number;
    const codes = (
      await call(ctx.app, 'GET', `/api/v1/admin/codes/batches/${batchId}/export`, { cookie: admin.cookie })
    ).json.data.codes as string[];
    const hit = await list(codes[1]!);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ code: null, batchId });
  });

  it('停用后可以重新启用（整批一起）；mod 不能启用；写审计', async () => {
    const mine = `E${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    const r = await post(admin.cookie, '/codes', { code: mine, items: { coin: 1 }, note: '' });
    const id = r.json.data.id as number;
    await post(admin.cookie, `/codes/${id}/disable`, {});
    expect((await list(mine))[0]!.disabled).toBe(true);
    expect((await post(mod.cookie, `/codes/${id}/enable`, {})).status).toBe(404);
    expect((await post(admin.cookie, `/codes/${id}/enable`, {})).status).toBe(200);
    expect((await list(mine))[0]!.disabled).toBe(false);
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `code:${id}`)
      .orderBy('id')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(['code.create', 'code.disable', 'code.enable']);

    const b = await post(admin.cookie, '/codes/batch', { count: 2, items: { coin: 1 }, note: '' });
    await post(admin.cookie, `/codes/${b.json.data.id}/disable`, {});
    await post(admin.cookie, `/codes/${b.json.data.id}/enable`, {});
    const rows = await ctx.deps.db
      .selectFrom('redeem_code')
      .select('disabled_at')
      .where('batch_id', '=', b.json.data.batchId)
      .execute();
    expect(rows.every((x) => x.disabled_at === null)).toBe(true);
    expect((await post(admin.cookie, '/codes/99999999/enable', {})).status).toBe(404);
  });
});

describe('后台兑换码：每批上限按 tuning.redeem.batchMax（终审修复）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    ctx.deps.config.tuning.redeem.batchMax = 2;
  });
  afterAll(async () => {
    ctx.deps.config.tuning.redeem.batchMax = 1000;
    await ctx.close();
  });

  it('超过配置的每批上限报 VALIDATION_FAILED', async () => {
    const r = await call(ctx.app, 'POST', '/api/v1/admin/codes/batch', {
      cookie: admin.cookie,
      body: { count: 3, items: { coin: 1 }, note: '' },
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION_FAILED');
  });
});
