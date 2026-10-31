import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireBuyer, acquireShard, acquireStateOf, setAcquireState } from '../../../test/acquire';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';

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

describe('赎身（收购 PR 1；改版 2026-10-16）', () => {
  it('按基础身价付（不乘热度），老板得 60%，销毁 30%，税 10%；店变回自主；3 天保护；热度不变', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const me = await newRestaurant(t, { shardId, patch: { coin: 2_000_000, star_level: 2 } });
    await setState(me.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      heat: 1.2,
      tended_at: new Date(),
    });
    const r = await svc().redeem(me, { expect: 1_000_000 });
    expect(r.data).toEqual({
      restId: me.restaurantId,
      price: 1_000_000,
      sellerGot: 600_000,
      storeGot: 0,
      burn: 300_000,
      tax: 100_000,
    });
    expect(await coin(me.restaurantId)).toBe(1_000_000);
    expect(await coin(owner.restaurantId)).toBe(600_000);
    const s = await state(me.restaurantId);
    expect(s).toMatchObject({
      owner_rest_id: null,
      heat: 1.2,
      list_rate: null,
      list_until: null,
      tended_at: null,
    });
    expect(s.protected_until!.getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000);
  });

  it('老板被封号、或和这家店共用设备 / IP：照常赎身，老板那 60% 销毁不给（和让渡退回店一样）', async () => {
    for (const how of ['banned', 'linked'] as const) {
      const shardId = await acquireShard(t);
      const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
      const me = await newRestaurant(t, { shardId, patch: { coin: 2_000_000, star_level: 2 } });
      await setState(me.restaurantId, shardId, { owner_rest_id: owner.restaurantId, tended_at: new Date() });
      const ownerAcc = (await restRow(t, owner.restaurantId)).account_id;
      const myAcc = (await restRow(t, me.restaurantId)).account_id;
      if (how === 'banned')
        await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', ownerAcc).execute();
      else
        await t.db
          .insertInto('login_trace')
          .values(
            [ownerAcc, myAcc].map((account_id) => ({
              account_id,
              ip: '10.7.7.71',
              device_id: 'dev-redeem-linked',
              last_seen: new Date(),
            })),
          )
          .execute();
      const r = await svc().redeem(me, { expect: 1_000_000 });
      expect(r.data, how).toMatchObject({ sellerGot: 0, burn: 900_000, tax: 100_000 });
      expect(await coin(owner.restaurantId), how).toBe(0);
      expect(await coin(me.restaurantId), how).toBe(1_000_000);
    }
  });

  it('老板挂牌比基础身价便宜时按挂牌价赎；挂牌作废', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const me = await newRestaurant(t, { shardId, patch: { coin: 2_000_000, star_level: 2 } });
    await setState(me.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      heat: 1.2,
      list_rate: 0.5,
      list_until: soon(),
    });
    const r = await svc().redeem(me, { expect: 600_000 });
    expect(r.data).toMatchObject({ price: 600_000, sellerGot: 360_000, burn: 180_000, tax: 60_000 });
    expect(await state(me.restaurantId)).toMatchObject({ list_rate: null, list_until: null });
  });

  it('没被收购不能赎身；价格变了拒绝、不扣钱', async () => {
    const shardId = await acquireShard(t);
    const me = await newRestaurant(t, { shardId, patch: { coin: 2_000_000, star_level: 2 } });
    await setState(me.restaurantId, shardId);
    await expect(svc().redeem(me, { expect: 1_000_000 })).rejects.toMatchObject({
      params: { reason: 'not_owned' },
    });
    const owner = await newRestaurant(t, { shardId });
    await setState(me.restaurantId, shardId, { owner_rest_id: owner.restaurantId });
    await expect(svc().redeem(me, { expect: 5 })).rejects.toMatchObject({
      params: { reason: 'price_changed', price: 1_000_000 },
    });
    expect(await coin(me.restaurantId)).toBe(2_000_000);
  });

  it('赎身后保护期内不能被收购', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId });
    const other = await acquireBuyer(t, shardId, { coin: 5_000_000 });
    const me = await newRestaurant(t, { shardId, patch: { coin: 2_000_000, star_level: 2 } });
    await setState(me.restaurantId, shardId, { owner_rest_id: owner.restaurantId });
    await svc().redeem(me, { expect: 1_000_000 });
    await expect(
      svc().buy(other, { restId: me.restaurantId, way: 'acquire', expect: 1_000_000 }),
    ).rejects.toMatchObject({ params: { reason: 'protected' } });
  });
});

describe('放手（收购 PR 1）', () => {
  it('免费，店变回自主，没有保护期，热度不变；只有老板能放', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const other = await newRestaurant(t, { shardId });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId, { owner_rest_id: owner.restaurantId, heat: 1.4 });
    await expect(svc().release(other, { restId: target.restaurantId })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
    await expect(svc().release(target, { restId: target.restaurantId })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
    await svc().release(owner, { restId: target.restaurantId });
    expect(await state(target.restaurantId)).toMatchObject({
      owner_rest_id: null,
      heat: 1.4,
      protected_until: null,
    });
    expect(await coin(owner.restaurantId)).toBe(0);
  });
});

describe('挂牌、撤牌（收购 PR 1）', () => {
  it('50%~120%、5% 一档，挂 3 天；只有老板能挂；撤牌', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId, { owner_rest_id: owner.restaurantId });
    for (const rate of [0.45, 0.52, 1.25]) {
      await expect(svc().list(owner, { restId: target.restaurantId, rate })).rejects.toMatchObject({
        params: { reason: 'list_rate', min: 0.5, max: 1.2 },
      });
    }
    await expect(svc().list(target, { restId: target.restaurantId, rate: 0.5 })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
    expect(await eventCount(t, owner.restaurantId, 'acquire.list')).toBe(0);
    const r = await svc().list(owner, { restId: target.restaurantId, rate: 0.75 });
    // 支线“收购”（问题记录 515）：挂牌记一次，撤牌不记
    expect(await eventCount(t, owner.restaurantId, 'acquire.list')).toBe(1);
    expect(r.data.rate).toBe(0.75);
    expect(new Date(r.data.until).getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000);
    expect(await state(target.restaurantId)).toMatchObject({ list_rate: 0.75 });
    await svc().unlist(owner, { restId: target.restaurantId });
    expect(await state(target.restaurantId)).toMatchObject({ list_rate: null, list_until: null });
  });

  it('没有状态行的店（不在名下）不能挂牌', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await expect(svc().list(owner, { restId: target.restaurantId, rate: 0.5 })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
  });
});

describe('收购的餐厅动态写在对的店（backlog 1010 补测）', () => {
  const feedTypes = async (ctx: Parameters<typeof t.game.social.reads.feed>[0]) =>
    (await t.game.social.reads.feed(ctx, { limit: 30 })).items.map((x) => x.type);

  it('被收购的店看到被收购；赎身时原老板看到被赎回；放手时被放的店看到', async () => {
    const shardId = await acquireShard(t);
    const buyer = await acquireBuyer(t, shardId, { coin: 5_000_000 });
    const target = await newRestaurant(t, { shardId, patch: { coin: 5_000_000, star_level: 2 } });
    await setState(target.restaurantId, shardId);
    await svc().buy(buyer, { restId: target.restaurantId, way: 'acquire', expect: 1_000_000 });
    expect(await feedTypes(target)).toContain('acquire.taken');
    expect(await feedTypes(buyer)).not.toContain('acquire.taken');

    await setState(target.restaurantId, shardId, {
      owner_rest_id: buyer.restaurantId,
      protected_until: null,
    });
    await svc().redeem(target, { expect: 1_000_000 });
    expect(await feedTypes(buyer)).toContain('acquire.lost');
    expect(await feedTypes(target)).not.toContain('acquire.lost');

    const other = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(other.restaurantId, shardId, { owner_rest_id: buyer.restaurantId });
    await svc().release(buyer, { restId: other.restaurantId });
    expect(await feedTypes(other)).toContain('acquire.freed');
    expect(await feedTypes(buyer)).not.toContain('acquire.freed');
  });
});
