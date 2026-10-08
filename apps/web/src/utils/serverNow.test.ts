import { afterEach, describe, expect, it, vi } from 'vitest';
import { remainText } from './remain';
import { serverNowMs, setServerOffset } from './serverNow';

describe('按服务器时间的“现在”（backlog：倒计时用了设备时钟）', () => {
  afterEach(() => {
    vi.useRealTimers();
    setServerOffset(new Date().toISOString());
  });

  it('读到服务器时间后，本机时钟快了慢了都按服务器算', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
    // 服务器比本机快 8 小时（开发环境快进过时钟，或者设备时间不准）
    setServerOffset('2026-10-08T08:00:00Z');
    expect(new Date(serverNowMs()).toISOString()).toBe('2026-10-08T08:00:00.000Z');
    vi.setSystemTime(new Date('2026-10-08T00:01:00Z'));
    expect(new Date(serverNowMs()).toISOString()).toBe('2026-10-08T08:01:00.000Z');
  });

  it('剩余时间默认按服务器时间算', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
    setServerOffset('2026-10-08T08:00:00Z');
    // 服务器时间离 10:00 还有 2 小时；按本机时间算会是 10 小时
    expect(remainText('2026-10-08T10:00:00Z')).toBe(
      remainText('2026-10-08T10:00:00Z', Date.parse('2026-10-08T08:00:00Z')),
    );
  });
});
