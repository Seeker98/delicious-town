import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CookbookProgressDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import CookbookProgressView from './CookbookProgressView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { cookbookProgress: vi.fn() } }));

const data: CookbookProgressDto = {
  maxGrade: 3,
  street: 1,
  streets: [
    { streetId: 0, total: 60, atLeast: [60, 60, 12] },
    { streetId: 1, total: 150, atLeast: [100, 40, 0] },
  ],
};

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: {} }],
  });
  const w = mount(CookbookProgressView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('食谱进度一览（问题记录：食谱页加进度一览）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().streets = [
      { id: 0, name: '新手街' },
      { id: 1, name: '湖南街' },
    ] as never;
    vi.mocked(endpoints.cookbookProgress).mockResolvedValue(data);
  });

  it('上面按品级列总进度：普通及以上 160 / 210', async () => {
    const w = await mountView();
    const s = w.find('[data-testid="progress-summary"]').text();
    expect(s).toContain('普通');
    expect(s).toContain('160 / 210');
    expect(s).toContain('上品');
    expect(s).toContain('12 / 210');
  });

  it('表格每条街一行加“全部”；未学 = 总数 − 普通及以上；只列开放的品级', async () => {
    const w = await mountView();
    const head = w.findAll('thead th').map((x) => x.text());
    expect(head).toEqual(['街道', '未学', '普通', '中品', '上品']);
    const rows = w.findAll('tbody tr').map((r) => r.findAll('td,th').map((c) => c.text()));
    expect(rows).toEqual([
      ['新手街', '0', '60', '60', '12'],
      ['湖南街', '50', '100', '40', '0'],
      ['全部', '50', '160', '100', '12'],
    ]);
  });

  it('返回食谱带回原来的街和页码（终审）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: {} }],
    });
    await router.push('/cookbooks/progress?street=2&page=3');
    const w = mount(CookbookProgressView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="progress-back"]').attributes('href')).toBe('/cookbooks?street=2&page=3');
  });

  it('当前所在的街高亮；一列学满的格子标绿', async () => {
    const w = await mountView();
    const rows = w.findAll('tbody tr');
    expect(rows[1]!.classes()).toContain('table-active');
    expect(rows[0]!.findAll('td')[1]!.classes()).toContain('text-success');
    expect(rows[0]!.findAll('td')[3]!.classes()).not.toContain('text-success');
  });
});
