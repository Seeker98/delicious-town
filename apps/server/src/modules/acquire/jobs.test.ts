import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { krabFor } from '../../../test/town';
import { acquireJobs, runAcquireDay } from './jobs';
import { ensureState } from './state';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const a = () => t.deps.config.tuning.acquire;
const state = (restId: number) =>
  t.db.selectFrom('acquire_state').selectAll().where('rest_id', '=', restId).executeTakeFirst();
const income = (restId: number, day: string, coin: number) =>
  t.db.insertInto('rest_income_day').values({ rest_id: restId, day, coin, rounds: 100 }).execute();

describe('每天的收购任务（收购 PR 1）', () => {
  it('2 星以上的店建行、按前 7 天算基础身价；热度回落；挂牌到期清掉；1 星的不建', async () => {
    const shardId = await createShard(t.db);
    const now = gameTime('2026-10-10', 0, 6);
    const star2 = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const star1 = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
    for (let i = 1; i <= 7; i++) await income(star2.restaurantId, addDays('2026-10-10', -i), 200_000);
    // 第 8 天前的不算
    await income(star2.restaurantId, '2026-10-02', 99_999_999);
    const hot = await newRestaurant(t, { shardId, patch: { star_level: 3 } });
    await t.db
      .insertInto('acquire_state')
      .values({
        rest_id: hot.restaurantId,
        shard_id: shardId,
        base: 1,
        heat: 2,
        list_rate: 0.5,
        list_until: gameTime('2026-10-09', 12),
      })
      .execute();
    const r = await runAcquireDay(t.game.deps, shardId, now, a());
    expect(r).toMatchObject({ bases: 2, decayed: 1, unlisted: 1 });
    expect(await state(star2.restaurantId)).toMatchObject({ base: 1_000_000, heat: 1, owner_rest_id: null });
    expect(await state(star1.restaurantId)).toBeUndefined();
    expect(await state(hot.restaurantId)).toMatchObject({
      base: 100_000,
      heat: 1.9,
      list_rate: null,
      list_until: null,
    });
  });

  it('被收购过、后来不到 2 星（数据改过）的店也照样重算；蟹老板不算', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
    await t.db
      .insertInto('acquire_state')
      .values({ rest_id: low.restaurantId, shard_id: shardId, base: 5, heat: 1 })
      .execute();
    const krab = await krabFor(t, shardId, 0);
    await t.db.updateTable('restaurant').set({ star_level: 5 }).where('id', '=', krab).execute();
    await runAcquireDay(t.game.deps, shardId, gameTime('2026-10-10', 1), a());
    expect((await state(low.restaurantId))!.base).toBe(100_000);
    expect(await state(krab)).toBeUndefined();
  });

  it('还没有行的店：当场按近 7 天建行（今天刚到 2 星）；再调一次不变', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const today = gameDay(new Date());
    await income(r.restaurantId, addDays(today, -1), 7_000_000);
    const s = await ensureState(t.db, shardId, r.restaurantId, a(), new Date());
    expect(s).toMatchObject({ base: 5_000_000, heat: 1, owner_rest_id: null });
    expect((await ensureState(t.db, shardId, r.restaurantId, a(), new Date())).base).toBe(5_000_000);
  });

  it('00:05 之前不跑；之后每个游戏日一个周期键；收入汇总挂在结算上', () => {
    const [incomeJob, dayJob] = acquireJobs(t.game.deps);
    const settings = {
      features: {},
      restaurant: t.deps.config.bundle.restaurantDefaults,
      tuning: t.deps.config.tuning,
    };
    expect(incomeJob!.feature).toBe('settlement');
    expect(dayJob!.feature).toBe('acquire');
    expect(dayJob!.period(gameTime('2026-10-10', 0, 4), settings)).toBeNull();
    expect(dayJob!.period(gameTime('2026-10-10', 0, 5), settings)).toBe('acquire-day-2026-10-10');
    expect(incomeJob!.period(gameTime('2026-10-10', 9), settings)).toBe('income-day-2026-10-10');
  });
});
