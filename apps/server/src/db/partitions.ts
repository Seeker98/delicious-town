import { sql, type Kysely } from 'kysely';
import type { DB } from './schema';

export type PartitionedTable = 'ledger' | 'news' | 'income_round' | 'rest_log';
const DAY_MS = 86_400_000;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function partitionName(table: PartitionedTable | string, day: string): string {
  return `${table}_p${day.replaceAll('-', '')}`;
}

/** 从 from 所在的 UTC 日开始，预建 days 个按天分区；已存在的跳过 */
export async function ensureDailyPartitions(
  db: Kysely<DB>,
  table: PartitionedTable,
  from: Date,
  days: number,
): Promise<string[]> {
  const names: string[] = [];
  const first = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let i = 0; i < days; i++) {
    const start = new Date(first + i * DAY_MS);
    const end = new Date(first + (i + 1) * DAY_MS);
    const name = partitionName(table, utcDay(start));
    await sql`create table if not exists ${sql.id(name)} partition of ${sql.id(table)}
      for values from (${sql.lit(start.toISOString())}) to (${sql.lit(end.toISOString())})`.execute(db);
    names.push(name);
  }
  return names;
}

/** 删除 before 所在 UTC 日之前的分区 */
export async function dropPartitionsBefore(
  db: Kysely<DB>,
  table: PartitionedTable,
  before: Date,
): Promise<string[]> {
  const { rows } = await sql<{ relname: string }>`
    select c.relname from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = ${table}`.execute(db);
  const cutoff = utcDay(before).replaceAll('-', '');
  const pattern = new RegExp(`^${table}_p(\\d{8})$`);
  const dropped: string[] = [];
  for (const { relname } of rows) {
    const m = pattern.exec(relname);
    if (m && m[1]! < cutoff) {
      await sql`drop table ${sql.id(relname)}`.execute(db);
      dropped.push(relname);
    }
  }
  return dropped;
}
