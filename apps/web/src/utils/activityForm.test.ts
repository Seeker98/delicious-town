import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { defaultDef, errUnder, issueMap, signinTemplate } from './activityForm';

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
        { path: 'def.goals.1.award.goods.0.id', message: 'unknown' },
      ],
    });
    expect(issueMap(e)).toEqual({
      'def.cells.4.target': '填写的内容不正确',
      'def.levels.1.points': '积分要比上一档高',
      endsAt: '结束时间要晚于开始时间',
      // 道具、食材 id 不存在（问题记录 270 顺带：保存时校验）
      'def.goals.1.award.goods.0.id': '道具或食材不存在',
    });
    expect(issueMap(new Error('x'))).toEqual({});
  });
  it('errUnder：取这一层或更深的第一条错误，不会匹配到名字相同前缀的兄弟字段', () => {
    const errs = { 'def.goals.1.award.goods.0.id': '道具或食材不存在', 'def.goals.10.target': 'x' };
    expect(errUnder(errs, 'def.goals.1.award')).toBe('道具或食材不存在');
    expect(errUnder(errs, 'def.goals.1')).toBe('道具或食材不存在');
    expect(errUnder(errs, 'def.goals.0.award')).toBeUndefined();
  });
});
