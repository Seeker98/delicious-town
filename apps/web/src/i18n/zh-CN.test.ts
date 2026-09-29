import { describe, expect, it } from 'vitest';
import { errorText, setNameResolver } from './zh-CN';

describe('错误文案', () => {
  it('封禁带原因', () => {
    expect(errorText('ACCOUNT_BANNED', { reason: '刷分' })).toBe('账号已被封禁：刷分');
  });
  it('资源不够时说清楚缺什么', () => {
    setNameResolver({ goodsName: () => '升星凭证', foodName: () => '大米' });
    expect(errorText('NOT_ENOUGH', { kind: 'coin', need: 500, have: 100 })).toBe(
      '银币不够（需要 500，现有 100）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'goods', id: 86, need: 1, have: 0 })).toBe(
      '升星凭证不够（需要 1，现有 0）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'foods', id: 101, need: 3, have: 1 })).toBe(
      '大米不够（需要 3，现有 1）',
    );
  });
  it('条件、上限、状态按原因说明', () => {
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'level', need: 13, have: 12 })).toBe(
      '餐厅等级不够（需要 13 级）',
    );
    expect(errorText('LIMIT_REACHED', { what: 'market', limit: 1 })).toBe('这批货每人限购 1 份');
    expect(errorText('INVALID_STATE', { reason: 'oil_full' })).toBe('油壶已经是满的');
    expect(errorText('INVALID_STATE', { reason: 'no_such_reason' })).toBe('当前状态下不能这样做');
  });
});
