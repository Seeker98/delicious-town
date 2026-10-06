import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { acquireShard, setAcquireState } from '../../../test/acquire';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-10', 12)));

const svc = () => t.game.acquire;
const foods = async (restId: number) => {
  const rows = await t.db
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num'])
    .where('rest_id', '=', restId)
    .execute();
  return new Map(rows.map((r) => [r.foods_id, r.num + r.fridge_num]));
};
const total = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** 一家被收购的店（老板另开一家） */
async function owned() {
  const shardId = await acquireShard(t);
  const owner = await newRestaurant(t, { shardId, patch: { name: '老板的店' } });
  const me = await newRestaurant(t, { shardId, patch: { level: 3 } });
  await setAcquireState(t, me.restaurantId, shardId, { owner_rest_id: owner.restaurantId });
  return { shardId, owner, me };
}

describe('打理（收购 PR 2）', () => {
  it('被收购的店替老板打理：得 5 份食材（等级不超过店的等级）、记下今天、写日志', async () => {
    const { owner, me } = await owned();
    const before = await foods(me.restaurantId);
    const r = await svc().tend(me);
    const after = await foods(me.restaurantId);
    expect(total(after) - total(before)).toBe(5);
    expect(r.data.foods.reduce((a, f) => a + f.num, 0)).toBe(5);
    for (const f of r.data.foods) expect(t.deps.config.requireFood(f.id).level).toBeLessThanOrEqual(3);
    expect(
      await t.db.selectFrom('acquire_tend').select('day').where('rest_id', '=', me.restaurantId).execute(),
    ).toEqual([{ day: '2026-10-10' }]);
    const log = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', me.restaurantId)
      .where('type', '=', 'acquire.tended')
      .executeTakeFirstOrThrow();
    expect(log.params).toEqual({ owner: owner.restaurantId, ownerName: '老板的店', n: 5 });
  });

  it('一天一次；第二天又能打理', async () => {
    const { me } = await owned();
    await svc().tend(me);
    const once = total(await foods(me.restaurantId));
    await expect(svc().tend(me)).rejects.toMatchObject({ params: { reason: 'tended' } });
    expect(total(await foods(me.restaurantId))).toBe(once);
    t.clock.set(gameTime('2026-10-11', 0, 1));
    await svc().tend(me);
    expect(total(await foods(me.restaurantId))).toBe(once + 5);
  });

  it('没被收购不能打理', async () => {
    const shardId = await acquireShard(t);
    const free = await newRestaurant(t, { shardId });
    await expect(svc().tend(free)).rejects.toMatchObject({ params: { reason: 'not_owned' } });
    await setAcquireState(t, free.restaurantId, shardId, { owner_rest_id: null });
    await expect(svc().tend(free)).rejects.toMatchObject({ params: { reason: 'not_owned' } });
  });

  it('同时点两次：只成功一次，食材只发一份', async () => {
    const { me } = await owned();
    const before = total(await foods(me.restaurantId));
    const rs = await Promise.allSettled([svc().tend(me), svc().tend(me)]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(total(await foods(me.restaurantId)) - before).toBe(5);
  });

  it('收购关着的区服不能打理', async () => {
    const { me } = await owned();
    const shardId = (await restRow(t, me.restaurantId)).shard_id;
    await t.db
      .updateTable('shard_config')
      .set({ override: JSON.stringify({ features: { acquire: false } }) })
      .where('shard_id', '=', shardId)
      .execute();
    t.game.shards.invalidate(shardId);
    await expect(svc().tend(me)).rejects.toThrow();
  });
});
