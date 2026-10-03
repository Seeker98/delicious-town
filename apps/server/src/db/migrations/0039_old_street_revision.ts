import { sql, type Kysely } from 'kysely';

/** 老街道修订（问题记录 284）删掉的菜谱：[id, 原街道] */
export const DELETED: ReadonlyArray<readonly [number, number]> = [
  [51, 6],
  [53, 6],
  [57, 7],
  [80, 7],
  [111, 3],
  [247, 5],
  [291, 8],
  [338, 9],
  [388, 10],
  [394, 10],
  [430, 10],
  [440, 0],
  [446, 0],
  [447, 0],
  [459, 4],
  [468, 4],
  [486, 4],
  [17204, 2],
  [17242, 2],
  [17247, 2],
  [17298, 2],
  [17307, 2],
  [17309, 4],
  [17352, 4],
  [17412, 8],
  [17559, 7],
  [17567, 7],
  [17593, 7],
  [17886, 10],
  [18197, 12],
  [18441, 5],
  [18622, 10],
];
/** 移街的菜谱：[id, 原街道, 新街道]（176 移到杂碎街在 0040） */
export const MOVED: ReadonlyArray<readonly [number, number, number]> = [
  [344, 9, 12],
  [345, 9, 12],
  [346, 9, 13],
  [350, 9, 12],
  [392, 10, 11],
  [401, 10, 11],
  [403, 10, 6],
];

interface Counts {
  learned: number;
  grade: number[];
  street: Record<string, number>;
}
const dec = (n: number | undefined) => Math.max(0, (n ?? 0) - 1);

/**
 * 按清单修正每家店的已学食谱：被删的清字节、扣计数，移街的把街道计数挪过去（计数不低于 0）；
 * 再删掉点了被删菜谱、还能接（state 1）的外卖单。配送中的单照常走完（配送完成不读菜谱）。
 * 迁移里写死清单，不依赖配置包
 */
export async function reviseCookbooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  deleted: ReadonlyArray<readonly [number, number]>,
  moved: ReadonlyArray<readonly [number, number, number]>,
): Promise<void> {
  const minId = Math.min(...deleted.map((d) => d[0]), ...moved.map((m) => m[0]));
  const { rows } = await sql<{ rest_id: number; levels: Buffer; counts: Counts }>`
    select c.rest_id, c.levels, r.cookbook_counts as counts
    from restaurant_cookbooks c join restaurant r on r.id = c.rest_id
    where length(c.levels) > ${minId}`.execute(db);
  for (const row of rows) {
    const levels = Buffer.from(row.levels);
    const c: Counts = {
      learned: row.counts.learned ?? 0,
      grade: [...(row.counts.grade ?? [])],
      street: { ...row.counts.street },
    };
    let changed = false;
    for (const [id, street] of deleted) {
      const g = id < levels.length ? levels[id]! : 0;
      if (g === 0) continue;
      c.learned = dec(c.learned);
      c.grade[g] = dec(c.grade[g]);
      c.street[String(street)] = dec(c.street[String(street)]);
      levels[id] = 0;
      changed = true;
    }
    for (const [id, from, to] of moved) {
      if (id >= levels.length || levels[id] === 0) continue;
      c.street[String(from)] = dec(c.street[String(from)]);
      c.street[String(to)] = (c.street[String(to)] ?? 0) + 1;
      changed = true;
    }
    if (!changed) continue;
    await sql`update restaurant_cookbooks set levels = ${levels} where rest_id = ${row.rest_id}`.execute(db);
    await sql`update restaurant set cookbook_counts = ${JSON.stringify(c)}::jsonb where id = ${row.rest_id}`.execute(
      db,
    );
  }
  if (deleted.length > 0)
    await sql`delete from takeaway_order where state = 1 and cookbook_id = any(${deleted.map((d) => d[0])}::int[])`.execute(
      db,
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await reviseCookbooks(db, DELETED, MOVED);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {
  // 删掉的已学记录无法还原
}
