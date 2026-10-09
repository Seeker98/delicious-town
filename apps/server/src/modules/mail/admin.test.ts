import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('后台邮件（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  let t: TestGame;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
    t = await createTestGame();
  });
  afterAll(async () => {
    await ctx.close();
    await t.close();
  });
  const send = (cookie: string, body: unknown) =>
    call(ctx.app, 'POST', '/api/v1/admin/mails', { cookie, body });

  it('admin 发区服邮件写审计；mod 只能看不能发', async () => {
    const r = await newRestaurant(t);
    const body = { scope: 'shard', shardId: r.shardId, title: '开服礼', body: '欢迎', items: { coin: 100 } };
    expect((await send(mod.cookie, body)).status).toBe(404);
    const res = await send(admin.cookie, body);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject([{ scope: 'shard', title: '开服礼', claimedCount: 0 }]);
    const audit = await t.db
      .selectFrom('audit_log')
      .select('action')
      .where('action', '=', 'mail.send')
      .where('target', '=', `mail:${res.json.data[0].id}`)
      .executeTakeFirst();
    expect(audit).toBeDefined();
    const list = await call(ctx.app, 'GET', `/api/v1/admin/mails?shardId=${r.shardId}`, {
      cookie: mod.cookie,
    });
    expect(list.json.data.map((m: { id: number }) => m.id)).toContain(res.json.data[0].id);
  });

  it('附件里的道具不存在、单店邮件的店不在该区服时拒绝', async () => {
    const r = await newRestaurant(t);
    const other = await newRestaurant(t);
    expect(
      (
        await send(admin.cookie, {
          scope: 'shard',
          shardId: r.shardId,
          title: 't',
          body: 'b',
          items: { goods: [{ id: 999999, num: 1 }] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(admin.cookie, {
          scope: 'rest',
          shardId: r.shardId,
          restId: other.restaurantId,
          title: 't',
          body: 'b',
        })
      ).status,
    ).toBe(404);
  });

  it('撤回：玩家看不到；领过的人数留在列表里', async () => {
    const r = await newRestaurant(t);
    const res = await send(admin.cookie, {
      scope: 'shard',
      shardId: r.shardId,
      title: 't',
      body: 'b',
      items: { coin: 1 },
    });
    await t.game.mail.claim(r, res.json.data[0].id);
    const rv = await call(ctx.app, 'POST', `/api/v1/admin/mails/${res.json.data[0].id}/revoke`, {
      cookie: admin.cookie,
      body: {},
    });
    expect(rv.json.data).toMatchObject({ claimedCount: 1 });
    expect(rv.json.data.revokedAt).not.toBeNull();
    expect((await t.game.mail.list(r)).items.map((m) => m.id)).not.toContain(res.json.data[0].id);
  });

  it('补偿改为发邮件：不直接到账，玩家邮箱里出现一封带同样附件的邮件', async () => {
    const r = await newRestaurant(t, { patch: { coin: 0 } });
    const res = await call(ctx.app, 'POST', '/api/v1/admin/grants', {
      cookie: admin.cookie,
      body: {
        shardId: r.shardId,
        target: 'rest',
        restId: r.restaurantId,
        items: { coin: 500 },
        reason: '停服补偿',
        asMail: true,
      },
    });
    expect(res.status).toBe(200);
    expect(
      (
        await t.db
          .selectFrom('restaurant')
          .select('coin')
          .where('id', '=', r.restaurantId)
          .executeTakeFirstOrThrow()
      ).coin,
    ).toBe(0);
    const mail = (await t.game.mail.list(r)).items.find((m) => m.source === 'grant')!;
    expect(mail).toMatchObject({
      title: '系统补偿',
      body: '停服补偿',
      items: { coin: 500 },
      tpl: { key: 'grant', params: {} },
    });
  });
});
