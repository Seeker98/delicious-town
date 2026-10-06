import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { usedIconNames } from '../scripts/icon-names.mjs';

/** 图标字体只含用到的图标（性能第二轮 A）：加了新图标没重跑 pnpm -F @dt/web icons，这里会挂 */
describe('图标字体子集', () => {
  const css = readFileSync(join(__dirname, 'styles/icons.css'), 'utf8');

  it('代码里用到的图标都在子集里', () => {
    const names = usedIconNames(__dirname);
    expect(names.length).toBeGreaterThan(50);
    const missing = names.filter((n) => !css.includes(`.${n}::before`));
    expect(missing, '运行 pnpm -F @dt/web icons 重新生成').toEqual([]);
  });

  it('入口引的是子集，不是整套；子集字体文件在', () => {
    const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');
    expect(main).not.toContain('bootstrap-icons/font/bootstrap-icons.css');
    expect(main).toContain("import './styles/icons.css';");
    expect(existsSync(join(__dirname, 'styles/bootstrap-icons-subset.woff2'))).toBe(true);
  });
});
