import { describe, expect, it } from 'vitest';
import type { BarDto } from '@dt/shared';
import { wenjieChat, wenjieLines } from './wenjie';

const bar = (patch: Partial<BarDto> = {}): BarDto =>
  ({
    tickets: 10,
    krabCoins: 0,
    fg: { result: null, times: 0 },
    cup: { result: null, times: 0, nextCost: 1 },
    num: { result: null, times: 0, cost: 1, max: 9 },
    slot: { emailVerified: true, lamp: false, floorLeft: 30, pool: [], stats: [] },
    krabCoinTickets: 10,
    devil: { stakes: [1], round: null },
    memory: { cost: 1, played: 3, max: 3, flashMs: 600, gapMs: 200, round: null },
    darts: { cost: 1, played: 5, max: 5, round: null },
    ...patch,
  }) as BarDto;
const texts = (d: BarDto | null) => wenjieLines(d).map((l) => l.text);

describe('雯姐台词（问题记录 210）', () => {
  it('记忆调酒、飞镖还有次数时提醒剩几局；玩满了不提', () => {
    const d = bar({
      memory: { cost: 1, played: 1, max: 3, flashMs: 600, gapMs: 200, round: null },
      darts: { cost: 1, played: 0, max: 5, round: null },
    });
    expect(texts(d).some((t) => t.includes('记忆调酒今天还能玩 2 局'))).toBe(true);
    expect(texts(d).some((t) => t.includes('飞镖今天还能扔 5 局'))).toBe(true);
    expect(texts(bar()).some((t) => t.includes('还能玩') || t.includes('还能扔'))).toBe(false);
  });

  it('礼券用完提醒去广场找她；老虎机快保底时提醒；辣杯没喝完时提醒', () => {
    expect(texts(bar({ tickets: 0 })).some((t) => t.includes('广场'))).toBe(true);
    const slot = { emailVerified: true, lamp: false, floorLeft: 3, pool: [], stats: [] };
    expect(texts(bar({ slot })).some((t) => t.includes('再拉 3 次'))).toBe(true);
    const devil = {
      stakes: [1],
      round: { stake: 1, cups: [null], survived: 0, result: null },
    } as unknown as BarDto['devil'];
    expect(texts(bar({ devil })).some((t) => t.includes('魔鬼辣杯'))).toBe(true);
  });

  it('闲聊总在；状态台词权重 2；没有数据时只有闲聊', () => {
    const lines = wenjieLines(bar({ tickets: 0 }));
    for (const c of wenjieChat()) expect(lines.some((l) => l.text === c && l.weight === 1)).toBe(true);
    expect(lines.some((l) => l.weight === 2)).toBe(true);
    expect(wenjieLines(null).every((l) => l.weight === 1)).toBe(true);
  });
});
