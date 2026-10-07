import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime, weekStart } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { createDb } from '../../db';
import { insertActivity } from '../../../test/activity';
import { testEnvWith } from '../../../test/helpers';
import { showQuest } from '../../../test/quests';
import { CHAPTER_MARK } from './quests';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const task = () => t.game.task;

async function setCounters(restId: number, kv: Record<string, number>) {
  for (const [key, count] of Object.entries(kv))
    await t.db.insertInto('event_counter').values({ rest_id: restId, key, count }).execute();
}
async function setWeekly(restId: number, kv: Record<string, number>) {
  const week = weekStart(gameDay(t.clock.now));
  for (const [key, count] of Object.entries(kv))
    await t.db.insertInto('weekly_counter').values({ rest_id: restId, week, key, count }).execute();
}
async function setLearned(restId: number, learned: number) {
  await t.db
    .updateTable('restaurant')
    .set({
      cookbook_counts: JSON.stringify({
        learned,
        grade: [0, learned, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        street: {},
      }),
    })
    .where('id', '=', restId)
    .execute();
}
/** 新号：标记已换算，免得换算逻辑干扰 */
async function fresh(patch: Record<string, unknown> = {}) {
  const ctx = await newRestaurant(t, { patch: { quest_version: 1, ...patch } });
  return ctx;
}
async function markDone(restId: number, ids: number[]) {
  await t.db
    .insertInto('quest_done')
    .values(ids.map((quest_id) => ({ rest_id: restId, quest_id })))
    .execute();
}
const mainIds = (chapter: number) =>
  t.deps.config.bundle.quests.filter((q) => q.line === null && q.chapter === chapter).map((q) => q.id);
async function doneRows(restId: number) {
  return (
    await t.db
      .selectFrom('quest_done')
      .select('quest_id')
      .where('rest_id', '=', restId)
      .orderBy('quest_id')
      .execute()
  ).map((r) => r.quest_id);
}

describe('主线章节（问题记录 318）', () => {
  it('新店：第 1 章 6 个任务同时列出；没完成不能领；填油后能领 2,000 银币；领过的标记已领', async () => {
    const ctx = await fresh({ coin: 10000, oil: 0, oil_max: 1000 });
    let list = await task().tasks(ctx);
    expect(list.chapter).toMatchObject({ id: 1, locked: false, claimable: false, total: 6, claimedCount: 0 });
    expect(list.main).toHaveLength(6);
    const oil = list.main.find((q) => q.key === 'oil.fill')!;
    await expect(task().claimTask(ctx, oil.id)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await t.game.growth.refuel(ctx);
    list = await task().tasks(ctx);
    expect(list.main.find((q) => q.id === oil.id)).toMatchObject({ progress: 1, done: true, claimed: false });
    const before = await restRow(t, ctx.restaurantId);
    await task().claimTask(ctx, oil.id);
    expect((await restRow(t, ctx.restaurantId)).coin - before.coin).toBe(2000);
    list = await task().tasks(ctx);
    expect(list.main.find((q) => q.id === oil.id)).toMatchObject({ claimed: true });
    expect(list.chapter!.claimedCount).toBe(1);
    await expect(task().claimTask(ctx, oil.id)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('本章任务全领完才能领章末；领完进入下一章', async () => {
    const ctx = await fresh({ level: 5 });
    const ids = mainIds(1);
    await markDone(ctx.restaurantId, ids.slice(1));
    await expect(task().claimChapter(ctx, 1)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await markDone(ctx.restaurantId, ids.slice(0, 1));
    expect((await task().tasks(ctx)).chapter).toMatchObject({ id: 1, claimable: true });
    await task().claimChapter(ctx, 1);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBe(20);
    expect(await doneRows(ctx.restaurantId)).toContain(CHAPTER_MARK + 1);
    expect((await task().tasks(ctx)).chapter).toMatchObject({ id: 2, locked: false });
    await expect(task().claimChapter(ctx, 1)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('下一章等级不够：返回这一章并标锁定，不列任务（Review Focus 1）', async () => {
    const ctx = await fresh({ level: 3 });
    await markDone(ctx.restaurantId, [...mainIds(1), CHAPTER_MARK + 1]);
    const list = await task().tasks(ctx);
    expect(list.chapter).toMatchObject({ id: 2, locked: true, needLevel: 5 });
    expect(list.main).toEqual([]);
    expect(list.allMainDone).toBe(false);
    await expect(task().claimTask(ctx, mainIds(2)[0]!)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('区服关掉酒吧：第 3 章不列酒吧任务，酒吧支线不出现（Review Focus 5）', async () => {
    const ctx = await fresh({ level: 10 });
    await markDone(ctx.restaurantId, [...mainIds(1), ...mainIds(2), CHAPTER_MARK + 1, CHAPTER_MARK + 2]);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { bar: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    const list = await task().tasks(ctx);
    expect(list.chapter!.id).toBe(3);
    expect(list.main.some((q) => q.key.startsWith('bar.'))).toBe(false);
    expect(list.main).toHaveLength(mainIds(3).length - 1);
    expect(list.lines.map((l) => l.id)).not.toContain(4);
    expect(list.lines.map((l) => l.id)).toContain(3);
  });
});

describe('章末领过后功能又打开（backlog 318）', () => {
  it('关掉酒吧时领了第 3 章章末；酒吧再打开：当前章不退回第 3 章，酒吧任务列在主线里照常能领，不挡第 4 章章末', async () => {
    const ctx = await fresh({ level: 10, star_level: 1 });
    const bar = t.deps.config.bundle.quests.find(
      (q) => q.line === null && q.chapter === 3 && q.feature === 'bar',
    )!;
    await markDone(ctx.restaurantId, [
      ...mainIds(1),
      ...mainIds(2),
      ...mainIds(3).filter((id) => id !== bar.id),
      CHAPTER_MARK + 1,
      CHAPTER_MARK + 2,
      CHAPTER_MARK + 3,
    ]);
    let list = await task().tasks(ctx);
    expect(list.chapter).toMatchObject({ id: 4, total: mainIds(4).length, claimedCount: 0, doneCount: 0 });
    expect(list.main.some((q) => q.id === bar.id)).toBe(false);
    const left = list.leftover.find((q) => q.id === bar.id)!;
    expect(left).toMatchObject({ done: false, claimed: false });
    await setCounters(ctx.restaurantId, { [bar.cond.key.split('|')[0]!]: bar.cond.target });
    await task().claimTask(ctx, bar.id);
    list = await task().tasks(ctx);
    expect(list.leftover).toEqual([]);
    expect(list.chapter!.id).toBe(4);
    await markDone(ctx.restaurantId, mainIds(4));
    expect((await task().tasks(ctx)).chapter).toMatchObject({ id: 4, claimable: true });
  });
});

describe('终审修复', () => {
  it('区服没有进行中的限时活动时，第 6 章不列"领一次限时活动奖励"，也不挡章末（Important 2）', async () => {
    const ctx = await fresh();
    await showQuest(t, ctx.restaurantId, 2122);
    const now = t.clock.now;
    try {
      t.clock.set(new Date('2099-01-01T04:00:00Z'));
      const none = await task().tasks(ctx);
      expect(none.chapter!.id).toBe(6);
      expect(none.main.map((x) => x.key)).not.toContain('activity.claim');
    } finally {
      t.clock.set(now);
    }
    await insertActivity(t, {
      shardId: ctx.shardId,
      spec: { kind: 'goals', def: { goals: [{ key: 'market.buy', target: 1, award: { coin: 1 } }] } },
    });
    expect((await task().tasks(ctx)).main.map((x) => x.key)).toContain('activity.claim');
  });

  it('换算在锁店事务里读区服设置，不另向连接池要连接（池里只有 1 条连接也不卡住，Important 3）', async () => {
    const one = createDb(testEnvWith().DATABASE_URL, 1);
    const g = await createTestGame({ db: one });
    try {
      const ctx = await newRestaurant(g);
      const list = await Promise.race([
        g.game.task.tasks(ctx),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      expect(list?.chapter?.id).toBe(1);
    } finally {
      await g.close();
      await one.destroy();
    }
  }, 20_000);
});

describe('支线', () => {
  it('第 1 章只有食谱支线；10 道上品后能领第一档，之后显示下一档', async () => {
    const ctx = await fresh();
    let list = await task().tasks(ctx);
    expect(list.lines.map((l) => l.id)).toEqual([1]);
    const first = list.lines[0]!.quest!;
    expect(first).toMatchObject({ key: 'cookbooks.grade3', target: 10, done: false });
    await t.db
      .updateTable('restaurant')
      .set({
        cookbook_counts: JSON.stringify({
          learned: 10,
          grade: [0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0],
          street: {},
        }),
      })
      .where('id', '=', ctx.restaurantId)
      .execute();
    await task().claimTask(ctx, first.id);
    list = await task().tasks(ctx);
    expect(list.lines[0]).toMatchObject({ doneCount: 1, lockedStar: null });
    expect(list.lines[0]!.quest!.id).not.toBe(first.id);
  });
});

describe('每周任务', () => {
  it('0 星是 A 组；本周计数够了能领（钻石 5 + 神秘礼券 10）；下周一清零', async () => {
    const ctx = await fresh();
    await setWeekly(ctx.restaurantId, { 'market.buy': 10 });
    const list = await task().tasks(ctx);
    expect(list.weekly).toMatchObject({ group: 'A', week: weekStart(gameDay(t.clock.now)) });
    const q = list.weekly!.quests.find((x) => x.key === 'market.buy')!;
    expect(q).toMatchObject({ progress: 10, done: true, claimed: false });
    const before = await restRow(t, ctx.restaurantId);
    await task().claimTask(ctx, q.id);
    expect((await restRow(t, ctx.restaurantId)).diamond - before.diamond).toBe(5);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBe(10);
    await expect(task().claimTask(ctx, q.id)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    const now = t.clock.now;
    try {
      t.clock.set(gameTime(addDays(weekStart(gameDay(now)), 7), 1));
      const next = (await task().tasks(ctx)).weekly!.quests.find((x) => x.id === q.id)!;
      expect(next).toMatchObject({ progress: 0, claimed: false });
    } finally {
      t.clock.set(now);
    }
  });

  it('4 个都领了才能领全完成奖励，只能领一次；星级升到 1 后换 B 组，A 组领过的不受影响（Review Focus 2）', async () => {
    const ctx = await fresh();
    await setWeekly(ctx.restaurantId, {
      signin: 5,
      'market.buy': 10,
      'cookbook.learn': 10,
      'foods.handle': 5,
    });
    const w = (await task().tasks(ctx)).weekly!;
    await expect(task().claimTask(ctx, w.full.id)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    for (const q of w.quests) await task().claimTask(ctx, q.id);
    expect((await task().tasks(ctx)).weekly!.full).toMatchObject({ claimable: true, claimed: false });
    await task().claimTask(ctx, w.full.id);
    expect(await goodsNum(t, ctx.restaurantId, gid('探险图'))).toBe(1);
    await expect(task().claimTask(ctx, w.full.id)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await t.db.updateTable('restaurant').set({ star_level: 1 }).where('id', '=', ctx.restaurantId).execute();
    const b = (await task().tasks(ctx)).weekly!;
    expect(b.group).toBe('B');
    expect(b.quests.every((q) => !q.claimed)).toBe(true);
    await expect(task().claimTask(ctx, w.quests[0]!.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('B 组一打开就能领“领取本周探险图”：3 张探险图，每周一次；不领拿不到全完成奖励（问题记录 515）', async () => {
    const ctx = await fresh({ star_level: 1 });
    const w = (await task().tasks(ctx)).weekly!;
    expect(w.group).toBe('B');
    const supply = w.quests.find((q) => q.id === 4025)!;
    expect(supply).toMatchObject({ target: 0, done: true, claimed: false });
    await task().claimTask(ctx, supply.id);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mapNormal)).toBe(3);
    await expect(task().claimTask(ctx, supply.id)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    expect((await task().tasks(ctx)).weekly!.full.claimable).toBe(false);
    // 下周一又能领
    t.clock.set(gameTime(addDays(weekStart(gameDay(t.clock.now)), 7), 9));
    await task().claimTask(ctx, supply.id);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mapNormal)).toBe(6);
  });

  it('区服关掉交易所：C 组不列交易所任务，全完成只看剩下的 4 个（含“领取本周探险图”）（Review Focus 5）', async () => {
    const ctx = await fresh({ star_level: 3 });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { exchange: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await setWeekly(ctx.restaurantId, { 'takeaway.deliver': 10, 'temple.explore': 20, 'cookbook.learn': 30 });
    const w = (await task().tasks(ctx)).weekly!;
    expect(w.group).toBe('C');
    expect(w.quests.map((q) => q.key)).not.toContain('exchange.fill');
    for (const q of w.quests) await task().claimTask(ctx, q.id);
    await task().claimTask(ctx, w.full.id);
  });
});

describe('老号换算（Review Focus 3）', () => {
  const ch12 = {
    'oil.fill': 1,
    'attr.allocate': 1,
    'market.buy': 1,
    signin: 1,
    'device.place': 1,
    'shop.buy': 1,
    'foods.handle': 1,
    'roach.kill': 1,
  };

  it('整章已达成的章记完成、不发奖励；章末可领；第一个没达成的章停下；只做一次', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 12, coin: 0 } });
    await setLearned(ctx.restaurantId, 20);
    await setCounters(ctx.restaurantId, ch12);
    const list = await task().tasks(ctx);
    expect(await doneRows(ctx.restaurantId)).toEqual([...mainIds(1), ...mainIds(2)].sort((a, b) => a - b));
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).quest_version).toBe(1);
    expect(list.chapter).toMatchObject({ id: 1, claimable: true, claimedCount: 6 });
    await task().claimChapter(ctx, 1);
    expect((await task().tasks(ctx)).chapter).toMatchObject({ id: 2, claimable: true });
    await task().claimChapter(ctx, 2);
    // 第 3 章当前没达成：照常列出
    expect((await task().tasks(ctx)).chapter).toMatchObject({ id: 3, claimable: false, claimedCount: 0 });
  });

  it('当前章已达成的任务照常可领（发奖励）', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 3, coin: 0 } });
    await setCounters(ctx.restaurantId, { 'oil.fill': 1 });
    const list = await task().tasks(ctx);
    expect(await doneRows(ctx.restaurantId)).toEqual([]);
    const oil = list.main.find((q) => q.key === 'oil.fill')!;
    expect(oil).toMatchObject({ done: true, claimed: false });
    await task().claimTask(ctx, oil.id);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(2000);
  });

  it('同时打开两次不会重复换算', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 12 } });
    await setLearned(ctx.restaurantId, 20);
    await setCounters(ctx.restaurantId, ch12);
    await Promise.all([task().tasks(ctx), task().tasks(ctx)]);
    expect(await doneRows(ctx.restaurantId)).toHaveLength(mainIds(1).length + mainIds(2).length);
  });

  it('第一次领奖（不先打开列表）也先换算', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 12 } });
    await setLearned(ctx.restaurantId, 20);
    await setCounters(ctx.restaurantId, ch12);
    await task().claimChapter(ctx, 1);
    expect(await doneRows(ctx.restaurantId)).toContain(CHAPTER_MARK + 1);
  });
});
