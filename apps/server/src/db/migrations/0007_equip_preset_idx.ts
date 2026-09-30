import { sql, type Kysely } from 'kysely';

/** 预设引用厨具的外键列加索引：删除厨具时 PG 要按这些列找引用行（终审 Important 2） */
const COLS = ['part1', 'part2', 'part3', 'part4', 'part5'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  for (const c of COLS) {
    await sql`create index ${sql.id(`equip_preset_${c}`)} on equip_preset (${sql.id(c)})`.execute(db);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const c of COLS) await sql`drop index if exists ${sql.id(`equip_preset_${c}`)}`.execute(db);
}
