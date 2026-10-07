import { sql, type Kysely } from 'kysely';

/**
 * 支线“四海为家”的“搬到杂碎街”（问题记录 515 支线扩充）按搬家时记的 rest.moveTo.29 算。
 * 上线前就开在杂碎街的店不会再搬进来一次，这里先记上，免得这一档和后面的“思乡之情”都卡住（终审）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await backfill(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfill(db: Kysely<any>): Promise<void> {
  await sql`insert into event_counter (rest_id, key, count)
    select id, 'rest.moveTo.29', 1 from restaurant where street_id = 29
    on conflict do nothing`.execute(db);
}

// 补记的计数留着，和正常搬进来的一样
export async function down(): Promise<void> {}
