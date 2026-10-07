import { z } from 'zod';
import { buildBundle, createGameConfig, retiredOf, type ConfigBundle, type SourceData } from '@dt/config';
import { sellPrice } from '../modules/store/rules';
import { analyzeItems } from './analyze';

/**
 * 商店整理工具的逻辑（问题记录 483）：改银币价、钻石价、银币商店上下架、今日特价池和黑市池。
 * 只写 data/game/shop.json（构建时盖在道具表上），读写文件由调用方给，测试不碰磁盘。
 * “原版”指不带 shop.json 构建出来的值（道具表 + 设计表），保存时只写和原版不同的
 */

interface ShopValues {
  coin: number;
  diamond: number;
  onSale: boolean;
  special: boolean;
  black: boolean;
}

export interface ShopRow extends ShopValues {
  id: number;
  name: string;
  category: string;
  level: number;
  orig: ShopValues;
  /** 回收价（银币价 × 回收比例）；勋章、宝石、没有银币价的为 null */
  sellPrice: number | null;
  /** 这种东西能不能回收（勋章、宝石不能）；页面按改后的银币价现算回收价（终审） */
  sellable: boolean;
  retired: boolean;
  note: string;
}

export interface ShopReport {
  sellRate: number;
  rows: ShopRow[];
  errors: string[];
}

const item = z.object({
  id: z.number().int(),
  coin: z.number().int().min(0),
  diamond: z.number().int().min(0),
  onSale: z.boolean(),
  note: z.string().optional(),
});
export const shopSaveBody = z.object({
  goods: z.array(item),
  pools: z.object({
    special: z.array(z.number().int()).optional(),
    black: z.array(z.number().int()).optional(),
  }),
});
export type ShopSaveBody = z.infer<typeof shopSaveBody>;

type ShopFile = {
  goods: Array<{
    id: number;
    name?: string;
    coin?: number;
    diamond?: number;
    onSale?: boolean;
    note?: string;
  }>;
  pools?: { special?: number[]; black?: number[] };
};
const EMPTY: ShopFile = { goods: [] };

const valuesOf = (b: ConfigBundle) => {
  const special = new Set(b.shopPools.special);
  const black = new Set(b.shopPools.black);
  return new Map(
    b.goods.map((g) => [
      g.id,
      {
        coin: g.coin,
        diamond: g.diamond,
        onSale: g.onSale,
        special: special.has(g.id),
        black: black.has(g.id),
      },
    ]),
  );
};
const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && new Set([...a, ...b]).size === a.length;

export function createShopTool(io: { readSource: () => SourceData; writeShop: (text: string) => void }) {
  function reportOf(src: SourceData, file: ShopFile, errors: string[]): ShopReport {
    const cur = buildBundle(src);
    const base = buildBundle({ ...src, 'game/shop': EMPTY });
    if (!cur.bundle || !base.bundle) return { sellRate: 0, rows: [], errors: [...errors, ...cur.errors] };
    const config = createGameConfig(cur.bundle);
    const category = new Map(
      analyzeItems(config, retiredOf(cur.bundle))
        .rows.filter((r) => r.kind === 'goods')
        .map((r) => [r.id, r.category]),
    );
    const now = valuesOf(cur.bundle);
    const orig = valuesOf(base.bundle);
    const notes = new Map(file.goods.map((x) => [x.id, x.note ?? '']));
    const relevant = (v: ShopValues) => v.onSale || v.coin > 0 || v.diamond > 0 || v.special || v.black;
    const rows = cur.bundle.goods
      .filter((g) => relevant(now.get(g.id)!) || relevant(orig.get(g.id)!))
      .map((g) => ({
        id: g.id,
        name: g.name,
        category: category.get(g.id) ?? '',
        level: g.level,
        ...now.get(g.id)!,
        orig: orig.get(g.id)!,
        sellPrice: sellPrice(g, config.tuning),
        sellable: sellPrice({ ...g, coin: 1 }, config.tuning) !== null,
        retired: !!g.retired,
        note: notes.get(g.id) ?? '',
      }));
    return { sellRate: config.tuning.shop.sellRate, rows, errors };
  }

  return {
    report(): ShopReport {
      const src = io.readSource();
      const file = (src['game/shop'] as ShopFile | undefined) ?? EMPTY;
      return reportOf(src, file, buildBundle(src).errors);
    },

    /** 只写和原版不同的；先按新文件构建，能过才写，过不了返回错误、不写 */
    save(body: ShopSaveBody): { errors: string[]; report: ShopReport | null } {
      const src = io.readSource();
      const base = buildBundle({ ...src, 'game/shop': EMPTY });
      if (!base.bundle) return { errors: base.errors, report: null };
      const orig = valuesOf(base.bundle);
      const names = new Map(base.bundle.goods.map((g) => [g.id, g.name]));
      const goods: ShopFile['goods'] = [];
      for (const x of [...body.goods].sort((a, b) => a.id - b.id)) {
        const o = orig.get(x.id);
        const diff = {
          ...(o?.coin !== x.coin ? { coin: x.coin } : {}),
          ...(o?.diamond !== x.diamond ? { diamond: x.diamond } : {}),
          ...(o?.onSale !== x.onSale ? { onSale: x.onSale } : {}),
        };
        if (Object.keys(diff).length === 0 && !x.note) continue;
        goods.push({ id: x.id, name: names.get(x.id), ...diff, ...(x.note ? { note: x.note } : {}) });
      }
      const pools: NonNullable<ShopFile['pools']> = {};
      for (const pool of ['special', 'black'] as const) {
        const list = body.pools[pool];
        if (list && !sameSet(list, base.bundle.shopPools[pool])) pools[pool] = list;
      }
      const file: ShopFile = { goods, ...(Object.keys(pools).length > 0 ? { pools } : {}) };
      const next = { ...src, 'game/shop': file };
      const built = buildBundle(next);
      if (!built.bundle) return { errors: built.errors, report: null };
      io.writeShop(`${JSON.stringify(file, null, 2)}\n`);
      return { errors: [], report: reportOf(next, file, []) };
    },
  };
}
