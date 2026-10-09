import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameTime, RANK_BOARDS } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { BOARD_SOURCES } from './boards';

const DAY = '2026-10-01'; // 周四；本周一 09-28
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => {
  t.clock.set(gameTime(DAY, 12));
  t.game.rank.clearCache();
});

const board = (ctx: RestCtx, key: string) => t.game.rank.board(ctx, key);
const ids = (rows: Array<{ restId: number }>) => rows.map((r) => r.restId);

async function income(restId: number, round: number, coin: number, at: Date) {
  await t.db
    .insertInto('income_round')
    .values({
      rest_id: restId,
      round_no: round,
      coin,
      exp: coin * 2,
      oil: 0,
      customers: JSON.stringify({}),
      rates: JSON.stringify({}),
      drops: JSON.stringify([]),
      created_at: at,
    })
    .execute();
}

async function counter(restId: number, key: string, day: string, count: number) {
  await t.db.insertInto('daily_counter').values({ rest_id: restId, key, day, count }).execute();
}

async function rests(n: number, shardId?: number): Promise<RestCtx[]> {
  const sid = shardId ?? (await createShard(t.db));
  const out: RestCtx[] = [];
  for (let i = 0; i < n; i++) out.push(await newRestaurant(t, { shardId: sid }));
  return out;
}

describe('排行榜（设计文档 §2.6）', () => {
  it('收益今日：只算今天；NPC 和封禁账号不上榜', async () => {
    const [a, b, c] = await rests(3);
    const npc = await newRestaurant(t, { shardId: a!.shardId, patch: { npc: true } });
    const banned = await newRestaurant(t, { shardId: a!.shardId });
    await t.db
      .updateTable('account')
      .set({ banned_at: new Date() })
      .where('id', '=', banned.accountId)
      .execute();
    await income(a!.restaurantId, 1, 100, gameTime(DAY, 10));
    await income(a!.restaurantId, 2, 100, gameTime(DAY, 11));
    await income(b!.restaurantId, 2, 500, gameTime(DAY, 11));
    await income(c!.restaurantId, 1, 9999, gameTime('2026-09-30', 23));
    await income(npc.restaurantId, 2, 99999, gameTime(DAY, 11));
    await income(banned.restaurantId, 2, 99999, gameTime(DAY, 11));
    const r = await board(a!, 'income.coin.today');
    expect(r.rows.map((x) => [x.restId, x.rank, x.value])).toEqual([
      [b!.restaurantId, 1, 500],
      [a!.restaurantId, 2, 200],
    ]);
    expect(r.me).toEqual({ rank: 2, value: 200 });
    expect((await board(a!, 'income.exp.yesterday')).rows.map((x) => x.value)).toEqual([19998]);
  });

  it('收益单轮：只算本区最近一轮', async () => {
    const [a, b] = await rests(2);
    await income(a!.restaurantId, 7, 900, gameTime(DAY, 10));
    await income(b!.restaurantId, 8, 100, gameTime(DAY, 11));
    expect(ids((await board(a!, 'income.coin.round')).rows)).toEqual([b!.restaurantId]);
  });

  it('收益单轮：只看最近一天里的轮次，很久以前的轮次不算（终审 I3）', async () => {
    const [a, b, c] = await rests(3);
    await income(c!.restaurantId, 999, 900, gameTime('2026-09-27', 10));
    await income(a!.restaurantId, 7, 300, gameTime(DAY, 10));
    await income(b!.restaurantId, 8, 100, gameTime(DAY, 11));
    expect(ids((await board(a!, 'income.coin.round')).rows)).toEqual([b!.restaurantId]);
  });

  it('等级：同级时经验高的在前，名次不并列', async () => {
    const sid = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: sid, patch: { level: 10, exp: 5 } });
    const b = await newRestaurant(t, { shardId: sid, patch: { level: 10, exp: 50 } });
    const r = await board(a, 'level');
    expect(r.rows.map((x) => [x.restId, x.rank])).toEqual([
      [b.restaurantId, 1],
      [a.restaurantId, 2],
    ]);
  });

  it('食谱：品级 ≥ N 的个数', async () => {
    const [a] = await rests(1);
    await t.db
      .insertInto('restaurant_cookbooks')
      .values({ rest_id: a!.restaurantId, levels: Buffer.from([0, 7, 8, 6, 7, 1]) })
      .onConflict((oc) => oc.column('rest_id').doUpdateSet({ levels: Buffer.from([0, 7, 8, 6, 7, 1]) }))
      .execute();
    expect((await board(a!, 'cookbook.7')).me).toEqual({ rank: 1, value: 3 });
    expect((await board(a!, 'cookbook.1')).me).toEqual({ rank: 1, value: 5 });
  });

  it('灭蟑螂本周、上周：按周一切分', async () => {
    const [a, b] = await rests(2);
    await counter(a!.restaurantId, 'roach.kill', '2026-09-28', 3);
    await counter(a!.restaurantId, 'roach.kill', '2026-09-27', 10);
    await counter(b!.restaurantId, 'roach.kill', '2026-09-21', 4);
    await counter(b!.restaurantId, 'roach.kill', DAY, 1);
    expect((await board(a!, 'roach.kill.thisWeek')).rows.map((x) => [x.restId, x.value])).toEqual([
      [a!.restaurantId, 3],
      [b!.restaurantId, 1],
    ]);
    expect((await board(a!, 'roach.kill.lastWeek')).rows.map((x) => [x.restId, x.value])).toEqual([
      [a!.restaurantId, 10],
      [b!.restaurantId, 4],
    ]);
    expect((await board(a!, 'roach.kill.today')).rows.map((x) => x.restId)).toEqual([b!.restaurantId]);
  });

  it('酒吧：本周、上周达到过的最高连胜、连败分榜；输了也不掉榜，同样高的先达到的在前（问题记录 517）', async () => {
    const [a, b, c] = await rests(3);
    const best = (restId: number, result: 1 | -1, week: string, times: number, at: Date) =>
      t.db
        .insertInto('bar_streak_best')
        .values({ rest_id: restId, game: 'fg', result, week, times, reached_at: at })
        .execute();
    // 本周一 09-28；a、b 都连胜过 6，b 先达到
    await best(a!.restaurantId, 1, '2026-09-28', 6, gameTime('2026-09-30', 20));
    await best(b!.restaurantId, 1, '2026-09-28', 6, gameTime('2026-09-29', 9));
    await best(c!.restaurantId, 1, '2026-09-21', 9, gameTime('2026-09-25', 9));
    await best(c!.restaurantId, -1, '2026-09-28', 3, gameTime('2026-09-30', 9));
    // a 现在已经输了：当前状态是连败 1，榜上仍按本周最高 6 算
    await t.db
      .insertInto('bar_state')
      .values({ rest_id: a!.restaurantId, fg_result: -1, fg_times: 1 })
      .execute();
    const rows = (key: string) => board(a!, key).then((d) => d.rows.map((x) => [x.restId, x.rank, x.value]));
    expect(await rows('bar.fg.win.thisWeek')).toEqual([
      [b!.restaurantId, 1, 6],
      [a!.restaurantId, 2, 6],
    ]);
    expect(await rows('bar.fg.win.lastWeek')).toEqual([[c!.restaurantId, 1, 9]]);
    expect(await rows('bar.fg.lose.thisWeek')).toEqual([[c!.restaurantId, 1, 3]]);
    expect(await rows('bar.cup.win.thisWeek')).toEqual([]);
  });

  it('酒吧跨周：周日达到的记录周一 0 点后到了上周榜，本周榜清空；转数字连不中、猜酒杯连败的上周榜也能读（517 遗留：缺的测试）', async () => {
    const [a, b, c] = await rests(3);
    const best = (restId: number, game: string, result: 1 | -1, times: number) =>
      t.db
        .insertInto('bar_streak_best')
        .values({
          rest_id: restId,
          game,
          result,
          week: '2026-09-28',
          times,
          reached_at: gameTime('2026-10-04', 22),
        })
        .execute();
    // 周日（10-04）晚上达到的：算在 09-28 这一周
    await best(a!.restaurantId, 'fg', 1, 5);
    await best(b!.restaurantId, 'num', -1, 4);
    await best(c!.restaurantId, 'cup', -1, 2);
    const rows = (key: string) => board(a!, key).then((d) => d.rows.map((x) => [x.restId, x.value]));
    t.clock.set(gameTime('2026-10-04', 23));
    t.game.rank.clearCache();
    expect(await rows('bar.fg.win.thisWeek')).toEqual([[a!.restaurantId, 5]]);
    // 周一 0 点后：本周（10-05）还没人玩，上周就是刚过去的那一周
    t.clock.set(gameTime('2026-10-05', 0, 5));
    t.game.rank.clearCache();
    expect(await rows('bar.fg.win.thisWeek')).toEqual([]);
    expect(await rows('bar.fg.win.lastWeek')).toEqual([[a!.restaurantId, 5]]);
    expect(await rows('bar.num.lose.lastWeek')).toEqual([[b!.restaurantId, 4]]);
    expect(await rows('bar.cup.lose.lastWeek')).toEqual([[c!.restaurantId, 2]]);
    expect(await rows('bar.num.win.lastWeek')).toEqual([]);
  });

  it('新酒吧游戏的本周、上周榜按每日计数加起来（问题记录 569）；最后一颗糖新手桌、高手桌分开', async () => {
    const [a, b] = await rests(2);
    const boards: Array<[string, string]> = [
      ['bar.darts.win', 'bar.darts.win'],
      ['bar.nim.novice', 'bar.nim.win.novice'],
      ['bar.nim.expert', 'bar.nim.win.expert'],
      ['bar.spice.win', 'bar.spice.win'],
      ['bar.memory.top', 'bar.memory.perfect'],
      ['bar.devil.payout', 'bar.devil.payout'],
      ['bar.deal.top', 'bar.deal.top'],
    ];
    for (const [, key] of boards) {
      await counter(a!.restaurantId, key, '2026-09-28', 2);
      await counter(a!.restaurantId, key, '2026-10-01', 1);
      await counter(b!.restaurantId, key, '2026-09-30', 5);
      await counter(b!.restaurantId, key, '2026-09-27', 4);
    }
    const rows = (key: string) => board(a!, key).then((d) => d.rows.map((x) => [x.restId, x.value]));
    for (const [board] of boards) {
      expect(await rows(`${board}.thisWeek`), board).toEqual([
        [b!.restaurantId, 5],
        [a!.restaurantId, 3],
      ]);
      expect(await rows(`${board}.lastWeek`), board).toEqual([[b!.restaurantId, 4]]);
    }
    // 新手桌和高手桌的计数互不相混
    await counter(a!.restaurantId, 'bar.nim.win.novice', '2026-09-29', 10);
    t.game.rank.clearCache();
    expect(await rows('bar.nim.expert.thisWeek')).toEqual([
      [b!.restaurantId, 5],
      [a!.restaurantId, 3],
    ]);
  });

  it('秘制调料单局最少几次猜中：越少越靠前，同样少的先达到的在前（问题记录 569）', async () => {
    const [a, b, c] = await rests(3);
    const best = (restId: number, week: string, times: number, hour: number) =>
      t.db
        .insertInto('bar_streak_best')
        .values({
          rest_id: restId,
          game: 'spice',
          result: 1,
          week,
          times,
          reached_at: gameTime('2026-09-29', hour),
        })
        .execute();
    await best(a!.restaurantId, '2026-09-28', 5, 10);
    await best(b!.restaurantId, '2026-09-28', 3, 12);
    await best(c!.restaurantId, '2026-09-28', 3, 11);
    await best(a!.restaurantId, '2026-09-21', 2, 10);
    const rows = (key: string) => board(a!, key).then((d) => d.rows.map((x) => [x.restId, x.rank, x.value]));
    expect(await rows('bar.spice.best.thisWeek')).toEqual([
      [c!.restaurantId, 1, 3],
      [b!.restaurantId, 2, 3],
      [a!.restaurantId, 3, 5],
    ]);
    expect(await rows('bar.spice.best.lastWeek')).toEqual([[a!.restaurantId, 1, 2]]);
  });

  it('特色菜昨日价值：单批最大值', async () => {
    const [a] = await rests(1);
    const cook = (total: number, price: number, at: Date) =>
      t.db
        .insertInto('mc_cook')
        .values({
          rest_id: a!.restaurantId,
          shard_id: a!.shardId,
          mc_id: 1,
          level: 1,
          grade: 1,
          cook_num: total,
          total_num: total,
          left_num: total,
          price,
          created_at: at,
        })
        .execute();
    await cook(10, 100, gameTime('2026-09-30', 10));
    await cook(5, 300, gameTime('2026-09-30', 11));
    await cook(100, 100, gameTime(DAY, 10));
    expect((await board(a!, 'mc.yesterday')).me).toEqual({ rank: 1, value: 1500 });
    expect((await board(a!, 'mc.best')).me).toEqual({ rank: 1, value: 10000 });
    expect((await board(a!, 'mc.times')).me).toEqual({ rank: 1, value: 3 });
  });

  it('打赏本周：同值时先打赏的在前', async () => {
    const [a, b] = await rests(2);
    const tip = (restId: number, at: Date) =>
      t.db
        .insertInto('hiphop_tip')
        .values({ shard_id: a!.shardId, rest_id: restId, kind: 'coin', num: 5, worth: 1, created_at: at })
        .execute();
    await tip(b!.restaurantId, gameTime('2026-09-29', 10));
    await tip(a!.restaurantId, gameTime('2026-09-30', 10));
    const r = await board(a!, 'hiphop.week');
    expect(r.rows.map((x) => [x.restId, x.rank])).toEqual([
      [b!.restaurantId, 1],
      [a!.restaurantId, 2],
    ]);
  });

  it('我在 50 名之外也给名次；值为 0 时 me 为 null', async () => {
    const sid = await createShard(t.db);
    const list: RestCtx[] = [];
    for (let i = 0; i < 55; i++)
      list.push(await newRestaurant(t, { shardId: sid, patch: { renown: 1000 - i } }));
    const zero = await newRestaurant(t, { shardId: sid, patch: { renown: 0 } });
    const r = await board(list[52]!, 'renown');
    expect(r.rows).toHaveLength(50);
    expect(r.me).toEqual({ rank: 53, value: 948 });
    expect((await board(zero, 'renown')).me).toBeNull();
  });

  it('缓存：60 秒内不变，过期后更新；厨力榜 10 分钟', async () => {
    const sid = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: sid, patch: { renown: 10 } });
    expect((await board(a, 'renown')).me?.value).toBe(10);
    await t.db.updateTable('restaurant').set({ renown: 20 }).where('id', '=', a.restaurantId).execute();
    expect((await board(a, 'renown')).me?.value).toBe(10);
    t.clock.advance(61_000);
    expect((await board(a, 'renown')).me?.value).toBe(20);

    const p0 = (await board(a, 'power')).me?.value ?? 0;
    await t.db.updateTable('restaurant').set({ attr_cook: 500 }).where('id', '=', a.restaurantId).execute();
    t.clock.advance(61_000);
    expect((await board(a, 'power')).me?.value ?? 0).toBe(p0);
    t.clock.advance(600_000);
    expect((await board(a, 'power')).me?.value).toBeGreaterThan(p0);
  });

  it('缓存过期时同时进来的请求只算一次；算失败不留缓存（终审 I2）', async () => {
    const [a] = await rests(1);
    const real = BOARD_SOURCES.renown!;
    // 放慢 50ms，保证三个请求确实重叠在同一次计算上
    const spy = vi
      .spyOn(BOARD_SOURCES, 'renown')
      .mockImplementation(async (c) => (await new Promise((r) => setTimeout(r, 50)), real(c)));
    try {
      await Promise.all([board(a!, 'renown'), board(a!, 'renown'), board(a!, 'renown')]);
      expect(spy).toHaveBeenCalledTimes(1);
      t.game.rank.clearCache();
      spy.mockRejectedValueOnce(new Error('boom'));
      await expect(board(a!, 'renown')).rejects.toThrow('boom');
      await expect(board(a!, 'renown')).resolves.toMatchObject({ key: 'renown' });
    } finally {
      spy.mockRestore();
    }
  });

  it('区服之间互不影响', async () => {
    const [a] = await rests(1);
    const [b] = await rests(1);
    await t.db.updateTable('restaurant').set({ renown: 77 }).where('id', '=', a!.restaurantId).execute();
    await board(a!, 'renown');
    expect(ids((await board(b!, 'renown')).rows)).not.toContain(a!.restaurantId);
  });

  it('未知的榜报参数错误；其余每个榜都能查', async () => {
    const [a] = await rests(1);
    await expect(board(a!, 'nope')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    for (const b of RANK_BOARDS) await expect(board(a!, b.key)).resolves.toMatchObject({ key: b.key });
  });
});
