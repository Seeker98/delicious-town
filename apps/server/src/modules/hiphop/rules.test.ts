import { describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  coinWorth,
  diamondWorth,
  foodWorth,
  krabRoll,
  rollWorth,
  tipExp,
  tipTickets,
  weekEndPeriod,
} from './rules';

const t = testConfig().tuning.hiphop;

describe('嘻哈男孩规则', () => {
  it('食材价值按等级折算', () => {
    expect(foodWorth(1000, 3, 10)).toBe(7500);
    expect(foodWorth(999, 1, 3)).toBe(1498);
  });
  it('银币和钻石价值', () => {
    expect(coinWorth(1_000_004, t)).toBe(200_000);
    expect(diamondWorth(3, t)).toBe(10001);
    expect(diamondWorth(1, t)).toBe(3333);
  });
  it('经验浮动 ±10%', () => {
    expect(tipExp('coin', 2100, 0.5, t)).toBe(10);
    expect(tipExp('coin', 21000, 0, t)).toBe(90);
    expect(tipExp('diamond', 2, 0.999999, t)).toBe(109);
  });
  it('蟹币：基础 10%，食材 ×1.5，天气加成带来的那一段标"虹"', () => {
    expect(krabRoll(0.09, t, 0, false, 0)).toEqual({ hit: true, rainbow: false });
    expect(krabRoll(0.1, t, 0, false, 0)).toEqual({ hit: false, rainbow: false });
    expect(krabRoll(0.14, t, 0, true, 0)).toEqual({ hit: true, rainbow: false });
    expect(krabRoll(0.15, t, 0.1, false, 0)).toEqual({ hit: true, rainbow: true });
    expect(krabRoll(0.12, t, 0, false, 0.3)).toEqual({ hit: true, rainbow: false });
  });
  it('额外礼券和门槛', () => {
    expect(tipTickets(10, 3)).toBe(3);
    expect(tipTickets(4, 5)).toBe(4);
    expect(rollWorth(0, t)).toBe(43750);
    expect(rollWorth(0.999, t)).toBe(71722);
  });
  it('周榜周期：周日 23 点前算上一周', () => {
    // 2026-10-04 是周日
    expect(weekEndPeriod(gameTime('2026-10-04', 22, 59), 23)).toBe('2026-09-21');
    expect(weekEndPeriod(gameTime('2026-10-04', 23), 23)).toBe('2026-09-28');
    expect(weekEndPeriod(gameTime('2026-10-05', 1), 23)).toBe('2026-09-28');
  });
});
