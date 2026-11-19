/**
 * 收益模型改版验收（docs/design/收益模型改版-方案-2026-11-19.md 第 8 节第 2、4、5 条），直接用结算纯函数。
 * 同一个种子下，学菜多少不改变随机数的取法（普通顾客不取、挑剔顾客判满意和挑菜各取一次），所以可以逐轮比较。
 * 第 1、3、6 条要线上店铺的真实状态，在 PR 里用线上库副本跑的脚本给数
 */
import { describe, expect, it } from 'vitest';
import { hashSeed, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { settleRestaurant } from './settle';

const config = testConfig();
const globals = buildGlobals(config, config.tuning, { weather: {}, krabStreet: null, planktonRestId: null });
const tables = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ no: i + 1, floor: Math.floor(i / 16) + 1, customer: 0 }));
const streets = [...config.cookbookIndex.idsByStreet.keys()].filter((s) => s !== 0).sort((a, b) => a - b);

/** 逐轮银币（同一组种子） */
function coins(patch: InputPatch, salt: number, rounds: number): number[] {
  const input = buildInput(config, patch);
  return Array.from(
    { length: rounds },
    (_, i) => settleRestaurant(input, globals, seededRng(hashSeed(salt, i))).coin,
  );
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('收益模型改版验收', () => {
  it('第 2 条 多学不亏：多学任意一道菜（任意品级）或升一品，每一轮的银币都不下降（星级 0~7 都抽到）', () => {
    const rng = seededRng(20261119);
    const all = config.cookbookIndex.allIds;
    let checked = 0;
    for (let c = 0; c < 160; c++) {
      const star = c % 8;
      const streetId = rng.chance(0.2) ? 0 : streets[rng.int(streets.length)]!;
      const cookbooks: Record<number, number> = {};
      const n = 1 + rng.int(rng.chance(0.5) ? 40 : 600);
      for (let i = 0; i < n; i++) cookbooks[all[rng.int(all.length)]!] = rng.intMin1(7);
      const agg = {
        atRate: rng.next() * 0.4,
        spRate: rng.next() * 0.5,
        coinValue: rng.int(4),
        spCoinRate: rng.next() * 0.2,
      };
      const base: InputPatch = { rest: { star, streetId }, tables: tables(8 + rng.int(40)), agg };
      const after = { ...cookbooks };
      const learned = Object.keys(cookbooks).map(Number);
      if (rng.chance(0.5)) {
        let id = all[rng.int(all.length)]!;
        while (after[id]) id = all[rng.int(all.length)]!;
        after[id] = rng.intMin1(7);
      } else {
        const id = learned[rng.int(learned.length)]!;
        if (after[id]! >= 7) continue;
        after[id]! += 1;
      }
      const before = coins({ ...base, cookbooks }, c, 12);
      const more = coins({ ...base, cookbooks: after }, c, 12);
      for (let i = 0; i < before.length; i++) expect(more[i]!).toBeGreaterThanOrEqual(before[i]!);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
    // 0 道 → 1 道：挑剔顾客从“基础 ÷ 2”变成至少“基础 + 厨艺钱 × 0.5”，普通顾客多了厨艺钱，期望一定不降
    const none = mean(coins({ rest: { star: 4, streetId: 1 }, tables: tables(28) }, 1, 400));
    const one = mean(
      coins({ rest: { star: 4, streetId: 1 }, tables: tables(28), cookbooks: { [all[0]!]: 1 } }, 2, 400),
    );
    if (process.env.PRINT) console.log(`0 道 → 1 道：${Math.round(none)} → ${Math.round(one)}`);
    expect(one).toBeGreaterThan(none);
  });

  /** 学满前 k 条街（每道 3 品），站在第 k 条街 */
  const learnStreets = (k: number) => {
    const cookbooks: Record<number, number> = {};
    for (const s of streets.slice(0, k))
      for (const id of config.cookbookIndex.idsByStreet.get(s)!) cookbooks[id] = 3;
    return cookbooks;
  };

  it('第 4 条 逐街上升：学完一条街就搬，走 8 条街，每条街学完时的银币都高于上一条街学完时（不算街道勋章）', () => {
    const per: number[] = [];
    for (let k = 1; k <= 8; k++) {
      per.push(
        mean(
          coins(
            { rest: { star: 4, streetId: streets[k - 1]! }, tables: tables(28), cookbooks: learnStreets(k) },
            4,
            600,
          ),
        ),
      );
    }
    if (process.env.PRINT) console.log('逐街上升', per.map(Math.round).join(' → '));
    for (let k = 1; k < per.length; k++) expect(per[k]!).toBeGreaterThan(per[k - 1]!);
  });

  it('第 4 条带上街道勋章（勋章重算 2026-11-19）：前 8 条街逐街上升；走遍 29 条街，每条街学完时都不低于之前最高的 97%', () => {
    const medal = (s: number) =>
      (config.requireGoods(config.streetMedalId(s)).value ?? {}) as Record<string, number>;
    const per: number[] = [];
    for (let k = 1; k <= streets.length; k++) {
      const s = streets[k - 1]!;
      const patch = {
        rest: { star: 4, streetId: s },
        tables: tables(28),
        cookbooks: learnStreets(k),
        agg: medal(s),
      };
      per.push(mean(coins(patch, 4, 600)));
    }
    if (process.env.PRINT) console.log('带勋章逐街上升', per.map(Math.round).join(' → '));
    // 学到十几条街以后多一条街厨艺值只多 1% 左右，各街勋章还剩 ±4% 的差，后面允许小幅回落
    for (let k = 1; k < 8; k++) expect(per[k]!).toBeGreaterThan(per[k - 1]!);
    let best = 0;
    for (const x of per) {
      expect(x).toBeGreaterThanOrEqual(best * 0.97);
      best = Math.max(best, x);
    }
  });

  it('第 5 条 不搬落后：同样的星级、桌数和加成，只学一条街的店不超过学了 12 条街的店的 65%', () => {
    for (const [star, n] of [
      [4, 28],
      [6, 39],
    ] as const) {
      const one = mean(
        coins(
          { rest: { star, streetId: streets[0]! }, tables: tables(n), cookbooks: learnStreets(1) },
          5,
          600,
        ),
      );
      const twelve = mean(
        coins(
          { rest: { star, streetId: streets[11]! }, tables: tables(n), cookbooks: learnStreets(12) },
          5,
          600,
        ),
      );
      if (process.env.PRINT)
        console.log(
          `不搬落后 ${star} 星 ${n} 桌：${Math.round(one)} / ${Math.round(twelve)} = ${(one / twelve).toFixed(3)}`,
        );
      expect(one / twelve).toBeLessThanOrEqual(0.65);
    }
  });
});
