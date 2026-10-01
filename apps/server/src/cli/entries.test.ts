import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../tsup.config';

describe('生产镜像里的命令行（终审：重算命令在生产跑不了）', () => {
  it('src/cli 下每个命令都打进 dist/cli，生产环境能用 node dist/cli/<名字>.js 跑', () => {
    const entry = (config as { entry: Record<string, string> }).entry;
    const clis = readdirSync(join(__dirname))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => f.replace(/\.ts$/, ''));
    for (const c of clis) expect(entry[`cli/${c}`], c).toBe(`src/cli/${c}.ts`);
  });
});
