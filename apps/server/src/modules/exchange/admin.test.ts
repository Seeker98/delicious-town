import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, type TestGame } from '../../../test/game';
import { createExchangeAdmin } from './admin';
import { trader, wallet } from './test';

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
