import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGELOG } from '../data/changelog';
import { isNewChangelog, latestChangelogDate, markChangelogSeen, readChangelogSeen } from './changelogSeen';

const KEY = 'dt_changelog_seen';
/** 不重复的日期，从新到旧 */
const DATES = [...new Set(CHANGELOG.map((x) => x.date))];

describe('更新记录看到哪天了（界面改版 P11）', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('最新日期取更新记录第一条', () => {
    expect(latestChangelogDate()).toBe(CHANGELOG[0]!.date);
  });

  it('从没看过：只有最新一天算新的，不把旧的都标成新', () => {
    expect(isNewChangelog(DATES[0]!, null)).toBe(true);
    expect(isNewChangelog(DATES[1]!, null)).toBe(false);
  });

  it('看过某天：比它新的算新的，那天和更早的不算', () => {
    expect(isNewChangelog('2026-10-12', '2026-10-10')).toBe(true);
    expect(isNewChangelog('2026-10-11', '2026-10-10')).toBe(true);
    expect(isNewChangelog('2026-10-10', '2026-10-10')).toBe(false);
    expect(isNewChangelog('2026-10-09', '2026-10-10')).toBe(false);
  });

  it('标记看过：存下最新日期，再读出来就是它', () => {
    expect(readChangelogSeen()).toBeNull();
    markChangelogSeen();
    expect(localStorage.getItem(KEY)).toBe(DATES[0]);
    expect(readChangelogSeen()).toBe(DATES[0]);
    expect(isNewChangelog(DATES[0]!, readChangelogSeen())).toBe(false);
  });

  it('本地存储读写出错（无痕模式等）：不报错，读到的当作没记录', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readChangelogSeen()).toBeNull();
    expect(() => markChangelogSeen()).not.toThrow();
  });
});
