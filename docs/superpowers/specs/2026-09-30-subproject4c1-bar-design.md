# 子项目 4C-1「酒吧」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-30-subproject4a-mysterious-design.md` §0（子项目 4 的拆分）。4C 拆成 4C-1 酒吧、4C-2 厨塔（用户确认）
- 游戏规则依据：`../analysis/spec/` 的 10 全章、00 §0.8（随机奖励）；原版源码 `BarTranServiceImpl`、`BarServiceImpl`、`Tools.getAwardType / getAwardJson / getAward`
- 分支：`feat/bar`，基于 `main`

## 1. 目标与范围

**完成标志**：玩家能在酒吧用神秘礼券玩划拳、猜酒杯、转数字，用蟹币玩老虎机，用礼券换蟹币；连胜跨请求累计，老虎机有保底；主线第 13 步「去酒吧玩一次划拳」、支线「玩一次老虎机」「集齐 4 株盆栽」开放。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 随机奖励 | 公用的 `randomAward`（食材 / 物品 / 银币 / 经验），4C-2 厨塔也用 |
| 划拳 | 出拳、胜平负、连胜奖励、平局银币、幸运标记、新闻 |
| 猜酒杯 | 按连胜收礼券、胜率随连胜下降、奖励等级随连胜上升、新闻 |
| 转数字 | 8 张礼券猜 1~25、只给物品、没中的提示、新闻 |
| 老虎机 | 蟹币、每次 3 格、按权重抽、300 格保底和提前保底（神灯翻倍）、合并发放、统计、新闻 |
| 兑换 | 100 张礼券换 1 个蟹币 |
| 任务 | 事件键；状态键 `honor.potCount` |
| 展示 | 酒吧页四个标签，"更多"页入口 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 厨塔、赛厨榜、好友切磋、声望商店、守塔 NPC 烹制 | 4C-2 |
| 小镇新闻的展示（酒吧只写入新闻） | 4E |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 状态怎么存 | 只存当前状态：每店一行记三个游戏的上一局结果和连续次数、老虎机连续没出稀有的格数；老虎机统计按奖项累计格数（用户确认）。收到的东西照常写道具流水 |
| 2 | 猜酒杯的"幸运"标记 | 原版错用划拳的基础胜率。这里用猜酒杯自己的基础胜率 1/(n+1)：随机数 ≥ 基础胜率且猜中算幸运 |
| 3 | 礼券 > 9999 清零 | 不做：礼券持有上限就是 9999 |
| 4 | 老虎机奖项的库存、过期日 | 不做：奖池 22 项全部不限库存、没有过期日 |
| 5 | 老虎机稀有物品"已拥有折算成神秘食材随机券" | 原版已注释掉，照现版：稀有也直接发物品 |
| 6 | 页面路径 | `/bar`；任务 13、108 的链接从 `/town/bar` 改为 `/bar` |
| 7 | 老虎机是否需要验证邮箱 | 照原版：需要 |
| 8 | 转数字"连续中奖"次数 | 照原版计数，只用于提示文字，不影响奖励 |
| 9 | 随机奖励类型里的"终极大奖" | 原版概率为 0、没有实现，不做 |
| 10 | 划拳的幸运（问题记录 419，2026-10-06） | 原版胜、平各加一份幸运率，约 200 幸运以后不会输。改成只加在胜上，胜最多到 1 − 平 − `fgLoseMin`（默认 0.1），平固定 `fgDrawRate` |
| 10 | 状态键 `honor.potCount` | 有效盆栽勋章（devicetype 36）的种数，和"集盆栽"加成同一套计数 |

## 3. 规则明细

`luckSum` = `opLuck(op).sum`（基础幸运 + 勋章 / 厨具的 luckValue），`luckRate` = `opLuck(op).rate`。随机数一律走注入的 rng。

### 3.1 随机奖励（规格书 00 §0.8）

`randomAward(op, { level, equipFlag = 0, onlyGoods = false, noTicket = false })`：

- **类型**：`onlyGoods` 时是物品；否则 `r = rand`，依次累加 −(luckRate/1000 + level/100000)、食材 0.25、物品 0.15、银币 0.30、经验 0.30，第一个使 r < 累计值的类型；都没中时是食材
- **数量**：
  - 经验 = (50 + luckSum) × level × (equipFlag + 1)
  - 银币 = 经验 × 2
  - 物品、食材：1 个；`rand < luckRate` 时 2 个（幸运）
- **物品池**：非厨具且 level − 4 ≤ awardflag ≤ level，或厨具且 awardflag ≤ equipFlag；`noTicket` 时去掉神秘礼券(1)；池空时改发银币
- **食材池**：权重 100 且等级 ≤ min(level, 5) 的食材，均匀抽
- 发放走现有的 `gainCoin` / `gainExp` / `grantGoodsOp` / `addFoods`；返回 `{ kind: 'coin' | 'exp' | 'goods' | 'foods', id?, num, lucky }`
- 概率在 `tuning.bar.awardRates`

### 3.2 划拳 `POST /bar/fg {hand}`（hand：0 石头、1 剪刀、2 布）

- 扣 1 张礼券
- `r = rand`；胜率 = min(0.25 + luckRate, 1 − 平率 − fgLoseMin)，平率 = 0.25；`r < 胜率` 胜，`r < 胜率 + 平率` 平，否则负（问题记录 419 起，见裁定 10；原版平率也加 luckRate）
- 服务器出拳：胜 `(hand + 1) % 3`，平 `hand`，负 `(hand + 2) % 3`
- 连续次数：本局结果和上一局相同 → +1，否则 1
- 胜：`r ≥ 0.25` 算幸运；奖励等级 = 2 + ⌊连胜 / 3⌋，`randomAward(level, noTicket)`；连胜 ≥ `fgNewsStreak`(5) 发新闻 `bar.fg`
- 平：银币 = 餐厅等级 × 10 + luckSum
- 事件：`bar.play`、`bar.fg`

### 3.3 猜酒杯 `POST /bar/cup {cup}`（cup：1~3）

- n = 上一局赢了 ? 上一局连胜 + 1 : 1；扣 n 张礼券
- 胜率 = 1/(n+1) + luckRate/(n+1)；`r < 胜率` 猜中
- 猜中：连胜 = n；`r ≥ 1/(n+1)` 算幸运；奖励等级 = 2 + (n − 1)；连胜 ≥ `cupNewsStreak`(4) 发新闻 `bar.cup`
- 猜错：连败次数累计（只用于提示），下一局从 1 张开始
- 事件：`bar.play`、`bar.cup`

### 3.4 转数字 `POST /bar/num {num}`（num：1~25）

- 扣 `numCost`(8) 张礼券
- 胜率 = 1/25 + luckRate/20；`r < 胜率` 中奖
- 中奖：`r ≥ 1/25` 算幸运；`randomAward(level = numAwardLevel(10), onlyGoods, noTicket)`；必发新闻 `bar.num`
- 没中：在 1~25 里随机一个不等于 num 的数字；差 < 3 提示"差一丝丝"、< 5 "轻一点"、其他"力气太大"
- 事件：`bar.play`、`bar.num`

### 3.5 老虎机 `POST /bar/slot {times}`（times：1~99）

- 已验证邮箱；扣 times 个蟹币(240)
- 每次 3 格，每格：
  1. `fail` = 连续没出稀有的格数
  2. 提前保底率 = fail × `slotFloorRate`(0.0000016) × (持有有效神灯(389) ? 2 : 1)
  3. `⌊fail / 3⌋ ≥ slotFloorSpins`(100) 或 `rand < 提前保底率` → 保底奖项 `slotFloorAwardId`(100，蟹黄堡)，算稀有
  4. 否则按奖池权重抽一项
  5. 抽到稀有 → fail = 0；否则 fail + 1
- 同一请求里相同奖项合并数量后发放：食材进橱柜，物品进仓库
- 稀有奖项或奖池标了新闻的奖项：每种发一条新闻 `bar.slot`
- 统计：每格给对应奖项的计数 +1（含空格 id 0）
- 返回：每次 3 格的奖项 id、合并后的奖励、剩余蟹币、距离保底还剩几次（`slotFloorSpins − ⌊fail / 3⌋`）
- 事件：`bar.play`（n = times）、`bar.slot`（n = times）

### 3.6 礼券换蟹币 `POST /bar/exchange {num}`（num：1~99）

扣 `krabCoinTickets`(100) × num 张礼券，得 num 个蟹币。不计活跃。

## 4. 数据

### 4.1 迁移 0011

```
bar_state
  rest_id int PK FK restaurant ON DELETE CASCADE
  fg_result smallint NULL（1 胜 / 0 平 / -1 负）, fg_times int NOT NULL DEFAULT 0
  cup_result smallint NULL, cup_times int NOT NULL DEFAULT 0
  num_result smallint NULL, num_times int NOT NULL DEFAULT 0
  slot_fail int NOT NULL DEFAULT 0 CHECK (slot_fail >= 0)

bar_slot_stat
  rest_id int FK restaurant ON DELETE CASCADE, award_id int, num int NOT NULL CHECK (num >= 0)
  PK (rest_id, award_id)
```

第一次玩时插入 `bar_state` 行（`ON CONFLICT DO NOTHING` 后 `FOR UPDATE`；整个操作已经锁了店）。

### 4.2 配置

- `SlotAward { id, kind: 'empty' | 'foods' | 'goods', itemId: number | null, odds, rare: boolean, getNum, news: boolean }`、`ConfigBundle.slotAwards`（来自 `dataset/bar_slot_machine_award`，22 项），`GameConfig.slotPool`（按 odds）
- 校验：物品 / 食材 id 存在；`tuning.bar.slotFloorAwardId` 在奖池里
- `tuning.bar`：

```json
{
  "fgWinRate": 0.25, "fgDrawRate": 0.25, "fgNewsStreak": 5,
  "cupNewsStreak": 4,
  "numMax": 25, "numCost": 8, "numLuckDiv": 20, "numAwardLevel": 10,
  "krabCoinTickets": 100,
  "slotCells": 3, "slotFloorSpins": 100, "slotFloorRate": 0.0000016, "slotFloorAwardId": 100,
  "awardRates": { "foods": 0.25, "goods": 0.15, "coin": 0.3, "exp": 0.3 }
}
```

- 道具 id 用现有的 `GOODS.mysteryTicket`(1)、`krabCoin`(240)、`magicLamp`(389)，不新增
- 功能 `bar` 加入 `IMPLEMENTED_FEATURES`；`action_map` 已有 `bar.` → `bar`、`bar.play` → 活跃"酒吧娱乐"
- 任务 13、108 的链接改为 `/bar`

## 5. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/bar` | 礼券、蟹币；划拳 / 猜酒杯 / 转数字的上一局结果和连续次数；猜酒杯下一局要几张礼券；老虎机距离保底还剩几次、奖池（奖项和概率）、我的统计；换蟹币的比例 |
| POST | `/bar/fg` | `{hand}` → `{ result: 'win' \| 'draw' \| 'lose', barHand, times, lucky, coin, award }` |
| POST | `/bar/cup` | `{cup}` → `{ win, cost, times, lucky, award }` |
| POST | `/bar/num` | `{num}` → `{ win, barNum, hint: 'close' \| 'soft' \| 'hard' \| null, lucky, award }` |
| POST | `/bar/slot` | `{times}` → `{ spins: number[][], rewards, krabCoins, floorLeft }` |
| POST | `/bar/exchange` | `{num}` → `{ krabCoins }` |

`award` 为 `randomAward` 的结果或 null。写操作走 `runOp`（锁店），功能名 `bar`。DTO 放 `packages/shared/src/schemas/bar.ts`。

## 6. 前端

酒吧页 `/bar`，标签（记住上次选的）：

- **划拳**：石头 / 剪刀 / 布三个按钮；显示对方出的拳、胜平负、连胜、得到了什么
- **猜酒杯**：三个杯子；写明"这一局要 n 张礼券"和当前连胜
- **转数字**：1~25 选一个数字，"转"按钮（8 张礼券）；没中时显示转到的数字和提示
- **老虎机**：抽 1 次 / 抽 10 次；每次 3 格的结果（奖项名）、合并后的奖励、距离保底还剩几次；奖池概率表；我的统计；下方是礼券换蟹币（数量输入，上限 = 礼券 ÷ 100 与 99 取小）

礼券或蟹币不够时按钮灰掉并写明原因。"更多"页加"酒吧"入口。

## 7. 错误处理

不新增错误码。所有检查在扣除前完成，失败整体回滚。

| 情况 | 错误码 |
|---|---|
| 礼券不够 | `NOT_ENOUGH goods 1`（`consumeGoods`） |
| 蟹币不够 | `NOT_ENOUGH goods 240` |
| 老虎机没验证邮箱 | `EMAIL_NOT_VERIFIED` |
| 出拳、杯子、数字、次数越界 | `VALIDATION_FAILED` |
| 功能关闭 | `FEATURE_DISABLED` |

## 8. 测试

- **纯规则**（固定随机数）：
  - 划拳：胜 / 平 / 负的边界和服务器出拳；连续次数；幸运；奖励等级
  - 猜酒杯：花费、胜率随连胜变化；幸运
  - 转数字：没中时的数字不等于猜的；三档提示
  - 老虎机：按权重抽；300 格保底；提前保底概率随 fail 上涨、神灯翻倍；稀有后 fail 清零
  - 随机奖励：四种类型的边界、银币和经验数量、物品池等级窗口和厨具档、不出礼券、幸运翻倍、池空时发银币
- **服务**（真实数据库）：
  - 划拳：扣礼券、胜发奖励、平给银币、连胜跨请求累计
  - 猜酒杯：按连胜收礼券；猜错后回到 1 张
  - 转数字：只给物品；新闻
  - 老虎机：多次合并发放；保底（fail 接近 300 时必出蟹黄堡）；统计计数；没验证邮箱、蟹币不够报错且不扣
  - 礼券换蟹币；礼券不够不扣
  - `bar.play` 计活跃"酒吧娱乐"；主线第 13 步、老虎机支线完成；`honor.potCount` 算得出来
  - 功能关闭报 `FEATURE_DISABLED`
- **迁移** 0011：每店一行、统计主键、`slot_fail` 不能为负、删店级联
- **前端**：四个标签；按钮灰掉的原因；老虎机结果和统计
- **端到端**：划拳一次 → 礼券换蟹币 → 老虎机抽一次

## 9. 文档

- `docs/rules/收益与加成.md`：随机奖励、酒吧四个游戏和保底
- `docs/deploy.md`：迁移 0011、功能开关 `bar`、`tuning.bar`
