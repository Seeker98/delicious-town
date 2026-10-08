import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// 六级默认关掉交易（问题记录 461）：这里的区服放开全部等级
import { createShardAllLevels as createShard } from './test';
import { createTestGame, foodNum, type TestGame } from '../../../test/game';
import { gameDay } from '@dt/shared';
import { createExchangeAdmin } from './admin';
import { makerPrices } from './maker';
import { refPrice } from './ref';
import { priceBand } from './rules';
import { trader, wallet } from './test';
import { setTuning } from '../../../test/town';

/** 各等级价格倍数全 1（240-1 默认值） */
const ONE = [1, 1, 1, 1, 1, 1, 1];

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const admin = () => createExchangeAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'admin' as const, ip: '127.0.0.1' };
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;
const H = 3_600_000;

/** 造一笔大额可疑成交：卖方 s、买方 b，返回成交 id */
async function flaggedTrade(shardId: number) {
  const f = rare();
  const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 999 } });
  const qty = Math.ceil(1_000_000 / f.coin);
  await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty });
  const b = await trader(t, { shardId, coin: 100_000_000 });
  await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty });
  const tr = await t.db
    .selectFrom('exchange_trade')
    .select('id')
    .where('shard_id', '=', shardId)
    .executeTakeFirstOrThrow();
  return { f, s, b, qty, tradeId: Number(tr.id) };
}

describe('冷静期取出（156-2 设计 §5）', () => {
  it('冻结中取不出；到时间取出转进可用余额；me 显示冻结中的记录', async () => {
    const shardId = await createShard(t.db);
    const { f, s, b, qty } = await flaggedTrade(shardId);
    expect((await svc().me(s)).holds).toHaveLength(1);
    const w1 = await svc().withdraw(b);
    expect(w1.data.foods).toEqual([]);
    const back = t.clock.now;
    t.clock.set(new Date(back.getTime() + 25 * H));
    try {
      const w2 = await svc().withdraw(b);
      expect(w2.data.foods).toEqual([{ foodsId: f.id, num: qty }]);
      expect((await svc().me(b)).holds).toEqual([]);
      const net = f.coin * qty - Math.floor(f.coin * qty * 0.05);
      expect((await svc().withdraw(s)).data.coin).toBe(net);
    } finally {
      t.clock.set(back);
    }
  });
});

describe('冻结和没收（156-2 设计 §6）', () => {
  it('冻结：撤掉全部挂单、剩余退进账户；下单和取出报 exchange_frozen；解冻恢复', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 3 });
    await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 2 });
    await admin().freeze(actor, { restId: r.restaurantId, reason: '对倒' });
    expect((await svc().me(r)).orders).toEqual([]);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: f.coin * 2, foods: { [f.id]: 3 } });
    expect((await svc().me(r)).frozen).toEqual({ reason: '对倒' });
    await expect(svc().withdraw(r)).rejects.toMatchObject({ params: { reason: 'exchange_frozen' } });
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'exchange_frozen' },
      },
    );
    await admin().unfreeze(actor, { restId: r.restaurantId });
    await svc().withdraw(r);
    expect((await foodNum(t, r.restaurantId, f.id)).num).toBe(10);
    const audit = await t.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `rest:${r.restaurantId}`)
      .execute();
    expect(audit.map((x) => x.action).sort()).toEqual(['exchange.freeze', 'exchange.unfreeze']);
  });

  it('按成交没收：双方冻结中的都没收，之后取不出；已解冻的不受影响；按店没收全部', async () => {
    const shardId = await createShard(t.db);
    const { s, b, tradeId } = await flaggedTrade(shardId);
    const res = await admin().confiscate(actor, { tradeId });
    expect(res.count).toBe(2);
    const st = await t.db
      .selectFrom('exchange_hold')
      .select('status')
      .where('trade_id', '=', String(tradeId))
      .execute();
    expect(st.map((x) => x.status)).toEqual(['confiscated', 'confiscated']);
    const back = t.clock.now;
    t.clock.set(new Date(back.getTime() + 25 * H));
    try {
      expect((await svc().withdraw(s)).data.coin).toBe(0);
      expect((await svc().withdraw(b)).data.foods).toEqual([]);
    } finally {
      t.clock.set(back);
    }
    const two = await flaggedTrade(shardId);
    await t.db
      .updateTable('exchange_hold')
      .set({ status: 'released' })
      .where('rest_id', '=', two.b.restaurantId)
      .execute();
    const r2 = await admin().confiscate(actor, { restId: two.b.restaurantId });
    expect(r2.count).toBe(0);
    const r3 = await admin().confiscate(actor, { restId: two.s.restaurantId });
    expect(r3.count).toBe(1);
  });

  it('可疑成交列表：按区服、按标记筛选，带双方信息和冻结状态；冻结名单', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const { s, b, tradeId } = await flaggedTrade(shardId);
    await flaggedTrade(other);
    const rows = await admin().suspicious(shardId);
    expect(rows.map((x) => x.tradeId)).toEqual([tradeId]);
    expect(rows[0]).toMatchObject({
      flags: ['large'],
      buyer: { restId: b.restaurantId, hold: 'held' },
      seller: { restId: s.restaurantId, hold: 'held' },
    });
    expect(await admin().suspicious(shardId, 'same_ip')).toEqual([]);
    await admin().freeze(actor, { restId: s.restaurantId, reason: '大额' });
    const frozen = await admin().frozen(shardId);
    expect(frozen).toEqual([
      expect.objectContaining({ restId: s.restaurantId, reason: '大额', heldFoods: 0 }),
    ]);
    expect(frozen[0]!.heldCoin).toBeGreaterThan(0);
  });
});

describe('终审 I1：冻结先锁店，和这家店正在进行的下单、取出串行', () => {
  it('店被别的事务锁着时，冻结要等它结束；两种食材上的挂单都撤掉', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const g = [...t.deps.config.foods.values()].filter((x) => x.odds < 100 && x.coin >= 1000)[1]!;
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 5, [g.id]: 5 } });
    await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 2 });
    await svc().place(r, { foodsId: g.id, side: 'sell', price: g.coin * 2, qty: 3 });
    let release!: () => void;
    const held = new Promise<void>((ok) => (release = ok));
    let locked!: () => void;
    const isLocked = new Promise<void>((ok) => (locked = ok));
    // 模拟这家店正在进行的一次操作（下单、取出都会先锁店）
    const other = t.db.transaction().execute(async (tx) => {
      await tx
        .selectFrom('restaurant')
        .select('id')
        .where('id', '=', r.restaurantId)
        .forNoKeyUpdate()
        .execute();
      locked();
      await held;
    });
    await isLocked;
    let done = false;
    const freezing = admin()
      .freeze(actor, { restId: r.restaurantId, reason: '对倒' })
      .then(() => (done = true));
    await new Promise((ok) => setTimeout(ok, 300));
    expect(done).toBe(false);
    release();
    await other;
    await freezing;
    expect((await svc().me(r)).orders).toEqual([]);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 2, [g.id]: 3 } });
  });
});

describe('后台系统做市汇总（156-3 设计 §7）', () => {
  it('有库存或今天有收购的食材；今天花出、收回、手续费、净回收', async () => {
    const shardId = await createShard(t.db);
    const f = [...t.deps.config.foods.values()].find((x) => x.level === 6 && x.odds < 100 && x.odds > 0)!;
    const ref = await refPrice(
      t.db,
      t.deps.config,
      t.deps.config.tuning.exchange,
      ONE,
      shardId,
      f.id,
      gameDay(t.clock.now),
    );
    const band = priceBand(ref, t.deps.config.tuning.exchange);
    const { bid: b0, ask } = makerPrices(ref, null, band, t.deps.config.tuning.exchange.maker, ref);
    const bid = b0!;
    expect(await admin().maker(shardId)).toEqual({
      enabled: true,
      foods: [],
      today: { spent: 0, earned: 0, fee: 0, net: 0 },
    });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 10 });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: band.max, qty: 4 });
    const fee = Math.floor(bid * 10 * 0.05);
    expect(await admin().maker(shardId)).toEqual({
      enabled: true,
      foods: [{ foodsId: f.id, stock: 6, bought: 10, bid, ask }],
      today: { spent: bid * 10, earned: ask * 4, fee, net: ask * 4 - bid * 10 + fee },
    });
  });
});

describe('系统不收购的等级在后台汇总里（经济修正终审遗留：缺的测试）', () => {
  it('区服把 6 级改成不收：有库存的照样列，收购价写空，卖价照旧', async () => {
    const shardId = await createShard(t.db);
    const f = [...t.deps.config.foods.values()].find((x) => x.level === 6 && x.odds < 100 && x.odds > 0)!;
    const ref = await refPrice(
      t.db,
      t.deps.config,
      t.deps.config.tuning.exchange,
      ONE,
      shardId,
      f.id,
      gameDay(t.clock.now),
    );
    const band = priceBand(ref, t.deps.config.tuning.exchange);
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 5 });
    await setTuning(t, shardId, { exchange: { maker: { noBidLevels: [6] } } });
    const row = (await admin().maker(shardId)).foods.find((x) => x.foodsId === f.id)!;
    expect(row.stock).toBe(5);
    expect(row.bid).toBeNull();
    expect(row.ask).toBeGreaterThan(0);
  });
});

describe('backlog 156-3：系统做市关闭', () => {
  it('maker.enabled = false 时汇总里写明已关闭', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { exchange: { maker: { enabled: false } } });
    expect((await admin().maker(shardId)).enabled).toBe(false);
  });
});

describe('backlog 156-2：冻结、解冻的边界', () => {
  it('冻结不存在的店报 404 NOT_FOUND，不报 500', async () => {
    await expect(admin().freeze(actor, { restId: 99_999_999, reason: '测试' })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('解冻没冻结的店不写审计；解冻冻结中的店写审计', async () => {
    const shardId = await createShard(t.db);
    const s = await trader(t, { shardId, coin: 0 });
    const audits = () =>
      t.db
        .selectFrom('audit_log')
        .select('action')
        .where('target', '=', `rest:${s.restaurantId}`)
        .where('action', '=', 'exchange.unfreeze')
        .execute();
    await admin().unfreeze(actor, { restId: s.restaurantId });
    expect(await audits()).toHaveLength(0);
    await admin().freeze(actor, { restId: s.restaurantId, reason: '测试' });
    await admin().unfreeze(actor, { restId: s.restaurantId });
    expect(await audits()).toHaveLength(1);
  });
});

describe('backlog 156-2：冻结撤单、没收、可疑成交都写进个人日志', () => {
  const logs = (restId: number, type: string) =>
    t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', restId)
      .where('type', '=', type)
      .execute();

  it('冻结撤掉的每张挂单记一条 exchange.freezeCancel', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 3 });
    await admin().freeze(actor, { restId: r.restaurantId, reason: '对倒' });
    expect((await logs(r.restaurantId, 'exchange.freezeCancel')).map((x) => x.params)).toEqual([
      { side: 'sell', foodsId: f.id, price: f.coin * 2, left: 3 },
    ]);
  });

  it('没收：被没收的每家店记一条 exchange.confiscate，写明银币和食材', async () => {
    const shardId = await createShard(t.db);
    const { f, s, b, qty, tradeId } = await flaggedTrade(shardId);
    await admin().confiscate(actor, { tradeId });
    const net = f.coin * qty - Math.floor(f.coin * qty * 0.05);
    expect((await logs(s.restaurantId, 'exchange.confiscate')).map((x) => x.params)).toEqual([
      { coin: net, foods: [] },
    ]);
    expect((await logs(b.restaurantId, 'exchange.confiscate')).map((x) => x.params)).toEqual([
      { coin: 0, foods: [{ foodsId: f.id, num: qty }] },
    ]);
  });

  it('可疑成交的日志带上冻结小时数（按区服设置）', async () => {
    const shardId = await createShard(t.db);
    const { s } = await flaggedTrade(shardId);
    const fill = await logs(s.restaurantId, 'exchange.fill');
    expect(fill[0]!.params).toMatchObject({
      held: true,
      holdHours: t.deps.config.tuning.exchange.suspicious.holdHours,
    });
  });
});
