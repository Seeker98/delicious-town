import type { Kysely } from 'kysely';
import { reviseCookbooks } from './0039_old_street_revision';

/** 问题记录 284：176 左宗棠鸡（海外中餐）随杂碎街上线，从湖南街移过去 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await reviseCookbooks(db, [], [[176, 1, 29]]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
