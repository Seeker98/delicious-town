import { sql, type Kysely } from 'kysely';

/**
 * 货币回收 240-1：食材按等级拉开价差上线时，清掉“这个区服从来没有玩家成交过的食材”的参考价。
 * 这些参考价都是按旧的系统定价一天天顺延下来的，不清的话系统做市会一直按旧价卖，比菜场便宜；
 * 清掉后下次用到时按新的价格倍数重算。有玩家成交过的食材保留（参考价反映真实成交，后台可疑成交也要对照）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    delete from exchange_ref r
    where not exists (
      select 1 from exchange_trade t
      where t.shard_id = r.shard_id and t.foods_id = r.foods_id and not t.system
    )`.execute(db);
}

/** 删掉的参考价没法恢复；回退时什么都不做，下次用到时照常按当时的数值重算 */
export async function down(): Promise<void> {}
