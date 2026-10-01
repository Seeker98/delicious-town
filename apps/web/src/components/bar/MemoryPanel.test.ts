import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { MemoryRoundDto } from '@dt/shared';
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
  w.findAll('[data-testid^="mix-"]').findIndex((b) => b.classes().includes('dt-mix-on'));
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
    expect(w.find('[data-testid="mem-played"]').text()).toBe('今天 0/20 局，每局 1 张神秘礼券');
    await w.find('[data-testid="mem-start"]').trigger('click');
    await flushPromises();
    expect(lit(w)).toBe(2);
    expect(w.find('[data-testid="mix-0"]').attributes('disabled')).toBeDefined();
    await advance(600);
    expect(lit(w)).toBe(-1);
    await advance(200);
    expect(lit(w)).toBe(5);
    await advance(800);
    expect(lit(w)).toBe(2);
    await advance(600);
    expect(w.find('[data-testid="mix-0"]').attributes('disabled')).toBeUndefined();
  });

  it('点满就提交，可以撤回最后一个；答对后可以继续或收手', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockResolvedValue({
      correct: true,
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
    await w.find('[data-testid="mix-7"]').trigger('click');
    await w.find('[data-testid="mem-undo"]').trigger('click');
    for (const i of [1, 3, 1]) await w.find(`[data-testid="mix-${i}"]`).trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryAnswer).toHaveBeenCalledWith([1, 3, 1]);
    expect(w.find('[data-testid="mem-result"]').text()).toBe('答对了！得到 银币 200');
    await w.find('[data-testid="mem-next"]').trigger('click');
    await flushPromises();
    expect(endpoints.barMemoryNext).toHaveBeenCalled();
    expect(lit(w)).toBe(0);
  });

  it('答错提示正确配方；刷新后接着上次：答对等选择、没看完只能放弃', async () => {
    vi.mocked(endpoints.barMemoryStart).mockResolvedValue(round([1, 3, 1]));
    vi.mocked(endpoints.barMemoryAnswer).mockResolvedValue({
      correct: false,
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
    expect(w.find('[data-testid="mem-result"]').text()).toBe('记错了。正确的配方是：伏特加、柠檬、伏特加');

    const passed = barData();
    passed.memory.round = { level: 1, passed: true };
    expect(
      mount(MemoryPanel, { props: { data: passed } })
        .find('[data-testid="mem-next"]')
        .exists(),
    ).toBe(true);
    const stale = barData();
    stale.memory.round = { level: 2, passed: false };
    vi.mocked(endpoints.barMemoryStop).mockResolvedValue({});
    const s = mount(MemoryPanel, { props: { data: stale } });
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
});
