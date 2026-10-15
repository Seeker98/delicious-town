import { sql, type Kysely } from 'kysely';

/**
 * 公允价阶梯（用户 2026-10-15）：交易所参考价的锚从菜场价阶梯换成公允价阶梯，2~5 级的锚整体上移。
 * 参考价保存后一天天顺延（前一天成交不到 refMinTrades 笔就沿用前一天的），不清的话换锚只影响从没有参考价的食材。
 * 用户定 2~5 级全部清掉（含历史，后台可疑成交对照的旧参考价一并没了）：下次用到时前一天成交够数的按成交均价，
 * 不够的按新的公允价重算。食材编号的千位就是等级（重新编号 PR 1）；万能食材 9002~9005 按它顶替的 2~5 级。
 * down 什么也不做：删掉的参考价回不来，下次用到时照常按当时的数值重算
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await clearFairRefs(db);
}

export async function down(): Promise<void> {}

/** 删掉 2~5 级食材的参考价；shardIds 只给测试用，限定区服 */
export async function clearFairRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  shardIds?: number[],
): Promise<void> {
  if (shardIds?.length === 0) return;
  await sql`
    delete from exchange_ref
    where (foods_id between 2000 and 5999 or foods_id between 9002 and 9005)
    ${shardIds ? sql`and shard_id in (${sql.join(shardIds)})` : sql``}`.execute(db);
}
