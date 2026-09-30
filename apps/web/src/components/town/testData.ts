import type { BlessDto, TownDto } from '@dt/shared';

export const blessData = (patch: Partial<BlessDto> = {}): BlessDto => ({
  id: 3,
  name: '心想事成',
  type: 0,
  num: 1,
  needAct: 120,
  levels: [5, 5],
  goodsId: null,
  buff: { expRate: 0.1 },
  ...patch,
});

export const townData = (patch: Partial<TownDto> = {}): TownDto => ({
  now: '2026-09-30T04:00:00.000Z',
  star: 1,
  coin: 1_000_000,
  diamond: 20,
  talked: { bigEater: false, wenjie: false, bro13: false },
  bigEaterGift: false,
  shaken: false,
  broadcast: { horns: 2, readyAt: null, minStar: 1, maxLen: 64 },
  hammer: { has: true, readyAt: null, townReadyAt: null, coin: 100_000, diamond: 8 },
  weather: { id: 1, name: '晴', until: '2026-09-30T06:00:00.000Z' },
  bless: { today: null, restName: null, hasLamp: false, activation: 0, feasted: false },
  ...patch,
});
