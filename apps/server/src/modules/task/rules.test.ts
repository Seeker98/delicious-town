import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { activationTotal, stateValue } from './rules';

const config = testConfig();
describe('任务规则（设计文档 §5.8、裁定 7）', () => {
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
