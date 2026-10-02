import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rng } from '@dt/shared';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

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
