import { GOODS } from '@dt/config';
import { levelUpExp } from '@dt/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  goodsNum,
  newRestaurant,
  restRow,
  tablesOf,
  createTestGame,
  type TestGame,
} from '../../../test/game';
import { runSystemOp } from '../../core/op';
import { gainExp } from '../../core/resources';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const PRICE = 5000;

/** 给这家店加经验，正好升 n 级（从 1 级、经验 0 开始） */
async function levelUp(restId: number, shardId: number, n: number): Promise<void> {
  let exp = 0;
  for (let l = 1; l <= n; l++) exp += levelUpExp(l);
  await runSystemOp(t.game.deps, shardId, restId, { source: 'test' }, async (op) => {
    gainExp(op, exp);
  });
}

async function logs(restId: number) {
  const rows = await t.db
    .selectFrom('rest_log')
    .select(['type', 'params'])
    .where('rest_id', '=', restId)
    .where('type', 'like', 'table.%')
    .orderBy('id')
    .execute();
  return rows.map((r) => [r.type, r.params]);
}

describe('升级自动摆餐桌（用户 2026-10-12）', () => {
  it('仓库没有餐桌A：按商店价花银币买一张摆上，动态写明花了多少', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1, exp: 0, coin: 6000, table_num: 4 } });
    await levelUp(ctx.restaurantId, ctx.shardId, 1);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ level: 2, table_num: 5, coin: 6000 - PRICE });
    expect(await tablesOf(t, ctx.restaurantId)).toHaveLength(5);
    expect(await logs(ctx.restaurantId)).toEqual([
      ['table.auto', { num: 1, store: 0, coin: PRICE, goodsId: GOODS.tableA }],
    ]);
  });

  it('仓库有餐桌A：先用仓库的，不花银币', async () => {
    const ctx = await newRestaurant(t, {
      patch: { level: 1, exp: 0, coin: 6000, table_num: 4 },
      goods: { [GOODS.tableA]: 2 },
    });
    await levelUp(ctx.restaurantId, ctx.shardId, 1);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 6000 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.tableA)).toBe(1);
    expect(await tablesOf(t, ctx.restaurantId)).toHaveLength(5);
    expect(await logs(ctx.restaurantId)).toEqual([
      ['table.auto', { num: 1, store: 1, coin: 0, goodsId: GOODS.tableA }],
    ]);
  });

  it('银币不够：不买、不扣，动态写明没买成和要多少', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1, exp: 0, coin: 100, table_num: 4 } });
    await levelUp(ctx.restaurantId, ctx.shardId, 1);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ level: 2, table_num: 5, coin: 100 });
    expect(await tablesOf(t, ctx.restaurantId)).toHaveLength(4);
    expect(await logs(ctx.restaurantId)).toEqual([
      ['table.autoFail', { num: 1, reason: 'coin', price: PRICE, goodsId: GOODS.tableA }],
    ]);
  });

  it('楼层放满了（要升星）：不买，动态写明', async () => {
    // 0 星只有 1 层 16 张
    const ctx = await newRestaurant(t, {
      patch: { level: 1, exp: 0, coin: 99999, table_num: 16, star_level: 0 },
    });
    await levelUp(ctx.restaurantId, ctx.shardId, 1);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ table_num: 17, coin: 99999 });
    expect(await tablesOf(t, ctx.restaurantId)).toHaveLength(16);
    expect(await logs(ctx.restaurantId)).toEqual([
      ['table.autoFail', { num: 1, reason: 'full', price: PRICE, goodsId: GOODS.tableA }],
    ]);
  });

  it('连升两级：仓库一张、银币买一张；钱只够买一张时另一张写没买成', async () => {
    const ctx = await newRestaurant(t, {
      patch: { level: 1, exp: 0, coin: 6000, table_num: 4 },
      goods: { [GOODS.tableA]: 1 },
    });
    await levelUp(ctx.restaurantId, ctx.shardId, 2);
    expect(await tablesOf(t, ctx.restaurantId)).toHaveLength(6);
    expect(await logs(ctx.restaurantId)).toEqual([
      ['table.auto', { num: 2, store: 1, coin: PRICE, goodsId: GOODS.tableA }],
    ]);
    const poor = await newRestaurant(t, { patch: { level: 1, exp: 0, coin: 6000, table_num: 4 } });
    await levelUp(poor.restaurantId, poor.shardId, 2);
    expect(await tablesOf(t, poor.restaurantId)).toHaveLength(5);
    expect(await logs(poor.restaurantId)).toEqual([
      ['table.auto', { num: 1, store: 0, coin: PRICE, goodsId: GOODS.tableA }],
      ['table.autoFail', { num: 1, reason: 'coin', price: PRICE, goodsId: GOODS.tableA }],
    ]);
  });

  it('原来就少摆了桌（上限比摆着的多）：升级只补这一级的那一张', async () => {
    const ctx = await newRestaurant(t, {
      patch: { level: 1, exp: 0, coin: 99999, table_num: 8 },
      tables: Array.from({ length: 4 }, (_, i) => ({ no: i + 1, floor: 1, customer: 0 })),
    });
    await levelUp(ctx.restaurantId, ctx.shardId, 1);
    expect(await tablesOf(t, ctx.restaurantId)).toHaveLength(5);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 99999 - PRICE });
  });
});
