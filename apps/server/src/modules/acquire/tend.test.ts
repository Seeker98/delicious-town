import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { acquireShard, acquireStateOf, setAcquireState } from '../../../test/acquire';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-10', 12)));

const svc = () => t.game.acquire;
const PACK = () => t.deps.config.tuning.acquire.tendPackGoods;
const coin = async (id: number) => (await restRow(t, id)).coin;
const packs = async (restId: number) =>
  (
    await t.db
      .selectFrom('store_item')
      .select('num')
      .where('rest_id', '=', restId)
      .where('goods_id', '=', PACK())
      .executeTakeFirst()
  )?.num ?? 0;

/** 老板名下一家店：基础身价 3,395,000（日均 97 万：打理付 9,700，送 2 个补给包） */
async function owned(base = 3_395_000) {
  const shardId = await acquireShard(t);
  const owner = await newRestaurant(t, { shardId, patch: { name: '老板的店', coin: 1_000_000 } });
  const store = await newRestaurant(t, { shardId, patch: { name: '小熊面馆' } });
  await setAcquireState(t, store.restaurantId, shardId, {
    owner_rest_id: owner.restaurantId,
    base,
    acquired_at: gameTime('2026-10-08', 9),
  });
  return { shardId, owner, store };
}

describe('老板打理（收购改版 2026-10-16）', () => {
  it('付这家日均的 1%（销毁），送店补给包，记下打理时间，两边写动态', async () => {
    const { owner, store } = await owned();
    const r = await svc().tend(owner, { restId: store.restaurantId });
    expect(r.data).toEqual({ restId: store.restaurantId, cost: 9_700, packs: 2 });
    expect(await coin(owner.restaurantId)).toBe(1_000_000 - 9_700);
    expect(await packs(store.restaurantId)).toBe(2);
    expect((await acquireStateOf(t, store.restaurantId)).tended_at).toEqual(t.clock.now);
    expect(
      await t.db
        .selectFrom('acquire_tend')
        .select(['day', 'owner_rest_id', 'cost', 'packs'])
        .where('rest_id', '=', store.restaurantId)
        .execute(),
    ).toEqual([{ day: '2026-10-10', owner_rest_id: owner.restaurantId, cost: 9_700, packs: 2 }]);
    const log = async (restId: number, type: string) =>
      (
        await t.db
          .selectFrom('rest_log')
          .select('params')
          .where('rest_id', '=', restId)
          .where('type', '=', type)
          .executeTakeFirstOrThrow()
      ).params;
    expect(await log(owner.restaurantId, 'acquire.tended')).toEqual({
      restId: store.restaurantId,
      name: '小熊面馆',
      cost: 9_700,
      packs: 2,
    });
    expect(await log(store.restaurantId, 'acquire.tendedBy')).toEqual({ ownerName: '老板的店', packs: 2 });
  });

  it('日均不到 43 万不送包，成本照付', async () => {
    const { owner, store } = await owned(1_260_000);
    const r = await svc().tend(owner, { restId: store.restaurantId });
    expect(r.data).toMatchObject({ cost: 3_600, packs: 0 });
    expect(await packs(store.restaurantId)).toBe(0);
  });

  it('一天一次；第二天又能打理', async () => {
    const { owner, store } = await owned();
    await svc().tend(owner, { restId: store.restaurantId });
    await expect(svc().tend(owner, { restId: store.restaurantId })).rejects.toMatchObject({
      params: { reason: 'tended' },
    });
    expect(await coin(owner.restaurantId)).toBe(1_000_000 - 9_700);
    t.clock.set(gameTime('2026-10-11', 0, 1));
    await svc().tend(owner, { restId: store.restaurantId });
    expect(await coin(owner.restaurantId)).toBe(1_000_000 - 19_400);
    expect(await packs(store.restaurantId)).toBe(4);
  });

  it('不是老板不能打理；被收购的店自己也不能', async () => {
    const { shardId, store } = await owned();
    const other = await newRestaurant(t, { shardId });
    await expect(svc().tend(other, { restId: store.restaurantId })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
    await expect(svc().tend(store, { restId: store.restaurantId })).rejects.toMatchObject({
      params: { reason: 'not_owner' },
    });
  });

  it('银币不够：报 NOT_ENOUGH，不算打理', async () => {
    const { owner, store } = await owned();
    await t.db.updateTable('restaurant').set({ coin: 100 }).where('id', '=', owner.restaurantId).execute();
    await expect(svc().tend(owner, { restId: store.restaurantId })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
    expect((await acquireStateOf(t, store.restaurantId)).tended_at).toBeNull();
  });

  it('和店是关联账号（共用设备）：不能打理', async () => {
    const { owner, store } = await owned();
    const acc = (await restRow(t, store.restaurantId)).account_id;
    await t.db
      .insertInto('login_trace')
      .values({ account_id: acc, ip: '10.8.8.8', device_id: 'dev-tend-link-01', last_seen: t.clock.now })
      .execute();
    await expect(
      svc().tend({ ...owner, deviceId: 'dev-tend-link-01' }, { restId: store.restaurantId }),
    ).rejects.toMatchObject({ params: { reason: 'linked' } });
    expect(await coin(owner.restaurantId)).toBe(1_000_000);
  });

  it('同时点两次：只成功一次，只扣一次钱', async () => {
    const { owner, store } = await owned();
    const rs = await Promise.allSettled([
      svc().tend(owner, { restId: store.restaurantId }),
      svc().tend(owner, { restId: store.restaurantId }),
    ]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await coin(owner.restaurantId)).toBe(1_000_000 - 9_700);
    expect(await packs(store.restaurantId)).toBe(2);
  });

  it('全部打理：跳过今天打理过的和关联账号的店，合计成本', async () => {
    const { shardId, owner, store } = await owned();
    const b = await newRestaurant(t, { shardId });
    const c = await newRestaurant(t, { shardId });
    const linked = await newRestaurant(t, { shardId });
    for (const x of [b, c, linked])
      await setAcquireState(t, x.restaurantId, shardId, {
        owner_rest_id: owner.restaurantId,
        base: 1_505_000,
      });
    await svc().tend(owner, { restId: c.restaurantId });
    const acc = (await restRow(t, linked.restaurantId)).account_id;
    await t.db
      .insertInto('login_trace')
      .values({ account_id: acc, ip: '10.8.8.9', device_id: 'dev-tend-link-02', last_seen: t.clock.now })
      .execute();
    const ctx = { ...owner, deviceId: 'dev-tend-link-02' };
    const r = await svc().tendAll(ctx);
    expect(r.data.items.map((x) => x.restId).sort()).toEqual([store.restaurantId, b.restaurantId].sort());
    expect(r.data.cost).toBe(9_700 + 4_300);
    expect(await packs(b.restaurantId)).toBe(1);
    // 没打理的只剩关联账号的店：报关联，不报“打理过了”（代码审查 2026-10-19）
    await expect(svc().tendAll(ctx)).rejects.toMatchObject({ params: { reason: 'linked' } });
  });

  it('收购关着的区服不能打理', async () => {
    const { owner, store } = await owned();
    const shardId = (await restRow(t, store.restaurantId)).shard_id;
    await t.db
      .updateTable('shard_config')
      .set({ override: JSON.stringify({ features: { acquire: false } }) })
      .where('shard_id', '=', shardId)
      .execute();
    t.game.shards.invalidate(shardId);
    await expect(svc().tend(owner, { restId: store.restaurantId })).rejects.toThrow();
  });
});
