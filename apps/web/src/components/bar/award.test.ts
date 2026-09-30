import { describe, expect, it } from 'vitest';
import { awardText, handName } from './award';

const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };

describe('awardText', () => {
  it('银币、经验带千分位；物品、食材写名字和数量；幸运翻倍标出来', () => {
    expect(awardText({ kind: 'coin', id: null, num: 1400, lucky: false }, names)).toBe('银币 1,400');
    expect(awardText({ kind: 'exp', id: null, num: 100, lucky: false }, names)).toBe('经验 100');
    expect(awardText({ kind: 'goods', id: 5, num: 1, lucky: false }, names)).toBe('道具5×1');
    expect(awardText({ kind: 'foods', id: 101, num: 2, lucky: true }, names)).toBe('食材101×2（幸运）');
  });

  it('出拳名', () => {
    expect([0, 1, 2].map(handName)).toEqual(['石头', '剪刀', '布']);
  });
});
