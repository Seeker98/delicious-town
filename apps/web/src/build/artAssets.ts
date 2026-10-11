import { win32 } from 'node:path';

/**
 * 图形雪碧图不内联（界面改版 P1）：Vite 默认把小于 4KB 的资源内联成 data: 地址，
 * 但浏览器不让 <use> 引用 data: 地址里的符号，雪碧图必须单独成文件。其他资源返回 undefined，按 Vite 默认处理。
 */
export function inlineLimit(file: string): false | undefined {
  const p = file.split(win32.sep).join('/');
  // 头图（界面改版 P3）也单独成文件：懒加载、走浏览器缓存（设计 §3.4）
  return p.includes('/art/generated/') || p.includes('/art/scene/') ? false : undefined;
}
