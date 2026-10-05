/**
 * 写死的道具、食材、菜谱编号（重新编号 PR 2）：只认“编号位置”上的数字。
 * 扫描测试和一次性改写脚本共用；第 1 个捕获组是编号
 */
export type ItemLiteralKind = 'goods' | 'foods' | 'cookbooks';
export const ITEM_PATTERNS: Array<{ kind: ItemLiteralKind | 'either'; re: RegExp }> = [
  { kind: 'goods', re: /\bgoodsNum\([^,()]+,\s*[^,()]+,\s*(\d+)\)/g },
  // 发道具的几个函数编号参数位置不同：grantGoodsOp(op, 编号, 数量)、grantGoods(db, config, 店, 编号, 数量, 时间)、
  // 模拟器 grantGoods(c, r, 编号, 数量)
  { kind: 'goods', re: /\bgrantGoodsOp\([^,()]+,\s*(\d+)\b/g },
  { kind: 'goods', re: /\bgrantGoods(?:Db)?\([^,()]*db[^,()]*,\s*[^,()]+,\s*[^,()]+,\s*(\d+)\b/g },
  { kind: 'goods', re: /\bgrantGoods\(c,\s*[^,()]+,\s*(\d+)\b/g },
  { kind: 'goods', re: /\b(?:goods_id|goodsId|gem_goods_id)\s*:\s*(\d+)\b/g },
  { kind: 'goods', re: /\brequireGoods\((\d+)\)/g },
  { kind: 'goods', re: /\bgoods\.(?:get|has)\((\d+)\)/g },
  { kind: 'foods', re: /\bfoodNum\([^,()]+,\s*[^,()]+,\s*(\d+)\b/g },
  { kind: 'foods', re: /\baddFoods\([^,()]+,\s*(\d+)\b/g },
  { kind: 'foods', re: /\b(?:foods_id|foodsId)\s*:\s*(\d+)\b/g },
  { kind: 'foods', re: /\brequireFood\((\d+)\)/g },
  { kind: 'foods', re: /\bfoods\.(?:get|has)\((\d+)\)/g },
  { kind: 'cookbooks', re: /\bcookbook(?:Id|_id)\s*:\s*(\d+)\b/g },
  { kind: 'cookbooks', re: /\brequireCookbook\((\d+)\)/g },
  { kind: 'cookbooks', re: /\bcookbooks\.(?:get|has)\((\d+)\)/g },
  { kind: 'either', re: /\{\s*id:\s*(\d+),\s*num\b/g },
];

export interface ItemLiteral {
  kind: ItemLiteralKind;
  id: number;
  /** 数字在文本里的位置和长度 */
  index: number;
  length: number;
}

/** 文本里编号位置上、确实是现有编号的数字；either 按前面最近的 goods / foods 键定种类，定不了的放进 ambiguous */
export function findItemLiterals(
  text: string,
  ids: Record<ItemLiteralKind, ReadonlySet<number>>,
  ambiguous: ItemLiteral[] = [],
): ItemLiteral[] {
  const out: ItemLiteral[] = [];
  const seen = new Set<number>();
  for (const { kind, re } of ITEM_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const digits = m[1]!;
      const index = m.index! + m[0].lastIndexOf(digits);
      if (seen.has(index)) continue;
      const id = Number(digits);
      let k: ItemLiteralKind | null = kind === 'either' ? null : kind;
      if (kind === 'either') {
        const before = text.slice(Math.max(0, index - 300), index);
        const g = before.lastIndexOf('goods');
        const f = before.lastIndexOf('foods');
        k = g < 0 && f < 0 ? null : g > f ? 'goods' : 'foods';
      }
      if (k === null) {
        ambiguous.push({ kind: 'goods', id, index, length: digits.length });
        continue;
      }
      if (!ids[k].has(id)) continue;
      seen.add(index);
      out.push({ kind: k, id, index, length: digits.length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
