import { describe, expect, it } from 'vitest';
import { aggregateEffects } from './aggregate';

const now = new Date('2026-09-29T00:00:00Z');
const later = (h: number) => new Date(now.getTime() + h * 3600_000);

describe('aggregateEffects', () => {
  it('按键求和，忽略已过期的来源', () => {
    const { agg } = aggregateEffects(
      [
        { effects: { atRate: 0.1, coinRate: 0.2 }, expiresAt: null },
        { effects: { atRate: 0.2 }, expiresAt: later(1) },
        { effects: { atRate: 5 }, expiresAt: later(-1) },
      ],
      now,
    );
    expect(agg).toEqual({ atRate: 0.3, coinRate: 0.2 });
  });

  it('nextExpireAt 是最早的未来到期时间；都永久时为 null', () => {
    expect(
      aggregateEffects(
        [
          { effects: {}, expiresAt: later(5) },
          { effects: {}, expiresAt: later(2) },
        ],
        now,
      ).nextExpireAt,
    ).toEqual(later(2));
    expect(aggregateEffects([{ effects: { a: 1 }, expiresAt: null }], now).nextExpireAt).toBeNull();
  });
});
