# 子项目 4E-1「小镇日常」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-30-subproject4a-mysterious-design.md` §0（子项目 4 的拆分）。4E 再拆成三块：4E-1 小镇日常（本文）、4E-2 嘻哈男孩 + 排行 + 排行奖励、4E-3 论坛（用户确认）
- 游戏规则依据：`../analysis/spec/12_协会与小镇.md` 12.1、12.2、12.4、12.5、12.6、12.8；原版源码 `SocietyTranServiceImpl.talkWithNPC / goodsExchange / mysteryFoodsExchange / levelFoodsExchange / changeTownWeather / broadcast / startBless / getBlessAward / shakeKrabCoin`、`NPCTools`、`Tools.changeTownWeather`
- 分支：`feat/town`，基于 `main`

## 1. 目标与范围

**完成标志**：玩家在新的"小镇"页能看新闻、用喇叭广播、每天和三个 NPC 对话领礼物、摇蟹老板的钱包、用雷神锤换天气、在镇长处兑换道具、用食材兑换券和神秘食材兑换券换食材、许愿和共飨；当天的星愿给全镇每家店的结算加成；首页能看到最新新闻和广播；支线"摇一次蟹老板的钱袋""在小镇广播一次"和活跃"摇蟹老板的钱袋"开放。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 新闻 | 新闻页（分页）、首页最新 3 条 + 最新 1 条广播；所有新闻类型的中文文案 |
| 广播 | 喇叭广播，纯文字 |
| NPC 对话 | 大胃哥（含首次礼物）、雯姐、13 哥，每人每天一次 |
| 摇钱包 | 从蟹老板店的银币里摇，尾数 88 彩蛋 |
| 雷神锤 | 按类型换天气（银币）或召唤特殊天气（钻石） |
| 兑换 | 镇长兑换（73 项）、一到五级食材兑换券、神秘食材兑换券 |
| 星愿 | 许愿、共飨、当天全镇加成（进结算） |
| 任务 | 功能 `town` 开放；事件键 `krab.shake`、`broadcast` |
| 展示 | `/town` 页三个标签（新闻 / 小镇 / 兑换）；"更多 → 玩法"入口；首页"小镇新闻"块；首页"生效的加成"加"今日星愿" |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 镇长对话（问嘻哈男孩位置）、嘻哈男孩打赏、排行榜、排行奖励 | 4E-2 |
| 论坛 | 4E-3 |
| 广播里的占位符（特色菜、食材、道具富文本） | 不做（用户确认：先只做纯文字） |
| 雷神锤"恢复管理员预设天气" | 不做（没有管理员预设天气） |
| 镇长兑换的上线时间 / 有效期 | 不做（设计数据里没有这两项） |
| 蟹老板新闻单独分页、常驻新闻、荣誉墙、道具一览、天使投资人、礼物 | 不做 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 星愿加成的范围 | 许愿后到当天结束，全镇每家店结算都加上这个星愿的 buff（用户确认） |
| 2 | 广播内容 | 纯文字，不解析占位符（用户确认） |
| 3 | 页面 | 新开 `/town` 页，三个标签：新闻（顶部广播输入框）、小镇、兑换（用户确认） |
| 4 | 神秘食材兑换券 | 大胃哥首次对话送的就是它（道具 20），所以兑换标签一并做"神秘食材兑换" |
| 5 | 原版字典 201（稀有兑换开关） | 视为关闭，做成 tuning 开关 `town.rareExchange`，默认 false：N 级券只能换普通食材（odds = 100）；神秘券不能换 573、574 |
| 6 | 大胃哥首次礼物 | 原版首次对话和每日对话是两个动作。合并为一个：第一次对话时，每日奖励照给，另加 1 张神秘食材兑换券；是否领过首次礼物永久记在 `town_rest` |
| 7 | 许愿抽取 | 按星愿数据的 `odds` 加权抽取（目前 12 个都是 10，等于均匀） |
| 8 | 持有神灯多领一份 | 原版对所有类型都是数量 +1，银币类只多 1 个银币，是个 bug。改为：随机食材多抽 1 种；自选食材、道具、钻石数量 +1；银币多 10%（tuning `town.bless.lampCoinBonus`） |
| 9 | 共飨前提 | 当天本区服已有人许愿；当天活跃度 ≥ 星愿的 `needAct`；每人每天一次 |
| 10 | 自选 / 随机食材的范围 | `value.level` 给出的等级区间内全部普通等级食材（1~6 级，不含 7 级神秘和 9 级万能）；随机类抽 num 种不重复的，各 1 个 |
| 11 | "神秘来客"的 buff | 数据是 `spRate +0.03`，也就是挑剔率 +3%。结算里星愿原来只接了上座率、银币、经验，这次补上挑剔率，照数据生效 |
| 12 | 摇钱包的限制 | 照原版：同一家店、同一 IP、同一设备当天各一次，按"区服 + 游戏日"算。设备用前端已有的 `x-device-id` 请求头，IP 用请求的来源地址；两者为空时不查。同一台电脑换号也会被拒（原版如此） |
| 13 | 蟹老板的钱 | 从本区服蟹老板店（`npcIdOf`）扣：有多少给多少，最少 1；蟹老板银币 ≤ 0 时报"钱袋空空如也"。蟹老板店不存在时同样报这个错 |
| 14 | 尾数 88 彩蛋 | 摇钱记录的流水号 % 100 = 88 时触发：流水号 / 100 取整后 % 8 = 1 给蟹黄堡（180）×1，否则蟹币（240）×8；写新闻。流水号全服共用一个序列 |
| 15 | 雷神锤天气池 | 照原版：先按当前时段筛（夜间用 daytime ∈ {2,3}，白天 {1,3}）；银币方式再按 type 筛（包括该类型里的特殊天气）；钻石方式只在 specialflag = 1 的天气里抽。权重沿用自动轮换的算法（probability × dayWeightScale，夜间专属天气用 nightWeatherOdds）。排除当前天气；筛完为空时报错，不扣钱 |
| 16 | 雷神锤换出的天气持续多久 | 持续到下一次自动轮换（不改 `weather_until`） |
| 17 | 90 秒间隔 | `world_state` 新增"上次换天气时间"，自动轮换和雷神锤都更新它；雷神锤要求距离它 ≥ 90 秒 |
| 18 | 雷神锤冷却 | 每家店 6 小时，记在 `town_rest.hammer_at` |
| 19 | 广播冷却 | 30 秒，记在 `town_rest.broadcast_at`。原版"蟹老板不限"对应管理员账号，这次没有管理员广播，不做 |
| 20 | 新闻分页 | 每页 50 条，按 id 倒序，用 `before=<id>` 翻页 |
| 21 | 首页新闻 | 最新 3 条非广播新闻 + 最新 1 条广播，跟随首页数据一起返回 |
| 22 | 功能开关 | `town` 加入已实现功能。`hiphop.` 和 `post.` 两类事件键改映射到新功能 `hiphop`、`forum`（未实现），使支线"打赏一次卖艺男孩""发表一篇帖子"继续隐藏到 4E-2、4E-3 |
| 23 | 兑换数量 | 镇长兑换一次可以兑多份（`num` ≥ 1），限次的项目按累计次数算，超出上限报错；食材券一次可以选多种，每种数量 ≥ 1 |
| 24 | 橱柜上限 | 所有加食材的地方沿用现有加食材函数的上限处理，不另写 |

## 3. 规则明细

### 3.1 新闻 `GET /town/news?before=<id>`

- 只返回本区服的新闻，按 id 倒序，每页 50 条，附带 `hasMore`。
- 每条返回 `id, type, restId, restName, params, createdAt`。前端用 `utils/news.ts` 按 type 生成中文文案；未知类型显示"小镇发生了一件事"。
- 执行时先盘点代码里现有的全部新闻类型（`opNews` / `postNews` 的调用处），每种都要有文案，并用测试钉住"没有漏掉的类型"。
- 本子项目新增的类型：

| type | params | 文案示例 |
|---|---|---|
| `town.broadcast` | `{text}` | 【广播】小王的店：大家好 |
| `town.bless` | `{blessId}` | 小王的店许愿得到星愿：五谷丰登 |
| `town.shake.lucky` | `{goodsId, num}` | 恭喜小王的店伸进蟹老板裤兜里掏出：蟹黄堡 ×1 |
| `town.exchange` | `{exchangeId, goodsId, num}` | 小王的店在镇长处兑换了：××× ×1 |
| `weather.change` | `{from, to, by?}` | 有 `by`（雷神锤）时：小王的店使用雷神锤，晴转暴雨了 |

### 3.2 广播 `POST /town/broadcast {text}`

- 条件：星级 ≥ 1；邮箱已验证；持有喇叭（315）≥ 1；距离上次广播 ≥ 30 秒。
- 内容去掉首尾空白后 1~64 个字符，否则报错。
- 扣 1 个喇叭，写 `town.broadcast` 新闻，更新 `broadcast_at`，发事件 `broadcast`。
- 前端用普通文本插值显示，不用 `v-html`。

### 3.3 NPC 对话 `POST /town/talk {npc}`

`npc` ∈ `bigEater`（大胃哥）、`wenjie`（雯姐）、`bro13`（13 哥）。每个 NPC 每家店每天一次（每日计数 `town.talk.<npc>`），已对话报"今天已经聊过了"。

| NPC | 台词（照原版） | 奖励 |
|---|---|---|
| 大胃哥 | 你真有品味! 我也是这样觉得的! 哈哈哈! | 按权重 [50, 25, 13, 9, 3] 抽 1~5 级；在这一级的食材里按 odds 抽一种，给 1~3 个；再按种子权重（`config.seedPool`）送 1 颗种子。第一次对话另送神秘食材兑换券（20）×1，台词改为"你! 很有个性是吧!" |
| 雯姐 | 用了飘柔就明显气质上来了! | 神秘礼券（1）×1~20 |
| 13 哥 | 爱就直接去做!!! | 喇叭（315）×1~2 |

返回 `{npc, talk, rewards}`，rewards 是获得的食材、种子、道具清单。

### 3.4 摇蟹老板钱包 `POST /town/shake`

- 按裁定 12 检查店 / IP / 设备当天是否已摇；已摇：自己摇过报"蟹老板握紧了他的钱袋"，IP 或设备摇过报"次数已达上限"。
- 应得银币 x = max(1, (8000 − rand[0, 4999]) × 星级)，所以 0 星也能摇到 1 个。
- 从蟹老板店扣：在同一个事务里用一条原子更新 `coin = coin - least(coin, x) where coin > 0` 并返回实际扣数，玩家得到这个数；不和玩家店一起加锁（避免锁顺序问题）。没有更新到行（蟹老板银币 ≤ 0 或没有蟹老板店）→ 报"钱袋空空如也"，整个操作回滚。
- 插入 `town_shake` 记录（唯一索引兜底并发）；按裁定 14 判断彩蛋。
- 发事件 `krab.shake`（支线 102 和活跃"摇蟹老板的钱袋"）。

### 3.5 雷神锤 `POST /town/hammer {mode, type?}`

- 条件：持有有效的雷神锤（256）；距上次使用 ≥ 6 小时；距全镇上次换天气 ≥ 90 秒。
- `mode = 'coin'`：`type` ∈ 1 晴类 / 2 雨类 / 3 雪冰类 / 4 风沙雾类；花 100,000 银币，送爆裂飞弹（19）×1。
- `mode = 'diamond'`：花 8 钻石，送幸运饼干（491）×1。
- 按裁定 15 抽新天气；在玩家事务里锁住本区服 `world_state` 行（`for update`），再检查 90 秒间隔并写新天气和换天气时间，保证两人同时使用只有一个成功。
- 写 `weather.change` 新闻（`by = restId`）。新天气下一轮结算生效。
- 返回新旧天气和冷却结束时间。

### 3.6 兑换

**镇长兑换** `GET /town/exchange`、`POST /town/exchange {id, num}`
- 数据 `designed/goods_exchange.json`：73 项，分类 `bg` 蟹黄堡（35）、`dt` 美味券（18）、`chip` 碎片（19）、`so` 其他（1）。
- 每项消耗 `needGoods × num`，得到道具 `goodsId × (item.num × num)`。
- `times > 0` 的项累计兑换次数 + num 不能超过 `times`，次数记在 `town_exchange_use`。
- `newsflag = 1` 的项兑换后写 `town.exchange` 新闻。
- `GET` 返回全部项和我已兑换的次数。

**N 级食材兑换券** `POST /town/level-ticket {level, picks: [{foodsId, num}]}`
- `level` 1~5，对应道具 241~245。
- 每种食材必须是这一级的，并且（`rareExchange` 关闭时）odds = 100；数量合计扣券。

**神秘食材兑换券** `POST /town/mystery-ticket {foodsId}`
- 1 张券（20）换 1 个 7 级食材；`rareExchange` 关闭时不能换 573、574。
- 可选列表在 `GET /town/exchange` 里一起返回。

### 3.7 星愿

**许愿** `POST /town/wish`
- 条件：持有神灯（389，按数量判断，不消耗）。
- 插入 `town_bless (shard_id, day)`，主键冲突说明今天已有人许过，报"今日已经许过愿了"。
- 按裁定 7 抽星愿，写 `town.bless` 新闻。

**共飨** `POST /town/feast {foodsId?}`
- 按裁定 9 检查；活跃度用任务模块同一套计算（`activationTotal`），不够时报"活跃度不足 N（当前 M）"。
- 奖励按星愿 type：

| type | 奖励 |
|---|---|
| 5 随机食材 | 在 `value.level` 区间里抽 num 种不重复的，各 1 个 |
| 0 自选食材 | `foodsId` 必须在 `value.level` 区间里，给 num 个 |
| 2 道具 | `value.goodsId × num` |
| 3 银币 | num |
| 4 钻石 | num |

- 持有神灯时按裁定 8 多领。每日计数 `town.feast` 防重复。

**全镇加成**
- 结算每轮开始时读取本区服当天（按该轮时间算游戏日）的 `town_bless`，把星愿 `buff` 填进结算参数 `bless`。
- `rates.ts` 的挑剔率加上 `bless` 项（裁定 11）。
- 首页"生效的加成"加一条来源为 `bless`、名称"今日星愿：××"的加成，前端分组"今日星愿"排在最前。

### 3.8 小镇概览 `GET /town`

返回：
- 三个 NPC 今天是否已对话；
- 今天是否已摇钱包；
- 雷神锤：是否持有、冷却结束时间、全镇下次可换时间；
- 当前天气（id、名称、到期时间）；
- 今日星愿：星愿、许愿的店、我是否持有神灯、我今天的活跃度、是否已共飨；
- 喇叭数量、广播冷却结束时间；
- 服务器当前时间。

## 4. 数据

### 4.1 迁移 0014_town

| 表 / 列 | 内容 |
|---|---|
| `world_state.weather_changed_at` | 可空时间；自动轮换和雷神锤都更新 |
| `town_bless` | `shard_id, day(text), bless_id, rest_id, created_at`；主键 `(shard_id, day)` |
| `town_rest` | `rest_id` 主键，`hammer_at`、`broadcast_at` 可空，`big_eater_gift boolean default false` |
| `town_shake` | `id serial`，`shard_id, day, rest_id, ip, device, coin, created_at`；唯一索引 `(shard_id, day, rest_id)`；部分唯一索引 `(shard_id, day, ip) where ip <> ''`、`(shard_id, day, device) where device <> ''` |
| `town_exchange_use` | `rest_id, exchange_id, times`；主键 `(rest_id, exchange_id)` |

每日计数用现有的 daily counter：`town.talk.bigEater`、`town.talk.wenjie`、`town.talk.bro13`、`town.feast`。

### 4.2 配置

- `ids.ts` 新增：喇叭 315、雷神锤 256、爆裂飞弹 19、神秘礼券 1、蟹黄堡 180、蟹币 240、一到五级食材兑换券 241~245（已有的直接复用）。
- tuning 新增 `town` 段：

```
broadcast: { minStar: 1, cooldownSec: 30, maxLen: 64 }
npc: { bigEaterLevelWeights: [50,25,13,9,3], bigEaterNum: [1,3], wenjieNum: [1,20], bro13Num: [1,2] }
shake: { base: 8000, rand: 5000, eggMod: 100, eggTail: 88, burgerEvery: 8 }
hammer: { cooldownHours: 6, gapSec: 90, coin: 100000, diamond: 8 }
bless: { lampCoinBonus: 0.1 }
news: { pageSize: 50 }
rareExchange: false
mysteryExclude: [573, 574]
```

- `action_map.json`：`hiphop.` → `hiphop`，`post.` → `forum`（裁定 22）。
- 任务 102、109 的 href 改为 `/town`；活跃"摇蟹老板的钱袋"的去处改为 `/town`。
- `build.ts` 校验：兑换项引用的道具都存在（已有）；星愿的 `goodsId` 存在（已有）；`value.level` 在 1~6。

## 5. 接口

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/town` | – | `TownDto`（§3.8） |
| GET | `/town/news` | `before?` | `{items: NewsDto[], hasMore}` |
| GET | `/town/exchange` | – | `{items, used, mysteryFoods}` |
| POST | `/town/broadcast` | `{text}` | `{}` |
| POST | `/town/talk` | `{npc}` | `{npc, talk, rewards}` |
| POST | `/town/shake` | – | `{coin, egg?: {goodsId, num}}` |
| POST | `/town/hammer` | `{mode, type?}` | `{from, to, gift, cooldownUntil}` |
| POST | `/town/exchange` | `{id, num}` | `{goodsId, num}` |
| POST | `/town/level-ticket` | `{level, picks}` | `{foods}` |
| POST | `/town/mystery-ticket` | `{foodsId}` | `{foodsId}` |
| POST | `/town/wish` | – | `{blessId}` |
| POST | `/town/feast` | `{foodsId?}` | `{rewards}` |

- 所有写操作走 `runOp`，功能 `town`，需要营业中。
- 首页数据加上 `news: NewsDto[]`（最新 3 条）和 `broadcast: NewsDto | null`。
- `EffectDto` 的来源类型加 `bless`。

## 6. 前端

- 新页面 `views/TownView.vue`，路由 `/town`，三个标签，标签存在 `dt_town_tab`，切标签时重新读取：
  - **新闻** `components/town/NewsPanel.vue`：顶部广播输入框（显示喇叭数和冷却），下面新闻列表，底部"加载更多"。
  - **小镇** `components/town/TownPanel.vue`：NPC 卡片三张（已对话变灰），蟹老板钱包，星愿卡片（许愿 / 共飨，自选类弹出食材选择），雷神锤（四个类型按钮 + 钻石按钮，显示冷却）。
  - **兑换** `components/town/ExchangePanel.vue`：镇长兑换按 4 类分组，每项显示需要什么、还能兑几次；`components/town/TicketPanel.vue`：N 级券选等级后勾选食材和数量，神秘券选一种食材。
- `utils/news.ts`：新闻文案，首页和新闻页共用。
- 首页：新增"小镇新闻"块，显示最新广播和 3 条新闻，点击进 `/town`；"生效的加成"加"今日星愿"分组，排在最前。
- "更多 → 玩法"加"小镇"入口；天气页加"用雷神锤换天气"链接到 `/town`。
- 操作结果用 toast 显示（台词 + 获得的东西）。

## 7. 错误处理

| 情况 | 错误 |
|---|---|
| 星级不足 / 邮箱未验证 | `requirement('star', 1)` / 现有的邮箱未验证错误 |
| 喇叭、雷神锤、神灯、兑换券、兑换材料、银币、钻石不够 | `notEnough(kind, need, have, id?)` |
| 广播内容为空或超过 64 字 | `invalidState('broadcast_text')` |
| 广播冷却、雷神锤冷却、90 秒间隔 | `invalidState('cooldown')`，带剩余秒数 |
| NPC 今天已对话、今天已摇、今天已许愿、今天已共飨 | `ALREADY_DONE`，`what` = `talk` / `shake` / `wish` / `feast` |
| 同 IP / 同设备已摇 | `limitReached('shake_device')` |
| 蟹老板没钱 | `invalidState('krab_broke')` |
| 今天还没人许愿 | `invalidState('no_bless')` |
| 活跃度不够 | `requirement('activation', need)`，带当前值 |
| 兑换次数用完 | `limitReached('exchange')` |
| 食材不在可选范围、等级不符、不是普通食材 | `invalidState('foods_not_allowed')` |
| 雷神锤没有可换的天气 | `invalidState('no_weather')` |

前端 i18n 为每个新的 kind / requirement / limit / state / already 值补中文。

## 8. 测试

**服务端**（`apps/server/src/modules/town/*.test.ts`，测试辅助放 `apps/server/test/town.ts`）
- 广播：成功扣喇叭写新闻；0 星、未验证、没喇叭、空内容、65 字、30 秒内再发。
- NPC：三个 NPC 的奖励范围；大胃哥首次多送兑换券，第二天不再送；同一天第二次报错。
- 摇钱包：银币公式和扣蟹老板；蟹老板钱不够时给剩余，没钱时报错且不写记录；同店、同 IP 换店、同设备换店被拒；两个请求同时摇只成功一个；流水号尾数 88 的彩蛋（测试里把序列设到 x87）。
- 雷神锤：银币方式只出该类型、和当前不同；钻石方式只出特殊天气；冷却 6 小时；两店 90 秒内先后使用，后者被拒；天气池为空时不扣钱。
- 兑换：镇长兑换扣材料、给道具、写新闻；限次项目超出被拒；N 级券等级不符或非普通食材被拒、多种合计扣券；神秘券不能换 573。
- 星愿：两人同时许愿只有一人成功；没神灯不能许愿；没人许愿时共飨报错；活跃度不够报错；五种奖励类型；有神灯多领；同一天共飨两次报错。
- 结算：星愿加成出现在当轮结算的各项汇总率里（上座率、银币、经验、挑剔率）；第二天的结算不再有。
- 任务：`krab.shake`、`broadcast` 计数；支线"打赏一次卖艺男孩""发表一篇帖子"仍隐藏。
- 新闻：分页；所有代码里出现的新闻类型在前端 `utils/news.ts` 里都有文案（前端测试）。

**前端**：各面板的组件测试；首页新闻块和"今日星愿"分组。

**端到端**：`e2e/town.spec.ts`：新号广播（发号时给喇叭）、和雯姐对话、镇长兑换一项。

## 9. 文档

- `docs/rules/收益与加成.md` 新增第 12 节"小镇（子项目 4E-1）"：新闻、广播、NPC、摇钱包、雷神锤、兑换、星愿（含全镇加成）。
- `docs/deploy.md` 补上迁移 0014。
