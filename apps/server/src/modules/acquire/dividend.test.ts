import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { gameTime } from '@dt/shared';
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
/** 结算时记下的让渡（店 restId 某天让给 ownerId 的） */
const due = (restId: number, day: string, ownerId: number, c: number, tended = false) =>
  t.db
    .insertInto('acquire_due')
    .values({ rest_id: restId, day, owner_rest_id: ownerId, coin: c, tended })
    .execute();
const rows = (restId: number) =>
  t.db
    .selectFrom('acquire_due')
    .select(['day', 'owner_rest_id', 'coin', 'refunded'])
    .select((eb) => eb('paid_at', 'is not', null).as('paid'))
    .where('rest_id', '=', restId)
    .orderBy('day')
    .orderBy('owner_rest_id')
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

describe('发让渡（收购改版 2026-10-16）', () => {
  it('今天以前还没发的按老板合计发：记下已发、累计、日志、流水；今天的不发', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const [x, y] = [await newRestaurant(t, { shardId }), await newRestaurant(t, { shardId })];
    await due(x.restaurantId, YDAY, o.restaurantId, 49_000, true);
    await due(y.restaurantId, YDAY, o.restaurantId, 12_600);
    await due(x.restaurantId, TODAY, o.restaurantId, 3_000);
    const r = await pay(shardId);
    expect(r).toMatchObject({ owners: 1, rests: 2, coin: 61_600, refunded: 0, failed: 0 });
    expect(await coin(o.restaurantId)).toBe(61_600);
    expect(await rows(x.restaurantId)).toEqual([
      { day: YDAY, owner_rest_id: o.restaurantId, coin: 49_000, refunded: false, paid: true },
      { day: TODAY, owner_rest_id: o.restaurantId, coin: 3_000, refunded: false, paid: false },
    ]);
    expect(await holder(o.restaurantId)).toBe(61_600);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', o.restaurantId)
      .execute();
    expect(logs).toEqual([{ type: 'acquire.dividend', params: { n: 2, coin: 61_600 } }]);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['kind', 'delta', 'source'])
      .where('rest_id', '=', o.restaurantId)
      .execute();
    expect(ledger).toEqual([{ kind: 'coin', delta: 61_600, source: 'acquire.dividend' }]);
    // 支线“收购”（问题记录 515）：领到抽成记一次（一天一次，不按家数）
    expect(await eventCount(t, o.restaurantId, 'acquire.dividend')).toBe(1);
  });

  it('前几天漏发的一起补；再跑一次不重复发', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId });
    await due(x.restaurantId, '2026-10-07', o.restaurantId, 1_000);
    await due(x.restaurantId, YDAY, o.restaurantId, 2_000);
    await pay(shardId);
    expect(await coin(o.restaurantId)).toBe(3_000);
    expect(await pay(shardId)).toMatchObject({ owners: 0, coin: 0 });
    expect(await coin(o.restaurantId)).toBe(3_000);
    expect(await holder(o.restaurantId)).toBe(3_000);
  });

  it('当天换过老板：各自那一行发给当时的老板', async () => {
    const shardId = await createShard(t.db);
    const [o1, o2] = [
      await newRestaurant(t, { shardId, patch: { coin: 0 } }),
      await newRestaurant(t, { shardId, patch: { coin: 0 } }),
    ];
    const x = await newRestaurant(t, { shardId });
    await due(x.restaurantId, YDAY, o1.restaurantId, 7_000);
    await due(x.restaurantId, YDAY, o2.restaurantId, 5_000);
    expect(await pay(shardId)).toMatchObject({ owners: 2, rests: 2, coin: 12_000 });
    expect(await coin(o1.restaurantId)).toBe(7_000);
    expect(await coin(o2.restaurantId)).toBe(5_000);
  });

  it('老板被封：退回店（流水 acquire.refund、写动态）；被收购的店被封照发', async () => {
    const shardId = await createShard(t.db);
    const banned = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const y = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await due(x.restaurantId, YDAY, banned.restaurantId, 8_000);
    await due(y.restaurantId, YDAY, o.restaurantId, 6_000);
    await ban(banned.restaurantId);
    await ban(y.restaurantId);
    expect(await pay(shardId)).toMatchObject({ owners: 1, coin: 6_000, refunded: 8_000 });
    expect(await coin(banned.restaurantId)).toBe(0);
    expect(await coin(x.restaurantId)).toBe(8_000);
    expect(await coin(o.restaurantId)).toBe(6_000);
    expect(await rows(x.restaurantId)).toMatchObject([{ refunded: true, paid: true }]);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['delta', 'source'])
      .where('rest_id', '=', x.restaurantId)
      .execute();
    expect(ledger).toEqual([{ delta: 8_000, source: 'acquire.refund' }]);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', x.restaurantId)
      .where('type', '=', 'acquire.refund')
      .executeTakeFirstOrThrow();
    expect(log.params).toEqual({ coin: 8_000 });
    expect(await holder(banned.restaurantId)).toBe(0);
  });

  it('老板和被收购的店近 30 天共用过设备或 IP：这家退回店，别的照发', async () => {
    const shardId = await createShard(t.db);
    const o = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const alt = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const x = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await due(alt.restaurantId, YDAY, o.restaurantId, 4_000);
    await due(x.restaurantId, YDAY, o.restaurantId, 9_000);
    const accs = [
      (await restRow(t, o.restaurantId)).account_id,
      (await restRow(t, alt.restaurantId)).account_id,
    ];
    for (const [i, acc] of accs.entries())
      await t.db
        .insertInto('login_trace')
        .values({ account_id: acc, ip: `10.7.7.${i + 1}`, device_id: 'dev-cede-link-01', last_seen: NOW })
        .execute();
    expect(await pay(shardId)).toMatchObject({ coin: 9_000, refunded: 4_000, linked: 1 });
    expect(await coin(o.restaurantId)).toBe(9_000);
    expect(await coin(alt.restaurantId)).toBe(4_000);
  });

  it('只发本区服的', async () => {
    const [s1, s2] = [await createShard(t.db), await createShard(t.db)];
    const o1 = await newRestaurant(t, { shardId: s1, patch: { coin: 0 } });
    const o2 = await newRestaurant(t, { shardId: s2, patch: { coin: 0 } });
    const x1 = await newRestaurant(t, { shardId: s1 });
    const x2 = await newRestaurant(t, { shardId: s2 });
    await due(x1.restaurantId, YDAY, o1.restaurantId, 1_000);
    await due(x2.restaurantId, YDAY, o2.restaurantId, 2_000);
    await pay(s1);
    expect(await coin(o1.restaurantId)).toBe(1_000);
    expect(await coin(o2.restaurantId)).toBe(0);
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

describe('有老板没发成时任务记成出错（稳健性收尾批：原来只记日志、任务算成功，自动重试补不上）', () => {
  /** 只让发给这个老板的那几行写不进去（触发器按老板店号过滤，不影响别的测试） */
  async function failFor(ownerId: number) {
    const fn = sql.raw(`test_fail_cede_${ownerId}`);
    await sql`create function ${fn}() returns trigger language plpgsql as $$
      begin
        if new.owner_rest_id = ${sql.raw(String(ownerId))} and new.paid_at is not null then
          raise exception 'test cede fail';
        end if;
        return new;
      end $$`.execute(t.db);
    await sql`create trigger ${fn} before update on acquire_due for each row execute function ${fn}()`.execute(
      t.db,
    );
    return async () => {
      await sql`drop trigger if exists ${fn} on acquire_due`.execute(t.db);
      await sql`drop function if exists ${fn}()`.execute(t.db);
    };
  }

  it('任务抛错；重跑时只补没发成的，发过的不重复', async () => {
    const shardId = await createShard(t.db);
    const ok = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const bad = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const [x, y] = [await newRestaurant(t, { shardId }), await newRestaurant(t, { shardId })];
    await due(x.restaurantId, YDAY, ok.restaurantId, 35_000);
    await due(y.restaurantId, YDAY, bad.restaurantId, 35_000);
    const job = acquireJobs(t.game.deps).find((j) => j.name === 'acquire-dividend')!;
    const ctx = {
      shardId,
      period: `acquire-dividend-${TODAY}`,
      now: NOW,
      settings: { tuning: { acquire: a() } } as never,
      log: { error: () => {} },
    };
    const restore = await failFor(bad.restaurantId);
    try {
      await expect(job.run(ctx)).rejects.toThrow(/1 failed/);
    } finally {
      await restore();
    }
    expect(await coin(ok.restaurantId)).toBe(35_000);
    expect(await coin(bad.restaurantId)).toBe(0);
    await expect(job.run({ ...ctx, now: gameTime(TODAY, 0, 20) })).resolves.toMatchObject({
      rests: 1,
      failed: 0,
    });
    expect(await coin(ok.restaurantId)).toBe(35_000);
    expect(await coin(bad.restaurantId)).toBe(35_000);
  });
});
