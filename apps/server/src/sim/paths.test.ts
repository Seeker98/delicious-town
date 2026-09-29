import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromInvocation } from './paths';

describe('命令行路径', () => {
  it('相对路径按用户执行 pnpm 的目录（INIT_CWD）解析，而不是 apps/server', () => {
    const root = resolve('/repo');
    expect(fromInvocation('sim-out/a', { INIT_CWD: root })).toBe(resolve(root, 'sim-out/a'));
  });
  it('没有 INIT_CWD 时按当前目录；绝对路径原样返回', () => {
    expect(fromInvocation('x.json', {})).toBe(resolve(process.cwd(), 'x.json'));
    const abs = resolve('/tmp/x.json');
    expect(fromInvocation(abs, { INIT_CWD: resolve('/repo') })).toBe(abs);
  });
});
