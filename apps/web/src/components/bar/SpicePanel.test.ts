import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpiceDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import SpicePanel from './SpicePanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barSpiceStart: vi.fn(), barSpiceGuess: vi.fn() } }));

const round = (patch: Partial<SpiceDto> = {}): SpiceDto => ({
  guesses: [],
  left: 8,
  length: 4,
  kinds: 10,
  result: null,
  secret: null,
  tier: null,
  renown: 0,
  award: null,
  ...patch,
});
const withRound = (r: SpiceDto | null, patch: Partial<ReturnType<typeof barData>['spice']> = {}) => {
  const data = barData();
  data.spice = { ...data.spice, ...patch, round: r };
  return data;
};
const pick = async (w: ReturnType<typeof mount>, ids: number[]) => {
  for (const i of ids) await w.get(`[data-testid="spice-kind-${i}"]`).trigger('click');
};

describe('SpicePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有局时写规则、三档奖励、今天还能玩几局；点了开局', async () => {
    vi.mocked(endpoints.barSpiceStart).mockResolvedValue(round());
    const w = mount(SpicePanel, { props: { data: withRound(null, { played: 2 }) } });
    expect(w.text()).toContain('A 是调料和位置都对');
    expect(w.text()).toContain('今天还能玩 3 局');
    expect(w.get('[data-testid="spice-tier-0"]').text()).toContain('第 1~4 次猜中');
    expect(w.get('[data-testid="spice-tier-0"]').text()).toContain('声望 +5');
    await w.get('[data-testid="spice-start"]').trigger('click');
    await flushPromises();
    expect(endpoints.barSpiceStart).toHaveBeenCalled();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.findAll('[data-testid^="spice-kind-"]')).toHaveLength(10);
  });

  it('概览晚到、还是旧局面时不覆盖手上的局面（#191 审查）', async () => {
    vi.mocked(endpoints.barSpiceGuess).mockResolvedValue(
      round({ guesses: [{ guess: [2, 0, 9, 4], a: 1, b: 2 }], left: 7 }),
    );
    const w = mount(SpicePanel, { props: { data: withRound(round()) } });
    await pick(w, [2, 0, 9, 4]);
    await w.get('[data-testid="spice-submit"]').trigger('click');
    await flushPromises();
    await w.setProps({ data: withRound(round()) });
    expect(w.find('[data-testid="spice-row-0"]').exists()).toBe(true);
  });

  it('进行中的局按这一局开局时的长度、调料种数画，不跟着改过的数值（终审）', () => {
    const w = mount(SpicePanel, {
      props: { data: withRound(round({ length: 4, kinds: 10 }), { length: 3, kinds: 6 }) },
    });
    expect(w.findAll('[data-testid^="spice-slot-"]')).toHaveLength(4);
    expect(w.findAll('[data-testid^="spice-kind-"]')).toHaveLength(10);
  });

  it('空位个数和列数跟着配方长度（#191 审查）', () => {
    const w = mount(SpicePanel, { props: { data: withRound(round({ length: 3 }), { length: 3 }) } });
    expect(w.findAll('[data-testid^="spice-slot-"]')).toHaveLength(3);
    expect(w.get('.dt-spice-slots').attributes('style')).toContain('repeat(3, minmax(0, 1fr))');
  });

  it('次数用完或礼券不够：开局按钮灰掉并写原因', () => {
    const used = mount(SpicePanel, { props: { data: withRound(null, { played: 5 }) } });
    expect(used.get('[data-testid="spice-start"]').attributes('disabled')).toBeDefined();
    expect(used.text()).toContain('今天的局数用完了');
    const data = withRound(null);
    data.tickets = 1;
    const poor = mount(SpicePanel, { props: { data } });
    expect(poor.get('[data-testid="spice-start"]').attributes('disabled')).toBeDefined();
    expect(poor.text()).toContain('神秘礼券不够');
  });

  it('按顺序选调料填进空位，选过的灰掉；点空位拿掉；满 4 个才能交，交了清空', async () => {
    vi.mocked(endpoints.barSpiceGuess).mockResolvedValue(
      round({ guesses: [{ guess: [2, 0, 9, 4], a: 1, b: 2 }], left: 7 }),
    );
    const w = mount(SpicePanel, { props: { data: withRound(round()) } });
    await pick(w, [2, 5, 9]);
    expect(w.get('[data-testid="spice-slot-1"]').text()).toBe('花椒');
    expect(w.get('[data-testid="spice-kind-5"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="spice-submit"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="spice-slot-1"]').trigger('click');
    expect(w.get('[data-testid="spice-kind-5"]').attributes('disabled')).toBeUndefined();
    await pick(w, [0, 4]);
    // 拿掉第 2 位后，新选的补到第 2 位：酱油、盐、辣椒、料酒
    expect(w.get('[data-testid="spice-slot-1"]').text()).toBe('盐');
    await w.get('[data-testid="spice-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.barSpiceGuess).toHaveBeenCalledWith([2, 0, 9, 4]);
    expect(w.get('[data-testid="spice-row-0"]').text()).toBe('第 1 次: 酱油、盐、辣椒、料酒 1A2B');
    expect(w.text()).toContain('还能猜 7 次');
    expect(w.get('[data-testid="spice-slot-0"]').text()).toBe('');
  });

  it('猜中：写第几次、声望和奖励，亮出配方；有再来一局', () => {
    const r = round({
      guesses: [{ guess: [3, 1, 4, 0], a: 4, b: 0 }],
      left: 7,
      result: 'win',
      secret: [3, 1, 4, 0],
      tier: 0,
      renown: 5,
      award: { kind: 'coin', id: null, num: 800, lucky: false },
    });
    const w = mount(SpicePanel, { props: { data: withRound(null) } });
    // 结束的结果由猜的返回给出，这里用一个已结束的局面直接挂载
    const done = mount(SpicePanel, { props: { data: withRound(r) } });
    expect(w.find('[data-testid="spice-result"]').exists()).toBe(false);
    expect(done.get('[data-testid="spice-result"]').text()).toContain('第 1 次猜中了');
    expect(done.get('[data-testid="spice-result"]').text()).toContain('声望 +5');
    expect(done.get('[data-testid="spice-result"]').text()).toContain('银币 800');
    expect(done.get('[data-testid="spice-secret"]').text()).toBe('配方: 醋、糖、料酒、盐');
    expect(done.find('[data-testid="spice-submit"]').exists()).toBe(false);
    expect(done.find('[data-testid="spice-again"]').exists()).toBe(true);
  });

  it('8 次没猜中：写没猜中，亮出配方', () => {
    const r = round({ left: 0, result: 'lose', secret: [3, 1, 4, 0] });
    const w = mount(SpicePanel, { props: { data: withRound(r) } });
    expect(w.get('[data-testid="spice-result"]').text()).toContain('8 次都没猜中');
    expect(w.get('[data-testid="spice-secret"]').text()).toContain('醋');
  });

  it('出错（局没了或别的错）：清掉已选，按概览重新读', async () => {
    vi.mocked(endpoints.barSpiceGuess).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'no_round' }),
    );
    const w = mount(SpicePanel, { props: { data: withRound(round()) } });
    await pick(w, [0, 1, 2, 3]);
    await w.get('[data-testid="spice-submit"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="spice-start"]').exists()).toBe(true);
  });

  it('读屏：固定的播报区念最新一次的回答，结束时念结果（审查 I1）', async () => {
    vi.mocked(endpoints.barSpiceGuess).mockResolvedValue(
      round({ guesses: [{ guess: [0, 1, 2, 3], a: 2, b: 1 }], left: 7 }),
    );
    const w = mount(SpicePanel, { props: { data: withRound(round()) } });
    const live = w.get('[data-testid="spice-live"]');
    expect(live.attributes('aria-live')).toBe('polite');
    await pick(w, [0, 1, 2, 3]);
    await w.get('[data-testid="spice-submit"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="spice-live"]').text()).toBe('第 1 次: 盐、糖、酱油、醋 2A1B');
    expect(w.findAll('[data-testid^="spice-row-"][aria-live]')).toHaveLength(0);
  });

  it('空位按钮的读屏标签写出里面是哪种调料（审查 I2）', async () => {
    const w = mount(SpicePanel, { props: { data: withRound(round()) } });
    await pick(w, [6]);
    expect(w.get('[data-testid="spice-slot-0"]').attributes('aria-label')).toBe('第 1 位: 八角 (点一下拿掉)');
    expect(w.get('[data-testid="spice-slot-1"]').attributes('aria-label')).toBe('第 2 位: 空');
  });

  it('别的错误（比如网络）：不退回开局页面，用概览里的局面', async () => {
    vi.mocked(endpoints.barSpiceGuess).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', { reason: 'guess' }),
    );
    const w = mount(SpicePanel, { props: { data: withRound(round({ left: 6 })) } });
    await pick(w, [0, 1, 2, 3]);
    await w.get('[data-testid="spice-submit"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(w.find('[data-testid="spice-start"]').exists()).toBe(false);
    expect(w.text()).toContain('还能猜 6 次');
  });

  it('文案：第几次猜中不带“就”，奖励前写“得到”；档位只有一个次数时不写成 5~5', () => {
    const r = round({
      guesses: Array.from({ length: 8 }, () => ({ guess: [3, 1, 4, 0], a: 0, b: 0 })),
      left: 0,
      result: 'win',
      secret: [3, 1, 4, 0],
      tier: 2,
      renown: 0,
      award: { kind: 'coin', id: null, num: 800, lucky: false },
    });
    const done = mount(SpicePanel, { props: { data: withRound(r) } });
    expect(done.get('[data-testid="spice-result"]').text()).toBe('第 8 次猜中了, 得到 银币 800');
    const tiers = [
      { maxTries: 4, awardLevel: 8, renown: 5 },
      { maxTries: 5, awardLevel: 5, renown: 2 },
      { maxTries: 8, awardLevel: 3, renown: 0 },
    ];
    const w = mount(SpicePanel, { props: { data: withRound(null, { tiers }) } });
    expect(w.get('[data-testid="spice-tier-1"]').text()).toContain('第 5 次猜中');
  });
});
