import type { TempleDto } from '@dt/shared';

export const templeData = (patch: Partial<TempleDto> = {}): TempleDto => ({
  star: 1,
  strength: 5,
  guardian: { hpMax: 15000, hpLeft: 12000, killed: false },
  missiles: [
    { goodsId: 17, num: 3 },
    { goodsId: 18, num: 0 },
  ],
  maps: [{ goodsId: 170, num: 10, needStrength: 2 }],
  trial: { mcId: null, readyMinutes: 0, creatives: 0, worthMax: 30, expMax: 150 },
  kraken: { targetMcId: 1, fed: false, feedable: true, hours: [[11, 14]], current: null },
  seeds: [],
  tentacles: 0,
  ...patch,
});
