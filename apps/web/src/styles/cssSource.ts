import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 样式测试读源文件用：三层按加载顺序（tokens → base → main），后台另有 admin（界面改版 P12，只在后台加载） */
export type CssName = 'tokens' | 'base' | 'main' | 'admin';
export function readCss(name: CssName): string {
  return readFileSync(join(__dirname, `${name}.css`), 'utf8');
}
export function allCss(): string {
  return (['tokens', 'base', 'main', 'admin'] as const).map(readCss).join('\n');
}
/** 去掉注释（注释里常写“#189”这类编号，不能当色值） */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
