import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/helpers';
import { emptyCookbookLevels, initialTables, newRestaurantValues } from './rules';

describe('restaurant rules', () => {
  it('初始餐桌都在 1 楼、空桌；每层 16 桌', () => {
    expect(initialTables(4)).toEqual([
      { no: 1, floor: 1, customer: 0 },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
      { no: 4, floor: 1, customer: 0 },
    ]);
    expect(initialTables(17)[16]).toEqual({ no: 17, floor: 2, customer: 0 });
  });

  it('已学食谱数组：长度 = 最大食谱 id + 1，全部未学', () => {
    const buf = emptyCookbookLevels(2363);
    expect(buf.length).toBe(2364);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('新店不用做老号换算：任务版本直接是 1（backlog 318）', () => {
    expect(newRestaurantValues(1, 2, '小店', testConfig().bundle.restaurantDefaults).quest_version).toBe(1);
  });

  it('新店数值来自配置；幸运 = 等级 - 1', () => {
    const d = testConfig().bundle.restaurantDefaults;
    const v = newRestaurantValues(1, 2, '小店', d);
    expect(v).toMatchObject({
      shard_id: 1,
      account_id: 2,
      name: '小店',
      level: 1,
      coin: 100000,
      attr_left: 3,
      luck: 0,
      table_num: 4,
      street_id: 0,
    });
  });
});
