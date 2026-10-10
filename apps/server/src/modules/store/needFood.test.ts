import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEALTH } from '@dt/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { needMapOf } from '../../core/scarcity';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const config = () => t.game.deps.config;
const levelOf = (id: number) => config().requireFood(id).level;
const PACK3 = WEALTH.packBase + 3;

/** 某条街新店（没学过菜）的缺料：每道菜 1 品要的，减去 have */
function needOf(streetId: number, have: Record<number, number> = {}): Map<number, number> {
  const c = config();
  return needMapOf(
    c.cookbookIndex.idsByStreet.get(streetId) ?? [],
    new Uint8Array(c.cookbookIndex.slots),
    c.cookbookIndex.slotOf,
    c.tuning.rest.cookbookMaxGrade,
    (id, g) => c.requireCookbook(id).needFoods[g] ?? [],
    (id) => have[id] ?? 0,
  );
}
async function gotFoods(restId: number): Promise<Map<number, number>> {
  const rows = await t.db
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num'])
    .where('rest_id', '=', restId)
    .execute();
  return new Map(rows.map((r) => [r.foods_id, r.num + r.fridge_num]));
}
const sum = (m: Map<number, number>) => [...m.values()].reduce((a, n) => a + n, 0);

describe('街市补给包（理财设计 §1.1）', () => {
  it('三级包：给的全是本街正缺的三级食材，不看缺料倾向的概率', async () => {
    const r = await newRestaurant(t, { goods: { [PACK3]: 10 } });
    await t.game.store.use(r, { goodsId: PACK3, num: 10 });
    const need = needOf(0);
    const got = await gotFoods(r.restaurantId);
    expect(sum(got)).toBe(10);
    for (const id of got.keys()) {
      expect(levelOf(id)).toBe(3);
      expect(need.has(id)).toBe(true);
    }
  });

  it('只缺 1 个的那种最多给 1 个（Review Focus 3）：其他三级缺料都备齐，开 5 个包', async () => {
    const need3 = [...needOf(0)].filter(([id]) => levelOf(id) === 3);
    const [target] = need3[0]!;
    // 其余三级缺料按缺口备齐；target 备到只差 1 个
    const foods = Object.fromEntries(need3.map(([id, gap]) => [id, id === target ? gap - 1 : gap]));
    const r = await newRestaurant(t, {
      goods: { [PACK3]: 5 },
      patch: { foods_max_num: 10_000 },
      foods,
    });
    const before = await gotFoods(r.restaurantId);
    await t.game.store.use(r, { goodsId: PACK3, num: 5 });
    const after = await gotFoods(r.restaurantId);
    expect((after.get(target) ?? 0) - (before.get(target) ?? 0)).toBe(1);
    const added = [...after].reduce((a, [id, n]) => a + n - (before.get(id) ?? 0), 0);
    expect(added).toBe(5);
  });

  it('本街菜全部满级（没有缺料）时按掉落权重随机给三级食材', async () => {
    const r = await newRestaurant(t, { goods: { [PACK3]: 10 } });
    const levels = new Uint8Array(config().cookbookIndex.slots).fill(config().tuning.rest.cookbookMaxGrade);
    await t.db
      .updateTable('restaurant_cookbooks')
      .set({ levels: Buffer.from(levels) })
      .where('rest_id', '=', r.restaurantId)
      .execute();
    await t.game.store.use(r, { goodsId: PACK3, num: 10 });
    const got = await gotFoods(r.restaurantId);
    expect(sum(got)).toBe(10);
    for (const id of got.keys()) expect(levelOf(id)).toBe(3);
  });

  it('按使用时所在的街道挑：店在别的街时给那条街缺的', async () => {
    const home = needOf(0);
    const other = [...config().streets.keys()].find(
      (s) => s !== 0 && [...needOf(s)].some(([id]) => levelOf(id) === 3 && !home.has(id)),
    )!;
    const r = await newRestaurant(t, { goods: { [PACK3]: 10 }, patch: { street_id: other } });
    await t.game.store.use(r, { goodsId: PACK3, num: 10 });
    const need = needOf(other);
    const got = await gotFoods(r.restaurantId);
    expect(sum(got)).toBe(10);
    for (const id of got.keys()) expect(need.has(id)).toBe(true);
  });
});
