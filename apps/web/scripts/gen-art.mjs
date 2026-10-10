// 图形雪碧图（界面改版 P1，设计 §3.4）：src/art/{ui,content}/*.svg → src/art/generated/{ui,content}.svg + names.ts
// 用法：pnpm -F @dt/web art
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../src/art');
const OUT = join(ART, 'generated');
mkdirSync(OUT, { recursive: true });

function build(family) {
  const dir = join(ART, family);
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.svg'))
    .map((n) => n.slice(0, -4))
    .sort();
  const symbols = names.map((name) => {
    const src = readFileSync(join(dir, `${name}.svg`), 'utf8').trim();
    const m = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(src);
    if (!m) throw new Error(`${family}/${name}.svg: 不是单个 <svg> 根元素`);
    const viewBox = /viewBox="([^"]+)"/.exec(m[1])?.[1];
    if (viewBox !== '0 0 48 48') throw new Error(`${family}/${name}.svg: viewBox 必须是 0 0 48 48`);
    return `<symbol id="${name}" viewBox="${viewBox}">${m[2].trim()}</symbol>`;
  });
  writeFileSync(
    join(OUT, `${family}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`,
  );
  return names;
}

const ui = build('ui');
const content = build('content');
const list = (a) => a.map((n) => `  '${n}',`).join('\n');
const namesFile = join(OUT, 'names.ts');
// 按仓库的 prettier 规则排版（名字少时数组会写成一行），免得 format:check 报错
const namesSrc = await prettier.format(
  [
    '// 由 pnpm -F @dt/web art 生成，不要手改',
    `export const UI_ART = [\n${list(ui)}\n] as const;`,
    `export const CONTENT_ART = [\n${list(content)}\n] as const;`,
    'export type UiArtName = (typeof UI_ART)[number];',
    'export type ContentArtName = (typeof CONTENT_ART)[number];',
    'export type ArtName = UiArtName | ContentArtName;',
    '',
  ].join('\n'),
  { ...(await prettier.resolveConfig(namesFile)), filepath: namesFile },
);
writeFileSync(namesFile, namesSrc);
console.log(`ui ${ui.length}, content ${content.length}`);
