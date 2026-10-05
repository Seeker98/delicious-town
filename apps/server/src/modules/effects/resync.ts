import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { GOODS_TYPE, type GameConfig } from '@dt/config';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import type { DB } from '../../db/schema';
import { sourceTypeForGoods } from '../store/grant';

const honorGoods = (config: GameConfig) => config.bundle.goods.filter((g) => g.type === GOODS_TYPE.honor);

/**
 * 勋章（街道勋章、荣誉勋章）的加成在获得时抄进 effect_source，加成汇总只读这份。配置里勋章数值改了以后，
 * 按当前配置重写这个区服里存着旧值的，店铺标脏下次重算（问题记录 378 审查：调了街道勋章，老玩家还拿旧值）。
 * 同一个事务里先改来源、再标脏：标脏要等正在算这家店汇总的操作提交，之后读到的一定是新值
 */
export async function resyncHonorEffects(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
): Promise<{ sources: number; restaurants: number }> {
  return db.transaction().execute(async (tx) => {
    const dirty = new Set<number>();
    let sources = 0;
    for (const g of honorGoods(config)) {
      const effects = JSON.stringify(g.effects);
      const rows = await tx
        .updateTable('effect_source')
        .set({ effects })
        .where('source_type', '=', sourceTypeForGoods(g, config))
        .where('source_id', '=', g.id)
        .where(sql<boolean>`effects is distinct from ${effects}::jsonb`)
        .where('rest_id', 'in', tx.selectFrom('restaurant').select('id').where('shard_id', '=', shardId))
        .returning('rest_id')
        .execute();
      sources += rows.length;
      for (const r of rows) dirty.add(r.rest_id);
    }
    if (dirty.size > 0)
      await tx
        .updateTable('restaurant')
        .set({ effect_dirty: true })
        .where(
          'id',
          'in',
          [...dirty].sort((a, b) => a - b),
        )
        .execute();
    return { sources, restaurants: dirty.size };
  });
}

/** 勋章数值的指纹变了才跑一次（每个区服）；job_run 清掉后会再跑一次，重写是幂等的 */
export function effectJobs(d: GameDeps): PeriodicJob[] {
  const fingerprint =
    'honors-' +
    createHash('sha256')
      .update(JSON.stringify(honorGoods(d.config).map((g) => [g.id, g.effects])))
      .digest('hex')
      .slice(0, 12);
  return [
    {
      name: 'honor-effects-resync',
      feature: 'store',
      period: () => fingerprint,
      run: async ({ shardId }) => resyncHonorEffects(d.db, d.config, shardId),
    },
  ];
}
