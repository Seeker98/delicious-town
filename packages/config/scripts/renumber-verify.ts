/**
 * 已于重新编号 PR 4 执行；主表已是新编号，重跑会报错或跳过，留作记录。
 * 重新编号 第 4 步（一次性）：比对换号前后的配置包。
 *   pnpm -F @dt/config exec tsx scripts/renumber-verify.ts <换号前的配置包 JSON>
 * 换号前的包要用换号前的代码构建（常量也换了号，新代码构建不了旧数据）：先 git stash 掉换号改动、构建写出 JSON，再恢复
 * 1. 两个包逐叶子比：不同的数字必须正好是某一类的“旧 → 新”；同一路径样式（下标写成 *）下有的换了有的没换、
 *    没换的又是旧编号时报错。打印每个路径样式换了多少、按哪一类换的，给人看一遍。
 * 2. itemRefs（全部引用）按对照换算后必须完全一样。
 * 3. 翻译：goods / foods / cookbooks 按新编号对上后内容一样，其余种类原样。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBundle,
  defaultDataDir,
  itemRefs,
  readSourceDir,
  type ConfigBundle,
  type IdKind,
} from '../src/index';

const oldFile = process.argv[2];
if (!oldFile) throw new Error('usage: renumber-verify.ts <old bundle json>');
const map = JSON.parse(readFileSync(join(defaultDataDir(), 'renumber', 'map.json'), 'utf8')) as Record<
  IdKind | 'cookbookSlots',
  Array<[number, number]>
>;
const M = {
  goods: new Map(map.goods),
  foods: new Map(map.foods),
  cookbooks: new Map(map.cookbooks),
  slot: new Map(map.cookbookSlots),
};
const b0 = { bundle: JSON.parse(readFileSync(oldFile, 'utf8')) as ConfigBundle, errors: [] as string[] };
const b1 = buildBundle(readSourceDir(defaultDataDir()));
if (!b0.bundle || !b1.bundle) throw new Error(`build failed:\n${[...b0.errors, ...b1.errors].join('\n')}`);

const errors: string[] = [];
const changed = new Map<string, Map<string, number>>(); // 路径样式 → 类别 → 次数
const unchanged = new Map<string, Array<{ path: string; v: number }>>();
/** 数组下标写成 *；元组（数组里的数组）保留位置，[名次, 道具] 这类不同位置是不同字段 */
const pattern = (p: Array<string | number>) =>
  p.map((x, i) => (typeof x === 'number' && typeof p[i - 1] !== 'number' ? '*' : x)).join('.');
const kindOf = (a: number, b: number) =>
  (['goods', 'foods', 'cookbooks', 'slot'] as const).filter((k) => M[k].get(a) === b);

function walk(a: unknown, b: unknown, p: Array<string | number>) {
  if (typeof a === 'number' && typeof b === 'number') {
    const pat = pattern(p);
    if (a === b) {
      const list = unchanged.get(pat) ?? [];
      list.push({ path: p.join('.'), v: a });
      unchanged.set(pat, list);
      return;
    }
    const ks = kindOf(a, b);
    if (ks.length === 0) return void errors.push(`${p.join('.')}: ${a} → ${b} 不是任何对照`);
    const m = changed.get(pat) ?? new Map<string, number>();
    m.set(ks.join('|'), (m.get(ks.join('|')) ?? 0) + 1);
    changed.set(pat, m);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return void errors.push(`${p.join('.')}: 数组长度 ${a.length} ≠ ${b.length}`);
    a.forEach((x, i) => walk(x, b[i], [...p, i]));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.join() !== kb.join())
      return void errors.push(`${p.join('.')}: 键不同 ${ka.join()} / ${kb.join()}`);
    for (const k of ka) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...p, k]);
    return;
  }
  if (a !== b) errors.push(`${p.join('.')}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
const { version: _v0, i18n: i0, ...rest0 } = b0.bundle;
const { version: _v1, i18n: i1, ...rest1 } = b1.bundle;
walk(rest0, rest1, []);

// 有换有没换的路径样式：没换的值如果是旧编号，就是漏改
for (const [pat, kinds] of changed) {
  for (const { path, v } of unchanged.get(pat) ?? []) {
    for (const k of kinds.keys())
      for (const kk of k.split('|'))
        if (M[kk as keyof typeof M].has(v)) errors.push(`${path}: ${v} 没换（同样式的换成了 ${k}）`);
  }
}

// 引用
const mapRef = (r: { kind: 'goods' | 'foods'; id: number; role: string }) =>
  `${r.kind} ${M[r.kind].get(r.id) ?? r.id} ${r.role}`;
const refs0 = itemRefs(b0.bundle).map(mapRef).sort();
const refs1 = itemRefs(b1.bundle)
  .map((r) => `${r.kind} ${r.id} ${r.role}`)
  .sort();
if (refs0.join('\n') !== refs1.join('\n')) errors.push('itemRefs 换算后不一致');

// 翻译
for (const l of Object.keys(i0) as Array<keyof typeof i0>) {
  for (const kind of Object.keys(i0[l]) as Array<keyof (typeof i0)[typeof l]>) {
    const m =
      kind === 'goods' ? M.goods : kind === 'foods' ? M.foods : kind === 'cookbooks' ? M.cookbooks : null;
    const want = Object.fromEntries(
      Object.entries(i0[l][kind]).map(([k, v]) => [m ? String(m.get(Number(k)) ?? k) : k, v]),
    );
    if (JSON.stringify(Object.entries(want).sort()) !== JSON.stringify(Object.entries(i1[l][kind]).sort()))
      errors.push(`i18n ${l}.${kind} 不一致`);
  }
}

for (const [pat, kinds] of [...changed].sort())
  console.log(`${pat}  ${[...kinds].map(([k, n]) => `${k} ×${n}`).join(', ')}`);
if (errors.length) {
  console.error(errors.slice(0, 200).join('\n'));
  console.error(`${errors.length} errors`);
  process.exit(1);
}
console.log(`ok: refs ${refs1.length}, patterns ${changed.size}`);
