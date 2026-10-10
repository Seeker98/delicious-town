import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  installThemeWatcher,
  readThemePref,
  resolveTheme,
  setThemePref,
  THEME_KEY,
} from './theme';

/** 假的系统深浅色：可以手动触发 change */
function fakeMatchMedia(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.add(f),
    removeEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.delete(f),
  };
  window.matchMedia = vi.fn().mockReturnValue(mq) as never;
  return {
    flip(v: boolean) {
      mq.matches = v;
      for (const f of listeners) f({ matches: v });
    },
    count: () => listeners.size,
  };
}

const origMatchMedia = window.matchMedia;
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-bs-theme');
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
});
afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = origMatchMedia;
});

describe('主题设置（界面改版 P1，设计 §2.2）', () => {
  it('读设置：没存过、存了乱值、本地存储抛异常，都按跟随系统', () => {
    expect(readThemePref()).toBe('system');
    localStorage.setItem(THEME_KEY, 'blue');
    expect(readThemePref()).toBe('system');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readThemePref()).toBe('dark');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readThemePref()).toBe('system');
  });

  it('跟随系统时看系统，选了浅色深色就按选的', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('应用：<html> 写 data-theme 和 data-bs-theme，地址栏颜色跟着变', () => {
    applyTheme('dark');
    const html = document.documentElement;
    expect(html.dataset.theme).toBe('dark');
    expect(html.getAttribute('data-bs-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#211b2a');
  });

  it('改设置：存下来并立刻生效；存不了也照样生效', () => {
    fakeMatchMedia(false);
    setThemePref('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    setThemePref('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('跟随系统时系统切换，页面跟着变；选了浅色时不跟', () => {
    const sys = fakeMatchMedia(false);
    const stop = installThemeWatcher();
    sys.flip(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePref('light');
    sys.flip(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
    expect(sys.count()).toBe(0);
  });

  it('index.html 的渲染前脚本：和 theme.ts 同样的规则，坏值和异常都不报错', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    const src = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(src).toBeTruthy();
    expect(src).toContain(THEME_KEY);
    const run = () => new Function(src!)();
    fakeMatchMedia(true);
    run();
    expect(document.documentElement.dataset.theme).toBe('dark');
    localStorage.setItem(THEME_KEY, 'light');
    run();
    expect(document.documentElement.dataset.theme).toBe('light');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(run).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
