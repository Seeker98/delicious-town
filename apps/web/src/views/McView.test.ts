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
    mcLearnAll: vi.fn(),
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
  saleRate: null,
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
    localStorage.clear();
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
        { id: 5, name: '秘·宫保鸡丁', level: 3, road: 2, nutritive: 20, coin: 1, foods: [] },
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
    // 菜名和等级之间要有间隔（问题记录）
    expect(w.find('[data-testid="learned-1"] b + span').classes()).toContain('ms-1');
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
      saleRate: 3.2,
    });
    vi.mocked(endpoints.mcDump).mockResolvedValue({} as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="mc-current"]').text()).toContain('120');
    // 卖出倍率（问题记录 412）
    expect(w.find('[data-testid="mc-current"]').text()).toContain('卖给顾客时 ×3.2（普通顾客付一半）');
    expect(w.find('[data-testid="cook-1"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="dump"]').trigger('click');
    expect(endpoints.mcDump).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="dump"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcDump).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('残卷分组（问题记录：学习按钮不显眼、能学和不能学的混在一起）：能学的在最上面，差几张的写明还差几张，已学的只能出售分解', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      remnants: [
        { mcId: 1, num: 4 },
        { mcId: 3, num: 5 },
        { mcId: 4, num: 2 },
      ],
    });
    vi.mocked(endpoints.mcRemnantSell).mockResolvedValue({ coin: 1 });
    const w = mountView();
    await flushPromises();
    const learnable = w.find('[data-testid="group-learnable"]');
    expect(learnable.text()).toContain('秘·凤凰展翅');
    expect(learnable.find('[data-testid="learn-3"]').attributes('disabled')).toBeUndefined();
    const short = w.find('[data-testid="group-short"]');
    expect(short.text()).toContain('秘·芙蓉大虾');
    expect(short.text()).toContain('还差 1 张');
    expect(w.find('[data-testid="learn-4"]').exists()).toBe(false);
    const learned = w.find('[data-testid="group-learned"]');
    expect(learned.text()).toContain('秘·仿膳饽饽');
    expect(w.find('[data-testid="learn-1"]').exists()).toBe(false);
    await w.find('[data-testid="remnant-num-3"]').setValue('9');
    await w.find('[data-testid="sell-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcRemnantSell).toHaveBeenCalledWith(3, 5);
  });

  it('全部学会：一次学完能学的，提示学会了哪些', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      remnants: [
        { mcId: 3, num: 5 },
        { mcId: 4, num: 3 },
      ],
    });
    vi.mocked(endpoints.mcLearnAll).mockResolvedValue({ learned: [3, 4] });
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="learn-all"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcLearnAll).toHaveBeenCalled();
    expect(useToastStore().items.some((x) => x.text.includes('学会了 2 道特色菜'))).toBe(true);
  });

  it('已学列表按等级从高到低排', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: [3, 4, 1].map((mcId) => ({ ...overview.learned[0]!, mcId })),
    });
    const w = mountView();
    await flushPromises();
    const ids = w.findAll('[data-testid^="learned-"]').map((x) => x.attributes('data-testid'));
    expect(ids).toEqual(['learned-4', 'learned-1', 'learned-3']);
  });

  const ids = (w: ReturnType<typeof mountView>, prefix: string) =>
    w.findAll(`[data-testid^="${prefix}-"]`).map((x) => x.attributes('data-testid'));
  /** 已学 4、5 级各一道；残卷是两道能学的 3 级（一道、二道） */
  const tabbed = () =>
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: [1, 4].map((mcId) => ({ ...overview.learned[0]!, mcId })),
      remnants: [
        { mcId: 3, num: 3 },
        { mcId: 5, num: 4 },
      ],
    });

  it('按级、按道分页（问题记录 414）：已学和残卷一起筛；每页写几道菜，0 道的页不显示；标出选中的页', async () => {
    tabbed();
    const w = mountView();
    await flushPromises();
    expect(ids(w, 'learned')).toEqual(['learned-4', 'learned-1']);
    expect(w.find('[data-testid="mc-level-all"]').text()).toBe('全部（4）');
    expect(w.find('[data-testid="mc-level-3"]').text()).toBe('3 级（2）');
    expect(w.find('[data-testid="mc-level-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="mc-road-1"]').text()).toBe('一道（3）');
    await w.find('[data-testid="mc-level-3"]').trigger('click');
    expect(w.find('[data-testid="mc-level-3"]').attributes('aria-pressed')).toBe('true');
    // 选了 3 级以后道的数也跟着变
    expect(w.find('[data-testid="mc-road-1"]').text()).toBe('一道（1）');
    // 已学一栏这一页没有：标题写 0 / 2，并写明这一页没有
    expect(ids(w, 'learned')).toEqual([]);
    expect(w.text()).toContain('已学（0 / 2）');
    expect(w.find('[data-testid="mc-learned-none"]').text()).toBe('这一页没有');
    expect(ids(w, 'remnant-num')).toEqual(['remnant-num-3', 'remnant-num-5']);
    expect(w.find('[data-testid="learn-all"]').text()).toBe('全部学会');
    await w.find('[data-testid="mc-road-2"]').trigger('click');
    expect(ids(w, 'remnant-num')).toEqual(['remnant-num-5']);
    // “全部学会”会学别的页的，按钮上写明总数
    expect(w.find('[data-testid="learn-all"]').text()).toBe('全部学会（含其他页，共 2 道）');
  });

  it('选择记在本机，重新进页面还在；存的值不对时回到全部', async () => {
    tabbed();
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="mc-level-3"]').trigger('click');
    await w.find('[data-testid="mc-road-2"]').trigger('click');
    w.unmount();
    const again = mountView();
    await flushPromises();
    expect(ids(again, 'remnant-num')).toEqual(['remnant-num-5']);
    again.unmount();
    localStorage.setItem('dt_mc_filter', '{"level":9,"road":"x"}');
    const bad = mountView();
    await flushPromises();
    expect(bad.find('[data-testid="mc-level-all"]').attributes('aria-pressed')).toBe('true');
    expect(ids(bad, 'learned')).toEqual(['learned-4', 'learned-1']);
  });

  it('没有已学也没有残卷时不显示分页', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({ ...structuredClone(overview), learned: [], remnants: [] });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="mc-filters"]').exists()).toBe(false);
  });
});
