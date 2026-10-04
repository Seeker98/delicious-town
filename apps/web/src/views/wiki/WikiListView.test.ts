import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../../api/endpoints';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';
import fr from '../../i18n/locales/fr';
import { useToastStore } from '../../stores/toast';
import WikiListView from './WikiListView.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    openGoods: vi.fn(),
    openFoods: vi.fn(),
    openCookbooks: vi.fn(),
    openEquips: vi.fn(),
    openStreets: vi.fn(),
  },
}));

const meta = { version: 'v1', lang: 'zh-CN' as const };
const streets = {
  ...meta,
  items: [
    { id: 0, name: '湖南街', cookName: '湘菜', desc: '', medal: null, cookbookCount: 2 },
    { id: 14, name: '日本街', cookName: '日料', desc: '', medal: null, cookbookCount: 1 },
  ],
};

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/wiki/:kind', component: WikiListView },
      { path: '/:p(.*)', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  const w = mount(WikiListView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}
const rows = (w: Awaited<ReturnType<typeof mountAt>>) =>
  w.findAll('[data-testid^="wiki-row-"]').map((r) => r.attributes('data-testid')!.slice(9));

describe('游戏资料列表（问题记录 142）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.openStreets).mockResolvedValue(streets);
  });

  it('道具：按类型筛选，搜索不区分大小写，点行进详情', async () => {
    vi.mocked(endpoints.openGoods).mockResolvedValue({
      ...meta,
      items: [
        { id: 1, name: '神秘礼券', type: 1, level: 1, coin: 0, diamond: 0, onSale: false },
        { id: 4, name: 'Super Card', type: 0, level: 1, coin: 1000, diamond: 0, onSale: true },
        { id: 30, name: '见习之铲', type: 4, level: 1, coin: 500, diamond: 0, onSale: true },
      ],
    });
    const w = await mountAt('/wiki/goods');
    expect(rows(w)).toEqual(['1', '4', '30']);
    expect(w.get('[data-testid="wiki-row-4"]').attributes('href')).toBe('/wiki/goods/4');
    expect(w.get('[data-testid="wiki-row-4"]').text()).toContain('1,000 银币');
    await w.get('[data-testid="wiki-filter-4"]').trigger('click');
    expect(rows(w)).toEqual(['30']);
    await w.get('[data-testid="wiki-filter-all"]').trigger('click');
    await w.get('[data-testid="wiki-q"]').setValue('super');
    expect(rows(w)).toEqual(['4']);
    await w.get('[data-testid="wiki-q"]').setValue('没有这个');
    expect(w.get('[data-testid="wiki-empty"]').text()).toBe('没有找到');
  });

  it('食材：按等级筛选、只看稀有', async () => {
    vi.mocked(endpoints.openFoods).mockResolvedValue({
      ...meta,
      items: [
        { id: 101, name: '大米', level: 1, coin: 10, rare: false, type: 2 },
        { id: 239, name: '松露', level: 2, coin: 900, rare: true, type: 2 },
        { id: 240, name: '鱼子酱', level: 1, coin: 800, rare: true, type: 1 },
      ],
    });
    const w = await mountAt('/wiki/foods');
    await w.get('[data-testid="wiki-filter-1"]').trigger('click');
    expect(rows(w)).toEqual(['101', '240']);
    await w.get('[data-testid="wiki-rare"]').trigger('click');
    expect(rows(w)).toEqual(['240']);
    expect(w.get('[data-testid="wiki-row-240"]').text()).toContain('稀有');
  });

  it('菜谱：一次 50 条，再显示 50 条；按街道筛选；信息行写街道名', async () => {
    vi.mocked(endpoints.openCookbooks).mockResolvedValue({
      ...meta,
      items: Array.from({ length: 120 }, (_, i) => ({
        id: i + 1,
        name: `菜${i + 1}`,
        streetId: i < 100 ? 0 : 14,
        level: 1 + (i % 50),
        coin: 100,
      })),
    });
    const w = await mountAt('/wiki/cookbooks');
    expect(rows(w)).toHaveLength(50);
    expect(w.get('[data-testid="wiki-row-1"]').text()).toContain('湖南街');
    await w.get('[data-testid="wiki-more"]').trigger('click');
    expect(rows(w)).toHaveLength(100);
    await w.get('[data-testid="wiki-street"]').setValue('14');
    expect(rows(w)).toEqual(Array.from({ length: 20 }, (_, i) => String(101 + i)));
    expect(w.find('[data-testid="wiki-more"]').exists()).toBe(false);
  });

  it('厨具：按部位筛选，进道具详情', async () => {
    vi.mocked(endpoints.openEquips).mockResolvedValue({
      ...meta,
      items: [
        { id: 30, name: '见习之铲', part: 1, minLevel: 0, suitId: 0, maxTotal: 18 },
        { id: 31, name: '见习之刀', part: 2, minLevel: 0, suitId: 0, maxTotal: 18 },
      ],
      suits: [],
    });
    const w = await mountAt('/wiki/equips');
    await w.get('[data-testid="wiki-filter-2"]').trigger('click');
    expect(rows(w)).toEqual(['31']);
    expect(w.get('[data-testid="wiki-row-31"]').attributes('href')).toBe('/wiki/goods/31');
  });

  it('街道：直接列出，写菜系和菜谱数', async () => {
    const w = await mountAt('/wiki/streets');
    expect(rows(w)).toEqual(['0', '14']);
    expect(w.get('[data-testid="wiki-row-0"]').text()).toContain('湘菜');
    expect(w.get('[data-testid="wiki-row-0"]').text()).toContain('2 道菜');
  });

  it('读失败时写读取失败，并弹提示（设计 §3.4，backlog #115）', async () => {
    vi.mocked(endpoints.openGoods).mockRejectedValue(new Error('net'));
    const w = await mountAt('/wiki/goods');
    expect(w.get('[data-testid="wiki-error"]').text()).toBe('读取失败，请稍后再试');
    expect(useToastStore().items.map((x) => x.variant)).toContain('danger');
  });

  it('厨具没有等级门槛时信息行不写“0 级可以穿”（backlog #115）', async () => {
    vi.mocked(endpoints.openEquips).mockResolvedValue({
      ...meta,
      items: [{ id: 30, name: '见习之铲', part: 1, minLevel: 0, suitId: 0, maxTotal: 18 }],
      suits: [],
    });
    const w = await mountAt('/wiki/equips');
    expect(w.get('[data-testid="wiki-row-30"]').text()).not.toContain('级可以穿');
  });

  it('先点道具（慢、后来失败）再点食材：晚到的道具结果不影响食材页（backlog #115）', async () => {
    let fail: (e: unknown) => void = () => undefined;
    vi.mocked(endpoints.openGoods).mockReturnValue(new Promise((_, rej) => (fail = rej)));
    vi.mocked(endpoints.openFoods).mockResolvedValue({
      ...meta,
      items: [{ id: 101, name: '大米', level: 1, rare: false, type: 2 }],
    } as never);
    const w = await mountAt('/wiki/goods');
    await w.vm.$router.push('/wiki/foods');
    await flushPromises();
    expect(rows(w)).toEqual(['101']);
    fail(new Error('net'));
    await flushPromises();
    expect(w.find('[data-testid="wiki-error"]').exists()).toBe(false);
    expect(rows(w)).toEqual(['101']);
  });

  it('无障碍：搜索框、街道下拉有名字，筛选胶囊是按钮并标明是否按下（backlog #115）', async () => {
    vi.mocked(endpoints.openCookbooks).mockResolvedValue({ ...meta, items: [] } as never);
    const w = await mountAt('/wiki/cookbooks');
    expect(w.get('[data-testid="wiki-q"]').attributes('aria-label')).toBeTruthy();
    expect(w.get('[data-testid="wiki-street"]').attributes('aria-label')).toBeTruthy();
    // 胶囊用真正的按钮：读屏按空格能按（质量期 ①b 终审）
    expect(w.get('[data-testid="wiki-filter-all"]').element.tagName).toBe('BUTTON');
    expect(w.get('[data-testid="wiki-filter-all"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="wiki-street"]').attributes('aria-label')).toBe('街道');
    expect(w.get('[data-testid="wiki-filter-0"]').attributes('aria-pressed')).toBe('false');
  });

  it('离开页面后，旧请求失败不再弹提示（质量期 ①b 终审）', async () => {
    let fail: (e: unknown) => void = () => undefined;
    vi.mocked(endpoints.openGoods).mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const w = await mountAt('/wiki/goods');
    w.unmount();
    fail(new Error('net'));
    await flushPromises();
    expect(useToastStore().items).toEqual([]);
  });

  it('英法西的条数分单复数（backlog #115）', () => {
    expect([en.wiki.count(1), en.wiki.count(1200)]).toEqual(['1 entry', '1,200 entries']);
    expect(fr.wiki.count(1).replace(/\s/g, ' ')).toBe('1 entrée');
    expect(fr.wiki.count(2)).toBe('2 entrées');
    expect([es.wiki.count(1), es.wiki.count(2)]).toEqual(['1 entrada', '2 entradas']);
  });
});
