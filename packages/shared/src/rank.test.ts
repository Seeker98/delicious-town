import { describe, expect, it } from 'vitest';
import { RANK_BOARDS, RANK_GROUPS, RANK_KEYS } from './rank';

describe('排行榜定义', () => {
  it('47 个榜，key 不重复，大类都登记过（问题记录 517：酒吧 6 个榜拆成本周、上周）', () => {
    expect(RANK_BOARDS).toHaveLength(47);
    expect(RANK_KEYS.size).toBe(47);
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
