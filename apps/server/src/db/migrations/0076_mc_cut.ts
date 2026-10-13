import { sql, type Kysely } from 'kysely';

/**
 * 特色菜清理（用户 2026-10-13）：删掉 27 道特色菜，配置里已经去掉，这里清掉库里引用它们的行。
 * - 10 道营养值为 0、没配食材的空菜；17 道要 6 级食材的兽道菜（兽道一道不剩）
 * - 线上核对过没有人学会、持有残卷或做过这些菜；开发库、测试号里可能有，照样清
 * - 已学（rest_mc）、残卷（mc_remnant）、试炼对象（rest_trial）、开的课（mc_lesson，学生行跟着级联删）、
 *   做过的批次（mc_cook：先把店里在售指向它的 mc_cook_id 置空，吃过的记录 mc_eat 跟着级联删）、
 *   守塔人当天抽到的菜（tower_watchman_mc：这一层当天没有菜，第二天 05:58 重新抽）
 * - 学会的特色菜数、特色菜榜都是现查 rest_mc，没有要改的计数
 * down 什么也不做：删掉的菜回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await cutMysterious(db, CUT_MC);
}

/** 营养值为 0、没配食材的 10 道 */
export const EMPTY_MC = [231, 232, 272, 273, 274, 331, 332, 333, 334, 335];
/** 要 6 级食材的兽道 17 道 */
export const BEAST_MC = [233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249];
export const CUT_MC = [...EMPTY_MC, ...BEAST_MC].sort((a, b) => a - b);

/**
 * 删掉引用这些特色菜的行。scope 只给测试用：restIds 限定店相关的表，shardIds 限定守塔人的表
 */
export async function cutMysterious(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  ids: number[],
  scope?: { restIds: number[]; shardIds: number[] },
): Promise<void> {
  const mc = sql.join(ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rest = (col: any) => (scope ? sql`${col} in (${sql.join(scope.restIds)})` : sql`true`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shard = (col: any) => (scope ? sql`${col} in (${sql.join(scope.shardIds)})` : sql`true`);
  await sql`update restaurant set mc_cook_id = null
             where mc_cook_id in (select id from mc_cook where mc_id in (${mc}))
               and ${rest(sql.ref('id'))}`.execute(db);
  await sql`delete from mc_cook where mc_id in (${mc}) and ${rest(sql.ref('rest_id'))}`.execute(db);
  await sql`delete from mc_lesson where mc_id in (${mc}) and ${rest(sql.ref('teacher_rest_id'))}`.execute(db);
  for (const t of ['rest_mc', 'mc_remnant', 'rest_trial'])
    await sql`delete from ${sql.table(t)} where mc_id in (${mc}) and ${rest(sql.ref('rest_id'))}`.execute(db);
  await sql`delete from tower_watchman_mc where mc_id in (${mc}) and ${shard(sql.ref('shard_id'))}`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
