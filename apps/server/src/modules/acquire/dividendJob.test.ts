import { describe, expect, it, vi } from 'vitest';
import type { GameDeps } from '../../core/deps';
import { payDividends } from './dividend';
import { acquireJobs } from './jobs';

vi.mock('./dividend', () => ({ payDividends: vi.fn() }));

describe('分红有老板没发成时任务记成出错（稳健性批终审：原来只记日志、任务算成功，自动重试补不上）', () => {
  const job = () => acquireJobs({} as GameDeps).find((j) => j.name === 'acquire-dividend')!;
  const ctx = () => {
    const settings = { tuning: { acquire: {} } } as never;
    return { shardId: 1, period: 'p', now: new Date(), settings, log: { error: vi.fn() } };
  };

  it('failed > 0 时抛错（重试时已经发过的店跳过，见 dividend.test“同一天再跑一次不重复发”）', async () => {
    vi.mocked(payDividends).mockResolvedValue({ owners: 3, rests: 5, coin: 100, failed: 2, linked: 0 });
    await expect(job().run(ctx())).rejects.toThrow(/2/);
  });

  it('全部发成照常返回统计', async () => {
    const stats = { owners: 3, rests: 5, coin: 100, failed: 0, linked: 0 };
    vi.mocked(payDividends).mockResolvedValue(stats);
    await expect(job().run(ctx())).resolves.toEqual(stats);
  });
});
