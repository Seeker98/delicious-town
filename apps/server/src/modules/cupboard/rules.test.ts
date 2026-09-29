import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { handleTargetLevel, runHandle } from './rules';

const config = testConfig();
const base = {
  way: 'decompose' as const,
  num: 1,
  star: 0,
  foodCoin: 1000,
  weatherRate: 0,
  luckRate: 0,
  extraRate: 0,
  tuning: config.tuning,
};

describe('合成分解（规格书 05 §5.4）', () => {
  it('分解 2~6 级，合成 1~4 级；其他不能处理', () => {
    expect(handleTargetLevel('decompose', 2)).toBe(1);
    expect(handleTargetLevel('decompose', 1)).toBeNull();
    expect(handleTargetLevel('decompose', 7)).toBeNull();
    expect(handleTargetLevel('compose', 4)).toBe(5);
    expect(handleTargetLevel('compose', 5)).toBeNull();
  });

  it('分解 1 个 = 2 次机会；成功按权重抽，失败再判幸运，都失败返还半价 × 随机', () => {
    const pool = config.foodPools.get(1)!;
    // 第 1 次：0.5 < 0.9 成功 → 抽取 0；第 2 次：0.95 失败 → 幸运 0.99 失败 → 返还 0.5
    const o = runHandle(base, pool, sequenceRng([0.5, 0, 0.95, 0.99, 0.5]));
    expect(o).toMatchObject({ chances: 2, success: 1, lucky: 0, failCoin: 250 });
    expect(o.picks).toEqual([pool.items[0]!.id]);
  });

  it('合成 2 个 = 1 次机会；天气加成可以让成功率到 100%', () => {
    const pool = config.foodPools.get(3)!;
    const o = runHandle(
      { ...base, way: 'compose', num: 4, weatherRate: 1 },
      pool,
      sequenceRng([0.99, 0, 0.99, 0]),
    );
    expect(o).toMatchObject({ chances: 2, success: 2 });
  });

  it('额外次数：分解按每个原料、合成按每组判定', () => {
    const pool = config.foodPools.get(1)!;
    const o = runHandle(
      { ...base, num: 2, extraRate: 0.5 },
      pool,
      sequenceRng([0.1, 0.9, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(o.chances).toBe(5);
  });
});
