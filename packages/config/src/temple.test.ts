import { describe, expect, it } from 'vitest';
import { parseMapDef, parseMissileDef } from './temple';

describe('parseMissileDef（规格书 09 §9.1）', () => {
  it('解析命中、暴击、暴击倍数、伤害区间', () => {
    expect(parseMissileDef({ attack: [90, 110], hitRate: 0.9, crit: 0.2, critRate: 2 })).toEqual({
      attack: [90, 110],
      hitRate: 0.9,
      crit: 0.2,
      critRate: 2,
    });
  });
  it('字段缺失或类型不对时返回错误说明', () => {
    expect(typeof parseMissileDef({ attack: [90], hitRate: 0.9, crit: 0.2, critRate: 2 })).toBe('string');
    expect(typeof parseMissileDef(null)).toBe('string');
  });
});

describe('parseMapDef（规格书 09 §9.2）', () => {
  it('解析成功率、食材等级和数量区间、神秘率、体力', () => {
    expect(
      parseMapDef({
        rate: 0.75,
        level: [4, 5],
        num: [5, 10],
        mysteriousRate: 0.06,
        needStrength: 2,
        shell: 0.05,
      }),
    ).toEqual({ rate: 0.75, level: [4, 5], num: [5, 10], mysteriousRate: 0.06, needStrength: 2 });
  });
  it('字段缺失时返回错误说明', () => {
    expect(typeof parseMapDef({ rate: 0.75, level: [4, 5], mysteriousRate: 0.06, needStrength: 2 })).toBe(
      'string',
    );
  });
});
