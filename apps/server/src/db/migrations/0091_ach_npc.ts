import { sql, type Kysely } from 'kysely';

/**
 * 蟹老板的店不拿成就（代码审查 2026-10-19）：点赞会给蟹老板记“被赞”，原来跨过门槛就发成就、算全服首达、发首达新闻。
 * 代码里已在发成就的入口拦掉蟹老板；这里清掉它已经拿到的成就、成就点、成就称号、成就动态和首达新闻。
 * 被它占掉的首达不补（首达只在达成那一刻判）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const npc = sql`(select id from restaurant where npc)`;
  await sql`delete from news where type = 'achieve.first' and rest_id in ${npc}`.execute(db);
  await sql`delete from rest_log where type in ('achieve.got', 'achieve.milestone') and rest_id in ${npc}`.execute(
    db,
  );
  await sql`delete from rest_icon where icon_key like 'ach-%' and rest_id in ${npc}`.execute(db);
  await sql`delete from rest_achievement where rest_id in ${npc}`.execute(db);
  await sql`delete from rest_ach where rest_id in ${npc}`.execute(db);
}

export async function down(): Promise<void> {
  // 删掉的不恢复
}
