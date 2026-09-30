import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { awardChampion, mysteriousJobs } from './jobs';

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
  it('只算昨天开始烹制的批次，取单批价值最高者，并列都给蟹黄堡秘方', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(new Date());
    const yesterday = addDays(today, -1);
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => newRestaurant(t, { shardId })));
    await cooked(a!.restaurantId, shardId, gameTime(yesterday, 10), 100, 10);
    await cooked(b!.restaurantId, shardId, gameTime(yesterday, 20), 50, 20);
    await cooked(c!.restaurantId, shardId, gameTime(yesterday, 11), 10, 10);
    await cooked(c!.restaurantId, shardId, gameTime(today, 1), 100000, 100);
    const r = await awardChampion(t.game.deps, shardId, today, gameTime(today, 9));
    expect(r).toEqual({ winners: 2, value: 1000 });
    expect(await goodsNum(t, a!.restaurantId, 165)).toBe(1);
    expect(await goodsNum(t, b!.restaurantId, 165)).toBe(1);
    expect(await goodsNum(t, c!.restaurantId, 165)).toBe(0);
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(news.filter((n) => n.type === 'mc.champion')).toHaveLength(2);
  });

  it('昨天没人烹制时什么也不发；任务按区服功能 mysterious 调度、每天 9 点一个周期', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(new Date());
    expect(await awardChampion(t.game.deps, shardId, today, gameTime(today, 9))).toEqual({
      winners: 0,
      value: 0,
    });
    const job = mysteriousJobs(t.game.deps)[0]!;
    expect(job).toMatchObject({ name: 'mc-champion', feature: 'mysterious' });
    const settings = await t.game.shards.settings(shardId);
    expect(job.period(gameTime(today, 10), settings)).toBe(`${today}@09`);
  });
});
