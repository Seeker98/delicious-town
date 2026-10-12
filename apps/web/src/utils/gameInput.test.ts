import { describe, expect, it } from 'vitest';
import { adminDate, adminMinute, adminShort, adminTime, fromGameInput, toGameInput } from './gameInput';

// 后台的时间输入框按北京时间（终审：运营的机器在伦敦，填 20:00 实际成了北京时间次日 03:00）
describe('后台时间输入框按北京时间', () => {
  it('北京时间 2026-10-08 20:00 = 12:00Z，和设备时区无关', () => {
    expect(fromGameInput('2026-10-08T20:00')).toBe('2026-10-08T12:00:00.000Z');
    expect(toGameInput(new Date('2026-10-08T12:00:00.000Z'))).toBe('2026-10-08T20:00');
  });

  it('跨日：北京时间 01:30 是前一天 17:30Z', () => {
    expect(fromGameInput('2026-10-09T01:30')).toBe('2026-10-08T17:30:00.000Z');
    expect(toGameInput(new Date('2026-10-08T17:30:00.000Z'))).toBe('2026-10-09T01:30');
  });

  it('列表显示按北京时间', () => {
    expect(adminTime('2026-10-08T12:00:00.000Z')).toContain('20:00');
  });
});

describe('后台表格里的日期和短时间（界面改版 P12）', () => {
  it('日期补零，按北京时间跨日', () => {
    expect(adminDate('2026-10-02T16:30:00.000Z')).toBe('2026/10/03');
  });

  it('今年的只写月日时分，不是今年的写年', () => {
    const now = new Date('2026-10-12T00:00:00.000Z');
    expect(adminShort('2026-10-11T22:57:00.000Z', now)).toBe('10/12 06:57');
    expect(adminShort('2025-12-31T01:05:00.000Z', now)).toBe('2025/12/31 09:05');
  });

  it('完整时间到分钟，月日不补零', () => {
    expect(adminMinute('2026-10-09T13:18:40.000Z')).toBe('2026/10/9 21:18');
  });
});
