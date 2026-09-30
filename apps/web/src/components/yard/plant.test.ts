import { describe, expect, it } from 'vitest';
import { feedBlock, reapBlock, stageName, statusText, waterBlock, wormBlock } from './plant';
import { plantData } from './testData';

describe('作物按钮的状态和灰掉原因', () => {
  it('阶段名和状态文字', () => {
    expect(stageName(2)).toBe('育苗期');
    expect(statusText(plantData())).toBe('还要 12 分钟才能浇水');
    expect(statusText(plantData({ canWater: true, minutes: 0 }))).toBe('可以浇水了');
    expect(statusText(plantData({ stage: 4, minutes: 600 }))).toBe('可以收获，600 分钟后枯萎');
    expect(statusText(plantData({ stage: 5 }))).toBe('已枯萎，只能铲除');
  });

  it('浇水：干涸时总能浇（解除干涸）；有虫先除虫、有草先除草；没到时间写还要几分钟', () => {
    expect(waterBlock(plantData({ dry: 2, worm: 1 }), 5)).toBe('');
    expect(waterBlock(plantData({ worm: 1, canWater: true }), 5)).toBe('有虫，先除虫');
    expect(waterBlock(plantData({ grass: 1, canWater: true }), 5)).toBe('有草，先除草');
    expect(waterBlock(plantData(), 5)).toBe('还要 12 分钟才能浇水');
    expect(waterBlock(plantData({ canWater: true }), 0)).toBe('体力不够');
    expect(waterBlock(plantData({ stage: 5 }), 5)).toBe('已枯萎，只能铲除');
    expect(wormBlock(plantData(), 5)).toBe('没有虫');
  });

  it('收获和施肥', () => {
    expect(reapBlock(plantData(), 5)).toBe('还没成熟');
    expect(reapBlock(plantData({ stage: 4, grass: 1 }), 5)).toBe('有草，先除草');
    expect(reapBlock(plantData({ stage: 4 }), 5)).toBe('');
    expect(feedBlock(plantData(), 5, 20, 1)).toBe('');
    expect(feedBlock(plantData(), 5, 60, 1)).toBe('这个阶段剩下的时间不够，肥料用不上');
    expect(feedBlock(plantData(), 5, 20, 0)).toBe('没有这种肥料');
    expect(feedBlock(plantData({ stage: 4 }), 5, 20, 1)).toBe('只有生长期能施肥');
  });
});
