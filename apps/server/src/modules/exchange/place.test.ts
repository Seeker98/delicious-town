import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { queryCounter } from '../../../test/queries';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const svc = () => t.game.exchange;
/** 橱柜 + 冰箱里这种食材的总数（foodNum 分开返回两者） */
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};
/** 系统定价为 coin 的稀有食材：参考价就是 coin，允许 0.5~2 倍 */
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;

describe('交易所下单（156-1 设计 §6.1）', () => {
  it('门槛：等级、注册天数、邮箱分别报错', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId });
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', r.restaurantId).execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'exchange_level' },
      },
    );
    await t.db.updateTable('restaurant').set({ level: 30 }).where('id', '=', r.restaurantId).execute();
    await t.db.updateTable('account').set({ created_at: new Date() }).where('id', '=', r.accountId).execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'exchange_age' },
      },
    );
    await t.db
      .updateTable('account')
      .set({ created_at: new Date('2020-01-01'), email_verified_at: null })
      .where('id', '=', r.accountId)
      .execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'exchange_email' },
      },
    );
  });

  it('非稀有食材、价格越界、挂单数满都拒绝，什么都不扣', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const common = [...t.deps.config.foods.values()].find((x) => x.odds >= 100)!;
    const r = await trader(t, { shardId, coin: 1_000_000 });
    await expect(
      svc().place(r, { foodsId: common.id, side: 'buy', price: 10, qty: 1 }),
    ).rejects.toMatchObject({
      params: { reason: 'not_tradable' },
    });
    await expect(
      svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin * 2 + 1, qty: 1 }),
    ).rejects.toMatchObject({ params: { reason: 'price_band', max: f.coin * 2 } });
    expect((await restRow(t, r.restaurantId)).coin).toBe(1_000_000);
    for (let i = 0; i < t.deps.config.tuning.exchange.maxOpenOrders; i++)
      await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { what: 'exchange_orders' },
      },
    );
  });

  it('挂卖单扣食材、挂买单扣银币；买单超过橱柜单种上限不让挂', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 3 });
    expect(await have(s.restaurantId, f.id)).toBe(2);
    // 单种上限 10：橱柜 10 + 冰箱 10 = 20；未成交的买单也算进去
    const b = await trader(t, { shardId, coin: 10_000_000 });
    await t.db
      .updateTable('restaurant')
      .set({ foods_max_num: 10 })
      .where('id', '=', b.restaurantId)
      .execute();
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 15 });
    await expect(svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 6 })).rejects.toMatchObject(
      {
        params: { reason: 'cupboard_full' },
      },
    );
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 5 });
  });
});

describe('挂买单的橱柜检查算上别的食材的未成交买单（backlog 156-1）', () => {
  it('别的食材的未成交买单各占一个新格子：最后一格已被占，这单只能进冰箱，超出冰箱上限就不让挂', async () => {
    const shardId = await createShard(t.db);
    const [fa, fb] = [...t.deps.config.foods.values()].filter((x) => x.odds < 100 && x.coin >= 1000);
    const b = await trader(t, { shardId, coin: 100_000_000 });
    const used = await t.db
      .selectFrom('cupboard_food')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('rest_id', '=', b.restaurantId)
      .where('num', '>', 0)
      .executeTakeFirstOrThrow();
    await t.db
      .updateTable('restaurant')
      .set({ foods_max_num: 10, cupboard_num: Number(used.n) + 1 })
      .where('id', '=', b.restaurantId)
      .execute();
    await svc().place(b, { foodsId: fa!.id, side: 'buy', price: fa!.coin, qty: 10 });
    await expect(
      svc().place(b, { foodsId: fb!.id, side: 'buy', price: fb!.coin, qty: 11 }),
    ).rejects.toMatchObject({ params: { reason: 'cupboard_full' } });
    await svc().place(b, { foodsId: fb!.id, side: 'buy', price: fb!.coin, qty: 10 });
  });
});

describe('撮合（156-1 设计 §6.2）', () => {
  it('价格优先、时间优先、部分成交；成交价取挂单方价格；买方退差价；卖方扣 5% 进账户', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s1 = await trader(t, { shardId, foods: { [f.id]: 10 } });
    const s2 = await trader(t, { shardId, foods: { [f.id]: 10 } });
    const s3 = await trader(t, { shardId, foods: { [f.id]: 10 } });
    await svc().place(s1, { foodsId: f.id, side: 'sell', price: p + 10, qty: 2 });
    await svc().place(s2, { foodsId: f.id, side: 'sell', price: p, qty: 2 });
    await svc().place(s3, { foodsId: f.id, side: 'sell', price: p + 10, qty: 2 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const res = await svc().place(b, { foodsId: f.id, side: 'buy', price: p + 20, qty: 3 });
    expect(res.data.fills).toEqual([
      { price: p, qty: 2, held: false },
      { price: p + 10, qty: 1, held: false },
    ]);
    expect(res.data.order.status).toBe('filled');
    // 冻结 (p+20)×3，实际花 p×2 + (p+10)×1，差价退回
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000 - (p * 2 + (p + 10)));
    expect(await have(b.restaurantId, f.id)).toBe(3);
    const fee2 = Math.floor(p * 2 * 0.05);
    expect(await wallet(t, s2.restaurantId)).toEqual({ coin: p * 2 - fee2, foods: {} });
    const fee1 = Math.floor((p + 10) * 0.05);
    expect(await wallet(t, s1.restaurantId)).toEqual({ coin: p + 10 - fee1, foods: {} });
    expect(await wallet(t, s3.restaurantId)).toEqual({ coin: 0, foods: {} });
  });

  it('卖单吃买单：卖方当场到账（扣手续费），买方挂单的食材进账户、不退差价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: p + 50, qty: 2 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: p, qty: 3 });
    expect(res.data.fills).toEqual([{ price: p + 50, qty: 2, held: false }]);
    expect(res.data.order).toMatchObject({ status: 'open', filled: 2 });
    expect((await restRow(t, s.restaurantId)).coin).toBe((p + 50) * 2 - Math.floor((p + 50) * 2 * 0.05));
    expect(await wallet(t, b.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 2 } });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000 - (p + 50) * 2);
  });

  it('不和自己的单成交；不吃过期的单；不吃别的区服的单', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const me = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await svc().place(me, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    const old = await trader(t, { shardId, foods: { [f.id]: 5 } });
    const o = await svc().place(old, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    await t.db
      .updateTable('exchange_order')
      .set({ expires_at: new Date(t.clock.now.getTime() - 1000) })
      .where('id', '=', String(o.data.order.id))
      .execute();
    const far = await trader(t, { shardId: other, foods: { [f.id]: 5 } });
    await svc().place(far, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    const res = await svc().place(me, { foodsId: f.id, side: 'buy', price: p, qty: 1 });
    expect(res.data.fills).toEqual([]);
    expect(res.data.order.status).toBe('open');
  });

  it('并发：两个买单同时吃同一张卖单，总成交不超过卖单数量，银币和食材守恒', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 3 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p, qty: 3 });
    const b1 = await trader(t, { shardId, coin: 1_000_000 });
    const b2 = await trader(t, { shardId, coin: 1_000_000 });
    const rs = await Promise.all([
      svc().place(b1, { foodsId: f.id, side: 'buy', price: p, qty: 2 }),
      svc().place(b2, { foodsId: f.id, side: 'buy', price: p, qty: 2 }),
    ]);
    const filled = rs.reduce((n, r) => n + r.data.fills.reduce((m, x) => m + x.qty, 0), 0);
    expect(filled).toBe(3);
    const got = (await have(b1.restaurantId, f.id)) + (await have(b2.restaurantId, f.id));
    expect(got).toBe(3);
    const spent =
      2_000_000 - (await restRow(t, b1.restaurantId)).coin - (await restRow(t, b2.restaurantId)).coin;
    // 已成交 3 个 + 还挂着的 1 个买单的冻结
    expect(spent).toBe(p * 4);
    const trades = await t.db
      .selectFrom('exchange_trade')
      .select(['qty', 'fee'])
      .where('seller_rest_id', '=', s.restaurantId)
      .execute();
    expect(trades.reduce((n, x) => n + x.qty, 0)).toBe(3);
    const fees = trades.reduce((n, x) => n + Number(x.fee), 0);
    expect((await wallet(t, s.restaurantId)).coin + fees).toBe(p * 3);
  });
});

describe('任务计数（问题记录 318）', () => {
  it('成交时买卖双方各计一次 exchange.fill；一次吃掉同一个人的两张挂单只计一次；只挂单不计', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s = await trader(t, { shardId, foods: { [f.id]: 10 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p, qty: 1 });
    expect(await eventCount(t, s.restaurantId, 'exchange.fill')).toBe(0);
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const res = await svc().place(b, { foodsId: f.id, side: 'buy', price: p, qty: 2 });
    expect(res.data.fills).toHaveLength(2);
    expect(await eventCount(t, s.restaurantId, 'exchange.fill')).toBe(1);
    expect(await eventCount(t, b.restaurantId, 'exchange.fill')).toBe(1);
    expect((await t.game.task.activation(b)).items.find((i) => i.name === '交易所成交')!.count).toBe(1);
  });

  it('两家互为挂单方同时成交：计数不死锁，各计一次', async () => {
    const shardId = await createShard(t.db);
    // 两家来回成交 10 笔会被判"反复对倒"、所得冻结，冻结的成交不计数（backlog 318）；这里只验死锁，调高门槛
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({ tuning: { exchange: { suspicious: { repeatCount: 1000 } } } }),
      })
      .execute();
    t.game.shards.invalidate(shardId);
    const [f1, f2] = [...t.deps.config.foods.values()].filter((f) => f.odds < 100 && f.coin >= 1000);
    const x = await trader(t, { shardId, foods: { [f1!.id]: 20 } });
    const y = await trader(t, { shardId, foods: { [f2!.id]: 20 } });
    for (let round = 0; round < 5; round++) {
      await svc().place(x, { foodsId: f1!.id, side: 'sell', price: f1!.coin, qty: 1 });
      await svc().place(y, { foodsId: f2!.id, side: 'sell', price: f2!.coin, qty: 1 });
      await Promise.all([
        svc().place(x, { foodsId: f2!.id, side: 'buy', price: f2!.coin, qty: 1 }),
        svc().place(y, { foodsId: f1!.id, side: 'buy', price: f1!.coin, qty: 1 }),
      ]);
    }
    expect(await eventCount(t, x.restaurantId, 'exchange.fill')).toBe(10);
    expect(await eventCount(t, y.restaurantId, 'exchange.fill')).toBe(10);
  });
});

describe('任务计数的终审遗留（backlog 318）', () => {
  async function trace(accountId: number, ip: string) {
    await t.db.insertInto('login_trace').values({ account_id: accountId, ip, device_id: null }).execute();
  }

  it('判为可疑、所得冻结的成交不计 exchange.fill，买卖双方都不计；同一单里正常的那笔照常计', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await trace(s.accountId, '10.9.9.1');
    await trace(b.accountId, '10.9.9.1');
    const res = await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(res.data.fills).toEqual([{ price: f.coin, qty: 1, held: true }]);
    expect(await eventCount(t, s.restaurantId, 'exchange.fill')).toBe(0);
    expect(await eventCount(t, b.restaurantId, 'exchange.fill')).toBe(0);
    expect((await t.game.task.activation(b)).items.find((i) => i.name === '交易所成交')!.count).toBe(0);

    const other = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await svc().place(other, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const mixed = await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 2 });
    expect(mixed.data.fills.map((x) => x.held).sort()).toEqual([false, true]);
    expect(await eventCount(t, b.restaurantId, 'exchange.fill')).toBe(1);
    expect(await eventCount(t, other.restaurantId, 'exchange.fill')).toBe(1);
    expect(await eventCount(t, s.restaurantId, 'exchange.fill')).toBe(0);
  });

  it('挂单方的动作事件带上挂单方自己的星级和等级', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, foods: { [f.id]: 5 } });
    await t.db
      .updateTable('restaurant')
      .set({ star_level: 4, level: 66 })
      .where('id', '=', s.restaurantId)
      .execute();
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const seen: Array<{ restId: number; star: number; level: number }> = [];
    t.deps.bus.on('action', async (_tx, e) => {
      const p = e.payload as { key: string; star: number; level: number };
      if (p.key === 'exchange.fill') seen.push({ restId: e.restId, star: p.star, level: p.level });
    });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(seen.find((x) => x.restId === s.restaurantId)).toEqual({
      restId: s.restaurantId,
      star: 4,
      level: 66,
    });
  });
});

describe('冷门食材的参考价不在锁店事务里补算（质量期 ③）', () => {
  const q = queryCounter();
  let qt: TestGame;
  beforeAll(async () => {
    qt = await createTestGame({ db: q.db });
  });
  afterAll(async () => {
    await qt.close();
    await q.db.destroy();
  });

  it('一周多没人看的食材第一笔下单：锁店事务里只读一次参考价，补算在锁外做完', async () => {
    const shardId = await createShard(qt.db);
    const f = rare();
    const day = gameDay(qt.clock.now);
    // 8 天前保存过参考价，之后没人看：要往前补算 7 天
    await qt.db
      .insertInto('exchange_ref')
      .values({ shard_id: shardId, foods_id: f.id, day: addDays(day, -8), price: f.coin })
      .execute();
    const r = await trader(qt, { shardId, coin: 1_000_000 });
    const { sqls } = await q.count(() =>
      qt.game.exchange.place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 }),
    );
    const begin = sqls.findIndex((s, i) => s === 'begin' && /for (no key )?update/.test(sqls[i + 1] ?? ''));
    const tx = sqls.slice(begin, sqls.indexOf('commit', begin) + 1);
    expect(tx.length).toBeGreaterThan(2);
    expect(tx.filter((s) => /"exchange_ref"|sum\(qty\)/.test(s))).toHaveLength(1);
    // 补算的结果照样存下来了
    const saved = await qt.db
      .selectFrom('exchange_ref')
      .select('day')
      .where('shard_id', '=', shardId)
      .where('foods_id', '=', f.id)
      .execute();
    expect(saved.length).toBe(9);
  });
});
