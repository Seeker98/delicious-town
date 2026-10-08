import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 简中文案的逗号、冒号写英文加一个空格“, ”“: ”（用户 2026-10-08 定，问题记录 534 和活跃拆页那次）。
 * 防回退：只查字符串和模板字符串，注释不管；繁中由简中生成，跟着走
 */
describe('简中文案用英文逗号、冒号加空格', () => {
  it('locales/zh-CN 里的字符串没有“，”“：”，英文逗号、冒号后面不直接跟汉字', () => {
    const dir = join(__dirname, 'locales', 'zh-CN');
    const bad: string[] = [];
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)
        ) {
          const text = node.getText(src);
          if (/[，：]|[,:](?=[一-鿿])/.test(text)) {
            const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
            bad.push(`${name}:${line + 1} ${text.slice(0, 40)}`);
          }
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
    expect(bad).toEqual([]);
  });
});
