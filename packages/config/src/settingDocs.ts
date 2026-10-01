import type { z } from 'zod';
import type { settingDocsFile } from './raw';

export type SettingDocs = z.infer<typeof settingDocsFile>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 区服数值的叶子路径：对象逐层展开，数组和标量是叶子（和后台数值页一致） */
export function settingLeaves(tree: unknown, prefix: string): string[] {
  if (!isObj(tree)) return [prefix];
  return Object.keys(tree).flatMap((k) => settingLeaves(tree[k], `${prefix}.${k}`));
}

/** 数值页的分组：tuning 下按第二段（tuning.market），其他按第一段（restaurant） */
export function settingGroup(path: string): string {
  const parts = path.split('.');
  return parts[0] === 'tuning' && parts.length > 2 ? `${parts[0]}.${parts[1]}` : parts[0]!;
}

/**
 * 区服数值说明（问题记录 126）：每个数值、每个分组都要有说明，写了已不存在的也报错；
 * 功能开关的说明在服务端对 IMPLEMENTED_FEATURES 检查
 */
export function checkSettingDocs(
  docs: SettingDocs,
  tuning: Record<string, unknown>,
  restaurantDefaults: Record<string, unknown>,
  errors: string[],
): void {
  const leaves = [...settingLeaves(tuning, 'tuning'), ...settingLeaves(restaurantDefaults, 'restaurant')];
  const groups = new Set(leaves.map(settingGroup));
  const leafSet = new Set(leaves);
  for (const p of leaves) if (!(p in docs.fields)) errors.push(`setting_docs missing ${p}`);
  for (const g of groups) if (!(g in docs.groups)) errors.push(`setting_docs missing ${g}`);
  for (const p of Object.keys(docs.fields)) if (!leafSet.has(p)) errors.push(`setting_docs unknown ${p}`);
  for (const g of Object.keys(docs.groups)) if (!groups.has(g)) errors.push(`setting_docs unknown ${g}`);
  for (const [p, d] of [
    ...Object.entries(docs.fields),
    ...Object.entries(docs.groups),
    ...Object.entries(docs.features),
  ])
    if (!d.trim()) errors.push(`setting_docs empty ${p}`);
}
