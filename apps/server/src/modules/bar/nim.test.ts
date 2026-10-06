import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { incrementDaily } from '../counter/dailyCounter';
import type { NimState } from './nim';

const DAY = '2026-09-30';
/** 每个操作用掉整段 script 当随机数序列（循环取）；空时一直是 0 */
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

const player = (tickets = 50) => newRestaurant(t, { goods: { [GOODS.mysteryTicket]: tickets } });
const start = (c: RestCtx, table: 'novice' | 'expert') => t.game.bar.nimStart(c, { table });
const first = (c: RestCtx, who: 'me' | 'bartender') => t.game.bar.nimFirst(c, { who });
const take = (c: RestCtx, num: number) => t.game.bar.nimTake(c, { num });
/** 直接写局面，测输赢 */
const setRound = (c: RestCtx, s: NimState) =>
  t.db
    .insertInto('bar_round')
    .values({
      rest_id: c.restaurantId,
      game: 'nim',
      state: JSON.stringify(s),
      started_at: t.clock.now,
      updated_at: t.clock.now,
    })
    .onConflict((oc) => oc.columns(['rest_id', 'game']).doUpdateSet({ state: JSON.stringify(s) }))
    .execute();
const roundOf = async (c: RestCtx) =>
  t.db
    .selectFrom('bar_round')
    .select('state')
    .where('rest_id', '=', c.restaurantId)
    .where('game', '=', 'nim')
    .executeTakeFirst();

describe('最后一颗糖：开局（设计 §4）', () => {
  it('新手桌扣 1 张，k=3、糖果 10~20，要先选先后；概览能看到；再开被拒', async () => {
    const a = await player();
    script = [0.5];
    const r = (await start(a, 'novice')).data;
    expect(r).toMatchObject({
      table: 'novice',
      k: 3,
      left: r.pile,
      needFirst: true,
      coin: null,
      log: [],
      result: null,
    });
    expect(r.pile).toBeGreaterThanOrEqual(10);
    expect(r.pile).toBeLessThanOrEqual(20);
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(49);
    const ov = await t.game.bar.overview(a);
    expect(ov.nim).toMatchObject({ played: 1, max: 10, round: r });
    expect(ov.nim.tables.novice).toEqual({
      cost: 1,
      k: [3, 3],
      pile: [10, 20],
      renown: 1,
      awardLevel: 2,
      first: 'choose',
      careless: true,
    });
    // 只说调酒师会不会走神，不给失手概率（#190 审查：桌子说明跟着区服数值走）
    expect(ov.nim.tables.expert.careless).toBe(false);
    await expect(start(a, 'expert')).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'bar_round' },
    });
    const act = await t.game.task.activation(a);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(1);
  });

  it('高手桌扣 2 张；抛硬币到玩家先拿时没有调酒师的一步', async () => {
    const a = await player();
    script = [0];
    const r = (await start(a, 'expert')).data;
    expect(r).toMatchObject({
      table: 'expert',
      k: 3,
      pile: 20,
      left: 20,
      needFirst: false,
      coin: 'me',
      log: [],
    });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(48);
  });

  it('高手桌抛到调酒师先拿：开局就有他的一步（占优拿余数）', async () => {
    const a = await player();
    // 每次都是 0.9：k = 3 + int(3) = 5，糖果 = 20 + int(21) = 38；0.9 ≥ 0.5 → 调酒师先拿；38 mod 6 = 2
    script = [0.9];
    const r = (await start(a, 'expert')).data;
    expect(r).toMatchObject({
      k: 5,
      pile: 38,
      left: 36,
      coin: 'bartender',
      log: [{ who: 'bartender', take: 2 }],
    });
    await expect(first(a, 'me')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'nim_started' },
    });
  });

  it('今天 10 局用完、礼券不够：报错，不扣礼券、不计次数、不建局', async () => {
    const a = await player();
    await incrementDaily(t.db, a.restaurantId, 'bar.nim', 10, DAY);
    await expect(start(a, 'novice')).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(50);
    const b = await player(1);
    await expect(start(b, 'expert')).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await goodsNum(t, b.restaurantId, GOODS.mysteryTicket)).toBe(1);
    expect((await t.game.bar.overview(b)).nim).toMatchObject({ played: 0, round: null });
  });
});

describe('最后一颗糖：先后和拿', () => {
  it('新手桌没选先后不能拿；选调酒师先拿后他拿了一步；再选被拒', async () => {
    const a = await player();
    script = [0];
    await start(a, 'novice');
    await expect(take(a, 1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'need_first' },
    });
    // 糖果 10：10 mod 4 = 2 占优；0.9 不失手 → 拿 2
    script = [0.9];
    const r = (await first(a, 'bartender')).data;
    expect(r).toMatchObject({ needFirst: false, left: 8, log: [{ who: 'bartender', take: 2 }] });
    await expect(first(a, 'me')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'nim_started' },
    });
  });

  it('拿的数量越界被拒；正常拿一次，调酒师接着拿', async () => {
    const a = await player();
    script = [0];
    await start(a, 'expert');
    for (const n of [0, 4, 99])
      await expect(take(a, n)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        params: { reason: 'num' },
      });
    // 20 颗、k=3：我拿 1 剩 19；19 mod 4 = 3，调酒师拿 3 剩 16
    const r = (await take(a, 1)).data;
    expect(r).toMatchObject({
      left: 16,
      log: [
        { who: 'me', take: 1 },
        { who: 'bartender', take: 3 },
      ],
      result: null,
    });
    expect((await t.game.bar.overview(a)).nim.round).toEqual(r);
  });

  it('选让调酒师先拿、他一把拿完：直接判输，不留下拿不了的局（#190 审查）', async () => {
    const a = await player();
    await setRound(a, { table: 'novice', k: 3, pile: 2, left: 2, started: false, coin: null, log: [] });
    script = [0.99]; // 不走神
    const r = (await first(a, 'bartender')).data;
    expect(r).toMatchObject({ result: 'lose', left: 0, log: [{ who: 'bartender', take: 2 }] });
    expect(await roundOf(a)).toBeUndefined();
  });

  it('剩的比 k 少时不能拿超过剩余', async () => {
    const a = await player();
    await setRound(a, { table: 'expert', k: 5, pile: 20, left: 2, started: true, coin: 'me', log: [] });
    await expect(take(a, 3)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', params: { reason: 'num' } });
  });

  it('玩家拿到最后一颗：赢，加声望、发奖励、删局、写日志', async () => {
    const a = await player();
    const before = (await restRow(t, a.restaurantId)).renown;
    await setRound(a, { table: 'novice', k: 3, pile: 12, left: 2, started: true, coin: null, log: [] });
    const r = (await take(a, 2)).data;
    expect(r).toMatchObject({ result: 'win', renown: 1, left: 0 });
    expect(r.award).not.toBeNull();
    expect((await restRow(t, a.restaurantId)).renown).toBe(before + 1);
    expect(await roundOf(a)).toBeUndefined();
    const log = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'bar.nim')
      .executeTakeFirst();
    expect(log?.params).toMatchObject({ table: 'novice', result: 'win' });
  });

  it('高手桌赢加 3 点声望', async () => {
    const a = await player();
    await setRound(a, { table: 'expert', k: 4, pile: 30, left: 4, started: true, coin: 'me', log: [] });
    expect((await take(a, 4)).data).toMatchObject({ result: 'win', renown: 3 });
  });

  it('调酒师拿到最后一颗：输，没有声望和奖励，局面删掉', async () => {
    const a = await player();
    const before = (await restRow(t, a.restaurantId)).renown;
    await setRound(a, { table: 'expert', k: 3, pile: 20, left: 5, started: true, coin: 'me', log: [] });
    // 我拿 2 剩 3：3 mod 4 = 3，调酒师拿 3 拿完
    const r = (await take(a, 2)).data;
    expect(r).toMatchObject({ result: 'lose', renown: 0, award: null, left: 0 });
    expect(r.log.at(-1)).toEqual({ who: 'bartender', take: 3 });
    expect((await restRow(t, a.restaurantId)).renown).toBe(before);
    expect(await roundOf(a)).toBeUndefined();
  });

  it('没有进行中的局：拿、选先后都报 no_round', async () => {
    const a = await player();
    await expect(take(a, 1)).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'no_round' } });
    await expect(first(a, 'me')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_round' },
    });
  });
});
