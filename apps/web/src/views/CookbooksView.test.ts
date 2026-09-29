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
});
