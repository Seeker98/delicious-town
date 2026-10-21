import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime, seededRng } from '@dt/shared';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { shardShortage } from './demand';
import { openLot } from './open';
import { topShort } from './rules';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(7) });
});
afterAll(() => t.close());

const DAY = '2026-10-12';
/** 新手街（0 号街）一道菜都没学的店；active 时今天有一条动作计数 */
async function rest(shardId: number, active: boolean, day = DAY): Promise<number> {
  const id = await createRestaurantFull(t.db, shardId, await createAccountRow(t.db));
  if (active)
    await t.db.insertInto('daily_counter').values({ rest_id: id, day, key: 'signin', count: 1 }).execute();
  return id;
}
/** 新手街每道菜 1 品级要的料合计 */
function streetNeed(): Map<number, number> {
  const c = t.game.deps.config;
  const out = new Map<number, number>();
  for (const id of c.cookbookIndex.idsByStreet.get(0) ?? [])
    for (const x of c.requireCookbook(id).needFoods[1] ?? [])
      out.set(x.foodsId, (out.get(x.foodsId) ?? 0) + x.num);
  return out;
}

describe('区服食材缺口（2026-10-22）', () => {
  it('只算 sinceDay 起有动作的店；橱柜、冰箱里有的扣掉，够了的不算这家店缺', async () => {
    const shardId = await createShard(t.db);
    const a = await rest(shardId, true);
    await rest(shardId, true);
    await rest(shardId, false);
    const need = streetNeed();
    const [x, n] = [...need].sort((p, q) => q[1] - p[1])[0]!;
    // a 店：橱柜 1 份、冰箱放够剩下的
    await t.db
      .insertInto('cupboard_food')
      .values({ rest_id: a, foods_id: x, num: 1, fridge_num: n - 1 })
      .execute();
    const s = await shardShortage(t.db, t.game.deps.config, shardId, DAY);
    expect(s.get(x)).toEqual({ short: n, rests: 1 });
    const [y, m] = [...need].find(([id]) => id !== x)!;
    expect(s.get(y)).toEqual({ short: 2 * m, rests: 2 });
    expect(await shardShortage(t.db, t.game.deps.config, shardId, addDays(DAY, 1))).toEqual(new Map());
  });
});

describe('大宗认购按缺口挑食材（2026-10-22）', () => {
  it('topK = 1 时开缺口第一的那种；第二天它在冷却里，开第二的', async () => {
    const shardId = await createShard(t.db);
    const tb = t.game.deps.config.tuning.bulk;
    await setTuning(t, shardId, { bulk: { ...tb, pick: { ...tb.pick, topK: 1, minRests: 3 } } });
    for (let i = 0; i < 3; i++) await rest(shardId, true);
    const enabled = await t.db
      .selectFrom('bulk_food')
      .select('foods_id')
      .where('enabled', '=', true)
      .execute();
    const c = t.game.deps.config;
    const foods = enabled
      .map((r) => c.requireFood(r.foods_id))
      .filter((f) => !f.retired && f.level <= 5)
      .sort((p, q) => p.id - q.id);
    const s = await shardShortage(t.db, c, shardId, DAY);
    const [first, second] = topShort(foods, s, tb.qty, { topK: 2, minRests: 3 });
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    t.clock.set(gameTime(DAY, 20, 1));
    expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
    // 第二天还在 7 天活跃窗口里
    t.clock.set(gameTime(addDays(DAY, 1), 20, 1));
    expect(gameDay(t.clock.now)).toBe(addDays(DAY, 1));
    expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
    const lots = await t.db
      .selectFrom('bulk_lot')
      .select('foods_id')
      .where('shard_id', '=', shardId)
      .orderBy('opens_at')
      .execute();
    expect(lots.map((l) => l.foods_id)).toEqual([first, second]);
  });
});
