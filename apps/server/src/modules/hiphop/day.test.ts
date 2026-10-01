import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard, failRestLog } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { runDueJobs } from '../../worker/periodic';
import { rollHiphopDay } from './day';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

async function insertIncome(restId: number, at: Date): Promise<void> {
  await t.db
    .insertInto('income_round')
    .values({
      rest_id: restId,
      round_no: 1,
      coin: 100,
      exp: 10,
      oil: 1,
      customers: JSON.stringify({}),
      rates: JSON.stringify({}),
      drops: JSON.stringify([]),
      created_at: at,
    })
    .execute();
}

describe('嘻哈男孩每日地点（设计文档 §2.1）', () => {
  it('公共地点：只出现在那一页，其余地点和店都是 here:false', async () => {
    const a = await newRestaurant(t);
    await setTuning(t, a.shardId, { hiphop: { placeWeights: [[3, 1]] } });
    await rollHiphopDay(t.game.deps, a.shardId, DAY, t.clock.now);
    const spot = await t.game.hiphop.spot(a, { place: 3 });
    expect(spot).toMatchObject({ here: true, place: 3, restId: null, myWeekWorth: 0 });
    if (spot.here) {
      expect(spot.food.level).toBeGreaterThanOrEqual(1);
      expect(spot.food.level).toBeLessThanOrEqual(5);
      expect(spot.worth).toBeGreaterThanOrEqual(43750);
      expect(spot.closeAt).toBe(gameTime(DAY, 22).toISOString());
    }
    for (const p of [1, 2, 4, 5, 6])
      expect(await t.game.hiphop.spot(a, { place: p })).toEqual({ here: false });
    expect(await t.game.hiphop.spot(a, { restId: a.restaurantId })).toEqual({ here: false });
  });

  it('餐厅地点：只挑近 7 天有收益的玩家店；那家店得到嘻哈文化并写新闻', async () => {
    const shardId = await createShard(t.db);
    const idle = await newRestaurant(t, { shardId });
    const busy = await newRestaurant(t, { shardId });
    const old = await newRestaurant(t, { shardId });
    await insertIncome(busy.restaurantId, t.clock.now);
    await insertIncome(old.restaurantId, gameTime('2026-09-20', 12));
    await setTuning(t, shardId, { hiphop: { placeWeights: [[9, 1]] } });
    const r = await rollHiphopDay(t.game.deps, shardId, DAY, t.clock.now);
    expect(r).toMatchObject({ created: true, place: 9, restId: busy.restaurantId });
    expect(await goodsNum(t, busy.restaurantId, 230)).toBe(1);
    expect(await goodsNum(t, idle.restaurantId, 230)).toBe(0);
    expect(await t.game.hiphop.spot(idle, { restId: busy.restaurantId })).toMatchObject({
      here: true,
      place: 9,
    });
    expect(await t.game.hiphop.spot(idle, { restId: idle.restaurantId })).toEqual({ here: false });
    expect(await t.game.hiphop.spot(idle, { place: 1 })).toEqual({ here: false });
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(news.map((n) => n.type)).toContain('hiphop.event');
  });

  it('没有活跃店时改抽公共地点', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      hiphop: {
        placeWeights: [
          [9, 5],
          [2, 1],
        ],
      },
    });
    expect(await rollHiphopDay(t.game.deps, shardId, DAY, t.clock.now)).toMatchObject({
      place: 2,
      restId: null,
    });
  });

  it('同一天只生成一次', async () => {
    const shardId = await createShard(t.db);
    const first = await rollHiphopDay(t.game.deps, shardId, DAY, t.clock.now);
    const again = await rollHiphopDay(t.game.deps, shardId, DAY, t.clock.now);
    expect(again.created).toBe(false);
    expect(again.place).toBe(first.place);
  });

  it('9 点前、22 点后都不在', async () => {
    const a = await newRestaurant(t);
    await setTuning(t, a.shardId, { hiphop: { placeWeights: [[1, 1]] } });
    await rollHiphopDay(t.game.deps, a.shardId, DAY, gameTime(DAY, 9));
    t.clock.set(gameTime(DAY, 8, 59));
    expect(await t.game.hiphop.spot(a, { place: 1 })).toEqual({ here: false });
    t.clock.set(gameTime(DAY, 22));
    expect(await t.game.hiphop.spot(a, { place: 1 })).toEqual({ here: false });
    t.clock.set(gameTime(DAY, 21, 59));
    expect(await t.game.hiphop.spot(a, { place: 1 })).toMatchObject({ here: true });
  });

  it('定时任务 9 点跑：周期键是当天', async () => {
    const shardId = await createShard(t.db);
    t.clock.set(gameTime(DAY, 9, 1));
    const ran = await runDueJobs(
      { db: t.db, shards: t.game.shards, now: t.deps.now, log: { error: () => {} } },
      t.game.jobs,
      { shardIds: [shardId] },
    );
    expect(ran.filter((r) => r.job === 'hiphop-daily')).toEqual([
      { shardId, job: 'hiphop-daily', period: `${DAY}@09`, ok: true },
    ]);
    const row = await t.db
      .selectFrom('hiphop_day')
      .selectAll()
      .where('shard_id', '=', shardId)
      .executeTakeFirst();
    expect(row?.day).toBe(DAY);
  });

  it('选中的店发嘻哈文化失败时：不留半截，改抽公共地点，全区当天照样有嘻哈男孩（PR29 遗留、终审 I3）', async () => {
    const shardId = await createShard(t.db);
    const busy = await newRestaurant(t, { shardId });
    await insertIncome(busy.restaurantId, t.clock.now);
    await setTuning(t, shardId, {
      hiphop: {
        placeWeights: [
          [9, 100],
          [4, 1],
        ],
      },
    });
    const restore = await failRestLog(t.db, busy.restaurantId);
    const r = await rollHiphopDay(t.game.deps, shardId, DAY, t.clock.now);
    await restore();
    expect(r).toMatchObject({ created: true, place: 4, restId: null });
    expect(await goodsNum(t, busy.restaurantId, 230)).toBe(0);
    const row = await t.db
      .selectFrom('hiphop_day')
      .select(['place', 'rest_id'])
      .where('shard_id', '=', shardId)
      .execute();
    expect(row).toEqual([{ place: 4, rest_id: null }]);
  });
});
