import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { createGame } from '../../game';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const R = '/api/v1/restaurant';

async function playerIn(shardId: number) {
  const u = await registerUser(ctx.app);
  await call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
  return u;
}
const create = (cookie: string, name: string, headers?: Record<string, string>) =>
  call(ctx.app, 'POST', `${R}/create`, { cookie, body: { name }, headers });

describe('开店', () => {
  it('新店送开局食材：新手街 3 道菜能立刻学会，另有 1~3 级万能食材', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await playerIn(shardId);
    const r = await create(u.cookie, '开局食材店');
    expect(r.status).toBe(200);
    for (const cookbookId of [441, 442, 446]) {
      const learn = await call(ctx.app, 'POST', '/api/v1/cookbook/learn', {
        cookie: u.cookie,
        body: { cookbookId },
      });
      expect(learn.status).toBe(200);
    }
    const cup = await call(ctx.app, 'GET', '/api/v1/cupboard/list', { cookie: u.cookie });
    const nums = new Map(
      cup.json.data.items.map((x: { foodsId: number; num: number }) => [x.foodsId, x.num]),
    );
    expect([nums.get(467), nums.get(468), nums.get(469)]).toEqual([3, 3, 3]);
  });

  it('新店初始值与规格一致（规格书 02 §2.1）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await playerIn(shardId);
    const before = Date.now();
    const r = await create(u.cookie, '  开张大吉店  ');
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d).toMatchObject({
      shardId,
      name: '开张大吉店',
      level: 1,
      exp: 0,
      expToNext: 500,
      coin: 100000,
      diamond: 0,
      strength: 100,
      strengthMax: 100,
      oil: 1000,
      oilMax: 1000,
      starLevel: 0,
      streetId: 0,
      streetName: '新手街',
      renown: 10,
      attrLeft: 3,
      luck: 0,
      tableNum: 4,
      cupboardNum: 100,
      storeNum: 20,
      foodsMaxNum: 999,
      foodsLockNum: 15,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    });
    expect(d.tables).toHaveLength(4);
    expect(d.effects.map((e: { sourceId: number }) => e.sourceId).sort()).toEqual([100, 140, 81]);
    const opening = d.effects.find((e: { sourceId: number }) => e.sourceId === 81);
    expect(opening.name).toBe('开张大吉');
    const expires = new Date(opening.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 360 * 3600_000 - 5000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 360 * 3600_000 + 5000);
    expect(d.effects.find((e: { sourceId: number }) => e.sourceId === 140)).toMatchObject({
      sourceType: 'street',
      expiresAt: null,
    });

    const me = await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    expect(me.json.data.restaurantId).toBe(d.id);
    const overview = await call(ctx.app, 'GET', `${R}/overview`, { cookie: u.cookie });
    expect(overview.json.data).toEqual(d);
  });

  it('写入仓库、流水、新闻', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await playerIn(shardId);
    const { json } = await create(u.cookie, '记录小店');
    const restId = json.data.id as number;
    const db = ctx.deps.db;
    const items = await db
      .selectFrom('store_item')
      .select(['goods_id', 'num'])
      .where('rest_id', '=', restId)
      .execute();
    expect(items.map((i) => i.goods_id).sort((a, b) => a - b)).toEqual([81, 100, 140]);
    const ledger = await db.selectFrom('ledger').selectAll().where('rest_id', '=', restId).execute();
    expect(ledger.filter((l) => l.kind === 'goods')).toHaveLength(3);
    expect(ledger.filter((l) => l.kind === 'foods')).toHaveLength(10);
    expect(ledger.every((l) => l.source === 'restaurant.create')).toBe(true);
    const news = await db
      .selectFrom('news')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('type', '=', 'restaurant.open')
      .execute();
    expect(news[0]!.params).toEqual({ name: '记录小店' });
  });

  it('名称校验', async () => {
    const u = await playerIn(await createShard(ctx.deps.db));
    const reserved = await create(u.cookie, '镇长小馆');
    expect(reserved.status).toBe(400);
    expect(reserved.json).toMatchObject({ code: 'RESTAURANT_NAME_INVALID', params: { reason: 'reserved' } });
    expect((await create(u.cookie, '好吃😋')).json.params.reason).toBe('bad_chars');
    expect((await create(u.cookie, '好吃！')).json.params.reason).toBe('bad_chars');
    expect((await create(u.cookie, '   ')).json.params.reason).toBe('empty');
  });

  it('同区服重名（去掉首尾空格后）不行，不同区服可以', async () => {
    const s1 = await createShard(ctx.deps.db);
    const s2 = await createShard(ctx.deps.db);
    await create((await playerIn(s1)).cookie, '同名小店');
    const dup = await create((await playerIn(s1)).cookie, ' 同名小店 ');
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe('RESTAURANT_NAME_TAKEN');
    expect((await create((await playerIn(s2)).cookie, '同名小店')).status).toBe(200);
  });

  it('同一区服只能开一家店，连点也只开一家', async () => {
    const u = await playerIn(await createShard(ctx.deps.db));
    const [a, b] = await Promise.all([create(u.cookie, '连点店甲'), create(u.cookie, '连点店乙')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((x) => x.status === 409)!.json.code).toBe('RESTAURANT_EXISTS');
    const again = await create(u.cookie, '再开一家');
    expect(again.json.code).toBe('RESTAURANT_EXISTS');
  });

  it('相同幂等键重复提交只开一家，返回相同结果', async () => {
    const u = await playerIn(await createShard(ctx.deps.db));
    const headers = { 'idempotency-key': `idem${Math.random().toString(36).slice(2, 12)}` };
    const a = await create(u.cookie, '幂等小店', headers);
    const b = await create(u.cookie, '幂等小店', headers);
    expect(a.status).toBe(200);
    expect(b.json).toEqual(a.json);
  });

  it('没选区服 / 没开店', async () => {
    const u = await registerUser(ctx.app);
    expect((await create(u.cookie, '无区服店')).json.code).toBe('NO_SHARD_SELECTED');
    const v = await playerIn(await createShard(ctx.deps.db));
    expect((await call(ctx.app, 'GET', `${R}/overview`, { cookie: v.cookie })).json.code).toBe(
      'RESTAURANT_NOT_FOUND',
    );
  });

  it('区服关闭或关闭了开店功能时不能开店', async () => {
    const closedLater = await createShard(ctx.deps.db);
    const u = await playerIn(closedLater);
    await ctx.deps.db.updateTable('shard').set({ status: 'closed' }).where('id', '=', closedLater).execute();
    expect((await create(u.cookie, '关服店')).json.code).toBe('SHARD_CLOSED');

    const noRest = await createShard(ctx.deps.db);
    await ctx.deps.db
      .insertInto('shard_config')
      .values({ shard_id: noRest, override: JSON.stringify({ features: { restaurant: false } }) })
      .execute();
    const v = await playerIn(noRest);
    expect((await create(v.cookie, '禁开店')).json.code).toBe('FEATURE_DISABLED');
  });

  it('开店过程中另一个标签页切换了区服，会话里的区服和餐厅仍然配对', async () => {
    const s1 = await createShard(ctx.deps.db);
    const s2 = await createShard(ctx.deps.db);
    const u = await playerIn(s1);
    const token = u.cookie.slice('dt_sid='.length);
    const session = { token, data: (await ctx.deps.sessions.get(token))! };
    await ctx.deps.sessions.update(token, { shardId: s2, restaurantId: null });
    const svc = createGame(ctx.deps).restaurant;
    const dto = await svc.create(session, '跨服小店');
    expect(await ctx.deps.sessions.get(token)).toMatchObject({ shardId: s1, restaurantId: dto.id });
  });

  it('同一账号在两个区服各开一家，数据互不影响', async () => {
    const s1 = await createShard(ctx.deps.db);
    const s2 = await createShard(ctx.deps.db);
    const u = await registerUser(ctx.app);
    const select = (shardId: number) =>
      call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
    await select(s1);
    const first = (await create(u.cookie, '一服小店')).json.data;
    await select(s2);
    const second = (await create(u.cookie, '二服小店')).json.data;
    expect(second.id).not.toBe(first.id);

    await ctx.deps.db.updateTable('restaurant').set({ coin: 1 }).where('id', '=', first.id).execute();
    expect((await call(ctx.app, 'GET', `${R}/overview`, { cookie: u.cookie })).json.data).toMatchObject({
      name: '二服小店',
      coin: 100000,
    });
    expect((await select(s1)).json.data.restaurantId).toBe(first.id);
    expect((await call(ctx.app, 'GET', `${R}/overview`, { cookie: u.cookie })).json.data).toMatchObject({
      name: '一服小店',
      coin: 1,
    });
  });
});
