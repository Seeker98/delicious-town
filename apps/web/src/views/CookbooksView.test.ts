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
});
