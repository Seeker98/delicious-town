import { describe, expect, it } from 'vitest';
import { EQUIP_ATTRS } from '@dt/config';
import { testConfig } from '../../../test/config';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs } from '../equip/rules';
import { suitEffect } from '../equip/power';
import { gainReachable } from '@dt/config';
import { ELDER_SPECS, assignSteps, expectedBase, splitInt } from '../../sim/elders';
import { duelPower } from './duel';

const config = testConfig();

describe('赛厨长老（问题记录 408）', () => {
  it('配置算出的长老属性和玩家同一套算法（加点 + 厨具 → 套装百分比 → 防守加成；幸运 = 等级幸运 + 厨具 + 套装）一致', () => {
    for (const f of config.towerFloors.values()) {
      const e = f.elder;
      const points = { ...zeroAttrs(), ...e.points, luck: config.tuning.rest.luckPerLevel * (e.level - 1) };
      const gear = e.pieces.reduce((acc, p) => addAttrs(acc, addAttrs(p.base, p.gain)), zeroAttrs());
      const list = activeSuits(
        e.pieces.map((p) => config.requireGoods(p.id).equip!.suitId),
        config.suits,
      );
      const { total } = attrSummary(points, gear, suitPct(list));
      const def = (k: string) => 1 + suitEffect(list, k);
      const attrs = {
        ...total,
        cook: Math.round(total.cook * def('defendCook')),
        cutting: Math.round(total.cutting * def('defendCutting')),
        fire: Math.round(total.fire * def('defendFire')),
        luck: points.luck + gear.luck + suitEffect(list, 'luckValue'),
      };
      expect(f.attrs, `${f.floor} 层`).toEqual(attrs);
      expect(f.power).toBe(duelPower(attrs));
    }
  });

  it('每层按用户定的等级、强化、套装：1 层 8 级见习 +3，9 层阿卡玛 +6，6 层度玛配巴贝雷特的铲刃、只掉度玛', () => {
    const spec = (n: number) => config.towerFloors.get(n)!.elder;
    expect([spec(1).level, spec(1).stress]).toEqual([8, 3]);
    expect([spec(9).level, spec(9).stress]).toEqual([87, 6]);
    expect(spec(6).pieces.map((p) => p.id)).toEqual(ELDER_SPECS[5]!.ids);
    expect(spec(6).drops).toEqual([40301, 40302, 40303]);
    for (const s of ELDER_SPECS) {
      const e = spec(s.floor);
      expect([e.level, e.stress, e.drops], `${s.floor} 层`).toEqual([s.level, s.stress, s.drops]);
      expect(e.pieces.map((p) => p.id)).toEqual(s.ids);
      // 厨具基础按期望（生成器重跑不会改基础，只改强化和加点的分配）
      for (const p of e.pieces) expect(p.base).toEqual(expectedBase(config, p.id));
    }
  });

  it('生成器：按比例分整数用最大余数法；厨具基础期望沿部位顺序约一半一半', () => {
    expect(splitInt(10, { a: 0.25, b: 0.25, c: 0.5 }, ['a', 'b', 'c'])).toEqual({ a: 3, b: 2, c: 5 });
    expect(splitInt(7, { a: 1 / 3, b: 1 / 3, c: 1 / 3 }, ['a', 'b', 'c'])).toEqual({ a: 3, b: 2, c: 2 });
    // 巴贝雷特之铲：总量 31，铲的顺序是厨艺、刀工、火候、调味、幸运、创意
    expect(expectedBase(config, 40401)).toEqual({
      cook: 16,
      cutting: 8,
      fire: 4,
      season: 2,
      luck: 1,
      creatives: 0,
    });
    // 固定属性的厨具照抄
    const sh = expectedBase(config, 40201);
    expect(EQUIP_ATTRS.map((k) => sh[k])).toEqual([21, 0, 0, 0, 0, 0]);
  });

  it('生成器分强化增量：每一级整份给离目标份额差最多的一项，结果总能通过 gainReachable', () => {
    const ratio = { cook: 0, cutting: 0, fire: 0, season: 0.6, creatives: 0.3, luck: 0.1 };
    const steps = [4, 4, 6, 6, 8, 8];
    const g = assignSteps(steps, ratio);
    expect(g).toEqual({ cook: 0, cutting: 0, fire: 0, season: 22, creatives: 10, luck: 4 });
    expect(gainReachable(steps, g)).toBe(true);
  });
});
