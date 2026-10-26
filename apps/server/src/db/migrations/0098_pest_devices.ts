import { sql, type Kysely } from 'kysely';

/**
 * 老鼠夹、蟑螂药改档（卫生合规前置，用户 2026-10-27）：
 * - 下架的长效老鼠夹、百分百老鼠夹 → 芝士的陷阱；特效蟑螂药 → 焦糖的诱惑。仓库里的同数量换；
 *   摆着还没到期的原地作废，换成新的那件，从迁移那一刻起重新算 24 小时
 * - 金牌老鼠夹 0.5 → 0.75、金牌蟑螂药 0.5 → 0.55：摆着的加成是摆放时的快照，按新数改（到期时间不动）
 * 设施的加成在 effect_source（device、来源编号 = 位置），改完加成缓存标脏。
 * down 什么也不做：下架的道具回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await swapPestDevices(db, new Date());
}

/** 下架的道具 → 换成的道具、它的加成（摆着的按这个写快照） */
export const PEST_SWAPS = [
  { from: [30303, 30304], to: 30306, effects: { trapRate: 0.99 }, hours: 24 },
  { from: [30403], to: 30405, effects: { roachClearRate: 0.99 }, hours: 24 },
] as const;

/** 改了效果的金牌档：摆着的按新数改快照 */
export const PEST_UPGRADES = [
  { id: 30302, effects: { trapRate: 0.75 } },
  { id: 30402, effects: { roachClearRate: 0.55 } },
] as const;

/** restIds 只给测试用（测试库是共用的，不能动别的测试的店） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function swapPestDevices(db: Kysely<any>, now: Date, restIds?: number[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const only = (col: any) => (restIds ? sql`${col} in (${sql.join(restIds)})` : sql`true`);
  for (const s of PEST_SWAPS) {
    const from = sql.join(s.from);
    await sql`
      insert into store_item (rest_id, goods_id, num)
      select rest_id, ${s.to}, sum(num) from store_item
       where goods_id in (${from}) and num > 0 and ${only(sql.ref('rest_id'))}
       group by rest_id
      on conflict (rest_id, goods_id) do update set num = store_item.num + excluded.num`.execute(db);
    await sql`delete from store_item where goods_id in (${from}) and ${only(sql.ref('rest_id'))}`.execute(db);
    const until = new Date(now.getTime() + s.hours * 3_600_000);
    const placed = await sql<Placed>`
      update restaurant_device set goods_id = ${s.to}, placed_at = ${now}, expires_at = ${until}, breed_done = 0
       where goods_id in (${from}) and expires_at > ${now} and ${only(sql.ref('rest_id'))}
      returning rest_id, slot, expires_at`.execute(db);
    await writeEffects(db, placed.rows, s.effects);
  }
  for (const u of PEST_UPGRADES) {
    const placed = await sql<Placed>`
      select rest_id, slot, expires_at from restaurant_device
       where goods_id = ${u.id} and expires_at > ${now} and ${only(sql.ref('rest_id'))}`.execute(db);
    await writeEffects(db, placed.rows, u.effects);
  }
}

type Placed = { rest_id: number; slot: number; expires_at: Date };

/** 写设施位置上的加成快照（摆放时写的那条，没有就补上），到期时间跟设施一致 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeEffects(db: Kysely<any>, rows: Placed[], effects: Record<string, number>): Promise<void> {
  for (const r of rows) {
    await sql`
      insert into effect_source (rest_id, source_type, source_id, effects, expires_at)
      values (${r.rest_id}, 'device', ${r.slot}, ${JSON.stringify(effects)}::jsonb, ${r.expires_at})
      on conflict (rest_id, source_type, source_id)
      do update set effects = excluded.effects, expires_at = excluded.expires_at`.execute(db);
    await sql`update restaurant set effect_dirty = true where id = ${r.rest_id}`.execute(db);
  }
}

export async function down(): Promise<void> {
  // 下架的道具回不来
}
