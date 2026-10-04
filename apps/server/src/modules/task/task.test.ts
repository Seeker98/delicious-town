import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const task = () => t.game.task;

describe('活跃度（规格书 15 §15.2）', () => {
  it('签到 +10；给自己添油每次 5 分、每天最多 2 次；带上餐厅星级（问题记录：锁定的活跃项要写明几星开放）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000, oil: 0, oil_max: 1000, star_level: 1 } });
    await task().signIn(ctx);
    for (let i = 0; i < 3; i++) {
      await t.db.updateTable('restaurant').set({ oil: 0 }).where('id', '=', ctx.restaurantId).execute();
      await t.game.growth.refuel(ctx);
    }
    const a = await task().activation(ctx);
    expect(a.signedIn).toBe(true);
    // 首页写明签到领到了什么（backlog 厨具小修）
    expect(a.signInGift).toBe(GOODS.signInGift);
    expect(a.star).toBe(1);
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

describe('活跃项的门槛（问题记录 360）', () => {
  it('交易所、事件预测按区服的等级门槛；区服关掉的功能标成未开放；带上餐厅等级', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1, star_level: 0 } });
    const { tuning } = await t.game.shards.settings(ctx.shardId);
    const a = await task().activation(ctx);
    const item = (name: string) => a.items.find((x) => x.name === name)!;
    expect(a.level).toBe(1);
    expect(item('交易所成交')).toMatchObject({
      needLevel: tuning.exchange.minLevel,
      needStar: 0,
      off: false,
    });
    expect(item('事件预测交易')).toMatchObject({ needLevel: tuning.predict.minLevel, off: false });
    // 排位挑战也算这一项、不要星级：不标 1 星（质量期 ⑥ 终审）
    expect(item('与好友赛厨')).toMatchObject({ needStar: 0, needLevel: 0 });
    expect(item('签到')).toMatchObject({ needStar: 0, needLevel: 0, off: false });
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: ctx.shardId,
        override: JSON.stringify({ features: { exchange: false, bar: false } }),
      })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    const b = await task().activation(ctx);
    expect(b.items.find((x) => x.name === '交易所成交')!.off).toBe(true);
    // 所有功能都按动作对照表推：酒吧关了，“酒吧娱乐”也标未开放（质量期 ⑥ 终审）
    expect(b.items.find((x) => x.name === '酒吧娱乐')!.off).toBe(true);
    expect(b.items.find((x) => x.name === '签到')!.off).toBe(false);
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
