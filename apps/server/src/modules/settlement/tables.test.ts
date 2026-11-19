import { describe, expect, it } from 'vitest';
import { seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { fameCoin, fameValue, satisfyChance } from './fame';
import { countAtLeast, orderDish, splitLearned } from './tables';

describe('splitLearned：按存储位找出学会的菜（重新编号 PR 3）', () => {
  // 存储位 0 → 菜 5（1 号街），1 是空位（删掉的菜），2 → 菜 7（2 号街）；菜 6 已删（街道 -1）
  const idx = {
    idAt: Int32Array.from([5, -1, 7]),
    street: Int16Array.from([-1, -1, -1, -1, -1, 1, -1, 2]),
    coin: Float64Array.from([0, 0, 0, 0, 0, 500, 0, 1000]),
  };

  it('空位上的字节、超出存储位总数的字节都不算（换号后老店的字节串可能更长）', () => {
    const levels = Uint8Array.from([3, 2, 1, 4, 5]);
    expect(splitLearned(levels, idx, 1)).toMatchObject({ all: [5, 7], local: [5], other: [7] });
  });

  it('字节串比存储位短时只看有的部分', () => {
    expect(splitLearned(Uint8Array.from([1]), idx, 2)).toMatchObject({ all: [5], local: [], other: [5] });
  });

  it('同一遍里按品级分组、累加厨艺值 Σ 菜价 × (1 + 品级加成)（收益模型改版 2026-11-19）', () => {
    const add = (g: number) => g * 0.2;
    const r = splitLearned(Uint8Array.from([3, 2, 1]), idx, 1, add);
    expect(r.byGrade[3]).toEqual([5]);
    expect(r.byGrade[1]).toEqual([7]);
    expect(r.fame).toBeCloseTo(500 * 1.6 + 1000 * 1.2);
    expect(fameValue(Uint8Array.from([3, 2, 1]), idx, add)).toBeCloseTo(r.fame);
    // 不给品级加成时不算厨艺值
    expect(splitLearned(Uint8Array.from([3, 2, 1]), idx, 1).fame).toBe(0);
  });
});

describe('厨艺钱 F = a × K^β × 星级客单价系数（收益模型改版 2026-11-19）', () => {
  const f = testConfig().tuning.settlement.fame;
  it('默认 a 1.95、β 0.35；星级系数 0 星 0.36、4 星 0.76、7 星 1.06', () => {
    expect(f).toMatchObject({ a: 1.95, beta: 0.35, normalShare: 0.3, shortPayRate: 0.5, satisfyCount: 30 });
    expect(fameCoin(1, 0, f)).toBeCloseTo(1.95 * (0.25 / 0.7));
    expect(fameCoin(1, 4, f)).toBeCloseTo(1.95 * (0.53 / 0.7));
    expect(fameCoin(1, 7, f)).toBeCloseTo(1.95 * (0.74 / 0.7));
    expect(fameCoin(100_000, 4, f)).toBeCloseTo(1.95 * Math.pow(100_000, 0.35) * (0.53 / 0.7));
  });
  it('一道菜都没学时为 0', () => {
    expect(fameCoin(0, 7, f)).toBe(0);
  });
  it('满意的机会 min(1, m ÷ 30)', () => {
    expect(satisfyChance(15, 30)).toBe(0.5);
    expect(satisfyChance(45, 30)).toBe(1);
  });
});

describe('orderDish：挑剔顾客、蟹老板点菜（收益模型改版 2026-11-19）', () => {
  /** 食谱 id = 品级 × 100 + 序号 */
  const learn = (grades: number[]) => {
    const byGrade: number[][] = [];
    const all: number[] = [];
    grades.forEach((g, i) => {
      const id = g * 100 + i;
      (byGrade[g] ??= []).push(id);
      all.push(id);
    });
    return { all, byGrade };
  };

  it('一道都没学：返回 null，不取随机数', () => {
    expect(orderDish({ all: [], byGrade: [] }, 1, 30, sequenceRng([0.99]))).toBeNull();
  });

  it('满意时从够品级的菜里点，不满意时从品级不够的菜里点', () => {
    const l = learn([1, 1, 3, 5]);
    // m = 2（3 品、5 品），机会 2 / 30
    const hit = orderDish(l, 3, 30, sequenceRng([0, 0.99]))!;
    expect(hit).toEqual({ cookbookId: 503, satisfied: true });
    const miss = orderDish(l, 3, 30, sequenceRng([0.5, 0.6]))!;
    expect(miss.satisfied).toBe(false);
    expect(Math.floor(miss.cookbookId / 100)).toBe(1);
  });

  it('全都够品级但不到 30 道时也可能不满意，这时从全部学会的菜里点', () => {
    const r = orderDish(learn([5, 6]), 2, 30, sequenceRng([0.5, 0.6]))!;
    expect(r.satisfied).toBe(false);
    expect([500, 601]).toContain(r.cookbookId);
  });

  it('够品级的菜数按品级 ≥ 要求数', () => {
    const l = learn([1, 2, 2, 7]);
    expect(countAtLeast(l.byGrade, 1)).toBe(4);
    expect(countAtLeast(l.byGrade, 2)).toBe(3);
    expect(countAtLeast(l.byGrade, 3)).toBe(1);
    expect(countAtLeast(l.byGrade, 8)).toBe(0);
  });

  it('多学一道菜（任意品级）或升一品，任意要求下满意的机会都不下降（方案验收第 2 条）', () => {
    const rng = seededRng(7);
    for (let n = 0; n < 2000; n++) {
      const grades = Array.from({ length: rng.int(60) }, () => rng.intMin1(7));
      const before = learn(grades);
      const more = learn([...grades, rng.intMin1(7)]);
      const up = grades.length > 0 ? [...grades] : [1];
      const i = rng.int(up.length);
      up[i] = Math.min(7, up[i]! + 1);
      const upped = learn(up);
      for (let req = 1; req <= 7; req++) {
        const p0 = satisfyChance(countAtLeast(before.byGrade, req), 30);
        expect(satisfyChance(countAtLeast(more.byGrade, req), 30)).toBeGreaterThanOrEqual(p0);
        if (grades.length > 0)
          expect(satisfyChance(countAtLeast(upped.byGrade, req), 30)).toBeGreaterThanOrEqual(p0);
      }
    }
  });
});
