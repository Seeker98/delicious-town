import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { consoleDue, drawDue } from './draw';
import { openRound } from './open';

/**
 * 每分钟一次（许愿树设计 §3.2）：开奖、安慰奖挂在 restaurant 上，区服关了许愿树也照常收尾已有的一轮；
 * 开新一轮挂在 wishtree 上。开奖排在开新一轮前面：到点那一分钟先开旧的再开新的（顺序不对时 openRound
 * 返回 busy，下一分钟再开，不出错）
 */
export function wishTreeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'wishtree-draw',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: async ({ shardId, now, log }) => ({
        drawn: await drawDue(d, shardId, now),
        ...(await consoleDue(d, shardId, now, log)),
      }),
    },
    {
      name: 'wishtree-open',
      feature: 'wishtree',
      period: (now) => now.toISOString().slice(0, 16),
      run: async ({ shardId, now }) => ({ result: await openRound(d, shardId, now) }),
    },
  ];
}
