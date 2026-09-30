import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CookbookListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
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
  allTotal: 2363,
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
    expect(w.find('[data-testid="cookbook-counts"]').text()).toContain('共学会 0 / 2,363 道');
    await w.find('[data-testid="filter-upgradable"]').trigger('click');
    await flushPromises();
    expect(endpoints.cookbookList).toHaveBeenLastCalledWith({ street: 0, page: 1, filter: 'upgradable' });
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
});
