/** 可以推进的时钟：只用于开发和端到端测试（ENABLE_TEST_API） */
export interface ShiftClock {
  now(): Date;
  advance(ms: number): void;
  offset(): number;
}

export function createShiftClock(base: () => number = Date.now): ShiftClock {
  let offset = 0;
  return {
    now: () => new Date(base() + offset),
    advance: (ms) => {
      offset += ms;
    },
    offset: () => offset,
  };
}
