import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { starChecks, starCoinOf, starNeedOf } from './rules';

const config = testConfig();
const need = config.starNeed.get(2)!;
const counts = { learned: 100, grade: Array(11).fill(0) as number[], street: {} };

describe('升星银币（240-1）', () => {
  it('starCoinOf：第 N 星取第 N 个数；没写的星是 0（Review Focus 5）', () => {
    expect(starCoinOf({ starCoin: [0, 3000000] }, 2)).toBe(3000000);
    expect(starCoinOf({ starCoin: [0, 3000000] }, 3)).toBe(0);
    expect(starCoinOf({ starCoin: [] }, 1)).toBe(0);
  });

  it('starNeedOf：学会食谱数取区服设置第 N 个数；没写的星、泛紫星用升星表（2026-10-24）', () => {
    expect(starNeedOf(config.starNeed, { starCookbooks: [15, 900] }, 2)!.needCookbooks).toBe(900);
    expect(starNeedOf(config.starNeed, { starCookbooks: [15, 900] }, 2)!.needLevel).toBe(need.needLevel);
    expect(starNeedOf(config.starNeed, { starCookbooks: [15] }, 2)!.needCookbooks).toBe(need.needCookbooks);
    const purple = config.starNeed.get(8)!;
    expect(starNeedOf(config.starNeed, { starCookbooks: Array(8).fill(1) }, 8)).toEqual(purple);
    expect(starNeedOf(config.starNeed, { starCookbooks: [] }, 99)).toBeUndefined();
  });

  it('要收银币时条件多一行“银币”；不收时和原来一样只有三行', () => {
    const rest = { level: 30, coin: 100 };
    expect(starChecks(rest, counts, 2, need, 0).map((c) => c.key)).toEqual(['level', 'cookbooks', 'goods']);
    const checks = starChecks(rest, counts, 2, need, 500);
    expect(checks.at(-1)).toEqual({ key: 'coin', need: 500, have: 100, ok: false });
  });
});
