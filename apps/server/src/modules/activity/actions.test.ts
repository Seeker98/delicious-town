import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_ACTIONS } from '@dt/shared';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'sim' ? [] : sources(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('活动可选行为（设计 §4.1）', () => {
  it("每个键在服务端源码里都有 emitAction(…, '键') 调用", () => {
    // 按本文件的位置找 src：从仓库根目录和 apps/server 运行都能找到
    const text = sources(fileURLToPath(new URL('../..', import.meta.url))).join('\n');
    const missing = Object.keys(ACTIVITY_ACTIONS).filter(
      (k) => !new RegExp(`emitAction\\(\\w+, '${k.replace('.', '\\.')}'`).test(text),
    );
    expect(missing).toEqual([]);
  });
});
