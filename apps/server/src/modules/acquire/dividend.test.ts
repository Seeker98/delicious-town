import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { payDividends } from './dividend';
import { acquireJobs } from './jobs';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const a = () => t.deps.config.tuning.acquire;
const TODAY = '2026-10-10';
const YDAY = '2026-10-09';
const NOW = gameTime(TODAY, 0, 6);
const pay = (shardId: number, now = NOW) => payDividends(t.game.deps, shardId, now, a());
const coin = async (id: number) => (await restRow(t, id)).coin;
const income = (restId: number, day: string, c: number, rounds = 100) =>
  t.db.insertInto('rest_income_day').values({ rest_id: restId, day, coin: c, rounds }).execute();
/** 老板近 7 天每天收入 perDay（决定封顶） */
const ownerIncome = async (restId: number, perDay: number) => {
  for (let i = 1; i <= 7; i++) await income(restId, addDays(TODAY, -i), perDay);
};
const own = (restId: number, shardId: number, ownerId: number) =>
  t.db
    .insertInto('acquire_state')
    .values({ rest_id: restId, shard_id: shardId, base: 1_000_000, heat: 1, owner_rest_id: ownerId })
    .execute();
const tend = (restId: number, day: string) =>
  t.db.insertInto('acquire_tend').values({ rest_id: restId, day, created_at: NOW }).execute();
const dividends = (ownerId: number) =>
  t.db
    .selectFrom('acquire_dividend')
    .selectAll()
    .where('owner_rest_id', '=', ownerId)
    .orderBy('rest_id')
    .execute();
const holder = async (ownerId: number) =>
  (
    await t.db
      .selectFrom('acquire_holder')
      .select('dividend_total')
      .where('rest_id', '=', ownerId)
      .executeTakeFirst()
  )?.dividend_total ?? 0;
const ban = async (restId: number) => {
  const acc = (await restRow(t, restId)).account_id;
  await t.db.updateTable('account').set({ banned_at: NOW }).where('id', '=', acc).execute();
};

describe('分红（收购 PR 2）', () => {
  it('前一天结算 × 5%，打理过 × 1.5，不满 90 轮不发；记下每家、累计、日志、流水', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const [x, y, z] = [
      await newRestaurant(t, { shardId }),
      await newRestaurant(t, { shardId }),
      await newRestaurant(t, { shardId }),
    ];
    await ownerIncome(o.restaurantId, 10_000_000);
    for (const r of [x, y, z]) await own(r.restaurantId, shardId, o.restaurantId);
    await income(x.restaurantId, YDAY, 2_000_000);
    await tend(x.restaurantId, YDAY);
    await income(y.restaurantId, YDAY, 1_000_000);
    await income(z.restaurantId, YDAY, 5_000_000, 50);
    const r = await pay(shardId);
    expect(r).toMatchObject({ owners: 1, rests: 2, coin: 200_000, failed: 0 });
    expect(await coin(o.restaurantId)).toBe(200_000);
    expect(await dividends(o.restaurantId)).toEqual([
      { rest_id: x.restaurantId, day: YDAY, owner_rest_id: o.restaurantId, coin: 150_000, tended: true },
      { rest_id: y.restaurantId, day: YDAY, owner_rest_id: o.restaurantId, coin: 50_000, tended: false },
    ]);
    expect(await holder(o.restaurantId)).toBe(200_000);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', o.restaurantId)
      .execute();
    expect(logs).toEqual([{ type: 'acquire.dividend', params: { day: YDAY, n: 2, coin: 200_000 } }]);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['kind', 'delta', 'source'])
      .where('rest_id', '=', o.restaurantId)
      .execute();
    expect(ledger).toEqual([{ kind: 'coin', delta: 200_000, source: 'acquire.dividend' }]);
  });

  it('合计超过老板的封顶：每家按比例压', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    const y = await newRestaurant(t, { shardId });
    // 封顶 1,000,000 × 25% = 250,000；两家各 500,000
    await ownerIncome(o.restaurantId, 1_000_000);
    for (const r of [x, y]) {
      await own(r.restaurantId, shardId, o.restaurantId);
      await income(r.restaurantId, YDAY, 10_000_000);
    }
    await pay(shardId);
    expect(await coin(o.restaurantId)).toBe(250_000);
    expect((await dividends(o.restaurantId)).map((d) => d.coin)).toEqual([125_000, 125_000]);
  });

  it('老板自己没有收入：封顶是 0，记录写 0，不加银币、不写日志', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 7 } });
    const x = await newRestaurant(t, { shardId });
    await own(x.restaurantId, shardId, o.restaurantId);
    await income(x.restaurantId, YDAY, 10_000_000);
    const r = await pay(shardId);
    expect(r).toMatchObject({ owners: 1, rests: 1, coin: 0 });
    expect(await coin(o.restaurantId)).toBe(7);
    expect(await dividends(o.restaurantId)).toMatchObject([{ coin: 0 }]);
    expect(await holder(o.restaurantId)).toBe(0);
    const logs = await t.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', o.restaurantId)
      .execute();
    expect(logs).toEqual([]);
  });

  it('零点到 00:05 之间打理了今天：昨天的打理照样算', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    await ownerIncome(o.restaurantId, 10_000_000);
    await own(x.restaurantId, shardId, o.restaurantId);
    await income(x.restaurantId, YDAY, 1_000_000);
    await tend(x.restaurantId, YDAY);
    await tend(x.restaurantId, TODAY);
    await pay(shardId);
    expect(await coin(o.restaurantId)).toBe(75_000);
  });

  it('同一天再跑一次不重复发', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    await ownerIncome(o.restaurantId, 10_000_000);
    await own(x.restaurantId, shardId, o.restaurantId);
    await income(x.restaurantId, YDAY, 1_000_000);
    await pay(shardId);
    const again = await pay(shardId, gameTime(TODAY, 3));
    expect(again).toMatchObject({ rests: 0, coin: 0 });
    expect(await coin(o.restaurantId)).toBe(50_000);
    expect(await holder(o.restaurantId)).toBe(50_000);
  });

  it('老板被封不发；被收购的店被封照发', async () => {
    const shardId = await createShard(t.db);
    const bannedOwner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    const y = await newRestaurant(t, { shardId });
    for (const id of [bannedOwner.restaurantId, o.restaurantId]) await ownerIncome(id, 10_000_000);
    await own(x.restaurantId, shardId, bannedOwner.restaurantId);
    await own(y.restaurantId, shardId, o.restaurantId);
    await income(x.restaurantId, YDAY, 1_000_000);
    await income(y.restaurantId, YDAY, 1_000_000);
    await ban(bannedOwner.restaurantId);
    await ban(y.restaurantId);
    await pay(shardId);
    expect(await coin(bannedOwner.restaurantId)).toBe(0);
    expect(await dividends(bannedOwner.restaurantId)).toEqual([]);
    expect(await coin(o.restaurantId)).toBe(50_000);
  });

  it('发给现在（00:05 以后）的老板；累计加在老板身上', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    await ownerIncome(o.restaurantId, 10_000_000);
    await own(x.restaurantId, shardId, o.restaurantId);
    await income(x.restaurantId, YDAY, 1_000_000);
    await t.db
      .insertInto('acquire_holder')
      .values({ rest_id: o.restaurantId, dividend_total: 1_000 })
      .execute();
    await pay(shardId);
    expect(await holder(o.restaurantId)).toBe(51_000);
  });

  it('只发本区服的', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const o = await newRestaurant(t, { shardId: other, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId: other });
    await ownerIncome(o.restaurantId, 10_000_000);
    await own(x.restaurantId, other, o.restaurantId);
    await income(x.restaurantId, YDAY, 1_000_000);
    expect(await pay(shardId)).toMatchObject({ owners: 0, rests: 0 });
    expect(await coin(o.restaurantId)).toBe(0);
  });

  it('任务：acquire-dividend 挂在 acquire 上，00:05 以后每天一次', () => {
    const job = acquireJobs(t.game.deps).find((j) => j.name === 'acquire-dividend')!;
    expect(job.feature).toBe('acquire');
    const settings = {} as Parameters<typeof job.period>[1];
    expect(job.period(gameTime(TODAY, 0, 4), settings)).toBeNull();
    expect(job.period(gameTime(TODAY, 0, 5), settings)).toBe(`acquire-dividend-${TODAY}`);
    expect(job.period(gameTime(TODAY, 23, 59), settings)).toBe(`acquire-dividend-${TODAY}`);
  });
});
