import { describe, expect, it } from 'vitest';
import { poolOptions } from '.';

describe('连接池（性能排查 2026-10-08）', () => {
  it('留几条常驻连接，其余空闲 1 分钟才断：默认 10 秒就断，线上人少时几乎每个请求都要重新建连接（约 14 毫秒）', () => {
    const o = poolOptions('postgres://x', 20);
    expect(o.max).toBe(20);
    expect(o.min).toBe(4);
    expect(o.idleTimeoutMillis).toBe(60_000);
  });

  it('上限比常驻数小时（命令行工具只开 1 条）不超过上限', () => {
    expect(poolOptions('postgres://x', 1).min).toBe(1);
  });
});
