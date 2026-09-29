import type { Redis } from 'ioredis';

/** 可以推进的时钟：只用于开发和端到端测试（ENABLE_TEST_API） */
export interface ShiftClock {
  now(): Date;
  advance(ms: number): void;
  offset(): number;
  setOffset(ms: number): void;
}

export function createShiftClock(base: () => number = Date.now): ShiftClock {
  let offset = 0;
  return {
    now: () => new Date(base() + offset),
    advance: (ms) => {
      offset += ms;
    },
    offset: () => offset,
    setOffset: (ms) => {
      offset = ms;
    },
  };
}

/** API 和 worker 是两个进程：推进后的偏移放在 Redis 里共享，进程重启后也不丢 */
export const CLOCK_OFFSET_KEY = 'dev:clock-offset';

export async function pullOffset(clock: ShiftClock, redis: Redis): Promise<void> {
  const v = await redis.get(CLOCK_OFFSET_KEY);
  if (v !== null && Number.isFinite(Number(v))) clock.setOffset(Number(v));
}

export async function pushOffset(clock: ShiftClock, redis: Redis): Promise<void> {
  await redis.set(CLOCK_OFFSET_KEY, String(clock.offset()));
}
