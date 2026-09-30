import type {
  ActivationDto,
  AttrResultDto,
  BuffsDto,
  CatalogDto,
  CookbookDetailDto,
  CookbookListDto,
  CupboardDto,
  DeviceOptionsDto,
  DineCurrentDto,
  DineRewardDto,
  EquipBatchDto,
  EquipDetailDto,
  EquipDto,
  EquipOverviewDto,
  ExchangeFoodsDto,
  ExchangeResultDto,
  FlipResultDto,
  FlipSlotsDto,
  FoodsNeedDto,
  ForgotPasswordInput,
  FridgeDto,
  GemLevelUpDto,
  GemsDto,
  FriendRequestDto,
  FriendRestDto,
  FriendsDto,
  HandleResultDto,
  IncomePageDto,
  KillResultDto,
  LearnResultDto,
  LedgerRecordDto,
  LogPageDto,
  LoginInput,
  MarketDto,
  MeDto,
  MyLooksDto,
  OilNeedDto,
  RegisterInput,
  ResetPasswordInput,
  RestBriefDto,
  RestaurantDto,
  ReturnAllDto,
  SelectShardResult,
  ShardDto,
  ShopDto,
  ShopSpecialDto,
  StarNeedDto,
  StoreDto,
  StressResultDto,
  TableDto,
  TasksDto,
  ThawResultDto,
  ThumbResultDto,
  ThumbTodayDto,
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
  friendList: (sort: 'level' | 'star' | 'recent' = 'level') =>
    api.get<FriendsDto>(`/api/v1/friend/list${qs({ sort })}`),
  friendRequests: () => api.get<FriendRequestDto[]>('/api/v1/friend/requests'),
  friendSearch: (q: string) => api.get<RestBriefDto[]>(`/api/v1/friend/search${qs({ q })}`),
  friendStreet: () => api.get<RestBriefDto[]>('/api/v1/friend/street'),
  friendApply: (restId: number) =>
    api.post<{ status: 'requested' | 'friends' }>('/api/v1/friend/apply', { restId }),
  friendRespond: (restId: number, accept: boolean) =>
    api.post<{ status: 'friends' | 'rejected' }>('/api/v1/friend/respond', { restId, accept }),
  friendRemove: (restId: number) => api.post<{ removed: true }>('/api/v1/friend/remove', { restId }),
  friendDetail: (restId: number) => api.get<FriendRestDto>(`/api/v1/friend/detail/${restId}`),
  friendFeed: (before?: string) => api.get<LogPageDto>(`/api/v1/friend/feed${qs({ before })}`),
  dineCurrent: () => api.get<DineCurrentDto | null>('/api/v1/dine/current'),
  dineStart: (restId: number, tableNo: number) =>
    api.post<Anything>('/api/v1/dine/start', { restId, tableNo }),
  dineEnd: () => api.post<DineRewardDto>('/api/v1/dine/end'),
  dineExpel: (tableNo: number) =>
    api.post<{ hostCoin: number; dinerLoss: number }>('/api/v1/dine/expel', { tableNo }),
  roachLay: (restId: number, tableNo: number) =>
    api.post<{ coin: number; exp: number }>('/api/v1/roach/lay', { restId, tableNo }),
  roachKill: (restId: number, tableNo: number) =>
    api.post<KillResultDto>('/api/v1/roach/kill', { restId, tableNo }),
  friendRefuel: (restId: number, num: number) =>
    api.post<{ oil: number; tickets: number }>('/api/v1/friend/refuel', { restId, num }),
  flipSlots: (restId: number) => api.get<FlipSlotsDto>(`/api/v1/friend/cupboard/${restId}`),
  flip: (restId: number, slotNo: number) =>
    api.post<FlipResultDto>('/api/v1/cupboard/flip', { restId, slotNo }),
  exchangeFoods: (restId: number, level: number) =>
    api.get<ExchangeFoodsDto>(`/api/v1/friend/foods/${restId}${qs({ level })}`),
  exchange: (b: { restId: number; giveFoodsId: number; takeFoodsId: number }) =>
    api.post<ExchangeResultDto>('/api/v1/foods/exchange', b),
  thumbsToday: () => api.get<ThumbTodayDto[]>('/api/v1/thumbs/today'),
  thumbUp: (restId: number) => api.post<ThumbResultDto>('/api/v1/thumbs/up', { restId }),
  thumbsReturnAll: () => api.post<ReturnAllDto>('/api/v1/thumbs/returnAll'),
  myLooks: () => api.get<MyLooksDto>('/api/v1/rest/looks'),
  setDoor: (door: number) => api.post<{ door: number }>('/api/v1/rest/door', { door }),
  setAvatar: (avatar: number) => api.post<{ avatar: number }>('/api/v1/rest/avatar', { avatar }),
  setNotice: (text: string) => api.post<{ notice: string }>('/api/v1/rest/notice', { text }),
  iconShow: (iconId: number, shown: boolean) =>
    api.post<{ iconId: number; shown: boolean }>('/api/v1/rest/icon/show', { iconId, shown }),
  equipOverview: () => api.get<EquipOverviewDto>('/api/v1/equip/overview'),
  equipList: (part?: number) => api.get<EquipDto[]>(`/api/v1/equip/list${qs({ part })}`),
  equipDetail: (id: number) => api.get<EquipDetailDto>(`/api/v1/equip/item/${id}`),
  equipWear: (id: number) => api.post<Anything>('/api/v1/equip/wear', { id }),
  equipUnwear: (id: number) => api.post<Anything>('/api/v1/equip/unwear', { id }),
  equipUnwearAll: () => api.post<Anything>('/api/v1/equip/unwearAll'),
  equipStress: (id: number, stone: boolean) =>
    api.post<StressResultDto>('/api/v1/equip/stress', { id, stone }),
  equipRollback: (id: number, goodsId: number) =>
    api.post<{ stress: number }>('/api/v1/equip/rollback', { id, goodsId }),
  equipLock: (id: number, locked: boolean) => api.post<Anything>('/api/v1/equip/lock', { id, locked }),
  equipSalvage: (id: number) => api.post<{ essence: number }>('/api/v1/equip/salvage', { id }),
  equipSell: (id: number) => api.post<{ coin: number }>('/api/v1/equip/sell', { id }),
  equipBatch: (ids: number[], way: 'salvage' | 'sell') =>
    api.post<EquipBatchDto>('/api/v1/equip/batch', { ids, way }),
  equipDrill: (id: number) => api.post<{ curHole: number }>('/api/v1/equip/drill', { id }),
  equipInlay: (id: number, gemId: number) => api.post<Anything>('/api/v1/equip/inlay', { id, gemId }),
  equipUngem: (gemRowId: number) => api.post<{ coin: number }>('/api/v1/equip/ungem', { gemRowId }),
  gems: () => api.get<GemsDto>('/api/v1/gem/list'),
  gemLevelUp: (goodsId: number, num: number) =>
    api.post<GemLevelUpDto>('/api/v1/gem/levelup', { goodsId, num }),
  equipPresetSave: (name: string) => api.post<{ id: number }>('/api/v1/equip/preset/save', { name }),
  equipPresetApply: (id: number) => api.post<{ skipped: number[] }>('/api/v1/equip/preset/apply', { id }),
  equipPresetDelete: (id: number) => api.post<Anything>('/api/v1/equip/preset/delete', { id }),
};
