// Bootstrap 工具类只带用到的（性能 2026-10-31）：gen-utilities.mjs 按它生成子集，测试按它核对
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLASS = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
/** 源码里可能是类名的词：字母、数字、- 和 _ 连在一起的（PurgeCSS 默认的取词法） */
const TOKEN = /[A-Za-z0-9_-]+/g;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(vue|ts)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

/**
 * src 下（不含测试）出现过的所有词。类名都写全（没有 `text-${x}`、'bg-' + x 这样拼出来的），
 * 所以出现过的词里包含用到的全部类名；多出来的普通单词只会多留几条规则，不会漏
 */
export function usedTokens(srcDir) {
  const out = new Set();
  for (const p of walk(srcDir)) for (const m of readFileSync(p, 'utf8').matchAll(TOKEN)) out.add(m[0]);
  return out;
}

/**
 * 把压缩过的 CSS 拆成规则：{ media, selectors, body }；media 为外层的 @media（没有为 null）。
 * Bootstrap 工具类的 CSS 只有一层 @media、没有别的 @ 规则，选择器里没有逗号以外的分隔
 */
export function parseRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  let media = null;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (src[i] === '}') {
      media = null;
      i++;
      continue;
    }
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    if (head.startsWith('@media')) {
      media = head;
      i = open + 1;
      continue;
    }
    if (head.startsWith('@')) throw new Error(`不认识的 @ 规则：${head}`);
    const close = src.indexOf('}', open);
    rules.push({ media, selectors: head.split(',').map((s) => s.trim()), body: src.slice(open + 1, close) });
    i = close + 1;
  }
  return rules;
}

/** 规则里出现的所有类名 */
export function classesOf(css) {
  const out = new Set();
  for (const r of parseRules(css))
    for (const s of r.selectors) for (const m of s.matchAll(CLASS)) out.add(m[1]);
  return out;
}

/**
 * 只留用到的：选择器里的类都用到了才留这个选择器；没有类的（:root 的变量、[data-bs-theme=dark]）都留。
 * 返回生成的 CSS 正文（每条规则一行，@media 按原顺序分组）
 */
export function subsetUtilities(css, used) {
  const keep = (s) => [...s.matchAll(CLASS)].every((m) => used.has(m[1]));
  const lines = [];
  let media = null;
  for (const r of parseRules(css)) {
    const selectors = r.selectors.filter(keep);
    if (selectors.length === 0) continue;
    if (r.media !== media) {
      if (media) lines.push('}');
      if (r.media) lines.push(`${r.media} {`);
      media = r.media;
    }
    lines.push(`${media ? '  ' : ''}${selectors.join(', ')} { ${r.body} }`);
  }
  if (media) lines.push('}');
  return lines.join('\n') + '\n';
}
