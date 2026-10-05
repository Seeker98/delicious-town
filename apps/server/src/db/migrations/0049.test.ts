import { Migrator, sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '..';
import type { DB } from '../schema';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { migrations } from './index';
import { renumber } from './0049_renumber';
import { COOKBOOK_SLOTS, COOKBOOKS, FOODS, GOODS, SLOTS } from './0049_renumber_map';

/** 迁移 0049（重新编号）：在独立 schema 里迁到 0048、放旧编号的数据，再迁到 0049 */
const pairs = (flat: readonly number[]) =>
  new Map(
    Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i]!, flat[2 * i + 1]!] as [number, number]),
  );
const G = pairs(GOODS);
const F = pairs(FOODS);
const C = pairs(COOKBOOKS);
const S = pairs(COOKBOOK_SLOTS);
const g = (old: number) => G.get(old)!;
const f = (old: number) => F.get(old)!;
const c = (old: number) => C.get(old)!;

const SCHEMA = 'renumber_0049';
const admin = testDb();
let db: Kysely<DB>;
let shard: number;
let rest: number;
let account: number;
const now = new Date();
const day = now.toISOString().slice(0, 10);
/** 迁移记录表也放在这个 schema 里：不指定时 Kysely 会顺着 search_path 用到 public 的记录表 */
const migrator = () =>
  new Migrator({ db, migrationTableSchema: SCHEMA, provider: { getMigrations: async () => migrations } });
const json = (v: unknown) => JSON.stringify(v);

/** 区服覆盖：区服数值（含不带键名的元组、按食材编号做键的参考价）和开店礼物（终审 C1、I2） */
const OVERRIDE = {
  restaurant: { giftGoods: [{ id: 1, num: 2 }], giftFoods: [{ id: 101, num: 3 }], coin: 101 },
  tuning: {
    shop: { discardable: [87] },
    hiphop: { wages: [[108, 110]] },
    predict: { unit: 500 },
    exchange: { refOverrides: { '467': 5000 } },
  },
};

/** 每种表、每种日志结构至少一条（Review Focus 1）；也放几条看着像编号但不是的 */
async function seedOld() {
  await db.insertInto('store_item').values({ rest_id: rest, goods_id: 1, num: 3 }).execute();
  await db.insertInto('cupboard_food').values({ rest_id: rest, foods_id: 101, num: 5 }).execute();
  await db.insertInto('yard_basket').values({ rest_id: rest, foods_id: 104, num: 2 }).execute();
  await db.insertInto('exchange_wallet_food').values({ rest_id: rest, foods_id: 467, num: 1 }).execute();
  await db
    .insertInto('takeaway_order')
    .values({
      shard_id: shard,
      cookbook_id: 1,
      grade: 1,
      need_minutes: 30,
      need_renown: 3,
      created_at: now,
      expires_at: now,
    })
    .execute();
  const equip = await db
    .insertInto('equip')
    .values({ rest_id: rest, goods_id: 30, part: 1 })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('equip_gem')
    .values({ equip_id: equip.id, rest_id: rest, gem_goods_id: 41, level: 1 })
    .execute();
  await db
    .insertInto('fund_deposit')
    .values({
      shard_id: shard,
      rest_id: rest,
      tier: 'C',
      coin: 1,
      medal: 93101,
      started_at: now,
      matures_at: now,
    })
    .execute();
  await db
    .insertInto('effect_source')
    .values([
      { rest_id: rest, source_type: 'street', source_id: 140, effects: json({ coinValue: 1 }) },
      { rest_id: rest, source_type: 'honor', source_id: 81, effects: json({ coinRate: 0.01 }) },
      // 设施的 source_id 是摆放位，不是道具
      { rest_id: rest, source_type: 'device', source_id: 3, effects: json({ expValue: 1 }) },
    ])
    .execute();
  await db
    .insertInto('ledger')
    .values([
      { rest_id: rest, kind: 'goods', item_id: 115, delta: -1, source: 'use' },
      { rest_id: rest, kind: 'goods', item_id: 1, delta: 20, source: 'gift.115' },
      { rest_id: rest, kind: 'foods', item_id: 101, delta: 4, source: 'market' },
      { rest_id: rest, kind: 'basket', item_id: 104, delta: 2, source: 'yard' },
      // 残卷记特色菜编号，不动
      { rest_id: rest, kind: 'remnant', item_id: 1, delta: 1, source: 'mc' },
    ])
    .execute();
  await db
    .insertInto('stat_daily')
    .values({ shard_id: shard, day, kind: 'goods', source: 'gift.115', amount: 1 })
    .execute();
  await db
    .insertInto('daily_counter')
    .values([
      { rest_id: rest, day, key: 'renownShop:310', count: 1 },
      { rest_id: rest, day, key: 'tower.floor:3', count: 1 },
    ])
    .execute();
  await db
    .insertInto('market_guess')
    .values({ shard_id: shard, period: 'p1', rest_id: rest, foods_ids: [104, 101], created_at: now })
    .execute();
  const log = (type: string, params: unknown) => ({
    rest_id: rest,
    type,
    params: json(params),
    created_at: now,
  });
  await db
    .insertInto('rest_log')
    .values([
      log('fridge.drop', { foodsId: 467, num: 3 }),
      log('exchange', { by: 7, give: 252, take: 437, result: 'ok' }),
      log('town.talk', {
        npc: 'wenjie',
        rewards: [
          { kind: 'goods', id: 315, num: 1 },
          { kind: 'foods', id: 101, num: 2 },
          { kind: 'coin', id: null, num: 500 },
        ],
      }),
      log('admin.grant', { items: { goods: [{ id: 355, num: 1 }], foods: [{ id: 468, num: 9 }], coin: 10 } }),
      log('krab.happy', { cookbookId: 1, grade: 7, req: 2 }),
      // 已删的菜（0039）：历史里留着，迁移不报错
      log('krab.happy', { cookbookId: 51, grade: 1, req: 1 }),
      log('mc.forget', { cookbooks: [1], mcId: 3 }),
      log('yard.stolen', { by: 7, foodsId: 101, num: 1, punished: 104 }),
      log('hiphop.wage', { cardId: 108 }),
      log('fund.claim', { tier: 'C', coin: 1, medal: 93101 }),
      log('level.up', { from: 1, to: 2 }),
      log('rest.move', { from: 10, to: 1 }),
      log('mouse.steal', { foodsId: 239, num: 101 }),
    ])
    .execute();
  const news = (type: string, params: unknown) => ({
    shard_id: shard,
    type,
    rest_id: rest,
    params: json(params),
  });
  await db
    .insertInto('news')
    .values([
      news('market.restock', { shelf: 0, foods: [104, 275] }),
      news('bar.slot', { awardId: 1, kind: 'foods', itemId: 326, num: 1 }),
      news('bar.num', { lucky: false, award: { kind: 'goods', id: 240, num: 1 } }),
      news('shop.special', { goodsId: 464, tier: '九折' }),
      news('temple.explore.rare', { foods: [{ foodsId: 574, num: 1 }] }),
    ])
    .execute();
  await db
    .insertInto('mail')
    .values({
      scope: 'rest',
      shard_id: shard,
      rest_id: rest,
      title: 't',
      body: 'b',
      items: json({ goods: [{ id: 396, num: 1 }] }),
      tpl_params: null,
      source: 'grant',
    })
    .execute();
  await db
    .insertInto('redeem_code')
    .values({
      code: `RN${Date.now()}`,
      kind: 'shared',
      items: json({ goods: [{ id: 54, num: 1 }] }),
      note: '',
      actor_account_id: account,
    })
    .execute();
  await db
    .insertInto('activity')
    .values({
      kind: 'pass',
      title: 't',
      body: 'b',
      starts_at: now,
      ends_at: new Date(now.getTime() + 3_600_000),
      def: json({
        levels: [{ points: 10, award: { goods: [{ id: 1, num: 1 }] } }],
        price: { goods: [{ id: 310, num: 1 }] },
      }),
    })
    .execute();
  await db
    .insertInto('admin_grant')
    .values({
      shard_id: shard,
      target: 'rest',
      items: json({ goods: [{ id: 355, num: 1 }] }),
      reason: 'r',
      status: 'done',
    })
    .execute();
  await db
    .insertInto('kuji_pool')
    .values({
      shard_id: shard,
      day,
      seq: 1,
      status: 'open',
      total: 1,
      created_at: now,
      tiers: json([{ key: 'A', count: 1, award: { goods: [{ id: 91101, num: 1 }], coin: 100 } }]),
      last: json({ award: { goods: [{ id: 91104, num: 1 }] } }),
    })
    .execute();
  await db
    .insertInto('shard_config')
    .values({
      shard_id: shard,
      override: json({
        ...OVERRIDE,
      }),
    })
    .onConflict((oc) =>
      oc.column('shard_id').doUpdateSet({
        override: json({
          ...OVERRIDE,
        }),
      }),
    )
    .execute();
  await db
    .insertInto('shard_config_history')
    .values({ shard_id: shard, version: 1, override: json(OVERRIDE), note: 'n' })
    .execute();
  await db.deleteFrom('restaurant_tables').where('rest_id', '=', rest).execute();
  await db
    .insertInto('restaurant_tables')
    .values({
      rest_id: rest,
      tables: json([
        { no: 1, floor: 1, customer: 2, last: { type: 2, cookbookId: 442, grade: 7, coin: 101 } },
      ]),
    })
    .execute();
  await db
    .insertInto('income_round')
    .values({
      rest_id: rest,
      round_no: 1,
      coin: 1,
      exp: 1,
      oil: 1,
      customers: json({}),
      rates: json({}),
      drops: json([{ goodsId: 134, num: 1 }]),
      created_at: now,
    })
    .execute();
  // 学会记录：旧编号 1 学到 3 级；17204 是 0039 删掉的菜，位置上还留着字节
  const levels = Buffer.alloc(18747);
  levels[1] = 3;
  levels[17204] = 2;
  await db.deleteFrom('restaurant_cookbooks').where('rest_id', '=', rest).execute();
  await db.insertInto('restaurant_cookbooks').values({ rest_id: rest, levels }).execute();
  // 一家学会记录比较短的老店
  const short = await createRestaurantRow(db, shard, await createAccountRow(db));
  await db.deleteFrom('restaurant_cookbooks').where('rest_id', '=', short).execute();
  await db
    .insertInto('restaurant_cookbooks')
    .values({ rest_id: short, levels: Buffer.from([0, 1]) })
    .execute();
  return short;
}

let shortRest: number;
beforeAll(async () => {
  await sql`drop schema if exists ${sql.id(SCHEMA)} cascade`.execute(admin);
  await sql`create schema ${sql.id(SCHEMA)}`.execute(admin);
  db = createDb(`${process.env.DATABASE_URL!}?options=-c%20search_path%3D${SCHEMA},public`, 2);
  const r = await migrator().migrateTo('0048_rest_door');
  if (r.error) throw r.error;
  // 表建在独立 schema 里，不碰共用测试库
  const { rows } = await sql<{ n: string }>`select count(*) as n from information_schema.tables
    where table_schema = ${SCHEMA} and table_name in ('store_item', 'kysely_migration')`.execute(db);
  if (Number(rows[0]!.n) !== 2) throw new Error('migrations did not run in the test schema');
  shard = await createShard(db);
  account = await createAccountRow(db);
  rest = await createRestaurantRow(db, shard, account);
  shortRest = await seedOld();
});
afterAll(async () => {
  await db.destroy();
  await sql`drop schema if exists ${sql.id(SCHEMA)} cascade`.execute(admin);
  await admin.destroy();
});

describe('迁移 0049：重新编号', () => {
  it('在用的表里有查不到对照的旧编号：报错，整个事务回滚', async () => {
    await db.insertInto('store_item').values({ rest_id: rest, goods_id: 999, num: 1 }).execute();
    await expect(db.transaction().execute((trx) => renumber(trx, () => {}))).rejects.toThrow('store_item');
    const rows = await db
      .selectFrom('store_item')
      .select('goods_id')
      .where('rest_id', '=', rest)
      .orderBy('goods_id')
      .execute();
    expect(rows.map((r) => r.goods_id)).toEqual([1, 999]);
    await db.deleteFrom('store_item').where('goods_id', '=', 999).execute();
  });

  it('迁完：普通列、文本、JSON、学会记录都是新编号；不是编号的数字不动', async () => {
    const r = await migrator().migrateTo('0049_renumber');
    if (r.error) throw r.error;
    const by = <T>(rows: T[]) => rows;
    expect(
      by(await db.selectFrom('store_item').select(['goods_id', 'num']).where('rest_id', '=', rest).execute()),
    ).toEqual([{ goods_id: g(1), num: 3 }]);
    expect(
      (await db.selectFrom('cupboard_food').select('foods_id').where('rest_id', '=', rest).execute())[0]!
        .foods_id,
    ).toBe(f(101));
    expect(
      (await db.selectFrom('yard_basket').select('foods_id').where('rest_id', '=', rest).execute())[0]!
        .foods_id,
    ).toBe(f(104));
    expect(
      (
        await db.selectFrom('exchange_wallet_food').select('foods_id').where('rest_id', '=', rest).execute()
      )[0]!.foods_id,
    ).toBe(f(467));
    expect(
      (
        await db.selectFrom('takeaway_order').select('cookbook_id').where('shard_id', '=', shard).execute()
      )[0]!.cookbook_id,
    ).toBe(c(1));
    expect(
      (await db.selectFrom('equip').select('goods_id').where('rest_id', '=', rest).execute())[0]!.goods_id,
    ).toBe(g(30));
    expect(
      (await db.selectFrom('equip_gem').select('gem_goods_id').where('rest_id', '=', rest).execute())[0]!
        .gem_goods_id,
    ).toBe(g(41));
    expect(
      (await db.selectFrom('fund_deposit').select('medal').where('rest_id', '=', rest).execute())[0]!.medal,
    ).toBe(g(93101));
    expect(
      (
        await db
          .selectFrom('effect_source')
          .select(['source_type', 'source_id'])
          .where('rest_id', '=', rest)
          .orderBy('source_type')
          .execute()
      ).map((x) => [x.source_type, x.source_id]),
    ).toEqual([
      ['device', 3],
      ['honor', g(81)],
      ['street', g(140)],
    ]);
    expect(
      (
        await db
          .selectFrom('ledger')
          .select(['kind', 'item_id', 'source'])
          .where('rest_id', '=', rest)
          .orderBy('id')
          .execute()
      ).map((x) => [x.kind, x.item_id, x.source]),
    ).toEqual([
      ['goods', g(115), 'use'],
      ['goods', g(1), `gift.${g(115)}`],
      ['foods', f(101), 'market'],
      ['basket', f(104), 'yard'],
      ['remnant', 1, 'mc'],
    ]);
    expect(
      (await db.selectFrom('stat_daily').select('source').where('shard_id', '=', shard).execute())[0]!.source,
    ).toBe(`gift.${g(115)}`);
    expect(
      (
        await db
          .selectFrom('daily_counter')
          .select('key')
          .where('rest_id', '=', rest)
          .orderBy('key')
          .execute()
      ).map((x) => x.key),
    ).toEqual([`renownShop:${g(310)}`, 'tower.floor:3']);
    expect(
      (await db.selectFrom('market_guess').select('foods_ids').where('rest_id', '=', rest).execute())[0]!
        .foods_ids,
    ).toEqual([f(104), f(101)]);

    const logs = await db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', rest)
      .orderBy('id')
      .execute();
    const byType = (t: string) => logs.filter((l) => l.type === t).map((l) => l.params);
    expect(byType('fridge.drop')).toEqual([{ foodsId: f(467), num: 3 }]);
    expect(byType('exchange')).toEqual([{ by: 7, give: f(252), take: f(437), result: 'ok' }]);
    expect(byType('town.talk')).toEqual([
      {
        npc: 'wenjie',
        rewards: [
          { kind: 'goods', id: g(315), num: 1 },
          { kind: 'foods', id: f(101), num: 2 },
          { kind: 'coin', id: null, num: 500 },
        ],
      },
    ]);
    expect(byType('admin.grant')).toEqual([
      { items: { goods: [{ id: g(355), num: 1 }], foods: [{ id: f(468), num: 9 }], coin: 10 } },
    ]);
    expect(byType('krab.happy')).toEqual([
      { cookbookId: c(1), grade: 7, req: 2 },
      { cookbookId: 51, grade: 1, req: 1 },
    ]);
    expect(byType('mc.forget')).toEqual([{ cookbooks: [c(1)], mcId: 3 }]);
    expect(byType('yard.stolen')).toEqual([{ by: 7, foodsId: f(101), num: 1, punished: f(104) }]);
    expect(byType('hiphop.wage')).toEqual([{ cardId: g(108) }]);
    expect(byType('fund.claim')).toEqual([{ tier: 'C', coin: 1, medal: g(93101) }]);
    expect(byType('level.up')).toEqual([{ from: 1, to: 2 }]);
    expect(byType('rest.move')).toEqual([{ from: 10, to: 1 }]);
    expect(byType('mouse.steal')).toEqual([{ foodsId: f(239), num: 101 }]);

    const news = await db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', shard)
      .orderBy('id')
      .execute();
    expect(news.map((n) => n.params)).toEqual([
      { shelf: 0, foods: [f(104), f(275)] },
      { awardId: 1, kind: 'foods', itemId: f(326), num: 1 },
      { lucky: false, award: { kind: 'goods', id: g(240), num: 1 } },
      { goodsId: g(464), tier: '九折' },
      { foods: [{ foodsId: f(574), num: 1 }] },
    ]);

    expect(
      (await db.selectFrom('mail').select('items').where('rest_id', '=', rest).execute())[0]!.items,
    ).toEqual({
      goods: [{ id: g(396), num: 1 }],
    });
    expect(
      (
        await db.selectFrom('redeem_code').select('items').where('actor_account_id', '=', account).execute()
      )[0]!.items,
    ).toEqual({
      goods: [{ id: g(54), num: 1 }],
    });
    expect((await db.selectFrom('activity').select('def').execute()).at(-1)!.def).toEqual({
      levels: [{ points: 10, award: { goods: [{ id: g(1), num: 1 }] } }],
      price: { goods: [{ id: g(310), num: 1 }] },
    });
    expect(
      (await db.selectFrom('admin_grant').select('items').where('shard_id', '=', shard).execute())[0]!.items,
    ).toEqual({
      goods: [{ id: g(355), num: 1 }],
    });
    const pool = (
      await db.selectFrom('kuji_pool').select(['tiers', 'last']).where('shard_id', '=', shard).execute()
    )[0]!;
    expect(pool.tiers).toEqual([
      { key: 'A', count: 1, award: { goods: [{ id: g(91101), num: 1 }], coin: 100 } },
    ]);
    expect(pool.last).toEqual({ award: { goods: [{ id: g(91104), num: 1 }] } });
    const overrideNow = {
      restaurant: { giftGoods: [{ id: g(1), num: 2 }], giftFoods: [{ id: f(101), num: 3 }], coin: 101 },
      tuning: {
        shop: { discardable: [g(87)] },
        hiphop: { wages: [[g(108), g(110)]] },
        predict: { unit: 500 },
        exchange: { refOverrides: { [String(f(467))]: 5000 } },
      },
    };
    expect(
      (await db.selectFrom('shard_config').select('override').where('shard_id', '=', shard).execute())[0]!
        .override,
    ).toEqual(overrideNow);
    expect(
      (
        await db.selectFrom('shard_config_history').select('override').where('shard_id', '=', shard).execute()
      )[0]!.override,
    ).toEqual(overrideNow);
    expect(
      (await db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', rest).execute())[0]!
        .tables,
    ).toEqual([{ no: 1, floor: 1, customer: 2, last: { type: 2, cookbookId: c(442), grade: 7, coin: 101 } }]);
    expect(
      (await db.selectFrom('income_round').select('drops').where('rest_id', '=', rest).execute())[0]!.drops,
    ).toEqual([{ goodsId: g(134), num: 1 }]);

    const lv = (
      await db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', rest).execute()
    )[0]!.levels;
    expect(lv.length).toBe(SLOTS);
    expect(lv[S.get(1)!]).toBe(3);
    expect([...lv].filter((b) => b > 0)).toEqual([3]);
    const short = (
      await db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', shortRest).execute()
    )[0]!.levels;
    expect(short.length).toBe(SLOTS);
    expect(short[S.get(1)!]).toBe(1);
  });
});
