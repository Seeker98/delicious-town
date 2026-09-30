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
    expect(w.findAll('[data-testid="num-pick"] option')).toHaveLength(25);
    await w.find('[data-testid="num-pick"]').setValue('20');
    await w.find('[data-testid="num-spin"]').trigger('click');
    await flushPromises();
    expect(endpoints.barNum).toHaveBeenCalledWith(20);
    expect(w.find('[data-testid="num-result"]').text()).toBe('转到了 18，就差一丝丝了');
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
    expect(w.find('[data-testid="num-result"]').text()).toBe('中了！连续中奖 2 次，得到 道具5×1');
  });

  it('礼券不够 8 张时按钮灰掉并写明原因', () => {
    const w = mount(NumPanel, { props: { data: barData({ tickets: 7 }) } });
    expect(w.find('[data-testid="num-spin"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('每次 8 张');
  });
});
