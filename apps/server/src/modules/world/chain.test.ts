import { seededRng } from '@dt/shared';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { chainRow, compassRow, drawLots, stayOf, typeShares, weatherScore } from './chain';

const config = testConfig();
const chain = config.bundle.weatherChain;
const W = config.weather;
const id = (name: string) => [...W.values()].find((w) => w.name === name)!.id;
const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('天气链（天气改版设计 §1）', () => {
  it('每种天气、白天夜间的下一轮概率加起来都是 1，只出这一时段允许的天气', () => {
    for (const w of W.values())
      for (const night of [false, true]) {
        const row = chainRow(chain, W, w.id, night);
        expect(sum(row), `${w.name} ${night ? '夜' : '昼'}`).toBeCloseTo(1, 9);
        for (const k of row.keys()) expect((night ? [2, 3] : [1, 3]).includes(W.get(k)!.daytime)).toBe(true);
      }
  });

  it('晴天不会直接转雪冰类；特大暴雨只能从大雨、暴雨一级级升上来', () => {
    expect(typeShares(chainRow(chain, W, id('晴'), false), W)[3]).toBe(0);
    expect(chainRow(chain, W, id('小雨'), false).get(id('特大暴雨')) ?? 0).toBe(0);
    expect(chainRow(chain, W, id('中雨'), false).get(id('特大暴雨')) ?? 0).toBe(0);
    expect(chainRow(chain, W, id('暴雨'), false).get(id('特大暴雨')) ?? 0).toBeGreaterThan(0);
  });

  it('特殊天气只从前兆来，而且只持续一轮；虹只在白天由雨转晴时出', () => {
    expect(chainRow(chain, W, id('特大暴雨'), false).get(id('雷暴')) ?? 0).toBeGreaterThan(0);
    expect(chainRow(chain, W, id('晴'), false).get(id('雷暴')) ?? 0).toBe(0);
    expect(chainRow(chain, W, id('霾'), false).get(id('酸雨')) ?? 0).toBeGreaterThan(0);
    expect(stayOf(chain, W.get(id('雷暴'))!)).toBe(0);
    expect(chainRow(chain, W, id('雷暴'), false).get(id('雷暴')) ?? 0).toBe(0);
    expect(chainRow(chain, W, id('小雨'), false).get(id('虹')) ?? 0).toBeGreaterThan(0);
    expect(chainRow(chain, W, id('小雨'), true).get(id('虹')) ?? 0).toBe(0);
    expect(chainRow(chain, W, id('晴'), false).get(id('虹')) ?? 0).toBe(0);
  });

  it('好天气更容易留下；跨过日夜分界时留下的是对应天气（晴 → 夜间晴）', () => {
    const fog = chainRow(chain, W, id('雾'), false);
    const haze = chainRow(chain, W, id('霾'), false);
    expect(fog.get(id('雾'))!).toBeGreaterThan(haze.get(id('霾'))!);
    const night = chainRow(chain, W, id('晴'), true);
    expect(night.get(id('晴')) ?? 0).toBe(0);
    expect(night.get(id('夜间晴'))!).toBeGreaterThanOrEqual(0.4);
  });

  it('stayFixed 写了的天气按它，不看经营分：霾公式分过 95 也只留 0.1（天气加算修正 2026-10-16）', () => {
    const haze = W.get(id('霾'))!;
    expect(chain.stayFixed).toEqual({ [String(haze.id)]: 0.1 });
    expect(weatherScore(haze, chain.score)).toBeGreaterThan(95);
    expect(stayOf(chain, haze)).toBe(0.1);
    expect(stayOf({ ...chain, stayFixed: {} }, haze)).toBe(0.4);
    // 特殊天气仍只持续一轮
    expect(stayOf({ ...chain, stayFixed: { [String(id('雷暴'))]: 0.5 } }, W.get(id('雷暴'))!)).toBe(0);
  });
});

describe('司天罗盘（设计 §2.2）', () => {
  it('只能选转得过去的类型：晴天选不了雪冰类；类内概率加起来是 1，不含当前天气', () => {
    expect(compassRow(chain, W, id('晴'), 3, false).size).toBe(0);
    const sun = compassRow(chain, W, id('霾'), 1, false);
    expect(sum(sun)).toBeCloseTo(1, 9);
    const wind = compassRow(chain, W, id('霾'), 4, false);
    expect(wind.has(id('霾'))).toBe(false);
    expect(sum(wind)).toBeCloseTo(1, 9);
  });

  it('不出酸雨、冰冻（用户 2026-10-12）；当前是前兆时别的特殊天气按链上的概率算进去', () => {
    expect(compassRow(chain, W, id('霾'), 2, false).has(id('酸雨'))).toBe(false);
    expect(compassRow(chain, W, id('暴雪'), 3, false).has(id('冰冻'))).toBe(false);
    expect(compassRow(chain, W, id('特大暴雨'), 2, false).get(id('雷暴'))!).toBeGreaterThan(0);
    expect(compassRow(chain, W, id('大风'), 4, false).get(id('飓风'))!).toBeGreaterThan(0);
  });
});

describe('晴雨签（设计 §2.3）', () => {
  it('摇出两个不同的候选，不含当前天气和它的日夜对应天气；同一个种子结果一样', () => {
    for (let s = 1; s <= 30; s++) {
      const lots = drawLots(chain, W, id('晴'), false, seededRng(s));
      expect(lots).toHaveLength(2);
      expect(new Set(lots).size).toBe(2);
      expect(lots).not.toContain(id('晴'));
      expect(lots).not.toContain(id('夜间晴'));
      expect(drawLots(chain, W, id('晴'), false, seededRng(s))).toEqual(lots);
    }
  });
});

describe('司天罗盘的预览（天气改版）', () => {
  it('阶梯上到不了的天气不列（中雨时雨类里没有特大暴雨）', () => {
    expect(compassRow(chain, W, id('中雨'), 2, false).has(id('特大暴雨'))).toBe(false);
  });
});
