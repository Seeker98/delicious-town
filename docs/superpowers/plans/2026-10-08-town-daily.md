# 小镇日报 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每天给每个区服用 DeepSeek 写一份前一天的小镇日报（简中 + 英文，繁中用 OpenCC 转），人工审核后发布，小镇页和首页展示。

**Architecture:** 服务端新模块 `modules/daily`：素材（facts.ts，纯查询 + 纯函数）→ 写稿（infra/writer.ts 调 OpenAI 兼容接口，作为 AppDeps 注入）→ 检查（check.ts）→ 周期任务写 `town_daily` 表。玩家接口挂在 town 路由下，首页 headlines 带一个 daily 字段；后台接口挂在 admin 路由下。网页端加日报卡片、首页入口、后台页面。

**Tech Stack:** Fastify、Kysely、Postgres、Vitest；Vue 3、Pinia；opencc-js（服务端新增依赖）；DeepSeek `deepseek-flash`（OpenAI 兼容 `/chat/completions`）。

**Spec:** docs/superpowers/specs/2026-10-08-town-daily-design.md

## Global Constraints

- 服务端测试不用 vi.mock（isolate:false）；AI 用假写稿器注入。
- 不调用 `/api/v1/test/tick`；不改开发库数据（测试库随便）。
- 加迁移前先停开发服。
- 改了 packages/config 要 `pnpm -F @dt/config build`。
- 玩家看的简中用半角括号、“: ”“, ”；法文窄空格写 ` ` 转义，西语不换行空格写 ` `；Write 工具会解码 `\u`，用占位符再 node 替换。
- zh-TW 只用 `pnpm -F @dt/web i18n:tw` 生成，最后跑，不用 prettier 格式化。
- 提交只 `git add` 明确路径；不提交 问题记录.md、e2e/_*.cjs、shots/、.superpowers/。
- 提交结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 推送前 `pnpm lint`（列出所有报问题的文件，只许 e2e/_*.cjs）、`pnpm format:check`、分包 typecheck 看退出码。
- 功能 `daily` 默认关（DEFAULT_OFF_FEATURES）；`tuning.daily.autoPublish` 默认 false。
- AI 不碰数值、奖励；玩家自己写的文字（广播、论坛）不进 AI；店名、道具名在 AI 输入输出里只用记号 `{r:id}`、`{g:id}`。

## Review Focus

1. 店名里写提示注入：店名根本不进 AI（只给记号），测试断言素材 JSON 里没有店名字符串。
2. AI 输出编造记号或丢掉记号：`{r:999}` 不在素材里 → 失败；英文和简中记号集合不同 → 失败。
3. 周期任务在 worker 停机时被中止：中止信号传给 fetch，行停在 pending，下次重试从头生成（不重复计 token 之外的副作用）。
4. 同一天并发：任务和后台“重新生成”同时跑——写入用 `where status in (...)` 条件更新，已发布的不会被任务覆盖。
5. 玩家看已关店的店：记号换成“已关店”，不带链接。

---

### Task 1: 表、配置、开关、环境变量

**Files:**
- Create: `apps/server/src/db/migrations/0060_town_daily.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`
- Modify: `apps/server/src/env.ts`、`apps/server/src/env.test.ts`、`apps/server/package.json`（dev 脚本加 `--env-file-if-exists=.env.local`）
- Modify: `apps/server/src/core/features.ts`（IMPLEMENTED_FEATURES 加 `daily`）
- Modify: `packages/config/src/shard.ts`（DEFAULT_OFF_FEATURES = ['daily']）
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`、`packages/config/data/game/setting_docs.json`
- Test: `apps/server/src/db/migrations/0060.test.ts`（表存在、主键、status 检查约束）

**Interfaces — Produces:**
- 表 `town_daily(shard_id int, day text, status text check in ('pending','draft','published','hidden'), facts jsonb not null, content jsonb null, model text null, tokens_in int not null default 0, tokens_out int not null default 0, attempts int not null default 0, regenerations int not null default 0, error text null, generated_at timestamptz null, published_at timestamptz null, published_by int null references account(id), created_at timestamptz not null default now(), primary key (shard_id, day))`
- Kysely 类型 `TownDailyTable`、`DailyStatus = 'pending' | 'draft' | 'published' | 'hidden'`
- Env：`DAILY_AI_KEY: string (default '')`、`DAILY_AI_BASE_URL (default 'https://api.deepseek.com')`、`DAILY_AI_MODEL (default 'deepseek-flash')`
- Tuning：`tuning.daily = { autoPublish: boolean, runAfter: "HH:MM", maxEvents: int 5..60 }`，默认 `{ autoPublish: false, runAfter: "00:10", maxEvents: 30 }`

- [ ] Step 1: 停开发服（Windows 进程树），写 0060.test.ts：插一行 status='bogus' 报错，插两次同主键报错。
- [ ] Step 2: 跑测试，看到失败（表不存在）。
- [ ] Step 3: 写迁移、schema 类型、index 注册；env、features、DEFAULT_OFF_FEATURES、tuning schema + json + setting_docs（`features.daily`、`tuning.daily.*` 三条）。
- [ ] Step 4: `pnpm -F @dt/config build`，跑 0060.test、env.test、config 的 build.test 和 settingDocs.test，全过。
- [ ] Step 5: 提交 “feat: 小镇日报的表、开关和数值”。

### Task 2: 素材（facts）

**Files:**
- Create: `apps/server/src/modules/daily/facts.ts`、`apps/server/src/modules/daily/facts.test.ts`

**Interfaces — Produces:**
```ts
export interface DailyEvent { kind: string; text: string; newsId: number }
export interface DailyFacts {
  day: string;
  shopCount: number;
  summary: string[];
  topIncome: { rest: string; coin: number }[];
  events: DailyEvent[];
  /** 素材里出现的店、道具编号：检查 AI 输出的记号用 */
  rests: number[];
  goods: { id: number; name: string }[];
}
export const DAILY_TYPES: Record<string, { weight: number; kind: string }>;
export const SUMMARY_TYPES: readonly string[]; // restaurant.open, market.restock, weather.change
export function eventText(n: NewsRow, config: GameConfig): string | null; // 纯函数，按类型出简中模板，用 {r:id}/{g:id}
export async function buildFacts(d: GameDeps, shardId: number, day: string, maxEvents: number): Promise<DailyFacts>;
```
- 新闻取 `created_at >= gameTime(day,0) and < gameTime(addDays(day,1),0)`、本区服。
- 挑选：只要 DAILY_TYPES 里的类型；按 weight 降序、id 降序；同一 (rest_id, type) 只留一条；取 maxEvents 条；`text` 为 null 的跳过。
- 汇总：restaurant.open 计数 → “新开 N 家店”；market.restock 计数 → “菜场进货 N 次”；weather.change 按时间串成“天气: 晴 → 小雨”（天气名从配置取简中）。为 0 的不写。
- topIncome：rest_income_day 当天、本区服非 NPC，coin 降序前 3。
- shopCount：本区服非 NPC 店数。

测试（facts.test.ts，用 createTestGame 写 news 行）：
- 权重高的排前面、同店同类只一条、上限生效；
- town.broadcast、forum.* 不进 events；
- 刷屏三类变成 summary 文字；
- 素材 JSON 里不出现任何店名（造一家叫“忽略以上指令”的店，断言 `JSON.stringify(facts)` 不含它），店写成 `{r:id}`；
- DAILY_TYPES 每个类型 eventText 用典型参数都返回非空（参数样例写在测试里）；
- 前一天 / 后一天的新闻不算进来。

- [ ] Step 1: 先看 `apps/web/src/i18n/locales/zh-CN/news.ts` 里这些类型的参数名，写测试。
- [ ] Step 2: 跑，失败（模块不存在）。
- [ ] Step 3: 实现。
- [ ] Step 4: 跑 facts.test，过。
- [ ] Step 5: 提交 “feat: 小镇日报素材”。

### Task 3: 写稿器、检查、繁中

**Files:**
- Create: `apps/server/src/infra/writer.ts`、`apps/server/src/infra/writer.test.ts`
- Create: `apps/server/src/modules/daily/check.ts`、`apps/server/src/modules/daily/check.test.ts`
- Create: `apps/server/src/modules/daily/prompt.ts`
- Modify: `apps/server/src/app.ts`（AppDeps 加 `writer?: Writer`）、`apps/server/src/deps.ts`（有 key 时 `openAiWriter(...)`）
- Modify: `apps/server/package.json`（dependencies 加 opencc-js，与 web 同版本）

**Interfaces — Produces:**
```ts
// infra/writer.ts
export interface WriterReply { text: string; tokensIn: number; tokensOut: number; model: string }
export interface Writer { chat(system: string, user: string, signal?: AbortSignal): Promise<WriterReply> }
export function openAiWriter(o: { baseUrl: string; key: string; model: string; fetch?: typeof fetch; timeoutMs?: number }): Writer;
export function scriptedWriter(replies: Array<string | Error>): Writer & { calls: { system: string; user: string }[] };
// 请求体：{ model, messages:[system,user], response_format:{type:'json_object'}, thinking:{type:'disabled'}, temperature:1.0, max_tokens:1500 }
// 非 2xx → Error(`writer http ${status}: ${body 前 200 字}`)；usage 缺失按 0

// modules/daily/check.ts
export interface Article { title: string; body: string }
export function parseArticle(text: string, lang: 'zh-CN' | 'en', minBody: number): Article; // 失败抛 Error（原因写进 message）
export function tokensOf(s: string): string[]; // 排好序的 {r:..}/{g:..} 列表
export function checkArticle(a: Article, facts: DailyFacts): void; // 记号都在素材里、无网址、无 < >
export function sameTokens(zh: Article, en: Article): void;
export function toTw(a: Article): Article; // opencc cn→twp

// modules/daily/prompt.ts
export const WRITE_SYSTEM: string; export const TRANSLATE_SYSTEM: string;
export function writeUser(f: DailyFacts): string; // JSON，去掉 rests/goods 里的冗余，goods 名字放 "goods": {"10704":"探险图"}
export function translateUser(a: Article): string;
```
长度：zh title 1~24 字、body minBody~600 字（minBody：events ≥ 3 时 250，否则 80）；en title 1~90 字符、body 1~3000 字符。网址正则：`/https?:|www\.|\.(com|net|org|cn|io|xyz)\b/i`。

测试：
- writer.test：用假 fetch 断言请求体（模型、thinking disabled、json_object、Authorization 头）、解析 usage、非 2xx 抛错、中止信号传到 fetch。
- check.test：合法通过；JSON 坏、缺字段、超长、太短、`{r:999}`、网址、`<b>`、英文少一个记号都抛；toTw 把“简体中文日报”转成繁体且记号不变。

- [ ] Step 1: 写两个测试文件，跑，失败。
- [ ] Step 2: 实现 writer、check、prompt；pnpm 装 opencc-js 到 server。
- [ ] Step 3: 跑，过；server typecheck。
- [ ] Step 4: 提交 “feat: 小镇日报写稿器和检查”。

### Task 4: 生成和周期任务

**Files:**
- Create: `apps/server/src/modules/daily/generate.ts`、`apps/server/src/modules/daily/jobs.ts`、`apps/server/src/modules/daily/generate.test.ts`
- Modify: `apps/server/src/game.ts`（`jobs.push(...dailyJobs(deps, app.writer))`）

**Interfaces — Produces:**
```ts
export type DailyContent = Record<'zh-CN' | 'en' | 'zh-TW', Article>;
/** 生成一次：写 pending 行（已有就更新 facts），调两次 AI，成功写 content 和状态；返回结果。失败时记 error、累计 token 后抛错 */
export async function generateDaily(
  d: GameDeps, writer: Writer, shardId: number, day: string,
  o: { maxEvents: number; autoPublish: boolean; signal?: AbortSignal; force?: boolean },
): Promise<{ status: DailyStatus; tokensIn: number; tokensOut: number }>;
export function dailyJobs(d: GameDeps, writer: Writer | undefined): PeriodicJob[];
export const KEEP_DAYS = 60;
```
- 周期键：游戏时间过了 `tuning.daily.runAfter` 才返回 `gameDay(now)`，否则 null；生成的是 `addDays(today, -1)`；`retry: true`；feature `daily`。
- run：先删 `day < addDays(today, -KEEP_DAYS)` 的行；已有行且 status 不是 pending → `{ skipped: status }`；writer 为空 → 只建 pending 行（facts）返回 `{ noKey: true }`；否则 generateDaily。
- generateDaily 写结果时：`update ... where shard_id, day and status in ('pending')`（force=true 时允许 'pending','draft','hidden'，不覆盖 published）；`force` 时 regenerations + 1。新状态 = autoPublish ? 'published' : 'draft'（force 一律 'draft'）。

测试（generate.test.ts，scriptedWriter）：
- 草稿模式 → draft，content 三种语言齐，tokens 累计两次调用；
- autoPublish → published、published_at 有值；
- 第一次回复 JSON 坏 → 抛错，行 pending、error 有内容、attempts 1；再跑一次成功；
- 已是 draft 时任务跳过、不调用 writer；
- writer 为空 → pending + noKey；
- 60 天前的行被删；
- force 不覆盖 published（抛 INVALID_STATE 或返回原状态，选前者）。
- 周期键：00:05 返回 null、00:10 返回当天。

- [ ] Step 1: 写测试，跑，失败。
- [ ] Step 2: 实现，挂到 game.ts。
- [ ] Step 3: 跑 generate.test 和 worker 相关测试，过。
- [ ] Step 4: 提交 “feat: 小镇日报每日生成任务”。

### Task 5: 玩家接口和首页字段

**Files:**
- Create: `packages/shared/src/schemas/daily.ts`（导出到 index）
- Create: `apps/server/src/modules/daily/read.ts`、`apps/server/src/modules/daily/read.test.ts`
- Modify: `apps/server/src/modules/town/routes.ts`、`town/service.ts`（`daily(ctx, day?)`）
- Modify: `packages/shared/src/schemas/town.ts`（HeadlinesDto 加 `daily: DailyHeadDto | null`）、`apps/server/src/modules/news/news.ts`（headlines 读 daily）

**Interfaces — Produces:**
```ts
export const dailyQuery = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export type DailyLang = 'zh-CN' | 'en' | 'zh-TW';
export interface DailyDto {
  day: string;
  /** 最近 7 天里可以翻的日期（新的在前），含没发布的（显示今日要闻） */
  days: string[];
  article: Record<DailyLang, { title: string; body: string }> | null; // 已发布才有
  /** 没发布时的“今日要闻”：素材里排前 5 的新闻 */
  fallback: NewsDto[];
  /** 记号里的店：现在的名字；店不存在为 null */
  rests: Record<string, string | null>;
}
export interface DailyHeadDto { day: string; title: Record<DailyLang, string> }
```
- 不带 day：最近一个 published 的（7 天内），没有就昨天。day 不在最近 7 天（昨天往前数 7 天）→ 404。
- 功能关闭 → `ensureFeature` 的 404/错误，和别的功能一致。
- fallback：facts.events 前 5 个 newsId 用 listNews 同样的字段查出来（新闻 30 天内都在）。
- hidden 和 pending、draft 一样当没发布。
- headlines.daily：区服功能开了、昨天的行是 published 时才有。

测试：7 天范围、默认取最近发布的、未发布返回 fallback、关店为 null、功能关 404、headlines.daily 有无。

- [ ] Step 1: 写测试，跑，失败。
- [ ] Step 2: 实现。
- [ ] Step 3: 跑 read.test、news.test、restaurant 首页相关测试，过；shared、server typecheck。
- [ ] Step 4: 提交 “feat: 小镇日报玩家接口和首页头条字段”。

### Task 6: 后台接口

**Files:**
- Create: `apps/server/src/modules/daily/admin.ts`、`apps/server/src/modules/daily/admin.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`、`packages/shared/src/schemas/daily.ts`

**Interfaces — Produces:**
```ts
export interface AdminDailyRow { shardId: number; day: string; status: DailyStatus; title: string | null; tokensIn: number; tokensOut: number; attempts: number; regenerations: number; error: string | null; generatedAt: string | null; publishedAt: string | null }
export interface AdminDailyDetail extends AdminDailyRow { facts: unknown; content: Record<DailyLang, { title: string; body: string }> | null; rests: Record<string, string | null> }
export const adminDailyEditBody = z.object({ zh: z.object({ title: z.string(), body: z.string() }), en: z.object({ title: z.string(), body: z.string() }) });
```
路由（admin 权限，写审计 `daily.publish` / `daily.hide` / `daily.edit` / `daily.regenerate`）：
- `GET /daily?shardId=` 最近 30 天；
- `GET /daily/:shardId/:day`；
- `POST /daily/:shardId/:day/publish`（要有 content）、`/hide`；
- `POST /daily/:shardId/:day/edit`（parseArticle 同样的长度、checkArticle、sameTokens；繁中重新转换）；
- `POST /daily/:shardId/:day/regenerate`（没配 key → 错误；regenerations ≥ 10 → LIMIT；调 generateDaily force）。

测试：mod 角色 404、admin 可以；发布、撤下状态变化和审计；编辑时坏记号被拒；重新生成次数上限；没 key 报错。

- [ ] Step 1: 写测试，跑，失败。
- [ ] Step 2: 实现。
- [ ] Step 3: 跑 admin.test，过。
- [ ] Step 4: 提交 “feat: 小镇日报后台接口”。

### Task 7: 网页：日报卡片和首页入口

**Files:**
- Create: `apps/web/src/components/town/DailyCard.vue`、`DailyCard.test.ts`、`apps/web/src/utils/daily.ts`（把正文拆成段落和片段：文字 / 店 / 道具）、`daily.test.ts`
- Modify: `apps/web/src/components/town/NewsPanel.vue`（最上面放 DailyCard）、`HomeNews.vue`（第一行入口）、`apps/web/src/api/endpoints.ts`
- Modify: i18n `zh-CN/en/es/fr` 的 town 文案（`town.daily.*`：title、prev、next、fallbackTitle、englishOnly、closed、loadFailed）和 `nav.news.daily`；最后 `pnpm -F @dt/web i18n:tw`

显示规则：locale 为 zh-CN/en/zh-TW 用对应语言；es/fr 用 en 并显示 englishOnly 小字。`{r:id}` → RouterLink `/friends/:id`（名字取 rests；null 显示 closed 文案、不带链接）；`{g:id}` → `catalog.goodsName(id)`。

测试：片段拆分；有文章显示标题和正文、店名链接；未发布显示今日要闻；es 显示英文 + 小字；翻页调用带 day；首页有 daily 显示入口、没有不显示。

- [ ] Step 1: 写测试，跑，失败。
- [ ] Step 2: 实现。
- [ ] Step 3: 跑 web 相关测试、web typecheck，过。
- [ ] Step 4: 提交 “feat: 小镇日报卡片和首页入口”。

### Task 8: 网页：后台页面

**Files:**
- Create: `apps/web/src/views/admin/AdminDailyView.vue`、`AdminDailyView.test.ts`
- Modify: `apps/web/src/views/admin/AdminLayout.vue`（加“日报”）、`apps/web/src/router.ts`、`apps/web/src/api/endpoints.ts`

页面：区服下拉（admin store 的 shardId）→ 30 天列表（日期、状态、标题、token、错误）；点一行展开详情：素材 JSON（pre）、简中和英文的标题/正文文本框、预览（记号换店名）；按钮：保存、发布、撤下、重新生成。

测试：列表渲染；保存调用 edit；发布调用 publish；错误时 toast。

- [ ] Step 1: 写测试，跑，失败。
- [ ] Step 2: 实现。
- [ ] Step 3: 跑，过。
- [ ] Step 4: 提交 “feat: 小镇日报后台页面”。

### Task 9: 收尾

- 更新记录 `town-daily`（zh-CN、en、es、fr 手写，zh-TW 生成）：小镇日报上线，每天早上看昨天小镇发生了什么。
- 本地开发库：给开发区服打开 `daily` 功能前先问用户（改开发库数据）；有 key 时手动跑一次生成看效果。
- 全量测试、lint、format:check、分包 typecheck；Opus 审查整个分支；修 Critical/Important；minor 写进 docs/backlog.md 和 PR 描述。
- 推送、开 PR。
