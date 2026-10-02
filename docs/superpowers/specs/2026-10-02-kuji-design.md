# 一番赏 设计

日期：2026-10-02
状态：待用户审阅

## 1. 范围

问题记录 70（一番赏）和 240 里"一番赏奖券高价回收银币"的想法。做完这一项后新功能暂停，转去修排期里的问题（问题记录 258）。一个 PR，分支 `feat/kuji`。

## 2. 用户已确认的裁定

1. **抽赏券的来源**：银币高价购买、活跃度奖励、限时活动奖励（券是一种道具，活动奖励里可以直接配）。
2. **奖池节奏**：每个区服每天一池，抽完立刻开下一池；当天 24 点还没抽完的池作废，没抽到的大赏也一起作废。
3. **奖品**：A 赏和最后赏给限定手办、限定个性图标和钻石，并全服播报；B、C 赏给手办加资源；D~F 赏给资源。一池奖品的平均价值约为券价总额的 60%，差额就是银币回收。
4. **数值**：每张券 2 万银币，每人每天限购 10 张；活跃度领到最高一档时送 1 张。都放在区服数值里，以后可调。
5. **规则和数据**：按 §4~§7。改奖品和数值用现有的区服数值页，不单独做后台页。

## 3. 区服数值

`tuning.kuji`（`tuning.json`、zod、`setting_docs.json` 都要加）。区服功能开关 `kuji`（features 加说明、加进 `IMPLEMENTED_FEATURES`）。关掉后不能买券、不能抽，入口也隐藏，活跃度不再送券；已有的券保留。

```jsonc
{
  "price": 20000,        // 每张券多少银币
  "dailyBuy": 10,        // 每人每天最多买几张
  "maxDraw": 10,         // 一次最多抽几张
  "activeTickets": 1,    // 领取活跃度最高一档时额外送几张
  "tiers": [             // 各档：张数、奖品、限定图标、播报方式
    { "key": "A", "count": 1,  "award": { "diamond": 300, "goods": [{ "id": 90101, "num": 1 }] }, "icon": "kuji_a", "news": "broadcast" },
    { "key": "B", "count": 2,  "award": { "diamond": 100, "goods": [{ "id": 90102, "num": 1 }] }, "news": "news" },
    { "key": "C", "count": 4,  "award": { "diamond": 30,  "goods": [{ "id": 90103, "num": 1 }] } },
    { "key": "D", "count": 8,  "award": { "coin": 30000 } },
    { "key": "E", "count": 15, "award": { "coin": 15000 } },
    { "key": "F", "count": 50, "award": { "coin": 5000 } }
  ],
  "last": { "award": { "diamond": 200, "goods": [{ "id": 90104, "num": 1 }] }, "icon": "kuji_last", "news": "broadcast" }
}
```

- 奖品格式和活动奖励一样，用 `awardSchema`（道具写成 `{ "id": …, "num": … }`）：`coin`、`exp`、`diamond`、`renown`、`goods`、`foods`。
- 一池的张数是各档 `count` 之和，默认 80。
- **默认奖品的价值**：银币档合计 87.5 万，另有钻石 760 和 4 个手办。全池券价合计 160 万，银币部分约占 55%；钻石和手办以后按经济数据调整。
- **校验**（配置构建和后台保存区服数值都做，终审）：
  - 每档 `count ≥ 1`，`key` 不重复，也不能叫 `last`（最后赏专用）；一池总张数不超过 1000；
  - `icon` 必须是 `looks.icons` 里有的；
  - `news` 只能是 `broadcast` 或 `news`，不填就不播报；
  - 奖品里的道具和食材 id 必须存在（`build` 时检查，和活动奖励一样）。

## 4. 道具、手办、图标

- **抽赏券**：新道具 `90201`"一番赏抽赏券"。
  - 定义在新文件 `packages/config/data/game/kuji.json`，`build` 时并入道具表，类型消耗品，不出售，可堆叠；
  - 说明："抽一番赏用的签券，在一番赏页面使用。"
  - `GOODS.kujiTicket = 90201`。
- **手办**：加进 `souvenirs.json`，节日字段写"一番赏"，所以说明末尾会显示"（一番赏纪念品）"，出现在仓库的"纪念品"标签页。

  | id | 名称 | 说明 |
  |---|---|---|
  | 90101 | 一番赏 A 赏手办 | 一位厨师举着金汤锅的大号手办，底座刻着"A 赏"。 |
  | 90102 | 一番赏 B 赏手办 | 端着热腾腾招牌菜的服务员手办。 |
  | 90103 | 一番赏 C 赏手办 | Q 版小厨师挂件，挂在柜台边上很可爱。 |
  | 90104 | 一番赏最后赏手办 | 只发给抽走最后一张签的人：金色限定版的厨师手办。 |

- **个性图标**：`looks.json` 的 `icons` 加两个：
  - `kuji_a`："一番赏 A 赏得主"，说明"在一番赏里抽中了 A 赏"；
  - `kuji_last`："一番赏最后赏得主"，说明"抽走了一番赏奖池的最后一张签"。
  - 发图标时，已经有的不重复发。

## 5. 奖池和抽签

### 5.1 数据（迁移 0032）

```
kuji_pool
  id            bigserial pk
  shard_id      int not null references shard on delete cascade
  day           text not null              -- 游戏日
  seq           int not null               -- 当天第几池，从 1 开始
  status        text not null check (status in ('open','sold_out','expired'))
  total         int not null
  last_rest_id  int references restaurant on delete set null   -- 最后赏得主
  created_at    timestamptz not null
  closed_at     timestamptz
  unique (shard_id, day, seq)
  index (shard_id, status)

kuji_ticket
  pool_id       bigint references kuji_pool on delete cascade
  idx           int                        -- 0 ~ total−1
  tier          text not null              -- 'A'、'B'……
  drawn_by      int references restaurant on delete set null
  drawn_at      timestamptz
  primary key (pool_id, idx)
  index (pool_id) where drawn_by is null
```

### 5.2 开池和过期

不用定时任务，用到时处理，函数 `currentPool(tx, shardId, now)`。今天已有进行中的池时直接返回、不加锁（终审：看板不应该排队）；否则拿本区服的事务级咨询锁，再按下面的步骤做（锁内重新检查，防止并发开出两个进行中的池）：

1. 把本区服 `status = 'open'` 且 `day < 今天` 的池改成 `expired`，写 `closed_at`。
2. 找今天 `open` 的池，有就返回。
3. 没有就开新的一池，并把当时的奖品配置（`tiers`、`last`）快照存进池（迁移 0033），这一池的看板、发奖、最后赏都按快照（终审）：`seq = 今天已有的最大 seq + 1`，按当前区服数值的 `tiers` 生成 `total` 张签。插入时遇到唯一冲突（别人同时开了），就重新读一次。

看奖池（GET）和抽签都会调用它，所以 0 点后第一个打开页面的人就会开出当天的池。

### 5.3 买券 `POST /kuji/buy { num }`

- 锁店（`runOp`，功能 `kuji`）。`1 ≤ num`，今天已买 + `num` ≤ `dailyBuy`，否则 `limitReached('kuji_buy', { max, left })`。
- 扣 `price × num` 银币（不够时和其他地方一样报错），发 `num` 张券；`daily_counter` 键 `kuji.buy` 加 `num`。
- 写个人日志 `kuji.buy`（张数、花费）。

### 5.4 抽签 `POST /kuji/draw { num }`

1. 锁店（`runOp`，功能 `kuji`），再拿当前池（`currentPool`）并锁池的这一行（`for update`）。加锁顺序是 店 → 池。
2. `1 ≤ num ≤ maxDraw`，并且不超过池里剩下的张数，否则 `invalidState('kuji_left', { left })`。券不够时报 `invalidState('kuji_ticket')`，什么都不扣。
3. 扣 `num` 张券。从剩下的签里用服务器随机源 `o.rng` 抽 `num` 张，不放回，标上 `drawn_by`、`drawn_at`。
4. 每张签按它那一档发奖：道具、银币、钻石照常发；有 `icon` 的发图标；`news` 为 `broadcast` 或 `news` 的写新闻（§6）。
5. 抽完这一池的最后一张时：
   - 发最后赏（奖品、图标、新闻），写 `last_rest_id`；
   - 把这池改成 `sold_out`、写 `closed_at`；
   - 马上开下一池（`seq + 1`）。
6. 写个人日志 `kuji.draw`：池号、抽了几张、各档几张、有没有最后赏。
7. 返回：每张签的档位和奖品、是否得了最后赏、抽之后这一池（或新开的下一池）的状态。

### 5.5 活跃度送券

活跃度领取接口在领到最高一档（`activationRewards` 里 `points` 最大的那一档）时，`kuji` 功能开着、并且 `activeTickets > 0` 的话，额外发 `activeTickets` 张券，日志写在同一条活跃领取日志里（参数加 `kujiTickets`）。

## 6. 播报和新闻

- **新闻类型**：加进 `NEWS_TYPES`，前端 `utils/news.ts` 要有文案。
  - `kuji.big`：参数为档位（A 或 最后赏）、店名、池号。
    - 文案："【一番赏】XX 抽中了 A 赏！"；最后赏写"【一番赏】XX 抽走了最后一张签，拿下最后赏！"
    - 首页广播栏原来只显示玩家喇叭，现在 `kuji.big` 也算全服广播，和喇叭一起显示（`headlines` 里广播那一条改成取这两种里最新的一条）。
  - `kuji.win`：普通新闻，文案"XX 在一番赏抽中了 B 赏"。
- 各档用哪一种由 `news` 字段决定：`broadcast` 写 `kuji.big`，`news` 写 `kuji.win`。

## 7. 查询和页面

### 7.1 `GET /kuji`

- **奖池**：日期、第几池、总张数、剩余张数；
- **各档**：档位、总数、剩余、奖品；
- **最后赏**：奖品；
- **我的**：券数、今天还能买几张、券价、单次最多抽几张；
- **最近的大赏**：最近 10 条 `news` 为 `broadcast` 或 `news` 的抽中记录，含时间、店名、档位。

### 7.2 玩家页面

"更多 → 玩法"里加入口"一番赏"（`/kuji`，图标 `bi-gift`，`feature: 'kuji'`，248 的开关隐藏会生效）。

- **说明**：一句话讲玩法："一池共 N 张签，抽一张少一张；抽走最后一张的人另得最后赏。每天 0 点开新池，没抽完的当天作废。"
- **奖池看板**：每档一行，写档位、奖品（道具名、银币、钻石；手办和图标单独标出）、剩余 / 总数，抽完的档灰掉。最后赏单独一行。
- **操作**：我的券数；买券（输入张数，显示总价和今天剩余可买）；抽 1、抽 5、抽 10 三个按钮（超过券数或池里剩余的按钮禁用）。
- **结果**：列出这次抽到的每张签和奖品，得了最后赏的单独提示。
- **最近大赏**：列表。
- **个人日志文案**：`kuji.buy`、`kuji.draw`。

### 7.3 后台

不单独做页面。各档奖品、张数、券价在"区服数值"页按 `tuning.kuji` 修改。改了以后，下一池才生效，当前池不变。

## 8. 测试

- **配置**：默认数值；校验坏的 `icon`、重复的 `key`、不存在的道具 id 都报错；券和手办进了道具表；图标存在。
- **开池**：
  - 第一次用到时开池，张数和各档对得上；
  - 前一天没抽完的池变成 `expired`；
  - 并发开池只开出一池。
- **买券**：扣银币、发券、限购（跨请求累计）；功能关掉报 `FEATURE_DISABLED`。
- **抽签**：
  - 扣券；签不放回；各档剩余张数正确；
  - 券不够、超过剩余张数、超过 `maxDraw` 都报错，而且什么都不扣；
  - 发奖、发图标（不重复）、写新闻；
  - 抽完最后一张：发最后赏、池变成 `sold_out`、开出下一池；
  - **并发**：两个人同时抽同一池的最后几张，签不重复，最后赏只发给一个人。
  - **随机**：多次抽一池，分布符合张数（统计检验，宽松阈值）。
- **活跃度**：领最高一档送券；功能关掉不送。
- **新闻**：`headlines` 的广播栏能显示 `kuji.big`；新闻文案齐全（`NEWS_TYPES` 测试）。
- **前端**：
  - 看板的剩余数和灰掉的档；
  - 买券的总价；
  - 抽签按钮按券数和剩余禁用；
  - 抽签结果和最后赏提示；
  - 日志文案。
- **端到端**：注册的玩家买券 → 抽 1 张 → 看到结果、券少一张。

## 9. 不做的事

- 一番赏专用的后台页面（池的历史、每池回收多少）；
- 手办的展示柜和交易；
- 指定"保底"、预览剩余签的顺序；
- 钻石买券。
