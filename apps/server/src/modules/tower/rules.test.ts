import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { DUEL_JUDGES } from '@dt/shared';
import {
  duel,
  duelPower,
  duelScores,
  judgeDuel,
  pickJudges,
  sumJudged,
  sumScores,
  type DuelAttrs,
} from './duel';
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
/** 固定的一组属性（原来的 1 层守塔人），不跟长老配置走 */
const small: DuelAttrs = { cook: 3, cutting: 3, fire: 3, season: 2, creatives: 2, luck: 0 };

describe('五项评分（问题记录 396）', () => {
  const d = t.duel;

  it('随机数 0.4：波动 = 创意 × 0.4 × (1 + 幸运率) × 0.4（问题记录 408 改成 0.4）；养 = 火候 0.2 + 调味 0.3 + 刀工 0.2', () => {
    // 创意 2、幸运 0：波动 0.32。色 3 香 2.2 味 2.5 形 3.3 养 1.8
    const s = duelScores({ name: '守', attrs: small, mcPrice: 0, dish: null }, d, sequenceRng([0.4]));
    expect(s).toEqual([3.3, 2.5, 2.8, 3.6, 2.1]);
    expect(sumScores(s)).toBe(14.3);
  });

  it('幸运 300（幸运率 0.3）让波动 × 1.3；幸运极低时系数不小于 0', () => {
    const lucky = duelScores(
      { name: 'a', attrs: { ...zero, creatives: 10, luck: 300 }, mcPrice: 0, dish: null },
      d,
      sequenceRng([0.5]),
    );
    expect(lucky).toEqual([2.6, 2.6, 2.6, 2.6, 2.6]);
    const cursed = duelScores(
      { name: 'a', attrs: { ...zero, creatives: 10, luck: -50000 }, mcPrice: 0, dish: null },
      d,
      sequenceRng([0.5]),
    );
    expect(cursed).toEqual([0, 0, 0, 0, 0]);
  });

  it('权重和波动系数按区服数值算', () => {
    const custom = {
      ...d,
      wave: 0,
      weights: d.weights.map(() => ({ cook: 1, cutting: 0, fire: 0, season: 0, mc: 1 })),
    };
    const s = duelScores(
      { name: 'a', attrs: { ...zero, cook: 7, creatives: 50 }, mcPrice: 2, dish: null },
      custom,
      sequenceRng([0.9]),
    );
    expect(s).toEqual([9, 9, 9, 9, 9]);
  });

  it('"养"加上特色菜每份价值 × 0.3；每项按顺序各抽一个随机数', () => {
    const s = duelScores(
      { name: 'a', attrs: { ...zero, creatives: 10 }, mcPrice: 50, dish: null },
      d,
      sequenceRng([0, 0, 0, 0, 1]),
    );
    expect(s).toEqual([0, 0, 0, 0, 19]);
  });
});

describe('评委（问题记录 396）', () => {
  it('从 10 位评委里不重复地抽 n 位；随机数全 0 时按顺序取前 n 位', () => {
    expect(pickJudges(5, sequenceRng([0]))).toEqual(DUEL_JUDGES.slice(0, 5).map((j) => j.id));
    // 第 i 位和 i + ⌊r × (10 − i)⌋ 位交换：9、3、7、3、7
    expect(pickJudges(5, sequenceRng([0.99, 0.3, 0.7, 0.1, 0.5]))).toEqual([
      'xiaoKai',
      'bro13',
      'gordon',
      'xiaoC',
      'wenjie',
    ]);
    expect(pickJudges(20, sequenceRng([0]))).toHaveLength(10);
  });

  it('每位评委比关注项目的和，高的一方得一票；先到 3 票就结束，后面的评委不上场', () => {
    // 我色、香高，对方味、形、养高
    const me = [10, 10, 0, 0, 0];
    const them = [0, 0, 5, 5, 5];
    const r = judgeDuel(me, them, ['joe', 'xiaoKai', 'gordon', 'fanDao', 'gary'], 3);
    expect(r.judges).toEqual([
      { id: 'joe', me: 20, them: 0 },
      { id: 'xiaoKai', me: 0, them: 10 },
      { id: 'gordon', me: 0, them: 10 },
      { id: 'fanDao', me: 10, them: 5 },
      { id: 'gary', me: 10, them: 5 },
    ]);
    expect(r.votes).toEqual([3, 2]);
    expect(r.win).toBe(true);
    const early = judgeDuel(me, them, ['xiaoKai', 'gordon', 'wenjie', 'joe', 'fanDao'], 3);
    expect(early.judges.map((j) => j.id)).toEqual(['xiaoKai', 'gordon', 'wenjie']);
    expect(early.votes).toEqual([0, 3]);
    expect(early.win).toBe(false);
  });

  it('评委给的分相同这一票谁都不得；票数持平时比上场评委的总分，总分也相同算挑战方赢', () => {
    const same = [5, 5, 5, 5, 5];
    const r = judgeDuel(same, same, ['joe', 'xiaoKai', 'gordon', 'fanDao', 'gary'], 3);
    expect(r.votes).toEqual([0, 0]);
    expect(r.judges).toHaveLength(5);
    expect(r.win).toBe(true);
    // 2:2，第五位平：我上场的分 8+0+4+0+8=20，对方 0+8+0+8+8=24，对方赢
    const r2 = judgeDuel(
      [4, 4, 0, 0, 0],
      [0, 0, 0, 0, 8],
      ['joe', 'xiaoKai', 'fanDao', 'gordon', 'bigEater'],
      3,
    );
    expect(r2.votes).toEqual([2, 2]);
    expect(r2.judges[4]).toEqual({ id: 'bigEater', me: 8, them: 8 });
    expect([sumJudged(r2.judges, 'me'), sumJudged(r2.judges, 'them')]).toEqual([20, 24]);
    expect(r2.win).toBe(false);
  });

  it('厨力 = 五项属性 + ⌊幸运/2⌋；duel 先算挑战方五项、再算对方、再抽评委', () => {
    expect(duelPower(small)).toBe(13);
    const r = duel(
      { name: '我', attrs: { ...zero, cook: 20, cutting: 20, fire: 20, season: 10 }, mcPrice: 0, dish: null },
      { name: '守', attrs: small, mcPrice: 0, dish: null },
      t.duel,
      sequenceRng([0.4]),
    );
    expect(r.win).toBe(true);
    expect(r.me.scores).toEqual([20, 13, 15, 22, 11]);
    expect(r.them).toEqual({ scores: [3.3, 2.5, 2.8, 3.6, 2.1], sum: 14.3 });
    expect(r.votes).toEqual([3, 0]);
    expect(r.judges).toHaveLength(3);
    // 这一局请了几位评委（规则说明按它写，backlog 396）：先到 3 票提前结束时上场的少于它
    expect(r.judgeCount).toBe(t.duel.judges);
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
    // 四、五级食材随机券常驻（问题记录 505：平时没有来路，用户 2026-10-08 定放声望商店）
    const common = [GOODS.dtTicket, gid('四级食材随机券'), gid('五级食材随机券')];
    expect(ids('2026-09-30')).toEqual([...common, gid('思想者-雕像'), gid('史前怪石-雕像')]);
    expect(ids('2026-10-05')).toEqual([...common, gid('恰克摩尔-雕像'), gid('破-雕像')]);
  });
  it('四级食材随机券 50 声望每周 3 张、五级 80 声望每周 2 张（问题记录 505）', () => {
    const row = (name: string) => config.bundle.renownShop.find((x) => x.goodsId === gid(name));
    expect(row('四级食材随机券')).toMatchObject({
      renown: 50,
      weeklyLimit: 3,
      rare: false,
      weekGroup: 0,
      require: null,
    });
    expect(row('五级食材随机券')).toMatchObject({
      renown: 80,
      weeklyLimit: 2,
      rare: false,
      weekGroup: 0,
      require: null,
    });
  });
});
