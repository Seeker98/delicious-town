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
    const f = job('f', 'nope', 'k');
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

describe('失败后重试（retry，收购分红：前一天收入没汇总好时会失败，原来一整天都写“还没发”）', () => {
  it('失败 10 分钟后再抢一次；成功了照常记完成，记着试了几次', async () => {
    const shardId = await createShard(t.db);
    let fail = true;
    const run = vi.fn(async () => {
      if (fail) throw new Error('income not ready');
      return { paid: 3 };
    });
    const j: PeriodicJob = { name: 'retry-ok', feature: 'shop', period: () => 'k', run, retry: true };
    const start = t.clock.now;
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    // 10 分钟内不重跑
    t.clock.set(new Date(start.getTime() + 5 * 60_000));
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(run).toHaveBeenCalledTimes(1);
    fail = false;
    t.clock.set(new Date(start.getTime() + 11 * 60_000));
    const r = await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(r.map((x) => x.ok)).toEqual([true]);
    expect(run).toHaveBeenCalledTimes(2);
    const row = await t.db
      .selectFrom('job_run')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('job', '=', 'retry-ok')
      .executeTakeFirstOrThrow();
    expect(row.finished_at).not.toBeNull();
    expect(row.stats).toEqual({ paid: 3 });
    t.clock.set(start);
  });

  it('连着失败 5 次就不再试；没开 retry 的任务照旧只跑一次', async () => {
    const shardId = await createShard(t.db);
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    const j: PeriodicJob = { ...job('retry-bad', 'shop', 'k', run), retry: true };
    const start = t.clock.now;
    for (let i = 0; i < 8; i++) {
      t.clock.set(new Date(start.getTime() + i * 11 * 60_000));
      await runDueJobs(deps(), [j], { shardIds: [shardId] });
    }
    expect(run).toHaveBeenCalledTimes(5);
    const row = await t.db
      .selectFrom('job_run')
      .select('stats')
      .where('shard_id', '=', shardId)
      .where('job', '=', 'retry-bad')
      .executeTakeFirstOrThrow();
    expect(row.stats).toMatchObject({ error: 'boom', attempts: 5 });
    t.clock.set(start);
  });
});

describe('重抢时就记下第几次（稳健性批终审：原来失败时才写，重跑中途进程崩了会按同一个次数一直重抢）', () => {
  it('重跑开始时 job_run 里的次数已经加 1', async () => {
    const shardId = await createShard(t.db);
    const seen: unknown[] = [];
    let first = true;
    const run = vi.fn(async () => {
      if (first) {
        first = false;
        throw new Error('boom');
      }
      const row = await t.db
        .selectFrom('job_run')
        .select('stats')
        .where('shard_id', '=', shardId)
        .where('job', '=', 'retry-count')
        .executeTakeFirstOrThrow();
      seen.push(row.stats);
      return { ok: 1 };
    });
    const j: PeriodicJob = { name: 'retry-count', feature: 'shop', period: () => 'k', run, retry: true };
    const start = t.clock.now;
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    t.clock.set(new Date(start.getTime() + 11 * 60_000));
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(seen).toEqual([{ error: 'boom', attempts: 2 }]);
    t.clock.set(start);
  });
});

describe('跑到一半进程没了（backlog：部署时被强杀，job_run 抢占了却没写完成也没写出错，开了 retry 也不重跑）', () => {
  const claimDead = (shardId: number, name: string, at: Date) =>
    t.db
      .insertInto('job_run')
      .values({ shard_id: shardId, job: name, period: 'k', started_at: at })
      .execute();

  it('开了 retry 的：没完成也没出错的抢占 30 分钟后再抢一次，之前不抢', async () => {
    const shardId = await createShard(t.db);
    const run = vi.fn(async () => ({ paid: 1 }));
    const j: PeriodicJob = { name: 'retry-dead', feature: 'shop', period: () => 'k', run, retry: true };
    const start = t.clock.now;
    await claimDead(shardId, 'retry-dead', start);
    t.clock.set(new Date(start.getTime() + 11 * 60_000));
    await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(run).not.toHaveBeenCalled();
    t.clock.set(new Date(start.getTime() + 31 * 60_000));
    const r = await runDueJobs(deps(), [j], { shardIds: [shardId] });
    expect(r.map((x) => x.ok)).toEqual([true]);
    expect(run).toHaveBeenCalledTimes(1);
    t.clock.set(start);
  });

  it('没开 retry 的照旧不重跑', async () => {
    const shardId = await createShard(t.db);
    const a = job('dead-once', 'shop', 'k');
    const start = t.clock.now;
    await claimDead(shardId, 'dead-once', start);
    t.clock.set(new Date(start.getTime() + 60 * 60_000));
    await runDueJobs(deps(), [a], { shardIds: [shardId] });
    expect(a.run).not.toHaveBeenCalled();
    t.clock.set(start);
  });
});
