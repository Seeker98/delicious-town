import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../test/game';
import { runOp } from './op';
import { gainCoin, gainExp, spendCoin } from './resources';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'restaurant', source: 'test' }, fn);

describe('runOp', () => {
  it('资源变化一次写回；流水带上操作时间；返回得失提示', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000 } });
    t.clock.set(new Date('2026-09-30T02:00:00Z'));
    const r = await run(ctx, async (op) => {
      gainCoin(op, 500);
      spendCoin(op, 200);
      return op.rest.coin;
    });
    expect(r.data).toBe(1300);
    expect(r.events).toEqual([
      { type: 'gain', kind: 'coin', num: 500 },
      { type: 'loss', kind: 'coin', num: 200 },
    ]);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1300);
    const ledger = await t.db
      .selectFrom('ledger')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .orderBy('id')
      .execute();
    expect(ledger.map((l) => [l.kind, l.delta, l.source])).toEqual([
      ['coin', 500, 'test'],
      ['coin', -200, 'test'],
    ]);
    expect(ledger[0]!.created_at).toEqual(new Date('2026-09-30T02:00:00Z'));
  });

  it('资源不够时抛 NOT_ENOUGH，整个操作回滚', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100 } });
    await expect(
      run(ctx, async (op) => {
        gainCoin(op, 50);
        spendCoin(op, 500);
      }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'coin', need: 500, have: 150 } });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(100);
    const n = await t.db.selectFrom('ledger').select('id').where('rest_id', '=', ctx.restaurantId).execute();
    expect(n).toHaveLength(0);
  });

  it('经验可以连升多级：属性点、幸运、餐桌上限随之增加，并写个人日志', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1, exp: 0, attr_left: 3, luck: 0, table_num: 4 } });
    await run(ctx, async (op) => {
      gainExp(op, 2600);
    });
    const r = await restRow(t, ctx.restaurantId);
    expect(r).toMatchObject({ level: 3, exp: 100, attr_left: 9, luck: 2, table_num: 6 });
    const logs = await t.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(logs.map((l) => [l.type, l.params])).toEqual([['level.up', { from: 1, to: 3 }]]);
  });

  it('功能在区服关闭时拒绝，不锁店', async () => {
    const ctx = await newRestaurant(t);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { restaurant: false } }) })
      .execute();
    await expect(run(ctx, async () => 1)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
