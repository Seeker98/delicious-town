/**
 * 特色菜限速验收（docs/design/特色菜限速-方案-2026-11-21.md 第 8 节第 1~5 条），直接用结算纯函数。
 * 第 6、7 条要线上店铺的真实状态，在 PR 里用线上库副本跑的脚本给数
 */
import { describe, expect, it } from 'vitest';
import type { Tuning } from '@dt/config';
import { hashSeed, seededRng, type Rng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { computeRates } from './rates';
import { pickyPortionsPerTable, specialDue, takeWhole } from './specialCap';
import { fameCoin } from './fame';
import { allocateTables, splitLearned } from './tables';
import type { SpecialCarry, SpecialDish } from './types';

const config = testConfig();
const all = config.cookbookIndex.allIds;
const withCap = (cap: number): Tuning => ({
  ...config.tuning,
  settlement: { ...config.tuning.settlement, specialFameCap: cap },
});
const tables = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ no: i + 1, floor: Math.floor(i / 16) + 1, customer: 0 }));

/** 一家随机的店：星级、桌数、学会的菜、上座和挑剔率都随机 */
function randomShop(rng: Rng): InputPatch {
  const cookbooks: Record<number, number> = {};
  const n = 1 + rng.int(rng.chance(0.3) ? 60 : 2500);
  for (let i = 0; i < n; i++) cookbooks[all[rng.int(all.length)]!] = 1 + rng.int(6);
  return {
    rest: { star: 1 + rng.int(7), streetId: 1 + rng.int(29) },
    tables: tables(6 + rng.int(60)),
    cookbooks,
    agg: { atRate: 0.3 + rng.next(), spRate: rng.next() * 0.3, mcCoinRate: rng.chance(0.3) ? 0.2 : 0 },
  };
}

/** 一轮：返回每桌吃的份数、满意的挑剔桌数、普通桌数、厨艺钱和零头 */
function round(patch: InputPatch, special: SpecialDish, cap: number, seed: number) {
  const input = buildInput(config, { ...patch, special });
  const g = buildGlobals(config, withCap(cap), {});
  const rng = seededRng(seed);
  const { rates, flags } = computeRates(input, g, rng);
  const o = allocateTables(input, g, rates, flags, rng);
  const last = o.tables.map((t) => t.last!);
  const picky = last.filter((l) => l.type === 2).reduce((a, l) => a + (l.mcNum ?? 0), 0);
  const normal = last.filter((l) => l.type === 1).reduce((a, l) => a + (l.mcNum ?? 0), 0);
  return {
    o,
    flags,
    picky,
    normal,
    satisfied: last.filter((l) => l.type === 2 && l.satisfied).length,
    normals: last.filter((l) => l.type === 1).length,
    // 收益明细里的 o.fame.f 保留两位小数；这里按结算同样的算法取不取整的
    fame: fameCoin(
      splitLearned(input.levels, g.cookbooks, input.rest.streetId, (L) => g.grade(L).spCoinAddRate).fame,
      input.rest.star,
      g.tuning.settlement.fame,
    ),
    mcNums: last.map((l) => l.mcNum ?? 0),
  };
}
const unit = (sp: SpecialDish) => sp.price * (config.tuning.mysterious.saleRates[sp.level - 1] ?? 1);

describe('特色菜限速（特色菜限速 2026-11-21）', () => {
  it('第 1 条 不亏：每一份都按原价收钱，银币 = 挑剔份数 × 每份卖价 + 普通份数 × 每份卖价 × 0.5（含每份远贵于厨艺钱的菜）', () => {
    const rng = seededRng(20261121);
    let capped = 0;
    for (let c = 0; c < 200; c++) {
      const patch = randomShop(rng);
      const level = 1 + rng.int(5);
      const sp: SpecialDish = {
        price: rng.chance(0.5) ? 10 + rng.int(60) : 200 + rng.int(3000),
        level,
        leftNum: 1e6,
      };
      const seed = hashSeed('cap1', c);
      const r = round(patch, sp, 0.5, seed);
      const none = round({ ...patch }, { ...sp, leftNum: 0 }, 0.5, seed);
      const pay = unit(sp) * (1 + r.flags.mcCoinRate);
      const t = config.tuning.settlement;
      const want = (r.picky * pay + r.normal * pay * t.normalSpecialPriceRate) * t.coinMultiplier;
      expect(r.o.coin - none.o.coin).toBeCloseTo(want, 6);
      if (r.satisfied > 0 && pickyPortionsPerTable(r.fame, unit(sp), 0.5) < 2) capped += 1;
    }
    expect(capped).toBeGreaterThan(50);
  });

  it('第 2 条 便宜的菜不变：每份卖价 ≤ 0.5 × 厨艺钱 ÷ 2、普通那项也没碰上限时，每桌份数和不限速一样', () => {
    const rng = seededRng(2);
    let checked = 0;
    for (let c = 0; c < 200; c++) {
      const patch = randomShop(rng);
      const probe = round(patch, { price: 1, level: 1, leftNum: 1e6 }, 0, hashSeed('cap2', c));
      const t = config.tuning.settlement;
      // 两项都不碰上限：挑剔 X × F ÷ p ≥ 2，普通 X × F × normalShare ÷ (p × 0.5) ≥ normalSpecialShare
      const maxUnit = Math.min(
        (0.5 * probe.fame) / 2,
        (0.5 * probe.fame * t.fame.normalShare) / (t.normalSpecialPriceRate * t.normalSpecialShare),
      );
      const level = 1 + rng.int(3);
      const price = Math.floor(maxUnit / (config.tuning.mysterious.saleRates[level - 1] ?? 1));
      if (price < 1) continue;
      const sp = { price, level, leftNum: 1e6 };
      const a = round(patch, sp, 0.5, hashSeed('cap2', c));
      const b = round(patch, sp, 0, hashSeed('cap2', c));
      expect(a.mcNums).toEqual(b.mcNums);
      expect(a.o.coin).toBeCloseTo(b.o.coin, 6);
      expect(a.o.exp).toBeCloseTo(b.o.exp, 6);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('第 3 条 零头：连续多轮，累计实卖和累计应卖差不到 1 份（挑剔、普通分别算），零头始终在 0 到 1 之间', () => {
    const rng = seededRng(3);
    for (let c = 0; c < 20; c++) {
      const patch = randomShop(rng);
      const sp: SpecialDish = { price: 100 + rng.int(2000), level: 1 + rng.int(5), leftNum: 1e6 };
      let carry: SpecialCarry = { picky: 0, normal: 0 };
      let sold = { picky: 0, normal: 0 };
      let due = { picky: 0, normal: 0 };
      for (let i = 0; i < 60; i++) {
        const r = round(patch, { ...sp, carry }, 0.5, hashSeed('cap3', c, i));
        const d = specialDue(
          { satisfied: r.satisfied, normals: r.normals, fame: r.fame, unitPrice: unit(sp) },
          config.tuning.settlement,
        );
        due = { picky: due.picky + d.picky, normal: due.normal + d.normal };
        sold = { picky: sold.picky + r.picky, normal: sold.normal + r.normal };
        carry = r.o.specialCarry!;
        for (const x of [carry.picky, carry.normal]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
        expect(due.picky - sold.picky).toBeCloseTo(carry.picky, 6);
        expect(due.normal - sold.normal).toBeCloseTo(carry.normal, 6);
        expect(Math.abs(due.picky - sold.picky)).toBeLessThan(1);
        expect(Math.abs(due.normal - sold.normal)).toBeLessThan(1);
      }
    }
  });

  it('零头：一批剩得不够时能卖多少卖多少，先挑剔后普通；挑剔每桌 ⌊N ÷ m⌋ 份，余下的按桌号各多 1 份', () => {
    const patch: InputPatch = {
      rest: { star: 5, streetId: 1 },
      tables: tables(40),
      cookbooks: Object.fromEntries(all.slice(0, 1500).map((id) => [id, 5])),
      agg: { atRate: 1, spRate: 0.3 },
    };
    const sp: SpecialDish = { price: 120, level: 5, leftNum: 1e6 };
    const r = round(patch, sp, 0.5, 7);
    const per = pickyPortionsPerTable(r.fame, unit(sp), 0.5);
    expect(per).toBeGreaterThan(0);
    expect(per).toBeLessThan(2);
    const picky = r.o.tables
      .filter((t) => t.last!.type === 2 && t.last!.satisfied)
      .map((t) => t.last!.mcNum ?? 0);
    const n = picky.reduce((a, b) => a + b, 0);
    expect(n).toBe(takeWhole(r.satisfied * per, 0).n);
    const each = Math.floor(n / picky.length);
    const extra = n - each * picky.length;
    expect(picky).toEqual(picky.map((_, i) => each + (i < extra ? 1 : 0)));
    // 只剩 3 份：章鱼哥（循环里）先吃，然后挑剔顾客，最后普通顾客
    const short = round(patch, { ...sp, leftNum: 3 }, 0.5, 7);
    const squid = short.o.tables
      .filter((t) => t.last!.type === 6)
      .reduce((a, t) => a + (t.last!.mcNum ?? 0), 0);
    expect(short.o.specialUsed).toBe(3);
    expect(short.picky).toBe(Math.min(3 - squid, n));
    expect(short.normal).toBe(3 - squid - short.picky);
  });

  it('第 4 条 学菜不亏：其他条件相同，厨艺钱更高时每轮应卖份数不会更少', () => {
    const rng = seededRng(4);
    const t = config.tuning.settlement;
    for (let c = 0; c < 2000; c++) {
      const o = {
        satisfied: rng.int(40),
        normals: rng.int(60),
        unitPrice: 1 + rng.next() * 3000,
      };
      const f1 = rng.next() * 400;
      const f2 = f1 + rng.next() * 200;
      const a = specialDue({ ...o, fame: f1 }, t);
      const b = specialDue({ ...o, fame: f2 }, t);
      expect(b.picky).toBeGreaterThanOrEqual(a.picky);
      expect(b.normal).toBeGreaterThanOrEqual(a.normal);
    }
    // 整轮结算：多学菜（厨艺值更高）的店，同一个种子下每份满意的挑剔桌吃得不会更少
    const few = Object.fromEntries(all.slice(0, 300).map((id) => [id, 4]));
    const many = Object.fromEntries(all.slice(0, 1500).map((id) => [id, 4]));
    const sp: SpecialDish = { price: 150, level: 5, leftNum: 1e6 };
    const base = { rest: { star: 4, streetId: 1 }, tables: tables(40), agg: { atRate: 1 } };
    const a = round({ ...base, cookbooks: few }, sp, 0.5, 11);
    const b = round({ ...base, cookbooks: many }, sp, 0.5, 11);
    expect(b.fame).toBeGreaterThan(a.fame);
    expect(pickyPortionsPerTable(b.fame, unit(sp), 0.5)).toBeGreaterThan(
      pickyPortionsPerTable(a.fame, unit(sp), 0.5),
    );
  });

  it('第 5 条 回退：specialFameCap ≤ 0 时挑剔每桌 2 份、普通 ⌊桌数 × 0.5⌋ 份，和改动前的卖法一样', () => {
    const rng = seededRng(5);
    for (let c = 0; c < 100; c++) {
      const patch = randomShop(rng);
      const sp: SpecialDish = { price: 200 + rng.int(3000), level: 1 + rng.int(5), leftNum: 1e6 };
      const seed = hashSeed('cap5', c);
      const off = round(patch, sp, 0, seed);
      const neg = round(patch, sp, -1, seed);
      expect(off.picky).toBe(off.satisfied * 2);
      expect(off.normal).toBe(Math.floor(off.normals * config.tuning.settlement.normalSpecialShare + 1e-9));
      expect(neg.mcNums).toEqual(off.mcNums);
      expect(neg.o.coin).toBe(off.o.coin);
      // 零头不动
      expect(off.o.specialCarry).toEqual({ picky: 0, normal: 0 });
    }
  });
});
