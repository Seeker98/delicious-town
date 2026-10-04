import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NEWBIE } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { queryCounter } from '../../../test/queries';
import { setTuning } from '../../../test/town';
import { runOp } from '../../core/op';
import { needMapOf } from '../../core/scarcity';
import { randomAward } from '../award/random';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const ALWAYS = { scarcity: { needBase: 1, needLuckFactor: 0, needMax: 1 } };
const OFF = { scarcity: { needBase: 0, needLuckFactor: 0, needMax: 0 } };
const config = () => t.game.deps.config;
const levelOf = (id: number) => config().requireFood(id).level;

/** 新店（新手街 0，没学过菜）的缺料：本街每道菜 1 品要的，减去橱柜已有 */
function needOf(have: Record<number, number> = {}): Map<number, number> {
  const c = config();
  return needMapOf(
    c.cookbookIndex.idsByStreet.get(0) ?? [],
    new Uint8Array(c.maxCookbookId + 1),
    c.tuning.rest.cookbookMaxGrade,
    (id, g) => c.requireCookbook(id).needFoods[g] ?? [],
    (id) => have[id] ?? 0,
  );
}
async function shardWith(tuning: Record<string, unknown>): Promise<number> {
  const shardId = await createShard(t.db);
  await setTuning(t, shardId, tuning);
  return shardId;
}
async function gotFoods(restId: number): Promise<Map<number, number>> {
  const rows = await t.db
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num'])
    .where('rest_id', '=', restId)
    .execute();
  return new Map(rows.map((r) => [r.foods_id, r.num + r.fridge_num]));
}

describe('个人缺料倾向（问题记录 50、68）', () => {
  it('3 级随机食材券：概率为 1 时出的全是本街正缺的 3 级食材', async () => {
    const shardId = await shardWith(ALWAYS);
    const r = await newRestaurant(t, { shardId, goods: { [NEWBIE.foodVoucherBase + 3]: 10 } });
    await t.game.store.use(r, { goodsId: NEWBIE.foodVoucherBase + 3, num: 10 });
    const need = needOf();
    const got = await gotFoods(r.restaurantId);
    expect([...got.values()].reduce((a, n) => a + n, 0)).toBe(10);
    for (const id of got.keys()) {
      expect(levelOf(id)).toBe(3);
      expect(need.has(id)).toBe(true);
    }
  });

  it('随机奖励命中缺料时只给 ≤ min(奖励等级, 5) 的缺料，可以是稀有食材（Review Focus 2、68）', async () => {
    const shardId = await shardWith(ALWAYS);
    const r = await newRestaurant(t, { shardId });
    const need = needOf();
    const ids: number[] = [];
    // 抽到至少 12 次食材：新手街 3 级以内的缺量里稀有食材约占 59%，12 次都不出稀有的概率约十万分之二
    for (let i = 0; i < 300 && ids.length < 12; i++) {
      const res = await runOp(t.game.deps, r, { feature: 'store', source: 'test' }, (o) =>
        randomAward(o, { level: 3 }),
      );
      if (res.data.kind === 'foods') ids.push(res.data.id!);
    }
    expect(ids.length).toBe(12);
    for (const id of ids) {
      expect(levelOf(id)).toBeLessThanOrEqual(3);
      expect(need.has(id)).toBe(true);
    }
    // 真的出过稀有食材（质量期 ②）
    expect(ids.some((id) => config().requireFood(id).odds < 100)).toBe(true);
  });

  it('合成命中缺料：出的都是目标等级的缺料，不出已经堆满的（Review Focus 3）', async () => {
    const shardId = await shardWith(ALWAYS);
    const two = config().foodPools.get(2)!.items[0]!.id;
    const need3 = [...needOf()].filter(([id]) => levelOf(id) === 3).map(([id]) => id);
    // 第一种 3 级缺料先堆满：合成不能再出它
    const full = need3[0]!;
    const r = await newRestaurant(t, {
      shardId,
      patch: { coin: 100_000, strength: 100, foods_max_num: 50 },
      foods: { [two]: 40, [full]: 50 },
    });
    const res = await t.game.cupboard.handle(r, { foodsId: two, way: 'compose', num: 40 });
    expect(res.data.success).toBeGreaterThan(0);
    for (const g of res.data.gained) {
      expect(levelOf(g.foodsId)).toBe(3);
      expect(need3).toContain(g.foodsId);
      expect(g.foodsId).not.toBe(full);
    }
  });

  it('区服把上限设成 0：和原来一样按出现权重抽，会出不缺的食材（Review Focus 5）', async () => {
    const shardId = await shardWith(OFF);
    const r = await newRestaurant(t, { shardId, goods: { [NEWBIE.foodVoucherBase + 3]: 60 } });
    await t.game.store.use(r, { goodsId: NEWBIE.foodVoucherBase + 3, num: 60 });
    const need = needOf();
    const got = await gotFoods(r.restaurantId);
    expect([...got.keys()].some((id) => !need.has(id))).toBe(true);
  });

  it('本街菜全部满级（没有缺料）时照常抽，不报错（Review Focus 1）', async () => {
    const shardId = await shardWith(ALWAYS);
    const r = await newRestaurant(t, { shardId, goods: { [NEWBIE.foodVoucherBase + 3]: 10 } });
    const levels = new Uint8Array(config().maxCookbookId + 1).fill(config().tuning.rest.cookbookMaxGrade);
    await t.db
      .updateTable('restaurant_cookbooks')
      .set({ levels: Buffer.from(levels) })
      .where('rest_id', '=', r.restaurantId)
      .execute();
    await t.game.store.use(r, { goodsId: NEWBIE.foodVoucherBase + 3, num: 10 });
    const got = await gotFoods(r.restaurantId);
    expect([...got.values()].reduce((a, n) => a + n, 0)).toBe(10);
  });
});

describe('缺料抽取器按需准备（质量期 ③）', () => {
  const q = queryCounter();
  let qt: TestGame;
  beforeAll(async () => {
    qt = await createTestGame({ db: q.db });
  });
  afterAll(async () => {
    await qt.close();
    await q.db.destroy();
  });

  it('开只有银币、钻石、道具的礼包（新手大礼包）：不读菜谱等级和橱柜', async () => {
    const shardId = await createShard(qt.db);
    await setTuning(qt, shardId, ALWAYS);
    const r = await newRestaurant(qt, { shardId, goods: { [NEWBIE.pack]: 1 } });
    const { sqls } = await q.count(() => qt.game.store.use(r, { goodsId: NEWBIE.pack, num: 1 }));
    expect(sqls.filter((s) => /from "restaurant_cookbooks"/.test(s))).toEqual([]);
  });

  it('合成：橱柜只读一次（缺料清单用合成前读的那份）', async () => {
    const shardId = await createShard(qt.db);
    await setTuning(qt, shardId, ALWAYS);
    const two = qt.game.deps.config.foodPools.get(2)!.items[0]!.id;
    const r = await newRestaurant(qt, {
      shardId,
      patch: { coin: 100_000, strength: 100 },
      foods: { [two]: 10 },
    });
    const { sqls } = await q.count(() => qt.game.cupboard.handle(r, { foodsId: two, way: 'compose', num: 10 }));
    expect(sqls.filter((s) => /^select .* from "cupboard_food" where "rest_id" = \$1$/.test(s))).toHaveLength(1);
  });
});
