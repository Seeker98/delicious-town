import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
    const text = sources('apps/server/src').join('\n');
    const missing = Object.keys(ACTIVITY_ACTIONS).filter(
      (k) => !new RegExp(`emitAction\\(\\w+, '${k.replace('.', '\\.')}'`).test(text),
    );
    expect(missing).toEqual([]);
  });
});
