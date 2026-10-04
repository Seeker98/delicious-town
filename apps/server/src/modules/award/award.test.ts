import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { createShard } from '../../../test/fixtures';
import { setTuning } from '../../../test/town';
import { runOp } from '../../core/op';
import { grantAward, openGift } from './award';

const config = testConfig();
let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());
const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, fn);

/** 固定随机序列的用例关掉个人缺料倾向（问题记录 50）：倾向会多消耗一次随机数 */
async function noTiltShard(t: TestGame): Promise<number> {
  const shardId = await createShard(t.db);
  await setTuning(t, shardId, { scarcity: { needBase: 0, needLuckFactor: 0, needMax: 0 } });
  return shardId;
}

describe('grantAward（规格书 00 §0.7）', () => {
  it('银币、经验（会升级）、钻石、声望、道具、食材', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, renown: 10 } });
    await run(ctx, (op) =>
      grantAward(op, {
        coin: 2000,
        exp: 600,
        diamond: 2,
        renown: 5,
        goods: [{ id: 1, num: 3 }],
        foods: [{ id: 101, num: 2 }],
      }),
    );
    const r = await restRow(t, ctx.restaurantId);
    expect(r).toMatchObject({ coin: 2000, level: 2, exp: 100, diamond: 2, renown: 15 });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(2);
  });

  it('multiplier 放大所有数量', async () => {
    const ctx = await newRestaurant(t, { patch: { diamond: 0 } });
    await run(ctx, (op) => grantAward(op, { diamond: 2, goods: [{ id: 1, num: 1 }] }, { multiplier: 2 }));
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(4);
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(2);
  });
});

describe('openGift（规格书 07 §7.5）', () => {
  it('每日签到礼包：按固定随机序列逐项判定', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, diamond: 0 } });
    const pool = config.randomGoodsIds(7);
    // 顺序：礼券(判定) → 随机道具(判定、抽取) → 万能食材(判定) → 银币(判定、数额) → 经验(判定) → 钻石(判定、数额)
    rngValues = [0.5, 0.1, 0, 0.5, 0.1, 0.5, 0.9, 0.2, 0.99];
    await run(ctx, (op) => openGift(op, config.requireGoods(115), 1));
    // 随机道具池的第一个如果恰好也是神秘礼券，礼券会多 1
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(20 + (pool[0] === 1 ? 1 : 0));
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBeGreaterThanOrEqual(1);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(1000 + Math.floor(0.5 * 19000));
    expect(r.diamond).toBe(1 + Math.floor(0.99 * 3));
    expect(r.exp).toBe(0);
  });

  it('幸运：随机数超过 rate 但低于 rate + 幸运率时仍然得到，并标记幸运', async () => {
    // 幸运 300 → 幸运率 0.3
    const ctx = await newRestaurant(t, { patch: { luck: 300 } });
    rngValues = [0.5, 0.35, 0, 0.99, 0.99, 0.99, 0.99];
    const r = await run(ctx, (op) => openGift(op, config.requireGoods(115), 1));
    const lucky = r.events.filter((e) => e.lucky);
    expect(lucky).toHaveLength(1);
    expect(lucky[0]).toMatchObject({ type: 'gain', kind: 'goods', id: config.randomGoodsIds(7)[0] });
  });

  it('随机万能食材礼包：万能食材按权重、1 级食材按权重', async () => {
    const ctx = await newRestaurant(t, { shardId: await noTiltShard(t) });
    rngValues = [0.5, 0, 0.5, 0];
    await run(ctx, (op) => openGift(op, config.requireGoods(131), 1));
    expect((await foodNum(t, ctx.restaurantId, 467)).num).toBe(1);
    const firstLevel1 = config.foodPools.get(1)!.items[0]!.id;
    expect((await foodNum(t, ctx.restaurantId, firstLevel1)).num).toBe(2);
    rngValues = [0.5];
  });
});
