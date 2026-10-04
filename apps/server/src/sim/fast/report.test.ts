import { describe, expect, it } from 'vitest';
import { resolveShardSettings } from '@dt/config';
import { testConfig } from '../../../test/config';
import type { BotDay } from '../metrics';
import { compareCalibration, keyTable, percentile } from './metrics';
import { renderFastReport } from './report';
import { runFast } from './run';

const config = testConfig();
const one = runFast(
  '基准',
  {
    days: 1,
    botsPerPersona: 2,
    personas: ['diligent', 'casual'],
    seed: 1,
    start: new Date('2026-10-01T16:00:00Z'),
    tuning: resolveShardSettings(config, {}).tuning,
    side: null,
    stuckDays: 5,
  },
  config,
);
const meta = { days: 1, bots: 2, seed: 1, side: null };

describe('报告（设计 §7）', () => {
  it('分位数：空数组给 null', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(3);
    expect(percentile([5], 0.9)).toBe(5);
  });

  it('只跑 1 天时，第 7、14、30 天的列是 null，页面显示"—"，没有 NaN（Review Focus 4）', () => {
    const t = keyTable([one], 1);
    expect(t[0]!.cells.day7Level).toBeNull();
    const html = renderFastReport([one], meta);
    expect(html).toContain('—');
    expect(html).not.toContain('NaN');
  });

  it('只出现跑了的画像；有说明段、关键指标、旁支收入、卡点', () => {
    const html = renderFastReport([one], meta);
    expect(html).toContain('勤快');
    expect(html).toContain('休闲');
    expect(html).not.toContain('普通');
    for (const s of ['不模拟', '关键指标', '收入来源', '卡点']) expect(html).toContain(s);
  });

  it('银币流入与流出（问题记录 240）：每人每天的流入、流出（按用途）、净额', () => {
    const html = renderFastReport([one], meta);
    expect(html).toContain('银币流入与流出');
    expect(html).toContain('买菜');
    expect(html).not.toContain('NaN');
  });

  it('核对：等级差 2 级、星级不同、银币差超过 20% 都算不通过', () => {
    const row = (level: number, star: number, coin = 100): BotDay => ({
      day: 1,
      bot: 'x',
      persona: 'diligent',
      level,
      star,
      coin,
      diamond: 0,
      learned: 10,
      certs: 0,
      oilLevel: 0,
      renown: 0,
    });
    expect(compareCalibration([row(5, 1)], [row(6, 1)]).pass).toBe(true);
    expect(compareCalibration([row(5, 1)], [row(7, 1)]).pass).toBe(false);
    expect(compareCalibration([row(5, 1)], [row(5, 2)]).pass).toBe(false);
    expect(compareCalibration([row(5, 1, 100_000)], [row(5, 1, 130_000)]).pass).toBe(false);
    expect(compareCalibration([row(5, 1, 0)], [row(5, 1, 0)]).pass).toBe(true);
    // 小数值给绝对容差：食谱差 2 道以内、银币差 1 万以内算通过（单个机器人的运气差异）
    const learned = (n: number) => ({ ...row(5, 1), learned: n });
    expect(compareCalibration([learned(4)], [learned(6)]).pass).toBe(true);
    expect(compareCalibration([learned(4)], [learned(7)]).pass).toBe(false);
    expect(compareCalibration([row(5, 1, 5_000)], [row(5, 1, 12_000)]).pass).toBe(true);
  });
});

describe('backlog 快速模拟：核对表按天数排序', () => {
  it('第 10 天排在第 2 天后面（以前按字符串排）', () => {
    const d = (day: number): BotDay => ({
      day,
      bot: 'x',
      persona: 'diligent',
      level: 1,
      star: 0,
      coin: 0,
      diamond: 0,
      learned: 0,
      certs: 0,
      oilLevel: 0,
      renown: 0,
    });
    const days = [d(10), d(2), d(1)];
    const order = [...new Set(compareCalibration(days, days).rows.map((r) => r.day))];
    expect(order).toEqual([1, 2, 10]);
  });
});
