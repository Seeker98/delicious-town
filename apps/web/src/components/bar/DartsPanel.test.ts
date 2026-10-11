import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import DartsPanel from './DartsPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { barDartsStart: vi.fn(), barDartsAim: vi.fn(), barDartsThrow: vi.fn() },
}));

const marker = (w: ReturnType<typeof mount>) =>
  (w.find('[data-testid="darts-marker"]').element as HTMLElement).style.left;

/** 三镖的分数格子：镖号 + 分数（没投的是 ?） */
const throwBoxes = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-testid="darts-throws"] .dt-darts-throw').map((b) => b.text());

describe('DartsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => vi.useRealTimers());

  it('开局后瞄准：准星按服务端给的周期和相位摆动；投掷时上报经过的毫秒数', async () => {
    vi.mocked(endpoints.barDartsStart).mockResolvedValue({ throws: [], aiming: false });
    vi.mocked(endpoints.barDartsAim).mockResolvedValue({ period: 900, phase: 0.25 });
    vi.mocked(endpoints.barDartsThrow).mockResolvedValue({
      x: 1,
      score: 0,
      throws: [0],
      finished: false,
      boss: null,
      result: null,
      award: null,
      refund: 0,
    });
    const w = mount(DartsPanel, { props: { data: barData() } });
    expect(w.find('[data-testid="bar-info-title"]').text()).toBe('每局 2 张神秘礼券');
    expect(w.find('[data-testid="bar-info-sub"]').text()).toBe('今天 0/20 局 · 三镖总分超过老板就赢');
    expect(throwBoxes(w)).toEqual(['第 1 镖?', '第 2 镖?', '第 3 镖?']);
    await w.find('[data-testid="darts-start"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="darts-aim"]').trigger('click');
    await flushPromises();
    expect(marker(w)).toBe('50%');
    vi.advanceTimersByTime(225);
    await nextTick();
    expect(parseFloat(marker(w))).toBeGreaterThan(98); // 动画按帧（约 16ms）刷新，最后一帧在 224ms 左右
    await w.find('[data-testid="darts-throw"]').trigger('click');
    await flushPromises();
    expect(endpoints.barDartsThrow).toHaveBeenCalledWith(225);
    expect(throwBoxes(w)).toEqual(['第 1 镖0', '第 2 镖?', '第 3 镖?']);
    expect(w.find('.dt-darts-throw.is-now').text()).toBe('第 2 镖?');
    expect(w.find('[data-testid="darts-aim"]').text()).toBe('瞄准第 2 镖');
  });

  it('三镖投完：公布老板分数和输赢', async () => {
    const d = barData();
    d.darts.round = { throws: [50, 50], aiming: false };
    vi.mocked(endpoints.barDartsAim).mockResolvedValue({ period: 900, phase: 0.25 });
    vi.mocked(endpoints.barDartsThrow).mockResolvedValue({
      x: 0,
      score: 50,
      throws: [50, 50, 50],
      finished: true,
      boss: [10, 25, 0],
      result: 'win',
      award: { kind: 'exp', id: null, num: 300, lucky: false },
      refund: 0,
    });
    const w = mount(DartsPanel, { props: { data: d } });
    await w.find('[data-testid="darts-aim"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="darts-throw"]').trigger('click');
    await flushPromises();
    const res = w.find('[data-testid="darts-result"]');
    expect(res.find('b').text()).toBe('你 150 : 35 老板, 赢了！');
    expect(res.classes()).toContain('is-ok');
    expect(res.find('.dt-bar-detail').text()).toBe('老板三镖: 10 / 25 / 0');
    expect(res.findAll('[data-testid="award-chip"]').map((c) => c.text())).toEqual(['经验 300']);
    expect(throwBoxes(w)).toEqual(['第 1 镖50', '第 2 镖50', '第 3 镖50']);
    expect(w.find('[data-testid="darts-aim"]').exists()).toBe(false);
    expect(w.find('[data-testid="darts-again"]').exists()).toBe(true);
  });

  it('今天的局数用完时开局按钮灰掉', () => {
    const d = barData();
    d.darts.played = 20;
    expect(
      mount(DartsPanel, { props: { data: d } })
        .find('[data-testid="darts-start"]')
        .attributes('disabled'),
    ).toBeDefined();
  });

  it('无效的一镖不显示准星位置，写明原因；靶子画出 5 分圈（PR28 遗留）', async () => {
    const d = barData();
    d.darts.round = { throws: [], aiming: false };
    vi.mocked(endpoints.barDartsAim).mockResolvedValue({ period: 900, phase: 0.25 });
    vi.mocked(endpoints.barDartsThrow).mockResolvedValue({
      x: null,
      score: 0,
      throws: [0],
      finished: false,
      boss: null,
      result: null,
      award: null,
      refund: 0,
    });
    const w = mount(DartsPanel, { props: { data: d } });
    expect(w.findAll('.dt-darts-zones .is-5')).toHaveLength(2);
    // 靶子有文字说明（PR28 遗留）
    expect(w.find('.dt-darts-board').attributes('aria-label')).toBe(
      '靶条: 正中 50 分, 向外依次 25、10、5 分, 边缘 0 分',
    );
    await w.find('[data-testid="darts-aim"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="darts-throw"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="darts-marker"]').exists()).toBe(false);
    expect(w.find('[data-testid="darts-invalid"]').text()).toBe('这一镖出手时间对不上, 判为脱靶, 记 0 分');
  });

  it('局在别处已经结束：清空局面并刷新（PR28 遗留）', async () => {
    const d = barData();
    d.darts.round = { throws: [10], aiming: false };
    vi.mocked(endpoints.barDartsAim).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'no_round' }));
    const w = mount(DartsPanel, { props: { data: d } });
    await w.find('[data-testid="darts-aim"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
    expect(throwBoxes(w)).toEqual(['第 1 镖?', '第 2 镖?', '第 3 镖?']);
    expect(w.find('[data-testid="darts-aim"]').exists()).toBe(false);
    expect(w.find('[data-testid="darts-start"]').exists()).toBe(true);
  });
});
