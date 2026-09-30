import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { pickBigEaterLevel, rollRange, shakeCoin, shakeEgg } from './rules';

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
