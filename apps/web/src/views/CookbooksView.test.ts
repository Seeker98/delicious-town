import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CookbookListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import CookbooksView from './CookbooksView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { cookbookList: vi.fn(), learn: vi.fn(), overview: vi.fn(), starNeed: vi.fn() },
}));

/** 下一星要学会 need 道菜（问题记录 378 后续的搬街提示用） */
const starNeed = (need: number) =>
  ({
    star: 1,
    nextStar: 2,
    available: true,
    checks: [{ key: 'cookbooks', need, have: 0, ok: false }],
    award: null,
    ok: false,
  }) as never;

const list: CookbookListDto = {
  street: 0,
  page: 1,
  pageSize: 40,
  total: 2,
  learned: 0,
  streetLearned: 0,
  streetTotal: 72,
  allTotal: 2331,
  gradeCounts: Array(11).fill(0),
  items: [
    { id: 194, name: '葡萄薏仁羹', grade: 0, learn: '0', next: [{ foodsId: 302, num: 1, have: 1 }] },
    { id: 439, name: '另一道菜', grade: 0, learn: 'z', next: [{ foodsId: 101, num: 1, have: 0 }] },
  ],
};

describe('CookbooksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(endpoints.overview).mockResolvedValue({ streetId: 0 } as never);
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed(15));
    vi.mocked(endpoints.cookbookList).mockResolvedValue(list);
    vi.mocked(endpoints.learn).mockResolvedValue({ cookbookId: 194, grade: 1, learnType: '0' });
  });

  it('记着本店时按记着的街道马上读列表，不等餐厅回来（性能排查 2026-10-08：原来多一轮往返）', async () => {
    useRestaurantStore().rest = { id: 1, streetId: 1, starLevel: 0 } as never;
    vi.mocked(endpoints.overview).mockReturnValue(new Promise(() => undefined));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenCalledWith({ street: 1, page: 1, filter: 'all' });
  });

  it('记着的街道过时了（别处搬了街）：餐厅读回来后换到新的街', async () => {
    useRestaurantStore().rest = { id: 1, streetId: 1, starLevel: 0 } as never;
    vi.mocked(endpoints.overview).mockResolvedValue({ id: 1, streetId: 2, starLevel: 0 } as never);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 2, page: 1, filter: 'all' });
  });

  it('可学的食谱能点"学习"，学完刷新列表；不能学的按钮禁用', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: CookbooksView },
        { path: '/cookbooks/:id', component: CookbooksView },
      ],
    });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="learn-439"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="learn-194"]').trigger('click');
    await flushPromises();
    expect(endpoints.learn).toHaveBeenCalledWith(194);
    expect(endpoints.cookbookList).toHaveBeenCalledTimes(2);
  });

  it('显示全部食谱总数；"可升级"筛选按 upgradable 查（问题记录）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="cookbook-counts"]').text()).toContain('共学会 0 / 2,331 道');
    // 进度一览入口（问题记录：食谱页加进度一览）
    expect(w.find('[data-testid="progress-link"]').attributes('href')).toMatch(/^\/cookbooks\/progress/);
    await w.find('[data-testid="filter-upgradable"]').trigger('click');
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 1, filter: 'upgradable' });
  });
  it('筛选按钮是一排能换行的独立按钮，不是按钮组（问题记录 304：英法西文下超出手机屏幕）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    const box = w.get('[data-testid="cookbook-filters"]');
    expect(box.classes()).toContain('flex-wrap');
    expect(w.find('.btn-group').exists()).toBe(false);
    expect(box.findAll('button')).toHaveLength(5);
  });

  it('别的街的菜：按钮写"搬到 X 才能学"并禁用（问题记录 312）', async () => {
    useCatalogStore().streets = [
      { id: 0, name: '新手街', cookName: '家常菜', desc: '', theme: '', focus: null },
      { id: 1, name: '湖南街', cookName: '湘菜', desc: '', theme: '', focus: null },
    ];
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 1,
      items: [
        { id: 176, name: '剁椒鱼头', grade: 1, learn: 'street', next: [{ foodsId: 302, num: 1, have: 9 }] },
      ],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    const btn = w.get('[data-testid="cb-176"] button');
    expect(btn.text()).toBe('搬到湖南街才能学');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('紧凑卡片：菜名、品级、食材在左两行，按钮在右（问题记录：信息密度低）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    const card = w.find('[data-testid="cb-194"]');
    expect(card.classes()).toContain('dt-cb');
    expect(card.find('.dt-cb-foods').text()).toContain('1/1');
    expect(card.find('[data-testid="learn-194"]').classes()).toContain('dt-btn-xs');
  });

  it('食材行可以折行，缺料项不会被截掉（审查）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: CookbooksView }],
    });
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="cb-194"] .dt-cb-foods').classes()).not.toContain('text-truncate');
  });

  it('菜名按目录取当前语言；目录里没有时用服务端给的（问题记录 272）', async () => {
    const data = {
      tasks: [],
      chapters: [],
      questLines: [],
      activation: [],
      bless: [],
      tower: [],
      formulas: [],
      kujiThemes: [],
      proficiency: [],
    };
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      data: { ...data, cookbooks: [{ id: 194, name: "Grape and Job's Tears Soup" }] },
    });
    const w = mount(CookbooksView, {
      global: {
        plugins: [
          createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/:p(.*)*', component: CookbooksView }],
          }),
        ],
      },
    });
    await flushPromises();
    expect(w.text()).toContain("Grape and Job's Tears Soup");
    expect(w.text()).toContain('另一道菜');
  });

  it('街道、筛选、页码写进地址，从食谱详情返回时恢复（问题记录 372）', async () => {
    vi.mocked(endpoints.cookbookList).mockResolvedValue({ ...list, total: 100 });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/cookbooks', component: CookbooksView },
        { path: '/cookbooks/:id', component: CookbooksView },
      ],
    });
    await router.push('/cookbooks');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    await w.find('[data-testid="filter-learnable"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="next-page"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ street: '0', filter: 'learnable', page: '2' });
    w.unmount();

    // 详情页返回：地址带着原来的查询参数，重新挂载后按它读，不回到本店街道的第一页
    vi.mocked(endpoints.cookbookList).mockClear();
    vi.mocked(endpoints.overview).mockClear();
    await router.push('/cookbooks?street=3&filter=learnable&page=2');
    mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenCalledTimes(1);
    expect(endpoints.cookbookList).toHaveBeenCalledWith({ street: 3, page: 2, filter: 'learnable' });
  });

  it('选中的街道下面写街道简介，换街道跟着换（问题记录 380）', async () => {
    const data = {
      tasks: [],
      chapters: [],
      questLines: [],
      activation: [],
      bless: [],
      tower: [],
      formulas: [],
      kujiThemes: [],
      proficiency: [],
      cookbooks: [],
    };
    useCatalogStore().apply({
      version: 'v:zh',
      goods: [],
      foods: [],
      streets: [
        { id: 0, name: '新手街', cookName: '家常菜', desc: '上座率+35%', theme: '', focus: null },
        {
          id: 3,
          name: '四川街',
          cookName: '川菜',
          desc: '每桌经验+4',
          theme: '川菜麻辣讲究火候',
          focus: 'exp',
        },
      ],
      weather: [],
      devices: [],
      data,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.get('[data-testid="street-desc"]').text()).toBe('街道加成: 上座率+35%');
    expect(w.find('[data-testid="street-focus"]').exists()).toBe(false);
    await w.get('select').setValue('3');
    await flushPromises();
    expect(w.get('[data-testid="street-desc"]').text()).toBe('街道加成: 每桌经验+4');
    // 街道类型和为什么是这个加成（问题记录 380、378 方案 C）；新手街没有类型
    expect(w.get('[data-testid="street-focus"]').text()).toBe('经验街');
    expect(w.get('[data-testid="street-theme"]').text()).toBe('川菜麻辣讲究火候');
  });

  it('恢复的页码超过现在的总页数（学完最后一道菜再返回）：退到最后一页，不留空页', async () => {
    vi.mocked(endpoints.cookbookList).mockImplementation(async (q) => ({
      ...list,
      page: q.page,
      total: 41,
      items: q.page > 2 ? [] : list.items,
    }));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks?street=0&filter=learnable&page=3');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 2, filter: 'learnable' });
    expect(w.find('[data-testid="cb-194"]').exists()).toBe(true);
    expect(router.currentRoute.value.query.page).toBe('2');
    w.unmount();
  });

  it('地址里是 0 号街（新手街）时停在 0 号街，不换成本店街道', async () => {
    vi.mocked(endpoints.overview).mockClear();
    vi.mocked(endpoints.overview).mockResolvedValue({ streetId: 5 } as never);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks?street=0');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 1, filter: 'all' });
    w.unmount();
  });

  it('地址里的参数不合法时按默认：本店街道、全部、第一页', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks?street=x&filter=nope&page=-3');
    vi.mocked(endpoints.overview).mockResolvedValue({ streetId: 5 } as never);
    mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 5, page: 1, filter: 'all' });
  });

  it('本街剩下的菜全学会也凑不够下一星：提示去搬家，带搬家页链接；看别的街时不提示（问题记录 378 后续）', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed(100));
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 0,
      streetTotal: 69,
      streetLearned: 30,
      learned: 30,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/cookbooks', component: CookbooksView },
        { path: '/society/move', component: CookbooksView },
      ],
    });
    await router.push('/cookbooks');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    const hint = w.get('[data-testid="move-hint"]');
    expect(hint.text()).toContain('还差 31 道');
    expect(hint.get('a').attributes('href')).toBe('/society/move');
    w.unmount();

    await router.push('/cookbooks?street=3');
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 3,
      streetTotal: 69,
      streetLearned: 30,
      learned: 30,
    });
    const other = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(other.find('[data-testid="move-hint"]').exists()).toBe(false);
  });

  it('停在别的街第 2 页时点底部导航（地址被清空）：回到本店街道第 1 页（backlog 第 ⑧ 批）', async () => {
    vi.mocked(endpoints.cookbookList).mockResolvedValue({ ...list, total: 100 });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks?street=3&filter=learned&page=2');
    mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 3, page: 2, filter: 'learned' });
    await router.push('/cookbooks');
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 1, filter: 'all' });
    expect(router.currentRoute.value.query.street).toBe('0');
  });

  it('看别的街时不请求下一星要求；回到本店街道才请求，且只请求一次（backlog 384）', async () => {
    vi.mocked(endpoints.starNeed).mockClear();
    vi.mocked(endpoints.cookbookList).mockImplementation(async (q) => ({ ...list, street: q.street }));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks?street=3');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.starNeed).not.toHaveBeenCalled();
    // 点底部导航回到本店街道
    await router.push('/cookbooks');
    await flushPromises();
    expect(w.find('select').exists()).toBe(true);
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 1, filter: 'all' });
    expect(endpoints.starNeed).toHaveBeenCalledTimes(1);
    // 列表按别的条件重读：不再请求
    await router.push('/cookbooks?street=0&filter=learned');
    await flushPromises();
    expect(endpoints.starNeed).toHaveBeenCalledTimes(1);
  });

  it('从食谱详情回到本店街道（页面重新挂载）不再请求下一星要求；升星后才重读（backlog 384 审查）', async () => {
    vi.mocked(endpoints.starNeed).mockClear();
    vi.mocked(endpoints.overview).mockResolvedValue({ id: 7, streetId: 0, starLevel: 2 } as never);
    vi.mocked(endpoints.cookbookList).mockImplementation(async (q) => ({ ...list, street: q.street }));
    const open = async () => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/cookbooks', component: CookbooksView }],
      });
      await router.push('/cookbooks');
      const w = mount(CookbooksView, { global: { plugins: [router] } });
      await flushPromises();
      return w;
    };
    (await open()).unmount();
    expect(endpoints.starNeed).toHaveBeenCalledTimes(1);
    (await open()).unmount();
    expect(endpoints.starNeed).toHaveBeenCalledTimes(1);
    // 升了一星：要求变了，重读
    vi.mocked(endpoints.overview).mockResolvedValue({ id: 7, streetId: 0, starLevel: 3 } as never);
    (await open()).unmount();
    expect(endpoints.starNeed).toHaveBeenCalledTimes(2);
  });

  it('搬街提示能关掉，记住到下一星（backlog 384：休闲玩家会挂好几周）', async () => {
    localStorage.clear();
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 0,
      streetTotal: 69,
      streetLearned: 30,
      learned: 30,
    });
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed(100));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks');
    const mountIt = async () => {
      const w = mount(CookbooksView, { global: { plugins: [router] } });
      await flushPromises();
      return w;
    };
    const w = await mountIt();
    await w.get('[data-testid="move-hint-close"]').trigger('click');
    expect(w.find('[data-testid="move-hint"]').exists()).toBe(false);
    w.unmount();
    expect((await mountIt()).find('[data-testid="move-hint"]').exists()).toBe(false);
    // 升了一星（餐厅的星级跟着变）、下一星的要求变了，再提示
    vi.mocked(endpoints.overview).mockResolvedValue({ streetId: 0, starLevel: 2 } as never);
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      ...(starNeed(200) as object),
      star: 2,
      nextStar: 3,
    } as never);
    expect((await mountIt()).find('[data-testid="move-hint"]').exists()).toBe(true);
  });

  it('地址带着本店街道、餐厅还没读过：也读一次餐厅，照样提示；数字带千分位', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed(1000));
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 0,
      streetTotal: 69,
      streetLearned: 30,
      learned: 30,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks?street=0');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 1, filter: 'all' });
    expect(w.get('[data-testid="move-hint"]').text()).toContain('1,000 道 (还差 931 道)');
  });

  it('读不到升星条件、下一星没开放（泛紫）、已经满星：都不提示', async () => {
    const mountAt = async () => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/cookbooks', component: CookbooksView }],
      });
      await router.push('/cookbooks');
      const w = mount(CookbooksView, { global: { plugins: [router] } });
      await flushPromises();
      return w;
    };
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 0,
      streetTotal: 69,
      streetLearned: 30,
      learned: 30,
    });
    vi.mocked(endpoints.starNeed).mockRejectedValue(new Error('boom'));
    expect((await mountAt()).find('[data-testid="move-hint"]').exists()).toBe(false);
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      ...(starNeed(100) as object),
      available: false,
    } as never);
    expect((await mountAt()).find('[data-testid="move-hint"]').exists()).toBe(false);
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      ...(starNeed(100) as object),
      nextStar: null,
    } as never);
    expect((await mountAt()).find('[data-testid="move-hint"]').exists()).toBe(false);
  });

  it('本街的菜够下一星：不提示', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed(100));
    vi.mocked(endpoints.cookbookList).mockResolvedValue({
      ...list,
      street: 0,
      streetTotal: 333,
      streetLearned: 10,
      learned: 10,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cookbooks', component: CookbooksView }],
    });
    await router.push('/cookbooks');
    const w = mount(CookbooksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="move-hint"]').exists()).toBe(false);
  });
});
