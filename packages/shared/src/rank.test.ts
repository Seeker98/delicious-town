import { describe, expect, it } from 'vitest';
import { RANK_BOARDS, RANK_GROUPS, RANK_KEYS } from './rank';

describe('排行榜定义', () => {
  it('41 个榜，key 不重复，大类都登记过', () => {
    expect(RANK_BOARDS).toHaveLength(41);
    expect(RANK_KEYS.size).toBe(41);
    for (const b of RANK_BOARDS) expect(RANK_GROUPS).toContain(b.group);
    for (const g of RANK_GROUPS) expect(RANK_BOARDS.some((b) => b.group === g)).toBe(true);
  });
  it('有奖励的四个榜写了说明', () => {
    const withReward = RANK_BOARDS.filter((b) => b.reward).map((b) => b.key);
    expect(withReward).toEqual([
      'roach.kill.lastWeek',
      'flip.flipped.lastWeek',
      'mc.yesterday',
      'hiphop.week',
    ]);
    expect(RANK_BOARDS.find((b) => b.key === 'hiphop.week')!.reward).toContain('工作证');
  });
});
