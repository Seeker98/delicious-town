import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

const newRest = async () => createRestaurantRow(db, shard, await createAccountRow(db));
const now = new Date();

describe('迁移 0014', () => {
  it('星愿：每区服每天一行', async () => {
    const a = await newRest();
    const row = { shard_id: shard, day: '2026-09-30', bless_id: 1, rest_id: a, created_at: now };
    await db.insertInto('town_bless').values(row).execute();
    await expect(
      db
        .insertInto('town_bless')
        .values({ ...row, bless_id: 2 })
        .execute(),
    ).rejects.toThrow();
    await db
      .insertInto('town_bless')
      .values({ ...row, day: '2026-10-01' })
      .execute();
  });

  it('小镇个人状态：默认没领过大胃哥首次礼物', async () => {
    const a = await newRest();
    await db.insertInto('town_rest').values({ rest_id: a }).execute();
    expect(
      await db.selectFrom('town_rest').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({ rest_id: a, hammer_at: null, broadcast_at: null, big_eater_gift: false });
  });

  it('摇钱包：同店同一天只有一条；IP 和设备可以重复（开发期限制可关）', async () => {
    const a = await newRest();
    const b = await newRest();
    const row = {
      shard_id: shard,
      day: '2026-09-30',
      rest_id: a,
      ip: '1.1.1.1',
      device: 'dev-1',
      coin: 5,
      created_at: now,
    };
    await db.insertInto('town_shake').values(row).execute();
    await expect(db.insertInto('town_shake').values(row).execute()).rejects.toThrow();
    await db
      .insertInto('town_shake')
      .values({ ...row, rest_id: b })
      .execute();
  });

  it('兑换次数：每店每项一行', async () => {
    const a = await newRest();
    await db.insertInto('town_exchange_use').values({ rest_id: a, exchange_id: 2, times: 1 }).execute();
    await expect(
      db.insertInto('town_exchange_use').values({ rest_id: a, exchange_id: 2, times: 1 }).execute(),
    ).rejects.toThrow();
  });

  it('world_state 有可空的上次换天气时间；新闻有按 id 倒序的索引', async () => {
    const cols = await sql<{ is_nullable: string }>`
      select is_nullable from information_schema.columns
      where table_name = 'world_state' and column_name = 'weather_changed_at'`.execute(db);
    expect(cols.rows).toEqual([{ is_nullable: 'YES' }]);
    const idx = await sql<{ indexname: string }>`
      select indexname from pg_indexes where tablename = 'news' and indexname in ('news_shard_id', 'news_shard_type')
      order by indexname`.execute(db);
    expect(idx.rows.map((r) => r.indexname)).toEqual(['news_shard_id', 'news_shard_type']);
  });
});
