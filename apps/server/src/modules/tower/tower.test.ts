import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { createShard } from '../../../test/fixtures';
import { setTuning } from '../../../test/town';
import { addAttrs } from '../equip/rules';
import { GOODS } from '@dt/config';

const DAY = '2026-09-30';
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
let t: TestGame;
let rngValues: number[] = [0.4];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());
beforeEach(() => {
  rngValues = [0.4];
  t.clock.set(gameTime(DAY, 12));
});

const setDaily = (restId: number, key: string, count: number) =>
  t.db.insertInto('daily_counter').values({ rest_id: restId, day: DAY, key, count }).execute();
/** 厨具在 equip 表里一件一行 */
const equipNum = async (restId: number, goodsId: number) =>
  (
    await t.db
      .selectFrom('equip')
      .select('id')
      .where('rest_id', '=', restId)
      .where('goods_id', '=', goodsId)
      .execute()
  ).length;
const setBest = (restId: number, best: number) =>
  t.db.insertInto('tower_state').values({ rest_id: restId, best_floor: best }).execute();

describe('厨塔概览', () => {
  it('新店：1 层解锁、2 层没有；今日 5 次；守塔人厨力；还没换菜', async () => {
    const ctx = await newRestaurant(t, { patch: STRONG });
    const v = await t.game.tower.overview(ctx);
    expect(v).toMatchObject({
      // 每局请几位评委（规则说明按它写，backlog 396）
      duelJudges: t.deps.config.tuning.tower.duel.judges,
      left: 5,
      dailyTotal: 5,
      tickets: 0,
      bestFloor: 0,
      level: 1,
      hour: 12,
      nightFloor: 3,
      openHour: 6,
      testCost: 1,
      power: 70,
    });
    expect(v.floors).toHaveLength(10);
    // 长老的装备（问题记录 408）：每件 = 基础 + 强化；被挑战时的属性；掉落和概率
    const f1 = t.game.deps.config.towerFloors.get(1)!;
    expect(v.floors[0]!.elder).toMatchObject({
      level: 8,
      stress: 3,
      points: f1.elder.points,
      attrs: f1.attrs,
      drops: f1.elder.drops,
      dropRate: 0.2,
    });
    const p0 = f1.elder.pieces[0]!;
    expect(v.floors[0]!.elder.pieces[0]).toEqual({ id: p0.id, attrs: addAttrs(p0.base, p0.gain) });
    expect(v.floors[0]).toMatchObject({
      floor: 1,
      name: '见习模范餐厅',
      title: '见习守护者',
      power: 39,
      left: 10,
      maxTimes: 10,
      unlocked: true,
      cost: 5,
      mc: null,
    });
    expect(v.floors[1]).toMatchObject({ floor: 2, unlocked: false, cost: 6 });
  });
});

describe('挑战（设计文档 §3.2）', () => {
  it('胜：扣 层+4 体力；声望 +(层+6)；随机奖励"层"次；最高层更新；主线第 27 步、活跃"厨塔挑战"', async () => {
    const ctx = await newRestaurant(t, { patch: { ...STRONG, level: 5 } });
    await showQuest(t, ctx.restaurantId, 2105);
    expect(questIn(await t.game.task.tasks(ctx), 2105)).toMatchObject({
      key: 'tower.challenge',
      done: false,
    });
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data).toMatchObject({
      win: true,
      renown: 7,
      test: false,
      rank: null,
      awards: [{ kind: 'coin', id: null, num: 600, lucky: false }],
    });
    expect(r.data.me).toMatchObject({ power: 70, scores: [20, 13, 15, 22, 11], sum: 81 });
    expect(r.data.them).toEqual({
      name: '见习模范餐厅',
      power: 39,
      scores: [10.1, 0.8, 2.5, 22.3, 6.8],
      sum: 42.5,
    });
    expect(r.data.votes).toEqual([3, 0]);
    expect(r.data.judges).toHaveLength(3);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 95, renown: 7, coin: 600 });
    const v = await t.game.tower.overview(ctx);
    expect(v).toMatchObject({ bestFloor: 1, left: 4 });
    expect(v.floors[0]!.left).toBe(9);
    expect(questIn(await t.game.task.tasks(ctx), 2105)).toMatchObject({ progress: 1, done: true });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '厨塔挑战')!.count).toBe(1);
  });

  it('打赢长老按这一层的概率掉一件它的套装（问题记录 408）；试打不掉', async () => {
    const shardId = await createShard(t.db);
    const rates = [1, 0.2, 0.2, 0.12, 0.12, 0.12, 0.08, 0.08, 0.05, 0.05];
    await setTuning(t, shardId, { tower: { elderDropRates: rates } });
    const ctx = await newRestaurant(t, { shardId, patch: { ...STRONG, level: 5 } });
    const drops = t.game.deps.config.towerFloors.get(1)!.elder.drops;
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data.win).toBe(true);
    // 随机数 0.4：掉落 0.4 < 1；三件里第 ⌊0.4 × 3⌋ = 1 件。单独给，不混在随机奖励里（backlog 408）
    expect(r.data.elderDrop).toBe(drops[1]);
    expect(r.data.awards).not.toContainEqual({ kind: 'goods', id: drops[1], num: 1, lucky: false });
    // 上新闻
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', shardId)
      .execute();
    expect(news.find((n) => n.type === 'tower.elder')?.params).toMatchObject({ goodsId: drops[1], floor: 1 });
    expect(await equipNum(ctx.restaurantId, drops[1]!)).toBe(1);
    const test = await t.game.tower.challenge(ctx, { floor: 1, test: true });
    expect(test.data).toMatchObject({ win: true, awards: [], elderDrop: null });
    expect(await equipNum(ctx.restaurantId, drops[1]!)).toBe(1);
  });

  it('这一层概率为 0 时打赢也不掉', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { tower: { elderDropRates: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1] } });
    const ctx = await newRestaurant(t, { shardId, patch: { ...STRONG, level: 5 } });
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data.win).toBe(true);
    expect(r.data.awards.filter((x) => x.kind === 'goods')).toEqual([]);
  });

  it('负：声望 +6，没有奖励，最高层不变', async () => {
    const ctx = await newRestaurant(t);
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data).toMatchObject({ win: false, renown: 6, awards: [] });
    expect((await t.game.tower.overview(ctx)).bestFloor).toBe(0);
  });

  it('试打只扣 1 体力，没有奖励声望、不计次数、不算打赢；今日次数用完后仍能试打（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: STRONG });
    await setDaily(ctx.restaurantId, 'tower.done', 5);
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: true });
    expect(r.data).toMatchObject({ win: true, renown: 0, awards: [], test: true });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 99, renown: 0, coin: 0 });
    expect(await t.game.tower.overview(ctx)).toMatchObject({ bestFloor: 0, left: 0 });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: false })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'tower', max: 5 },
    });
  });

  it('挑战券：一次只能用 1 张，用了当天多一次', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.towerTicket]: 2 } });
    await setDaily(ctx.restaurantId, 'tower.done', 5);
    await expect(t.game.store.use(ctx, { goodsId: GOODS.towerTicket, num: 2 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_batch' },
    });
    await t.game.store.use(ctx, { goodsId: GOODS.towerTicket, num: 1 });
    expect(await t.game.tower.overview(ctx)).toMatchObject({ left: 1, dailyTotal: 6, tickets: 1 });
    await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect((await t.game.tower.overview(ctx)).left).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.towerTicket)).toBe(1);
  });

  it('解锁：2 层要 11 级且打赢过 1 层', async () => {
    const low = await newRestaurant(t, { patch: { level: 10 } });
    await setBest(low.restaurantId, 1);
    await expect(t.game.tower.challenge(low, { floor: 2, test: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'floor_locked', minLevel: 11, needFloor: 1 },
    });
    const fresh = await newRestaurant(t, { patch: { level: 11 } });
    await expect(t.game.tower.challenge(fresh, { floor: 2, test: true })).rejects.toMatchObject({
      params: { reason: 'floor_locked' },
    });
    await setBest(fresh.restaurantId, 1);
    expect((await t.game.tower.challenge(fresh, { floor: 2, test: true })).data.test).toBe(true);
  });

  it('夜间：4 层以上 6 点前不能挑战，3 层可以', async () => {
    t.clock.set(gameTime(DAY, 3));
    const ctx = await newRestaurant(t, { patch: { level: 31 } });
    await setBest(ctx.restaurantId, 3);
    await expect(t.game.tower.challenge(ctx, { floor: 4, test: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'tower_night', openHour: 6 },
    });
    expect((await t.game.tower.challenge(ctx, { floor: 3, test: true })).data.test).toBe(true);
    t.clock.set(gameTime(DAY, 6));
    expect((await t.game.tower.challenge(ctx, { floor: 4, test: true })).data.test).toBe(true);
  });

  it('守塔人每日次数：8 层每人每天 1 次', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 71 } });
    await setBest(ctx.restaurantId, 7);
    await t.game.tower.challenge(ctx, { floor: 8, test: false });
    await expect(t.game.tower.challenge(ctx, { floor: 8, test: false })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'watchman', max: 1, name: t.deps.config.towerFloors.get(8)!.name },
    });
    expect((await t.game.tower.overview(ctx)).floors[7]!.left).toBe(0);
  });

  it('层号越界报 VALIDATION_FAILED；体力不够报 NOT_ENOUGH，什么都不变', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 3 } });
    await expect(t.game.tower.challenge(ctx, { floor: 11, test: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'floor' },
    });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength', need: 5 },
    });
    expect((await t.game.tower.overview(ctx)).left).toBe(5);
  });

  it('区服关闭 tower：接口报 FEATURE_DISABLED，挑战券不能用', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.towerTicket]: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { tower: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.tower.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: true })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await expect(t.game.store.use(ctx, { goodsId: GOODS.towerTicket, num: 1 })).rejects.toMatchObject({
      code: 'NOT_USABLE',
    });
  });
});
