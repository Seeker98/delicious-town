import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../stores/locale';
import { formatPct, gameDate, gameDateTime, timeHM } from './format';
import { newsTime } from './news';

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

describe('玩家看到的时间都按北京时间（问题记录：小镇新闻的时间和顶上的时钟对不上）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  // 04:00Z 是北京 12:00；设备在伦敦是 05:00、在 UTC 是 04:00
  const at = '2026-09-30T04:00:00.000Z';

  it('时:分、日期时间、日期都换算成北京时间，不看设备时区', () => {
    expect(timeHM(at)).toBe('12:00');
    expect(gameDateTime(at, { hour: '2-digit', minute: '2-digit', hour12: false })).toContain('12:00');
    expect(gameDateTime('2026-09-30T20:00:00.000Z', { month: 'numeric', day: 'numeric' })).toContain('10');
    expect(gameDate('2026-09-30T20:00:00.000Z')).toContain('10');
  });

  it('新闻时间按北京时间', () => {
    expect(newsTime(at)).toContain('12:00');
  });
});
