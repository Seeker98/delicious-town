import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import zhCN from './locales/zh-CN';
import { describe, expect, it } from 'vitest';

/**
 * 简中文案用半角括号，外侧两边加空格（用户 2026-10-07 定：中文括号太占地方）。
 * 只查字符串和模板字符串，注释不管；繁中由简中生成，跟着走
 */
describe('简中文案不用中文括号', () => {
  it('locales/zh-CN 里的字符串没有（）', () => {
    const dir = join(__dirname, 'locales', 'zh-CN');
    const bad: string[] = [];
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateExpression(node)) &&
          /[（）]/.test(node.getText(src))
        ) {
          const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
          bad.push(`${name}:${line + 1}`);
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
    expect(bad).toEqual([]);
  });

  it('括号后面紧跟中文标点时不留空格（终审：偷学确认框写成“) 。”）', () => {
    for (const mc of [true, false])
      expect(zhCN.town.classroom.stealConfirm(3, 1, mc)).not.toMatch(/\) [，。：；！？]/);
    expect(zhCN.town.classroom.stealConfirm(3, 1, false)).toContain('(品级降光的就忘了)。确定偷学吗？');
  });
});
