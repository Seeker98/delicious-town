import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WealthDepositDto, WealthViewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import WealthPanel from './WealthPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    wealth: vi.fn(),
    wealthDeposit: vi.fn(),
    wealthClaim: vi.fn(),
    wealthWithdraw: vi.fn(),
  },
}));

const M = 1_000_000;
const view = (over: Partial<WealthViewDto> = {}): WealthViewDto => ({
  minLevel: 20,
  unit: M,
  maxActive: 3,
  maxTotal: 10 * M,
  earlyRate: 0.95,
  terms: [
    { days: 3, goodsId: 10213, level: 3, perUnit: 1 },
    { days: 7, goodsId: 10214, level: 4, perUnit: 1 },
    { days: 14, goodsId: 10215, level: 5, perUnit: 1 },
  ],
  deposits: [],
  level: 20,
  coin: 5 * M,
  ...over,
});
const dep = (o: Partial<WealthDepositDto> = {}): WealthDepositDto => ({
  id: 7,
  coin: 2 * M,
  days: 3,
  goodsId: 10213,
  packs: 2,
  startedAt: '2026-10-10T00:00:00.000Z',
  maturesAt: '2026-10-13T00:00:00.000Z',
  mature: false,
  early: 1_900_000,
  ...o,
});
const btn = (w: ReturnType<typeof mount>, id: string) => w.get(`[data-testid="${id}"]`);
const disabled = (w: ReturnType<typeof mount>) => btn(w, 'we-deposit').attributes('disabled') !== undefined;

describe('WealthPanel（理财设计 §3.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });

  it('默认 3 天、1 档：写到期得 1 个包、还能存 10,000,000；确认后存入 (3, 1000000)', async () => {
    vi.mocked(endpoints.wealth).mockResolvedValue(view());
    vi.mocked(endpoints.wealthDeposit).mockResolvedValue(view({ deposits: [dep({ coin: M, packs: 1 })] }));
    const w = mount(WealthPanel);
    await flushPromises();
    expect(btn(w, 'we-left').text()).toContain('10,000,000');
    expect(btn(w, 'we-summary').text()).toContain('×1');
    expect(btn(w, 'we-help').text()).toContain('95%');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await btn(w, 'we-deposit').trigger('click');
    expect(endpoints.wealthDeposit).not.toHaveBeenCalled();
    await btn(w, 'we-term-14').trigger('click');
    await btn(w, 'we-qty').setValue('2');
    await btn(w, 'we-deposit').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[1]![0]).toContain('2,000,000');
    expect(endpoints.wealthDeposit).toHaveBeenCalledWith(14, 2 * M);
    expect(w.find('[data-testid="we-d-7"]').exists()).toBe(true);
  });

  it('数量为空、0、小数、超过还能存的、超过银币时不能存（Review Focus 5）', async () => {
    vi.mocked(endpoints.wealth).mockResolvedValue(
      view({ deposits: [dep({ coin: 9 * M })], coin: 1_500_000 }),
    );
    const w = mount(WealthPanel);
    await flushPromises();
    expect(disabled(w)).toBe(false);
    for (const v of ['', '0', '1.5']) {
      await btn(w, 'we-qty').setValue(v);
      expect(disabled(w)).toBe(true);
    }
    await btn(w, 'we-qty').setValue('2');
    expect(disabled(w)).toBe(true);
    expect(btn(w, 'we-left').text()).toContain('1,000,000');
    vi.mocked(endpoints.wealth).mockResolvedValue(view({ coin: 1_500_000 }));
    const w2 = mount(WealthPanel);
    await flushPromises();
    await btn(w2, 'we-qty').setValue('2');
    expect(disabled(w2)).toBe(true);
    expect(w2.text()).toContain('银币不够');
  });

  it('等级不够、笔数满了：写原因，不能存', async () => {
    vi.mocked(endpoints.wealth).mockResolvedValue(view({ level: 19 }));
    const w = mount(WealthPanel);
    await flushPromises();
    expect(btn(w, 'we-blocked').text()).toContain('20 级');
    expect(disabled(w)).toBe(true);
    vi.mocked(endpoints.wealth).mockResolvedValue(
      view({ deposits: [dep({ id: 1, coin: M }), dep({ id: 2, coin: M }), dep({ id: 3, coin: M })] }),
    );
    const w2 = mount(WealthPanel);
    await flushPromises();
    expect(btn(w2, 'we-blocked').text()).toContain('3 笔');
    expect(disabled(w2)).toBe(true);
  });

  it('没到期的可以提前取出（确认框写退多少）；到期的可以领取', async () => {
    vi.mocked(endpoints.wealth).mockResolvedValue(
      view({ deposits: [dep({ id: 1, mature: true }), dep({ id: 2 })] }),
    );
    vi.mocked(endpoints.wealthClaim).mockResolvedValue(view({ deposits: [dep({ id: 2 })] }));
    vi.mocked(endpoints.wealthWithdraw).mockResolvedValue(view());
    const w = mount(WealthPanel);
    await flushPromises();
    expect(w.find('[data-testid="we-withdraw-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="we-claim-2"]').exists()).toBe(false);
    await btn(w, 'we-claim-1').trigger('click');
    await flushPromises();
    expect(endpoints.wealthClaim).toHaveBeenCalledWith(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await btn(w, 'we-withdraw-2').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('1,900,000');
    expect(endpoints.wealthWithdraw).toHaveBeenCalledWith(2);
  });

  it('操作失败：报错并重读', async () => {
    vi.mocked(endpoints.wealth).mockResolvedValue(view({ deposits: [dep({ id: 1, mature: true })] }));
    vi.mocked(endpoints.wealthClaim).mockRejectedValue(new Error('x'));
    const w = mount(WealthPanel);
    await flushPromises();
    await btn(w, 'we-claim-1').trigger('click');
    await flushPromises();
    expect(endpoints.wealth).toHaveBeenCalledTimes(2);
  });
});
