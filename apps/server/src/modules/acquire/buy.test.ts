import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireShard, acquireStateOf, setAcquireState } from '../../../test/acquire';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const svc = () => t.game.acquire;
const state = (id: number) => acquireStateOf(t, id);
const setState = (id: number, shardId: number, patch: Parameters<typeof setAcquireState>[3] = {}) =>
  setAcquireState(t, id, shardId, patch);
const soon = () => new Date(Date.now() + 86_400_000);
const coin = async (id: number) => (await restRow(t, id)).coin;

describe('强收（收购 PR 1）', () => {
  it('买家付身价，独立的目标店自己得 90%，10% 是税；店归买家；热度 +0.2', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { coin: 0, star_level: 2 } });
    await setState(target.restaurantId, shardId);
    const r = await svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 });
    expect(r.data).toEqual({
      restId: target.restaurantId,
      price: 1_000_000,
      tax: 100_000,
      sellerGot: 900_000,
    });
    expect(await coin(buyer.restaurantId)).toBe(4_000_000);
    expect(await coin(target.restaurantId)).toBe(900_000);
    expect(await state(target.restaurantId)).toMatchObject({ owner_rest_id: buyer.restaurantId, heat: 1.2 });
    const log = await t.db
      .selectFrom('acquire_log')
      .selectAll()
      .where('target_rest_id', '=', target.restaurantId)
      .execute();
    expect(log).toMatchObject([
      { kind: 'acquire', buyer_rest_id: buyer.restaurantId, price: 1_000_000, tax: 100_000 },
    ]);
  });

  it('已经被收购的店：钱给原老板，目标店自己一分不得；挂牌作废', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { coin: 0, star_level: 2 } });
    await setState(target.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      heat: 1.5,
      list_rate: 0.5,
      list_until: soon(),
    });
    await svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 1_500_000 });
    expect(await coin(owner.restaurantId)).toBe(1_350_000);
    expect(await coin(target.restaurantId)).toBe(0);
    expect(await state(target.restaurantId)).toMatchObject({
      owner_rest_id: buyer.restaurantId,
      heat: 1.7,
      list_rate: null,
      list_until: null,
    });
  });

  it('买挂牌：按折扣价付，热度 −0.1，钱给老板', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      heat: 1.2,
      list_rate: 0.5,
      list_until: soon(),
    });
    const r = await svc().buy(buyer, { restId: target.restaurantId, way: 'listed', expect: 600_000 });
    expect(r.data).toMatchObject({ price: 600_000, sellerGot: 540_000 });
    expect(await coin(owner.restaurantId)).toBe(540_000);
    expect(await state(target.restaurantId)).toMatchObject({
      owner_rest_id: buyer.restaurantId,
      heat: 1.1,
      list_rate: null,
      list_until: null,
    });
  });

  it('没挂牌、挂牌已过期时不能按挂牌价买', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId });
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      list_rate: 0.5,
      list_until: new Date(Date.now() - 1000),
    });
    await expect(
      svc().buy(buyer, { restId: target.restaurantId, way: 'listed', expect: 500_000 }),
    ).rejects.toMatchObject({ params: { reason: 'not_listed' } });
  });

  it('价格和页面上看到的不一样：拒绝，不扣钱，告诉现在的价格', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId);
    await expect(
      svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 999_999 }),
    ).rejects.toMatchObject({ params: { reason: 'price_changed', price: 1_000_000 } });
    expect(await coin(buyer.restaurantId)).toBe(5_000_000);
  });

  it('银币不够：报 NOT_ENOUGH，店不归他', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 10 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId);
    await expect(
      svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect((await state(target.restaurantId)).owner_rest_id).toBeNull();
  });

  it('还没有状态行的 2 星店：当场按近 7 天建行再买（没有收入时按下限 10 万）', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const r = await svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 100_000 });
    expect(r.data.price).toBe(100_000);
  });

  it.each<[string, Record<string, unknown>, Parameters<typeof setAcquireState>[3]]>([
    ['star', { star_level: 1 }, {}],
    ['protected', { star_level: 2 }, { protected_until: soon() }],
  ])('限制：%s', async (reason, patch, st) => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch });
    await setState(target.restaurantId, shardId, st);
    await expect(
      svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason } });
  });

  it('收自己、收自己名下的、别的区服的店都不行', async () => {
    const shardId = await acquireShard(t);
    const me = await newRestaurant(t, { shardId, patch: { coin: 5_000_000, star_level: 2 } });
    const mine = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(me.restaurantId, shardId);
    await setState(mine.restaurantId, shardId, { owner_rest_id: me.restaurantId });
    await expect(
      svc().buy(me, { restId: me.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({
      params: { reason: 'self' },
    });
    await expect(
      svc().buy(me, { restId: mine.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'mine' } });
    const far = await newRestaurant(t, { patch: { star_level: 2 } });
    await expect(
      svc().buy(me, { restId: far.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'other_shard' } });
  });

  it('被收购的人不能收购；同一对 7 天内不能再交易；一天最多被收 3 次；满 10 家不能再收', async () => {
    const shardId = await acquireShard(t);
    const rich = () => newRestaurant(t, { shardId, patch: { coin: 50_000_000, star_level: 2 } });
    const a = await rich();
    const b = await rich();
    const c = await rich();
    const d = await rich();
    await setState(b.restaurantId, shardId);
    await svc().buy(a, { restId: b.restaurantId, way: 'acquire', expect: 1_000_000 });
    // b 被 a 收购了：b 不能收购别人
    await setState(c.restaurantId, shardId);
    await expect(
      svc().buy(b, { restId: c.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'buyer_owned' } });
    // 同一对：b 回到自主经营，a 7 天内还是不能再收 b，b 也不能反过来收 a
    await setState(b.restaurantId, shardId, { owner_rest_id: null, heat: 1 });
    await setState(a.restaurantId, shardId);
    await expect(
      svc().buy(a, { restId: b.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'pair' } });
    await expect(
      svc().buy(b, { restId: a.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'pair' } });
    // 一天 3 次：c 被 a、d 各收一次，再补一条今天的记录凑满
    await svc().buy(a, { restId: c.restaurantId, way: 'acquire', expect: 1_000_000 });
    await svc().buy(d, { restId: c.restaurantId, way: 'acquire', expect: 1_200_000 });
    await t.db
      .insertInto('acquire_log')
      .values({
        shard_id: shardId,
        kind: 'acquire',
        buyer_rest_id: null,
        target_rest_id: c.restaurantId,
        seller_rest_id: null,
        price: 1,
        tax: 0,
        heat_after: 1,
        created_at: new Date(),
      })
      .execute();
    const e = await rich();
    await expect(
      svc().buy(e, { restId: c.restaurantId, way: 'acquire', expect: 1_400_000 }),
    ).rejects.toMatchObject({ params: { reason: 'daily' } });
    // 满 10 家
    for (let i = 0; i < 10; i++) {
      const x = await rich();
      await setState(x.restaurantId, shardId, { owner_rest_id: e.restaurantId });
    }
    const f = await rich();
    await setState(f.restaurantId, shardId);
    await expect(
      svc().buy(e, { restId: f.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'holdings' } });
  });

  it('名下有店的人被收购：名下的店照旧归他', async () => {
    const shardId = await acquireShard(t);
    const rich = () => newRestaurant(t, { shardId, patch: { coin: 50_000_000, star_level: 2 } });
    const a = await rich();
    const b = await rich();
    const c = await rich();
    await setState(c.restaurantId, shardId, { owner_rest_id: b.restaurantId });
    await setState(b.restaurantId, shardId);
    await svc().buy(a, { restId: b.restaurantId, way: 'acquire', expect: 1_000_000 });
    expect((await state(b.restaurantId)).owner_rest_id).toBe(a.restaurantId);
    expect((await state(c.restaurantId)).owner_rest_id).toBe(b.restaurantId);
  });

  it('蟹老板、封号的店不能收', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const banned = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(banned.restaurantId, shardId);
    const acc = (await restRow(t, banned.restaurantId)).account_id;
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', acc).execute();
    await expect(
      svc().buy(buyer, { restId: banned.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'banned' } });
    const npc = await newRestaurant(t, { shardId, patch: { star_level: 2, npc: true } });
    await setState(npc.restaurantId, shardId);
    await expect(
      svc().buy(buyer, { restId: npc.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'npc' } });
  });

  it('共用设备的账号：拒绝，拦截记录留下（事务回滚后也在），不扣钱', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId);
    const targetAcc = (await restRow(t, target.restaurantId)).account_id;
    await t.db
      .insertInto('login_trace')
      .values({ account_id: targetAcc, ip: '10.9.9.9', device_id: 'dev-shared-0001', last_seen: new Date() })
      .execute();
    const ctx = { ...buyer, ip: '10.1.1.1', deviceId: 'dev-shared-0001' };
    await expect(
      svc().buy(ctx, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'linked' } });
    const blocks = await t.db
      .selectFrom('acquire_block')
      .selectAll()
      .where('buyer_rest_id', '=', buyer.restaurantId)
      .execute();
    expect(blocks).toMatchObject([{ target_rest_id: target.restaurantId, reason: 'device' }]);
    expect(await coin(buyer.restaurantId)).toBe(5_000_000);
  });

  it('两个人同时收购同一家：只有一个成功，钱只扣一次', async () => {
    const shardId = await acquireShard(t);
    const a = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const b = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { coin: 0, star_level: 2 } });
    await setState(target.restaurantId, shardId);
    const rs = await Promise.allSettled([
      svc().buy(a, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 }),
      svc().buy(b, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ]);
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await coin(target.restaurantId)).toBe(900_000);
    expect([await coin(a.restaurantId), await coin(b.restaurantId)].sort()).toEqual([4_000_000, 5_000_000]);
  });

  it('功能关着：报 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await expect(
      svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 1 }),
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
