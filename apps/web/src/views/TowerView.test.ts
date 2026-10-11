import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { rankData, shopData, towerData } from '../components/tower/testData';
import TowerView from './TowerView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { tower: vi.fn(), towerRank: vi.fn(), renownShop: vi.fn() },
}));

const stubs = {
  FloorPanel: { template: '<p>floor-panel</p>', props: ['data'] },
  RankPanel: { template: '<p>rank-panel {{ data.myRank }}</p>', props: ['data'] },
  ShopPanel: { template: '<p>shop-panel {{ data.renown }}</p>', props: ['data'] },
};

describe('TowerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.tower).mockResolvedValue(towerData());
    vi.mocked(endpoints.towerRank).mockResolvedValue(rankData({ myRank: 4 }));
    vi.mocked(endpoints.renownShop).mockResolvedValue(shopData());
  });

  it('默认厨塔标签并读取厨塔数据；切到赛厨榜并记住', async () => {
    const w = mount(TowerView, { global: { stubs } });
    await flushPromises();
    // 头图要厨力、名次、声望：进页面三样一起读，各标签用同一份（界面改版 P9）
    expect(endpoints.tower).toHaveBeenCalledTimes(1);
    expect(endpoints.towerRank).toHaveBeenCalledTimes(1);
    expect(endpoints.renownShop).toHaveBeenCalledTimes(1);
    expect(w.get('[data-testid="tower-power"]').text()).toBe('我的厨力 70');
    expect(w.get('[data-testid="tower-rank"]').text()).toBe('赛厨榜 第 4 名');
    expect(w.get('[data-testid="tower-renown"]').text()).toBe('声望 200');
    expect(w.text()).toContain('floor-panel');
    expect(w.get('[data-testid="tab-tower"]').attributes('role')).toBe('tab');
    await w.find('[data-testid="tab-rank"]').trigger('click');
    expect(w.text()).toContain('rank-panel 4');
    expect(localStorage.getItem('dt_tower_tab')).toBe('rank');
    const again = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('rank-panel');
    await again.find('[data-testid="tab-shop"]').trigger('click');
    expect(again.text()).toContain('shop-panel 200');
    // 切标签重读那一页（赛厨榜是抢位的，P9 终审 I5）：第一次进页面各读 1 次、切到赛厨榜再读 1 次；第二次进页面各 1 次、切到商店再读 1 次
    expect(endpoints.towerRank).toHaveBeenCalledTimes(3);
    expect(endpoints.renownShop).toHaveBeenCalledTimes(3);
  });

  it('没上榜时头图写“未上榜”', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue(rankData());
    const w = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(w.get('[data-testid="tower-rank"]').text()).toBe('赛厨榜 未上榜');
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
    vi.mocked(endpoints.towerRank).mockResolvedValue(rankData({ myRank: 2 }));
    await w.find('[data-testid="again"]').trigger('click');
    await flushPromises();
    // 挑战会改名次和声望：头图的三样一起重读
    expect(endpoints.tower).toHaveBeenCalledTimes(2);
    expect(endpoints.towerRank).toHaveBeenCalledTimes(2);
    expect(endpoints.renownShop).toHaveBeenCalledTimes(2);
    expect(w.get('[data-testid="tower-rank"]').text()).toBe('赛厨榜 第 2 名');
  });

  it('赛厨榜、声望商店要求刷新时重新读取', async () => {
    const reloader = (name: string) => ({
      template: `<button data-testid="again-${name}" @click="$emit('reload')">again</button>`,
      props: ['data'],
      emits: ['reload'],
    });
    const w = mount(TowerView, {
      global: { stubs: { ...stubs, RankPanel: reloader('rank'), ShopPanel: reloader('shop') } },
    });
    await flushPromises();
    await w.find('[data-testid="tab-rank"]').trigger('click');
    await flushPromises();
    // 切到赛厨榜重读 1 次，面板要求刷新再读 1 次
    expect(endpoints.towerRank).toHaveBeenCalledTimes(2);
    await w.get('[data-testid="again-rank"]').trigger('click');
    await flushPromises();
    expect(endpoints.towerRank).toHaveBeenCalledTimes(3);
    vi.mocked(endpoints.renownShop).mockResolvedValue(shopData({ renown: 140 }));
    await w.find('[data-testid="tab-shop"]').trigger('click');
    await w.get('[data-testid="again-shop"]').trigger('click');
    await flushPromises();
    // 进页面、刷新全部、切到商店、面板要求刷新：4 次
    expect(endpoints.renownShop).toHaveBeenCalledTimes(4);
    expect(w.get('[data-testid="tower-renown"]').text()).toBe('声望 140');
  });

  it('赛厨榜读不到：写明并能重试（P9 终审 I5）', async () => {
    vi.mocked(endpoints.towerRank).mockRejectedValueOnce(new Error('net'));
    localStorage.setItem('dt_tower_tab', 'rank');
    const w = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(w.get('[data-testid="rank-failed"]').text()).toContain('读取赛厨榜失败');
    await w.get('[data-testid="rank-failed"] button').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="rank-failed"]').exists()).toBe(false);
    expect(w.text()).toContain('rank-panel');
  });
});
