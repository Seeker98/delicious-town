import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetWritesInFlight, whenWritesIdle, writeStarted, writesInFlight } from './writesInFlight';

describe('在路上的写请求（旧版本提醒）', () => {
  afterEach(() => {
    resetWritesInFlight();
    vi.useRealTimers();
  });

  it('没有写请求时马上结束', async () => {
    await expect(whenWritesIdle(1000)).resolves.toBeUndefined();
  });

  it('等最后一个写请求结束；同一个结束函数调两次只算一次', async () => {
    const a = writeStarted();
    const b = writeStarted();
    let done = false;
    const p = whenWritesIdle(10_000).then(() => (done = true));
    a();
    a();
    await Promise.resolve();
    expect(writesInFlight()).toBe(1);
    expect(done).toBe(false);
    b();
    await p;
    expect(done).toBe(true);
    expect(writesInFlight()).toBe(0);
  });

  it('请求卡住时最多等到超时', async () => {
    vi.useFakeTimers();
    writeStarted();
    let done = false;
    void whenWritesIdle(10_000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
