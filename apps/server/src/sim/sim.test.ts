import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bench } from './bench';
import { explain } from './explain';
import { writeReport } from './report';
import { runSim } from './run';

const adminUrl = process.env.DATABASE_URL!;
const bundlePath = process.env.CONFIG_BUNDLE_PATH!;
const redisUrl = (() => {
  const u = new URL(process.env.REDIS_URL!);
  u.pathname = '/15';
  return u.toString();
})();
const base = { adminUrl, redisUrl, bundlePath, seed: 1 };
const start = new Date('2026-10-01T00:00:00+08:00');

describe('模拟器冒烟测试', () => {
  it('压测：20 家店 1 轮', async () => {
    const r = await bench({ ...base, dbName: 'dt_sim_bench_test', restaurants: 20, rounds: 1 });
    expect(r.rounds[0]).toMatchObject({ settled: 20, failed: 0 });
  }, 120_000);

  it('1 个勤快机器人跑 1 天，生成报告', async () => {
    const r = await runSim({
      ...base,
      dbName: 'dt_sim_test',
      days: 1,
      botsPerPersona: 1,
      personas: ['diligent'],
      start,
    });
    expect(r.days.map((d) => d.day)).toEqual([0, 1]);
    expect(r.days[1]!.level).toBeGreaterThan(1);
    expect(r.economy.some((e) => e.source === 'settlement')).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'dt-sim-'));
    writeReport(dir, r);
    expect(existsSync(join(dir, 'report.html'))).toBe(true);
  }, 600_000);

  it('同样的参数跑两次，结果完全一样', async () => {
    const o = {
      ...base,
      dbName: 'dt_sim_test',
      days: 0.25,
      botsPerPersona: 1,
      personas: ['diligent' as const],
      start,
    };
    const a = await runSim(o);
    const b = await runSim(o);
    expect(b.economy).toEqual(a.economy);
  }, 600_000);

  it('单店分解：示例快照能跑', async () => {
    const text = await explain({
      bundlePath,
      rounds: 2,
      seed: 1,
      state: fileURLToPath(new URL('./examples/star3.json', import.meta.url)),
    });
    expect(text).toContain('第 1 轮');
    expect(text).toContain('atRate');
  });
});
