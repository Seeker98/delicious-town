import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { barData } from '../components/bar/testData';
import BarView from './BarView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { bar: vi.fn() } }));

const stubs = {
  FgPanel: { template: '<p>fg-panel</p>', props: ['data'] },
  CupPanel: { template: '<p>cup-panel</p>', props: ['data'] },
  NumPanel: { template: '<p>num-panel</p>', props: ['data'] },
  SlotPanel: { template: '<p>slot-panel</p>', props: ['data'] },
  DevilPanel: { template: '<p>devil-panel</p>', props: ['data'] },
  MemoryPanel: { template: '<p>memory-panel</p>', props: ['data'] },
  DartsPanel: { template: '<p>darts-panel</p>', props: ['data'] },
};

describe('BarView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.bar).mockResolvedValue(barData());
  });

  it('读取后显示礼券和蟹币；默认划拳；切到老虎机并记住', async () => {
    const w = mount(BarView, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="bar-wallet"]').text()).toBe('神秘礼券 20；蟹币 3');
    expect(w.text()).toContain('fg-panel');
    await w.find('[data-testid="tab-slot"]').trigger('click');
    expect(w.text()).toContain('slot-panel');
    expect(localStorage.getItem('dt_bar_tab')).toBe('slot');
    const again = mount(BarView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('slot-panel');
  });

  it('面板要求刷新时重新读取', async () => {
    const w = mount(BarView, {
      global: {
        stubs: {
          ...stubs,
          FgPanel: {
            template: `<button data-testid="again" @click="$emit('reload')">again</button>`,
            props: ['data'],
            emits: ['reload'],
          },
        },
      },
    });
    await flushPromises();
    await w.find('[data-testid="again"]').trigger('click');
    await flushPromises();
    expect(endpoints.bar).toHaveBeenCalledTimes(2);
  });

  it('七个游戏用胶囊标签，选中的高亮；新游戏可以切过去（4C-3）', async () => {
    const w = mount(BarView, { global: { stubs } });
    await flushPromises();
    const pills = w.findAll('.dt-pills a');
    expect(pills.map((p) => p.text())).toEqual([
      '划拳',
      '猜酒杯',
      '转数字',
      '老虎机',
      '魔鬼辣杯',
      '记忆调酒',
      '飞镖',
    ]);
    await w.find('[data-testid="tab-devil"]').trigger('click');
    expect(w.text()).toContain('devil-panel');
    expect(w.find('[data-testid="tab-devil"]').classes()).toContain('active');
  });
});
