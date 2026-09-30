import { describe, expect, it } from 'vitest';
import { errorText, setNameResolver } from './zh-CN';

describe('错误文案', () => {
  it('封禁带原因', () => {
    expect(errorText('ACCOUNT_BANNED', { reason: '刷分' })).toBe('账号已被封禁：刷分');
  });
  it('资源不够时说清楚缺什么', () => {
    setNameResolver({
      goodsName: () => '升星凭证',
      foodName: () => '大米',
      mcName: () => '秘·仿膳饽饽',
      seedName: () => '大米种子',
    });
    expect(errorText('NOT_ENOUGH', { kind: 'remnant', id: 1, need: 3, have: 1 })).toBe(
      '秘·仿膳饽饽残卷不够（需要 3，现有 1）',
    );
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

describe('好友互动的错误文案', () => {
  it('按 reason / what / who 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'table_occupied' })).toBe('这张桌子有人了');
    expect(errorText('LIMIT_REACHED', { what: 'seats', max: 2 })).toBe('对方的白食位满了（最多 2 人）');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'dine_minutes', need: 30 })).toBe(
      '白食满 30 分钟才能结束或请走',
    );
    expect(errorText('ALREADY_DONE', { what: 'thumb' })).toBe('今天已经给它点过赞了');
    expect(errorText('EMAIL_NOT_VERIFIED', { who: 'target' })).toBe('对方还没验证邮箱，不能互动');
    expect(errorText('COOLDOWN', { what: 'flip' })).toBe('这个橱柜位还在冷却中');
    expect(errorText('COOLDOWN', { what: 'market_special', seconds: 540 })).toBe(
      '特价菜同一网络 10 分钟内只能抢一次，还要等 9 分钟',
    );
    expect(errorText('NOT_FRIEND')).toBe('你们还不是好友');
  });
  it('菜园：种子、菜篮、碎片、声望、地块上限、状态', () => {
    setNameResolver({
      goodsName: () => '升星凭证',
      foodName: () => '大米',
      mcName: () => '秘·仿膳饽饽',
      seedName: () => '大米种子',
    });
    expect(errorText('NOT_ENOUGH', { kind: 'seed', id: 1, need: 1, have: 0 })).toBe(
      '大米种子不够（需要 1，现有 0）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'basket', id: 101, need: 3, have: 1 })).toBe(
      '菜篮里的大米不够（需要 3，现有 1）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'fragment', part: 'sub', id: 1, need: 1, have: 0 })).toBe(
      '配方辅碎片不够（需要 1，现有 0）',
    );
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown', need: 1 })).toBe(
      '声望不够（偷菜要 1 点声望）',
    );
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown' })).toBe('声望为负时不能点赞');
    expect(errorText('LIMIT_REACHED', { what: 'lands', max: 9 })).toBe('最多开垦 9 块地');
    expect(errorText('INVALID_STATE', { reason: 'withered' })).toBe('作物已经枯萎，只能铲除');
    expect(errorText('ALREADY_DONE', { what: 'steal' })).toBe('这株你已经偷过了');
  });
});
