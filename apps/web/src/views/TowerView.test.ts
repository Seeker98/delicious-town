import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { towerData } from '../components/tower/testData';
import TowerView from './TowerView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { tower: vi.fn() } }));

const stubs = {
  FloorPanel: { template: '<p>floor-panel</p>', props: ['data'] },
  RankPanel: { template: '<p>rank-panel</p>' },
  ShopPanel: { template: '<p>shop-panel</p>' },
};

describe('TowerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.tower).mockResolvedValue(towerData());
  });

  it('默认厨塔标签并读取厨塔数据；切到赛厨榜并记住', async () => {
    const w = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(endpoints.tower).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('floor-panel');
    await w.find('[data-testid="tab-rank"]').trigger('click');
    expect(w.text()).toContain('rank-panel');
    expect(localStorage.getItem('dt_tower_tab')).toBe('rank');
    const again = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('rank-panel');
    await again.find('[data-testid="tab-shop"]').trigger('click');
    expect(again.text()).toContain('shop-panel');
  });

  it('厨塔面板要求刷新时重新读取', async () => {
    const w = mount(TowerView, {
      global: {
        stubs: {
          ...stubs,
          FloorPanel: {
            template: `<button data-testid="again" @click="$emit('reload')">again</button>`,
            props: ['data'],
            emits: ['reload'],
          },
        },
      },
    });
    await flushPromises();
    await w.find('[data-testid="again"]').trigger('click');
    await flushPromises();
    expect(endpoints.tower).toHaveBeenCalledTimes(2);
  });
});
