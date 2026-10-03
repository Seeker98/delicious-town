import { describe, expect, it } from 'vitest';
import {
  activityStatus,
  actionName,
  defaultSelection,
  kindLabel,
  orderActivities,
  rewardStatus,
  timeLeft,
} from './activity';

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
    // 结算中还没寄出：待邮寄（backlog 148-1）；结束后没领的已经寄出
    expect(rewardStatus(r(true, null), 'settling')).toBe('pending');
    expect(rewardStatus(r(true, null), 'ended')).toBe('mail');
    expect(rewardStatus(r(false, null), 'ended')).toBe('missed');
  });
});

describe('活动条（问题记录 226）', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const a = (p: Record<string, unknown>) =>
    ({
      id: 1,
      kind: 'pass',
      def: {},
      state: 'running',
      endsAt: '2026-10-03T00:00:00Z',
      exchangeUntil: null,
      claimable: 0,
      ...p,
    }) as never;
  it('类型名：全是签到的目标清单叫签到，其他按类型', () => {
    expect(kindLabel(a({ kind: 'goals', def: { goals: [{ key: 'signin' }] } }))).toBe('签到');
    expect(kindLabel(a({ kind: 'goals', def: { goals: [{ key: 'signin' }, { key: 'market.buy' }] } }))).toBe(
      '目标',
    );
    expect(kindLabel(a({ kind: 'coop' }))).toBe('合力');
    expect(kindLabel(a({ kind: 'exchange' }))).toBe('兑换');
  });
  it('状态：进行中写剩余时间；结束后兑换期内写兑换期；结算中；已结束', () => {
    expect(activityStatus(a({}), now)).toBe('还剩 2 天 0 小时');
    expect(
      activityStatus(a({ state: 'ended', kind: 'exchange', exchangeUntil: '2026-10-01T05:00:00Z' }), now),
    ).toBe('兑换期 还剩 5 小时');
    expect(activityStatus(a({ state: 'settling' }), now)).toBe('结算中');
    expect(activityStatus(a({ state: 'ended', exchangeUntil: '2026-09-30T00:00:00Z' }), now)).toBe('已结束');
  });
  it('排序：进行中在前，然后兑换期，最后结算中和已结束；同组保持原顺序', () => {
    const items = [
      a({ id: 1, state: 'ended' }),
      a({ id: 2, state: 'ended', exchangeUntil: '2026-10-02T00:00:00Z' }),
      a({ id: 3 }),
      a({ id: 4, state: 'settling' }),
      a({ id: 5 }),
    ];
    expect(orderActivities(items, now).map((x: { id: number }) => x.id)).toEqual([3, 5, 2, 1, 4]);
  });
  it('默认选中：第一个有奖可领的，没有就第一个进行中的，都没有就第一个', () => {
    expect(defaultSelection([a({ id: 1 }), a({ id: 2, claimable: 1 })])).toBe(2);
    expect(defaultSelection([a({ id: 1, state: 'ended' }), a({ id: 2 })])).toBe(2);
    expect(defaultSelection([a({ id: 7, state: 'ended' })])).toBe(7);
    expect(defaultSelection([])).toBeNull();
  });
});
