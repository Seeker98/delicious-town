import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { collectionEffects, type CollectionCounts } from './collection';

const config = testConfig();
const t = config.tuning.collection;
const none: CollectionCounts = {
  plaques: 0,
  honors: 0,
  pots: 0,
};
const calc = (c: Partial<CollectionCounts>) =>
  collectionEffects({ ...none, ...c }, t, config.bundle.potTiers);

describe('收集类加成（规格书 20 §20.18）', () => {
  it('什么都没有时为空', () => {
    expect(calc({})).toEqual({});
  });
  it('集牌匾：每种 1%（纪念牌匾翻倍已删，道具减法 2026-10-13）', () => {
    expect(calc({ plaques: 3 }).plaqueSum).toBeCloseTo(0.03);
  });
  it('集荣誉：每个 0.4%，银币、经验一样（马到成功、2025 纪念牌匾已删）', () => {
    expect(calc({ honors: 10 })).toEqual({ honorAddCoin: 0.04, honorAddExp: 0.04 });
  });
  it('集盆栽：4 株银币 +8%，7 株再经验 +64%，档位累加', () => {
    expect(calc({ pots: 3 })).toEqual({});
    expect(calc({ pots: 4 })).toEqual({ potCoinRate: 0.08 });
    expect(calc({ pots: 6 })).toEqual({ potCoinRate: 0.08 });
    expect(calc({ pots: 7 })).toEqual({ potCoinRate: 0.08, potExpRate: 0.64 });
  });
});
