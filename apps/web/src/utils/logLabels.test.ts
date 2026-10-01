import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logText } from './events';

const SERVER = join(__dirname, '../../../server/src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}
/** 服务端写进个人日志的类型：restLog(x, 'type' …) 和 grantRewardOp 的 logType: 'type' */
function serverLogTypes(): string[] {
  const out = new Set<string>();
  for (const f of files(SERVER)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/restLog\(\s*[\w.]+\s*,\s*'([\w.]+)'/g)) out.add(m[1]!);
    for (const m of src.matchAll(/logType:\s*'([\w.]+)'/g)) out.add(m[1]!);
  }
  return [...out].sort();
}

const names = { goodsName: () => '道具', foodName: () => '食材', mcName: () => '秘', seedName: () => '种子' };

describe('个人日志文案全覆盖（问题记录 154，Review Focus 5）', () => {
  it('能扫到服务端的日志类型', () => {
    expect(serverLogTypes()).toEqual(expect.arrayContaining(['bar.memory', 'level.up', 'mail.claim']));
  });
  it('每个类型都有中文文案，不显示类型名', () => {
    const raw = serverLogTypes().filter((type) => {
      const text = logText({ type, params: {}, at: '' } as never, names as never);
      return text === type || /^[a-z.]+$/.test(text);
    });
    expect(raw).toEqual([]);
  });
});
