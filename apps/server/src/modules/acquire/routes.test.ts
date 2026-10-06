import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

async function openShard(): Promise<number> {
  const shardId = await createShard(ctx.deps.db);
  await ctx.deps.db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override: JSON.stringify({ features: { acquire: true } }) })
    .execute();
  return shardId;
}
const setRest = (id: number, patch: { coin?: number; star_level?: number }) =>
  ctx.deps.db.updateTable('restaurant').set(patch).where('id', '=', id).execute();

describe('收购接口（收购 PR 1）', () => {
  it('看一家店 → 收购 → 我的、身价榜、投资榜 → 挂牌 → 在售 → 对方看到自己的老板', async () => {
    const shardId = await openShard();
    const a = await playerIn(ctx, shardId);
    const b = await playerIn(ctx, shardId);
    await setRest(a.restId, { coin: 10_000_000 });
    await setRest(b.restId, { star_level: 2 });
    // 测试里都从 127.0.0.1 注册，会被当成关联账号拦下：给 b 换一个 IP
    await ctx.deps.db
      .updateTable('login_trace')
      .set({ ip: '10.20.30.40' })
      .where('account_id', '=', b.accountId)
      .execute();

    const rest = await call(ctx.app, 'GET', `/api/v1/acquire/rest/${b.restId}`, { cookie: a.cookie });
    expect(rest.status).toBe(200);
    expect(rest.json.data).toMatchObject({
      restId: b.restId,
      price: 100_000,
      heat: 1,
      owner: null,
      listed: null,
      acquireBlock: null,
      listedBlock: 'not_listed',
    });

    const buy = await call(ctx.app, 'POST', '/api/v1/acquire/buy', {
      cookie: a.cookie,
      body: { restId: b.restId, way: 'acquire', expect: 100_000 },
    });
    expect(buy.status).toBe(200);
    expect(buy.json.data).toMatchObject({ price: 100_000, sellerGot: 90_000 });

    const view = await call(ctx.app, 'GET', '/api/v1/acquire', { cookie: a.cookie });
    expect(view.json.data).toMatchObject({
      holdings: [{ restId: b.restId, price: 120_000, heat: 1.2 }],
      maxHoldings: 10,
      taxRate: 0.1,
    });

    const rank = await call(ctx.app, 'GET', '/api/v1/acquire/rank?board=price', { cookie: a.cookie });
    expect(rank.json.data.price[0]).toMatchObject({ restId: b.restId, owner: { restId: a.restId } });
    const invest = await call(ctx.app, 'GET', '/api/v1/acquire/rank?board=invest', { cookie: a.cookie });
    expect(invest.json.data.invest[0]).toMatchObject({ restId: a.restId, holdings: 1, value: 120_000 });

    const list = await call(ctx.app, 'POST', '/api/v1/acquire/list', {
      cookie: a.cookie,
      body: { restId: b.restId, rate: 0.5 },
    });
    expect(list.status).toBe(200);
    const market = await call(ctx.app, 'GET', '/api/v1/acquire/market', { cookie: a.cookie });
    expect(market.json.data.items).toMatchObject([
      { restId: b.restId, listed: { rate: 0.5, price: 60_000 } },
    ]);

    const mine = await call(ctx.app, 'GET', '/api/v1/acquire', { cookie: b.cookie });
    expect(mine.json.data.me).toMatchObject({ restId: b.restId, owner: { restId: a.restId } });

    // 关联账号：页面上就标出来，不用等点了才报错
    const c = await playerIn(ctx, shardId);
    await setRest(c.restId, { star_level: 2 });
    const linked = await call(ctx.app, 'GET', `/api/v1/acquire/rest/${c.restId}`, { cookie: a.cookie });
    expect(linked.json.data).toMatchObject({ acquireBlock: 'linked' });

    // a 看自己名下的店：不能再收（mine）
    const again = await call(ctx.app, 'GET', `/api/v1/acquire/rest/${b.restId}`, { cookie: a.cookie });
    expect(again.json.data).toMatchObject({ acquireBlock: 'mine' });
  });

  it('不到 2 星、还没有身价的店：给 no_state，不建行', async () => {
    const shardId = await openShard();
    const a = await playerIn(ctx, shardId);
    const b = await playerIn(ctx, shardId);
    const r = await call(ctx.app, 'GET', `/api/v1/acquire/rest/${b.restId}`, { cookie: a.cookie });
    expect(r.json.data).toMatchObject({ acquireBlock: 'no_state', listedBlock: 'no_state' });
    const row = await ctx.deps.db
      .selectFrom('acquire_state')
      .select('rest_id')
      .where('rest_id', '=', b.restId)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('参数不对报 VALIDATION_FAILED；别的区服的店 404；功能关着报 FEATURE_DISABLED', async () => {
    const shardId = await openShard();
    const a = await playerIn(ctx, shardId);
    const bad = await call(ctx.app, 'POST', '/api/v1/acquire/buy', {
      cookie: a.cookie,
      body: { restId: 1, way: 'steal', expect: 1 },
    });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    const far = await playerIn(ctx, await openShard());
    expect(
      (await call(ctx.app, 'GET', `/api/v1/acquire/rest/${far.restId}`, { cookie: a.cookie })).status,
    ).toBe(404);
    const off = await playerIn(ctx, await createShard(ctx.deps.db));
    expect((await call(ctx.app, 'GET', '/api/v1/acquire', { cookie: off.cookie })).json.code).toBe(
      'FEATURE_DISABLED',
    );
  });
});
