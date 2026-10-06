import type { DuelResultDto, RankDto, RenownShopDto, TowerDto, TowerFloorDto } from '@dt/shared';

export const duelResult = (patch: Partial<DuelResultDto> = {}): DuelResultDto => ({
  win: true,
  me: { name: '我的店', power: 70, scores: [20.4, 19.4, 15.4, 22.4, 7.4] },
  them: { name: '见习模范餐厅', power: 29, scores: [8.1, 8, 6.6, 8.8, 3.6] },
  judges: [
    { id: 'carmen', me: 39.8, them: 16.1 },
    { id: 'oldPoor', me: 29.8, them: 32.4 },
    { id: 'fanDao', me: 34.8, them: 14.6 },
    { id: 'xiaoKai', me: 22.8, them: 10.2 },
  ],
  votes: [3, 1],
  judgeCount: 5,
  elderDrop: null,
  renown: 7,
  awards: [{ kind: 'coin', id: null, num: 600, lucky: false }],
  test: false,
  rank: null,
  ...patch,
});

const floor = (n: number, patch: Partial<TowerFloorDto> = {}): TowerFloorDto => ({
  floor: n,
  name: `守塔人${n}`,
  title: `称号${n}`,
  note: '来挑战吧',
  minLevel: n === 1 ? 1 : (n - 1) * 10 + 1,
  power: n * 100,
  maxTimes: 10,
  left: 10,
  unlocked: n === 1,
  mc: null,
  cost: n + 4,
  elder: {
    level: 8,
    stress: 3,
    points: { cook: 0, cutting: 21, fire: 0 },
    pieces: [
      { id: 40001, attrs: { cook: 2, cutting: 5, fire: 0, season: 0, creatives: 0, luck: 0 } },
      { id: 40002, attrs: { cook: 0, cutting: 2, fire: 3, season: 0, creatives: 0, luck: 0 } },
    ],
    attrs: { cook: 2, cutting: 29, fire: 5, season: 0, creatives: 0, luck: 7 },
    drops: [40001, 40002],
    dropRate: 0.2,
  },
  ...patch,
});

export const towerData = (patch: Partial<TowerDto> = {}): TowerDto => ({
  floors: [floor(1), floor(2), floor(3), floor(4)],
  duelJudges: 5,
  power: 70,
  left: 5,
  dailyTotal: 5,
  tickets: 0,
  bestFloor: 0,
  strength: 100,
  level: 1,
  hour: 12,
  nightFloor: 3,
  openHour: 6,
  testCost: 1,
  ...patch,
});
export { floor as towerFloor };

export const rankData = (patch: Partial<RankDto> = {}): RankDto => ({
  duelJudges: 5,
  week: '2026-09-28',
  weekEnd: '2026-10-04T16:00:00.000Z',
  slots: Array.from({ length: 15 }, (_, i) => ({ rank: i + 1, restId: null, name: null, level: null })),
  myRank: null,
  left: 10,
  spar: 0,
  strength: 100,
  rankTop: 8,
  rankGap: 3,
  duelStrength: 5,
  ...patch,
});

export const shopData = (patch: Partial<RenownShopDto> = {}): RenownShopDto => ({
  renown: 200,
  items: [
    { goodsId: 310, renown: 60, weeklyLimit: 10, bought: 8, rare: false, owned: false },
    { goodsId: 397, renown: 3000, weeklyLimit: 1, bought: 1, rare: true, owned: true },
    { goodsId: 460, renown: 3000, weeklyLimit: 1, bought: 0, rare: true, owned: false },
  ],
  ...patch,
});
