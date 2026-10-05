import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findItemLiterals } from './itemLiterals';
import { realBuild } from './testBundle';

const b = realBuild().bundle!;
const ids = {
  goods: new Set(b.goods.map((g) => g.id)),
  foods: new Set(b.foods.map((f) => f.id)),
  cookbooks: new Set(b.cookbooks.map((c) => c.id)),
};
const ROOT = join(__dirname, '..', '..', '..');

describe('写死的编号的识别（重新编号 PR 2）', () => {
  it('只认编号位置上的现有编号', () => {
    const hits = findItemLiterals(
      'goodsNum(t, rest, 93); foodNum(t, r, 101); x = { goodsId: 999999, num: 93 }; requireCookbook(1); level: 93',
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 93],
      ['foods', 101],
      ['cookbooks', 1],
    ]);
  });

  it('发道具的函数按各自的编号参数位置认，数量不算', () => {
    const hits = findItemLiterals(
      'grantGoodsOp(op, 93, 2); grantGoodsOp(o, goodsId, 1); grantGoods(t.db, config, rest, 93, 1, now); grantGoods(c, r, 93, 1)',
      ids,
    );
    expect(hits.map((h) => h.id)).toEqual([93, 93, 93]);
  });

  it('{ id, num } 按前面最近的 goods / foods 键判断', () => {
    const hits = findItemLiterals(
      'award: { goods: [{ id: 93, num: 1 }], foods: [{ id: 101, num: 2 }] }',
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 93],
      ['foods', 101],
    ]);
  });
});

/** 源码（非测试）：除常量文件外不能写死编号 */
const SOURCE_DIRS = ['apps/server/src', 'packages/config/src', 'packages/shared/src', 'apps/web/src'];
const ALLOW = new Set(['packages/config/src/ids.ts', 'packages/shared/src/goodsIds.ts']);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p);
    return /\.(ts|vue)$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');

describe('源码里不写死编号（重新编号 PR 2）', () => {
  it('服务端、配置包、共享包、前端源码', () => {
    const bad: string[] = [];
    for (const d of SOURCE_DIRS)
      for (const p of files(join(ROOT, d))) {
        const r = rel(p);
        if (ALLOW.has(r) || /\.test\.ts$|testData\.ts$|testItems\.ts$/.test(r)) continue;
        for (const h of findItemLiterals(readFileSync(p, 'utf8'), ids)) bad.push(`${r}: ${h.kind} ${h.id}`);
      }
    expect(bad).toEqual([]);
  });
});
