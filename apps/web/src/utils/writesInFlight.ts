/**
 * 正在路上的写请求数（旧版本提醒 2026-11-17）：发版后要求刷新时，先等下单、抽奖这类写请求返回再刷，
 * 免得刷新打断请求、玩家不知道操作成没成功。api/client.ts 每个 POST 开始时 +1、结束时 −1
 */
let count = 0;
let waiters: Array<() => void> = [];

export function writeStarted(): () => void {
  count++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    count--;
    if (count > 0) return;
    const w = waiters;
    waiters = [];
    for (const fn of w) fn();
  };
}

export const writesInFlight = (): number => count;

/** 没有写请求在路上时结束；最多等 timeoutMs（请求卡住也不能让刷新一直等） */
export function whenWritesIdle(timeoutMs: number): Promise<void> {
  if (count === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    waiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** 测试用 */
export function resetWritesInFlight(): void {
  count = 0;
  waiters = [];
}
