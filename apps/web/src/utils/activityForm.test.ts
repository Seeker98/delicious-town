import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { defaultDef, issueMap, signinTemplate } from './activityForm';

describe('后台活动表单工具', () => {
  it('九宫格默认 3×3 共 9 格；改尺寸由调用方补齐', () => {
    expect(defaultDef('grid').cells).toHaveLength(9);
    expect(defaultDef('goals').goals).toHaveLength(1);
    expect(defaultDef('pass').levels).toHaveLength(1);
  });
  it('签到模板是 1/3/5/7 天四行', () => {
    expect(signinTemplate().goals.map((g) => [g.key, g.target])).toEqual([
      ['signin', 1],
      ['signin', 3],
      ['signin', 5],
      ['signin', 7],
    ]);
  });
  it('服务端错误按路径转成中文', () => {
    const e = new ApiError('VALIDATION_FAILED', {
      issues: [
        { path: 'def.cells.4.target', message: 'Number must be greater than or equal to 1' },
        { path: 'def.levels.1.points', message: 'not_increasing' },
        { path: 'endsAt', message: 'before_start' },
      ],
    });
    expect(issueMap(e)).toEqual({
      'def.cells.4.target': '填写的内容不正确',
      'def.levels.1.points': '积分要比上一档高',
      endsAt: '结束时间要晚于开始时间',
    });
    expect(issueMap(new Error('x'))).toEqual({});
  });
});
