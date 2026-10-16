import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime, type HygieneReportParams } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { hygieneRound } from './hygiene';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const H = 3_600_000;
const goodsWith = (key: string) =>
  [...t.deps.config.goods.values()].find((g) => (g.effects[key] ?? 0) > 0)!.id;
const today = () => gameDay(t.clock.now);

async function rounds(restId: number, at: Date, customers: Record<string, number>, n = 1) {
  for (let i = 0; i < n; i++) {
    await t.db
      .insertInto('income_round')
      .values({
        rest_id: restId,
        round_no: i,
        coin: 0,
        exp: 0,
        oil: 0,
        customers: JSON.stringify(customers),
        rates: '{}',
        drops: '[]',
        created_at: at,
      })
      .execute();
  }
}
const log = (restId: number, type: string, at: Date, params: Record<string, unknown> = {}) =>
  t.db
    .insertInto('rest_log')
    .values({ rest_id: restId, type, params: JSON.stringify(params), created_at: at })
    .execute();
const reportsOf = (restId: number) =>
  t.db
    .selectFrom('rest_log')
    .select(['params'])
    .where('rest_id', '=', restId)
    .where('type', '=', 'hygiene.report')
    .execute()
    .then((rs) => rs.map((r) => r.params as unknown as HygieneReportParams));

describe('章鱼哥的卫生巡查', () => {
  it('2 星以上、前一天营业过的店写一条：自己长的蟑螂占桌、设施灭的、老鼠、设施剩余', async () => {
    t.clock.set(new Date(gameTime(gameDay(new Date()), 0).getTime() + 10 * 60_000));
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const low = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
    const idle = await newRestaurant(t, { shardId, patch: { star_level: 3 } });
    const noon = gameTime(addDays(today(), -1), 12);
    // 15 轮有自己长的蟑螂 = 60 分钟；好友放的只在 3 里，不算
    await rounds(a.restaurantId, noon, { '3': 2, n3: 1, '-3': 1 }, 15);
    await rounds(a.restaurantId, noon, { '3': 1 }, 5);
    // 今天的不算
    await rounds(a.restaurantId, t.clock.now, { n3: 9 });
    await rounds(low.restaurantId, noon, { n3: 3 });
    await log(a.restaurantId, 'mouse.steal', noon, { num: 3 });
    await log(a.restaurantId, 'mouse.steal', noon, { num: 2 });
    await log(a.restaurantId, 'mouse.trap', noon, { coin: 10 });
    await log(a.restaurantId, 'mouse.escape', noon);
    await log(a.restaurantId, 'mouse.steal', t.clock.now, { num: 9 });
    const roachGoods = goodsWith('roachClearRate');
    await t.db
      .insertInto('restaurant_device')
      .values({
        rest_id: a.restaurantId,
        slot: 4,
        goods_id: roachGoods,
        placed_at: noon,
        expires_at: new Date(t.clock.now.getTime() + 6.5 * H),
      })
      .execute();

    expect(await hygieneRound(t.game.deps, shardId, t.clock.now)).toEqual({ reports: 1 });
    expect(await reportsOf(a.restaurantId)).toEqual([
      {
        day: addDays(today(), -1),
        roachHours: 1,
        roachAuto: 15,
        mouse: 4,
        stolen: 5,
        trapped: 1,
        roachDevice: { goodsId: roachGoods, hours: 6 },
        mouseDevice: null,
      },
    ]);
    expect(await reportsOf(low.restaurantId)).toEqual([]);
    expect(await reportsOf(idle.restaurantId)).toEqual([]);
  });
});

describe('委员会页', () => {
  it('公报只列本区和全部区服、没撤回的；今日要点汇总全镇；带本店最近一次巡查', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const other = await newRestaurant(t, { shardId });
    const add = (shard: number | null, deleted = false) =>
      t.db
        .insertInto('commission_notice')
        .values({
          shard_id: shard,
          member: 'squid',
          body: '巡查开始',
          deleted_at: deleted ? new Date() : null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((x) => x.id);
    const all = await add(null);
    const mine = await add(shardId);
    const elsewhere = await add(await createShard(t.db));
    const gone = await add(shardId, true);
    for (const [rest, n] of [
      [r.restaurantId, 3],
      [other.restaurantId, 4],
    ] as const) {
      await t.db
        .insertInto('daily_counter')
        .values({ rest_id: rest, day: today(), key: 'roach.kill', count: n })
        .execute();
    }
    await log(other.restaurantId, 'mouse.steal', t.clock.now, { num: 1 });
    await log(other.restaurantId, 'mouse.trap', t.clock.now, { coin: 1 });
    await log(r.restaurantId, 'hygiene.report', t.clock.now, { day: '2026-10-15', roachHours: 2 });

    const v = await t.game.commission.view(r);
    const ids = v.notices.map((n) => n.id);
    expect(ids.slice(0, 2)).toEqual([mine, all]);
    expect(ids).not.toContain(elsewhere);
    expect(ids).not.toContain(gone);
    expect(v.brief.hygiene).toEqual({ roachKills: 7, mouseVisits: 2, mouseSteals: 1 });
    expect(v.brief.finance).toEqual({ coin: 0 });
    expect(v.myHygiene).toMatchObject({ day: '2026-10-15', roachHours: 2 });
    expect((await t.game.commission.view(other)).myHygiene).toBeNull();
  });
});

describe('委员会公报（后台）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
  });
  afterAll(() => ctx.close());

  const newsOf = (id: number) =>
    ctx.deps.db
      .selectFrom('news')
      .select(['shard_id', 'params'])
      .where('type', '=', 'commission.notice')
      .execute()
      .then((rs) => rs.filter((r) => (r.params as { noticeId?: number }).noticeId === id));

  it('发给一个区服写一条新闻；撤回后新闻删掉、公报标为撤回，都写审计', async () => {
    const shardId = await createShard(ctx.deps.db);
    const c = await call(ctx.app, 'POST', '/api/v1/admin/commission', {
      cookie: admin.cookie,
      body: { shardId, member: 'squid', body: '从今天起每天巡查' },
    });
    expect(c.status).toBe(200);
    const id = c.json.data.id as number;
    const news = await newsOf(id);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({
      shard_id: shardId,
      params: { member: 'squid', text: '从今天起每天巡查' },
    });

    const rm = await call(ctx.app, 'POST', `/api/v1/admin/commission/${id}/remove`, {
      cookie: admin.cookie,
      body: {},
    });
    expect(rm.status).toBe(200);
    expect(await newsOf(id)).toEqual([]);
    const list = await call(ctx.app, 'GET', '/api/v1/admin/commission', { cookie: admin.cookie });
    expect(list.json.data.find((n: { id: number }) => n.id === id).deletedAt).not.toBeNull();
    const again = await call(ctx.app, 'POST', `/api/v1/admin/commission/${id}/remove`, {
      cookie: admin.cookie,
      body: {},
    });
    expect(again.status).toBe(404);
    const actions = (
      await ctx.deps.db
        .selectFrom('audit_log')
        .select('action')
        .where('target', '=', `commission_notice:${id}`)
        .execute()
    ).map((a) => a.action);
    expect(actions.sort()).toEqual(['commission.notice', 'commission.remove']);
  });

  it('发给全部区服时每个区服各一条；区服不存在、委员不对、内容超长都拒绝', async () => {
    await createShard(ctx.deps.db);
    const shards = await ctx.deps.db.selectFrom('shard').select('id').execute();
    const c = await call(ctx.app, 'POST', '/api/v1/admin/commission', {
      cookie: admin.cookie,
      body: { shardId: null, member: 'mayor', body: '委员会成立' },
    });
    expect((await newsOf(c.json.data.id as number)).length).toBe(shards.length);
    for (const body of [
      { shardId: 999999, member: 'mayor', body: 'x' },
      { shardId: null, member: 'krab', body: 'x' },
      { shardId: null, member: 'mayor', body: 'x'.repeat(121) },
    ]) {
      const r = await call(ctx.app, 'POST', '/api/v1/admin/commission', { cookie: admin.cookie, body });
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
  });
});
