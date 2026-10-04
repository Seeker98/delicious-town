import type { BlessDto, TownDto, TownExchangeDto } from '@dt/shared';

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
  mayor: { answered: false, hiphopOut: true, hour: 9 },
  bigEaterGift: false,
  shaken: false,
  broadcast: { horns: 2, readyAt: null, minStar: 1, maxLen: 64 },
  hammer: { has: true, readyAt: null, townReadyAt: null, coin: 100_000, diamond: 8 },
  weather: { id: 1, name: '晴', until: '2026-09-30T06:00:00.000Z' },
  bless: { today: null, restName: null, hasLamp: false, activation: 0, feasted: false },
  ...patch,
});

export const exchangeData = (patch: Partial<TownExchangeDto> = {}): TownExchangeDto => ({
  items: [
    {
      id: 1,
      category: 'bg',
      goodsId: 139,
      num: 1,
      need: [{ goodsId: 180, num: 2, have: 5 }],
      times: -1,
      used: 0,
    },
    {
      id: 2,
      category: 'bg',
      goodsId: 238,
      num: 1,
      need: [{ goodsId: 180, num: 8, have: 5 }],
      times: 1,
      used: 0,
    },
    {
      id: 3,
      category: 'bg',
      goodsId: 239,
      num: 1,
      need: [{ goodsId: 180, num: 1, have: 5 }],
      times: 1,
      used: 1,
    },
    {
      id: 40,
      category: 'dt',
      goodsId: 50,
      num: 1,
      need: [{ goodsId: 310, num: 3, have: 0 }],
      times: -1,
      used: 0,
    },
  ],
  levelTickets: [3, 0, 0, 0, 0],
  mysteryTickets: 1,
  levelFoods: [[101, 102], [201], [301], [401], [501]],
  mysteryFoods: [701, 702],
  maxNum: 99,
  ...patch,
});
