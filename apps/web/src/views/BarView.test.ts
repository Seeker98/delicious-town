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
  NimPanel: { template: '<p>nim-panel</p>', props: ['data'] },
  SpicePanel: { template: '<p>spice-panel</p>', props: ['data'] },
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
    // 当前标签带 aria-current（PR28 遗留）
    expect(w.find('[data-testid="tab-slot"]').attributes('aria-current')).toBe('page');
    expect(w.find('[data-testid="tab-fg"]').attributes('aria-current')).toBeUndefined();
    expect(localStorage.getItem('dt_bar_tab')).toBe('slot');
    const again = mount(BarView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('slot-panel');
  });

  it('酒吧顶部有吉祥物雯姐（问题记录 210）', async () => {
    const w = mount(BarView, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="bar-wenjie"]').text()).toContain('雯姐');
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

  it('九个游戏用胶囊标签，选中的高亮；新游戏可以切过去（4C-3、最后一颗糖）', async () => {
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
      '最后一颗糖',
      '秘制调料',
    ]);
    await w.find('[data-testid="tab-spice"]').trigger('click');
    expect(w.text()).toContain('spice-panel');
    await w.find('[data-testid="tab-nim"]').trigger('click');
    expect(w.text()).toContain('nim-panel');
    await w.find('[data-testid="tab-devil"]').trigger('click');
    expect(w.text()).toContain('devil-panel');
    expect(w.find('[data-testid="tab-devil"]').classes()).toContain('active');
  });

  it('切到别的游戏再切回来，面板里进行中的状态还在（终审 I2）', async () => {
    const Counter = {
      props: ['data'],
      data: () => ({ n: 0 }),
      template: '<button data-testid="inc" @click="n++">{{ n }}</button>',
    };
    const w = mount(BarView, { global: { stubs: { ...stubs, MemoryPanel: Counter } } });
    await flushPromises();
    await w.find('[data-testid="tab-memory"]').trigger('click');
    await w.find('[data-testid="inc"]').trigger('click');
    await w.find('[data-testid="tab-fg"]').trigger('click');
    await w.find('[data-testid="tab-memory"]').trigger('click');
    expect(w.find('[data-testid="inc"]').text()).toBe('1');
  });
});
