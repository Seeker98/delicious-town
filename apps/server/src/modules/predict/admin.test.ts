import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { trader } from '../exchange/test';
import { createPredictAdmin } from './admin';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const admin = () => createPredictAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'mod' as const, ip: '127.0.0.1' };
const inHour = () => new Date(t.clock.now.getTime() + 3_600_000).toISOString();

describe('后台出题和列表（238-1 设计 §7.3）', () => {
  it('出题：开始时间为现在，b 默认 defaultB，unit 复制区服数值，初始概率生效；写审计日志', async () => {
    const shardId = await createShard(t.db);
    const { id } = await admin().create(actor, {
      shardId,
      title: '会下雨吗',
      description: '',
      closeAt: inHour(),
      p0: 80,
    });
    const e = await t.db
      .selectFrom('predict_event')
      .selectAll()
      .where('id', '=', String(id))
      .executeTakeFirstOrThrow();
    expect(e).toMatchObject({
      shard_id: shardId,
      title: '会下雨吗',
      b: 100,
      unit: 1000,
      p0: 0.8,
      status: 'open',
      created_by: 1,
    });
    expect(e.open_at.getTime()).toBe(t.clock.now.getTime());
    expect(e.q_yes - e.q_no).toBeCloseTo(100 * Math.log(4), 9);
    const audit = await t.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `predict_event:${id}`)
      .execute();
    expect(audit).toEqual([{ action: 'predict.create' }]);
  });

  it('截止时间不晚于现在报 predict_close_at', async () => {
    const shardId = await createShard(t.db);
    await expect(
      admin().create(actor, {
        shardId,
        title: 'x',
        description: '',
        closeAt: t.clock.now.toISOString(),
        p0: 50,
      }),
    ).rejects.toMatchObject({ params: { reason: 'predict_close_at' } });
  });

  it('列表：最新在前；成交笔数、持仓人数、手续费、结果为是/否时系统收支', async () => {
    const shardId = await createShard(t.db);
    const { id } = await admin().create(actor, {
      shardId,
      title: 'A',
      description: '',
      closeAt: inHour(),
      p0: 50,
      b: 50,
    });
    const { id: id2 } = await admin().create(actor, {
      shardId,
      title: 'B',
      description: '',
      closeAt: inHour(),
      p0: 50,
    });
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const r1 = (await t.game.predict.trade(a, id, { side: 'yes', dir: 'buy', qty: 5 })).data;
    const r2 = (await t.game.predict.trade(a, id, { side: 'no', dir: 'buy', qty: 2 })).data;
    const rows = await admin().list(shardId);
    expect(rows.map((r) => r.id)).toEqual([id2, id]);
    expect(rows[1]).toMatchObject({
      title: 'A',
      status: 'open',
      trades: 2,
      holders: 1,
      fees: r1.fee + r2.fee,
      ifYes: r1.amount + r2.amount - 5000,
      ifNo: r1.amount + r2.amount - 2000,
    });
  });
});

describe('backlog 238-1：判定、作废的审计日志带备注', () => {
  it('填了备注写进审计；不填也能判定', async () => {
    const shardId = await createShard(t.db);
    const boss = { ...actor, role: 'admin' as const };
    const a = await newEvent(t, shardId);
    const b = await newEvent(t, shardId);
    await admin().resolve(boss, a, true, '官方公告已发布');
    await admin().voidEvent(boss, b, '题目有歧义');
    const notes = await t.db
      .selectFrom('audit_log')
      .select(['action', 'detail'])
      .where('target', 'in', [`predict_event:${a}`, `predict_event:${b}`])
      .where('action', 'in', ['predict.resolve', 'predict.void'])
      .orderBy('id')
      .execute();
    expect(notes.map((x) => [x.action, (x.detail as { note?: string }).note])).toEqual([
      ['predict.resolve', '官方公告已发布'],
      ['predict.void', '题目有歧义'],
    ]);
  });
});
