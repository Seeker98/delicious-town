import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameDay, gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import type { RestCtx } from '../../core/deps';
import { foodPrice } from '../../core/prices';
import { FUTURES_INITIAL } from '../../db/migrations/0063_futures';
import { refPrice } from '../exchange/ref';
import { trader } from '../exchange/test';
import { getDaily } from '../counter/dailyCounter';
import { futuresDeposit, futuresUnitPrice } from './rules';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-10', 12)));

const svc = () => t.game.futures;
/** 初始列表里的一种 3 级稀有食材、一种 2 级普通食材 */
const RARE3 = FUTURES_INITIAL.find(
  (id) => config.foods.get(id)!.level === 3 && config.foods.get(id)!.odds < 100,
)!;
const NORMAL2 = FUTURES_INITIAL.find(
  (id) => config.foods.get(id)!.level === 2 && config.foods.get(id)!.odds === 100,
)!;
const HOUR = 3_600_000;

/** 服务端会算出的单价（参考价 + 等级价，期货设计 §3） */
async function priceOf(shardId: number, foodsId: number): Promise<number> {
  const s = await t.game.shards.settings(shardId);
  const ref = await refPrice(
    t.db,
    config,
    s.tuning.exchange,
    s.tuning.market.levelPriceRate,
    shardId,
    foodsId,
    gameDay(t.clock.now),
  );
  return futuresUnitPrice(foodPrice(config.foods.get(foodsId)!, s.tuning.market), ref, s.tuning.futures);
}
const order = async (r: RestCtx, foodsId: number, qty: number, shardId: number) =>
  svc().order(r, { foodsId, qty, unitPrice: await priceOf(shardId, foodsId) });
const quotaUsed = async (shardId: number, foodsId: number) =>
  (
    await t.db
      .selectFrom('futures_quota')
      .select('used')
      .where('shard_id', '=', shardId)
      .where('foods_id', '=', foodsId)
      .where('day', '=', gameDay(t.clock.now))
      .executeTakeFirst()
  )?.used ?? 0;
const contracts = (restId: number) =>
  t.db.selectFrom('futures_contract').selectAll().where('rest_id', '=', restId).orderBy('id').execute();

describe('期货下单（期货设计 §2、§4）', () => {
  it('付定金、占额度、生成期货单；到期时间 = 下单 + 72 小时；写个人日志', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const unit = await priceOf(shardId, RARE3);
    const res = (await svc().order(r, { foodsId: RARE3, qty: 3, unitPrice: unit })).data;
    const total = unit * 3;
    const deposit = futuresDeposit(total, config.tuning.futures);
    expect(res).toMatchObject({
      foodsId: RARE3,
      qty: 3,
      unitPrice: unit,
      deposit,
      balance: total - deposit,
      status: 'open',
      settledAt: null,
    });
    expect(new Date(res.dueAt).getTime() - new Date(res.createdAt).getTime()).toBe(72 * HOUR);
    expect((await restRow(t, r.restaurantId)).coin).toBe(1_000_000 - deposit);
    expect(await quotaUsed(shardId, RARE3)).toBe(3);
    expect(await getDaily(t.db, r.restaurantId, 'futures.qty', gameDay(t.clock.now))).toBe(3);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'futures.order')
      .execute();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.params).toMatchObject({ foodsId: RARE3, qty: 3, unitPrice: unit, deposit });
  });

  it('单价按锚点 B：不低于等级价 × 1.2', async () => {
    const shardId = await createShard(t.db);
    const level = foodPrice(config.foods.get(RARE3)!, config.tuning.market);
    expect(await priceOf(shardId, RARE3)).toBeGreaterThanOrEqual(Math.ceil(level * 1.2));
    expect(await priceOf(shardId, RARE3)).toBeLessThanOrEqual(Math.ceil(level * 2 * 1.2));
  });

  it('页面的单价和服务端算的不同：报 futures_price_moved 带新价，不扣钱（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const unit = await priceOf(shardId, RARE3);
    await expect(svc().order(r, { foodsId: RARE3, qty: 1, unitPrice: unit - 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'futures_price_moved', price: unit },
    });
    expect((await restRow(t, r.restaurantId)).coin).toBe(1_000_000);
    expect(await contracts(r.restaurantId)).toHaveLength(0);
  });

  it('不在列表、下架、6 级以上的食材：futures_not_listed', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId });
    // 取最后一种：后台测试拿第一种临时加进表（futures_food 全服一份，测试文件并行跑，终审 I1）
    const notListed = [...config.foods.values()]
      .filter((f) => f.level === 1 && f.odds === 100 && !FUTURES_INITIAL.includes(f.id))
      .at(-1)!;
    const lv6 = [...config.foods.values()].find((f) => f.level === 6)!;
    for (const id of [notListed.id, lv6.id])
      await expect(svc().order(r, { foodsId: id, qty: 1, unitPrice: 1 })).rejects.toMatchObject({
        params: { reason: 'futures_not_listed' },
      });
    await t.db.updateTable('futures_food').set({ enabled: false }).where('foods_id', '=', NORMAL2).execute();
    try {
      await expect(svc().order(r, { foodsId: NORMAL2, qty: 1, unitPrice: 1 })).rejects.toMatchObject({
        params: { reason: 'futures_not_listed' },
      });
    } finally {
      await t.db.updateTable('futures_food').set({ enabled: true }).where('foods_id', '=', NORMAL2).execute();
    }
  });

  it('门槛：等级不够报 requirement；交易所冻结报 exchange_frozen', async () => {
    const shardId = await createShard(t.db);
    const low = await trader(t, { shardId });
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', low.restaurantId).execute();
    await expect(order(low, RARE3, 1, shardId)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'exchange_level' },
    });
    const frozen = await trader(t, { shardId });
    await t.db
      .insertInto('exchange_freeze')
      .values({ rest_id: frozen.restaurantId, reason: 'test' })
      .execute();
    await expect(order(frozen, RARE3, 1, shardId)).rejects.toMatchObject({
      params: { reason: 'exchange_frozen' },
    });
  });

  it('功能开关：futures 或 exchange 关了都报 FEATURE_DISABLED', async () => {
    for (const feature of ['futures', 'exchange']) {
      const shardId = await createShard(t.db);
      await t.db
        .insertInto('shard_config')
        .values({ shard_id: shardId, override: JSON.stringify({ features: { [feature]: false } }) })
        .execute();
      t.game.shards.invalidate(shardId);
      const r = await trader(t, { shardId });
      await expect(svc().order(r, { foodsId: RARE3, qty: 1, unitPrice: 1 })).rejects.toMatchObject({
        code: 'FEATURE_DISABLED',
      });
    }
  });

  it('个人额度：今天合计超过 personDaily 报 futures_person，带剩余', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { futures: { personDaily: 5 } });
    const r = await trader(t, { shardId, coin: 10_000_000 });
    await order(r, NORMAL2, 3, shardId);
    await expect(order(r, RARE3, 3, shardId)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'futures_person', max: 5, left: 2 },
    });
    await order(r, RARE3, 2, shardId);
  });

  it('区服额度：超了报 futures_quota 带剩余，整单回滚、定金没扣；后台改成 0 时剩 0（Review Focus 5）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { futures: { dailyQuota: [500, 500, 4, 100, 100] } });
    const a = await trader(t, { shardId, coin: 10_000_000 });
    const b = await trader(t, { shardId, coin: 10_000_000 });
    await order(a, RARE3, 3, shardId);
    await expect(order(b, RARE3, 2, shardId)).rejects.toMatchObject({
      params: { what: 'futures_quota', max: 4, left: 1 },
    });
    expect((await restRow(t, b.restaurantId)).coin).toBe(10_000_000);
    expect(await getDaily(t.db, b.restaurantId, 'futures.qty', gameDay(t.clock.now))).toBe(0);
    await t.db.updateTable('futures_food').set({ daily_quota: 0 }).where('foods_id', '=', RARE3).execute();
    try {
      await expect(order(b, RARE3, 1, shardId)).rejects.toMatchObject({
        params: { what: 'futures_quota', max: 0, left: 0 },
      });
    } finally {
      await t.db
        .updateTable('futures_food')
        .set({ daily_quota: null })
        .where('foods_id', '=', RARE3)
        .execute();
    }
  });

  it('两家同时订只剩 1 份的额度：只有一家成功（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { futures: { dailyQuota: [500, 500, 1, 100, 100] } });
    const a = await trader(t, { shardId, coin: 10_000_000 });
    const b = await trader(t, { shardId, coin: 10_000_000 });
    const unit = await priceOf(shardId, RARE3);
    const res = await Promise.allSettled([
      svc().order(a, { foodsId: RARE3, qty: 1, unitPrice: unit }),
      svc().order(b, { foodsId: RARE3, qty: 1, unitPrice: unit }),
    ]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await quotaUsed(shardId, RARE3)).toBe(1);
  });

  it('银币不够付定金：NOT_ENOUGH，额度不占', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 10 });
    await expect(order(r, RARE3, 1, shardId)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await quotaUsed(shardId, RARE3)).toBe(0);
  });
});

describe('撤单（期货设计 §6）', () => {
  it('撤了状态 cancelled，定金和额度都不退；写个人日志', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const c = (await order(r, RARE3, 2, shardId)).data;
    const coin = (await restRow(t, r.restaurantId)).coin;
    const res = (await svc().cancel(r, c.id)).data;
    expect(res).toMatchObject({ id: c.id, status: 'cancelled' });
    expect(res.settledAt).not.toBeNull();
    expect((await restRow(t, r.restaurantId)).coin).toBe(coin);
    expect(await quotaUsed(shardId, RARE3)).toBe(2);
    expect(await getDaily(t.db, r.restaurantId, 'futures.qty', gameDay(t.clock.now))).toBe(2);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'futures.cancel')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ foodsId: RARE3, qty: 2, deposit: c.deposit });
  });

  it('别人的单、已撤的单、到期的单：futures_not_open', async () => {
    const shardId = await createShard(t.db);
    const a = await trader(t, { shardId, coin: 1_000_000 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const c = (await order(a, RARE3, 1, shardId)).data;
    await expect(svc().cancel(b, c.id)).rejects.toMatchObject({ params: { reason: 'futures_not_open' } });
    const d = (await order(a, RARE3, 1, shardId)).data;
    await svc().cancel(a, d.id);
    await expect(svc().cancel(a, d.id)).rejects.toMatchObject({ params: { reason: 'futures_not_open' } });
    t.clock.advance(72 * HOUR);
    await expect(svc().cancel(a, c.id)).rejects.toMatchObject({ params: { reason: 'futures_not_open' } });
  });
});

describe('我的期货（GET /futures）', () => {
  it('列出上架的食材（单价、剩余额度）、个人剩余、我的单', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await order(r, RARE3, 2, shardId);
    const v = await svc().view(r);
    expect(v).toMatchObject({
      enabled: true,
      blocked: null,
      personDaily: 50,
      personLeft: 48,
      deliverHours: 72,
      depositRate: 0.3,
    });
    // 只看局部：futures_food 全服一份，别的测试文件会临时上下架（终审 I1）
    expect(v.foods.length).toBeGreaterThan(100);
    expect(v.foods.every((f) => f.level >= 1 && f.level <= 5)).toBe(true);
    expect(v.foods.find((f) => f.foodsId === RARE3)).toMatchObject({
      level: 3,
      rare: true,
      unitPrice: await priceOf(shardId, RARE3),
      left: 98,
    });
    expect(v.contracts).toHaveLength(1);
  });

  it('结束的单只列最近 30 张，进行中的全部列出；新的在前', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    const rows = Array.from({ length: 32 }, (_, i) => ({
      shard_id: shardId,
      rest_id: r.restaurantId,
      foods_id: RARE3,
      qty: 1,
      unit_price: 1,
      deposit: 1,
      balance: 0,
      created_at: new Date(t.clock.now.getTime() - (40 - i) * HOUR),
      due_at: new Date(t.clock.now.getTime() + 72 * HOUR),
      status: i < 2 ? ('open' as const) : ('delivered' as const),
    }));
    await t.db.insertInto('futures_contract').values(rows).execute();
    const v = await svc().view(r);
    expect(v.contracts).toHaveLength(32);
    expect(v.contracts.filter((c) => c.status === 'open')).toHaveLength(2);
    const times = v.contracts.map((c) => c.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('功能关着时 enabled false、没有食材，仍然列出我的单；门槛不够写原因', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await order(r, RARE3, 1, shardId);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { futures: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const v = await svc().view(r);
    expect(v.enabled).toBe(false);
    expect(v.foods).toEqual([]);
    expect(v.contracts).toHaveLength(1);
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', r.restaurantId).execute();
    expect((await svc().view(r)).blocked).toBe('exchange_level');
  });
});
