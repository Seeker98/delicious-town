import { createHash } from 'node:crypto';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { runSystemOp } from '../../core/op';
import { syncEquipEffects } from './effects';
import { convertLegacyEquips } from './instances';

const HOUR = 3_600_000;

/** 套装配置的指纹：套装数值一变（比如档位顺延），重算任务就换一个周期键再跑一次 */
function suitsFingerprint(d: GameDeps): string {
  return 'suits-' + createHash('sha256').update(JSON.stringify(d.config.suits)).digest('hex').slice(0, 12);
}

export function equipJobs(d: GameDeps): PeriodicJob[] {
  const fingerprint = suitsFingerprint(d);
  return [
    {
      // 每小时：把旧版存在仓库表里的厨具转成实例（计划裁定 2）；没有旧数据时是一次空查询
      name: 'equip-convert',
      feature: 'store',
      period: (now) => String(Math.floor(now.getTime() / HOUR)),
      run: async ({ shardId }) => ({ converted: await convertLegacyEquips(d.db, d.config, shardId) }),
    },
    {
      // 套装加成按档位存在 effect_source 里，只在换装时重建；套装配置变了以后，
      // 给穿着厨具的店都重算一遍，免得留着旧档位的加成（终审 I1）。job_run 7 天后清掉时会再跑一次，重算是幂等的
      name: 'equip-suit-resync',
      feature: 'equip',
      period: () => fingerprint,
      run: async ({ shardId, now, log }) => {
        const rests = await d.db
          .selectFrom('equip')
          .innerJoin('restaurant', 'restaurant.id', 'equip.rest_id')
          .select('equip.rest_id')
          .distinct()
          .where('restaurant.shard_id', '=', shardId)
          .where('equip.worn', '=', true)
          .orderBy('equip.rest_id')
          .execute();
        let synced = 0;
        let failed = 0;
        for (const { rest_id } of rests) {
          try {
            await runSystemOp(d, shardId, rest_id, { source: 'equip.suit_resync', now }, (op) =>
              syncEquipEffects(op),
            );
            synced++;
          } catch (err) {
            failed++;
            log.error({ err, shardId, restId: rest_id }, 'equip suit resync failed');
          }
        }
        return { synced, failed };
      },
    },
  ];
}
