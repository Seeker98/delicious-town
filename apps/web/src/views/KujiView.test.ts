import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { KujiViewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import KujiView from './KujiView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { kuji: vi.fn(), kujiBuy: vi.fn(), kujiDraw: vi.fn() } }));

const view = (p: Partial<KujiViewDto> = {}): KujiViewDto => ({
  line: 'normal',
  pool: { id: 1, day: '2026-10-02', seq: 2, total: 80, left: 79 },
  tiers: [
    {
      key: 'A',
      count: 1,
      left: 0,
      award: { diamond: 300, goods: [{ id: 90101, num: 1 }] },
      icon: 'kuji_a',
      big: true,
    },
    { key: 'F', count: 50, left: 50, award: { coin: 5000 }, icon: null, big: false },
  ],
  last: { award: { diamond: 200 }, icon: 'kuji_last' },
  theme: { month: 7, name: '夏日冰饮', desc: '蝉鸣声里，刨冰和汽水最受欢迎。' },
  closedToday: false,
  tickets: 3,
  coin: 1_234_567,
  price: 20000,
  buyLeft: 10,
  maxDraw: 10,
  recent: [{ at: '2026-10-02T01:00:00.000Z', restName: '甲店', tier: 'A' }],
  ...p,
});

/** 页面读网址里的 line（240-2 豪华一番赏），挂载时要装路由 */
async function mountWithRouter(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<p/>' } }],
  });
  await router.push(path);
  const w = mount(KujiView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe('KujiView（一番赏设计 §7.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [{ id: 90101, name: '一番赏 A 赏手办', type: 10 }],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.kuji).mockResolvedValue(view());
  });

  it('看板：第几池、剩余；抽完的档灰掉；奖品写道具名；最近大赏', async () => {
    const { w } = await mountWithRouter('/kuji');
    await flushPromises();
    expect(w.get('[data-testid="kj-pool"]').text()).toContain('第 2 池');
    expect(w.get('[data-testid="kj-pool"]').text()).toContain('剩 79 / 80');
    expect(w.get('[data-testid="kj-pool"] .dt-card-title').text()).toContain('第 2 池');
    const a = w.get('[data-testid="kj-tier-A"]');
    expect(a.classes()).toContain('opacity-50');
    expect(a.text()).toContain('一番赏 A 赏手办');
    expect(a.text()).toContain('钻石 300');
    expect(w.get('[data-testid="kj-last"]').text()).toContain('钻石 200');
    expect(w.get('[data-testid="kj-recent"]').text()).toContain('甲店');
  });

  it('抽签按钮按券数和剩余禁用；买券显示总价', async () => {
    const { w } = await mountWithRouter('/kuji');
    await flushPromises();
    expect(w.get('[data-testid="kj-draw-1"]').attributes('disabled')).toBeUndefined();
    expect(w.get('[data-testid="kj-draw-5"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="kj-buy-num"]').setValue('3');
    expect(w.text()).toContain('共 60,000 银币');
  });

  it('抽签：显示结果；得最后赏单独提示', async () => {
    vi.mocked(endpoints.kujiDraw).mockResolvedValue({
      draws: [{ tier: 'F', award: { coin: 5000 } }],
      last: { diamond: 200 },
      view: view({ tickets: 2 }),
    });
    const { w } = await mountWithRouter('/kuji');
    await flushPromises();
    await w.get('[data-testid="kj-draw-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.kujiDraw).toHaveBeenCalledWith(1);
    const r = w.get('[data-testid="kj-result"]').text();
    expect(r).toContain('F 赏');
    expect(r).toContain('银币 5,000');
    expect(r).toContain('最后赏');
    expect(w.get('[data-testid="kj-tickets"]').text()).toContain('2');
  });

  it('看板显示本月主题（问题记录 274）', async () => {
    const { w } = await mountWithRouter('/kuji');
    await flushPromises();
    const th = w.get('[data-testid="kj-theme"]').text();
    expect(th).toContain('7 月主题：夏日冰饮');
    expect(th).toContain('刨冰');
  });

  it('今天的池都抽完了：提示明天再来，抽签按钮全部禁用', async () => {
    vi.mocked(endpoints.kuji).mockResolvedValue(
      view({
        closedToday: true,
        tickets: 10,
        pool: { id: 1, day: '2026-10-02', seq: 3, total: 80, left: 0 },
      }),
    );
    const { w } = await mountWithRouter('/kuji');
    await flushPromises();
    expect(w.get('[data-testid="kj-closed"]').text()).toContain('明天 0 点再来');
    for (const n of [1, 5, 10])
      expect(w.get(`[data-testid="kj-draw-${n}"]`).attributes('disabled')).toBeDefined();
  });
});

describe('backlog 一番赏：页面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
  });
  const show = async (p: Partial<KujiViewDto>) => {
    vi.mocked(endpoints.kuji).mockResolvedValue(view(p));
    const { w } = await mountWithRouter('/kuji');
    await flushPromises();
    return w;
  };
  const drawButtons = (w: Awaited<ReturnType<typeof show>>) =>
    w.findAll('[data-testid^="kj-draw-"]').map((b) => b.attributes('data-testid'));

  it('单次上限大于 10 时多一个按上限抽的按钮', async () => {
    const w = await show({ maxDraw: 20, tickets: 30 });
    expect(drawButtons(w)).toEqual(['kj-draw-1', 'kj-draw-5', 'kj-draw-10', 'kj-draw-20']);
  });

  it('上限小于 10 时不显示抽不了的按钮', async () => {
    const w = await show({ maxDraw: 5 });
    expect(drawButtons(w)).toEqual(['kj-draw-1', 'kj-draw-5']);
  });

  it('池里只剩 2~4 张时，可以一次抽完剩下的', async () => {
    const w = await show({ pool: { id: 1, day: '2026-10-02', seq: 2, total: 80, left: 3 }, tickets: 5 });
    const b = w.get('[data-testid="kj-draw-3"]');
    expect(b.attributes('disabled')).toBeUndefined();
    expect(b.text()).toContain('3');
  });

  it('买券数量超过今天还能买的：不显示总价，按钮禁用，提示还能买几张', async () => {
    const w = await show({ buyLeft: 4 });
    await w.get('[data-testid="kj-buy-num"]').setValue('5');
    expect(w.get('[data-testid="kj-buy"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="kj-buy-hint"]').text()).toContain('今天最多还能买 4 张');
    expect(w.text()).not.toContain('100,000');
  });

  it('买券数量填小数：提示要填整数，按钮禁用', async () => {
    const w = await show({});
    await w.get('[data-testid="kj-buy-num"]').setValue('1.5');
    expect(w.get('[data-testid="kj-buy"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="kj-buy-hint"]').text()).toContain('整数');
  });

  it('显示银币余额', async () => {
    const w = await show({});
    expect(w.get('[data-testid="kj-coin"]').text()).toContain('1,234,567');
  });

  it('切到豪华（240-2）：请求带 line=deluxe，网址记下 line；票数写“豪华签券”；没有月度主题', async () => {
    vi.mocked(endpoints.kuji).mockImplementation(async (line) =>
      line === 'deluxe'
        ? view({
            line: 'deluxe',
            pool: { id: 9, day: '2026-10-04', seq: 1, total: 20, left: 20 },
            price: 300000,
            theme: null,
          })
        : view(),
    );
    const { w, router } = await mountWithRouter('/kuji');
    await w.get('[data-testid="kj-line-deluxe"]').trigger('click');
    await flushPromises();
    expect(endpoints.kuji).toHaveBeenLastCalledWith('deluxe');
    expect(router.currentRoute.value.query.line).toBe('deluxe');
    expect(w.get('[data-testid="kj-tickets"]').text()).toContain('豪华签券');
    expect(w.find('[data-testid="kj-theme"]').exists()).toBe(false);
    expect(w.get('[data-testid="kj-pool"]').text()).toContain('剩 20 / 20');
  });
});
