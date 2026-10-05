import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { grantGoodsOp } from '../store/goods';
import { convertLegacyEquips } from './instances';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const equips = (restId: number) =>
  t.db.selectFrom('equip').selectAll().where('rest_id', '=', restId).orderBy('id').execute();
const grant = (ctx: RestCtx, goodsId: number, num: number) =>
  runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, (op) => grantGoodsOp(op, goodsId, num));

describe('发放厨具生成实例（设计文档 §4.2）', () => {
  it('固定属性：每件一个实例，不进仓库表', async () => {
    const ctx = await newRestaurant(t);
    await grant(ctx, gid('见习之铲'), 2);
    const rows = await equips(ctx.restaurantId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      goods_id: gid('见习之铲'),
      part: 1,
      base_cook: 2,
      stress: 0,
      worn: false,
      max_hole: 0,
    });
    expect(await goodsNum(t, ctx.restaurantId, gid('见习之铲'))).toBe(0);
  });

  it('随机属性：总和等于 total，孔位、等级门槛、套装取自道具', async () => {
    const ctx = await newRestaurant(t);
    await grant(ctx, gid('沉默之度玛的静谧之镬'), 1);
    const [e] = await equips(ctx.restaurantId);
    const sum =
      e!.base_cook + e!.base_cutting + e!.base_fire + e!.base_season + e!.base_creatives + e!.base_luck;
    expect(sum).toBe(36);
    expect(e).toMatchObject({ part: 3, cur_hole: 1, max_hole: 3, min_level: 65, suit_id: 5 });
  });

  it('仓库满了照发：一次 10 件都生成（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: { store_num: 1 }, goods: { [gid('金币')]: 1 } });
    await grant(ctx, gid('见习之铲'), 10);
    expect(await equips(ctx.restaurantId)).toHaveLength(10);
  });

  it('商店买厨具生成实例；未穿戴的厨具占仓库格，满了不能再买', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 1_000_000, store_num: 2 },
      goods: { [gid('金币')]: 1 },
    });
    await t.game.shop.buy(ctx, { goodsId: gid('见习之铲'), num: 1 });
    expect(await equips(ctx.restaurantId)).toHaveLength(1);
    const list = await t.game.store.list(ctx, {});
    expect(list).toMatchObject({ kinds: 2, equips: 1 });
    await expect(t.game.shop.buy(ctx, { goodsId: gid('见习之刀'), num: 1 })).rejects.toMatchObject({
      code: 'STORE_FULL',
    });
    await t.db.updateTable('equip').set({ worn: true }).where('rest_id', '=', ctx.restaurantId).execute();
    expect((await t.game.store.list(ctx, {})).kinds).toBe(1);
  });
});

describe('旧数据转换（计划裁定 2）', () => {
  it('仓库表里的厨具按数量转成实例，再跑一次不重复', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, {
      shardId,
      goods: { [gid('见习之铲')]: 2, [gid('沉默之度玛的静谧之镬')]: 1, [gid('金币')]: 3 },
    });
    expect(await convertLegacyEquips(t.db, t.deps.config, shardId)).toBe(3);
    expect((await equips(ctx.restaurantId)).map((e) => e.goods_id).sort()).toEqual(
      [gid('见习之铲'), gid('见习之铲'), gid('沉默之度玛的静谧之镬')].sort(),
    );
    expect(await goodsNum(t, ctx.restaurantId, gid('见习之铲'))).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, gid('金币'))).toBe(3);
    expect(await convertLegacyEquips(t.db, t.deps.config, shardId)).toBe(0);
  });
});
