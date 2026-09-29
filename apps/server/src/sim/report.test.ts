import { describe, expect, it } from 'vitest';
import { lineChart, renderReport, toCsv } from './report';
import type { SimResult } from './run';

const result: SimResult = {
  options: {
    dbName: 'x',
    days: 2,
    botsPerPersona: 1,
    personas: ['diligent'],
    seed: 1,
    start: new Date('2026-10-01T00:00:00+08:00'),
  },
  bots: [{ name: '勤快1', persona: 'diligent', restaurantId: 1 }],
  days: [
    {
      day: 0,
      bot: '勤快1',
      persona: 'diligent',
      level: 1,
      star: 0,
      coin: 100000,
      diamond: 0,
      learned: 0,
      certs: 0,
      oilLevel: 0,
      renown: 10,
    },
    {
      day: 1,
      bot: '勤快1',
      persona: 'diligent',
      level: 8,
      star: 0,
      coin: 90000,
      diamond: 2,
      learned: 6,
      certs: 0,
      oilLevel: 1,
      renown: 12,
    },
  ],
  economy: [
    { day: '2026-10-01', kind: 'coin', source: 'settlement', delta: 30000 },
    { day: '2026-10-01', kind: 'coin', source: 'market.buy', delta: -40000 },
  ],
  stuck: [{ bot: '勤快1', persona: 'diligent', star: 0, days: 6, lacking: ['cookbooks'] }],
  starDays: {},
  elapsedMs: 1000,
};

describe('模拟报告', () => {
  it('折线图是 SVG，包含每条曲线和图例；标题转义', () => {
    const svg = lineChart(
      '<等级>',
      [
        {
          name: '勤快',
          points: [
            [0, 1],
            [1, 8],
          ],
        },
      ],
      '天',
      '等级',
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('勤快');
    expect(svg).toContain('&lt;等级&gt;');
  });
  it('报告包含成长、经济、卡点三部分，不引用外部资源', () => {
    const html = renderReport(result);
    expect(html).toContain('成长节奏');
    expect(html).toContain('经济平衡');
    expect(html).toContain('卡点');
    expect(html).toContain('market.buy');
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  });
  it('对比两次运行时画出对比曲线', () => {
    expect(renderReport(result, result)).toContain('（对比）');
  });
  it('CSV 带表头，含逗号的值加引号', () => {
    expect(toCsv([{ a: 1, b: 'x,y' }])).toBe('a,b\n1,"x,y"\n');
  });
});
