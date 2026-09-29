import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { collectionEffects, type CollectionCounts } from './collection';

const config = testConfig();
const t = config.tuning.collection;
const none: CollectionCounts = {
  plaques: 0,
  honors: 0,
  pots: 0,
  paintings: 0,
  an2023: false,
  an2025: false,
  mdcg: false,
};
const calc = (c: Partial<CollectionCounts>) =>
  collectionEffects({ ...none, ...c }, t, config.bundle.potTiers, config.bundle.paintingTiers);

describe('收集类加成（规格书 20 §20.18）', () => {
  it('什么都没有时为空', () => {
    expect(calc({})).toEqual({});
  });
  it('集牌匾：每种 1%，有 2023 纪念牌匾翻倍', () => {
    expect(calc({ plaques: 3 }).plaqueSum).toBeCloseTo(0.03);
    expect(calc({ plaques: 3, an2023: true }).plaqueSum).toBeCloseTo(0.06);
  });
  it('集荣誉：每个 0.4%，马到成功 ×1.5，2025 纪念牌匾银币部分 +16%', () => {
    expect(calc({ honors: 10 })).toMatchObject({ honorAddCoin: 0.04, honorAddExp: 0.04 });
    const x = calc({ honors: 10, mdcg: true, an2025: true });
    expect(x.honorAddExp).toBeCloseTo(0.06);
    expect(x.honorAddCoin).toBeCloseTo(0.0696);
  });
  it('集盆栽：4 株银币 +8%，7 株再经验 +64%，档位累加', () => {
    expect(calc({ pots: 3 })).toEqual({});
    expect(calc({ pots: 4 })).toEqual({ potCoinRate: 0.08 });
    expect(calc({ pots: 7 })).toEqual({ potCoinRate: 0.08, reapAddNum: 1, potExpRate: 0.64 });
  });
  it('集名画：7 幅自动加油，13 幅经验 +80% 且标记最高档', () => {
    expect(calc({ paintings: 7 })).toEqual({ autoAddOil: 1, mcCoinAdd: 1 });
    expect(calc({ paintings: 13 })).toEqual({
      autoAddOil: 1,
      mcCoinAdd: 1,
      reapAddNum: 1,
      paintingExpRate: 0.8,
      paintingTop: 1,
    });
  });
});
