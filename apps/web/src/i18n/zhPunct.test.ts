import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 简中文案的逗号、冒号写英文加一个空格“, ”“: ”（用户 2026-10-08 定，问题记录 534 和活跃拆页那次）。
 * 防回退：只查字符串和模板字符串，注释不管；繁中由简中生成，跟着走
 */
/**
 * 中文逗号冒号；英文逗号、冒号后面直接跟汉字、左引号、插值、数字（后三种是补测试批终审补的）。
 * 千分位 1,000、时间 10:30 前面是数字，比分 ${me}:${them} 冒号前面是插值，不算
 */
const BAD = /[，：]|[,:](?=[一-鿿“])|(?<![0-9]),(?=[0-9]|\$\{)|(?<![0-9}]):(?=[0-9]|\$\{)/;

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
          if (BAD.test(text)) {
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

  it('检查本身：认得出跟着数字、插值、引号的，千分位、时间、比分不算', () => {
    for (const s of ['得,5', '时间:${t}', '有${a},${b}', '叫:“x”', '，', '：'])
      expect([s, BAD.test(s)]).toEqual([s, true]);
    for (const s of ['1,000', '10:30', '${me}:${them}', '得, 5', '时间: ${t}'])
      expect([s, BAD.test(s)]).toEqual([s, false]);
  });
});
