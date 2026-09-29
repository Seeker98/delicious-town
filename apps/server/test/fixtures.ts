import { sql, type Insertable, type Kysely } from 'kysely';
import type { DB } from '../src/db';
import { uniqueViolation } from '../src/db/errors';
import type { CookbookCounts, RestaurantTable, TableState } from '../src/db/schema';
import { testConfig } from './config';

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

export function emptyCounts(): CookbookCounts {
  return { learned: 0, grade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: {} };
}

export interface FullRestaurantOptions {
  patch?: Partial<Insertable<RestaurantTable>>;
  /** 食谱 id → 品级 */
  cookbooks?: Record<number, number>;
  tables?: TableState[];
}

/** 餐厅 + 餐桌 + 已学食谱三行一起建；cookbook_counts 按 cookbooks 算好 */
export async function createRestaurantFull(
  db: Kysely<DB>,
  shardId: number,
  accountId: number,
  opts: FullRestaurantOptions = {},
): Promise<number> {
  const config = testConfig();
  const counts = emptyCounts();
  const levels = Buffer.alloc(config.maxCookbookId + 1);
  for (const [id, grade] of Object.entries(opts.cookbooks ?? {})) {
    const cb = config.requireCookbook(Number(id));
    levels[cb.id] = grade;
    if (grade > 0) {
      counts.learned += 1;
      counts.grade[grade]! += 1;
      counts.street[String(cb.streetId)] = (counts.street[String(cb.streetId)] ?? 0) + 1;
    }
  }
  const tableNum = opts.patch?.table_num ?? 4;
  const restId = await createRestaurantRow(db, shardId, accountId, {
    ...opts.patch,
    table_num: tableNum,
    cookbook_counts: JSON.stringify(counts),
  });
  const tables =
    opts.tables ??
    Array.from({ length: tableNum }, (_, i) => ({ no: i + 1, floor: Math.floor(i / 16) + 1, customer: 0 }));
  await db
    .insertInto('restaurant_tables')
    .values({ rest_id: restId, tables: JSON.stringify(tables) })
    .execute();
  await db.insertInto('restaurant_cookbooks').values({ rest_id: restId, levels }).execute();
  return restId;
}

/** 让这家店之后写个人日志时报错（模拟单店处理失败）；返回撤销函数。触发器在 globalSetup 里建好 */
export async function failRestLog(db: Kysely<DB>, restId: number): Promise<() => Promise<void>> {
  await sql`insert into test_fail_rest (rest_id) values (${restId})`.execute(db);
  return async () => {
    await sql`delete from test_fail_rest where rest_id = ${restId}`.execute(db);
  };
}
