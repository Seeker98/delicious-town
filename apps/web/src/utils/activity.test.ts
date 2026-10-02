import { describe, expect, it } from 'vitest';
import { actionName, rewardStatus, timeLeft } from './activity';

describe('活动页工具', () => {
  it('剩余时间：天和小时；不到一小时显示分钟；过了显示已结束', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(timeLeft('2026-10-03T05:30:00Z', now)).toBe('还剩 2 天 5 小时');
    expect(timeLeft('2026-10-01T00:20:00Z', now)).toBe('还剩 20 分钟');
    expect(timeLeft('2026-09-30T00:00:00Z', now)).toBe('已结束');
  });
  it('行为名：认识的显示中文，不认识的原样', () => {
    expect(actionName('signin')).toBe('签到');
    expect(actionName('x.y')).toBe('x.y');
  });
  it('按钮状态', () => {
    const r = (reached: boolean, claimed: 'page' | 'mail' | null) => ({
      key: 'g0',
      award: {},
      reached,
      claimed,
    });
    expect(rewardStatus(r(false, null), 'running')).toBe('locked');
    expect(rewardStatus(r(true, null), 'running')).toBe('claim');
    expect(rewardStatus(r(true, 'page'), 'ended')).toBe('page');
    expect(rewardStatus(r(true, 'mail'), 'ended')).toBe('mail');
    expect(rewardStatus(r(true, null), 'settling')).toBe('mail');
    expect(rewardStatus(r(false, null), 'ended')).toBe('missed');
  });
});
