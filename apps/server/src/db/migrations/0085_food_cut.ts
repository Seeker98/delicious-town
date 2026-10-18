import { sql, type Kysely } from 'kysely';
import { rewriteIds, TUNING_ID_PATHS, TUNING_KEY_PATHS, type IdMaps } from '@dt/config';

/**
 * 食材减法（用户 2026-10-18）：核桃、太湖白鱼下架（retired.json；没有任何菜谱和特色菜用到）。
 * 在用的地方都换成同级的替代食材：核桃 → 五花肉，太湖白鱼 → 八角。
 * - 橱柜和冰箱：数量加到替代食材上（已经有的直接加，不丢），旧的那行删掉
 * - 菜场货架、竞猜、期货单、大宗批次：编号直接换；期货、大宗的上架名单（后台开关）里删掉
 * - 交易所：这两种本来就不能交易（不稀有），只有参考价，删掉
 * - 邮件附件、兑换码、后台发放、活动、一番赏奖池、酒吧小游戏、区服覆盖：JSON 里的编号换掉
 * 流水、新闻、结算记录等历史不动（下架的食材定义还在，名字照常显示）。
 * down 不还原：换掉的食材分不出原来是哪种
 */
export const FOOD_CUT: ReadonlyArray<readonly [number, number]> = [
  [3051, 3006], // 核桃 → 五花肉
  [4025, 4003], // 太湖白鱼 → 八角
];

const MAPS: IdMaps = { goods: new Map(), foods: new Map(FOOD_CUT), cookbooks: new Map() };
const OLD = FOOD_CUT.map(([o]) => o);

/** 区服覆盖里不带键名的编号、按编号做键的参考价、开店礼物（同 0049） */
const OVERRIDE_OPTS: Parameters<typeof rewriteIds>[2] = {
  paths: [
    ...TUNING_ID_PATHS.map(([p, k]) => [['tuning', ...p], k] as const),
    [['restaurant', 'giftFoods', '*', 'id'], 'foods'],
  ],
  keyPaths: TUNING_KEY_PATHS.map(([q, k]) => [['tuning', ...q], k] as const),
};
/** JSON 列：[表, 主键, 列]（只改在用的，历史不动） */
const JSON_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ['mail', 'id', 'items'],
  ['redeem_code', 'id', 'items'],
  ['admin_grant', 'id', 'items'],
  ['activity', 'id', 'def'],
  ['kuji_pool', 'id', 'tiers'],
  ['kuji_pool', 'id', 'last'],
  ['bar_round', "rest_id::text || ':' || game", 'state'],
  ['shard_config', 'shard_id', 'override'],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cutFoods(db: Kysely<any>, log: (line: string) => void = console.log): Promise<void> {
  const ids = sql.join(OLD);
  const n = (r: { numAffectedRows?: bigint }) => Number(r.numAffectedRows ?? 0);
  for (const [from, to] of FOOD_CUT) {
    // 橱柜和冰箱：加到替代食材上
    const moved = await sql`insert into cupboard_food (rest_id, foods_id, num, fridge_num, fridge_unread)
      select rest_id, ${to}, num, fridge_num, fridge_unread from cupboard_food where foods_id = ${from}
      on conflict (rest_id, foods_id) do update set
        num = cupboard_food.num + excluded.num,
        fridge_num = cupboard_food.fridge_num + excluded.fridge_num,
        fridge_unread = cupboard_food.fridge_unread or excluded.fridge_unread`.execute(db);
    await sql`delete from cupboard_food where foods_id = ${from}`.execute(db);
    log(`food cut ${from} -> ${to}: cupboard ${n(moved)}`);
    for (const t of ['market_item', 'futures_contract', 'bulk_lot']) {
      const r = await sql`update ${sql.table(t)} set foods_id = ${to} where foods_id = ${from}`.execute(db);
      if (n(r) > 0) log(`food cut ${from} -> ${to}: ${t} ${n(r)}`);
    }
    // 竞猜选的食材：换掉、去重
    await sql`update market_guess set foods_ids = (
        select array_agg(distinct case when x = ${from} then ${to} else x end) from unnest(foods_ids) x)
      where ${from} = any(foods_ids)`.execute(db);
  }
  for (const t of ['futures_food', 'futures_quota', 'bulk_food', 'exchange_ref', 'exchange_maker_day']) {
    await sql`delete from ${sql.table(t)} where foods_id in (${ids})`.execute(db);
  }
  // 交易所挂单、钱包、冻结、系统库存：这两种不能交易，不该有；有就停下，别悄悄丢
  for (const t of ['exchange_order', 'exchange_wallet_food', 'exchange_hold', 'exchange_stock']) {
    const r = await sql<{
      c: number;
    }>`select count(*)::int as c from ${sql.table(t)} where foods_id in (${ids})`.execute(db);
    if (r.rows[0]!.c > 0) throw new Error(`food cut: ${t} 里还有 ${r.rows[0]!.c} 行要下架的食材`);
  }
  for (const [table, key, column] of JSON_COLUMNS) {
    const rows = await sql<{
      k: string;
      v: unknown;
    }>`select (${sql.raw(key)})::text as k, ${sql.ref(column)} as v
      from ${sql.table(table)} where ${sql.ref(column)}::text ~ ${`(^|[^0-9])(${OLD.join('|')})([^0-9]|$)`}`.execute(
      db,
    );
    let changed = 0;
    for (const row of rows.rows) {
      const r = rewriteIds(row.v, MAPS, table === 'shard_config' ? OVERRIDE_OPTS : {});
      if (r.edits.size === 0) continue;
      await sql`update ${sql.table(table)} set ${sql.ref(column)} = ${JSON.stringify(r.value)}::jsonb
        where (${sql.raw(key)})::text = ${row.k}`.execute(db);
      changed++;
    }
    if (changed > 0) log(`food cut: ${table}.${column} ${changed}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await cutFoods(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
