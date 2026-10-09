import { describe, expect, it, vi } from 'vitest';
import type { PeriodicJob } from '../core/jobs';
import type { Game } from '../game';
import { splitPeriodic, workerJobs } from './jobs';

const job = (name: string) => ({ name }) as PeriodicJob;

describe('要调外部接口的周期任务单独跑（小镇日报终审 I1：不能拖住结算）', () => {
  it('小镇日报分到慢的一组，其他留在原来的循环里', () => {
    const { fast, slow } = splitPeriodic([job('settlement'), job('town-daily'), job('market-open')]);
    expect(fast.map((j) => j.name)).toEqual(['settlement', 'market-open']);
    expect(slow.map((j) => j.name)).toEqual(['town-daily']);
  });

  it('worker 有单独的慢任务入口', () => {
    const game = { app: { db: {}, redis: {} }, deps: { now: () => new Date() }, jobs: [] } as unknown as Game;
    const names = workerJobs(game, { error: vi.fn() }).map((j) => j.name);
    expect(names).toContain('periodic');
    expect(names).toContain('periodic-slow');
  });
});
