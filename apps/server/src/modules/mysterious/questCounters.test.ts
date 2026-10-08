import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';

/** 支线“神秘菜谱”的计数（问题记录 515 支线扩充 B） */
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const count = (restId: number, key: string) => eventCount(t, restId, key);

describe('鉴定出高级特色菜', () => {
  it('每张鉴定出来的 4 级以上记一次 l4，5 级以上另记 l5', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 200, [GOODS.krabburgerBook]: 200 },
    });
    // 蟹黄堡秘方鉴定出 3~5 级：一直鉴定到出了 4 级以上（515 遗留：原来只鉴定一次，全是 3 级时两个断言都是 0 = 0）
    const levels: number[] = [];
    for (let i = 0; i < 20 && !levels.some((l) => l >= 4); i++) {
      const r = await t.game.mysterious.appraise(ctx, {
        toolId: GOODS.krabburgerBook,
        times: 10,
        noRetry: false,
      });
      levels.push(...r.data.results.filter((x) => x.ok).map((x) => config.requireMc(x.mcId!).level));
    }
    expect(levels.some((l) => l >= 4)).toBe(true);
    expect(await count(ctx.restaurantId, 'mc.appraise.l4')).toBe(levels.filter((l) => l >= 4).length);
    expect(await count(ctx.restaurantId, 'mc.appraise.l5')).toBe(levels.filter((l) => l >= 5).length);
  });
});

describe('一批特色菜价值 10 万以上', () => {
  async function cook(mcId: number, cookNum: number) {
    const foods = Object.fromEntries(config.requireMc(mcId).foods.map((f) => [f, 10]));
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, foods });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
    const r = await t.game.mysterious.cook(ctx, { mcId, cookNum, cookie: false });
    return {
      worth: r.data.cook.totalNum * r.data.cook.price,
      n: await count(ctx.restaurantId, 'mc.cook.big'),
    };
  }

  it('份数 × 单价到 10 万记一次，不到不记', async () => {
    const low = await cook(1, 1);
    const six = config.bundle.mysteriousCookbooks.find((m) => m.level === 6)!;
    const high = await cook(six.id, 5);
    expect(low.worth).toBeLessThan(100_000);
    expect(low.n).toBe(0);
    expect(high.worth).toBeGreaterThanOrEqual(100_000);
    expect(high.n).toBe(1);
  });
});
