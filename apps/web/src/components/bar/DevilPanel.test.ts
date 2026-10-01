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
    const w = mount(DevilPanel, { props: { data: barData({ tickets: 3 }) } });
    expect(w.find('[data-testid="devil-stake-5"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="devil-stake-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDevilStart).toHaveBeenCalledWith(1);
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.findAll('[data-testid^="devil-cup-"]')).toHaveLength(6);
  });

  it('进行中：喝过的杯不能点，点一杯就喝；调酒师没事时提示轮到你', async () => {
    const data = barData();
    data.devil.round = round({ cups: ['me', 'bartender', null, null, null, null], survived: 1 });
    vi.mocked(endpoints.barDevilDrink).mockResolvedValue(
      round({ cups: ['me', 'bartender', 'me', 'bartender', null, null], survived: 2, lastBartender: 3 }),
    );
    const w = mount(DevilPanel, { props: { data } });
    expect(w.find('[data-testid="devil-cup-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="devil-cup-1"]').text()).toContain('调酒师');
    await w.find('[data-testid="devil-cup-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDevilDrink).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="devil-status"]').text()).toBe('调酒师喝了 4 号杯，没事。轮到你了');
    // 父组件刷新概览后提示不能被冲掉（终审 I1）：概览里的局面没有 lastBartender
    const fresh = barData();
    fresh.devil.round = round({ cups: ['me', 'bartender', 'me', 'bartender', null, null], survived: 2 });
    await w.setProps({ data: fresh });
    expect(w.find('[data-testid="devil-status"]').text()).toBe('调酒师喝了 4 号杯，没事。轮到你了');
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
    expect(w.find('[data-testid="devil-result"]').text()).toBe(
      '调酒师喝到了特辣酒！你活过 1 杯，赢得 7 张神秘礼券',
    );
    expect(w.find('[data-testid="devil-cup-5"]').classes()).toContain('dt-cup-spiked');
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
    expect(w.find('[data-testid="devil-result"]').text()).toContain('你喝到了特辣酒，5 张押注没了');
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
});
