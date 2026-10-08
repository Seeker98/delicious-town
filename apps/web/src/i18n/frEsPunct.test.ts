import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 法文、西文的标点空格（2026-10-08 整批统一）：
 * - 法文 ; : ! ? % 前、« 后、» 前用窄不换行空格 U+202F（和浏览器的法文百分数一样），不用普通空格、不换行空格；% 不直接贴数字
 * - 西文数和 % 之间用不换行空格 U+00A0（和浏览器的西文百分数一样）
 * 源码里写成 \u202f、\u00a0 转义。只查字符串和模板字符串，注释不管
 */
export const BAD: Record<'fr' | 'es', RegExp> = {
  fr: /[ \u00a0][;:!?%]|«[ \u00a0]|[ \u00a0]»|[0-9}]%/,
  es: /[ \u202f]%|[0-9}]%/,
};

/** 语言包里的文字：模板片段前后补上 } 和 ${，插值贴着 % 的也查得到 */
function texts(lang: 'fr' | 'es'): Array<[string, string]> {
  const dir = join(__dirname, 'locales', lang);
  const out: Array<[string, string]> = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        out.push([`${name}:${src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1}`, node.text]);
        return;
      }
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const text = (ts.isTemplateHead(node) ? '' : '}') + node.text + (ts.isTemplateTail(node) ? '' : '${');
        out.push([`${name}:${src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1}`, text]);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return out;
}

describe('法文、西文的标点空格（2026-10-08 整批统一）', () => {
  for (const lang of ['fr', 'es'] as const) {
    it(`locales/${lang} 里没有普通空格、贴着的 %${lang === 'fr' ? '，; : ! ? 和 « » 用窄不换行空格' : ''}`, () => {
      const bad = texts(lang)
        .filter(([, text]) => BAD[lang].test(text))
        .map(([at, text]) => `${at} ${text.slice(0, 50)}`);
      expect(bad).toEqual([]);
    });
  }

  it('检查本身', () => {
    for (const s of ['Note : x', 'Note\u00a0: x', 'oui !', '« a\u202f»', '+5 %', '+5%', '${x}%'])
      expect([s, BAD.fr.test(s)]).toEqual([s, true]);
    for (const s of ['Note\u202f: x', '«\u202fa\u202f»', '+5\u202f%', '10:30', 'https://x'])
      expect([s, BAD.fr.test(s)]).toEqual([s, false]);
    for (const s of ['+5 %', '+5%', '${x}%', '+5\u202f%']) expect([s, BAD.es.test(s)]).toEqual([s, true]);
    for (const s of ['+5\u00a0%', 'el ${p} de']) expect([s, BAD.es.test(s)]).toEqual([s, false]);
  });
});
