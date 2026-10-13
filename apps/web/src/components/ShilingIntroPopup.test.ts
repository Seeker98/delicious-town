import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
import ShilingIntroPopup from './ShilingIntroPopup.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { shilingIntro: vi.fn() } }));

const mountPopup = async (intro: boolean) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<p />' } }],
  });
  await router.push('/');
  useRestaurantStore().rest = { shilingIntro: intro } as never;
  const w = mount(ShilingIntroPopup, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
};

describe('ShilingIntroPopup（时令说明弹窗，设计图 Sl-E）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.shilingIntro).mockResolvedValue({});
  });

  it('够星没看过才弹；三步说明', async () => {
    expect((await mountPopup(false)).w.find('[data-testid="shiling-intro"]').exists()).toBe(false);
    const { w } = await mountPopup(true);
    const steps = w.findAll('[data-testid="shiling-intro"] li');
    expect(steps.map((x) => x.find('b').text())).toEqual(['看当令', '卖当令的菜', '攒时令值']);
  });

  it('“知道了”关掉并记看过；“去天气页看看”跳到天气页', async () => {
    const a = await mountPopup(true);
    await a.w.get('[data-testid="shiling-intro-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.shilingIntro).toHaveBeenCalledTimes(1);
    expect(a.w.find('[data-testid="shiling-intro"]').exists()).toBe(false);
    const b = await mountPopup(true);
    await b.w.get('[data-testid="shiling-intro-go"]').trigger('click');
    await flushPromises();
    expect(b.router.currentRoute.value.path).toBe('/weather');
  });
});
