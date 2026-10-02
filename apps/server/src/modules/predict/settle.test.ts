import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { trader } from '../exchange/test';
import { createPredictAdmin } from './admin';
import { closeEvents, settleEvents } from './jobs';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.predict;
const admin = () => createPredictAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'admin' as const, ip: '127.0.0.1' };
const coin = async (restId: number) => Number((await restRow(t, restId)).coin);
const ev = (id: number) =>
  t.db.selectFrom('predict_event').selectAll().where('id', '=', String(id)).executeTakeFirstOrThrow();

describe('截止（238-1 设计 §6.2）', () => {
  it('到时间的 open 事件改为 closed，没到的不动', async () => {
    const shardId = await createShard(t.db);
    const due = await newEvent(t, shardId, { closeInMs: 1_000 });
    const later = await newEvent(t, shardId, { closeInMs: 3_600_000 });
    t.clock.advance(2_000);
    expect(await closeEvents(t.game.deps, shardId, t.clock.now)).toEqual({ closed: 1 });
    expect((await ev(due)).status).toBe('closed');
    expect((await ev(later)).status).toBe('open');
  });
});

const resultNews = async (shardId: number) =>
  (
    await t.db
      .selectFrom('news')
      .select(['type', 'rest_id', 'params'])
      .where('shard_id', '=', shardId)
      .where('type', '=', 'predict.result')
      .execute()
  ).map((n) => ({ ...n, params: typeof n.params === 'string' ? JSON.parse(n.params) : n.params }));

describe('开奖上小镇新闻（问题记录 268）', () => {
  it('判定：写一条新闻，带题目、结果、参与和押对的店数、派出的银币', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { title: '明天会下雨吗' });
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const c = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 7 });
    await svc().trade(b, id, { side: 'no', dir: 'buy', qty: 4 });
    // c 买了又全部卖掉：算参与，不算押对
    await svc().trade(c, id, { side: 'yes', dir: 'buy', qty: 3 });
    await svc().trade(c, id, { side: 'yes', dir: 'sell', qty: 3 });
    await admin().resolve(actor, id, true);
    expect(await resultNews(shardId)).toEqual([
      {
        type: 'predict.result',
        rest_id: null,
        params: { eventId: id, title: '明天会下雨吗', outcome: true, players: 3, winners: 1, paid: 7000 },
      },
    ]);
  });

  it('作废：新闻写退款比例；没人参与也照样发', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { title: '题目写错了' });
    await admin().voidEvent(actor, id);
    expect(await resultNews(shardId)).toEqual([
      {
        type: 'predict.result',
        rest_id: null,
        params: { eventId: id, title: '题目写错了', outcome: null, voidRatio: 1, players: 0 },
      },
    ]);
  });

  it('已经是终态时再判定被拒，不重复发新闻', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    await admin().resolve(actor, id, false);
    await expect(admin().voidEvent(actor, id)).rejects.toThrow();
    expect(await resultNews(shardId)).toHaveLength(1);
  });
});

describe('判定和结算（238-1 设计 §6.3、§6.4）', () => {
  it('判定为是：押"是"的按 unit × 份数到账，押"否"的没有；写日志；全部结算完写 settled_at', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 7 });
    await svc().trade(b, id, { side: 'no', dir: 'buy', qty: 4 });
    const [ca, cb] = [await coin(a.restaurantId), await coin(b.restaurantId)];
    await admin().resolve(actor, id, true);
    expect(await settleEvents(t.game.deps, shardId, t.clock.now)).toEqual({ settled: 2 });
    expect(await coin(a.restaurantId)).toBe(ca + 7000);
    expect(await coin(b.restaurantId)).toBe(cb);
    // 押错的人也写一条结算日志（所得 0），日志带净投入，能看出这一局的盈亏（问题记录 254）
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['rest_id', 'params'])
      .where('type', '=', 'predict.settle')
      .where('rest_id', 'in', [a.restaurantId, b.restaurantId])
      .execute();
    const pos = await t.db
      .selectFrom('predict_position')
      .select(['rest_id', 'net_cost'])
      .where('event_id', '=', String(id))
      .execute();
    const net = (r: number) => Number(pos.find((p) => p.rest_id === r)!.net_cost);
    const params = (r: number) => logs.find((l) => l.rest_id === r)!.params;
    expect(params(a.restaurantId)).toMatchObject({ outcome: true, coin: 7000, net: net(a.restaurantId) });
    expect(params(b.restaurantId)).toMatchObject({ outcome: true, coin: 0, net: net(b.restaurantId) });
    expect((await ev(id)).settled_at).not.toBeNull();
    expect(await settleEvents(t.game.deps, shardId, t.clock.now)).toEqual({ settled: 0 });
    expect(await coin(a.restaurantId)).toBe(ca + 7000);
  });

  it('作废：没人卖出获利时每人退全部净投入', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const bought = (await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 10 })).data.total;
    const boughtB = (await svc().trade(b, id, { side: 'no', dir: 'buy', qty: 1 })).data.total;
    const [ca, cb] = [await coin(a.restaurantId), await coin(b.restaurantId)];
    await admin().voidEvent(actor, id);
    await settleEvents(t.game.deps, shardId, t.clock.now);
    expect(await coin(a.restaurantId)).toBe(ca + bought);
    expect(await coin(b.restaurantId)).toBe(cb + boughtB);
    const refund = await t.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'predict.refund')
      .execute();
    expect(refund).toHaveLength(1);
  });

  it('作废：有人卖出获利时，亏的人按比例退，退款总额不超过系统净收入（终审 I1：小号对倒）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 10_000_000 });
    const b = await trader(t, { shardId, coin: 10_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 100 });
    await svc().trade(b, id, { side: 'yes', dir: 'buy', qty: 100 });
    await svc().trade(b, id, { side: 'yes', dir: 'buy', qty: 100 });
    await svc().trade(a, id, { side: 'yes', dir: 'sell', qty: 100 });
    const pos = await t.db
      .selectFrom('predict_position')
      .select(['rest_id', 'net_cost'])
      .where('event_id', '=', String(id))
      .execute();
    const net = (r: number) => Number(pos.find((p) => p.rest_id === r)!.net_cost);
    expect(net(a.restaurantId)).toBeLessThan(0);
    const collected = net(a.restaurantId) + net(b.restaurantId);
    const [ca, cb] = [await coin(a.restaurantId), await coin(b.restaurantId)];
    await admin().voidEvent(actor, id);
    await settleEvents(t.game.deps, shardId, t.clock.now);
    const refundB = (await coin(b.restaurantId)) - cb;
    expect(await coin(a.restaurantId)).toBe(ca);
    expect(refundB).toBe(Math.floor(net(b.restaurantId) * (collected / net(b.restaurantId))));
    expect(refundB).toBeLessThanOrEqual(collected);
  });

  it('并发跑两次结算，每人只发一次（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const ts = [];
    for (let i = 0; i < 4; i++) ts.push(await trader(t, { shardId, coin: 1_000_000 }));
    for (const x of ts) await svc().trade(x, id, { side: 'no', dir: 'buy', qty: 2 });
    const before = await Promise.all(ts.map((x) => coin(x.restaurantId)));
    await admin().resolve(actor, id, false);
    await Promise.all([
      settleEvents(t.game.deps, shardId, t.clock.now),
      settleEvents(t.game.deps, shardId, t.clock.now),
    ]);
    const after = await Promise.all(ts.map((x) => coin(x.restaurantId)));
    expect(after.map((c, i) => c - before[i]!)).toEqual([2000, 2000, 2000, 2000]);
  });

  it('改区服 unit 后结算仍按事件的 unit（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { unit: 1000 });
    const a = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 3 });
    await setTuning(t, shardId, { predict: { unit: 9999 } });
    const c = await coin(a.restaurantId);
    await admin().resolve(actor, id, true);
    await settleEvents(t.game.deps, shardId, t.clock.now);
    expect(await coin(a.restaurantId)).toBe(c + 3000);
  });

  it('判定后再判定、作废都报 predict_final；判定可以在截止前做', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    await admin().resolve(actor, id, true);
    await expect(admin().resolve(actor, id, false)).rejects.toMatchObject({
      params: { reason: 'predict_final' },
    });
    await expect(admin().voidEvent(actor, id)).rejects.toMatchObject({ params: { reason: 'predict_final' } });
    const audit = await t.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `predict_event:${id}`)
      .execute();
    expect(audit.map((x) => x.action)).toEqual(['predict.resolve']);
  });

  it('守恒：随机买卖后判定结算，玩家银币变化合计 = −(净成交额 + 手续费 − 结算支出)', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { p0: 0.4 });
    const ts = [];
    for (let i = 0; i < 3; i++) ts.push(await trader(t, { shardId, coin: 20_000_000 }));
    const before = (await Promise.all(ts.map((x) => coin(x.restaurantId)))).reduce((s, c) => s + c, 0);
    const rng = seededRng(7);
    for (let i = 0; i < 30; i++) {
      const who = ts[Math.floor(rng.next() * ts.length)]!;
      const side = rng.next() < 0.5 ? 'yes' : 'no';
      const dir = rng.next() < 0.7 ? 'buy' : 'sell';
      const qty = 1 + Math.floor(rng.next() * 20);
      try {
        await svc().trade(who, id, { side, dir, qty });
      } catch (e) {
        // 卖出超过持有、买到持有上限都算正常的随机失败
        const x = (e as { params?: { reason?: string; what?: string } }).params;
        if (x?.reason !== 'predict_not_enough' && x?.what !== 'predict_hold') throw e;
      }
    }
    const tr = await t.db
      .selectFrom('predict_trade')
      .select(['dir', 'amount', 'fee'])
      .where('event_id', '=', String(id))
      .execute();
    const net = tr.reduce((s, x) => s + (x.dir === 'buy' ? 1 : -1) * Number(x.amount), 0);
    const fees = tr.reduce((s, x) => s + Number(x.fee), 0);
    const pos = await t.db
      .selectFrom('predict_position')
      .select('yes')
      .where('event_id', '=', String(id))
      .execute();
    const payout = 1000 * pos.reduce((s, x) => s + x.yes, 0);
    await admin().resolve(actor, id, true);
    await settleEvents(t.game.deps, shardId, t.clock.now);
    const after = (await Promise.all(ts.map((x) => coin(x.restaurantId)))).reduce((s, c) => s + c, 0);
    expect(after - before).toBe(-(net + fees - payout));
  });
});
