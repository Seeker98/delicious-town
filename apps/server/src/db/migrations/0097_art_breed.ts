import { sql, type Kysely } from 'kysely';

/**
 * 艺术品孕育食材（乾坤通景巨屏 2026-10-25）：这个位置上这一轮已经孕育了几份。
 * 摆放（插入或覆盖位置）时置 0，后台任务按“到点份数 − 已发份数”补发
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant_device add column breed_done smallint not null default 0`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant_device drop column breed_done`.execute(db);
}
