import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../test/game';
import { createDb } from '../db';
import { grantGoods } from '../modules/store/grant';

/**
 * 玩家操作的事务里不能再向连接池要连接：池子用满时（整点抢特价）所有事务互相等待，API 永久挂死。
 * 这里让游戏只用 1 个连接的池子；任何在事务里走 d.db 的查询都会卡住。
 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ db: createDb(process.env.DATABASE_URL!, 1) });
});
afterAll(async () => {
  await t.deps.db.destroy();
  await t.close();
});

/** 在 5 秒内结束（成功或业务错误都行），不能挂住 */
async function finishes(p: Promise<unknown>): Promise<void> {
  const hung = Symbol('hung');
  const r = await Promise.race([
    p.then(
      () => 'done',
      (e: unknown) => (e instanceof Error && 'code' in e ? 'done' : Promise.reject(e)),
    ),
    new Promise((resolve) => setTimeout(() => resolve(hung), 5000)),
  ]);
  expect(r).not.toBe(hung);
}

describe('单连接连接池', () => {
  it('菜场购买不会在事务里另要连接', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const now = gameTime('2026-09-30', 10);
    t.clock.set(now);
    await t.game.market.refresh(ctx.shardId, 0, latestSlot(now, [10]), now);
    t.clock.set(new Date(now.getTime() + 60 * 60_000));
    const item = await t.db
      .selectFrom('market_item')
      .select('id')
      .where('shard_id', '=', ctx.shardId)
      .where('shelf', '=', 0)
      .executeTakeFirstOrThrow();
    await finishes(t.game.market.buy({ ...ctx, ip: '10.9.9.9' }, { itemId: item.id, num: 1 }));
  }, 20_000);

  it('合成分解不会在事务里另要连接', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000 }, foods: { 302: 3 } });
    await finishes(t.game.cupboard.handle(ctx, { foodsId: 302, way: 'decompose', num: 1 }));
  }, 20_000);

  it('赶走痞老板不会在事务里另要连接', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: no === 1 ? 7 : 0 }));
    const ctx = await newRestaurant(t, { patch: { level: 16, strength: 100 }, tables });
    await t.game.world.ensure(ctx.shardId);
    await t.game.world.setPlankton(t.db, ctx.shardId, ctx.restaurantId);
    await grantGoods(t.db, t.deps.config, ctx.restaurantId, 363, 1, new Date());
    await finishes(t.game.growth.drivePlankton(ctx, 'strength'));
  }, 20_000);
});

describe('单连接连接池：区服设置缓存没命中（148-4 终审）', () => {
  it('事务里发行为事件时，活动处理器读区服设置不另要连接', async () => {
    const ctx = await newRestaurant(t);
    // 模拟"操作开始时命中缓存、事务里却没命中"（后台改加成清了全部缓存）
    const emit = t.deps.db.transaction().execute(async (tx) => {
      t.game.shards.invalidateAll();
      await t.deps.bus.emit(tx, {
        name: 'action',
        shardId: ctx.shardId,
        restId: ctx.restaurantId,
        payload: { key: 'signin', n: 1, star: 0, level: 1, at: t.clock.now.toISOString() },
      });
    });
    await finishes(emit);
  }, 20_000);
});
