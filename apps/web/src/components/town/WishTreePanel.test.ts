import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WishTreeDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import WishTreePanel from './WishTreePanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: { wishTree: vi.fn(), wishTreeWish: vi.fn() },
}));

const data = (p: Partial<WishTreeDto> = {}): WishTreeDto => ({
  enabled: true,
  hour: 20,
  minLevel: 10,
  level: 12,
  titleDays: 3,
  round: {
    id: 5,
    goodsId: 1,
    num: 5,
    opensAt: '2026-10-12T12:00:00Z',
    endsAt: '2026-10-13T12:00:00Z',
    entries: 8,
  },
  wished: false,
  recent: [],
  ...p,
});
const el = (w: ReturnType<typeof mount>, id: string) => w.get(`[data-testid="${id}"]`);

describe('WishTreePanel（许愿树设计 §3.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('这一轮：道具和数量、许愿人数；说明里的数字来自数据', async () => {
    vi.mocked(endpoints.wishTree).mockResolvedValue(data({ hour: 21, minLevel: 15, titleDays: 4 }));
    const w = mount(WishTreePanel);
    await flushPromises();
    expect(el(w, 'wt-prize').text()).toContain('×5');
    expect(el(w, 'wt-entries').text()).toContain('8');
    const help = el(w, 'wt-help').text();
    expect(help).toContain('21:00');
    expect(help).toContain('15 级');
    expect(help).toContain('4 天');
  });

  it('许愿按钮三种状态：能许、已许愿、等级不够', async () => {
    vi.mocked(endpoints.wishTree).mockResolvedValue(data());
    vi.mocked(endpoints.wishTreeWish).mockResolvedValue(data({ wished: true }));
    const w = mount(WishTreePanel);
    await flushPromises();
    await el(w, 'wt-wish').trigger('click');
    await flushPromises();
    expect(endpoints.wishTreeWish).toHaveBeenCalledOnce();
    expect(w.find('[data-testid="wt-wish"]').exists()).toBe(false);
    expect(w.find('[data-testid="wt-wished"]').exists()).toBe(true);

    vi.mocked(endpoints.wishTree).mockResolvedValue(data({ level: 9 }));
    const low = mount(WishTreePanel);
    await flushPromises();
    expect(el(low, 'wt-wish').attributes('disabled')).toBeDefined();
    expect(el(low, 'wt-need').text()).toContain('10');
  });

  it('没有进行中的一轮：写明每天几点开新一轮；关了时写明未开放', async () => {
    vi.mocked(endpoints.wishTree).mockResolvedValue(data({ round: null }));
    const w = mount(WishTreePanel);
    await flushPromises();
    expect(el(w, 'wt-none').text()).toContain('20:00');

    vi.mocked(endpoints.wishTree).mockResolvedValue(data({ enabled: false, round: null }));
    const off = mount(WishTreePanel);
    await flushPromises();
    expect(off.find('[data-testid="wt-off"]').exists()).toBe(true);
    expect(off.find('[data-testid="wt-wish"]').exists()).toBe(false);
  });

  it('最近结果：中奖店名、没人许愿、我中了、我没中和安慰奖', async () => {
    vi.mocked(endpoints.wishTree).mockResolvedValue(
      data({
        recent: [
          {
            id: 3,
            day: '2026-10-11',
            goodsId: 1,
            num: 1,
            status: 'drawn',
            entries: 9,
            winner: { restId: 7, name: '小店' },
            mine: { won: true, award: null },
          },
          {
            id: 2,
            day: '2026-10-10',
            goodsId: 1,
            num: 1,
            status: 'drawn',
            entries: 4,
            winner: { restId: 8, name: '大店' },
            mine: { won: false, award: { kind: 'coin', id: null, num: 100, lucky: false } },
          },
          {
            id: 1,
            day: '2026-10-09',
            goodsId: 1,
            num: 1,
            status: 'empty',
            entries: 0,
            winner: null,
            mine: null,
          },
        ],
      }),
    );
    const w = mount(WishTreePanel);
    await flushPromises();
    const rows = w.findAll('[data-testid="wt-recent-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain('小店');
    expect(rows[0]!.find('[data-testid="wt-mine"]').exists()).toBe(true);
    expect(rows[1]!.text()).toContain('100');
    expect(rows[2]!.find('[data-testid="wt-empty"]').exists()).toBe(true);
  });
});
