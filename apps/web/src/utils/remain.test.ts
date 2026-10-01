import { describe, expect, it } from 'vitest';
import { remainText } from './remain';

describe('剩余时间（问题记录 181）', () => {
  const now = new Date('2026-10-01T00:00:00Z').getTime();
  const at = (min: number) => new Date(now + min * 60_000).toISOString();
  it('一小时以上写小时和分钟，不足一小时写分钟，向上取整；永久和已过期', () => {
    expect(remainText(at(90), now)).toBe('剩余 1 小时 30 分');
    expect(remainText(at(120), now)).toBe('剩余 2 小时');
    expect(remainText(at(30), now)).toBe('剩余 30 分钟');
    expect(remainText(new Date(now + 29.2 * 60_000).toISOString(), now)).toBe('剩余 30 分钟');
    expect(remainText(at(-5), now)).toBe('剩余 0 分钟');
    expect(remainText(null, now)).toBe('永久');
  });
});
