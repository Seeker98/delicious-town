import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

/** 后台称号页（定制称号设计 二） */
let ctx: TestContext;
let admin: { cookie: string };
let mod: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());

const A = '/api/v1/admin/titles';
const post = (url: string, body?: unknown, cookie = admin.cookie) =>
  call(ctx.app, 'POST', url, { cookie, body });
const get = (url: string, cookie = admin.cookie) => call(ctx.app, 'GET', url, { cookie });
const create = async (body: Record<string, unknown>) => {
  const r = await post(A, body);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.data as { key: string; id: number };
};

describe('后台称号', () => {
  it('协管能看不能建；新建的在列表最前，配置称号在后面带来源', async () => {
    expect((await post(A, { title: '协管建的' }, mod.cookie)).status).toBe(404);
    const c = await create({ title: ' 🍜面霸 ', desc: '吃了一百碗面', note: '给群主' });
    expect(c).toMatchObject({ key: `c${c.id}`, title: '🍜面霸', desc: '吃了一百碗面', note: '给群主' });
    const list = (await get(A, mod.cookie)).json.data as Array<Record<string, unknown>>;
    expect(list[0]).toMatchObject({ key: c.key, source: 'custom', owners: 0, retired: false });
    expect(list[0]!.createdBy).toEqual(expect.any(String));
    const conf = new Map(list.filter((x) => x.source !== 'custom').map((x) => [x.key, x]));
    expect(conf.get('founder')).toMatchObject({ source: 'general', id: null, title: '开服元老' });
    expect(conf.get('oct26_s')).toMatchObject({ source: 'shop' });
    expect(conf.get('kuji_a')).toMatchObject({ source: 'kuji' });
    expect(conf.get('kuji_dx_2610_last')).toMatchObject({ source: 'kuji' });
    expect(conf.get('fund_a')).toMatchObject({ source: 'fund' });
  });

  it('名字不合规拒绝', async () => {
    expect((await post(A, { title: '一二三四五六七八九十十' })).json.code).toBe('VALIDATION_FAILED');
    expect((await post(A, { title: String.fromCodePoint(0x200b) })).json.code).toBe('VALIDATION_FAILED');
  });

  it('按名字或备注搜', async () => {
    const c = await create({ title: '搜得到', note: '独特备注甲乙' });
    const byNote = (await get(`${A}?q=${encodeURIComponent('备注甲')}`)).json.data;
    expect(byNote.map((x: { key: string }) => x.key)).toEqual([c.key]);
    const byTitle = (await get(`${A}?q=${encodeURIComponent('开服')}`)).json.data;
    expect(byTitle.map((x: { key: string }) => x.key)).toContain('founder');
    // % 和 _ 按字面搜，不当通配符
    const pct = await create({ title: '百分百%' });
    const byPct = (await get(`${A}?q=${encodeURIComponent('%')}`)).json.data;
    expect(
      byPct.filter((x: { id: number | null }) => x.id !== null).map((x: { key: string }) => x.key),
    ).toEqual([pct.key]);
  });

  it('改名后玩家页显示新名字；清掉说明；停用；拥有人数', async () => {
    const c = await create({ title: '旧名字', desc: '旧说明' });
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    await post(`/api/v1/admin/restaurants/${p.restId}/icons`, { key: c.key });
    const u = await post(`${A}/${c.id}`, { title: '新名字', desc: '' });
    expect(u.json.data).toMatchObject({ title: '新名字', desc: null, owners: 1 });
    const icons = (await get(`/api/v1/admin/restaurants/${p.restId}/icons`)).json.data;
    expect(icons[0]).toMatchObject({ key: c.key, title: '新名字' });
    expect((await post(`${A}/${c.id}`, { retired: true })).json.data).toMatchObject({ retired: true });
    expect((await post(`${A}/${c.id}`, { note: '没权限' }, mod.cookie)).status).toBe(404);
  });

  it('有人拥有、被邮件或兑换码引用时不能删；没引用的能删；写审计', async () => {
    const owned = await create({ title: '有人有' });
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    await post(`/api/v1/admin/restaurants/${p.restId}/icons`, { key: owned.key });
    expect((await post(`${A}/${owned.id}/delete`)).json.params).toMatchObject({ reason: 'title_in_use' });

    const mailed = await create({ title: '邮件里有' });
    const m = await post('/api/v1/admin/mails', {
      scope: 'rest',
      shardId,
      restIds: [p.restId],
      title: '称号',
      body: '送你',
      items: { icons: [{ key: mailed.key }] },
    });
    expect(m.status).toBe(200);
    expect((await post(`${A}/${mailed.id}/delete`)).json.params).toMatchObject({ reason: 'title_in_use' });

    const coded = await create({ title: '码里有' });
    expect(
      (await post('/api/v1/admin/codes', { note: '', items: { icons: [{ key: coded.key }] } })).status,
    ).toBe(200);
    expect((await post(`${A}/${coded.id}/delete`)).json.params).toMatchObject({ reason: 'title_in_use' });

    const free = await create({ title: '没人用' });
    expect((await post(`${A}/${free.id}/delete`)).status).toBe(200);
    expect((await get(A)).json.data.map((x: { key: string }) => x.key)).not.toContain(free.key);
    expect((await post(`${A}/${free.id}/delete`)).status).toBe(404);

    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `title:${free.id}`)
      .orderBy('id')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(['title.create', 'title.delete']);
  });
});
