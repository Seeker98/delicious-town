import type { Insertable, Kysely } from 'kysely';
import type { DB } from '../src/db';
import { uniqueViolation } from '../src/db/errors';
import type { RestaurantTable } from '../src/db/schema';

let seq = Math.floor(Math.random() * 1_000_000);

/** 生成 <= 9 个字符的唯一名称（用户名上限 9） */
export function uniqueName(prefix = 't'): string {
  seq += 1;
  return (prefix + seq.toString(36) + Math.random().toString(36).slice(2)).slice(0, 9);
}

export async function createShard(
  db: Kysely<DB>,
  opts: { status?: 'open' | 'closed'; name?: string } = {},
): Promise<number> {
  // 测试文件可能并行运行，用随机 id + 冲突重试，避免"最大 id + 1"的竞争
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = 1_000_000 + Math.floor(Math.random() * 2_000_000_000);
    try {
      await db
        .insertInto('shard')
        .values({ id, name: opts.name ?? `测试服${id}`, status: opts.status ?? 'open' })
        .execute();
      return id;
    } catch (e) {
      if (uniqueViolation(e) === null) throw e;
    }
  }
  throw new Error('failed to allocate a test shard id');
}

export async function createAccountRow(db: Kysely<DB>): Promise<number> {
  const name = uniqueName('a');
  const row = await db
    .insertInto('account')
    .values({ username: name, password_hash: 'x', email: `${name}@fixture.local` })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function createRestaurantRow(
  db: Kysely<DB>,
  shardId: number,
  accountId: number,
  patch: Partial<Insertable<RestaurantTable>> = {},
): Promise<number> {
  const row = await db
    .insertInto('restaurant')
    .values({
      shard_id: shardId,
      account_id: accountId,
      name: uniqueName('r'),
      level: 1,
      coin: 0,
      diamond: 0,
      strength: 100,
      strength_max: 100,
      oil: 1000,
      oil_max: 1000,
      street_id: 0,
      renown: 0,
      attr_left: 0,
      table_num: 4,
      cupboard_num: 100,
      store_num: 20,
      foods_max_num: 999,
      foods_lock_num: 15,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
