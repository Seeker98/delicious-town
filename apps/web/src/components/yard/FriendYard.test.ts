import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import FriendYard from './FriendYard.vue';
import { friendYardData, plantData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    yardFriend: vi.fn(),
    yardWater: vi.fn(),
    yardWeed: vi.fn(),
    yardDeworm: vi.fn(),
    yardReap: vi.fn(),
  },
}));

async function mountWith(data = friendYardData()) {
  vi.mocked(endpoints.yardFriend).mockResolvedValue(data);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(FriendYard, { props: { restId: 2 }, global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendYard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.yardReap).mockResolvedValue({ foodsId: 101, num: 2, stolen: true, punished: null });
    vi.mocked(endpoints.yardDeworm).mockResolvedValue({ plantId: 7 });
  });

  it('显示好友的菜园；可以偷时点偷菜，提示偷到多少', async () => {
    const w = await mountWith();
    expect(endpoints.yardFriend).toHaveBeenCalledWith(2);
    expect(w.text()).toContain('乙店的菜园');
    const btn = w.find('[data-testid="fland-1"] [data-testid="plant-reap"]');
    expect(btn.text()).toBe('偷菜');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.yardReap).toHaveBeenCalledWith(7);
    expect(useToastStore().items.at(-1)!.text).toContain('偷到');
  });

  it('偷过的显示"已偷"并灰掉；好友作物没有施肥和铲除', async () => {
    const w = await mountWith(
      friendYardData({
        lands: [
          {
            no: 1,
            level: 1,
            plant: { ...plantData({ stage: 4, minutes: 600 }), stolen: true, stealBlock: 'stolen' },
          },
        ],
      }),
    );
    const btn = w.find('[data-testid="fland-1"] [data-testid="plant-reap"]');
    expect(btn.text()).toBe('已偷');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="plant-feed"]').exists()).toBe(false);
    expect(w.find('[data-testid="plant-remove"]').exists()).toBe(false);
  });

  it('有虫时可以帮忙除虫；没开垦时提示', async () => {
    const w = await mountWith(
      friendYardData({
        lands: [
          { no: 1, level: 1, plant: { ...plantData({ worm: 1 }), stolen: false, stealBlock: 'not_ripe' } },
        ],
      }),
    );
    await w.find('[data-testid="fland-1"] [data-testid="plant-deworm"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardDeworm).toHaveBeenCalledWith(7);
    const empty = await mountWith(friendYardData({ lands: [] }));
    expect(empty.find('[data-testid="friend-empty"]').exists()).toBe(true);
  });
});
