import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let t: TestGame;
let actor: number;
beforeAll(async () => {
  t = await createTestGame();
  actor = await createAccountRow(t.db);
});
afterAll(() => t.close());

const H = 3_600_000;
const add = (patch: Record<string, unknown> = {}) =>
  t.db
    .insertInto('announcement')
    .values({
      shard_id: null,
      title: '停服维护',
      body: '今晚 2 点',
      important: false,
      starts_at: new Date(t.clock.now.getTime() - H),
      ends_at: new Date(t.clock.now.getTime() + H),
      actor_account_id: actor,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
    .then((r) => r.id);

describe('公告（设计 §2 裁定 11、12）', () => {
  it('只列有效期内、本区服或全部区服、没删除的公告；重要的排前面', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const all = await add();
    const mine = await add({ shard_id: shardId, important: true });
    const other = await add({ shard_id: await createShard(t.db) });
    const future = await add({
      starts_at: new Date(t.clock.now.getTime() + H),
      ends_at: new Date(t.clock.now.getTime() + 2 * H),
    });
    const gone = await add({ deleted_at: new Date() });
    const ids = (await t.game.announce.list(r)).items.map((a) => a.id);
    expect(ids[0]).toBe(mine);
    expect(ids).toContain(all);
    for (const x of [other, future, gone]) expect(ids).not.toContain(x);
  });

  it('重要公告按账号记已看：看过后 seen 为 true；登录页只给全部区服的', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const imp = await add({ important: true });
    const local = await add({ shard_id: shardId });
    expect((await t.game.announce.list(r)).items.find((a) => a.id === imp)!.seen).toBe(false);
    await t.game.announce.seen(r, imp);
    await t.game.announce.seen(r, imp);
    expect((await t.game.announce.list(r)).items.find((a) => a.id === imp)!.seen).toBe(true);
    const pub = (await t.game.announce.publicList()).items.map((a) => a.id);
    expect(pub).toContain(imp);
    expect(pub).not.toContain(local);
  });
});

describe('公告（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
  });
  afterAll(() => ctx.close());

  it('不用登录能读公开公告；admin 新建、编辑、删除都写审计', async () => {
    expect((await call(ctx.app, 'GET', '/api/v1/public/announcements')).status).toBe(200);
    const now = Date.now();
    const body = {
      shardId: null,
      title: '开服',
      body: '欢迎',
      important: true,
      startsAt: new Date(now - H).toISOString(),
      endsAt: new Date(now + H).toISOString(),
    };
    const c = await call(ctx.app, 'POST', '/api/v1/admin/announcements', { cookie: admin.cookie, body });
    expect(c.status).toBe(200);
    const id = c.json.data.id as number;
    const u = await call(ctx.app, 'POST', `/api/v1/admin/announcements/${id}`, {
      cookie: admin.cookie,
      body: { ...body, title: '开服啦' },
    });
    expect(u.json.data.title).toBe('开服啦');
    await call(ctx.app, 'POST', `/api/v1/admin/announcements/${id}/delete`, {
      cookie: admin.cookie,
      body: {},
    });
    const actions = (
      await ctx.deps.db
        .selectFrom('audit_log')
        .select('action')
        .where('target', '=', `announcement:${id}`)
        .execute()
    ).map((a) => a.action);
    expect(actions.sort()).toEqual(['announce.create', 'announce.delete', 'announce.update']);
  });
});
