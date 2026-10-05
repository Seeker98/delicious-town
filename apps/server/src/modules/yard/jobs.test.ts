import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, gameDay, gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { tickOne } from './jobs';
import { fid } from '../../../test/items';

const MIN = 60_000;
const e = testConfig().tuning.yard.events;
const log = { error: vi.fn() };
/** 6 个随机数都是 0.99：什么都不发生 */
let calm: TestGame;
/** 只有"长草"那个随机数是 0.01：不下雨长草（< 0.024），下雨不长（≥ 0.008） */
let grassy: TestGame;
/** 只有"长虫"那个随机数是 0.001 */
let buggy: TestGame;
beforeAll(async () => {
  calm = await createTestGame({ rng: () => sequenceRng([0.99]) });
  grassy = await createTestGame({ rng: () => sequenceRng([0.99, 0.99, 0.01, 0.99, 0.99, 0.99]) });
  buggy = await createTestGame({ rng: () => sequenceRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.001]) });
});
afterAll(async () => {
  await calm.close();
  await grassy.close();
  await buggy.close();
});

const day = gameDay(new Date());
/** 天气 1 晴、10 小雨 */
async function shardWith(g: TestGame, weatherId: number) {
  const ctx = await newRestaurant(g);
  await g.db
    .insertInto('world_state')
    .values({
      shard_id: ctx.shardId,
      weather_id: weatherId,
      weather_until: new Date(g.clock.now.getTime() + 2 * 3600_000),
      krab_street: 1,
      updated_at: g.clock.now,
    })
    .execute();
  return ctx;
}
/** 在 restId 的 no 号地种大米；默认幼年期、30 分钟前播种（已经能浇水） */
async function cropOf(
  g: TestGame,
  restId: number,
  shardId: number,
  no: number,
  patch: Record<string, unknown> = {},
) {
  const land = await g.db
    .insertInto('yard_land')
    .values({ rest_id: restId, no })
    .returning('id')
    .executeTakeFirstOrThrow();
  const p = await g.db
    .insertInto('yard_plant')
    .values({
      rest_id: restId,
      shard_id: shardId,
      land_id: land.id,
      seed_id: 1,
      foods_id: fid('大米'),
      stage: 1,
      stage_at: new Date(g.clock.now.getTime() - 30 * MIN),
      infancy: 24,
      maturity: 36,
      autumn: 60,
      harvest: 1440,
      harvest_num: 20,
      harvest_max: 20,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return p.id;
}
const run = (g: TestGame, shardId: number) =>
  runDueJobs(
    { db: g.db, shards: g.game.shards, now: () => g.clock.now, log },
    g.game.jobs.filter((j) => j.name === 'yard-events'),
    { shardIds: [shardId] },
  );
const runs = (g: TestGame, shardId: number) =>
  g.db
    .selectFrom('job_run')
    .select(['period', 'stats'])
    .where('shard_id', '=', shardId)
    .where('job', '=', 'yard-events')
    .orderBy('period')
    .execute();
const plantOf = (g: TestGame, id: number) =>
  g.db.selectFrom('yard_plant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('自然事件任务 yard-events（规格书 08 §8.4，裁定 3、7、11）', () => {
  it('不下雨：长草概率 ×3；统计写进 job_run', async () => {
    grassy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(grassy, 1);
    const id = await cropOf(grassy, ctx.restaurantId, ctx.shardId, 1);
    await run(grassy, ctx.shardId);
    expect(await plantOf(grassy, id)).toMatchObject({ grass: 1, stage: 1 });
    expect(await runs(grassy, ctx.shardId)).toEqual([
      { period: `${day}@13:27`, stats: { plants: 1, changed: 1, failed: 0 } },
    ]);
  });

  it('下雨：同样的随机数不长草；到时间、无虫无草的作物自动进入下一阶段', async () => {
    grassy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(grassy, 10);
    const id = await cropOf(grassy, ctx.restaurantId, ctx.shardId, 1);
    await run(grassy, ctx.shardId);
    expect(await plantOf(grassy, id)).toMatchObject({
      grass: 0,
      stage: 2,
      stage_at: grassy.clock.now,
      feed_min: 0,
    });
  });

  it('长虫；有虫时下雨也不自动进阶', async () => {
    buggy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(buggy, 10);
    const id = await cropOf(buggy, ctx.restaurantId, ctx.shardId, 1);
    await run(buggy, ctx.shardId);
    expect(await plantOf(buggy, id)).toMatchObject({ worm: 1, stage: 1 });
  });

  it('收获期过了 → 枯叶期；不下雨干涸 ≥ 100 → 枯叶期；枯叶期的作物不再处理', async () => {
    calm.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(calm, 1);
    const old = await cropOf(calm, ctx.restaurantId, ctx.shardId, 1, {
      stage: 4,
      stage_at: new Date(calm.clock.now.getTime() - 1441 * MIN),
    });
    const dry = await cropOf(calm, ctx.restaurantId, ctx.shardId, 2, { dry: 100 });
    await cropOf(calm, ctx.restaurantId, ctx.shardId, 3, { stage: 5 });
    await run(calm, ctx.shardId);
    expect(await plantOf(calm, old)).toMatchObject({ stage: 5, dry: 0 });
    expect(await plantOf(calm, dry)).toMatchObject({ stage: 5, dry: 0 });
    expect((await runs(calm, ctx.shardId))[0]!.stats).toEqual({ plants: 2, changed: 2, failed: 0 });
  });

  it('同一周期只跑一次；夜里只在 27 分跑', async () => {
    calm.clock.set(gameTime(day, 23, 10));
    const ctx = await shardWith(calm, 1);
    await run(calm, ctx.shardId);
    calm.clock.set(gameTime(day, 23, 20));
    await run(calm, ctx.shardId);
    calm.clock.set(gameTime(addDays(day, 1), 0, 30));
    await run(calm, ctx.shardId);
    expect((await runs(calm, ctx.shardId)).map((r) => r.period)).toEqual([
      `${day}@22:27`,
      `${addDays(day, 1)}@00:27`,
    ]);
  });

  it('功能关闭的区服不跑，作物不变', async () => {
    grassy.clock.set(gameTime(day, 13, 30));
    const ctx = await shardWith(grassy, 1);
    const id = await cropOf(grassy, ctx.restaurantId, ctx.shardId, 1);
    await grassy.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { yard: false } }) })
      .execute();
    grassy.game.shards.invalidate(ctx.shardId);
    await run(grassy, ctx.shardId);
    expect(await runs(grassy, ctx.shardId)).toEqual([]);
    expect((await plantOf(grassy, id)).grass).toBe(0);
  });

  it('作物已被收获（行不在）时跳过、不报错（Review Focus 5）', async () => {
    expect(await tickOne(calm.db, 2_000_000_000, false, calm.clock.now, sequenceRng([0.01]), e)).toBe(false);
  });
});
