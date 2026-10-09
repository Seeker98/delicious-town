# 定制称号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台能新建定制称号，通过邮件（一家或几家店）和兑换码发放，支持永久、领取后 N 天、到某个时间；称号徽章样式统一成访问好友页的黄底徽章。

**Architecture:** 新表 `custom_icon`，定制称号的键是 `c<id>`，和配置称号共用 `rest_icon`。服务端新模块 `modules/icons`：`defs.ts` 把配置和定制称号解析成同一种定义（所有读称号的地方改用它），`grant.ts` 是唯一的发称号函数（一条 upsert 写完合并规则）。附件 `rewardItems` 加 `icons`，邮件、兑换码走现有的 `grantRewardOp`；活动拒绝称号。后台加“称号”页和附件编辑器的称号栏。

**Tech Stack:** Fastify、Kysely、Postgres、Vitest、zod；Vue 3、Pinia。

**Spec:** docs/superpowers/specs/2026-10-09-custom-titles-design.md

## Global Constraints

- 服务端测试不用 vi.mock（isolate:false）；不调用 `/api/v1/test/tick`；不改开发库数据。
- 加迁移前先停开发服（Windows 进程树，排除 vitest）。改了 packages/config 要 `pnpm -F @dt/config build`。
- 名字最多 10 个字、说明最多 30 个字、备注最多 100 字；字数按字素（`Intl.Segmenter`）算，👨‍🍳 算 1。
- 定制称号在所有语言里显示原文，不转繁体、不翻译。
- 附件里称号最多 5 个；`days` 1~3650；`days` 和 `until` 二选一，都不填是永久。
- 一次邮件最多 50 家店，都要在当前区服。
- 不发小镇新闻。活动奖励、补偿不支持称号。
- 玩家看的简中用半角括号、“: ”“, ”；法文窄空格写 `\u202f` 转义、西语不换行空格写 `\u00a0` 转义（Write/Edit 会解码 `\u`，用 `String.fromCharCode(92)` 拼，写完查有没有原字符）。
- zh-TW 只用 `pnpm -F @dt/web i18n:tw` 生成，最后跑，不用 prettier。
- 提交只 `git add` 明确路径；不提交 问题记录.md、e2e/_*.cjs、shots/、.superpowers/。提交结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 推送前 `pnpm lint`（列出所有报问题的文件，只许 e2e/_*.cjs）、`pnpm format:check`、分包 typecheck 看退出码。

## Review Focus

1. **同一个称号几乎同时领两次**（两封邮件、两个码并发）：合并规则写在一条 `insert ... on conflict do update` 里，不先查后写；测试顺序领两封限时的，结果是晚的到期时间。
2. **发出后称号被改名、停用**：已发的邮件、码照样能领；摘要显示快照名字，“我的称号”显示新名字。测试停用后领取成功。
3. **名字只有零宽字符、方向控制符或空格**：清理后为空，拒绝；只有 emoji 加 ZWJ 的名字保留完整。
4. **多店邮件里 id 重复**：去重后每家一封，不发两封。
5. **只带一个已过期称号的邮件或码**：照常算领取（邮件之后能删，不会卡住），结果里写“已过期”。

---

### Task 1: shared——文字规则、附件里的称号、接口格式

**Files:**
- Create: `packages/shared/src/schemas/titles.ts`、`packages/shared/src/schemas/titles.test.ts`
- Modify: `packages/shared/src/schemas/mail.ts`（`rewardItems` 加 `icons`、`rewardItemsNoIcons`、`sendMailBody` 加 `restIds`）
- Modify: `packages/shared/src/schemas/activity.ts`（全部 `rewardItems` 换成 `rewardItemsNoIcons`）
- Modify: `packages/shared/src/schemas/admin.ts`（`grantIconBody` 加 `days`/`until`，key 允许 `c<id>`；`AdminIconDto` 不变）
- Modify: `packages/shared/src/index.ts`（导出）

**Interfaces — Produces:**
```ts
export const TITLE_MAX = 10, TITLE_DESC_MAX = 30, TITLE_NOTE_MAX = 100, MAIL_ICONS_MAX = 5, MAIL_RESTS_MAX = 50;
/** 去首尾空白、控制字符（含换行）、U+200B、U+FEFF、U+202A~202E、U+2066~2069；保留 U+200D、U+FE0F */
export function cleanTitleText(s: string): string;
/** 按字素数：Intl.Segmenter('zh', { granularity: 'grapheme' }) */
export function graphemeLen(s: string): number;
/** 先清理再量长度；min 1 时空串报 'empty'，超长 'too_long'；原文有换行 'newline' */
export const titleText: (max: number, opts?: { optional?: boolean }) => z.ZodType<string>;
export const CUSTOM_ICON_KEY = /^c([1-9]\d{0,9})$/;
export const iconKey = z.string().regex(/^(?:[a-z0-9_-]{1,32})$/); // 配置 key 和 c<id> 都满足
export const iconValidity = { days: z.number().int().min(1).max(3650).optional(), until: z.string().datetime({ offset: true }).optional() };
export type RewardIcon = { key: string; title: string; days?: number; until?: string; expired?: true };
// rewardItems: icons: z.array(z.object({ key: iconKey, title: z.string().max(40), ...iconValidity }).refine(days 和 until 不同时有)).max(MAIL_ICONS_MAX).optional()
// grantNonEmpty 判断加上 icons；同一 key 不能出现两次（'duplicate'）
export const rewardItemsNoIcons; // rewardItems.refine((i) => !i.icons?.length, { message: 'icons_not_allowed' })
export const createTitleBody = z.object({ title: titleText(TITLE_MAX), desc: titleText(TITLE_DESC_MAX, { optional: true }), note: titleText(TITLE_NOTE_MAX, { optional: true }) });
export const updateTitleBody = createTitleBody.partial().extend({ retired: z.boolean().optional() });
export const titleListQuery = z.object({ q: z.string().trim().max(40).optional() });
export interface AdminTitleDto { key: string; id: number | null; title: string; desc: string | null; note: string | null; source: 'custom' | 'shop' | 'kuji' | 'fund' | 'general'; retired: boolean; owners: number; createdBy: string | null; createdAt: string | null }
// sendMailBody: restIds: z.array(z.number().int().positive()).min(1).max(MAIL_RESTS_MAX).optional()；scope 'rest' 时 restId 或 restIds 至少一个
// grantIconBody: z.object({ key: iconKey, ...iconValidity }).refine(不同时有)
```
- 附件里 `title` 是快照，前端可以不传或传任意值，服务端会覆盖（Task 4），所以 schema 里 `title` 用 `z.string().max(40).default('')`。

- [ ] Step 1: 写 titles.test.ts：`graphemeLen('👨‍🍳🇨🇳ab') === 4`；`cleanTitleText('\u202e坏\u200b人 ')==='坏人'`；`cleanTitleText('👨‍🍳')` 保留 ZWJ；`titleText(10)` 接受 10 个字、拒绝 11 个、拒绝 `'\u200b\u2066 '`（empty）、拒绝 `'a\nb'`（newline）；rewardItems 带两个相同 key 报 duplicate、`days`+`until` 同时有报错、只有 icons 不算空；`rewardItemsNoIcons` 带 icons 报 icons_not_allowed；sendMailBody `scope:'rest'` 只给 `restIds` 通过。
- [ ] Step 2: `pnpm -F @dt/shared test titles` 失败（模块不存在）。
- [ ] Step 3: 实现；activity.ts 七处 `rewardItems` 换掉（`.nullable()` 那两处也换）。
- [ ] Step 4: shared 全量测试通过；`pnpm -F @dt/shared typecheck`。
- [ ] Step 5: 提交 “feat(shared): 称号文字规则、附件里的称号、后台称号接口格式”。

### Task 2: 表、类型、配置检查

**Files:**
- Create: `apps/server/src/db/migrations/0062_custom_icon.ts`、`apps/server/src/db/migrations/0062.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`
- Modify: `packages/config/src/build.ts`（looks 检查：icon key 匹配 `CUSTOM_ICON_KEY` 报错 `looks: icon ${key} reserved for custom titles`）、`packages/config/src/build.test.ts`

**Interfaces — Produces:**
```sql
create table custom_icon (
  id integer generated always as identity primary key,
  title text not null,
  descr text,
  note text,
  retired boolean not null default false,
  created_by integer references account(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
- Kysely `CustomIconTable`，DB 里 `custom_icon: CustomIconTable`。down：`drop table custom_icon`，并 `delete from rest_icon where icon_key ~ '^c[0-9]+$'`。

- [ ] Step 1: 停开发服。写 0062.test.ts（插一行、默认值；回退后表不在、`c1` 的 rest_icon 行被删）和 build.test 一条（key `c12` 报错）。
- [ ] Step 2: 两个测试失败。
- [ ] Step 3: 迁移、schema、index、build 检查；`pnpm -F @dt/config build`。
- [ ] Step 4: 两个测试和 config 全量通过。
- [ ] Step 5: 提交 “feat: 定制称号的表；配置称号的 key 不能占用 c<数字>”。

### Task 3: 称号定义解析和唯一的发放函数

**Files:**
- Create: `apps/server/src/modules/icons/defs.ts`、`apps/server/src/modules/icons/grant.ts`、`apps/server/src/modules/icons/icons.test.ts`
- Modify: `apps/server/src/modules/friend/looks.ts`（mine 用 resolver）、`apps/server/src/modules/friend/reads.ts`（访问页）、`apps/server/src/modules/restaurant/service.ts`（shownIcons）、`apps/server/src/modules/admin/icons.ts`（list 用 resolver；grant 用 grantIcon，带有效期）、`apps/server/src/modules/admin/routes.ts`、`apps/server/src/modules/kuji/service.ts`（grantIcon 换成共用函数，永久）
- Test: `apps/server/src/modules/admin/icons.test.ts`（发放后自动展示、带有效期）

**Interfaces — Produces:**
```ts
// defs.ts
export interface IconDef { key: string; title: string; desc: string | undefined; custom: boolean; retired: boolean }
export const customKey = (id: number) => `c${id}`;
export function customId(key: string): number | null;   // CUSTOM_ICON_KEY
/** 配置的直接取；c<id> 一次查 custom_icon。查不到的 key 不在结果里 */
export async function iconDefs(db: Kysely<DB>, config: GameConfig, keys: Iterable<string>): Promise<Map<string, IconDef>>;

// grant.ts
/** null 永久；'expired' 表示 until 已过 */
export function expiryOf(v: { days?: number; until?: string }, now: Date): Date | null | 'expired';
/**
 * 发一个称号（设计 三·领取规则）：一条 upsert——
 *   没有或已过期：按这次写（到期、granted_at、granted_by），展示中的不满 5 个就展示；
 *   永久：不变；限时+永久：变永久；限时+限时：取晚的；续期不改展示状态
 */
export async function grantIcon(tx: Kysely<DB>, a: { restId: number; key: string; expiresAt: Date | null; now: Date; grantedBy?: number | null }): Promise<void>;
```
- upsert 的 `doUpdateSet`：以 `expired = rest_icon.expires_at is not null and rest_icon.expires_at <= now` 为条件——
  `expires_at = case when expired then excluded.expires_at when rest_icon.expires_at is null or excluded.expires_at is null then null else greatest(rest_icon.expires_at, excluded.expires_at) end`，`shown`、`granted_at`、`granted_by` 都是 `case when expired then excluded.x else rest_icon.x end`。插入时的 `shown` 用事先数的“除这个 key 外展示中的活称号数 < MAX_SHOWN_ICONS”。
- 读的地方：原来 `defs.get(x.icon_key)` 换成 `await iconDefs(db, config, rows.map(r => r.icon_key))`，返回的 `title`/`desc` 用解析出来的。
- 后台直接发：`grant(actor, restId, key, validity)`，`expiryOf` 是 'expired' 就报 VALIDATION_FAILED（path until）；key 用 `iconDefs` 判断存在、没停用；时钟用 `game.deps.now()`（和读称号的 `iconLive` 同一个）。

- [ ] Step 1: 写 icons.test.ts：合并规则表格的四种情况各一条（直接调 grantIcon，用测试库造店）；已有 5 个展示中时新称号不展示；续期不改 shown；`iconDefs` 同时解析 `founder` 和 `c<id>`，删掉的 id 不在结果里。改 admin/icons.test：发放后 `shown: true`、带 `days: 7` 的有 `expiresAt`、先发 7 天再发永久变永久、`until` 已过报错、发定制称号 `c<id>`、发停用的报错。加一条 kuji：店里已有限时 `kuji_a`，抽中后变永久（用 kuji.test 里现有的抽中 A 赏的造法）。
- [ ] Step 2: 跑这三个文件，失败。
- [ ] Step 3: 实现 defs.ts、grant.ts，改读写各处。
- [ ] Step 4: 跑 icons、admin/icons、kuji、friend、restaurant 相关测试通过。
- [ ] Step 5: 提交 “feat: 称号统一解析（配置 + 定制），发称号只走一个函数：合并到期时间、新拿到自动展示；修后台重发改回永久、一番赏不续成永久”。

### Task 4: 附件里的称号——检查、领取、多店邮件、兑换码

**Files:**
- Modify: `apps/server/src/modules/mail/reward.ts`（`checkRewardIcons`、`grantRewardOp` 发称号、`brokenItems` 认 icons）
- Modify: `apps/server/src/modules/mail/admin.ts`（检查 + 多店）、`apps/server/src/modules/redeem/admin.ts`（检查）、`apps/server/src/modules/mail/inbox.ts`、`apps/server/src/modules/redeem/redeem.ts`（结果带 expired）
- Test: `apps/server/src/modules/mail/reward.test.ts`、`apps/server/src/modules/mail/admin.test.ts`、`apps/server/src/modules/redeem/*.test.ts`（找现有的兑换测试文件加）

**Interfaces:**
- Consumes: Task 3 的 `iconDefs`、`grantIcon`、`expiryOf`。
- Produces:
```ts
/** 称号存在、没停用、until 晚于现在；把每项的 title 换成当前名字（快照）。返回新的 items */
export async function checkRewardIcons(db: Kysely<DB>, config: GameConfig, items: RewardItems, now: Date): Promise<RewardItems>;
// grantRewardOp 返回 Promise<RewardItems>：领到的 items，过期跳过的那项带 expired: true
// brokenItems：icons 里的 key 在 iconDefs 里查不到算坏（改成 async：brokenItems(db, config, items)）
```
- `grantRewardOp` 里：`expiryOf` 为 'expired' 的跳过并标 expired；其他调 `grantIcon(op.tx, { restId: op.rest.id, key, expiresAt, now: op.now })`。邮件领取、兑换的返回值用它的返回。
- 多店邮件：`restIds`（或单个 `restId`）去重后逐个查在不在 `shardId`，有不在的报 RESTAURANT_NOT_FOUND，`details.ids` 列出；一个事务里每家 `sendMail(scope 'rest')`；审计一条 `mail.send`，detail 带 `restIds`、`mailIds`。返回值改成 `AdminMailDto[]`（前端 Task 7 跟着改）。
- `brokenItems` 改 async 后，inbox 列表里每封都要算：先收集整页所有 icon key 一次 `iconDefs`，再逐封判断，不要每封查一次。

- [ ] Step 1: 写测试：发邮件带不存在的、停用的、`until` 已过的称号都报 VALIDATION_FAILED；前端传的 title 被服务端改成真名；邮件 `restIds: [a, a, b]` 发出两封、a 看不到 b 的；有一家不在区服整个拒绝且一封都没发；领取限时 `days: 7` 的到期是领取时 + 7 天；两封都带同一称号（3 天、7 天）先后领，结果是 7 天那个；只带一个 `until` 已过称号的邮件（直接写库造）能领、结果 `expired: true`、之后能删；邮件发出后称号停用仍能领；共享码带 `days: 3`，两家店先后兑换各自从兑换时起算；活动定义里带 icons 被拒绝（activity 的创建接口）。
- [ ] Step 2: 跑，失败。
- [ ] Step 3: 实现。
- [ ] Step 4: 跑 mail、redeem、activity、admin 目录测试通过。
- [ ] Step 5: 提交 “feat: 邮件和兑换码能带称号（永久、领取后 N 天、到某个时间）；邮件能一次发给几家店，每家一封”。

### Task 5: 后台称号的增删改查

**Files:**
- Create: `apps/server/src/modules/admin/titles.ts`、`apps/server/src/modules/admin/titles.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`

**Interfaces — Produces:** 路由（都在 `/api/v1/admin` 下）
- `GET /titles?q=`（mod）：`AdminTitleDto[]`；定制的按 id 倒序在前，配置的在后；`q` 匹配名字或备注（`ilike`，配置的只匹配名字）；`owners` 是活着的 `rest_icon` 行数（一次 group by）。配置称号的 source：key 在某个 `shop` 里是 shop、在 kuji 配置里是 kuji、在 `fundMedals` 里是 fund，其余 general。
- `POST /titles`（admin）：建，返回 `AdminTitleDto`；审计 `title.create`。
- `PATCH /titles/:id`（admin）：改名字、说明、备注、停用；`updated_at = now()`；审计 `title.update`（detail 带改前改后）。
- `DELETE /titles/:id`（admin）：有 `rest_icon` 行（含过期的）或 `mail.items -> 'icons' @> '[{"key":"c<id>"}]'`、`redeem_code.items` 同样有引用时报 INVALID_STATE `title_in_use`；否则删，审计 `title.delete`。

- [ ] Step 1: 写测试：协管能列不能建；建好的出现在列表最前、owners 0；搜备注能搜到；改名后 `GET /restaurants/:id/icons` 显示新名字；停用后列表里 retired true；有人拥有时删报 title_in_use；被未领的邮件引用时删报错；没引用的删成功；审计三条动作都有。
- [ ] Step 2: 失败。
- [ ] Step 3: 实现。
- [ ] Step 4: 通过；跑 admin/permissions.test（新路由要在权限表里，如果那个测试要求登记）。
- [ ] Step 5: 提交 “feat: 后台称号页的接口：列表（定制和配置）、新建、改、停用、删”。

### Task 6: 网页——称号徽章统一

**Files:**
- Create: `apps/web/src/components/IconTag.vue`、`apps/web/src/components/IconTag.test.ts`
- Modify: `apps/web/src/views/RestaurantHomeView.vue`、`apps/web/src/views/FriendRestView.vue`、`apps/web/src/styles/main.css`（删 `.dt-icon-tag`）、`apps/web/src/views/RestaurantHomeView.test.ts`（392 行改断言）

**Interfaces — Produces:** `<IconTag :title="string" />`，渲染 `<span class="badge bg-warning text-dark me-1" data-testid="icon-tag">{{ title }}</span>`。

- [ ] Step 1: IconTag.test（class、文字、emoji 原样）；首页测试改成找 `icon-tag` 且 class 含 `bg-warning`；访问页测试同样（FriendRestView.test 里有就改，没有就加一条）。
- [ ] Step 2: 失败。
- [ ] Step 3: 实现，两页换成组件，删 CSS（查 `dt-icon-tag` 没有别的地方用；样式重名测试仍过）。
- [ ] Step 4: 跑这几个测试和 styles 相关测试通过。
- [ ] Step 5: 提交 “feat(web): 称号徽章统一成访问页的黄底样式，首页也用”。

### Task 7: 网页——附件摘要、附件编辑器、邮件多店、兑换码、玩家页、称号页

**Files:**
- Modify: `apps/web/src/utils/reward.ts`（+ 测试）、`apps/web/src/i18n/locales/{zh-CN,en,es,fr}/util.ts`
- Modify: `apps/web/src/components/admin/RewardItemsEditor.vue`（+ 测试）、`apps/web/src/views/admin/AdminMailView.vue`（+ 测试）、`apps/web/src/views/admin/AdminCodesView.vue`（+ 测试）、`apps/web/src/components/admin/RestIcons.vue`（+ 测试）
- Create: `apps/web/src/views/admin/AdminTitlesView.vue`（+ 测试）、`apps/web/src/components/admin/TitlePicker.vue`（+ 测试）
- Modify: `apps/web/src/api/admin.ts`、`apps/web/src/router.ts`、`apps/web/src/views/admin/AdminLayout.vue`

**Interfaces:**
- `rewardSummary(i, names)`：`names` 加可选 `icon?(key): { title } | undefined`（catalog store 已有 `icon`）；称号项文字：配置的用 `names.icon(key)?.title`，否则用快照 `title`。
- util.reward 加三条（zh-CN 示例）：
  - `icon: (title: string) => \`称号「${title}」\``
  - `iconDays: (n: number) => \` (领取后 ${n} 天)\``、`iconUntil: (time: string) => \` (到 ${time})\``（time 用 `gameDateTime(until, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })`）
  - `iconExpired: (title: string) => \`称号「${title}」已过期\``
  - en：`Title "${t}"`、` (${n} days after claiming)`（n 为 1 时 `1 day`）、` (until ${time})`、`Title "${t}" has expired`；es、fr 照同样意思写，法文冒号、引号前后按 `\u202f` 规则（用 « » 加 `\u202f`），西语引号用 « »。
- `TitlePicker`（`v-model: { key, title, days?, until? }`）：下拉（`GET /titles` 结果，停用的不出现，定制的一组、配置的一组）+ 搜索框 + “新建称号”小表单（名字、说明、备注，前端用 `graphemeLen` 显示字数，点保存调 `POST /titles` 后选中；名字和列表里没停用的称号重名时显示“已有同名称号”但不拦）+ 有效期三选一（永久 / 领取后 N 天 / 到某个时间 `datetime-local`）。
- `RewardItemsEditor` 加 prop `icons?: boolean`（默认 false），开时显示“称号”行列表，最多 5 行，用 TitlePicker；`items()` 输出 `icons`；`overLimit` 加“第 N 个称号没选”“有效天数 1~3650”。只在 AdminMailView、AdminCodesView 里开。
- AdminMailView：单家餐厅的输入改成多店输入框（逗号、空格、换行分隔），逐个查店名店主（沿用现在的 `adminApi.restaurant`），列出每个 id 的结果，有错的标红并禁止发送；`send` 传 `restIds`；确认框写“发给 N 家店（每家一封）”。`adminApi.sendMail` 返回 `AdminMailDto[]`。
- AdminCodesView：开 `:icons="true"`；共享码且附件有称号时显示提示“共享码可以被转发，只想给特定的人请用一次性码”；有称号的 `until` 早于兑换码的截止时间时显示提示“兑换码截止前称号就过期了，过期后兑换会跳过称号”。
- RestIcons：选择框换成 TitlePicker（不显示新建），带有效期；`adminApi.grantIcon(restId, { key, days?, until? })`。
- AdminTitlesView（路由 `/admin/titles`，导航“称号”放在“邮件”后面）：搜索、定制和配置两张表、新建、行内改（名字、说明、备注）、停用/启用、删（确认框；报 title_in_use 时提示“有人拥有或有邮件、兑换码引用，只能停用”）。非管理员只读。

- [ ] Step 1: 先写测试：reward.test（配置称号用目录名字、定制用快照、三种有效期、expired 文案，四种语言各一条）；RewardItemsEditor.test（开 icons 后选称号输出 `icons`、没选报 overLimit、不开时没有这一栏）；TitlePicker.test（新建后选中、停用的不出现、字数按字素、重名时有提示但能保存）；AdminMailView.test（多店输入、重复 id 只算一次、有错禁止发送、请求体是 `restIds`）；AdminCodesView.test（两条提示）；RestIcons.test（带 days 的请求体）；AdminTitlesView.test（列表、新建、停用、删除失败提示）。
- [ ] Step 2: 跑，失败。
- [ ] Step 3: 实现。法文、西语的转义用 `String.fromCharCode(92)` 拼，写完检查文件里没有原始的 U+202F、U+00A0。
- [ ] Step 4: web 相关测试通过；`pnpm -F @dt/web typecheck`。
- [ ] Step 5: 提交 “feat(web): 后台称号页；邮件和兑换码的附件能选或新建称号、设有效期；邮件一次发几家店；玩家页发称号能限时；附件摘要显示称号”。

### Task 8: 更新记录、backlog、繁中、全量检查

**Files:**
- Modify: `apps/web/src/i18n/locales/{zh-CN,en,es,fr}/site.ts`（更新记录 `titles1009`）、`docs/backlog.md`
- Generated: zh-TW（`pnpm -F @dt/web i18n:tw`）

- [ ] Step 1: 更新记录（zh-CN）：“称号徽章统一成黄底样式, 首页和访问店铺一致；之后可能通过邮件或兑换码收到称号, 限时的会写明有效期”。en/es/fr 同义手写。
- [ ] Step 2: backlog 加：称号配图；活动奖励带称号；配置称号的停用标记；定制称号的繁中转换和翻译。
- [ ] Step 3: `pnpm -F @dt/web i18n:tw`；跑 i18n 相关测试（zh-CN、punct、frEsPunct、parens、locales）。
- [ ] Step 4: 全量：server、web、config、shared 测试；lint（列出文件）、format:check、四个包 typecheck 看退出码。
- [ ] Step 5: 提交 “docs: 定制称号的更新记录和 backlog”。

### 终审

- Opus 审整个分支（review-package），Critical/Important 一轮修（每条先写失败测试），Minor 记 backlog 和 PR 说明。
- 起开发服（独立进程），用测试号在本地走一遍：建称号 → 发给两家店 → 领取 → 首页、访问页显示 → 兑换码限时。
- 推送、开 PR（结尾 🤖 Generated with [Claude Code](https://claude.com/claude-code)），PR 里写部署注意：有迁移 0062。
