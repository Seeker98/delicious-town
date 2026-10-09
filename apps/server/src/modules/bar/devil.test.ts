import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameDay, gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { getDaily } from '../counter/dailyCounter';
import { getEffectAgg, listActiveEffects } from '../effects/service';
import { listNews } from '../news/news';
import { GOODS } from '@dt/config';

/** 每次操作取下一个随机数：开局那个定特辣酒（⌊v×6⌋），之后每次"喝"定调酒师选第几杯（⌊v×剩余杯数⌋） */
let script: number[] = [];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([script.shift() ?? 0]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-09-30', 12)));

const start = (ctx: RestCtx, stake: number) => t.game.bar.devilStart(ctx, { stake });
const drink = (ctx: RestCtx, cup: number) => t.game.bar.devilDrink(ctx, { cup });
const player = () => newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 100 } });

describe('魔鬼辣杯（4C-3 设计文档 §2.1）', () => {
  it('开局扣押注；局面里看不到特辣酒；押注不在可选范围、已有局时开局被拒', async () => {
    const a = await player();
    script = [0.9];
    const r = (await start(a, 10)).data;
    expect(r).toMatchObject({
      stake: 10,
      cups: [null, null, null, null, null, null],
      survived: 0,
      result: null,
    });
    expect(r.spiked).toBeNull();
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(90);
    await expect(start(a, 10)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'bar_round' } });
    const b = await player();
    await expect(start(b, 3)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'stake' },
    });
  });

  it('调酒师第 2 杯喝到：押 10 活过 1 杯，按赔付表拿回 14 张', async () => {
    const a = await player();
    script = [0.9, 0.9]; // 特辣酒在 5 号；玩家喝 0 号后，调酒师在剩下 [1..5] 里选第 4 个 = 5 号
    await start(a, 10);
    const r = (await drink(a, 0)).data;
    expect(r).toMatchObject({ result: 'win', spiked: 5, survived: 1, payout: 14, lastBartender: 5 });
    expect(r.cups).toEqual(['me', null, null, null, null, 'bartender']);
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(90 + 14);
    // 排行“本周赢得礼券”（问题记录 569）记净赚：拿回 14 减押注 10（backlog 1010）
    expect(await getDaily(t.db, a.restaurantId, 'bar.devil.payout', gameDay(t.clock.now))).toBe(4);
    // 局结束后可以再开
    script = [0];
    await start(a, 1);
  });

  it('玩家活过 3 杯：押 10 按赔付表拿回 25 张（2026-10-09 改成 1.35 倍取整）并写新闻', async () => {
    const a = await player();
    script = [0.9, 0, 0, 0]; // 特辣酒在 5 号；调酒师每次都选剩下的第一杯
    await start(a, 10);
    expect((await drink(a, 0)).data).toMatchObject({ result: null, survived: 1, lastBartender: 1 });
    expect((await drink(a, 2)).data).toMatchObject({ result: null, survived: 2, lastBartender: 3 });
    const r = (await drink(a, 4)).data;
    expect(r).toMatchObject({ result: 'win', survived: 3, payout: 25, spiked: 5 });
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['bar.devil'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { stake: 10, payout: 25 } });
  });

  it('玩家喝到：输掉押注、宿醉 1 小时上座率 -10%；再次宿醉重新计时、不叠加', async () => {
    const a = await player();
    const base =
      (
        await getEffectAgg(t.db, a.restaurantId, t.clock.now, t.deps.config, {
          tuning: t.deps.config.tuning,
          features: {},
        })
      ).atRate ?? 0;
    script = [0];
    await start(a, 5);
    const r = (await drink(a, 0)).data;
    const until = new Date(gameTime('2026-09-30', 13)).toISOString();
    expect(r).toMatchObject({ result: 'lose', spiked: 0, payout: 0, hangoverUntil: until });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(95);
    const hang = (await listActiveEffects(t.db, a.restaurantId, t.clock.now)).filter(
      (e) => e.sourceType === 'bar',
    );
    expect(hang).toEqual([
      { sourceType: 'bar', sourceId: 1, effects: { atRate: -0.1 }, expiresAt: new Date(until) },
    ]);

    t.clock.advance(10 * 60_000);
    script = [0];
    await start(a, 1);
    await drink(a, 0);
    const again = (await listActiveEffects(t.db, a.restaurantId, t.clock.now)).filter(
      (e) => e.sourceType === 'bar',
    );
    expect(again).toHaveLength(1);
    expect(again[0]!.expiresAt).toEqual(new Date(t.clock.now.getTime() + 3600_000));
    // 加成汇总里上座率只扣一次 10%（PR28 遗留）
    const agg = await getEffectAgg(t.db, a.restaurantId, t.clock.now, t.deps.config, {
      tuning: t.deps.config.tuning,
      features: {},
    });
    expect(agg.atRate ?? 0).toBeCloseTo(base - 0.1, 6);
  });

  it('喝过的杯、越界的杯、没有局时都被拒', async () => {
    const a = await player();
    await expect(drink(a, 0)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_round' },
    });
    script = [0.9, 0];
    await start(a, 1);
    await drink(a, 0); // 调酒师喝 1 号
    await expect(drink(a, 0)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'cup_taken' } });
    await expect(drink(a, 1)).rejects.toMatchObject({ params: { what: 'cup_taken' } });
    await expect(drink(a, 6)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', params: { reason: 'cup' } });
  });

  it('同一家店同时喝两杯：按顺序处理，玩家喝过的杯数和活过的杯数一致', async () => {
    const a = await player();
    script = [0.9, 0, 0];
    await start(a, 1);
    const rs = await Promise.allSettled([drink(a, 2), drink(a, 3)]);
    const v = await t.game.bar.overview(a);
    const round = v.devil.round!;
    // 两次请求都按顺序生效（各喝一杯），没有被吞掉或重复处理（PR28 遗留：断言加强）
    expect(rs.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(round.cups[2]).toBe('me');
    expect(round.cups[3]).toBe('me');
    expect(round.survived).toBe(2);
    expect(round.cups.filter((c) => c === 'me')).toHaveLength(round.survived);
    expect(round.cups.filter((c) => c === 'bartender')).toHaveLength(round.survived);
  });

  it('押 1 的赔付表是 1/2/3（新手试玩不亏，用户 2026-10-09 定）', async () => {
    const a = await player();
    script = [0.9, 0, 0, 0];
    await start(a, 1);
    await drink(a, 0);
    await drink(a, 2);
    expect((await drink(a, 4)).data).toMatchObject({ result: 'win', survived: 3, payout: 3 });
  });

  it('每天最多 20 局（用户 2026-10-09 定）：第 21 局开不了，第二天恢复；概览给出局数、上限和赔付表', async () => {
    const a = await player();
    for (let i = 0; i < 20; i++) {
      script = [0];
      await start(a, 1);
      await drink(a, 0); // 特辣酒在 0 号：玩家第一杯就喝到，局结束
    }
    script = [0];
    await expect(start(a, 1)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'bar_daily', max: 20 },
    });
    const v = await t.game.bar.overview(a);
    expect(v.devil).toMatchObject({
      played: 20,
      max: 20,
      stakes: [1, 5, 10, 20],
      payouts: [
        [1, 2, 3],
        [7, 9, 12],
        [14, 18, 25],
        [27, 36, 49],
      ],
    });
    t.clock.set(gameTime('2026-10-01', 12));
    script = [0];
    await start(a, 1);
  });
});
