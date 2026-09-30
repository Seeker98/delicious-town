import { describe, expect, it } from 'vitest';
import { parseAppraiseDef, parseTeacherCert } from './mysterious';

describe('parseAppraiseDef（规格书 04 §4.3）', () => {
  it('value 有 mysterious 时解析出等级范围、成功率、张数', () => {
    expect(parseAppraiseDef({ mysterious: [3, 5], rate: 1, num: 2, info: 'x' })).toEqual({
      min: 3,
      max: 5,
      rate: 1,
      num: 2,
    });
  });

  it('没有 num 时按 1 张；没有 mysterious 或不是对象时返回 null', () => {
    expect(parseAppraiseDef({ mysterious: [1, 6], rate: 0.28 })).toEqual({
      min: 1,
      max: 6,
      rate: 0.28,
      num: 1,
    });
    expect(parseAppraiseDef({ luckValue: 3 })).toBeNull();
    expect(parseAppraiseDef(null)).toBeNull();
    expect(parseAppraiseDef('1')).toBeNull();
  });
});

describe('parseTeacherCert（规格书 04 §4.7）', () => {
  it('解析教师证', () => {
    expect(parseTeacherCert({ level: [1, 2], needStrength: 50, maxNum: 5, lessonHour: 24 })).toEqual({
      levels: [1, 2],
      needStrength: 50,
      maxNum: 5,
      lessonHour: 24,
    });
  });

  it('字段缺失或类型不对时返回错误说明', () => {
    expect(typeof parseTeacherCert({ level: [], needStrength: 50, maxNum: 5, lessonHour: 24 })).toBe(
      'string',
    );
    expect(typeof parseTeacherCert({ level: [1], needStrength: '50', maxNum: 5, lessonHour: 24 })).toBe(
      'string',
    );
    expect(typeof parseTeacherCert(null)).toBe('string');
  });
});
