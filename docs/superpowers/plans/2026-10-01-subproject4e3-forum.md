# 子项目 4E-3「论坛」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做论坛：帖子列表（分类、精华、搜索、游标分页）、发帖 / 编辑 / 删帖、回复（楼层、回复某一楼、匿名、删除）、赞和踩、阅读数和阅读明细、管理员置顶和加精（首次加精发奖励）。

**Architecture:**
- 新模块 `modules/forum`，四张表：`forum_post`、`forum_reply`、`forum_reaction`、`forum_read`。计数冗余存在帖子行上，和操作在同一个事务里更新。
- 写操作走 `runOp`（功能 `forum`，锁当前店），涉及计数和楼层的操作再 `select ... for update` 锁住帖子行。
- 管理员身份每次从 `account.role` 读，`mod` 或 `admin` 都算。
- 前端新增三个页面：`ForumView`、`ForumPostView`、`ForumEditView`。

**Tech Stack:** 同仓库（Fastify 5 + Kysely + PostgreSQL，Vue 3 + Pinia + Bootstrap 5，Vitest，Playwright）。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject4e3-forum-design.md`

**写法说明**：沿用 4C-3、4E-2 的写法。本计划写全接口、核心算法和每条测试；路由注册、DTO 组装、模板等样板代码在执行时照邻近模块写，不在计划里重复。

## Global Constraints

- 回复、注释、文案用中文；不碰 `问题记录.md`（只读）。
- 时间一律用 `o.now` / `d.now()`；每日计数传 `gameDay(o.now)`。
- 正文只当纯文本：前端用文本插值加 `white-space: pre-wrap`，**禁止 `v-html`**；服务端不做 HTML 转义，原样存储。
- 所有查询都带 `shard_id`：跨区服访问一律当作不存在，报 `NOT_FOUND`。
- 搜索用参数化 `ILIKE`，`%`、`_`、`\` 先转义。
- 样式只写在 `apps/web/src/styles/main.css`，按 `docs/design/视觉规范.md`。
- 改了 tuning 后执行 `pnpm --filter @dt/config build`，重新生成开发用的配置包。
- 服务端测试：`pnpm --filter @dt/server exec vitest run <路径>`；全量：`pnpm test`。
- 提交信息结尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **注入和脚本**：标题、正文、回复里写 `<script>`、`<img onerror>`，前端必须原样显示文字；搜索词里有 `%`、`_`，必须按字面匹配。→ Task 3 搜索测试、Task 6 渲染测试。
2. **并发楼层和计数**：两条回复同时提交，楼层号不能重复；两家店同时点赞，赞数是 2。→ Task 4、Task 5 的并发测试。
3. **权限**：非作者改帖、删帖，非管理员置顶加精、看阅读明细都要被拒；匿名回复不能从任何接口泄露真名。→ Task 2、4、5。
4. **已删除内容**：删除的帖子不能被读到、回复、点赞；删除的回复保留楼层但内容为空。→ Task 2、4、5。
5. **加精奖励只发一次**：取消后再加精、重复加精，都不再发奖励。→ Task 5。

---

### Task 1: 配置、迁移、共享类型、功能开关

**Files:**
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`、`packages/config/src/build.ts`、`build.test.ts`
- Modify: `packages/config/data/designed/tasks.json`（任务 107 的 `href` 改为 `/forum`）
- Create: `apps/server/src/db/migrations/0017_forum.ts`、`0017.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`
- Modify: `apps/server/src/core/features.ts`（加 `'forum'`）、`apps/server/src/worker/periodic.test.ts`（"未实现功能"的例子改用一个不存在的功能名，如 `'nope'`）
- Create: `packages/shared/src/schemas/forum.ts`
- Modify: `packages/shared/src/index.ts`、`packages/shared/src/news.ts`（`forum.pin`、`forum.feature`）
- Modify: `apps/web/src/utils/news.ts`、`news.test.ts`（两种新闻的文案）

**Interfaces — Produces:**

tuning：

```jsonc
"forum": {
  "titleMax": 40, "contentMax": 5000, "replyMax": 500, "queryMax": 20,
  "postCooldownSec": 60, "postDailyMax": 10, "replyCooldownSec": 60,
  "pageSize": 20, "excerpt": 60, "readsMax": 200,
  "featureReward": { "goods": [[1, 20]], "diamond": 50 }
}
```

`build.ts` 校验 `featureReward.goods` 里的道具存在，报错文字 `forum.featureReward references unknown goods ${id}`。

迁移 0017：

```sql
create table forum_post (
  id serial primary key,
  shard_id integer not null references shard(id) on delete cascade,
  rest_id integer not null references restaurant(id) on delete cascade,
  category text not null check (category in ('chat','guide','feedback')),
  title text not null,
  content text not null,
  created_at timestamptz not null,
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  featured_at timestamptz,
  feature_rewarded boolean not null default false,
  read_num integer not null default 0,
  up_num integer not null default 0,
  down_num integer not null default 0,
  reply_count integer not null default 0,
  last_reply_at timestamptz
);
create index forum_post_active on forum_post (shard_id, (coalesce(last_reply_at, created_at)) desc, id desc) where deleted_at is null;
create index forum_post_featured on forum_post (shard_id, featured_at desc) where featured_at is not null and deleted_at is null;
create index forum_post_rest on forum_post (rest_id, created_at);
create table forum_reply (
  id serial primary key,
  post_id integer not null references forum_post(id) on delete cascade,
  rest_id integer not null references restaurant(id) on delete cascade,
  floor integer not null,
  reply_to integer,
  anonymous boolean not null default false,
  content text not null,
  created_at timestamptz not null,
  deleted_at timestamptz,
  unique (post_id, floor)
);
create index forum_reply_rest on forum_reply (rest_id, created_at);
create table forum_reaction (
  post_id integer not null references forum_post(id) on delete cascade,
  rest_id integer not null references restaurant(id) on delete cascade,
  kind text not null check (kind in ('up','down')),
  created_at timestamptz not null,
  primary key (post_id, rest_id)
);
create table forum_read (
  post_id integer not null references forum_post(id) on delete cascade,
  rest_id integer not null references restaurant(id) on delete cascade,
  times integer not null,
  first_at timestamptz not null,
  last_at timestamptz not null,
  primary key (post_id, rest_id)
);
```

`packages/shared/src/schemas/forum.ts`：

```ts
export const FORUM_CATEGORIES = ['chat', 'guide', 'feedback'] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export const FORUM_CATEGORY_NAMES: Record<ForumCategory, string> = { chat: '闲聊', guide: '攻略', feedback: '建议反馈' };
export const FORUM_TABS = ['all', 'chat', 'guide', 'feedback', 'featured'] as const;
export type ForumTab = (typeof FORUM_TABS)[number];

export const forumListQuery = z.object({
  tab: z.enum(FORUM_TABS).default('all'),
  q: z.string().max(50).optional(),
  cursor: z.string().max(80).optional(),
});
export const forumPostBody = z.object({
  category: z.enum(FORUM_CATEGORIES),
  title: z.string().max(200),
  content: z.string().max(20000),
});
export const forumReplyBody = z.object({
  content: z.string().max(5000),
  replyTo: z.number().int().positive().optional(),
  anonymous: z.boolean().default(false),
});
export const forumReactBody = z.object({ kind: z.enum(['up', 'down']) });
export const forumAdminBody = z.object({ action: z.enum(['pin', 'unpin', 'feature', 'unfeature']) });
export const forumIdParam = z.object({ id: z.coerce.number().int().positive() });

export interface ForumPostItemDto {
  id: number; category: ForumCategory; title: string; excerpt: string;
  restId: number; restName: string; createdAt: string; activeAt: string;
  readNum: number; upNum: number; downNum: number; replyCount: number;
  pinned: boolean; featured: boolean;
}
export interface ForumListDto {
  pinned: ForumPostItemDto[];
  items: ForumPostItemDto[];
  nextCursor: string | null;
  me: { canPost: boolean; isAdmin: boolean; postReadyAt: string | null; replyReadyAt: string | null };
}
export interface ForumReplyDto {
  id: number; floor: number; replyTo: number | null;
  /** 匿名时对他人为 null / '匿名' */
  restId: number | null; restName: string;
  anonymous: boolean; content: string; createdAt: string; deleted: boolean; canDelete: boolean;
}
export interface ForumPostDetailDto {
  post: ForumPostItemDto & { content: string; editedAt: string | null };
  mine: 'up' | 'down' | null;
  can: { edit: boolean; delete: boolean; admin: boolean; reads: boolean; reply: boolean };
  replies: ForumReplyDto[];
  replyReadyAt: string | null;
}
export interface ForumReactDto { mine: 'up' | 'down' | null; up: number; down: number }
export interface ForumReadsDto {
  items: Array<{ restId: number; name: string; times: number; lastAt: string; reaction: 'up' | 'down' | null }>;
}
export interface ForumAdminDto { pinned: boolean; featured: boolean; rewarded: boolean }
```

前端新闻文案：
- `forum.pin`：`${w}的帖子《${p.title}》被置顶了`
- `forum.feature`：`${w}的帖子《${p.title}》被加精了`

- [ ] **Step 1: 写失败的测试**
  - `build.test.ts`：`bundle.tuning.forum` 等于上面的值；`featureReward.goods` 改成 `[[999999, 1]]` 时报 `forum.featureReward references unknown goods 999999`；任务 107 的 `href === '/forum'`。
  - `0017.test.ts`：
    - `forum_post.category = 'x'` 被拒；
    - 同帖同楼层的两条回复被拒；
    - 同帖同店两条 reaction 被拒；
    - 删帖时级联删回复。
  - `news.test.ts`：两种文案，例如 `newsText(n('forum.feature', { postId: 3, title: '攻略' }), names) === '小王的店的帖子《攻略》被加精了'`。
  - `periodic.test.ts`：先把例子改成 `'nope'`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts; pnpm --filter @dt/server exec vitest run src/db/migrations/0017.test.ts; pnpm --filter @dt/web exec vitest run src/utils/news.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**：照 Produces 写；`IMPLEMENTED_FEATURES` 加 `'forum'`；重新生成配置包。
- [ ] **Step 4: 运行，确认通过**：同上命令，加跑 `pnpm typecheck`。Expected: PASS。
- [ ] **Step 5: 提交** `feat(forum): 配置、迁移 0017、共享类型、功能开关`

---

### Task 2: 发帖、编辑、删帖、管理员身份

**Files:**
- Create: `apps/server/src/modules/forum/rules.ts`、`rules.test.ts`、`common.ts`、`posts.ts`、`posts.test.ts`、`service.ts`、`routes.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces — Produces:**

```ts
// rules.ts（纯函数）
/** 去掉首尾空白和 \r，连续 3 个以上空行压成 2 个 */
export function normalizeText(raw: string): string {
  return raw.replace(/\r/g, '').trim().replace(/\n{3,}/g, '\n\n');
}
/** 按字符计长度（emoji 算 1） */
export function textLength(s: string): number { return [...s].length; }
/** 长度检查：0 < len ≤ max */
export function textOk(s: string, max: number): boolean { const n = textLength(s); return n > 0 && n <= max; }
/** ILIKE 关键词：转义 \ % _ 后两边加 % */
export function likePattern(q: string): string { return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`; }
/** 游标：`${activeAt 毫秒}:${id}` */
export function encodeCursor(at: Date, id: number): string { return `${at.getTime()}:${id}`; }
export function decodeCursor(s: string): { at: Date; id: number } | null
/** 摘要：正文前 n 个字符，换行替换成空格 */
export function excerpt(s: string, n: number): string

// common.ts
export type PostRow = Selectable<DB['forum_post']>;
/** 本区未删除的帖子；forUpdate 时锁行；不存在报 NOT_FOUND */
export async function loadPost(o: Op, id: number, opts?: { forUpdate?: boolean }): Promise<PostRow>
/** 当前账号是否管理员（mod / admin），读 account.role */
export async function isAdmin(db: Kysely<DB>, accountId: number): Promise<boolean>
/** 邮箱已验证，否则 EMAIL_NOT_VERIFIED */
export async function assertVerified(o: Op, accountId: number): Promise<void>
/** 发帖或回复的冷却：最近一条 created_at + sec 之后才能再发；返回可再发的时间或 null */
export async function readyAt(db: Kysely<DB>, table: 'forum_post' | 'forum_reply', restId: number, sec: number, now: Date): Promise<Date | null>

// posts.ts
export async function createPost(o: Op, ctx: RestCtx, b: ForumPostBody): Promise<{ id: number }>
export async function editPost(o: Op, ctx: RestCtx, id: number, b: ForumPostBody): Promise<{ id: number }>
export async function deletePost(o: Op, ctx: RestCtx, id: number): Promise<Record<string, never>>
```

`ForumPostBody` 是 `z.infer<typeof forumPostBody>`，在 shared 里导出。

`createPost` 的顺序：
1. 校验邮箱；
2. 规整并校验标题和正文，不合格报 `invalidState('post_text', { max })`；
3. 冷却：`readyAt(...) > now` 时报 `AppError(COOLDOWN, 429, { what: 'forum_post', seconds })`；
4. 每日上限：`incrementDaily(o.tx, restId, 'forum.post', 1, day) > postDailyMax` 时报 `limitReached('forum_post', { max })`，由事务回滚恢复计数；
5. 插入；`emitAction(o, 'post.create')`；`restLog`。

`editPost`：
- `loadPost(forUpdate)`；不是作者也不是管理员时报 `FORBIDDEN`；
- 规整校验，更新 `category`、`title`、`content`、`edited_at`；
- `restLog(o, 'forum.edit', { postId, by: ctx.accountId })`。

`deletePost`：
- 作者：置顶或精华时报 `invalidState('post_locked')`；管理员不受限；
- 别人报 `FORBIDDEN`；
- 设置 `deleted_at`。

- [ ] **Step 1: 写失败的测试**
  - `rules.test.ts`：
    - `normalizeText('  a\r\n\n\n\nb  ') === 'a\n\nb'`；
    - `textLength('😀ab') === 3`；
    - `likePattern('5%_\\') === '%5\\%\\_\\\\%'`；
    - `decodeCursor(encodeCursor(d, 7))` 往返；`decodeCursor('x')` 为 null；
    - `excerpt('a\nb', 60) === 'a b'`。
  - `posts.test.ts`（`createTestGame`，店用 `verified: true`）：
    - 发帖成功，任务 107 进度为 1；
    - 未验证邮箱 → `EMAIL_NOT_VERIFIED`；
    - 标题 41 字、正文全空格 → `INVALID_STATE post_text`；标题 40 个 emoji 可以；
    - 60 秒内第二篇 → `COOLDOWN`；推进 61 秒可以；
    - 每天第 11 篇 → `LIMIT_REACHED`；跨天后可以；
    - 编辑：作者成功并有 `edited_at`；别人 `FORBIDDEN`；管理员（把账号 `role` 改成 `mod`）成功；
    - 删帖：作者删普通帖成功；先把 `pinned_at` 设上，作者删 → `post_locked`，管理员删成功；
    - 删后 `loadPost` 报 `NOT_FOUND`；另一个区服的店 `editPost` 这篇报 `NOT_FOUND`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/forum`
  Expected: FAIL。
- [ ] **Step 3: 实现**：照 Produces 写。路由：`POST /forum/posts`、`PUT /forum/posts/:id`、`DELETE /forum/posts/:id`。
- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。
- [ ] **Step 5: 提交** `feat(forum): 发帖、编辑、删帖`

---

### Task 3: 列表、搜索、详情、阅读

**Files:**
- Create: `apps/server/src/modules/forum/view.ts`、`view.test.ts`
- Modify: `service.ts`、`routes.ts`

**Interfaces — Produces:**

```ts
export async function listPosts(d: GameDeps, ctx: RestCtx, q: ForumListQuery): Promise<ForumListDto>
/** 详情：记阅读（作者不计，第一次读 read_num + 1）后返回；用 runOp 以便锁帖子行 */
export async function postDetail(o: Op, ctx: RestCtx, id: number): Promise<ForumPostDetailDto>
export async function postReads(o: Op, ctx: RestCtx, id: number): Promise<ForumReadsDto>
```

**`listPosts`**：
- `q` 规整后超过 `queryMax` 报 `invalidState('query_text')`，空串视为没有关键词。
- `activeAt = coalesce(last_reply_at, created_at)`。
- `pinned`：只在没有游标、`tab !== 'featured'` 时查，`pinned_at is not null`，按 `pinned_at desc`，同样受分类和关键词过滤。
- `items`：
  - `featured`：`featured_at is not null`，按 `featured_at desc, id desc`，游标用 `featured_at`；
  - 其他：`pinned_at is null`，分类不是 `all` 时加分类条件，按 `activeAt desc, id desc`；
  - 游标条件 `(activeAt, id) < (cursor.at, cursor.id)`；
  - 多取 1 条，用来判断有没有下一页。
- 作者店名：join `restaurant`。
- `me`：
  - `canPost`：邮箱已验证；
  - `isAdmin`；
  - `postReadyAt`、`replyReadyAt`：ISO 字符串或 null。

**`postDetail`**：
- 加载帖子时锁行；
- 读的人不是作者时，upsert `forum_read`：没有就插入 `times = 1`；有就 `times + 1`、更新 `last_at`。插入时 `read_num + 1`，用 `insert ... on conflict do update ... returning (xmax = 0) as inserted` 判断是不是第一次。
- 回复：
  - 按楼层排序；
  - 匿名的：看的人不是本人也不是管理员时，`restId: null, restName: '匿名'`；
  - 已删除的：`content: ''`，`deleted: true`；
  - `canDelete`：回复者本人或管理员，且未删除。
- `can`：
  - `edit`：作者或管理员；
  - `delete`：管理员，或作者且未置顶未加精；
  - `admin`、`reads`：管理员，或作者（reads）；
  - `reply`：邮箱已验证。

**`postReads`**：
- 只有作者或管理员能看，别人报 `FORBIDDEN`。
- join `restaurant` 和 `forum_reaction`，按 `last_at desc` 取前 `readsMax` 条。

- [ ] **Step 1: 写失败的测试**（`view.test.ts`）
  - 分类筛选：发闲聊和攻略各一篇，`tab: 'guide'` 只有攻略。
  - 关键词：标题含 `100%_OK` 和 `100XYOK` 的两篇，搜 `%_` 只命中第一篇；搜 `ok` 不区分大小写，两篇都命中。
  - 搜索词 21 字 → `query_text`。
  - 置顶只在第一页：3 篇普通帖加 1 篇置顶，`pageSize` 改成 2（`setTuning`）。第一页 `pinned` 1 条、`items` 2 条、有 `nextCursor`；第二页 `pinned` 为空、`items` 1 条、`nextCursor` 为 null；两页 id 不重复。
  - 有回复的帖子排到前面（`last_reply_at` 设为较晚的时间）。
  - 精华标签只列精华，按加精时间排。
  - 删除的帖子不出现；另一个区服的帖子不出现。
  - 阅读：作者自己打开 → `read_num` 不变；同一家店打开 3 次 → `read_num` 为 1、`forum_read.times` 为 3；第二家店打开 → `read_num` 为 2。
  - 阅读明细：作者看到 2 条，态度正确（先点赞，在 Task 5 之前用直接插 `forum_reaction` 的方式造数据）；别人 `FORBIDDEN`；管理员可以看。
  - 详情：删除的帖子 `NOT_FOUND`；`can` 字段按身份变化。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/forum/view.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。路由：`GET /forum/posts`、`GET /forum/posts/:id`（POST 语义的读，走 `runOp`，前端用 GET）、`GET /forum/posts/:id/reads`。
- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。
- [ ] **Step 5: 提交** `feat(forum): 列表、搜索、详情、阅读明细`

---

### Task 4: 回复

**Files:**
- Create: `apps/server/src/modules/forum/replies.ts`、`replies.test.ts`
- Modify: `service.ts`、`routes.ts`

**Interfaces — Produces:**

```ts
export async function createReply(o: Op, ctx: RestCtx, postId: number, b: ForumReplyBody): Promise<ForumReplyDto>
export async function deleteReply(o: Op, ctx: RestCtx, replyId: number): Promise<Record<string, never>>
```

`createReply` 的顺序：
1. 校验邮箱；
2. 规整校验正文（不合格报 `invalidState('reply_text', { max })`）；
3. 冷却（`forum_reply` 表，跨帖子）；
4. `loadPost(forUpdate)`；
5. `replyTo` 不存在时报 `invalidState('reply_to')`；
6. `floor = post.reply_count + 1`，插入回复；更新帖子 `reply_count`、`last_reply_at = now`；
7. 返回本人视角的 DTO（匿名也显示真名，带 `anonymous: true`）。

`deleteReply`：
- join 帖子拿到 `shard_id` 校验区服；帖子已删除时报 `NOT_FOUND`；
- 不是回复者也不是管理员时报 `FORBIDDEN`；
- 设置 `deleted_at`，已删除的再删不报错。

- [ ] **Step 1: 写失败的测试**（`replies.test.ts`）
  - 楼层 1、2、3 递增；帖子 `reply_count === 3`、`last_reply_at` 为最后一条的时间。
  - 并发：两家店同时回复（`Promise.all`），楼层是 {1, 2}，不重复。
  - `replyTo: 9` 不存在 → `reply_to`；`replyTo: 1` 可以。
  - 冷却跨帖子：A 帖回复后 30 秒在 B 帖回复 → `COOLDOWN`。
  - 匿名：
    - 第三家店看详情：这条 `restId: null, restName: '匿名'`；
    - 本人看：真名加 `anonymous: true`；
    - 管理员看：真名。
  - 删除：
    - 别人删 → `FORBIDDEN`；本人删后详情里 `deleted: true, content: ''`，楼层还在；
    - 管理员能删任何人的回复。
  - 已删除的帖子不能回复（`NOT_FOUND`）；未验证邮箱 → `EMAIL_NOT_VERIFIED`；501 字 → `reply_text`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/forum/replies.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。路由：`POST /forum/posts/:id/replies`、`DELETE /forum/replies/:id`。
- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。
- [ ] **Step 5: 提交** `feat(forum): 回复、回复某一楼、匿名、删回复`

---

### Task 5: 赞和踩、置顶和加精

**Files:**
- Create: `apps/server/src/modules/forum/react.ts`、`admin.ts`、`react.test.ts`、`admin.test.ts`
- Modify: `service.ts`、`routes.ts`

**Interfaces — Produces:**

```ts
export async function react(o: Op, postId: number, kind: 'up' | 'down'): Promise<ForumReactDto>
export async function adminPost(d: GameDeps, o: Op, ctx: RestCtx, postId: number, action: ForumAdminAction): Promise<ForumAdminDto>
```

**`react`**：
- `loadPost(forUpdate)`，读出我已有的态度。
- 没有：插入，对应计数 + 1。
- 相同：删除，对应计数 − 1。
- 不同：更新 `kind`，旧计数 − 1，新计数 + 1。
- 返回最新计数。

**`adminPost`**：
- 不是管理员报 `FORBIDDEN`。
- `loadPost(forUpdate)`。
- `pin`：`pinned_at` 为空时才设，并写新闻 `forum.pin { postId, title }`。新闻要挂在作者店名下，用 `postNews(o.tx, { shardId, restId: post.rest_id, type, params }, o.now)`，具体签名照 `modules/news/news.ts` 的 `NewsInput`。
- `unpin`：设为 null。
- `feature`：`featured_at` 为空时才设；`feature_rewarded = false` 时发奖励：
  - 作者店就是当前店时，直接在当前 `o` 上 `grantGoodsOp` / `gainDiamond`；
  - 否则用 `runSystemOp(d, shardId, post.rest_id, { source: 'forum.feature', now: o.now }, ...)` 发。注意这会开第二个事务锁作者店：当前只锁着管理员自己的店和帖子行，不会死锁。
  - 置 `feature_rewarded = true`，写新闻 `forum.feature`。
- `unfeature`：`featured_at` 设为 null。
- 返回 `{ pinned, featured, rewarded }`，`rewarded` 表示本次是否发了奖励。

- [ ] **Step 1: 写失败的测试**
  - `react.test.ts`：
    - up → `{mine: 'up', up: 1, down: 0}`；再 up → `{mine: null, up: 0}`；
    - up 再 down → `{mine: 'down', up: 0, down: 1}`；
    - 并发两家店同时 up，最终 `up_num === 2`；
    - 删除的帖子 → `NOT_FOUND`。
  - `admin.test.ts`：
    - 普通店 → `FORBIDDEN`；
    - 管理员置顶：`pinned_at` 有值、新闻 `forum.pin` 1 条；再置顶不再写新闻；取消后 `pinned_at` 为 null；
    - 首次加精：作者神秘礼券 + 20、钻石 + 50，新闻 `forum.feature`，`rewarded: true`；取消再加精 `rewarded: false`，作者道具不变；
    - 管理员加精自己的帖子也能拿到奖励；
    - 加精后作者删帖 → `post_locked`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/forum/react.test.ts src/modules/forum/admin.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。路由：`POST /forum/posts/:id/react`、`POST /forum/posts/:id/admin`。
- [ ] **Step 4: 运行，确认通过**：`pnpm --filter @dt/server exec vitest run src/modules/forum`。Expected: PASS。
- [ ] **Step 5: 提交** `feat(forum): 赞和踩、置顶和加精`

---

### Task 6: 前端——列表、详情、发帖页

**Files:**
- Create: `apps/web/src/views/ForumView.vue`、`ForumView.test.ts`、`ForumPostView.vue`、`ForumPostView.test.ts`、`ForumEditView.vue`、`ForumEditView.test.ts`
- Modify: `apps/web/src/router.ts`
  - `/forum` → `ForumView`；
  - `/forum/new` 和 `/forum/:id(\\d+)/edit` → `ForumEditView`；
  - `/forum/:id(\\d+)` → `ForumPostView`；
  - meta 都是 `needRestaurant: true`。
- Modify: `apps/web/src/api/endpoints.ts`
  - `forumList(q)`、`forumPost(id)`、`forumCreate(b)`、`forumEdit(id, b)`、`forumDelete(id)`、`forumReply(id, b)`、`forumDeleteReply(id)`、`forumReact(id, kind)`、`forumReads(id)`、`forumAdmin(id, action)`。
- Modify: `apps/web/src/i18n/zh-CN.ts`
  - STATE：`post_text: '标题或正文长度不对'`、`reply_text: '回复长度不对'`、`post_locked: '置顶或加精的帖子不能删除'`、`reply_to: '要回复的楼层不存在'`、`query_text: '搜索词太长了'`；
  - COOLDOWN 的 `forum_post` / `forum_reply` 文案："发帖太快了，N 秒后再试" / "回复太快了，N 秒后再试"，照现有 COOLDOWN 分支的写法；
  - LIMIT 的 `forum_post`："今天发帖已达上限（N 篇）"。
- Modify: `apps/web/src/components/MoreLinks.vue`（"玩法"组加 `{ to: '/forum', icon: 'bi-chat-square-text', label: '论坛' }`）
- Modify: `apps/web/src/views/TownView.vue`（标题右侧 `RouterLink to="/forum"`"论坛"）
- Modify: `apps/web/src/styles/main.css`（`.dt-post-body { white-space: pre-wrap; word-break: break-word; }` 等）

**页面约定**（testid 写在括号里）：
- **`ForumView`**：
  - 胶囊标签（`forum-tab-<tab>`）和搜索框（`forum-q`，回车搜索）。
  - "发帖"按钮（`forum-new`）：`me.canPost` 为假时禁用，旁边写"验证邮箱后才能发帖"。
  - 置顶区和列表，每行 `forum-item-<id>`，含"置顶""精"标。
  - "加载更多"（`forum-more`）带上 `nextCursor`，追加到列表。
  - 标签和搜索词变化时重新加载。
- **`ForumPostView`**：
  - 正文 `post-body` 用 `{{ }}` 插值，不用 `v-html`。
  - 赞踩按钮 `post-up` / `post-down`，`active` 跟随 `mine`。
  - 按 `can` 显示 `post-edit`（跳到编辑页）、`post-delete`（`window.confirm` 后删除，回到 `/forum`）、`post-pin`、`post-feature`、`post-reads`（展开阅读明细）。
  - 回复列表：每楼 `reply-<floor>`，显示 `#楼层 店名 时间`；有 `replyTo` 时显示"回复 #N"链接（`href="#floor-N"`）。删除按钮 `reply-delete-<floor>`，先确认；已删除的显示"该回复已删除"。每楼有"回复"按钮 `reply-to-<floor>`。
  - 回复框：`reply-content`、匿名勾选 `reply-anon`、提交 `reply-submit`；选了某楼时显示 `reply-target`"回复 #N（取消）"。
- **`ForumEditView`**：
  - 分类单选（`edit-cat-<c>`）、标题 `edit-title`、正文 `edit-content`（显示 n/5000）、提交 `edit-submit`。
  - 编辑时先拉详情填入。
  - 成功后跳到详情页。

- [ ] **Step 1: 写失败的测试**（mock `endpoints`，照 `RankPanel.test.ts` 的写法）
  - `ForumView`：
    - 默认调用 `forumList({ tab: 'all' })`，显示置顶和列表；
    - 点 `forum-tab-guide` 后调用 `tab: 'guide'`；
    - 搜索回车带上 `q`；
    - "加载更多"带上 `cursor` 并追加；
    - `canPost: false` 时发帖按钮禁用。
  - `ForumPostView`：
    - 正文是 `'<img src=x onerror=alert(1)>\n第二行'` 时，`post-body` 的 `text()` 包含 `<img`，且 `find('img').exists() === false`；
    - 点赞调用 `forumReact(5, 'up')` 并更新计数；
    - `can.admin` 为假时没有 `post-pin`；
    - 点 `reply-to-2` 后提交，调用 `forumReply(5, { content, replyTo: 2, anonymous: false })`；
    - 勾选匿名后 `anonymous: true`；
    - 删除回复前 `confirm` 返回 false 时不调用接口。
  - `ForumEditView`：
    - 新建时提交 `forumCreate({ category: 'guide', title, content })` 并跳转；
    - 编辑时预填并调用 `forumEdit`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/web exec vitest run src/views/Forum`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令，然后 `pnpm test`、`pnpm typecheck`、`pnpm lint`。Expected: 全部 PASS。
- [ ] **Step 5: 提交** `feat(web): 论坛列表、帖子详情、发帖和编辑`

---

### Task 7: 端到端和文档

**Files:**
- Create: `apps/web/e2e/forum.spec.ts`
- Modify: `docs/rules/收益与加成.md`（新增"14. 论坛（子项目 4E-3）"）
- Modify: `docs/deploy.md`（迁移 0017、功能开关 `features.forum`）

**端到端流程**（`registerAndOpen` 会验证邮箱）：
1. 打开 `/forum`，点"发帖"，选攻略，填标题 `e2e攻略<随机>` 和两行正文，发布，跳到详情；
2. 点赞，`post-up` 变成激活状态；
3. 回复"一楼"，等出现 `reply-1`；60 秒冷却会挡住第二条回复，所以第二条回复前先把本店的回复时间往前改：用 pg 执行 `update forum_reply set created_at = created_at - interval '2 minutes' where rest_id = $1`（只改本次测试店自己的数据）；
4. 点 `reply-to-1`，回复"二楼"，`reply-2` 显示"回复 #1"；
5. 删除二楼（接受确认框），显示"该回复已删除"；
6. 回到 `/forum`，`forum-tab-guide` 下能看到这篇。

- [ ] **Step 1: 写 e2e。**
- [ ] **Step 2: 跑 e2e。**先执行 `pnpm --filter @dt/config build` 并重启开发服务，再执行 `pnpm --filter @dt/web e2e`。Expected: 全部通过。
- [ ] **Step 3: 写文档。**
- [ ] **Step 4: `pnpm test`、`pnpm typecheck`、`pnpm lint`、`npx prettier --check .`**（`问题记录.md` 的提示忽略）。Expected: PASS。
- [ ] **Step 5: 提交** `test(e2e): 论坛发帖、点赞、回复；docs: 规则和迁移 0017`
