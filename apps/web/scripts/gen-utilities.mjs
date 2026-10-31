// 只把用到的 Bootstrap 工具类写进 CSS（性能 2026-10-31：整份 bootstrap-utilities 压缩后约 11 KB，网页只用到其中一小部分）
// 用法：pnpm -F @dt/web utilities。用了新的工具类要重跑，否则 src/utilities.test.ts 会挂
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classesOf, subsetUtilities, usedTokens } from './utility-classes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('bootstrap/package.json'));
const full = readFileSync(join(pkg, 'dist/css/bootstrap-utilities.min.css'), 'utf8');
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;

const body = subsetUtilities(full, usedTokens(join(here, '../src')));
const n = classesOf(body).size;
const css = `/*! Bootstrap Utilities v${version} | Copyright 2011-2025 The Bootstrap Authors | MIT License | https://github.com/twbs/bootstrap/blob/main/LICENSE */
/* 由 scripts/gen-utilities.mjs 生成，别手改：只含网页用到的 ${n} 个工具类（和 :root 的变量） */
${body}`;
writeFileSync(join(here, '../src/styles/utilities.css'), css);
console.log(`${classesOf(full).size} 个工具类 → ${n} 个，${full.length} → ${css.length} 字节`);
