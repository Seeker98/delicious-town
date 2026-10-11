import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** 源码文件（不含测试和生成的文件） */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'generated' ? [] : sources(p);
    return /\.(vue|ts)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

describe('原版图包接口去掉了（界面改版 P4，设计 §3.4）', () => {
  it('网页里不再请求 /pack 的图片，也不再有 GameImg、asset()、VITE_ASSET_BASE', () => {
    const bad = sources(__dirname)
      .filter((p) => /GameImg|['"`]\/pack|\basset\(|VITE_ASSET_BASE/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(__dirname, p));
    expect(bad).toEqual([]);
  });
});
