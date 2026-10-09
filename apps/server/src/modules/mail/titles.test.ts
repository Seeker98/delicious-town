import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { randomCode } from '../redeem/code';
import { sendMail } from './send';

/** 邮件、兑换码带称号（定制称号设计 三） */
let ctx: TestContext;
let t: TestGame;
let admin: { cookie: string };
let actor: number;
beforeAll(async () => {
  ctx = await createTestApp();
  t = await createTestGame();
  admin = await userWithRole(ctx, 'admin');
  actor = await createAccountRow(t.db);
});
afterAll(async () => {
  await ctx.close();
  await t.close();
});

const DAY = 86_400_000;
const send = (body: unknown) => call(ctx.app, 'POST', '/api/v1/admin/mails', { cookie: admin.cookie, body });
async function custom(title: string, retired = false): Promise<string> {
  const r = await t.db
    .insertInto('custom_icon')
    .values({ title, retired })
    .returning('id')
    .executeTakeFirstOrThrow();
  return `c${r.id}`;
}
const iconRow = (restId: number, key: string) =>
  t.db
    .selectFrom('rest_icon')
    .select(['expires_at', 'shown'])
    .where('rest_id', '=', restId)
    .where('icon_key', '=', key)
    .executeTakeFirst();
/** 直接写库造一封单店邮件（绕过发送检查，用来造“已过期”“发出后停用”的情况） */
const rawMail = (shardId: number, restId: number, items: unknown) =>
  sendMail(t.db, {
    scope: 'rest',
    shardId,
    restId,
    minLevel: null,
    title: '定制称号',
    body: '送你',
    items: items as never,
    source: 'admin',
    actorAccountId: null,
  });

describe('后台发邮件带称号', () => {
  it('不存在、停用、到期时间已过的称号拒绝；名字快照由服务端填', async () => {
    const r = await newRestaurant(t);
    const base = {
      scope: 'rest',
      shardId: r.shardId,
      restIds: [r.restaurantId],
      title: '称号',
      body: '送你',
    };
    const off = await custom('停用', true);
    for (const icons of [
      [{ key: 'c999999999' }],
      [{ key: 'nope' }],
      [{ key: off }],
      [{ key: 'chef', until: '2020-01-01T00:00:00Z' }],
    ]) {
      const res = await send({ ...base, items: { icons } });
      expect(res.json.code, JSON.stringify(icons)).toBe('VALIDATION_FAILED');
    }
    const key = await custom('面霸');
    const ok = await send({ ...base, items: { icons: [{ key, title: '乱写的' }, { key: 'chef' }] } });
    expect(ok.status).toBe(200);
    expect(ok.json.data[0].items.icons).toEqual([
      { key, title: '面霸' },
      { key: 'chef', title: '金牌大厨' },
    ]);
  });

  it('几家店各一封，重复的 id 只发一次，互相看不到；有一家不在区服就整个拒绝', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const elsewhere = await newRestaurant(t);
    const key = await custom('双子星');
    const body = { scope: 'rest', shardId, title: '称号', body: '送你', items: { icons: [{ key }] } };
    const bad = await send({ ...body, restIds: [a.restaurantId, elsewhere.restaurantId] });
    expect(bad.json.code).toBe('RESTAURANT_NOT_FOUND');
    expect((await t.game.mail.list(a)).items).toHaveLength(0);
    const res = await send({ ...body, restIds: [a.restaurantId, a.restaurantId, b.restaurantId] });
    expect(res.json.data.map((m: { restId: number }) => m.restId)).toEqual([a.restaurantId, b.restaurantId]);
    const la = (await t.game.mail.list(a)).items;
    const lb = (await t.game.mail.list(b)).items;
    expect(la).toHaveLength(1);
    expect(lb).toHaveLength(1);
    expect(la[0]!.id).not.toBe(lb[0]!.id);
    const audit = await t.db
      .selectFrom('audit_log')
      .select('detail')
      .where('action', '=', 'mail.send')
      .where('target', '=', `mail:${la[0]!.id}`)
      .executeTakeFirstOrThrow();
    expect(audit.detail).toMatchObject({ restIds: [a.restaurantId, b.restaurantId] });
  });
});

describe('领取邮件里的称号', () => {
  it('领取后 N 天从领取时算；两封同一称号先后领，取晚的', async () => {
    const r = await newRestaurant(t);
    const key = await custom('三天七天');
    const m3 = await rawMail(r.shardId, r.restaurantId, { icons: [{ key, title: '三天七天', days: 3 }] });
    const m7 = await rawMail(r.shardId, r.restaurantId, { icons: [{ key, title: '三天七天', days: 7 }] });
    const now = t.clock.now.getTime();
    await t.game.mail.claim(r, m7);
    await t.game.mail.claim(r, m3);
    expect((await iconRow(r.restaurantId, key))!.expires_at).toEqual(new Date(now + 7 * DAY));
  });

  it('发出后称号停用了照样能领', async () => {
    const r = await newRestaurant(t);
    const key = await custom('后来停用');
    const id = await rawMail(r.shardId, r.restaurantId, { icons: [{ key, title: '后来停用' }] });
    await t.db
      .updateTable('custom_icon')
      .set({ retired: true })
      .where('id', '=', Number(key.slice(1)))
      .execute();
    await t.game.mail.claim(r, id);
    expect(await iconRow(r.restaurantId, key)).toMatchObject({ expires_at: null, shown: true });
  });

  it('只带一个已过期称号的邮件：能领，结果标已过期，别的照发；领完能删', async () => {
    const r = await newRestaurant(t, { patch: { coin: 0 } });
    const until = new Date(t.clock.now.getTime() - DAY).toISOString();
    const only = await rawMail(r.shardId, r.restaurantId, {
      icons: [{ key: 'chef', title: '金牌大厨', until }],
    });
    const res = await t.game.mail.claim(r, only);
    expect(res.data.items.icons).toEqual([{ key: 'chef', title: '金牌大厨', until, expired: true }]);
    expect(await iconRow(r.restaurantId, 'chef')).toBeUndefined();
    await t.game.mail.remove(r, only);
    const mixed = await rawMail(r.shardId, r.restaurantId, {
      coin: 5,
      icons: [{ key: 'chef', title: 'x', until }],
    });
    await t.game.mail.claim(r, mixed);
    expect(
      (
        await t.db
          .selectFrom('restaurant')
          .select('coin')
          .where('id', '=', r.restaurantId)
          .executeTakeFirstOrThrow()
      ).coin,
    ).toBe(5);
  });

  it('称号定义被删掉的邮件标成附件失效', async () => {
    const r = await newRestaurant(t);
    const id = await rawMail(r.shardId, r.restaurantId, { icons: [{ key: 'c999999998', title: '没了' }] });
    expect((await t.game.mail.list(r)).items.find((m) => m.id === id)!.broken).toBe(true);
  });
});

describe('兑换码带称号', () => {
  it('后台建码检查称号、填快照名字', async () => {
    const key = await custom('码上有');
    const res = await call(ctx.app, 'POST', '/api/v1/admin/codes', {
      cookie: admin.cookie,
      body: { note: '', items: { icons: [{ key, days: 3 }] } },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.items.icons).toEqual([{ key, title: '码上有', days: 3 }]);
    const bad = await call(ctx.app, 'POST', '/api/v1/admin/codes', {
      cookie: admin.cookie,
      body: { note: '', items: { icons: [{ key: 'nope' }] } },
    });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
  });

  it('共享码带领取后 3 天：两家店各自从兑换时算', async () => {
    const key = await custom('三日游');
    const c = randomCode();
    await t.db
      .insertInto('redeem_code')
      .values({
        code: c,
        kind: 'shared',
        items: JSON.stringify({ icons: [{ key, title: '三日游', days: 3 }] }),
        note: '',
        actor_account_id: actor,
      })
      .execute();
    const a = await newRestaurant(t);
    const b = await newRestaurant(t);
    const t0 = t.clock.now.getTime();
    await t.game.redeem.redeem(a, c);
    t.clock.advance(DAY);
    await t.game.redeem.redeem(b, c);
    expect((await iconRow(a.restaurantId, key))!.expires_at).toEqual(new Date(t0 + 3 * DAY));
    expect((await iconRow(b.restaurantId, key))!.expires_at).toEqual(new Date(t0 + 4 * DAY));
  });
});
