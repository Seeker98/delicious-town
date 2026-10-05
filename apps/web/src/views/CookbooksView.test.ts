import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CookbookListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import CookbooksView from './CookbooksView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { cookbookList: vi.fn(), learn: vi.fn(), overview: vi.fn() },
}));

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
    setActivePinia(createPinia());
    vi.mocked(endpoints.overview).mockResolvedValue({ streetId: 0 } as never);
    vi.mocked(endpoints.cookbookList).mockResolvedValue(list);
    vi.mocked(endpoints.learn).mockResolvedValue({ cookbookId: 194, grade: 1, learnType: '0' });
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
      { id: 0, name: '新手街', cookName: '家常菜', desc: '' },
      { id: 1, name: '湖南街', cookName: '湘菜', desc: '' },
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
    expect(endpoints.overview).not.toHaveBeenCalled();
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
        { id: 0, name: '新手街', cookName: '家常菜', desc: '上座率+35%' },
        { id: 3, name: '四川街', cookName: '川菜', desc: '每桌经验+4' },
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
    expect(w.get('[data-testid="street-desc"]').text()).toBe('街道加成：上座率+35%');
    await w.get('select').setValue('3');
    await flushPromises();
    expect(w.get('[data-testid="street-desc"]').text()).toBe('街道加成：每桌经验+4');
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
    expect(endpoints.overview).not.toHaveBeenCalled();
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
});
