import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../../test/game';
import { createAutoEvents, resolveAutoEvents } from './index';
import { hiphop } from './hiphop';
import { market } from './market';

afterEach(() => vi.restoreAllMocks());
const log = { error: vi.fn(), info: vi.fn() };

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const DAY = '2026-11-03';
const at0 = gameTime(DAY, 0, 5);
const events = (shardId: number) =>
  t.db.selectFrom('predict_event').selectAll().where('shard_id', '=', shardId).orderBy('id').execute();

describe('出题任务（238-2 设计 §5.2）', () => {
  it('每类一题，auto_key 为 <开关>:D；重跑不重复出题（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const first = await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    expect(first.created.sort()).toEqual(['krab', 'market', 'stats', 'weather']);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(2));
    const rows = await events(shardId);
    expect(rows.map((r) => r.auto_key).sort()).toEqual([
      `krab:${DAY}`,
      `market:${DAY}`,
      `stats:${DAY}`,
      `weather:${DAY}`,
    ]);
    expect(rows.every((r) => r.created_by === null && r.b === 100 && r.status === 'open')).toBe(true);
    // 2026-11-03 是单数日：出蟹老板题
    expect(rows.find((r) => r.auto_key === `krab:${DAY}`)!.kind).toBe('krab');
  });

  it('双数日出嘻哈男孩；关掉嘻哈男孩功能时改出蟹老板；关掉开关不出这一类', async () => {
    const even = '2026-11-04';
    const s1 = await createShard(t.db);
    await createAutoEvents(t.game.deps, s1, gameTime(even, 0, 5), seededRng(1));
    expect((await events(s1)).find((r) => r.auto_key === `krab:${even}`)!.kind).toBe('hiphop');
    const s2 = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: s2,
        override: JSON.stringify({
          features: { hiphop: false },
          tuning: { predict: { auto: { market: false, weather: false } } },
        }),
      })
      .execute();
    t.game.shards.invalidate(s2);
    const r = await createAutoEvents(t.game.deps, s2, gameTime(even, 0, 5), seededRng(1));
    expect(r.created.sort()).toEqual(['krab', 'stats']);
  });
});

describe('判定任务（238-2 设计 §5.3）', () => {
  it('到判定时间写结果和判定依据；没到的不动', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const stats = (await events(shardId)).find((r) => r.kind === 'stats')!;
    expect(await resolveAutoEvents(t.game.deps, shardId, new Date(stats.resolve_at!.getTime() - 1))).toEqual({
      resolved: 0,
      voided: 0,
    });
    const res = await resolveAutoEvents(t.game.deps, shardId, stats.resolve_at!);
    expect(res.resolved).toBeGreaterThanOrEqual(1);
    const after = (await events(shardId)).find((r) => r.id === stats.id)!;
    expect(after).toMatchObject({ status: 'resolved', outcome: false });
    expect(after.result_note).toBe('11月3日 0；11月2日 0');
    // 判定依据的参数存下来，前端按语言渲染（问题记录 272）
    expect(after.result_params).toMatchObject({ today: 0, yesterday: 0 });
    const news = await t.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'predict.result')
      .executeTakeFirstOrThrow();
    expect(news.params).toMatchObject({ kind: 'stats', eventParams: { metric: 'coin' } });
  });

  it('已手动判定或作废的不覆盖（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const stats = (await events(shardId)).find((r) => r.kind === 'stats')!;
    await t.db
      .updateTable('predict_event')
      .set({ status: 'resolved', outcome: true, resolved_at: at0 })
      .where('id', '=', stats.id)
      .execute();
    await resolveAutoEvents(t.game.deps, shardId, stats.resolve_at!);
    const after = (await events(shardId)).find((r) => r.id === stats.id)!;
    expect(after).toMatchObject({ outcome: true, result_note: null });
  });

  it('过了判定时间 24 小时还判不了：自动作废，判定依据写数据缺失', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const m = (await events(shardId)).find((r) => r.kind === 'market')!;
    const late = new Date(m.resolve_at!.getTime() + 24 * 3_600_000);
    const res = await resolveAutoEvents(t.game.deps, shardId, late);
    expect(res.voided).toBeGreaterThanOrEqual(1);
    const after = (await events(shardId)).find((r) => r.id === m.id)!;
    expect(after).toMatchObject({
      status: 'void',
      result_note: '数据缺失, 自动作废',
      result_params: { void: 'missing' },
      void_ratio: 1,
    });
  });
});

describe('出错隔离（终审 I2）', () => {
  it('某一类出题报错：记日志，其他类照常出', async () => {
    const shardId = await createShard(t.db);
    vi.spyOn(market, 'create').mockRejectedValue(new Error('boom'));
    const r = await createAutoEvents(t.game.deps, shardId, at0, seededRng(1), log);
    expect(r.created.sort()).toEqual(['krab', 'stats', 'weather']);
    expect(log.error).toHaveBeenCalled();
  });

  it('某个事件判定一直报错：不挡住后面的事件；过了 24 小时照样自动作废', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const all = await events(shardId);
    const m = all.find((r) => r.kind === 'market')!;
    const s = all.find((r) => r.kind === 'stats')!;
    vi.spyOn(market, 'resolve').mockRejectedValue(new Error('boom'));
    const later = new Date(Math.max(m.resolve_at!.getTime(), s.resolve_at!.getTime()));
    const r1 = await resolveAutoEvents(t.game.deps, shardId, later, log);
    expect(r1.resolved).toBeGreaterThanOrEqual(1);
    expect((await events(shardId)).find((r) => r.id === s.id)!.status).toBe('resolved');
    const r2 = await resolveAutoEvents(
      t.game.deps,
      shardId,
      new Date(m.resolve_at!.getTime() + 24 * 3_600_000),
      log,
    );
    expect(r2.voided).toBeGreaterThanOrEqual(1);
    expect((await events(shardId)).find((r) => r.id === m.id)!.status).toBe('void');
  });
});

describe('出题的兜底和日志（backlog 238-2）', () => {
  it('双数日嘻哈男孩题出不了时改出蟹老板题；出不了的一类写日志', async () => {
    const even = '2026-11-04';
    const shardId = await createShard(t.db);
    vi.spyOn(hiphop, 'create').mockResolvedValueOnce(null);
    vi.spyOn(market, 'create').mockResolvedValueOnce(null);
    const r = await createAutoEvents(t.game.deps, shardId, gameTime(even, 0, 5), seededRng(1), log);
    expect(r.created.sort()).toEqual(['krab', 'stats', 'weather']);
    expect((await events(shardId)).find((x) => x.auto_key === `krab:${even}`)!.kind).toBe('krab');
    expect(log.info).toHaveBeenCalledWith({ shardId, flag: 'market' }, 'predict auto skipped');
  });
});
