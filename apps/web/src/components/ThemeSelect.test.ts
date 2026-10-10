import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeSelect from './ThemeSelect.vue';
import { THEME_KEY } from '../utils/theme';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeSelect（外观三选一，界面改版 P1）', () => {
  it('默认选中跟随系统，三个选项', () => {
    const w = mount(ThemeSelect);
    const sel = w.get('[data-testid="theme-select"]').element as HTMLSelectElement;
    expect(sel.value).toBe('system');
    expect([...sel.options].map((o) => o.value)).toEqual(['system', 'light', 'dark']);
    expect([...sel.options].map((o) => o.text)).toEqual(['跟随系统', '浅色', '深色']);
  });

  it('选深色：存下来、页面立刻变深', async () => {
    const w = mount(ThemeSelect);
    await w.get('[data-testid="theme-select"]').setValue('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
