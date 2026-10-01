import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'main.css'), 'utf8');

/** 顶层（不在 @media 里）的选择器 */
function topLevelSelectors(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of src.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      const sel = buf.trim();
      if (depth === 0 && !sel.startsWith('@')) out.push(...sel.split(',').map((s) => s.trim()));
      depth++;
      buf = '';
    } else if (ch === '}') {
      depth--;
      buf = '';
    } else buf += ch;
  }
  return out;
}

describe('main.css', () => {
  it('同一个类不在顶层定义两次，免得后写的悄悄覆盖前面的（问题记录 212：.dt-chip 撞名）', () => {
    const seen = new Map<string, number>();
    for (const s of topLevelSelectors(css)) seen.set(s, (seen.get(s) ?? 0) + 1);
    const dup = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
    expect(dup).toEqual([]);
  });
});
