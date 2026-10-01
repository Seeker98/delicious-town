# 子项目 6A-1：邮箱、公告、命名帽子 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家有邮箱（单店、区服、全部三种收件范围，带附件，领取、删除、过期），运营者能在后台发邮件、撤回、发公告。赞助者能拿到可命名的玉级帽子，六星时自动换成同名铉级帽子。

**Architecture:**
- 全服邮件一封一行（`mail`），每家店的已读、已领、已删存在 `mail_state`。
- 附件复用补偿发放逻辑，加上命名帽子，统一走 `grantRewardOp`。
- 公告存 `announcement`，重要公告按账号记已看（`announcement_seen`）。
- 六星换铉由 worker 每分钟扫描一次（`ops-scan`）。6A-2 会往同一个扫描里加邀请奖励。
- 迁移 0018 一次建好 6A 全部的表，包括 6A-2 要用的兑换码和邀请表，免得 6A-2 再加迁移。

**Tech Stack:** Fastify 5、Kysely/PostgreSQL、Zod、Vue 3 + Pinia + Bootstrap 5、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject6a-mail-codes-invite-design.md`（下文"设计"）。本计划覆盖设计里 6A-1 的部分：§2 裁定 1~12、23~27，§3（全部表），§4，§5，§6 的邮件、公告接口，§7 第 4 步（六星换铉），§8 的邮箱、公告、后台邮件和公告页、补偿页改发邮件，§9，§10 中对应部分。兑换码、邀请在 6A-2 的计划里。

## Global Constraints

- 写操作一律 POST；JSON-only 的 CSRF 检查和幂等只对 POST 生效，前端 api 只有 get、post。
- 玩家写操作走 `runOp(d, ctx, { feature, source }, fn)`；worker 对单店的写操作走 `runSystemOp(d, shardId, restId, { source, now }, fn)`。
- 后台每个处理函数第一步是 `requireRole(db, req, 'mod' | 'admin')`；写操作只有 admin，写审计 `writeAudit`，和业务在同一事务里。
- 邮件的 `created_at`、`expires_at` 用数据库时钟（列默认值），和 `restaurant.created_at` 的时钟一致（照搬 `admin_grant` 的做法和注释）。公告的生效时间段按游戏时钟 `d.now()` 判断。
- 附件上限和补偿一致：`GRANT_LIMITS`（银币、经验 ≤ 1 亿，钻石 ≤ 10 万，道具、食材每种 ≤ 9999），每种最多 50 项；命名帽子每封最多 5 顶，名字 1~8 个字。
- 邮件标题 ≤ 40 字，正文 ≤ 1000 字；公告标题 ≤ 40 字，正文 ≤ 2000 字。长度一律按字符（`[...s].length`）算，不按 UTF-16。
- 邮件 30 天过期（`tuning.mail.expiresDays = 30`），列表最多 100 封（`tuning.mail.listMax = 100`）。
- 新功能开关 `mail`（默认开），加入 `IMPLEMENTED_FEATURES`。
- 流水来源和个人日志类型：邮件领取用 `mail.claim`；补偿仍用 `admin.grant`。
- 文案用中文；代码注释风格同现有代码，用中文写清"为什么"。
- 每个任务结束跑该任务的测试命令；整个计划结束跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter @dt/web e2e`。
- 数据集文件（`data/dataset`、`data/designed`）会被同步脚本覆盖，新道具只能加在 `packages/config/data/game/equip_lore.json`。改完配置要跑 `pnpm --filter @dt/config build`。

## Review Focus

1. 撤回、过期和领取同时发生：领取在锁店事务里重新读邮件，撤回或过期之后必须领不了，附件不能到账。（Task 6 测试"撤回后领不了"覆盖撤回；过期由"过期的看不到、领不了"覆盖。）
2. 一键全领时，某一封附件发放出错（比如道具 id 在配置里已删除）：其他邮件照常领取，出错的那封保持未领，并告诉玩家有几封没领成。（Task 6 测试"一封出错不影响其他"。）
3. 发送后才开的店不能看到也不能领全服邮件，包括直接调领取接口时。（Task 6 测试"后开的店看不到也领不了"。）
4. 命名帽子的名字带换行、首尾空格、超过 8 个字、或者空字符串：校验拒绝，或者去掉空格后存储，名字不能原样拼进 HTML。（Task 3 测试"帽子名字校验"；前端一律用文本插值显示。）
5. 六星换铉扫描时，同一家店有两顶命名玉帽：两顶各换一次；再扫一遍不重复发。（Task 9 测试"两顶各换一次，重扫不重复"。）

---

## 文件结构

**新建（服务端）**
- `apps/server/src/db/migrations/0018_ops_mail.ts`、`0018.test.ts`：6A 全部的表和列。
- `apps/server/src/modules/mail/reward.ts`：`grantRewardOp`，附件发放（含命名帽子）。
- `apps/server/src/modules/mail/rules.ts`：可见性、可领判断等纯函数。
- `apps/server/src/modules/mail/inbox.ts`：玩家邮箱的列表、已读、领取、删除。
- `apps/server/src/modules/mail/send.ts`：`sendMail`，所有发邮件的入口，后台、补偿、换铉共用。
- `apps/server/src/modules/mail/admin.ts`：后台邮件的发送、列表、撤回。
- `apps/server/src/modules/mail/service.ts`、`routes.ts`：玩家接口。
- `apps/server/src/modules/announce/service.ts`、`routes.ts`、`admin.ts`：公告。
- `apps/server/src/modules/equip/hats.ts`：命名帽子的生成和显示名。
- `apps/server/src/modules/ops/scan.ts`：worker 的 `ops-scan` 任务，本计划只做六星换铉。

**新建（共享、配置）**
- `packages/shared/src/schemas/mail.ts`、`announce.ts`。

**新建（前端）**
- `apps/web/src/utils/equipName.ts`
- `apps/web/src/stores/mail.ts`
- `apps/web/src/views/MailView.vue`
- `apps/web/src/components/AnnounceBanner.vue`、`AnnouncePopup.vue`
- `apps/web/src/components/admin/RewardItemsEditor.vue`
- `apps/web/src/views/admin/AdminMailView.vue`、`AdminAnnounceView.vue`
- `apps/web/e2e/mail.spec.ts`

**修改**
- `db/schema.ts`、`db/migrations/index.ts`、`core/features.ts`、`game.ts`、`modules/index.ts`、`worker/jobs.ts`。
- 补偿：`admin/grants.ts`、`admin/routes.ts`。
- 厨具名字：`equip/service.ts`、`friend/reads.ts`、`admin/players.ts`。
- 配置：`packages/config/src/ids.ts`、`tuning.ts`、`data/game/tuning.json`、`data/game/equip_lore.json`。
- 共享：`packages/shared/src/schemas/admin.ts`、`equip.ts`、`friend.ts`、`index.ts`。
- 前端：`AppHeader.vue`、`App.vue`、`router.ts`、`api/endpoints.ts`、`api/admin.ts`、`LoginView.vue`、`RestaurantHomeView.vue`、`EquipView.vue`、`EquipDetailView.vue`、`FriendRestView.vue`、`AdminPlayerView.vue`、`AdminGrantsView.vue`、`AdminLayout.vue`、`utils/events.ts`。
- 文档：`docs/deploy.md`；`docs/rules/` 下新建 `邮箱和公告.md`。

---

### Task 1：迁移 0018

**Files:**
- Create: `apps/server/src/db/migrations/0018_ops_mail.ts`, `apps/server/src/db/migrations/0018.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`, `apps/server/src/db/schema.ts`

**Interfaces:**
- Produces: 表 `mail`、`mail_state`、`announcement`、`announcement_seen`、`redeem_code`、`redeem_use`、`invite_reward`；`equip.custom_name`、`equip.xuan_sent_at`；`schema.ts` 里对应的 `MailTable`、`MailStateTable`、`AnnouncementTable`、`AnnouncementSeenTable`、`RedeemCodeTable`、`RedeemUseTable`、`InviteRewardTable`，以及 `EquipTable` 的两个新字段。

- [ ] **Step 1：写失败的迁移测试**

```ts
// apps/server/src/db/migrations/0018.test.ts
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

const mail = (patch: Record<string, unknown> = {}) =>
  db
    .insertInto('mail')
    .values({ scope: 'shard', shard_id: shard, title: 't', body: 'b', source: 'admin', ...patch })
    .returning(['id', 'created_at', 'expires_at'])
    .executeTakeFirstOrThrow();

describe('迁移 0018', () => {
  it('邮件默认 30 天后过期；收件范围只能是三种之一', async () => {
    const m = await mail();
    expect(m.expires_at.getTime() - m.created_at.getTime()).toBe(30 * 86_400_000);
    await expect(mail({ scope: 'x' })).rejects.toThrow();
  });

  it('单店邮件必须有店，区服邮件必须有区服', async () => {
    await expect(mail({ scope: 'rest', rest_id: null })).rejects.toThrow();
    await expect(mail({ scope: 'shard', shard_id: null })).rejects.toThrow();
    expect((await mail({ scope: 'all', shard_id: null })).id).toBeGreaterThan(0);
  });

  it('同一封邮件同一家店只有一行状态', async () => {
    const m = await mail();
    await db.insertInto('mail_state').values({ mail_id: m.id, rest_id: rest }).execute();
    await expect(db.insertInto('mail_state').values({ mail_id: m.id, rest_id: rest }).execute()).rejects.toThrow();
  });

  it('兑换码大写唯一；通用码同一家店只能用一次', async () => {
    const c = await db
      .insertInto('redeem_code')
      .values({ code: 'ABC', kind: 'shared', items: JSON.stringify({ coin: 1 }), note: '', actor_account_id: account })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto('redeem_code')
        .values({ code: 'abc', kind: 'single', items: '{}', note: '', actor_account_id: account })
        .execute(),
    ).rejects.toThrow();
    const use = { code_id: c.id, rest_id: rest, account_id: account };
    await db.insertInto('redeem_use').values(use).execute();
    await expect(db.insertInto('redeem_use').values(use).execute()).rejects.toThrow();
  });

  it('邀请奖励每个被邀请人每档一行；厨具有自定义名字和换铉时间', async () => {
    const row = {
      invitee_account_id: account,
      stage: 'lv10',
      shard_id: shard,
      invitee_rest_id: rest,
      status: 'sent',
      month: '2026-10',
    };
    await db.insertInto('invite_reward').values(row).execute();
    await expect(db.insertInto('invite_reward').values(row).execute()).rejects.toThrow();
    await expect(
      db.insertInto('invite_reward').values({ ...row, stage: 'lv99' }).execute(),
    ).rejects.toThrow();
    const e = await db
      .insertInto('equip')
      .values({ rest_id: rest, goods_id: 30, part: 1, suit_id: 0, custom_name: '大橘' })
      .returning(['custom_name', 'xuan_sent_at'])
      .executeTakeFirstOrThrow();
    expect(e).toEqual({ custom_name: '大橘', xuan_sent_at: null });
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/db/migrations/0018.test.ts`
Expected: FAIL，表 `mail` 不存在（或 TypeScript 报 `mail` 不是已知表）。

- [ ] **Step 3：写迁移**

```ts
// apps/server/src/db/migrations/0018_ops_mail.ts
import { sql, type Kysely } from 'kysely';

/** 子项目 6A：邮箱、公告、兑换码、邀请、命名帽子（设计 §3）。6A-2 用到的兑换码、邀请表也在这里建 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // created_at、expires_at 用数据库时钟：和 restaurant.created_at 比较"发送时已存在的店"（裁定 2）
  await sql`create table mail (
    id serial primary key,
    scope text not null check (scope in ('rest', 'shard', 'all')),
    shard_id integer references shard(id) on delete cascade,
    rest_id integer references restaurant(id) on delete cascade,
    min_level integer,
    title text not null,
    body text not null,
    items jsonb,
    source text not null,
    actor_account_id integer references account(id),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 days'),
    revoked_at timestamptz,
    check (scope <> 'rest' or (rest_id is not null and shard_id is not null)),
    check (scope <> 'shard' or shard_id is not null)
  )`.execute(db);
  await sql`create index mail_rest on mail (rest_id, created_at desc) where scope = 'rest'`.execute(db);
  await sql`create index mail_shard on mail (shard_id, created_at desc) where scope = 'shard'`.execute(db);
  await sql`create index mail_all on mail (created_at desc) where scope = 'all'`.execute(db);
  await sql`create table mail_state (
    mail_id integer not null references mail(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    read_at timestamptz,
    claimed_at timestamptz,
    deleted_at timestamptz,
    primary key (mail_id, rest_id)
  )`.execute(db);

  await sql`create table announcement (
    id serial primary key,
    shard_id integer references shard(id) on delete cascade,
    title text not null,
    body text not null,
    important boolean not null default false,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    actor_account_id integer not null references account(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    check (ends_at > starts_at)
  )`.execute(db);
  await sql`create table announcement_seen (
    account_id integer not null references account(id) on delete cascade,
    announcement_id integer not null references announcement(id) on delete cascade,
    seen_at timestamptz not null default now(),
    primary key (account_id, announcement_id)
  )`.execute(db);

  await sql`create table redeem_code (
    id serial primary key,
    code text not null unique check (code = upper(code)),
    kind text not null check (kind in ('shared', 'single')),
    batch_id integer,
    items jsonb not null,
    shard_id integer references shard(id) on delete cascade,
    min_level integer,
    max_uses integer,
    used_count integer not null default 0,
    starts_at timestamptz,
    ends_at timestamptz,
    note text not null,
    actor_account_id integer not null references account(id),
    created_at timestamptz not null default now(),
    disabled_at timestamptz,
    check (max_uses is null or used_count <= max_uses)
  )`.execute(db);
  await sql`create index redeem_code_batch on redeem_code (batch_id) where batch_id is not null`.execute(db);
  await sql`create table redeem_use (
    id serial primary key,
    code_id integer not null references redeem_code(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    account_id integer not null references account(id) on delete cascade,
    used_at timestamptz not null default now(),
    unique (code_id, rest_id)
  )`.execute(db);

  await sql`create table invite_reward (
    invitee_account_id integer not null references account(id) on delete cascade,
    stage text not null check (stage in ('newbie', 'lv10', 'lv30')),
    inviter_account_id integer references account(id) on delete cascade,
    shard_id integer not null references shard(id) on delete cascade,
    invitee_rest_id integer not null references restaurant(id) on delete cascade,
    status text not null check (status in ('pending', 'sent', 'capped')),
    month text not null,
    mail_id integer references mail(id) on delete set null,
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    primary key (invitee_account_id, stage)
  )`.execute(db);
  await sql`create index invite_reward_inviter on invite_reward (inviter_account_id, month)`.execute(db);

  await sql`alter table equip add column custom_name text, add column xuan_sent_at timestamptz`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table equip drop column if exists custom_name, drop column if exists xuan_sent_at`.execute(db);
  for (const t of [
    'invite_reward',
    'redeem_use',
    'redeem_code',
    'announcement_seen',
    'announcement',
    'mail_state',
    'mail',
  ])
    await sql`drop table if exists ${sql.table(t)}`.execute(db);
}
```

在 `migrations/index.ts` 里照现有格式加 `import * as m0018 from './0018_ops_mail';` 和 `'0018_ops_mail': m0018,`。

在 `db/schema.ts` 里加表类型（照 `ForumPostTable` 的写法，有默认值的列用 `Generated<>`，可空列用 `T | null`），并在 `DB` 接口注册：

```ts
export interface MailTable {
  id: Generated<number>;
  scope: 'rest' | 'shard' | 'all';
  shard_id: number | null;
  rest_id: number | null;
  min_level: number | null;
  title: string;
  body: string;
  items: unknown | null;
  source: string;
  actor_account_id: number | null;
  created_at: Generated<Date>;
  expires_at: Generated<Date>;
  revoked_at: Date | null;
}
export interface MailStateTable {
  mail_id: number;
  rest_id: number;
  read_at: Date | null;
  claimed_at: Date | null;
  deleted_at: Date | null;
}
export interface AnnouncementTable {
  id: Generated<number>;
  shard_id: number | null;
  title: string;
  body: string;
  important: Generated<boolean>;
  starts_at: Date;
  ends_at: Date;
  actor_account_id: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}
export interface AnnouncementSeenTable {
  account_id: number;
  announcement_id: number;
  seen_at: Generated<Date>;
}
export interface RedeemCodeTable {
  id: Generated<number>;
  code: string;
  kind: 'shared' | 'single';
  batch_id: number | null;
  items: unknown;
  shard_id: number | null;
  min_level: number | null;
  max_uses: number | null;
  used_count: Generated<number>;
  starts_at: Date | null;
  ends_at: Date | null;
  note: string;
  actor_account_id: number;
  created_at: Generated<Date>;
  disabled_at: Date | null;
}
export interface RedeemUseTable {
  id: Generated<number>;
  code_id: number;
  rest_id: number;
  account_id: number;
  used_at: Generated<Date>;
}
export interface InviteRewardTable {
  invitee_account_id: number;
  stage: 'newbie' | 'lv10' | 'lv30';
  inviter_account_id: number | null;
  shard_id: number;
  invitee_rest_id: number;
  status: 'pending' | 'sent' | 'capped';
  month: string;
  mail_id: number | null;
  created_at: Generated<Date>;
  sent_at: Date | null;
}
```

在 `EquipTable` 加 `custom_name: string | null;`、`xuan_sent_at: Date | null;`。在 `DB` 接口加 `mail: MailTable; mail_state: MailStateTable; announcement: AnnouncementTable; announcement_seen: AnnouncementSeenTable; redeem_code: RedeemCodeTable; redeem_use: RedeemUseTable; invite_reward: InviteRewardTable;`。

`mail_state` 的三个时间列可空、插入时可省略：照现有可空列的写法，Kysely 的 `T | null` 列在 insert 时可省。如果类型检查要求必填，就改用 `ColumnType<Date | null, Date | null | undefined, Date | null>`（`schema.ts` 里已有同类写法时照抄）。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/db/migrations/0018.test.ts`
Expected: PASS（5 个用例）。测试库在 globalSetup 里自动迁移；如果没有，按 `docs/deploy.md` 的测试库说明重跑迁移。

- [ ] **Step 5：迁移 dev 库并提交**

Run: `pnpm --filter @dt/server migrate`（或 `docs/deploy.md` 里写的迁移命令）。只新增表和列，不动已有数据。

```bash
git add apps/server/src/db
git commit -m "feat(db): 迁移 0018——邮件、公告、兑换码、邀请奖励表，厨具自定义名字"
```

---

### Task 2：配置——赞助帽子、邮件数值、功能开关

**Files:**
- Modify: `packages/config/data/game/equip_lore.json`, `packages/config/src/ids.ts`, `packages/config/src/tuning.ts`, `packages/config/data/game/tuning.json`, `packages/config/src/build.test.ts`, `apps/server/src/core/features.ts`

**Interfaces:**
- Produces:
  - `SPONSOR_HATS: { readonly jade: 641; readonly xuan: 642 }`，`SPONSOR_HAT_PREFIX: { jade: '玉'; xuan: '铉' }`，`type HatTier = 'jade' | 'xuan'`（从 `@dt/config` 导出）。
  - `tuning.mail: { expiresDays: number; listMax: number }`。
  - 功能 `mail` 在 `IMPLEMENTED_FEATURES` 里。

- [ ] **Step 1：写失败的测试**（追加到 `packages/config/src/build.test.ts` 末尾）

```ts
describe('赞助帽子和邮件数值（子项目 6A-1）', () => {
  it('玉级、铉级赞助帽子：冠，创意 22 / 40，不算套装，不掉落，不卖', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    const jade = goods.get(SPONSOR_HATS.jade)!;
    const xuan = goods.get(SPONSOR_HATS.xuan)!;
    expect(jade.name).toBe('玉•赞助之帽');
    expect(xuan.name).toBe('铉•赞助之帽');
    expect(jade.equip).toMatchObject({ part: 5, suitId: 90, minLevel: 13 });
    expect(jade.equip!.ranges.creatives).toBe(22);
    expect(xuan.equip).toMatchObject({ part: 5, suitId: 99 });
    expect(xuan.equip!.ranges.creatives).toBe(40);
    for (const g of [jade, xuan]) {
      expect(g.awardFlag).toBeNull();
      expect(g.onSale).toBe(false);
    }
  });

  it('邮件 30 天过期，列表最多 100 封', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.tuning.mail).toEqual({ expiresDays: 30, listMax: 100 });
  });
});
```

在文件顶部 import 里加 `import { SPONSOR_HATS } from './ids';`。同时把"没有错误，数量正确"用例里的 `toHaveLength(615)` 改为 `toHaveLength(617)`。

- [ ] **Step 2：运行，确认失败**

Run: `cd packages/config && npx vitest run src/build.test.ts`
Expected: FAIL（`SPONSOR_HATS` 未导出；道具数 615 ≠ 617）。

- [ ] **Step 3：实现**

`packages/config/src/ids.ts` 末尾：

```ts
/** 赞助帽子（子项目 6A）：发放时可以按件命名，显示为"玉•{名字}之帽"；铉级在餐厅六星时自动换给（设计 §5） */
export const SPONSOR_HATS = { jade: 641, xuan: 642 } as const;
export type HatTier = keyof typeof SPONSOR_HATS;
export const SPONSOR_HAT_PREFIX: Record<HatTier, string> = { jade: '玉', xuan: '铉' };
```

确认 `packages/config/src/index.ts` 已经 `export * from './ids'`（没有就加）。

`data/game/equip_lore.json` 的 `add` 数组末尾追加两项（数值照抄原版 227、373）：

```json
{
  "id": 641, "name": "玉•赞助之帽", "type": 4, "devicetype": 5, "maxNum": 99,
  "desc": "感谢对小镇作出贡献的餐厅。增加22点创意。",
  "value": { "part": 5, "essence": 15, "creatives": 22, "hole": 1, "max_hole": 5, "min_level": 13, "suitid": 90 },
  "level": 5, "coin": 0, "diamond": 0, "saleflag": 0, "subflag": 0
},
{
  "id": 642, "name": "铉•赞助之帽", "type": 4, "devicetype": 5, "maxNum": 99,
  "desc": "感谢对小镇作出贡献的餐厅，六星时获得。增加40点创意。",
  "value": { "part": 5, "essence": 33, "creatives": 40, "hole": 1, "max_hole": 5, "min_level": 13, "suitid": 99 },
  "level": 6, "coin": 0, "diamond": 0, "saleflag": 0, "subflag": 0
}
```

不写 `awardflag`，所以 `awardFlag` 为 null，不会随机掉落。

`packages/config/src/tuning.ts` 的 schema 里，照 `forum` 的写法加：

```ts
  mail: z.object({ expiresDays: int.min(1), listMax: int.min(1).max(500) }),
```

`data/game/tuning.json` 加 `"mail": { "expiresDays": 30, "listMax": 100 },`。

`apps/server/src/core/features.ts` 的 `IMPLEMENTED_FEATURES` 里加 `'mail',`。

- [ ] **Step 4：运行，确认通过**

Run: `cd packages/config && npx vitest run && cd ../.. && pnpm --filter @dt/config build`
Expected: config 全部 PASS；build 成功。

注意：`expiresDays` 目前只用于前端显示"还剩几天"和后台说明，实际过期时间由迁移里的列默认值（30 天）决定。两者不一致时以列默认值为准；如果以后要可调，在 `sendMail` 里显式写 `expires_at`。在 ledger 记一条 Ruling。

- [ ] **Step 5：跑服务端里依赖道具数量的测试并提交**

Run: `npx vitest run apps/server/src/modules/world/world.test.ts`
Expected: FAIL，"目录接口不需要登录"里写死了 615。改成 617 后 PASS。

```bash
git add packages/config apps/server/src/core/features.ts apps/server/src/modules/world/world.test.ts
git commit -m "feat(config): 玉级、铉级赞助帽子；邮件数值；功能开关 mail"
```

---

### Task 3：共享类型——附件、邮件、公告、厨具名字

**Files:**
- Create: `packages/shared/src/schemas/mail.ts`, `packages/shared/src/schemas/announce.ts`
- Modify: `packages/shared/src/schemas/admin.ts`, `packages/shared/src/schemas/equip.ts`, `packages/shared/src/schemas/friend.ts`, `packages/shared/src/index.ts`, `packages/shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Produces（全部从 `@dt/shared` 导出）：
  - `rewardItems`（zod）、`type RewardItems = GrantItems & { hats?: Array<{ tier: 'jade' | 'xuan'; name: string }> }`、`HAT_NAME_MAX = 8`、`MAIL_HATS_MAX = 5`。
  - `MAIL_TITLE_MAX = 40`、`MAIL_BODY_MAX = 1000`、`ANNOUNCE_TITLE_MAX = 40`、`ANNOUNCE_BODY_MAX = 2000`。
  - 邮件：`MailDto`、`MailListDto`、`MailClaimDto`、`MailClaimAllDto`、`mailIdParam`、`sendMailBody`、`type SendMailInput`、`AdminMailDto`。
  - 公告：`AnnouncementDto`、`AnnouncementsDto`、`announcementBody`、`type AnnouncementInput`、`AdminAnnouncementDto`。
  - `createGrantBody` 增加 `asMail?: boolean`。
  - `EquipDto.name: string | null`；好友店里的厨具项也加 `name: string | null`。

- [ ] **Step 1：写失败的测试**（追加到 `packages/shared/src/schemas/schemas.test.ts`）

```ts
describe('附件、邮件、公告（子项目 6A-1）', () => {
  it('帽子名字：去掉首尾空格，1~8 个字，不能有换行；每封最多 5 顶', () => {
    expect(rewardItems.parse({ hats: [{ tier: 'jade', name: ' 大橘 ' }] }).hats![0]!.name).toBe('大橘');
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '' }] }).success).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '一二三四五六七八九' }] }).success).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '一二三四五六七八' }] }).success).toBe(true);
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '大\n橘' }] }).success).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'gold', name: '大橘' }] }).success).toBe(false);
    const six = Array.from({ length: 6 }, () => ({ tier: 'jade' as const, name: '大橘' }));
    expect(rewardItems.safeParse({ hats: six }).success).toBe(false);
  });

  it('附件沿用补偿的上限、去重、非空；只有帽子也算不空', () => {
    expect(rewardItems.safeParse({}).success).toBe(false);
    expect(rewardItems.safeParse({ coin: GRANT_LIMITS.coin + 1 }).success).toBe(false);
    expect(rewardItems.safeParse({ goods: [{ id: 1, num: 1 }, { id: 1, num: 2 }] }).success).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'xuan', name: '大橘' }] }).success).toBe(true);
  });

  it('发邮件：标题、正文按字符计长度；附件可以没有；单店要有店 id', () => {
    const base = { scope: 'shard', shardId: 1, title: '标题', body: '正文' };
    expect(sendMailBody.safeParse(base).success).toBe(true);
    expect(sendMailBody.safeParse({ ...base, title: '😀'.repeat(40) }).success).toBe(true);
    expect(sendMailBody.safeParse({ ...base, title: '字'.repeat(41) }).success).toBe(false);
    expect(sendMailBody.safeParse({ ...base, scope: 'rest' }).success).toBe(false);
    expect(sendMailBody.safeParse({ ...base, scope: 'all', shardId: undefined }).success).toBe(true);
  });

  it('公告：结束时间要晚于开始时间', () => {
    const b = { shardId: null, title: '停服', body: '维护', important: true };
    expect(
      announcementBody.safeParse({ ...b, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-02T00:00:00Z' }).success,
    ).toBe(true);
    expect(
      announcementBody.safeParse({ ...b, startsAt: '2026-10-02T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' }).success,
    ).toBe(false);
  });
});
```

在测试文件 import 里加 `rewardItems, sendMailBody, announcementBody, GRANT_LIMITS`。

- [ ] **Step 2：运行，确认失败**

Run: `cd packages/shared && npx vitest run src/schemas/schemas.test.ts`
Expected: FAIL，`rewardItems` 未导出。

- [ ] **Step 3：实现**

```ts
// packages/shared/src/schemas/mail.ts
import { z } from 'zod';
import { grantItemsShape, refineGrantItems, type GrantItems } from './admin';

export const HAT_NAME_MAX = 8;
export const MAIL_HATS_MAX = 5;
export const MAIL_TITLE_MAX = 40;
export const MAIL_BODY_MAX = 1000;

/** 按字符计长度（emoji 算 1 个），不按 UTF-16 */
export const charLen = (s: string) => [...s].length;
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => charLen(s) <= max, { message: 'too_long' });

const hat = z.object({
  tier: z.enum(['jade', 'xuan']),
  name: text(HAT_NAME_MAX).refine((s) => !/[\r\n]/.test(s), { message: 'newline' }),
});

/** 附件 = 补偿的五项 + 命名帽子（设计 §4） */
export const rewardItems = refineGrantItems(
  z.object({ ...grantItemsShape, hats: z.array(hat).max(MAIL_HATS_MAX).optional() }),
  (i) => Boolean(i.hats?.length),
);
export type RewardItems = GrantItems & { hats?: Array<{ tier: 'jade' | 'xuan'; name: string }> };

export const mailIdParam = z.object({ id: z.coerce.number().int().positive() });

export const sendMailBody = z
  .object({
    scope: z.enum(['rest', 'shard', 'all']),
    shardId: z.number().int().positive().optional(),
    restId: z.number().int().positive().optional(),
    minLevel: z.number().int().min(1).optional(),
    title: text(MAIL_TITLE_MAX),
    body: text(MAIL_BODY_MAX),
    items: rewardItems.optional(),
  })
  .refine((b) => b.scope !== 'rest' || b.restId !== undefined, { path: ['restId'], message: 'required' })
  .refine((b) => b.scope === 'all' || b.shardId !== undefined, { path: ['shardId'], message: 'required' });
export type SendMailInput = z.infer<typeof sendMailBody>;

export interface MailDto {
  id: number;
  title: string;
  body: string;
  items: RewardItems | null;
  /** admin / grant / hat / invite */
  source: string;
  createdAt: string;
  expiresAt: string;
  read: boolean;
  claimed: boolean;
  /** 领取要求的等级；为 null 或已达到时可领 */
  minLevel: number | null;
}
export interface MailListDto {
  items: MailDto[];
  unread: number;
}
export interface MailClaimDto {
  id: number;
  items: RewardItems;
}
export interface MailClaimAllDto {
  claimed: number;
  /** 发放出错、留着没领的封数 */
  failed: number;
  items: RewardItems[];
}
export interface AdminMailDto {
  id: number;
  scope: 'rest' | 'shard' | 'all';
  shardId: number | null;
  restId: number | null;
  minLevel: number | null;
  title: string;
  body: string;
  items: RewardItems | null;
  source: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  claimedCount: number;
  actor: string | null;
}
```

在 `admin.ts` 里把现有 `grantItems` 拆成可复用的两部分（行为不变），并给补偿加 `asMail`：

```ts
export const grantItemsShape = {
  coin: z.number().int().min(1).max(GRANT_LIMITS.coin).optional(),
  diamond: z.number().int().min(1).max(GRANT_LIMITS.diamond).optional(),
  exp: z.number().int().min(1).max(GRANT_LIMITS.exp).optional(),
  goods: z.array(idNum).max(50).optional(),
  foods: z.array(idNum).max(50).optional(),
};
type GrantShape = z.infer<z.ZodObject<typeof grantItemsShape>>;
/** 非空、同种只列一次；extraNonEmpty 让附件的"只有帽子"也算不空 */
export function refineGrantItems<T extends z.ZodType<GrantShape>>(
  schema: T,
  extraNonEmpty: (i: z.infer<T>) => boolean = () => false,
) {
  return schema
    .refine(
      (i) => Boolean(i.coin || i.diamond || i.exp || i.goods?.length || i.foods?.length || extraNonEmpty(i)),
      { message: 'empty' },
    )
    // 同一种道具或食材只能列一次，否则可以绕过每种的数量上限
    .refine((i) => uniqueIds(i.goods) && uniqueIds(i.foods), { message: 'duplicate' });
}
export const grantItems = refineGrantItems(z.object(grantItemsShape));
```

`createGrantBody` 的对象里加 `asMail: z.boolean().optional(),`。

```ts
// packages/shared/src/schemas/announce.ts
import { z } from 'zod';
import { charLen } from './mail';

export const ANNOUNCE_TITLE_MAX = 40;
export const ANNOUNCE_BODY_MAX = 2000;
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => charLen(s) <= max, { message: 'too_long' });

export const announcementBody = z
  .object({
    shardId: z.number().int().positive().nullable(),
    title: text(ANNOUNCE_TITLE_MAX),
    body: text(ANNOUNCE_BODY_MAX),
    important: z.boolean(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { path: ['endsAt'], message: 'before_start' });
export type AnnouncementInput = z.infer<typeof announcementBody>;

export interface AnnouncementDto {
  id: number;
  title: string;
  body: string;
  important: boolean;
  startsAt: string;
  endsAt: string;
  /** 本账号是否已看过（只对重要公告有意义；登录页的公开接口固定为 true） */
  seen: boolean;
}
export interface AnnouncementsDto {
  items: AnnouncementDto[];
}
export interface AdminAnnouncementDto extends Omit<AnnouncementDto, 'seen'> {
  shardId: number | null;
  createdAt: string;
  updatedAt: string;
  actor: string | null;
}
```

`equip.ts` 的 `EquipDto` 在 `goodsId` 后加：

```ts
  /** 命名帽子的完整显示名（如"玉•大橘之帽"）；普通厨具为 null，前端用道具名 */
  name: string | null;
```

`friend.ts` 里好友店的厨具项类型（含 `part`、`goodsId`、`stress` 的那个）同样加 `name: string | null;`。

`index.ts` 加 `export * from './schemas/mail';`、`export * from './schemas/announce';`。

- [ ] **Step 4：运行，确认通过**

Run: `cd packages/shared && npx vitest run && cd ../.. && pnpm typecheck`
Expected: shared PASS。typecheck 会在服务端 `toEquipDto`、好友读取、web 测试数据里报缺少 `name`，这是预期的：Task 5 和 Task 10 会补上。这一步先只确认 shared 包本身通过：`pnpm --filter @dt/shared typecheck`。

- [ ] **Step 5：提交**

```bash
git add packages/shared
git commit -m "feat(shared): 附件（含命名帽子）、邮件、公告的类型和校验；厨具显示名字段"
```

---

### Task 4：附件发放 `grantRewardOp` 和命名帽子

**Files:**
- Create: `apps/server/src/modules/equip/hats.ts`, `apps/server/src/modules/equip/hats.test.ts`, `apps/server/src/modules/mail/reward.ts`, `apps/server/src/modules/mail/reward.test.ts`
- Modify: `apps/server/src/modules/admin/grants.ts`, `apps/web/src/utils/events.ts`, `apps/web/src/utils/events.test.ts`

**Interfaces:**
- Consumes: `SPONSOR_HATS`、`SPONSOR_HAT_PREFIX`、`HatTier`（Task 2）；`RewardItems`（Task 3）；`createEquips`（`equip/instances.ts`）；`recordChange`（`core/resources.ts`）。
- Produces:
  - `hatDisplayName(tier: HatTier, name: string): string`
  - `equipDisplayName(goodsId: number, customName: string | null): string | null`
  - `grantHatOp(op: Op, tier: HatTier, name: string, source: string): Promise<number>`（返回厨具实例 id）
  - `grantRewardOp(op: Op, items: RewardItems, opts: { source: string; logType: string; logParams?: Record<string, unknown> }): Promise<void>`
  - `checkRewardItems(config: GameConfig, items: RewardItems): void`（道具、食材 id 不存在时抛 `VALIDATION_FAILED`）

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/equip/hats.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPONSOR_HATS } from '@dt/config';
import { runSystemOp } from '../../core/op';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { equipDisplayName, grantHatOp, hatDisplayName } from './hats';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('命名帽子（设计 §5）', () => {
  it('显示名：玉•{名字}之帽 / 铉•{名字}之帽；普通厨具和没名字的帽子返回 null', () => {
    expect(hatDisplayName('jade', '大橘')).toBe('玉•大橘之帽');
    expect(hatDisplayName('xuan', '大橘')).toBe('铉•大橘之帽');
    expect(equipDisplayName(SPONSOR_HATS.jade, '大橘')).toBe('玉•大橘之帽');
    expect(equipDisplayName(SPONSOR_HATS.jade, null)).toBeNull();
    expect(equipDisplayName(30, '大橘')).toBeNull();
  });

  it('发一顶命名玉帽：生成厨具实例并存名字，记流水', async () => {
    const ctx = await newRestaurant(t);
    const id = await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (op) =>
      grantHatOp(op, 'jade', '大橘', 'mail.claim'),
    );
    const e = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(e).toMatchObject({ rest_id: ctx.restaurantId, goods_id: SPONSOR_HATS.jade, custom_name: '大橘', part: 5 });
    expect(e.base_creatives).toBe(22);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['source', 'kind', 'item_id', 'delta'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(ledger).toContainEqual(
      expect.objectContaining({ source: 'mail.claim', kind: 'goods', item_id: SPONSOR_HATS.jade, delta: 1 }),
    );
  });
});
```

（`ledger` 表的列名以 `schema.ts` 为准；如果不是 `kind`、`item_id`、`delta`，改成实际列名。）

```ts
// apps/server/src/modules/mail/reward.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPONSOR_HATS } from '@dt/config';
import { runSystemOp } from '../../core/op';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { checkRewardItems, grantRewardOp } from './reward';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('附件发放（设计 §4）', () => {
  it('银币、钻石、道具、食材、命名帽子一起到账；流水来源和日志类型按参数', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, diamond: 0 } });
    await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (op) =>
      grantRewardOp(
        op,
        {
          coin: 100,
          diamond: 2,
          goods: [{ id: 1, num: 3 }],
          foods: [{ id: 101, num: 4 }],
          hats: [{ tier: 'jade', name: '大橘' }],
        },
        { source: 'mail.claim', logType: 'mail.claim', logParams: { mailId: 9, title: '开服礼' } },
      ),
    );
    const r = await restRow(t, ctx.restaurantId);
    expect([r.coin, r.diamond]).toEqual([100, 2]);
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(4);
    const hat = await t.db
      .selectFrom('equip')
      .select('custom_name')
      .where('rest_id', '=', ctx.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.jade)
      .executeTakeFirstOrThrow();
    expect(hat.custom_name).toBe('大橘');
    const log = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .where('type', '=', 'mail.claim')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ mailId: 9, title: '开服礼' });
  });

  it('道具或食材 id 不存在时校验报 VALIDATION_FAILED', () => {
    expect(() => checkRewardItems(t.deps.config, { goods: [{ id: 999999, num: 1 }] })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
    expect(() => checkRewardItems(t.deps.config, { foods: [{ id: 999999, num: 1 }] })).toThrow();
    expect(() => checkRewardItems(t.deps.config, { coin: 1 })).not.toThrow();
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/equip/hats.test.ts apps/server/src/modules/mail/reward.test.ts`
Expected: FAIL，模块 `./hats`、`./reward` 不存在。

- [ ] **Step 3：实现**

```ts
// apps/server/src/modules/equip/hats.ts
import { SPONSOR_HATS, SPONSOR_HAT_PREFIX, type HatTier } from '@dt/config';
import { recordChange } from '../../core/resources';
import type { Op } from '../../core/op';
import { createEquips } from './instances';

const TIER_OF = new Map<number, HatTier>(
  (Object.entries(SPONSOR_HATS) as Array<[HatTier, number]>).map(([tier, id]) => [id, tier]),
);

/** 命名帽子的显示名（设计 裁定 23） */
export function hatDisplayName(tier: HatTier, name: string): string {
  return `${SPONSOR_HAT_PREFIX[tier]}•${name}之帽`;
}

/** 厨具实例的显示名：只有赞助帽子且有名字时才有，否则 null（前端用道具名） */
export function equipDisplayName(goodsId: number, customName: string | null): string | null {
  const tier = TIER_OF.get(goodsId);
  return tier && customName ? hatDisplayName(tier, customName) : null;
}

/** 发一顶命名帽子：生成实例、写名字、记流水；返回实例 id */
export async function grantHatOp(op: Op, tier: HatTier, name: string, source: string): Promise<number> {
  const goodsId = SPONSOR_HATS[tier];
  const [id] = await createEquips(op.tx, op.config, op.rest.id, goodsId, 1, op.now, op.rng);
  await op.tx.updateTable('equip').set({ custom_name: name }).where('id', '=', id!).execute();
  recordChange(op, 'goods', 1, { source }, goodsId);
  return id!;
}
```

```ts
// apps/server/src/modules/mail/reward.ts
import type { GameConfig } from '@dt/config';
import { ErrorCode, type RewardItems } from '@dt/shared';
import { addFoods } from '../cupboard/foods';
import { gainCoin, gainDiamond, gainExp } from '../../core/resources';
import { restLog, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { grantGoodsOp } from '../store/goods';
import { grantHatOp } from '../equip/hats';

/** 附件里的道具、食材必须在配置里存在（发送和创建兑换码时检查） */
export function checkRewardItems(config: GameConfig, items: RewardItems): void {
  const bad: Array<{ path: string; message: string }> = [];
  (items.goods ?? []).forEach((g, i) => {
    if (!config.goods.has(g.id)) bad.push({ path: `items.goods.${i}.id`, message: 'unknown' });
  });
  (items.foods ?? []).forEach((f, i) => {
    if (!config.foods.has(f.id)) bad.push({ path: `items.foods.${i}.id`, message: 'unknown' });
  });
  if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
}

/**
 * 发放附件（设计 §4）：橱柜满了进冰箱、仓库满了照发；流水来源、个人日志类型由调用方给。
 * 补偿、邮件领取、兑换码都走这里
 */
export async function grantRewardOp(
  op: Op,
  items: RewardItems,
  opts: { source: string; logType: string; logParams?: Record<string, unknown> },
): Promise<void> {
  const source = opts.source;
  if (items.coin) gainCoin(op, items.coin, { source });
  if (items.diamond) gainDiamond(op, items.diamond, { source });
  if (items.exp) gainExp(op, items.exp, { source });
  for (const g of items.goods ?? []) await grantGoodsOp(op, g.id, g.num, { source });
  for (const f of items.foods ?? []) await addFoods(op, f.id, f.num, { source });
  for (const h of items.hats ?? []) await grantHatOp(op, h.tier, h.name, source);
  restLog(op, opts.logType, { ...opts.logParams, items });
}
```

`addFoods`、`gainCoin` 等的 import 路径照 `admin/grants.ts` 顶部现有的 import 抄。

`admin/grants.ts`：
- `grantItemsOp` 改为调用 `grantRewardOp(op, items, { source: SOURCE, logType: 'admin.grant', logParams: { reason } })`。
- `checkItems` 改为调用 `checkRewardItems(config, items)`。
- 跑现有 `grants.test.ts` 确认行为不变。

`apps/web/src/utils/events.ts` 的日志文案表加：

```ts
  'mail.claim': (p) => `领取了邮件「${String(p.title ?? '')}」的附件`,
```

`events.test.ts` 加一行断言：

```ts
expect(logText({ type: 'mail.claim', params: { title: '开服礼' }, at: '' }, names)).toBe('领取了邮件「开服礼」的附件');
```

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/equip/hats.test.ts apps/server/src/modules/mail/reward.test.ts apps/server/src/modules/admin/grants.test.ts apps/web/src/utils/events.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/equip/hats.ts apps/server/src/modules/equip/hats.test.ts apps/server/src/modules/mail apps/server/src/modules/admin/grants.ts apps/web/src/utils
git commit -m "feat(mail): 附件发放 grantRewardOp（含命名帽子），补偿改用它"
```

---

### Task 5：厨具显示名下发

**Files:**
- Modify: `apps/server/src/modules/equip/service.ts`（`toEquipDto`）, `apps/server/src/modules/friend/reads.ts:317`, `apps/server/src/modules/admin/players.ts:194`
- Test: `apps/server/src/modules/equip/hats.test.ts`（追加）

**Interfaces:**
- Consumes: `equipDisplayName`（Task 4）。
- Produces: `EquipDto.name`、好友店厨具项 `name`、后台餐厅厨具项 `name`，都由 `equipDisplayName(goods_id, custom_name)` 算出。

- [ ] **Step 1：写失败的测试**（追加到 `hats.test.ts`）

```ts
describe('显示名下发', () => {
  it('厨具列表、详情、好友店里，命名帽子带显示名，普通厨具为 null', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 20 } });
    const hatId = await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (op) =>
      grantHatOp(op, 'jade', '大橘', 'test'),
    );
    const list = await t.game.equip.list(ctx);
    expect(list.find((e) => e.id === hatId)!.name).toBe('玉•大橘之帽');
    expect((await t.game.equip.detail(ctx, hatId)).equip.name).toBe('玉•大橘之帽');
  });
});
```

（`t.game.equip.list` 的实际方法名以 `equip/service.ts` 为准，比如 `overview(ctx).items` 或 `items(ctx)`。写测试前先看一眼，用实际的方法。好友店的断言放进 `friend/reads` 现有的测试文件，复用那里"好友看店"的用例：穿上一顶命名帽子后，`equips` 里那项的 `name` 是"玉•大橘之帽"。）

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/equip/hats.test.ts`
Expected: FAIL，`name` 是 `undefined`。

- [ ] **Step 3：实现**

- `toEquipDto` 返回值里，在 `goodsId: e.goods_id,` 后加 `name: equipDisplayName(e.goods_id, e.custom_name),`。
- `friend/reads.ts` 第 317 行改为 `equips.map((e) => ({ part: e.part, goodsId: e.goods_id, stress: e.stress, name: equipDisplayName(e.goods_id, e.custom_name) }))`。如果查询没选 `custom_name`，在 select 里加上。
- `admin/players.ts` 第 194 行附近，厨具项同样加 `name`，并把 `admin.ts` 里对应的 DTO 类型加 `name: string | null`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/equip apps/server/src/modules/friend apps/server/src/modules/admin && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src packages/shared/src/schemas/admin.ts
git commit -m "feat(equip): 厨具列表、详情、好友店、后台下发命名帽子的显示名"
```

---

### Task 6：玩家邮箱（列表、已读、领取、一键全领、删除）

**Files:**
- Create: `apps/server/src/modules/mail/rules.ts`, `apps/server/src/modules/mail/inbox.ts`, `apps/server/src/modules/mail/send.ts`, `apps/server/src/modules/mail/service.ts`, `apps/server/src/modules/mail/routes.ts`, `apps/server/src/modules/mail/inbox.test.ts`
- Modify: `apps/server/src/game.ts`, `apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `grantRewardOp`（Task 4）；`runOp`；`invalidState`。
- Produces:
  - `sendMail(db: Kysely<DB>, m: { scope: 'rest' | 'shard' | 'all'; shardId: number | null; restId: number | null; minLevel: number | null; title: string; body: string; items: RewardItems | null; source: string; actorAccountId: number | null }): Promise<number>`：返回邮件 id；`db` 可以是事务。
  - `createMailService(d: GameDeps)`：`list(ctx)`、`unread(ctx)`、`read(ctx, id)`、`claim(ctx, id)`、`claimAll(ctx)`、`remove(ctx, id)`。
  - 路由：`GET /mail`、`GET /mail/unread`、`POST /mail/:id/read`、`POST /mail/:id/claim`、`POST /mail/claim-all`、`POST /mail/:id/delete`。
  - `Game.mail: MailService`。

**规则**（写在 `rules.ts`，纯函数，便于单测）：
- `visibleTo(m, rest, now)`：没撤回；`expires_at > now`；收件范围匹配（`rest` 看 `rest_id`，`shard` 看 `shard_id`，`all` 都可以）；`rest.created_at <= m.created_at`。这里的 `now` 用数据库时钟，查询里直接用 `now()`。
- `claimBlock(m, state, level)`：返回 `'mail_claimed' | 'mail_no_items' | 'mail_level' | null`。

列表查询（`inbox.ts`）一条 SQL 取出对本店可见、未删除的邮件，按 `created_at desc` 取 `listMax` 封。可见条件：

```sql
m.revoked_at is null and m.expires_at > now()
and (
  (m.scope = 'rest' and m.rest_id = :rest)
  or (m.scope = 'shard' and m.shard_id = :shard and m.created_at >= :restCreatedAt)
  or (m.scope = 'all' and m.created_at >= :restCreatedAt)
)
and not exists (select 1 from mail_state s where s.mail_id = m.id and s.rest_id = :rest and s.deleted_at is not null)
```

单店邮件不比较创建时间：发给这家店的就是给它的。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/mail/inbox.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { SPONSOR_HATS } from '@dt/config';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { sendMail } from './send';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const mailSvc = () => t.game.mail;
const shardMail = (shardId: number, patch: Record<string, unknown> = {}) =>
  sendMail(t.db, {
    scope: 'shard',
    shardId,
    restId: null,
    minLevel: null,
    title: '开服礼',
    body: '欢迎',
    items: { coin: 100 },
    source: 'admin',
    actorAccountId: null,
    ...patch,
  });

describe('邮箱（设计 §2 裁定 1~9）', () => {
  it('区服邮件：发送时已有的店能看到并领取；后开的店看不到也领不了', async () => {
    const shardId = await createShard(t.db);
    const old = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await shardMail(shardId);
    const late = await newRestaurant(t, { shardId });
    const list = await mailSvc().list(old);
    expect(list.items.map((m) => m.id)).toContain(id);
    expect(list.unread).toBeGreaterThanOrEqual(1);
    expect((await mailSvc().list(late)).items.map((m) => m.id)).not.toContain(id);
    await expect(mailSvc().claim(late, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await mailSvc().claim(old, id);
    expect((await restRow(t, old.restaurantId)).coin).toBe(100);
  });

  it('重复领取只到账一次；并发领取也只到账一次', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await shardMail(shardId);
    const results = await Promise.allSettled([mailSvc().claim(r, id), mailSvc().claim(r, id)]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    await expect(mailSvc().claim(r, id)).rejects.toMatchObject({ params: { reason: 'mail_claimed' } });
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
  });

  it('等级门槛按领取时等级：看得到，不够级领不了，升级后能领', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 5 } });
    const id = await shardMail(shardId, { minLevel: 10 });
    expect((await mailSvc().list(r)).items.find((m) => m.id === id)!.minLevel).toBe(10);
    await expect(mailSvc().claim(r, id)).rejects.toMatchObject({ params: { reason: 'mail_level', level: 10 } });
    await t.db.updateTable('restaurant').set({ level: 10 }).where('id', '=', r.restaurantId).execute();
    await mailSvc().claim(r, id);
  });

  it('撤回后看不到、领不了；过期的同样', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const revoked = await shardMail(shardId);
    const expired = await shardMail(shardId);
    await t.db.updateTable('mail').set({ revoked_at: new Date() }).where('id', '=', revoked).execute();
    await t.db
      .updateTable('mail')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', expired)
      .execute();
    const ids = (await mailSvc().list(r)).items.map((m) => m.id);
    expect(ids).not.toContain(revoked);
    expect(ids).not.toContain(expired);
    await expect(mailSvc().claim(r, revoked)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mailSvc().claim(r, expired)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('一键全领：一封出错不影响其他，出错的保持未领', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await shardMail(shardId);
    const bad = await shardMail(shardId, { items: { goods: [{ id: 999999, num: 1 }] } });
    const res = await mailSvc().claimAll(r);
    expect(res.data).toMatchObject({ claimed: 1, failed: 1 });
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
    expect((await mailSvc().list(r)).items.find((m) => m.id === bad)!.claimed).toBe(false);
  });

  it('删除：有附件没领不能删；领完能删，删后看不到；只影响自己', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const id = await shardMail(shardId);
    await expect(mailSvc().remove(a, id)).rejects.toMatchObject({ params: { reason: 'mail_unclaimed' } });
    await mailSvc().claim(a, id);
    await mailSvc().remove(a, id);
    expect((await mailSvc().list(a)).items.map((m) => m.id)).not.toContain(id);
    expect((await mailSvc().list(b)).items.map((m) => m.id)).toContain(id);
  });

  it('已读：未读数减 1；单店邮件只有那家店看得到；全部区服的邮件各区都能看到', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const other = await newRestaurant(t);
    const own = await sendMail(t.db, {
      scope: 'rest',
      shardId,
      restId: r.restaurantId,
      minLevel: null,
      title: '给你',
      body: '',
      items: null,
      source: 'admin',
      actorAccountId: null,
    });
    const all = await sendMail(t.db, {
      scope: 'all',
      shardId: null,
      restId: null,
      minLevel: null,
      title: '全服',
      body: '',
      items: null,
      source: 'admin',
      actorAccountId: null,
    });
    const before = (await mailSvc().list(r)).unread;
    await mailSvc().read(r, own);
    expect((await mailSvc().list(r)).unread).toBe(before - 1);
    expect((await mailSvc().unread(r)).count).toBe(before - 1);
    const otherIds = (await mailSvc().list(other)).items.map((m) => m.id);
    expect(otherIds).not.toContain(own);
    expect(otherIds).toContain(all);
    await expect(mailSvc().claim(r, own)).rejects.toMatchObject({ params: { reason: 'mail_no_items' } });
  });

  it('关掉 mail 开关时邮箱接口返回 FEATURE_DISABLED，邮件照样能发（设计 裁定 26）', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { mail: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await newRestaurant(t, { shardId });
    const id = await shardMail(shardId);
    await expect(mailSvc().list(r)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(mailSvc().claim(r, id)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('附件里的帽子领取后生成命名厨具', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await shardMail(shardId, { items: { hats: [{ tier: 'jade', name: '大橘' }] } });
    const res = await mailSvc().claim(r, id);
    expect(res.data.items.hats).toEqual([{ tier: 'jade', name: '大橘' }]);
    const hat = await t.db
      .selectFrom('equip')
      .select('custom_name')
      .where('rest_id', '=', r.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.jade)
      .executeTakeFirstOrThrow();
    expect(hat.custom_name).toBe('大橘');
  });
});
```

注意：`newRestaurant` 插入的餐厅 `created_at` 是数据库默认的 `now()`，邮件的 `created_at` 也是。第一个用例依赖"先开店、后发邮件、再开店"的顺序，两次 `now()` 之间有真实时间差。如果偶尔同一微秒导致比较不稳，在 `late` 前加 `await t.db.selectNoFrom(sql\`pg_sleep(0.01)\`.as('x')).execute()`。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/mail/inbox.test.ts`
Expected: FAIL，`./send` 不存在、`t.game.mail` 是 `undefined`。

- [ ] **Step 3：实现**

`send.ts`：

```ts
import type { Kysely } from 'kysely';
import type { RewardItems } from '@dt/shared';
import type { DB } from '../../db/schema';

export interface NewMail {
  scope: 'rest' | 'shard' | 'all';
  shardId: number | null;
  restId: number | null;
  minLevel: number | null;
  title: string;
  body: string;
  items: RewardItems | null;
  source: string;
  actorAccountId: number | null;
}

/** 写一封邮件；created_at、expires_at 用列默认值（数据库时钟，裁定 2、4）。db 可以是调用方的事务 */
export async function sendMail(db: Kysely<DB>, m: NewMail): Promise<number> {
  const r = await db
    .insertInto('mail')
    .values({
      scope: m.scope,
      shard_id: m.shardId,
      rest_id: m.restId,
      min_level: m.minLevel,
      title: m.title,
      body: m.body,
      items: m.items ? JSON.stringify(m.items) : null,
      source: m.source,
      actor_account_id: m.actorAccountId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
```

`inbox.ts` 的要点（完整实现照下面写）：
- `visibleMails(db, rest, opts: { id?: number; limit: number })`：执行上面那条可见性 SQL（用 Kysely 的 `where` 组合，`now()` 用 `sql\`now()\``），左连接 `mail_state` 取 `read_at`、`claimed_at`。返回行。`rest` 来自 `restaurant` 表，含 `id`、`shard_id`、`created_at`、`level`。
- `toMailDto(row)`：映射成 `MailDto`。`items` 用 `RewardItems` 类型断言，数据是发送时校验过的。
- `claimOne(o: Op, id)`：在锁店事务里用 `visibleMails(o.tx, o.rest, { id, limit: 1 })` 重新读一次，读不到就抛 `notFound('mail', id)`（Review Focus 1）。用 `claimBlock` 判断；然后：

```ts
const r = await sql<{ mail_id: number }>`
  insert into mail_state (mail_id, rest_id, claimed_at, read_at)
  values (${id}, ${o.rest.id}, now(), now())
  on conflict (mail_id, rest_id) do update set claimed_at = now(), read_at = coalesce(mail_state.read_at, now())
  where mail_state.claimed_at is null
  returning mail_id`.execute(o.tx);
if (r.rows.length === 0) throw invalidState('mail_claimed');
await grantRewardOp(o, items, { source: 'mail.claim', logType: 'mail.claim', logParams: { mailId: id, title } });
```

  `on conflict ... where claimed_at is null` 保证只写一次（裁定 5）；并发时第二个事务在锁店处排队，拿到锁后重新读状态，会走到 `mail_claimed`。
- `claimAll(d, ctx)`：先在只读查询里列出可领的邮件 id；然后对每封各跑一次 `runOp`（每封独立事务）。成功计 `claimed`，捕获异常计 `failed`（Review Focus 2）。返回 `{ data: { claimed, failed, items } }`。各次 `runOp` 返回的 `events` 合并后放进外层结果，前端照常弹一次汇总提示。
- `read`：`insert ... on conflict do update set read_at = coalesce(mail_state.read_at, now())`，只对可见邮件生效，不可见就返回 `NOT_FOUND`。
- `remove`：可见、并且（没附件或已领）才能删，否则 `invalidState('mail_unclaimed')`。写 `deleted_at = now()`。
- `unread`：数可见、`read_at` 为空的邮件数，返回 `{ count }`。

`service.ts`：

```ts
export function createMailService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'mail', source }, fn);
  return {
    async list(ctx: RestCtx): Promise<MailListDto> { /* ensureFeature('mail')；读餐厅行；visibleMails + 未读数 */ },
    async unread(ctx: RestCtx): Promise<{ count: number }> { /* 同上，只计数 */ },
    read: (ctx: RestCtx, id: number) => op(ctx, 'mail.read', (o) => markRead(o, id)),
    claim: (ctx: RestCtx, id: number) => op(ctx, 'mail.claim', (o) => claimOne(o, id)),
    claimAll: (ctx: RestCtx) => claimAll(d, ctx),
    remove: (ctx: RestCtx, id: number) => op(ctx, 'mail.delete', (o) => removeMail(o, id)),
  };
}
export type MailService = ReturnType<typeof createMailService>;
```

`routes.ts` 照 `forum/routes.ts` 的写法注册六个路由：GET 用 `ok(...)`，POST 用 `okOp(...)`，id 用 `parse(mailIdParam, req.params).id`。

`game.ts`：`Game` 接口加 `mail: MailService;`，`createGame` 里加 `mail: createMailService(deps),`。
`modules/index.ts`：`app.register(mailRoutes(game.mail), { prefix: '/api/v1' });`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/mail`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/mail apps/server/src/game.ts apps/server/src/modules/index.ts
git commit -m "feat(mail): 玩家邮箱——列表、已读、领取、一键全领、删除"
```

---

### Task 7：后台邮件（发送、列表、撤回）和补偿改发邮件

**Files:**
- Create: `apps/server/src/modules/mail/admin.ts`, `apps/server/src/modules/mail/admin.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`, `apps/server/src/modules/admin/grants.ts`

**Interfaces:**
- Consumes: `sendMail`（Task 6）、`checkRewardItems`（Task 4）、`writeAudit`、`requireRole`。
- Produces:
  - `createAdminMail(game: Game)`：`send(actor, b: SendMailInput): Promise<AdminMailDto>`、`list(q: { shardId?: number }): Promise<AdminMailDto[]>`、`revoke(actor, id): Promise<AdminMailDto>`。
  - 路由：`GET /admin/mails`（mod）、`POST /admin/mails`（admin）、`POST /admin/mails/:id/revoke`（admin）。
  - 补偿 `asMail: true`：单店发一封 `scope = 'rest'` 邮件，全区服发一封 `scope = 'shard'` 邮件（带 `minLevel`），`source = 'grant'`，标题"系统补偿"，正文是补偿原因。返回的 `GrantDto` 照常写一条 `admin_grant`，`status = 'done'`、`total = 0`，审计 `grant.mail`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/mail/admin.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('后台邮件（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  let t: TestGame;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
    t = await createTestGame();
  });
  afterAll(async () => {
    await ctx.close();
    await t.close();
  });
  const send = (cookie: string, body: unknown) => call(ctx.app, 'POST', '/api/v1/admin/mails', { cookie, body });

  it('admin 发区服邮件写审计；mod 只能看不能发', async () => {
    const r = await newRestaurant(t);
    const body = { scope: 'shard', shardId: r.shardId, title: '开服礼', body: '欢迎', items: { coin: 100 } };
    expect((await send(mod.cookie, body)).status).toBe(404);
    const res = await send(admin.cookie, body);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ scope: 'shard', title: '开服礼', claimedCount: 0 });
    const audit = await t.db
      .selectFrom('audit_log')
      .select('action')
      .where('action', '=', 'mail.send')
      .where('target', '=', `mail:${res.json.data.id}`)
      .executeTakeFirst();
    expect(audit).toBeDefined();
    const list = await call(ctx.app, 'GET', `/api/v1/admin/mails?shardId=${r.shardId}`, { cookie: mod.cookie });
    expect(list.json.data.map((m: { id: number }) => m.id)).toContain(res.json.data.id);
  });

  it('附件里的道具不存在、单店邮件的店不在该区服时拒绝', async () => {
    const r = await newRestaurant(t);
    const other = await newRestaurant(t);
    expect(
      (await send(admin.cookie, { scope: 'shard', shardId: r.shardId, title: 't', body: 'b', items: { goods: [{ id: 999999, num: 1 }] } }))
        .status,
    ).toBe(400);
    expect(
      (await send(admin.cookie, { scope: 'rest', shardId: r.shardId, restId: other.restaurantId, title: 't', body: 'b' }))
        .status,
    ).toBe(404);
  });

  it('撤回：玩家看不到；领过的人数留在列表里', async () => {
    const r = await newRestaurant(t);
    const res = await send(admin.cookie, { scope: 'shard', shardId: r.shardId, title: 't', body: 'b', items: { coin: 1 } });
    await t.game.mail.claim(r, res.json.data.id);
    const rv = await call(ctx.app, 'POST', `/api/v1/admin/mails/${res.json.data.id}/revoke`, { cookie: admin.cookie, body: {} });
    expect(rv.json.data).toMatchObject({ claimedCount: 1 });
    expect(rv.json.data.revokedAt).not.toBeNull();
    expect((await t.game.mail.list(r)).items.map((m) => m.id)).not.toContain(res.json.data.id);
  });

  it('补偿改为发邮件：不直接到账，玩家邮箱里出现一封带同样附件的邮件', async () => {
    const r = await newRestaurant(t, { patch: { coin: 0 } });
    const res = await call(ctx.app, 'POST', '/api/v1/admin/grants', {
      cookie: admin.cookie,
      body: { shardId: r.shardId, target: 'rest', restId: r.restaurantId, items: { coin: 500 }, reason: '停服补偿', asMail: true },
    });
    expect(res.status).toBe(200);
    expect((await t.db.selectFrom('restaurant').select('coin').where('id', '=', r.restaurantId).executeTakeFirstOrThrow()).coin).toBe(0);
    const mail = (await t.game.mail.list(r)).items.find((m) => m.source === 'grant')!;
    expect(mail).toMatchObject({ title: '系统补偿', body: '停服补偿', items: { coin: 500 } });
  });
});
```

`createTestApp` 和 `createTestGame` 是两个独立的游戏实例，但共用同一个测试数据库，所以 HTTP 发的邮件，`t.game.mail` 能读到（现有 `grants.test.ts` 也是这样用的）。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/mail/admin.test.ts`
Expected: FAIL，`/api/v1/admin/mails` 返回 404。

- [ ] **Step 3：实现**

`mail/admin.ts`：
- `send`：
  1. `checkRewardItems(config, b.items)`（有附件时）。
  2. `scope = 'rest'` 时确认店在 `b.shardId`，否则抛 `RESTAURANT_NOT_FOUND` 404；`scope = 'shard'` 时确认区服存在，否则 `SHARD_NOT_FOUND`。
  3. 在一个事务里 `sendMail(tx, { ..., source: 'admin', actorAccountId: actor.accountId })`，然后 `writeAudit(tx, { actor, action: 'mail.send', target: \`mail:${id}\`, detail: { scope, shardId, restId, minLevel, title, items } })`。
  4. 返回 `one(id)`。
- `one(id)` 和 `list`：查 `mail` 左连接 `account` 取发送人用户名，`claimedCount` 用子查询 `(select count(*) from mail_state s where s.mail_id = m.id and s.claimed_at is not null)`。列表按 `id desc` 取 50 条；有 `shardId` 时取 `shard_id = :shardId or scope = 'all'`。
- `revoke`：`update mail set revoked_at = now() where id = :id and revoked_at is null`，写审计 `mail.revoke`，返回 `one(id)`。邮件不存在时 404。

`admin/routes.ts` 照补偿的写法注册三个路由。查询参数用 `grantListQuery`（只有可选的 `shardId`），id 用 `idParam`。

`admin/grants.ts` 的 `create`：开头读 `b.asMail`。为 true 时跳过直接到账，按上面 Interfaces 里写的发邮件、写 `admin_grant` 和审计，然后 `return one(id)`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/mail apps/server/src/modules/admin/grants.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/mail apps/server/src/modules/admin
git commit -m "feat(admin): 后台发邮件、撤回；补偿可改为发邮件"
```

---

### Task 8：公告

**Files:**
- Create: `apps/server/src/modules/announce/service.ts`, `apps/server/src/modules/announce/admin.ts`, `apps/server/src/modules/announce/routes.ts`, `apps/server/src/modules/announce/announce.test.ts`
- Modify: `apps/server/src/game.ts`, `apps/server/src/modules/index.ts`, `apps/server/src/modules/admin/routes.ts`

**Interfaces:**
- Produces:
  - `createAnnounceService(d: GameDeps)`：`list(ctx: RestCtx): Promise<AnnouncementsDto>`、`publicList(): Promise<AnnouncementsDto>`、`seen(ctx: RestCtx, id: number): Promise<void>`。
  - 路由：`GET /announcements`、`POST /announcements/:id/seen`、`GET /public/announcements`（不用登录）。
  - 后台：`GET /admin/announcements`（mod）、`POST /admin/announcements`（admin，新建）、`POST /admin/announcements/:id`（admin，编辑）、`POST /admin/announcements/:id/delete`（admin，软删除）。审计动作 `announce.create` / `announce.update` / `announce.delete`。
  - `Game.announce: AnnounceService`。

**规则**：
- 有效：`deleted_at is null and starts_at <= :now and ends_at > :now`，`:now = d.now()`。
- 区服：`shard_id is null or shard_id = ctx.shardId`。`publicList` 只取 `shard_id is null`。
- 排序：`important desc, starts_at desc`，最多 20 条。
- `seen`：按 `ctx.accountId` 写 `announcement_seen`，`on conflict do nothing`；公告不存在或已删除返回 404。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/announce/announce.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let t: TestGame;
let actor: number;
beforeAll(async () => {
  t = await createTestGame();
  actor = await createAccountRow(t.db);
});
afterAll(() => t.close());

const H = 3_600_000;
const add = (patch: Record<string, unknown> = {}) =>
  t.db
    .insertInto('announcement')
    .values({
      shard_id: null,
      title: '停服维护',
      body: '今晚 2 点',
      important: false,
      starts_at: new Date(t.clock.now.getTime() - H),
      ends_at: new Date(t.clock.now.getTime() + H),
      actor_account_id: actor,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
    .then((r) => r.id);

describe('公告（设计 §2 裁定 11、12）', () => {
  it('只列有效期内、本区服或全部区服、没删除的公告；重要的排前面', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const all = await add();
    const mine = await add({ shard_id: shardId, important: true });
    const other = await add({ shard_id: await createShard(t.db) });
    const future = await add({ starts_at: new Date(t.clock.now.getTime() + H), ends_at: new Date(t.clock.now.getTime() + 2 * H) });
    const gone = await add({ deleted_at: new Date() });
    const ids = (await t.game.announce.list(r)).items.map((a) => a.id);
    expect(ids[0]).toBe(mine);
    expect(ids).toContain(all);
    for (const x of [other, future, gone]) expect(ids).not.toContain(x);
  });

  it('重要公告按账号记已看：看过后 seen 为 true；登录页只给全部区服的', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const imp = await add({ important: true });
    const local = await add({ shard_id: shardId });
    expect((await t.game.announce.list(r)).items.find((a) => a.id === imp)!.seen).toBe(false);
    await t.game.announce.seen(r, imp);
    await t.game.announce.seen(r, imp);
    expect((await t.game.announce.list(r)).items.find((a) => a.id === imp)!.seen).toBe(true);
    const pub = (await t.game.announce.publicList()).items.map((a) => a.id);
    expect(pub).toContain(imp);
    expect(pub).not.toContain(local);
  });
});

describe('公告（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
  });
  afterAll(() => ctx.close());

  it('不用登录能读公开公告；admin 新建、编辑、删除都写审计', async () => {
    expect((await call(ctx.app, 'GET', '/api/v1/public/announcements')).status).toBe(200);
    const now = Date.now();
    const body = {
      shardId: null,
      title: '开服',
      body: '欢迎',
      important: true,
      startsAt: new Date(now - H).toISOString(),
      endsAt: new Date(now + H).toISOString(),
    };
    const c = await call(ctx.app, 'POST', '/api/v1/admin/announcements', { cookie: admin.cookie, body });
    expect(c.status).toBe(200);
    const id = c.json.data.id as number;
    const u = await call(ctx.app, 'POST', `/api/v1/admin/announcements/${id}`, {
      cookie: admin.cookie,
      body: { ...body, title: '开服啦' },
    });
    expect(u.json.data.title).toBe('开服啦');
    await call(ctx.app, 'POST', `/api/v1/admin/announcements/${id}/delete`, { cookie: admin.cookie, body: {} });
    const actions = (
      await ctx.db.selectFrom('audit_log').select('action').where('target', '=', `announcement:${id}`).execute()
    ).map((a) => a.action);
    expect(actions.sort()).toEqual(['announce.create', 'announce.delete', 'announce.update']);
  });
});
```

（`ctx.db` 是否存在以 `test/helpers.ts` 的 `TestContext` 为准；没有就用 `t.db`。HTTP 测试用真实时钟，所以 `startsAt` 用 `Date.now()`。）

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/announce`
Expected: FAIL，`t.game.announce` 是 `undefined`。

- [ ] **Step 3：实现**

- `service.ts`：按上面的"规则"写三个方法。`list` 用 `d.shards.ensureFeature(ctx.shardId, 'restaurant')` 以外不加功能开关，公告不受开关影响。`seen` 左连接 `announcement_seen` 取 `seen`。
- `routes.ts`：`r.get('/public/announcements', async () => ok(await svc.publicList()))`，不调 `restCtxOf`；另两个照常。确认公开路由不经过登录检查：看 `security/session.ts`，登录检查是在 `restCtxOf` 里做的，没有全局拦截。
- `admin.ts`：`create`、`update`、`remove`、`list`，都在事务里写审计；`update` 的公告不存在或已删除返回 404。DTO 映射成 `AdminAnnouncementDto`。
- 注册：`game.ts` 加 `announce: createAnnounceService(deps)`；`modules/index.ts` 加 `app.register(announceRoutes(game.announce), { prefix: '/api/v1' })`；`admin/routes.ts` 加四个后台路由，请求体用 `announcementBody`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/announce`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/announce apps/server/src/game.ts apps/server/src/modules/index.ts apps/server/src/modules/admin/routes.ts
git commit -m "feat(announce): 公告——玩家列表、重要公告已看、登录页公开接口、后台增删改"
```

---

### Task 9：worker 扫描——六星换铉

**Files:**
- Create: `apps/server/src/modules/ops/scan.ts`, `apps/server/src/modules/ops/scan.test.ts`
- Modify: `apps/server/src/worker/jobs.ts`

**Interfaces:**
- Consumes: `sendMail`（Task 6）、`hatDisplayName`（Task 4）、`SPONSOR_HATS`。
- Produces:
  - `scanHats(game: Game, log: JobLogger, shardId: number): Promise<{ sent: number; failed: number }>`
  - `runOpsScan(game: Game, log: JobLogger): Promise<void>`：遍历开放区服，依次调用各扫描。6A-2 会在这里加 `scanInvites`。
  - worker 任务 `{ name: 'ops-scan', intervalMs: 60_000 }`。

**规则**（设计 §7 第 4 步、裁定 25）：找出本区服 `star_level >= 6`、`equip.goods_id = SPONSOR_HATS.jade`、`custom_name is not null`、`xuan_sent_at is null` 的厨具。每顶在一个事务里处理：

```sql
update equip set xuan_sent_at = now() where id = :id and xuan_sent_at is null returning id
```

返回空就跳过（别的进程已处理）。否则 `sendMail(tx, { scope: 'rest', shardId, restId, title: '赞助帽子升级', body: \`餐厅升到六星，${hatDisplayName('jade', name)}升级为${hatDisplayName('xuan', name)}。\`, items: { hats: [{ tier: 'xuan', name }] }, source: 'hat' })`。单顶出错记日志、计 `failed`，不影响其他。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/ops/scan.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SPONSOR_HATS } from '@dt/config';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { grantHatOp } from '../equip/hats';
import { scanHats } from './scan';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
async function hat(ctx: { shardId: number; restaurantId: number }, name: string | null) {
  return runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, async (op) => {
    const id = await grantHatOp(op, 'jade', name ?? 'x', 'test');
    if (name === null) await op.tx.updateTable('equip').set({ custom_name: null }).where('id', '=', id).execute();
    return id;
  });
}
const xuanMails = (restId: number) =>
  t.db.selectFrom('mail').select(['items', 'title']).where('rest_id', '=', restId).where('source', '=', 'hat').execute();

describe('六星换铉（设计 裁定 25）', () => {
  it('六星的店：每顶命名玉帽换一封同名铉帽邮件；重扫不重复；没命名的、不到六星的不换', async () => {
    const shardId = await createShard(t.db);
    const six = await newRestaurant(t, { shardId, patch: { star_level: 6 } });
    const five = await newRestaurant(t, { shardId, patch: { star_level: 5 } });
    await hat(six, '大橘');
    await hat(six, '小丽');
    await hat(six, null);
    await hat(five, '旺财');
    expect(await scanHats(t.game, log, shardId)).toEqual({ sent: 2, failed: 0 });
    expect(await scanHats(t.game, log, shardId)).toEqual({ sent: 0, failed: 0 });
    const mails = await xuanMails(six.restaurantId);
    expect(mails.map((m) => (m.items as { hats: Array<{ name: string }> }).hats[0]!.name).sort()).toEqual(['大橘', '小丽']);
    expect(await xuanMails(five.restaurantId)).toEqual([]);
    const jade = await t.db
      .selectFrom('equip')
      .select('xuan_sent_at')
      .where('rest_id', '=', six.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.jade)
      .where('custom_name', '=', '大橘')
      .executeTakeFirstOrThrow();
    expect(jade.xuan_sent_at).not.toBeNull();
  });

  it('领取换铉邮件后得到同名铉帽', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { star_level: 6 } });
    await hat(r, '大橘');
    await scanHats(t.game, log, shardId);
    const m = (await t.game.mail.list(r)).items.find((x) => x.source === 'hat')!;
    await t.game.mail.claim(r, m.id);
    const xuan = await t.db
      .selectFrom('equip')
      .select('custom_name')
      .where('rest_id', '=', r.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.xuan)
      .executeTakeFirstOrThrow();
    expect(xuan.custom_name).toBe('大橘');
  });
});
```

（`JobLogger` 的方法以 `worker/scheduler.ts` 为准，测试里的 `log` 对象照着补齐。）

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/ops/scan.test.ts`
Expected: FAIL，`./scan` 不存在。

- [ ] **Step 3：实现**

```ts
// apps/server/src/modules/ops/scan.ts
import { SPONSOR_HATS } from '@dt/config';
import type { Game } from '../../game';
import type { JobLogger } from '../../worker/scheduler';
import { hatDisplayName } from '../equip/hats';
import { sendMail } from '../mail/send';

/**
 * 六星换铉（设计 裁定 25）：每顶命名玉帽只换一次，换过的记在 xuan_sent_at。
 * 每顶单独一个事务，一顶出错不影响其他，下一分钟会再扫到
 */
export async function scanHats(game: Game, log: JobLogger, shardId: number): Promise<{ sent: number; failed: number }> {
  const db = game.app.db;
  const rows = await db
    .selectFrom('equip as e')
    .innerJoin('restaurant as r', 'r.id', 'e.rest_id')
    .select(['e.id', 'e.rest_id', 'e.custom_name'])
    .where('r.shard_id', '=', shardId)
    .where('r.star_level', '>=', 6)
    .where('e.goods_id', '=', SPONSOR_HATS.jade)
    .where('e.custom_name', 'is not', null)
    .where('e.xuan_sent_at', 'is', null)
    .orderBy('e.id')
    .limit(500)
    .execute();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const name = row.custom_name!;
    try {
      const done = await db.transaction().execute(async (tx) => {
        const hit = await tx
          .updateTable('equip')
          .set({ xuan_sent_at: new Date() })
          .where('id', '=', row.id)
          .where('xuan_sent_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (!hit) return false;
        await sendMail(tx, {
          scope: 'rest',
          shardId,
          restId: row.rest_id,
          minLevel: null,
          title: '赞助帽子升级',
          body: `餐厅升到六星，${hatDisplayName('jade', name)}升级为${hatDisplayName('xuan', name)}。`,
          items: { hats: [{ tier: 'xuan', name }] },
          source: 'hat',
          actorAccountId: null,
        });
        return true;
      });
      if (done) sent++;
    } catch (err) {
      failed++;
      log.error({ err, shardId, equipId: row.id }, 'ops-scan hat failed');
    }
  }
  return { sent, failed };
}

/** worker 每分钟一次：遍历开放区服跑各项扫描（设计 §7）；6A-2 在这里加邀请扫描 */
export async function runOpsScan(game: Game, log: JobLogger): Promise<void> {
  const shards = await game.app.db.selectFrom('shard').select('id').where('status', '=', 'open').execute();
  for (const { id } of shards) await scanHats(game, log, id);
}
```

`worker/jobs.ts` 的 `workerJobs` 数组加：

```ts
    {
      name: 'ops-scan',
      intervalMs: 60_000,
      run: async () => {
        await runOpsScan(game, log);
      },
    },
```

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/ops apps/server/src/worker`
Expected: PASS。如果有测试断言 `workerJobs` 的名字列表，把 `'ops-scan'` 加进去。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/ops apps/server/src/worker/jobs.ts
git commit -m "feat(ops): worker 每分钟扫描，六星时把命名玉帽换成同名铉帽邮件"
```

---

### Task 10：前端——厨具显示名

**Files:**
- Create: `apps/web/src/utils/equipName.ts`, `apps/web/src/utils/equipName.test.ts`
- Modify: `apps/web/src/views/EquipView.vue:42`, `apps/web/src/views/EquipDetailView.vue:109`, `apps/web/src/views/FriendRestView.vue:104`, `apps/web/src/views/admin/AdminPlayerView.vue:226`，以及这些视图测试里的 DTO 数据（补 `name: null`）

**Interfaces:**
- Consumes: `EquipDto.name`、好友厨具项 `name`、后台厨具项 `name`（Task 5）。
- Produces: `equipName(names: { goodsName(id: number): string }, e: { goodsId: number; name: string | null }): string`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/utils/equipName.test.ts
import { describe, expect, it } from 'vitest';
import { equipName } from './equipName';

const names = { goodsName: (id: number) => (id === 641 ? '玉•赞助之帽' : `道具${id}`) };

describe('equipName', () => {
  it('有显示名用显示名，否则用道具名', () => {
    expect(equipName(names, { goodsId: 641, name: '玉•大橘之帽' })).toBe('玉•大橘之帽');
    expect(equipName(names, { goodsId: 641, name: null })).toBe('玉•赞助之帽');
    expect(equipName(names, { goodsId: 30, name: null })).toBe('道具30');
  });
});
```

在 `EquipDetailView.test.ts` 追加：

```ts
  it('命名帽子的标题用显示名', async () => {
    vi.mocked(endpoints.equipDetail).mockResolvedValue({
      ...detail({ goodsId: 641, name: '玉•大橘之帽', stress: 0 }),
    });
    const { w } = await mountView();
    expect(w.find('h5').text()).toBe('玉•大橘之帽');
  });
```

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/utils/equipName.test.ts src/views/EquipDetailView.test.ts`
Expected: FAIL，`./equipName` 不存在；标题显示的是道具名。

- [ ] **Step 3：实现**

```ts
// apps/web/src/utils/equipName.ts
/** 厨具显示名：命名帽子用服务端给的显示名，其他用道具名（设计 裁定 23） */
export function equipName(
  names: { goodsName(id: number): string },
  e: { goodsId: number; name: string | null },
): string {
  return e.name ?? names.goodsName(e.goodsId);
}
```

把四个视图里显示厨具名的 `catalog.goodsName(e.goodsId)` 换成 `equipName(catalog, e)`。宝石、回退道具这些非厨具名不要换。给各视图测试里构造的厨具数据补 `name: null`，`EquipDetailView.test.ts` 的 `detail()` 默认值里加 `name: null`。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run && cd ../.. && pnpm typecheck`
Expected: PASS；typecheck 不再报缺 `name`。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(web): 厨具列表、详情、好友店、后台显示命名帽子的名字"
```

---

### Task 11：前端——邮箱页和顶栏信封

**Files:**
- Create: `apps/web/src/stores/mail.ts`, `apps/web/src/views/MailView.vue`, `apps/web/src/views/MailView.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`, `apps/web/src/components/AppHeader.vue`, `apps/web/src/components/AppHeader.test.ts`, `apps/web/src/router.ts`

**和设计的出入**：设计 §6 写的是在餐厅概况里加 `mailUnread`。但顶栏出现在所有游戏页面，不只是首页，所以改用单独的 `GET /mail/unread`，由顶栏在路由变化时读取（30 秒内不重复请求）。在 ledger 记这条 Ruling。

**Interfaces:**
- Consumes: 邮件接口（Task 6）。
- Produces:
  - `endpoints.mail()`、`mailUnread()`、`mailRead(id)`、`mailClaim(id)`、`mailClaimAll()`、`mailDelete(id)`。
  - `useMailStore()`：`unread: number`，`refresh(): Promise<void>`，同一时间只发一个请求，30 秒内不重复请求，除非 `force`。
  - 路由 `/mail`（`meta: { needRestaurant: true }`）。

**界面**：
- **顶栏**：`inGame` 时，右侧显示信封图标链接到 `/mail`，`unread > 0` 时显示红色小数字；`aria-label="邮箱，3 封未读"`。顶栏挂载时、路由变化时调用 `mail.refresh()`。
- **邮箱页**：
  - 标题"邮箱"，旁边是"一键领取"按钮（没有可领的就禁用）。
  - 邮件列表每行：标题（未读加粗）、时间、"还剩 N 天"、附件摘要、按钮。
    - 有附件没领：显示"领取"；`minLevel` 高于当前等级时禁用，写"需 N 级"。
    - 没附件或已领：显示"删除"。
  - 点标题展开正文，展开时调用 `mailRead`；正文用 `white-space: pre-wrap` 显示，文本插值，不用 `v-html`。
  - 领取、删除后重新读列表，并 `mail.refresh({ force: true })`。
  - 兑换码输入框放在 6A-2 做；本任务在页面顶部留一个 `<slot name="top" />` 的位置即可，不写占位文字。
- **附件摘要**：用一个函数 `rewardSummary(items, catalog)` 返回"银币 100、钻石 2、神秘礼券×3、玉•大橘之帽"。放在 `apps/web/src/utils/reward.ts`，后台也用。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/views/MailView.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import MailView from './MailView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    mail: vi.fn(),
    mailUnread: vi.fn(),
    mailRead: vi.fn(),
    mailClaim: vi.fn(),
    mailClaimAll: vi.fn(),
    mailDelete: vi.fn(),
  },
}));

const mail = (patch: Partial<MailDto> = {}): MailDto => ({
  id: 1,
  title: '开服礼',
  body: '欢迎\n来到小镇',
  items: { coin: 100, hats: [{ tier: 'jade', name: '大橘' }] },
  source: 'admin',
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  read: false,
  claimed: false,
  minLevel: null,
  ...patch,
});

describe('MailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
    useRestaurantStore().rest = { level: 5 } as never;
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail()], unread: 1 });
    vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 0 });
    vi.mocked(endpoints.mailClaim).mockResolvedValue({ id: 1, items: { coin: 100 } });
    vi.mocked(endpoints.mailRead).mockResolvedValue(undefined as never);
  });

  it('列出邮件：附件摘要（含命名帽子）、剩余天数；领取后重新读取', async () => {
    const w = mount(MailView);
    await flushPromises();
    expect(w.text()).toContain('开服礼');
    expect(w.text()).toContain('银币 100');
    expect(w.text()).toContain('玉•大橘之帽');
    expect(w.text()).toContain('还剩 3 天');
    await w.find('[data-testid="mail-claim-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailClaim).toHaveBeenCalledWith(1);
    expect(endpoints.mail).toHaveBeenCalledTimes(2);
  });

  it('等级不够时领取按钮禁用并写明要几级；展开正文时标记已读，换行保留', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({ items: [mail({ minLevel: 10 })], unread: 1 });
    const w = mount(MailView);
    await flushPromises();
    const btn = w.find('[data-testid="mail-claim-1"]');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('需 10 级');
    await w.find('[data-testid="mail-title-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mailRead).toHaveBeenCalledWith(1);
    expect(w.find('[data-testid="mail-body-1"]').text()).toContain('欢迎\n来到小镇');
  });

  it('领完的邮件显示删除；一键领取汇报失败封数', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({
      items: [mail({ id: 2, claimed: true }), mail({ id: 3 })],
      unread: 0,
    });
    vi.mocked(endpoints.mailClaimAll).mockResolvedValue({ claimed: 0, failed: 1, items: [] });
    const w = mount(MailView);
    await flushPromises();
    expect(w.find('[data-testid="mail-delete-2"]').exists()).toBe(true);
    await w.find('[data-testid="mail-claim-all"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('1 封没领成');
  });
});
```

`AppHeader.test.ts` 追加：

```ts
  it('游戏里显示信封和未读数，点开去邮箱', async () => {
    vi.mocked(endpoints.mailUnread).mockResolvedValue({ count: 3 });
    const w = await mountHeader({ inGame: true });
    const link = w.find('[data-testid="mail-link"]');
    expect(link.attributes('href')).toBe('/mail');
    expect(link.text()).toContain('3');
    expect(link.attributes('aria-label')).toBe('邮箱，3 封未读');
  });
```

（`mountHeader` 用 `AppHeader.test.ts` 里现有的挂载方式；如果那里没有封装，就照现有用例的写法挂载，并在顶部 `vi.mock('../api/endpoints', ...)` 里加 `mailUnread`。）

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/views/MailView.test.ts src/components/AppHeader.test.ts`
Expected: FAIL，`MailView.vue` 不存在、顶栏没有 `mail-link`。

- [ ] **Step 3：实现**

- `endpoints.ts` 加：

```ts
  mail: () => api.get<MailListDto>('/api/v1/mail'),
  mailUnread: () => api.get<{ count: number }>('/api/v1/mail/unread'),
  mailRead: (id: number) => api.post<void>(`/api/v1/mail/${id}/read`, {}),
  mailClaim: (id: number) => api.post<MailClaimDto>(`/api/v1/mail/${id}/claim`, {}),
  mailClaimAll: () => api.post<MailClaimAllDto>('/api/v1/mail/claim-all', {}),
  mailDelete: (id: number) => api.post<void>(`/api/v1/mail/${id}/delete`, {}),
```

- `stores/mail.ts`：

```ts
import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/** 顶栏未读数：路由切换时刷新，30 秒内不重复请求（领取、删除后强制刷新） */
export const useMailStore = defineStore('mail', {
  state: () => ({ unread: 0, at: 0, pending: null as Promise<void> | null }),
  actions: {
    refresh(opts: { force?: boolean } = {}): Promise<void> {
      if (this.pending) return this.pending;
      if (!opts.force && Date.now() - this.at < 30_000) return Promise.resolve();
      this.pending = endpoints
        .mailUnread()
        .then((r) => {
          this.unread = r.count;
          this.at = Date.now();
        })
        .catch(() => undefined)
        .finally(() => {
          this.pending = null;
        });
      return this.pending;
    },
  },
});
```

- `utils/reward.ts`：

```ts
import { SPONSOR_HAT_PREFIX, type HatTier } from '@dt/config';
import type { RewardItems } from '@dt/shared';
import { formatNum } from './format';

/** 附件摘要："银币 100、钻石 2、神秘礼券×3、玉•大橘之帽" */
export function rewardSummary(
  i: RewardItems,
  names: { goodsName(id: number): string; foodName(id: number): string },
): string {
  const parts: string[] = [];
  if (i.coin) parts.push(`银币 ${formatNum(i.coin)}`);
  if (i.diamond) parts.push(`钻石 ${formatNum(i.diamond)}`);
  if (i.exp) parts.push(`经验 ${formatNum(i.exp)}`);
  for (const g of i.goods ?? []) parts.push(`${names.goodsName(g.id)}×${g.num}`);
  for (const f of i.foods ?? []) parts.push(`${names.foodName(f.id)}×${f.num}`);
  for (const h of i.hats ?? []) parts.push(`${SPONSOR_HAT_PREFIX[h.tier as HatTier]}•${h.name}之帽`);
  return parts.join('、');
}
```

  如果 web 不能直接 import `@dt/config`（看 `apps/web/package.json` 的依赖），就把 `{ jade: '玉', xuan: '铉' }` 放进 `@dt/shared` 的 `mail.ts` 导出为 `HAT_PREFIX`，服务端 `hats.ts` 和这里都用它，并在 ledger 记 Ruling。

- `MailView.vue`：按"界面"一节实现。剩余天数：`Math.max(0, Math.ceil((new Date(m.expiresAt).getTime() - Date.now()) / 86_400_000))`。当前等级取 `useRestaurantStore().rest?.level ?? 0`。领取、删除、一键领取都走一个带 `busy` 的 `run()`，失败用 `toast.push(errorMessage(e, '…'), 'danger')`。一键领取的结果 `failed > 0` 时提示"还有 N 封没领成，稍后再试"。错误文案的中文映射加到 `i18n/zh-CN.ts`：`mail_claimed: '这封邮件已经领过了'`、`mail_level: '等级不够，需 {level} 级'`、`mail_unclaimed: '附件还没领，不能删除'`、`mail_no_items: '这封邮件没有附件'`。写法照文件里现有 `reason` 映射。
- `AppHeader.vue`：`inGame` 时在右侧加：

```vue
    <RouterLink
      v-if="inGame"
      to="/mail"
      class="ms-auto text-reset text-decoration-none position-relative"
      data-testid="mail-link"
      :aria-label="mail.unread > 0 ? `邮箱，${mail.unread} 封未读` : '邮箱'"
    >
      <i class="bi bi-envelope"></i>
      <span v-if="mail.unread > 0" class="badge rounded-pill bg-danger dt-mail-badge">{{ mail.unread }}</span>
    </RouterLink>
```

  `watch(() => route.path, () => { if (props.inGame) void mail.refresh(); }, { immediate: true })`。`dt-mail-badge` 的样式加到 `styles/main.css`：`font-size: 10px; position: absolute; top: -6px; right: -10px;`。
- `router.ts` 加 `{ path: '/mail', name: 'mail', component: () => import('./views/MailView.vue'), meta: { needRestaurant: true } }`。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(web): 邮箱页、顶栏信封未读数"
```

---

### Task 12：前端——公告横幅、重要公告弹窗、登录页公告

**Files:**
- Create: `apps/web/src/components/AnnounceBanner.vue`, `apps/web/src/components/AnnouncePopup.vue`, `apps/web/src/components/Announce.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`, `apps/web/src/views/RestaurantHomeView.vue`, `apps/web/src/App.vue`, `apps/web/src/views/LoginView.vue`

**Interfaces:**
- Consumes: 公告接口（Task 8）。
- Produces:
  - `endpoints.announcements()`、`announcementSeen(id)`、`publicAnnouncements()`。
  - `<AnnounceBanner :items>`：显示第一条的标题，点开展开全部公告；没有公告时不渲染。
  - `<AnnouncePopup>`：在 `App.vue` 里、`inGame` 时挂载；读一次公告，按顺序弹出未看的重要公告，关闭一条就 `announcementSeen(id)`，再弹下一条。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/components/Announce.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncementDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AnnounceBanner from './AnnounceBanner.vue';
import AnnouncePopup from './AnnouncePopup.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { announcements: vi.fn(), announcementSeen: vi.fn() },
}));

const a = (patch: Partial<AnnouncementDto> = {}): AnnouncementDto => ({
  id: 1,
  title: '停服维护',
  body: '今晚 2 点\n预计 1 小时',
  important: false,
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-02T00:00:00.000Z',
  seen: true,
  ...patch,
});

describe('公告', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.announcementSeen).mockResolvedValue(undefined as never);
  });

  it('横幅显示第一条标题，点开看全部；没有公告不渲染', async () => {
    const w = mount(AnnounceBanner, { props: { items: [a(), a({ id: 2, title: '开服活动' })] } });
    expect(w.find('[data-testid="announce-banner"]').text()).toContain('停服维护');
    await w.find('[data-testid="announce-banner"]').trigger('click');
    expect(w.text()).toContain('开服活动');
    expect(w.text()).toContain('今晚 2 点');
    expect(mount(AnnounceBanner, { props: { items: [] } }).find('[data-testid="announce-banner"]').exists()).toBe(false);
  });

  it('未看的重要公告逐条弹出，关掉一条记已看再弹下一条；看过的不弹', async () => {
    vi.mocked(endpoints.announcements).mockResolvedValue({
      items: [
        a({ id: 1, important: true, seen: false, title: '一' }),
        a({ id: 2, important: true, seen: false, title: '二' }),
        a({ id: 3, important: true, seen: true, title: '三' }),
      ],
    });
    const w = mount(AnnouncePopup);
    await flushPromises();
    expect(w.find('[data-testid="announce-popup"]').text()).toContain('一');
    await w.find('[data-testid="announce-close"]').trigger('click');
    await flushPromises();
    expect(endpoints.announcementSeen).toHaveBeenCalledWith(1);
    expect(w.find('[data-testid="announce-popup"]').text()).toContain('二');
    await w.find('[data-testid="announce-close"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="announce-popup"]').exists()).toBe(false);
  });
});
```

在 `RestaurantHomeView.test.ts` 的 endpoints mock 里加 `announcements: vi.fn()`，`beforeEach` 里 `mockResolvedValue({ items: [] })`。追加用例：有公告时首页显示 `announce-banner`。在 `LoginView` 的测试（没有就新建 `LoginView.test.ts`，mock `publicAnnouncements` 和登录相关接口）里断言：有公开公告时，登录卡片上方显示公告标题。

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/components/Announce.test.ts`
Expected: FAIL，组件不存在。

- [ ] **Step 3：实现**

- `endpoints.ts`：

```ts
  announcements: () => api.get<AnnouncementsDto>('/api/v1/announcements'),
  announcementSeen: (id: number) => api.post<void>(`/api/v1/announcements/${id}/seen`, {}),
  publicAnnouncements: () => api.get<AnnouncementsDto>('/api/v1/public/announcements'),
```

- `AnnounceBanner.vue`：
  - 外层 `<div v-if="items.length > 0" class="dt-card my-2 small">`。
  - 标题行是一个 `button`（`data-testid="announce-banner"`，`aria-expanded`），图标 `bi-megaphone`，显示 `items[0].title`；多于一条时加"等 N 条"。
  - 展开后逐条显示标题（加粗）和正文（`white-space: pre-wrap`）。
- `AnnouncePopup.vue`：
  - `onMounted` 读 `announcements()`，取 `important && !seen` 的放进队列。
  - 队首不为空时，显示 Bootstrap 风格的模态框（`div.modal.d-block` 加遮罩，`role="dialog"`，`aria-modal="true"`，`data-testid="announce-popup"`），按钮"知道了"（`data-testid="announce-close"`）。
  - 点击后调 `announcementSeen(id)`（失败也出队，避免卡住），出队。读取失败时静默。
- `App.vue`：`<AnnouncePopup v-if="inGame" />` 放在 `<EventToast />` 前面。
- `RestaurantHomeView.vue`：`load()` 里并行读 `endpoints.announcements()`，失败忽略；在店名行下面放 `<AnnounceBanner :items="announcements" />`。
- `LoginView.vue`：`onMounted` 读 `publicAnnouncements()`，失败忽略；在登录卡片上方放 `<AnnounceBanner :items="announcements" />`。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(web): 首页公告横幅、重要公告弹窗、登录页公告"
```

---

### Task 13：后台——附件编辑器、邮件页、公告页、补偿改发邮件

**Files:**
- Create: `apps/web/src/components/admin/RewardItemsEditor.vue`, `apps/web/src/components/admin/RewardItemsEditor.test.ts`, `apps/web/src/views/admin/AdminMailView.vue`, `apps/web/src/views/admin/AdminMailView.test.ts`, `apps/web/src/views/admin/AdminAnnounceView.vue`, `apps/web/src/views/admin/AdminAnnounceView.test.ts`
- Modify: `apps/web/src/views/admin/AdminGrantsView.vue`, `apps/web/src/views/admin/AdminGrantsView.test.ts`, `apps/web/src/views/admin/AdminLayout.vue`, `apps/web/src/api/admin.ts`, `apps/web/src/router.ts`

**Interfaces:**
- Consumes: 后台邮件、公告接口（Task 7、8）；`rewardSummary`（Task 11）。
- Produces:
  - `<RewardItemsEditor v-model="items" :hats="boolean" @over="(msgs: string[]) => …" />`：编辑银币、钻石、经验、道具、食材，`hats` 为 true 时多一组"命名帽子"（档次下拉 + 名字）。`modelValue` 类型是 `RewardItems`，空项不出现在对象里。超出 `GRANT_LIMITS` 时通过 `over` 事件给出提示列表。
  - `adminApi.mails(shardId?)`、`sendMail(b)`、`revokeMail(id)`、`announcements()`、`createAnnouncement(b)`、`updateAnnouncement(id, b)`、`deleteAnnouncement(id)`。
  - 路由 `/admin/mail`、`/admin/announce`；后台导航加"邮件""公告"。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/components/admin/RewardItemsEditor.test.ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import RewardItemsEditor from './RewardItemsEditor.vue';

describe('RewardItemsEditor', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('填银币和一顶命名帽子，输出的附件只含填了的项', async () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: true } });
    await w.find('[data-testid="ri-coin"]').setValue('100');
    await w.find('[data-testid="ri-add-hat"]').trigger('click');
    await w.find('[data-testid="ri-hat-name-0"]').setValue('大橘');
    const last = w.emitted('update:modelValue')!.at(-1)![0];
    expect(last).toEqual({ coin: 100, hats: [{ tier: 'jade', name: '大橘' }] });
  });

  it('超过上限时报出来；不开帽子时没有帽子那一组', async () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: false } });
    expect(w.find('[data-testid="ri-add-hat"]').exists()).toBe(false);
    await w.find('[data-testid="ri-diamond"]').setValue('100001');
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['钻石最多 100,000']);
  });
});
```

```ts
// apps/web/src/views/admin/AdminMailView.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminMailView from './AdminMailView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { mails: vi.fn(), sendMail: vi.fn(), revokeMail: vi.fn(), restaurant: vi.fn(), searchPlayers: vi.fn() },
}));

describe('AdminMailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    vi.mocked(adminApi.mails).mockResolvedValue([]);
    vi.mocked(adminApi.sendMail).mockResolvedValue({ id: 5 } as never);
  });

  it('发区服邮件前确认，写明收件范围；发送内容带附件', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AdminMailView);
    await flushPromises();
    await w.find('[data-testid="mail-scope"]').setValue('shard');
    await w.find('[data-testid="mail-title"]').setValue('开服礼');
    await w.find('[data-testid="mail-body"]').setValue('欢迎');
    await w.find('[data-testid="ri-coin"]').setValue('100');
    await w.find('[data-testid="mail-send"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('当前区服所有已开的店');
    expect(adminApi.sendMail).toHaveBeenCalledWith({
      scope: 'shard',
      shardId: 1,
      title: '开服礼',
      body: '欢迎',
      items: { coin: 100 },
    });
  });

  it('撤回要确认；已撤回的不显示撤回按钮', async () => {
    vi.mocked(adminApi.mails).mockResolvedValue([
      { id: 7, scope: 'shard', shardId: 1, restId: null, minLevel: null, title: 't', body: 'b', items: null, source: 'admin', createdAt: '', expiresAt: '', revokedAt: null, claimedCount: 2, actor: 'op' },
      { id: 8, scope: 'shard', shardId: 1, restId: null, minLevel: null, title: 't', body: 'b', items: null, source: 'admin', createdAt: '', expiresAt: '', revokedAt: '2026-10-01T00:00:00Z', claimedCount: 0, actor: 'op' },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mount(AdminMailView);
    await flushPromises();
    await w.find('[data-testid="mail-revoke-7"]').trigger('click');
    expect(adminApi.revokeMail).not.toHaveBeenCalled();
    expect(w.find('[data-testid="mail-revoke-8"]').exists()).toBe(false);
    expect(w.text()).toContain('已领 2');
  });
});
```

`AdminAnnounceView.test.ts`：mock `announcements`、`createAnnouncement`、`deleteAnnouncement`。断言：
- 填标题、正文，勾"重要"，选开始、结束时间后点保存，`createAnnouncement` 收到 `{ shardId: null, title, body, important: true, startsAt, endsAt }`。时间用 `datetime-local` 输入，转成 ISO。
- 删除要确认。

`AdminGrantsView.test.ts` 追加：勾"改为发邮件"（`data-testid="grant-as-mail"`）后发放，`createGrant` 收到的请求体里 `asMail: true`；现有用例照常通过，说明附件编辑器抽出去后行为不变。

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/components/admin src/views/admin`
Expected: FAIL，新组件和页面不存在。

- [ ] **Step 3：实现**

- `RewardItemsEditor.vue`：
  - 把 `AdminGrantsView.vue` 里的银币、钻石、经验、道具行、食材行的输入和 `overLimit` 计算搬过来，`data-testid` 用 `ri-coin`、`ri-diamond`、`ri-exp`、`ri-goods-…`、`ri-foods-…`。
  - 内部状态变化时 `emit('update:modelValue', items())`、`emit('over', overLimit)`。
  - `hats` 为 true 时多一组：`ri-add-hat` 按钮加一行；每行档次下拉（玉 `jade` / 铉 `xuan`）和名字输入（`maxlength="8"`）；名字为空的行不进结果。
- `AdminGrantsView.vue`：
  - 用 `<RewardItemsEditor v-model="items" :hats="false" @over="over = $event" />` 替换原来的输入。
  - `summary` 改用 `rewardSummary`。
  - 加一个复选框"改为发邮件（玩家在邮箱里领取）"，`data-testid="grant-as-mail"`；提交时 `asMail: asMail.value || undefined`。
- `AdminMailView.vue`：
  - 收件范围下拉（`rest` 单店 / `shard` 当前区服 / `all` 全部区服），单店时复用补偿页"按店名查 id + 显示店主"的那段逻辑（复制过来，各自独立）。
  - 等级门槛、标题、正文；附件 `<RewardItemsEditor :hats="true" />`。
  - 发送前 `confirm`：单店"发给 {店名}"；区服"发给当前区服所有已开的店（之后开的店收不到）"；全部"发给所有区服所有已开的店"。
  - 列表显示标题、范围、附件摘要、已领人数、发送人、状态（已撤回），未撤回的有"撤回"按钮，撤回前 `confirm`。
- `AdminAnnounceView.vue`：列表（标题、区服、时间段、重要、发送人）加新建和编辑表单（区服：当前区服 / 全部区服；标题；正文；重要；开始、结束时间用 `datetime-local`，默认开始是现在、结束是 7 天后）、删除（确认）。
- `api/admin.ts`：照现有写法加 7 个方法，路径 `${A}/mails`、`${A}/mails/${id}/revoke`、`${A}/announcements`、`${A}/announcements/${id}`、`${A}/announcements/${id}/delete`。
- `AdminLayout.vue` 的 `links` 在"补偿"后加 `{ to: '/admin/mail', label: '邮件' }`、`{ to: '/admin/announce', label: '公告' }`；`router.ts` 的后台子路由加两条，照现有后台路由的写法。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run && cd ../.. && pnpm typecheck && pnpm lint`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(admin): 后台邮件页、公告页；附件编辑器（含命名帽子）；补偿可改为发邮件"
```

---

### Task 14：e2e、文档、全量检查

**Files:**
- Create: `apps/web/e2e/mail.spec.ts`, `docs/rules/邮箱和公告.md`
- Modify: `docs/deploy.md`

- [ ] **Step 1：写 e2e**

```ts
// apps/web/e2e/mail.spec.ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 只操作本用例新注册的账号和店：把自己设为管理员，给自己这家店发单店邮件 */
test('后台发单店邮件 → 玩家在邮箱领取，银币到账', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
  } finally {
    await client.end();
  }
  const overview = async () =>
    ((await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
      data: { id: number; shardId: number; coin: number };
    }).data;
  const before = await overview();
  const sent = await page.request.post('/api/v1/admin/mails', {
    data: {
      scope: 'rest',
      shardId: before.shardId,
      restId: before.id,
      title: 'e2e 测试邮件',
      body: '端到端测试',
      items: { coin: 1234 },
    },
  });
  expect(sent.ok()).toBe(true);

  await page.goto('/mail');
  await expect(page.getByText('e2e 测试邮件')).toBeVisible();
  await expect(page.getByTestId('mail-link')).toContainText('1');
  await page.locator('[data-testid^="mail-claim-"]').first().click();
  await expect(page.locator('[data-testid^="mail-delete-"]').first()).toBeVisible();
  expect((await overview()).coin).toBe(before.coin + 1234);
});
```

`page.request` 带着页面的登录 cookie。POST 要带 JSON 的 `Content-Type`（CSRF 检查），Playwright 传 `data` 对象时会自动加。

- [ ] **Step 2：运行 e2e**

Run: `pnpm --filter @dt/web e2e`（需要 dev 服务在跑；dev 库已迁移到 0018）
Expected: 17 passed（原 16 个加这个）。如果首页的经营结算在这期间给店加了银币，把断言改成 `toBeGreaterThanOrEqual(before.coin + 1234)`，并在 ledger 记一条 Ruling。

- [ ] **Step 3：写文档**

`docs/rules/邮箱和公告.md`：照 `docs/rules/` 下现有规则文档的格式写给玩家看的规则，内容取自设计 §2 裁定 1~12、23、25：
- 邮件 30 天过期；
- 全服邮件只给发送时已开的店；
- 等级门槛按领取时；
- 附件领了才能删；
- 重要公告只弹一次；
- 赞助帽子的命名和六星换铉。

`docs/deploy.md` 照现有条目的写法加：
- 迁移 0018 新建的表和两列，各一句话说明；
- 新功能开关 `features.mail`（默认开）；
- worker 新任务 `ops-scan`（每分钟），负责六星换铉，6A-2 起还负责邀请奖励；
- 公开接口 `/api/v1/public/announcements` 不用登录。

- [ ] **Step 4：全量检查**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm --filter @dt/web e2e`
Expected: 全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/web/e2e/mail.spec.ts docs
git commit -m "test(e2e): 后台发邮件、玩家领取；docs: 邮箱和公告规则、部署说明"
```
