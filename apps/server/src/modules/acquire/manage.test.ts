import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireShard, acquireStateOf, setAcquireState } from '../../../test/acquire';
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

describe('赎身（收购 PR 1）', () => {
  it('付身价，老板得 90%；店变回自主；3 天保护；热度不变；挂牌作废', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const me = await newRestaurant(t, { shardId, patch: { coin: 2_000_000, star_level: 2 } });
    await setState(me.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      heat: 1.2,
      list_rate: 0.5,
      list_until: soon(),
    });
    const r = await svc().redeem(me, { expect: 1_200_000 });
    expect(r.data).toEqual({ restId: me.restaurantId, price: 1_200_000, tax: 120_000, sellerGot: 1_080_000 });
    expect(await coin(me.restaurantId)).toBe(800_000);
    expect(await coin(owner.restaurantId)).toBe(1_080_000);
    const s = await state(me.restaurantId);
    expect(s).toMatchObject({ owner_rest_id: null, heat: 1.2, list_rate: null, list_until: null });
    expect(s.protected_until!.getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000);
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
    const other = await newRestaurant(t, { shardId, patch: { coin: 5_000_000 } });
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
  it('50%~100%、5% 一档，挂 3 天；只有老板能挂；撤牌', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId });
    const target = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setState(target.restaurantId, shardId, { owner_rest_id: owner.restaurantId });
    for (const rate of [0.45, 0.52]) {
      await expect(svc().list(owner, { restId: target.restaurantId, rate })).rejects.toMatchObject({
        params: { reason: 'list_rate', min: 0.5 },
      });
    }
    await expect(svc().list(target, { restId: target.restaurantId, rate: 0.5 })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
    const r = await svc().list(owner, { restId: target.restaurantId, rate: 0.75 });
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
