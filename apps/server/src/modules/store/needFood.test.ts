import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEALTH } from '@dt/config';
import { seededRng } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { needMapOf } from '../../core/scarcity';

let t: TestGame;
/** 固定随机数（终审 I1）：每个操作都从这个种子开始，结果每次跑都一样 */
let seed = 1;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(seed) });
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

  it('只缺 1 个的那种：先给到这 1 个，缺口扣完后按掉落权重随机给三级食材（Review Focus 3，终审 I1）', async () => {
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
    // 种子 8：缺口扣完后的随机又抽到了 target（设计 §1.1 允许；“缺口扣完不再从清单抽”由 scarcity.test.ts 的纯函数测试管）
    seed = 8;
    await t.game.store.use(r, { goodsId: PACK3, num: 5 });
    seed = 1;
    const after = await gotFoods(r.restaurantId);
    expect((after.get(target) ?? 0) - (before.get(target) ?? 0)).toBeGreaterThanOrEqual(1);
    const added = [...after].filter(([id, n]) => n > (before.get(id) ?? 0));
    expect(added.reduce((a, [id, n]) => a + n - (before.get(id) ?? 0), 0)).toBe(5);
    for (const [id] of added) expect(levelOf(id)).toBe(3);
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
