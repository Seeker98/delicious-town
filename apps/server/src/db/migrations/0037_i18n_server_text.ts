import { sql, type Kysely } from 'kysely';

/**
 * 问题记录 272（多语言第 7 批）：系统邮件存模板键和参数、自动预测题的判定依据存参数，前端按语言渲染。
 * 原来的中文列照旧写入，后台和旧数据继续用
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table mail add column tpl text, add column tpl_params jsonb`.execute(db);
  await sql`alter table predict_event add column result_params jsonb`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table predict_event drop column result_params`.execute(db);
  await sql`alter table mail drop column tpl, drop column tpl_params`.execute(db);
}
