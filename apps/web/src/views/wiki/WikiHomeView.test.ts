import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import WikiHomeView from './WikiHomeView.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    openIndex: vi.fn(),
    openGoods: vi.fn(),
    openFoods: vi.fn(),
    openCookbooks: vi.fn(),
    openMysterious: vi.fn(),
    openStreets: vi.fn(),
  },
}));
const meta = { version: 'v1', lang: 'zh-CN' as const };

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: WikiHomeView }],
  });
  const w = mount(WikiHomeView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('游戏资料首页（问题记录 142）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.openIndex).mockResolvedValue({
      ...meta,
      langs: ['zh-CN'],
      counts: { goods: 695, foods: 336, cookbooks: 3810, mysterious: 250, equips: 118, streets: 30 },
      endpoints: [],
      guide: {
        startStreet: { name: '新手街', cookbooks: 69 },
        star2Cookbooks: 100,
        biggestStreet: { name: '综合二街', cookbooks: 333 },
        takeaway: { star: 2, renown: 888, coin: 8_880_000, diamond: 300 },
        exchange: { level: 20, days: 7 },
        predict: { level: 20, days: 7 },
        newbieExp: { maxLevel: 40, rate: 2 },
        acquire: {
          minStar: 2,
          buyerMinStar: 2,
          buyerMinAccountDays: 7,
          maxHoldings: 10,
          priceMultiple: 3.5,
          taxRate: 0.1,
          firstStoreRate: 0.5,
          firstBurnRate: 0.4,
          resaleStoreRate: 0.05,
          redeemBurnRate: 0.3,
          cedeRate: 0.035,
          cedeTendRate: 0.049,
          tendMultiplier: 1.035,
          tendCostRate: 0.01,
          tendReleaseDays: 14,
          protectDays: 3,
        },
      },
    });
    vi.mocked(endpoints.openGoods).mockResolvedValue({
      ...meta,
      items: [{ id: 1, name: '神秘礼券', type: 1, level: 1, coin: 0, diamond: 0, onSale: false }],
    });
    vi.mocked(endpoints.openFoods).mockResolvedValue({
      ...meta,
      items: [{ id: 239, name: '松露', level: 2, coin: 900, fairCoin: 900, rare: true, type: 2 }],
    });
    vi.mocked(endpoints.openCookbooks).mockResolvedValue({
      ...meta,
      items: [{ id: 1, name: '松露炒饭', streetId: 0, level: 5, coin: 100, mainFoodId: 239 }],
    });
    vi.mocked(endpoints.openMysterious).mockResolvedValue({
      ...meta,
      items: [
        { id: 9, name: '秘·佛跳墙', level: 5, road: 2, nutritive: 120, mainFoodId: 239 },
        { id: 7, name: '秘·松露蛋', level: 1, road: 1, nutritive: 8, mainFoodId: 239 },
        { id: 8, name: '秘·松露汤', level: 3, road: 2, nutritive: 40, mainFoodId: null },
      ],
      roads: [
        { road: 1, weathers: [{ id: 1, name: '晴' }] },
        {
          road: 2,
          weathers: [
            { id: 2, name: '阴' },
            { id: 10, name: '小雨' },
          ],
        },
      ],
      special: [
        { id: 6, name: '虹' },
        { id: 7, name: '飓风' },
      ],
      rules: { remnants: 3, shilingMinStar: 1, same: 0.02, sameMax: 0.3, other: 0.005, otherMax: 0.1 },
    });
    vi.mocked(endpoints.openStreets).mockResolvedValue({ ...meta, items: [] });
  });

  it('五类卡片带数量和链接；有开放接口说明的链接', async () => {
    const w = await mountView();
    for (const k of ['goods', 'foods', 'cookbooks', 'mysterious', 'equips', 'streets'])
      expect(w.get(`[data-testid="wiki-kind-${k}"]`).attributes('href')).toBe(`/wiki/${k}`);
    expect(w.get('[data-testid="wiki-kind-cookbooks"]').text()).toContain('3,810 条');
    expect(w.get('[data-testid="wiki-kind-cookbooks"]').attributes('href')).toBe('/wiki/cookbooks');
    // 特色菜（2026-10-17）占一整行，写条数和说明
    expect(w.get('[data-testid="wiki-kind-mysterious"]').text()).toContain(
      '250 条 · 每道菜的道、当令天气和残卷来源',
    );
    expect(w.get('[data-testid="wiki-api-link"]').attributes('href')).toBe('/wiki/api');
    // 玩法攻略（问题记录 384）
    expect(w.get('[data-testid="wiki-guide-link"]').attributes('href')).toBe('/wiki/guide');
    // 没搜索时不读各类列表
    expect(endpoints.openCookbooks).not.toHaveBeenCalled();
  });

  it('全局搜索在各类名字里找，结果写类目、点进详情', async () => {
    const w = await mountView();
    await w.get('[data-testid="wiki-home-q"]').setValue('松露');
    await flushPromises();
    const hits = w.findAll('[data-testid^="wiki-hit-"]');
    expect(hits.map((h) => h.attributes('data-testid'))).toEqual([
      'wiki-hit-foods-239',
      'wiki-hit-cookbooks-1',
      'wiki-hit-mysterious-7',
      'wiki-hit-mysterious-8',
    ]);
    // 特色菜写道（2026-10-17）
    expect(w.get('[data-testid="wiki-hit-mysterious-8"]').attributes('href')).toBe('/wiki/mysterious/8');
    expect(w.get('[data-testid="wiki-hit-mysterious-8"]').text()).toContain('二道');
    expect(hits[1]!.attributes('href')).toBe('/wiki/cookbooks/1');
    // 界面改版 P11：结果按类分组，组头写类目和条数
    expect(w.get('[data-testid="wiki-group-foods"] .dt-wiki-group').text()).toBe('食材 · 1');
    expect(w.get('[data-testid="wiki-group-cookbooks"] .dt-wiki-group').text()).toBe('食谱 · 1');
    expect(w.find('[data-testid="wiki-group-goods"]').exists()).toBe(false);
    expect(hits[0]!.text()).toContain('松露');
    expect(hits[0]!.text()).toContain('稀有');
    // 搜索时分类目录收起
    expect(w.find('[data-testid="wiki-kind-foods"]').exists()).toBe(false);
  });

  it('每组最多列 3 条，多的给“看全部”，跳到那一类的列表并带上搜索词', async () => {
    vi.mocked(endpoints.openGoods).mockResolvedValue({
      ...meta,
      items: [1, 2, 3, 4, 5].map((id) => ({
        id,
        name: `松露礼盒${id}`,
        type: 1,
        level: 1,
        coin: 0,
        diamond: 0,
        onSale: false,
      })),
    });
    const w = await mountView();
    await w.get('[data-testid="wiki-home-q"]').setValue('礼盒');
    await flushPromises();
    const g = w.get('[data-testid="wiki-group-goods"]');
    expect(g.get('.dt-wiki-group').text()).toBe('道具 · 5');
    expect(g.findAll('[data-testid^="wiki-hit-goods-"]')).toHaveLength(3);
    const all = w.get('[data-testid="wiki-all-goods"]');
    expect(all.text()).toBe('还有 2 条 · 看全部道具');
    expect(all.attributes('href')).toBe('/wiki/goods?q=%E7%A4%BC%E7%9B%92');
    expect(w.find('[data-testid="wiki-all-foods"]').exists()).toBe(false);
  });

  it('什么都没搜到：写“没有找到”', async () => {
    const w = await mountView();
    await w.get('[data-testid="wiki-home-q"]').setValue('不存在的东西');
    await flushPromises();
    expect(w.find('[data-testid^="wiki-group-"]').exists()).toBe(false);
    expect(w.get('[data-testid="wiki-hits"]').text()).toContain('没有找到');
  });

  it('读目录失败时弹提示（设计 §3.4，质量期 ①b 终审）', async () => {
    vi.mocked(endpoints.openIndex).mockRejectedValue(new Error('net'));
    await mountView();
    expect(useToastStore().items.map((x) => x.variant)).toContain('danger');
  });
});
