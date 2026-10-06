// 只把用到的图标裁进字体（性能第二轮 A：整套 Bootstrap Icons 两千多个、134 KB，网页只用几十个）
// 用法：pnpm -F @dt/web icons。加了新图标要重跑，否则 src/icons.test.ts 会挂
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { usedIconNames } from './icon-names.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('bootstrap-icons/package.json'));
const codes = JSON.parse(readFileSync(join(pkg, 'font/bootstrap-icons.json'), 'utf8'));

const names = usedIconNames(join(here, '../src'));
const unknown = names.filter((n) => codes[n.slice(3)] === undefined);
if (unknown.length > 0) {
  console.error(`不认识的图标：${unknown.join(', ')}`);
  process.exit(1);
}

const font = readFileSync(join(pkg, 'font/fonts/bootstrap-icons.woff2'));
const text = names.map((n) => String.fromCodePoint(codes[n.slice(3)])).join('');
const subset = await subsetFont(font, text, { targetFormat: 'woff2' });
const outDir = join(here, '../src/styles');
writeFileSync(join(outDir, 'bootstrap-icons-subset.woff2'), subset);

const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
const css = `/* 由 scripts/gen-icons.mjs 生成，别手改：Bootstrap Icons v${version} 里网页用到的 ${names.length} 个图标（MIT 许可） */

@font-face {
  font-display: block;
  font-family: "bootstrap-icons";
  src: url("./bootstrap-icons-subset.woff2") format("woff2");
}

.bi::before,
[class^="bi-"]::before,
[class*=" bi-"]::before {
  display: inline-block;
  font-family: bootstrap-icons !important;
  font-style: normal;
  font-weight: normal !important;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  vertical-align: -0.125em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

${names.map((n) => `.${n}::before { content: "\\${codes[n.slice(3)].toString(16)}"; }`).join('\n')}
`;
writeFileSync(join(outDir, 'icons.css'), css);
console.log(`${names.length} 个图标，字体 ${font.length} → ${subset.length} 字节`);
