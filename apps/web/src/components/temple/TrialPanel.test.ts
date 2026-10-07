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
    // 主料槽默认选中；点一个食材填进主料，自动换到辅料槽（问题记录 487）
    expect(w.get('[data-testid="trial-slot-main"]').attributes('aria-pressed')).toBe('true');
    await w.get('[data-testid="trial-food-150"]').trigger('click');
    expect(w.get('[data-testid="trial-slot-main"]').text()).toContain('稀有料');
    expect(w.get('[data-testid="trial-slot-sub"]').attributes('aria-pressed')).toBe('true');
    await w.get('[data-testid="trial-food-423"]').trigger('click');
    expect(w.get('[data-testid="trial-slot-sub"]').text()).toContain('普通料');
    expect(w.find('[data-testid="trial-rate"]').text()).toContain('%');
    await w.find('[data-testid="trial-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.trialStart).toHaveBeenCalledWith(150, 423);
    expect(w.find('[data-testid="trial-result"]').text()).toContain('试炼价值 +1%');
  });

  it('食材按等级从高到低分组；比这道菜低的组默认收起、点开能看；搜索时都展开（问题记录 487）', async () => {
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 150, name: '稀有料', level: 5, odds: 70, coin: 1, type: 0 },
        { id: 423, name: '普通料', level: 5, odds: 100, coin: 1, type: 0 },
        { id: 31, name: '三级料', level: 3, odds: 100, coin: 1, type: 0 },
        { id: 21, name: '二级料', level: 2, odds: 100, coin: 1, type: 0 },
      ],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [{ id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 1, coin: 1, foods: [] }],
    } as never);
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [150, 423, 31, 21].map((foodsId) => ({ foodsId, num: 5, locked: false, streetNeed: 0 })),
    } as never);
    const w = mount(TrialPanel, {
      props: { data: templeData({ trial: { mcId: 3, readyMinutes: 30, creatives: 5 } }) },
    });
    await flushPromises();
    const groups = w.findAll('[data-testid^="trial-group-"]');
    expect(groups.map((g) => g.attributes('data-testid'))).toEqual([
      'trial-group-5',
      'trial-group-3',
      'trial-group-2',
    ]);
    expect(groups[0]!.text()).toContain('5 级 (2 种)');
    expect(w.get('[data-testid="trial-group-3"]').attributes('aria-expanded')).toBe('true');
    expect(w.get('[data-testid="trial-group-2"]').attributes('aria-expanded')).toBe('false');
    expect(w.find('[data-testid="trial-food-21"]').exists()).toBe(false);
    // 稀有的写明
    expect(w.get('[data-testid="trial-food-150"]').text()).toContain('稀有');
    expect(w.get('[data-testid="trial-food-423"]').text()).not.toContain('稀有');
    await w.get('[data-testid="trial-group-2"]').trigger('click');
    expect(w.find('[data-testid="trial-food-21"]').exists()).toBe(true);
    await w.get('[data-testid="trial-group-2"]').trigger('click');
    await w.get('[data-testid="trial-search"]').setValue('二级');
    expect(w.findAll('[data-testid^="trial-food-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'trial-food-21',
    ]);
  });

  it('试炼后重读橱柜：数量跟着变，用光的从主辅里去掉、回到主料槽（终审）', async () => {
    const w = mount(TrialPanel, {
      props: { data: templeData({ trial: { mcId: 3, readyMinutes: 30, creatives: 5 } }) },
    });
    await flushPromises();
    await w.get('[data-testid="trial-food-150"]').trigger('click');
    await w.get('[data-testid="trial-food-423"]').trigger('click');
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [{ foodsId: 423, num: 4, locked: false, streetNeed: 0 }],
    } as never);
    await w.get('[data-testid="trial-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.cupboard).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="trial-food-150"]').exists()).toBe(false);
    expect(w.get('[data-testid="trial-food-423"]').text()).toContain('×4');
    expect(w.get('[data-testid="trial-slot-main"]').text()).toContain('未选');
    expect(w.get('[data-testid="trial-slot-sub"]').text()).toContain('普通料');
    expect(w.get('[data-testid="trial-slot-main"]').attributes('aria-pressed')).toBe('true');
  });

  it('主辅选同一种要 2 个：只有 1 个时，另一个槽里这种灰掉（问题记录 487）', async () => {
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [
        { foodsId: 150, num: 1, locked: false, streetNeed: 0 },
        { foodsId: 423, num: 5, locked: false, streetNeed: 0 },
      ],
    } as never);
    const w = mount(TrialPanel, {
      props: { data: templeData({ trial: { mcId: 3, readyMinutes: 30, creatives: 5 } }) },
    });
    await flushPromises();
    await w.get('[data-testid="trial-food-150"]').trigger('click');
    expect(w.get('[data-testid="trial-food-150"]').attributes('disabled')).toBeDefined();
    // 灰掉了也看得出它是主料
    expect(w.get('[data-testid="trial-food-150"] [data-testid="trial-food-role"]').text()).toBe('主料');
    await w.get('[data-testid="trial-food-423"]').trigger('click');
    await w.get('[data-testid="trial-slot-main"]').trigger('click');
    // 回到主料槽：150 就是主料自己，可以点（换成别的再换回来）
    expect(w.get('[data-testid="trial-food-150"]').attributes('disabled')).toBeUndefined();
  });

  it('有玩法说明，显示试炼对象当前的试炼价值和经验及上限（问题记录：试炼的选项说明不够）', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      learned: [
        {
          mcId: 3,
          curlevel: 2,
          levelName: '入门',
          curexp: 300,
          expNext: 800,
          trialWorth: 4,
          trialExp: 10,
          way: 1,
        },
      ],
    } as never);
    const w = mount(TrialPanel, {
      props: { data: templeData({ trial: { mcId: 3, readyMinutes: 30, creatives: 5 } }) },
    });
    await flushPromises();
    expect(w.find('[data-testid="trial-target"]').text()).toContain('试炼价值 4% / 50%');
    expect(w.find('[data-testid="trial-target"]').text()).toContain('试炼经验 10% / 150%');
    const help = w.find('[data-testid="trial-help"]').text();
    for (const x of ['注射', '冥想', '触手', '稀有', '主料']) expect(help).toContain(x);
  });
});
