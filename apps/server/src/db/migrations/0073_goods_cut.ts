import { sql, type Kysely } from 'kysely';
import { dropRetiredGoods } from './0071_item_cuts';

/**
 * 道具减法第二批（用户 2026-10-13）：星光之钥、阿波罗、非洲复兴纪念碑、俗、边牧、星神之书、煤油灯、激动的心、
 * 捕梦网、思想者删掉，跟着去掉银币转经验、手动赶走生气的蟹老板、鉴定重抽、守护兽暴击掉玉玺、外卖失败改判成功
 * - restaurant.cte_on（银币转经验开关）删掉
 * - 区服覆盖和历史版本里的 tuning.settlement.cteRate、tuning.growth.driveKrabStrength、
 *   tuning.friend.dine.heartExpMul / heartStrengthMul、tuning.mysterious.appraiseRetryBelow / thinkerStealBonus 删掉：
 *   运行时会被静默丢掉，后台再保存或回滚到那个版本时又会报“未知配置”（同 0053、0061、0071、0072）
 * - 退役道具持有的、加成来源都清掉，加成缓存标脏
 * down 只恢复 restaurant.cte_on（填 false），删掉的设置和道具回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column cte_on`.execute(db);
  await stripGoodsCutOverrides(db);
  await dropRetiredGoods(db, RETIRED_GOODS);
}

/** 这次退役的道具：边牧、星神之书、煤油灯、激动的心、星光之钥、捕梦网、思想者、阿波罗、非洲复兴纪念碑、俗 */
export const RETIRED_GOODS = [60604, 61406, 61413, 61416, 61418, 61426, 61601, 61603, 61604, 61607];

/** 区服覆盖和历史版本里删掉这些道具专用的设置 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stripGoodsCutOverrides(db: Kysely<any>): Promise<void> {
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override #- '{tuning,settlement,cteRate}' #- '{tuning,growth,driveKrabStrength}'
        #- '{tuning,friend,dine,heartExpMul}' #- '{tuning,friend,dine,heartStrengthMul}'
        #- '{tuning,mysterious,appraiseRetryBelow}' #- '{tuning,mysterious,thinkerStealBonus}'
      where override #> '{tuning,settlement}' ? 'cteRate'
         or override #> '{tuning,growth}' ? 'driveKrabStrength'
         or override #> '{tuning,friend,dine}' ?| array['heartExpMul', 'heartStrengthMul']
         or override #> '{tuning,mysterious}' ?| array['appraiseRetryBelow', 'thinkerStealBonus']`.execute(
      db,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant add column cte_on boolean not null default false`.execute(db);
}
