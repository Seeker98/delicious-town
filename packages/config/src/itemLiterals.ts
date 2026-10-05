/**
 * 写死的道具、食材、菜谱编号（重新编号 PR 2）：只认“编号位置”上的数字。
 * 扫描测试和一次性改写脚本共用；最后一个捕获组是编号
 */
export type ItemLiteralKind = 'goods' | 'foods' | 'cookbooks';
export const ITEM_PATTERNS: Array<{ kind: ItemLiteralKind | 'either' | 'captured'; re: RegExp }> = [
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
  // #144 审查补的写法
  // 种类写在一起：错误参数 { kind: 'goods', id }、老虎机奖项 { kind: 'foods', itemId }、升星条件 { key: 'goods', id }
  { kind: 'captured', re: /\b(?:kind|key):\s*'(goods|foods)',\s*(?:id|itemId):\s*(\d+)\b/g },
  { kind: 'goods', re: /\b(?:goodsId|goods_id)\s*===\s*(\d+)\b/g },
  { kind: 'foods', re: /\b(?:foodsId|foods_id)\s*===\s*(\d+)\b/g },
  { kind: 'cookbooks', re: /\b(?:cookbookId|cookbook_id)\s*===\s*(\d+)\b/g },
  { kind: 'foods', re: /\bsubFoods\([^,()]+,\s*(\d+)\b/g },
  { kind: 'goods', re: /\b(?:consumeGoods|subGoods)\([^,()]+,\s*(\d+)\b/g },
  // 厨具、升星测试里自己的小工具：piece(ctx, 编号)、wear(厨具, 编号)、grant(店, 编号)
  { kind: 'goods', re: /\b(?:piece|wear|grant)\([^,()]+,\s*(\d+)\b/g },
  // 重新编号第 4 步换号后才发现的写法
  // 鉴定道具、教师证、宝石：{ toolId }、{ certId }、{ gemId }
  { kind: 'goods', re: /\b(?:toolId|certId|gemId)\s*:\s*(\d+)\b/g },
  // 菜园篮子：{ kind: 'basket', id } 是食材
  { kind: 'foods', re: /\bkind:\s*'basket',\s*(?:id|itemId):\s*(\d+)\b/g },
  // SQL 条件：.where('goods_id', '=', 编号)
  { kind: 'goods', re: /\.where\('(?:goods_id|gem_goods_id)',\s*'=',\s*(\d+)\)/g },
  { kind: 'foods', re: /\.where\('foods_id',\s*'=',\s*(\d+)\)/g },
  { kind: 'cookbooks', re: /\.where\('cookbook_id',\s*'=',\s*(\d+)\)/g },
  // 服务函数的编号参数：学菜和菜谱详情、橱柜锁定和解冻、荣誉和仓库格、开放接口详情
  { kind: 'cookbooks', re: /\.(?:learn|detail)\([^,()]+,\s*(\d+)\)/g },
  { kind: 'foods', re: /\.(?:lock|thaw)\([^,()]+,\s*(\d+)\)/g },
  { kind: 'goods', re: /\b(?:hasValidHonor|removeHonor|assertStoreRoom)\([^,()]+,\s*(\d+)\)/g },
  { kind: 'goods', re: /\bgoodsDetail\([^,()]+,\s*(\d+)\)/g },
  { kind: 'foods', re: /\.food\([^,()]+,\s*(\d+)\)/g },
  { kind: 'cookbooks', re: /\.cookbook\([^,()]+,\s*(\d+)\)/g },
];

export interface ItemLiteral {
  kind: ItemLiteralKind;
  id: number;
  /** 数字在文本里的位置和长度 */
  index: number;
  length: number;
  /** 是 goods / foods 记录（{ 编号: 数量 }）里的键：改写时要写成 [表达式] */
  key?: true;
}

/** 文本里编号位置上、确实是现有编号的数字；either 按前面最近的 goods / foods 键定种类，定不了的跳过 */
export function findItemLiterals(
  text: string,
  ids: Record<ItemLiteralKind, ReadonlySet<number>>,
): ItemLiteral[] {
  const out: ItemLiteral[] = [];
  const seen = new Set<number>();
  for (const { kind, re } of ITEM_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const digits = m[m.length - 1]!; // 编号是最后一个捕获组（captured 的第 1 组是种类）
      const index = m.index! + m[0].lastIndexOf(digits);
      if (seen.has(index)) continue;
      const id = Number(digits);
      let k: ItemLiteralKind | null =
        kind === 'either' ? null : kind === 'captured' ? (m[1] === 'goods' ? 'goods' : 'foods') : kind;
      if (kind === 'either') {
        // 只认紧跟在 goods: / foods: 键后面的：goods: [{ id, num }, ...] 或 goods: { id, num }；
        // 中间只能隔着同一列表里前面的 { ... } 项。town.exchange(a, { id, num }) 这种兑换规则编号不算
        const before = text.slice(Math.max(0, m.index! - 400), m.index!);
        const keys = [...before.matchAll(/\b(goods|foods)\s*:\s*/g)];
        const last = keys.at(-1);
        const gap = last ? before.slice(last.index! + last[0].length) : null;
        if (!last || gap === null || !/^\[?\s*(\{[^{}]*\}\s*,\s*)*$/.test(gap)) continue;
        k = last[1] === 'goods' ? 'goods' : 'foods';
      }
      if (k === null) continue;
      if (!ids[k].has(id)) continue;
      seen.add(index);
      out.push({ kind: k, id, index, length: digits.length });
    }
  }
  // goods / foods / cookbooks 记录里的数字键：newRestaurant(t, { goods: { 编号: 数量 }, cookbooks: { 编号: 品级 } }) 这类
  for (const m of text.matchAll(/\b(goods|foods|cookbooks)\s*:\s*\{([^{}]*)\}/g)) {
    const kind = m[1] as ItemLiteralKind;
    const bodyAt = m.index! + m[0].indexOf('{') + 1;
    for (const k of m[2]!.matchAll(/(^|[\s,])(\d+)\s*:/g)) {
      const index = bodyAt + k.index! + k[1]!.length;
      const id = Number(k[2]);
      if (seen.has(index) || !ids[kind].has(id)) continue;
      seen.add(index);
      out.push({ kind, id, index, length: k[2]!.length, key: true });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
