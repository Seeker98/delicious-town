import type { z } from 'zod';
import type { masterCookbook, masterFood, masterGoods, rawFood, rawGoods } from './raw';

/** 主表（重新编号 PR 1，设计 §3）：data/master 下道具、食材、菜谱的定义 */
export type MasterGoods = z.infer<typeof masterGoods>;
export type MasterFood = z.infer<typeof masterFood>;
export type MasterCookbook = z.infer<typeof masterCookbook>;
export type GoodsSrc = MasterGoods['src'];

/** 主表文件的格式：rule + data，每条一行（diff 时一条改动就是一行），结尾换行 */
export function formatMaster(rule: string, list: readonly object[]): string {
  const rows = list.map((x) => `  ${JSON.stringify(x)}`).join(',\n');
  return `{\n "rule": ${JSON.stringify(rule)},\n "data": [${rows ? `\n${rows}\n ` : ''}]\n}\n`;
}

/** 原版格式的道具（数据集、新街道勋章）转成主表条目；和构建原来的缺省值一致 */
export function goodsFromRaw(g: z.infer<typeof rawGoods>, src: GoodsSrc): MasterGoods {
  const text = g.value?.trim() ?? '';
  return {
    id: g.id,
    src,
    name: g.name,
    type: g.type,
    deviceType: g.devicetype ?? null,
    invalidHours: g.invalidhour ?? null,
    maxNum: g.maxNum ?? 9999,
    stackable: g.subflag === 1,
    level: g.level ?? 1,
    coin: g.coin ?? 0,
    diamond: g.diamond ?? 0,
    onSale: g.saleflag === 1,
    awardFlag: g.awardflag ?? null,
    desc: g.desc ?? '',
    value: text === '' ? null : (JSON.parse(text) as unknown),
  };
}

/** 原版格式的食材转成主表条目 */
export function foodFromRaw(f: z.infer<typeof rawFood>, src: MasterFood['src']): MasterFood {
  return {
    id: f.id,
    src,
    name: f.name,
    level: f.level,
    coin: f.coin,
    odds: f.odds,
    maxNum: f.maxNum ?? 999,
    type: f.type ?? null,
  };
}

/** 把某个来历的条目整块换掉：放在原来第一条的位置，别的条目顺序不变；原来没有就接在最后 */
export function replaceSrc<T extends { src: string }>(
  list: readonly T[],
  src: string,
  entries: readonly T[],
): T[] {
  const at = list.findIndex((x) => x.src === src);
  const rest = list.filter((x) => x.src !== src);
  if (at < 0) return [...rest, ...entries];
  const before = list.slice(0, at).filter((x) => x.src !== src).length;
  return [...rest.slice(0, before), ...entries, ...rest.slice(before)];
}
