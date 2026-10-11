import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CupDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import CupPanel from './CupPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { barCupGuess: vi.fn(), barCupStop: vi.fn(), barCupNext: vi.fn() },
}));

const round = (patch: Partial<CupDto> = {}): CupDto => ({
  round: 0,
  cups: 2,
  won: false,
  last: null,
  result: null,
  awards: [],
  ...patch,
});
const withRound = (r: CupDto | null, patch: Partial<ReturnType<typeof barData>['cup']> = {}) => {
  const data = barData();
  data.cup = { ...data.cup, ...patch, round: r };
  return data;
};
const coin = (num: number) => ({ kind: 'coin' as const, id: null, num, lucky: false });
const cupButtons = (w: ReturnType<typeof mount>) => w.findAll('[data-testid^="cup-"][data-cup]');
/** 轮次进度一档的文字（去掉前面的序号 / 勾） */
const tierText = (w: ReturnType<typeof mount>, i: number) =>
  w
    .get(`[data-testid="cup-tier-${i}"]`)
    .text()
    .replace(/^(\d|✓)/, '');
/** 轮次进度一档的状态：done 打勾、now 当前、空串还没到 */
const tierState = (w: ReturnType<typeof mount>, i: number) => {
  const c = w.get(`[data-testid="cup-tier-${i}"]`).classes();
  return c.includes('is-done') ? 'done' : c.includes('is-now') ? 'now' : '';
};

describe('CupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有局时写规则、四档奖励和第 1 轮的 2 个杯子；点杯子就开局', async () => {
    vi.mocked(endpoints.barCupGuess).mockResolvedValue(
      round({ won: true, last: { pick: 1, ball: 1, win: true, lucky: false } }),
    );
    // 玩法在 Teleport 到 body 的底部面板里：测试里把 teleport 桩掉（界面改版 P9）
    const w = mount(CupPanel, { props: { data: withRound(null) }, global: { stubs: { teleport: true } } });
    expect(w.get('[data-testid="bar-info-title"]').text()).toBe('每局 1 张神秘礼券');
    expect(w.get('[data-testid="bar-info-sub"]').text()).toBe('最多 4 轮 · 猜中可以收手');
    // 轮次进度：每轮几个杯子、几份奖励；没开局时哪一档都不标
    expect(tierText(w, 0)).toBe('2 杯 · 1 份');
    expect(tierText(w, 2)).toBe('5 杯 · 4 份上新闻');
    expect(tierText(w, 3)).toBe('7 杯 · 8 份全服广播');
    expect([0, 1, 2, 3].map((i) => tierState(w, i))).toEqual(['', '', '', '']);
    expect(w.findAll('[aria-current="true"]')).toHaveLength(0);
    // 玩法面板：分条的规则和四档奖励表
    expect(w.find('[data-testid="bar-rules"]').exists()).toBe(false);
    await w.get('[data-testid="bar-rules-open"]').trigger('click');
    const rules = w.get('[data-testid="bar-rules"]');
    expect(rules.findAll('li')).toHaveLength(3);
    expect(rules.text()).toContain('猜错就什么都没有');
    expect(rules.findAll('tbody tr').map((r) => r.findAll('td').map((d) => d.text()))).toEqual([
      ['第 1 轮', '2 个', '1 份', ''],
      ['第 2 轮', '3 个', '2 份', ''],
      ['第 3 轮', '5 个', '4 份', '上新闻'],
      ['第 4 轮', '7 个', '8 份', '全服广播'],
    ]);
    expect(w.get('[data-testid="cup-pick"]').text()).toBe('第 1 轮: 2 个杯子, 选一个');
    expect(cupButtons(w)).toHaveLength(2);
    await w.get('[data-testid="cup-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.barCupGuess).toHaveBeenCalledWith(1, null);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('礼券不够：杯子灰掉并写原因', () => {
    const data = withRound(null);
    data.tickets = 0;
    const w = mount(CupPanel, { props: { data } });
    expect(w.get('[data-testid="cup-0"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('神秘礼券不够 (每局 1 张)');
  });

  it('猜中、不是最后一轮：翻开骰子，问收手还是继续，杯子不能再点；播报区念出来', async () => {
    vi.mocked(endpoints.barCupGuess).mockResolvedValue(
      round({ round: 1, cups: 3, won: true, last: { pick: 2, ball: 2, win: true, lucky: true } }),
    );
    const w = mount(CupPanel, { props: { data: withRound(round({ round: 1, cups: 3 })) } });
    expect(w.get('[data-testid="cup-pick"]').text()).toBe('第 2 轮: 3 个杯子, 选一个');
    await w.get('[data-testid="cup-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.barCupGuess).toHaveBeenCalledWith(2, 1);
    const won = w.get('[data-testid="cup-won"]');
    expect(won.get('b').text()).toBe('幸运地猜中了！');
    expect(won.text()).toContain('收手拿 2 份奖励, 还是继续闯第 3 轮 (5 个杯子)？');
    expect(won.get('.dt-bar-warn').text()).toBe('继续猜错就什么都没有');
    expect(w.find('[data-testid="cup-pick"]').exists()).toBe(false);
    expect(w.get('[data-testid="cup-live"]').text()).toBe(
      '幸运地猜中了！收手拿 2 份奖励, 还是继续闯第 3 轮 (5 个杯子)？',
    );
    // 掀开的杯子：你选的、骰子在这里
    expect(w.get('[data-testid="cup-2"]').classes()).toContain('is-up');
    expect(w.get('[data-testid="cup-2"]').find('.dt-cup-die').exists()).toBe(true);
    expect(w.get('[data-testid="cup-0"]').classes()).not.toContain('is-up');
    expect(w.get('[data-testid="cup-2"]').attributes('aria-label')).toBe('3 号杯, 你选的, 骰子在这里');
    expect(w.get('[data-testid="cup-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cup-stop"]').exists()).toBe(true);
  });

  it('继续：进下一轮，杯子变多', async () => {
    vi.mocked(endpoints.barCupNext).mockResolvedValue(round({ round: 2, cups: 5 }));
    const w = mount(CupPanel, {
      props: {
        data: withRound(
          round({ round: 1, cups: 3, won: true, last: { pick: 0, ball: 0, win: true, lucky: false } }),
        ),
      },
    });
    await w.get('[data-testid="cup-next"]').trigger('click');
    await flushPromises();
    expect(endpoints.barCupNext).toHaveBeenCalled();
    expect(cupButtons(w)).toHaveLength(5);
    expect(w.get('[data-testid="cup-live"]').text()).toBe('第 3 轮: 5 个杯子, 选一个');
    expect(w.get('[data-testid="cup-4"]').attributes('disabled')).toBeUndefined();
  });

  it('收手：逐份列出奖励，再来一局回到开局', async () => {
    vi.mocked(endpoints.barCupStop).mockResolvedValue(
      round({
        round: 1,
        cups: 3,
        result: 'stop',
        last: { pick: 0, ball: 0, win: true, lucky: false },
        awards: [coin(200), coin(300)],
      }),
    );
    const w = mount(CupPanel, {
      props: {
        data: withRound(
          round({ round: 1, cups: 3, won: true, last: { pick: 0, ball: 0, win: true, lucky: false } }),
        ),
      },
    });
    await w.get('[data-testid="cup-stop"]').trigger('click');
    await flushPromises();
    const res = w.get('[data-testid="cup-result"]');
    expect(res.get('b').text()).toBe('收手了, 闯过 2 轮');
    expect(res.classes()).toContain('is-ok');
    expect(w.findAll('[data-testid="cup-award"] [data-testid="award-chip"]').map((x) => x.text())).toEqual([
      '银币 200',
      '银币 300',
    ]);
    expect(w.get('[data-testid="cup-live"]').text()).toBe('收手了, 闯过 2 轮, 得到 银币 200, 得到 银币 300');
    // 收手时服务端回的 won 是 false：闯过的两轮照样打勾，不把第 2 轮标成“当前”
    expect([0, 1, 2, 3].map((i) => tierState(w, i))).toEqual(['done', 'done', '', '']);
    expect(w.find('[data-testid="cup-won"]').exists()).toBe(false);
    await w.get('[data-testid="cup-again"]').trigger('click');
    expect(w.find('[data-testid="cup-result"]').exists()).toBe(false);
    expect(w.get('[data-testid="cup-pick"]').text()).toBe('第 1 轮: 2 个杯子, 选一个');
    expect([0, 1, 2, 3].map((i) => tierState(w, i))).toEqual(['', '', '', '']);
    expect(cupButtons(w)).toHaveLength(2);
    expect(w.get('[data-testid="cup-0"]').attributes('disabled')).toBeUndefined();
  });

  it('通关：写全部通关和 8 份奖励', async () => {
    vi.mocked(endpoints.barCupGuess).mockResolvedValue(
      round({
        round: 3,
        cups: 7,
        result: 'clear',
        last: { pick: 6, ball: 6, win: true, lucky: false },
        awards: Array.from({ length: 8 }, () => coin(900)),
      }),
    );
    const w = mount(CupPanel, { props: { data: withRound(round({ round: 3, cups: 7 })) } });
    await w.get('[data-testid="cup-6"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="cup-result"] b').text()).toBe('猜中了！全部通关');
    expect(w.findAll('[data-testid="cup-award"] [data-testid="award-chip"]')).toHaveLength(8);
    expect([0, 1, 2, 3].map((i) => tierState(w, i))).toEqual(['done', 'done', 'done', 'done']);
    expect(w.get('[data-testid="cup-live"]').text()).toContain('全部通关');
  });

  it('猜错：写骰子在几号杯，翻开那个杯子', async () => {
    vi.mocked(endpoints.barCupGuess).mockResolvedValue(
      round({ result: 'lose', last: { pick: 0, ball: 1, win: false, lucky: false } }),
    );
    const w = mount(CupPanel, { props: { data: withRound(null) } });
    await w.get('[data-testid="cup-0"]').trigger('click');
    await flushPromises();
    const res = w.get('[data-testid="cup-result"]');
    expect(res.get('b').text()).toBe('猜错了, 骰子在 2 号杯。');
    expect(res.classes()).toContain('is-bad');
    expect(w.find('[data-testid="cup-award"]').exists()).toBe(false);
    expect(w.get('[data-testid="cup-1"]').find('.dt-cup-die').exists()).toBe(true);
    expect(w.get('[data-testid="cup-1"]').classes()).toContain('is-up');
    expect(w.get('[data-testid="cup-1"]').attributes('aria-label')).toBe('2 号杯, 骰子在这里');
    expect(w.get('[data-testid="cup-0"]').attributes('aria-label')).toBe('1 号杯, 你选的');
    expect(w.find('[data-testid="cup-again"]').exists()).toBe(true);
  });

  it('概览晚到、还是旧局面时不覆盖手上的结果', async () => {
    vi.mocked(endpoints.barCupGuess).mockResolvedValue(
      round({ round: 1, cups: 3, won: true, last: { pick: 0, ball: 0, win: true, lucky: false } }),
    );
    const w = mount(CupPanel, { props: { data: withRound(round({ round: 1, cups: 3 })) } });
    await w.get('[data-testid="cup-0"]').trigger('click');
    await flushPromises();
    await w.setProps({ data: withRound(round({ round: 1, cups: 3 })) });
    expect(w.find('[data-testid="cup-won"]').exists()).toBe(true);
  });

  it('局里奖励表照样显示，标出这一轮的档，方便决定收手还是继续（#193 审查）', () => {
    const w = mount(CupPanel, {
      props: {
        data: withRound(
          round({ round: 1, cups: 3, won: true, last: { pick: 0, ball: 0, win: true, lucky: false } }),
        ),
      },
    });
    // 猜中第 2 轮：前两档打勾，这一档（收手能拿的）标 aria-current
    expect(w.get('[data-testid="cup-tier-1"]').attributes('aria-current')).toBe('true');
    expect([0, 1, 2, 3].map((i) => tierState(w, i))).toEqual(['done', 'done', '', '']);
    expect(w.get('[data-testid="cup-tier-2"]').text()).toContain('上新闻');
    expect(w.get('[data-testid="cup-tier-2"]').attributes('aria-current')).toBeUndefined();
    // 还没猜：这一档高亮成当前
    const v = mount(CupPanel, { props: { data: withRound(round({ round: 1, cups: 3 })) } });
    expect(v.get('[data-testid="cup-tier-1"]').attributes('aria-current')).toBe('true');
    expect([0, 1, 2, 3].map((i) => tierState(v, i))).toEqual(['done', 'now', '', '']);
  });

  it('键盘焦点跟着走：猜中到“收手”，结束到“再来一局”，继续和再来一局回到第一个杯子（#193 审查）', async () => {
    vi.mocked(endpoints.barCupGuess).mockResolvedValue(
      round({ won: true, last: { pick: 0, ball: 0, win: true, lucky: false } }),
    );
    vi.mocked(endpoints.barCupNext).mockResolvedValue(round({ round: 1, cups: 3 }));
    vi.mocked(endpoints.barCupGuess).mockResolvedValueOnce(
      round({ won: true, last: { pick: 0, ball: 0, win: true, lucky: false } }),
    );
    const w = mount(CupPanel, { props: { data: withRound(null) }, attachTo: document.body });
    const focused = () => document.activeElement?.getAttribute('data-testid');
    await w.get('[data-testid="cup-0"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('cup-stop');
    await w.get('[data-testid="cup-next"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('cup-0');
    vi.mocked(endpoints.barCupGuess).mockResolvedValueOnce(
      round({ round: 1, cups: 3, result: 'lose', last: { pick: 0, ball: 2, win: false, lucky: false } }),
    );
    await w.get('[data-testid="cup-0"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('cup-again');
    await w.get('[data-testid="cup-again"]').trigger('click');
    await flushPromises();
    expect(focused()).toBe('cup-0');
    w.unmount();
  });

  it('再来一局时礼券不够：焦点落到“礼券不够”的说明上，不丢回页面开头（#194 遗留）', async () => {
    const data = withRound(
      round({ round: 0, cups: 2, result: 'lose', last: { pick: 0, ball: 1, win: false, lucky: false } }),
    );
    data.tickets = 0;
    const w = mount(CupPanel, { props: { data }, attachTo: document.body });
    await w.get('[data-testid="cup-again"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="cup-0"]').attributes('disabled')).toBeDefined();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('block');
    w.unmount();
  });

  it('猜错以后奖励表不再标这一档（终审）', () => {
    const w = mount(CupPanel, {
      props: {
        data: withRound(
          round({ round: 2, cups: 5, result: 'lose', last: { pick: 0, ball: 1, win: false, lucky: false } }),
        ),
      },
    });
    expect(w.findAll('[aria-current="true"]')).toHaveLength(0);
  });

  it('当前连胜写在说明卡里', () => {
    const w = mount(CupPanel, { props: { data: withRound(null, { result: 'win', times: 3 }) } });
    expect(w.get('[data-testid="bar-info-sub"]').text()).toBe('最多 4 轮 · 猜中可以收手 · 当前 3 连胜');
    const lost = mount(CupPanel, { props: { data: withRound(null, { result: 'lose', times: 3 }) } });
    expect(lost.get('[data-testid="bar-info-sub"]').text()).not.toContain('连胜');
  });

  it('出错：局没了回到开局；别的错误用概览里的局面，都重新读', async () => {
    vi.mocked(endpoints.barCupStop).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'no_round' }));
    const won = round({ won: true, last: { pick: 0, ball: 0, win: true, lucky: false } });
    const w = mount(CupPanel, { props: { data: withRound(won) } });
    await w.get('[data-testid="cup-stop"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="cup-won"]').exists()).toBe(false);
    expect(w.get('[data-testid="cup-pick"]').text()).toBe('第 1 轮: 2 个杯子, 选一个');
    expect(w.emitted('reload')).toHaveLength(1);

    vi.mocked(endpoints.barCupGuess).mockRejectedValue(new Error('network'));
    const v = mount(CupPanel, { props: { data: withRound(round({ round: 2, cups: 5 })) } });
    await v.get('[data-testid="cup-3"]').trigger('click');
    await flushPromises();
    expect(cupButtons(v)).toHaveLength(5);
    expect(v.emitted('reload')).toHaveLength(1);
  });
});
