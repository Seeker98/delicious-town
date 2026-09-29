import { describe, expect, it } from 'vitest';
import { getAt, groupOf, leafPaths, removeAt, setAt } from './settingsTree';

describe('settingsTree', () => {
  const tree = {
    tuning: { settlement: { expMultiplier: 5 }, market: { dailyHours: [8, 10] } },
    restaurant: { coin: 1 },
  };

  it('叶子路径：数组算叶子', () => {
    expect(leafPaths(tree)).toEqual([
      'tuning.settlement.expMultiplier',
      'tuning.market.dailyHours',
      'restaurant.coin',
    ]);
  });

  it('按路径读、写（不改原对象）、删（删空的父对象）', () => {
    expect(getAt(tree, 'tuning.market.dailyHours')).toEqual([8, 10]);
    expect(getAt(tree, 'tuning.nope.x')).toBeUndefined();
    const a = setAt({}, 'tuning.settlement.expMultiplier', 10);
    expect(a).toEqual({ tuning: { settlement: { expMultiplier: 10 } } });
    const b = setAt(a, 'tuning.market.dailyKinds', 6);
    expect(a).toEqual({ tuning: { settlement: { expMultiplier: 10 } } });
    expect(removeAt(b, 'tuning.settlement.expMultiplier')).toEqual({ tuning: { market: { dailyKinds: 6 } } });
    expect(removeAt(a, 'tuning.settlement.expMultiplier')).toEqual({});
  });

  it('分组：tuning 按第二段，其他按第一段', () => {
    expect(groupOf('tuning.market.dailyKinds')).toBe('tuning.market');
    expect(groupOf('restaurant.coin')).toBe('restaurant');
  });
});
