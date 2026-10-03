import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { setWeather } from '../../../test/takeaway';
import { setTuning } from '../../../test/town';
import { forceHiphopDay } from './day';
import { foodWorth, tipTickets } from './rules';

const DAY = '2026-10-01';
const config = testConfig();
const F = config.foodPools.get(3)!.items[0]!.id;
const G = config.foodPools.get(2)!.items[0]!.id;
let script: number[] = [0.5];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(script) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

async function setup(patch: Parameters<typeof newRestaurant>[1] = {}, worth = 50_000, place = 1) {
  const a = await newRestaurant(t, patch);
  await setWeather(t, a.shardId, 1);
  await forceHiphopDay(t.db, a.shardId, t.clock.now, {
    place,
    restId: place === 9 ? a.restaurantId : null,
    foodsId: F,
    worth,
  });
  return a;
}

describe('打赏（设计文档 §2.2）', () => {
  it('银币打赏：价值 num/5、经验浮动、写记录、完成支线', async () => {
    script = [0.5, 0.99];
    const a = await setup({ patch: { coin: 10_000_000 } });
    const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 1_000_000 });
    expect(r.data).toEqual({
      worth: 200_000,
      exp: 4761,
      krabCoin: 0,
      tickets: 0,
      rainbow: false,
      fresh: true,
      reply: 'wanted',
    });
    expect((await restRow(t, a.restaurantId)).coin).toBe(9_000_000);
    const rows = await t.db
      .selectFrom('hiphop_tip')
      .selectAll()
      .where('rest_id', '=', a.restaurantId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'coin',
      num: 1_000_000,
      worth: 200_000,
      krab_coin: 0,
      foods_id: null,
    });
    await showQuest(t, a.restaurantId, 3041);
    const side = questIn(await t.game.task.tasks(a), 3041);
    expect(side?.progress).toBe(1);
  });

  it('中蟹币：⌊价值/门槛⌋ 个，写新闻', async () => {
    script = [0.5, 0];
    const a = await setup({ patch: { coin: 10_000_000 } });
    const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 1_000_000 });
    expect(r.data).toMatchObject({ krabCoin: 4, reply: 'krab', rainbow: false });
    expect(await goodsNum(t, a.restaurantId, GOODS.krabCoin)).toBe(4);
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', a.shardId).execute();
    expect(news.map((n) => n.type)).toContain('hiphop.krab');
  });

  it('天气加成让它中的标"虹"', async () => {
    script = [0.5, 0.15];
    const a = await setup({ patch: { coin: 10_000_000, luck: 0 } });
    await setWeather(t, a.shardId, 6);
    const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 1_000_000 });
    expect(r.data).toMatchObject({ reply: 'krab', rainbow: true });
  });

  it('没到门槛：不判蟹币', async () => {
    script = [0.5, 0];
    const a = await setup({ patch: { coin: 10_000_000 } });
    const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 100_000 });
    expect(r.data).toMatchObject({ worth: 20_000, krabCoin: 0, reply: 'thanks' });
  });

  it('钻石打赏：价值 ×10001/3，经验 ×50', async () => {
    script = [0.5, 0.99];
    const a = await setup({ patch: { diamond: 100 } });
    const r = await t.game.hiphop.tip(a, { place: 1, kind: 'diamond', num: 30 });
    expect(r.data).toMatchObject({ worth: 100_010, exp: 1500 });
    expect((await restRow(t, a.restaurantId)).diamond).toBe(70);
  });

  it('食材打赏：想要的按等级折算；别的食材价值 0 且 fresh=false', async () => {
    script = [0.99];
    const a = await setup({ foods: { [F]: 100, [G]: 10 } }, 999_999_999);
    const f = config.requireFood(F);
    const r1 = await t.game.hiphop.tip(a, { place: 1, kind: 'food', foodsId: F, num: 10 });
    expect(r1.data).toMatchObject({ worth: foodWorth(f.coin, f.level, 10), fresh: true, exp: 0 });
    const r2 = await t.game.hiphop.tip(a, { place: 1, kind: 'food', foodsId: G, num: 10 });
    expect(r2.data).toMatchObject({ worth: 0, fresh: false, reply: 'thanks' });
    expect((await foodNum(t, a.restaurantId, F)).num).toBe(90);
    expect((await foodNum(t, a.restaurantId, G)).num).toBe(0);
  });

  it('餐厅地点：店主自己用食材打赏中了蟹币多给礼券；别人不给', async () => {
    script = [0];
    const owner = await setup({ foods: { [F]: 100 } }, 1, 9);
    const f = config.requireFood(F);
    const r = await t.game.hiphop.tip(owner, {
      place: 9,
      restId: owner.restaurantId,
      kind: 'food',
      foodsId: F,
      num: 12,
    });
    expect(r.data).toMatchObject({ reply: 'krab', tickets: tipTickets(12, f.level) });
    expect(await goodsNum(t, owner.restaurantId, GOODS.mysteryTicket)).toBe(tipTickets(12, f.level));
    const guest = await newRestaurant(t, { shardId: owner.shardId, foods: { [F]: 100 } });
    const g = await t.game.hiphop.tip(guest, {
      place: 9,
      restId: owner.restaurantId,
      kind: 'food',
      foodsId: F,
      num: 12,
    });
    expect(g.data).toMatchObject({ reply: 'krab', tickets: 0 });
  });

  it('拒绝：地点不对、22 点后、数量超上限、余额不足', async () => {
    script = [0.5, 0.99];
    const a = await setup({ patch: { coin: 1000 } });
    const wrong = t.game.hiphop.tip(a, { place: 2, kind: 'coin', num: 100 });
    await expect(wrong).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'not_here' } });
    await wrong.catch((e: { params: Record<string, unknown> }) =>
      expect(e.params).not.toHaveProperty('place'),
    );
    await expect(
      t.game.hiphop.tip(a, { place: 9, restId: a.restaurantId, kind: 'coin', num: 1 }),
    ).rejects.toMatchObject({
      params: { reason: 'not_here' },
    });
    await expect(t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 100_000_001 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 5000 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
    await expect(t.game.hiphop.tip(a, { place: 1, kind: 'food', num: 1 })).rejects.toMatchObject({
      params: { reason: 'pick_food' },
    });
    t.clock.set(gameTime(DAY, 22));
    await expect(t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 100 })).rejects.toMatchObject({
      params: { reason: 'not_here' },
    });
  });

  it('邮箱开关打开时要求已验证邮箱', async () => {
    script = [0.5, 0.99];
    const a = await setup({ patch: { coin: 1000 } });
    await setTuning(t, a.shardId, { hiphop: { requireVerifiedEmail: true } });
    await expect(t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 100 })).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
    const b = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { coin: 1000 } });
    await expect(t.game.hiphop.tip(b, { place: 1, kind: 'coin', num: 100 })).resolves.toBeDefined();
  });
});
