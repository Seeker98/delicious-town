import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { gid } from '../../../test/items';
import { getEffectAgg } from '../effects/service';
import { resyncEquipIncome } from './incomeResync';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const income = () => t.deps.config.tuning.equip.income;
const equipRow = (restId: number) =>
  t.db
    .selectFrom('effect_source')
    .select('effects')
    .where('rest_id', '=', restId)
    .where('source_type', '=', 'equip')
    .where('source_id', '=', 0)
    .executeTakeFirst();

describe('上线时补算已穿厨具的收益加成（问题记录 411）', () => {
  it('只有幸运的旧 equip 行改写成带收益加成的；没穿厨具的旧行删掉；再跑一次不改', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const def = t.deps.config.requireGoods(gid('见习之铲')).equip!;
    await t.db
      .insertInto('equip')
      .values({
        rest_id: a.restaurantId,
        goods_id: gid('见习之铲'),
        part: def.part,
        suit_id: def.suitId,
        min_level: def.minLevel,
        cur_hole: def.hole,
        max_hole: def.maxHole,
        worn: true,
        base_cook: 10,
        base_luck: 4,
      })
      .execute();
    await t.db
      .insertInto('effect_source')
      .values({
        rest_id: a.restaurantId,
        source_type: 'equip',
        source_id: 0,
        effects: JSON.stringify({ luckValue: 4 }),
      })
      .execute();
    // 另一家：留着旧行但已经没穿厨具
    const b = await newRestaurant(t, { shardId });
    await t.db
      .insertInto('effect_source')
      .values({
        rest_id: b.restaurantId,
        source_type: 'equip',
        source_id: 0,
        effects: JSON.stringify({ luckValue: 9 }),
      })
      .execute();

    expect(await resyncEquipIncome(t.db, shardId, income())).toEqual({ restaurants: 2 });
    expect((await equipRow(a.restaurantId))!.effects).toEqual({
      luckValue: 4,
      coinRate: 0.004,
      expRate: 0.0025,
      mcGoldRate: 0.003,
    });
    expect(await equipRow(b.restaurantId)).toBeUndefined();
    const agg = await getEffectAgg(t.db, a.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(agg.coinRate).toBeCloseTo(0.004, 9);

    expect(await resyncEquipIncome(t.db, shardId, income())).toEqual({ restaurants: 0 });
  });
});
