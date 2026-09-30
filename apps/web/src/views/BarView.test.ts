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
});
