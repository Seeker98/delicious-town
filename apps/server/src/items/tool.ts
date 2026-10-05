import { z } from 'zod';
import { buildBundle, createGameConfig, type SourceData } from '@dt/config';
import { analyzeItems, type GradeRow, type ItemRow } from './analyze';

/**
 * 道具整理工具的逻辑（问题记录 367）：出报表、保存下架名单。读写文件由调用方给，测试不碰磁盘。
 * 分析按“不下架任何东西”的数据算，这样已下架的也能看到原来的来源和用途；下架状态取自名单
 */

export interface ToolRow extends ItemRow {
  /** 原版的获取途径（dataset/goods_sources，只有道具有） */
  original: string[];
  retiredNote: string;
}

export interface ToolReport {
  maxGrade: number;
  grades: GradeRow[];
  rows: ToolRow[];
  /** 按当前名单构建的错误（名单有问题时） */
  errors: string[];
}

const entry = z.object({ id: z.number().int(), note: z.string().optional() });
export const saveBody = z.object({ goods: z.array(entry), foods: z.array(entry) });
export type SaveBody = z.infer<typeof saveBody>;

type RetiredFile = {
  goods: Array<{ id: number; note?: string }>;
  foods: Array<{ id: number; note?: string }>;
};
const EMPTY: RetiredFile = { goods: [], foods: [] };

export function createItemsTool(io: {
  readSource: () => SourceData;
  writeRetired: (text: string) => void;
  original: ReadonlyMap<number, string[]>;
}) {
  function reportOf(src: SourceData, file: RetiredFile, errors: string[]): ToolReport {
    const base = buildBundle({ ...src, 'game/retired': EMPTY });
    if (!base.bundle) return { maxGrade: 0, grades: [], rows: [], errors: base.errors };
    const config = createGameConfig(base.bundle);
    const notes = {
      goods: new Map(file.goods.map((x) => [x.id, x.note ?? ''])),
      foods: new Map(file.foods.map((x) => [x.id, x.note ?? ''])),
    };
    const r = analyzeItems(config, {
      goods: new Set(notes.goods.keys()),
      foods: new Set(notes.foods.keys()),
    });
    return {
      maxGrade: r.maxGrade,
      grades: r.grades,
      rows: r.rows.map((x) => ({
        ...x,
        original: x.kind === 'goods' ? (io.original.get(x.id) ?? []) : [],
        retiredNote: notes[x.kind].get(x.id) ?? '',
      })),
      errors,
    };
  }

  return {
    report(): ToolReport {
      const src = io.readSource();
      const file = (src['game/retired'] as RetiredFile | undefined) ?? EMPTY;
      return reportOf(src, file, buildBundle(src).errors);
    },

    /** 先按新名单构建，能过才写文件；过不了返回错误、不写 */
    save(body: SaveBody): { errors: string[]; report: ToolReport | null } {
      const src = io.readSource();
      const sorted = (list: SaveBody['goods']) => [...list].sort((a, b) => a.id - b.id);
      const file = { goods: sorted(body.goods), foods: sorted(body.foods) };
      const next = { ...src, 'game/retired': file };
      const built = buildBundle(next);
      if (!built.bundle) return { errors: built.errors, report: null };
      // 写进文件的带名字，方便看 diff；空备注不写
      const names = {
        goods: new Map(built.bundle.goods.map((g) => [g.id, g.name])),
        foods: new Map(built.bundle.foods.map((f) => [f.id, f.name])),
      };
      const out = (kind: 'goods' | 'foods') =>
        file[kind].map((x) => ({
          id: x.id,
          name: names[kind].get(x.id),
          ...(x.note ? { note: x.note } : {}),
        }));
      io.writeRetired(`${JSON.stringify({ goods: out('goods'), foods: out('foods') }, null, 2)}
`);
      return { errors: [], report: reportOf(next, file, []) };
    },
  };
}

/**
 * 原版获取途径：dataset/goods_sources 每行是一组标记（值为 1），按图例换成名字；同一道具多行合并。
 * 表里是原版（旧）编号，按主表 legacyId 换成新编号；对不上的（已删的道具）丢掉（重新编号 PR 4）
 */
export function originalSources(
  rows: ReadonlyArray<Record<string, number>>,
  legend: Readonly<Record<string, string>>,
  toNew: (legacyId: number) => number | undefined,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const r of rows) {
    const id = toNew(r.id!);
    if (id === undefined) continue;
    const list = out.get(id) ?? [];
    for (const [k, v] of Object.entries(r)) {
      const name = legend[k];
      if (v === 1 && name && !list.includes(name)) list.push(name);
    }
    out.set(id, list);
  }
  return out;
}
