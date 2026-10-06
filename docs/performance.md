# 性能：怎么测、测到了什么

质量期第 ③ 批（2026-10-05）建立的做法。性能优化是长期工作：每次改动先测、改完再测，结果记在这里。

## 测量工具

### 1. 每个请求的查询统计（Server-Timing）

服务端环境变量（`apps/server/.env.development` 已经打开）：

| 变量 | 作用 |
|---|---|
| `DB_QUERY_STATS=true` | 每个响应带 `Server-Timing: db;dur=<查询毫秒>;desc="<条数> queries", app;dur=<总毫秒>`。浏览器开发者工具的 Network → Timing 里能直接看到 |
| `DB_SLOW_MS=100` | 超过这个毫秒数的查询往 stderr 打一行 `slow query` 警告（带语句），API 和 worker 都算；0 = 不记 |

两个都默认关闭；关闭时不挂回调，没有额外开销。实现见 `apps/server/src/infra/queryStats.ts`。

注意：
- 查询是并发发出时，`db` 是各条耗时的和，会大于 `app`；
- 事务的 `begin`、`commit` 也各算一条；出错的查询不计；
- `app` 到发送前为止，不含压缩。

### 2. 接口压测

```bash
# 开发服跑着（pnpm dev）时，用一个玩家账号依次请求常用接口
pnpm -F @dt/server bench:api <用户名> [区服 id]
# 只测几个接口、多采样
PATHS=/restaurant/overview,/task/list N=30 pnpm -F @dt/server bench:api <用户名> 1
```

在 Git Bash 里设 `PATHS` 时要加 `MSYS_NO_PATHCONV=1`，否则以 `/` 开头的值会被改写成 Windows 路径。

e2e 测试号的密码都是 `secret123`；数据多的号可以按等级从开发库里挑。

看服务端的数（`app`），不要看客户端计时：Windows 本机回环加计时器粒度，每个请求在客户端会多出 15 毫秒左右的固定开销。

### 3. 查询条数预算测试

`apps/server/src/perf/budget.test.ts` 给常用接口设了查询条数上限（新开的店、没有活动的区服、第二次请求）。改功能让条数变多时这条测试会挂：先想想能不能并进已有的查询，确实需要再调预算。

单个功能也可以用 `test/queries.ts` 的 `queryCounter()` 数查询，例如活动列表“条数不随活动个数增长”、交易所“锁店事务里只读一次参考价”。

### 4. 周期任务耗时

`job_run` 表记着每次周期任务的开始和结束时间，结算的 `stats.ms` 是整轮耗时：

```sql
select job, count(*), round(avg(extract(epoch from finished_at - started_at)) * 1000) avg_ms,
       round(max(extract(epoch from finished_at - started_at)) * 1000) max_ms
from job_run where finished_at is not null and started_at > now() - interval '2 days'
group by job order by avg_ms desc;
```

## 2026-10-05 的测量（开发服，Windows + Docker 的 Postgres）

开发库：1,464 家店，一服 86 家在营业。玩家号 eut6s3wg（60 级、4 星），每个接口热 2 次后采 20~30 次，服务端耗时中位数：

| 接口 | 改前 | 改后 | 查询条数 | 做了什么 |
|---|---|---|---|---|
| `/restaurant/overview` | 30.6 ms | 10~12 ms | 11 | 互不依赖的查询一起发（一个请求同时占约 9 个连接） |
| `/task/list` | 26.3 ms | 12~13 ms | 12 → 5 | 店铺的 8 项计数合成一条查询（可能在事务里跑，不能并发） |
| `/activities/summary` | 22.6 ms | 9.5~10 ms | 35 → 7 | 所有活动的进度、结算、今日计数一次读完，条数不随活动个数增长 |
| `/activities` | 20.8 ms | 9.8 ms | 35 → 7 | 同上 |
| `/world/catalog` | 每次 289KB | 没变时 304、0 字节 | 0 | 按语言序列化一次，带 ETag |

其余常用接口服务端都在 6~20 毫秒，查询 1~10 条，暂时不用动。开发环境里一条查询大约 1~2 毫秒（Docker 的网络），生产环境会快不少。

结算：每家店约 4 毫秒（分批并发），每 4 分钟一轮；一个区服上万家店一轮十几秒，暂时不是瓶颈。

## 2026-10-06 的测量（第二轮，只测没改）

开发库：1,497 家店。同一个玩家号 eut6s3wg，每个接口热 2 次后采 20 次。

**接口**：服务端耗时中位数都在 4.5~18 毫秒，查询最多 11 条，比 10-05 改完时没有变慢。最慢的一组：

| 接口 | 服务端中位数 | p95 | 查询条数 |
|---|---|---|---|
| `/market/view` | 18.3 ms | 21.0 ms | 10 |
| `/bar` | 17.8 ms | 21.1 ms | 10 |
| `/kuji` | 17.6 ms | 20.9 ms | 9 |
| `/temple` | 16.6 ms | 19.0 ms | 9 |
| `/town` | 16.4 ms | 22.2 ms | 10 |
| `/equip/overview` | 14.8 ms | 18.3 ms | 8 |
| `/restaurant/overview` | 12.5 ms | 29.4 ms | 11 |

这几个的查询多半互不依赖、却一条接一条地发（例如神殿：今日伤害、是否击杀、持有道具、试炼、厨具、加成、喂养各一条），并发发出去能降到 10 毫秒左右；生产环境一条查询更快，收益更小，记在 backlog。

**周期任务**（`job_run` 近两天）：结算平均 105 毫秒一轮、最长 1.6 秒；其余任务平均都在 1 秒以内。最重的 `honor-effects-resync`（约 1 秒）只在勋章数值改了以后每个区服跑一次，不用管。

**目录接口**：`/world/catalog` 第一次约 90 KB（压缩后），之后靠 ETag 不再下载。

**前端首屏**（`pnpm -F @dt/web build`，压缩后）：

| 文件 | 大小 |
|---|---|
| 入口 JS | 133 KB |
| CSS（Bootstrap + 图标的类） | 48 KB |
| 图标字体 `bootstrap-icons.woff2` | 134 KB |
| 其余四种语言包 | 各约 55 KB，按需加载 |

图标字体是整套 Bootstrap Icons（两千多个），代码里只用到 73 个，而且名字都是写全的 `bi-xxx`，可以在构建时裁成子集，首屏少约 140 KB。记在 backlog。

## 看过但没改的

- 登录记录清理（`cleanLoginTrace`）每 6 小时扫一次全表：这张表上线后几万到十几万行，扫一次几十毫秒；为它加 `last_seen` 索引，每次登录都要多维护一个索引，不划算。
- 后台经济统计实时算今天和昨天：热的时候一天约 60 毫秒，只有管理员偶尔看。
- 交易所成交时每个挂单方多查一次店铺（emitActionFor）：一笔成交通常一到三家，不值得改撮合流程。
