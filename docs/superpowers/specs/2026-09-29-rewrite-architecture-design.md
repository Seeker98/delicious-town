# 美味小镇重写：总体架构设计

- 日期：2026-09-29
- 状态：待审阅
- 范围：总体架构（所有子项目共用）+ 子项目 1「骨架」的详细范围
- 游戏规则依据：`../analysis/spec/00~20`（下文简称"规格书"），配置数据：`../analysis/dataset/`、`../analysis/dataset/designed/`

## 1. 目标与约束

| 项 | 决定 |
|---|---|
| 用途 | 公开运营，每个区服几百到上千名玩家；按运营标准设计，避免以后重构 |
| 数据 | 从零开服，不迁移旧玩家 |
| 演进 | 运营者以后会自己增删玩法、开新服，功能要模块化，开关和数值尽量走配置 |
| 区服 | 多区服并存：账号全局通用，每个区服一家餐厅，世界数据按区服隔离；一套程序服务所有区服 |
| 技术 | TypeScript 全栈，前后端一起重写，不沿用旧代码 |
| 界面 | 页面结构照原版做；图片放在可替换的资源包里；手机优先，兼容电脑浏览器 |
| 部署 | 一台海外 VPS 跑 Docker Compose；前端放 Cloudflare Pages；接口通过 Cloudflare Tunnel 暴露（免费账户） |

**成功标准**：规格书描述的玩法全部可玩；5000 家店一轮结算 ≤30 秒；常用接口 p95 <100ms；加一个玩法 = 加一个模块 + 配置，不用改其他模块。

## 2. 旧版的结构性问题（新设计要避免的）

| 旧版 | 后果 | 新设计 |
|---|---|---|
| 111 个全局同步锁、单例里共享 Result | 全服排队、串号 | 单店行锁，无共享可变状态 |
| 每轮每桌插一行历史，并从历史表取"当前状态"，从不清理 | 每天约 2000 万行，越跑越慢 | 桌子当前状态存在一行 JSONB 里；历史只存每轮汇总，按天分区保留 3 天 |
| 每轮加载所有餐厅的全部已学食谱，再逐店过滤 | 计算量随餐厅数平方增长 | 已学食谱存成每店一个紧凑数组，外加派生计数 |
| 每日次数靠 COUNT 流水表 | 每次操作扫大表 | 每日计数表（餐厅, 日期, 计数项）加一 |
| 效果 JSON 字符串每次重新解析，有效期靠现算 | 用不上索引、重复解析 | 效果写入时就解析好并记录过期时间；每店缓存汇总结果 |
| "结账中"标记存在进程内存 | 只能单机 | 状态全部在数据库和 Redis |
| 业务里拼 HTML、SQL 字符串拼接、restId 取自 URL | 带宽浪费、注入、越权 | 结构化响应、参数化查询、restId 取自会话 |

## 3. 总体架构

### 3.1 仓库结构（pnpm monorepo）

```
delicious-town/
  packages/
    shared/   前后端共用：zod 接口 schema、游戏公式、常量、可注入随机数、错误码
    config/   配置包：读取 analysis 下的数据集，校验、规范化后生成带类型的配置包
  apps/
    server/   Fastify 后端；两个入口：api（接口进程）、worker（定时任务进程）
    web/      Vue 3 + Vite + Pinia 前端；assets/pack/ 为可替换资源包
  infra/      docker-compose、cloudflared、备份脚本
  docs/       设计与计划
```

### 3.2 后端模块

模块按规格书章节划分：account、shard、effects、restaurant、settlement、cookbook、mysterious、cupboard、market、shop、store、yard、pond、temple、bar、tower、town、friend、takeaway、task、news、admin。

每个模块内部结构相同：
- `routes.ts`：路由、zod 校验
- `service.ts`：规则，只依赖 repo 和其他模块的 service
- `repo.ts`：该模块自己表的 SQL
- `events.ts`：订阅的事件

模块之间只通过 service 函数调用，不直接读写别人的表。每个模块注册时声明自己的功能开关名，区服配置里关掉的模块不挂载路由、不跑定时任务。

### 3.3 写操作的统一流程

```
withRestaurant(restId, async (tx, rest) => {
  // 1. 事务内 SELECT ... FOR UPDATE 锁住该店行
  // 2. 执行规则（纯函数 + 注入的 RNG），得到变更和事件
  // 3. 写库
  // 4. 同一事务内同步分发事件：任务计数、活跃度、新闻、成就
})
```
- 涉及两家店的操作（翻橱、交换、放蟑螂、白食）用 `withRestaurants([a, b])`，按 restId 升序加锁，避免死锁
- 事件处理函数和业务在同一个事务里，要么都成功，要么都回滚
- 结算用的是同一把单店锁，所以不需要旧版的"结账中请稍后"

### 3.4 配置

- 构建时：`packages/config` 读取 `analysis/dataset/*.json` 和 `designed/*.json`，用 zod 校验并规范化（统一键名、解析 value JSON、补默认值），生成 `bundle.json` 和 TypeScript 类型
- 运行时：启动时加载进内存；权重池预先算好前缀和，抽取用二分查找
- 区服覆盖：`shard_config` 表保存每个区服的 JSON 覆盖（功能开关、数值参数、活动），深合并到基础配置上
- 热更新：管理接口触发重新加载，通过 Redis 发布订阅通知所有进程

### 3.5 随机数

所有概率逻辑都通过 `Rng` 接口获取随机数（`next()`、`int(n)`、`pick(pool)`）。
- 结算：种子 = hash(区服, 轮次, 餐厅)，可以原样复现
- 玩家操作：服务端安全随机源
- 测试：固定序列

## 4. 数据模型要点

以下只列出决定性能的结构，完整表设计放在各子项目的设计里。

| 表 | 结构要点 |
|---|---|
| `account` | 全局：用户名、argon2 密码哈希、邮箱、是否已验证、角色、创建时间；**没有手机号** |
| `shard` | 区服：编号、名称、状态、开服时间 |
| `shard_config` | 区服覆盖配置 JSON |
| `restaurant` | (shard_id, account_id) 唯一；基础字段（等级、经验、银币、钻石、体力、油、星级、街道、声望、属性……）+ **派生字段**（各品级已学数、各街道已学数、厨力、幸运总值）+ 加成汇总缓存 `effect_agg` JSONB + `effect_next_expire_at` |
| `restaurant_tables` | 每店一行：`tables` JSONB（每桌当前的顾客类型、蟑螂、白食者、痞老板等），`round_no` |
| `restaurant_cookbooks` | 每店一行：`levels` bytea，下标 = 食谱 id，值 = 品级 0~10 |
| `effect_source` | (rest_id, source_type, source_id, values JSONB, expires_at)；加成来源写入时解析好 |
| `store_item` | 可叠加道具 (rest_id, goods_id, num, acquired_at, expires_at)；厨具等不可叠加物品用单独的实例表（子项目 2） |
| `daily_counter` | 主键 (rest_id, day, key)，count；每日限制都用它 |
| `income_round` | 每店每轮一行汇总 + 加成分项 JSONB；按天分区，保留 3 天 |
| `ledger` | 道具 / 食材 / 货币变动流水；按天分区，保留 30 天 |
| `news` | 按区服；结构化（事件类型 + 参数 JSON），由前端渲染；按天分区保留 30 天 |

- 时间一律用 `timestamptz`
- 世界数据表（天气、菜场、排行、新闻、塔、外卖池……）都带 `shard_id`
- 分区由 worker 每天预建未来 3 天的分区、删除过期分区

## 5. 开店结算

- 每 4 分钟一轮，与原版语义一致（好友看到的桌子状态、今日收益排行都基于全局轮次）
- worker 主节点按区服把"营业中"的餐厅分批处理（每批 200 家），批内并发
- 每轮开始只读一次全局数据：配置、当前天气、祝福、蟹老板所在街道、痞老板驻留店、节日倍数
- 每家店在单店锁内处理：
  1. 读三行：restaurant、restaurant_tables、restaurant_cookbooks
  2. 按规格书 01 在内存里计算
  3. 写回 restaurant 和 restaurant_tables，插入一行 income_round
- 加成：读 `effect_agg` 缓存；若 `effect_next_expire_at` 已过，或加成来源有变动（写入时置脏），先重新汇总
- 失败隔离：单店出错只记日志、跳过，不影响其他店；轮次号保证每店每轮只结算一次（幂等）
- 其他定时任务（老鼠、体力、菜园、天气、菜场……）同样按区服分批、单店加锁、带周期号防重复

## 6. 接口与安全

| 项 | 设计 |
|---|---|
| 域名 | 前端 `game.<域名>`（Pages），接口 `api.<域名>`（Tunnel）；同站点，可用 Cookie。域名尚未购买，全部通过环境变量配置 |
| 会话 | 登录后签发随机令牌，放在 httpOnly、Secure、SameSite=Lax 的 Cookie 里；会话存在 Redis；新登录使旧会话失效；封号立即生效 |
| 当前餐厅 | 会话记录当前区服和 restId；接口一律从会话取，不接受客户端传 restId |
| 注册 | 用户名、密码、邮箱、邀请码（可选）+ Cloudflare Turnstile；未验证邮箱的账号不能参与互动玩法 |
| 邮件 | SMTP 可配置（开服初期用 Brevo 或 Resend 免费额度；开发环境用 Mailpit） |
| 路由 | 读用 `GET /api/v1/<模块>/<动作>`；写一律 `POST`，参数为 JSON，zod 校验类型和范围 |
| 响应 | 成功 `{ok:true, data, events}`；失败 `{ok:false, code, params}`；events 为结构化得失（如 `{type:"gain", kind:"goods", id:1, num:3, lucky:true}`），文案由前端生成 |
| 防刷 | Redis 令牌桶，按用户 + 按 IP，按接口设权重；注册 / 登录 / 发邮件单独更严 |
| 防重放 | 写请求带 `Idempotency-Key`，Redis 记录 10 分钟，重复请求返回第一次的结果 |
| 真实 IP | 只取 `CF-Connecting-IP`；服务器不开对外端口，只接受 Tunnel 流量 |
| 设备标识 | 前端生成并存在 localStorage，只作辅助信号 |
| CORS | 只允许自己的前端域名 |
| 搜索 | 只按餐厅名，参数化查询 + pg_trgm 索引 |
| 管理 | 独立角色和路由前缀，所有操作写审计日志；不提供"切换身份" |
| 日志 | pino 输出到标准输出；数据库只存游戏流水 |
| 实时 | 第一版轮询（新闻 / 广播 30 秒），以后按需加 WebSocket |

## 7. 前端

- Vue 3 + Vite + Pinia + vue-router，全部用 Composition API 和 TypeScript，不用 jQuery，没有同步请求
- 页面结构和路由参照原版（`antchensw.cn/assets` 里的页面清单），按子项目逐步实现
- 资源包：所有图片都通过 `asset('goods/神秘礼券')` 这样的函数取地址，基础地址可以配置；换一套美术只需替换 `assets/pack/`
- 接口客户端：统一处理 Cookie、Idempotency-Key、错误码 → 中文文案（`i18n/zh-CN.ts`）、events → 提示
- 适配：手机优先（最小宽度 360px），宽屏时居中显示成最大宽度约 720px 的内容区

## 8. 测试

1. 规则单元测试（Vitest）：纯函数 + 固定随机序列，用规格书里的例子断言
2. 集成测试：Docker 起真实 PostgreSQL 和 Redis；覆盖并发（同店并发操作、两店互相操作不死锁）、幂等、限流
3. 数值模拟器（子项目 2）：调用正式结算代码，模拟一批餐厅运行 N 天，输出经济曲线，用来调参
4. 压测：5000 家店一轮结算 ≤30 秒；常用接口 p95 <100ms
5. 端到端（Playwright）：只覆盖关键流程

## 9. 部署与运维

- Docker Compose 服务：`api`（可多实例）、`worker`（两个实例，用 PostgreSQL 咨询锁选主，定时任务只在主节点执行）、`postgres:16`、`redis:7`、`cloudflared`
- 开发环境多一个 `mailpit`
- 数据库迁移：Kysely migrator，部署时自动执行
- 备份：每晚 `pg_dump` 上传到 Cloudflare R2，保留 14 天
- CI：GitHub Actions 跑类型检查、lint、测试，构建镜像；前端由 Pages 自动部署
- 健康检查：`/healthz`（进程存活）、`/readyz`（数据库和 Redis 连通）

## 10. 子项目划分

| # | 子项目 | 完成标志 |
|---|---|---|
| 1 | 骨架 | 在线注册、验证邮箱、选区服、开店，看到一家新餐厅 |
| 2 | 核心经营：结算、成长（升级 / 升星 / 油壶 / 设施 / 餐桌）、食谱、橱柜、菜场、商店、仓库和道具、任务和活跃、数值模拟器 | 单人经营循环完整可玩 |
| 3 | 好友互动：好友、白食、蟑螂、翻橱、交换、点赞、品尝 | 多人互动 |
| 4 | 小镇玩法：特色菜和教室、神殿、酒吧、厨塔、外卖、菜园、协会（天气、NPC、卖艺男孩、星愿、兑换、广播、论坛、排行）；可能再拆成两个 | 原版玩法齐全 |
| 5 | 新版玩法：仙珍 / 天馔 / 泛紫、口味、鱼塘、肝帝、揽雾、摆烂 | 对齐线上最新版 |
| 6 | 运营：管理后台、兑换码、邀请、审核、统计 | 可以正式开服 |

每个子项目各自走"设计 → 计划 → 实现"。子项目 2 起的设计，在本文件架构的基础上细化到表和接口。

## 11. 子项目 1「骨架」范围

### 11.1 包含

**工程**
- pnpm workspace、TypeScript strict、ESLint + Prettier、Vitest；`packages/shared`、`packages/config`、`apps/server`、`apps/web` 四个包的骨架

**配置包**
- 读取 `analysis/dataset` 和 `designed` 下的全部数据：食材、道具、食谱（含所需食材、售价）、街道、特色菜、道、天气、设施位、星级、油壶、任务、活跃等
- zod 校验：id 唯一、引用的 id 都存在（例如食谱引用的食材、礼包引用的道具）
- 生成 `bundle.json` 和类型；提供按 id 查询、权重抽取

**公共包**
- 公式：`luckRate`、`levelUpExp`、加权抽取、`Rng`（种子版 + 安全随机版）
- 错误码表；auth、shard、restaurant 三组接口的 zod schema

**数据库**
- 迁移：account、shard、shard_config、restaurant、restaurant_tables、restaurant_cookbooks、effect_source、store_item、daily_counter、ledger（分区）、news（分区）、audit_log

**后端**
- Fastify 应用框架：统一响应和错误处理、zod 校验、pino 日志、`CF-Connecting-IP` 解析、CORS、Redis 令牌桶限流、Idempotency-Key、会话中间件、`withRestaurant` 事务助手、事件分发器、模块注册与功能开关
- account 模块：注册（Turnstile）、登录、登出、单点登录、发送验证邮件 / 验证、找回密码（邮件链接 + POST 新密码）、邀请码（可选）
- shard 模块：区服列表、选择区服、区服配置合并
- restaurant 模块：
  - 开店：名称规则按规格书 02.1
  - 初始值：等级 1、属性点 3、体力 100/100、油 1000/1000、银币 100,000、钻石 0、橱柜 100、仓库 20、单种上限 999、锁定格 15、声望 10、新手街、4 张桌子
    - 银币 100,000 是推断值：HAR 里的新号有 101,544 银币，已经做过几个新手任务
    - 以上初始值都放在配置里，不写死在代码中
  - 赠送：开张大吉 81、红内裤 100、新手街勋章 140，写入 effect_source 和 store_item
  - 发新闻"恭喜 xx 开张"
  - 查看餐厅概况
- effects 模块：加成来源的写入、按过期时间汇总、缓存失效
- worker：咨询锁选主、分区维护任务、心跳任务

**前端**
- 布局外壳（手机优先）、资源包机制、接口客户端、错误文案
- 页面：登录、注册、邮箱验证结果、找回密码、区服选择、开店、餐厅首页（只读：基础数值、桌子、生效的加成）

**部署**
- docker-compose（开发版含 mailpit，生产版含 cloudflared）、Dockerfile、GitHub Actions CI、备份脚本、部署说明文档

### 11.2 不包含
结算和所有玩法（子项目 2 起）、管理后台界面、WebSocket。

### 11.3 验收标准
1. `pnpm test` 全部通过：公式单测、配置校验、注册登录流程、并发锁测试
2. `docker compose up` 起全套服务；在浏览器里注册 → 在 Mailpit 里点验证链接 → 选区服 → 开店 → 看到初始值与 11.1 一致的餐厅
3. 同一账号在第二个区服开第二家店，两家店数据互不影响
4. 新登录使旧会话失效；未登录访问餐厅接口返回 `UNAUTHORIZED`
5. 同一个 Idempotency-Key 重复提交开店，只生效一次
6. 配置包构建时，如果数据里有错误引用，构建失败并指出是哪一条

## 12. 已定的取舍

- **定时结算，而不是惰性结算**：规则语义与原版一致，实现简单；靠修正数据结构来保证性能
- **不用 ORM**：用 Kysely，方便直接写行锁、JSONB 和分区相关的 SQL
- **会话令牌，而不是 JWT**：可以立即吊销，支持单点登录
- **事件在事务内同步处理**：先保证一致性；以后需要异步时再引入 outbox
- **第一版用轮询**：实时推送等有明确需求再加
