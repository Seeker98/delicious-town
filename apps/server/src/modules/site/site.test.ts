import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
let admin: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
});
afterAll(() => ctx.close());

const body = (o: Record<string, unknown> = {}) => ({
  name: '美味小镇贴吧',
  url: 'https://example.com/a',
  note: '玩家交流',
  sort: 0,
  ...o,
});

describe('友情链接（问题记录 348）', () => {
  it('不用登录能读；按 sort、id 排序；admin 新建、编辑、删除都写审计', async () => {
    const a = await call(ctx.app, 'POST', '/api/v1/admin/links', {
      cookie: admin.cookie,
      body: body({ sort: 2 }),
    });
    expect(a.status).toBe(200);
    const b = await call(ctx.app, 'POST', '/api/v1/admin/links', {
      cookie: admin.cookie,
      body: body({ name: 'Wiki', url: 'http://example.org', note: '', sort: 1 }),
    });
    const idA = a.json.data.id as number;
    const idB = b.json.data.id as number;
    const pub = await call(ctx.app, 'GET', '/api/v1/links');
    expect(pub.status).toBe(200);
    const mine = (pub.json.data as Array<{ id: number }>).filter((x) => x.id === idA || x.id === idB);
    expect(mine).toEqual([
      { id: idB, name: 'Wiki', url: 'http://example.org', note: '' },
      { id: idA, name: '美味小镇贴吧', url: 'https://example.com/a', note: '玩家交流' },
    ]);
    const u = await call(ctx.app, 'POST', `/api/v1/admin/links/${idA}`, {
      cookie: admin.cookie,
      body: body({ name: '贴吧', sort: 0 }),
    });
    expect(u.json.data).toMatchObject({ id: idA, name: '贴吧', sort: 0 });
    const list = await call(ctx.app, 'GET', '/api/v1/admin/links', { cookie: admin.cookie });
    expect((list.json.data as Array<{ id: number }>).map((x) => x.id)).toEqual(
      expect.arrayContaining([idA, idB]),
    );
    await call(ctx.app, 'POST', `/api/v1/admin/links/${idB}/delete`, { cookie: admin.cookie, body: {} });
    const after = (await call(ctx.app, 'GET', '/api/v1/links')).json.data as Array<{ id: number }>;
    expect(after.map((x) => x.id)).not.toContain(idB);
    const actions = (
      await ctx.deps.db
        .selectFrom('audit_log')
        .select(['action', 'target'])
        .where('target', 'in', [`link:${idA}`, `link:${idB}`])
        .execute()
    ).map((x) => `${x.action} ${x.target}`);
    expect(actions.sort()).toEqual(
      [
        `link.create link:${idA}`,
        `link.create link:${idB}`,
        `link.delete link:${idB}`,
        `link.update link:${idA}`,
      ].sort(),
    );
  });

  it('地址只能是 http(s)；名字、说明有长度上限；编辑、删除不存在的报 404', async () => {
    for (const bad of [
      body({ url: 'javascript:alert(1)' }),
      body({ url: 'ftp://example.com' }),
      body({ name: '' }),
      body({ name: '名'.repeat(21) }),
      body({ note: '说'.repeat(61) }),
    ]) {
      const r = await call(ctx.app, 'POST', '/api/v1/admin/links', { cookie: admin.cookie, body: bad });
      expect(r.json.code).toBe('VALIDATION_FAILED');
    }
    const r = await call(ctx.app, 'POST', '/api/v1/admin/links/999999', {
      cookie: admin.cookie,
      body: body(),
    });
    expect(r.status).toBe(404);
    const d = await call(ctx.app, 'POST', '/api/v1/admin/links/999999/delete', {
      cookie: admin.cookie,
      body: {},
    });
    expect(d.status).toBe(404);
  });
});

describe('服务器时间（问题记录 348：顶栏的当前时间）', () => {
  it('不用登录能读，返回服务器现在的时间', async () => {
    const r = await call(ctx.app, 'GET', '/api/v1/time');
    expect(r.status).toBe(200);
    expect(Math.abs(Date.parse(r.json.data.now as string) - Date.now())).toBeLessThan(60_000);
  });
});
