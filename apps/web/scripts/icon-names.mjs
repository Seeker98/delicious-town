// 网页用到的 Bootstrap Icons 图标名（性能第二轮 A）：gen-icons.mjs 按它裁字体，测试按它核对子集
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 代码里写全的 bi-xxx（图标名都写全，没有拼出来的；拼名字的话这里扫不到，测试也查不出来） */
const ICON = /\bbi-[a-z0-9]+(?:-[a-z0-9]+)*/g;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(vue|ts)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

/** src 下（不含测试）用到的图标名，排好序 */
export function usedIconNames(srcDir) {
  const names = new Set();
  for (const p of walk(srcDir)) for (const m of readFileSync(p, 'utf8').matchAll(ICON)) names.add(m[0]);
  return [...names].sort();
}
