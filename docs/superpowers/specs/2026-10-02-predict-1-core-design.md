# 事件合约 238-1：合约引擎 + 管理员出题 设计

日期：2026-10-02
状态：待用户审阅

## 1. 范围

问题记录 238："搞点类似事件合约的小功能，就像菜场猜下一轮菜一样"。拆成两个 PR，按顺序做：

- **238-1（本文）**：合约引擎（报价、买卖、上限、手续费、截止、判定、结算、作废退款）、管理员出题和判定、玩家"预测"页、后台"预测"页。分支 `feat/predict-core`。
- **238-2**：系统自动出题（纯随机类、全服数据类），每天定时开题、自动判定。另写规格书。

## 2. 用户已确认的裁定

1. **形态**：真·事件合约。每个事件有"是""否"两种份额，价格由系统按 LMSR 公式自动报价，玩家随时买卖，不挂单撮合。
2. **事件来源**：纯随机、全服数据、管理员手动出题三种都要；238-1 只做管理员出题。
3. **货币**：银币。
4. **数值**：每份结算 1,000 银币；买卖都收 2% 手续费；每人每个事件每一边最多持有 200 份；单笔最多 100 份；流动性 b 默认 100 份；管理员出题可设初始概率 5%~95%。
5. **数据、流程、页面**：按 §5~§8。判定和作废只有管理员（`admin`）能做，协管（`mod`）能出题和查看。

## 3. 区服数值

`tuning.predict`（`tuning.json`、zod、`setting_docs.json` 都要加）：

```jsonc
{
  "unit": 1000,          // 每份结算多少银币
  "feeRate": 0.02,       // 买卖手续费（比例，向上取整）
  "maxHold": 200,        // 每人每个事件每一边最多持有几份
  "maxTrade": 100,       // 单笔最多几份
  "defaultB": 100,       // 出题时流动性 b 的默认值（份）
  "minLevel": 20,        // 开通门槛：餐厅等级
  "minAccountDays": 7    // 开通门槛：注册天数（另外要求邮箱已验证，和交易所一样）
}
```

区服功能开关 `predict`（`setting_docs.json` 的 features 加说明）：关掉后不能买卖；已有事件照常截止、判定、结算。

## 4. 报价（LMSR）

记 `y`、`n` 为事件里已经卖出的"是""否"份数（可以是小数），`b` 为流动性。

- **成本函数**：`C(y, n) = b × ln(e^(y/b) + e^(n/b))`，用 log-sum-exp 计算避免溢出。
- **"是"的价格**：`p = e^(y/b) / (e^(y/b) + e^(n/b))`；"否"的价格是 `1 − p`。显示为 1~99 的整数概率（四舍五入，最少 1、最多 99）。
- **买 k 份"是"**：成交额 = `ceil(unit × (C(y + k, n) − C(y, n)))`。
- **卖 k 份"是"**：成交额 = `floor(unit × (C(y, n) − C(y − k, n)))`。"否"同理。
- **手续费**：`ceil(成交额 × feeRate)`。买入付 `成交额 + 手续费`，卖出得 `成交额 − 手续费`。
- **初始概率** `p0`（5%~95%）：开题时令 `y − n = b × ln(p0 / (1 − p0))`，较小的一边为 0。
- **系统最大亏损**：结果为"是"时不超过 `unit × b × ln(1 / p0)`，为"否"时不超过 `unit × b × ln(1 / (1 − p0))`。50% 开局约 6.9 万银币，5% 的冷门真发生约 30 万银币；手续费另算收入。
- 公式里的 `unit` 用事件自己保存的值（出题时从区服数值复制），之后改区服数值不影响已开的事件。
- 报价函数放在 `@dt/shared`，前后端共用，前端用它预估花费和所得。

## 5. 数据（迁移 0029）

```
predict_event
  id            bigserial pk
  shard_id      int not null references shard on delete cascade
  kind          text not null default 'manual'        -- 238-2 加自动类型
  title         text not null                          -- 1~60 字
  description   text not null default ''               -- 0~500 字
  params        jsonb not null default '{}'           -- 238-2 用
  b             double precision not null check (b > 0)
  unit          int not null                           -- 出题时的 tuning.predict.unit；报价和结算都用它，改区服数值不影响已开的事件
  q_yes         double precision not null default 0
  q_no          double precision not null default 0
  p0            double precision not null              -- 初始概率，后台算盈亏用
  open_at       timestamptz not null
  close_at      timestamptz not null
  status        text not null check (status in ('open','closed','resolved','void'))
  outcome       boolean                                -- resolved 时非空
  created_by    int                                    -- 出题人账号
  resolved_at   timestamptz
  settled_at    timestamptz                            -- 全部持仓结算完
  created_at    timestamptz not null default now()
  index (shard_id, status, close_at)

predict_position
  event_id      bigint references predict_event on delete cascade
  rest_id       int references restaurant on delete cascade
  yes           int not null default 0 check (yes >= 0)
  no            int not null default 0 check (no >= 0)
  net_cost      bigint not null default 0              -- 买入付出（含手续费）− 卖出拿回（扣过手续费）
  settled       boolean not null default false
  primary key (event_id, rest_id)
  index (rest_id)

predict_trade
  id            bigserial pk
  event_id      bigint references predict_event on delete cascade
  rest_id       int references restaurant on delete cascade
  side          text check (side in ('yes','no'))
  dir           text check (dir in ('buy','sell'))
  qty           int not null
  amount        bigint not null                        -- 成交额（不含手续费）
  fee           bigint not null
  price_after   double precision not null              -- 成交后"是"的价格（0~1）
  created_at    timestamptz not null
  index (event_id, id)
```

## 6. 玩法流程

### 6.1 买卖

`POST /predict/events/:id/trade { side: 'yes'|'no', dir: 'buy'|'sell', qty }`（区服开关 `predict`）：

1. 锁店（`runOp`），再锁事件行（`select … for update`）。加锁顺序为店 → 事件。
2. 检查：
   - 开通门槛：复用交易所的 `eligibility`，数值用 `tuning.predict`；
   - 事件属于本区服、`status = 'open'`、`now < close_at`；
   - `1 ≤ qty ≤ maxTrade`；
   - 买入后这一边持有 `≤ maxHold`；
   - 卖出不超过持有的份数；
   - 买入时银币够付成交额加手续费。
3. 按 §4 算成交额和手续费，扣钱或加钱；更新事件的 `q_yes` / `q_no`、持仓（份数、`net_cost`），写一行成交记录。
4. 写个人日志 `predict.trade`（事件标题、方向、份数、金额、手续费），返回成交结果和最新价格。

报错：

| 情况 | 错误 |
|---|---|
| 门槛不满足 | `requirement('predict_level' / 'predict_age' / 'predict_email')` |
| 事件不在本区服 | 404 |
| 事件不能交易（已截止、已判定、已作废） | `invalidState('predict_closed')` |
| 份数超单笔上限 | `limitReached('predict_trade', { max })` |
| 超持有上限 | `limitReached('predict_hold', { max })` |
| 卖出超过持有 | `invalidState('predict_not_enough')` |
| 银币不够 | 和其他扣银币的地方一样 |

### 6.2 截止

定时任务 `predict-close`：每分钟一次，挂在 `restaurant` 功能上。把 `status = 'open' and close_at <= now` 的事件改为 `closed`。买卖时也检查 `now < close_at`，所以任务慢了不会让人在截止后成交。

### 6.3 判定和作废（只有管理员）

- `POST /admin/predict/:id/resolve { outcome: boolean }`：事件为 `open` 或 `closed` 时可以判定（事件可能提前发生）。在短事务里锁事件行，把状态改为 `resolved`，写 `outcome`、`resolved_at`，写审计日志 `predict.resolve`。
- `POST /admin/predict/:id/void`：`open` 或 `closed` 时可以作废，状态改为 `void`，写审计日志 `predict.void`。
- 已经判定或作废的事件不能再改：`invalidState('predict_final')`。

### 6.4 结算

定时任务 `predict-settle`：每分钟一次，挂在 `restaurant` 功能上。处理 `status in ('resolved','void') and settled_at is null` 的事件，每次最多处理 200 个持仓。

每个未结算的持仓单独一个事务（`runSystemOp`，锁这家店），在事务里把持仓改为 `settled = true`。条件里带 `settled = false`，所以任务重跑或并发也不会重复发钱。

- **判定为"是"**：发 `unit × yes` 银币；判定为"否"发 `unit × no`。发 0 的也标记已结算，但不写日志。
- **作废**：退 `max(net_cost, 0)`。
- 写个人日志：`predict.settle`（事件标题、结果、所得）或 `predict.refund`（事件标题、退款）。
- 某个事件的持仓全部结算完后，写 `settled_at`。

结算时不锁事件行（事件已经是终态，买卖不会再改它），所以不会和买卖互相等锁。

## 7. 查询和页面

### 7.1 玩家接口

- `GET /predict/events`：
  - 本区服 `open` 的事件，加上 7 天内结束且自己有持仓的事件；
  - 每个事件：id、标题、"是"的价格、截止时间、状态、结果、我的"是""否"份数、我的净投入；
  - 再附上我是否满足开通门槛，以及缺哪一项。
- `GET /predict/events/:id`：
  - 事件详情（含说明、b、当前份额，供前端算报价）；
  - 我的持仓；
  - 最近 20 笔成交（不显示是谁）；
  - 价格走势：最近 100 笔成交后的价格，加上开题时的初始价格。
- `POST /predict/events/:id/trade`：见 §6.1。

### 7.2 玩家页面"预测"

在"更多"里、交易所旁边加入口（`/predict`，图标 `bi-bar-chart-steps`）。

- **列表**：
  - 进行中的事件：标题、"是"的概率、截止倒计时、我的持仓；
  - 下面是已结束的事件：结果、我的盈亏（结算所得或退款减净投入）。
- **详情**：
  - 标题、说明、"是 63% / 否 37%"、截止时间；
  - 一条简单的价格折线（SVG，不引入图表库）；
  - 买卖表单：选"是""否"和"买入""卖出"，输入份数，预估花费或所得、手续费、成交后的价格；
  - 我的持仓，以及按当前价全部卖出能拿回多少；
  - 最近成交。
- 门槛不满足时显示缺哪一项，表单禁用。
- 日志文案：`predict.trade`、`predict.settle`、`predict.refund`。

### 7.3 后台"预测"页

`mod` 可以看和出题，`admin` 可以判定和作废。

- **出题** `POST /admin/predict`：区服、标题、说明、截止时间（必须晚于现在）、初始概率（5~95，整数百分比）、b（默认 `defaultB`，10~10000）。开始时间就是现在。写审计日志 `predict.create`。
- **列表** `GET /admin/predict?shardId`：本区服最近 100 个事件，最新的在前。每行显示：
  - 状态、截止时间、当前价格；
  - 成交笔数、持仓人数、手续费合计；
  - 系统收支：如果结果为"是"或"否"，系统分别赚多少（净收入减去要付的结算）。
- 按钮："判定为是""判定为否""作废"，只有管理员能看到，点之前要确认。
- 后台权限矩阵测试要加上这些路由。

## 8. 测试

- **报价纯函数**：
  - 价格在 0~1 之间，两边相加为 1；
  - 买入成本为正，买了再卖回不赚钱（取整向系统）；
  - 初始概率生效；
  - 最大亏损不超过 §4 的上限（各种初始概率，买满一边）；
  - 很大的份数不溢出。
- **买卖**：
  - 扣钱、手续费、份额和持仓更新；
  - 单笔上限、持有上限、卖出超过持有、截止后、已判定都拒绝；
  - 门槛；
  - 别的区服的事件返回 404；
  - 区服开关关掉不能买卖。
- **截止任务**：到时间改为 closed。
- **判定和结算**：
  - 押对的一边按 `unit × 份数` 发钱；
  - 作废按净投入退款，负数不退；
  - 任务重跑不重复发钱；
  - 判定后再判定报错；
  - 协管不能判定。
- **守恒**：多人随机买卖后判定，`所有玩家银币变化 + 系统净收入 + 手续费合计 = 0`，其中系统净收入 = 净成交额 − 结算支出。
- **并发**：两个人同时买同一个事件，份额和成交额与依次买的结果一致。
- **后台**：出题参数校验、列表、权限矩阵。
- **前端**：预测列表、详情的预估金额、门槛提示、后台出题和判定按钮按角色显示。
- **端到端**：管理员出题 → 玩家买"是" → 管理员判定为"是" → 玩家收到银币。

## 9. 不做的事

- 系统自动出题（238-2）。
- 多选项事件（比如"蟹老板在哪条街"有 13 个结果）；238-2 用"是否在某个范围"表示。
- 玩家之间挂单撮合、玩家自己出题。
- 事件结果发全服新闻、排行榜。
