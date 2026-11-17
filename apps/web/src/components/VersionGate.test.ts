import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_GAP_MS, POLL_MS, TYPING_GRACE_MS, markReloadFor } from '../utils/versionCheck';
import { resetWritesInFlight, writeStarted } from '../utils/writesInFlight';
import VersionGate from './VersionGate.vue';

type Exposed = { check: (force?: boolean) => Promise<void> };

function mountGate(latest: () => string | null, enabled = true) {
  const fetchLatest = vi.fn(() => Promise.resolve(latest()));
  const reload = vi.fn();
  const w = mount(VersionGate, {
    props: { enabled, mine: 'aaa111', fetchLatest, reload },
    attachTo: document.body,
  });
  return { w, fetchLatest, reload, check: (force = true) => (w.vm as unknown as Exposed).check(force) };
}

describe('旧版本提醒弹框（2026-11-17）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetWritesInFlight();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('版本号一样不弹；线上换了新版本就弹不能关的框', async () => {
    let latest = 'aaa111';
    const { w, check } = mountGate(() => latest);
    await check();
    await flushPromises();
    expect(w.find('[data-testid="version-gate"]').exists()).toBe(false);
    latest = 'bbb222';
    await check();
    await flushPromises();
    const dlg = w.get('[data-testid="version-gate"]');
    expect(dlg.attributes('role')).toBe('alertdialog');
    expect(dlg.text()).toContain('游戏已更新');
    // 只有一个按钮：刷新
    expect(dlg.findAll('button')).toHaveLength(1);
    expect(dlg.get('[data-testid="version-refresh"]').text()).toBe('刷新');
    w.unmount();
  });

  it('每 5 分钟读一次；切回标签页时读一次，但两次至少隔 30 秒', async () => {
    const { w, fetchLatest } = mountGate(() => 'aaa111');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN_GAP_MS);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(fetchLatest).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it('关掉检查（开发环境）时不读', async () => {
    const { w, fetchLatest } = mountGate(() => 'bbb222', false);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(fetchLatest).not.toHaveBeenCalled();
    w.unmount();
  });

  it('点刷新：等写请求返回再刷，记下为哪个版本刷的', async () => {
    const { w, check, reload } = mountGate(() => 'bbb222');
    await check();
    await flushPromises();
    const done = writeStarted();
    await w.get('[data-testid="version-refresh"]').trigger('click');
    await flushPromises();
    expect(reload).not.toHaveBeenCalled();
    expect(w.get('[data-testid="version-refresh"]').text()).toBe('正在刷新…');
    done();
    await flushPromises();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('dt_version_reload')!).build).toBe('bbb222');
    w.unmount();
  });

  it('刚为这个版本刷新过（刷完还是旧页面）：冷却期内不弹', async () => {
    markReloadFor('bbb222');
    const { w, check } = mountGate(() => 'bbb222');
    await check();
    await flushPromises();
    expect(w.find('[data-testid="version-gate"]').exists()).toBe(false);
    w.unmount();
  });

  it('正在输入框里写东西：先不弹，写完（离开输入框）再弹，最多推迟 3 分钟', async () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.value = '写了一半';
    ta.focus();
    const { w, check } = mountGate(() => 'bbb222');
    await check();
    await flushPromises();
    expect(w.find('[data-testid="version-gate"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(TYPING_GRACE_MS - 10_000);
    expect(w.find('[data-testid="version-gate"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.find('[data-testid="version-gate"]').exists()).toBe(true);
    w.unmount();
  });

  it('写完离开输入框后，下一次检查就弹', async () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.value = '写了一半';
    ta.focus();
    const { w, check } = mountGate(() => 'bbb222');
    await check();
    ta.blur();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(w.find('[data-testid="version-gate"]').exists()).toBe(true);
    w.unmount();
  });
});
