import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { SPONSOR_HATS } from './ids';
import { defaultDataDir, readSourceDir } from './source';
import { rewriteStatDesc, scaleToTotal, statDescIssues } from './stressTable';
import { gid } from './testItems';

const zero = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const source = () => readSourceDir(defaultDataDir());

describe('数值表（问题记录 120）', () => {
  it('按比例缩放到总和，最大余数法，总和正好相等（Review Focus 2）', () => {
    expect(scaleToTotal({ ...zero, cook: 1, fire: 8 }, 4, 'fire')).toEqual({ ...zero, fire: 4 });
    expect(scaleToTotal({ ...zero, cook: 1, fire: 8 }, 28, 'fire')).toEqual({ ...zero, cook: 3, fire: 25 });
    expect(scaleToTotal({ ...zero, creatives: 22 }, 25, 'creatives')).toEqual({ ...zero, creatives: 25 });
    expect(scaleToTotal(zero, 6, 'cook')).toEqual({ ...zero, cook: 6 });
  });

  it('改写说明里的数字', () => {
    expect(rewriteStatDesc('厨艺+38。阿卡玛……', { ...zero, cook: 51 }, 51)).toBe('厨艺+51。阿卡玛……');
    expect(rewriteStatDesc('随机增加35点属性。巴贝雷特……', zero, 31)).toBe('随机增加31点属性。巴贝雷特……');
    expect(rewriteStatDesc('感谢……。增加22点创意。', { ...zero, creatives: 25 }, 25)).toBe(
      '感谢……。增加25点创意。',
    );
    expect(rewriteStatDesc('餐厅12专属厨具，增加22点属性', { ...zero, creatives: 25 }, 25)).toBe(
      '餐厅12专属厨具，增加25点属性',
    );
  });

  it('构建：每件厨具都有表，+0 和穿戴等级按表', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const g = (id: number) => bundle!.goods.find((x) => x.id === id)!;
    expect(bundle!.goods.filter((x) => x.equip && x.equip.stressTable.length !== 11)).toEqual([]);
    // 阿卡玛之铲：固定厨艺 51，80 级
    expect(g(gid('神谕之阿卡玛的荣耀之铲')).equip).toMatchObject({
      minLevel: 80,
      total: null,
      stressTable: [51, 55, 59, 65, 71, 79, 87, 97, 107, 119, 131],
    });
    expect(g(gid('神谕之阿卡玛的荣耀之铲')).equip!.ranges.cook).toBe(51);
    expect(g(gid('神谕之阿卡玛的荣耀之铲')).desc.startsWith('厨艺+51。')).toBe(true);
    // 巴贝雷特之铲：随机总和 31，60 级
    expect(g(gid('裁决之巴贝雷特的悲鸣之铲')).equip).toMatchObject({ minLevel: 60, total: 31 });
    expect(g(gid('裁决之巴贝雷特的悲鸣之铲')).desc.startsWith('随机增加31点属性。')).toBe(true);
    // 中厨之锅：厨艺 1、火候 8 缩放到 4
    expect(g(gid('中厨之锅')).equip!.ranges).toMatchObject({ cook: 0, fire: 4 });
    // 赞助帽：玉级 25、铉级 41
    expect(g(SPONSOR_HATS.jade).equip!.ranges.creatives).toBe(25);
    expect(g(SPONSOR_HATS.xuan).equip!.ranges.creatives).toBe(41);
    const levels = [
      '灵魂之沙利叶的无情之铲',
      '堕落之茵蔯的炙热之铲',
      '裁决之巴贝雷特的悲鸣之铲',
      '沉默之度玛的静谧之镬',
      '意志之古尔图格的精华之铲',
      '神谕之阿卡玛的荣耀之铲',
      '食神之铲',
      '宋嫂之铲',
      '见习之铲',
    ].map((n) => g(gid(n)).equip!.minLevel);
    expect(levels).toEqual([40, 50, 60, 65, 70, 80, 90, 13, 0]);
  });

  it('一件厨具没有表、或被两张表覆盖时报错（Review Focus 1）', () => {
    const src = source();
    const lore = structuredClone(src['game/equip_lore']) as {
      stressTables: Array<{ goods?: number[]; suits?: number[] }>;
    };
    lore.stressTables[0]!.goods = [...(lore.stressTables[0]!.goods ?? []), gid('神谕之阿卡玛的荣耀之铲')];
    const two = buildBundle({ ...src, 'game/equip_lore': lore }).errors;
    expect(two).toContain(
      `goods ${gid('神谕之阿卡玛的荣耀之铲')} equip needs exactly one stress table (found 2)`,
    );
    const lore2 = structuredClone(src['game/equip_lore']) as { stressTables: Array<{ name: string }> };
    lore2.stressTables = lore2.stressTables.filter((t) => t.name !== '阿卡玛');
    expect(buildBundle({ ...src, 'game/equip_lore': lore2 }).errors).toContain(
      `goods ${gid('神谕之阿卡玛的荣耀之铲')} equip needs exactly one stress table (found 0)`,
    );
  });

  it('表必须 11 个数、单调不减', () => {
    const src = source();
    const lore = structuredClone(src['game/equip_lore']) as {
      stressTables: Array<{ name: string; values: number[] }>;
    };
    lore.stressTables[0]!.values = [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    expect(buildBundle({ ...src, 'game/equip_lore': lore }).errors).toContain(
      `stressTables ${lore.stressTables[0]!.name} must not decrease`,
    );
  });
});

describe('backlog 厨具小修：说明里的数字没改成功时构建报错', () => {
  const zero = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
  it('改好的说明没有问题', () => {
    const base = { ...zero, cook: 51 };
    expect(statDescIssues(rewriteStatDesc('厨艺+38。阿卡玛……', base, 51), base, 51)).toEqual([]);
    expect(statDescIssues('没有数字的说明', base, 51)).toEqual([]);
  });
  it('同一项写了两次只改掉第一处、或写了数值里没有的属性：列出对不上的片段', () => {
    const base = { ...zero, cook: 51 };
    const desc = rewriteStatDesc('厨艺+38，满级厨艺+38。', base, 51);
    expect(statDescIssues(desc, base, 51)).toEqual(['厨艺+38']);
    expect(statDescIssues('刀工+9', base, 51)).toEqual(['刀工+9']);
    expect(statDescIssues('随机增加35点属性', zero, 31)).toEqual(['增加35点属性']);
  });
  it('现有配置构建时没有这类错误', () => {
    const { errors } = buildBundle(readSourceDir(defaultDataDir()));
    expect(errors.filter((e) => e.includes('desc'))).toEqual([]);
  });
});
