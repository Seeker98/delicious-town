import type { Redis } from 'ioredis';

export interface RateRule {
  capacity: number;
  refillPerSec: number;
}

export type RateRuleName = 'default' | 'auth' | 'email';

export const DEFAULT_RATE_RULES: Record<RateRuleName, RateRule> = {
  default: { capacity: 60, refillPerSec: 10 },
  auth: { capacity: 10, refillPerSec: 0.2 },
  email: { capacity: 3, refillPerSec: 1 / 60 },
};

export interface RateLimiter {
  consume(key: string, rule: RateRule, cost?: number, nowMs?: number): Promise<boolean>;
}

/** 令牌桶：原子地回填并扣减，桶满后自动过期 */
const SCRIPT = `
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1])
local ts = tonumber(b[2])
if tokens == nil then
  tokens = cap
  ts = now
end
tokens = math.min(cap, tokens + math.max(0, now - ts) / 1000 * rate)
local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) + 1000)
return allowed
`;

export function createRateLimiter(redis: Redis): RateLimiter {
  return {
    async consume(key, rule, cost = 1, nowMs = Date.now()) {
      const r = await redis.eval(SCRIPT, 1, `rl:${key}`, rule.capacity, rule.refillPerSec, nowMs, cost);
      return Number(r) === 1;
    },
  };
}
