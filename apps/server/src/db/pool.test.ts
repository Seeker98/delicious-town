import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool, poolOptions } from '.';

describe('连接池（性能排查 2026-10-08）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('留几条常驻连接，其余空闲 1 分钟才断：默认 10 秒就断，线上人少时几乎每个请求都要重新建连接（约 14 毫秒）', () => {
    const o = poolOptions('postgres://x', 20);
    expect(o.max).toBe(20);
    expect(o.min).toBe(4);
    expect(o.idleTimeoutMillis).toBe(60_000);
    // 常驻连接 30 分钟换一次：长寿的连接会一直攒按天分区的表的缓存（性能排查终审遗留）
    expect(o.maxLifetimeSeconds).toBe(1800);
  });

  it('上限比常驻数小时（命令行工具只开 1 条）不超过上限', () => {
    expect(poolOptions('postgres://x', 1).min).toBe(1);
  });

  it('空闲连接被服务端断开（Postgres 重启等）只记一条日志，不让进程崩掉（终审 I1：常驻连接让这事从偶发变成必然）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pool = createPool('postgres://x', 1);
    expect(() =>
      pool.emit('error', new Error('terminating connection due to administrator command')),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    await pool.end();
  });
});
