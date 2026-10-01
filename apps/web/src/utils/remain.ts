/** 剩余时间（问题记录 181：设施、效果到期显示到分钟）：一小时以上写"X 小时 Y 分"，不足一小时写"Y 分钟"，向上取整 */
export function remainText(at: string | null, now: number = Date.now()): string {
  if (!at) return '永久';
  const minutes = Math.max(0, Math.ceil((new Date(at).getTime() - now) / 60_000));
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `剩余 ${h} 小时` : `剩余 ${h} 小时 ${m} 分`;
}
