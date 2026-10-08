import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

/** 支线“酒运”“酒桌高手”的计数（问题记录 515 支线扩充）：达到条件的那一刻记一次 */
let t: TestGame;
let rngValues: number[] = [0];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const bar = () => t.game.bar;
const rich = () => newRestaurant(t, { patch: { coin: 10_000_000 }, goods: { [GOODS.mysteryTicket]: 1000 } });
async function counters(ctx: RestCtx): Promise<Record<string, number>> {
  const rows = await t.db
    .selectFrom('event_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', ctx.restaurantId)
    .execute();
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));
}

describe('酒吧支线的计数（问题记录 515）', () => {
  it('划拳连胜到 3、5、8 时各记一次，只在正好到的那一局记', async () => {
    const ctx = await rich();
    rngValues = [0.1, 0.99]; // 胜；奖励发经验
    for (let i = 0; i < 9; i++) await bar().fg(ctx, { hand: 0 });
    const c = await counters(ctx);
    expect([c['bar.fg.streak3'], c['bar.fg.streak5'], c['bar.fg.streak8']]).toEqual([1, 1, 1]);
    rngValues = [0.9]; // 负，再赢 3 局
    await bar().fg(ctx, { hand: 0 });
    rngValues = [0.1, 0.99];
    for (let i = 0; i < 3; i++) await bar().fg(ctx, { hand: 0 });
    expect((await counters(ctx))['bar.fg.streak3']).toBe(2);
  });

  it('划拳平局打断连胜：连赢 3 局、平一局、再赢 3 局，“连胜 3”记两次（515 遗留：缺的测试）', async () => {
    const ctx = await rich();
    rngValues = [0.1, 0.99]; // 胜；奖励发经验
    for (let i = 0; i < 3; i++) await bar().fg(ctx, { hand: 0 });
    expect((await counters(ctx))['bar.fg.streak3']).toBe(1);
    rngValues = [0.45]; // 平局（胜率 0.25 + 幸运，再往上 0.25 是平局）
    await bar().fg(ctx, { hand: 0 });
    rngValues = [0.1, 0.99];
    for (let i = 0; i < 2; i++) await bar().fg(ctx, { hand: 0 });
    // 平局以后只赢了 2 局：还没到 3
    expect((await counters(ctx))['bar.fg.streak3']).toBe(1);
    await bar().fg(ctx, { hand: 0 });
    expect((await counters(ctx))['bar.fg.streak3']).toBe(2);
  });

  it('转数字转中记一次，没中不记', async () => {
    const ctx = await rich();
    rngValues = [0.5, 0];
    await bar().num(ctx, { num: 7 });
    expect((await counters(ctx))['bar.num.win']).toBeUndefined();
    rngValues = [0.01, 0.99, 0];
    await bar().num(ctx, { num: 7 });
    expect((await counters(ctx))['bar.num.win']).toBe(1);
  });

  it('猜酒杯：第 2 轮猜中记一次，4 轮全中记通关', async () => {
    const ctx = await rich();
    rngValues = [0.01];
    await bar().cupGuess(ctx, { cup: 0, round: null });
    expect((await counters(ctx))['bar.cup.round2']).toBeUndefined();
    for (let round = 1; round < 4; round++) {
      await bar().cupNext(ctx);
      await bar().cupGuess(ctx, { cup: 0, round });
    }
    const c = await counters(ctx);
    expect([c['bar.cup.round2'], c['bar.cup.clear']]).toEqual([1, 1]);
  });

  it('魔鬼辣杯：赢记一次；活过 3 杯（最后一杯才轮到调酒师）另记一次', async () => {
    const ctx = await rich();
    // 每次操作都从头取随机数：开局特辣酒在 5 号；调酒师第一杯就喝到（剩下 5 杯取最后一杯）
    rngValues = [0.99];
    await bar().devilStart(ctx, { stake: 1 });
    await bar().devilDrink(ctx, { cup: 0 });
    let c = await counters(ctx);
    expect([c['bar.devil.win'], c['bar.devil.survive3']]).toEqual([1, undefined]);
    rngValues = [0.99]; // 特辣酒在 5 号
    await bar().devilStart(ctx, { stake: 1 });
    rngValues = [0]; // 调酒师每次喝剩下的第一杯
    for (const cup of [0, 2, 4]) await bar().devilDrink(ctx, { cup });
    c = await counters(ctx);
    expect([c['bar.devil.win'], c['bar.devil.survive3']]).toEqual([2, 1]);
  });

  it('飞镖：赢老板记一次；三镖全中靶心另记一次', async () => {
    const ctx = await rich();
    // 每次操作都从头取随机数：老板三镖都是 0 分；每镖周期取最短、相位 0.25，0 毫秒出手正中靶心
    rngValues = [0.99];
    await bar().dartsStart(ctx);
    for (let i = 0; i < 3; i++) {
      rngValues = [0, 0.25];
      await bar().dartsAim(ctx);
      rngValues = [0.99]; // 奖励发经验
      await bar().dartsThrow(ctx, { elapsedMs: 0 });
    }
    const c = await counters(ctx);
    expect([c['bar.darts.win'], c['bar.darts.perfect']]).toEqual([1, 1]);
  });

  it('飞镖三镖全中但和老板打平：记“全中靶心”，不记“赢老板”（515 遗留：缺的测试）', async () => {
    const ctx = await rich();
    // 随机数 0：老板三镖都是 50 分（权重表第一项）
    rngValues = [0];
    await bar().dartsStart(ctx);
    for (let i = 0; i < 3; i++) {
      rngValues = [0, 0.25];
      await bar().dartsAim(ctx);
      rngValues = [0.99];
      const r = await bar().dartsThrow(ctx, { elapsedMs: 0 });
      if (i === 2) expect(r.data.result).toBe('draw');
    }
    const c = await counters(ctx);
    expect([c['bar.darts.win'], c['bar.darts.perfect']]).toEqual([undefined, 1]);
  });

  it('记忆调酒：答对最后一关（7 种）记一次', async () => {
    const ctx = await rich();
    rngValues = [0];
    await bar().memoryStart(ctx);
    for (const [len, wait] of [
      [3, 2000],
      [5, 3600],
      [7, 5200],
    ] as const) {
      t.clock.advance(wait);
      await bar().memoryAnswer(ctx, { answer: Array(len).fill(0) });
      if (len < 7) {
        expect((await counters(ctx))['bar.memory.top']).toBeUndefined();
        await bar().memoryNext(ctx);
      }
    }
    expect((await counters(ctx))['bar.memory.top']).toBe(1);
  });

  it('最后一颗糖：按桌子分开记赢', async () => {
    const play = async (ctx: RestCtx, table: 'novice' | 'expert') => {
      let s = (await bar().nimStart(ctx, { table })).data;
      if (s.needFirst)
        s = (await bar().nimFirst(ctx, { who: s.left % (s.k + 1) === 0 ? 'bartender' : 'me' })).data;
      while (s.result === null) {
        const r = s.left % (s.k + 1);
        s = (await bar().nimTake(ctx, { num: r === 0 ? 1 : r })).data;
      }
      return s.result;
    };
    const ctx = await rich();
    rngValues = [0];
    expect(await play(ctx, 'novice')).toBe('win');
    rngValues = [0, 0.05, 0]; // k = 3、21 颗、抛硬币自己先
    expect(await play(ctx, 'expert')).toBe('win');
    const c = await counters(ctx);
    expect([c['bar.nim.novice'], c['bar.nim.expert']]).toEqual([1, 1]);
  });

  it('秘制调料：6 次以内、4 次以内猜中各记一次', async () => {
    const ctx = await rich();
    rngValues = [0];
    // 和开局一样洗牌：每次 j = 0
    const pool = Array.from({ length: t.deps.config.tuning.bar.spice.kinds }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) [pool[i], pool[0]] = [pool[0]!, pool[i]!];
    await bar().spiceStart(ctx);
    await bar().spiceGuess(ctx, { guess: pool.slice(0, t.deps.config.tuning.bar.spice.length) });
    const c = await counters(ctx);
    expect([c['bar.spice.win6'], c['bar.spice.win4']]).toEqual([1, 1]);
  });

  it('秘制调料第 5 次才猜中：只记“6 次以内”，不记“4 次以内”（515 遗留：缺的测试）', async () => {
    const ctx = await rich();
    rngValues = [0];
    const { kinds, length } = t.deps.config.tuning.bar.spice;
    const pool = Array.from({ length: kinds }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) [pool[i], pool[0]] = [pool[0]!, pool[i]!];
    await bar().spiceStart(ctx);
    // 前 4 次猜别的几种（一个都不对），第 5 次猜中
    const wrong = pool.slice(length, length * 2);
    for (let i = 0; i < 4; i++) await bar().spiceGuess(ctx, { guess: wrong });
    await bar().spiceGuess(ctx, { guess: pool.slice(0, length) });
    const c = await counters(ctx);
    expect([c['bar.spice.win6'], c['bar.spice.win4']]).toEqual([1, undefined]);
  });

  it('一掷千金：一路不成交、开出这一局最大的奖记一次；没开到最大的不记', async () => {
    const play = async (ctx: RestCtx, box: number) => {
      await bar().dealStart(ctx);
      await bar().dealPick(ctx, { box });
      let next = 0;
      for (;;) {
        let d = (await bar().dealOpen(ctx, { box: next === box ? ++next : next })).data;
        next++;
        while (d.offer === null) {
          if (next === box) next++;
          d = (await bar().dealOpen(ctx, { box: next++ })).data;
        }
        const end = (await bar().dealAnswer(ctx, { deal: false })).data;
        if (end.result === 'box') return end;
      }
    };
    rngValues = [0];
    const first = await rich();
    const end = await play(first, 0);
    const values = end.all!.map((x) => x.value);
    const top = values.indexOf(Math.max(...values));
    expect((await counters(first))['bar.deal.top']).toBe(top === 0 ? 1 : undefined);
    // 同样的随机数开局一样：这次选最大奖那个箱子
    const second = await rich();
    await play(second, top);
    expect((await counters(second))['bar.deal.top']).toBe(1);
  });
});
