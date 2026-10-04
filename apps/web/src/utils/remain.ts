import { activeMessages } from '../i18n';

/** 剩余时间（问题记录 181：设施、效果到期显示到分钟）：一小时以上写"X 小时 Y 分"，不足一小时写"Y 分钟"，向上取整 */
export function remainText(at: string | null, now: number = Date.now()): string {
  const r = activeMessages().util.remain;
  if (!at) return r.forever;
  const minutes = Math.max(0, Math.ceil((new Date(at).getTime() - now) / 60_000));
  if (minutes < 60) return r.minutes(minutes);
  // 一天以上写天和小时（不写分钟）：“368 小时”在手机上放不下、也不好读（质量期 ④）
  if (minutes >= 24 * 60) {
    // 小时也向上取整，和一天以内的分钟一致（backlog #116）
    const hours = Math.ceil(minutes / 60);
    const d = Math.floor(hours / 24);
    const dh = hours % 24;
    return dh === 0 ? r.days(d) : r.daysHours(d, dh);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? r.hours(h) : r.hoursMinutes(h, m);
}
