import { describe, expect, it } from 'vitest';
import { GOODS, resolveShardSettings } from '@dt/config';
import { gameTime, nextSlot, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { joinGuess, marketBuy, newMarket, restockIfDue, settleGuesses } from './market';
import { countGoods, grantGoods, openFastRest } from './ops';
import type { FastCtx } from './state';

const config = testConfig();
const settings = resolveShardSettings(config, {});
const t = settings.tuning.market;
const day = '2026-10-02';
const ctx = (now: Date): FastCtx => ({
  config,
  tuning: settings.tuning,
  now,
  rng: seededRng(2),
  stats: { income: {} },
});

describe('菜场（设计 §4.6）', () => {
  it('上新时刻换货；同一时段第二轮不重复上新', () => {
    const m = newMarket();
    const h = t.dailyHours[0]!;
    expect(restockIfDue(m, config, settings.tuning, gameTime(day, h), 1)).not.toBeNull();
    const ids = m.items.map((x) => x.id);
    expect(ids.length).toBeGreaterThan(0);
    restockIfDue(m, config, settings.tuning, gameTime(day, h, 4), 1);
    expect(m.items.map((x) => x.id)).toEqual(ids);
  });

  it('库存被前面的人买光后，后面的买不到；按店限购', () => {
    const m = newMarket();
    const now = gameTime(day, t.dailyHours[0]!);
    restockIfDue(m, config, settings.tuning, now, 1);
    const it0 = m.items.find((x) => x.shelf === 0)!;
    it0.stock = 3;
    const c = ctx(now);
    const a = openFastRest(c, 1, settings);
    const b = openFastRest(c, 2, settings);
    a.coin = b.coin = 1e9;
    expect(marketBuy(c, a, m, it0.id, 3, {})).toBe(true);
    expect(a.foods.get(it0.foodsId)).toBeGreaterThanOrEqual(3);
    expect(marketBuy(c, b, m, it0.id, 1, {})).toBe(false);
    const sp = m.items.find((x) => x.shelf === 1);
    if (sp) {
      expect(marketBuy(c, b, m, sp.id, t.shelfLimits[1]! + 1, {})).toBe(false);
    }
  });

  it('竞猜：报名扣礼券，开奖后按命中发奖', () => {
    const m = newMarket();
    const now = gameTime(day, t.dailyHours[0]!, 30);
    const c = ctx(now);
    const r = openFastRest(c, 1, settings);
    grantGoods(c, r, GOODS.mysteryTicket, 10, 'test');
    const before = countGoods(c, r, GOODS.mysteryTicket);
    const pool = config.bundle.marketGuessFoods.slice(0, t.guessMaxPick);
    expect(joinGuess(c, r, m, pool)).toBe(true);
    expect(joinGuess(c, r, m, pool)).toBe(false);
    expect(countGoods(c, r, GOODS.mysteryTicket)).toBe(before - t.guessCost);
    const slot = nextSlot(now, t.dailyHours);
    c.now = slot.start;
    settleGuesses(c, new Map([[1, r]]), m, pool, slot.key, slot.hour);
    expect(m.guesses.size).toBe(0);
  });
});
