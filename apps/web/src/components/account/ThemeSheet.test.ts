import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '../../utils/theme';
import ThemeSheet from './ThemeSheet.vue';

/** 面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P11） */
const mountSheet = () => mount(ThemeSheet, { props: { open: true }, global: { stubs: { teleport: true } } });

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('外观面板（界面改版 P1 三选一；P11 从下拉框挪到面板）', () => {
  it('三行：跟随系统、浅色、深色，默认选中跟随系统；每行带小色板', () => {
    const w = mountSheet();
    const rows = w.findAll('[role="radio"]');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'theme-system',
      'theme-light',
      'theme-dark',
    ]);
    expect(rows.map((r) => r.get('.dt-pick-title').text())).toEqual(['跟随系统', '浅色', '深色']);
    expect(rows.map((r) => r.attributes('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(w.get('[data-testid="theme-dark"] .dt-theme-swatch').classes()).toContain('is-dark');
  });

  it('选深色：存下来、页面立刻变深，告诉父组件选了什么并关掉面板', async () => {
    const w = mountSheet();
    await w.get('[data-testid="theme-dark"]').trigger('click');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(w.emitted('picked')).toEqual([['dark']]);
    expect(w.emitted('close')).toHaveLength(1);
    expect(w.get('[data-testid="theme-dark"]').attributes('aria-checked')).toBe('true');
  });

  it('打开时选中本机存着的外观', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(mountSheet().get('[data-testid="theme-light"]').attributes('aria-checked')).toBe('true');
  });
});
