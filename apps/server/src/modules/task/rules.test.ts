import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { activationTotal, effectiveMainStep, stateValue, visibleSide } from './rules';

const config = testConfig();
const mains = config.bundle.tasks.filter((t) => t.main);
const implemented = new Set([
  'restaurant',
  'growth',
  'cookbook',
  'cupboard',
  'market',
  'shop',
  'store',
  'task',
]);
const available = (f: string) => implemented.has(f);

describe('任务规则（设计文档 §5.8、裁定 7）', () => {
  it('主线跳过未开放功能的步骤：第 8 步打蟑螂、第 9 步加好友都跳到第 10 步', () => {
    expect(effectiveMainStep(7, mains, available)).toBe(7);
    expect(effectiveMainStep(8, mains, available)).toBe(10);
  });
  it('主线全部完成后返回最后一步 +1', () => {
    expect(effectiveMainStep(47, mains, available)).toBe(47);
  });
  it('支线：主线进度超过 step 才出现，已完成和未开放的不显示', () => {
    const side = visibleSide(config.bundle.tasks, 12, new Set(), available);
    expect(side.map((t) => t.cond.key)).toEqual(['market.guess']);
    expect(visibleSide(config.bundle.tasks, 12, new Set([side[0]!.id]), available)).toEqual([]);
  });
  it('状态条件', () => {
    const rest = { level: 12, star_level: 1, oil_level: 2 };
    const counts = { learned: 20, grade: [0, 10, 5, 3, 2, 0, 0, 0, 0, 0, 0], street: {} };
    expect(stateValue('rest.level', rest, counts)).toBe(12);
    expect(stateValue('cookbooks.learned', rest, counts)).toBe(20);
    expect(stateValue('cookbooks.grade3', rest, counts)).toBe(5);
    expect(stateValue('friends.count', rest, counts)).toBeNull();
  });
  it('活跃分：每项按每日次数上限计', () => {
    const acts = config.bundle.activationTasks;
    const counts = new Map([
      [1, 1],
      [29, 5],
    ]);
    expect(activationTotal(acts, counts)).toBe(10 + 5 * 2);
  });
});
