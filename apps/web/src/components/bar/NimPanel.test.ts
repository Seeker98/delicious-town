import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NimDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import NimPanel from './NimPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { barNimStart: vi.fn(), barNimFirst: vi.fn(), barNimTake: vi.fn() },
}));

const round = (patch: Partial<NimDto> = {}): NimDto => ({
  table: 'novice',
  k: 3,
  pile: 12,
  left: 12,
  log: [],
  needFirst: false,
  coin: null,
  result: null,
  renown: 0,
  award: null,
  ...patch,
});
const withRound = (r: NimDto | null, patch: Partial<ReturnType<typeof barData>['nim']> = {}) => {
  const data = barData();
  data.nim = { ...data.nim, ...patch, round: r };
  return data;
};

/** 画出来的糖果个数 */
const candies = (w: ReturnType<typeof mount>) => w.findAll('.dt-nim-candies svg');

describe('NimPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.useRealTimers());

  it('没有局时列出两张桌子：入场费、每次最多拿几颗、奖励；今天还能玩几局；点了开局', async () => {
    vi.mocked(endpoints.barNimStart).mockResolvedValue(round({ needFirst: true }));
    const w = mount(NimPanel, { props: { data: withRound(null, { played: 3 }) } });
    expect(w.get('[data-testid="bar-info-sub"]').text()).toBe('今天还能玩 7 局');
    const novice = w.get('[data-testid="nim-table-novice"]');
    expect(novice.text()).toContain('新手桌');
    expect(novice.text()).toContain('入场 1 张 · 每次最多拿 3 颗');
    expect(novice.text()).toContain('赢了声望 +1, 还有一份奖励');
    expect(w.get('[data-testid="nim-table-expert"]').text()).toContain('入场 2 张');
    expect(w.get('[data-testid="nim-table-expert"]').text()).toContain('声望 +3');
    expect(w.get('[data-testid="nim-table-expert"]').text()).toContain('每次最多拿 3~5 颗');
    await w.get('[data-testid="nim-start-novice"]').trigger('click');
    await flushPromises();
    expect(endpoints.barNimStart).toHaveBeenCalledWith('novice');
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="nim-first-me"]').exists()).toBe(true);
  });

  it('桌子说明跟着区服数值走：先后怎么定、调酒师会不会走神（#190 审查）', () => {
    const data = withRound(null);
    data.nim.tables.novice = { ...data.nim.tables.novice, first: 'coin', careless: false };
    const w = mount(NimPanel, { props: { data } });
    expect(w.get('[data-testid="nim-table-novice"]').text()).toContain('开局抛硬币定先后 · 调酒师从不失手');
    expect(w.get('[data-testid="nim-table-expert"]').text()).toContain('开局抛硬币定先后 · 调酒师从不失手');
    data.nim.tables.novice = { ...data.nim.tables.novice, first: 'choose', careless: true };
    const v = mount(NimPanel, { props: { data } });
    expect(v.get('[data-testid="nim-table-novice"]').text()).toContain('你自己选先后 · 调酒师有时会走神');
  });

  it('次数用完或礼券不够时开局按钮灰掉并写原因', () => {
    const used = mount(NimPanel, { props: { data: withRound(null, { played: 10 }) } });
    expect(used.get('[data-testid="nim-start-novice"]').attributes('disabled')).toBeDefined();
    expect(used.get('[data-testid="bar-info-sub"]').text()).toBe('今天的局数用完了');
    expect(used.get('[data-testid="nim-table-novice"]').text()).toContain('今天的局数用完了');
    const data = withRound(null);
    data.tickets = 1;
    const poor = mount(NimPanel, { props: { data } });
    expect(poor.get('[data-testid="nim-start-novice"]').attributes('disabled')).toBeUndefined();
    expect(poor.get('[data-testid="nim-start-expert"]').attributes('disabled')).toBeDefined();
    expect(poor.get('[data-testid="nim-table-expert"]').text()).toContain('神秘礼券不够');
  });

  it('新手桌要先选先后：只有两个按钮，点了调用接口', async () => {
    vi.mocked(endpoints.barNimFirst).mockResolvedValue(round());
    const w = mount(NimPanel, { props: { data: withRound(round({ needFirst: true })) } });
    expect(w.findAll('[data-testid^="nim-take-"]')).toHaveLength(0);
    await w.get('[data-testid="nim-first-me"]').trigger('click');
    await flushPromises();
    expect(endpoints.barNimFirst).toHaveBeenCalledWith('me');
    expect(w.findAll('[data-testid^="nim-take-"]')).toHaveLength(3);
    expect(w.find('[data-testid="nim-first-me"]').exists()).toBe(false);
  });

  it('进行中：画剩余的糖果；拿的按钮超过剩余的灰掉；点了拿', async () => {
    vi.mocked(endpoints.barNimTake).mockResolvedValue(round({ left: 0, result: 'win', renown: 1 }));
    const w = mount(NimPanel, { props: { data: withRound(round({ left: 2 })) } });
    expect(candies(w)).toHaveLength(2);
    expect(w.get('[data-testid="nim-status"] b').text()).toBe('2');
    expect(w.get('[data-testid="nim-status"]').text()).toBe('还剩2颗');
    expect(w.get('[data-testid="bar-info-title"]').text()).toBe('新手桌 · 每次拿 1~3 颗');
    expect(w.get('[data-testid="nim-live"]').text()).toBe('还剩 2 颗, 每次拿 1~3 颗');
    // 拿的按钮只写数字，读屏标签写全
    expect(w.get('[data-testid="nim-take-2"]').text()).toBe('2');
    expect(w.get('[data-testid="nim-take-2"]').attributes('aria-label')).toBe('拿 2 颗');
    expect(w.get('[data-testid="nim-take-2"]').attributes('disabled')).toBeUndefined();
    expect(w.get('[data-testid="nim-take-3"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="nim-take-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.barNimTake).toHaveBeenCalledWith(2);
  });

  it('调酒师的那一步晚 0.6 秒显示，期间按钮不能点', async () => {
    vi.useFakeTimers();
    vi.mocked(endpoints.barNimTake).mockResolvedValue(
      round({
        left: 8,
        log: [
          { who: 'me', take: 1 },
          { who: 'bartender', take: 3 },
        ],
      }),
    );
    const w = mount(NimPanel, { props: { data: withRound(round()) } });
    await w.get('[data-testid="nim-take-1"]').trigger('click');
    await flushPromises();
    expect(candies(w)).toHaveLength(11);
    expect(w.get('[data-testid="nim-status"] b').text()).toBe('11');
    expect(w.get('[data-testid="nim-take-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="nim-bartender"]').exists()).toBe(false);
    vi.advanceTimersByTime(600);
    await flushPromises();
    expect(candies(w)).toHaveLength(8);
    expect(w.get('[data-testid="nim-status"] b').text()).toBe('8');
    expect(w.get('[data-testid="nim-bartender"]').text()).toBe('调酒师拿了 3 颗, 轮到你了');
    // 固定的播报区念出调酒师那一步和剩余（#190 审查）
    expect(w.get('[data-testid="nim-live"]').text()).toBe(
      '调酒师拿了 3 颗, 轮到你了 还剩 8 颗, 每次拿 1~3 颗',
    );
    expect(w.get('[data-testid="nim-take-1"]').attributes('disabled')).toBeUndefined();
    const log = w.findAll('[data-testid="nim-log"] span');
    expect(log.map((x) => x.text())).toEqual(['你 1', '调酒师 3']);
    expect(log[0]!.classes()).toContain('is-me');
    expect(log[1]!.classes()).not.toContain('is-me');
  });

  it('概览晚到、还是旧局面时不覆盖手上的局面（#191 审查）', async () => {
    vi.mocked(endpoints.barNimTake).mockResolvedValue(round({ left: 10, log: [{ who: 'me', take: 2 }] }));
    const w = mount(NimPanel, { props: { data: withRound(round()) } });
    await w.get('[data-testid="nim-take-2"]').trigger('click');
    await flushPromises();
    await w.setProps({ data: withRound(round()) });
    expect(candies(w)).toHaveLength(10);
  });

  it('播报区一直在（没开局时也在），开局后第一条播报才念得出来（终审）', () => {
    const w = mount(NimPanel, { props: { data: withRound(null) } });
    expect(w.find('[data-testid="nim-live"]').exists()).toBe(true);
  });

  it('高手桌写抛硬币的结果', () => {
    const w = mount(NimPanel, {
      props: {
        data: withRound(
          round({
            table: 'expert',
            coin: 'bartender',
            pile: 30,
            left: 28,
            log: [{ who: 'bartender', take: 2 }],
          }),
        ),
      },
    });
    expect(w.get('[data-testid="bar-info-sub"]').text()).toBe('抛硬币: 调酒师先拿');
    expect(w.get('[data-testid="bar-info-title"]').text()).toBe('高手桌 · 每次拿 1~3 颗');
  });

  it('结束：写输赢和声望，有再来一局', async () => {
    vi.mocked(endpoints.barNimTake).mockResolvedValue(
      round({ left: 0, result: 'win', renown: 1, award: { kind: 'coin', id: null, num: 500, lucky: false } }),
    );
    const w = mount(NimPanel, { props: { data: withRound(round({ left: 2 })) } });
    await w.get('[data-testid="nim-take-2"]').trigger('click');
    await flushPromises();
    const res = w.get('[data-testid="nim-result"]');
    expect(res.find('b').text()).toBe('你拿到了最后一颗！声望 +1');
    expect(res.classes()).toContain('is-ok');
    expect(res.findAll('[data-testid="award-chip"]').map((c) => c.text())).toEqual(['银币 500']);
    expect(w.find('[data-testid^="nim-take-"]').exists()).toBe(false);
    expect(w.get('[data-testid="nim-live"]').text()).toContain('你拿到了最后一颗！声望 +1');
    // 结束后不再写“还剩 0 颗”
    expect(w.find('[data-testid="nim-status"]').exists()).toBe(false);
    await w.get('[data-testid="nim-again"]').trigger('click');
    expect(w.find('[data-testid="nim-start-novice"]').exists()).toBe(true);
  });

  it('局已经没了（no_round）：清掉局面、重新读', async () => {
    vi.mocked(endpoints.barNimTake).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'no_round' }));
    const w = mount(NimPanel, { props: { data: withRound(round()) } });
    await w.get('[data-testid="nim-take-1"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="nim-start-novice"]').exists()).toBe(true);
  });

  it('别的错误（另一个标签页已经开了局、局面变了）：也重新读局面，不停在旧画面', async () => {
    vi.mocked(endpoints.barNimTake).mockRejectedValue(new ApiError('VALIDATION_FAILED', { reason: 'num' }));
    const w = mount(NimPanel, { props: { data: withRound(round({ left: 12 })) } });
    await w.get('[data-testid="nim-take-3"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    // 概览读回来的新局面能顶掉旧画面
    await w.setProps({ data: withRound(round({ left: 4 })) });
    expect(candies(w)).toHaveLength(4);
  });
});
