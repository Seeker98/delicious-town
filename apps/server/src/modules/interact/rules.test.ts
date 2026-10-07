import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { dineAccrual } from '../settlement/tables';
import {
  bangleRate,
  caughtCoin,
  dineEndReward,
  dineStrength,
  exchangeFee,
  exchangeLimits,
  expelReward,
  flipCoolMs,
  flipSlots,
  killReward,
  killStrength,
  layReward,
  perHostLeft,
  refuelDraws,
} from './rules';
import { clearTable, isEmptyTable } from './tables';

const f = testConfig().tuning.friend;

describe('白食（规格书 13 §13.3）', () => {
  it('体力 = min(整小时 × 20, 100)，激动的心 ×1.5', () => {
    expect(dineStrength(0.9, false, f.dine)).toBe(0);
    expect(dineStrength(2.5, false, f.dine)).toBe(40);
    expect(dineStrength(9, false, f.dine)).toBe(100);
    expect(dineStrength(2, true, f.dine)).toBe(60);
  });
  it('自己结束：银币照拿，经验有激动的心 ×3', () => {
    expect(dineEndReward({ coin: 100, exp: 50 }, 2, {}, f.dine)).toEqual({
      coin: 100,
      exp: 50,
      strength: 40,
    });
    expect(dineEndReward({ coin: 100, exp: 50 }, 2, { excitedHeart: 1 }, f.dine)).toEqual({
      coin: 100,
      exp: 150,
      strength: 60,
    });
  });
  it('被请走：店主 2 倍，白食者赔银币；没有激动的心不得经验（设计文档 裁定 3）', () => {
    expect(expelReward({ coin: 100, exp: 50 }, 1, {}, f.dine)).toEqual({
      hostCoin: 200,
      dinerLoss: 100,
      dinerExp: 0,
      dinerStrength: 20,
    });
    expect(expelReward({ coin: 100, exp: 50 }, 1, { excitedHeart: 1 }, f.dine).dinerExp).toBe(150);
  });
  it('每轮累计（规格书 01 §1.5B）：7 小时以内 ×3，之后 ×1', () => {
    const base = { oilBase: 1, coinBase: 10, expBase: 5 };
    const since = '2026-09-30T00:00:00.000Z';
    const early = dineAccrual(
      { level: 16, since },
      new Date('2026-09-30T01:00:00Z'),
      2,
      base,
      sequenceRng([0]),
    );
    expect(early).toEqual({ oil: 4, exp: 21, loss: 36 });
    const late = dineAccrual(
      { level: 16, since },
      new Date('2026-09-30T08:00:00Z'),
      2,
      base,
      sequenceRng([0]),
    );
    expect(late).toEqual({ oil: 2, exp: 7, loss: 12 });
  });
});

describe('蟑螂（规格书 13 §13.4、20 §20.18）', () => {
  it('放蟑螂奖励 ×(1 + 0.2 × 等级)', () => {
    expect(layReward(10, f.roach)).toEqual({ coin: 15, exp: 15 });
  });
  it('灭蟑螂体力：自己店 1、好友店 2、蟹老板 0；午夜蟑螂杀手按时段封顶', () => {
    expect(killStrength('self', {}, 12, f.roach)).toBe(1);
    expect(killStrength('friend', {}, 12, f.roach)).toBe(2);
    expect(killStrength('npc', {}, 12, f.roach)).toBe(0);
    const killer = { killRoachONightNS: 1, killRoachODayNS: 3 };
    expect(killStrength('friend', killer, 23, f.roach)).toBe(1);
    expect(killStrength('friend', killer, 12, f.roach)).toBe(2);
  });
  it('灭蟑螂奖励：自己店 ×1.5；别人店 ×(1 + cockroachIncomeRate)', () => {
    expect(killReward(10, 'self', {}, f.roach)).toEqual({ coin: 90, exp: 83 });
    expect(killReward(10, 'friend', {}, f.roach)).toEqual({ coin: 60, exp: 55 });
    expect(killReward(10, 'friend', { cockroachIncomeRate: 0.5 }, f.roach)).toEqual({ coin: 90, exp: 83 });
  });
});

describe('翻橱（规格书 05 §5.7）', () => {
  it('位置数 5 + 5 × 星级；冷却 22 小时 + 随机，蟹老板 10 小时', () => {
    expect(flipSlots(0, f.flip)).toBe(5);
    expect(flipSlots(3, f.flip)).toBe(20);
    expect(flipCoolMs(false, sequenceRng([0]), f.flip)).toBe(22 * 3600_000);
    expect(flipCoolMs(true, sequenceRng([0]), f.flip)).toBe(10 * 3600_000);
    expect(flipCoolMs(false, sequenceRng([0.5]), f.flip)).toBe(24 * 3600_000);
  });
  it('被夹掉银币：100 × 等级 的一半 + 随机一半；低于 2 星减半；蟹老板店 = 星级 × 10', () => {
    expect(caughtCoin(10, 2, false, sequenceRng([0]), f.flip)).toBe(500);
    expect(caughtCoin(10, 1, false, sequenceRng([0]), f.flip)).toBe(250);
    expect(caughtCoin(10, 3, true, sequenceRng([0]), f.flip)).toBe(30);
  });
});

describe('交换（规格书 05 §5.6）', () => {
  it('手续费 = 单价 × 0.5 × 100/odds，锁定 ×2', () => {
    expect(exchangeFee({ coin: 100, odds: 50 }, false, f.exchange)).toBe(100);
    expect(exchangeFee({ coin: 100, odds: 50 }, true, f.exchange)).toBe(200);
  });
  it('次数（问题记录 479）：每天总共换 10 次、每天最多被换 20 次，不看星级；蟹老板 8 − 星级、最少 3', () => {
    expect(exchangeLimits(3, f.exchange)).toEqual({ total: 10, taken: 20, npc: 5 });
    expect(exchangeLimits(0, f.exchange)).toEqual({ total: 10, taken: 20, npc: 8 });
    // 星级能到 12（泛紫），以前 8 − 星级会变成负数、蟹老板一次都换不了
    expect(exchangeLimits(12, f.exchange).npc).toBe(3);
  });
  it('被抓后得银手镯的概率', () => {
    expect(bangleRate(3, 95, f.exchange)).toBeCloseTo(0.3 + 3 * 10 * 0.0006);
  });
});

describe('加油抽美味券（设计文档 裁定 4）', () => {
  it('油上限 ≥8000 时每 8000 油 2 次，否则每 4000 油 2 次', () => {
    expect(refuelDraws(16000, 20000, f.refuel)).toBe(4);
    expect(refuelDraws(7999, 20000, f.refuel)).toBe(0);
    expect(refuelDraws(4000, 6000, f.refuel)).toBe(2);
  });
});

describe('空桌（计划裁定 7）', () => {
  it('0 和 -3 且没有蟑螂、没有白食者才算空桌', () => {
    expect(isEmptyTable({ no: 1, floor: 1, customer: 0 })).toBe(true);
    expect(isEmptyTable({ no: 1, floor: 1, customer: -3 })).toBe(true);
    expect(isEmptyTable({ no: 1, floor: 1, customer: 1 })).toBe(false);
    expect(isEmptyTable({ no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } })).toBe(false);
    expect(clearTable({ no: 2, floor: 1, customer: 3, roach: { by: 1, at: 'x' } })).toEqual({
      no: 2,
      floor: 1,
      customer: 0,
    });
  });
});

describe('同一家店每人每天的次数（问题记录 374）', () => {
  it('剩几次 = 上限 - 已用，最少 0；上限 0 = 不限（null）', () => {
    expect(perHostLeft(3, 0)).toBe(3);
    expect(perHostLeft(3, 2)).toBe(1);
    expect(perHostLeft(3, 5)).toBe(0);
    expect(perHostLeft(0, 9)).toBeNull();
  });
});
