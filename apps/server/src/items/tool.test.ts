import { describe, expect, it } from 'vitest';
import { GOODS, defaultDataDir, readSourceDir } from '@dt/config';
import { createItemsTool, originalSources } from './tool';

const src = readSourceDir(defaultDataDir());

function tool(retired: unknown = { goods: [], foods: [] }) {
  const written: string[] = [];
  const t = createItemsTool({
    readSource: () => ({ ...src, 'game/retired': written.length ? JSON.parse(written.at(-1)!) : retired }),
    writeRetired: (text) => written.push(text),
    original: new Map([[1, ['商店', '任务']]]),
  });
  return { t, written };
}

describe('道具整理工具（问题记录 367）', () => {
  it('报表：每行带原版来源、下架状态和备注；没有构建错误', () => {
    const { t } = tool({ goods: [{ id: 116, name: 'XXX', note: '原版占位' }], foods: [] });
    const r = t.report();
    expect(r.errors).toEqual([]);
    const g1 = r.rows.find((x) => x.kind === 'goods' && x.id === 1)!;
    expect(g1.original).toEqual(['商店', '任务']);
    const g116 = r.rows.find((x) => x.kind === 'goods' && x.id === 116)!;
    expect(g116).toMatchObject({ retired: true, retiredNote: '原版占位' });
    expect(r.grades).toHaveLength(10);
  });

  it('保存：先按新名单构建，能过才写文件；写进去的带名字，格式稳定', () => {
    const { t, written } = tool();
    const res = t.save({ goods: [{ id: 116, note: '原版占位' }], foods: [] });
    expect(res.errors).toEqual([]);
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]!)).toEqual({
      goods: [{ id: 116, name: 'XXX', note: '原版占位' }],
      foods: [],
    });
    expect(written[0]!.endsWith('\n')).toBe(true);
    expect(res.report!.rows.find((x) => x.kind === 'goods' && x.id === 116)!.retired).toBe(true);
  });

  it('保存：还被引用的不写文件，返回构建错误', () => {
    const { t, written } = tool();
    const res = t.save({ goods: [{ id: GOODS.starCert }], foods: [] });
    expect(written).toEqual([]);
    expect(res.errors.some((e) => e.startsWith(`retired goods ${GOODS.starCert} is still used by`))).toBe(
      true,
    );
    expect(res.report).toBeNull();
  });

  it('保存：名单按编号排序，空备注不写', () => {
    const { t, written } = tool();
    t.save({ goods: [{ id: 116, note: '' }, { id: 83 }], foods: [] });
    expect(JSON.parse(written[0]!).goods).toEqual([
      { id: 83, name: '测试勋章' },
      { id: 116, name: 'XXX' },
    ]);
  });

  it('原版来源：按图例把标记换成名字，同一道具的多行合并', () => {
    const m = originalSources(
      [
        { id: 1, flag: 1, type: 1, coin: 1, t: 1 },
        { id: 1, flag: 1, type: 2, t: 1, sl: 1 },
      ],
      { coin: '商店', t: '任务', sl: '餐厅升星' },
    );
    expect(m.get(1)).toEqual(['商店', '任务', '餐厅升星']);
  });
});
