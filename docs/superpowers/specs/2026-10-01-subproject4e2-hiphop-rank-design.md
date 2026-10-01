# 子项目 4E-2「嘻哈男孩、镇长问答、排行与排行奖励」设计

- 上位文档：`2026-09-30-subproject4e1-town-design.md`（4E 拆成 4E-1 小镇日常、4E-2 本文、4E-3 论坛）
- 原版规格：`analysis/spec/12_协会与小镇.md` §12.2、§12.3、§12.9；`06` §6.4、§6.8；`16` 定时任务表
- 原版源码：`SocietyTranServiceImpl.rewardToTown`、`NPCTools.townmayorDailyGift`、`TaskTownConfig.getTodayHipHopBoyShowPlace / awardRewardTop5`、`SocietyTranServiceImpl.refreshMarket`、`RestTranServiceImpl.buyMarketFoods`、`RankService`

**完成标志**：
- 每天 9 点嘻哈男孩出现在某个地点（6 个公共地点之一，或某家玩家餐厅），玩家要逛到那里才能看到他并打赏。
- 镇长每天问一次"嘻哈男孩在哪"，答对加成、答错减益。
- 每周日打赏前 5 名拿工作证，周一发工资；菜场工作证能手动进货。
- 小镇页新增"排行"，原版 39 个榜加上打赏本周和上周两个榜，有奖励的榜写明奖励。
- 支线"打赏一次卖艺男孩"开放。

## 1. 范围

| 内容 | 本次 |
|---|---|
| 嘻哈男孩：每日地点、想要的食材、门槛；在所在地点页出现；打赏食材 / 银币 / 钻石；蟹币奖励；餐厅地点的"嘻哈文化"和神秘礼券 | 做 |
| 镇长问答 | 做 |
| 打赏周榜：前 5 名工作证；工作证周工资 | 做 |
| 菜场工作证手动进货（含别人购买时进货人分成） | 做 |
| 排行榜（39 + 2 个） | 做 |
| 排行奖励 | 只新增打赏周榜；其余 6 项（特色菜冠军、被翻厨、神之一手、灭蟑螂、赛厨榜、克拉肯月榜）已在 4A / 3 / 4B-1 / 4C-2 做完，本次只在对应的榜上写明奖励 |
| 银币持有量排行（新版原版） | 不做 |
| 改名处工作证的 `DTSealRate` | 不做（道具 109 的效果数据里没有这一项） |
| 荣誉墙、道具一览 | 不做（不在 4E 范围） |
| 论坛 | 4E-3 |

### 1.1 用户已确认的决定

| # | 问题 | 决定 |
|---|---|---|
| 1 | 怎么找到嘻哈男孩 | 只出现在当天所在地点的页面；小镇页不透露位置 |
| 2 | 餐厅地点 | 做，低概率（约 1/10），从近 7 天活跃的玩家店里挑 |
| 3 | 菜场手动进货 | 一起做 |
| 4 | 排行范围 | 原版全部 + 打赏周榜 |
| 5 | 排行计算方式 | 打开时现查，按榜缓存 60 秒；厨力榜缓存 10 分钟 |

## 2. 规则

### 2.1 嘻哈男孩出场

- 新功能键 `hiphop`，加入已实现功能。事件键 `hiphop.` 已经映射到它（4E-1 裁定 22），支线"打赏一次卖艺男孩"随之开放。
- **每日任务** `hiphop-daily`：
  - 每天 `tuning.hiphop.hour`（9）点运行，周期键 = 游戏日。
  - 按 `placeWeights` 抽地点：1 菜场、2 商店、3 酒吧、4 协会、5 厨塔、6 神殿各 10，9 餐厅 7。餐厅约占 1/10。
  - **餐厅地点**：
    - 从近 `restActiveDays`（7）天有结算收益的玩家店（不含 NPC、不含封禁账号）里均匀随机挑一家。
    - 没有符合条件的店就改抽公共地点。
    - 选中的店得到道具 230"嘻哈文化"（15 小时，上座率 +50%、幸运 +28），写新闻 `hiphop.event`："××开启了嘻哈活动！"（原版就这么写）。
  - 想要的食材：1~5 级普通食材里均匀随机一种。
  - 门槛：⌊`worthBase` ×（`worthMin` + `worthRand` × 随机数）⌋，即 35000 ×（1.25 + 0.8 × 随机数）。
  - 写入 `hiphop_day`。
- **出没时间**：当天 9 点到 `closeHour`（22）点。9 点前当天没有记录，22 点后不再出现。
- **怎么看到**：
  - `GET /hiphop?place=N`（N 为 1~6），或 `GET /hiphop?restId=X`（餐厅地点）。
  - 他在这里且在出没时间内：返回想要的食材、门槛、所在地点，以及我本周累计的打赏价值。
  - 否则返回 `{here: false}`。
  - 位置可以靠逐个页面试出来，这就是"去找他"本身，不算泄漏。

### 2.2 打赏

`POST /hiphop/tip {place, restId?, kind: 'food' | 'coin' | 'diamond', num, foodsId?}`

- **前置检查**：
  - `place`（以及餐厅地点时的 `restId`）必须和今天的地点一致，否则报 `INVALID_STATE` reason `not_here`。
  - 22 点后报 `not_here`。
  - `num` ≥ 1。
  - `tuning.hiphop.requireVerifiedEmail` 为真时要求已验证邮箱，报 `REQUIREMENT_NOT_MET` reason `email`。开发期 tuning 设为 false，上线前改 true。
- **食材打赏**：
  - 扣橱柜里的食材，不够报 `NOT_ENOUGH`。任何食材都收。
  - 只有他想要的那种才有价值：⌊食材单价 × 等级/(等级+1) × 数量⌋。
  - 其他食材价值 0，提示"这些食材看起来不怎么新鲜"。
- **银币打赏**：
  - `num` ≤ `coinMax`（1 亿）。
  - 价值 = ⌊num/5⌋。
  - 另给经验 ⌊num/210 × (0.9~1.1)⌋，记进收益明细。
- **钻石打赏**：
  - `num` ≤ `diamondMax`（9999）。
  - 价值 = ⌊num × 10001/3⌋。
  - 另给经验 ⌊num × 50 × (0.9~1.1)⌋。
- **蟹币**：
  - 一次打赏的价值 ≥ 门槛时判定。
  - 概率 =（`krabRate` 0.1 + 天气 `krabCoinRate`）×（食材打赏 × 1.5）+ 幸运率/10。
  - 中了得 ⌊价值/门槛⌋ 个蟹币，写新闻 `hiphop.krab`："××通过打赏获得 蟹币×N"。
  - 天气加成那部分起作用时，提示加"(虹)"，照原版。
- **餐厅地点的额外奖励**：今天在某家餐厅，且是那家店的店主自己用食材打赏、并且中了蟹币时，额外得神秘礼券 ⌊数量 /（6 − 想要食材的等级）⌋。
- **记录**：
  - 每次打赏都写一行 `hiphop_tip`，价值为 0 的也写。
  - 触发事件 `hiphop.reward`，算支线。
  - 写 rest_log。
- **返回** `HiphopTipDto`：`{ worth, exp, krabCoin, tickets, rainbow, line }`。`line` 是嘻哈男孩的回话，三种之一：
  - 没到门槛："感谢您的支持和鼓励"；
  - 到了门槛没中："这些正是我需要的"；
  - 中了：捡到蟹币。

### 2.3 镇长问答

`POST /town/mayor {place}`（place ∈ 1~6, 9）

- 每天一次，每日计数 `town.talk.mayor`。重复回答报 `ALREADY_DONE`。
- 今天还没有 `hiphop_day`（9 点前，或功能关闭）：报 `INVALID_STATE` reason `hiphop_not_out`，**不占**当天次数。
- 答对：得道具 231"镇长的推荐"（3 小时，上座率 +30%、每桌银币 +1、经验 +2）。回话"谢谢你，我现在就去找他，好好弥补他！"
- 答错：得道具 232"镇长的针对"（5 小时，上座率 -60%、每桌银币 -5、经验 -1）。回话"你觉得乱说一个位置我就会信吗！"
- 餐厅地点答"某家餐厅"（9）就算对，不用说出是哪家（原版按地点 id 比较）。
- 返回原有 `TalkResultDto`，`npc: 'mayor'`。小镇概览 `npcs` 里加上镇长今天是否已回答。

### 2.4 打赏周榜和工作证

- **周榜任务** `hiphop-weekly`：
  - 每周日 `weeklyHour`（23）点运行，周期键 = 本周周一。
  - 本周（周一 0 点到周日 23 点）打赏价值合计 > 0 的玩家店排名。并列时最后一次打赏早的排前，再按店 id。
  - 前 5 名依次得到 `weeklyCards` = [108 商店, 109 改名处, 107 菜场, 111 搬家处, 110 保安证]，各 1 个，160 小时。
  - 写新闻 `hiphop.weekly`："恭喜××在每周打赏中获得第 N 名！"
- **工资任务** `hiphop-wage`：
  - 每周一 7:59 运行，周期同 `friend-weekly`。
  - 给每家持有有效工作证的玩家店发对应工资礼包：107→233、108→234、109→235、111→236、110→237。持有几张就发几个。
  - 礼包是现有礼包道具，玩家在仓库里打开。
- 周日 23 点发的证到下周一 7:59 仍然有效（160 小时到下下周日 7 点），所以每张证正好领一次工资。

### 2.5 菜场手动进货

`POST /market/manual-stock`

- 需要持有有效的菜场工作证（107），否则报 `REQUIREMENT_NOT_MET` reason `job_honor`。
- 费用 = `manualCost`（100 万）×（1 + max(今天次数 − 1, 0)）。今天次数是本次之前的次数，即第 1、2 次都是 100 万，第 3 次 200 万。
- 声望：今天第 5 次起 +500；否则 ⌊（第 1 次 × 0.5，之后 × 1）× 费用 / 10000⌋，照原版 `count > 4 / count < 2` 的判断。
- 进货：
  - 4 种日常食材，等级权重和日常货架相同，每种 `manualStock`（1000）份，同一批不重复。
  - 挂到日常货架（shelf 0），`market_item.owner_rest_id` = 我。
  - 先把我上一批还在架上的手动货下架。
- 写新闻 `market.manual`："××已进货日常菜：……"。
- **下架**：日常货架整点刷新时，手动货和系统货一起下架，沿用现在的"按 shelf 删除"。
- **购买手动货**：
  - 别人买：每人每批最多 `manualPersonMax`（99）份，替代原有的单人限购。付正常单价，进货人得 ⌊货款 × `manualShare`（0.25）⌋ 银币，记进收益明细。
  - 进货人自己买：免费，不受 99 份限制，仍受橱柜上限和单种食材持有上限限制。
- 菜场 DTO 每件货多一个 `owner: {restId, name} | null`，页面显示"××进的货"。
- 菜场页（持证时）显示"手动进货"按钮和本次费用。

### 2.6 排行榜

`GET /rank/:key` → `RankDto { key, rows: [{rank, restId, name, value}], me: {rank, value} | null, updatedAt }`

- 每个榜前 `rank.top`（50）名，只排本区玩家店（不含 NPC、不含封禁账号），值 ≤ 0 的不上榜。
- 并列时值相同的名次相同（1, 2, 2, 4），同值内按店 id 排。
- `me`：我不在前 50 时也给出我的名次和值；值 ≤ 0 时为 null。
- **缓存**：
  - 每个 API 进程内按（区服, 榜）缓存，`rank.cacheSeconds`（60）秒；厨力榜 `rank.powerCacheSeconds`（600）秒。
  - 缓存的是整个区的排序结果，"我的名次"从里面找。
- 榜的定义固定在共享代码 `RANK_BOARDS`，前后端共用。

| 大类 | 小类（key） | 数据来源 |
|---|---|---|
| 收益 | 银币今日 `income.coin.today`、单轮 `income.coin.round`、昨日 `income.coin.yesterday`；经验同（`income.exp.*`） | `income_round`：今日 / 昨日按游戏日的时间范围求和；单轮取本区最近一轮 `round_no` |
| 食谱 | 佳肴 `cookbook.7`、珍品 `cookbook.6`、金牌 `cookbook.5`、极品 `cookbook.4`、已学 `cookbook.1` | `restaurant_cookbooks.levels`：品级 ≥ N 的食谱数（在服务里解码） |
| 等级 | 当前 `level` | `restaurant.level`，同级比经验 |
| 厨力 | 当前 `power` | 现有厨力计算（五项属性 + ⌊幸运/2⌋，含厨具） |
| 声望 | 当前 `renown` | `restaurant.renown` |
| 赞 | 被赞 `thumb.received`、点赞 `thumb.given` | `thumb` 表累计 |
| 灭蟑螂 | 今日 / 昨日 / 本周 / 上周 `roach.kill.*` | 每日计数 `roach.kill` |
| 产蟑螂 | 同上 `roach.lay.*` | 每日计数 `roach.lay` |
| 被翻厨 | 同上 `flip.flipped.*` | 每日计数 `flip.flipped` |
| 酒吧 | 猜拳连胜 / 连败 `bar.fg.win/lose`；猜酒杯 `bar.cup.win/lose`；转数字连中 / 连不中 `bar.num.win/lose` | `bar_state` 当前连续次数和结果 |
| 特色菜 | 今日价值 `mc.today`、昨日价值 `mc.yesterday`、历史价值 `mc.best`、总次数 `mc.times`、已学 `mc.learned` | `mc_cook`：单批价值 = 份数 × 单价，取最大；次数为批数；`rest_mc` 计数 |
| 打赏 | 本周 `hiphop.week`、上周 `hiphop.lastWeek` | `hiphop_tip` 价值合计 |

- "本周"是周一到今天，"上周"是上周一到上周日，按游戏日算，和 `friend-weekly` 一致。
- **奖励说明**写在 `RANK_BOARDS` 里：

| 榜 | 奖励说明 |
|---|---|
| `mc.yesterday` | 第一名：特色菜冠军道具（每天 `championHour` 发） |
| `flip.flipped.lastWeek` | 前 4 名：屋漏偏逢连夜雨 / 鞭炮 / 灯笼 / 福（周一 7:59 发） |
| `roach.kill.lastWeek` | 前 2 名：午夜蟑螂杀手 |
| `hiphop.week` | 前 5 名：商店 / 改名处 / 菜场 / 搬家处工作证、保安证（周日 23 点发） |

  另写一行：赛厨榜和克拉肯月榜在厨塔、神殿页查看。
- 原版另有"上周翻厨被夹最多→神之一手"，但排行里没有这个榜，本次也不加。

## 3. 数据

迁移 `0016_hiphop`：

**`hiphop_day`**（每区每天一行）

| 列 | 类型 | 说明 |
|---|---|---|
| `shard_id` | integer | PK 之一 |
| `day` | text | 游戏日，PK 之一 |
| `place` | smallint | 1~6, 9 |
| `rest_id` | integer null | 餐厅地点时那家店 |
| `foods_id` | integer | 想要的食材 |
| `worth` | integer | 门槛 |
| `created_at` | timestamptz | |

**`hiphop_tip`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | serial | PK |
| `shard_id` | integer | |
| `rest_id` | integer | |
| `kind` | text | `food` / `coin` / `diamond` |
| `num` | bigint | |
| `foods_id` | integer null | |
| `worth` | bigint | 本次价值 |
| `krab_coin` | integer | 本次得到的蟹币 |
| `created_at` | timestamptz | |

索引 `(shard_id, created_at)`、`(rest_id, created_at)`。

**`market_item`** 加列 `owner_rest_id integer null`。`market_buy` 已按 `subject` 记个人购买量，手动货的 99 份限购沿用它（只按账号计）。

**tuning**：

- `hiphop`：
  - 时间：`hour` 9、`closeHour` 22、`weeklyHour` 23；
  - 地点：`placeWeights`、`restActiveDays` 7；
  - 门槛：`worthBase` 35000、`worthMin` 1.25、`worthRand` 0.8；
  - 蟹币：`krabRate` 0.1、`foodFactor` 1.5；
  - 银币：`coinMax` 1e8、`coinWorthDiv` 5、`coinExpDiv` 210；
  - 钻石：`diamondMax` 9999、`diamondWorthMul` 10001/3、`diamondExpMul` 50；
  - 其他：`expJitter` 0.1、`requireVerifiedEmail` false、`weeklyCards`、`wages`（证 → 礼包）。
- `market`：`manualCost` 1e6、`manualKinds` 4、`manualStock` 1000、`manualPersonMax` 99、`manualShare` 0.25。
- `rank`：`top` 50、`cacheSeconds` 60、`powerCacheSeconds` 600。

构建校验：工作证、工资礼包、230~232 在道具表里存在。`placeWeights` 的 id 只能是 1~6 和 9。

**新闻类型**：`hiphop.event`、`hiphop.krab`、`hiphop.weekly`、`market.manual`。

## 4. 接口

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/hiphop` | `?place=N` 或 `?restId=X` | `HiphopSpotDto`：`{here: false}` 或 `{here: true, place, restId, food: {id, level}, worth, myWeekWorth, closeAt}` |
| POST | `/hiphop/tip` | `{place, restId?, kind, num, foodsId?}` | `HiphopTipDto` |
| POST | `/town/mayor` | `{place}` | `TalkResultDto` |
| POST | `/market/manual-stock` | – | `{ foods: number[], cost, renown }` |
| GET | `/market` | – | 原有，每件货加 `owner`；另加 `manual: {hasCard, cost} ` |
| GET | `/rank/:key` | – | `RankDto` |

错误码沿用现有：`INVALID_STATE`（`not_here`、`hiphop_not_out`）、`REQUIREMENT_NOT_MET`（`email`、`job_honor`）、`NOT_ENOUGH`、`ALREADY_DONE`、`LIMIT_REACHED`（手动货 99 份）、`VALIDATION`（数量超上限、未知榜）。

## 5. 前端

- **嘻哈男孩卡片** `components/hiphop/HiphopCard.vue`：
  - props 为 `place` 或 `restId`，放在菜场、商店、酒吧、协会、厨塔、神殿页的顶部，以及店主首页和好友店页。
  - 他不在这里时什么都不渲染。
  - 他在时显示：
    - 一句台词、想要的食材（等级标签 + 名字 + 我有多少）、门槛和我本周累计；
    - 三个打赏方式的胶囊标签。食材标签下拉选橱柜里的食材，默认选中他想要的那种；银币、钻石标签各有一个输入框。
  - 打赏后在卡片里显示回话和得到的东西。
- **镇长**：小镇页 NPC 区，镇长那一行加"告诉他嘻哈男孩在哪"，展开 7 个按钮，答过显示"今天已经告诉过镇长了"。
- **排行**：
  - 小镇页新标签"排行"（`?tab=rank`）。
  - 大类用胶囊标签，小类用按钮组。
  - 列表行：名次、店名（链接到好友店页，自己就是首页）、值（大数用万 / 亿缩写）。
  - 我的那一行高亮；不在前 50 时在列表底部单独显示。
  - 顶上写奖励说明和"每分钟更新"。
- **菜场**：
  - 持证时货架上方显示"手动进货（本次 ×× 银币）"按钮。
  - 手动货在名字下面写"××进的货"；别人看到"限购 99"，自己看到"自己的货，免费"。
- 按 `docs/design/视觉规范.md` 使用 `.dt-*` 类。

## 6. 测试

服务端：

- 每日任务：
  - 固定随机数时落到公共地点和餐厅地点；
  - 餐厅只从近 7 天活跃的玩家店里挑，没有可挑的店时改抽公共地点；
  - 选中的店得到 230 并写新闻；
  - 同一天只跑一次。
- `GET /hiphop`：
  - 地点对、错各返回什么；
  - 9 点前和 22 点后不在；
  - 餐厅地点必须带对 `restId`；
  - 响应里地点不对时不泄露任何字段。
- 打赏：
  - 三种方式的价值和经验；
  - 非想要食材价值 0；
  - 数量上限和余额不足；
  - 22 点后被拒；
  - `place` 不对被拒；
  - 邮箱开关打开时未验证被拒；
  - 用固定随机数覆盖中和不中蟹币、"(虹)"；
  - 店主在自家店用食材打赏多给礼券，别人不给；
  - 写 `hiphop_tip`，支线完成。
- 镇长：答对、答错各得道具；一天一次；9 点前不占次数。
- 周榜：前 5 名依次拿到 5 种证；并列顺序；价值 0 不上榜；NPC 不上榜；同一周只跑一次。
- 工资：持证的店领到对应礼包；过期的不领；持两张证领两个。
- 手动进货：
  - 没证被拒；
  - 费用随次数递增；
  - 声望按次数；
  - 替换上一批；
  - 别人买限 99 且进货人分到 25%；
  - 自己买免费；
  - 日常刷新时下架。
- 排行：
  - 每类至少一个榜对照手算结果；
  - 并列名次；
  - 不含 NPC 和封禁账号；
  - 我的名次在 50 名之外；
  - 缓存期内数据变化不影响结果，过期后更新；
  - 未知 key 报 `VALIDATION`。

前端：`HiphopCard`（不在时为空、三种打赏、显示回话）、镇长问答、排行标签和我的一行、菜场手动进货按钮和"××进的货"。

端到端 `e2e/hiphop-rank.spec.ts`：
- 用测试接口 `POST /api/v1/test/hiphop {place}` 把今天的地点设到菜场（加在现有 `http/testApi.ts`，只在测试 API 开启时注册），在菜场页看到嘻哈男孩，用银币打赏；
- 到小镇告诉镇长"菜场"，得到镇长的推荐；
- 打开排行看到自己在打赏本周榜上。

## 7. 文档

- `docs/rules/收益与加成.md` 新增"嘻哈男孩、镇长问答、工作证、手动进货、排行"一节。
- `docs/deploy.md` 记迁移 0016，并提醒上线前把 `hiphop.requireVerifiedEmail` 改为 true。
