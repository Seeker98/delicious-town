import type { ColumnType, Generated, Selectable } from 'kysely';

type Default<T> = ColumnType<T, T | undefined, T>;
type Ts = ColumnType<Date, Date | string, Date | string>;
type TsDefault = ColumnType<Date, Date | string | undefined, Date | string>;
type TsNullable = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;
/** jsonb：读出为对象，写入时传 JSON.stringify 后的字符串（避免 pg 把数组当成 PG 数组） */
type Json<T> = ColumnType<T, string, string>;
type JsonDefault<T> = ColumnType<T, string | undefined, string>;

export interface TableState {
  no: number;
  floor: number;
  customer: number;
}

export interface AccountTable {
  id: Generated<number>;
  username: string;
  password_hash: string;
  email: string;
  email_verified_at: TsNullable;
  role: Default<'player' | 'admin'>;
  banned_at: TsNullable;
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
  cookbook_counts: JsonDefault<Record<string, unknown>>;
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
}

export type RestaurantRow = Selectable<RestaurantTable>;
