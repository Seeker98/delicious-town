import { sql, type Kysely, type Transaction } from 'kysely';
import { rewriteIds, TUNING_ID_PATHS, type IdKind, type IdMaps, type PathRule } from '@dt/config';
import type { DB } from '../schema';
import { COOKBOOK_SLOTS, COOKBOOKS, FOODS, GOODS, SLOTS } from './0049_renumber_map';

/**
 * 重新编号（设计 docs/superpowers/specs/2026-10-05-id-renumber-design.md §6 PR 4 第 3 步）：
 * 道具、食材、菜谱的旧编号全部换成新编号，历史记录一起改；学会记录按新存储位重排、截到 SLOTS。
 * 整个在迁移的事务里：在用的表里有查不到对照的旧编号、或自检不通过就抛错，全部回滚。
 * 不提供 down：出问题从备份恢复
 */
const pairs = (flat: readonly number[]) =>
  new Map(
    Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i]!, flat[2 * i + 1]!] as [number, number]),
  );
const MAPS: IdMaps = { goods: pairs(GOODS), foods: pairs(FOODS), cookbooks: pairs(COOKBOOKS) };
const SLOT_OF = pairs(COOKBOOK_SLOTS);
const RANGE: Record<IdKind, [number, number]> = {
  goods: [10000, 89999],
  foods: [1001, 9999],
  cookbooks: [100001, 199999],
};
const BATCH = 2000;

export interface RenumberReport {
  rows: Record<string, number>;
  orphans: Array<{ table: string; kind: IdKind; id: number; count: number }>;
  learned: number;
  ms: number;
}

/** 普通列：[表, 列, 种类, 附加条件] */
const LIVE_COLUMNS: ReadonlyArray<readonly [string, string, IdKind, string?]> = [
  ['store_item', 'goods_id', 'goods'],
  ['restaurant_device', 'goods_id', 'goods'],
  ['equip', 'goods_id', 'goods'],
  ['equip_gem', 'gem_goods_id', 'goods'],
  ['shop_special', 'goods_id', 'goods'],
  ['fund_deposit', 'medal', 'goods'],
  ['effect_source', 'source_id', 'goods', "source_type in ('honor', 'street')"],
  ['cupboard_food', 'foods_id', 'foods'],
  ['market_item', 'foods_id', 'foods'],
  ['yard_plant', 'foods_id', 'foods'],
  ['yard_basket', 'foods_id', 'foods'],
  ['hiphop_day', 'foods_id', 'foods'],
  ['hiphop_tip', 'foods_id', 'foods'],
  ['exchange_order', 'foods_id', 'foods'],
  ['exchange_trade', 'foods_id', 'foods'],
  ['exchange_ref', 'foods_id', 'foods'],
  ['exchange_wallet_food', 'foods_id', 'foods'],
  ['exchange_hold', 'foods_id', 'foods'],
  ['exchange_stock', 'foods_id', 'foods'],
  ['exchange_maker_day', 'foods_id', 'foods'],
  ['takeaway_order', 'cookbook_id', 'cookbooks'],
];
const HISTORY_COLUMNS: ReadonlyArray<readonly [string, string, IdKind, string?]> = [
  ['ledger', 'item_id', 'goods', "kind = 'goods'"],
  ['ledger', 'item_id', 'foods', "kind in ('foods', 'basket')"],
];
/** 带编号的文本：[表, 列, 前缀]（前缀后面是道具编号） */
const TEXT_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ['ledger', 'source', 'gift.'],
  ['stat_daily', 'source', 'gift.'],
  ['daily_counter', 'key', 'renownShop:'],
];
const tuningPaths = (prefix: string): PathRule[] =>
  TUNING_ID_PATHS.map(([p, k]) => [[prefix, ...p], k] as const);
/**
 * JSON 列。key 是唯一键的 SQL 表达式（分批按它排序、写回按它对上），keyType 是它的类型
 * （bigint 列读出来是字符串，写回时显式转换；bar_round 是联合主键，拼成文本）
 */
interface JsonColumn {
  table: string;
  key: string;
  keyType: 'int' | 'bigint' | 'text';
  column: string;
  live: boolean;
  typeColumn?: string;
  opts?: (type: string | null) => Parameters<typeof rewriteIds>[2];
}
const JSON_COLUMNS: readonly JsonColumn[] = [
  { table: 'mail', key: 'id', keyType: 'bigint', column: 'items', live: true },
  { table: 'redeem_code', key: 'id', keyType: 'bigint', column: 'items', live: true },
  { table: 'activity', key: 'id', keyType: 'bigint', column: 'def', live: true },
  { table: 'admin_grant', key: 'id', keyType: 'bigint', column: 'items', live: true },
  { table: 'kuji_pool', key: 'id', keyType: 'bigint', column: 'tiers', live: true },
  { table: 'kuji_pool', key: 'id', keyType: 'bigint', column: 'last', live: true },
  { table: 'restaurant_tables', key: 'rest_id', keyType: 'int', column: 'tables', live: true },
  { table: 'bar_round', key: "rest_id::text || ':' || game", keyType: 'text', column: 'state', live: true },
  {
    table: 'shard_config',
    key: 'shard_id',
    keyType: 'int',
    column: 'override',
    live: true,
    opts: () => ({ paths: tuningPaths('tuning') }),
  },
  {
    table: 'shard_config_history',
    key: 'id',
    keyType: 'bigint',
    column: 'override',
    live: false,
    opts: () => ({ paths: tuningPaths('tuning') }),
  },
  {
    table: 'rest_log',
    key: 'id',
    keyType: 'bigint',
    column: 'params',
    live: false,
    typeColumn: 'type',
    // 交换食材（core/pair 的 exchange 日志）：give / take 是食材
    opts: (type) => (type === 'exchange' ? { keys: { give: 'foods', take: 'foods' } } : {}),
  },
  { table: 'news', key: 'id', keyType: 'bigint', column: 'params', live: false },
  { table: 'audit_log', key: 'id', keyType: 'bigint', column: 'detail', live: false },
  { table: 'income_round', key: 'id', keyType: 'bigint', column: 'drops', live: false },
  { table: 'predict_event', key: 'id', keyType: 'bigint', column: 'params', live: false },
  { table: 'predict_event', key: 'id', keyType: 'bigint', column: 'result_params', live: false },
];

export async function renumber(
  db: Kysely<DB> | Transaction<DB>,
  log: (line: string) => void = console.log,
): Promise<RenumberReport> {
  const t0 = Date.now();
  const report: RenumberReport = { rows: {}, orphans: [], learned: 0, ms: 0 };
  const liveOrphans: string[] = [];
  // 临时对照表（事务结束即删）
  for (const kind of ['goods', 'foods', 'cookbooks'] as const) {
    await sql`create temp table ${sql.id(`rn_${kind}`)} (old int primary key, new int not null) on commit drop`.execute(
      db,
    );
    const list = [...MAPS[kind]];
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000);
      await sql`insert into ${sql.id(`rn_${kind}`)} (old, new) values ${sql.join(chunk.map(([o, n]) => sql`(${o}, ${n})`))}`.execute(
        db,
      );
    }
  }
  const where = (cond?: string) => (cond ? sql` and ${sql.raw(cond)}` : sql``);
  const inNew = (kind: IdKind, col: string) =>
    sql`${sql.raw(col)} between ${RANGE[kind][0]} and ${RANGE[kind][1]}`;

  // 1. 普通列：先找查不到对照的旧编号
  for (const [cols, live] of [
    [LIVE_COLUMNS, true],
    [HISTORY_COLUMNS, false],
  ] as const) {
    for (const [table, col, kind, cond] of cols) {
      const bad = await sql<{ id: number; n: string }>`
        select ${sql.raw(col)} as id, count(*) as n from ${sql.raw(table)}
        where ${sql.raw(col)} is not null and ${sql.raw(col)} > 0${where(cond)}
          and not ${inNew(kind, col)} and ${sql.raw(col)} not in (select old from ${sql.id(`rn_${kind}`)})
        group by 1`.execute(db);
      for (const b of bad.rows) {
        report.orphans.push({ table: `${table}.${col}`, kind, id: b.id, count: Number(b.n) });
        if (live) liveOrphans.push(`${table}.${col} ${kind} ${b.id} ×${b.n}`);
      }
    }
  }
  if (liveOrphans.length)
    throw new Error(`renumber: 在用的表里有查不到对照的旧编号：${liveOrphans.join('; ')}`);
  // 持有总数（设计：自检时和迁移前相同）
  const totals = async () =>
    (
      await sql<{ t: string }>`select concat_ws(' ',
        (select count(*) || '/' || coalesce(sum(num), 0) from store_item),
        (select count(*) || '/' || coalesce(sum(num + fridge_num), 0) from cupboard_food),
        (select count(*) || '/' || coalesce(sum(num), 0) from yard_basket),
        (select count(*) || '/' || coalesce(sum(num), 0) from exchange_wallet_food),
        (select count(*) from equip), (select count(*) from restaurant_device)) as t`.execute(db)
    ).rows[0]!.t;
  const totalsBefore = await totals();
  // 2. 普通列：改
  for (const [table, col, kind, cond] of [...LIVE_COLUMNS, ...HISTORY_COLUMNS]) {
    // 附加条件里的列（kind、source_type）只在 t 上有，不用加前缀
    const r = await sql`update ${sql.raw(table)} t set ${sql.raw(col)} = m.new from ${sql.id(`rn_${kind}`)} m
      where t.${sql.raw(col)} = m.old${where(cond)}`.execute(db);
    report.rows[`${table}.${col}${cond ? ` (${cond})` : ''}`] = Number(r.numAffectedRows ?? 0);
  }
  const mg = await sql`update market_guess set foods_ids = (
      select array_agg(coalesce(m.new, u.x) order by u.ord) from unnest(foods_ids) with ordinality u(x, ord)
      left join rn_foods m on m.old = u.x)
    where foods_ids && (select array_agg(old) from rn_foods)`.execute(db);
  report.rows['market_guess.foods_ids'] = Number(mg.numAffectedRows ?? 0);
  // 3. 文本：前缀 + 道具编号
  for (const [table, col, prefix] of TEXT_COLUMNS) {
    const r = await sql`update ${sql.raw(table)} t set ${sql.raw(col)} = ${prefix} || m.new
      from rn_goods m where t.${sql.raw(col)} = ${prefix} || m.old`.execute(db);
    report.rows[`${table}.${col} ${prefix}`] = Number(r.numAffectedRows ?? 0);
  }
  // 4. JSON 列：分批读、改、写回
  for (const c of JSON_COLUMNS) {
    let changed = 0;
    let last: unknown = null;
    for (;;) {
      const rows = await sql<{ k: number | string; t: string | null; v: unknown }>`
        select ${sql.raw(c.key)} as k, ${c.typeColumn ? sql.raw(c.typeColumn) : sql`null`} as t, ${sql.raw(c.column)} as v
        from ${sql.raw(c.table)}
        where ${sql.raw(c.column)} is not null${last === null ? sql`` : sql` and (${sql.raw(c.key)}) > ${String(last)}::${sql.raw(c.keyType)}`}
        order by (${sql.raw(c.key)}) limit ${BATCH}`.execute(db);
      if (rows.rows.length === 0) break;
      last = rows.rows[rows.rows.length - 1]!.k;
      const updates: Array<{ k: number | string; v: string }> = [];
      for (const row of rows.rows) {
        const r = rewriteIds(row.v, MAPS, c.opts?.(row.t) ?? {});
        for (const o of r.orphans) {
          if (c.live)
            liveOrphans.push(
              `${c.table}.${c.column} ${c.key}=${row.k} ${o.kind} ${o.id} at ${o.path.join('.')}`,
            );
          const ex = report.orphans.find(
            (x) => x.table === `${c.table}.${c.column}` && x.kind === o.kind && x.id === o.id,
          );
          if (ex) ex.count++;
          else report.orphans.push({ table: `${c.table}.${c.column}`, kind: o.kind, id: o.id, count: 1 });
        }
        if (r.edits.size > 0) updates.push({ k: row.k, v: JSON.stringify(r.value) });
      }
      for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        await sql`update ${sql.raw(c.table)} t set ${sql.raw(c.column)} = v.v::jsonb
          from (values ${sql.join(chunk.map((u) => sql`(${String(u.k)}, ${u.v})`))}) v(k, v)
          where (${sql.raw(c.key.replace(/\b(rest_id|game|id|shard_id)\b/g, 't.$1'))}) = v.k::${sql.raw(c.keyType)}`.execute(
          db,
        );
      }
      changed += updates.length;
    }
    report.rows[`${c.table}.${c.column}`] = changed;
  }
  if (liveOrphans.length)
    throw new Error(`renumber: 在用的表里有查不到对照的旧编号：${liveOrphans.join('; ')}`);
  // 5. 学会记录：旧编号位置上的字节搬到新存储位，长度截到 SLOTS
  let before = 0;
  let after = 0;
  let dropped = 0;
  let lastRest = 0;
  for (;;) {
    const rows = await db
      .selectFrom('restaurant_cookbooks')
      .select(['rest_id', 'levels'])
      .where('rest_id', '>', lastRest)
      .orderBy('rest_id')
      .limit(BATCH)
      .execute();
    if (rows.length === 0) break;
    lastRest = rows[rows.length - 1]!.rest_id;
    for (const r of rows) {
      const next = Buffer.alloc(SLOTS);
      for (let i = 0; i < r.levels.length; i++) {
        const b = r.levels[i]!;
        if (b === 0) continue;
        const s = SLOT_OF.get(i);
        if (s === undefined) dropped++;
        else {
          next[s] = b;
          before++;
        }
      }
      after += next.filter((b) => b > 0).length;
      await db
        .updateTable('restaurant_cookbooks')
        .set({ levels: next })
        .where('rest_id', '=', r.rest_id)
        .execute();
    }
  }
  if (before !== after) throw new Error(`renumber: 学会的菜 ${before} → ${after}`);
  report.learned = after;
  if (dropped > 0)
    report.orphans.push({ table: 'restaurant_cookbooks.levels', kind: 'cookbooks', id: 0, count: dropped });
  // 6. 自检：在用的普通列不再有旧号段的编号
  for (const [table, col, kind, cond] of LIVE_COLUMNS) {
    const r = await sql<{ n: string }>`select count(*) as n from ${sql.raw(table)}
      where ${sql.raw(col)} is not null and ${sql.raw(col)} > 0${where(cond)} and not ${inNew(kind, col)}`.execute(
      db,
    );
    if (Number(r.rows[0]!.n) > 0)
      throw new Error(`renumber: ${table}.${col} 还有 ${r.rows[0]!.n} 行不在新号段`);
  }
  const totalsAfter = await totals();
  if (totalsAfter !== totalsBefore)
    throw new Error(`renumber: 持有总数变了 ${totalsBefore} → ${totalsAfter}`);
  report.ms = Date.now() - t0;
  for (const [k, n] of Object.entries(report.rows)) log(`renumber ${k}: ${n}`);
  for (const o of report.orphans) log(`renumber orphan ${o.table} ${o.kind} ${o.id} ×${o.count}`);
  log(`renumber learned ${report.learned}, ${report.ms} ms`);
  return report;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await renumber(db as Kysely<DB>);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
