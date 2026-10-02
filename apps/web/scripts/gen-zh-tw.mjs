// 从简中翻译源码生成繁中（问题记录 272）：整份文件做 OpenCC 转换（只影响汉字，代码不变），再套用人工修订。
// 用法：pnpm -F @dt/web i18n:tw
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

const HEADER =
  '// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json\n';
const toTw = OpenCC.Converter({ from: 'cn', to: 'twp' });

/** overrides：[转换后的写法, 想要的写法] */
export function convertZhTw(source, overrides) {
  let out = toTw(source);
  for (const [from, to] of overrides) out = out.split(from).join(to);
  return HEADER + out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n');
  const overrides = JSON.parse(readFileSync(join(root, 'zh-TW-overrides.json'), 'utf8'));
  const from = join(root, 'locales/zh-CN');
  const to = join(root, 'locales/zh-TW');
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from).filter((x) => x.endsWith('.ts')))
    writeFileSync(join(to, f), convertZhTw(readFileSync(join(from, f), 'utf8'), overrides));
  console.log('zh-TW generated');
}
