import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import { acquireShard } from '../../../test/acquire';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
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
    // 支线“收购”（问题记录 515）：领到分红记一次（一天一次，不按家数）
    expect(await eventCount(t, o.restaurantId, 'acquire.dividend')).toBe(1);
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
    expect(await eventCount(t, o.restaurantId, 'acquire.dividend')).toBe(0);
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

  it('累计加在老板身上', async () => {
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

  it('前一天归前任、00:05 之前换了老板：发给现在的老板，前任不得', async () => {
    const shardId = await acquireShard(t);
    const prev = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const o = await newRestaurant(t, { shardId, patch: { coin: 10_000_000 } });
    const x = await newRestaurant(t, { shardId, patch: { star_level: 2 } });
    for (const id of [prev.restaurantId, o.restaurantId]) await ownerIncome(id, 10_000_000);
    await own(x.restaurantId, shardId, prev.restaurantId);
    await income(x.restaurantId, YDAY, 1_000_000);
    // 换个 IP，免得被当成关联账号
    await t.db
      .updateTable('login_trace')
      .set({ ip: '10.20.30.41' })
      .where('account_id', '=', x.accountId)
      .execute();
    await t.db
      .updateTable('login_trace')
      .set({ ip: '10.20.30.42' })
      .where('account_id', '=', prev.accountId)
      .execute();
    t.clock.set(gameTime(TODAY, 0, 2));
    await t.game.acquire.buy(o, { restId: x.restaurantId, way: 'acquire', expect: 1_000_000 });
    const afterBuy = await coin(prev.restaurantId);
    await pay(shardId);
    expect(await coin(prev.restaurantId)).toBe(afterBuy);
    expect(await dividends(o.restaurantId)).toMatchObject([{ rest_id: x.restaurantId, coin: 50_000 }]);
  });

  it('同一天手动重跑、中间换过老板：已经发给这个老板的从封顶里扣掉', async () => {
    const shardId = await createShard(t.db);
    const a0 = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x1 = await newRestaurant(t, { shardId });
    const x2 = await newRestaurant(t, { shardId });
    // 封顶 250,000：x1 已经发满
    await ownerIncome(a0.restaurantId, 1_000_000);
    await own(x1.restaurantId, shardId, a0.restaurantId);
    await own(x2.restaurantId, shardId, a0.restaurantId);
    await income(x1.restaurantId, YDAY, 10_000_000);
    await income(x2.restaurantId, YDAY, 10_000_000);
    await t.db
      .insertInto('acquire_dividend')
      .values({
        rest_id: x1.restaurantId,
        day: YDAY,
        owner_rest_id: a0.restaurantId,
        coin: 250_000,
        tended: false,
      })
      .execute();
    await pay(shardId);
    expect(await coin(a0.restaurantId)).toBe(0);
    expect((await dividends(a0.restaurantId)).map((d) => d.coin)).toEqual([250_000, 0]);
  });

  it('前一天的收入还没汇总（汇总任务那天没跑成）但结算记录在：先补汇总再照常发（稳健性批终审 I1：原来报错，那天的分红就没了）', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    // 汇总任务是整个区服一起汇总的：昨天没跑成就谁都没有，老板的只有前天及更早的
    for (let i = 2; i <= 8; i++) await income(o.restaurantId, addDays(TODAY, -i), 10_000_000);
    await own(x.restaurantId, shardId, o.restaurantId);
    // 被收购的店前一天结算 100 轮、每轮 1 万银币，只有结算记录，没有每天汇总
    await sql`
      insert into income_round (rest_id, round_no, coin, exp, oil, customers, rates, drops, created_at)
      select ${x.restaurantId}, g, 10000, 0, 0, '{}', '{}', '[]', ${gameTime(YDAY, 1)}::timestamptz + g * interval '1 minute'
      from generate_series(1, 100) g`.execute(t.db);
    await pay(shardId);
    expect((await dividends(o.restaurantId)).map((d) => d.coin)).toEqual([50_000]);
    expect(await coin(o.restaurantId)).toBe(50_000);
  });

  it('前一天的收入没汇总上：报错（留在任务记录里），不发', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    await own(x.restaurantId, shardId, o.restaurantId);
    await expect(pay(shardId)).rejects.toThrow(/income/);
    expect(await dividends(o.restaurantId)).toEqual([]);
  });

  it('老板和被收购的店近 30 天共用过设备或 IP：这家当天不发，别的照发', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const [byIp, byDevice, clean] = [
      await newRestaurant(t, { shardId }),
      await newRestaurant(t, { shardId }),
      await newRestaurant(t, { shardId }),
    ];
    await ownerIncome(o.restaurantId, 10_000_000);
    for (const r of [byIp, byDevice, clean]) {
      await own(r.restaurantId, shardId, o.restaurantId);
      await income(r.restaurantId, YDAY, 1_000_000);
    }
    const trace = (accountId: number, ip: string, deviceId: string | null, lastSeen = NOW) =>
      t.db
        .insertInto('login_trace')
        .values({ account_id: accountId, ip, device_id: deviceId, last_seen: lastSeen })
        .execute();
    await trace(o.accountId, '10.1.1.1', 'dev-owner');
    await trace(byIp.accountId, '10.1.1.1', 'dev-a');
    await trace(byDevice.accountId, '10.2.2.2', 'dev-owner');
    await trace(clean.accountId, '10.3.3.3', 'dev-c');
    // 31 天前共用过的不算
    await trace(clean.accountId, '10.1.1.1', 'dev-owner', new Date(NOW.getTime() - 31 * 86_400_000));
    const r = await pay(shardId);
    expect(r).toMatchObject({ rests: 1, coin: 50_000, linked: 2 });
    expect((await dividends(o.restaurantId)).map((d) => d.rest_id)).toEqual([clean.restaurantId]);
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
