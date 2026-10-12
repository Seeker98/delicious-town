import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkDto, BulkLotDto, BulkMineDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
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
  blindAt: null,
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
  blindMin: 60,
  openHour: 20,
  coin: 5_000_000,
  lot: lot(),
  mine: null,
  recent: [],
  ...p,
});
/** 出价、怎么算都在 Teleport 到 body 的底部面板里：测试里把 teleport 桩掉（界面改版 P8） */
async function mountPanel() {
  const w = mount(BulkPanel, { global: { stubs: { teleport: true } } });
  await flushPromises();
  return w;
}
type W = Awaited<ReturnType<typeof mountPanel>>;
const el = (w: W, id: string) => w.get(`[data-testid="${id}"]`);
const disabled = (w: W) => el(w, 'bk-submit').attributes('disabled') !== undefined;
const value = (w: W, id: string) => (el(w, id).element as HTMLInputElement).value;
async function setBid(w: W, price: string, qty: string) {
  await el(w, 'bk-price-input').setValue(price);
  await el(w, 'bk-qty-input').setValue(qty);
}
/** 失焦：步进器把空的、低于下限的夹回范围 */
async function blurBoth(w: W) {
  await el(w, 'bk-price-input').trigger('blur');
  await el(w, 'bk-qty-input').trigger('blur');
}
/** 出价表单在面板里：点“出价 / 改出价”打开 */
async function openBid(w: W) {
  await el(w, 'bk-open').trigger('click');
}
/** “怎么算”面板的说明条目 */
async function helpText(w: W) {
  await el(w, 'bk-help').trigger('click');
  return w.get('.dt-help').text();
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
    const w = await mountPanel();
    const text = el(w, 'bk-lot').text();
    expect(text).toContain('共 10 份');
    expect(text).toContain('起拍价 50,000');
    // 标签和数分开写（界面改版 P8）
    expect(el(w, 'bk-price').get('span').text()).toBe('预计成交价');
    expect(el(w, 'bk-price').get('b').text()).toBe('55,000');
    expect(el(w, 'bk-threshold').get('span').text()).toBe('入围门槛');
    expect(el(w, 'bk-threshold').get('b').text()).toBe('55,001');
    expect(el(w, 'bk-demand').text()).toContain('认购 12 / 10 份 · 1.2 倍');
    expect(el(w, 'bk-demand').text()).toContain('3 人参与');
    expect(el(w, 'bk-grouped').text()).toContain('已成团');
    expect(el(w, 'bk-grouped-tag').text()).toBe('已成团');
    expect(text).toContain('最后 5 分钟');
    expect(await helpText(w)).toContain('每人最多认购 4 份');
  });

  it('第一次出价：单价默认填入围门槛、份数 1；写冻结金额、部分入围提醒；确认后提交', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    vi.mocked(endpoints.bulkBid).mockResolvedValue(
      data({ mine: mine({ price: 60_000, qty: 2, frozen: 120_000 }) }),
    );
    const w = await mountPanel();
    expect(el(w, 'bk-open').text()).toBe('出价');
    await openBid(w);
    expect(value(w, 'bk-price-input')).toBe('55001');
    expect(value(w, 'bk-qty-input')).toBe('1');
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
    // 提交成功后面板关上，卡片上写我的出价
    expect(w.find('[data-testid="bk-form"]').exists()).toBe(false);
    expect(el(w, 'bk-mine').text()).toContain('60,000');
  });

  it('改出价：默认填原值，写至少加到多少；降价、减份数、没改、加价不到 1% 时不能提交；只补冻差额', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine() }));
    const w = await mountPanel();
    expect(el(w, 'bk-open').text()).toBe('改出价');
    await openBid(w);
    expect(value(w, 'bk-price-input')).toBe('55000');
    expect(value(w, 'bk-qty-input')).toBe('4');
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
    // 步进器的下限是原来的单价和份数：降价、减份数失焦后退回原值（界面改版 P8）
    await setBid(w, '54000', '3');
    await blurBoth(w);
    expect(value(w, 'bk-price-input')).toBe('55000');
    expect(value(w, 'bk-qty-input')).toBe('4');
    expect(el(w, 'bk-reason').text()).toBe('还没改出价');
    await setBid(w, '55550', '4');
    expect(disabled(w)).toBe(false);
    expect(el(w, 'bk-freeze').text()).toContain('2,200');
  });

  it('预计付款不超过自己的出价；批次已满、出价低于入围门槛时写照现在不入围（终审 I2）', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(
      data({ lot: lot({ qty: 10, demand: 2, price: 2_000, threshold: 1_000, reserve: 1_000 }) }),
    );
    const w = await mountPanel();
    await openBid(w);
    await setBid(w, '1500', '2');
    expect(el(w, 'bk-freeze').text()).toContain('约付 3,000');
    expect(el(w, 'bk-freeze').text()).not.toContain('4,000');
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    const full = await mountPanel();
    await openBid(full);
    await setBid(full, '52000', '2');
    expect(el(full, 'bk-freeze').text()).toContain('照现在的出价不入围');
  });

  it('输入为空、0、小数、超上限、低于起拍价：步进器夹回合法值；冻结差额超过银币时不能提交，写原因', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ coin: 100_000 }));
    const w = await mountPanel();
    await openBid(w);
    // 界面改版 P8 换成步进器：不合法的输入失焦后夹回范围，提交的总是框里的数
    for (const [p, q, wantP, wantQ] of [
      ['', '1', '50000', '1'],
      ['60000', '0', '60000', '1'],
      ['60000.5', '1', '60000', '1'],
      ['60000', '5', '60000', '4'],
      ['49999', '1', '50000', '1'],
    ]) {
      // 一个框打完、失焦再打下一个（测试里 teleport 桩掉后，父组件一更新面板里的步进器就重建，打了一半的字会丢）
      await el(w, 'bk-price-input').setValue(p!);
      await el(w, 'bk-price-input').trigger('blur');
      await el(w, 'bk-qty-input').setValue(q!);
      await el(w, 'bk-qty-input').trigger('blur');
      expect([value(w, 'bk-price-input'), value(w, 'bk-qty-input')]).toEqual([wantP, wantQ]);
    }
    // 60,000 × 2 份 = 120,000，银币只有 100,000
    await setBid(w, '60000', '2');
    expect(disabled(w)).toBe(true);
    expect(el(w, 'bk-reason').text()).toBe('银币不够冻结');
    // 单价超过 10 亿：页面先拦（backlog 大宗认购）
    await setBid(w, '1000000001', '1');
    expect(el(w, 'bk-reason').text()).toBe('单价最多 1,000,000,000');
    await setBid(w, '60000', '1');
    expect(disabled(w)).toBe(false);
    expect(w.find('[data-testid="bk-reason"]').exists()).toBe(false);
  });

  it('冷却中：按钮写还要等几秒、不能提交，到 0 后可以', async () => {
    vi.useFakeTimers();
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine({ cooldownLeft: 3 }) }));
    const w = await mountPanel();
    await openBid(w);
    await setBid(w, '60000', '4');
    expect(el(w, 'bk-submit').text()).toBe('3 秒后可以再出价');
    expect(disabled(w)).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(disabled(w)).toBe(false);
  });

  it('冷却中关掉面板再打开：倒计时接着走，不从头算（P8 终审 I1）', async () => {
    vi.useFakeTimers();
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine({ cooldownLeft: 3 }) }));
    const w = await mountPanel();
    await openBid(w);
    await vi.advanceTimersByTimeAsync(2000);
    await openBid(w);
    await setBid(w, '60000', '4');
    expect(el(w, 'bk-submit').text()).toBe('1 秒后可以再出价');
  });

  it('我的出价：部分入围写 2 / 4 份和再加价能多入围', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ mine: mine() }));
    const w = await mountPanel();
    const t = el(w, 'bk-mine').text();
    expect(t).toContain('入围 2 / 4 份, 再加价可以多入围');
    expect(t).toContain('再加价');
    expect(t).toContain('220,000');
    expect(t).toContain('110,000');
  });

  it('门槛不够：写原因、不能出价；没有进行中的批次：写几点开', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ blocked: 'exchange_level' }));
    const w = await mountPanel();
    expect(el(w, 'bk-blocked').text()).toContain('20');
    // 出价表单在面板里，打开面板的按钮也没有（界面改版 P8）
    expect(w.find('[data-testid="bk-open"]').exists()).toBe(false);
    expect(w.find('[data-testid="bk-submit"]').exists()).toBe(false);
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ lot: null }));
    const w2 = await mountPanel();
    expect(el(w2, 'bk-none').text()).toContain('20');
    // 没有批次时说明不写“0 份”（backlog 大宗认购）
    const help = await helpText(w2);
    expect(help).not.toContain(' 0 份');
    expect(help).toContain('成团份数');
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
    const w = await mountPanel();
    const ok = el(w, 'bk-recent-5').text();
    expect(ok).toContain('53,000');
    expect(ok).toContain('1.2');
    expect(ok).toContain('106,000');
    expect(el(w, 'bk-recent-4').text()).toContain('流拍');
  });

  it('最后阶段停更（问题记录 595）：写明数停在几点；我的入围情况和预计付款不显示；说明里写停更规则', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(
      data({
        lot: lot({ blindAt: '2026-10-13T11:00:00Z' }),
        mine: mine({ won: null, estimate: null }),
      }),
    );
    const w = await mountPanel();
    expect(el(w, 'bk-blind').text()).toContain('收盘后公布');
    const m = el(w, 'bk-mine').text();
    expect(m).toContain('收盘后公布');
    expect(m).not.toContain('入围 2');
    // 不公布不等于没入围：不用红字（终审）；界面改版 P8 换成灰色小标签
    expect(el(w, 'bk-mine-status').classes()).not.toContain('dt-tag-danger');
    expect(el(w, 'bk-mine-status').classes()).toContain('dt-tag-mute');
    expect(m).not.toContain('照现在收盘约付');
    await openBid(w);
    expect(el(w, 'bk-freeze').text()).toContain('收盘后公布');
    expect(await helpText(w)).toContain('最后 60 分钟');
  });

  it('区服不停更（blindMin 0）：说明里没有停更这一条', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data({ blindMin: 0 }));
    const w = await mountPanel();
    const help = await helpText(w);
    expect(help).toContain('随时可能收盘');
    expect(help).not.toContain('停更');
    expect(w.find('[data-testid="bk-blind"]').exists()).toBe(false);
  });

  it('出价失败：报错并重读', async () => {
    vi.mocked(endpoints.bulk).mockResolvedValue(data());
    vi.mocked(endpoints.bulkBid).mockRejectedValue(new Error('x'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountPanel();
    await openBid(w);
    await setBid(w, '60000', '1');
    await el(w, 'bk-submit').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)!.text).toBe('出价失败');
    expect(endpoints.bulk).toHaveBeenCalledTimes(2);
  });
});
