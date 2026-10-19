import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime, weekStart } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { backfillCounters2 } from '../../db/migrations/0088_achievements_2';
import { recordRun, recordStreak } from '../bar/state';
import type { SettleResult } from '../settlement/types';
import { ACH_BACKFILL_VERSION, shardBackfilled } from './award';
import { bumpCountersFor } from './counters';
import { chosenOneToday } from './hidden';
import { achieveJobs, barWeekChampions } from './jobs';
import { achValues } from './metrics';
import { roundAchCounters } from './round';
import { createAchieveService } from './service';

/** 成就 PR②：新计数、隐藏成就、补发版本 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const cfg = () => t.game.deps.config;

async function got(restId: number) {
  return (
    await t.db
      .selectFrom('rest_achievement')
      .select('ach_id')
      .where('rest_id', '=', restId)
      .orderBy('ach_id')
      .execute()
  ).map((x) => x.ach_id);
}
async function counter(restId: number, key: string) {
  const r = await t.db
    .selectFrom('event_counter')
    .select('count')
    .where('rest_id', '=', restId)
    .where('key', '=', key)
    .executeTakeFirst();
  return r ? Number(r.count) : 0;
}
const sys = <T>(r: { shardId: number; restaurantId: number }, fn: Parameters<typeof runSystemOp<T>>[4]) =>
  runSystemOp(t.game.deps, r.shardId, r.restaurantId, { source: 'test' }, fn);

describe('一轮营业的计数', () => {
  const base = (customers: Record<string, number>, o: Partial<SettleResult> = {}) =>
    Object.fromEntries(
      roundAchCounters({ tables: [], customers, oil: 5, logs: [], ...o }, { coin: 100, oilBefore: 10 }),
    );

  it('满座、门可罗雀：桌上没人的是空桌、挑剔顾客走了、蟑螂被消灭', () => {
    expect(base({ '1': 3, '2': 1 })['round.full']).toBe(1);
    expect(base({ '1': 3, '-2': 1 })['round.full']).toBe(0);
    expect(base({ '1': 3, '3': 1, n3: 1 })['round.full']).toBe(1);
    expect(base({ '0': 3, '-3': 1 })['round.empty']).toBe(1);
    expect(base({ '0': 3, '-2': 1 })['round.empty']).toBe(0);
    expect(base({})['round.full']).toBe(0);
  });

  it('比奇堡全家福、灾难现场、痞老板驻留、满意的挑剔顾客、蟹老板', () => {
    const c = base(
      { '8': 1, '6': 1, '7': 1, '9': 1, '3': 1 },
      {
        tables: [
          { no: 1, floor: 1, customer: 0, last: { type: 2, coin: 1, exp: 1, oil: 1, satisfied: true } },
          { no: 2, floor: 1, customer: 0, last: { type: 2, coin: 1, exp: 1, oil: 1, satisfied: false } },
        ],
        logs: [
          { type: 'krab.angry', params: {} },
          { type: 'krab.happy', params: {} },
        ],
      },
    );
    expect(c).toMatchObject({
      'round.bikini': 1,
      'round.disaster': 1,
      'plankton.stay': 1,
      'picky.ok': 1,
      'krab.angry': 1,
      'krab.happy': 1,
    });
  });

  it('一滴入魂只算油本来不止 1 的；倒贴是这一轮银币为负', () => {
    const one = (oilBefore: number, coin = 5) =>
      Object.fromEntries(
        roundAchCounters({ tables: [], customers: { '1': 1 }, oil: 1, logs: [] }, { coin, oilBefore }),
      );
    expect(one(10)['round.oneOil']).toBe(1);
    expect(one(1)['round.oneOil']).toBe(0);
    expect(one(10, -3)['round.negative']).toBe(1);
  });
});

describe('隐藏成就的判定', () => {
  it('银币余额落到恰好 1（这次操作里变了才算）：一枚铜板', async () => {
    const r = await newRestaurant(t, { patch: { coin: 0 } });
    await sys(r, async (op) => gainCoin(op, 1));
    expect(await got(r.restaurantId)).toContain('penny.1');
    const r2 = await newRestaurant(t, { patch: { coin: 1 } });
    await sys(r2, async () => undefined);
    expect(await got(r2.restaurantId)).not.toContain('penny.1');
  });

  it('酒吧的连续次数：命中加一、没命中清零；划拳连平、转数字连败记历史最长', async () => {
    const r = await newRestaurant(t);
    await sys(r, async (op) => {
      for (let i = 0; i < 9; i++) await recordRun(op, 'devil_lose', 'streak.devil.lose', true);
      await recordRun(op, 'devil_lose', 'streak.devil.lose', false);
      await recordRun(op, 'devil_lose', 'streak.devil.lose', true);
      await recordStreak(op, 'fg', 0, 5);
      await recordStreak(op, 'num', -1, 50);
      await recordStreak(op, 'cup', 1, 3);
    });
    expect(await counter(r.restaurantId, 'streak.devil.lose')).toBe(9);
    const s = await t.db
      .selectFrom('bar_state')
      .selectAll()
      .where('rest_id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    expect(s.devil_lose).toBe(1);
    expect(await counter(r.restaurantId, 'streak.cup.win')).toBe(0);
    const ids = await got(r.restaurantId);
    expect(ids).toContain('draw.1');
    expect(ids).toContain('loser.1');
    expect(ids).not.toContain('spicy.1');
  });

  it('没有 Op 的任务也能记（蟹老板的店不记）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const npc = await newRestaurant(t, { shardId, patch: { npc: true } });
    const now = t.clock.now;
    await t.db.transaction().execute(async (tx) => {
      await bumpCountersFor(t.game.deps, tx, { shardId, restId: r.restaurantId, now }, [['hygiene.bad', 1]]);
      await bumpCountersFor(t.game.deps, tx, { shardId, restId: npc.restaurantId, now }, [
        ['hygiene.bad', 1],
      ]);
    });
    expect(await got(r.restaurantId)).toEqual(['hygiene.1']);
    expect(await counter(npc.restaurantId, 'hygiene.bad')).toBe(0);
  });

  it('状态类：都赢过、好友数、猜天气连错', async () => {
    const r = await newRestaurant(t);
    const keys = [
      'streak.fg.win',
      'bar.cup.clear',
      'bar.num.win',
      'bar.slot.won',
      'bar.devil.win',
      'bar.memory.won',
      'bar.darts.win',
      'bar.nim.expert',
      'bar.spice.win6',
      'bar.deal.top',
    ];
    await t.db
      .insertInto('event_counter')
      .values(keys.map((key) => ({ rest_id: r.restaurantId, key, count: 1 })))
      .execute();
    const today = gameDay(t.clock.now);
    await t.db
      .insertInto('mayor_guess')
      .values(
        [3, 2, 1].map((n) => ({
          rest_id: r.restaurantId,
          shard_id: r.shardId,
          day: addDays(today, -n),
          type: 1,
          at: t.clock.now,
          actual: 2,
          right: false,
        })),
      )
      .execute();
    const rest = await t.db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    const v = await achValues(t.db, cfg(), rest, t.clock.now);
    expect(v.get('state:barWon')).toBe(10);
    expect(v.get('state:mayorMiss')).toBe(3);
    expect(v.get('state:friendsAll')).toBe(0);
  });

  it('天选之人：许愿树中奖了还要同一天抽到 A 赏', async () => {
    const r = await newRestaurant(t);
    const now = t.clock.now;
    expect(await chosenOneToday(t.db, r.restaurantId, now)).toBe(false);
    await t.db
      .insertInto('wish_round')
      .values({
        shard_id: r.shardId,
        day: addDays(gameDay(now), -1),
        goods_id: 1,
        num: 1,
        opens_at: now,
        ends_at: now,
        status: 'drawn',
        winner_rest_id: r.restaurantId,
        drawn_at: now,
      })
      .execute();
    expect(await chosenOneToday(t.db, r.restaurantId, now)).toBe(false);
    const pool = await t.db
      .insertInto('kuji_pool')
      .values({ shard_id: r.shardId, day: gameDay(now), seq: 1, status: 'open', total: 10, created_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('kuji_ticket')
      .values({ pool_id: pool.id, idx: 0, tier: 'A', drawn_by: r.restaurantId, drawn_at: now })
      .execute();
    expect(await chosenOneToday(t.db, r.restaurantId, now)).toBe(true);
  });
});

describe('酒吧周冠军', () => {
  it('上周酒吧周榜的第一名各记一次（拿几个榜也只记一次）', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const now = t.clock.now;
    const lastMon = addDays(weekStart(gameDay(now)), -7);
    await t.db
      .insertInto('daily_counter')
      .values([
        { rest_id: a.restaurantId, day: lastMon, key: 'bar.darts.win', count: 5 },
        { rest_id: b.restaurantId, day: lastMon, key: 'bar.darts.win', count: 3 },
        { rest_id: a.restaurantId, day: lastMon, key: 'bar.spice.win', count: 2 },
      ])
      .execute();
    // 连败榜第一不算
    await t.db
      .insertInto('bar_streak_best')
      .values({ rest_id: b.restaurantId, game: 'fg', result: -1, week: lastMon, times: 9, reached_at: now })
      .execute();
    expect(await barWeekChampions(t.game.deps, shardId, now)).toEqual({ champions: 1, failed: 0 });
    expect(await counter(a.restaurantId, 'bar.weekTop')).toBe(1);
    expect(await counter(b.restaurantId, 'bar.weekTop')).toBe(0);
    expect(await got(a.restaurantId)).toContain('barweek.1');
  });
});

describe('补发版本和迁移补计数', () => {
  it('第 1 版补发过的区服：新版本再补一遍（记成补发），写上版本', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    await t.db
      .insertInto('ach_shard')
      .values({ shard_id: shardId, backfilled_at: new Date(), version: 1 })
      .execute();
    await t.db
      .insertInto('event_counter')
      .values({ rest_id: r.restaurantId, key: 'mc.dump', count: 1 })
      .execute();
    expect(await shardBackfilled(t.db, shardId)).toBe(false);
    const backfill = achieveJobs(t.game.deps).find((j) => j.name === 'achieve-backfill')!;
    const settings = await t.game.deps.shards.settings(shardId);
    await backfill.run({
      shardId,
      settings,
      period: `v${ACH_BACKFILL_VERSION}`,
      now: t.clock.now,
      log: { error: () => {} },
    });
    expect(await shardBackfilled(t.db, shardId)).toBe(true);
    const row = await t.db
      .selectFrom('rest_achievement')
      .select(['ach_id', 'backfilled'])
      .where('rest_id', '=', r.restaurantId)
      .where('ach_id', '=', 'waste.1')
      .executeTakeFirstOrThrow();
    expect(row.backfilled).toBe(true);
  });

  it('从动态补：被吃白食、翻橱柜被抓（记在翻的人身上）、自家橱柜被翻', async () => {
    const host = await newRestaurant(t);
    const thief = await newRestaurant(t);
    const at = gameTime(gameDay(t.clock.now), 10);
    await t.db
      .insertInto('rest_log')
      .values([
        {
          rest_id: host.restaurantId,
          type: 'dine.start',
          params: JSON.stringify({ by: thief.restaurantId }),
          created_at: at,
        },
        ...[0, 1, 2].map(() => ({
          rest_id: host.restaurantId,
          type: 'friend.flip',
          params: JSON.stringify({ by: thief.restaurantId, outcome: 'caught' }),
          created_at: at,
        })),
      ])
      .execute();
    await backfillCounters2(t.db, [host.restaurantId, thief.restaurantId]);
    expect(await counter(host.restaurantId, 'dine.victim')).toBe(1);
    expect(await counter(host.restaurantId, 'cupboard.flipped')).toBe(3);
    expect(await counter(thief.restaurantId, 'flip.caught')).toBe(3);
    expect(await counter(thief.restaurantId, 'flip.caughtDay')).toBe(1);
  });
});

describe('隐藏成就在成就墙上', () => {
  it('隐藏成就的进度不发给网页', async () => {
    const r = await newRestaurant(t);
    await t.db
      .insertInto('event_counter')
      .values({ rest_id: r.restaurantId, key: 'mouse.steal', count: 5 })
      .execute();
    const dto = await createAchieveService(t.game.deps).mine(r);
    expect(dto.progress['counter:mouse.steal']).toBeUndefined();
    expect(dto.progress['state:level']).toBeDefined();
  });
});
