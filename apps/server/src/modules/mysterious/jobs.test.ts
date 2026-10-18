import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { awardChampion, mysteriousJobs } from './jobs';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function cooked(restId: number, shardId: number, at: Date, total: number, price: number) {
  await t.db
    .insertInto('mc_cook')
    .values({
      rest_id: restId,
      shard_id: shardId,
      mc_id: 1,
      level: 4,
      grade: 3,
      cook_num: 1,
      total_num: total,
      left_num: 0,
      price,
      created_at: at,
      ended_at: at,
      end_reason: 'sold',
    })
    .execute();
}

describe('昨日特色菜冠军（规格书 16）', () => {
  it('只算昨天开始烹制的批次，按单批最高价值排名（同值同名次）；第 1 名 2 个美味印章、第 2~4 名各 1 个（2026-10-19）', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(new Date());
    const yesterday = addDays(today, -1);
    const [a, b, c, e, f] = await Promise.all([1, 2, 3, 4, 5].map(() => newRestaurant(t, { shardId })));
    await cooked(a!.restaurantId, shardId, gameTime(yesterday, 10), 100, 10); // 1000，第 1
    await cooked(b!.restaurantId, shardId, gameTime(yesterday, 20), 50, 20); // 1000，并列第 1
    await cooked(c!.restaurantId, shardId, gameTime(yesterday, 11), 10, 10); // 100，第 3
    await cooked(c!.restaurantId, shardId, gameTime(today, 1), 100000, 100); // 今天的不算
    await cooked(e!.restaurantId, shardId, gameTime(yesterday, 12), 5, 10); // 50，第 4
    await cooked(f!.restaurantId, shardId, gameTime(yesterday, 13), 1, 10); // 10，第 5，不给
    const r = await awardChampion(t.game.deps, shardId, today, gameTime(today, 9));
    expect(r).toEqual({ winners: 2, value: 1000, awarded: 4 });
    const seal = gid('美味印章');
    expect(GOODS.krabburgerBook).not.toBe(seal);
    expect(await goodsNum(t, a!.restaurantId, seal)).toBe(2);
    expect(await goodsNum(t, b!.restaurantId, seal)).toBe(2);
    expect(await goodsNum(t, c!.restaurantId, seal)).toBe(1);
    expect(await goodsNum(t, e!.restaurantId, seal)).toBe(1);
    expect(await goodsNum(t, f!.restaurantId, seal)).toBe(0);
    expect(await goodsNum(t, a!.restaurantId, GOODS.krabburgerBook)).toBe(0);
    // 新闻只发第 1 名；每家都有一条餐厅动态写名次和个数
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(news.filter((n) => n.type === 'mc.champion')).toHaveLength(2);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['rest_id', 'params'])
      .where('type', '=', 'mc.champion')
      .where('rest_id', 'in', [a!.restaurantId, c!.restaurantId, f!.restaurantId])
      .execute();
    expect(
      logs
        .map((l) => [
          l.rest_id,
          (l.params as { rank: number; num: number }).rank,
          (l.params as { num: number }).num,
        ])
        .sort(),
    ).toEqual(
      [
        [a!.restaurantId, 1, 2],
        [c!.restaurantId, 3, 1],
      ].sort(),
    );
  });

  it('昨天没人烹制时什么也不发；任务按区服功能 mysterious 调度、每天 9 点一个周期', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(new Date());
    expect(await awardChampion(t.game.deps, shardId, today, gameTime(today, 9))).toEqual({
      winners: 0,
      value: 0,
      awarded: 0,
    });
    const job = mysteriousJobs(t.game.deps)[0]!;
    expect(job).toMatchObject({ name: 'mc-champion', feature: 'mysterious' });
    const settings = await t.game.shards.settings(shardId);
    expect(job.period(gameTime(today, 10), settings)).toBe(`${today}@09`);
  });
});
