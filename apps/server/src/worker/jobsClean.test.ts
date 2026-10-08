import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../game';
import { pruneStreakBest } from '../modules/bar/state';
import { pruneDailyCounters } from '../modules/counter/dailyCounter';
import { workerJobs } from './jobs';

vi.mock('../modules/counter/dailyCounter', () => ({ pruneDailyCounters: vi.fn() }));
vi.mock('../modules/bar/state', () => ({ pruneStreakBest: vi.fn() }));

describe('清理任务互不连累（稳健性批终审：每日计数清理出错时，连胜榜清理这一轮也跳过）', () => {
  it('每日计数清理出错，连胜榜照样清', async () => {
    vi.mocked(pruneDailyCounters).mockRejectedValue(new Error('boom'));
    vi.mocked(pruneStreakBest).mockResolvedValue(0);
    const game = { app: { db: {}, redis: {} }, deps: { now: () => new Date() } } as unknown as Game;
    const jobs = workerJobs(game, { error: vi.fn() });
    for (const j of jobs.filter((x) => x.name.endsWith('-clean'))) await j.run().catch(() => {});
    expect(pruneDailyCounters).toHaveBeenCalled();
    expect(pruneStreakBest).toHaveBeenCalled();
  });
});
