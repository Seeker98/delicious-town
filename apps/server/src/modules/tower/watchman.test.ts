import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { duelScores } from './duel';
import { watchmanPeriod } from './watchman';

const DAY = '2026-09-30';
const config = testConfig();
/** 4 层长老在随机数 0.4 下的“养”（菜价按 price 算）；长老数据重新生成时跟着变 */
const floor4Yang = (price: number) =>
  duelScores(
    { name: '4', attrs: config.towerFloors.get(4)!.attrs, mcPrice: price },
    config.tuning.tower.duel,
    sequenceRng([0.4]),
  )[4];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const runJob = async (shardId: number, period: string) =>
  t.game.jobs
    .find((j) => j.name === 'tower-watchman')!
    .run({
      shardId,
      period,
      now: t.clock.now,
      settings: await t.game.shards.settings(shardId),
      log: { error: () => undefined },
    });
const floor4Ready = async () => {
  const ctx = await newRestaurant(t, { patch: { level: 31 } });
  await t.db.insertInto('tower_state').values({ rest_id: ctx.restaurantId, best_floor: 3 }).execute();
  return ctx;
};

describe('守塔人换菜（设计文档裁定 2）', () => {
  it('周期：05:58 以后是今天，之前是昨天', () => {
    const tw = config.tuning.tower;
    expect(watchmanPeriod(gameTime(DAY, 5, 57), tw)).toBe('2026-09-29');
    expect(watchmanPeriod(gameTime(DAY, 5, 58), tw)).toBe(DAY);
  });

  it('还没换过菜：概览里菜为空，4 层"养"按 0 算，挑战不报错（Review Focus 3）', async () => {
    const ctx = await floor4Ready();
    expect((await t.game.tower.overview(ctx)).floors[3]!.mc).toBeNull();
    const r = await t.game.tower.challenge(ctx, { floor: 4, test: true });
    expect(r.data.them.scores[4]).toBe(floor4Yang(0));
  });

  it('4~10 层各换一道：等级在 [⌊(层−2)/2⌋, +3]，每份价值在营养值的 1~1.3 倍；再跑覆盖', async () => {
    const ctx = await newRestaurant(t);
    expect(await runJob(ctx.shardId, DAY)).toEqual({ floors: 7 });
    const rows = await t.db
      .selectFrom('tower_watchman_mc')
      .selectAll()
      .where('shard_id', '=', ctx.shardId)
      .orderBy('floor')
      .execute();
    expect(rows.map((r) => r.floor)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    for (const r of rows) {
      const mc = config.requireMc(r.mc_id);
      const lo = Math.floor((r.floor - 2) / 2);
      expect(mc.level).toBeGreaterThanOrEqual(lo);
      expect(mc.level).toBeLessThanOrEqual(lo + 3);
      expect(r.price).toBeGreaterThanOrEqual(mc.nutritive);
      expect(r.price).toBeLessThanOrEqual(Math.floor(mc.nutritive * 1.3));
      expect(r.day).toBe(DAY);
    }
    expect((await t.game.tower.overview(ctx)).floors[3]!.mc).toEqual({
      mcId: rows[0]!.mc_id,
      price: rows[0]!.price,
    });
    await runJob(ctx.shardId, '2026-10-01');
    const again = await t.db
      .selectFrom('tower_watchman_mc')
      .select('day')
      .where('shard_id', '=', ctx.shardId)
      .execute();
    expect(again.map((r) => r.day)).toEqual(Array(7).fill('2026-10-01'));
  });

  it('"养"加上守塔人当天的菜每份价值 × 0.3（问题记录 396）', async () => {
    const ctx = await floor4Ready();
    await t.db
      .insertInto('tower_watchman_mc')
      .values({ shard_id: ctx.shardId, floor: 4, mc_id: 2, price: 100, day: DAY })
      .execute();
    const r = await t.game.tower.challenge(ctx, { floor: 4, test: true });
    expect(r.data.them.scores[4]).toBe(floor4Yang(100));
    expect(Math.round((floor4Yang(100)! - floor4Yang(0)!) * 10) / 10).toBe(30);
  });
});
