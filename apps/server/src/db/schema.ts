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
  /** 这桌吃了几份哪道特色菜（问题记录 559）；没吃不记 */
  mcId?: number;
  mcNum?: number;
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
  /** 封号到期时间；null 表示永久（子项目 6B-1） */
  banned_until: TsNullable;
  is_system: Default<boolean>;
  invite_code: Nullable<string>;
  invited_by: Nullable<number>;
  /** 语言（问题记录 272）；null 表示还没选过 */
  lang: Nullable<string>;
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
  /** 问题记录 318：0 = 还没按新任务换算过老号进度；1 = 已换算 */
  quest_version: Default<number>;
  state_reason: Nullable<string>;
  npc: Default<boolean>;
  door: Default<number>;
  /** null = 没设置头像（不能白食） */
  avatar: Nullable<number>;
  notice: Default<string>;
  /** 赶走痞老板后到这个时间前不会再被选为驻留店 */
  plankton_cooldown_until: TsNullable;
  /** 当前在售的特色菜（子项目 4A）；卖完、倒掉、被吃完后置空 */
  mc_cook_id: Nullable<number>;
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
  /** 下标 = 存储位（cookbookIndex.slotOf），值 = 品级 0~10 */
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

/** 连续签到（问题记录 515 支线扩充 B）：最后签到的那天、连着签了几天、历史最长 */
export interface SigninStreakTable {
  rest_id: number;
  /** YYYY-MM-DD（游戏日） */
  last_day: string;
  streak: number;
  best: number;
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
  weather_changed_at: TsNullable;
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
  /** 菜场工作证手动进货的进货人（4E-2）；系统货为 null */
  owner_rest_id: Default<number | null>;
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

/** 问题记录 318：主线、支线任务完成（已领奖）；章末奖励记 100000 + 章 id */
export interface QuestDoneTable {
  rest_id: number;
  quest_id: number;
  done_at: TsDefault;
}

/** 每周任务计数；week 是本周一 */
export interface WeeklyCounterTable {
  rest_id: number;
  week: string;
  key: string;
  count: Default<number>;
}

/** 每周任务和全完成奖励的领取 */
export interface WeeklyClaimTable {
  rest_id: number;
  week: string;
  quest_id: number;
  claimed_at: TsDefault;
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

export interface FriendTable {
  rest_id: number;
  friend_id: number;
  created_at: TsDefault;
}

export interface FriendRequestTable {
  from_rest: number;
  to_rest: number;
  created_at: TsDefault;
}

export interface DineDashTable {
  diner_rest_id: number;
  host_rest_id: number;
  table_no: number;
  started_at: Ts;
}

export interface CupboardFlipTable {
  host_rest_id: number;
  slot_no: number;
  by_rest_id: number;
  cool_until: Ts;
}

export interface ThumbTable {
  /** YYYY-MM-DD（游戏日） */
  day: string;
  from_rest: number;
  to_rest: number;
  ip: Nullable<string>;
  returned: Default<boolean>;
  created_at: TsDefault;
}

/** 蟹老板已经邀请过的店（每家只邀请一次） */
export interface NpcInviteTable {
  rest_id: number;
  created_at: TsDefault;
}

/** 买过的门（问题记录 350）：默认门 0 不记 */
export interface RestDoorTable {
  rest_id: number;
  door_id: number;
  acquired_at: TsDefault;
}

/** 定制称号（问题记录 539）：键是 c<id> */
export interface CustomIconTable {
  id: Generated<number>;
  title: string;
  descr: Nullable<string>;
  note: Nullable<string>;
  retired: Default<boolean>;
  created_by: Nullable<number>;
  created_at: TsDefault;
  updated_at: TsDefault;
}

export interface RestIconTable {
  id: Generated<number>;
  rest_id: number;
  icon_key: string;
  shown: Default<boolean>;
  granted_at: TsDefault;
  granted_by: Nullable<number>;
  /** 限时称号（240-2 发展基金）的到期时间；空是永久 */
  expires_at: TsNullable;
}

type AttrCols<P extends string> = {
  [K in `${P}${'cook' | 'cutting' | 'fire' | 'season' | 'creatives' | 'luck'}`]: Default<number>;
};

/** 厨具实例（子项目 2B）：base_ 为生成时的属性，st_ 为强化累计增量 */
export type EquipTable = {
  id: Generated<number>;
  rest_id: number;
  goods_id: number;
  /** 1 铲 2 刀 3 锅 4 瓶 5 帽 */
  part: number;
  suit_id: Default<number>;
  min_level: Default<number>;
  cur_hole: Default<number>;
  max_hole: Default<number>;
  stress: Default<number>;
  fail_streak: Default<number>;
  locked: Default<boolean>;
  worn: Default<boolean>;
  acquired_at: TsDefault;
  /** 命名帽子的名字（子项目 6A） */
  custom_name: Nullable<string>;
  /** 这顶命名玉帽换铉的时间，保证只换一次 */
  xuan_sent_at: TsNullable;
} & AttrCols<'base_'> &
  AttrCols<'st_'>;

export type EquipGemTable = {
  id: Generated<number>;
  equip_id: number;
  rest_id: number;
  gem_goods_id: number;
  level: number;
  created_at: TsDefault;
} & AttrCols<''>;

export interface EquipStressLogTable {
  id: Generated<number>;
  equip_id: number;
  rest_id: number;
  /** 这次尝试的目标等级 */
  stress: number;
  success: boolean;
  attr: Nullable<string>;
  val: Default<number>;
  lucky: Default<boolean>;
  floor: Default<boolean>;
  stone: Default<boolean>;
  created_at: TsDefault;
}

export interface EquipPresetTable {
  id: Generated<number>;
  rest_id: number;
  name: string;
  part1: Nullable<number>;
  part2: Nullable<number>;
  part3: Nullable<number>;
  part4: Nullable<number>;
  part5: Nullable<number>;
  created_at: TsDefault;
}

/** 已学特色菜（子项目 4A）；curexp 为累计熟练度 */
export interface RestMcTable {
  rest_id: number;
  mc_id: number;
  curlevel: Default<number>;
  curexp: Default<number>;
  trial_worth: Default<number>;
  trial_exp: Default<number>;
  /** 1 残卷 / 2 课程 / 3 偷学 */
  way: number;
  master_rest_id: Nullable<number>;
  learned_at: TsDefault;
}

export interface McRemnantTable {
  rest_id: number;
  mc_id: number;
  num: number;
}

/** 一次烹制；price 为每份价值 */
export interface McCookTable {
  id: Generated<number>;
  rest_id: number;
  shard_id: number;
  mc_id: number;
  level: number;
  grade: number;
  cook_num: number;
  total_num: number;
  left_num: number;
  price: number;
  /** 对决用的每份价值，不含试炼价值（用户 2026-10-07 定）；迁移 0054 前做的为空，用 price */
  duel_price: Nullable<number>;
  luck: Default<boolean>;
  eat_count: Default<number>;
  created_at: TsDefault;
  ended_at: TsNullable;
  /** sold / dumped / eaten */
  end_reason: Nullable<string>;
}

export interface McEatTable {
  cook_id: number;
  eater_rest_id: number;
  eaten_at: TsDefault;
}

export interface McLessonTable {
  id: Generated<number>;
  shard_id: number;
  teacher_rest_id: number;
  mc_id: number;
  level: number;
  max_num: number;
  ends_at: Ts;
  learned: Default<number>;
  stolen: Default<number>;
  closed_at: TsNullable;
  created_at: TsDefault;
}

export interface McLessonStudentTable {
  lesson_id: number;
  rest_id: number;
  /** 1 学 / 2 偷 */
  type: number;
  success: boolean;
  created_at: TsDefault;
}

/** 试炼对象（子项目 4B-1）：一家店一行 */
export interface RestTrialTable {
  rest_id: number;
  mc_id: number;
  /** 1 注射 / 2 冥想 */
  way: number;
  prepared_at: TsDefault;
}

export interface KrakenFeedTable {
  id: Generated<number>;
  rest_id: number;
  shard_id: number;
  /** 游戏日 YYYY-MM-DD */
  day: string;
  mc_id: number;
  target_mc_id: number;
  num: number;
  favor: number;
  created_at: TsDefault;
}

export interface TentacleSlot {
  mcId: number;
  bought: boolean;
}

export interface TentacleShopTable {
  rest_id: number;
  day: string;
  refreshes: Default<number>;
  slots: Json<TentacleSlot[]>;
}

export interface RestSeedTable {
  rest_id: number;
  seed_id: number;
  num: number;
}

/** 菜园土地（子项目 4B-2）：no 从 1 起，最多 9 块 */
export interface YardLandTable {
  id: Generated<number>;
  rest_id: number;
  no: number;
  level: Default<number>;
  exp: Default<number>;
  created_at: TsDefault;
}

/** 作物：一块地一株；stage 1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期；stage_at 是进入本阶段的时刻 */
export interface YardPlantTable {
  id: Generated<number>;
  rest_id: number;
  shard_id: number;
  land_id: number;
  seed_id: number;
  foods_id: number;
  stage: number;
  stage_at: Ts;
  /** 本阶段施肥抵扣的分钟数，进入下一阶段时清零 */
  feed_min: Default<number>;
  /** 各阶段分钟数：播种时从种子复制，干涸浇水会缩短 */
  infancy: number;
  maturity: number;
  autumn: number;
  harvest: number;
  /** 剩余产量 / 播种时的产量（含土地加成） */
  harvest_num: number;
  harvest_max: number;
  worm: Default<number>;
  grass: Default<number>;
  dry: Default<number>;
  planted_at: TsDefault;
}

export interface YardStealTable {
  plant_id: number;
  rest_id: number;
  created_at: TsDefault;
}

export interface YardBasketTable {
  rest_id: number;
  foods_id: number;
  num: number;
}

export interface RestFormulaTable {
  rest_id: number;
  formula_id: number;
  main_num: Default<number>;
  sub_num: Default<number>;
  learned: Default<boolean>;
}

/** 酒吧（子项目 4C-1）：每店一行，只存三个游戏的上一局结果（1 胜 / 0 平 / -1 负）和连续次数，老虎机连续没出稀有的格数 */
export interface BarStateTable {
  rest_id: number;
  fg_result: number | null;
  fg_times: Default<number>;
  cup_result: number | null;
  cup_times: Default<number>;
  num_result: number | null;
  num_times: Default<number>;
  slot_fail: Default<number>;
}

/** 酒吧连胜、连败的每周最高（问题记录 517）：week 是那一周的周一 */
export interface BarStreakBestTable {
  rest_id: number;
  game: string;
  /** 1 连胜 / 连中，-1 连败 / 连不中 */
  result: number;
  week: string;
  times: number;
  reached_at: Ts;
}

/** 酒吧进行中的局（子项目 4C-3）：一家店一种游戏一行，结束就删 */
export interface BarRoundTable {
  rest_id: number;
  game: string;
  state: Json<Record<string, unknown>>;
  started_at: Ts;
  updated_at: Ts;
}

/** 老虎机统计：每个奖项（含空格 0）累计格数 */
export interface BarSlotStatTable {
  rest_id: number;
  award_id: number;
  num: number;
}

/** 厨塔（子项目 4C-2）：每店打赢过的最高层 */
export interface TowerStateTable {
  rest_id: number;
  best_floor: Default<number>;
}

/** 守塔人当天抽到的特色菜：每区服每层一行，每天覆盖 */
export interface TowerWatchmanMcTable {
  shard_id: number;
  floor: number;
  mc_id: number;
  /** 每份价值 */
  price: number;
  /** YYYY-MM-DD（抽菜的游戏日） */
  day: string;
}

/** 赛厨榜：只存有人的格子；week 是本周一 */
export interface TowerRankTable {
  shard_id: number;
  week: string;
  rank: number;
  rest_id: number;
}

/** 外卖（子项目 4D）：有这一行 = 已开通 */
export interface TownBlessTable {
  shard_id: number;
  day: string;
  bless_id: number;
  rest_id: number;
  created_at: Ts;
}

export interface TownRestTable {
  rest_id: number;
  hammer_at: TsNullable;
  broadcast_at: TsNullable;
  big_eater_gift: Default<boolean>;
}

export interface TownShakeTable {
  id: Generated<number>;
  shard_id: number;
  day: string;
  rest_id: number;
  ip: Default<string>;
  device: Default<string>;
  coin: number;
  created_at: Ts;
}

export interface TownExchangeUseTable {
  rest_id: number;
  exchange_id: number;
  times: number;
}

export interface TakeawayStateTable {
  rest_id: number;
  /** 可雇骑手上限（含自己） */
  rider_cap: Default<number>;
  opened_at: Date;
}

/** 骑手：rest_id 是雇主，rider_rest_id 是骑手店（自己给自己当骑手时两者相同） */
export interface TakeawayRiderTable {
  id: Generated<number>;
  rest_id: number;
  rider_rest_id: number;
  level: Default<number>;
  /** 当前等级里攒的经验 */
  exp: Default<number>;
  hired_at: Date;
}

/** 外卖单：owner_rest_id 为空是全服公共单，否则是这家店的私人单；state 1 可接、2 配送中、3 完成 */
export interface TakeawayOrderTable {
  id: Generated<number>;
  shard_id: number;
  owner_rest_id: Nullable<number>;
  cookbook_id: number;
  grade: number;
  need_minutes: number;
  need_renown: number;
  state: Default<number>;
  created_at: Date;
  expires_at: Date;
}

/** 一次配送：接单时定下的数值；state 1 配送中、2 成功、3 失败 */
export interface TakeawayDeliveryTable {
  id: Generated<number>;
  order_id: number;
  rest_id: number;
  rider_id: number;
  grade: number;
  private: boolean;
  double: boolean;
  mystery_kinds: number;
  coin: number;
  exp: number;
  renown: number;
  success_odds: number;
  started_at: Date;
  arrive_at: Date;
  state: Default<number>;
  drone: Default<boolean>;
  /** 领取结果（写入传 JSON 字符串） */
  result: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
  settled_at: TsNullable;
}

export type EquipRow = Selectable<EquipTable>;
export type EquipGemRow = Selectable<EquipGemTable>;

/** 嘻哈男孩每日地点（子项目 4E-2）：每区每天一行 */
export interface HiphopDayTable {
  shard_id: number;
  day: string;
  /** 1~6 公共地点，9 某家餐厅 */
  place: number;
  rest_id: Nullable<number>;
  foods_id: number;
  worth: number;
  created_at: Ts;
}

/** 打赏记录（子项目 4E-2） */
export interface HiphopTipTable {
  id: Generated<number>;
  shard_id: number;
  rest_id: number;
  kind: string;
  num: number;
  foods_id: Nullable<number>;
  worth: number;
  krab_coin: Default<number>;
  created_at: Ts;
}

/** 论坛帖子（子项目 4E-3）：计数冗余存在这里，和操作在同一事务里更新 */
export interface ForumPostTable {
  id: Generated<number>;
  shard_id: number;
  rest_id: number;
  category: string;
  title: string;
  content: string;
  created_at: Ts;
  edited_at: TsNullable;
  deleted_at: TsNullable;
  pinned_at: TsNullable;
  featured_at: TsNullable;
  feature_rewarded: Default<boolean>;
  read_num: Default<number>;
  up_num: Default<number>;
  down_num: Default<number>;
  reply_count: Default<number>;
  last_reply_at: TsNullable;
}

export interface ForumReplyTable {
  id: Generated<number>;
  post_id: number;
  rest_id: number;
  floor: number;
  reply_to: Nullable<number>;
  anonymous: Default<boolean>;
  content: string;
  created_at: Ts;
  deleted_at: TsNullable;
}

export interface ForumReactionTable {
  post_id: number;
  rest_id: number;
  kind: string;
  created_at: Ts;
}

export interface ForumReadTable {
  post_id: number;
  rest_id: number;
  times: number;
  first_at: Ts;
  last_at: Ts;
}

/** 邮件（子项目 6A）：一封一行，全服邮件不按店复制 */
export interface MailTable {
  id: Generated<number>;
  scope: 'rest' | 'shard' | 'all';
  shard_id: Nullable<number>;
  rest_id: Nullable<number>;
  min_level: Nullable<number>;
  title: string;
  body: string;
  items: ColumnType<unknown | null, string | null | undefined, string | null>;
  /** 系统邮件的模板键和参数（问题记录 272）：前端按语言渲染；管理员写的邮件为空 */
  tpl: Nullable<string>;
  tpl_params: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
  source: string;
  actor_account_id: Nullable<number>;
  created_at: TsDefault;
  expires_at: TsDefault;
  revoked_at: TsNullable;
}

/** 每家店对一封邮件的已读、已领、已删 */
export interface MailStateTable {
  mail_id: number;
  rest_id: number;
  read_at: TsNullable;
  claimed_at: TsNullable;
  deleted_at: TsNullable;
}

/** 友情链接（问题记录 348） */
export interface FriendLinkTable {
  id: Generated<number>;
  name: string;
  url: string;
  note: Default<string>;
  sort: Default<number>;
  created_at: TsDefault;
  updated_at: TsDefault;
}

export interface AnnouncementTable {
  id: Generated<number>;
  shard_id: Nullable<number>;
  title: string;
  body: string;
  important: Default<boolean>;
  starts_at: Ts;
  ends_at: Ts;
  actor_account_id: number;
  created_at: TsDefault;
  updated_at: TsDefault;
  deleted_at: TsNullable;
}

export interface AnnouncementSeenTable {
  account_id: number;
  announcement_id: number;
  seen_at: TsDefault;
}

export interface RedeemCodeTable {
  id: Generated<number>;
  code: string;
  kind: 'shared' | 'single';
  batch_id: Nullable<number>;
  items: Json<unknown>;
  shard_id: Nullable<number>;
  min_level: Nullable<number>;
  max_uses: Nullable<number>;
  used_count: Default<number>;
  starts_at: TsNullable;
  ends_at: TsNullable;
  note: string;
  actor_account_id: number;
  created_at: TsDefault;
  disabled_at: TsNullable;
}

export interface RedeemUseTable {
  id: Generated<number>;
  code_id: number;
  rest_id: number;
  account_id: number;
  used_at: TsDefault;
}

export interface InviteRewardTable {
  invitee_account_id: number;
  stage: 'newbie' | 'lv10' | 'lv30';
  inviter_account_id: Nullable<number>;
  shard_id: number;
  invitee_rest_id: number;
  status: 'pending' | 'sent' | 'capped';
  month: string;
  mail_id: Nullable<number>;
  created_at: TsDefault;
  sent_at: TsNullable;
}

/** 举报（子项目 6B-1）：一个被举报的内容一个待处理的案子 */
export interface ReportCaseTable {
  id: Generated<number>;
  shard_id: number;
  target_type: 'post' | 'reply' | 'broadcast' | 'rest_name' | 'notice';
  target_id: number;
  target_rest_id: number;
  target_account_id: number;
  snapshot: string;
  status: Default<'open' | 'resolved' | 'rejected'>;
  reporter_count: Default<number>;
  created_at: TsDefault;
  updated_at: TsDefault;
  handled_by: Nullable<number>;
  handled_at: TsNullable;
  action: Nullable<string>;
  ban_days: Nullable<number>;
  note: Nullable<string>;
}

export interface ReportEntryTable {
  id: Generated<number>;
  case_id: number;
  reporter_account_id: number;
  reporter_rest_id: number;
  reason: 'abuse' | 'porn' | 'ad' | 'politics' | 'other';
  detail: Default<string>;
  created_at: TsDefault;
}

/** 登录记录（子项目 6B-2，多号检测）：每账号、IP、设备一行，只留 30 天 */
export interface LoginTraceTable {
  account_id: number;
  ip: string;
  device_id: Nullable<string>;
  device_key: Generated<string>;
  first_seen: TsDefault;
  last_seen: TsDefault;
}

export interface ActivityTable {
  id: Generated<number>;
  shard_id: Nullable<number>;
  kind: 'goals' | 'grid' | 'pass' | 'boost' | 'exchange' | 'coop';
  title: string;
  body: string;
  starts_at: Ts;
  ends_at: Ts;
  min_level: Default<number>;
  def: Json<unknown>;
  actor_account_id: Nullable<number>;
  created_at: TsDefault;
  updated_at: TsDefault;
  deleted_at: TsNullable;
}
export interface ActivityCounterTable {
  activity_id: number;
  rest_id: number;
  key: string;
  /** bigint：pg 读出为字符串，用 Number() 转 */
  count: ColumnType<string, number | string, number | string>;
}
export interface ActivityClaimTable {
  activity_id: number;
  rest_id: number;
  reward_key: string;
  via: 'page' | 'mail';
  claimed_at: TsDefault;
}
export interface ActivityPassTable {
  activity_id: number;
  rest_id: number;
  unlocked_at: TsDefault;
}
export interface ActivitySettleTable {
  activity_id: number;
  shard_id: number;
  settled_at: TsDefault;
}

/** 补发出错的店（backlog 148-1）：出错次数到上限就放弃这家 */
export interface ActivitySettleFailTable {
  activity_id: number;
  rest_id: number;
  fails: Default<number>;
  last_error: Default<string>;
  updated_at: TsDefault;
}

export interface ExchangeOrderTable {
  id: Generated<string>;
  shard_id: number;
  rest_id: number;
  side: 'buy' | 'sell';
  foods_id: number;
  price: number;
  qty: number;
  filled: Default<number>;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  created_at: TsDefault;
  expires_at: Ts;
  closed_at: TsNullable;
}
export interface ExchangeTradeTable {
  id: Generated<string>;
  shard_id: number;
  foods_id: number;
  price: number;
  qty: number;
  buy_order_id: string | null;
  sell_order_id: string | null;
  /** 系统做市的成交里系统一方为空（156-3） */
  buyer_rest_id: number | null;
  seller_rest_id: number | null;
  /** bigint：pg 读出为字符串 */
  fee: ColumnType<string, number | string, number | string>;
  created_at: TsDefault;
  buyer_account_id: Nullable<number>;
  seller_account_id: Nullable<number>;
  flags: ColumnType<string[], string[] | undefined, string[]>;
  system: Default<boolean>;
}
export interface ExchangeRefTable {
  shard_id: number;
  foods_id: number;
  day: string;
  price: number;
}
export interface ExchangeWalletTable {
  rest_id: number;
  coin: ColumnType<string, number | string | undefined, number | string>;
}
export interface ExchangeWalletFoodTable {
  rest_id: number;
  foods_id: number;
  num: number;
}

export interface ExchangeHoldTable {
  id: Generated<string>;
  rest_id: number;
  trade_id: string | null;
  coin: ColumnType<string, number | string | undefined, number | string>;
  foods_id: number | null;
  num: Default<number>;
  release_at: Ts;
  status: 'held' | 'released' | 'confiscated';
  created_at: TsDefault;
}
export interface ExchangeStockTable {
  shard_id: number;
  foods_id: number;
  num: Default<number>;
}
export interface ExchangeMakerDayTable {
  shard_id: number;
  foods_id: number;
  day: string;
  bought: Default<number>;
}
export interface PredictEventTable {
  id: Generated<string>;
  shard_id: number;
  kind: Default<string>;
  title: string;
  description: Default<string>;
  params: JsonDefault<Record<string, unknown>>;
  b: number;
  unit: number;
  q_yes: Default<number>;
  q_no: Default<number>;
  p0: number;
  open_at: Ts;
  close_at: Ts;
  status: 'open' | 'closed' | 'resolved' | 'void';
  outcome: Nullable<boolean>;
  created_by: Nullable<number>;
  resolved_at: TsNullable;
  settled_at: TsNullable;
  /** 作废时的退款比例（0~1）；没作废为空 */
  void_ratio: Nullable<number>;
  /** 自动题的唯一键，例如 krab:2026-10-03；手动题为空（238-2） */
  auto_key: Nullable<string>;
  /** 判定依据 */
  result_note: Nullable<string>;
  /** 自动题判定依据的参数（问题记录 272）：前端按语言渲染；旧数据为空 */
  result_params: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
  /** 自动题最早判定时间 */
  resolve_at: TsNullable;
  created_at: TsDefault;
}
export interface PredictPositionTable {
  event_id: string;
  rest_id: number;
  yes: Default<number>;
  no: Default<number>;
  /** bigint：pg 读出为 number（INT8 解析器） */
  net_cost: Default<number>;
  settled: Default<boolean>;
}
export interface PredictTradeTable {
  id: Generated<string>;
  event_id: string;
  rest_id: number;
  side: 'yes' | 'no';
  dir: 'buy' | 'sell';
  qty: number;
  amount: number;
  fee: number;
  price_after: number;
  created_at: Ts;
}

/** 每家店每个游戏日的结算银币合计和轮数（收购：income_round 只留 3 天，身价看 7 天） */
export interface RestIncomeDayTable {
  rest_id: number;
  /** 游戏日 YYYY-MM-DD */
  day: string;
  coin: number;
  rounds: number;
}

/** 支线“经营”（任务清单第二版）：历史单日最高结算银币、最多营业轮数，两样各取最大 */
export interface RestIncomeBestTable {
  rest_id: number;
  day_coin: number;
  day_rounds: number;
}

/** 小镇日报的状态：pending 还没生成成功 / draft 待审 / published 已发布 / hidden 撤下 */
export type DailyStatus = 'pending' | 'draft' | 'published' | 'hidden';

/** 小镇日报（2026-10-08）：每区服每天一行 */
export interface TownDailyTable {
  shard_id: number;
  /** 游戏日 YYYY-MM-DD（写的是这一天的事） */
  day: string;
  status: DailyStatus;
  /** 素材，见 modules/daily/facts.ts */
  facts: Json<unknown>;
  /** { 'zh-CN' | 'en' | 'zh-TW': { title, body } }；没生成成功时为 null */
  content: ColumnType<unknown | null, string | null | undefined, string | null>;
  model: Nullable<string>;
  tokens_in: Default<number>;
  tokens_out: Default<number>;
  attempts: Default<number>;
  regenerations: Default<number>;
  error: Nullable<string>;
  generated_at: TsNullable;
  published_at: TsNullable;
  published_by: Nullable<number>;
  created_at: TsDefault;
}

/** 每家店的收购状态（问题记录 421）：2 星以上、或被收购过的店才有行 */
export interface AcquireStateTable {
  rest_id: number;
  shard_id: number;
  /** 现在的老板；null = 自主经营 */
  owner_rest_id: Nullable<number>;
  /** 基础身价：每天 00:05 按近几天的结算银币算 */
  base: number;
  heat: Default<number>;
  /** 赎身保护到什么时候 */
  protected_until: TsNullable;
  /** 挂牌折扣（身价的比例）；没挂牌为 null */
  list_rate: Nullable<number>;
  list_until: TsNullable;
  acquired_at: TsNullable;
}

/** 被收购的店替老板打理（收购 PR 2）：每家店每个游戏日一行 */
export interface AcquireTendTable {
  rest_id: number;
  /** 游戏日 YYYY-MM-DD */
  day: string;
  created_at: Ts;
}

/** 每家被收购的店每天给老板的分红（压过封顶以后的）；day 是结算的那天 */
/** 期货食材列表（期货设计 §5）：全服一份；不在表里 = 没上架 */
export interface FuturesFoodTable {
  foods_id: number;
  enabled: Default<boolean>;
  /** 单独的区服每日额度；空 = 按等级默认 */
  daily_quota: Nullable<number>;
  updated_at: TsDefault;
  updated_by: Nullable<number>;
}
/** 期货单（期货设计 §6）：单价、定金、尾款下单时锁定 */
export interface FuturesContractTable {
  id: Generated<string>;
  shard_id: number;
  rest_id: number;
  foods_id: number;
  qty: number;
  unit_price: number;
  deposit: number;
  balance: number;
  created_at: Ts;
  due_at: Ts;
  status: Default<'open' | 'delivered' | 'defaulted' | 'cancelled'>;
  settled_at: TsNullable;
  to_cupboard: Default<number>;
  to_wallet: Default<number>;
}
/** 区服每天每种食材已订的份数（期货设计 §4） */
export interface FuturesQuotaTable {
  shard_id: number;
  foods_id: number;
  /** YYYY-MM-DD（游戏日） */
  day: string;
  used: Default<number>;
}

export interface AcquireDividendTable {
  rest_id: number;
  day: string;
  owner_rest_id: number;
  coin: number;
  /** 那天打理过（分红 × 1.5） */
  tended: boolean;
}

/** 每个老板的累计分红（投资榜用，免得每次加总全表） */
export interface AcquireHolderTable {
  rest_id: number;
  dividend_total: Default<number>;
}

export type AcquireLogKind = 'acquire' | 'buy_listed' | 'redeem' | 'release';

/** 收购的交易记录：强收、买挂牌、赎身、放手 */
export interface AcquireLogTable {
  id: Generated<number>;
  shard_id: number;
  kind: AcquireLogKind;
  buyer_rest_id: Nullable<number>;
  target_rest_id: number;
  /** 收钱的一方（原主人；赎身时是老板；放手时是放手的老板） */
  seller_rest_id: Nullable<number>;
  price: number;
  tax: number;
  heat_after: number;
  created_at: Ts;
}

/** 关联账号（共用设备 / IP）想收购时拦下来的记录：后台可疑数据页看 */
export interface AcquireBlockTable {
  id: Generated<number>;
  shard_id: number;
  buyer_rest_id: number;
  target_rest_id: number;
  reason: 'device' | 'ip';
  created_at: Ts;
  /** 关联的账号（迁移 0052）；旧记录为空 */
  linked_account_id: number | null;
}

/** 小镇发展基金存款（240-2）：同一家店同时只能有一笔 active */
export interface FundDepositTable {
  id: Generated<number>;
  shard_id: number;
  rest_id: number;
  tier: string;
  coin: number;
  /** 存入时这一档的勋章；之后改区服数值不影响 */
  medal: number;
  started_at: Ts;
  /** 存入时按当时的存期算好 */
  matures_at: Ts;
  status: ColumnType<
    'active' | 'claimed' | 'withdrawn',
    'active' | 'claimed' | 'withdrawn' | undefined,
    'active' | 'claimed' | 'withdrawn'
  >;
  settled_at: TsNullable;
  returned: Nullable<number>;
}

/** 食材理财（理财设计 §3.2）：期限、补给包、个数按存入时写进来 */
export interface WealthDepositTable {
  id: Generated<number>;
  shard_id: number;
  rest_id: number;
  coin: number;
  days: number;
  goods_id: number;
  packs: number;
  started_at: Ts;
  matures_at: Ts;
  status: ColumnType<
    'active' | 'claimed' | 'withdrawn',
    'active' | 'claimed' | 'withdrawn' | undefined,
    'active' | 'claimed' | 'withdrawn'
  >;
  settled_at: TsNullable;
  returned: Nullable<number>;
}

export interface KujiPoolTable {
  id: Generated<string>;
  shard_id: number;
  day: string;
  seq: number;
  status: 'open' | 'sold_out' | 'expired';
  total: number;
  last_rest_id: Nullable<number>;
  created_at: Ts;
  closed_at: TsNullable;
  /** 开池时的奖品配置快照（一番赏终审 I1）；jsonb，读出为对象，写入传 JSON 字符串 */
  tiers: ColumnType<unknown, string | null | undefined, string | null>;
  last: ColumnType<unknown, string | null | undefined, string | null>;
  /** 开池时的月度主题（问题记录 274）：1~12；之前开的池为空 */
  theme: Nullable<number>;
  /** 奖池线（240-2）：普通或豪华，迁移前的池都是 normal */
  line: Default<'normal' | 'deluxe'>;
}
export interface KujiTicketTable {
  pool_id: string;
  idx: number;
  tier: string;
  drawn_by: Nullable<number>;
  drawn_at: TsNullable;
}
export interface ExchangeFreezeTable {
  rest_id: number;
  reason: string;
  actor_account_id: number | null;
  created_at: TsDefault;
}

export interface ServerSecretTable {
  key: string;
  value: string;
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
  signin_streak: SigninStreakTable;
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
  quest_done: QuestDoneTable;
  weekly_counter: WeeklyCounterTable;
  weekly_claim: WeeklyClaimTable;
  income_round: IncomeRoundTable;
  rest_log: RestLogTable;
  job_run: JobRunTable;
  shard_config_history: ShardConfigHistoryTable;
  admin_grant: AdminGrantTable;
  admin_grant_done: AdminGrantDoneTable;
  stat_daily: StatDailyTable;
  friend: FriendTable;
  friend_request: FriendRequestTable;
  dine_dash: DineDashTable;
  cupboard_flip: CupboardFlipTable;
  thumb: ThumbTable;
  rest_icon: RestIconTable;
  custom_icon: CustomIconTable;
  rest_door: RestDoorTable;
  npc_invite: NpcInviteTable;
  equip: EquipTable;
  equip_gem: EquipGemTable;
  equip_stress_log: EquipStressLogTable;
  equip_preset: EquipPresetTable;
  rest_mc: RestMcTable;
  mc_remnant: McRemnantTable;
  mc_cook: McCookTable;
  mc_eat: McEatTable;
  mc_lesson: McLessonTable;
  mc_lesson_student: McLessonStudentTable;
  rest_trial: RestTrialTable;
  kraken_feed: KrakenFeedTable;
  tentacle_shop: TentacleShopTable;
  rest_seed: RestSeedTable;
  yard_land: YardLandTable;
  yard_plant: YardPlantTable;
  yard_steal: YardStealTable;
  yard_basket: YardBasketTable;
  rest_formula: RestFormulaTable;
  bar_state: BarStateTable;
  bar_streak_best: BarStreakBestTable;
  bar_slot_stat: BarSlotStatTable;
  bar_round: BarRoundTable;
  hiphop_day: HiphopDayTable;
  hiphop_tip: HiphopTipTable;
  forum_post: ForumPostTable;
  forum_reply: ForumReplyTable;
  forum_reaction: ForumReactionTable;
  forum_read: ForumReadTable;
  mail: MailTable;
  mail_state: MailStateTable;
  announcement: AnnouncementTable;
  friend_link: FriendLinkTable;
  announcement_seen: AnnouncementSeenTable;
  redeem_code: RedeemCodeTable;
  redeem_use: RedeemUseTable;
  invite_reward: InviteRewardTable;
  report_case: ReportCaseTable;
  report_entry: ReportEntryTable;
  login_trace: LoginTraceTable;
  activity: ActivityTable;
  activity_counter: ActivityCounterTable;
  activity_claim: ActivityClaimTable;
  activity_pass: ActivityPassTable;
  activity_settle: ActivitySettleTable;
  activity_settle_fail: ActivitySettleFailTable;
  exchange_order: ExchangeOrderTable;
  futures_food: FuturesFoodTable;
  futures_contract: FuturesContractTable;
  futures_quota: FuturesQuotaTable;
  exchange_trade: ExchangeTradeTable;
  exchange_ref: ExchangeRefTable;
  exchange_wallet: ExchangeWalletTable;
  exchange_wallet_food: ExchangeWalletFoodTable;
  exchange_hold: ExchangeHoldTable;
  exchange_freeze: ExchangeFreezeTable;
  exchange_stock: ExchangeStockTable;
  exchange_maker_day: ExchangeMakerDayTable;
  predict_event: PredictEventTable;
  predict_position: PredictPositionTable;
  predict_trade: PredictTradeTable;
  kuji_pool: KujiPoolTable;
  fund_deposit: FundDepositTable;
  wealth_deposit: WealthDepositTable;
  rest_income_day: RestIncomeDayTable;
  rest_income_best: RestIncomeBestTable;
  town_daily: TownDailyTable;
  acquire_state: AcquireStateTable;
  acquire_log: AcquireLogTable;
  acquire_block: AcquireBlockTable;
  acquire_tend: AcquireTendTable;
  acquire_dividend: AcquireDividendTable;
  acquire_holder: AcquireHolderTable;
  kuji_ticket: KujiTicketTable;
  tower_state: TowerStateTable;
  tower_watchman_mc: TowerWatchmanMcTable;
  tower_rank: TowerRankTable;
  takeaway_state: TakeawayStateTable;
  town_bless: TownBlessTable;
  town_rest: TownRestTable;
  town_shake: TownShakeTable;
  town_exchange_use: TownExchangeUseTable;
  takeaway_rider: TakeawayRiderTable;
  takeaway_order: TakeawayOrderTable;
  takeaway_delivery: TakeawayDeliveryTable;
  server_secret: ServerSecretTable;
}

export type RestaurantRow = Selectable<RestaurantTable>;
export type McCookRow = Selectable<McCookTable>;
export type McLessonRow = Selectable<McLessonTable>;
export type YardLandRow = Selectable<YardLandTable>;
export type YardPlantRow = Selectable<YardPlantTable>;
export type BarStateRow = Selectable<BarStateTable>;
export type TowerStateRow = Selectable<TowerStateTable>;
export type TakeawayStateRow = Selectable<TakeawayStateTable>;
export type TakeawayRiderRow = Selectable<TakeawayRiderTable>;
export type TakeawayOrderRow = Selectable<TakeawayOrderTable>;
export type TakeawayDeliveryRow = Selectable<TakeawayDeliveryTable>;
