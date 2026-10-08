import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { serverNowMs } from '../utils/serverNow';
import HeaderClock from './HeaderClock.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { serverTime: vi.fn() } }));

describe('HeaderClock（问题记录 348：顶栏的当前时间）', () => {
  // 每条测试挂的时钟都卸掉：不然前面的实例也会响应切回前台的事件
  enableAutoUnmount(afterEach);
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

  it('读到时间后记下全站用的服务器时差；从后台切回来重新对一次时（稳健性批：原来只在挂载时对一次，休眠、设备对时后就不准）', async () => {
    const w = mount(HeaderClock);
    await flushPromises();
    expect(serverNowMs()).toBe(Date.parse('2026-10-04T06:30:10Z'));
    // 设备休眠回来：服务器时间往前走了 2 小时，本机时钟没动
    vi.mocked(endpoints.serverTime).mockClear().mockResolvedValue({ now: '2026-10-04T08:30:10Z' });
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(endpoints.serverTime).toHaveBeenCalled();
    expect(serverNowMs()).toBe(Date.parse('2026-10-04T08:30:10Z'));
    expect(w.get('[data-testid="clock"]').text()).toBe('16:30');
    vis.mockRestore();
    w.unmount();
  });

  it('还没读到时间就卸载了：之后切回前台不再去对时（终审：监听器原来在等待之后才加，卸载时删不掉）', async () => {
    let done: (v: { now: string }) => void = () => undefined;
    vi.mocked(endpoints.serverTime).mockReturnValueOnce(new Promise((r) => (done = r)));
    const w = mount(HeaderClock);
    w.unmount();
    done({ now: '2026-10-04T06:30:10Z' });
    await flushPromises();
    vi.mocked(endpoints.serverTime).mockClear();
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(endpoints.serverTime).not.toHaveBeenCalled();
    vis.mockRestore();
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

  it('点开后点别处、按 Esc 收起；点框里面不收起（问题记录 358）', async () => {
    const w = mount(HeaderClock, { attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="clock"]').trigger('click');
    w.get('[data-testid="clock-detail"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('[data-testid="clock-detail"]').exists()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('[data-testid="clock-detail"]').exists()).toBe(false);
    await w.get('[data-testid="clock"]').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await w.vm.$nextTick();
    expect(w.find('[data-testid="clock-detail"]').exists()).toBe(false);
    w.unmount();
  });
});
