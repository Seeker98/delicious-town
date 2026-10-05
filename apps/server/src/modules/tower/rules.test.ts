import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { duel, duelPower, duelScores, duelWin, sumScores, type DuelAttrs } from './duel';
import {
  duelRenown,
  duelTier,
  floorUnlocked,
  isoWeek,
  rankChallengeError,
  rankGift,
  rankOccupyError,
  shopOnSale,
  sparAward,
  towerDailyTotal,
  towerNight,
  towerRenown,
  towerStrength,
} from './rules';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

const config = testConfig();
const t = config.tuning.tower;
const zero: DuelAttrs = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const floor1 = config.towerFloors.get(1)!;

describe('五项评分（规格书 11.1）', () => {
  it('1 层守塔人，随机数 0.4：每项先判正（0.4 < 0.5），波动 = (创意×0.4+1)×1.1×0.4', () => {
    const s = duelScores({ name: '守', attrs: floor1.attrs, mcPrice: 0 }, sequenceRng([0.4]));
    expect(s).toEqual([3.8, 3.9, 3.3, 4.1, 1.9]);
    expect(sumScores(s)).toBe(17);
  });

  it('第一个随机数 ≥ 0.5 时再抽一个比幸运率：没中为负，负数记 0', () => {
    expect(duelScores({ name: 'a', attrs: zero, mcPrice: 0 }, sequenceRng([0.6]))).toEqual([0, 0, 0, 0, 0]);
  });

  it('幸运 700（幸运率 0.4）时第二个随机数 0.3 为正', () => {
    const s = duelScores(
      { name: 'a', attrs: { ...zero, luck: 700 }, mcPrice: 0 },
      sequenceRng([0.6, 0.3, 0.4]),
    );
    expect(s).toEqual([0.4, 0.4, 0.4, 0.4, 0.4]);
  });

  it('"养"加上特色菜每份价值 × 0.6', () => {
    const s = duelScores({ name: 'a', attrs: zero, mcPrice: 50 }, sequenceRng([0.4]));
    expect(s[4]).toBe(30.4);
  });

  it('胜负：赢 ≥ 4 项；赢 3 项时五项总和 ≥ 对方；平项不算赢', () => {
    expect(duelWin([5, 5, 5, 5, 1], [4, 4, 4, 4, 9])).toBe(true);
    expect(duelWin([5, 5, 5, 1, 1], [4, 4, 4, 9, 9])).toBe(false);
    expect(duelWin([5, 5, 5, 1, 1], [4, 4, 4, 2, 2])).toBe(true);
    expect(duelWin([5, 5, 5, 0, 0], [4, 4, 4, 1.5, 1.5])).toBe(true);
    expect(duelWin([5, 5, 5, 5, 5], [5, 5, 5, 5, 5])).toBe(false);
  });

  it('厨力 = 五项属性 + ⌊幸运/2⌋；duel 按顺序先算挑战方', () => {
    expect(duelPower(floor1.attrs)).toBe(13);
    const r = duel(
      { name: '我', attrs: { ...zero, cook: 20, cutting: 20, fire: 20, season: 10 }, mcPrice: 0 },
      { name: '守', attrs: floor1.attrs, mcPrice: 0 },
      sequenceRng([0.4]),
    );
    expect(r.win).toBe(true);
    expect(r.me.scores).toEqual([20.4, 19.4, 15.4, 22.4, 7.4]);
    expect(r.them).toEqual({ scores: [3.8, 3.9, 3.3, 4.1, 1.9], sum: 17 });
  });
});

describe('厨塔（设计文档 §3.2）', () => {
  it('体力 = 层 + 4，试打 1；每日总次数 = 5 + 挑战券；声望 胜 层+6 / 负 6', () => {
    expect(towerStrength(1, false, t)).toBe(5);
    expect(towerStrength(10, false, t)).toBe(14);
    expect(towerStrength(10, true, t)).toBe(1);
    expect(towerDailyTotal(0, t)).toBe(5);
    expect(towerDailyTotal(2, t)).toBe(7);
    expect(towerRenown(3, true, t)).toBe(9);
    expect(towerRenown(3, false, t)).toBe(6);
  });

  it('解锁：等级 ≥ 最低等级，且打赢过下一层（1 层不要求）', () => {
    const f2 = config.towerFloors.get(2)!;
    expect(floorUnlocked(floor1, 1, 0)).toBe(true);
    expect(floorUnlocked(f2, 10, 1)).toBe(false);
    expect(floorUnlocked(f2, 11, 0)).toBe(false);
    expect(floorUnlocked(f2, 11, 1)).toBe(true);
    expect(floorUnlocked(f2, 50, 9)).toBe(true);
  });

  it('夜间：4 层以上 0~5 点不能挑战', () => {
    expect(towerNight(4, 5, t)).toBe(true);
    expect(towerNight(4, 6, t)).toBe(false);
    expect(towerNight(3, 0, t)).toBe(false);
  });
});

describe('切磋（设计文档裁定 7、8）', () => {
  it('奖励：本次之前 < 10 次 2 次等级 4；< 20 次 2 次等级 2；之后 1 次等级 2', () => {
    expect(sparAward(0, t)).toEqual({ times: 2, level: 4 });
    expect(sparAward(9, t)).toEqual({ times: 2, level: 4 });
    expect(sparAward(10, t)).toEqual({ times: 2, level: 2 });
    expect(sparAward(19, t)).toEqual({ times: 2, level: 2 });
    expect(sparAward(20, t)).toEqual({ times: 1, level: 2 });
    expect(sparAward(100, t)).toEqual({ times: 1, level: 2 });
  });

  it('三档：对方 > 我×1.15 以弱胜强，< 我×0.7 以强凌弱', () => {
    expect(duelTier(70, 81, t)).toBe('strong');
    expect(duelTier(70, 80, t)).toBe('normal');
    expect(duelTier(70, 49, t)).toBe('normal');
    expect(duelTier(70, 48, t)).toBe('weak');
  });

  it('声望：普通胜 +5，满 20 次 +2，满 50 次 0；负声望照扣；以弱胜强不受上限', () => {
    expect(duelRenown('normal', true, 0, t)).toBe(5);
    expect(duelRenown('normal', true, 20, t)).toBe(2);
    expect(duelRenown('normal', true, 50, t)).toBe(0);
    expect(duelRenown('normal', false, 50, t)).toBe(-2);
    expect(duelRenown('strong', true, 60, t)).toBe(6);
    expect(duelRenown('strong', false, 0, t)).toBe(-2);
    expect(duelRenown('weak', true, 0, t)).toBe(0);
    expect(duelRenown('weak', false, 0, t)).toBe(-3);
  });
});

describe('赛厨榜（设计文档 §3.3）', () => {
  it('挑战：只能往前；前 8 名要在榜上且名次差 ≤ 3', () => {
    expect(rankChallengeError(null, 10, t)).toBeNull();
    expect(rankChallengeError(null, 8, t)).toEqual({ reason: 'rank_gap', need: 11 });
    expect(rankChallengeError(5, 1, t)).toEqual({ reason: 'rank_gap', need: 4 });
    expect(rankChallengeError(4, 1, t)).toBeNull();
    expect(rankChallengeError(3, 5, t)).toEqual({ reason: 'rank_not_better' });
    expect(rankChallengeError(5, 5, t)).toEqual({ reason: 'rank_not_better' });
  });

  it('占位：没上榜随便占；在榜上只能往前', () => {
    expect(rankOccupyError(null, 1)).toBeNull();
    expect(rankOccupyError(4, 2)).toBeNull();
    expect(rankOccupyError(4, 6)).toBe('rank_not_better');
    expect(rankOccupyError(4, 4)).toBe('rank_not_better');
  });

  it('名次礼包：1、2、3 名各一档，4~8 名、9~15 名各一档', () => {
    expect([1, 2, 3, 4, 8, 9, 15, 16].map((r) => rankGift(r, t))).toEqual([
      ...['赛厨第1名礼包', '赛厨第2名礼包', '赛厨第3名礼包', '赛厨第4-8名礼包', '赛厨第4-8名礼包'].map(gid),
      ...['赛厨第9-15名礼包', '赛厨第9-15名礼包'].map(gid),
      null,
    ]);
  });
});

describe('声望商店（设计文档 §3.5）', () => {
  it('ISO 周数', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-09-28')).toBe(40);
    expect(isoWeek('2026-10-04')).toBe(40);
    expect(isoWeek('2026-10-05')).toBe(41);
    expect(isoWeek('2021-01-03')).toBe(53);
  });

  it('本周在售：常驻且没有前置条件的，加上 ISO 周数 % 4 + 1 组的雕像', () => {
    const ids = (day: string) => shopOnSale(config.bundle.renownShop, day).map((x) => x.goodsId);
    expect(ids('2026-09-30')).toEqual([GOODS.dtTicket, gid('思想者-雕像'), gid('史前怪石-雕像')]);
    expect(ids('2026-10-05')).toEqual([GOODS.dtTicket, gid('恰克摩尔-雕像'), gid('破-雕像')]);
  });
});
