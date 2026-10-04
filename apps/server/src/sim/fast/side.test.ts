import { describe, expect, it } from 'vitest';
import { resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { countGoods, openFastRest } from './ops';
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
      { source: 'town', minLevel: 1, coin: 1000, goods: [{ id: 1, num: 3 }] },
      { source: 'equip', minLevel: 1, effects: { atRate: 0.05 } },
    ]);
    const ctx = c();
    const r = openFastRest(ctx, 1, settings);
    const coin = r.coin;
    const tickets = countGoods(ctx, r, 1);
    applySide(ctx, r, t, 'casual');
    expect(r.coin).toBe(coin + 400);
    expect(countGoods(ctx, r, 1)).toBe(tickets + 1);
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
