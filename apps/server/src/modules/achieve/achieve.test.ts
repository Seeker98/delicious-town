import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { backfillCounters } from '../../db/migrations/0087_achievements';
import { up as cleanNpcAch } from '../../db/migrations/0091_ach_npc';
import { roundOf } from '@dt/shared';
import { BOARD_SOURCES } from '../rank/boards';
import { settleShardRound } from '../settlement/runner';
import { rankRows } from '../rank/ranking';
import { bumpCounters, crossed, raiseCounter } from './counters';
import { ACH_BACKFILL_VERSION } from './award';
import { achieveJobs } from './jobs';
import { achValues } from './metrics';
import { gainExp } from '../../core/resources';
import { createAchieveService, evaluateRest } from './service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const cfg = () => t.game.deps.config;
const svc = () => createAchieveService(t.game.deps);
const tuning = () => cfg().tuning.achieve;

async function got(restId: number) {
  return t.db
    .selectFrom('rest_achievement')
    .select(['ach_id', 'backfilled', 'first_in_shard', 'pts'])
    .where('rest_id', '=', restId)
    .orderBy('ach_id')
    .execute();
}
async function points(restId: number) {
  return (
    (await t.db.selectFrom('rest_ach').select('points').where('rest_id', '=', restId).executeTakeFirst())
      ?.points ?? 0
  );
}
async function logs(restId: number, type: string) {
  return t.db
    .selectFrom('rest_log')
    .select('params')
    .where('rest_id', '=', restId)
    .where('type', '=', type)
    .execute();
}
async function evaluate(restId: number, backfilled = false, events?: GameEvent[]) {
  const rest = await t.db
    .selectFrom('restaurant')
    .selectAll()
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  return evaluateRest(t.db, cfg(), tuning(), rest, { now: t.clock.now, backfilled, events });
}
const markBackfilled = (shardId: number) =>
  t.db
    .insertInto('ach_shard')
    .values({ shard_id: shardId, backfilled_at: new Date(), version: ACH_BACKFILL_VERSION })
    .execute();

describe('计数类成就', () => {
  it('跨门槛的档：从 prev 涨到 now 之间的才算', () => {
    expect(crossed(cfg(), 'roach.kill', 0, 99)).toEqual([]);
    expect(crossed(cfg(), 'roach.kill', 99, 1500)).toEqual(['roach.1', 'roach.2']);
    expect(crossed(cfg(), 'roach.kill', 1500, 1501)).toEqual([]);
    expect(crossed(cfg(), 'nope', 0, 1e9)).toEqual([]);
  });

  it('动作计数跨过门槛就记：加成就点、写动态、操作的提示里带上', async () => {
    const r = await newRestaurant(t);
    const events = await runSystemOp(
      t.game.deps,
      r.shardId,
      r.restaurantId,
      { source: 'test' },
      async (op) => {
        await emitAction(op, 'roach.kill', 120);
        return op.events;
      },
    );
    expect(await got(r.restaurantId)).toEqual([
      { ach_id: 'roach.1', backfilled: false, first_in_shard: false, pts: 10 },
    ]);
    expect(await points(r.restaurantId)).toBe(10);
    expect((await logs(r.restaurantId, 'achieve.got')).map((l) => l.params)).toEqual([
      { id: 'roach.1', pts: 10, trophy: null, first: false },
    ]);
    expect(events).toContainEqual({ type: 'gain', kind: 'achievement', key: 'roach.1', num: 10 });
  });

  it('只记成就的计数一次加几样；最高值计数比原来高才改', async () => {
    const r = await newRestaurant(t);
    await runSystemOp(t.game.deps, r.shardId, r.restaurantId, { source: 'test' }, async (op) => {
      await bumpCounters(op, [
        ['income.rounds', 1000],
        ['income.coin', 0],
      ]);
      await raiseCounter(op, 'streak.fg.win', 5);
      await raiseCounter(op, 'streak.fg.win', 3);
    });
    expect((await got(r.restaurantId)).map((x) => x.ach_id)).toEqual(['fgwin.1', 'fgwin.2', 'rounds.1']);
    const c = await t.db
      .selectFrom('event_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', r.restaurantId)
      .orderBy('key')
      .execute();
    expect(c.map((x) => [x.key, Number(x.count)])).toEqual([
      ['income.rounds', 1000],
      ['streak.fg.win', 5],
    ]);
  });
});

describe('结算的计数', () => {
  it('每轮营业把银币、轮数加进计数（和写收益同一条语句），跨门槛照样记', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 100000 } });
    await t.db
      .insertInto('event_counter')
      .values({ rest_id: r.restaurantId, key: 'income.rounds', count: 999 })
      .execute();
    const round = roundOf(new Date());
    await settleShardRound(t.game.deps, t.game.world, shardId, round, new Date());
    const c = await t.db
      .selectFrom('event_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', r.restaurantId)
      .where('key', 'in', ['income.rounds', 'income.coin'])
      .execute();
    const inc = await t.db
      .selectFrom('income_round')
      .select('coin')
      .where('rest_id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    const m = Object.fromEntries(c.map((x) => [x.key, Number(x.count)]));
    expect(m['income.rounds']).toBe(1000);
    expect(m['income.coin'] ?? 0).toBe(Number(inc.coin));
    expect((await got(r.restaurantId)).map((x) => x.ach_id)).toContain('rounds.1');
  });
});

describe('状态类成就和首达', () => {
  it('等级到了就记；到顶那档发称号', async () => {
    const r = await newRestaurant(t, { patch: { level: 114 } });
    const ids = await evaluate(r.restaurantId);
    expect(ids.filter((x) => x.startsWith('level.'))).toHaveLength(8);
    const icon = await t.db
      .selectFrom('rest_icon')
      .select(['icon_key', 'expires_at'])
      .where('rest_id', '=', r.restaurantId)
      .execute();
    expect(icon).toContainEqual({ icon_key: 'ach-legend', expires_at: null });
    // 再算一遍不重复记
    expect((await evaluate(r.restaurantId)).filter((x) => x.startsWith('level.'))).toEqual([]);
  });

  it('补发完的区服里第一个拿到 40 点以上的记首达；80 点以上的发新闻；第二家不算首达', async () => {
    const shardId = await createShard(t.db);
    await markBackfilled(shardId);
    const a = await newRestaurant(t, { shardId, patch: { level: 110 } });
    await evaluate(a.restaurantId);
    const rows = await got(a.restaurantId);
    const first = rows.filter((x) => x.first_in_shard).map((x) => x.ach_id);
    // 20、40 级 10 点，60 级 20 点不算；80 级 40、99 级 60、105 级 60、110 级 80 算首达
    expect(first.filter((x) => x.startsWith('level.'))).toEqual(['level.4', 'level.5', 'level.6', 'level.7']);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', shardId)
      .execute();
    expect(news.filter((n) => (n.params as { id?: string }).id?.startsWith('level.'))).toEqual([
      { type: 'achieve.first', params: { id: 'level.7' } },
    ]);
    const b = await newRestaurant(t, { shardId, patch: { level: 110 } });
    await evaluate(b.restaurantId);
    expect((await got(b.restaurantId)).filter((x) => x.first_in_shard)).toEqual([]);
  });

  it('蟹老板的店不拿成就、不占首达；迁移 0091 清掉它已经拿到的（代码审查 2026-10-19）', async () => {
    const shardId = await createShard(t.db);
    await markBackfilled(shardId);
    const npc = await newRestaurant(t, { shardId, patch: { level: 110, npc: true } });
    await evaluate(npc.restaurantId);
    // 别人给它点赞记的“被赞”走动作计数，也不发
    await runSystemOp(t.game.deps, shardId, npc.restaurantId, { source: 'test', now: t.clock.now }, (op) =>
      emitAction(op, 'thumbs.received', 5000),
    );
    expect(await got(npc.restaurantId)).toEqual([]);
    expect(await points(npc.restaurantId)).toBe(0);
    const a = await newRestaurant(t, { shardId, patch: { level: 110 } });
    await evaluate(a.restaurantId);
    expect((await got(a.restaurantId)).filter((x) => x.first_in_shard).map((x) => x.ach_id)).toContain(
      'level.7',
    );
    // 老数据：蟹老板身上已经有的成就、点数、动态、称号、首达新闻都清掉
    const now = t.clock.now;
    await t.db
      .insertInto('rest_achievement')
      .values({ rest_id: npc.restaurantId, ach_id: 'level.7', pts: 80, achieved_at: now, backfilled: false })
      .execute();
    await t.db
      .insertInto('rest_ach')
      .values({ rest_id: npc.restaurantId, points: 80, points_at: now })
      .execute();
    await t.db
      .insertInto('rest_log')
      .values({
        rest_id: npc.restaurantId,
        type: 'achieve.got',
        params: JSON.stringify({ id: 'level.7' }),
        created_at: now,
      })
      .execute();
    await t.db
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'achieve.first',
        rest_id: npc.restaurantId,
        params: JSON.stringify({}),
      })
      .execute();
    await cleanNpcAch(t.db);
    expect(await got(npc.restaurantId)).toEqual([]);
    expect(await points(npc.restaurantId)).toBe(0);
    expect(await logs(npc.restaurantId, 'achieve.got')).toEqual([]);
    const news = await t.db.selectFrom('news').select('id').where('rest_id', '=', npc.restaurantId).execute();
    expect(news).toEqual([]);
    // 真实玩家的不动
    expect((await got(a.restaurantId)).length).toBeGreaterThan(0);
  });

  it('没补发完的区服不算首达、不发新闻', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId, patch: { level: 110 } });
    await evaluate(a.restaurantId);
    expect((await got(a.restaurantId)).filter((x) => x.first_in_shard)).toEqual([]);
    expect(
      await t.db
        .selectFrom('news')
        .select('id')
        .where('shard_id', '=', shardId)
        .where('type', '=', 'achieve.first')
        .execute(),
    ).toEqual([]);
  });
});

describe('审查后补的几条', () => {
  it('补发完以前打开成就页：补算出来的记成补发（不写动态）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 45 } });
    await svc().mine(r);
    const rows = (await got(r.restaurantId)).filter((x) => x.ach_id.startsWith('level.'));
    expect(rows.every((x) => x.backfilled)).toBe(true);
    expect(await logs(r.restaurantId, 'achieve.got')).toEqual([]);
  });

  it('升级当场记等级成就（提示里带上），不用等打开成就页', async () => {
    const r = await newRestaurant(t, { patch: { level: 19, exp: 0 } });
    const events = await runSystemOp(
      t.game.deps,
      r.shardId,
      r.restaurantId,
      { source: 'test' },
      async (op) => {
        gainExp(op, 50_000_000);
        return op.events;
      },
    );
    expect((await got(r.restaurantId)).map((x) => x.ach_id)).toContain('level.1');
    expect(events).toContainEqual({ type: 'gain', kind: 'achievement', key: 'level.1', num: 10 });
  });

  it('镇上的朋友：领过卡门见面礼的店（早期在大胃哥那里领的也算）卡门按聊过算', async () => {
    const r = await newRestaurant(t);
    await t.db
      .insertInto('event_counter')
      .values(
        ['bigEater', 'wenjie', 'bro13'].map((n) => ({
          rest_id: r.restaurantId,
          key: `town.talk.${n}`,
          count: 3,
        })),
      )
      .execute();
    const rest = () =>
      t.db.selectFrom('restaurant').selectAll().where('id', '=', r.restaurantId).executeTakeFirstOrThrow();
    expect((await achValues(t.db, cfg(), await rest(), t.clock.now)).get('state:talkAll')).toBe(3);
    await t.db.insertInto('town_rest').values({ rest_id: r.restaurantId, big_eater_gift: true }).execute();
    expect((await achValues(t.db, cfg(), await rest(), t.clock.now)).get('state:talkAll')).toBe(4);
    expect(await evaluate(r.restaurantId)).toContain('talk.1');
  });

  it('开过店的街：搬家记下的街加上现在这条街', async () => {
    const r = await newRestaurant(t, { patch: { street_id: 5 } });
    await t.db
      .insertInto('event_counter')
      .values([
        { rest_id: r.restaurantId, key: 'street.seen.0', count: 1 },
        { rest_id: r.restaurantId, key: 'street.seen.3', count: 1 },
        { rest_id: r.restaurantId, key: 'rest.moveTo.29', count: 1 },
      ])
      .execute();
    const rest = await t.db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    const v = await achValues(t.db, cfg(), rest, t.clock.now);
    expect(v.get('state:streets')).toBe(4);
  });
});

describe('上线补发和每天补算', () => {
  it('补发：记成补发的（不写动态），写 ach_shard；再跑跳过；补发完每天的补算照常写动态', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 45 } });
    const jobs = achieveJobs(t.game.deps);
    const backfill = jobs.find((j) => j.name === 'achieve-backfill');
    const scan = jobs.find((j) => j.name === 'achieve-scan');
    const settings = await t.game.deps.shards.settings(shardId);
    const ctx = { shardId, settings, period: 'v1', now: t.clock.now, log: { error: () => {} } };
    expect(await scan!.run(ctx)).toEqual({ skipped: true });
    expect(await backfill!.run(ctx)).toMatchObject({ rests: 1, failed: 0 });
    expect((await got(r.restaurantId)).filter((x) => x.ach_id.startsWith('level.'))).toEqual([
      { ach_id: 'level.1', backfilled: true, first_in_shard: false, pts: 10 },
      { ach_id: 'level.2', backfilled: true, first_in_shard: false, pts: 10 },
    ]);
    expect(await logs(r.restaurantId, 'achieve.got')).toEqual([]);
    expect(await backfill!.run(ctx)).toEqual({ skipped: true });
    await t.db.updateTable('restaurant').set({ level: 60 }).where('id', '=', r.restaurantId).execute();
    expect(await scan!.run(ctx)).toMatchObject({ rests: 1, failed: 0 });
    expect((await logs(r.restaurantId, 'achieve.got')).map((l) => (l.params as { id: string }).id)).toContain(
      'level.3',
    );
  });
});

describe('排行和展示柜', () => {
  it('成就点榜只排够格的店（等级、注册天数、邮箱）；同分按时间再按店号', async () => {
    const shardId = await createShard(t.db);
    const ok1 = await newRestaurant(t, { shardId, verified: true, accountDays: 10, patch: { level: 40 } });
    const ok2 = await newRestaurant(t, { shardId, verified: true, accountDays: 10, patch: { level: 40 } });
    const young = await newRestaurant(t, { shardId, verified: true, accountDays: 0, patch: { level: 40 } });
    const unverified = await newRestaurant(t, { shardId, accountDays: 10, patch: { level: 40 } });
    for (const r of [ok2, ok1, young, unverified]) await evaluate(r.restaurantId, true);
    const rows = rankRows(
      await BOARD_SOURCES['achieve.points']!({ db: t.db, shardId, now: t.clock.now, config: cfg() }),
    );
    const ids = rows.map((x) => x.restId);
    expect(ids).not.toContain(young.restaurantId);
    expect(ids).not.toContain(unverified.restaurantId);
    expect(rows.map((x) => x.rank)).toEqual([1, 2]);
    // 两家同时补发、同分：先到的时间一样，按店号
    expect(ids).toEqual([ok1.restaurantId, ok2.restaurantId].sort((a, b) => a - b));
  });

  it('成就墙：自己的带进度和名次；展示柜只能摆自己有的奖杯，格数按成就点', async () => {
    const r = await newRestaurant(t, { verified: true, accountDays: 10, patch: { level: 99 } });
    const mine = await svc().mine(r);
    expect(mine.points).toBeGreaterThan(0);
    expect(mine.progress['state:level']).toBe(99);
    expect(mine.got.map((g) => g.id)).toContain('level.5');
    expect(mine.shelfSlots).toBe(1);
    await expect(svc().shelf(r, ['roach1'])).rejects.toMatchObject({ params: { reason: 'trophy_missing' } });
    await expect(svc().shelf(r, ['lv99', 'roach1'])).rejects.toMatchObject({
      params: { reason: 'shelf_full' },
    });
    const v = (await svc().shelf(r, ['lv99'])).data;
    expect(v.shelf).toEqual(['lv99']);
    const other = await newRestaurant(t, { shardId: r.shardId });
    const seen = await svc().other(other, r.restaurantId);
    expect(seen).toMatchObject({ mine: false, shelf: ['lv99'], progress: {} });
  });
});

describe('迁移 0087：补几个新计数', () => {
  it('营业银币和轮数（汇总 + 没汇总的每轮）、划拳最长连胜、只写了动态的几样', async () => {
    const r = await newRestaurant(t);
    const id = r.restaurantId;
    await t.db
      .insertInto('rest_income_day')
      .values([
        { rest_id: id, day: '2026-10-10', coin: 1000, rounds: 300 },
        { rest_id: id, day: '2026-10-11', coin: 2000, rounds: 360 },
      ])
      .execute();
    await t.db
      .insertInto('income_round')
      .values([
        // 10-11 已经汇总过，不重复算；10-12 还没汇总
        {
          rest_id: id,
          round_no: 1,
          coin: 5,
          exp: 1,
          oil: 1,
          customers: '{}',
          rates: '{}',
          drops: '[]',
          created_at: new Date('2026-10-11T04:00:00Z'),
        },
        {
          rest_id: id,
          round_no: 2,
          coin: 7,
          exp: 1,
          oil: 1,
          customers: '{}',
          rates: '{}',
          drops: '[]',
          created_at: new Date('2026-10-12T04:00:00Z'),
        },
      ])
      .execute();
    await t.db
      .insertInto('bar_streak_best')
      .values([
        { rest_id: id, game: 'fg', result: 1, week: '2026-10-05', times: 4, reached_at: new Date() },
        { rest_id: id, game: 'fg', result: 1, week: '2026-10-12', times: 6, reached_at: new Date() },
        { rest_id: id, game: 'fg', result: -1, week: '2026-10-12', times: 9, reached_at: new Date() },
      ])
      .execute();
    const now = new Date();
    await t.db
      .insertInto('rest_log')
      .values([
        { rest_id: id, type: 'mc.champion', params: JSON.stringify({ rank: 1 }), created_at: now },
        { rest_id: id, type: 'mc.champion', params: JSON.stringify({ rank: 2 }), created_at: now },
        { rest_id: id, type: 'mouse.trap', params: '{}', created_at: now },
        { rest_id: id, type: 'town.talk', params: JSON.stringify({ npc: 'wenjie' }), created_at: now },
        { rest_id: id, type: 'town.talk', params: JSON.stringify({ npc: 'wenjie' }), created_at: now },
        { rest_id: id, type: 'rest.move', params: JSON.stringify({ from: 0, to: 3 }), created_at: now },
        { rest_id: id, type: 'rest.move', params: JSON.stringify({ from: 3, to: 7 }), created_at: now },
      ])
      .execute();
    // 特色菜冠军按新闻算（动态 10-18 才开始写）：两条冠军新闻，动态里的不算
    const shardId = (
      await t.db.selectFrom('restaurant').select('shard_id').where('id', '=', id).executeTakeFirstOrThrow()
    ).shard_id;
    await t.db
      .insertInto('news')
      .values([
        { shard_id: shardId, type: 'mc.champion', rest_id: id, params: '{}', created_at: now },
        { shard_id: shardId, type: 'mc.champion', rest_id: id, params: '{}', created_at: now },
      ])
      .execute();
    await backfillCounters(t.db, [id]);
    const c = await t.db
      .selectFrom('event_counter')
      .select(['key', 'count'])
      .where('rest_id', '=', id)
      .orderBy('key')
      .execute();
    expect(Object.fromEntries(c.map((x) => [x.key, Number(x.count)]))).toEqual({
      'income.coin': 3007,
      'income.rounds': 661,
      'mc.champion': 2,
      'mouse.trap': 1,
      'streak.fg.lose': 9,
      'street.seen.0': 1,
      'street.seen.3': 1,
      'street.seen.7': 1,
      'streak.fg.win': 6,
      'town.talk.wenjie': 2,
    });
  });
});
