import { describe, expect, it } from 'vitest';
import { buildAchievements } from './achievements';
import { createGameConfig } from './runtime';
import { realBuild } from './testBundle';

describe('成就配置（设计稿 2026-10-19）', () => {
  const b = realBuild().bundle!;

  it('菜系线按 30 条街展开，每条三档，全部佳肴那档带菜系奖杯', () => {
    const cuisines = b.achievements.filter((l) => l.key.startsWith('cuisine.'));
    expect(cuisines).toHaveLength(b.streets.length);
    const hunan = b.achievements.find((l) => l.key === 'cuisine.1')!;
    expect(hunan.streetId).toBe(1);
    expect(hunan.tiers.map((t) => [t.id, t.metric, t.pts, t.trophy])).toEqual([
      ['cuisine.1.1', 'state:cuisine:1', 15, null],
      ['cuisine.1.2', 'state:cuisine:5', 30, null],
      ['cuisine.1.3', 'state:cuisine:7', 60, 'cuisine.1'],
    ]);
    expect(b.trophies.find((t) => t.key === 'cuisine.1')).toEqual({ key: 'cuisine.1', name: '宗师', tone: 'gold', streetId: 1 });
  });

  it('总量: PR① 的成就个数、点数、奖杯、称号（改了配置就更新这里）', () => {
    const tiers = b.achievements.flatMap((l) => l.tiers);
    expect(tiers).toHaveLength(410);
    expect(tiers.reduce((a, t) => a + t.pts, 0)).toBe(18260);
    expect(b.trophies).toHaveLength(86);
    expect(tiers.filter((t) => t.icon).length).toBe(16);
    expect(new Set(tiers.map((t) => t.id)).size).toBe(tiers.length);
  });

  it('称号都在装扮的称号表里；金融类每档不超过 20 点', () => {
    const icons = new Set(b.looks.icons.map((x) => x.key));
    for (const t of b.achievements.flatMap((l) => l.tiers)) if (t.icon) expect(icons.has(t.icon), t.icon).toBe(true);
    for (const l of b.achievements.filter((x) => x.cat === 'finance'))
      for (const t of l.tiers) expect(t.pts, l.key).toBeLessThanOrEqual(20);
  });

  it('运行时索引: 按计数键找档、状态档单独一组', () => {
    const c = createGameConfig(b);
    const roach = c.achievements.byCounter.get('roach.kill')!;
    expect(roach.map((x) => x.tier.n)).toEqual([100, 1500, 5000, 10000, 20000, 40000]);
    expect(c.achievements.byId.get('level.8')!.tier.icon).toBe('ach-legend');
    expect(c.achievements.stateTiers.every((x) => x.tier.metric.startsWith('state:'))).toBe(true);
  });

  it('校验: 不认识的状态、奖杯、称号，门槛不递增，各档名数量不对都报错', () => {
    const errors: string[] = [];
    buildAchievements(
      [
        { key: 'a', cat: 'rest', name: 'A', desc: 'a', metric: 'state:nope', tiers: [{ n: 1, pts: 5 }] },
        {
          key: 'b',
          cat: 'rest',
          name: 'B',
          desc: 'b',
          metric: 'counter:x',
          labels: ['一'],
          tiers: [
            { n: 5, pts: 5, trophy: 'nope', icon: 'nope' },
            { n: 5, pts: 10 },
          ],
        },
      ],
      [{ key: 'spare', name: 'S', tone: 'gold' }],
      { streetIds: [0], iconKeys: new Set() },
      errors,
    );
    expect(errors).toEqual([
      'achievements a: unknown state metric state:nope',
      'achievements b: labels count 1 != tiers 2',
      'achievements b: unknown icon nope',
      'achievements b: unknown trophy nope',
      'achievements b: tier 2 threshold not increasing',
      'trophies: spare not used by any achievement',
    ]);
  });
});
