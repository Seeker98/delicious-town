import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../stores/toast';
import EventToast from './EventToast.vue';

describe('EventToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('显示提示，3 秒后自动消失，点击立即消失', async () => {
    const toast = useToastStore();
    const w = mount(EventToast);
    toast.push('获得 银币 100');
    toast.push('消耗 银币 5', 'info');
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]').map((x) => x.text())).toEqual(['获得 银币 100', '消耗 银币 5']);
    await w.findAll('[data-testid="toast"]')[0]!.trigger('click');
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(0);
    vi.useRealTimers();
  });
});
