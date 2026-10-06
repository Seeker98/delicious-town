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
      counts: { goods: 695, foods: 336, cookbooks: 3810, equips: 118, streets: 30 },
      endpoints: [],
      guide: {
        startStreet: { name: '新手街', cookbooks: 69 },
        star2Cookbooks: 100,
        biggestStreet: { name: '综合二街', cookbooks: 333 },
        takeaway: { star: 2, renown: 888, coin: 8_880_000, diamond: 300 },
        exchange: { level: 20, days: 7 },
        predict: { level: 20, days: 7 },
        newbieExp: { maxLevel: 40, rate: 2 },
      },
    });
    vi.mocked(endpoints.openGoods).mockResolvedValue({
      ...meta,
      items: [{ id: 1, name: '神秘礼券', type: 1, level: 1, coin: 0, diamond: 0, onSale: false }],
    });
    vi.mocked(endpoints.openFoods).mockResolvedValue({
      ...meta,
      items: [{ id: 239, name: '松露', level: 2, coin: 900, rare: true, type: 2 }],
    });
    vi.mocked(endpoints.openCookbooks).mockResolvedValue({
      ...meta,
      items: [{ id: 1, name: '松露炒饭', streetId: 0, level: 5, coin: 100 }],
    });
    vi.mocked(endpoints.openStreets).mockResolvedValue({ ...meta, items: [] });
  });

  it('五类卡片带数量和链接；有开放接口说明的链接', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="wiki-kind-cookbooks"]').text()).toContain('3,810 条');
    expect(w.get('[data-testid="wiki-kind-cookbooks"]').attributes('href')).toBe('/wiki/cookbooks');
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
    ]);
    expect(hits[1]!.attributes('href')).toBe('/wiki/cookbooks/1');
    expect(hits[0]!.text()).toContain('食材');
  });

  it('读目录失败时弹提示（设计 §3.4，质量期 ①b 终审）', async () => {
    vi.mocked(endpoints.openIndex).mockRejectedValue(new Error('net'));
    await mountView();
    expect(useToastStore().items.map((x) => x.variant)).toContain('danger');
  });
});
