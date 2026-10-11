import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import RedeemView from './RedeemView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { redeem: vi.fn(), guideCodes: vi.fn(), catalog: vi.fn(() => new Promise(() => {})) },
}));

const mountView = async () => {
  const w = mount(RedeemView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return w;
};

describe('RedeemView（问题记录 164）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useSessionStore().me = { restaurantId: 1 } as never;
    useRestaurantStore().rest = { disabledFeatures: [] } as never;
    vi.mocked(endpoints.guideCodes).mockResolvedValue([
      { code: 'XINSHOU', minLevel: 1, items: { coin: 50000 }, state: 'ok' },
    ]);
  });

  it('独立的兑换码页：有输入框和说明', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="redeem-input"]').exists()).toBe(true);
    expect(w.text()).toContain('同一个码每家店只能用一次');
  });

  it('兑换码只留这一处：新手兑换码列表、去邀请好友也在这里（界面改版 P2b）', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="guide-redeem-XINSHOU"]').exists()).toBe(true);
    const invite = w.findAllComponents(RouterLinkStub).find((x) => x.props('to') === '/invite');
    expect(invite?.text()).toContain('邀请好友');
  });

  it('区服关了邀请：没有去邀请的入口', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['invite'] } as never;
    const w = await mountView();
    expect(w.findAllComponents(RouterLinkStub).some((x) => x.props('to') === '/invite')).toBe(false);
  });
});
