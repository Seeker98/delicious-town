import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireShard, setAcquireState } from '../../../test/acquire';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const svc = () => t.game.acquire;
const priceOfRest = async (id: number) => {
  const s = await t.db
    .selectFrom('acquire_state')
    .select(['base', 'heat'])
    .where('rest_id', '=', id)
    .executeTakeFirstOrThrow();
  return Math.round(s.base * s.heat);
};

describe('串通不赚钱（收购 PR 1，设计 §1.6）', () => {
  it('来回强收、收完立刻赎身、半价挂牌给小号：几家店的银币合计只减少，减少的正好是税', async () => {
    const shardId = await acquireShard(t);
    const rich = () => newRestaurant(t, { shardId, patch: { coin: 100_000_000, star_level: 2 } });
    const a = await rich();
    const b = await rich();
    const c = await rich();
    const d = await rich();
    const ids = [a, b, c, d].map((x) => x.restaurantId);
    const total = async () => {
      let s = 0;
      for (const id of ids) s += (await restRow(t, id)).coin;
      return s;
    };
    const taxes = async () =>
      Number(
        (
          await t.db
            .selectFrom('acquire_log')
            .select((eb) => eb.fn.sum<number>('tax').as('t'))
            .where('shard_id', '=', shardId)
            .executeTakeFirstOrThrow()
        ).t ?? 0,
      );
    await setAcquireState(t, a.restaurantId, shardId, { base: 5_000_000 });
    await setAcquireState(t, b.restaurantId, shardId, { base: 5_000_000 });
    const start = await total();

    // a 收 b，b 立刻赎身
    await svc().buy(a, { restId: b.restaurantId, way: 'acquire', expect: await priceOfRest(b.restaurantId) });
    await svc().redeem(b, { expect: await priceOfRest(b.restaurantId) });
    // c 收 a，半价挂牌给“小号” d
    await svc().buy(c, { restId: a.restaurantId, way: 'acquire', expect: await priceOfRest(a.restaurantId) });
    await svc().list(c, { restId: a.restaurantId, rate: 0.5 });
    const listed = Math.round((await priceOfRest(a.restaurantId)) * 0.5);
    await svc().buy(d, { restId: a.restaurantId, way: 'listed', expect: listed });
    // d 放手：不收钱也不给钱
    await svc().release(d, { restId: a.restaurantId });

    const end = await total();
    expect(await taxes()).toBeGreaterThan(0);
    expect(start - end).toBe(await taxes());
  });
});
