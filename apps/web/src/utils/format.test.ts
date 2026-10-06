import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../stores/locale';
import { formatPct } from './format';

describe('百分数按语言写（视觉第三轮记下的）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('中文、英文：小数点、紧贴百分号', async () => {
    expect(formatPct(0.408)).toBe('40.8%');
    expect(formatPct(0.4)).toBe('40%');
    await useLocaleStore().set('en');
    expect(formatPct(0.408)).toBe('40.8%');
  });

  it('法文、西文：小数逗号，百分号前不换行的空格（U+00A0 还是 U+202F 看 ICU 版本）', async () => {
    await useLocaleStore().set('fr');
    expect(formatPct(0.408)).toMatch(/^40,8[\u00a0\u202f]%$/);
    await useLocaleStore().set('es');
    expect(formatPct(0.408)).toMatch(/^40,8[\u00a0\u202f]%$/);
  });

  it('位数、固定小数位、正负号', async () => {
    expect(formatPct(0.4, { min: 1 })).toBe('40.0%');
    expect(formatPct(0.12345, { digits: 2 })).toBe('12.35%');
    expect(formatPct(0.05, { sign: true })).toBe('+5%');
    expect(formatPct(-0.05, { sign: true })).toBe('-5%');
    expect(formatPct(0, { sign: true })).toBe('+0%');
  });
});
