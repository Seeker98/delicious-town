import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from '../infra/redis';
import { createRateLimiter } from './rateLimiter';

const redis = createRedis(process.env.REDIS_URL!);
const limiter = createRateLimiter(redis);
afterAll(() => redis.disconnect());
const key = () => `test:${Math.random().toString(36).slice(2)}`;

describe('token bucket', () => {
  it('容量用完后拒绝，按速率回填', async () => {
    const k = key();
    const rule = { capacity: 3, refillPerSec: 1 };
    const t0 = 1_000_000;
    expect(await limiter.consume(k, rule, 1, t0)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0)).toBe(false);
    expect(await limiter.consume(k, rule, 1, t0 + 1000)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0 + 1000)).toBe(false);
  });

  it('回填不超过容量', async () => {
    const k = key();
    const rule = { capacity: 2, refillPerSec: 10 };
    expect(await limiter.consume(k, rule, 2, 0)).toBe(true);
    expect(await limiter.consume(k, rule, 3, 100_000)).toBe(false);
    expect(await limiter.consume(k, rule, 2, 100_000)).toBe(true);
  });

  it('不同的 key 互不影响', async () => {
    const rule = { capacity: 1, refillPerSec: 0.001 };
    const a = key();
    const b = key();
    expect(await limiter.consume(a, rule, 1, 0)).toBe(true);
    expect(await limiter.consume(a, rule, 1, 0)).toBe(false);
    expect(await limiter.consume(b, rule, 1, 0)).toBe(true);
  });
});
