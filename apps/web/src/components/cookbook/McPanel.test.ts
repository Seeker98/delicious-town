import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { McOverviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import McPanel from './McPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    mc: vi.fn(),
    mcExchange: vi.fn(),
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
  fragments: [0, 0, 0, 0, 0, 0],
  fragmentPerRemnant: 3,
  recipes: 0,
  tools: [],
  cookies: 2,
  cookNums: [1, 5, 10],
  starBook: false,
  season: {
    open: true,
    minStar: 1,
    weatherId: 11,
    roads: [1, 2],
    until: '2026-10-12T09:00:00.000Z',
    next: { at: '2026-10-12T09:00:00.000Z', type: 2, p: 0.58 },
  },
};

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: McPanel }],
  });
  // 烹制面板用 Teleport：测试里原地渲染
  return mount(McPanel, { global: { plugins: [router], stubs: { teleport: true } } });
}

describe('McPanel', () => {
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
        {
          id: 1,
          name: '秘·仿膳饽饽',
          level: 4,
          road: 1,
          nutritive: 31,
          coin: 38333,
          foods: [390, 412],
          appraisable: true,
        },
        {
          id: 3,
          name: '秘·凤凰展翅',
          level: 3,
          road: 1,
          nutritive: 22,
          coin: 26944,
          foods: [],
          appraisable: true,
        },
        { id: 4, name: '秘·芙蓉大虾', level: 5, road: 1, nutritive: 40, coin: 50278, foods: [] },
        {
          id: 5,
          name: '秘·宫保鸡丁',
          level: 3,
          road: 2,
          nutritive: 20,
          coin: 1,
          foods: [],
          appraisable: true,
        },
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
        shiling: false,
        shilingPts: 0,
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
    // 菜名后面等级、道是小标签（界面改版 P7；原来是一段灰字，问题记录：要有间隔）
    expect(w.find('[data-testid="learned-1"] .dt-row-title .dt-tag').exists()).toBe(true);
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
    expect(text).toContain('佳肴 (幸运)');
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
        shiling: false,
        shilingPts: 0,
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
    expect(w.find('[data-testid="mc-current"]').text()).toContain('卖给顾客时 ×3.2 (普通顾客付一半)');
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
    expect(w.find('[data-testid="mc-level-all"]').text()).toBe('全部 (4)');
    expect(w.find('[data-testid="mc-level-3"]').text()).toBe('3 级 (2)');
    expect(w.find('[data-testid="mc-level-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="mc-road"] option[value="1"]').text()).toBe('一道 (3)');
    await w.find('[data-testid="mc-level-3"]').trigger('click');
    expect(w.find('[data-testid="mc-level-3"]').attributes('aria-pressed')).toBe('true');
    // 筛选按视觉规范用小号胶囊（问题记录 471），选中的加 active，不用按钮组
    const lv3 = w.get('[data-testid="mc-level-3"]');
    expect(lv3.classes()).toContain('active');
    expect(lv3.classes()).not.toContain('btn');
    expect(lv3.element.closest('.dt-pills')).not.toBeNull();
    expect(w.get('[data-testid="mc-road"]').element.closest('.dt-pills')).not.toBeNull();
    // 选了 3 级以后道的数也跟着变
    expect(w.find('[data-testid="mc-road"] option[value="1"]').text()).toBe('一道 (1)');
    // 已学一栏这一页没有：标题写 0 / 2，并写明这一页没有
    expect(ids(w, 'learned')).toEqual([]);
    expect(w.text()).toContain('已学 (0 / 2)');
    expect(w.find('[data-testid="mc-learned-none"]').text()).toBe('这一页没有');
    expect(ids(w, 'remnant-num')).toEqual(['remnant-num-3', 'remnant-num-5']);
    expect(w.find('[data-testid="learn-all"]').text()).toBe('全部学会');
    await w.get('[data-testid="mc-road"]').setValue('2');
    expect(ids(w, 'remnant-num')).toEqual(['remnant-num-5']);
    // “全部学会”会学别的页的，按钮上写明总数
    expect(w.find('[data-testid="learn-all"]').text()).toBe('全部学会 (含其他页, 共 2 道)');
  });

  it('选择记在本机，重新进页面还在；存的值不对时回到全部', async () => {
    tabbed();
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="mc-level-3"]').trigger('click');
    await w.get('[data-testid="mc-road"]').setValue('2');
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

  it('碎片兑换指定残卷（问题记录 415）：同级碎片够了能选一道还没学会、能鉴定出来的菜换 1 张', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: [{ ...overview.learned[0]!, mcId: 3 }],
      remnants: [],
      fragments: [0, 0, 4, 1, 0, 0],
    });
    vi.mocked(endpoints.mcExchange).mockResolvedValue({ mcId: 5, num: 1 });
    const w = mountView();
    await flushPromises();
    const row = w.find('[data-testid="exchange-3"]');
    expect(row.text()).toContain('3 级碎片 4 张');
    // 3 级里能选的只有没学会的 5 号（3 号已学）
    expect(row.findAll('option').map((x) => x.attributes('value'))).toEqual(['', '5']);
    // 没选时停在“选一道菜”（视觉第三轮：原来是空白）
    expect((row.find('select').element as HTMLSelectElement).value).toBe('');
    expect((row.find('select').element as HTMLSelectElement).selectedIndex).toBe(0);
    await row.find('select').setValue('5');
    await row.find('button').trigger('click');
    await flushPromises();
    expect(endpoints.mcExchange).toHaveBeenCalledWith(5, 1);
    // 4 级只有 1 张，不够 3 张：选了菜按钮也不能点
    await w.find('[data-testid="exchange-4"] select').setValue('1');
    expect(w.find('[data-testid="exchange-4"] button').attributes('disabled')).toBeDefined();
  });

  it('碎片兑换一次可以换几张，最多换到碎片够的张数（backlog 415：碎片多时要点很多下）', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: [{ ...overview.learned[0]!, mcId: 3 }],
      remnants: [],
      fragments: [0, 0, 7, 0, 0, 0],
    });
    vi.mocked(endpoints.mcExchange).mockResolvedValue({ mcId: 5, num: 2 });
    const w = mountView();
    await flushPromises();
    const row = w.find('[data-testid="exchange-3"]');
    const qty = row.find('[data-testid="exchange-num-3"]');
    expect(qty.attributes('max')).toBe('2');
    await row.find('select').setValue('5');
    await qty.setValue(2);
    expect(row.get('[data-testid="exchange-go-3"]').text()).toContain('2');
    await row.get('[data-testid="exchange-go-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcExchange).toHaveBeenCalledWith(5, 2);
  });
});

describe('特色菜套用新控件（界面改版 P4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('残卷数量是步进器；已学、残卷各在一张卡片里', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="remnant-num-3"]').element.closest('.dt-stepper')).not.toBeNull();
    expect(w.get('[data-testid="learned-1"]').element.closest('.dt-card')).not.toBeNull();
    expect(w.get('[data-testid="remnant-num-3"]').element.closest('.dt-card')).not.toBeNull();
  });

  it('没学会、没有残卷时是空状态', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({ ...structuredClone(overview), learned: [], remnants: [] });
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="mc-learned-empty"]').classes()).toContain('dt-empty-state');
    expect(w.get('[data-testid="mc-remnants-empty"]').classes()).toContain('dt-empty-state');
  });

  it('倒掉在售的特色菜走确认面板，标成危险操作', async () => {
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
        shiling: false,
        shilingPts: 0,
        createdAt: '',
      },
    });
    const spy = vi.spyOn(window, 'confirm');
    const store = useConfirmStore();
    store.hosts = 1;
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="dump"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(store.current?.danger).toBe(true);
    store.answer(false);
    await flushPromises();
    expect(endpoints.mcDump).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('特色菜分页（界面改版 P7：249 道一次全列出来整页三万像素高）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('已学每页 12 道，可以翻页', async () => {
    const one = overview.learned[0]!;
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: Array.from({ length: 13 }, (_, i) => ({ ...one, mcId: 100 + i })),
    });
    const w = mountView();
    await flushPromises();
    expect(w.findAll('[data-testid^="learned-"]')).toHaveLength(12);
    expect(w.get('[data-testid="mc-pager"]').text()).toContain('1 / 2');
    await w.get('[data-testid="mc-pager"] button:last-child').trigger('click');
    expect(w.findAll('[data-testid^="learned-"]')).toHaveLength(1);
    expect(w.get('[data-testid="mc-pager"]').text()).toContain('2 / 2');
  });
});

describe('McPanel：时令（天气改版 PR②，设计图 Sl-F~Sl-H）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [{ id: 11, name: '中雨', type: 2 }],
      devices: [],
      mysterious: [
        {
          id: 1,
          name: '秘·仿膳饽饽',
          level: 4,
          road: 1,
          nutritive: 0,
          coin: 0,
          foods: [],
          appraisable: true,
        },
        {
          id: 5,
          name: '秘·宫保鸡丁',
          level: 3,
          road: 3,
          nutritive: 0,
          coin: 0,
          foods: [],
          appraisable: true,
        },
      ],
    } as never);
  });
  const learned = (mcId: number) => ({ ...overview.learned[0]!, mcId });
  const preview = (mcId: number) => ({
    mcId,
    learned: true,
    cooking: false,
    foods: [],
    cookNums: [{ n: 1, ok: true }],
    cookies: 0,
  });

  it('标题旁写现在当令；当令的道在已学里标“当令”；在售的应时菜标应时、写已攒多少', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: [learned(1), learned(5)],
      current: {
        id: 9,
        mcId: 1,
        grade: 3,
        totalNum: 600,
        leftNum: 120,
        price: 40,
        luck: false,
        eatCount: 0,
        createdAt: '',
        shiling: true,
        shilingPts: 58,
      },
    });
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="mc-season-now"]').text()).toBe('现在当令: 一道、二道');
    expect(w.get('[data-testid="season-tag-1"]').text()).toBe('一道 · 当令');
    expect(w.find('[data-testid="season-tag-5"]').exists()).toBe(false);
    expect(w.get('[data-testid="mc-current-shiling"]').text()).toBe('应时');
    expect(w.get('[data-testid="mc-current"]').text()).toContain('已攒时令值 +58');
    expect(w.get('[data-testid="mc-season-note"]').text()).toContain('中途换天, 应时不变');
  });

  it('下锅面板：当令的写现在下锅应时；不当令的写当令的是哪两道、几点换天、预报', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      learned: [learned(1), learned(5)],
    });
    vi.mocked(endpoints.mcPreview).mockImplementation(async (id: number) => preview(id));
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="cook-1"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="cook-season"]').classes()).toContain('is-yes');
    expect(w.get('[data-testid="cook-season"]').text()).toBe(
      '现在下锅应时 · 中雨, 一道当令。整批卖完前顾客吃掉的每份都攒时令值。',
    );
    await w.get('[data-testid="cook-5"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="cook-season"]').text()).toBe(
      '现在下锅不应时 · 三道, 中雨当令的是一道、二道。17 点换天, 预报多半还是雨。',
    );
  });

  it('0 星：不标当令', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      star: 0,
      season: { ...overview.season, open: false },
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="mc-season-now"]').exists()).toBe(false);
    expect(w.find('[data-testid="season-tag-1"]').exists()).toBe(false);
  });
});
