import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rng } from '@dt/shared';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';

/** 可控随机数：rolls 里有值就按顺序取，取完一律 0.99（不命中） */
const rolls: number[] = [];
const rng: Rng = {
  next: () => rolls.shift() ?? 0.99,
  int: () => 0,
  intMin1: () => 1,
  chance: (p) => (rolls.shift() ?? 0.99) < p,
};
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => rng });
});
afterAll(() => t.close());

const H = 3_600_000;
const award = { coin: 10 };
const spec = (patch: Record<string, unknown> = {}) => ({
  kind: 'exchange' as const,
  def: {
    currencies: [{ name: '福' }, { name: '禄' }],
    drops: [
      { key: 'market.buy', chance: 0.5, currency: 0, num: 2, dailyCap: 5 },
      { key: 'market.buy', chance: 0.5, currency: 0, num: 1, dailyCap: 1 },
      { key: 'shop.buy', chance: 0.5, currency: 1, num: 1, dailyCap: 9 },
    ],
    shop: [{ cost: [{ currency: 0, num: 2 }], award, limit: 3 }],
    graceHours: 24,
    ...patch,
  },
});
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));

describe('兑换活动掉落（148-2 设计 §4）', () => {
  it('每条规则各掷一次：命中掉 num 个，不命中不掉；别的行为不掉', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    rolls.push(0.1, 0.9); // 规则 0 命中（+2），规则 1 不命中
    await act(r, 'market.buy');
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 2 });
    await act(r, 'oil.fill');
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 2 });
  });

  it('n 次事件掷 n 次；每条规则的每天上限分开计，跨游戏日重置', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, {
      shardId,
      spec: spec(),
      endsAt: new Date(t.clock.now.getTime() + 72 * H),
    });
    rolls.push(0.1, 0.1, 0.1, 0.1, 0.1, 0.1); // 规则 0：3 次全中（+6，上限 5）；规则 1：3 次全中（+3，上限 1）
    await act(r, 'market.buy', 3);
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 6 });
    t.clock.advance(24 * H);
    rolls.push(0.1, 0.9);
    await act(r, 'market.buy');
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 8 });
    t.clock.advance(-24 * H);
  });

  it('结束后（兑换期内）不再掉落', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: spec(), endsAt: end });
    const back = t.clock.now;
    t.clock.set(new Date(end.getTime() + 1000));
    rolls.push(0.1, 0.1);
    await act(r, 'market.buy');
    t.clock.set(back);
    rolls.length = 0;
    expect(await counters(t, id, r.restaurantId)).toEqual({});
  });
});

describe('兑换（148-2 设计 §5）', () => {
  const svc = () => t.game.activity;
  const fund = async (id: number, restId: number, m0: number, m1 = 0) => {
    await t.db
      .insertInto('activity_counter')
      .values([
        { activity_id: id, rest_id: restId, key: 'm0', count: m0 },
        { activity_id: id, rest_id: restId, key: 'm1', count: m1 },
      ])
      .execute();
  };

  it('扣余额、记次数、奖励按次数发；列表带 exchangeUntil', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await fund(id, r.restaurantId, 10);
    const res = await svc().exchange(r, id, 0, 3);
    expect(res.data.items).toEqual({ coin: 30 });
    expect(await counters(t, id, r.restaurantId)).toMatchObject({ m0: 4, x0: 3 });
    const row = await t.db
      .selectFrom('restaurant')
      .select('coin')
      .where('id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row.coin).toBe(30);
    const a = (await svc().list(r)).items.find((x) => x.id === id)!;
    expect(a.exchangeUntil).not.toBeNull();
    expect(a.today).toEqual({ d0: 0, d1: 0, d2: 0 });
  });

  it('次数超限报 limitReached、余额不够报 NOT_ENOUGH，都不扣', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await fund(id, r.restaurantId, 10);
    await svc().exchange(r, id, 0, 2);
    await expect(svc().exchange(r, id, 0, 2)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await counters(t, id, r.restaurantId)).toMatchObject({ m0: 6, x0: 2 });
    const poor = await newRestaurant(t, { shardId });
    await fund(id, poor.restaurantId, 1);
    await expect(svc().exchange(poor, id, 0, 1)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await counters(t, id, poor.restaurantId)).toMatchObject({ m0: 1 });
  });

  it('兑换期内能换，兑换期结束时刻起不能换；项目不存在、不是兑换活动都报错', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: spec({ graceHours: 2 }), endsAt: end });
    await fund(id, r.restaurantId, 10);
    const back = t.clock.now;
    t.clock.set(new Date(end.getTime() + H));
    await svc().exchange(r, id, 0, 1);
    t.clock.set(new Date(end.getTime() + 2 * H));
    await expect(svc().exchange(r, id, 0, 1)).rejects.toMatchObject({
      params: { reason: 'exchange_closed' },
    });
    t.clock.set(back);
    await expect(svc().exchange(r, id, 5, 1)).rejects.toMatchObject({ params: { reason: 'no_item' } });
    const goals = await insertActivity(t, {
      shardId,
      spec: { kind: 'goals', def: { goals: [{ key: 'signin', target: 1, award }] } },
    });
    await expect(svc().exchange(r, goals, 0, 1)).rejects.toMatchObject({
      params: { reason: 'not_exchange' },
    });
  });

  it('同时发两个兑换请求，只成功到余额允许的次数', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await fund(id, r.restaurantId, 2);
    const rs = await Promise.allSettled([svc().exchange(r, id, 0, 1), svc().exchange(r, id, 0, 1)]);
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await counters(t, id, r.restaurantId)).toMatchObject({ m0: 0, x0: 1 });
  });

  it('兑换写个人日志 activity.exchange', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec(), title: '国庆集福' });
    await fund(id, r.restaurantId, 2);
    await svc().exchange(r, id, 0, 1);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'activity.exchange')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ title: '国庆集福', times: 1 });
  });
});

describe('问题记录 224：掉落时有提示', () => {
  it('掉了活动货币时，这次操作的得失提示里有货币名和个数；没掉就没有', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    await insertActivity(t, { shardId, spec: spec() });
    const events = (key: string) =>
      runSystemOp(t.game.deps, shardId, r.restaurantId, { source: 'test' }, async (o) => {
        await emitAction(o, key, 1);
        return o.events;
      });
    rolls.push(0.1, 0.9);
    expect(await events('market.buy')).toContainEqual({
      type: 'gain',
      kind: 'activityCurrency',
      name: '福',
      num: 2,
    });
    rolls.push(0.9, 0.9);
    expect((await events('market.buy')).filter((e) => e.kind === 'activityCurrency')).toEqual([]);
  });
});

describe('backlog 148-2：仓库满了也能兑换纪念品（走兑换流程）', () => {
  it('仓库格子已满时兑换纪念品照常到账', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { store_num: 1 }, goods: { 85: 1 } });
    const id = await insertActivity(t, {
      shardId,
      spec: spec({
        shop: [{ cost: [{ currency: 0, num: 1 }], award: { goods: [{ id: 90009, num: 1 }] }, limit: 1 }],
      }),
    });
    await t.db
      .insertInto('activity_counter')
      .values({ activity_id: id, rest_id: r.restaurantId, key: 'm0', count: 1 })
      .execute();
    await t.game.activity.exchange(r, id, 0, 1);
    expect(await goodsNum(t, r.restaurantId, 90009)).toBe(1);
  });
});

describe('任务计数（问题记录 318）', () => {
  it('兑换一次也算"领取限时活动奖励"：计 activity.claim，活跃计入（兑换型活动只能靠兑换拿奖励）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await t.db
      .insertInto('activity_counter')
      .values({ activity_id: id, rest_id: r.restaurantId, key: 'm0', count: 10 })
      .execute();
    await t.game.activity.exchange(r, id, 0, 2);
    expect(await eventCount(t, r.restaurantId, 'activity.claim')).toBe(1);
    const act = await t.game.task.activation(r);
    expect(act.items.find((i) => i.name === '领取限时活动奖励')!.count).toBe(1);
  });
});
