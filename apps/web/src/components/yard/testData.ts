import type {
  FormulaDto,
  FormulasDto,
  FriendYardDto,
  LandDto,
  PlantDto,
  SeedsDto,
  YardDto,
} from '@dt/shared';

export const plantData = (patch: Partial<PlantDto> = {}): PlantDto => ({
  id: 7,
  seedId: 1,
  foodsId: 101,
  level: 1,
  stage: 1,
  canWater: false,
  minutes: 12,
  stageMinutes: 24,
  feedMin: 0,
  worm: 0,
  grass: 0,
  dry: 0,
  harvestNum: 20,
  harvestMax: 20,
  baseNum: 20,
  ...patch,
});

export const landData = (no: number, plant: PlantDto | null = null): LandDto => ({
  no,
  level: 1,
  exp: 0,
  expNext: 1000,
  bonus: 0,
  plant,
});

export const yardData = (patch: Partial<YardDto> = {}): YardDto => ({
  lands: [landData(1)],
  maxLands: 9,
  nextLandCoin: 200_000,
  coin: 500_000,
  strength: 50,
  renown: 3,
  seeds: [{ seedId: 1, num: 2 }],
  fertilizers: [
    { goodsId: 427, minutes: 20, num: 1 },
    { goodsId: 428, minutes: 60, num: 0 },
  ],
  ...patch,
});

export const friendYardData = (patch: Partial<FriendYardDto> = {}): FriendYardDto => ({
  restId: 2,
  name: '乙店',
  lands: [
    { no: 1, level: 1, plant: { ...plantData({ stage: 4, minutes: 600 }), stolen: false, stealBlock: null } },
  ],
  strength: 50,
  renown: 3,
  ...patch,
});

export const formulaData = (patch: Partial<FormulaDto> = {}): FormulaDto => ({
  id: 1,
  name: '牡丹籽油配方',
  mainFoodsId: 438,
  subFoodsId: 431,
  addFoodsId: 551,
  resFoodsId: 447,
  mainNum: 1,
  subNum: 1,
  learned: false,
  have: { main: 0, sub: 0, add: 0 },
  maxCompose: 0,
  ...patch,
});

export const formulasData = (patch: Partial<FormulasDto> = {}): FormulasDto => ({
  formulas: [formulaData(), formulaData({ id: 2, name: '三文鱼配方', mainNum: 0, subNum: 0 })],
  tools: [{ goodsId: 164, num: 5, rate: 0.25 }],
  scrolls: 3,
  essence: 4,
  strength: 50,
  composeStrength: 3,
  ...patch,
});

export const seedsData = (patch: Partial<SeedsDto> = {}): SeedsDto => ({
  stock: [{ seedId: 3, num: 2 }],
  shop: {
    open: true,
    items: [
      { seedId: 1, price: 1800 },
      { seedId: 2, price: 1800 },
    ],
  },
  exchange: [
    { seedId: 1, seedNum: 5, essence: 2 },
    { seedId: 95, seedNum: 1, essence: 30 },
  ],
  essence: 4,
  coin: 5000,
  ...patch,
});
