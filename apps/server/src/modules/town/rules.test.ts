import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { pickBigEaterLevel, rollRange } from './rules';

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
