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
      'goodsNum(t, rest, 30204); foodNum(t, r, 1001); x = { goodsId: 999999, num: 30204 }; requireCookbook(106001); level: 30204',
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 30204],
      ['foods', 1001],
      ['cookbooks', 106001],
    ]);
  });

  it('发道具的函数按各自的编号参数位置认，数量不算', () => {
    const hits = findItemLiterals(
      'grantGoodsOp(op, 30204, 2); grantGoodsOp(o, goodsId, 1); grantGoods(t.db, config, rest, 30204, 1, now); grantGoods(c, r, 30204, 1)',
      ids,
    );
    expect(hits.map((h) => h.id)).toEqual([30204, 30204, 30204]);
  });

  it('goods / foods 记录里的数字键也是编号，标成 key（改写时要加方括号）', () => {
    const hits = findItemLiterals(
      'newRestaurant(t, { goods: { 30204: 2, 999999: 1 }, foods: { 1001: 5, 1002: 1 } })',
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id, h.key ?? false])).toEqual([
      ['goods', 30204, true],
      ['foods', 1001, true],
      ['foods', 1002, true],
    ]);
  });

  it('{ id, num } 只认 goods / foods 键下面的列表或对象；别的 { id, num }（兑换规则编号等）不算', () => {
    const hits = findItemLiterals(
      'goodsNum(t, r, x); town.exchange(a, { id: 2, num: 1 }); award: { goods: [{ id: 30204, num: 1 }, { id: 10001, num: 2 }] }; goods: { id: 30204, num: 1 }',
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 30204],
      ['goods', 10001],
      ['goods', 30204],
    ]);
  });

  it('#144 审查补的写法：kind 写在一起的 id / itemId、比较、扣东西、厨具测试的小工具', () => {
    const hits = findItemLiterals(
      [
        "params: { kind: 'goods', id: 30204 }",
        "{ kind: 'foods', itemId: 1001, num: 3 }",
        "{ key: 'goods', id: 30204, need: 1 }",
        'x.goodsId === 30204; y.foodsId === 1001; z.cookbookId === 106001',
        'subFoods(op, 1001, 2); consumeGoods(op, 30204, 3)',
        'piece(ctx, 40001); wear(e, 40001); grant(restId, 30204)',
        "awardId: 1, kind: 'foods', itemId: 999999",
      ].join('\n'),
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 30204],
      ['foods', 1001],
      ['goods', 30204],
      ['goods', 30204],
      ['foods', 1001],
      ['cookbooks', 106001],
      ['foods', 1001],
      ['goods', 30204],
      ['goods', 40001],
      ['goods', 40001],
      ['goods', 30204],
    ]);
  });

  it('{ id, num } 按前面最近的 goods / foods 键判断', () => {
    const hits = findItemLiterals(
      'award: { goods: [{ id: 30204, num: 1 }], foods: [{ id: 1001, num: 2 }] }',
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 30204],
      ['foods', 1001],
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

describe('测试里不写死编号（重新编号 PR 2）', () => {
  it('服务端、配置包的测试用常量或按名字查', () => {
    const bad: string[] = [];
    for (const d of ['apps/server/src', 'apps/server/test', 'packages/config/src'])
      for (const p of files(join(ROOT, d))) {
        const r = rel(p);
        if (!/\.test\.ts$/.test(r) && !r.startsWith('apps/server/test/')) continue;
        if (r === 'packages/config/src/itemLiterals.test.ts') continue; // 本文件的规则样例
        if (r === 'packages/config/src/renumber.test.ts') continue; // 换号规则的样例：故意用旧编号
        for (const h of findItemLiterals(readFileSync(p, 'utf8'), ids)) bad.push(`${r}: ${h.kind} ${h.id}`);
      }
    expect(bad).toEqual([]);
  });
});
