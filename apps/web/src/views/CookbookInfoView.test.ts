import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CookbookDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import CookbookInfoView from './CookbookInfoView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { cookbookDetail: vi.fn(), learn: vi.fn() } }));

const detail: CookbookDetailDto = {
  id: 194,
  name: '葡萄薏仁羹',
  streetId: 0,
  streetName: '新手街',
  taste: [1],
  coin: 30,
  level: 1,
  desc: '',
  grade: 1,
  learn: '0',
  grades: [
    { grade: 1, name: '普通', foods: [{ foodsId: 302, num: 1, have: 1 }] },
    {
      grade: 2,
      name: '中品',
      foods: [
        { foodsId: 302, num: 2, have: 1 },
        { foodsId: 101, num: 1, have: 1 },
      ],
    },
  ],
};

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cookbooks/:id', component: CookbookInfoView }],
  });
  await router.push('/cookbooks/194');
  const w = mount(CookbookInfoView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('食谱详情（界面改版 P4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().foodsMap = new Map([
      [302, { id: 302, name: '葡萄', level: 2, odds: 70, coin: 1, type: 2, art: 'fruit' }],
      [101, { id: 101, name: '大米', level: 1, odds: 70, coin: 1, type: 2, art: 'grain' }],
    ]);
    vi.mocked(endpoints.cookbookDetail).mockResolvedValue(structuredClone(detail));
  });

  it('每个品级一行，在一张卡片里；食材前面是食材图，缺的标红', async () => {
    const w = await mountView();
    const rows = w.findAll('[data-testid^="grade-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.element.closest('.dt-card')).not.toBeNull();
    const need = rows[1]!.findAll('.dt-need');
    expect(need[0]!.get('use').attributes('href')).toContain('#food-fruit');
    // 界面改版 P7：缺的是红底小块
    expect(need[0]!.classes()).toContain('is-miss');
    expect(need[1]!.classes()).not.toContain('is-miss');
    expect(need[0]!.text()).toContain('有 1');
  });

  it('食材一样、学没学到也一样的相邻品级并成一行，写“普通~中品”（界面改版 P7）', async () => {
    const same = structuredClone(detail);
    same.grade = 0;
    same.grades[1]!.foods = [{ foodsId: 302, num: 1, have: 1 }];
    vi.mocked(endpoints.cookbookDetail).mockResolvedValue(same);
    const w = await mountView();
    const rows = w.findAll('[data-testid^="grade-"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.get('.dt-grade-name').text()).toBe('普通~中品');
  });

  it('已经学到的品级标出来（原来是绿色表格行）', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="grade-1"]').classes()).toContain('is-done');
    expect(w.get('[data-testid="grade-2"]').classes()).not.toContain('is-done');
    expect(w.find('.table-success').exists()).toBe(false);
  });

  it('没读回来时是骨架行', async () => {
    vi.mocked(endpoints.cookbookDetail).mockReturnValue(new Promise(() => undefined));
    const w = await mountView();
    expect(w.find('[data-testid="cookbook-skeleton"]').exists()).toBe(true);
  });

  it('读取失败时写读取失败，不一直显示骨架行', async () => {
    vi.mocked(endpoints.cookbookDetail).mockRejectedValue(new Error('x'));
    const w = await mountView();
    expect(w.find('[data-testid="cookbook-skeleton"]').exists()).toBe(false);
    expect(w.get('[data-testid="cookbook-failed"]').text()).toContain('读取食谱失败');
  });
});
