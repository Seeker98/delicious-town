import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import GuideView from './GuideView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { guideCodes: vi.fn(), redeem: vi.fn(), catalog: vi.fn(() => new Promise(() => {})) },
}));

const me = (restaurantId: number | null) => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  role: 'player' as const,
  shardId: 1,
  restaurantId,
});
const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: GuideView }],
  });
  const w = mount(GuideView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('GuideView（问题记录 150）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.guideCodes).mockReset();
    vi.mocked(endpoints.redeem).mockReset();
  });

  it('五块内容都在', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    const w = await mountView();
    for (const k of ['codes', 'start', 'daily', 'faq', 'rules'])
      expect(w.find(`[data-testid="guide-${k}"]`).exists()).toBe(true);
  });

  it('没开店：不请求新手码，提示开店后可以领（Review Focus 3）', async () => {
    useSessionStore().me = me(null);
    const w = await mountView();
    expect(endpoints.guideCodes).not.toHaveBeenCalled();
    expect(w.text()).toContain('开店后可以领');
  });

  it('四种状态：可领有按钮，点了领取并刷新；其他显示文字', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([
      { code: 'XINSHOU', minLevel: 1, items: { coin: 50000 }, state: 'ok' },
      { code: 'XINSHOU10', minLevel: 10, items: { coin: 1 }, state: 'level' },
      { code: 'OLD', minLevel: 1, items: { coin: 1 }, state: 'used' },
      { code: 'GONE', minLevel: 1, items: { coin: 1 }, state: 'off' },
    ]);
    vi.mocked(endpoints.redeem).mockResolvedValue({ code: 'XINSHOU', items: { coin: 50000 } });
    const w = await mountView();
    expect(w.text()).toContain('10 级可领');
    expect(w.text()).toContain('已领');
    expect(w.text()).toContain('已结束');
    expect(w.find('[data-testid="guide-redeem-XINSHOU10"]').exists()).toBe(false);
    await w.find('[data-testid="guide-redeem-XINSHOU"]').trigger('click');
    await flushPromises();
    expect(endpoints.redeem).toHaveBeenCalledWith('XINSHOU');
    expect(endpoints.guideCodes).toHaveBeenCalledTimes(2);
  });
});
