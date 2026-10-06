import type { BarDto } from '@dt/shared';

export const barData = (patch: Partial<BarDto> = {}): BarDto => ({
  tickets: 20,
  krabCoins: 3,
  fg: { result: null, times: 0 },
  cup: { result: null, times: 0, nextCost: 1 },
  num: { result: null, times: 0, cost: 8, max: 25 },
  slot: {
    emailVerified: true,
    lamp: false,
    floorLeft: 100,
    pool: [
      { id: 0, kind: 'empty', itemId: null, rate: 0.77, rare: false },
      { id: 1, kind: 'foods', itemId: 101, rate: 0.2, rare: false },
      { id: 100, kind: 'goods', itemId: 180, rate: 0.03, rare: true },
    ],
    stats: [],
  },
  krabCoinTickets: 100,
  devil: { stakes: [1, 5, 10, 20], round: null },
  memory: { cost: 1, played: 0, max: 20, flashMs: 600, gapMs: 200, round: null },
  darts: { cost: 2, played: 0, max: 20, round: null },
  nim: {
    played: 0,
    max: 10,
    tables: {
      novice: { cost: 1, k: [3, 3], pile: [10, 20], renown: 1, awardLevel: 2, first: 'choose' },
      expert: { cost: 2, k: [3, 5], pile: [20, 40], renown: 3, awardLevel: 5, first: 'coin' },
    },
    round: null,
  },
  ...patch,
});
