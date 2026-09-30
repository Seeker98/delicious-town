import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { convertLegacyEquips } from './instances';

const HOUR = 3_600_000;

export function equipJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 每小时：把旧版存在仓库表里的厨具转成实例（计划裁定 2）；没有旧数据时是一次空查询
      name: 'equip-convert',
      feature: 'store',
      period: (now) => String(Math.floor(now.getTime() / HOUR)),
      run: async ({ shardId }) => ({ converted: await convertLegacyEquips(d.db, d.config, shardId) }),
    },
  ];
}
