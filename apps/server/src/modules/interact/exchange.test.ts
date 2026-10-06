import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  foodNum,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { ensureNpc } from '../npc/npc';
import { grantGoods } from '../store/grant';

const config = testConfig();
const [F1, F2, F3] = config.foodsByLevel
  .get(2)!
  .slice(0, 3)
  .map((f) => f.id) as [number, number, number];
const L1 = config.foodsByLevel.get(1)![0]!.id;
const STORM = config.bundle.weather.find((w) => w.effects.changeFoodsFlag === 1)!.id;
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const ex = () => t.game.social.exchange;
const fee = (id: number, locked = false) => {
  const f = config.requireFood(id);
  return Math.floor(f.coin * 0.5 * (100 / f.odds) * (locked ? 2 : 1));
};

async function friends(a: NewRestaurantOptions = {}, b: NewRestaurantOptions = {}) {
  seq = [0.99];
  const pair = await newPair(
    t,
    { foods: { [F1]: 5, [L1]: 5 }, patch: { coin: 10_000_000 }, ...a },
    { foods: { [F2]: 3 }, ...b },
  );
  await befriend(t, pair[0].restaurantId, pair[1].restaurantId);
  return pair;
}

async function setStorm(shardId: number) {
  await t.game.world.ensure(shardId);
  await t.db
    .updateTable('world_state')
    .set({ weather_id: STORM, weather_until: new Date(Date.now() + 3600_000) })
    .where('shard_id', '=', shardId)
    .execute();
}

describe('交换食材（规格书 05 §5.6）', () => {
  it('2 换 1：我 -2 A +1 B，对方 +1 A -1 B（设计文档 裁定 1）；付手续费给对方', async () => {
    const [a, b] = await friends();
    const r = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    expect(r.data).toEqual({ result: 'ok', fee: fee(F2), redPantsFoodsId: null });
    expect((await foodNum(t, a.restaurantId, F1)).num).toBe(3);
    expect((await foodNum(t, a.restaurantId, F2)).num).toBe(1);
    expect((await foodNum(t, b.restaurantId, F1)).num).toBe(1);
    expect((await foodNum(t, b.restaurantId, F2)).num).toBe(2);
    expect((await restRow(t, b.restaurantId)).coin).toBe(fee(F2));
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('exchange');
  });

  it('等级不同或超过 5 级不能换；我的不够 2 个不能换', async () => {
    const [a, b] = await friends();
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: L1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { reason: 'level_mismatch' } });
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F3, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'foods' } });
  });

  it('次数：和这个好友每天 14 − ⌊星/2⌋ 次；对方每天被换 10 + 星级 次', async () => {
    const [a, b] = await friends();
    const day = gameDay(t.clock.now);
    await incrementDaily(t.db, a.restaurantId, `exchange.with:${b.restaurantId}`, 14, day);
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { what: 'exchange', max: 14 } });
    const [c, e] = await friends();
    await incrementDaily(t.db, e.restaurantId, 'exchange.taken', 10, day);
    await expect(
      ex().exchange(c, { restId: e.restaurantId, giveFoodsId: F1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { what: 'exchange_taken', max: 10 } });
  });

  it('对方锁定的食材：平时不能换；飓风天可以换，50% 被抓（2 个 A 白给、得银手镯），对方得镇长的关心', async () => {
    const [a, b] = await friends();
    await t.db
      .updateTable('cupboard_food')
      .set({ locked: true })
      .where('rest_id', '=', b.restaurantId)
      .where('foods_id', '=', F2)
      .execute();
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { reason: 'foods_locked' } });
    await setStorm(a.shardId);
    seq = [0];
    const caught = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    expect(caught.data.result).toBe('caught');
    expect((await foodNum(t, a.restaurantId, F1)).num).toBe(3);
    expect((await foodNum(t, b.restaurantId, F1)).num).toBe(2);
    expect((await foodNum(t, b.restaurantId, F2)).num).toBe(3);
    expect(await goodsNum(t, a.restaurantId, GOODS.bangle)).toBe(1);
    expect(await goodsNum(t, b.restaurantId, GOODS.townCare)).toBe(1);
    seq = [0.99];
    const ok = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    expect(ok.data).toMatchObject({ result: 'ok', fee: fee(F2, true) });
  });

  it('对方有红内裤、我星级比它高：额外损失 1 个同级食材给对方', async () => {
    const [a, b] = await friends({ foods: { [F1]: 5, [F3]: 5 }, patch: { coin: 10_000_000, star_level: 1 } });
    await grantGoods(t.db, config, b.restaurantId, GOODS.redPants, 1, t.clock.now);
    const r = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    const lost = r.data.redPantsFoodsId!;
    expect([F1, F2, F3]).toContain(lost);
    expect((await foodNum(t, b.restaurantId, lost)).num).toBeGreaterThanOrEqual(1);
  });

  it('蟹老板：不收手续费；每天 8 − 星级 次；同一 IP 也受限', async () => {
    const [a] = await friends();
    const npc = (await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1))).id;
    await befriend(t, a.restaurantId, npc);
    await t.db.deleteFrom('cupboard_food').where('rest_id', '=', npc).execute();
    await t.db.insertInto('cupboard_food').values({ rest_id: npc, foods_id: F2, num: 50 }).execute();
    const r = await ex().exchange(a, { restId: npc, giveFoodsId: F1, takeFoodsId: F2 });
    expect(r.data.fee).toBe(0);
    await incrementDaily(t.db, a.restaurantId, 'exchange.krab', 7, gameDay(t.clock.now));
    await expect(ex().exchange(a, { restId: npc, giveFoodsId: F1, takeFoodsId: F2 })).rejects.toMatchObject({
      params: { what: 'exchange', max: 8 },
    });
    const c = await newRestaurant(t, {
      shardId: a.shardId,
      verified: true,
      foods: { [F1]: 5 },
      patch: { coin: 1_000_000 },
    });
    await befriend(t, c.restaurantId, npc);
    await t.deps.redis.set(`krabx:${c.shardId}:${gameDay(t.clock.now)}:ip:${c.ip}`, '8');
    await expect(ex().exchange(c, { restId: npc, giveFoodsId: F1, takeFoodsId: F2 })).rejects.toMatchObject({
      params: { what: 'exchange' },
    });
  });

  it('对方的食材带“我学菜还缺几个”：本街菜下一品级要的合计减去已有，不缺是 0（backlog 370）', async () => {
    const a0 = await newRestaurant(t);
    const street = (await restRow(t, a0.restaurantId)).street_id;
    const want = new Map<number, number>();
    for (const id of config.cookbookIndex.idsByStreet.get(street) ?? [])
      for (const x of config.requireCookbook(id).needFoods[1] ?? [])
        if (config.foods.get(x.foodsId)?.level === 2) want.set(x.foodsId, (want.get(x.foodsId) ?? 0) + x.num);
    const [needed] = [...want.entries()].sort((x, y) => y[1] - x[1])[0]!;
    const spare = config.foodsByLevel.get(2)!.find((f) => !want.has(f.id))!.id;
    const [a, b] = await friends({ foods: { [needed]: 1 } }, { foods: { [needed]: 3, [spare]: 3 } });
    const r = await ex().foods(a, b.restaurantId, 2);
    expect(r.theirs.find((x) => x.foodsId === needed)!.need).toBe(want.get(needed)! - 1);
    expect(r.theirs.find((x) => x.foodsId === spare)!.need).toBe(0);
  });

  it('可交换食材列表：对方的（带锁定和手续费）、我的、剩余次数', async () => {
    const [a, b] = await friends();
    const r = await ex().foods(a, b.restaurantId, 2);
    expect(r).toMatchObject({
      level: 2,
      theirs: [{ foodsId: F2, num: 3, locked: false, fee: fee(F2) }],
      mine: [{ foodsId: F1, num: 5 }],
      left: 14,
      storm: false,
      npc: false,
    });
  });
});
