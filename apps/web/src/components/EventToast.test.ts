import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../stores/toast';
import EventToast from './EventToast.vue';

describe('EventToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('显示提示，3 秒后自动消失；错误提示多停 2 秒（问题记录 344）', async () => {
    const toast = useToastStore();
    const w = mount(EventToast);
    toast.push('获得 银币 100');
    toast.push('银币不够', 'danger');
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]').map((x) => x.text())).toEqual(['获得 银币 100', '银币不够']);
    vi.advanceTimersByTime(3000);
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]').map((x) => x.text())).toEqual(['银币不够']);
    vi.advanceTimersByTime(2000);
    await w.vm.$nextTick();
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(0);
    vi.useRealTimers();
  });

  it('提示不拦截点击（问题记录 344：点下面的按钮不会先点中提示）', async () => {
    const toast = useToastStore();
    const w = mount(EventToast);
    toast.push('获得 银币 100');
    await w.vm.$nextTick();
    expect(w.get('.dt-toasts').classes()).toContain('dt-toasts-passthrough');
    vi.useRealTimers();
  });
});

describe('backlog 测试不稳定：得失提示按显示时的道具名', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('推送时道具目录还没加载完：目录到了以后提示里的名字跟着换', async () => {
    const name = ref('道具27');
    const toast = useToastStore();
    toast.push(`获得 ${name.value}×1`, 'success', 4000, () => `获得 ${name.value}×1`);
    const w = mount(EventToast);
    expect(w.get('[data-testid="toast"]').text()).toBe('获得 道具27×1');
    name.value = '每日签到礼包';
    await nextTick();
    expect(w.get('[data-testid="toast"]').text()).toBe('获得 每日签到礼包×1');
  });
});
