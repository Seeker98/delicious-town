import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { setTuning } from '../../../test/town';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { recordLogin } from '../account/loginTrace';
import { createSuspicious, MULTI_ACCOUNTS_MAX } from './suspicious';

let t: TestGame;
let s: ReturnType<typeof createSuspicious>;
beforeAll(async () => {
  t = await createTestGame();
  s = createSuspicious(t.game);
});
afterAll(() => t.close());

const counter = (restId: number, key: string, day: string, count: number) =>
  t.db.insertInto('daily_counter').values({ rest_id: restId, key, day, count }).execute();
const ledger = (restId: number, kind: string, delta: number, source: string, at: Date) =>
  t.db.insertInto('ledger').values({ rest_id: restId, kind, delta, source, created_at: at }).execute();

describe('可疑数据（设计 §5）', () => {
  it('酒吧：最近 7 天合计和单日最高；超过门槛的标红排前面', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const today = gameDay(t.clock.now);
    await counter(a.restaurantId, 'bar.memory.perfect', today, 5);
    await counter(a.restaurantId, 'bar.memory.perfect', addDays(today, -1), 1);
    await counter(b.restaurantId, 'bar.darts.bull', today, 4);
    await counter(b.restaurantId, 'bar.darts.bull', addDays(today, -9), 99);
    const rows = await s.bar(shardId);
    expect(rows[0]).toMatchObject({ restId: a.restaurantId, perfectSum: 6, perfectMax: 5, flagged: true });
    expect(rows.find((r) => r.restId === b.restaurantId)).toMatchObject({ bullSum: 4, flagged: false });
  });

  it('资源暴涨：按净增排序（Review Focus 2），附最大的来源', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const day = addDays(gameDay(t.clock.now), -1);
    const at = new Date(gameTime(day, 0).getTime() + 3_600_000);
    await ledger(a.restaurantId, 'coin', 1_000_000, 'tower.challenge', at);
    await ledger(a.restaurantId, 'coin', -990_000, 'shop.buy', at);
    await ledger(b.restaurantId, 'coin', 500_000, 'settlement', at);
    const r = await s.surge(shardId, day);
    expect(r.coin.map((x) => x.restId)).toEqual([b.restaurantId, a.restaurantId]);
    expect(r.coin[1]).toMatchObject({ net: 10_000 });
    expect(r.coin[1]!.topSources[0]).toEqual({ source: 'tower.challenge', delta: 1_000_000 });
  });

  it('多号：同一 IP 3 个账号列出；同一账号多次登录只算 1 个（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const rs = await Promise.all([1, 2, 3].map(() => newRestaurant(t, { shardId })));
    const ip = `10.66.${Date.now() % 250}.1`;
    for (const r of rs) await recordLogin(t.db, r.accountId, ip, null);
    const solo = await newRestaurant(t, { shardId });
    const ip2 = `10.67.${Date.now() % 250}.2`;
    for (let i = 0; i < 5; i++) await recordLogin(t.db, solo.accountId, ip2, `dev-solo-${i}aaaa`);
    const groups = await s.multi(shardId);
    const g = groups.find((x) => x.kind === 'ip' && x.key === ip)!;
    expect(g.accounts).toHaveLength(3);
    expect(g.accounts[0]!.restId).not.toBeNull();
    expect(groups.some((x) => x.key === ip2)).toBe(false);
  });

  it('兑换码被锁：计数达到上限的账号', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    await t.deps.redis.set(`redeem:fail:${r.accountId}`, '10', 'EX', 600);
    const rows = await s.redeemLocked(shardId);
    expect(rows.find((x) => x.accountId === r.accountId)).toMatchObject({ fails: 10 });
    expect(rows.find((x) => x.accountId === r.accountId)!.ttlSec).toBeGreaterThan(0);
  });
});

describe('可疑数据终审修复', () => {
  it('资源暴涨把结算收入（income_round）算进净增（终审 I1）', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const day = addDays(gameDay(t.clock.now), -1);
    const at = new Date(gameTime(day, 0).getTime() + 3_600_000);
    await t.db
      .insertInto('income_round')
      .values({
        rest_id: a.restaurantId,
        round_no: 1,
        coin: 2_000_000,
        exp: 30_000,
        oil: 0,
        customers: JSON.stringify({}),
        rates: JSON.stringify({}),
        drops: JSON.stringify([]),
        created_at: at,
      })
      .execute();
    await ledger(b.restaurantId, 'coin', 500_000, 'shop.sell', at);
    const r = await s.surge(shardId, day);
    expect(r.coin[0]).toMatchObject({ restId: a.restaurantId, net: 2_000_000 });
    expect(r.coin[0]!.topSources[0]).toEqual({ source: 'settlement', delta: 2_000_000 });
    expect(r.exp[0]).toMatchObject({ restId: a.restaurantId, net: 30_000 });
  });
});

describe('backlog 6B-2：多号分组', () => {
  it('IP 和设备分组一起按人数排、再取前 N 个，设备分组不会被 IP 分组挤掉', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { ops: { suspicious: { topN: 1 } } });
    const tag = Date.now() % 250;
    const byIp = await Promise.all([1, 2, 3].map(() => newRestaurant(t, { shardId })));
    for (const r of byIp) await recordLogin(t.db, r.accountId, `10.68.${tag}.1`, null);
    const byDev = await Promise.all([1, 2, 3, 4].map(() => newRestaurant(t, { shardId })));
    const dev = `dev-multi-${Date.now()}`;
    for (const [i, r] of byDev.entries()) await recordLogin(t.db, r.accountId, `10.69.${tag}.${i + 1}`, dev);
    const groups = await s.multi(shardId);
    expect(groups.map((g) => [g.kind, g.key, g.total])).toEqual([['device', dev, 4]]);
  });

  it('一组账号太多时只列最近 50 个，并给出总数', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const ip = `10.70.${Date.now() % 250}.9`;
    await recordLogin(t.db, r.accountId, ip, null);
    for (let i = 0; i < MULTI_ACCOUNTS_MAX + 1; i++)
      await recordLogin(t.db, await createAccountRow(t.db), ip, null);
    const g = (await s.multi(shardId)).find((x) => x.key === ip)!;
    expect(g.total).toBe(MULTI_ACCOUNTS_MAX + 2);
    expect(g.accounts).toHaveLength(MULTI_ACCOUNTS_MAX);
  });
});
