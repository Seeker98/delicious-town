import { ACTIVITY_ACTIONS, type ActivityRewardDto, type ActivityState } from '@dt/shared';

export function timeLeft(endsAt: string, now = new Date()): string {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return '已结束';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `还剩 ${min} 分钟`;
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  return d > 0 ? `还剩 ${d} 天 ${h % 24} 小时` : `还剩 ${h} 小时`;
}

export const actionName = (key: string) => ACTIVITY_ACTIONS[key] ?? key;

/** locked 未达成；claim 可领；page 已领；mail 已（或将）邮寄；missed 活动结束时没达成 */
export function rewardStatus(r: ActivityRewardDto, state: ActivityState) {
  if (r.claimed) return r.claimed;
  if (state === 'running') return r.reached ? 'claim' : 'locked';
  return r.reached ? 'mail' : 'missed';
}
