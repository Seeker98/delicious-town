import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import InviteView from './InviteView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { invite: vi.fn() } }));

const mountView = async () => {
  const w = mount(InviteView);
  await flushPromises();
  return w;
};
/** 三格规则（界面改版 P11）：每格左边写什么时候、右边写得到什么 */
const steps = (w: Awaited<ReturnType<typeof mountView>>) =>
  w.findAll('.dt-invite-steps .dt-sum').map((x) => x.text());

describe('InviteView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.invite).mockResolvedValue({
      code: 'ABCD2345',
      monthCount: 3,
      monthlyCap: 20,
      levels: { lv10: 10, lv30: 30 },
      invitees: [
        {
          restName: '小明的店',
          shardName: '一服',
          level: 12,
          avatar: 3,
          verified: true,
          lv10: 'sent',
          lv30: null,
        },
        {
          restName: '小红的店',
          shardName: '二服',
          level: 31,
          avatar: null,
          verified: true,
          lv10: 'sent',
          lv30: 'pending',
        },
        {
          restName: null,
          shardName: null,
          level: null,
          avatar: null,
          verified: false,
          lv10: null,
          lv30: null,
        },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('显示邀请码、带码的注册链接、本月已计人数和进度条', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="invite-code"]').text()).toBe('ABCD2345');
    expect(w.find('[data-testid="invite-link"]').text()).toContain('/register?invite=ABCD2345');
    const month = w.get('.dt-invite-month-head');
    expect(month.text()).toContain('本月已计');
    expect(month.text()).toContain('3 / 20');
    // 3 / 20 = 15%
    expect(w.get('.dt-meter i').attributes('style')).toContain('width: 15%');
  });

  it('好友一行一个：店名和等级，下面写区服和两档奖励的状态；没开店、没验证邮箱也写明', async () => {
    const w = await mountView();
    const rows = w.findAll('[data-testid="invitee"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain('小明的店');
    expect(rows[0]!.text()).toContain('12 级');
    expect(rows[0]!.text()).toContain('一服');
    expect(rows[0]!.get('.dt-invite-st.is-ok').text()).toBe('10 级奖励已发');
    expect(rows[1]!.get('.dt-invite-st.is-warn').text()).toContain('30 级奖励待发');
    expect(rows[2]!.text()).toContain('还没开店');
    expect(rows[2]!.get('.dt-invite-st.is-bad').text()).toBe('还没验证邮箱');
    expect(w.get('.dt-block-note').text()).toBe('3 人');
  });

  it('规则文案通顺（问题记录 166）：拆成三格，下面一行写验证邮箱和每月上限', async () => {
    const w = await mountView();
    expect(steps(w)).toEqual(['好友开店新手礼包', '好友 10 级你得一份', '好友 30 级再得一份']);
    expect(w.text()).toContain('好友要先验证邮箱才计数, 每月最多计 20 人');
  });

  it('两档等级按接口给的写（区服改了等级时说明跟着变，backlog 1010）', async () => {
    vi.mocked(endpoints.invite).mockResolvedValue({
      code: 'ABCD2345',
      monthCount: 0,
      monthlyCap: 20,
      levels: { lv10: 8, lv30: 25 },
      invitees: [
        {
          restName: '小明的店',
          shardName: '一服',
          level: 9,
          avatar: null,
          verified: true,
          lv10: 'sent',
          lv30: null,
        },
      ],
    });
    const w = await mountView();
    expect(steps(w)).toEqual(['好友开店新手礼包', '好友 8 级你得一份', '好友 25 级再得一份']);
    expect(w.text()).toContain('8 级奖励已发');
  });

  it('一个好友都没有：写“还没有邀请到好友”', async () => {
    vi.mocked(endpoints.invite).mockResolvedValue({
      code: 'ABCD2345',
      monthCount: 0,
      monthlyCap: 20,
      levels: { lv10: 10, lv30: 30 },
      invitees: [],
    });
    const w = await mountView();
    expect(w.find('[data-testid="invitee"]').exists()).toBe(false);
    expect(w.text()).toContain('还没有邀请到好友');
  });

  it('复制邀请码、注册链接：按钮上写“已复制”，2 秒后变回去', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const w = await mountView();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await w.get('[data-testid="copy-code"]').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenLastCalledWith('ABCD2345');
    expect(w.get('[data-testid="copy-code"]').text()).toBe('已复制');
    expect(w.get('[data-testid="copy-link"]').text()).toBe('复制注册链接');
    await w.get('[data-testid="copy-link"]').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('/register?invite=ABCD2345'));
    expect(w.get('[data-testid="copy-code"]').text()).toBe('复制邀请码');
    expect(w.get('[data-testid="copy-link"]').text()).toBe('已复制');
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(w.get('[data-testid="copy-link"]').text()).toBe('复制注册链接');
  });

  it('复制失败：提示手动复制', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const w = await mountView();
    await w.get('[data-testid="copy-code"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toBe('复制失败, 请手动选中复制');
    expect(w.get('[data-testid="copy-code"]').text()).toBe('复制邀请码');
  });
});
