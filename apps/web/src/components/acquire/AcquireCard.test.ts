import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcquireRestDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import AcquireCard from './AcquireCard.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: { acquireRest: vi.fn(), acquireBuy: vi.fn() },
}));

const rest = (o: Partial<AcquireRestDto> = {}): AcquireRestDto => ({
  restId: 2,
  name: '乙店',
  level: 10,
  star: 2,
  base: 1_000_000,
  heat: 1,
  price: 1_000_000,
  owner: null,
  listed: null,
  taxRate: 0.1,
  protectedUntil: null,
  acquireBlock: null,
  listedBlock: 'not_listed',
  ...o,
});

describe('AcquireCard（对方餐厅页，收购 PR 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.acquireBuy).mockResolvedValue({ restId: 2, price: 1, tax: 0, sellerGot: 1 });
  });

  it('身价、自主经营；能收时确认后按身价收购', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue(rest());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AcquireCard, { props: { restId: 2 } });
    await flushPromises();
    expect(endpoints.acquireRest).toHaveBeenCalledWith(2);
    const text = w.text();
    expect(text).toContain('身价 1,000,000');
    expect(text).toContain('自主经营');
    expect(w.find('[data-testid="card-listed"]').exists()).toBe(false);
    await w.get('[data-testid="card-acquire"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('「乙店」得 900,000 银币，税 100,000 银币');
    expect(endpoints.acquireBuy).toHaveBeenCalledWith(2, 'acquire', 1_000_000);
    expect(endpoints.acquireRest).toHaveBeenCalledTimes(2);
  });

  it('不能收：写原因，不给收购按钮；关联账号写明最近在同一设备或网络登录过（问题记录 495）', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue(
      rest({ acquireBlock: 'linked', listedBlock: 'linked' }),
    );
    const w = mount(AcquireCard, { props: { restId: 2 } });
    await flushPromises();
    expect(w.find('[data-testid="card-acquire"]').exists()).toBe(false);
    expect(w.get('[data-testid="card-block"]').text()).toBe(
      '你和这家店的老板最近在同一台设备或同一网络登录过，不能收购',
    );
  });

  it('有老板、在挂牌：写老板和挂牌，能按挂牌价买下', async () => {
    const until = new Date(Date.now() + 2 * 3600_000).toISOString();
    vi.mocked(endpoints.acquireRest).mockResolvedValue(
      rest({
        owner: { restId: 9, name: '老板店' },
        listed: { rate: 0.6, price: 600_000, until },
        acquireBlock: null,
        listedBlock: null,
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AcquireCard, { props: { restId: 2 } });
    await flushPromises();
    expect(w.text()).toContain('老板：老板店');
    expect(w.text()).toContain('挂牌 60%：600,000 银币');
    await w.get('[data-testid="card-listed"]').trigger('click');
    await flushPromises();
    expect(endpoints.acquireBuy).toHaveBeenCalledWith(2, 'listed', 600_000);
  });

  it('读不到（区服关了收购等）就什么都不显示', async () => {
    vi.mocked(endpoints.acquireRest).mockRejectedValue(new Error('x'));
    const w = mount(AcquireCard, { props: { restId: 2 } });
    await flushPromises();
    expect(w.find('[data-testid="acquire-card"]').exists()).toBe(false);
  });

  it('还没有身价（1 星）：不写身价，只写原因（审查 Minor 1）', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue(
      rest({ star: 1, acquireBlock: 'no_state', listedBlock: 'no_state' }),
    );
    const w = mount(AcquireCard, { props: { restId: 2 } });
    await flushPromises();
    expect(w.text()).not.toContain('身价 1,000,000');
    expect(w.get('[data-testid="card-block"]').text()).toBe('这家店星级不够，还没有身价');
  });

  it('对方被封号：卡片上也用笼统说法，不透露封号（审查 Minor 3）', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue(
      rest({ acquireBlock: 'banned', listedBlock: 'banned' }),
    );
    const w = mount(AcquireCard, { props: { restId: 2 } });
    await flushPromises();
    expect(w.get('[data-testid="card-block"]').text()).toBe('暂时不能收购这家店');
  });
});
