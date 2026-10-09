import { describe, expect, it } from 'vitest';
import { GOODS, resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { countGoods, openFastRest } from './ops';
import { prizeFoodTier } from '../../modules/award/random';
import { applySide, loadSideTable, rowsFor } from './side';
import real from './side-income.json';
import type { FastCtx } from './state';

const config = testConfig();
const settings = resolveShardSettings(config, {});
const c = (): FastCtx => ({
  config,
  tuning: settings.tuning,
  now: new Date(),
  rng: seededRng(1),
  stats: { income: {} },
});
const table = (rows: unknown[]) =>
  loadSideTable({ participation: { diligent: 1, normal: 0.7, casual: 0.4 }, rows }, config);

describe('旁支产出表（设计 §5）', () => {
  it('真实的产出表能通过校验，八个来源都有', () => {
    const t = loadSideTable(real, config);
    expect(new Set(t.rows.map((r) => r.source)).size).toBe(8);
  });

  it('等级段：取不超过当前等级的最高一段；只有高等级段时低等级拿 0（Review Focus 3）', () => {
    const t = table([
      { source: 'tower', minLevel: 10, coin: 100 },
      { source: 'tower', minLevel: 20, coin: 300 },
    ]);
    expect(rowsFor(t, 5)).toEqual([]);
    expect(rowsFor(t, 15)[0]!.coin).toBe(100);
    expect(rowsFor(t, 25)[0]!.coin).toBe(300);
  });

  it('参与度向下取整；常驻加成不打折，换段时替换，不累加', () => {
    const t = table([
      { source: 'town', minLevel: 1, coin: 1000, goods: [{ id: GOODS.mysteryTicket, num: 3 }] },
      { source: 'equip', minLevel: 1, effects: { atRate: 0.05 } },
    ]);
    const ctx = c();
    const r = openFastRest(ctx, 1, settings);
    const coin = r.coin;
    const tickets = countGoods(ctx, r, 1);
    applySide(ctx, r, t, 'casual');
    expect(r.coin).toBe(coin + 400);
    expect(countGoods(ctx, r, GOODS.mysteryTicket)).toBe(tickets + 1);
    expect(r.effects.filter((e) => e.sourceType === 'side').map((e) => e.effects)).toEqual([
      { atRate: 0.05 },
    ]);
    applySide(ctx, r, t, 'casual');
    expect(r.effects.filter((e) => e.sourceType === 'side')).toHaveLength(1);
    expect(ctx.stats.income['side.town']!.coin).toBe(800);
  });

  it('来源名、道具 id、加成键、参与度写错都报错，带行号', () => {
    expect(() => table([{ source: 'nope', minLevel: 1 }])).toThrow(/rows\[0\]/);
    expect(() => table([{ source: 'town', minLevel: 1, goods: [{ id: 999999, num: 1 }] }])).toThrow(/999999/);
    expect(() => table([{ source: 'equip', minLevel: 1, effects: { notAKey: 1 } }])).toThrow(/notAKey/);
    expect(() =>
      loadSideTable({ participation: { diligent: 2, normal: 1, casual: 1 }, rows: [] }, config),
    ).toThrow();
  });

  it('外卖那几行的银币乘菜价倍率（240-1）', () => {
    const ctx = {
      ...c(),
      tuning: { ...settings.tuning, settlement: { ...settings.tuning.settlement, dishCoinRate: 0.5 } },
    };
    const r = openFastRest(ctx, 1, settings);
    r.level = 60;
    const coin0 = r.coin;
    applySide(ctx, r, table([{ source: 'takeaway', minLevel: 1, coin: 1000 }]), 'diligent');
    expect(r.coin - coin0).toBe(500);
  });
});

describe('随机奖励里的食材（问题记录 50 验证：酒吧、厨塔会给食材，缺料倾向主要作用在这里）', () => {
  /** 发一次旁支产出，返回新增的食材 id → 份数 */
  const gained = (ctx: FastCtx, r: ReturnType<typeof openFastRest>, t: ReturnType<typeof table>) => {
    const before = new Map(r.foods);
    applySide(ctx, r, t, 'diligent');
    const out = new Map<number, number>();
    for (const [id, n] of r.foods) if (n > (before.get(id) ?? 0)) out.set(id, n - (before.get(id) ?? 0));
    return out;
  };
  const level = (id: number) => config.foods.get(id)!.level;
  const odds = (id: number) => config.foods.get(id)!.odds;
  const noTilt = { ...settings.tuning, scarcity: { needBase: 0, needLuckFactor: 0, needMax: 0 } };
  const allTilt = { ...settings.tuning, scarcity: { needBase: 1, needLuckFactor: 0, needMax: 1 } };

  it('真实产出表里酒吧、厨塔都写了随机食材', () => {
    const t = loadSideTable(real, config);
    for (const s of ['bar', 'tower'] as const)
      expect(t.rows.find((r) => r.source === s)?.randomFoods?.length ?? 0).toBeGreaterThan(0);
  });

  it('次数、等级写错报错', () => {
    expect(() => table([{ source: 'bar', minLevel: 1, randomFoods: [{ times: -1, level: 3 }] }])).toThrow();
    expect(() => table([{ source: 'bar', minLevel: 1, randomFoods: [{ times: 1, level: 0 }] }])).toThrow();
  });

  it('普通随机奖励只出权重 100 的普通食材，等级不超过奖励等级（和 award/random.ts 一样）', () => {
    const ctx = { ...c(), tuning: noTilt };
    const r = openFastRest(ctx, 1, settings);
    const got = gained(
      ctx,
      r,
      table([{ source: 'tower', minLevel: 1, randomFoods: [{ times: 200, level: 3 }] }]),
    );
    expect(got.size).toBeGreaterThan(0);
    for (const id of got.keys()) {
      expect(odds(id)).toBe(100);
      expect(level(id)).toBeLessThanOrEqual(3);
    }
  });

  it('酒吧按奖励档次的等级范围出，可以出稀有', () => {
    const ctx = { ...c(), tuning: noTilt };
    const r = openFastRest(ctx, 1, settings);
    const t = table([{ source: 'bar', minLevel: 1, randomFoods: [{ times: 300, level: 5, bar: true }] }]);
    const got = gained(ctx, r, t);
    const [lo, hi] = prizeFoodTier(settings.tuning.bar.prize.foodTiers, 5).levels;
    for (const id of got.keys()) {
      expect(level(id)).toBeGreaterThanOrEqual(lo);
      expect(level(id)).toBeLessThanOrEqual(hi);
    }
    expect([...got.keys()].some((id) => odds(id) < 100)).toBe(true);
  });

  it('缺料倾向必中时，只出本街学菜正缺的食材', () => {
    const ctx = { ...c(), tuning: allTilt };
    const r = openFastRest(ctx, 1, settings);
    const need = new Set<number>();
    for (const id of config.cookbookIndex.idsByStreet.get(r.streetId) ?? [])
      for (const f of config.requireCookbook(id).needFoods[1] ?? []) need.add(f.foodsId);
    const got = gained(
      ctx,
      r,
      table([{ source: 'tower', minLevel: 1, randomFoods: [{ times: 50, level: 5 }] }]),
    );
    expect(got.size).toBeGreaterThan(0);
    for (const id of got.keys()) expect(need.has(id)).toBe(true);
  });

  it('次数按参与度打折后随机取整：平均值对得上', () => {
    const ctx = { ...c(), tuning: noTilt };
    const r = openFastRest(ctx, 1, settings);
    r.luck = 0;
    const t = table([{ source: 'tower', minLevel: 1, randomFoods: [{ times: 1.4, level: 1 }] }]);
    let total = 0;
    const days = 2000;
    for (let i = 0; i < days; i++) {
      const before = [...r.foods.values()].reduce((a, b) => a + b, 0);
      applySide(ctx, r, t, 'casual');
      total += [...r.foods.values()].reduce((a, b) => a + b, 0) - before;
      r.foods.clear();
    }
    // casual 参与度 0.4：1.4 × 0.4 = 0.56 次/天；幸运翻倍会让份数略多
    expect(total / days).toBeGreaterThan(0.5);
    expect(total / days).toBeLessThan(0.75);
  });
});
