# 自由交易市场 156-1：交易所核心 设计

日期：2026-10-02
状态：待用户审阅

## 1. 范围

问题记录 156（自由交易市场）拆成三个子项目，用户 2026-10-02 定的顺序是 1 → 2 → 3：

| 子项目 | 内容 |
|---|---|
| **156-1（本文）** | 交易所核心：可交易范围、限价挂单、撮合、手续费、参考价和涨跌幅限制、开通门槛、交易所账户、页面 |
| 156-2 | 进阶防作弊：同 IP / 设备 / 新号之间成交的限制，异常成交进"可疑数据"，大额冷静期，后台冻结 |
| 156-3 | 基础流动性：系统做市商在参考价附近挂单；和固定菜场的价格关系、防套利 |

本文只做 156-1，一个 PR，分支 `feat/exchange-core`。

## 2. 用户已确认的裁定

1. 可交易的是**各等级的稀有食材**：食材 `odds < 100`，和菜场判断稀有用的是同一个口径。共 141 种：1 级 11 种、2 级 20 种、3 级 38 种、4 级 28 种、5 级 9 种、6 级 19 种、7 级 12 种、9 级 4 种。以后要放开非稀有食材，再加配置。
2. **挂单价格**必须在当天参考价的 0.5~2 倍之间。参考价每天一个：前一天的成交量加权均价，成交太少就沿用前一天的；初始用系统定价。
3. **手续费**：只在成交时从卖方所得里扣 5%，银币直接回收；挂单、撤单都免费。
4. **开通门槛**：餐厅等级、账号注册天数、邮箱已验证，三项都要满足。
5. **挂单**：只有限价单，可以部分成交；24 小时后过期；每人同时最多 10 张。
6. **买到的食材放不下**：挂买单时就检查，放不下不让挂。
7. **匿名**：盘口和成交记录只显示价格和数量，不显示店名；后台能看到双方。
8. **交易所账户**：挂单方成交的所得先进他的交易所账户，吃单方在同一次操作里直接到账。

食材不能卖回给系统，所以不存在"交易所低价买、卖给系统"的套利。用小号抢特价货架限购名额再到交易所卖，这类问题放在 156-2 处理。

## 3. 区服数值

`tuning.exchange`（`tuning.json`、zod 定义、`setting_docs.json` 都要加）：

```jsonc
{
  "minLevel": 20,           // 开通门槛：餐厅等级
  "minAccountDays": 7,      // 开通门槛：账号注册满几天（按现实时间）
  "feeRate": 0.05,          // 卖方手续费
  "bandLow": 0.5,           // 挂单价下限 = 参考价 × bandLow，向上取整
  "bandHigh": 2,            // 挂单价上限 = 参考价 × bandHigh，向下取整
  "refMinTrades": 3,        // 前一天成交不少于几笔才更新参考价
  "maxOpenOrders": 10,      // 每人同时最多几张挂单（买卖合计）
  "orderHours": 24,         // 挂单有效期
  "maxQty": 999,            // 每张单最多几个
  "refOverrides": {}        // 按食材 id 指定初始参考价，例如 7 级食材系统定价都是 100 万（占位值）
}
```

邮箱已验证不做成数值，固定要求。

功能开关：新增 `exchange`，默认开启。加进 `IMPLEMENTED_FEATURES`，并写功能说明。

## 4. 数据（迁移 0025）

```
exchange_order
  id            bigserial pk
  shard_id      int not null references shard on delete cascade
  rest_id       int not null references restaurant on delete cascade
  side          text not null check (side in ('buy','sell'))
  foods_id      int not null
  price         int not null check (price > 0)        -- 每个的银币单价
  qty           int not null check (qty between 1 and 999)
  filled        int not null default 0
  status        text not null check (status in ('open','filled','cancelled','expired'))
  created_at    timestamptz not null default now()
  expires_at    timestamptz not null
  closed_at     timestamptz null
  index (shard_id, foods_id, side, status, price, id)  -- 撮合和盘口
  index (rest_id, status)                              -- 我的挂单、挂单数上限
  index (status, expires_at)                           -- 过期任务

exchange_trade
  id             bigserial pk
  shard_id, foods_id, price, qty
  buy_order_id, sell_order_id   bigint references exchange_order
  buyer_rest_id, seller_rest_id int
  fee            bigint not null                       -- 卖方被扣的手续费
  created_at     timestamptz not null default now()
  index (shard_id, foods_id, created_at)
  index (buyer_rest_id, created_at), index (seller_rest_id, created_at)

exchange_ref
  shard_id, foods_id, day (date)   pk
  price          int not null

exchange_wallet          -- 交易所账户：银币
  rest_id pk references restaurant on delete cascade
  coin    bigint not null default 0

exchange_wallet_food     -- 交易所账户：食材
  rest_id, foods_id pk
  num     int not null
```

银币和数量都用整数。买单冻结的银币不单独记：剩余冻结额 = `price × (qty − filled)`。

## 5. 参考价

`refPrice(db, shardId, foodsId, day)`：

1. 有 `exchange_ref (shard, food, day)` 就用它；
2. 没有就算出来再写入（`on conflict do nothing`，然后重读）：
   - 前一天（`gameDay`）这种食材在本区服的成交笔数 ≥ `refMinTrades`：用成交量加权均价，四舍五入；
   - 否则沿用最近一天的参考价；
   - 一条都没有时，用 `refOverrides[foodsId]`，再没有就用系统定价 `food.coin`。

允许的挂单价：`[ceil(ref × bandLow), floor(ref × bandHigh)]`，下限至少 1。

## 6. 下单和撮合

### 6.1 下单 `POST /exchange/orders { foodsId, side, price, qty }`

在锁店事务里（`runOp`，功能 `exchange`），按顺序检查：

1. **门槛**，三项分别报 `requirement`，原因分别是：
   - `exchange_level`（带 `need`）；
   - `exchange_age`（带 `days`）；
   - `exchange_email`。
2. **可交易**：食材存在且 `odds < 100`，否则 `invalidState('not_tradable')`。
3. **价格**：在允许范围内，否则 `invalidState('price_band', { min, max })`；数量 1~`maxQty`。
4. **挂单数**：自己 `open` 的挂单 < `maxOpenOrders`，否则 `limitReached('exchange_orders', { max })`。
5. **冻结**：
   - 卖单：`subFoods(op, foodsId, qty, { source: 'exchange' })`，不够时报 `NOT_ENOUGH`；
   - 买单：`spendCoin(op, price × qty, { source: 'exchange' })`，不够时报 `NOT_ENOUGH`；
   - 买单还要检查橱柜：把"现有 + 自己所有未成交买单的剩余数量 + 本单数量"放进 `planAddFoods`，有 `dropped` 就报 `invalidState('cupboard_full')`。
6. **写挂单**：`status='open'`，`expires_at = now + orderHours`。
7. **撮合**（§6.2）。
8. **个人日志** `exchange.order`（参数：食材、方向、价格、数量、当场成交了多少）。

返回 `{ order, fills: [{ price, qty }] }`。

### 6.2 撮合

同一区服、同一种食材是一个盘口。下单和撤单都先拿事务级锁 `pg_advisory_xact_lock(hashtext('exchange:<shard>:<food>'))`，同一盘口串行处理。

新单作为吃单方，按"价格优先、时间优先"逐笔吃对面的挂单：

- **对面的挂单**：同区服、同食材、方向相反、`status='open'`、没过期（`expires_at > now`），并且**不是自己的单**（自己的单直接跳过，不成交也不撤）。
  - 新单是买单时，吃价格 ≤ 买价的卖单，从低到高；
  - 新单是卖单时，吃价格 ≥ 卖价的买单，从高到低；
  - 同价按 `id` 从小到大。
- **每一笔**：
  - 成交价 = 挂单方的价格，数量 = 两边剩余的较小值；
  - 手续费 = `floor(成交价 × 数量 × feeRate)`；
  - 写 `exchange_trade`；两张单的 `filled` 加上成交数量，满了就把状态设为 `filled`，`closed_at = now`。
- **到账**：
  - 吃单方是买单：食材用 `addFoods` 进自己店，放不下的部分进自己的交易所账户。成交价比自己的出价低，差价 `(出价 − 成交价) × 数量` 当场退回银币（`gainCoin`，来源 `exchange`）。
  - 吃单方是卖单：所得银币 `成交价 × 数量 − 手续费` 当场到账。
  - 挂单方：所得进他的交易所账户。挂单方是卖单的进银币（已扣手续费），是买单的进食材。只写账户表，不锁他的店。
- **个人日志**：挂单方每笔写一条 `exchange.fill`（被动成交，写在挂单方名下；不锁店，直接插日志表）。吃单方的成交合并写进 `exchange.order` 那条。

### 6.3 撤单 `POST /exchange/orders/:id/cancel`

撤单和取出（§6.5）不受交易所开关限制，在功能 `restaurant` 下运行：区服关掉交易所时，玩家仍能拿回冻结的东西。

- 必须是自己的、`open` 的挂单，否则报 `NOT_FOUND` / `invalidState('order_closed')`。
- 拿盘口锁，把状态改为 `cancelled`。
- 退回剩余部分：卖单的剩余食材 `addFoods` 回店里，放不下的进交易所账户；买单的剩余冻结银币回店里。
- 写日志 `exchange.cancel`。

### 6.4 过期

周期任务 `exchange-expire`：每分钟一次，挂在功能 `restaurant` 上。这样区服关掉交易所时也照常退回，和活动补发任务一样。

- 把本区服 `open` 且 `expires_at ≤ now` 的挂单改为 `expired`，剩余部分退回到**交易所账户**（不锁店）。
- 写日志 `exchange.expire`。
- 每批最多处理 500 张，剩下的下一分钟继续。

撮合本来就跳过过期的单，所以过期任务晚跑一会儿也不会成交过期单。

### 6.5 交易所账户 `POST /exchange/withdraw`

- 银币全部取进店里。
- 食材每种 `addFoods`，能放多少放多少，放不下的留在账户里。
- 写日志 `exchange.withdraw`。
- 返回取出了多少、还剩多少。

## 7. 查询接口

- `GET /exchange/foods`：可交易食材列表，每种带 `ref`（今天的参考价）、`last`（最近一笔成交价，没有则 null）、`changePct`（last 相对 ref 的涨跌，没有成交为 null）。
- `GET /exchange/book/:foodsId`：
  - `ref`、`min`、`max`（今天允许的价格范围）；
  - `last`，今日成交量 `volume`；
  - 买卖各 5 档：`bids` / `asks`，每档是 `{ price, qty }`，按价格合并剩余数量。
- `GET /exchange/me`：
  - 我的挂单（`open` 的，按时间倒序）；
  - 交易所账户（`coin`、`foods`）；
  - 我最近 7 天的成交（价格、数量、买或卖、手续费、时间）。
  - 另返回我的开通状态：`eligible`，以及不满足的那一项（`reason`），页面据此提示。

查询接口不需要开通门槛，谁都能看盘口；下单才需要。

## 8. 前端

- 菜场页加"交易所"入口，路径 `/exchange`；"更多"菜单也加一项。
- **选食材**：可交易的稀有食材按等级分组，可以搜索。每项显示参考价、最新成交价、涨跌。
- **盘口**：卖 5 档在上、买 5 档在下，中间是最新成交价；参考价、允许范围、今日成交量。点某一档会把价格填进下单表单。
- **下单**：
  - 买或卖、单价（输入框提示允许范围）、数量；
  - 显示预计花费，或扣掉手续费后的预计所得；
  - 不满足门槛时，表单禁用并写明原因，例如"餐厅 20 级才能交易，你现在 12 级"。
  - 下单后提示成交了多少；没成交完的部分显示为挂单。
- **我的**：挂单（可撤单）、交易所账户（"全部取出"）、近 7 天成交。
- **文案**：
  - 个人日志文案：`exchange.order`、`exchange.fill`、`exchange.cancel`、`exchange.expire`、`exchange.withdraw`；
  - 错误文案：`not_tradable`、`price_band`、`cupboard_full`、`order_closed`、`exchange_orders`，以及门槛的三个原因。

## 9. 测试

- **纯函数**：
  - 允许价格范围（取整、下限至少 1）；
  - 参考价计算：成交笔数够了用加权均价，不够沿用，初始用系统定价，`refOverrides` 优先。
- **集成**：
  - 门槛三项分别报错；非稀有食材、价格越界、数量越界、挂单数满都拒绝；
  - 挂卖单扣食材，挂买单扣银币；撤单原样退回；过期退回进账户；
  - 撮合：
    - 价格优先、时间优先；部分成交；
    - 吃单方是买单、以更低价成交时退回差价；
    - 卖方扣 5% 手续费；挂单方所得进账户；
    - 不和自己的单成交；不吃过期的单；
  - 橱柜检查：现有 + 未成交买单超过上限时不让挂；
  - 取出：橱柜放不下时只取出放得下的；
  - 并发：两个买单同时吃同一张卖单，总成交不超过卖单数量，银币和食材守恒；
  - 跨区服隔离：别的区服的挂单不会成交；
  - 功能关掉时下单报功能关闭；撤单、取出、过期退回照常可用。
- **前端**：选食材、盘口显示、点价格填表单、下单（预计花费和所得）、门槛不满足时禁用、撤单、取出。
- **守恒测试**：一组随机挂单撮合后，买卖双方银币变化之和 + 手续费 = 0，食材总数不变。

## 10. 不做的事

- 市价单、止损单、K 线图。
- 同 IP / 设备限制、可疑成交审核、冷静期（156-2）。
- 系统做市（156-3）。
- 非稀有食材和道具上架。
- 后台的挂单和成交管理页（156-2 和审核一起做）。
