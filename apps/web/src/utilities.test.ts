import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classesOf, parseRules, subsetUtilities, usedTokens } from '../scripts/utility-classes.mjs';

const require = createRequire(import.meta.url);
const full = readFileSync(
  join(dirname(require.resolve('bootstrap/package.json')), 'dist/css/bootstrap-utilities.min.css'),
  'utf8',
);

/** Bootstrap 工具类只带用到的（性能 2026-10-31）：用了新的工具类没重跑 pnpm -F @dt/web utilities，这里会挂 */
describe('Bootstrap 工具类子集', () => {
  const css = readFileSync(join(__dirname, 'styles/utilities.css'), 'utf8');

  it('按现在的代码该留的规则都在子集里（多留了没用到的不算错，下次重新生成时去掉）', () => {
    const used = usedTokens(__dirname);
    // 只防扫描坏掉：界面改版后多数样式是自己的 dt-* 类（2026-10-31 用到 73 个）
    expect(classesOf(css).size).toBeGreaterThan(50);
    const have = new Set(css.split('\n'));
    const missing = subsetUtilities(full, used)
      .split('\n')
      .filter((l) => !have.has(l));
    expect(missing, '运行 pnpm -F @dt/web utilities 重新生成').toEqual([]);
  });

  it('类名都写全，没有拼出来的（拼出来的扫不到，会漏）', () => {
    // 扫描本身：模板里写全的类、:class 里的字符串都能取到
    const used = usedTokens(__dirname);
    expect(used.has('d-flex') && used.has('text-muted')).toBe(true);
    const prefixes = [...new Set([...classesOf(full)].map((c) => c.split('-')[0]))].join('|');
    const pieced = new RegExp(`[\`'"](${prefixes})-(\\$\\{|['"] ?\\+)`);
    const bad: string[] = [];
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) return walk(p);
        return /\.(vue|ts)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
      });
    for (const p of walk(__dirname))
      for (const line of readFileSync(p, 'utf8').split('\n'))
        // 测试编号、元素 id 不是类名
        if (pieced.test(line) && !/testid|:id=|:for=/.test(line)) bad.push(`${p}: ${line.trim()}`);
    expect(bad).toEqual([]);
  });

  it('子集：用到的类连同 @media 里的变体都留，没用到的去掉；:root、深色的变量整块留', () => {
    const out = subsetUtilities(
      ':root,[data-bs-theme=light]{--bs-x:1}.d-flex{display:flex!important}.d-none{display:none!important}' +
        '@media (min-width:576px){.d-sm-flex{display:flex!important}.d-sm-none{display:none!important}}',
      new Set(['d-flex', 'd-sm-none']),
    );
    expect(out).toBe(
      ':root, [data-bs-theme=light] { --bs-x:1 }\n.d-flex { display:flex!important }\n' +
        '@media (min-width:576px) {\n  .d-sm-none { display:none!important }\n}\n',
    );
    // 生成的文件能按同样的规则读回来
    expect(parseRules(css).length).toBeGreaterThan(50);
  });

  it('入口引的是子集，不是整份', () => {
    const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');
    expect(main).not.toContain('bootstrap-utilities');
    expect(main).toContain("import './styles/utilities.css';");
  });
});
