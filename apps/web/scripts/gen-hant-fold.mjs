// 搜索框繁简都认（橱柜改版）：从配置包里的繁中食材名挑出和简体不同的字，生成繁 → 简对照表。
// 用法：pnpm -F @dt/web hant（改了食材、重新生成配置包后跑）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

const t2s = OpenCC.Converter({ from: 't', to: 'cn' });

/** 名字里每个繁体字 → 对应的简体字（一字对一字的才收；按码位排序，输出稳定） */
export function hantPairs(names) {
  const m = new Map();
  for (const name of names)
    for (const c of name) {
      const s = t2s(c);
      if (s !== c && [...s].length === 1) m.set(c, s);
    }
  return [...m].sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0));
}

export function bundleTwNames(bundle) {
  return Object.values(bundle.i18n['zh-TW'].foods).map((x) => x.name ?? '');
}

export function renderHantFold(pairs) {
  // 字串比行宽长：照 prettier 的样子在等号后换行，生成的文件格式化后不变
  const line = (name, s) => `export const ${name} =\n  '${s}';\n`;
  return (
    '// 自动生成：由 scripts/gen-hant-fold.mjs 从配置包的繁中食材名生成，不要手改\n' +
    '/** 繁体字（上）和对应的简体字（下），一一对应 */\n' +
    line('HANT', pairs.map((p) => p[0]).join('')) +
    line('HANS', pairs.map((p) => p[1]).join(''))
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundle = JSON.parse(
    readFileSync(join(here, '../../../packages/config/generated/bundle.json'), 'utf8'),
  );
  const pairs = hantPairs(bundleTwNames(bundle));
  writeFileSync(join(here, '../src/utils/hantFold.ts'), renderHantFold(pairs));
  console.log(`hantFold: ${pairs.length} chars`);
}
