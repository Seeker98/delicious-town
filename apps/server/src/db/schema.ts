import type { ColumnType, Generated, Selectable } from 'kysely';

type Default<T> = ColumnType<T, T | undefined, T>;
type Ts = ColumnType<Date, Date | string, Date | string>;
type TsDefault = ColumnType<Date, Date | string | undefined, Date | string>;
type TsNullable = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;
/** jsonb：读出为对象，写入时传 JSON.stringify 后的字符串（避免 pg 把数组当成 PG 数组） */
type Json<T> = ColumnType<T, string, string>;
type JsonDefault<T> = ColumnType<T, string | undefined, string>;

/** 每张桌子当前的状态（规格书 01 §1.4）；customer 为顾客类型，-3 = 被蟑螂药消灭 */
export interface TableState {
  no: number;
  floor: number;
  customer: number;
  /** 蟑螂：放蟑螂的人（自然产生为 null）和时间 */
  roach?: { by: number | null; at: string };
  /** 白食者（子项目 3 写入）；coin/exp 是他在这桌累计得到的 */
  freeloader?: { restId: number; level: number; since: string; coin: number; exp: number };
  /** 上一轮这桌的结果 */
  last?: TableResult;
}

export interface TableResult {
  type: number;
  coin: number;
  exp: number;
  oil: number;
  /** 挑剔顾客要求的品级、实际品级、食谱 */
  req?: number;
  grade?: number;
  cookbookId?: number;
  satisfied?: boolean;
}

/** 已学食谱的派生计数：grade[L] = 当前品级恰好为 L 的食谱数；street[s] = 该街道已学数 */
export interface CookbookCounts {
  learned: number;
  grade: number[];
  street: Record<string, number>;
}

export interface AccountTable {
  id: Generated<number>;
  username: string;
  password_hash: string;
  email: string;
  email_verified_at: TsNullable;
  role: Default<'player' | 'mod' | 'admin'>;
  banned_at: TsNullable;
  ban_reason: Nullable<string>;
  invite_code: Nullable<string>;
  invited_by: Nullable<number>;
  created_at: TsDefault;
}

export interface EmailTokenTable {
  token_hash: string;
  account_id: number;
  purpose: 'verify' | 'reset';
  expires_at: Ts;
  used_at: TsNullable;
  created_at: TsDefault;
}

export interface ShardTable {
  id: number;
  name: string;
  status: Default<'open' | 'closed'>;
  opened_at: TsDefault;
}

export interface ShardConfigTable {
  shard_id: number;
  override: JsonDefault<unknown>;
  version: Default<number>;
  updated_at: TsDefault;
}

export interface RestaurantTable {
  id: Generated<number>;
  shard_id: number;
  account_id: number;
  name: string;
  level: number;
  exp: Default<number>;
  coin: number;
  diamond: number;
  strength: number;
  strength_max: number;
  oil: number;
  oil_max: number;
  oil_level: Default<number>;
  star_level: Default<number>;
  street_id: number;
  renown: number;
  attr_left: number;
  attr_cook: Default<number>;
  attr_cutting: Default<number>;
  attr_fire: Default<number>;
  attr_season: Default<number>;
  attr_creatives: Default<number>;
  luck: Default<number>;
  table_num: number;
  cupboard_num: number;
  store_num: number;
  foods_max_num: number;
  foods_lock_num: number;
  /** 1 营业，2 停业 */
  state: Default<number>;
  /** 派生：各品级 / 各街道已学食谱数（子项目 2 维护） */
  cookbook_counts: JsonDefault<CookbookCounts>;
  promo_on: Default<boolean>;
  cte_on: Default<boolean>;
  cookfoods_flag: Default<number>;
  plaque2_open: Default<boolean>;
  main_task_step: Default<number>;
  state_reason: Nullable<string>;
  effect_agg: JsonDefault<Record<string, number>>;
  effect_next_expire_at: TsNullable;
  effect_dirty: Default<boolean>;
  created_at: TsDefault;
}

export interface RestaurantTablesTable {
  rest_id: number;
  round_no: Default<number>;
  tables: Json<TableState[]>;
}

export interface RestaurantCookbooksTable {
  rest_id: number;
  /** 下标 = 食谱 id，值 = 品级 0~10 */
  levels: Buffer;
}

export interface EffectSourceTable {
  id: Generated<number>;
  rest_id: number;
  source_type: string;
  source_id: number;
  effects: Json<Record<string, number>>;
  expires_at: TsNullable;
  created_at: TsDefault;
}

export interface StoreItemTable {
  rest_id: number;
  goods_id: number;
  num: number;
  acquired_at: TsDefault;
  expires_at: TsNullable;
}

export interface DailyCounterTable {
  rest_id: number;
  /** YYYY-MM-DD（游戏日） */
  day: string;
  key: string;
  count: Default<number>;
}

export interface LedgerTable {
  id: Generated<number>;
  rest_id: number;
  kind: string;
  item_id: Nullable<number>;
  delta: number;
  source: string;
  ref_rest_id: Nullable<number>;
  created_at: TsDefault;
}

export interface NewsTable {
  id: Generated<number>;
  shard_id: number;
  type: string;
  rest_id: Nullable<number>;
  params: JsonDefault<Record<string, unknown>>;
  created_at: TsDefault;
}

export interface AuditLogTable {
  id: Generated<number>;
  actor_account_id: Nullable<number>;
  action: string;
  target: Nullable<string>;
  detail: JsonDefault<Record<string, unknown>>;
  ip: Nullable<string>;
  created_at: TsDefault;
}

export interface CupboardFoodTable {
  rest_id: number;
  foods_id: number;
  num: Default<number>;
  fridge_num: Default<number>;
  locked: Default<boolean>;
  fridge_unread: Default<boolean>;
}

export interface RestaurantDeviceTable {
  rest_id: number;
  slot: number;
  goods_id: number;
  placed_at: Ts;
  expires_at: TsNullable;
}

export interface WorldStateTable {
  shard_id: number;
  weather_id: number;
  weather_until: Ts;
  krab_street: number;
  plankton_rest_id: Nullable<number>;
  updated_at: TsDefault;
}

export interface MarketItemTable {
  id: Generated<number>;
  shard_id: number;
  shelf: number;
  period: string;
  foods_id: number;
  stock: number;
  sold: Default<number>;
  hot: Default<boolean>;
  opened_at: Ts;
}

export interface MarketBuyTable {
  market_item_id: number;
  subject: string;
  num: number;
}

export interface MarketGuessTable {
  shard_id: number;
  period: string;
  rest_id: number;
  foods_ids: number[];
  hits: Nullable<number>;
  settled_at: TsNullable;
  created_at: Ts;
}

export interface ShopSpecialTable {
  shard_id: number;
  day: string;
  goods_id: number;
  discount: number;
  tier_name: string;
  stock: number;
  sold: Default<number>;
}

export interface EventCounterTable {
  rest_id: number;
  key: string;
  count: Default<number>;
}

export interface TaskDoneTable {
  rest_id: number;
  task_id: number;
  done_at: Ts;
}

export interface IncomeRoundTable {
  id: Generated<number>;
  rest_id: number;
  round_no: number;
  coin: number;
  exp: number;
  oil: number;
  customers: Json<Record<string, number>>;
  rates: Json<Record<string, unknown>>;
  drops: Json<Array<{ goodsId: number; num: number }>>;
  created_at: Ts;
}

export interface RestLogTable {
  id: Generated<number>;
  rest_id: number;
  type: string;
  params: JsonDefault<Record<string, unknown>>;
  created_at: Ts;
}

export interface JobRunTable {
  shard_id: number;
  job: string;
  period: string;
  started_at: Ts;
  finished_at: TsNullable;
  stats: JsonDefault<Record<string, unknown>>;
}

export interface ShardConfigHistoryTable {
  id: Generated<number>;
  shard_id: number;
  version: number;
  override: Json<Record<string, unknown>>;
  actor_account_id: Nullable<number>;
  note: string;
  created_at: TsDefault;
}

export interface AdminGrantTable {
  id: Generated<number>;
  shard_id: number;
  target: 'rest' | 'shard';
  rest_id: Nullable<number>;
  min_level: Nullable<number>;
  items: Json<unknown>;
  reason: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  total: Default<number>;
  done_count: Default<number>;
  failed_count: Default<number>;
  actor_account_id: Nullable<number>;
  created_at: TsDefault;
  finished_at: TsNullable;
}

export interface AdminGrantDoneTable {
  grant_id: number;
  rest_id: number;
  ok: boolean;
  error: Nullable<string>;
  created_at: TsDefault;
}

export interface StatDailyTable {
  shard_id: number;
  /** 北京时间的游戏日 YYYY-MM-DD */
  day: string;
  kind: string;
  source: string;
  amount: number;
}

export interface DB {
  account: AccountTable;
  email_token: EmailTokenTable;
  shard: ShardTable;
  shard_config: ShardConfigTable;
  restaurant: RestaurantTable;
  restaurant_tables: RestaurantTablesTable;
  restaurant_cookbooks: RestaurantCookbooksTable;
  effect_source: EffectSourceTable;
  store_item: StoreItemTable;
  daily_counter: DailyCounterTable;
  ledger: LedgerTable;
  news: NewsTable;
  audit_log: AuditLogTable;
  cupboard_food: CupboardFoodTable;
  restaurant_device: RestaurantDeviceTable;
  world_state: WorldStateTable;
  market_item: MarketItemTable;
  market_buy: MarketBuyTable;
  market_guess: MarketGuessTable;
  shop_special: ShopSpecialTable;
  event_counter: EventCounterTable;
  task_done: TaskDoneTable;
  income_round: IncomeRoundTable;
  rest_log: RestLogTable;
  job_run: JobRunTable;
  shard_config_history: ShardConfigHistoryTable;
  admin_grant: AdminGrantTable;
  admin_grant_done: AdminGrantDoneTable;
  stat_daily: StatDailyTable;
}

export type RestaurantRow = Selectable<RestaurantTable>;
