import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHARED = join(__dirname, '../../../packages/shared/src');
const IMPORT_RE = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@dt\/shared'/g;

function walk(dir: string, ok: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p, ok);
    return ok(n) ? [p] : [];
  });
}

/** 网页从 @dt/shared 导入的值（不含 import type 和 type 前缀的） */
function sharedValueImports(): Set<string> {
  const out = new Set<string>();
  for (const f of walk(__dirname, (n) => /\.(vue|ts)$/.test(n) && !n.endsWith('.test.ts'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
      if (m[1]) continue;
      for (const raw of m[2]!.split(',')) {
        const n = raw.trim();
        if (n && !n.startsWith('type ')) out.add(n.split(' as ')[0]!.trim());
      }
    }
  }
  return out;
}

describe('网页不打包 zod（性能 1016）', () => {
  it('网页从 @dt/shared 用到的值都定义在不 import zod 的文件里（shared 标了 sideEffects: false）', () => {
    const mods = walk(SHARED, (n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && n !== 'index.ts').map(
      (p) => ({ p, src: readFileSync(p, 'utf8') }),
    );
    const names = sharedValueImports();
    expect(names.size).toBeGreaterThan(10);
    const bad = [...names].flatMap((name) => {
      const def = new RegExp(`export (const|function|class|let) ${name}\\b`);
      return mods
        .filter((m) => def.test(m.src) && m.src.includes("from 'zod'"))
        .map((m) => `${name} ← ${relative(SHARED, m.p)}`);
    });
    expect(bad).toEqual([]);
  });
});
