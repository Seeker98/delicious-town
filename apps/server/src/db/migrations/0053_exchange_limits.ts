import { sql, type Kysely } from 'kysely';

/**
 * 好友换食材次数改成固定总数（问题记录 479）：tuning.friend.exchange 去掉了 base、perDayTotalMul、takenBase。
 * 区服覆盖和历史版本里还写着这几个键的话，运行时会被静默丢掉，后台再保存或回滚到那个版本时又会报“未知配置”，
 * 这里一并删掉（终审）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override
        #- '{tuning,friend,exchange,base}'
        #- '{tuning,friend,exchange,perDayTotalMul}'
        #- '{tuning,friend,exchange,takenBase}'
      where override #> '{tuning,friend,exchange}' ?| array['base', 'perDayTotalMul', 'takenBase']`.execute(
      db,
    );
  }
}

/** 删掉的旧值找不回来，回退时不做事 */
export async function down(): Promise<void> {}
