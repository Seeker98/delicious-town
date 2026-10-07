import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FOODS } from '@dt/config';
import { gameTime, sequenceRng, type DealPrizeDto } from '@dt/shared';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { listNews } from '../news/news';
import type { DealState } from './deal';

const DAY = '2026-09-30';
let script: number[] = [];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(script.length > 0 ? script.splice(0) : [0]) });
});
afterAll(() => t.close());
beforeEach(() => {
  t.clock.set(gameTime(DAY, 12));
  script = [];
});

const player = async (coin = 50_000) => {
  const c = await newRestaurant(t);
  await t.db.updateTable('restaurant').set({ coin }).where('id', '=', c.restaurantId).execute();
  return c;
};
const bar = () => t.game.bar;
const start = (c: RestCtx) => bar().dealStart(c);
const pick = (c: RestCtx, box: number) => bar().dealPick(c, { box });
const open = (c: RestCtx, box: number) => bar().dealOpen(c, { box });
const answer = (c: RestCtx, deal: boolean) => bar().dealAnswer(c, { deal });
const coinOf = async (c: RestCtx) => (await restRow(t, c.restaurantId)).coin;
const M5 = FOODS.masterBase + 5;
/** 10 个箱子：箱子 i 的价值是 (i + 1) × 1000，9 号是五级万能食材 ×5（最大奖） */
const BOXES: DealPrizeDto[] = Array.from({ length: 10 }, (_, i) =>
  i === 9
    ? { foodsId: M5, num: 5, value: 70_000 }
    : { foodsId: FOODS.masterBase + 1, num: 1, value: (i + 1) * 1000 },
);
const setRound = (c: RestCtx, patch: Partial<DealState>) => {
  const s: DealState = {
    boxes: BOXES,
    mine: 0,
    opened: [],
    round: 0,
    offer: null,
    top: 9,
    opens: [3, 2, 2, 1],
    offerRates: [0.5, 0.65, 0.8, 0.95],
    valueRate: 0.5,
    ...patch,
  };
  return t.db
    .insertInto('bar_round')
    .values({
      rest_id: c.restaurantId,
      game: 'deal',
      state: JSON.stringify(s),
      started_at: t.clock.now,
      updated_at: t.clock.now,
    })
    .onConflict((oc) => oc.columns(['rest_id', 'game']).doUpdateSet({ state: JSON.stringify(s) }))
    .execute();
};
const hasRound = async (c: RestCtx) =>
  (await t.db
    .selectFrom('bar_round')
    .select('rest_id')
    .where('rest_id', '=', c.restaurantId)
    .where('game', '=', 'deal')
    .executeTakeFirst()) !== undefined;

describe('一掷千金：开局（设计 §4）', () => {
  it('扣 1 万银币；返回和概览里没有箱子内容；奖池板是全部奖品；已有局再开被拒', async () => {
    const a = await player();
    const r = (await start(a)).data;
    expect(r).toMatchObject({
      count: 10,
      mine: null,
      round: 0,
      toOpen: 3,
      opened: [],
      offer: null,
      result: null,
      all: null,
    });
    expect(r.left).toHaveLength(10);
    expect(r.left.map((x) => x.value)).toEqual([...r.left.map((x) => x.value)].sort((x, y) => y - x));
    expect(await coinOf(a)).toBe(40_000);
    const ov = await bar().overview(a);
    expect(ov.coin).toBe(40_000);
    expect(ov.deal).toMatchObject({
      cost: 10000,
      played: 1,
      max: 3,
      count: 10,
      opens: [3, 2, 2, 1],
      round: r,
    });
    expect(JSON.stringify(ov.deal)).not.toContain('boxes');
    await expect(start(a)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'bar_round' } });
  });

  it('“N 级食材”定成这一级的一种普通食材，万能食材按等级；价值 = 商店价 × 数量', async () => {
    const a = await player();
    script = [0.37, 0.91, 0.12, 0.55, 0.73, 0.08, 0.64, 0.29, 0.81, 0.46, 0.2, 0.6, 0.33, 0.77, 0.5];
    await start(a);
    const row = await t.db
      .selectFrom('bar_round')
      .select('state')
      .where('rest_id', '=', a.restaurantId)
      .where('game', '=', 'deal')
      .executeTakeFirstOrThrow();
    const s = row.state as unknown as DealState;
    expect(s.boxes).toHaveLength(10);
    for (const b of s.boxes) {
      const f = t.deps.config.foods.get(b.foodsId)!;
      expect(f.retired).toBeUndefined();
      expect(b.value).toBe(f.coin * b.num);
    }
    const masters = s.boxes.filter((b) => b.foodsId > FOODS.masterBase && b.foodsId <= FOODS.masterBase + 5);
    expect(masters.map((b) => `${b.foodsId - FOODS.masterBase}x${b.num}`).sort()).toEqual([
      '1x2',
      '3x2',
      '5x2',
      '5x5',
    ]);
    // 普通食材那几箱：等级和数量照奖品表，都是出现率 100 的普通食材（#192 审查）
    const commons = s.boxes.filter((b) => !masters.includes(b));
    expect(commons.map((b) => `${t.deps.config.foods.get(b.foodsId)!.level}x${b.num}`).sort()).toEqual([
      '1x1',
      '1x3',
      '2x2',
      '3x2',
      '4x2',
      '5x2',
    ]);
    expect(commons.every((b) => t.deps.config.foods.get(b.foodsId)!.odds === 100)).toBe(true);
    expect(s.boxes[s.top]).toMatchObject({ foodsId: M5, num: 5 });
  });

  it('今天 3 局用完、银币不够：报错，不扣、不计次数、不建局', async () => {
    const a = await player();
    await incrementDaily(t.db, a.restaurantId, 'bar.deal', 3, DAY);
    await expect(start(a)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await coinOf(a)).toBe(50_000);
    const b = await player(9_999);
    await expect(start(b)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await coinOf(b)).toBe(9_999);
    expect(await getDaily(t.db, b.restaurantId, 'bar.deal', DAY)).toBe(0);
    expect(await hasRound(b)).toBe(false);
  });
});

describe('一掷千金：选箱子、开箱子、报价', () => {
  it('没选不能开；选两次被拒；越界被拒', async () => {
    const a = await player();
    await setRound(a, { mine: null });
    await expect(open(a, 1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'deal_pick_first' },
    });
    await expect(pick(a, 10)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', params: { reason: 'box' } });
    expect((await pick(a, 4)).data).toMatchObject({ mine: 4, toOpen: 3 });
    await expect(pick(a, 5)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'deal_picked' },
    });
  });

  it('开箱子：自己的、已开的、越界的被拒；开出来的写在返回里；开够本轮就报价，有报价时不能再开', async () => {
    const a = await player();
    await setRound(a, { mine: 0 });
    await expect(open(a, 0)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', params: { reason: 'box' } });
    let r = (await open(a, 9)).data;
    expect(r.opened).toEqual([{ box: 9, ...BOXES[9] }]);
    expect(r).toMatchObject({ toOpen: 2, offer: null });
    // 这一局每轮开几个：前端按轮列出开出的箱子（问题记录 467）
    expect(r.opens).toEqual([3, 2, 2, 1]);
    expect(r.left).toHaveLength(9);
    expect(r.left[0]!.value).toBe(9000);
    await expect(open(a, 9)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', params: { reason: 'box' } });
    await open(a, 8);
    r = (await open(a, 7)).data;
    // 剩 0~6 号：1000~7000，平均 4000；× 0.5 × 0.5 = 1000
    expect(r).toMatchObject({ toOpen: 0, offer: 1000 });
    await expect(open(a, 6)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'deal_offer' },
    });
  });

  it('没有报价时回答被拒', async () => {
    const a = await player();
    await setRound(a, { mine: 0 });
    await expect(answer(a, true)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'deal_no_offer' },
    });
  });

  it('成交：得到银币，不发食材；局面删掉，公布全部箱子', async () => {
    const a = await player(0);
    await setRound(a, { mine: 9, opened: [1, 2, 3], offer: 12_300 });
    const r = (await answer(a, true)).data;
    expect(r).toMatchObject({ result: 'deal', coin: 12_300, prize: BOXES[9] });
    expect(r.all).toEqual(BOXES);
    expect(await coinOf(a)).toBe(12_300);
    expect((await foodNum(t, a.restaurantId, M5)).num).toBe(0);
    expect(await hasRound(a)).toBe(false);
  });

  it('不成交进下一轮；最后一轮不成交就开自己的箱子、发食材', async () => {
    const a = await player(0);
    await setRound(a, { mine: 0, opened: [1, 2, 3], offer: 1000 });
    expect((await answer(a, false)).data).toMatchObject({ round: 1, toOpen: 2, offer: null, result: null });
    await setRound(a, { mine: 0, opened: [1, 2, 3, 4, 5, 6, 7, 8], round: 3, offer: 30_000 });
    const r = (await answer(a, false)).data;
    expect(r).toMatchObject({ result: 'box', coin: 0, prize: BOXES[0] });
    expect(await coinOf(a)).toBe(0);
    expect((await foodNum(t, a.restaurantId, FOODS.masterBase + 1)).num).toBe(1);
    expect(await hasRound(a)).toBe(false);
  });

  it('最后开出最大奖写新闻，同一天第二次不写；成交拿到最大奖的箱子不写', async () => {
    const a = await player(0);
    const mineNews = async () =>
      (await listNews(t.db, a.shardId, { limit: 10, only: ['bar.deal'] })).filter(
        (n) => n.restId === a.restaurantId,
      );
    await setRound(a, { mine: 9, opened: [1, 2, 3, 4, 5, 6, 7, 8], round: 3, offer: 30_000 });
    await answer(a, true);
    expect(await mineNews()).toHaveLength(0);
    await setRound(a, { mine: 9, opened: [1, 2, 3, 4, 5, 6, 7, 8], round: 3, offer: 30_000 });
    expect((await answer(a, false)).data).toMatchObject({ result: 'box', prize: BOXES[9] });
    expect((await foodNum(t, a.restaurantId, M5)).num).toBe(5);
    expect(await mineNews()).toHaveLength(1);
    await setRound(a, { mine: 9, opened: [1, 2, 3, 4, 5, 6, 7, 8], round: 3, offer: 30_000 });
    await answer(a, false);
    expect(await mineNews()).toHaveLength(1);
  });

  it('没有进行中的局：选、开、回答都报 no_round', async () => {
    const a = await player();
    for (const f of [() => pick(a, 0), () => open(a, 0), () => answer(a, true)])
      await expect(f()).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'no_round' } });
  });

  it('每轮开几个、报价系数按开局时存下的算：中途改区服数值不会卡住这一局（审查）', async () => {
    const a = await player();
    await setRound(a, { mine: 0, opens: [2, 2, 2, 2], offerRates: [1, 1, 1, 1], valueRate: 1 });
    await open(a, 9);
    const r = (await open(a, 8)).data;
    // 剩 0~7 号：1000~8000，平均 4500
    expect(r).toMatchObject({ toOpen: 0, offer: 4500 });
  });

  it('橱柜放不下时写明放进冰箱、丢掉了多少（审查）', async () => {
    const a = await player(0);
    await t.db.updateTable('restaurant').set({ cupboard_num: 0 }).where('id', '=', a.restaurantId).execute();
    await setRound(a, { mine: 9, opened: [1, 2, 3, 4, 5, 6, 7, 8], round: 3, offer: 30_000 });
    const r = (await answer(a, false)).data;
    expect(r.result).toBe('box');
    expect(r.fridge + r.dropped).toBe(5);
  });
});
