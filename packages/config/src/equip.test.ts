import { describe, expect, it } from 'vitest';
import { buildSuits, parseEquipDef, parseGemDef } from './equip';

describe('parseEquipDef（规格书 07 §7.7）', () => {
  it('固定属性：数字原样保留', () => {
    const d = parseEquipDef({
      part: 1,
      essence: 1,
      cook: 3,
      cutting: 0,
      fire: 0,
      season: 0,
      creatives: 0,
      luck: 0,
      hole: 0,
      max_hole: 0,
      min_level: 0,
      suitid: 0,
    });
    expect(d).toEqual({
      part: 1,
      essence: 1,
      hole: 0,
      maxHole: 0,
      minLevel: 0,
      suitId: 0,
      total: null,
      ranges: { cook: 3, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 },
      stressTable: [],
    });
  });

  it('随机属性："min,max" 解析成区间，带 total', () => {
    const d = parseEquipDef({
      part: 3,
      essence: 12,
      total: 25,
      cook: '0,25',
      cutting: '0,25',
      fire: '0,25',
      season: '0,25',
      creatives: '0,25',
      luck: '0,25',
      hole: 1,
      max_hole: 3,
      min_level: 13,
      suitid: 5,
    });
    expect(typeof d).toBe('object');
    const def = d as Exclude<typeof d, string>;
    expect(def.total).toBe(25);
    expect(def.ranges.fire).toEqual([0, 25]);
    expect(def).toMatchObject({ part: 3, essence: 12, hole: 1, maxHole: 3, minLevel: 13, suitId: 5 });
  });

  it('部位不在 1~5、属性写错时返回错误说明', () => {
    expect(parseEquipDef({ part: 9, essence: 1 })).toMatch(/part/);
    expect(parseEquipDef({ part: 1, essence: 1, cook: 'abc' })).toMatch(/cook/);
    expect(parseEquipDef(null)).toMatch(/value/);
  });
});

describe('parseGemDef', () => {
  it('nextid -1 表示最高阶；两种 is_fuse 写法都接受', () => {
    expect(
      parseGemDef({
        level: 1,
        cook: 0,
        cutting: 0,
        fire: 0,
        season: 0,
        creatives: 1,
        luck: 0,
        is_fuse: 0,
        nextid: 274,
      }),
    ).toEqual({
      level: 1,
      nextId: 274,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 1, luck: 0 },
    });
    expect(parseGemDef({ level: 6, creatives: 24, isfuse: 0, nextid: -1 })).toMatchObject({
      level: 6,
      nextId: null,
    });
    expect(parseGemDef({ nextid: 3 })).toMatch(/level/);
  });
});

describe('buildSuits（规格书 20 §20.15，设计文档 裁定 2）', () => {
  it('按属性百分比放大的键改名为 xxxPct，其他键原样', () => {
    const suits = buildSuits([
      {
        suitid: 3,
        name: '宋嫂套装',
        maxnum: 4,
        tiers: [
          { neednum: 3, desc: '上座率+5%, 刀工+3%', value: { atRate: 0.05, cutting: 0.03 } },
          { neednum: 4, desc: '火候+5%', value: { fire: 0.05 } },
        ],
      },
    ]);
    expect(suits).toEqual([
      {
        id: 3,
        name: '宋嫂套装',
        maxNum: 4,
        tiers: [
          { need: 3, desc: '上座率+5%, 刀工+3%', effects: { atRate: 0.05, cuttingPct: 0.03 } },
          { need: 4, desc: '火候+5%', effects: { firePct: 0.05 } },
        ],
      },
    ]);
  });
});
