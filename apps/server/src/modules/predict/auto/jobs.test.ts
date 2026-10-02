import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../../test/game';
import { createAutoEvents, resolveAutoEvents } from './index';

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
    expect(after.result_note).toBe('今天 0，昨天 0');
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
    expect(after).toMatchObject({ status: 'void', result_note: '数据缺失，自动作废', void_ratio: 1 });
  });
});
