import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { checkSettingDocs, settingGroup, settingLeaves } from './settingDocs';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('区服数值说明（问题记录 126）', () => {
  it('叶子：对象展开，数组算一个；分组规则', () => {
    expect(settingLeaves({ a: { b: 1, c: [1, 2] }, d: 'x' }, 'tuning')).toEqual([
      'tuning.a.b',
      'tuning.a.c',
      'tuning.d',
    ]);
    expect(settingGroup('tuning.market.dailyStock')).toBe('tuning.market');
    expect(settingGroup('restaurant.giftFoods')).toBe('restaurant');
  });

  it('真实数据：每个数值、每个分组都有说明', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const d = bundle!.settingDocs;
    expect(Object.keys(d.fields).length).toBeGreaterThan(500);
    expect(d.fields['tuning.settlement.expMultiplier']).toMatch(/经验/);
    expect(d.groups['restaurant']).toBeTruthy();
    // 终审：神殿的 refreshCoin 是试炼换对象的费用，不是"刷新订单"
    expect(d.fields['tuning.temple.refreshCoin']).toMatch(/试炼/);
  });

  it('漏写、多写、空说明都报错（Review Focus 5）', () => {
    const errors: string[] = [];
    checkSettingDocs(
      {
        features: {},
        groups: { 'tuning.a': 'A 组', 'tuning.z': '多余的组' },
        fields: { 'tuning.a.x': '', 'tuning.a.gone': '旧的' },
      },
      { a: { x: 1, y: 2 } } as never,
      {} as never,
      errors,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'setting_docs missing tuning.a.y',
        'setting_docs unknown tuning.a.gone',
        'setting_docs unknown tuning.z',
        'setting_docs empty tuning.a.x',
      ]),
    );
  });
});
