import { win32 } from 'node:path';

/**
 * 图形雪碧图不内联（界面改版 P1）：Vite 默认把小于 4KB 的资源内联成 data: 地址，
 * 但浏览器不让 <use> 引用 data: 地址里的符号，雪碧图必须单独成文件。其他资源返回 undefined，按 Vite 默认处理。
 */
export function inlineLimit(file: string): false | undefined {
  return file.split(win32.sep).join('/').includes('/art/generated/') ? false : undefined;
}
