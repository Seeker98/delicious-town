import { sql, type Kysely } from 'kysely';

/**
 * 天气改版 PR①（天气改版设计 §1、§2）：
 * - world_state.weather_id 从此是“自然天气”（天气链的状态）；道具盖的天气另外记：盖成什么、到几点、谁、用的什么。
 *   晴雨签摇出两支、还没选时记在 lot_*（lot_until 到了没选按第一支）
 * - town_rest.hammer_at 改名 tool_at：司天罗盘、晴雨签共用的每人冷却
 * - town_exchange_use 加 week：每周限兑的兑换项（司天罗盘）记是哪一周兑的，换周从 0 算
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table world_state
      add column cover_weather_id integer,
      add column cover_until timestamptz,
      add column cover_by integer references restaurant(id) on delete set null,
      add column cover_goods integer,
      add column lot_by integer references restaurant(id) on delete set null,
      add column lot_choices jsonb,
      add column lot_until timestamptz`.execute(db);
  await sql`alter table town_rest rename column hammer_at to tool_at`.execute(db);
  await sql`alter table town_exchange_use add column week text not null default ''`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table town_exchange_use drop column week`.execute(db);
  await sql`alter table town_rest rename column tool_at to hammer_at`.execute(db);
  await sql`
    alter table world_state
      drop column cover_weather_id,
      drop column cover_until,
      drop column cover_by,
      drop column cover_goods,
      drop column lot_by,
      drop column lot_choices,
      drop column lot_until`.execute(db);
}
