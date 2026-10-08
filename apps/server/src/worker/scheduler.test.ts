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
    release();
    await s.stop(0);
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
    await s.stop(0);
  });
});

describe('停止时等正在跑的任务（backlog：部署时 SIGTERM 不等，10 秒后被杀，那一期抢占了却没跑完，之后不会再跑）', () => {
  it('stop 等正在跑的那一次跑完才返回，之后不再开始新的', async () => {
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
    let stopped: boolean | undefined;
    const p = s.stop(5000).then((done) => (stopped = done));
    await vi.advanceTimersByTimeAsync(2000);
    expect(stopped).toBeUndefined();
    release();
    await p;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(1);
  });

  it('等不完就到点返回 false，不卡住退出', async () => {
    vi.useFakeTimers();
    const s = startScheduler([{ name: 'stuck', intervalMs: 1000, run: () => new Promise<void>(() => {}) }], {
      error: vi.fn(),
    });
    let stopped: boolean | undefined;
    void s.stop(3000).then((done) => (stopped = done));
    await vi.advanceTimersByTimeAsync(2900);
    expect(stopped).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    expect(stopped).toBe(false);
  });

  it('没有在跑的任务时马上返回 true', async () => {
    vi.useFakeTimers();
    const s = startScheduler([{ name: 'fast', intervalMs: 1000, run: async () => {} }], { error: vi.fn() });
    await vi.advanceTimersByTimeAsync(10);
    await expect(s.stop(3000)).resolves.toBe(true);
  });
});
