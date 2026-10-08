import { describe, expect, it } from 'vitest';
import { adminTime, fromGameInput, toGameInput } from './gameInput';

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
