import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import InviteView from './InviteView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { invite: vi.fn() } }));

describe('InviteView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.invite).mockResolvedValue({
      code: 'ABCD2345',
      monthCount: 3,
      monthlyCap: 20,
      invitees: [
        { restName: '小明的店', shardName: '一服', level: 12, verified: true, lv10: 'sent', lv30: null },
        { restName: null, shardName: null, level: null, verified: false, lv10: null, lv30: null },
      ],
    });
  });

  it('显示邀请码、带码的注册链接、本月已计人数和被邀请人进度', async () => {
    const w = mount(InviteView);
    await flushPromises();
    expect(w.find('[data-testid="invite-code"]').text()).toBe('ABCD2345');
    expect(w.find('[data-testid="invite-link"]').text()).toContain('/register?invite=ABCD2345');
    expect(w.text()).toContain('本月已计 3 / 20');
    expect(w.text()).toContain('小明的店');
    expect(w.text()).toContain('10 级奖励已发');
    expect(w.text()).toContain('还没开店');
    expect(w.text()).toContain('还没验证邮箱');
  });

  it('规则文案通顺（问题记录 166）', async () => {
    const w = mount(InviteView);
    await flushPromises();
    expect(w.text()).toContain('好友验证邮箱后, 店铺升到 10 级、再升到 30 级时, 你各得一份奖励');
    expect(w.text()).toContain('每月最多计 20 人');
  });
});
