import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireShard, setAcquireState } from '../../../test/acquire';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const svc = () => t.game.acquire;
const news = (shardId: number) =>
  t.db.selectFrom('news').select(['type', 'rest_id', 'params']).where('shard_id', '=', shardId).execute();

describe('收购的新闻（收购 PR 3）', () => {
  it('强收 1,000 万以上发新闻（买家的店），不到不发', async () => {
    const shardId = await acquireShard(t);
    const buyer = await newRestaurant(t, { shardId, patch: { coin: 100_000_000 } });
    const big = await newRestaurant(t, { shardId, patch: { star_level: 2, name: '大店' } });
    const small = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    await setAcquireState(t, big.restaurantId, shardId, { base: 10_000_000 });
    await setAcquireState(t, small.restaurantId, shardId, { base: 9_999_999 });
    await svc().buy(buyer, { restId: big.restaurantId, way: 'acquire', expect: 10_000_000 });
    await svc().buy(buyer, { restId: small.restaurantId, way: 'acquire', expect: 9_999_999 });
    expect(await news(shardId)).toEqual([
      {
        type: 'acquire.big',
        rest_id: buyer.restaurantId,
        params: { restId: big.restaurantId, name: '大店', price: 10_000_000, way: 'acquire' },
      },
    ]);
  });

  it('赎身 1,000 万以上发新闻（赎身的店）', async () => {
    const shardId = await acquireShard(t);
    const owner = await newRestaurant(t, { shardId, patch: { name: '老板' } });
    const me = await newRestaurant(t, { shardId, patch: { coin: 20_000_000 } });
    await setAcquireState(t, me.restaurantId, shardId, {
      base: 10_000_000,
      owner_rest_id: owner.restaurantId,
    });
    await svc().redeem(me, { expect: 10_000_000 });
    expect(await news(shardId)).toEqual([
      { type: 'acquire.redeem', rest_id: me.restaurantId, params: { price: 10_000_000, ownerName: '老板' } },
    ]);
  });
});

describe('收购的报错带 scope（收购 PR 3：原因名和别的玩法重名）', () => {
  it('不能收购、没被收购', async () => {
    const shardId = await acquireShard(t);
    const me = await newRestaurant(t, { shardId });
    await expect(svc().buy(me, { restId: me.restaurantId, way: 'acquire', expect: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'self', scope: 'acquire' },
      },
    );
    await expect(svc().redeem(me, { expect: 1 })).rejects.toMatchObject({
      params: { reason: 'not_owned', scope: 'acquire' },
    });
    await expect(svc().tend(me)).rejects.toMatchObject({ params: { reason: 'not_owned', scope: 'acquire' } });
  });

  it('对方餐厅页带税率（确认框算对方得多少）', async () => {
    const shardId = await acquireShard(t);
    const me = await newRestaurant(t, { shardId });
    const other = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const r = await svc().rest(me, other.restaurantId);
    expect(r.taxRate).toBe(0.1);
  });
});
