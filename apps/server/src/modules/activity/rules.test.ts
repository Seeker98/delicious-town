import { describe, expect, it } from 'vitest';
import type { GridDef, PassDef } from '@dt/shared';
import { activityState, mergeRewards, rankRows, rewardsOf, scaleRewards } from './rules';
import { gid } from '../../../test/items';

const a = (coin: number) => ({ coin });
const reached = (xs: Array<{ key: string; reached: boolean }>) =>
  xs.filter((x) => x.reached).map((x) => x.key);

describe('达成规则（设计 §4.3）', () => {
  it('目标清单：同一行为键多个目标共用计数', () => {
    const spec = {
      kind: 'goals' as const,
      def: {
        goals: [
          { key: 'signin', target: 1, award: a(1) },
          { key: 'signin', target: 3, award: a(3) },
          { key: 'market.buy', target: 2, award: a(5) },
        ],
      },
    };
    expect(reached(rewardsOf(spec, { signin: 2, 'market.buy': 2 }, false))).toEqual(['g0', 'g2']);
  });

  const grid = (size: 3 | 4): GridDef => ({
    size,
    cells: Array.from({ length: size * size }, (_, i) => ({ key: `k${i}`, target: 1, award: a(i) })),
    lineAward: a(100),
    fullAward: a(1000),
  });
  const done = (idx: number[]) => Object.fromEntries(idx.map((i) => [`k${i}`, 1]));

  it('九宫格 3×3：行、列、两条对角线；只完成部分格子不误判', () => {
    const spec = { kind: 'grid' as const, def: grid(3) };
    expect(reached(rewardsOf(spec, done([0, 1, 2]), false))).toEqual(['c0', 'c1', 'c2', 'r0']);
    expect(reached(rewardsOf(spec, done([1, 4, 7]), false))).toEqual(['c1', 'c4', 'c7', 'k1']);
    expect(reached(rewardsOf(spec, done([0, 4, 8]), false))).toEqual(['c0', 'c4', 'c8', 'd0']);
    expect(reached(rewardsOf(spec, done([2, 4, 6]), false))).toEqual(['c2', 'c4', 'c6', 'd1']);
    expect(reached(rewardsOf(spec, done([0, 1, 3, 4]), false))).toEqual(['c0', 'c1', 'c3', 'c4']);
  });

  it('九宫格 4×4：奖励键顺序是格子、行、列、对角、全部；全部完成都达成', () => {
    const spec = { kind: 'grid' as const, def: grid(4) };
    const all = rewardsOf(spec, done([...Array(16).keys()]), false);
    expect(all.map((x) => x.key)).toEqual([
      ...Array.from({ length: 16 }, (_, i) => `c${i}`),
      'r0',
      'r1',
      'r2',
      'r3',
      'k0',
      'k1',
      'k2',
      'k3',
      'd0',
      'd1',
      'full',
    ]);
    expect(all.every((x) => x.reached)).toBe(true);
    expect(all.find((x) => x.key === 'r2')!.award).toEqual(a(100));
    expect(all.find((x) => x.key === 'full')!.award).toEqual(a(1000));
    expect(reached(rewardsOf(spec, done([3, 6, 9, 12]), false))).toContain('d1');
  });

  it('战令：未解锁时进阶不达成；解锁后之前的进阶档位全部达成；空奖励不列出', () => {
    const def: PassDef = {
      rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
      levels: [
        { points: 10, free: a(1), premium: null },
        { points: 20, free: null, premium: a(2) },
        { points: 30, free: a(3), premium: a(4) },
      ],
      unlock: { diamond: 1 },
    };
    const spec = { kind: 'pass' as const, def };
    expect(rewardsOf(spec, { points: 25 }, false).map((x) => x.key)).toEqual(['f0', 'p1', 'f2', 'p2']);
    expect(reached(rewardsOf(spec, { points: 25 }, false))).toEqual(['f0']);
    expect(reached(rewardsOf(spec, { points: 25 }, true))).toEqual(['f0', 'p1']);
  });
});

describe('合并奖励（设计 §6）', () => {
  it('数值相加，道具、食材按 id 合并，帽子拼接', () => {
    expect(
      mergeRewards([
        { coin: 1, goods: [{ id: gid('大扩容卡'), num: 1 }], hats: [{ tier: 'jade', name: '甲' }] },
        {
          coin: 2,
          diamond: 3,
          goods: [
            { id: gid('大扩容卡'), num: 2 },
            { id: gid('小扩建卡'), num: 1 },
          ],
          foods: [{ id: 9, num: 4 }],
        },
        { exp: 7, hats: [{ tier: 'jade', name: '乙' }] },
      ]),
    ).toEqual({
      coin: 3,
      diamond: 3,
      exp: 7,
      goods: [
        { id: gid('大扩容卡'), num: 3 },
        { id: gid('小扩建卡'), num: 1 },
      ],
      foods: [{ id: 9, num: 4 }],
      hats: [
        { tier: 'jade', name: '甲' },
        { tier: 'jade', name: '乙' },
      ],
    });
  });
});

describe('活动状态', () => {
  const end = new Date('2026-10-08T00:00:00Z');
  it('结束前 running；结束后没补发 settling；补发完 ended', () => {
    expect(activityState(new Date(end.getTime() - 1), end, false)).toBe('running');
    expect(activityState(end, end, false)).toBe('settling');
    expect(activityState(end, end, true)).toBe('ended');
  });
});

describe('scaleRewards（148-2）', () => {
  it('数量乘次数，帽子重复次数', () => {
    expect(
      scaleRewards(
        { coin: 2, goods: [{ id: gid('大扩容卡'), num: 3 }], hats: [{ tier: 'jade', name: '甲' }] },
        2,
      ),
    ).toEqual({
      coin: 4,
      goods: [{ id: gid('大扩容卡'), num: 6 }],
      hats: [
        { tier: 'jade', name: '甲' },
        { tier: 'jade', name: '甲' },
      ],
    });
  });
});

describe('全服合力（148-3 设计 §5.2、§6）', () => {
  const coop = {
    kind: 'coop' as const,
    def: {
      rules: [{ key: 'signin', points: 1, dailyCap: 1 }],
      milestones: [
        { target: 100, minContribution: 0, award: { coin: 1 } },
        { target: 200, minContribution: 50, award: { coin: 2 } },
      ],
      ranks: [],
    },
  };
  it('里程碑要总分和个人门槛都够；不传总分按 0 算', () => {
    const reached = (c: Record<string, number>, pool?: number) =>
      rewardsOf(coop, c, false, { pool }).map((x) => x.reached);
    expect(reached({ points: 10 }, 250)).toEqual([true, false]);
    expect(reached({ points: 50 }, 250)).toEqual([true, true]);
    expect(reached({ points: 50 }, 150)).toEqual([true, false]);
    expect(reached({ points: 999 })).toEqual([false, false]);
    expect(rewardsOf(coop, {}, false).map((x) => x.key)).toEqual(['s0', 's1']);
  });
  it('rankRows：同分同名次，积分 0 不上榜', () => {
    expect(
      rankRows([
        { restId: 1, points: 5 },
        { restId: 2, points: 9 },
        { restId: 3, points: 9 },
        { restId: 4, points: 0 },
        { restId: 5, points: 1 },
      ]),
    ).toEqual([
      { restId: 2, points: 9, rank: 1 },
      { restId: 3, points: 9, rank: 1 },
      { restId: 1, points: 5, rank: 3 },
      { restId: 5, points: 1, rank: 4 },
    ]);
  });
});

describe('终审 I1：门槛为 0 的里程碑也要有贡献', () => {
  it('个人贡献为 0 时不达成，哪怕门槛是 0、总分已经够了', () => {
    const coop = {
      kind: 'coop' as const,
      def: {
        rules: [{ key: 'signin', points: 1, dailyCap: 1 }],
        milestones: [{ target: 100, minContribution: 0, award: { coin: 1 } }],
        ranks: [],
      },
    };
    expect(rewardsOf(coop, {}, false, { pool: 500 })[0]!.reached).toBe(false);
    expect(rewardsOf(coop, { points: 1 }, false, { pool: 500 })[0]!.reached).toBe(true);
  });
});
