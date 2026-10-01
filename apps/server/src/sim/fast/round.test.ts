import { describe, expect, it } from 'vitest';
import { resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, toSettleInput } from '../../modules/settlement/globals';
import { settleRestaurant } from '../../modules/settlement/settle';
import { aggOf, openFastRest } from './ops';
import { fastSettleSource, settleRound } from './round';
import type { FastCtx } from './state';

const config = testConfig();
const settings = resolveShardSettings(config, {});
const mk = (seed: number): FastCtx => ({
  config,
  tuning: settings.tuning,
  now: new Date('2026-10-02T04:00:00Z'),
  rng: seededRng(seed),
  stats: { income: {} },
});

describe('一轮结算（设计 §4.4）', () => {
  it('结果和直接调用 settleRestaurant 一致：银币、经验、油', () => {
    const c = mk(3);
    const r = openFastRest(c, 1, settings);
    const g = buildGlobals(config, settings.tuning);
    const expected = settleRestaurant(
      toSettleInput(fastSettleSource(r, aggOf(c, r), c.now)),
      g,
      seededRng(99),
    );
    const before = { coin: r.coin, oil: r.oil };
    c.rng = seededRng(99);
    expect(settleRound(c, r, g)).toBe('settled');
    expect(r.coin).toBe(Math.max(0, before.coin + expected.coin));
    expect(r.oil).toBe(before.oil - expected.oil);
    expect(c.stats.income.settlement?.coin ?? 0).toBe(Math.max(0, expected.coin));
  });

  it('没油的店停业，不入账；停业后跳过（Review Focus 2）', () => {
    const c = mk(4);
    const r = openFastRest(c, 1, settings);
    r.oil = 0;
    const coin = r.coin;
    const g = buildGlobals(config, settings.tuning);
    expect(settleRound(c, r, g)).toBe('closed');
    expect(r.state).toBe(2);
    expect(r.coin).toBe(coin);
    expect(settleRound(c, r, g)).toBe('skipped');
  });
});
