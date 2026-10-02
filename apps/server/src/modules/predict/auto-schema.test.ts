import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { trader } from '../exchange/test';
import { finalizeEvent } from './finalize';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('自动出题的数值、字段和终态函数（238-2 设计 §3、§5）', () => {
  it('区服数值默认值', () => {
    expect(t.deps.config.tuning.predict.auto).toEqual({
      krab: true,
      market: true,
      weather: true,
      stats: true,
      b: 100,
      marketCloseMin: 5,
      statsCloseHour: 18,
    });
  });

  it('同一区服 auto_key 唯一；手动题 auto_key 为空不冲突', async () => {
    const shardId = await createShard(t.db);
    const a = await newEvent(t, shardId);
    const b = await newEvent(t, shardId);
    await t.db
      .updateTable('predict_event')
      .set({ auto_key: 'krab:2026-10-02' })
      .where('id', '=', String(a))
      .execute();
    await expect(
      t.db
        .updateTable('predict_event')
        .set({ auto_key: 'krab:2026-10-02' })
        .where('id', '=', String(b))
        .execute(),
    ).rejects.toThrow(/unique|duplicate/i);
    const other = await createShard(t.db);
    const c = await newEvent(t, other);
    await t.db
      .updateTable('predict_event')
      .set({ auto_key: 'krab:2026-10-02' })
      .where('id', '=', String(c))
      .execute();
  });

  it('finalizeEvent：判定写结果和判定依据；作废算退款比例；已是终态返回 null 不改', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId });
    await t.game.predict.trade(r, id, { side: 'yes', dir: 'buy', qty: 3 });
    const done = await t.db
      .transaction()
      .execute((tx) =>
        finalizeEvent(tx, String(id), { status: 'resolved', outcome: true, note: '依据' }, t.clock.now),
      );
    expect(done).toEqual({ title: '测试事件', voidRatio: null });
    const e = await t.db
      .selectFrom('predict_event')
      .selectAll()
      .where('id', '=', String(id))
      .executeTakeFirstOrThrow();
    expect(e).toMatchObject({ status: 'resolved', outcome: true, result_note: '依据' });
    const again = await t.db
      .transaction()
      .execute((tx) => finalizeEvent(tx, String(id), { status: 'void', outcome: null }, t.clock.now));
    expect(again).toBeNull();
    const v = await newEvent(t, shardId);
    await t.game.predict.trade(r, v, { side: 'no', dir: 'buy', qty: 2 });
    const voided = await t.db
      .transaction()
      .execute((tx) =>
        finalizeEvent(
          tx,
          String(v),
          { status: 'void', outcome: null, note: '数据缺失，自动作废' },
          t.clock.now,
        ),
      );
    expect(voided).toEqual({ title: '测试事件', voidRatio: 1 });
  });

  it('列表和详情带 auto、resultNote', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    await t.db
      .updateTable('predict_event')
      .set({ auto_key: 'stats:2026-10-02', result_note: '今天 3，昨天 2' })
      .where('id', '=', String(id))
      .execute();
    const r = await trader(t, { shardId });
    const l = await t.game.predict.list(r);
    expect(l.events.find((e) => e.id === id)).toMatchObject({ auto: true, resultNote: '今天 3，昨天 2' });
    expect((await t.game.predict.detail(r, id)).event).toMatchObject({
      auto: true,
      resultNote: '今天 3，昨天 2',
    });
  });
});
