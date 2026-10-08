import { adminTime } from '../../utils/gameInput';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExchangeSuspiciousRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import ExchangeGuardPanel from './ExchangeGuardPanel.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    suspiciousExchange: vi.fn(),
    exchangeFrozen: vi.fn(),
    exchangeFreeze: vi.fn(),
    exchangeUnfreeze: vi.fn(),
    exchangeConfiscate: vi.fn(),
  },
}));

const row: ExchangeSuspiciousRow = {
  tradeId: 9,
  at: '2026-10-02T00:00:00Z',
  foodsId: 11,
  price: 1900,
  ref: 1000,
  qty: 3,
  amount: 5700,
  flags: ['edge_price', 'same_ip'],
  buyer: { restId: 1, restName: '甲店', accountId: 11, username: 'alice', hold: 'held' },
  seller: { restId: 2, restName: '乙店', accountId: 12, username: 'bob', hold: 'held' },
};

describe('后台交易所标签（156-2 设计 §7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [{ id: 11, name: '松露', level: 6 }],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.suspiciousExchange).mockResolvedValue([row]);
    vi.mocked(adminApi.exchangeFrozen).mockResolvedValue([
      {
        restId: 5,
        restName: '丙店',
        username: 'carl',
        reason: '对倒',
        actor: 'boss',
        at: '2026-10-02T00:00:00Z',
        heldCoin: 100,
        heldFoods: 0,
      },
    ]);
  });

  it('列表显示标记中文、双方、冻结状态；按标记筛选', async () => {
    useAdminStore().me = { accountId: 1, username: 'm', role: 'mod' };
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    const tr = w.find('[data-testid="exg-row-9"]');
    expect(tr.text()).toContain('价格贴边');
    expect(tr.text()).toContain('同 IP');
    expect(tr.text()).toContain('甲店');
    expect(tr.text()).toContain('冻结中');
    await w.find('[data-testid="exg-flag"]').setValue('large');
    await flushPromises();
    expect(adminApi.suspiciousExchange).toHaveBeenLastCalledWith(1, 'large');
  });

  it('冻结名单显示冻结时间（backlog 156-2）', async () => {
    useAdminStore().me = { accountId: 1, username: 'm', role: 'mod' };
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    expect(w.get('[data-testid="exg-frozen-5"]').text()).toContain(adminTime('2026-10-02T00:00:00Z'));
  });

  it('协管：能冻结、能解冻，看不到没收按钮', async () => {
    useAdminStore().me = { accountId: 1, username: 'm', role: 'mod' };
    vi.spyOn(window, 'prompt').mockReturnValue('对倒');
    vi.mocked(adminApi.exchangeFreeze).mockResolvedValue({ ok: true } as never);
    vi.mocked(adminApi.exchangeUnfreeze).mockResolvedValue({ ok: true } as never);
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    expect(w.find('[data-testid="exg-confiscate-9"]').exists()).toBe(false);
    await w.find('[data-testid="exg-freeze-seller-9"]').trigger('click');
    await flushPromises();
    expect(adminApi.exchangeFreeze).toHaveBeenCalledWith({ restId: 2, reason: '对倒' });
    await w.find('[data-testid="exg-unfreeze-5"]').trigger('click');
    await flushPromises();
    expect(adminApi.exchangeUnfreeze).toHaveBeenCalledWith({ restId: 5 });
  });

  it('管理员：没收这笔先确认', async () => {
    useAdminStore().me = { accountId: 1, username: 'a', role: 'admin' };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(adminApi.exchangeConfiscate).mockResolvedValue({ count: 2, coin: 1, foods: 3 } as never);
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    await w.find('[data-testid="exg-confiscate-9"]').trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalled();
    expect(adminApi.exchangeConfiscate).toHaveBeenCalledWith({ tradeId: 9 });
  });
});
