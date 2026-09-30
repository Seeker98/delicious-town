/** 从 now 到 at 还剩几分钟（向上取整，最少 0）；now 用概览里的服务器时间 */
export function minutesLeft(at: string, now: string): number {
  return Math.max(0, Math.ceil((Date.parse(at) - Date.parse(now)) / 60_000));
}
