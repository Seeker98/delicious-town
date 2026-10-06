import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DealDto, DealPrizeDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import DealPanel from './DealPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { barDealStart: vi.fn(), barDealPick: vi.fn(), barDealOpen: vi.fn(), barDealAnswer: vi.fn() },
}));

const P = (value: number): DealPrizeDto => ({ foodsId: 101, num: 2, value });
const round = (patch: Partial<DealDto> = {}): DealDto => ({
  count: 10,
  mine: null,
  round: 0,
  toOpen: 3,
  opened: [],
  left: [P(70000), P(1200)],
  offer: null,
  result: null,
  coin: 0,
  prize: null,
  all: null,
  fridge: 0,
  dropped: 0,
  ...patch,
});
const withRound = (r: DealDto | null, patch: Partial<ReturnType<typeof barData>['deal']> = {}) => {
  const data = barData();
  data.deal = { ...data.deal, ...patch, round: r };
  return data;
};

describe('DealPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有局时写规则、奖品表、今天还能玩几局；点了开局', async () => {
    vi.mocked(endpoints.barDealStart).mockResolvedValue(round());
    const data = withRound(null, { played: 1 });
    data.coin = 50_000;
    const w = mount(DealPanel, { props: { data } });
    expect(w.text()).toContain('小镇银行家');
    expect(w.text()).toContain('今天还能玩 2 局');
    expect(w.findAll('[data-testid^="deal-prize-"]')).toHaveLength(10);
    expect(w.get('[data-testid="deal-prize-0"]').text()).toBe('1 级食材×1');
    expect(w.get('[data-testid="deal-start"]').text()).toContain('10,000');
    await w.get('[data-testid="deal-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDealStart).toHaveBeenCalled();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.findAll('[data-testid^="deal-box-"]')).toHaveLength(10);
    expect(w.text()).toContain('选一个箱子当你的箱子');
  });

  it('次数用完或银币不够：开局按钮灰掉并写原因', () => {
    const used = mount(DealPanel, { props: { data: withRound(null, { played: 3 }) } });
    expect(used.get('[data-testid="deal-start"]').attributes('disabled')).toBeDefined();
    expect(used.text()).toContain('今天的局数用完了');
    const poor = mount(DealPanel, { props: { data: withRound(null) } });
    expect(poor.get('[data-testid="deal-start"]').attributes('disabled')).toBeDefined();
    expect(poor.text()).toContain('银币不够');
  });

  it('选箱子：点了调用 pick；选好后自己的箱子标“你的”，点别的箱子就开', async () => {
    vi.mocked(endpoints.barDealPick).mockResolvedValue(round({ mine: 4 }));
    vi.mocked(endpoints.barDealOpen).mockResolvedValue(
      round({ mine: 4, toOpen: 2, opened: [{ box: 7, foodsId: 101, num: 2, value: 70000 }] }),
    );
    const w = mount(DealPanel, { props: { data: withRound(round()) } });
    await w.get('[data-testid="deal-box-4"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDealPick).toHaveBeenCalledWith(4);
    expect(w.get('[data-testid="deal-box-4"]').text()).toContain('你的');
    expect(w.get('[data-testid="deal-box-4"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('再打开 3 个箱子');
    await w.get('[data-testid="deal-box-7"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDealOpen).toHaveBeenCalledWith(7);
    expect(w.get('[data-testid="deal-box-7"]').attributes('disabled')).toBeDefined();
    // 读屏：固定的播报区念刚开出的东西
    expect(w.get('[data-testid="deal-live"]').attributes('aria-live')).toBe('polite');
    expect(w.get('[data-testid="deal-live"]').text()).toContain('8 号箱子');
    expect(w.get('[data-testid="deal-box-7"]').attributes('aria-label')).toContain('8 号');
  });

  it('有报价时箱子不能点，写出价和两个按钮；成交、不成交都调用回答', async () => {
    const offered = round({ mine: 0, toOpen: 0, offer: 16900 });
    vi.mocked(endpoints.barDealAnswer).mockResolvedValue(round({ mine: 0, round: 1, toOpen: 2 }));
    const w = mount(DealPanel, { props: { data: withRound(offered) } });
    expect(w.get('[data-testid="deal-box-3"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="deal-offer"]').text()).toContain('银行家出价：16,900 银币');
    await w.get('[data-testid="deal-no"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDealAnswer).toHaveBeenCalledWith(false);
    expect(w.find('[data-testid="deal-offer"]').exists()).toBe(false);
    expect(w.text()).toContain('再打开 2 个箱子');
  });

  it('成交结束：写得到多少银币、你的箱子里是什么，公布全部箱子；有再来一局', async () => {
    const all = Array.from({ length: 10 }, (_, i) => P((i + 1) * 1000));
    vi.mocked(endpoints.barDealAnswer).mockResolvedValue(
      round({ mine: 0, result: 'deal', coin: 16900, prize: all[0]!, all }),
    );
    const w = mount(DealPanel, { props: { data: withRound(round({ mine: 0, toOpen: 0, offer: 16900 })) } });
    await w.get('[data-testid="deal-yes"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDealAnswer).toHaveBeenCalledWith(true);
    const res = w.get('[data-testid="deal-result"]');
    expect(res.text()).toContain('成交，得到 16,900 银币');
    expect(res.text()).toContain('你的箱子里是');
    expect(w.findAll('[data-testid^="deal-all-"]')).toHaveLength(10);
    await w.get('[data-testid="deal-again"]').trigger('click');
    expect(w.find('[data-testid="deal-start"]').exists()).toBe(true);
  });

  it('开到最后：写打开了你的箱子', () => {
    const all = Array.from({ length: 10 }, (_, i) => P((i + 1) * 1000));
    const w = mount(DealPanel, {
      props: { data: withRound(round({ mine: 9, result: 'box', prize: all[9]!, all })) },
    });
    expect(w.get('[data-testid="deal-result"]').text()).toContain('打开你的箱子');
  });

  it('出错：局没了回到开局；别的错误留在当前这一局，并重新读', async () => {
    vi.mocked(endpoints.barDealOpen).mockRejectedValueOnce(
      new ApiError('VALIDATION_FAILED', { reason: 'box' }),
    );
    const w = mount(DealPanel, { props: { data: withRound(round({ mine: 0 })) } });
    await w.get('[data-testid="deal-box-5"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="deal-start"]').exists()).toBe(false);
    vi.mocked(endpoints.barDealOpen).mockRejectedValueOnce(
      new ApiError('INVALID_STATE', { reason: 'no_round' }),
    );
    await w.get('[data-testid="deal-box-5"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="deal-start"]').exists()).toBe(true);
  });

  it('开到最后放不下：写放进冰箱、丢掉了多少（审查）', () => {
    const all = Array.from({ length: 10 }, (_, i) => P((i + 1) * 1000));
    const w = mount(DealPanel, {
      props: {
        data: withRound(round({ mine: 9, result: 'box', prize: all[9]!, all, fridge: 1, dropped: 1 })),
      },
    });
    const res = w.get('[data-testid="deal-result"]').text();
    expect(res).toContain('1 个放进了冰箱');
    expect(res).toContain('1 个放不下，丢掉了');
  });

  it('概览晚到、比手上的局面旧时不覆盖（审查：连点开箱子）', async () => {
    const newer = round({
      mine: 0,
      toOpen: 1,
      opened: [
        { box: 1, foodsId: 101, num: 2, value: 1 },
        { box: 2, foodsId: 101, num: 2, value: 1 },
      ],
    });
    const older = round({ mine: 0, toOpen: 2, opened: [{ box: 1, foodsId: 101, num: 2, value: 1 }] });
    const w = mount(DealPanel, { props: { data: withRound(newer) } });
    await w.setProps({ data: withRound(older) });
    expect(w.get('[data-testid="deal-box-2"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('再打开 1 个箱子');
  });

  it('键盘焦点跟着走：有报价到“成交”，开箱子到下一个能开的箱子，结束到“再来一局”（#192 审查）', async () => {
    const w = mount(DealPanel, {
      props: { data: withRound(round({ mine: 0, toOpen: 1 })) },
      attachTo: document.body,
    });
    const focused = () => document.activeElement?.getAttribute('data-testid');
    vi.mocked(endpoints.barDealOpen).mockResolvedValueOnce(
      round({ mine: 0, toOpen: 0, offer: 5000, opened: [{ box: 1, ...P(1200) }] }),
    );
    await w.get('[data-testid="deal-box-1"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('deal-yes');
    vi.mocked(endpoints.barDealAnswer).mockResolvedValueOnce(
      round({ mine: 0, round: 1, toOpen: 2, opened: [{ box: 1, ...P(1200) }] }),
    );
    await w.get('[data-testid="deal-no"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('deal-box-2');
    vi.mocked(endpoints.barDealOpen).mockResolvedValueOnce(
      round({ mine: 0, result: 'box', prize: P(70000), all: Array.from({ length: 10 }, () => P(1200)) }),
    );
    await w.get('[data-testid="deal-box-2"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('deal-again');
    w.unmount();
  });

  it('结束后读屏标签仍写出哪个是自己的箱子', () => {
    const all = Array.from({ length: 10 }, (_, i) => P((i + 1) * 1000));
    const w = mount(DealPanel, {
      props: { data: withRound(round({ mine: 3, result: 'box', prize: all[3]!, all })) },
    });
    expect(w.get('[data-testid="deal-box-3"]').attributes('aria-label')).toContain('你的');
  });

  it('四个状态原因都有自己的提示', () => {
    for (const reason of ['deal_picked', 'deal_pick_first', 'deal_offer', 'deal_no_offer']) {
      const text = errorMessage(new ApiError('INVALID_STATE', { reason }), 'x');
      expect(text, reason).not.toBe('x');
      expect(text, reason).not.toMatch(/当前状态/);
    }
  });
});
