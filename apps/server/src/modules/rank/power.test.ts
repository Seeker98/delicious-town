import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { gid } from '../../../test/items';
import { restPower } from '../equip/power';
import { BOARD_SOURCES } from './boards';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 第一档加厨艺百分比、三件以内就能激活的套装：直接按 suit_id 记几件 */
function pctSuit(): number {
  for (const s of t.deps.config.suits.values()) {
    const tier = s.tiers[0];
    if (tier && tier.need <= 3 && (tier.effects.cookPct ?? 0) > 0) return s.id;
  }
  throw new Error('no suit with cookPct');
}

async function piece(restId: number, patch: Record<string, number | boolean> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(gid('见习之铲')).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: restId,
      goods_id: gid('见习之铲'),
      part: def.part,
      suit_id: def.suitId,
      min_level: def.minLevel,
      cur_hole: 3,
      max_hole: 3,
      worn: true,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const gem = (equipId: number, restId: number, goods: string, level: number, attrs: Record<string, number>) =>
  t.db
    .insertInto('equip_gem')
    .values({ equip_id: equipId, rest_id: restId, gem_goods_id: gid(goods), level, ...attrs })
    .execute();

describe('厨力榜整区一起算（性能整理）', () => {
  it('每家的值和 restPower 一样：加点、厨具、宝石、套装、没穿的不算；NPC 店和封号的不上榜', async () => {
    const shardId = await createShard(t.db);
    const suit = pctSuit();
    // 只有加点
    const a = await newRestaurant(t, { shardId, patch: { attr_cook: 10, attr_fire: 3, luck: 5 } });
    // 厨具 + 宝石，另有一件没穿的
    const b = await newRestaurant(t, { shardId, patch: { attr_season: 4 } });
    const b1 = await piece(b.restaurantId, { base_cook: 7, base_luck: 3 });
    await gem(b1, b.restaurantId, '[二阶]•智慧灵石', 2, { creatives: 4 });
    await gem(b1, b.restaurantId, '[一阶]•蓝冥原石', 1, { cook: 2, luck: 3 });
    await piece(b.restaurantId, { base_cook: 100, worn: false });
    // 三件同套装，带宝石
    const c = await newRestaurant(t, {
      shardId,
      patch: { attr_cook: 20, attr_cutting: 9, attr_creatives: 2 },
    });
    for (let i = 0; i < 3; i++) {
      const id = await piece(c.restaurantId, {
        part: i + 1,
        suit_id: suit,
        base_cook: 11 + i,
        base_fire: 5,
        base_cutting: i,
      });
      if (i === 1) await gem(id, c.restaurantId, '[六阶]•蓝冥神玉', 5, { cook: 9 });
    }
    // 什么都没有
    const d = await newRestaurant(t, { shardId });
    // NPC 店、封号的店：不上榜
    const npc = await newRestaurant(t, { shardId, patch: { npc: true } });
    await piece(npc.restaurantId, { base_cook: 50 });
    const banned = await newRestaurant(t, { shardId });
    await t.db
      .updateTable('account')
      .set({ banned_at: new Date() })
      .where('id', '=', banned.accountId)
      .execute();

    const got = await BOARD_SOURCES.power!({ db: t.db, shardId, now: new Date(), config: t.deps.config });
    const want = await Promise.all(
      [a, b, c, d].map(async (x) => ({
        restId: x.restaurantId,
        value: await restPower(t.db, await restRow(t, x.restaurantId), t.deps.config.suits),
      })),
    );
    expect(got.map(({ restId, value }) => ({ restId, value })).sort((x, y) => x.restId - y.restId)).toEqual(
      want,
    );
    // 套装确实生效了、宝石确实算了：和不算的不一样
    expect(want[2]!.value).toBeGreaterThan(20 + 9 + 2 + 11 + 12 + 13 + 15 + 3 + 9);
    // 4 + 7 + ⌊3/2⌋，宝石再加 4 + 2 + ⌊(3+3)/2⌋ - ⌊3/2⌋
    expect(want[1]!.value).toBe(4 + 7 + 4 + 2 + 3);
  });
});
