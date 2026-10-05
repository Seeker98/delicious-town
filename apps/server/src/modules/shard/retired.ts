import type { Kysely } from 'kysely';
import { resolveShardSettings, retiredErrors, retiredOf, tuningRefs, type GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';

/**
 * 已存的区服数值覆盖里引用了下架道具、食材的（问题记录 367 终审 I3）：后台保存时会拦，
 * 但下架之前就存好的覆盖不会再查，启动时逐个区服查一遍、写警告。名单为空时不查
 */
export async function retiredInOverrides(
  db: Kysely<DB>,
  config: GameConfig,
): Promise<Array<{ shardId: number; errors: string[] }>> {
  const retired = retiredOf(config.bundle);
  if (retired.goods.size === 0 && retired.foods.size === 0) return [];
  const rows = await db.selectFrom('shard_config').select(['shard_id', 'override']).execute();
  const out: Array<{ shardId: number; errors: string[] }> = [];
  for (const r of rows) {
    let errors: string[];
    try {
      errors = retiredErrors(tuningRefs(resolveShardSettings(config, r.override ?? {}).tuning), retired);
    } catch {
      continue; // 覆盖本身已经不合法：读区服数值时会另外报错
    }
    if (errors.length > 0) out.push({ shardId: r.shard_id, errors });
  }
  return out;
}
