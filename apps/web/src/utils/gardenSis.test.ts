import { describe, expect, it } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { CHAT, gardenLines, pickLine } from './gardenSis';

const item = { id: 1 } as MarketDto['special'][number];
const market = (patch: Partial<MarketDto> = {}): MarketDto =>
  ({
    daily: [],
    special: [],
    premium: [],
    nextDaily: '2026-10-01T10:00:00Z',
    nextSpecial: '2026-10-01T09:00:00Z',
    nextPremium: '2026-10-01T12:00:00Z',
    specialCooldownUntil: null,
    specialCooldownMin: 30,
    foodsMaxNum: 99,
    cupboardFull: false,
    manual: { hasCard: false, cost: 0 },
    guess: { period: 'p', joined: [1], last: null, cost: 0, maxPick: 3, pool: [] },
    ...patch,
  }) as MarketDto;
const texts = (d: MarketDto) => gardenLines(d).map((l) => l.text);

describe('菜园姐台词（问题记录 176，设计 §5.2）', () => {
  it('特价有货 / 没货', () => {
    expect(texts(market({ special: [item, item] })).some((t) => t.includes('特价菜还剩 2 样'))).toBe(true);
    expect(texts(market()).some((t) => t.includes('特价菜卖光了'))).toBe(true);
  });

  it('有手动进货卡、没下注竞猜、橱柜满了时提醒', () => {
    expect(texts(market({ manual: { hasCard: true, cost: 100 } })).some((t) => t.includes('手动进货'))).toBe(
      true,
    );
    const g = { period: 'p', joined: null, last: null, cost: 0, maxPick: 3, pool: [] };
    expect(texts(market({ guess: g })).some((t) => t.includes('竞猜'))).toBe(true);
    expect(texts(market({ cupboardFull: true })).some((t) => t.includes('橱柜满了'))).toBe(true);
    expect(texts(market()).some((t) => t.includes('竞猜') && t.includes('下注'))).toBe(false);
  });

  it('闲聊总在；状态台词权重 2；没有菜场数据时只有闲聊', () => {
    const lines = gardenLines(market());
    for (const c of CHAT) expect(lines.some((l) => l.text === c && l.weight === 1)).toBe(true);
    expect(lines.filter((l) => l.weight === 2).length).toBeGreaterThan(0);
    expect(gardenLines(null).every((l) => l.weight === 1)).toBe(true);
  });

  it('pickLine 不连着说同一句', () => {
    const lines = [
      { text: 'a', weight: 1 },
      { text: 'b', weight: 1 },
    ];
    for (let i = 0; i < 10; i++) expect(pickLine(lines, 'a', () => i / 10)).toBe('b');
  });
});

describe('菜园姐台词和代码一致（终审）', () => {
  it('不提不存在的"答疑"版；竞猜说"这一轮"', () => {
    expect(CHAT.some((c) => c.includes('答疑'))).toBe(false);
    const g = { period: 'p', joined: null, last: null, cost: 0, maxPick: 3, pool: [] };
    expect(texts(market({ guess: g })).some((t) => t.includes('这一轮的竞猜'))).toBe(true);
  });
});
