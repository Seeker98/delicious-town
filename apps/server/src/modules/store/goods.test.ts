import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { opAgg } from '../../core/luck';
import { runOp } from '../../core/op';
import { assertStoreRoom, consumeGoods, grantGoodsOp, hasValidHonor, removeHonor } from './goods';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, fn);

describe('道具发放与扣除', () => {
  it('设施道具在仓库里不带有效期（摆放时才计时）', async () => {
    const ctx = await newRestaurant(t);
    await run(ctx, async (op) => {
      await grantGoodsOp(op, gid('普通宣传海报'), 2);
    });
    const row = await t.db
      .selectFrom('store_item')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .where('goods_id', '=', 13)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ num: 2, expires_at: null });
  });

  it('勋章可以指定有效期；到期后不再算持有', async () => {
    const ctx = await newRestaurant(t);
    t.clock.set(new Date('2026-09-30T00:00:00Z'));
    await run(ctx, async (op) => {
      await grantGoodsOp(op, GOODS.krabHappy, 1, { hours: 5 });
    });
    t.clock.set(new Date('2026-09-30T04:59:00Z'));
    expect((await run(ctx, (op) => hasValidHonor(op, 133))).data).toBe(true);
    t.clock.set(new Date('2026-09-30T05:00:00Z'));
    expect((await run(ctx, (op) => hasValidHonor(op, 133))).data).toBe(false);
    t.clock.set(new Date());
  });

  it('得到新牌匾后加成汇总重新计算（集牌匾）', async () => {
    const ctx = await newRestaurant(t);
    const r = await run(ctx, async (op) => {
      await opAgg(op);
      await grantGoodsOp(op, gid('[一星牌匾]'), 1);
      return opAgg(op);
    });
    expect(r.data.plaqueSum).toBeCloseTo(0.01);
  });

  it('扣除：不够时报错；扣到 0 删除', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.starCert]: 2 } });
    await expect(run(ctx, (op) => consumeGoods(op, GOODS.starCert, 3))).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.starCert, need: 3, have: 2 },
    });
    const r = await run(ctx, (op) => consumeGoods(op, GOODS.starCert, 2));
    expect(r.events).toEqual([{ type: 'loss', kind: 'goods', id: GOODS.starCert, num: 2 }]);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.starCert)).toBe(0);
  });

  it('移除勋章同时移除加成来源', async () => {
    const ctx = await newRestaurant(t);
    await run(ctx, (op) => grantGoodsOp(op, GOODS.promoHonor, 1));
    const r = await run(ctx, async (op) => {
      await removeHonor(op, 106);
      return opAgg(op);
    });
    expect(r.data.atRate ?? 0).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.promoHonor)).toBe(0);
  });

  it('仓库容量：种数满了不能放新种类；已有的、勋章不受限', async () => {
    const ctx = await newRestaurant(t, { patch: { store_num: 1 }, goods: { [GOODS.starCert]: 1 } });
    await expect(run(ctx, (op) => assertStoreRoom(op, 24))).rejects.toMatchObject({ code: 'STORE_FULL' });
    await run(ctx, (op) => assertStoreRoom(op, 86));
    await run(ctx, (op) => assertStoreRoom(op, 167));
  });
});
