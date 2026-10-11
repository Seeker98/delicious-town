import { CHANGELOG } from '../data/changelog';

/**
 * 更新记录看到哪天了（界面改版 P11）：本机记住看过的最新日期，比它新的条目带红色“新”，帮助中心的图块也带“新”。
 * 从没看过时只把最新一天算新的，不把一百多条全标成新。读写本地存储失败时当作没记录
 */
const KEY = 'dt_changelog_seen';

export function latestChangelogDate(): string {
  return CHANGELOG[0]?.date ?? '';
}

export function readChangelogSeen(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** 某天的更新算不算新的：比看过的日期新；从没看过时只有最新一天算 */
export function isNewChangelog(date: string, seen: string | null): boolean {
  return seen ? date > seen : date === latestChangelogDate();
}

export function markChangelogSeen(): void {
  try {
    localStorage.setItem(KEY, latestChangelogDate());
  } catch {
    // 无痕模式等存不了：下次照样标“新”
  }
}
