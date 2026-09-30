import { describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  actionRate,
  applyLandExp,
  canStealLeft,
  canWater,
  composeExtra,
  dryWaterMinutes,
  feedUseful,
  formulaAppraiseRate,
  formulaPart,
  harvestNumOf,
  landBonus,
  landExpNeed,
  landPrice,
  minutesLeft,
  seedPrice,
  stealNum,
  tickPlant,
  yardPeriod,
  type PlantState,
} from './rules';

const t = testConfig().tuning.yard;
const e = t.events;
const day = '2026-09-30';
const at = (h: number, m = 0) => gameTime(day, h, m);
/** 大米：幼年 24、育苗 36、成长 60、收获期 1440 分钟，产量 20；12:00 进入幼年期 */
const plant = (patch: Partial<PlantState> = {}): PlantState => ({
  stage: 1,
  stage_at: at(12),
  feed_min: 0,
  infancy: 24,
  maturity: 36,
  autumn: 60,
  harvest: 1440,
  harvest_num: 20,
  worm: 0,
  grass: 0,
  dry: 0,
  ...patch,
});
/** 6 个随机数依次是：虫吃、草吃、长草、干涸加重、开始干涸、长虫（计划裁定 2） */
const rolls = (...r: number[]) => sequenceRng([...r, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99].slice(0, 6));
const calm = () => rolls();

describe('土地（规格书 08 §8.1，裁定 2）', () => {
  it('升级所需经验 (L−1)²×2000+1000；逐级扣除，可以连升', () => {
    expect(landExpNeed(1)).toBe(1000);
    expect(landExpNeed(2)).toBe(3000);
    expect(applyLandExp(1, 990, 20, 10)).toEqual({ level: 2, exp: 10 });
    expect(applyLandExp(1, 0, 4005, 10)).toEqual({ level: 3, exp: 5 });
  });

  it('满级后不再升级，经验归 0（计划裁定 5）', () => {
    expect(applyLandExp(9, 128_990, 20, 10)).toEqual({ level: 10, exp: 0 });
    expect(applyLandExp(10, 0, 20, 10)).toEqual({ level: 10, exp: 0 });
  });

  it('产量加成每级 8%；第 n 块地 50,000 × 2ⁿ；产量向下取整', () => {
    expect(landBonus(1, t)).toBe(0);
    expect(landBonus(10, t)).toBe(72);
    expect(landPrice(1, t)).toBe(100_000);
    expect(landPrice(9, t)).toBe(25_600_000);
    expect(harvestNumOf(20, 8)).toBe(21);
    expect(harvestNumOf(6, 72)).toBe(10);
  });
});

describe('作物（规格书 08 §8.3）', () => {
  it('能否浇水：本阶段时长 − 施肥抵扣 到了才行；收获期、枯叶期不能', () => {
    expect(canWater(plant(), at(12, 23))).toBe(false);
    expect(canWater(plant(), at(12, 24))).toBe(true);
    expect(canWater(plant({ feed_min: 20 }), at(12, 4))).toBe(true);
    expect(canWater(plant({ stage: 4 }), at(23))).toBe(false);
    expect(canWater(plant({ stage: 5 }), at(23))).toBe(false);
  });

  it('剩余分钟：生长期到能浇水、收获期到枯萎，向上取整；枯叶期 0', () => {
    expect(minutesLeft(plant(), new Date(at(12).getTime() + 30_000))).toBe(24);
    expect(minutesLeft(plant(), at(13))).toBe(0);
    expect(minutesLeft(plant({ stage: 4 }), at(13))).toBe(1380);
    expect(minutesLeft(plant({ stage: 5 }), at(13))).toBe(0);
  });

  it('干涸浇水：本阶段 −5 分钟，低于种子原时长一半时不减', () => {
    expect(dryWaterMinutes(24, 24, t)).toBe(19);
    expect(dryWaterMinutes(17, 24, t)).toBe(12);
    expect(dryWaterMinutes(16, 24, t)).toBe(16);
  });

  it('施肥：本阶段时长 − 已抵扣 − 本次分钟 > 0 才有用；收获期不能施肥', () => {
    expect(feedUseful(plant({ stage: 3 }), 20)).toBe(true);
    expect(feedUseful(plant({ stage: 1 }), 60)).toBe(false);
    expect(feedUseful(plant({ stage: 3, feed_min: 40 }), 20)).toBe(false);
    expect(feedUseful(plant({ stage: 4 }), 20)).toBe(false);
  });

  it('偷菜：剩余 ≥ 种子原产量 × 0.7；7 级只偷 1；其他 1~2 个，不超过剩余', () => {
    expect(canStealLeft(14, 20, t)).toBe(true);
    expect(canStealLeft(13, 20, t)).toBe(false);
    expect(stealNum(7, 5, sequenceRng([0.9]), t)).toBe(1);
    expect(stealNum(1, 5, sequenceRng([0.9]), t)).toBe(2);
    expect(stealNum(1, 5, sequenceRng([0.1]), t)).toBe(1);
    expect(stealNum(1, 1, sequenceRng([0.9]), t)).toBe(1);
  });

  it('动作收益系数：等级 × 2 × (自己的地 2 : 1) + 1', () => {
    expect(actionRate(1, true)).toBe(5);
    expect(actionRate(3, false)).toBe(7);
  });
});

describe('自然事件周期（裁定 11）', () => {
  it('白天取最近一个已到的 07 / 27 / 47 分', () => {
    expect(yardPeriod(at(13, 30), e)).toBe(`${day}@13:27`);
    expect(yardPeriod(at(13, 7), e)).toBe(`${day}@13:07`);
    expect(yardPeriod(at(13, 5), e)).toBe(`${day}@12:47`);
  });

  it('夜里（22 点到次日 6 点）只有 27 分；跨天取前一天', () => {
    expect(yardPeriod(at(23, 10), e)).toBe(`${day}@22:27`);
    expect(yardPeriod(at(22, 20), e)).toBe(`${day}@21:47`);
    expect(yardPeriod(at(7, 5), e)).toBe(`${day}@06:27`);
    expect(yardPeriod(at(0, 10), e)).toBe('2026-09-29@23:27');
  });
});

describe('自然事件（规格书 08 §8.4，裁定 3，计划裁定 2）', () => {
  it('收获期过了 → 枯叶期，干涸清零', () => {
    const r = tickPlant(
      plant({ stage: 4, stage_at: gameTime('2026-09-29', 11), dry: 3 }),
      false,
      at(12),
      calm(),
      e,
    );
    expect(r.next).toMatchObject({ stage: 5, dry: 0 });
    expect(r.changed).toBe(true);
  });

  it('有虫：rand < 0.2 减产 1；减到 0 → 枯叶期', () => {
    expect(
      tickPlant(plant({ worm: 1, harvest_num: 5 }), false, at(12, 1), rolls(0.1), e).next.harvest_num,
    ).toBe(4);
    expect(
      tickPlant(plant({ worm: 1, harvest_num: 5 }), false, at(12, 1), rolls(0.3), e).next.harvest_num,
    ).toBe(5);
    expect(tickPlant(plant({ worm: 1, harvest_num: 1 }), false, at(12, 1), rolls(0.1), e).next).toMatchObject(
      {
        stage: 5,
        harvest_num: 0,
      },
    );
  });

  it('有草：rand < 0.03 × 草数 减产', () => {
    expect(tickPlant(plant({ grass: 2 }), false, at(12, 1), rolls(0.99, 0.05), e).next.harvest_num).toBe(19);
    expect(tickPlant(plant({ grass: 1 }), false, at(12, 1), rolls(0.99, 0.05), e).next.harvest_num).toBe(20);
  });

  it('不下雨且干涸 ≥ 100 → 枯叶期；下雨时不会干死', () => {
    expect(tickPlant(plant({ dry: 100 }), false, at(12, 1), calm(), e).next.stage).toBe(5);
    const rain = tickPlant(plant({ dry: 100 }), true, at(12, 1), calm(), e);
    expect(rain.next).toMatchObject({ stage: 1, dry: 100 });
    expect(rain.changed).toBe(false);
  });

  it('长草：不下雨时概率 ×3（0.024），下雨时 0.008', () => {
    expect(tickPlant(plant(), false, at(12, 1), rolls(0.99, 0.99, 0.02), e).next.grass).toBe(1);
    expect(tickPlant(plant(), true, at(12, 1), rolls(0.99, 0.99, 0.02), e).next.grass).toBe(0);
  });

  it('干涸加重：rand < 0.1 时不下雨 +1（有草 +2），下雨清零', () => {
    const r = rolls(0.99, 0.99, 0.99, 0.05);
    expect(tickPlant(plant({ dry: 5 }), false, at(12, 1), r, e).next.dry).toBe(6);
    expect(
      tickPlant(plant({ dry: 5, grass: 1 }), false, at(12, 1), rolls(0.99, 0.99, 0.99, 0.05), e).next.dry,
    ).toBe(7);
    expect(tickPlant(plant({ dry: 5 }), true, at(12, 1), rolls(0.99, 0.99, 0.99, 0.05), e).next.dry).toBe(0);
    expect(tickPlant(plant({ dry: 5 }), false, at(12, 1), rolls(0.99, 0.99, 0.99, 0.5), e).next.dry).toBe(5);
  });

  it('开始干涸：不下雨、没干涸，rand < 0.002（有草 0.01）', () => {
    const roll = () => rolls(0.99, 0.99, 0.99, 0.99, 0.005);
    expect(tickPlant(plant(), false, at(12, 1), roll(), e).next.dry).toBe(0);
    expect(tickPlant(plant({ grass: 1 }), false, at(12, 1), roll(), e).next.dry).toBe(1);
    expect(tickPlant(plant({ grass: 1 }), true, at(12, 1), roll(), e).next.dry).toBe(0);
  });

  it('长虫：没虫时 rand < 0.003', () => {
    expect(
      tickPlant(plant(), false, at(12, 1), rolls(0.99, 0.99, 0.99, 0.99, 0.99, 0.001), e).next.worm,
    ).toBe(1);
  });

  it('下雨自动进入下一阶段：生长期、无虫无草、到了浇水时间', () => {
    const r = tickPlant(plant(), true, at(12, 30), calm(), e);
    expect(r.next).toMatchObject({ stage: 2, stage_at: at(12, 30), feed_min: 0 });
    expect(r.changed).toBe(true);
    expect(tickPlant(plant({ stage: 3 }), true, at(13, 30), calm(), e).next.stage).toBe(4);
    expect(tickPlant(plant({ worm: 1 }), true, at(12, 30), calm(), e).next.stage).toBe(1);
    expect(tickPlant(plant(), false, at(12, 30), calm(), e).next.stage).toBe(1);
    expect(tickPlant(plant(), true, at(12, 10), calm(), e).next.stage).toBe(1);
    expect(tickPlant(plant({ stage: 4 }), true, at(12, 30), calm(), e).next.stage).toBe(4);
  });

  it('什么都没发生时 changed = false', () => {
    expect(tickPlant(plant(), false, at(12, 30), calm(), e).changed).toBe(false);
  });
});

describe('配方（规格书 09 §9.3、08 §8.5）', () => {
  it('鉴定成功率 = 道具 formulaRate + 幸运率 × 0.1 + 星月密卷', () => {
    expect(formulaAppraiseRate(0.25, 0.1, 0.1, t)).toBeCloseTo(0.36);
    expect(formulaAppraiseRate(0.25, 0, 0, t)).toBeCloseTo(0.25);
  });

  it('主碎片 rand < 0.25；星月密卷在已有辅碎片（或已学）时把辅碎片按 secToMain 转成主碎片', () => {
    expect(formulaPart(sequenceRng([0.1]), null, false, t)).toEqual({ part: 'main', upgraded: false });
    expect(formulaPart(sequenceRng([0.5]), null, true, t)).toEqual({ part: 'sub', upgraded: false });
    expect(formulaPart(sequenceRng([0.5, 0.1]), { secToMain: 0.2 }, true, t)).toEqual({
      part: 'main',
      upgraded: true,
    });
    expect(formulaPart(sequenceRng([0.5, 0.1]), { secToMain: 0.2 }, false, t)).toEqual({
      part: 'sub',
      upgraded: false,
    });
  });

  it('合成额外产出：每份 rand < 0.1 +1、rand < 幸运率/5 +1、有星神之泪 rand < 0.25 +1', () => {
    expect(composeExtra(2, 0, null, sequenceRng([0.05, 0.99, 0.99, 0.99]), t)).toBe(1);
    expect(composeExtra(1, 0.5, 0.25, sequenceRng([0.99, 0.05, 0.2]), t)).toBe(2);
    expect(composeExtra(3, 0, null, sequenceRng([0.99]), t)).toBe(0);
  });

  it('种子单价 = ⌈coin × seedPriceRate⌉（计划裁定 6）', () => {
    expect(seedPrice(1800, t)).toBe(1800);
    expect(seedPrice(1801, { ...t, seedPriceRate: 1.5 })).toBe(2702);
  });
});
