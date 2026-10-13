import type { TownDto, TownExchangeDto } from '@dt/shared';

export const townData = (patch: Partial<TownDto> = {}): TownDto => ({
  now: '2026-09-30T04:00:00.000Z',
  star: 1,
  coin: 1_000_000,
  diamond: 20,
  talked: { bigEater: false, wenjie: false, bro13: false, carmen: false },
  mayor: {
    today: null,
    next: {
      at: '2026-10-01T09:00:00.000Z',
      types: [
        { type: 1, p: 0.27 },
        { type: 2, p: 0.58 },
        { type: 3, p: 0.06 },
        { type: 4, p: 0.09 },
      ],
    },
  },
  bigEaterGift: false,
  shaken: false,
  broadcast: { horns: 2, readyAt: null, minStar: 1, maxLen: 64 },
  weather: { id: 1, name: '晴', until: '2026-09-30T06:00:00.000Z' },
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
  foodHave: {},
  streetNeed: {},
  mysteryFoods: [701, 702],
  maxNum: 99,
  ...patch,
});
