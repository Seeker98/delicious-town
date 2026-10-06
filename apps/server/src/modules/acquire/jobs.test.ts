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
    // 最早的汇总日按全表算（收购 PR 3 终审）：测试库共用，垫一行 30 天前的，窗口 7 天都算数
    const old = await newRestaurant(t, { shardId });
    await income(old.restaurantId, addDays(today, -30), 1);
    const s = await ensureState(t.db, shardId, r.restaurantId, a(), new Date());
    expect(s).toMatchObject({ base: 5_000_000, heat: 1, owner_rest_id: null });
    expect((await ensureState(t.db, shardId, r.restaurantId, a(), new Date())).base).toBe(5_000_000);
  });

  it('收入汇总每次补前两天（某天任务失败、最后一轮结算晚写进来时下一天补上）；只清本区服的旧收入', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const other = await newRestaurant(t);
    const round = (coin: number, at: Date, no: number) =>
      t.db
        .insertInto('income_round')
        .values({
          rest_id: r.restaurantId,
          round_no: no,
          coin,
          exp: 0,
          oil: 0,
          customers: JSON.stringify({}),
          rates: JSON.stringify({}),
          drops: JSON.stringify([]),
          created_at: at,
        })
        .execute();
    await round(30, gameTime('2000-01-08', 12), 1);
    await round(40, gameTime('2000-01-09', 12), 2);
    await income(r.restaurantId, '1999-12-01', 1);
    await income(other.restaurantId, '1999-12-01', 1);
    const [incomeJob] = acquireJobs(t.game.deps);
    const settings = await t.game.shards.settings(shardId);
    await incomeJob!.run({
      shardId,
      period: 'x',
      now: gameTime('2000-01-10', 0, 6),
      settings,
      log: { error: () => undefined },
    });
    const days = await t.db
      .selectFrom('rest_income_day')
      .select(['day', 'coin'])
      .where('rest_id', '=', r.restaurantId)
      .orderBy('day')
      .execute();
    expect(days).toEqual([
      { day: '2000-01-08', coin: 30 },
      { day: '2000-01-09', coin: 40 },
    ]);
    // 别的区服的旧收入不归这个区服的任务清
    expect(
      await t.db
        .selectFrom('rest_income_day')
        .select('day')
        .where('rest_id', '=', other.restaurantId)
        .execute(),
    ).toHaveLength(1);
  });

  it('交易记录、拦截记录留 30 天', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    const old = gameTime('2000-01-01', 12);
    const recent = gameTime('2000-02-05', 12);
    for (const at of [old, recent]) {
      await t.db
        .insertInto('acquire_log')
        .values({
          shard_id: shardId,
          kind: 'release',
          buyer_rest_id: null,
          target_rest_id: r.restaurantId,
          seller_rest_id: null,
          price: 0,
          tax: 0,
          heat_after: 1,
          created_at: at,
        })
        .execute();
      await t.db
        .insertInto('acquire_block')
        .values({
          shard_id: shardId,
          buyer_rest_id: r.restaurantId,
          target_rest_id: r.restaurantId,
          reason: 'ip',
          created_at: at,
        })
        .execute();
    }
    await runAcquireDay(t.game.deps, shardId, gameTime('2000-02-10', 1), a());
    expect(
      await t.db.selectFrom('acquire_log').select('created_at').where('shard_id', '=', shardId).execute(),
    ).toEqual([{ created_at: recent }]);
    expect(
      await t.db.selectFrom('acquire_block').select('created_at').where('shard_id', '=', shardId).execute(),
    ).toEqual([{ created_at: recent }]);
  });

  it('分红、打理记录留 30 天，只清本区服的（收购 PR 2）', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const o = await newRestaurant(t, { shardId: other });
    for (const id of [r.restaurantId, o.restaurantId])
      for (const day of ['2000-01-01', '2000-02-05']) {
        await t.db
          .insertInto('acquire_dividend')
          .values({ rest_id: id, day, owner_rest_id: id, coin: 1, tended: false })
          .execute();
        await t.db.insertInto('acquire_tend').values({ rest_id: id, day, created_at: new Date() }).execute();
      }
    await runAcquireDay(t.game.deps, shardId, gameTime('2000-02-10', 1), a());
    const days = (table: 'acquire_dividend' | 'acquire_tend', id: number) =>
      t.db.selectFrom(table).select('day').where('rest_id', '=', id).orderBy('day').execute();
    expect(await days('acquire_dividend', r.restaurantId)).toEqual([{ day: '2000-02-05' }]);
    expect(await days('acquire_tend', r.restaurantId)).toEqual([{ day: '2000-02-05' }]);
    expect(await days('acquire_dividend', o.restaurantId)).toHaveLength(2);
    expect(await days('acquire_tend', o.restaurantId)).toHaveLength(2);
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
