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
  ...patch,
});
