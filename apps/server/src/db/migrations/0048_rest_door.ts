import { sql, type Kysely } from 'kysely';

/** 老店现在用着的门记成已拥有（默认门 0 不记，人人都有）；重复执行不重复插入 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ownCurrentDoors(db: Kysely<any>): Promise<void> {
  await sql`
    insert into rest_door (rest_id, door_id)
    select id, door from restaurant where door <> 0
    on conflict do nothing`.execute(db);
}

/** 买过的门永久拥有（问题记录 350）：第一次换上时付钱，之后换回来免费 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table rest_door (
      rest_id integer not null references restaurant(id) on delete cascade,
      door_id smallint not null,
      acquired_at timestamptz not null default now(),
      primary key (rest_id, door_id)
    )`.execute(db);
  await ownCurrentDoors(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table rest_door`.execute(db);
}
