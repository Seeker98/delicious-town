import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { predictQuote } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { setTuning } from '../../../test/town';
import { trader } from '../exchange/test';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.predict;
const T = { unit: 1000, feeRate: 0.02 };
const coin = async (restId: number) => Number((await restRow(t, restId)).coin);
const ev = (id: number) =>
  t.db.selectFrom('predict_event').selectAll().where('id', '=', String(id)).executeTakeFirstOrThrow();

describe('买卖（238-1 设计 §6.1）', () => {
  it('买"是"：按报价扣银币（含手续费），份额、持仓、成交记录、个人日志都更新', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const q = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 10, T);
    const res = await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 10 });
    expect(res.data).toEqual({
      side: 'yes',
      dir: 'buy',
      qty: 10,
      amount: q.amount,
      fee: q.fee,
      total: q.total,
      price: q.priceAfter,
      yes: 10,
      no: 0,
    });
    expect(await coin(r.restaurantId)).toBe(1_000_000 - q.total);
    expect(await ev(id)).toMatchObject({ q_yes: 10, q_no: 0 });
    const pos = await t.db
      .selectFrom('predict_position')
      .selectAll()
      .where('event_id', '=', String(id))
      .executeTakeFirstOrThrow();
    expect(pos).toMatchObject({ rest_id: r.restaurantId, yes: 10, no: 0, settled: false });
    expect(Number(pos.net_cost)).toBe(q.total);
    const logs = await t.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'predict.trade')
      .execute();
    expect(logs).toHaveLength(1);
  });

  it('卖出：得到成交额减手续费，净投入相应减少', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const buy = (await svc().trade(r, id, { side: 'no', dir: 'buy', qty: 20 })).data;
    const q = predictQuote({ y: 0, n: 20, b: 100 }, 'no', 'sell', 5, T);
    const sell = (await svc().trade(r, id, { side: 'no', dir: 'sell', qty: 5 })).data;
    expect(sell).toMatchObject({ total: q.total, yes: 0, no: 15 });
    expect(await coin(r.restaurantId)).toBe(1_000_000 - buy.total + q.total);
    const pos = await t.db
      .selectFrom('predict_position')
      .select('net_cost')
      .where('event_id', '=', String(id))
      .executeTakeFirstOrThrow();
    expect(Number(pos.net_cost)).toBe(buy.total - q.total);
  });

  it('单笔上限、持有上限、卖出超过持有都拒绝，银币不变', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 50_000_000 });
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 101 })).rejects.toMatchObject({
      params: { what: 'predict_trade', max: 100 },
    });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 100 });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 100 });
    const before = await coin(r.restaurantId);
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { what: 'predict_hold', max: 200 },
    });
    await expect(svc().trade(r, id, { side: 'no', dir: 'sell', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_not_enough' },
    });
    expect(await coin(r.restaurantId)).toBe(before);
  });

  it('截止时间已过、任务还没跑也不能买；已判定的不能买（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { closeInMs: 60_000 });
    const r = await trader(t, { shardId });
    t.clock.advance(60_000);
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_closed' },
    });
    const done = await newEvent(t, shardId, { status: 'resolved' });
    await expect(svc().trade(r, done, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_closed' },
    });
  });

  it('别的区服的事件 404；门槛不够报 predict_level；区服关掉报 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const id = await newEvent(t, other);
    const r = await trader(t, { shardId });
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      status: 404,
    });
    const mine = await newEvent(t, shardId);
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', r.restaurantId).execute();
    await expect(svc().trade(r, mine, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_level', need: 20 },
    });
    await t.db.updateTable('restaurant').set({ level: 30 }).where('id', '=', r.restaurantId).execute();
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { predict: false } }) })
      .execute();
    t.game.deps.shards.invalidate(shardId);
    await expect(svc().trade(r, mine, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('带上预估金额：买入实际要付的超过它、卖出实际得到的低于它就拒绝（终审 I2：价格被别人推动）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 10_000_000 });
    const other = await trader(t, { shardId, coin: 10_000_000 });
    const seen = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 10, T).total;
    await svc().trade(other, id, { side: 'yes', dir: 'buy', qty: 50 });
    const before = await coin(r.restaurantId);
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 10, limit: seen })).rejects.toMatchObject(
      {
        params: { reason: 'predict_price_moved' },
      },
    );
    expect(await coin(r.restaurantId)).toBe(before);
    const now = predictQuote({ y: 50, n: 0, b: 100 }, 'yes', 'buy', 10, T).total;
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 10, limit: now });
    const sellSeen = predictQuote({ y: 60, n: 0, b: 100 }, 'yes', 'sell', 10, T).total;
    await svc().trade(other, id, { side: 'yes', dir: 'sell', qty: 50 });
    await expect(
      svc().trade(r, id, { side: 'yes', dir: 'sell', qty: 10, limit: sellSeen }),
    ).rejects.toMatchObject({
      params: { reason: 'predict_price_moved' },
    });
  });

  it('事件按自己的 unit 报价，不看区服数值（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { predict: { unit: 5000 } });
    const id = await newEvent(t, shardId, { unit: 1000 });
    const r = await trader(t, { shardId });
    const res = await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 });
    expect(res.data.amount).toBe(predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 1, T).amount);
  });

  it('并发：两人同时各买 50 份"是"，份额合计 100，成交额合计和依次买一致（误差不超过取整）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 10_000_000 });
    const b = await trader(t, { shardId, coin: 10_000_000 });
    const [x, y] = await Promise.all([
      svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 50 }),
      svc().trade(b, id, { side: 'yes', dir: 'buy', qty: 50 }),
    ]);
    expect((await ev(id)).q_yes).toBe(100);
    const all = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 100, T).amount;
    const sum = x.data.amount + y.data.amount;
    expect(sum).toBeGreaterThanOrEqual(all);
    expect(sum).toBeLessThanOrEqual(all + 1);
  });
});

describe('列表和详情（238-1 设计 §7.1）', () => {
  it('列表：进行中的事件 + 我有持仓的已结束事件；带门槛、价格、持仓、结算所得', async () => {
    const shardId = await createShard(t.db);
    const open = await newEvent(t, shardId, { p0: 0.8, title: '进行中' });
    const done = await newEvent(t, shardId, { title: '已判定' });
    const other = await newEvent(t, shardId, { status: 'resolved', title: '别人的' });
    const r = await trader(t, { shardId });
    await svc().trade(r, done, { side: 'yes', dir: 'buy', qty: 3 });
    await t.db
      .updateTable('predict_event')
      .set({ status: 'resolved', outcome: true, resolved_at: t.clock.now })
      .where('id', '=', String(done))
      .execute();
    const l = await svc().list(r);
    expect(l).toMatchObject({
      eligible: true,
      reason: null,
      feeRate: 0.02,
      maxHold: 200,
      maxTrade: 100,
      unit: 1000,
    });
    const ids = l.events.map((e) => e.id);
    expect(ids).toContain(open);
    expect(ids).toContain(done);
    expect(ids).not.toContain(other);
    expect(l.events.find((e) => e.id === open)!.price).toBeCloseTo(0.8, 9);
    expect(l.events.find((e) => e.id === done)).toMatchObject({
      status: 'resolved',
      outcome: true,
      yes: 3,
      payout: 3000,
    });
  });

  it('详情：说明、份额、我的持仓、最近成交、价格走势从初始价格开始', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId, { p0: 0.3 });
    const r = await trader(t, { shardId });
    const t1 = (await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 5 })).data;
    const t2 = (await svc().trade(r, id, { side: 'no', dir: 'buy', qty: 2 })).data;
    const d = await svc().detail(r, id);
    expect(d.event).toMatchObject({ id, yes: 5, no: 2, unit: 1000, b: 100, status: 'open' });
    expect(d.points).toHaveLength(3);
    expect(d.points[0]).toBeCloseTo(0.3, 9);
    expect(d.trades.map((x) => x.side)).toEqual(['no', 'yes']);
    // 每笔带成交后"是"的价格，页面用来说明这笔把价格推到了多少（问题记录 264）
    expect(d.trades.map((x) => x.priceAfter)).toEqual([t2.price, t1.price]);
  });

  it('详情里有我这一局的成交和收支：买入共花、卖出共得、手续费合计（问题记录 254）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const other = await trader(t, { shardId, coin: 1_000_000 });
    const b1 = (await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 5 })).data;
    await svc().trade(other, id, { side: 'no', dir: 'buy', qty: 3 });
    const s1 = (await svc().trade(r, id, { side: 'yes', dir: 'sell', qty: 2 })).data;
    const d = await svc().detail(r, id);
    expect(d.mine).toEqual({
      bought: b1.total,
      sold: s1.total,
      fees: b1.fee + s1.fee,
      voidRatio: null,
      trades: [
        {
          side: 'yes',
          dir: 'sell',
          qty: 2,
          amount: s1.amount,
          fee: s1.fee,
          priceAfter: s1.price,
          createdAt: expect.any(String),
        },
        {
          side: 'yes',
          dir: 'buy',
          qty: 5,
          amount: b1.amount,
          fee: b1.fee,
          priceAfter: b1.price,
          createdAt: expect.any(String),
        },
      ],
    });
    expect(d.event.netCost).toBe(b1.total - s1.total);
  });
});

describe('backlog 238-1：交易所被冻结的店不能用事件预测', () => {
  it('冻结中买卖报 predict_frozen，列表写明不能参与；解冻后照常', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 2 });
    await t.db.insertInto('exchange_freeze').values({ rest_id: r.restaurantId, reason: '对倒' }).execute();
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_frozen' },
    });
    // 卖出也不行：两个号配合靠买卖转钱，冻结要把两头都堵上
    await expect(svc().trade(r, id, { side: 'yes', dir: 'sell', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_frozen' },
    });
    expect(await svc().list(r)).toMatchObject({ eligible: false, reason: 'predict_frozen' });
    await t.db.deleteFrom('exchange_freeze').where('rest_id', '=', r.restaurantId).execute();
    await svc().trade(r, id, { side: 'yes', dir: 'sell', qty: 1 });
  });
});

describe('backlog 238-1：关掉事件预测开关时只禁买卖', () => {
  it('列表和详情照常能看（带 enabled = false），买卖报 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 2 });
    const override = JSON.stringify({ features: { predict: false } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override })
      .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override }))
      .execute();
    t.game.shards.invalidate(shardId);
    const list = await svc().list(r);
    expect(list.enabled).toBe(false);
    expect(list.events.find((e) => e.id === id)).toMatchObject({ yes: 2 });
    expect((await svc().detail(r, id)).event.id).toBe(id);
    await expect(svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});

describe('任务计数（问题记录 318）', () => {
  it('买入、卖出各计一次 predict.trade；活跃"事件预测交易"计入', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await svc().trade(r, id, { side: 'yes', dir: 'buy', qty: 5 });
    await svc().trade(r, id, { side: 'yes', dir: 'sell', qty: 2 });
    expect(await eventCount(t, r.restaurantId, 'predict.trade')).toBe(2);
    expect(
      (await t.game.task.activation(r)).items.find((i) => i.name === '事件预测交易')!.count,
    ).toBeGreaterThan(0);
  });
});

describe('出题人不能交易自己出的题（backlog 238-1）', () => {
  it('后台出题的账号在这道题上买卖都报 predict_own；列表和详情标出是自己出的；别的管理员、玩家照常', async () => {
    const shardId = await createShard(t.db);
    const author = await trader(t, { shardId, coin: 1_000_000 });
    const other = await trader(t, { shardId, coin: 1_000_000 });
    const id = await newEvent(t, shardId);
    await t.db
      .updateTable('predict_event')
      .set({ created_by: author.accountId })
      .where('id', '=', String(id))
      .execute();
    await expect(svc().trade(author, id, { side: 'yes', dir: 'buy', qty: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'predict_own' },
    });
    await expect(svc().trade(author, id, { side: 'yes', dir: 'sell', qty: 1 })).rejects.toMatchObject({
      params: { reason: 'predict_own' },
    });
    expect((await svc().list(author)).events.find((e) => e.id === id)!.own).toBe(true);
    expect((await svc().detail(author, id)).event.own).toBe(true);
    expect((await svc().detail(other, id)).event.own).toBe(false);
    await svc().trade(other, id, { side: 'yes', dir: 'buy', qty: 1 });
  });
});
