import type { ActivityDto, ActivityRewardDto, ActivityState } from '@dt/shared';
import { activeMessages } from '../i18n';

/** 活动文案按语言（问题记录 272） */
const m = () => activeMessages().activity;

export function timeLeft(endsAt: string, now = new Date()): string {
  const ms = new Date(endsAt).getTime() - now.getTime();
  const x = m().left;
  if (ms <= 0) return x.ended;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return x.minutes(min);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  return d > 0 ? x.days(d, h % 24) : x.hours(h);
}

export const actionName = (key: string) => m().actions[key] ?? key;

/** locked 未达成；claim 可领；page 已领；mail 已（或将）邮寄；missed 活动结束时没达成 */
export function rewardStatus(r: ActivityRewardDto, state: ActivityState) {
  if (r.claimed) return r.claimed;
  if (state === 'running') return r.reached ? 'claim' : 'locked';
  return r.reached ? 'mail' : 'missed';
}

/** 活动条上的类型名（问题记录 226）：全是签到的目标清单叫"签到" */
export function kindLabel(a: ActivityDto): string {
  if (a.kind === 'goals' && a.def.goals.every((g) => g.key === 'signin')) return m().kinds.signin!;
  return m().kinds[a.kind] ?? a.kind;
}

const exchangeOpen = (a: ActivityDto, now: Date) =>
  a.exchangeUntil !== null && new Date(a.exchangeUntil).getTime() > now.getTime();

/** 活动条上的状态：进行中写剩余时间；结束后兑换期内写兑换期 */
export function activityStatus(a: ActivityDto, now = new Date()): string {
  if (a.state === 'running') return timeLeft(a.endsAt, now);
  if (exchangeOpen(a, now)) return m().stripExchange(timeLeft(a.exchangeUntil!, now));
  return a.state === 'settling' ? m().stripSettling : m().endedShort;
}

/** 活动条的顺序：进行中 → 兑换期 → 结算中和已结束；同组保持服务端的顺序（按结束时间） */
export function orderActivities(items: ActivityDto[], now = new Date()): ActivityDto[] {
  const group = (a: ActivityDto) => (a.state === 'running' ? 0 : exchangeOpen(a, now) ? 1 : 2);
  return items
    .map((a, i) => ({ a, i }))
    .sort((x, y) => group(x.a) - group(y.a) || x.i - y.i)
    .map((x) => x.a);
}

/** 默认选中：第一个有奖可领的，没有就第一个进行中的，都没有就第一个 */
export function defaultSelection(items: ActivityDto[]): number | null {
  const pick = items.find((a) => a.claimable > 0) ?? items.find((a) => a.state === 'running') ?? items[0];
  return pick?.id ?? null;
}
