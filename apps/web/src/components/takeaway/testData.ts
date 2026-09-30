import type {
  TakeawayClaimDto,
  TakeawayDeliveryDto,
  TakeawayDto,
  TakeawayOrderDto,
  TakeawayRiderDto,
} from '@dt/shared';

export const order = (patch: Partial<TakeawayOrderDto> = {}): TakeawayOrderDto => ({
  id: 11,
  cookbookId: 1,
  cookbookName: '南煎丸子',
  grade: 1,
  needMinutes: 30,
  needRenown: 3,
  expiresAt: '2026-09-30T05:00:00.000Z',
  private: false,
  foods: [
    { foodsId: 239, need: 1, have: 5 },
    { foodsId: 242, need: 1, have: 5 },
    { foodsId: 250, need: 1, have: 5 },
  ],
  block: null,
  ...patch,
});

export const delivery = (patch: Partial<TakeawayDeliveryDto> = {}): TakeawayDeliveryDto => ({
  id: 21,
  orderId: 11,
  cookbookId: 1,
  cookbookName: '南煎丸子',
  grade: 1,
  private: false,
  double: false,
  riderId: 31,
  riderName: '我的店',
  arriveAt: '2026-09-30T04:30:00.000Z',
  arrived: false,
  drone: 3,
  ...patch,
});

export const rider = (patch: Partial<TakeawayRiderDto> = {}): TakeawayRiderDto => ({
  id: 31,
  restId: 1,
  name: '我的店',
  self: true,
  level: 1,
  exp: 6,
  needExp: 1300,
  timeSub: 0,
  expAdd: 0,
  coinAdd: 0,
  renownAdd: 0,
  odds: 800,
  maxNum: 1,
  busy: 0,
  dismissCoin: 0,
  dismissExp: 0,
  ...patch,
});

export const claimResult = (patch: Partial<TakeawayClaimDto> = {}): TakeawayClaimDto => ({
  deliveryId: 21,
  success: true,
  forced: false,
  drone: false,
  reason: null,
  coin: 198,
  exp: 13,
  renown: 1,
  goods: { id: 1, num: 1 },
  riderExp: 6,
  riderLevel: 1,
  customer: null,
  ...patch,
});

/** 已开通、有一张能接的单、一个空闲的自己骑手；服务器时间 12:00（北京） */
export const takeawayData = (patch: Partial<TakeawayDto> = {}): TakeawayDto => ({
  opened: true,
  open: { needStar: 2, needRenown: 888, needCoin: 8_880_000, needDiamond: 300, tickets: 0 },
  orders: [order()],
  deliveries: [],
  riders: [rider()],
  riderCap: 1,
  canDouble: false,
  refresh: { cost: 1_000_000, hasJob: false },
  star: 2,
  renown: 10,
  coin: 100_000,
  diamond: 10,
  now: '2026-09-30T04:00:00.000Z',
  ...patch,
});
