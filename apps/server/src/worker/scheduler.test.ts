import { afterEach, describe, expect, it, vi } from 'vitest';
import { startScheduler } from './scheduler';

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduler', () => {
  it('启动时先跑一次，之后按间隔运行；上一次没结束时跳过', async () => {
    vi.useFakeTimers();
    let runs = 0;
    let release: () => void = () => {};
    const job = {
      name: 'slow',
      intervalMs: 1000,
      run: () => {
        runs += 1;
        return new Promise<void>((r) => {
          release = r;
        });
      },
    };
    const s = startScheduler([job], { error: vi.fn() });
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(2);
    s.stop();
  });

  it('任务出错只记日志，下一轮照常运行', async () => {
    vi.useFakeTimers();
    const log = { error: vi.fn() };
    let runs = 0;
    const s = startScheduler(
      [
        {
          name: 'bad',
          intervalMs: 1000,
          run: async () => {
            runs += 1;
            throw new Error('x');
          },
        },
      ],
      log,
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toBe(3);
    expect(log.error).toHaveBeenCalledTimes(3);
    s.stop();
  });
});
