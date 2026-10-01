import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createShard } from '../../test/fixtures';
import { createTestGame, type TestGame } from '../../test/game';
import type { PeriodicJob } from '../core/jobs';
import { runDueJobs } from './periodic';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = { error: vi.fn() };
const deps = () => ({ db: t.db, shards: t.game.shards, now: () => t.clock.now, log });

function job(
  name: string,
  feature: string,
  period: string | null,
  run = vi.fn(async () => ({ n: 1 })),
): PeriodicJob {
  return { name, feature, period: () => period, run };
}

describe('runDueJobs', () => {
  it('同一周期只执行一次，执行结果写进 job_run', async () => {
    const shardId = await createShard(t.db);
    const a = job('a', 'settlement', 'p1');
    await runDueJobs(deps(), [a], { shardIds: [shardId] });
    await runDueJobs(deps(), [a], { shardIds: [shardId] });
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(a.run).toHaveBeenCalledWith(expect.objectContaining({ shardId, period: 'p1' }));
    const row = await t.db
      .selectFrom('job_run')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('job', '=', 'a')
      .executeTakeFirstOrThrow();
    expect(row.stats).toEqual({ n: 1 });
    expect(row.finished_at).not.toBeNull();
  });

  it('周期键变化后再执行；返回 null 时不执行', async () => {
    const shardId = await createShard(t.db);
    let p: string | null = 'x1';
    const run = vi.fn(async () => ({}));
    const j: PeriodicJob = { name: 'b', feature: 'world', period: () => p, run };
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    p = null;
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    p = 'x2';
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('区服关闭了该功能、功能未实现、区服已关闭时都不执行', async () => {
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: off, override: JSON.stringify({ features: { market: false } }) })
      .execute();
    const closed = await createShard(t.db, { status: 'closed' });
    const m = job('m', 'market', 'k');
    const f = job('f', 'forum', 'k');
    await runDueJobs(deps(), [m, f], { shardIds: [off, closed] });
    expect(m.run).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });

  it('任务出错只记日志，不重试，也不影响其他任务', async () => {
    const shardId = await createShard(t.db);
    const bad = job(
      'bad',
      'shop',
      'k',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    const good = job('good', 'shop', 'k');
    const results = await runDueJobs(deps(), [bad, good], { shardIds: [shardId] });
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ['bad', false],
      ['good', true],
    ]);
    expect(log.error).toHaveBeenCalled();
    await runDueJobs(deps(), [bad, good], { shardIds: [shardId] });
    expect(bad.run).toHaveBeenCalledTimes(1);
  });
});
