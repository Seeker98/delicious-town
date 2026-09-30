import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  blessFoodIds,
  feastAmount,
  levelFoodIds,
  mysteryFoodIds,
  pickBigEaterLevel,
  pickDistinct,
  rollRange,
  shakeCoin,
  shakeEgg,
} from './rules';

const W = [50, 25, 13, 9, 3];

describe('小镇规则（纯函数）', () => {
  it('大胃哥按 [50,25,13,9,3] 抽等级', () => {
    expect(pickBigEaterLevel(W, sequenceRng([0]))).toBe(1);
    expect(pickBigEaterLevel(W, sequenceRng([0.5]))).toBe(2);
    expect(pickBigEaterLevel(W, sequenceRng([0.8]))).toBe(3);
    expect(pickBigEaterLevel(W, sequenceRng([0.96]))).toBe(4);
    expect(pickBigEaterLevel(W, sequenceRng([0.99]))).toBe(5);
  });

  it('rollRange 两端都能取到', () => {
    expect(rollRange([1, 3], sequenceRng([0]))).toBe(1);
    expect(rollRange([1, 3], sequenceRng([0.999]))).toBe(3);
    expect(rollRange([1, 20], sequenceRng([0.5]))).toBe(11);
  });
});

const S = testConfig().tuning.town.shake;

describe('摇钱包规则', () => {
  it('银币 = (8000 − rand[0,4999]) × 星级，至少 1', () => {
    expect(shakeCoin(2, S, sequenceRng([0]))).toBe(16000);
    expect(shakeCoin(2, S, sequenceRng([0.9999]))).toBe(6002);
    expect(shakeCoin(0, S, sequenceRng([0]))).toBe(1);
  });

  it('流水号尾数 88 掏出东西：百位以上 %8 = 1 给蟹黄堡，否则 8 个蟹币', () => {
    expect(shakeEgg(87, S)).toBeNull();
    expect(shakeEgg(88, S)).toEqual({ goodsId: 240, num: 8 });
    expect(shakeEgg(188, S)).toEqual({ goodsId: 180, num: 1 });
    expect(shakeEgg(988, S)).toEqual({ goodsId: 180, num: 1 });
    expect(shakeEgg(288, S)).toEqual({ goodsId: 240, num: 8 });
  });
});

describe('可兑换的食材（设计文档 裁定 5）', () => {
  const config = testConfig();
  const town = config.tuning.town;
  it('稀有兑换关闭时：N 级券只换 odds = 100 的这一级食材；神秘券不能换 573、574', () => {
    const ids = levelFoodIds(config, town, 1);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(config.requireFood(id)).toMatchObject({ level: 1, odds: 100 });
    const m = mysteryFoodIds(config, town);
    expect(m.length).toBeGreaterThan(0);
    for (const id of m) expect(config.requireFood(id).level).toBe(7);
    expect(m).not.toContain(573);
    expect(m).not.toContain(574);
  });
  it('稀有兑换打开时不再限制', () => {
    const open = { ...town, rareExchange: true };
    expect(levelFoodIds(config, open, 1)).toHaveLength(config.foodsByLevel.get(1)!.length);
    expect(mysteryFoodIds(config, open)).toHaveLength(config.foodsByLevel.get(7)!.length);
  });
});

describe('星愿规则（设计文档 §3.7、裁定 8、10）', () => {
  const config = testConfig();
  it('pickDistinct 不重复，数量不超过候选数', () => {
    const got = pickDistinct([1, 2, 3, 4], 3, sequenceRng([0.9, 0.9, 0.9]));
    expect(new Set(got).size).toBe(3);
    expect(pickDistinct([1, 2], 5, sequenceRng([0]))).toHaveLength(2);
  });
  it('神灯加成：银币多 10%，其他数量 +1', () => {
    const coin = config.bless.get(4)!;
    expect(feastAmount(coin, false, 0.1)).toBe(200_000);
    expect(feastAmount(coin, true, 0.1)).toBe(220_000);
    const goods = config.bless.get(6)!;
    expect(feastAmount(goods, true, 0.1)).toBe(31);
    expect(feastAmount(config.bless.get(1)!, true, 0.1)).toBe(4);
  });
  it('食材范围：区间内全部 1~6 级食材', () => {
    const ids = blessFoodIds(config, [1, 2]);
    expect(ids).toHaveLength(config.foodsByLevel.get(1)!.length + config.foodsByLevel.get(2)!.length);
  });
});
