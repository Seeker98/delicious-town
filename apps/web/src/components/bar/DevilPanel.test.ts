import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevilDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import DevilPanel from './DevilPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barDevilStart: vi.fn(), barDevilDrink: vi.fn() } }));

const round = (patch: Partial<DevilDto> = {}): DevilDto => ({
  stake: 5,
  cups: [null, null, null, null, null, null],
  survived: 0,
  result: null,
  spiked: null,
  payout: 0,
  hangoverUntil: null,
  lastBartender: null,
  ...patch,
});

describe('DevilPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有局时选押注开局；礼券不够的押注灰掉', async () => {
    vi.mocked(endpoints.barDevilStart).mockResolvedValue(round({ stake: 1 }));
    const w = mount(DevilPanel, { props: { data: barData({ tickets: 6 }) } });
    expect(w.find('[data-testid="devil-stake-10"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="devil-stake-5"]').attributes('disabled')).toBeUndefined();
    // 默认选第一档押得起的；点押注只是选中，按“开喝”才开局（界面改版 P9）
    expect(w.find('[data-testid="devil-stake-1"]').attributes('aria-checked')).toBe('true');
    await w.find('[data-testid="devil-stake-5"]').trigger('click');
    expect(w.find('[data-testid="devil-stake-5"]').attributes('aria-checked')).toBe('true');
    expect(w.find('[data-testid="devil-stake-1"]').attributes('aria-checked')).toBe('false');
    expect(endpoints.barDevilStart).not.toHaveBeenCalled();
    expect(w.find('[data-testid="devil-start"]').text()).toBe('押 5 张, 开喝');
    await w.find('[data-testid="devil-stake-1"]').trigger('click');
    await w.find('[data-testid="devil-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDevilStart).toHaveBeenCalledWith(1);
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.findAll('[data-testid^="devil-cup-"]')).toHaveLength(6);
    // 一档都押不起：开局按钮也灰掉，写明哪些押不起
    const poor = mount(DevilPanel, { props: { data: barData({ tickets: 0 }) } });
    expect(poor.find('[data-testid="devil-stake-1"]').attributes('disabled')).toBeDefined();
    expect(poor.find('[data-testid="devil-start"]').attributes('disabled')).toBeDefined();
    expect(poor.text()).toContain('押 1, 5, 10, 20 张: 神秘礼券不够');
  });

  it('显示今天的局数和赔付表（2026-10-09）；局数用完时开局按钮灰掉', async () => {
    const w = mount(DevilPanel, { props: { data: barData() }, global: { stubs: { teleport: true } } });
    expect(w.find('[data-testid="devil-played"]').text()).toContain('3/20');
    const rows = w.findAll('[role="radio"]');
    expect(rows).toHaveLength(4);
    expect(rows[3]!.findAll('[data-testid="devil-payout-row"]').map((c) => c.text())).toEqual([
      '27',
      '36',
      '49',
    ]);
    expect(rows[3]!.text()).toContain('押 20 张');
    expect(w.text()).not.toContain('1.4');
    // 玩法面板里也有一张完整的赔付表
    await w.find('[data-testid="bar-rules-open"]').trigger('click');
    const table = w.find('[data-testid="devil-payouts"]');
    expect(table.findAll('tbody tr')).toHaveLength(4);
    expect(table.findAll('tbody tr')[3]!.text()).toBe('20273649');
    expect(table.find('thead').text()).toContain('活过 3 杯');
    const full = mount(DevilPanel, {
      props: { data: barData({ devil: { ...barData().devil, played: 20 } }) },
    });
    expect(full.find('[data-testid="devil-start"]').attributes('disabled')).toBeDefined();
    expect(full.text()).toContain('今天的局数用完了');
  });

  it('进行中：喝过的杯不能点，点一杯就喝；调酒师没事时提示轮到你', async () => {
    const data = barData();
    data.devil.round = round({ cups: ['me', 'bartender', null, null, null, null], survived: 1 });
    vi.mocked(endpoints.barDevilDrink).mockResolvedValue(
      round({ cups: ['me', 'bartender', 'me', 'bartender', null, null], survived: 2, lastBartender: 3 }),
    );
    const w = mount(DevilPanel, { props: { data } });
    // 说明卡写押了多少、活过几杯，副标题写再活过几杯拿回多少
    expect(w.find('[data-testid="bar-info-title"]').text()).toBe('押 5 张 · 你已经活过 1 杯');
    expect(w.find('[data-testid="bar-info-sub"]').text()).toBe('活过 2 杯拿回 9 张, 活过 3 杯拿回 12 张');
    expect(w.find('[data-testid="devil-cup-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="devil-cup-1"]').text()).toContain('调酒师');
    await w.find('[data-testid="devil-cup-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDevilDrink).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="devil-status"]').text()).toBe(
      '你喝了 3 号杯, 没事；调酒师接着喝了 4 号杯, 也没事。轮到你了',
    );
    // 父组件刷新概览后提示不能被冲掉（终审 I1）：概览里的局面没有 lastBartender
    const fresh = barData();
    fresh.devil.round = round({ cups: ['me', 'bartender', 'me', 'bartender', null, null], survived: 2 });
    await w.setProps({ data: fresh });
    expect(w.find('[data-testid="devil-status"]').text()).toBe(
      '你喝了 3 号杯, 没事；调酒师接着喝了 4 号杯, 也没事。轮到你了',
    );
  });

  it('赢：亮出特辣酒，提示赢得的礼券；可以再来一局', async () => {
    const data = barData();
    data.devil.round = round();
    vi.mocked(endpoints.barDevilDrink).mockResolvedValue(
      round({
        cups: ['me', null, null, null, null, 'bartender'],
        survived: 1,
        result: 'win',
        spiked: 5,
        payout: 7,
      }),
    );
    const w = mount(DevilPanel, { props: { data } });
    await w.find('[data-testid="devil-cup-0"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="devil-result"] b').text()).toBe(
      '调酒师喝到了特辣酒！你活过 1 杯, 赢得 7 张神秘礼券',
    );
    expect(w.find('[data-testid="devil-cup-5"]').classes()).toContain('is-spiked');
    expect(w.find('[data-testid="devil-result"]').attributes('aria-live')).toBe('polite');
    // 结束后没喝的杯子变灰（PR28 遗留）
    expect(w.find('[data-testid="devil-cup-1"]').classes()).toContain('is-left');
    expect(w.find('[data-testid="devil-cup-0"]').classes()).not.toContain('is-left');
    await w.find('[data-testid="devil-again"]').trigger('click');
    expect(w.find('[data-testid="devil-stake-1"]').exists()).toBe(true);
  });

  it('输：提示押注没了和宿醉', async () => {
    const data = barData();
    data.devil.round = round();
    vi.mocked(endpoints.barDevilDrink).mockResolvedValue(
      round({
        cups: ['me', null, null, null, null, null],
        result: 'lose',
        spiked: 0,
        hangoverUntil: '2026-09-30T05:00:00.000Z',
      }),
    );
    const w = mount(DevilPanel, { props: { data } });
    await w.find('[data-testid="devil-cup-0"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="devil-result"]').text()).toContain('你喝到了特辣酒, 5 张押注没了');
    expect(w.find('[data-testid="devil-result"]').text()).toContain('宿醉');
  });

  it('局在别处已经结束：清空局面并刷新（PR28 遗留）', async () => {
    const data = barData();
    data.devil.round = round({ cups: ['me', 'bartender', null, null, null, null], survived: 1 });
    vi.mocked(endpoints.barDevilDrink).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'no_round' }),
    );
    const w = mount(DevilPanel, { props: { data } });
    await w.find('[data-testid="devil-cup-2"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="devil-cup-2"]').exists()).toBe(false);
  });

  it('喝失败时状态行不说"你喝了几号杯"（终审）', async () => {
    const data = barData();
    data.devil.round = round({
      cups: ['me', 'bartender', null, null, null, null],
      survived: 1,
      lastBartender: 1,
    });
    vi.mocked(endpoints.barDevilDrink).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'cup_taken' }),
    );
    const w = mount(DevilPanel, { props: { data } });
    await w.find('[data-testid="devil-cup-3"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="devil-status"]').text()).not.toContain('你喝了 4 号杯');
  });

  it('礼券变少后选中的押注押不起了：换成押得起的最高一档；方向键在押得起的几档之间移动（P9 终审 M3）', async () => {
    const w = mount(DevilPanel, { props: { data: barData({ tickets: 30 }) }, attachTo: document.body });
    await w.find('[data-testid="devil-stake-20"]').trigger('click');
    await w.setProps({ data: barData({ tickets: 6 }) });
    expect(w.find('[data-testid="devil-stake-5"]').attributes('aria-checked')).toBe('true');
    // 只有选中的那档在 Tab 顺序里
    expect(w.find('[data-testid="devil-stake-5"]').attributes('tabindex')).toBe('0');
    expect(w.find('[data-testid="devil-stake-1"]').attributes('tabindex')).toBe('-1');
    await w.find('[data-testid="devil-stake-5"]').trigger('keydown', { key: 'ArrowUp' });
    expect(w.find('[data-testid="devil-stake-1"]').attributes('aria-checked')).toBe('true');
    // 下面那档押不起：方向键停在原处
    await w.find('[data-testid="devil-stake-1"]').trigger('keydown', { key: 'ArrowDown' });
    await w.find('[data-testid="devil-stake-5"]').trigger('keydown', { key: 'ArrowDown' });
    expect(w.find('[data-testid="devil-stake-5"]').attributes('aria-checked')).toBe('true');
    w.unmount();
  });
});
