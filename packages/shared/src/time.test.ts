import { describe, expect, it } from 'vitest';
import { gameDay } from './time';

describe('gameDay', () => {
  it('按北京时间切日', () => {
    expect(gameDay(new Date('2026-09-29T15:59:59Z'))).toBe('2026-09-29');
    expect(gameDay(new Date('2026-09-29T16:00:00Z'))).toBe('2026-09-30');
  });
});
