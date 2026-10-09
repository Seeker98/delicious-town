import { sql, type Kysely } from 'kysely';

/**
 * 魔鬼辣杯的倍率换成赔付表（2026-10-09 用户定）：tuning.bar.devil 去掉了 rate，加了 payouts、dailyMax。
 * - 区服覆盖和历史版本里的 rate 删掉：运行时会被静默丢掉，后台再保存或回滚时又会报“未知配置”（同 0053）；
 * - 生效中的区服改了押注档位或杯数、却没有赔付表时，和默认的赔付表对不上，区服设置通不过校验、整个区服打不开：
 *   这里直接报错停下部署，先在后台给那个区服补上 payouts 再部署（终审）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const bad = await sql<{ shard_id: number }>`
    select shard_id from shard_config
    where override #> '{tuning,bar,devil}' ?| array['stakes', 'cups']
      and not (override #> '{tuning,bar,devil}' ? 'payouts')`.execute(db);
  if (bad.rows.length > 0)
    throw new Error(
      `shard ${bad.rows.map((r) => r.shard_id).join(', ')}: tuning.bar.devil overrides stakes/cups without payouts; add payouts in the admin first`,
    );
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override #- '{tuning,bar,devil,rate}'
      where override #> '{tuning,bar,devil}' ? 'rate'`.execute(db);
  }
}

/** 删掉的旧值找不回来，回退时不做事 */
export async function down(): Promise<void> {}
