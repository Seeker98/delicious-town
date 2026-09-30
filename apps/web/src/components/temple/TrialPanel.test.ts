import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import { templeData } from './testData';
import TrialPanel from './TrialPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    trialPrepare: vi.fn(),
    trialRefresh: vi.fn(),
    trialStart: vi.fn(),
    cupboard: vi.fn(),
    mc: vi.fn(),
    templeMissile: vi.fn(),
  },
}));

describe('TrialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 150, name: '稀有料', level: 5, odds: 70, coin: 1, type: 0 },
        { id: 423, name: '普通料', level: 5, odds: 100, coin: 1, type: 0 },
      ],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [{ id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 1, coin: 1, foods: [] }],
    } as never);
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [
        { foodsId: 150, num: 5, locked: false, streetNeed: 0 },
        { foodsId: 423, num: 5, locked: false, streetNeed: 0 },
      ],
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue({
      learned: [
        {
          mcId: 3,
          curlevel: 1,
          levelName: '初学',
          curexp: 0,
          expNext: 200,
          trialWorth: 0,
          trialExp: 0,
          way: 1,
        },
      ],
    } as never);
    vi.mocked(endpoints.trialPrepare).mockResolvedValue({ mcId: 3 });
    vi.mocked(endpoints.trialStart).mockResolvedValue({
      success: true,
      lucky: false,
      addWorth: 1,
      addExp: 2,
      proficiency: 800,
      curlevel: 3,
    });
  });

  it('没准备时显示注射和冥想；冥想调用 way 2', async () => {
    const w = mount(TrialPanel, { props: { data: templeData() } });
    await flushPromises();
    await w.find('[data-testid="trial-meditate"]').trigger('click');
    await flushPromises();
    expect(endpoints.trialPrepare).toHaveBeenCalledWith(2);
    expect(w.emitted('reload')).toBeTruthy();
  });

  it('准备好后选主辅食材开始试炼，显示预计成功率和结果', async () => {
    const w = mount(TrialPanel, {
      props: { data: templeData({ trial: { mcId: 3, readyMinutes: 30, creatives: 5 } }) },
    });
    await flushPromises();
    expect(w.text()).toContain('秘·凤凰展翅');
    await w.find('[data-testid="trial-main"]').setValue('150');
    await w.find('[data-testid="trial-sub"]').setValue('423');
    expect(w.find('[data-testid="trial-rate"]').text()).toContain('%');
    await w.find('[data-testid="trial-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.trialStart).toHaveBeenCalledWith(150, 423);
    expect(w.find('[data-testid="trial-result"]').text()).toContain('试炼价值 +1%');
  });
});
