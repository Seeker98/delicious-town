import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const task = () => t.game.task;

describe('主线任务', () => {
  it('加油一次后完成第 1 步，领奖 2000 银币 + 200 经验，进入第 2 步', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000, oil: 0, oil_max: 1000 } });
    let list = await task().tasks(ctx);
    expect(list.main).toMatchObject({ step: 1, key: 'oil.fill', progress: 0, done: false });
    await t.game.growth.refuel(ctx);
    list = await task().tasks(ctx);
    expect(list.main).toMatchObject({ progress: 1, done: true });
    const before = await restRow(t, ctx.restaurantId);
    await task().claimTask(ctx, list.main!.id);
    const after = await restRow(t, ctx.restaurantId);
    expect(after.coin - before.coin).toBe(2000);
    expect(after.main_task_step).toBe(2);
    await expect(task().claimTask(ctx, list.main!.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('没完成不能领', async () => {
    const ctx = await newRestaurant(t);
    const list = await task().tasks(ctx);
    await expect(task().claimTask(ctx, list.main!.id)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
  });

  it('跳过区服关闭的功能（设计文档 裁定 7）：关掉外卖后第 34、35 步跳到第 36 步投喂克拉肯', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 34, level: 5 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { takeaway: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    const list = await task().tasks(ctx);
    expect(list.mainStep).toBe(36);
    expect(list.main).toMatchObject({ step: 36, key: 'kraken.feed', done: false });
  });

  it('第 8 步打蟑螂、第 9 步加好友不再跳过', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 8 } });
    expect((await task().tasks(ctx)).main).toMatchObject({ step: 8, key: 'roach.kill' });
  });

  it('支线：领完后不再显示', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 12 }, goods: { 1: 2 } });
    await t.game.market.joinGuess(ctx, [238]);
    const list = await task().tasks(ctx);
    const side = list.side.find((x) => x.key === 'market.guess')!;
    expect(side.done).toBe(true);
    await task().claimTask(ctx, side.id);
    expect((await task().tasks(ctx)).side.some((x) => x.id === side.id)).toBe(false);
  });
});

describe('活跃度（规格书 15 §15.2）', () => {
  it('签到 +10；给自己添油每次 5 分、每天最多 2 次', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000, oil: 0, oil_max: 1000 } });
    await task().signIn(ctx);
    for (let i = 0; i < 3; i++) {
      await t.db.updateTable('restaurant').set({ oil: 0 }).where('id', '=', ctx.restaurantId).execute();
      await t.game.growth.refuel(ctx);
    }
    const a = await task().activation(ctx);
    expect(a.signedIn).toBe(true);
    expect(a.total).toBe(10 + 10);
    expect(a.items.find((x) => x.name === '给自己添油')).toMatchObject({ count: 3, limit: 2 });
  });

  it('活跃奖励：经验 × 餐厅等级；有爱心项链翻倍；每档每天一次', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 10, exp: 0 } });
    const day = gameDay(t.clock.now);
    const put = (counts: Record<number, number>) =>
      t.db
        .insertInto('daily_counter')
        .values(
          Object.entries(counts).map(([id, count]) => ({
            rest_id: ctx.restaurantId,
            day,
            key: `act:${id}`,
            count,
          })),
        )
        .execute();
    await put({ 1: 1, 4: 3, 20: 1, 21: 1 });
    expect((await task().activation(ctx)).total).toBe(35);
    await expect(task().claimActivation(ctx, 50)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await put({ 6: 1, 12: 1, 30: 1, 11: 1 });
    expect((await task().activation(ctx)).total).toBe(51);
    await grantGoods(t.db, config, ctx.restaurantId, 167, 1, t.clock.now);
    const r = await task().claimActivation(ctx, 50);
    expect(r.events).toContainEqual({ type: 'gain', kind: 'exp', num: 500 * 10 * 2 });
    await expect(task().claimActivation(ctx, 50)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });
});

describe('签到（规格书 15 §15.3）', () => {
  it('每天一次，得到每日签到礼包；按北京时间换日（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t);
    t.clock.set(new Date('2026-09-30T15:59:00Z'));
    await task().signIn(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 115)).toBe(1);
    await expect(task().signIn(ctx)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    t.clock.set(new Date('2026-09-30T16:00:00Z'));
    await task().signIn(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 115)).toBe(2);
    t.clock.set(new Date());
  });
});
