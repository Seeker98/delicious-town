import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../game';
import { workerJobs } from './jobs';

describe('清理任务互不连累（稳健性批终审：每日计数清理出错时，连胜榜清理这一轮也跳过）', () => {
  it('每日计数清理出错，连胜榜照样清', async () => {
    // 假的 db：每日计数用原生 SQL 删（走 getExecutor），让它报错；删连胜榜时记下来
    // （服务端测试不用 vi.mock，也不碰共用测试库）
    const deleted: string[] = [];
    const db = {
      getExecutor: () => {
        throw new Error('boom');
      },
      deleteFrom: (table: string) => {
        deleted.push(table);
        return { where: () => ({ executeTakeFirst: async () => ({ numDeletedRows: 0n }) }) };
      },
    };
    const game = { app: { db, redis: {} }, deps: { now: () => new Date() }, jobs: [] } as unknown as Game;
    const jobs = workerJobs(game, { error: vi.fn() });
    const errors: string[] = [];
    for (const j of jobs.filter((x) => x.name.endsWith('-clean') && x.name !== 'login-trace-clean'))
      await j.run(new AbortController().signal).catch((e: Error) => errors.push(e.message));
    expect(errors).toEqual(['boom']);
    expect(deleted).toEqual(['bar_streak_best']);
  });
});
