import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { sideOf } from './sides';
import { runSystemOp } from '../../core/op';
import { opAgg } from '../../core/luck';
import { syncEquipEffects } from '../equip/effects';
import { attrCols } from '../equip/instances';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('长老属性和真实的店一致（backlog 408）', () => {
  it('每层：建一家店，按长老的等级、加点、厨具（基础 + 强化增量）穿上，sideOf 防守属性等于配置里的长老属性', async () => {
    const config = t.deps.config;
    for (const f of config.towerFloors.values()) {
      const e = f.elder;
      const ctx = await newRestaurant(t, {
        patch: {
          level: e.level,
          attr_cook: e.points.cook,
          attr_cutting: e.points.cutting,
          attr_fire: e.points.fire,
          attr_season: 0,
          attr_creatives: 0,
          luck: config.tuning.rest.luckPerLevel * (e.level - 1),
        },
      });
      for (const p of e.pieces) {
        const def = config.requireGoods(p.id).equip!;
        await t.db
          .insertInto('equip')
          .values({
            rest_id: ctx.restaurantId,
            goods_id: p.id,
            part: def.part,
            suit_id: def.suitId,
            min_level: def.minLevel,
            stress: e.stress,
            worn: true,
            ...attrCols('base_', p.base),
            ...attrCols('st_', p.gain),
          })
          .execute();
      }
      // 走真实的同步：equip、suit 加成行 → 加成汇总里的幸运
      const { rest, luck } = await runSystemOp(
        t.game.deps,
        ctx.shardId,
        ctx.restaurantId,
        { source: 'test', now: t.clock.now },
        async (o) => {
          await syncEquipEffects(o);
          return { rest: o.rest, luck: (await opAgg(o)).luckValue ?? 0 };
        },
      );
      const side = await sideOf(t.db, config, rest, luck, 'defend');
      expect(side.attrs, `${f.floor} 层`).toEqual(f.attrs);
    }
  });
});

describe('对决属性里的套装进攻加成', () => {
  it('古尔图格 5 件：主动挑战时厨艺 +5%，被挑战时不加', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 60, attr_cook: 100 } });
    for (const goodsId of [
      gid('意志之古尔图格的精华之铲'),
      gid('意志之古尔图格的精华之刃'),
      gid('意志之古尔图格的精华之镬'),
      gid('意志之古尔图格的精华之瓶'),
      gid('意志之古尔图格的精华之冠'),
    ]) {
      const def = t.deps.config.requireGoods(goodsId).equip!;
      await t.db
        .insertInto('equip')
        .values({
          rest_id: ctx.restaurantId,
          goods_id: goodsId,
          part: def.part,
          suit_id: def.suitId,
          min_level: def.minLevel,
          cur_hole: def.hole,
          max_hole: def.maxHole,
          worn: true,
        })
        .execute();
    }
    const rest = await restRow(t, ctx.restaurantId);
    const attack = await sideOf(t.db, t.deps.config, rest, 0, 'attack');
    const defend = await sideOf(t.db, t.deps.config, rest, 0, 'defend');
    expect(defend.attrs.cook).toBe(100);
    expect(attack.attrs.cook).toBe(105);
  });
});
