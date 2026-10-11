import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import NumPanel from './NumPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barNum: vi.fn() } }));

describe('NumPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('选数字转；没中时显示转到的数字和提示', async () => {
    vi.mocked(endpoints.barNum).mockResolvedValue({
      win: false,
      barNum: 18,
      hint: 'close',
      times: 1,
      lucky: false,
      award: null,
    });
    const w = mount(NumPanel, { props: { data: barData() } });
    // 1~25 的数字格子（界面改版 P9，原来是下拉框），默认选 13
    expect(w.findAll('[data-testid="num-pick"] button')).toHaveLength(25);
    expect(w.find('[data-testid="num-13"]').attributes('aria-pressed')).toBe('true');
    await w.find('[data-testid="num-20"]').trigger('click');
    expect(w.find('[data-testid="num-20"]').attributes('aria-pressed')).toBe('true');
    expect(w.find('[data-testid="num-13"]').attributes('aria-pressed')).toBe('false');
    expect(w.find('[data-testid="num-spin"]').text()).toBe('转 20 · 8 张礼券');
    await w.find('[data-testid="num-spin"]').trigger('click');
    await flushPromises();
    expect(endpoints.barNum).toHaveBeenCalledWith(20);
    const res = w.find('[data-testid="num-result"]');
    expect(res.find('.dt-num-ball').text()).toBe('18');
    expect(res.find('b').text()).toBe('转到了 18, 你选的是 20');
    expect(res.find('.dt-num-hint').text()).toBe('就差一丝丝了');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('中奖写连续中奖次数和物品', async () => {
    vi.mocked(endpoints.barNum).mockResolvedValue({
      win: true,
      barNum: 13,
      hint: null,
      times: 2,
      lucky: false,
      award: { kind: 'goods', id: 5, num: 1, lucky: false },
    });
    const w = mount(NumPanel, { props: { data: barData() } });
    await w.find('[data-testid="num-spin"]').trigger('click');
    await flushPromises();
    const res = w.find('[data-testid="num-result"]');
    expect(res.classes()).toContain('is-ok');
    expect(res.find('b').text()).toBe('转中了！连续中奖 2 次');
    expect(res.findAll('[data-testid="award-chip"]').map((c) => c.text())).toEqual(['道具5×1']);
  });

  it('礼券不够 8 张时按钮灰掉并写明原因', () => {
    const w = mount(NumPanel, { props: { data: barData({ tickets: 7 }) } });
    expect(w.find('[data-testid="num-spin"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('每次 8 张');
  });
});
