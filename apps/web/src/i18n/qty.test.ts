import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import zh from './locales/zh-CN/common';
import fr from './locales/fr/common';

describe('名字×数量（backlog #116）', () => {
  it('法文两边加空格，中文紧挨着', () => {
    expect(fr.qty('Riz', 3)).toBe('Riz × 3');
    expect(fr.times).toBe(' × ');
    expect(zh.qty('大米', 3)).toBe('大米×3');
  });

  it('法文文案里不再有紧挨着的“名字×数量”（菜园不改）', () => {
    const dir = join(__dirname, 'locales/fr');
    const bad = readdirSync(dir)
      .filter((f) => f !== 'yard.ts')
      .flatMap((f) =>
        readFileSync(join(dir, f), 'utf8')
          .split('\n')
          .filter((l) => /\} ?×\$\{/.test(l))
          .map((l) => `${f}: ${l.trim()}`),
      );
    expect(bad).toEqual([]);
  });
});
