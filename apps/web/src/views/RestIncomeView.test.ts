import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuffsDto, IncomePageDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import RestIncomeView from './RestIncomeView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { income: vi.fn(), buffs: vi.fn() } }));

const page: IncomePageDto = {
  items: [
    {
      roundNo: 2,
      coin: 12345,
      exp: 678,
      oil: 9,
      customers: { '0': 2, '1': 3, '2': 1, '3': 1, '8': 1 },
      at: '2026-10-08T04:04:00Z',
    },
  ],
  nextBefore: null,
  today: { rounds: 30, coin: 123456, exp: 7890, oil: 240 },
};
const buffs = {
  roundNo: 2,
  seated: 4,
  rates: {
    atRate: { total: 1, parts: { base: 0.3 } },
    spRate: { total: 0, parts: {} },
  },
  sources: [{ sourceType: 'honor', sourceId: 1, name: '开张大吉', effects: { atRate: 0.25 } }],
} as unknown as BuffsDto;

describe('收益记录页（问题记录 530）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.income).mockResolvedValue(page);
    vi.mocked(endpoints.buffs).mockResolvedValue(buffs);
  });

  it('记录和加成一起读，不等记录回来（性能排查 2026-10-08）', async () => {
    vi.mocked(endpoints.income).mockReturnValue(new Promise(() => undefined));
    mount(RestIncomeView);
    await flushPromises();
    expect(endpoints.buffs).toHaveBeenCalled();
  });

  it('加成默认收起，放在最上面；下面是收益记录，先写今天的小计（问题记录 551）', async () => {
    const w = mount(RestIncomeView);
    await flushPromises();
    const html = w.html();
    expect(html.indexOf('data-testid="income-buffs"')).toBeLessThan(
      html.indexOf('data-testid="income-records"'),
    );
    expect(w.get('[data-testid="income-buffs"]').attributes('open')).toBeUndefined();
    expect(w.get('[data-testid="income-today"]').text()).toBe(
      '今天 30 轮 · 银币 123,456 · 经验 7,890 · 耗油 240',
    );
  });

  it('表格多一列客人（付钱的客人数，不算空桌、蟑螂），数字右对齐、有千分位', async () => {
    const w = mount(RestIncomeView);
    await flushPromises();
    expect(w.findAll('thead th').map((x) => x.text())).toEqual(['时间', '客人', '银币', '经验', '耗油']);
    const cells = w.findAll('tbody tr')[0]!.findAll('td');
    expect(cells.map((x) => x.text()).slice(1)).toEqual(['5', '12,345', '678', '9']);
    expect(cells[2]!.classes()).toContain('text-end');
  });

  it('客人列只算付钱的：白食(9)、被赶走的(-3)也不算（530 遗留：缺的测试）', async () => {
    vi.mocked(endpoints.income).mockResolvedValue({
      ...page,
      items: [{ ...page.items[0]!, customers: { '1': 2, '7': 1, '9': 4, '-3': 2, '0': 1 } }],
    });
    const w = mount(RestIncomeView);
    await flushPromises();
    expect(w.findAll('tbody tr')[0]!.findAll('td')[1]!.text()).toBe('3');
  });

  it('接口没给今日小计（旧服务端）：不写那一行，记录照常（530 遗留：缺的测试）', async () => {
    const { today: _, ...noToday } = page;
    vi.mocked(endpoints.income).mockResolvedValue(noToday);
    const w = mount(RestIncomeView);
    await flushPromises();
    expect(w.find('[data-testid="income-today"]').exists()).toBe(false);
    expect(w.findAll('tbody tr')).toHaveLength(1);
  });

  it('不是今天（北京时间）的记录带日期（终审 M3：0 点后第一页会混进昨天的）', async () => {
    vi.mocked(endpoints.income).mockResolvedValue({
      ...page,
      items: [{ ...page.items[0]!, roundNo: 1, at: '2026-10-06T04:04:00Z' }],
    });
    const w = mount(RestIncomeView);
    await flushPromises();
    expect(w.findAll('tbody tr')[0]!.findAll('td')[0]!.text()).toContain('10/06');
  });

  it('合计正好是 0、分项不是 0 的照样列出（终审 M5：天气扣的看得到）', async () => {
    vi.mocked(endpoints.buffs).mockResolvedValue({
      ...buffs,
      rates: { ...buffs.rates, spRate: { total: 0, parts: { base: 0.1, weather: -0.1 } } },
    } as never);
    const w = mount(RestIncomeView);
    await flushPromises();
    expect(w.get('[data-testid="income-buffs"]').text()).toContain('挑剔率');
  });

  it('加成收在一个默认收起的区块里，只列不是 0 的项', async () => {
    const w = mount(RestIncomeView);
    await flushPromises();
    const box = w.get('[data-testid="income-buffs"]');
    expect(box.element.tagName).toBe('DETAILS');
    expect((box.element as HTMLDetailsElement).open).toBe(false);
    expect(box.text()).toContain('上座率');
    expect(box.text()).not.toContain('挑剔率');
    expect(box.text()).toContain('开张大吉');
  });
});
