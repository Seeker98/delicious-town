import { describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  addRiderExp,
  awardWeights,
  claimExp,
  customerRate,
  droneDiamonds,
  FAIL_REASONS,
  fl,
  orderValues,
  pickAward,
  pickGrade,
  publicTarget,
  riderAttrs,
  riderCapAfter,
  riderExpGain,
  rollOrder,
  sumBonus,
  takeawayPeriod,
} from './rules';
import { cid, gid } from '../../../test/items';
import { GOODS } from '@dt/config';

const t = testConfig().tuning.takeaway;

describe('出单（设计文档 §3.2）', () => {
  it('品级按概率：普通 40%、中品 25%、上品 15%、极品 10%、金牌 5%、珍品 3.5%、佳肴 1.5%', () => {
    expect([0, 0.3, 0.5, 0.7, 0.85, 0.92, 0.96, 0.99, 0.9999].map((r) => pickGrade(r, t))).toEqual([
      1, 1, 2, 3, 4, 5, 6, 7, 7,
    ]);
  });

  it('一张单：食谱 → 品级 → 时长 20+rand(10g) → 有效期 时长+rand(10g) → 声望 2g+rand[1,g]', () => {
    expect(rollOrder(sequenceRng([0.4]), [1, 2, 3, 4, 5], t)).toEqual({
      cookbookId: cid('聊城熏鸡'),
      grade: 2,
      needMinutes: 28,
      expireMinutes: 36,
      needRenown: 5,
    });
    expect(rollOrder(sequenceRng([0.1]), [1, 2, 3, 4, 5], t)).toEqual({
      cookbookId: cid('南煎丸子'),
      grade: 1,
      needMinutes: 21,
      expireMinutes: 22,
      needRenown: 3,
    });
  });

  it('公共单目标数 = rand(18) + 5 + ⌊营业店/15⌋，营业店不足 10 按 30', () => {
    expect(publicTarget(5, 0, t)).toBe(7);
    expect(publicTarget(45, 17, t)).toBe(25);
  });

  it('整点周期', () => {
    expect(takeawayPeriod(gameTime('2026-09-30', 7, 30))).toBe('2026-09-30 07');
  });
});

describe('骑手（设计文档 §3.5）', () => {
  it('属性由等级算出', () => {
    expect(riderAttrs(1, t)).toEqual({
      timeSub: 0,
      expAdd: 0,
      coinAdd: 0,
      renownAdd: 0,
      odds: 800,
      maxNum: 1,
      needExp: 1300,
    });
    expect(riderAttrs(11, t)).toEqual({
      timeSub: 10,
      expAdd: 20,
      coinAdd: 10,
      renownAdd: 5,
      odds: 850,
      maxNum: 3,
      needExp: 97300,
    });
    expect(riderAttrs(50, t)).toMatchObject({ timeSub: 40, odds: 950, maxNum: 11 });
  });

  it('升级可以连升；50 级封顶，经验不再增加', () => {
    expect(addRiderExp(1, 0, 6, t)).toEqual({ level: 1, exp: 6, gained: 0 });
    expect(addRiderExp(1, 1000, 5000, t)).toEqual({ level: 3, exp: 1000, gained: 2 });
    expect(addRiderExp(49, 0, 10_000_000, t)).toEqual({ level: 50, exp: 0, gained: 1 });
    expect(addRiderExp(50, 5, 100, t)).toEqual({ level: 50, exp: 5, gained: 0 });
  });

  it('自己的骑手升到 2、5、8 级时可雇上限 +1', () => {
    expect(riderCapAfter(1, 1, 3, t)).toBe(2);
    expect(riderCapAfter(2, 4, 9, t)).toBe(4);
    expect(riderCapAfter(4, 9, 20, t)).toBe(4);
  });
});

describe('接单时的数值（设计文档 §3.3）', () => {
  it('售价 750、单品级 1、我的品级 1、1 级店、1 级骑手、没有加成', () => {
    expect(
      orderValues(
        {
          price: 750,
          grade: 1,
          myGrade: 1,
          level: 1,
          needMinutes: 30,
          rider: riderAttrs(1, t),
          bonus: {},
          luckRate: 0,
          floatRoll: 80,
        },
        t,
      ),
    ).toEqual({ minutes: 30, coin: 198, exp: 13, renown: 1, odds: 820 });
  });

  it('售价过 100 万用低系数；骑手、天气、加成都算进去；时长按减时修正（设计文档裁定 5）', () => {
    expect(
      orderValues(
        {
          price: 2_000_000,
          grade: 2,
          myGrade: 5,
          level: 10,
          needMinutes: 40,
          rider: riderAttrs(11, t),
          bonus: sumBonus(
            { taNeedtimeRate: 0.5, taCoinRate: 0.1 },
            { taExpRate: 0.2, taRenownRate: 1, taSuccessoddsRate: -0.3 },
          ),
          luckRate: 0.4,
          floatRoll: 0,
        },
        t,
      ),
    ).toEqual({ minutes: 56, coin: 360000, exp: 410666, renown: 4, odds: 730 });
  });

  it('时长最少 1 分钟', () => {
    const v = orderValues(
      {
        price: 750,
        grade: 1,
        myGrade: 1,
        level: 1,
        needMinutes: 20,
        rider: riderAttrs(1, t),
        bonus: { taNeedtimeRate: -2 },
        luckRate: 0,
        floatRoll: 0,
      },
      t,
    );
    expect(v.minutes).toBe(1);
  });

  it('sumBonus 按键相加', () => {
    expect(sumBonus({ a: 1, b: 0.5 }, { b: 0.25 }, {})).toEqual({ a: 1, b: 0.75 });
  });
});

describe('结算（设计文档 §3.4、§3.6）', () => {
  it('奖池：品级越高礼券以外越多', () => {
    expect(awardWeights(1, t)).toEqual([
      [1, 56],
      [gid('探险图'), 30],
      [gid('蟹币'), 8],
      [GOODS.mapHigh, 6],
      [gid('顶级探险图'), 2],
      [GOODS.dtTicket, 1],
    ]);
    expect(awardWeights(3, t).map(([, w]) => fl(w * 10) / 10)).toEqual([56, 42, 16, 12, 5.2, 3]);
    expect(pickAward(0.4, 1, t)).toBe(1);
    expect(pickAward(0.99, 1, t)).toBe(172);
    expect(pickAward(0.999, 1, t)).toBe(310);
  });

  it('经验：加料 ×2、好友骑手 ×0.9、私人单 ×1.5（逐步取整）', () => {
    expect(claimExp(13, { double: false, friend: false, private: false }, t)).toBe(13);
    expect(claimExp(13, { double: true, friend: true, private: true }, t)).toBe(34);
  });

  it('骑手经验 = √(10g)×2×(失败×2)×(无人机×2)×(神秘食材种数+1)×(1+加成)', () => {
    expect(riderExpGain({ grade: 1, fail: false, drone: false, kinds: 0, rate: 0 })).toBe(6);
    expect(riderExpGain({ grade: 4, fail: true, drone: true, kinds: 1, rate: 3 })).toBe(404);
  });

  it('无人机钻石 2g+1；神秘顾客概率 1.5% + 幸运率/50；失败原因 8 句', () => {
    expect(droneDiamonds(3)).toBe(7);
    expect(customerRate(0.2, t)).toBeCloseTo(0.019, 10);
    expect(FAIL_REASONS).toHaveLength(8);
    expect(FAIL_REASONS[7]).toBe('顾客退单了!');
  });

  it('fl 先加一点点再取整', () => {
    expect(fl(197.99999999999997)).toBe(198);
    expect(fl(13.2)).toBe(13);
  });
});
