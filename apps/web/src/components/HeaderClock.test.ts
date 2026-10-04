import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import HeaderClock from './HeaderClock.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { serverTime: vi.fn() } }));

describe('HeaderClock（问题记录 348：顶栏的当前时间）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    // 本机时钟慢了 1 小时：显示按服务器时间
    vi.setSystemTime(new Date('2026-10-04T05:30:10Z'));
    vi.mocked(endpoints.serverTime).mockResolvedValue({ now: '2026-10-04T06:30:10Z' });
  });
  afterEach(() => vi.useRealTimers());

  it('拿到服务器时间之前不显示（免得先闪一下本机时间）；读失败就按本机时间', async () => {
    let done: (v: { now: string }) => void = () => undefined;
    vi.mocked(endpoints.serverTime).mockReturnValueOnce(new Promise((r) => (done = r)));
    const w = mount(HeaderClock);
    expect(w.find('[data-testid="clock"]').exists()).toBe(false);
    done({ now: '2026-10-04T06:30:10Z' });
    await flushPromises();
    expect(w.get('[data-testid="clock"]').text()).toBe('14:30');
    vi.mocked(endpoints.serverTime).mockRejectedValueOnce(new Error('x'));
    const f = mount(HeaderClock);
    await flushPromises();
    expect(f.get('[data-testid="clock"]').text()).toBe('13:30');
  });

  it('按服务器时间、北京时间显示时:分；点开写日期和下一轮结算倒计时', async () => {
    const w = mount(HeaderClock);
    await flushPromises();
    expect(w.get('[data-testid="clock"]').text()).toBe('14:30');
    await w.get('[data-testid="clock"]').trigger('click');
    // 06:30:10 这一轮从 06:28:00 开始，下一轮 06:32:00
    expect(w.get('[data-testid="clock-detail"]').text()).toContain('1:50');
    expect(w.get('[data-testid="clock-detail"]').text()).toContain('10');
    vi.advanceTimersByTime(60_000);
    await w.vm.$nextTick();
    expect(w.get('[data-testid="clock"]').text()).toBe('14:31');
    expect(w.get('[data-testid="clock-detail"]').text()).toContain('0:50');
  });
});
