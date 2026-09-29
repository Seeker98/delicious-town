import { describe, expect, it } from 'vitest';
import { diffPaths } from './diff';

describe('diffPaths', () => {
  it('列出改动、新增、删除的叶子路径，数组整体算一个叶子', () => {
    const a = {
      tuning: { settlement: { expMultiplier: 5 }, market: { dailyKinds: 5 } },
      features: { pond: false },
    };
    const b = {
      tuning: { settlement: { expMultiplier: 10 }, market: { dailyKinds: 5, dailyHours: [8, 10] } },
    };
    expect(diffPaths(a, b)).toEqual([
      'features.pond',
      'tuning.market.dailyHours',
      'tuning.settlement.expMultiplier',
    ]);
  });

  it('一样时为空；类型从对象变成数值算一处改动', () => {
    expect(diffPaths({ x: { y: 1 } }, { x: { y: 1 } })).toEqual([]);
    expect(diffPaths({ x: { y: 1 } }, { x: 3 })).toEqual(['x']);
  });
});
