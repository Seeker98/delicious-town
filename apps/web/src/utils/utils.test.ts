import { describe, expect, it } from 'vitest';
import { describeEffects } from './effects';
import { formatNum } from './format';

describe('formatNum', () => {
  it('千分位', () => {
    expect(formatNum(100000)).toBe('100,000');
    expect(formatNum(0)).toBe('0');
  });
});

describe('describeEffects', () => {
  it('比率显示为百分比，数值显示为加减，按固定顺序', () => {
    expect(describeEffects({ expRate: 1, atRate: 0.25, coinRate: 1 })).toBe(
      '上座率+25% 最终银币+100% 最终经验+100%',
    );
    expect(describeEffects({ luckValue: 36, coinValue: 1, spRate: -0.35, atRate: 0.35 })).toBe(
      '上座率+35% 挑剔率-35% 每桌银币+1 幸运+36',
    );
  });

  it('不认识的键不显示', () => {
    expect(describeEffects({ redPants: 1, luckValue: 20 })).toBe('幸运+20');
  });
});
