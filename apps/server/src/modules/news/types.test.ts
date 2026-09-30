import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEWS_TYPES } from '@dt/shared';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('新闻类型清单', () => {
  it('代码里写入的每种新闻都在 NEWS_TYPES 里（前端据此保证每种都有文案）', () => {
    const root = join(__dirname, '..', '..');
    const found = new Set<string>();
    const re = /(?:opNews\([^,]+,\s*|postNews\([\s\S]{0,120}?type:\s*)'([\w.]+)'/g;
    for (const f of sources(root)) {
      for (const m of readFileSync(f, 'utf8').matchAll(re)) found.add(m[1]!);
    }
    expect(found.size).toBeGreaterThanOrEqual(25);
    expect([...found].filter((x) => !NEWS_TYPES.includes(x))).toEqual([]);
  });
});
