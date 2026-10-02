import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

/** 女性角色（问题记录 230、236）：描述里提到她们时不能用"他" */
const WOMEN = ['宋嫂', '沙利叶', '茵陈', '阿卡玛'];

describe('道具描述的称呼（问题记录 236）', () => {
  it('提到女性角色的描述里没有"他"', () => {
    const { bundle } = buildBundle(readSourceDir(defaultDataDir()));
    const bad = bundle!.goods
      .filter((g) => WOMEN.some((n) => g.name.includes(n) || g.desc.includes(n)) && g.desc.includes('他'))
      .map((g) => `${g.id} ${g.name}`);
    expect(bad).toEqual([]);
  });
});
