import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KujiViewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import KujiView from './KujiView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { kuji: vi.fn(), kujiBuy: vi.fn(), kujiDraw: vi.fn() } }));

const view = (p: Partial<KujiViewDto> = {}): KujiViewDto => ({
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
  price: 20000,
  buyLeft: 10,
  maxDraw: 10,
  recent: [{ at: '2026-10-02T01:00:00.000Z', restName: '甲店', tier: 'A' }],
  ...p,
});

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
    const w = mount(KujiView);
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
    const w = mount(KujiView);
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
    const w = mount(KujiView);
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
    const w = mount(KujiView);
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
    const w = mount(KujiView);
    await flushPromises();
    expect(w.get('[data-testid="kj-closed"]').text()).toContain('明天 0 点再来');
    for (const n of [1, 5, 10])
      expect(w.get(`[data-testid="kj-draw-${n}"]`).attributes('disabled')).toBeDefined();
  });
});
