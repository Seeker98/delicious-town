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
