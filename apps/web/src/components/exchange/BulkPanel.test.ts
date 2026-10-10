import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkDto, BulkLotDto, BulkMineDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import BulkPanel from './BulkPanel.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: { bulk: vi.fn(), bulkBid: vi.fn() },
}));

const lot = (p: Partial<BulkLotDto> = {}): BulkLotDto => ({
  id: 7,
  foodsId: 31,
  level: 3,
  qty: 10,
  reserve: 50_000,
  cap: 4,
  groupQty: 3,
  opensAt: '2026-10-12T12:00:00Z',
  endsAt: '2026-10-13T12:00:00Z',
  price: 55_000,
  threshold: 55_001,
  demand: 12,
  bidders: 3,
  grouped: true,
  ...p,
});
const mine = (p: Partial<BulkMineDto> = {}): BulkMineDto => ({
  price: 55_000,
  qty: 4,
  frozen: 220_000,
  won: 2,
  estimate: 110_000,
  cooldownLeft: 0,
  ...p,
});
const data = (p: Partial<BulkDto> = {}): BulkDto => ({
  enabled: true,
  blocked: null,
  needLevel: 20,
  needDays: 7,
  cooldownSec: 5,
  minRaise: 0.01,
  closeWindowMin: 5,
  openHour: 20,
  coin: 5_000_000,
  lot: lot(),
  mine: null,
  recent: [],
  ...p,
});
const el = (w: ReturnType<typeof mount>, id: string) => w.get(`[data-testid="${id}"]`);
const disabled = (w: ReturnType<typeof mount>) => el(w, 'bk-submit').attributes('disabled') !== undefined;
async function setBid(w: ReturnType<typeof mount>, price: string, qty: string) {
  await el(w, 'bk-price-input').setValue(price);
  await el(w, 'bk-qty-input').setValue(qty);
}

describe('BulkPanel（大宗认购设计 §3.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.useRealTimers());

  it('批次看板：份数、起拍价、预计成交价、入围门槛、认购倍数、成团、随机收盘的说明', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    const w = mount(BulkPanel);
    await flushPromises();
    const text = el(w, 'bk-lot').text();
    expect(text).toContain('10');
    expect(text).toContain('50,000');
    expect(el(w, 'bk-price').text()).toContain('55,000');
    expect(el(w, 'bk-threshold').text()).toContain('55,001');
    expect(el(w, 'bk-demand').text()).toContain('1.2');
    expect(el(w, 'bk-grouped').text()).toContain('已成团');
    expect(text).toContain('最后 5 分钟');
    expect(el(w, 'bk-help').text()).toContain('4 份');
  });

  it('第一次出价：单价默认填入围门槛、份数 1；写冻结金额、部分入围提醒；确认后提交', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    vi.mocked(endpoints.bulkBid).mockResolvedValue(
      data({ mine: mine({ price: 60_000, qty: 2, frozen: 120_000 }) }),
    );
    const w = mount(BulkPanel);
    await flushPromises();
    expect((el(w, 'bk-price-input').element as HTMLInputElement).value).toBe('55001');
    expect((el(w, 'bk-qty-input').element as HTMLInputElement).value).toBe('1');
    await setBid(w, '60000', '2');
    expect(el(w, 'bk-freeze').text()).toContain('120,000');
    expect(el(w, 'bk-partial-hint').text()).toContain('部分');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await el(w, 'bk-submit').trigger('click');
    expect(endpoints.bulkBid).not.toHaveBeenCalled();
    await el(w, 'bk-submit').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[1]![0]).toContain('120,000');
    expect(endpoints.bulkBid).toHaveBeenCalledWith({ lotId: 7, price: 60_000, qty: 2 });
    expect(el(w, 'bk-mine').text()).toContain('60,000');
  });

  it('改出价：默认填原值，写至少加到多少；降价、减份数、没改、加价不到 1% 时不能提交；只补冻差额', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine() }));
    const w = mount(BulkPanel);
    await flushPromises();
    expect((el(w, 'bk-price-input').element as HTMLInputElement).value).toBe('55000');
    expect(el(w, 'bk-min-raise').text()).toContain('55,550');
    expect(disabled(w)).toBe(true);
    for (const [p, q] of [
      ['54000', '4'],
      ['55000', '3'],
      ['55400', '4'],
      ['55000', '4'],
    ]) {
      await setBid(w, p!, q!);
      expect(disabled(w)).toBe(true);
    }
    await setBid(w, '55550', '4');
    expect(disabled(w)).toBe(false);
    expect(el(w, 'bk-freeze').text()).toContain('2,200');
  });

  it('预计付款不超过自己的出价；批次已满、出价低于入围门槛时写照现在不入围（终审 I2）', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(
      data({ lot: lot({ qty: 10, demand: 2, price: 2_000, threshold: 1_000, reserve: 1_000 }) }),
    );
    const w = mount(BulkPanel);
    await flushPromises();
    await setBid(w, '1500', '2');
    expect(el(w, 'bk-freeze').text()).toContain('约付 3,000');
    expect(el(w, 'bk-freeze').text()).not.toContain('4,000');
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    const full = mount(BulkPanel);
    await flushPromises();
    await setBid(full, '52000', '2');
    expect(el(full, 'bk-freeze').text()).toContain('照现在的出价不入围');
  });

  it('输入为空、0、小数、超上限、低于起拍价、冻结差额超过银币时不能提交，写原因', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ coin: 100_000 }));
    const w = mount(BulkPanel);
    await flushPromises();
    for (const [p, q] of [
      ['', '1'],
      ['60000', '0'],
      ['60000.5', '1'],
      ['60000', '5'],
      ['49999', '1'],
      ['60000', '2'],
    ]) {
      await setBid(w, p!, q!);
      expect(disabled(w)).toBe(true);
      expect(w.find('[data-testid="bk-reason"]').exists()).toBe(true);
    }
    await setBid(w, '60000', '1');
    expect(disabled(w)).toBe(false);
  });

  it('冷却中：按钮写还要等几秒、不能提交，到 0 后可以', async () => {
    vi.useFakeTimers();
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine({ cooldownLeft: 3 }) }));
    const w = mount(BulkPanel);
    await flushPromises();
    await setBid(w, '60000', '4');
    expect(el(w, 'bk-submit').text()).toContain('3');
    expect(disabled(w)).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(disabled(w)).toBe(false);
  });

  it('我的出价：部分入围写 2 / 4 份和再加价能多入围', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine() }));
    const w = mount(BulkPanel);
    await flushPromises();
    const t = el(w, 'bk-mine').text();
    expect(t).toContain('入围 2 / 4 份, 再加价可以多入围');
    expect(t).toContain('再加价');
    expect(t).toContain('220,000');
    expect(t).toContain('110,000');
  });

  it('门槛不够：写原因、不能出价；没有进行中的批次：写几点开', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ blocked: 'exchange_level' }));
    const w = mount(BulkPanel);
    await flushPromises();
    expect(el(w, 'bk-blocked').text()).toContain('20');
    expect(w.find('[data-testid="bk-submit"]').exists()).toBe(false);
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ lot: null }));
    const w2 = mount(BulkPanel);
    await flushPromises();
    expect(el(w2, 'bk-none').text()).toContain('20');
  });

  it('最近结果：成交价、份数、认购倍数、我的结果；流拍写全额退回', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(
      data({
        recent: [
          {
            id: 5,
            foodsId: 31,
            level: 3,
            qty: 10,
            sold: 10,
            price: 53_000,
            demand: 12,
            status: 'settled',
            endsAt: '2026-10-12T12:00:00Z',
            mine: { qty: 2, won: 2, paid: 106_000, refunded: 14_000, consolation: false },
          },
          {
            id: 4,
            foodsId: 31,
            level: 3,
            qty: 10,
            sold: 0,
            price: null,
            demand: 2,
            status: 'failed',
            endsAt: '2026-10-11T12:00:00Z',
            mine: { qty: 2, won: 0, paid: 0, refunded: 120_000, consolation: false },
          },
        ],
      }),
    );
    const w = mount(BulkPanel);
    await flushPromises();
    const ok = el(w, 'bk-recent-5').text();
    expect(ok).toContain('53,000');
    expect(ok).toContain('1.2');
    expect(ok).toContain('106,000');
    expect(el(w, 'bk-recent-4').text()).toContain('流拍');
  });

  it('出价失败：报错并重读', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    vi.mocked(endpoints.bulkBid).mockRejectedValue(new Error('x'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(BulkPanel);
    await flushPromises();
    await setBid(w, '60000', '1');
    await el(w, 'bk-submit').trigger('click');
    await flushPromises();
    expect(endpoints.bulk).toHaveBeenCalledTimes(2);
  });
});
