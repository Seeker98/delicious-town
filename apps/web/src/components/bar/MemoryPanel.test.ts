import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { MemoryRoundDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import MemoryPanel from './MemoryPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    barMemoryStart: vi.fn(),
    barMemoryAnswer: vi.fn(),
    barMemoryNext: vi.fn(),
    barMemoryStop: vi.fn(),
  },
}));

const round = (seq: number[], level = 1): MemoryRoundDto => ({
  level,
  seq,
  flashMs: 600,
  gapMs: 200,
  answerMs: 7500,
});
const lit = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-testid^="mix-"]').findIndex((b) => b.classes().includes('is-on'));
/** 关卡进度的状态：done 打勾、now 当前、空串还没到 */
const levels = (w: ReturnType<typeof mount>) =>
  [1, 2, 3].map((n) => {
    const c = w.find(`[data-testid="mem-level-${n}"]`).classes();
    return c.includes('is-done') ? 'done' : c.includes('is-now') ? 'now' : '';
  });
const advance = async (ms: number) => {
  vi.advanceTimersByTime(ms);
  await nextTick();
};

describe('MemoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('开局后依次闪出配方，展示时不能点；展示完才能点', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([2, 5, 2]));
    const w = mount(MemoryPanel, { props: { data: barData() } });
    expect(w.find('[data-testid="bar-info-title"]').text()).toBe('每局 1 张神秘礼券');
    expect(w.find('[data-testid="bar-info-sub"]').text()).toBe('今天 0/20 局 · 每过一关都有奖励');
    // 关卡进度按区服的配方长度写（BarDto.memory.lengths）
    expect(w.find('[data-testid="mem-level-2"]').text()).toContain('第 2 关 · 5 种');
    expect(levels(w)).toEqual(['', '', '']);
    expect(w.find('[data-testid="mix-0"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    expect(lit(w)).toBe(2);
    expect(levels(w)).toEqual(['now', '', '']);
    expect(w.find('[data-testid="mem-watch"]').exists()).toBe(true);
    expect(w.find('[data-testid="mem-picked"]').exists()).toBe(false);
    expect(w.find('[data-testid="mix-0"]').attributes('disabled')).toBeDefined();
    await advance(600);
    expect(lit(w)).toBe(-1);
    await advance(200);
    expect(lit(w)).toBe(5);
    await advance(800);
    expect(lit(w)).toBe(2);
    await advance(600);
    expect(w.find('[data-testid="mix-0"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="mem-picked"]').text()).toBe('按顺序点出配方 · 已选 0/3');
  });

  it('点满就提交，可以撤回最后一个；答对后可以继续或收手', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockResolvedValue({
      correct: true,
      reason: null,
      level: 1,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
      canNext: true,
      finished: false,
    });
    vi.mocked(endpoints.barMemoryNext).mockResolvedValue(round([0, 1, 2, 3, 4], 2));
    const w = mount(MemoryPanel, { props: { data: barData() } });
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    await advance(2200);
    expect(w.find('[data-testid="mem-undo"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="mix-7"]').trigger('click');
    expect(w.find('[data-testid="mem-picked"]').text()).toBe('按顺序点出配方 · 已选 1/3');
    expect(w.findAll('.dt-mem-slot').map((x) => x.text())).toEqual(['苏打', '', '']);
    await w.find('[data-testid="mem-undo"]').trigger('click');
    expect(w.find('[data-testid="mem-picked"]').text()).toBe('按顺序点出配方 · 已选 0/3');
    expect(w.findAll('.dt-mem-slot').map((x) => x.text())).toEqual(['', '', '']);
    for (const i of [1, 3, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryAnswer).toHaveBeenCalledWith([1, 3, 1]);
    const res = w.find('[data-testid="mem-result"]');
    expect(res.find('b').text()).toBe('答对了！');
    expect(res.classes()).toContain('is-ok');
    expect(res.findAll('[data-testid="award-chip"]').map((c) => c.text())).toEqual(['银币 200']);
    expect(w.find('[data-testid="mem-next"]').text()).toBe('继续第 2 关');
    expect(w.find('[data-testid="mem-stop"]').exists()).toBe(true);
    expect(levels(w)).toEqual(['done', '', '']);
    await w.find('[data-testid="mem-next"]').trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryNext).toHaveBeenCalled();
    expect(lit(w)).toBe(0);
    expect(levels(w)).toEqual(['done', 'now', '']);
  });

  it('答错提示正确配方；刷新后接着上次：答对等选择、没看完只能放弃', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockResolvedValue({
      correct: false,
      reason: 'wrong',
      level: 1,
      award: null,
      canNext: false,
      finished: true,
    });
    const w = mount(MemoryPanel, { props: { data: barData() } });
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    await advance(2200);
    for (const i of [1, 1, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    const res = w.find('[data-testid="mem-result"]');
    expect(res.find('b').text()).toBe('记错了');
    expect(res.classes()).toContain('is-bad');
    expect(res.find('.dt-bar-detail').text()).toBe('配方是: 伏特加、柠檬、伏特加');
    expect(w.find('[data-testid="mem-again"]').exists()).toBe(true);
    expect(w.find('[data-testid="mem-next"]').exists()).toBe(false);

    const passed = barData();
    passed.memory.round = { level: 1, passed: true, seq: null, leftMs: null };
    const p = mount(MemoryPanel, { props: { data: passed } });
    expect(p.text()).toContain('第 1 关已经答对了, 要继续吗？');
    expect(p.find('[data-testid="mem-next"]').exists()).toBe(true);
    expect(p.find('[data-testid="mem-stop"]').exists()).toBe(true);
    expect(levels(p)).toEqual(['done', '', '']);
    const stale = barData();
    stale.memory.round = { level: 2, passed: false, seq: null, leftMs: null };
    vi.mocked(endpoints.barMemoryStop).mockResolvedValue({});
    const s = mount(MemoryPanel, { props: { data: stale } });
    expect(s.text()).toContain('上次的配方没看完, 这一局只能放弃了');
    expect(s.find('[data-testid="mem-resume"]').exists()).toBe(false);
    expect(s.find('[data-testid="mem-start"]').exists()).toBe(false);
    await s.find('[data-testid="mem-abandon"]').trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryStop).toHaveBeenCalled();
    expect(s.emitted('reload')).toHaveLength(1);
  });

  it('今天的局数用完时开局按钮灰掉', () => {
    const d = barData();
    d.memory.played = 20;
    const w = mount(MemoryPanel, { props: { data: d } });
    expect(w.find('[data-testid="mem-start"]').attributes('disabled')).toBeDefined();
  });

  it('超时、太早分别说明原因，不说成记错（终审 I3）', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockResolvedValue({
      correct: false,
      reason: 'late',
      level: 1,
      award: null,
      canNext: false,
      finished: true,
    });
    const w = mount(MemoryPanel, { props: { data: barData() } });
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    await advance(2200);
    for (const i of [1, 3, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    const res = w.find('[data-testid="mem-result"]');
    expect(res.find('b').text()).toBe('超时了');
    expect(res.find('.dt-bar-detail').text()).toBe('要在 7.5 秒内答完。配方是: 伏特加、柠檬、伏特加');
    expect(res.text()).not.toContain('记错了');

    vi.mocked(endpoints.barMemoryAnswer).mockResolvedValue({
      correct: false,
      reason: 'early',
      level: 1,
      award: null,
      canNext: false,
      finished: true,
    });
    await w.find('[data-testid="mem-again"]').trigger('click');
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    await advance(2200);
    for (const i of [1, 3, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    const early = w.find('[data-testid="mem-result"]');
    expect(early.find('b').text()).toBe('配方还没放完就交了');
    expect(early.find('.dt-bar-detail').text()).toBe('配方是: 伏特加、柠檬、伏特加');
    expect(early.text()).not.toContain('记错了');
  });

  it('刷新页面后接着这一局：重新展示配方再作答（终审 I2）', async () => {
    const d = barData();
    d.memory.round = { level: 1, passed: false, seq: [4, 4, 0], leftMs: 9000 };
    const w = mount(MemoryPanel, { props: { data: d } });
    expect(w.text()).toContain('第 1 关还没答完, 配方会再放一遍');
    expect(levels(w)).toEqual(['now', '', '']);
    await w.find('[data-testid="mem-resume"]').trigger('click');
    await nextTick();
    expect(lit(w)).toBe(4);
    expect(w.find('[data-testid="mix-4"]').attributes('disabled')).toBeDefined();
    await advance(2200);
    for (const i of [4, 4, 0]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryAnswer).toHaveBeenCalledWith([4, 4, 0]);
  });

  it('提交失败后清掉已点的配料，再点一个不会以多一个的长度提交（PR28 遗留）', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockRejectedValueOnce(new ApiError('NETWORK'));
    const w = mount(MemoryPanel, { props: { data: barData() } });
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    await advance(2200);
    for (const i of [1, 3, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryAnswer).toHaveBeenCalledTimes(1);
    await w.find('[data-testid="mix-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryAnswer).toHaveBeenCalledTimes(1);
  });

  it('局在别处已经结束：回到开局状态并刷新（PR28 遗留）', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockRejectedValueOnce(
      new ApiError('INVALID_STATE', { reason: 'no_round' }),
    );
    const w = mount(MemoryPanel, { props: { data: barData() } });
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    await advance(2200);
    for (const i of [1, 3, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(2);
    expect(w.find('[data-testid="mem-start"]').exists()).toBe(true);
  });
});
