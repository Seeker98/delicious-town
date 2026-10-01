# 子项目 6B-1：举报和处理、封号期限、问题记录 164~170 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能举报五种内容，协管在后台按案子处理（删内容、清公告、改名、封号）或驳回，结果用邮件通知；封号有期限；顺带修 164~170。

**Architecture:**
- **数据**：迁移 0019 建 `report_case`（一个被举报内容一个待处理的案子，部分唯一索引）、`report_entry`（举报人），给 `account` 加 `banned_until`。
- **玩家举报**：`runOp(feature 'report')`。
- **后台处理**：在被举报的店上 `runSystemOp`，同事务写审计、发邮件。
- **是否在封号中**：统一用 `isBanned(row, now)` 判断。

**Tech Stack:** Fastify 5、Kysely/PostgreSQL、Zod、Vue 3 + Pinia + Bootstrap 5、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject6b-moderation-design.md`（下文"设计"），§3、§4、§8、§9、§10 的 6B-1 部分。

## Global Constraints

- 写操作一律 POST；玩家写操作走 `runOp(d, ctx, { feature, source }, fn)`；后台处理函数第一步 `requireRole`，审计 `writeAudit` 和业务在同一事务。
- 权限矩阵测试 `apps/server/src/modules/admin/permissions.test.ts` 必须列出每个后台路由，新路由加进去，`unban` 改成 admin。
- 发邮件用 `sendMail(db, NewMail)`（`modules/mail/send.ts`），`source = 'report'`，单店，没有附件。
- 举报理由：`abuse` 辱骂、`porn` 色情、`ad` 广告、`politics` 政治、`other` 其他；补充说明 0~100 字（按字符计，`charLen`）。
- 内容类型：`post` / `reply` / `broadcast` / `rest_name` / `notice`；中文名依次为：帖子、回复、喇叭、店名、店铺公告。
- 协管封号只能 1 天或 7 天；`days = 0` 是永久，只有管理员能用；解封只有管理员能用。
- 每日上限 `tuning.report.dailyMax`（默认 10），按账号、按游戏日计（`gameTime(gameDay(now), 0)` 起算）。
- 新功能开关 `report`（默认开），加入 `IMPLEMENTED_FEATURES`。
- 不改开发库数据；e2e 只动自己注册的账号。
- 文案中文。每个任务跑自己的测试；计划结束跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter @dt/web e2e`。

## Review Focus

1. 两个人几乎同时举报同一条从没被举报过的内容：只能开一个案子，两人都挂在上面，`reporter_count = 2`。（Task 3 测试）
2. 协管处理时内容已被作者删掉或改掉：案子照样能结案（action 记 `none`），封号照样生效，不报 500。（Task 5 测试）
3. 1 天的封号到期后：能登录，后台也不再显示"封号中"；永久封号一直不能登录。（Task 4 测试）
4. 协管通过请求体传 `banDays: 0` 想永封、或调 `unban`：都返回 403，数据不变。（Task 4、5 测试）
5. 驳回后同一内容没改过又被举报：不开新案，只记数；内容改过才开新案。（Task 3 测试）

---

## 文件结构

**新建**
- 服务端：
  - `apps/server/src/db/migrations/0019_reports.ts`、`0019.test.ts`
  - `apps/server/src/modules/report/{targets,report,admin,service,routes}.ts`
  - 测试：`report.test.ts`、`admin.test.ts`
  - `apps/server/src/modules/admin/ban.ts`（`isBanned`）
- 共享：`packages/shared/src/schemas/report.ts`
- 前端：
  - 组件：`components/ReportButton.vue`
  - 页面：`views/admin/AdminReportsView.vue`、`views/RedeemView.vue`
  - 各自的测试
- e2e：`apps/web/e2e/report.spec.ts`
- 文档：`docs/rules/举报和处罚.md`

**修改**
- 服务端：`db/schema.ts`、`db/migrations/index.ts`、`core/features.ts`、`game.ts`、`modules/index.ts`、`modules/admin/{players,access,routes,permissions.test}.ts`、`modules/account/service.ts`
- 配置：`packages/config/src/tuning.ts`、`build.test.ts`、`data/game/tuning.json`
- 共享：`packages/shared/src/index.ts`、`schemas/admin.ts`
- 前端：
  - 页面：`views/ForumPostView.vue`、`components/town/NewsPanel.vue`、`views/FriendRestView.vue`、`views/admin/AdminPlayerView.vue`、`views/admin/AdminLayout.vue`、`views/InviteView.vue`、`views/FriendsView.vue`、`views/RestaurantHomeView.vue`、`components/MoreLinks.vue`
  - 其他：`router.ts`、`api/endpoints.ts`、`api/admin.ts`、`i18n/zh-CN.ts`

---

### Task 1：迁移 0019、配置和共享类型

**Files:**
- Create: `apps/server/src/db/migrations/0019_reports.ts`, `apps/server/src/db/migrations/0019.test.ts`, `packages/shared/src/schemas/report.ts`
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/db/migrations/index.ts`, `apps/server/src/core/features.ts`, `packages/config/src/tuning.ts`, `packages/config/data/game/tuning.json`, `packages/config/src/build.test.ts`, `packages/shared/src/index.ts`, `packages/shared/src/schemas/admin.ts`, `packages/shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Produces（DB）：表 `report_case`、`report_entry`（列见设计 §3.1），`account.banned_until`。
- Produces（`@dt/shared`）：
  - `REPORT_TARGETS = ['post','reply','broadcast','rest_name','notice'] as const`，`ReportTarget`；`REPORT_TARGET_NAMES: Record<ReportTarget,string>`。
  - `REPORT_REASONS = ['abuse','porn','ad','politics','other'] as const`，`ReportReason`；`REPORT_REASON_NAMES`。
  - `reportBody = { targetType, targetId (int>0), reason, detail?: limitedText(100) }`。
  - `resolveReportBody = { note: 1~200 字, banDays?: 0|1|7, newName?: string ≤32 }`；`rejectReportBody = { note }`。
  - `reportListQuery = { shardId?: int, status?: 'open'|'resolved'|'rejected' }`。
  - `ReportCaseDto`，字段：`id`、`shardId`、`targetType`、`targetId`、`targetRestId`、`targetRestName`、`targetAccountId`、`targetUsername`、`snapshot`、`status`、`reporterCount`、`createdAt`、`updatedAt`、`handledBy`、`handledAt`、`action`、`banDays`、`note`。
  - `ReportDetailDto = ReportCaseDto & { current: string | null; entries: Array<{ restName; reason; detail; createdAt }>; priorCases: number }`。
  - `banBody = { reason: 1~200 字, days?: 0|1|7 }`（替换现有封号用的 `reasonBody`）。
  - `PlayerDetailDto` 加 `bannedUntil: string | null`；`PlayerBriefDto.banned` 改为按 `isBanned` 算。
- Produces（配置）：`tuning.report: { dailyMax: number }`（默认 10）；功能开关 `report`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/db/migrations/0019.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let rest: number;
let account: number;
beforeAll(async () => {
  shard = await createShard(db);
  account = await createAccountRow(db);
  rest = await createRestaurantRow(db, shard, account);
});

const newCase = (patch: Record<string, unknown> = {}) =>
  db
    .insertInto('report_case')
    .values({
      shard_id: shard,
      target_type: 'notice',
      target_id: rest,
      target_rest_id: rest,
      target_account_id: account,
      snapshot: '广告',
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

describe('迁移 0019', () => {
  it('同一内容只有一个待处理的案子；结案后可以再开', async () => {
    const a = await newCase({ target_id: rest + 100000 });
    await expect(newCase({ target_id: rest + 100000 })).rejects.toThrow();
    await db.updateTable('report_case').set({ status: 'rejected' }).where('id', '=', a.id).execute();
    expect((await newCase({ target_id: rest + 100000 })).id).toBeGreaterThan(a.id);
  });

  it('同一个人对同一案子只有一条举报；类型、理由、状态受约束', async () => {
    const c = await newCase({ target_id: rest + 200000 });
    const entry = { case_id: c.id, reporter_account_id: account, reporter_rest_id: rest, reason: 'ad' };
    await db.insertInto('report_entry').values(entry).execute();
    await expect(db.insertInto('report_entry').values(entry).execute()).rejects.toThrow();
    await expect(newCase({ target_type: 'x', target_id: rest + 300000 })).rejects.toThrow();
    await expect(
      db.insertInto('report_entry').values({ ...entry, reporter_account_id: account + 1, reason: 'x' }).execute(),
    ).rejects.toThrow();
  });

  it('账号有封号期限列', async () => {
    const until = new Date(Date.now() + 86_400_000);
    await db.updateTable('account').set({ banned_until: until }).where('id', '=', account).execute();
    const r = await db.selectFrom('account').select('banned_until').where('id', '=', account).executeTakeFirstOrThrow();
    expect(r.banned_until?.getTime()).toBe(until.getTime());
  });
});
```

`schemas.test.ts` 追加：

```ts
describe('举报（子项目 6B-1）', () => {
  it('举报：类型、理由在范围内，说明不超过 100 字', () => {
    expect(reportBody.parse({ targetType: 'notice', targetId: 3, reason: 'ad' })).toEqual({
      targetType: 'notice',
      targetId: 3,
      reason: 'ad',
    });
    expect(reportBody.safeParse({ targetType: 'x', targetId: 3, reason: 'ad' }).success).toBe(false);
    expect(reportBody.safeParse({ targetType: 'post', targetId: 3, reason: 'ad', detail: '字'.repeat(101) }).success).toBe(
      false,
    );
  });
  it('处理：说明必填；封号天数只能 0/1/7', () => {
    expect(resolveReportBody.safeParse({ note: '' }).success).toBe(false);
    expect(resolveReportBody.safeParse({ note: '辱骂', banDays: 3 }).success).toBe(false);
    expect(resolveReportBody.parse({ note: '辱骂', banDays: 7 }).banDays).toBe(7);
    expect(banBody.parse({ reason: '刷号' }).days).toBeUndefined();
  });
});
```

`build.test.ts` 追加：

```ts
describe('举报数值（子项目 6B-1）', () => {
  it('每天最多举报 10 次', () => {
    expect(buildBundle(source()).bundle!.tuning.report).toEqual({ dailyMax: 10 });
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/db/migrations/0019.test.ts packages/shared/src/schemas/schemas.test.ts packages/config/src/build.test.ts`
Expected: FAIL（表不存在、导出不存在、`tuning.report` 未定义）。

- [ ] **Step 3：实现**

```ts
// apps/server/src/db/migrations/0019_reports.ts
import { sql, type Kysely } from 'kysely';

/** 子项目 6B-1：举报（按被举报的内容建案）、封号期限（设计 §3.1、§4） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table report_case (
    id serial primary key,
    shard_id integer not null references shard(id) on delete cascade,
    target_type text not null check (target_type in ('post', 'reply', 'broadcast', 'rest_name', 'notice')),
    target_id integer not null,
    target_rest_id integer not null references restaurant(id) on delete cascade,
    target_account_id integer not null references account(id) on delete cascade,
    snapshot text not null,
    status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
    reporter_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    handled_by integer references account(id),
    handled_at timestamptz,
    action text,
    ban_days integer,
    note text
  )`.execute(db);
  await sql`create unique index report_case_open on report_case (target_type, target_id) where status = 'open'`.execute(db);
  await sql`create index report_case_list on report_case (shard_id, status, updated_at desc)`.execute(db);
  await sql`create table report_entry (
    id serial primary key,
    case_id integer not null references report_case(id) on delete cascade,
    reporter_account_id integer not null references account(id) on delete cascade,
    reporter_rest_id integer not null references restaurant(id) on delete cascade,
    reason text not null check (reason in ('abuse', 'porn', 'ad', 'politics', 'other')),
    detail text not null default '',
    created_at timestamptz not null default now(),
    unique (case_id, reporter_account_id)
  )`.execute(db);
  await sql`create index report_entry_reporter on report_entry (reporter_account_id, created_at)`.execute(db);
  await sql`alter table account add column banned_until timestamptz`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table account drop column banned_until`.execute(db);
  await sql`drop table report_entry`.execute(db);
  await sql`drop table report_case`.execute(db);
}
```

注册到 `migrations/index.ts`（`'0019_reports': m0019`）。`schema.ts` 加：

```ts
export interface ReportCaseTable {
  id: Generated<number>;
  shard_id: number;
  target_type: 'post' | 'reply' | 'broadcast' | 'rest_name' | 'notice';
  target_id: number;
  target_rest_id: number;
  target_account_id: number;
  snapshot: string;
  status: Default<'open' | 'resolved' | 'rejected'>;
  reporter_count: Default<number>;
  created_at: TsDefault;
  updated_at: TsDefault;
  handled_by: Nullable<number>;
  handled_at: TsNullable;
  action: Nullable<string>;
  ban_days: Nullable<number>;
  note: Nullable<string>;
}
export interface ReportEntryTable {
  id: Generated<number>;
  case_id: number;
  reporter_account_id: number;
  reporter_rest_id: number;
  reason: 'abuse' | 'porn' | 'ad' | 'politics' | 'other';
  detail: Default<string>;
  created_at: TsDefault;
}
```

（`DB` 加 `report_case`、`report_entry`；`AccountTable` 加 `banned_until: TsNullable`。）

```ts
// packages/shared/src/schemas/report.ts
import { z } from 'zod';
import { limitedText } from './mail';

export const REPORT_TARGETS = ['post', 'reply', 'broadcast', 'rest_name', 'notice'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const REPORT_TARGET_NAMES: Record<ReportTarget, string> = {
  post: '帖子',
  reply: '回复',
  broadcast: '喇叭',
  rest_name: '店名',
  notice: '店铺公告',
};
export const REPORT_REASONS = ['abuse', 'porn', 'ad', 'politics', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_NAMES: Record<ReportReason, string> = {
  abuse: '辱骂',
  porn: '色情',
  ad: '广告',
  politics: '政治',
  other: '其他',
};

export const reportBody = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
  detail: limitedText(100).optional(),
});
export type ReportInput = z.infer<typeof reportBody>;

const banDays = z.union([z.literal(0), z.literal(1), z.literal(7)]);
export const resolveReportBody = z.object({
  note: z.string().trim().min(1).max(200),
  banDays: banDays.optional(),
  newName: z.string().trim().min(1).max(32).optional(),
});
export const rejectReportBody = z.object({ note: z.string().trim().min(1).max(200) });
export const reportListQuery = z.object({
  shardId: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'resolved', 'rejected']).optional(),
});
export const banBody = z.object({ reason: z.string().trim().min(1).max(200), days: banDays.optional() });

export type ReportStatus = 'open' | 'resolved' | 'rejected';
export interface ReportCaseDto {
  id: number;
  shardId: number;
  targetType: ReportTarget;
  targetId: number;
  targetRestId: number;
  targetRestName: string;
  targetAccountId: number;
  targetUsername: string;
  snapshot: string;
  status: ReportStatus;
  reporterCount: number;
  createdAt: string;
  updatedAt: string;
  handledBy: string | null;
  handledAt: string | null;
  action: string | null;
  banDays: number | null;
  note: string | null;
}
export interface ReportDetailDto extends ReportCaseDto {
  /** 现在的内容；已删除为 null */
  current: string | null;
  entries: Array<{ restName: string; reason: ReportReason; detail: string; createdAt: string }>;
  /** 这个账号以前被处理过几次 */
  priorCases: number;
}
```

（`limitedText` 若签名不是 `(max) => schema`，以 `mail.ts` 里的定义为准。）

`index.ts` 加 `export * from './schemas/report';`。`admin.ts` 的 `PlayerDetailDto` 加 `bannedUntil: string | null;`。

`tuning.ts` 加 `report: z.object({ dailyMax: int.min(1) }),`；`tuning.json` 加 `"report": { "dailyMax": 10 },`；`features.ts` 的 `IMPLEMENTED_FEATURES` 加 `'report'`。

- [ ] **Step 4：运行，确认通过**

Run: `pnpm --filter @dt/server migrate:dev` 不要跑（不改开发库）；测试库由测试自己迁移。`npx vitest run apps/server/src/db packages/shared packages/config && pnpm --filter @dt/config build && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/db apps/server/src/core/features.ts packages
git commit -m "feat(report): 迁移 0019 举报表和封号期限；举报的类型、校验、数值"
```

---

### Task 2：举报对象——读取内容、作者、快照

**Files:**
- Create: `apps/server/src/modules/report/targets.ts`, `apps/server/src/modules/report/targets.test.ts`

**Interfaces:**
- Produces：

```ts
export interface ReportTargetInfo {
  shardId: number;
  restId: number;      // 被举报的店
  accountId: number;   // 店主账号
  text: string;        // 当前内容（帖子 = 标题\n正文），截断到 2000 字
}
/** 内容不存在、已删除、或不在这个区服时返回 null；公告为空时 text 为 '' */
export async function loadTarget(db: Kysely<DB>, type: ReportTarget, id: number): Promise<ReportTargetInfo | null>;
```

- 各类型的取法：
  - `post`：`forum_post`，`deleted_at is null`。
  - `reply`：`forum_reply`，回复和所属帖子都没删除，`shardId` 取帖子的。
  - `broadcast`：`news`，`type = 'town.broadcast'`，`rest_id` 不为空，`text = params.text`。
  - `rest_name`：`restaurant` 的 `name`。
  - `notice`：`restaurant` 的 `notice`。
- `rest_name` 和 `notice` 要求不是 NPC 店。所有类型都关联 `restaurant` 取 `account_id`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/report/targets.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { loadTarget } from './targets';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('举报对象（设计 §3.2）', () => {
  it('五种内容：取到店、店主和当前文字；删除的、不存在的为 null', async () => {
    const r = await newRestaurant(t, { patch: { notice: '招人' } });
    const post = await t.db
      .insertInto('forum_post')
      .values({ shard_id: r.shardId, rest_id: r.restaurantId, category: 'chat', title: '标题', content: '正文', created_at: new Date() })
      .returning('id')
      .executeTakeFirstOrThrow();
    const reply = await t.db
      .insertInto('forum_reply')
      .values({ post_id: post.id, rest_id: r.restaurantId, floor: 1, content: '回复内容', created_at: new Date() })
      .returning('id')
      .executeTakeFirstOrThrow();
    const news = await t.db
      .insertInto('news')
      .values({ shard_id: r.shardId, type: 'town.broadcast', rest_id: r.restaurantId, params: JSON.stringify({ text: '大家好' }) })
      .returning('id')
      .executeTakeFirstOrThrow();
    const who = { shardId: r.shardId, restId: r.restaurantId, accountId: r.accountId };
    expect(await loadTarget(t.db, 'post', post.id)).toEqual({ ...who, text: '标题\n正文' });
    expect(await loadTarget(t.db, 'reply', reply.id)).toEqual({ ...who, text: '回复内容' });
    expect(await loadTarget(t.db, 'broadcast', news.id)).toEqual({ ...who, text: '大家好' });
    expect(await loadTarget(t.db, 'notice', r.restaurantId)).toEqual({ ...who, text: '招人' });
    expect((await loadTarget(t.db, 'rest_name', r.restaurantId))!.text.length).toBeGreaterThan(0);
    await t.db.updateTable('forum_post').set({ deleted_at: new Date() }).where('id', '=', post.id).execute();
    expect(await loadTarget(t.db, 'post', post.id)).toBeNull();
    expect(await loadTarget(t.db, 'reply', reply.id)).toBeNull();
    expect(await loadTarget(t.db, 'broadcast', 99999999)).toBeNull();
  });
});
```

（`forum_post`、`news` 的必填列以 `schema.ts` 为准，缺的照写；`newRestaurant` 的 `patch` 支持 `notice`。）

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/report/targets.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现** `targets.ts`，按 Interfaces 写五个分支，每个一条查询：用 `innerJoin('restaurant as r', ...)` 取 `r.account_id`，结果截断到 2000 字。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/report/targets.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/report
git commit -m "feat(report): 读取被举报的内容、作者和快照"
```

---

### Task 3：玩家举报

**Files:**
- Create: `apps/server/src/modules/report/report.ts`, `service.ts`, `routes.ts`, `report.test.ts`
- Modify: `apps/server/src/game.ts`, `apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes：`loadTarget`（Task 2）；`reportBody`、`ReportInput`（Task 1）；`tuning.report.dailyMax`。
- Produces：`createReportService(d)` 的 `report(ctx, input): Promise<OpResult<{ ok: true }>>`；`Game.report`；路由 `POST /report`。

**规则**（设计 §3.2）：在 `runOp(d, ctx, { feature: 'report', source: 'report' })` 里依次做：
1. `loadTarget(o.tx, type, id)`。为 null 报 `NOT_FOUND`（`notFound('report_target', id)`）；`shardId` 不是本区服也报 `NOT_FOUND`；类型是 `notice` 并且 `text` 为空，报 `report_empty`。
2. `restId === o.rest.id` 或 `accountId === ctx.accountId`，报 `report_self`。
3. 今天（`gameTime(gameDay(o.now), 0)` 之后）本账号已有的 `report_entry` 条数 ≥ `dailyMax`，报 `report_daily`。
4. 找待处理的案子：`select … where target_type and target_id and status = 'open' for update`。
5. 没有待处理的案子时：
   - 取这条内容最近一次 `rejected` 的案子。快照等于当前文字，就复用这个案子，只插举报、加计数，不改状态。
   - 否则插入新案子：`insert … on conflict do nothing returning id`，用部分唯一索引作冲突目标，写法用 `sql`：`on conflict (target_type, target_id) where status = 'open' do nothing`。没返回 id 时（并发），再按第 4 步查一次。
6. 插入 `report_entry`：`on conflict (case_id, reporter_account_id) do nothing returning id`；没返回 id 时报 `report_dup`。
7. 案子 `reporter_count + 1`，`updated_at = now()`。
8. 返回 `{ ok: true }`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/report/report.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const report = (ctx: Parameters<TestGame['game']['report']['report']>[0], b: Record<string, unknown>) =>
  t.game.report.report(ctx, { reason: 'ad', ...b } as never);
const caseOf = (type: string, id: number) =>
  t.db
    .selectFrom('report_case')
    .selectAll()
    .where('target_type', '=', type as 'notice')
    .where('target_id', '=', id)
    .orderBy('id', 'desc')
    .execute();

describe('玩家举报（设计 §3.2）', () => {
  it('举报公告：开案并存快照；另一个人举报挂在同一案子；同一人重复报 report_dup', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '加我微信' } });
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    await report(a, { targetType: 'notice', targetId: bad.restaurantId, detail: '广告' });
    await report(b, { targetType: 'notice', targetId: bad.restaurantId });
    await expect(report(a, { targetType: 'notice', targetId: bad.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_dup' },
    });
    const [c] = await caseOf('notice', bad.restaurantId);
    expect(c).toMatchObject({ status: 'open', reporter_count: 2, snapshot: '加我微信', target_account_id: bad.accountId });
  });

  it('不能举报自己；空公告报 report_empty；不存在报 NOT_FOUND；别的区服的内容报 NOT_FOUND', async () => {
    const me = await newRestaurant(t, { patch: { notice: '我的公告' } });
    const empty = await newRestaurant(t, { shardId: me.shardId, patch: { notice: '' } });
    const far = await newRestaurant(t, { patch: { notice: '别区' } });
    await expect(report(me, { targetType: 'notice', targetId: me.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_self' },
    });
    await expect(report(me, { targetType: 'notice', targetId: empty.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_empty' },
    });
    await expect(report(me, { targetType: 'post', targetId: 99999999 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(report(me, { targetType: 'notice', targetId: far.restaurantId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('每天最多 10 次', async () => {
    const me = await newRestaurant(t);
    for (let i = 0; i < 10; i++) {
      const x = await newRestaurant(t, { shardId: me.shardId });
      await report(me, { targetType: 'rest_name', targetId: x.restaurantId });
    }
    const x = await newRestaurant(t, { shardId: me.shardId });
    await expect(report(me, { targetType: 'rest_name', targetId: x.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_daily' },
    });
  });

  it('并发：两人同时举报同一条没被举报过的内容，只开一个案子（Review Focus 1）', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '刷单' } });
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    await Promise.all([
      report(a, { targetType: 'notice', targetId: bad.restaurantId }),
      report(b, { targetType: 'notice', targetId: bad.restaurantId }),
    ]);
    const cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.reporter_count).toBe(2);
  });

  it('驳回后内容没改：只记数不开新案；内容改了：开新案（Review Focus 5）', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '正常内容' } });
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    const c = await newRestaurant(t, { shardId: bad.shardId });
    await report(a, { targetType: 'notice', targetId: bad.restaurantId });
    await t.db.updateTable('report_case').set({ status: 'rejected' }).where('target_id', '=', bad.restaurantId).execute();
    await report(b, { targetType: 'notice', targetId: bad.restaurantId });
    let cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ status: 'rejected', reporter_count: 2 });
    await t.db.updateTable('restaurant').set({ notice: '改成广告了' }).where('id', '=', bad.restaurantId).execute();
    await report(c, { targetType: 'notice', targetId: bad.restaurantId });
    cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ status: 'open', snapshot: '改成广告了', reporter_count: 1 });
  });

  it('关掉 report 开关时 FEATURE_DISABLED', async () => {
    const bad = await newRestaurant(t, { patch: { notice: 'x' } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: bad.shardId, override: JSON.stringify({ features: { report: false } }) })
      .execute();
    t.game.shards.invalidate(bad.shardId);
    const a = await newRestaurant(t, { shardId: bad.shardId });
    await expect(report(a, { targetType: 'notice', targetId: bad.restaurantId })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/report/report.test.ts`
Expected: FAIL（`t.game.report` 不存在）。

- [ ] **Step 3：实现**：按"规则"写 `report.ts` 的 `reportOp(o: Op, ctx: RestCtx, b: ReportInput)`；`service.ts` 用 `runOp` 包一层；`routes.ts` 是 `r.post('/report', async (req) => okOp(await svc.report(restCtxOf(req), parse(reportBody, req.body))))`；然后注册到 `game.ts` 和 `modules/index.ts`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/report && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src
git commit -m "feat(report): 玩家举报——按内容建案、去重、每日上限、驳回后不重复开案"
```

---

### Task 4：封号期限

**Files:**
- Create: `apps/server/src/modules/admin/ban.ts`, `apps/server/src/modules/admin/ban.test.ts`
- Modify: `apps/server/src/modules/admin/players.ts`, `apps/server/src/modules/admin/access.ts`, `apps/server/src/modules/admin/routes.ts`, `apps/server/src/modules/admin/permissions.test.ts`, `apps/server/src/modules/account/service.ts`, `packages/shared/src/schemas/admin.ts`

**Interfaces:**
- Produces：
  - `isBanned(row: { banned_at: Date | null; banned_until: Date | null }, now: Date): boolean`。
  - `banUntil(days: number | undefined, now: Date): Date | null`：0 或不填返回 null（永久），否则返回 `now + days` 天。
  - `players.ban(actor, accountId, reason, days?)`：协管只能 1/7，否则 403 `FORBIDDEN { reason: 'ban_days' }`。
  - `players.unban` 的路由改为 admin。
  - `PlayerDetailDto.bannedUntil`；`banned` 用 `isBanned` 算。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/admin/ban.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { isBanned } from './ban';

describe('isBanned（设计 §4）', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('没封、永久、未到期、已到期', () => {
    expect(isBanned({ banned_at: null, banned_until: null }, now)).toBe(false);
    expect(isBanned({ banned_at: now, banned_until: null }, now)).toBe(true);
    expect(isBanned({ banned_at: now, banned_until: new Date(now.getTime() + 1000) }, now)).toBe(true);
    expect(isBanned({ banned_at: now, banned_until: new Date(now.getTime() - 1000) }, now)).toBe(false);
  });
});

describe('封号期限（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());

  it('协管封 1 天：不能登录；到期后能登录（Review Focus 3）', async () => {
    const p = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/ban`, {
      cookie: mod.cookie,
      body: { reason: '刷屏', days: 1 },
    });
    expect(r.status).toBe(200);
    const login = () => call(ctx.app, 'POST', '/api/v1/auth/login', { body: { username: p.username, password: p.password } });
    expect((await login()).json.code).toBe('ACCOUNT_BANNED');
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_until: new Date(Date.now() - 1000) })
      .where('id', '=', p.accountId)
      .execute();
    expect((await login()).status).toBe(200);
    const d = await call(ctx.app, 'GET', `/api/v1/admin/players/${p.accountId}`, { cookie: mod.cookie });
    expect(d.json.data.banned).toBe(false);
  });

  it('协管不能永封、不能解封；管理员能（Review Focus 4）', async () => {
    const p = await registerUser(ctx.app);
    const ban = (cookie: string, body: unknown) =>
      call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/ban`, { cookie, body });
    expect((await ban(mod.cookie, { reason: 'x', days: 0 })).status).toBe(403);
    expect((await ban(mod.cookie, { reason: 'x' })).status).toBe(403);
    expect((await ban(admin.cookie, { reason: 'x', days: 0 })).status).toBe(200);
    const row = await ctx.deps.db.selectFrom('account').select('banned_until').where('id', '=', p.accountId).executeTakeFirstOrThrow();
    expect(row.banned_until).toBeNull();
    expect((await call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/unban`, { cookie: mod.cookie })).status).toBe(404);
    expect((await call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/unban`, { cookie: admin.cookie })).status).toBe(200);
  });
});
```

（登录路由、`registerUser` 返回的字段以 `test/helpers.ts` 为准；`requireRole` 权限不够时返回 404，所以协管解封期望 404。）

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/admin/ban.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**
- `ban.ts`：实现 `isBanned`、`banUntil`。
- `account/service.ts` 的 `login`：多读 `banned_until`，判断用 `isBanned(account, d.now())`。
- `admin/access.ts` 的 `requireRole`：同样改用 `isBanned`。
- `players.ts`：
  - `ban` 加 `days` 参数：
    - 协管（`actor.role === 'mod'`）的 `days` 不是 1 或 7 时，报 `FORBIDDEN { reason: 'ban_days' }`。
    - 写 `banned_until: banUntil(days, now)`；审计 detail 带 `days`。
  - `unban` 同时清 `banned_until`。
  - 详情 DTO 加 `bannedUntil`，`banned` 用 `isBanned`。
  - 列表（`PlayerBriefDto.banned`）同样改用 `isBanned`。
- `routes.ts`：`ban` 改用 `banBody`；`unban` 改成 `requireRole(db, req, 'admin')`。
- `permissions.test.ts`：`POST /api/v1/admin/players/:id/unban` 的 `min` 改为 `'admin'`；`ban` 的 body 加 `days: 1`，这样协管调用能成功。
- 全仓 `grep -rn "banned_at" apps/server/src` 逐处检查，凡是判断"是否在封号中"的都改用 `isBanned`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/admin apps/server/src/modules/account && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src packages/shared
git commit -m "feat(admin): 封号有期限——协管 1/7 天，永封和解封只有管理员；到期自动视为解封"
```

---

### Task 5：后台举报处理

**Files:**
- Create: `apps/server/src/modules/report/admin.ts`, `apps/server/src/modules/report/admin.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`, `apps/server/src/modules/admin/permissions.test.ts`

**Interfaces:**
- Consumes：`loadTarget`（Task 2）；`banUntil`、`players.ban` 的规则（Task 4）；`sendMail`；`resolveReportBody`、`rejectReportBody`、`reportListQuery`、DTO（Task 1）；`renameProblem`（后台改名用的那个，在 `admin/players.ts` 的 import 里）。
- Produces（`/api/v1/admin`）：
  - `GET /reports?shardId=&status=`（mod）：最多 100 条。待处理的按 `reporter_count desc, updated_at desc` 排，其他按 `handled_at desc` 排。
  - `GET /reports/:id`（mod）：`ReportDetailDto`。
  - `POST /reports/:id/resolve`（mod）。
  - `POST /reports/:id/reject`（mod）。
  - 审计动作：`report.resolve`、`report.reject`。

**处理**（`resolve`，设计 §3.3）：
1. 读案子；不是 `open` 报 `report_closed`；`banDays` 是 0 并且 actor 不是 admin，报 403 `FORBIDDEN { reason: 'ban_days' }`。
2. 在 `runSystemOp(game.deps, c.shard_id, c.target_rest_id, { source: 'report.resolve' }, async (o) => …)` 里：
   - 用 `loadTarget(o.tx, type, id)` 取当前内容。内容还在、并且 `restId` 还是同一家店时，按类型操作：

     | 类型 | 操作 | action |
     |---|---|---|
     | `post` | `update forum_post set deleted_at = o.now`，再调 `syncPostNews(o, id, null)` | `delete` |
     | `reply` | `update forum_reply set deleted_at = o.now` | `delete` |
     | `broadcast` | `delete from news where id = …` | `delete` |
     | `notice` | `update restaurant set notice = ''` | `clear` |
     | `rest_name` | `newName ?? '餐厅' + restId`，用 `renameProblem` 校验（不合法报 400 `RESTAURANT_NAME_INVALID`），撞名报 409；写个人日志 `admin.rename { from, to, reason: note }`；`op.rest.name = name` | `rename` |

   - 内容已经不在了：`action = 'none'`，不做内容操作。
   - 更新案子：`status 'resolved'`、`handled_by`、`handled_at = now()`、`action`、`ban_days`、`note`。
   - 写审计 `report.resolve`，detail 是 `{ caseId, type, action, banDays, note }`。
   - 发邮件（同一事务，`sendMail(o.tx, …)`）：
     - 每个举报人：标题"举报结果"，正文"你举报的{类型}已处理，感谢你维护小镇。"
     - 被处理的店：标题"违规处理通知"，正文"你的{类型}因违规已被{删除/清空/改名}。"；封号时加"账号封禁 N 天"或"账号永久封禁"；最后一行"说明：{note}"。
3. `banDays` 不为 undefined 时，事务提交后调 `players.ban(actor, target_account_id, note, banDays)`，复用 Task 4。
   - 理由：`players.ban` 自己开事务，还要清会话，不能嵌套。
   - 封号失败（比如被处理的人是管理员）时，报错，案子已结。前端提示"内容已处理，封号失败：…"，协管可以到玩家页再封。

**驳回**：
1. 案子标 `rejected`，写处理人、时间、`note`、`action = 'none'`。
2. 审计 `report.reject`。
3. 每个举报人发邮件：标题"举报结果"，正文"你举报的{类型}经核实未违规。"
4. 这些都在一个事务里。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/report/admin.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { createGameFromApp, newRestaurantIn } from '../../../test/reportHelpers';

describe('后台举报处理（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());

  /** 准备：一家店写了公告，两家店举报它，返回案子 id */
  async function reported(notice = '加我微信') {
    const game = createGameFromApp(ctx);
    const bad = await newRestaurantIn(ctx, { notice });
    const a = await newRestaurantIn(ctx, { shardId: bad.shardId });
    const b = await newRestaurantIn(ctx, { shardId: bad.shardId });
    await game.report.report(a, { targetType: 'notice', targetId: bad.restaurantId, reason: 'ad' });
    await game.report.report(b, { targetType: 'notice', targetId: bad.restaurantId, reason: 'ad' });
    const c = await ctx.deps.db
      .selectFrom('report_case')
      .select('id')
      .where('target_id', '=', bad.restaurantId)
      .where('target_type', '=', 'notice')
      .executeTakeFirstOrThrow();
    return { caseId: c.id, bad, a, b };
  }
  const post = (cookie: string, path: string, body: unknown) =>
    call(ctx.app, 'POST', `/api/v1/admin${path}`, { cookie, body });
  const mails = (restId: number) =>
    ctx.deps.db.selectFrom('mail').select(['title', 'body']).where('rest_id', '=', restId).where('source', '=', 'report').execute();

  it('列表和详情：待处理的排前面，带举报人和当前内容', async () => {
    const { caseId } = await reported();
    const l = await call(ctx.app, 'GET', '/api/v1/admin/reports?status=open', { cookie: mod.cookie });
    expect(l.json.data.find((c: { id: number }) => c.id === caseId)).toMatchObject({ reporterCount: 2, snapshot: '加我微信' });
    const d = await call(ctx.app, 'GET', `/api/v1/admin/reports/${caseId}`, { cookie: mod.cookie });
    expect(d.json.data).toMatchObject({ current: '加我微信', priorCases: 0 });
    expect(d.json.data.entries).toHaveLength(2);
  });

  it('处理公告：清空、封 7 天、邮件给举报人和被处理人、审计；不能重复处理', async () => {
    const { caseId, bad, a } = await reported();
    const r = await post(mod.cookie, `/reports/${caseId}/resolve`, { note: '发广告', banDays: 7 });
    expect(r.status).toBe(200);
    const rest = await ctx.deps.db.selectFrom('restaurant').select('notice').where('id', '=', bad.restaurantId).executeTakeFirstOrThrow();
    expect(rest.notice).toBe('');
    const acc = await ctx.deps.db.selectFrom('account').select(['banned_at', 'banned_until']).where('id', '=', bad.accountId).executeTakeFirstOrThrow();
    expect(acc.banned_at).not.toBeNull();
    expect(acc.banned_until!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect((await mails(a.restaurantId)).map((m) => m.title)).toEqual(['举报结果']);
    const notice = await mails(bad.restaurantId);
    expect(notice[0]!.body).toContain('发广告');
    expect(notice[0]!.body).toContain('7 天');
    const audit = await ctx.deps.db.selectFrom('audit_log').select('action').where('action', '=', 'report.resolve').execute();
    expect(audit.length).toBeGreaterThan(0);
    expect((await post(mod.cookie, `/reports/${caseId}/resolve`, { note: '再来' })).json.params.reason).toBe('report_closed');
  });

  it('协管不能永封；管理员能（Review Focus 4）', async () => {
    const { caseId } = await reported();
    expect((await post(mod.cookie, `/reports/${caseId}/resolve`, { note: 'x', banDays: 0 })).status).toBe(403);
    expect((await post(admin.cookie, `/reports/${caseId}/resolve`, { note: 'x', banDays: 0 })).status).toBe(200);
  });

  it('内容已经被店主改掉：照样结案，action 为 none（Review Focus 2）', async () => {
    const { caseId, bad } = await reported();
    await ctx.deps.db.updateTable('restaurant').set({ notice: '' }).where('id', '=', bad.restaurantId).execute();
    expect((await post(mod.cookie, `/reports/${caseId}/resolve`, { note: '已自行删除' })).status).toBe(200);
    const c = await ctx.deps.db.selectFrom('report_case').select(['status', 'action']).where('id', '=', caseId).executeTakeFirstOrThrow();
    expect(c).toEqual({ status: 'resolved', action: 'none' });
  });

  it('驳回：举报人收到"未违规"，内容不动', async () => {
    const { caseId, bad, a } = await reported('正常公告');
    expect((await post(mod.cookie, `/reports/${caseId}/reject`, { note: '没问题' })).status).toBe(200);
    expect((await mails(a.restaurantId))[0]!.body).toContain('未违规');
    const rest = await ctx.deps.db.selectFrom('restaurant').select('notice').where('id', '=', bad.restaurantId).executeTakeFirstOrThrow();
    expect(rest.notice).toBe('正常公告');
  });

  it('其他类型：删帖、删回复、撤喇叭、改店名', async () => {
    // 照上面的方式分别准备帖子、回复、喇叭新闻、店名的案子并处理，断言：
    // 帖子 deleted_at 不为空；回复 deleted_at 不为空；news 行被删；店名变成"餐厅{id}"，个人日志有 admin.rename
  });
});
```

辅助：新建 `apps/server/test/reportHelpers.ts`，导出两个函数：
- `createGameFromApp(ctx)`：从 `createTestApp` 的上下文取 `game`。`TestContext` 若已经暴露 `game`，就直接用它，不要新建。
- `newRestaurantIn(ctx, { shardId?, notice? })`：用 `createShard`、`createAccountRow`、`createRestaurantFull` 建店，返回 `RestCtx`（含 `accountId`、`shardId`、`restaurantId`）。

最后一个用例的具体写法：
- 帖子、回复：直接插 `forum_post` / `forum_reply`。
- 喇叭：插 `news`（`type: 'town.broadcast'`）。
- 店名：直接用店。
- 然后各自举报、处理，断言照注释写全，不能留空。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/report/admin.test.ts`
Expected: FAIL（404）。

- [ ] **Step 3：实现**：
- 按上面的"处理""驳回"写 `report/admin.ts` 的 `createAdminReports(game)`：`list`、`detail`、`resolve`、`reject`。
- 在 `admin/routes.ts` 注册 4 个路由（都是 `requireRole(db, req, 'mod')`）。
- `permissions.test.ts`：在 `beforeAll` 里插一个案子，存到 `ids.reportId`；再加 4 条用例，`resolve` 和 `reject` 的 body 都是 `{ note: '权限测试' }`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/report apps/server/src/modules/admin && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server
git commit -m "feat(report): 后台举报处理——删帖、删回复、撤喇叭、清公告、改名、封号，驳回；邮件和审计"
```

---

### Task 6：前端——举报按钮

**Files:**
- Create: `apps/web/src/components/ReportButton.vue`, `apps/web/src/components/ReportButton.test.ts`
- Modify: `apps/web/src/views/ForumPostView.vue`, `apps/web/src/components/town/NewsPanel.vue`, `apps/web/src/views/FriendRestView.vue`, `apps/web/src/api/endpoints.ts`, `apps/web/src/i18n/zh-CN.ts`

**Interfaces:**
- Produces：
  - `endpoints.report(b: ReportInput)`。
  - `<ReportButton :target-type :target-id :testid? />`：一个"举报"小链接按钮（`btn btn-sm btn-link text-muted`）。
    - 点开是一个内联卡片，不用模态框：理由单选（`REPORT_REASON_NAMES`）、补充说明输入框（maxlength 100）、"提交""取消"。
    - 提交成功后卡片换成"已收到举报，协管会尽快处理"；失败在卡片里显示中文错误。
    - `data-testid` 前缀用 `testid`，默认 `report`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/components/ReportButton.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import ReportButton from './ReportButton.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { report: vi.fn() } }));

describe('ReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('选理由、写说明、提交；成功后显示已收到', async () => {
    vi.mocked(endpoints.report).mockResolvedValue({ ok: true } as never);
    const w = mount(ReportButton, { props: { targetType: 'notice', targetId: 9 } });
    await w.find('[data-testid="report-open"]').trigger('click');
    await w.find('[data-testid="report-reason-ad"]').setValue(true);
    await w.find('[data-testid="report-detail"]').setValue('加微信');
    await w.find('[data-testid="report-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.report).toHaveBeenCalledWith({ targetType: 'notice', targetId: 9, reason: 'ad', detail: '加微信' });
    expect(w.text()).toContain('已收到举报');
  });

  it('失败显示中文原因', async () => {
    vi.mocked(endpoints.report).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'report_dup' }));
    const w = mount(ReportButton, { props: { targetType: 'post', targetId: 1 } });
    await w.find('[data-testid="report-open"]').trigger('click');
    await w.find('[data-testid="report-submit"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('你已经举报过这条内容了');
  });
});
```

在 `ForumPostView.test.ts`、`FriendRestView.test.ts`、`NewsPanel` 的测试（没有就新建 `components/town/NewsPanel.test.ts`）里各加一条用例：
- 别人的内容有举报按钮（按 testid 找），自己的没有。
- 帖子用 `post-report-open`，回复用 `reply-report-{floor}-open`，喇叭用 `news-report-{id}-open`，店名和公告用 `rest-name-report-open`、`notice-report-open`。

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/components/ReportButton.test.ts src/views/ForumPostView.test.ts src/views/FriendRestView.test.ts src/components/town`
Expected: FAIL。

- [ ] **Step 3：实现**
- `ReportButton.vue`：按 Interfaces 写，理由默认选 `abuse`。
- `endpoints.ts`：加 `report: (b: ReportInput) => api.post<{ ok: true }>('/api/v1/report', b)`。
- 各页面加入口：

  | 页面 | 位置 | 显示条件 |
  |---|---|---|
  | `ForumPostView` | 帖子操作行末尾 | 帖子不是自己的（帖子 DTO 的 `restId` 和自己的店不同；字段名以 DTO 为准） |
  | `ForumPostView` | 每条回复的操作区 | 回复没删、`!r.canDelete`（能删就是自己的或管理员） |
  | `NewsPanel` | `town.broadcast` 那一行行尾 | `n.restId` 不是自己的店 |
  | `FriendRestView` | 店名旁、公告块右下角 | `rest.id !== mine` |

- `zh-CN.ts` 的 `STATE` 加设计 §9 的 5 条。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run && cd ../.. && pnpm --filter @dt/web typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(web): 帖子、回复、喇叭、店名、公告旁加举报"
```

---

### Task 7：前端——后台举报页、封号期限

**Files:**
- Create: `apps/web/src/views/admin/AdminReportsView.vue`, `apps/web/src/views/admin/AdminReportsView.test.ts`
- Modify: `apps/web/src/api/admin.ts`, `apps/web/src/views/admin/AdminLayout.vue`, `apps/web/src/router.ts`, `apps/web/src/views/admin/AdminPlayerView.vue`, `AdminPlayerView.test.ts`

**Interfaces:**
- Produces：
  - `adminApi.reports(q)`、`report(id)`、`resolveReport(id, b)`、`rejectReport(id, b)`。
  - `adminApi.ban(id, reason, days?)`。
  - 路由 `/admin/reports`；后台导航在"玩家"后面加"举报"。

**页面**：
- 顶部状态切换：待处理 / 已处理 / 已驳回。
- 列表每行：类型、快照（前 60 字）、被举报店名、举报人数、最近举报时间。点一行在下面展开详情：
  - 快照和当前内容；当前内容为 null 时写"已删除"，和快照不同时写"已改"。
  - 举报人列表；"这个账号以前被处理过 N 次"。
- 处理区：
  - 说明（必填，`report-note`）。
  - 封号选择（`report-ban`）：不封 / 1 天 / 7 天，管理员多一个"永久"。
  - 店名类型多一个新名字输入框（`report-new-name`，占位"餐厅{id}"）。
  - 两个按钮"处理"（`report-resolve`）、"驳回"（`report-reject`）。
  - "处理"前确认，确认文案写明会做什么，比如"清空这家店的公告，并封号 7 天"。

**玩家页**：
- 封号区加天数选择（`ban-days`）：协管只有 1 天和 7 天；管理员还有"永久"。
- 显示：`bannedUntil` 有值写"封号至 {本地时间}"，否则写"永久封号"。
- 解封按钮只有管理员看得到。

- [ ] **Step 1：写失败的测试**（`AdminReportsView.test.ts`；mock `adminApi`，admin store 的角色设为 `mod`）

```ts
  it('处理：填说明、选 7 天、确认后调用 resolve；协管看不到永久', async () => {
    vi.mocked(adminApi.reports).mockResolvedValue([caseDto]);
    vi.mocked(adminApi.report).mockResolvedValue(detailDto);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AdminReportsView);
    await flushPromises();
    await w.find(`[data-testid="report-row-${caseDto.id}"]`).trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="report-ban"] option[value="0"]').exists()).toBe(false);
    await w.find('[data-testid="report-note"]').setValue('发广告');
    await w.find('[data-testid="report-ban"]').setValue('7');
    await w.find('[data-testid="report-resolve"]').trigger('click');
    await flushPromises();
    expect(adminApi.resolveReport).toHaveBeenCalledWith(caseDto.id, { note: '发广告', banDays: 7 });
  });
```

（`caseDto`、`detailDto` 照 `ReportCaseDto`、`ReportDetailDto` 写全一个公告类型的样例；再加一条驳回用例和"当前内容为 null 时写已删除"的断言。`AdminPlayerView.test.ts` 加：协管封号的天数下拉只有 1 和 7；`bannedUntil` 有值时显示"封号至"。）

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/views/admin`
Expected: FAIL。

- [ ] **Step 3：实现**：按"页面"和"玩家页"写；`AdminPlayerView` 的 `adminApi.ban` 调用加 `days`。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run && cd ../.. && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(admin): 后台举报页；玩家页封号可选期限"
```

---

### Task 8：问题记录 164~170

**Files:**
- Create: `apps/web/src/views/RedeemView.vue`, `apps/web/src/views/RedeemView.test.ts`
- Modify: `apps/web/src/components/MoreLinks.vue`, `apps/web/src/router.ts`, `apps/web/src/views/MoreView.test.ts`, `apps/web/src/views/InviteView.vue`, `InviteView.test.ts`, `apps/web/src/views/FriendsView.vue`, `FriendsView.test.ts`, `apps/web/src/views/RestaurantHomeView.vue`, `RestaurantHomeView.test.ts`

| # | 测试 | 改法 |
|---|---|---|
| 164 | `MoreView.test.ts` 的入口列表加"兑换码"；`RedeemView.test.ts`：页面里有 `redeem-input` | 新建页面：标题"兑换码"，内容是 `<RedeemBox />` 加一行说明"兑换码由运营发放，同一个码每家店只能用一次"；路由 `/redeem`（`needRestaurant`）；"更多 → 其他"加 `{ to: '/redeem', icon: 'bi-ticket-perforated', label: '兑换码' }` |
| 166 | `InviteView.test.ts`：文案包含"店铺升到 10 级、再升到 30 级时，你各得一份奖励" | 规则一行改为"好友开店就能领新手礼包；好友验证邮箱后，店铺升到 10 级、再升到 30 级时，你各得一份奖励。每月最多计 {{ data.monthlyCap }} 人。" |
| 168 | `FriendsView.test.ts`：每个好友行的店名、等级在同一个 `.dt-friend-line` 元素里 | 好友行用 `d-flex align-items-center gap-2 py-1`，店名（加粗）、等级、状态标签在一行；次要信息用 `dt-meta` 小字；去掉多余的卡片内边距（具体以现有模板为准，目标是每行一行半以内） |
| 170 | `RestaurantHomeView.test.ts`：声望那格有 `i.bi-award`，且 `title="声望"` | `<div class="col-6" title="声望"><i class="bi bi-award"></i> {{ rest.renown }}</div>` |

- [ ] **Step 1**：按表写 4 处失败的测试。
- [ ] **Step 2**：`cd apps/web && npx vitest run src/views` 确认失败。
- [ ] **Step 3**：按表实现。
- [ ] **Step 4**：`cd apps/web && npx vitest run` 通过。
- [ ] **Step 5**：提交

```bash
git add apps/web/src
git commit -m "fix(web): 兑换码独立入口、邀请页文案、好友列表更紧凑、声望图标（问题记录 164~170）"
```

---

### Task 9：e2e、规则文档、全量检查

**Files:**
- Create: `apps/web/e2e/report.spec.ts`, `docs/rules/举报和处罚.md`
- Modify: `docs/deploy.md`

- [ ] **Step 1：写 e2e**

```ts
// apps/web/e2e/report.spec.ts
import pg from 'pg';
import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 只操作本用例注册的三个账号：B 写公告，A 举报，管理员 C 处理 */
test('举报公告 → 管理员处理 → 公告清空、举报人收到结果邮件', async ({ page, browser, request }) => {
  test.setTimeout(150_000);
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const B = await registerAndOpen(pageB, request);
  await pageB.goto('/rest/look');
  // 写公告：选择器以装扮页实际的 testid 为准
  await pageB.getByTestId('notice-input').fill('加我微信领福利');
  await pageB.getByTestId('notice-save').click();

  const A = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  let bRest: number;
  try {
    bRest = (await client.query('select id from restaurant where name = $1', [B.name])).rows[0].id;
  } finally {
    await client.end();
  }
  await page.goto(`/friends/${bRest}`);
  await page.getByTestId('notice-report-open').click();
  await page.getByTestId('report-reason-ad').check();
  await page.getByTestId('report-submit').click();
  await expect(page.getByText('已收到举报')).toBeVisible();

  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  const C = await registerAndOpen(pageC, request);
  const c2 = new pg.Client({ connectionString: DB_URL });
  await c2.connect();
  try {
    await c2.query(`update account set role = 'admin' where lower(username) = lower($1)`, [C.username]);
  } finally {
    await c2.end();
  }
  await pageC.goto('/admin/reports');
  await pageC.getByText('加我微信领福利').first().click();
  await pageC.getByTestId('report-note').fill('广告');
  pageC.once('dialog', (d) => void d.accept());
  await pageC.getByTestId('report-resolve').click();
  await expect(pageC.getByText('已处理')).toBeVisible();

  await page.goto('/mail');
  await expect(page.getByText('举报结果')).toBeVisible();
  await page.goto(`/friends/${bRest}`);
  await expect(page.getByText('加我微信领福利')).toHaveCount(0);
  await ctxB.close();
  await ctxC.close();
  void A;
});
```

（新开的上下文要调 `closeAnnouncements(page)`，见 `e2e/fixtures.ts`；写公告的入口、按钮的 testid 以现有页面为准，没有 testid 就补上。）

- [ ] **Step 2：写文档**

`docs/rules/举报和处罚.md`：
- 能举报什么、怎么举报（理由、每天 10 次、不能举报自己、同一内容只能报一次）。
- 协管怎么处理：五种内容各做什么；封号 1 天、7 天、永久，谁能做；驳回。
- 举报人和被处理人分别收到什么邮件。
- 封号期限到了自动解封。

`docs/deploy.md` 加一节"举报和封号期限（子项目 6B-1）"：
- 迁移 0019；
- 功能开关 `report`；
- `tuning.report.dailyMax`；
- 解封、永久封号改成只有管理员能做。

- [ ] **Step 3：全量检查**

Run: `pnpm test && pnpm typecheck && pnpm lint`；重启 dev（迁移由 dev 启动时自动跑，或 `pnpm --filter @dt/server migrate:dev`——只加表和列，不改已有数据），然后 `pnpm --filter @dt/web e2e`。
Expected: 全部通过；e2e 19 passed。

- [ ] **Step 4：提交**

```bash
git add apps/web/e2e docs
git commit -m "test(e2e): 举报公告到处理的流程；docs: 举报和处罚规则、部署说明"
```
