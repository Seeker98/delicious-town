# 自由交易市场 156-2：进阶防作弊 设计

日期：2026-10-02
状态：待用户审阅

## 1. 范围

问题记录 156 的第二个子项目（顺序 1 → 2 → 3）。一个 PR，分支 `feat/exchange-guard`。

在 156-1 交易所核心上加四件事：

1. 关联账号之间的成交限制；
2. 可疑成交的标记；
3. 可疑成交的冷静期；
4. 后台的可疑成交列表、冻结交易所、没收冻结中的所得。

## 2. 用户已确认的裁定

1. **关联账号**：近 30 天用过同一设备的两个账号**不成交**，撮合时跳过，和跳过自己的单一样。只共用过 IP 的照常成交，但这笔标记为可疑。
2. **可疑成交**（四种，数值都在区服数值里）：
   - 同 IP；
   - 价格贴近涨跌幅边缘；
   - 同一对账号 7 天内反复成交；
   - 单笔大额。
3. **冷静期**：可疑成交双方的所得冻结 24 小时后才能取出；正常成交不受影响。
4. **后台**：
   - 冻结某家店的交易所：撤掉全部挂单，不能下单、不能取出；
   - 没收它冻结中的所得；已经取出的不追回。
   - 配合现有的封号使用。
5. **做法**：成交时当场判定、当场标记（不靠事后扫描），这样冷静期从成交那一刻就生效。

## 3. 区服数值

`tuning.exchange.suspicious`（`tuning.json`、zod、`setting_docs.json` 都要加）：

```jsonc
{
  "traceDays": 30,          // 关联账号：看最近几天的登录记录
  "edgeHigh": 1.8,          // 成交价 ≥ 参考价 × edgeHigh 算贴边
  "edgeLow": 0.6,           // 成交价 ≤ 参考价 × edgeLow 算贴边
  "repeatDays": 7,          // 同一对账号几天内
  "repeatCount": 3,         // 成交（算上这一笔）≥ 几次算反复
  "largeAmount": 1000000,   // 单笔成交额 ≥ 多少银币算大额
  "holdHours": 24           // 冷静期
}
```

## 4. 判定

### 4.1 关联账号

撮合开始前取一次**吃单方账号的足迹**：

- 设备集合：`login_trace` 里这个账号近 `traceDays` 天的 `device_id`（非空），加上这次请求的 `ctx.deviceId`；
- IP 集合：同上，取 `ip`，加上这次请求的 `ctx.ip`。

对每张候选挂单（只看它的店所属的账号）：

- 这个账号近 `traceDays` 天的 `login_trace` 里有任何一个设备在吃单方的设备集合里：**跳过**这张挂单，不成交也不撤；
- 否则，有任何一个 IP 在吃单方的 IP 集合里：照常成交，标记 `same_ip`。

实现上，在撮合前用一条查询，取出盘口里所有候选挂单方账号与吃单方的关系（同设备、同 IP），存成 `Map<账号, 'device' | 'ip'>`。

定时任务和系统操作（没有 `ctx`）不会作为吃单方下单，不涉及这里。

### 4.2 其余三种标记

每一笔成交：

| 标记 | 条件 |
|---|---|
| `edge_price` | `成交价 ≥ 当天参考价 × edgeHigh` 或 `成交价 ≤ 当天参考价 × edgeLow` |
| `repeat_pair` | 同一对买卖**账号**（不分方向）近 `repeatDays` 天的成交笔数，算上这一笔 ≥ `repeatCount` |
| `large` | `成交价 × 数量 ≥ largeAmount` |

同一次下单里的多笔成交逐笔判定。`repeat_pair` 要算上本次已经写入的前几笔。

### 4.3 记录

迁移 0027：

```
exchange_trade 加列
  buyer_account_id   int null        -- 记成交时的账号（店可能被删，审核要看人）
  seller_account_id  int null
  flags              text[] not null default '{}'

exchange_hold                      -- 冻结中的所得
  id           bigserial pk
  rest_id      int not null references restaurant on delete cascade
  trade_id     bigint references exchange_trade on delete set null
  coin         bigint not null default 0
  foods_id     int null
  num          int not null default 0
  release_at   timestamptz not null
  status       text not null check (status in ('held','released','confiscated'))
  created_at   timestamptz not null default now()
  index (rest_id, status, release_at)

exchange_freeze                    -- 被冻结交易所的店
  rest_id      int pk references restaurant on delete cascade
  reason       text not null
  actor_account_id int null
  created_at   timestamptz not null default now()
```

`repeat_pair` 的查询要用账号列，所以给成交表加索引 `(buyer_account_id, seller_account_id, created_at)`。

## 5. 冷静期

- **到账方式**：
  - 成交带任何标记：双方的所得都写一条 `exchange_hold`（`release_at = now + holdHours`），不进可用余额，也不当场到账。吃单方也是。
  - 卖方的所得是扣过手续费的银币；买方的所得是食材。
  - 买单退回的差价（吃单方是买单、以更低价成交时）是自己的钱，照常当场退回，不冻结。
- **个人日志**：成交日志 `exchange.order` / `exchange.fill` 加参数 `held: true`，前端文案末尾加"（可疑成交，所得冻结 24 小时）"。
- **取出时**（`withdraw`）：
  1. 店被冻结时报 `invalidState('exchange_frozen', { reason })`；
  2. 把自己 `held` 且 `release_at ≤ now` 的记录改成 `released`，金额转进可用余额；
  3. 照原来的方式取出。
- **`GET /exchange/me`**：加 `holds: [{ coin, foodsId, num, releaseAt }]`（只含 `held` 的）和 `frozen: { reason } | null`。

## 6. 冻结和没收

### 6.1 冻结（协管 `mod` 即可）

- `POST /admin/exchange/freeze { restId, reason }`：
  1. 写 `exchange_freeze`；
  2. 这家店所有 `open` 的挂单改为 `cancelled`，剩余部分退回进它的交易所账户。逐个盘口拿锁，按食材 id 顺序。
  3. 写审计日志 `exchange.freeze`。
- `POST /admin/exchange/unfreeze { restId }`：删记录，写审计日志 `exchange.unfreeze`。
- **被冻结的店**：
  - 下单报 `invalidState('exchange_frozen', { reason })`；
  - 取出报同样的错误；
  - 撤单不受影响（冻结时已经全部撤掉）。
- **交易所页**：顶部显示"你的交易所已被冻结：原因……，有疑问请联系管理员"，下单和取出按钮禁用。

### 6.2 没收（只有管理员 `admin`）

- `POST /admin/exchange/confiscate { tradeId }`：这一笔成交在双方名下所有 `held` 的冻结记录都改为 `confiscated`。
- `POST /admin/exchange/confiscate { restId }`：这家店所有 `held` 的记录都改为 `confiscated`。
- 两种都写审计日志 `exchange.confiscate`，参数为没收的银币和食材合计。
- 已经 `released` 的不追回。

## 7. 后台页面

在"可疑数据"页加标签"交易所"：

- **可疑成交列表** `GET /admin/suspicious/exchange?shardId&flag=`（`mod`）：
  - 本区服近 7 天带标记的成交，最新在前，最多 200 条；
  - 每行：时间、食材、成交价、当天参考价、数量、金额、标记（中文）、买方和卖方（店名、用户名、店 id）、双方冻结记录的状态（冻结中 / 已解冻 / 已没收）；
  - 可以按标记筛选。
- **每行的按钮**：
  - "冻结买方"、"冻结卖方"：弹出原因输入框；
  - "没收这笔"：只有管理员能看到。
- **冻结名单** `GET /admin/exchange/frozen?shardId`（`mod`）：店名、原因、冻结人、时间、"解冻"按钮。管理员另有"没收全部冻结中所得"按钮。
- **中文标签**：同 IP、价格贴边、反复对倒、大额。

后台权限矩阵测试要加上这些路由。

## 8. 前端（玩家）

- 交易所页：
  - 被冻结时显示提示，禁用下单和取出；
  - 账户区显示"冻结中：银币 X、食材 Y×N，Z 小时后可取"，按最早的解冻时间显示。
- 下单后的提示：有可疑成交时，在"已成交 N 个"后加"，其中有可疑成交，所得冻结 24 小时"。
- 日志文案：`held` 时末尾加冻结说明。

## 9. 测试

- **判定**：
  - 同设备的两个号挂单撞上时不成交（跳过，挂单还在）；
  - 同 IP 成交，标记 `same_ip`；
  - 贴边、反复（第 3 笔才标）、大额各自触发；
  - 没有标记的成交照常到账。
- **冷静期**：
  - 可疑成交双方都进冻结，吃单方也没有当场到账；买单的差价照常退；
  - 24 小时内取不出（只取出可用的部分）；到时间能取；
  - `me` 显示冻结中的记录。
- **冻结**：
  - 冻结后挂单撤掉、剩余部分退进账户，下单和取出报 `exchange_frozen`；
  - 解冻后恢复；
  - 协管能冻结、不能没收；管理员能没收。
- **没收**：按成交没收双方冻结中的记录；按店没收全部；已解冻的不受影响；之后取出取不到被没收的部分。
- **后台列表**：按标记筛选、按区服隔离、冻结状态显示。
- **前端**：
  - 后台标签页的列表、筛选、按钮按角色显示；
  - 交易所页的冻结提示、冻结中余额、下单提示。

## 10. 不做的事

- 撤销已完成的成交、追回已取出的所得。
- 设备指纹以外的关联判定（比如支付信息、邀请关系）。
- 系统做市（156-3）。
