import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundDepositDto, FundViewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import FundPanel from './FundPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    fund: vi.fn(),
    fundDeposit: vi.fn(),
    fundClaim: vi.fn(),
    fundWithdraw: vi.fn(),
  },
}));

const base: FundViewDto = {
  days: 7,
  returnRate: 0.9,
  earlyRate: 0.7,
  coin: 2_000_000,
  deposit: null,
  tiers: [
    { key: 'B', coin: 3_000_000, back: 2_700_000, medal: 93102, expRate: 0.1 },
    { key: 'C', coin: 1_000_000, back: 900_000, medal: 93101, expRate: 0.05 },
  ],
};
const deposit = (o: Partial<FundDepositDto> = {}): FundDepositDto => ({
  tier: 'C',
  coin: 1_000_000,
  medal: 93101,
  startedAt: '2026-10-05T00:00:00.000Z',
  maturesAt: '2026-10-12T00:00:00.000Z',
  mature: false,
  back: 900_000,
  early: 700_000,
  ...o,
});

describe('FundPanel（240-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });

  it('没有存款：列出各档（档名、领回、加成），钱不够的档禁用；确认后才存入', async () => {
    vi.mocked(endpoints.fund).mockResolvedValue(base);
    vi.mocked(endpoints.fundDeposit).mockResolvedValue({ ...base, deposit: deposit(), coin: 1_000_000 });
    const w = mount(FundPanel);
    await flushPromises();
    const c = w.get('[data-testid="fund-tier-C"]').text();
    expect(c).toContain('C·流动赋能');
    expect(c).toContain('900,000');
    expect(c).toContain('5%');
    expect(w.get('[data-testid="fund-deposit-B"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="fund-tier-B"]').text()).toContain('银币不够');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await w.get('[data-testid="fund-deposit-C"]').trigger('click');
    expect(endpoints.fundDeposit).not.toHaveBeenCalled();
    await w.get('[data-testid="fund-deposit-C"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[1]![0]).toContain('1,000,000');
    expect(endpoints.fundDeposit).toHaveBeenCalledWith('C');
    expect(w.find('[data-testid="fund-withdraw"]').exists()).toBe(true);
  });

  it('存着没到期：没有领取，按钮是提前取出，确认框写只退 700,000', async () => {
    vi.mocked(endpoints.fund).mockResolvedValue({ ...base, deposit: deposit() });
    vi.mocked(endpoints.fundWithdraw).mockResolvedValue(base);
    const w = mount(FundPanel);
    await flushPromises();
    expect(w.find('[data-testid="fund-tier-C"]').exists()).toBe(false);
    expect(w.find('[data-testid="fund-claim"]').exists()).toBe(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await w.get('[data-testid="fund-withdraw"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('700,000');
    expect(endpoints.fundWithdraw).toHaveBeenCalled();
  });

  it('操作被拒（比如页面开着时已经到期）：提示后重新读取，按钮换成领取（终审 I3）', async () => {
    vi.mocked(endpoints.fund)
      .mockResolvedValueOnce({ ...base, deposit: deposit() })
      .mockResolvedValueOnce({ ...base, deposit: deposit({ mature: true }) });
    vi.mocked(endpoints.fundWithdraw).mockRejectedValue(new Error('fund_mature'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(FundPanel);
    await flushPromises();
    await w.get('[data-testid="fund-withdraw"]').trigger('click');
    await flushPromises();
    expect(endpoints.fund).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="fund-withdraw"]').exists()).toBe(false);
    expect(w.find('[data-testid="fund-claim"]').exists()).toBe(true);
  });

  it('已到期：按钮是领取，没有提前取出', async () => {
    vi.mocked(endpoints.fund).mockResolvedValue({ ...base, deposit: deposit({ mature: true }) });
    vi.mocked(endpoints.fundClaim).mockResolvedValue(base);
    const w = mount(FundPanel);
    await flushPromises();
    expect(w.find('[data-testid="fund-withdraw"]').exists()).toBe(false);
    expect(w.get('[data-testid="fund-claim"]').text()).toContain('900,000');
    await w.get('[data-testid="fund-claim"]').trigger('click');
    await flushPromises();
    expect(endpoints.fundClaim).toHaveBeenCalled();
    expect(w.find('[data-testid="fund-tier-C"]').exists()).toBe(true);
  });
});
