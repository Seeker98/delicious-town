import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import McView from './McView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    mc: vi.fn(),
    mcPreview: vi.fn(),
    mcCook: vi.fn(),
    mcDump: vi.fn(),
    mcLearn: vi.fn(),
    mcRemnantSell: vi.fn(),
    mcRemnantDecompose: vi.fn(),
  },
}));

const overview: McOverviewDto = {
  star: 1,
  learned: [
    {
      mcId: 1,
      curlevel: 2,
      levelName: '入门',
      curexp: 300,
      expNext: 800,
      trialWorth: 0,
      trialExp: 0,
      way: 1,
    },
  ],
  remnants: [
    { mcId: 3, num: 5 },
    { mcId: 4, num: 2 },
  ],
  current: null,
  recipes: 0,
  tools: [],
  cookies: 2,
  cookNums: [1, 5, 10],
  starBook: false,
};

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: McView }],
  });
  return mount(McView, { global: { plugins: [router] } });
}

describe('McView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 390, name: '海参', level: 4, odds: 1, coin: 1, type: 0 },
        { id: 412, name: '渤海对虾', level: 4, odds: 1, coin: 1, type: 0 },
      ],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 31, coin: 38333, foods: [390, 412] },
        { id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 22, coin: 26944, foods: [] },
        { id: 4, name: '秘·芙蓉大虾', level: 5, road: 1, nutritive: 40, coin: 50278, foods: [] },
      ],
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
  });

  it('已学显示熟练度；烹制面板里食材不够的批数禁用；带饼干烹制后提示品级和份数', async () => {
    vi.mocked(endpoints.mcPreview).mockResolvedValue({
      mcId: 1,
      learned: true,
      cooking: false,
      foods: [
        { foodsId: 390, have: 7 },
        { foodsId: 412, have: 9 },
      ],
      cookNums: [
        { n: 1, ok: true },
        { n: 5, ok: true },
        { n: 10, ok: false },
      ],
      cookies: 2,
    });
    vi.mocked(endpoints.mcCook).mockResolvedValue({
      cook: {
        id: 9,
        mcId: 1,
        grade: 7,
        totalNum: 600,
        leftNum: 600,
        price: 70,
        luck: true,
        eatCount: 0,
        createdAt: '',
      },
      proficiency: 21,
      curlevel: 2,
      levelUp: false,
      bob: true,
      restExp: 0,
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="learned-1"]').text()).toContain('入门');
    await w.find('[data-testid="cook-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="cooknum-10"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="cookie"]').setValue(true);
    // 饼干只有 2 个：5 批也不能选
    expect(w.find('[data-testid="cooknum-5"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="cooknum-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcCook).toHaveBeenCalledWith(1, 1, true);
    const text = useToastStore()
      .items.map((x) => x.text)
      .join('|');
    expect(text).toContain('佳肴（幸运）');
    expect(text).toContain('600 份');
    expect(text).toContain('海绵宝宝');
  });

  it('在售卡片：倒掉要确认', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      current: {
        id: 9,
        mcId: 1,
        grade: 3,
        totalNum: 600,
        leftNum: 120,
        price: 40,
        luck: false,
        eatCount: 1,
        createdAt: '',
      },
    });
    vi.mocked(endpoints.mcDump).mockResolvedValue({} as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="mc-current"]').text()).toContain('120');
    expect(w.find('[data-testid="cook-1"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="dump"]').trigger('click');
    expect(endpoints.mcDump).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="dump"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcDump).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('残卷：不到 3 张不能学；出售数量按输入（不超过持有）', async () => {
    vi.mocked(endpoints.mcRemnantSell).mockResolvedValue({ coin: 1 });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="learn-4"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="learn-3"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="remnant-num-3"]').setValue('9');
    await w.find('[data-testid="sell-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcRemnantSell).toHaveBeenCalledWith(3, 5);
  });
});
