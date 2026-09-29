import type {
  ActivationDto,
  AttrResultDto,
  BuffsDto,
  CatalogDto,
  CookbookDetailDto,
  CookbookListDto,
  CupboardDto,
  DeviceOptionsDto,
  FoodsNeedDto,
  ForgotPasswordInput,
  FridgeDto,
  HandleResultDto,
  IncomePageDto,
  LearnResultDto,
  LedgerRecordDto,
  LogPageDto,
  LoginInput,
  MarketDto,
  MeDto,
  OilNeedDto,
  RegisterInput,
  ResetPasswordInput,
  RestaurantDto,
  SelectShardResult,
  ShardDto,
  ShopDto,
  ShopSpecialDto,
  StarNeedDto,
  StoreDto,
  TableDto,
  TasksDto,
  ThawResultDto,
  WorldDto,
} from '@dt/shared';
import { api } from './client';

type Empty = Record<string, never>;
type Anything = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const endpoints = {
  me: () => api.get<MeDto>('/api/v1/account/me'),
  register: (body: RegisterInput) => api.post<MeDto>('/api/v1/account/register', body),
  login: (body: LoginInput) => api.post<MeDto>('/api/v1/account/login', body),
  logout: () => api.post<Empty>('/api/v1/account/logout'),
  sendVerifyEmail: () => api.post<Empty>('/api/v1/account/send-verify-email'),
  verifyEmail: (token: string) => api.post<Empty>('/api/v1/account/verify-email', { token }),
  forgotPassword: (body: ForgotPasswordInput) => api.post<Empty>('/api/v1/account/forgot-password', body),
  resetPassword: (body: ResetPasswordInput) => api.post<Empty>('/api/v1/account/reset-password', body),
  listShards: () => api.get<ShardDto[]>('/api/v1/shard/list'),
  selectShard: (shardId: number) => api.post<SelectShardResult>('/api/v1/shard/select', { shardId }),
  createRestaurant: (name: string) => api.post<RestaurantDto>('/api/v1/restaurant/create', { name }),
  overview: () => api.get<RestaurantDto>('/api/v1/restaurant/overview'),
  floor: () => api.get<TableDto[]>('/api/v1/restaurant/floor'),
  income: (before?: string) => api.get<IncomePageDto>(`/api/v1/restaurant/income${qs({ before })}`),
  buffs: () => api.get<BuffsDto>('/api/v1/restaurant/buffs'),
  restLog: (before?: string) => api.get<LogPageDto>(`/api/v1/restaurant/log${qs({ before })}`),

  weather: () => api.get<WorldDto>('/api/v1/world/weather'),
  catalog: () => api.get<CatalogDto>('/api/v1/world/catalog'),

  starNeed: () => api.get<StarNeedDto>('/api/v1/growth/star'),
  oilNeed: () => api.get<OilNeedDto>('/api/v1/growth/oil'),
  devices: () => api.get<DeviceOptionsDto>('/api/v1/growth/devices'),
  allocate: (b: { cook: number; cutting: number; fire: number }) =>
    api.post<AttrResultDto>('/api/v1/growth/allocate', b),
  refuel: () => api.post<{ oil: number }>('/api/v1/growth/refuel'),
  starUp: () => api.post<{ star: number }>('/api/v1/growth/star-up'),
  oilExpand: () => api.post<Anything>('/api/v1/growth/oil-expand'),
  placeDevice: (slot: number, goodsId: number) =>
    api.post<Anything>('/api/v1/growth/device/place', { slot, goodsId }),
  removeDevice: (slot: number) => api.post<Anything>('/api/v1/growth/device/remove', { slot }),
  openPlaque2: () => api.post<Anything>('/api/v1/growth/plaque2'),
  rename: (name: string) => api.post<{ name: string }>('/api/v1/growth/rename', { name }),
  move: (streetId: number) => api.post<{ streetId: number }>('/api/v1/growth/move', { streetId }),
  setPromo: (on: boolean) => api.post<Anything>('/api/v1/growth/promo', { on }),
  setCookfoods: (flag: number) => api.post<Anything>('/api/v1/growth/cookfoods', { flag }),
  setCte: (on: boolean) => api.post<Anything>('/api/v1/growth/cte', { on }),
  drivePlankton: (way: 'strength' | 'book') => api.post<Anything>('/api/v1/growth/plankton/drive', { way }),
  driveKrab: () => api.post<Anything>('/api/v1/growth/krab/drive'),

  cookbookList: (q: { street: number; page: number; filter: string }) =>
    api.get<CookbookListDto>(`/api/v1/cookbook/list${qs(q)}`),
  cookbookDetail: (id: number) => api.get<CookbookDetailDto>(`/api/v1/cookbook/detail/${id}`),
  foodsNeed: (q: { street?: number; target: number; foodLevel?: number }) =>
    api.get<FoodsNeedDto>(`/api/v1/cookbook/foods-need${qs(q)}`),
  learn: (cookbookId: number) => api.post<LearnResultDto>('/api/v1/cookbook/learn', { cookbookId }),

  cupboard: () => api.get<CupboardDto>('/api/v1/cupboard/list'),
  fridge: () => api.get<FridgeDto>('/api/v1/cupboard/fridge'),
  readFridge: () => api.post<Anything>('/api/v1/cupboard/fridge/read'),
  lockFood: (foodsId: number) => api.post<Anything>('/api/v1/cupboard/lock', { foodsId }),
  unlockFood: (foodsId: number) => api.post<Anything>('/api/v1/cupboard/unlock', { foodsId }),
  thaw: (foodsId: number) => api.post<ThawResultDto>('/api/v1/cupboard/thaw', { foodsId }),
  handleFoods: (b: { foodsId: number; way: 'compose' | 'decompose'; num: number }) =>
    api.post<HandleResultDto>('/api/v1/cupboard/handle', b),
  exchangeMaster: (foodsId: 467 | 468, times: number) =>
    api.post<Anything>('/api/v1/cupboard/exchange', { foodsId, times }),

  market: () => api.get<MarketDto>('/api/v1/market/view'),
  marketBuy: (itemId: number, num: number) => api.post<Anything>('/api/v1/market/buy', { itemId, num }),
  marketGuess: (foodsIds: number[]) => api.post<{ period: string }>('/api/v1/market/guess', { foodsIds }),

  shop: () => api.get<ShopDto>('/api/v1/shop/items'),
  shopSpecial: () => api.get<ShopSpecialDto | null>('/api/v1/shop/special'),
  shopBuy: (goodsId: number, num: number) => api.post<Anything>('/api/v1/shop/buy', { goodsId, num }),
  shopBuySpecial: (num: number) => api.post<Anything>('/api/v1/shop/buy-special', { num }),
  shopBuyBlack: (goodsId: number, num: number) =>
    api.post<Anything>('/api/v1/shop/buy-black', { goodsId, num }),
  sell: (goodsId: number, num: number) => api.post<Anything>('/api/v1/shop/sell', { goodsId, num }),
  discard: (goodsId: number) => api.post<Anything>('/api/v1/shop/discard', { goodsId }),

  store: (type?: number) => api.get<StoreDto>(`/api/v1/store/list${qs({ type })}`),
  storeRecords: (range: string) => api.get<LedgerRecordDto[]>(`/api/v1/store/records${qs({ range })}`),
  useGoods: (goodsId: number, num: number) => api.post<Anything>('/api/v1/store/use', { goodsId, num }),

  tasks: () => api.get<TasksDto>('/api/v1/task/list'),
  activation: () => api.get<ActivationDto>('/api/v1/task/activation'),
  claimTask: (taskId: number) => api.post<Anything>('/api/v1/task/claim', { taskId }),
  claimActivation: (points: number) => api.post<Anything>('/api/v1/task/activation/claim', { points }),
  signIn: () => api.post<Anything>('/api/v1/task/signin'),
};
