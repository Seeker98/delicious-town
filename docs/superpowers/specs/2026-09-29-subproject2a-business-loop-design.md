# 子项目 2A「经营循环」设计

- 日期：2026-09-29
- 状态：待审阅
- 上位文档：`2026-09-29-rewrite-architecture-design.md`（下文简称"架构文档"）
- 游戏规则依据：`../analysis/spec/` 的 00、01、02、03、05、06、07、15、16、20 章（下文简称"规格书 xx"）
- 子项目 2 已拆成 2A（本文）和 2B「厨具」

## 1. 目标与范围

**完成标志**：一个新号开店后能完整地单人经营：开店结算拿银币和经验 → 菜场买食材 → 学习和升级食谱 → 升级、升星、扩油壶、摆设施、加餐桌 → 使用道具、做任务、拿活跃奖励；数值模拟器能给出成长节奏和经济报告。

### 1.1 包含

| 模块 | 内容 | 规格书 |
|---|---|---|
| 结算 | 每 4 分钟一轮：上座、挑剔、蟑螂、痞老板、蟹老板（神秘顾客）、章鱼哥、逐桌分配、溢出、挑剔消耗食材、自动加油、升级检查、加成分项 | 01 |
| 小镇状态 | 每个区服的天气轮换、蟹老板所在街道、痞老板驻留店、节日倍数 | 01 §1.2、12 §12.1、00 §0.12 |
| 定时恢复 | 体力（每 10 分钟）、老鼠捣乱（每 30 分钟） | 01 §1.9、§1.10 |
| 成长 | 升级、加点、洗点、升星、油壶扩容、加油、设施位（含第二牌匾位）、餐桌和楼层、改名、搬家、大促、挑剔消耗食材开关、银币转经验、赶走痞老板、赶走生气的蟹老板 | 02 |
| 食谱 | 1~7 品级学习和升级、万能食材替代、列表、食材需求计算 | 03 |
| 橱柜 | 容量、冰箱（溢出、解冻）、锁定和锁定记忆、合成分解、万能食材兑换 | 05 §5.1~5.5 |
| 菜场 | 日常 / 特价 / 高级三种货架、购买和限购、竞猜 | 06 §6.1~6.3 |
| 商店 | 银币商店、每日特价、黑市、出售、丢弃 | 06 §6.5~6.6、07 §7.6 |
| 仓库 | 持有、使用道具、礼包、随机奖励 | 07 §7.1~7.5、00 §0.8~0.9 |
| 任务 | 主线和支线（事件计数器）、每日活跃度和奖励、签到 | 15 §15.1~15.3、20 §20.11 |
| 数值模拟器 | 成长节奏、经济平衡、单店收益分解、5000 店结算压测，输出 HTML 报告 | 本文第 8 节 |
| 前端 | 以上玩法的页面，手机优先 | 本文第 7 节 |

### 1.2 不包含（归属后续子项目）

| 内容 | 归属 |
|---|---|
| 厨具全部玩法（生成、穿戴、预设、强化、回退、分解、打孔、镶嵌、宝石升阶、套装） | 2B |
| 好友、白食、放蟑螂、打蟑螂、翻橱、交换食材、点赞 | 3 |
| 换门、公告栏、个性图标、头像 | 3 |
| 特色菜、神殿、酒吧、厨塔、外卖、菜园、协会其他功能、祝福、菜场工作证进货、商店工作证 | 4 |
| 口味偏好、仙珍 / 天馔（8~10 品级）、泛紫星级、强制开店、摆烂 | 5 |
| 钻石补 / 爱心项链补活跃、兑换码、邀请统计 | 6 |

结算对这些玩法留好输入接口：数据存在时按规则处理，不存在时为空或 0（见 §4.2）。

## 2. 规则裁定

规格书没说清、或旧实现有问题的地方，按下表执行。

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 规格书 01 §1.5E：coinValue 在分支 A 和最终值里各加一次 | 视为 bug，每张有顾客的桌子只加一次 |
| 2 | 结算依赖尚未实现的玩法（白食、放蟑螂、特色菜、祝福、集盆栽/名画、口味） | 结算定义输入接口，数据存在时按规则处理，缺省为空或 0 |
| 3 | 蟹老板所在街道原来取"管理员餐厅 99"的街道 | 改成区服小镇状态 `krab_street`，每天 9 点从街道 1~13 中均匀随机 |
| 4 | 痞老板驻留店 | 区服小镇状态 `plankton_rest_id`；为空时从营业中、1 星及以上的店里随机选一家；驻留到店主赶走为止，下一轮再选新的 |
| 5 | 节日倍数的农历日期 | 配置里放一张未来 10 年的农历节日公历日期表（2026~2035），不引入农历库；公历节日按固定日期 |
| 6 | 仓库容量 storenum 满了怎么办 | 容量 = 持有的不同非勋章道具种数上限。满了时商店、黑市、特价购买被拒绝；任务、礼包、结算掉落等奖励照发，不丢奖励 |
| 7 | 主线任务依赖尚未实现的玩法（例如第 8 步打蟑螂、第 9 步加好友） | 任务按事件键前缀归属到功能（映射表在配置里，未知前缀视为未实现）。功能未实现或在区服关闭时：主线该步自动跳过、不发奖励；支线不显示。功能以后开启，已经越过的玩家不回溯 |
| 8 | 改名费用用到"上周被放蟑螂数" | 取值接口先返回 0（子项目 3 接入），此时只消耗改名卡 |
| 9 | 没油停业后怎么恢复 | 加油（手动或自动）后，油 > 0 时自动恢复营业 |
| 10 | 升级是否直接加桌 | 升级只提高餐桌上限 table_num；实际桌子靠"餐桌A"道具添加（受楼层容量 (星级+1)×16 限制） |
| 11 | worker 停机期间错过的轮次 | 不补跑，记录日志 |
| 12 | 自动换天气是否包括特殊天气 | 不包括；specialflag=1 的天气只能用钻石召唤（子项目 4） |
| 13 | 夜间天气的权重 | 用规格书 20 §20.13 的夜间权重（夜间晴 40、夜间多云 35、夜间雾 25）；全天通用的天气沿用自身 odds |
| 14 | 竞猜奖励用 `240+n` 拼道具 id | 改成配置表：猜中数 → 奖励 |
| 15 | 使用道具按名字分派 | 配置包构建时把每个道具规范化成"用途描述"，运行时只看用途类型；识别不了的道具不能使用 |
| 16 | QQ 原版格式的礼包（新手大礼包、开发测试礼包） | 标记为不能使用（这些道具在新服拿不到） |
| 17 | 停业餐厅每轮写一条"油量不足" | 不再写；停业店不进结算 |

## 3. 数据模型

新增迁移 `0002`。

### 3.1 现有表的扩展

**restaurant** 新增列：

| 列 | 类型 | 说明 |
|---|---|---|
| promo_on | boolean default false | 大促活动 |
| cte_on | boolean default false | 银币转经验 |
| cookfoods_flag | smallint default 0 | 挑剔消耗食材档位（0 关闭） |
| plaque2_open | boolean default false | 第二牌匾位已开通 |
| main_task_step | integer default 1 | 主线进度 |
| state_reason | text null | 停业原因（`no_oil`） |

`cookbook_counts` 固定为：
```json
{ "learned": 15, "grade": [0, 12, 3, 0, 0, 0, 0, 0, 0, 0, 0], "street": { "0": 15 } }
```
`grade[L]` = 当前品级恰好为 L 的食谱数，`street[s]` = 该街道已学数。学习或升级时在同一事务里更新。"N 品级及以上的数量"由 grade 求和得到。

**restaurant_tables.tables** 每张桌子：
```ts
interface TableState {
  no: number;
  floor: number;
  customer: number;            // 规格书 01 §1.4 的 type，-3 = 被蟑螂药消灭
  roach?: { by: number | null; at: string };        // 放蟑螂的人（自然产生为 null）
  freeloader?: { restId: number; level: number; since: string; coin: number; exp: number }; // 子项目 3 写入
  last?: { type: number; coin: number; exp: number; oil: number; req?: number; grade?: number; cookbookId?: number };
}
```

**加成汇总**：重新汇总 `effect_agg` 时，同时计算收集类派生键写入汇总：
- `plaqueSum`：仓库里不同牌匾（type 3、devicetype 6）的种数 × 1%，有 2023 纪念牌匾时翻倍（规格书 20 §20.18）
- `honorAdd`：有效勋章数 × 0.4%，马到成功牌匾 ×1.5，2025 纪念牌匾让荣誉给的银币加成 +16%
- 集盆栽 / 集名画：按 `suit_pot` / `suit_painting` 的阈值，达到的档位把 note 里的键加进汇总

牌匾或勋章的持有变动时，把 `effect_dirty` 置为 true。

### 3.2 新表

| 表 | 结构 | 说明 |
|---|---|---|
| `cupboard_food` | PK (rest_id, foods_id)；num int ≥0、fridge_num int ≥0、locked bool、fridge_unread bool | 橱柜和冰箱同一行。已用格数 = num>0 的行数。num 与 fridge_num 都为 0 且未锁定时删除这一行 |
| `restaurant_device` | PK (rest_id, slot)；goods_id、placed_at、expires_at null | 设施位 1~9；摆放同时写 `effect_source(type='device', id=slot)` |
| `world_state` | PK shard_id；weather_id、weather_until、krab_street、plankton_rest_id null、updated_at | 区服小镇状态 |
| `market_item` | id PK、shard_id、shelf smallint（0 日常 / 1 特价 / 2 高级）、period text、foods_id、stock、sold、hot bool、opened_at | 菜场货架；刷新时删除同区服同货架的旧货 |
| `market_buy` | PK (market_item_id, subject)；num | 限购计数，subject 为 `rest:<id>` / `dev:<哈希>` / `ip:<地址>`；随货架级联删除 |
| `market_guess` | PK (shard_id, period, rest_id)；foods_ids int[]、hits int null、settled_at null | 竞猜；period 为被竞猜的那一轮日常菜场 |
| `shop_special` | PK (shard_id, day)；goods_id、discount、tier_name、stock、sold | 每日特价 |
| `event_counter` | PK (rest_id, key)；count bigint | 全历史事件计数 |
| `task_done` | PK (rest_id, task_id)；done_at | 已领奖的支线 |
| `income_round` | 按天分区保留 3 天；rest_id、round_no、coin、exp、oil、customers jsonb（各顾客类型桌数）、rates jsonb（汇总率及分项）、drops jsonb、created_at | 每店每轮一行 |
| `rest_log` | 按天分区保留 30 天；rest_id、type、params jsonb、created_at | 个人日志，前端渲染 |
| `job_run` | PK (shard_id, job, period)；started_at、finished_at null、stats jsonb | 周期任务去重和执行记录 |

每日次数一律用现有的 `daily_counter`，键名集中定义成常量（签到、活跃各项、活跃档位领取、免体力合成次数、菜场购买等）。

分区维护任务扩展到 `income_round`（保留 3 天）和 `rest_log`（保留 30 天）。

### 3.3 配置

配置包新增或规范化：

| 配置 | 来源 |
|---|---|
| 设施位 | dataset/devices.json |
| 星级要求 / 奖励、油壶扩容 | designed/star_need、star_award、oil_need（已接入，补齐使用） |
| 食谱品级系数 | designed/cookbook_grades |
| 商店特价档位、特价池、黑市池 | designed/shop_special_rate、shop_pools |
| 天气（含 daytime、type、specialflag、夜间权重） | designed/weather |
| 集盆栽 / 集名画阈值 | dataset/suit_pot、suit_painting |
| 竞猜食材池、竞猜奖励表 | dataset/market_guess_foods + 新增 designed/market_guess_award |
| 节日表（公历 + 2026~2035 农历） | 新增 designed/holidays |
| 活跃项、活跃奖励 | dataset/activation_tasks、activation_rewards（已接入） |
| 行为 → 活跃项映射、事件前缀 → 功能映射 | 新增 designed/action_map |
| 道具用途描述 | 构建时由 goods 推导（§5.1） |

**tuning**：规格书 00 §0.13 的餐厅默认参数、各玩法的概率和常量（结算、老鼠、体力、合成、菜场库存和限购、翻倍规则等）集中成 `tuning` 一节，带默认值。区服覆盖配置 `shard_config.override.tuning` 可以按键覆盖（深合并，覆盖后重新校验）。模拟器用 `--tuning` 传入同样格式的覆盖。

## 4. 开店结算

### 4.1 轮次与批处理

- 轮次号 `round = floor(unix 毫秒 / 240000)`，全局统一。每个区服每轮在 `job_run(shard, 'settlement', round)` 登记，重复触发忽略；错过的轮次不补跑。
- 每轮开始读一次全局数据：`world_state`、节日倍数、区服设置和 tuning、祝福（目前为空）。痞老板驻留店为空时，按裁定 4 选一家并写回。
- 只处理 `state = 1` 的店，按 id 分批（每批 200）。批内每家店单独一个事务，多店并发（默认 16 路，环境变量可调）。
- 单店事务：
  1. `SELECT ... FOR UPDATE` 锁住餐厅行；读 `restaurant_tables`，若 `round_no ≥ round` 则跳过（幂等）
  2. 读 `restaurant_cookbooks`、`getEffectAgg`（缓存失效才重算）；`cookfoods_flag > 0` 时再读橱柜
  3. 调用 `settleRestaurant`（§4.2），然后依次调用 `applyExp`、`autoRefuel`
  4. 写回：restaurant（银币、经验、等级及升级收益、油、状态、声望）、restaurant_tables（新桌子、round_no）、插入 income_round、发放掉落（走 grantAward，写流水）、扣减挑剔消耗的食材、升级写 rest_log、痞老板出现发新闻
- 单店出错只记日志（含区服、轮次、餐厅），不影响其他店。
- 随机种子 `hashSeed(shardId, round, restId)`。
- **性能目标**：5000 家店一轮 ≤30 秒。**备选方案**：压测不达标时改成每个事务处理 20 家店（按 id 升序加锁）。

### 4.2 纯函数核心

```ts
settleRestaurant(input: SettleInput, globals: SettleGlobals, rng: Rng): SettleResult
applyExp(rest: LevelState, exp: number): { level; exp; gains: { levels; attrLeft; luck; tableNum } }
autoRefuel(rest, effectAgg): { oilAdded; coinSpent }
```

- **SettleInput**：等级、星级、油和油上限、银币、街道、声望、基础幸运、promo/cte/cookfoods 开关、餐桌列表、食谱 levels（Uint8Array）与 cookbook_counts、effect_agg、当前特色菜（null）、橱柜（仅在 cookfoods_flag>0 时提供）
- **SettleGlobals**：天气效果（0 星店传空）、蟹老板街道、本店是否痞老板驻留店、节日倍数、祝福效果（空）、tuning、配置查询（食谱售价、街道索引、所需食材、食材价格）
- **SettleResult**：新餐桌（每桌带 `last`）、银币 / 经验 / 油变化、汇总率及分项、掉落列表、声望变化、挑剔消耗食材清单、特色菜消耗份数、日志和新闻事件、是否因没油停业
- 不访问数据库、不读时间，所有随机数来自 `rng`。
- 规则逐条按规格书 01 实现，加上第 2 节的裁定。
- **汇总率分项**（写入 income_round.rates，供"加成分项"展示）：基本、食谱、浮动、上座溢出、挑剔溢出、星潜力、负声望、天气、集牌匾、集荣誉、集盆栽、集名画、其他加成（effect_agg）、银币转经验。

### 4.3 体力恢复与老鼠

- **体力**（每 10 分钟）：查询体力未满（`strength < strength_max + holyBless`）的店及其幸运和加成；用 `hashSeed(shard, 'strength', period, restId)` 算出每家的增量（1 点，以 luckRate 概率 2 点，× 沙漏倍率）；一条批量 UPDATE 写回 `strength = least(strength + 增量, 上限)`。相对增量，不需要锁店。
- **老鼠**（每 30 分钟）：对每家营业店，用 `hashSeed(shard, 'mouse', period, restId)` 判定是否触发；只对触发的店开事务加锁，依次处理幸运躲过 → 捕鼠夹抓到（加银币，写 rest_log `mouse.trap`）→ 偷走一种未锁定食材（写 rest_log `mouse.steal`）；触发后按 earnMapRate 概率得探险图(170)。

### 4.4 收益展示

- 本轮收益：income_round 最近一条 + 每桌 `last`
- 收益记录：income_round 最近 3 天，分页
- 加成分项：最近一轮的 rates 分项 + 当前 `effect_source` 来源清单（道具 / 设施 / 勋章名称和到期时间）；只在打开页面时查询

## 5. 玩法模块

每个模块沿用现有结构：`routes.ts`（路由和 zod 校验）、`service.ts`（加锁、调用规则、写库）、`rules.ts`（纯函数）。模块注册时声明功能名：`settlement`、`world`、`growth`、`cookbook`、`cupboard`、`market`、`shop`、`store`、`task`。

### 5.1 公共部件

- **withRestaurant**：沿用子项目 1，写操作都在单店锁内完成
- **grantAward(tx, rest, award, source)**：发放银币、经验、钻石、声望、道具、食材；经验入账统一走 `applyExp`（任何来源的经验都会触发升级）；每笔写流水；返回给前端的得失 events
- **spend(tx, rest, cost, source)**：扣银币、钻石、体力、道具、食材；不足时抛 `NOT_ENOUGH {kind, id?, need, have}`
- **addFoods / subFoods**：规格书 00 §0.10 的规则（加到上限，溢出进冰箱，冰箱溢出丢弃并记日志；新入橱柜继承锁定）
- **grantGoods**：扩展子项目 1 的实现，勋章和牌匾变动时标脏加成汇总；仓库容量只限制购买（裁定 6）
- **随机奖励** `rollRandomAward(level, equipFlag, luck, rng)`：规格书 00 §0.8；礼包里 `goods id=0` 用它
- **道具用途描述**（构建时推导）：

| kind | 对应道具 | 参数 |
|---|---|---|
| currency | 银币 / 金币 / 钻石 | coin / diamond |
| addTable | 餐桌A | – |
| strength | 小体力卡 / 体力卡 | value |
| mysteryFood | 神秘食材随机劵 | – |
| lockSlots | 保险卡 | value |
| resetAttr | 洗点卡 | – |
| bundle | 鞋带 | goods、num、targetGoods、targetNum |
| foodsMax | 小 / 普通食材叠加卡 | value |
| storeNum | 小 / 中 / 大扩建卡 | value |
| cupboardNum | 小 / 中 / 大扩容卡 | value |
| gift | 名称含"礼包"且 value 为新格式数组 | – |
| towerTicket | 厨塔挑战券 | 功能未实现时不可用 |

  可批量使用：id ∈ {28, 29, 85, 139} 或 kind=gift。

- **行为事件**：玩家操作成功后在事务内 `bus.emit({name: 'action', key, n, restId})`。task 模块订阅：`event_counter` +n；若 key 在"行为 → 活跃项"映射里，按活跃项的每日次数上限加活跃分。2A 用到的行为键：

| key | 活跃项 |
|---|---|
| signin | 签到 |
| oil.fill | 给自己添油 |
| attr.allocate | – |
| cookbook.learn | 学习或升级食谱 |
| market.buy | 菜场买菜 |
| market.guess | – |
| shop.buy | 商店购买道具 |
| device.place | 摆放设施 |
| foods.handle | 合成或分解食材 |

### 5.2 成长 growth

规格书 02 全部操作（除 2.8 里归属子项目 3/5 的项），要点：
- 加点只能加厨艺、刀工、火候；洗点卡返还全部已加点数（必须已经加过）
- 升星：检查 star_need，扣升星凭证，发 star_award 礼包，发新闻；楼层数随星级变化
- 油壶扩容：检查 oil_need（银币、等级、星级、凭证），提高油上限，发新闻
- 加油：1 银币 = 1 油，加满；恢复营业（裁定 9）
- 设施：从仓库取对应 devicetype 的设施（牌匾不消耗）；时长 × (1 + extendTimeRate)；同位只能一个，不能摆重复牌匾；撤下设施不退还；第二牌匾位 3 星 + 15,000,000 银币 + 188 钻石
- 餐桌A：放在第一个没满的楼层
- 改名：改名卡(53) + 银币（裁定 8）；名称规则沿用子项目 1 的校验，另加"≤9 个字、只能中英文数字"
- 搬家：搬家卡(2) + 当前桌数 × 餐桌价/2 银币（luckRate 概率半价）；替换街道勋章；发新闻
- 大促：开启时获得八折促销勋章(106)，关闭时收回
- 挑剔消耗食材：≥6 星，档位 1~5（tuning `cookfoodsMaxFlag`，默认 5），每档要求相关食材 ≥ 50×档位
- 银币转经验：需持有有效的阿波罗雕像(438)
- 赶走生气的蟹老板：需持有非洲复兴纪念碑(439)，50 体力，移除道具 134 及其加成
- 赶走痞老板（只有驻留店主能操作），两种方式：
  - 花 80 体力：获得声望 R = ⌊sqrt(等级)⌋×10，经验 R×300
  - 消耗蟹黄堡秘方书(165)：获得声望 R，经验 R×1000，星神眷顾(364)
  - 之后清空 `plankton_rest_id`，发新闻

### 5.3 食谱 cookbook

- 学习 / 升级：按规格书 03 §3.3（1~7 品级；目标 >7 返回 `COOKBOOK_MAX_GRADE`）；万能食材恰好缺一种时替代；更新 levels 和 cookbook_counts；发行为事件
- 列表：按街道分页（默认本街），只返回压缩字段（id、名称、品级、下一级所需食材及够不够、学习类型）；学习类型由服务端根据当前橱柜计算；支持按品级、学习类型筛选
- 详情：所有品级所需食材、售价、难度、描述
- 食材需求计算：按街道、目标品级、食材等级汇总"还差多少"

### 5.4 橱柜 cupboard

- 列表：橱柜 / 冰箱，带每种食材"本街食谱升到目标品级还需要多少"
- 锁定 / 解锁：占用 foods_lock_num 格；可解除"已没有该食材的锁"
- 解冻：规格书 05 §5.2
- 合成 / 分解：规格书 05 §5.4；每次最多 100；免体力次数 `20 + 25×星级`（daily_counter），超出每次 1 体力；天气 foodsOperRate 从 world_state 取
- 万能食材兑换：2 个 467 → 1 个 2 级稀有；2 个 468 → 1 个 3 级稀有

### 5.5 菜场 market

- 货架刷新（定时任务）：规格书 06 §6.1；刷新时删除该货架旧货、写新闻"已进货"
- 购买：规格书 06 §6.2（不含 stockMan 相关规则）
  - 价格 = 食材 coin × (1 + 天气.marketCoin)；特价固定 2999 × 天气系数；高级 ×2
  - 限购按 `market_buy` 的三个 subject 分别计数；设备码取请求头里的设备标识（子项目 1 已生成），服务端只存 sha256 前 16 位
  - 特价要求邮箱已验证；同 IP 两次间隔 10 分钟：Redis 键 `mkt-ip:<shard>:<ip>` 记下上次购买的游戏时间，按游戏时间比较（模拟器的虚拟时钟也适用），检查和写入用一个 Lua 脚本原子完成
  - 高级要求持有有效的爱心项链(167)
- 竞猜：下一轮日常菜场开货前，花 2 张神秘礼券，从 1~2 级食材池选若干种；每轮只能参加一次；开货时按竞猜奖励表发放（12、18 点两轮额外奖励）

### 5.6 商店 shop

- 银币商店：saleflag=1 的道具；1~999 个，不可叠加只能买 1 个；牌匾已达持有上限不能买；仓库满时拒绝
- 每日特价：12 点从特价池抽 1 个商品 + 按概率区间抽折扣档；库存售完即止
- 黑市：黑市池；勋章、牌匾没有时效且已拥有的不能再买
- 出售：coin × 数量 × 0.7；宝石不能卖；牌匾至少留 1 个
- 丢弃：只允许道具 87

### 5.7 仓库 store

- 列表：按类型筛选；勋章显示剩余时间
- 使用：按用途描述分派（§5.1）；礼包每项独立按 `rate + luckRate` 判定，超出 rate 部分标记为幸运
- 道具流水：读 ledger，时间范围 1/6/12 小时、今天、昨天、前天

### 5.8 任务 task

- 可见任务：主线 step == main_task_step 的一条；支线 step < main_task_step 且未完成的
- 条件：counter 读 `event_counter`；state 由状态注册表计算（`rest.level`、`rest.star`、`oil.level`、`cookbooks.learned`、`cookbooks.gradeN`）
- 功能可用 = 该功能已由某个模块注册且在区服开启；不可用时按裁定 7 处理（主线跳过：读任务时从 main_task_step 往后跳过不可用的步骤得到"有效步骤"，领奖时把 main_task_step 写成有效步骤 +1）
- 领奖：主线 step+1；支线写 task_done；奖励走 grantAward
- 活跃度：当日总分 = Σ 各活跃项 min(次数, 上限) × 分值；档位奖励每天每档一次，持有有效爱心项链(167)时 ×2；经验类奖励按"× 餐厅等级"
- 签到：每天一次，获得每日签到礼包(115)，发行为事件 `signin`

### 5.9 小镇 world

- 天气：每 2 小时（1、3、5……23 点整）换一次；21~5 点用 daytime ∈ {2,3}，其他时段用 {1,3}；排除特殊天气；按权重抽，允许与当前相同；发新闻；0 星店结算不受天气影响
- 蟹老板街道：每天 9 点换
- 节日倍数：公历节日 +2，农历节日 +3，否则 1（规格书 00 §0.12）

## 6. 定时任务

调度器改为"周期型任务"：

```ts
interface PeriodicJob {
  name: string;
  feature: string;
  period(now: Date): string | null;   // 当前周期键；null 表示此刻不该跑
  run(ctx: { shardId: number; period: string; now: Date }): Promise<object>; // 返回统计写入 job_run.stats
}
```

- 调度器每 5 秒检查一次：对每个开放区服、每个已开启功能的任务，周期键不为空且 `job_run` 中不存在时执行（先插入 job_run 行，主键冲突即视为已执行）
- 游戏时间统一按北京时间（沿用 `gameDay`）
- 仍然只在 worker 主节点执行

| 任务 | 周期键 | 功能 |
|---|---|---|
| settlement | 每 4 分钟的轮次号 | settlement |
| strength | 每 10 分钟 | settlement |
| mouse | 每 30 分钟 | settlement |
| weather | 奇数整点（1、3……23） | world |
| daily-event（蟹老板街道） | 每天 9 点 | world |
| market-daily（含竞猜开奖） | 8/10/12/14/16/18/20 点 | market |
| market-special | 7~23 点每小时 | market |
| market-premium | 6/12/18 点 | market |
| shop-special | 每天 12 点 | shop |
| partitions | 每小时（已有，扩展表） | – |

"整点类"任务的周期键是最近一个已到达的时点，所以新区服开服后的第一次检查就会生成天气、菜场和特价，不会是空的；同一时点只执行一次。

## 7. 接口与前端

### 7.1 接口

读 `GET /api/v1/<模块>/<动作>`，写 `POST`，JSON 参数，zod 校验；成功响应的 `events` 为结构化得失（`{type:'gain'|'lose', kind, id?, num, lucky?}`），前端统一提示。

| 模块 | 读 | 写 |
|---|---|---|
| restaurant | overview（扩展：设施位、开关、本轮收益、天气摘要、当前主线）、floor、income、buffs、log | – |
| growth | starNeed、oilNeed、devices | allocate、resetAttr、starUp、oilExpand、refuel、placeDevice、removeDevice、openPlaque2、rename、move、setPromo、setCookfoods、setCte、drivePlankton、driveKrab |
| cookbook | list、detail、foodsNeed | learn |
| cupboard | list、fridge | lock、unlock、thaw、handle、exchangeMaster |
| market | shelves、guess | buy、joinGuess |
| shop | items、special、black | buy、buySpecial、buyBlack、sell、discard |
| store | items、records | use |
| task | tasks、activation | claimTask、claimActivation、signIn |
| world | weather | – |

开发和端到端测试额外提供 `POST /api/v1/test/tick`（推进时钟并执行到期任务），只在 `ENABLE_TEST_API=true` 时注册；生产环境开启会拒绝启动。

### 7.2 页面

| 路由 | 参照原版 | 内容 |
|---|---|---|
| `/` | RestView | 状态栏、本轮收益、加油、设施位、开关、天气、主线任务提示 |
| `/rest/floor` | RestFloorView | 楼层餐桌与每桌上一轮收益 |
| `/rest/income` | RestIncomeView | 收益记录、加成分项 |
| `/rest/info` | RestInfoView | 属性、加点、洗点、个人日志 |
| `/rest/tasks` | RestGiftView | 签到、活跃度与奖励、主线和支线 |
| `/cookbooks`、`/cookbooks/:id` | CookbooksView、CookbooksInfoView | 筛选、学习、需求计算 |
| `/cupboard` | CupboardView | 橱柜 / 冰箱、锁定、合成分解、万能兑换 |
| `/market` | MarketView | 三种货架、竞猜 |
| `/shop` | ShopView | 银币商店、特价、黑市 |
| `/store` | StoreView | 仓库、使用、出售 |
| `/society`、`/society/star`、`/society/oil`、`/society/rename`、`/society/move` | Society* | 升星、油壶扩容、改名、搬家 |
| `/weather` | WeatherView | 当前天气与效果 |

- 手机底部标签栏：餐厅 / 食谱 / 橱柜 / 菜场 / 更多；宽屏居中 720px
- 首页每 4 分钟和页面回到前台时刷新
- 统一的得失提示组件；错误码中文对照表扩展

## 8. 数值模拟器

放在 `apps/server/src/sim/`，三个命令：

### 8.1 `pnpm sim`：成长与经济

参数：`--days 30 --bots 3 --seed 1 [--tuning 覆盖.json] [--compare 另一次输出目录] [--out 目录]`

- 环境：开发 PostgreSQL 里的一次性库 `dt_sim`（先删后建，跑迁移，建一个区服）；Redis 开发实例的 15 号库（开始前清空）
- 虚拟时钟：注入所有 service 的 `now()`；每次推进 4 分钟，用**正式的**周期任务注册表执行到期任务，再执行该时刻上线的机器人
- 机器人直接调用 service（不经过 HTTP）。三种画像只差上线频率：
  - 勤快：8~24 点每小时一次
  - 普通：每天 9、13、20 点
  - 休闲：每天 20 点
- 每次上线的固定策略：签到 → 领任务和活跃奖励 → 加油 → 加点 → 使用有用道具（礼包、各种卡）→ 摆放设施 → 以当前升星条件为目标选食谱：缺食材去菜场和商店买、缺凭证去商店买 → 学习 / 升级 → 合成多余食材 → 条件够就升星、扩油壶、加餐桌。策略写成文档，代表"认真但不刷极限"的玩家
- 机器人操作的随机数由模拟器按种子提供；同样参数两次运行结果一致
- 输出 `sim-out/<时间>/`：
  - `report.html`：单文件，自绘 SVG 图表，不依赖外部资源
    1. 成长节奏：各画像的等级、星级、已学食谱数随天数变化；到达每个星级的天数
    2. 经济平衡：银币、经验、钻石每天按来源 / 去向的流入流出（结算来自 income_round，其他来自 ledger）
    3. 卡点检测：等级已满足但超过 N 天（默认 5）升不了星的机器人，列出卡在哪个条件
  - 每张图对应的 CSV
  - 带 `--compare` 时同图叠加两次运行的曲线

### 8.2 `pnpm sim:explain`：单店收益分解

参数：`--rest <id>`（从 dt_sim 或开发库读取）或 `--state 快照.json`，`--rounds 5 --seed 1`。直接调用 `settleRestaurant`，逐轮打印每桌顾客类型、要求品级、银币、经验、油，以及全部汇总率分项。

### 8.3 `pnpm sim:bench`：结算压测

参数：`--restaurants 5000 --rounds 3`。在 dt_sim 批量造店（等级、星级、食谱数、设施、勋章按分布生成），用真实批处理跑结算，报告每轮耗时、每店耗时 p50/p95，对照 30 秒指标给出通过或不通过。

## 9. 测试与验收

### 9.1 测试

1. **规则单元测试**（固定随机序列）：结算每个分支（每种顾客、痞老板、蟑螂和蟑螂药、章鱼哥、蟹老板满足 / 摸二哈 / 欣赏名画 / 扫兴、挑剔满足 / 未满足 / 没学过、上座和挑剔溢出、银币转经验、停业、特色菜输入存在时的消耗、白食桌输入存在时的结算、挑剔消耗食材、美味券、蟹币、声望）；老鼠四种结局；体力；学习和万能替代；食材溢出进冰箱；合成分解；礼包判定和幸运标记；升级（连升）；升星和油壶条件；活跃分上限；任务可见性和跳过。规格书有例子的按例子断言
2. **集成测试**（真实 PostgreSQL + Redis）：结算幂等；结算与玩家同时操作同一店（数值不丢）；周期任务去重；菜场三维度限购和特价 IP 间隔；任务按功能跳过；奖励发放写流水；仓库满时购买被拒、奖励照发
3. **模拟器冒烟测试**（进 CI）：用测试库跑 1 个机器人 1 天、`sim:bench` 20 家店 1 轮，确认命令能跑通、报告文件生成
4. **组件测试**：食谱学习、菜场购买、得失提示
5. **端到端**（Playwright）：新号签到 → 加油 → 菜场买食材 → 学会第一道食谱 → 领主线奖励 → 调 test/tick 推进一轮 → 看到收益

### 9.2 验收标准

1. 第 1.1 节的玩法都能在网页上操作
2. 模拟器 30 天报告：勤快画像达到 2 星及以上，且卡点检测没有"永远凑不够"的条件；出现数值卡点时调整 tuning 或数据，并把报告给运营者过目
3. `sim:bench` 5000 家店一轮 ≤30 秒（开发机 Docker）
4. CI 全绿（类型检查、lint、格式、全部测试、镜像构建）
