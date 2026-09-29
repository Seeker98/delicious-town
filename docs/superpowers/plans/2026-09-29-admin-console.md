# 精简运营控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有网页里加一个 `/admin` 后台：区服数值（带校验、历史、回滚、即时生效）、玩家查询和处理、补偿发放、经济统计、审计日志，mod / admin 两级权限。

**Architecture:** 服务端新增 `modules/admin/`（权限、审计、区服、玩家、补偿、统计各一个文件）和迁移 0003；区服配置缓存通过 Redis 发布订阅失效；全区服补偿和每日统计汇总由 worker 执行。前端新增 `views/admin/` 下按路由懒加载的一组页面和两个自绘 SVG 图表组件。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、ioredis、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-29-admin-console-design.md`

## Global Constraints

- 后台接口前缀 `/api/v1/admin`；未登录 401（`UNAUTHORIZED`），角色不够或已封禁一律 404（`NOT_FOUND`）
- **所有写接口都用 POST**（CORS 只放行 GET/POST，测试工具 `call` 也只支持这两种）；设计文档 4.3 的 `PUT /shards/:id/override` 实现为 `POST /shards/:id/override`
- 每个后台请求都从数据库读角色和封禁状态，不缓存
- 所有后台写操作和审计写入在同一个事务里
- 补偿上限：银币、经验 ≤ 100000000；钻石 ≤ 100000；道具、食材每种 ≤ 9999
- 补偿流水来源 `admin.grant`；个人日志类型 `admin.grant`、`admin.rename`
- 活跃店数排除的系统来源：`settlement`、`mouse`、`market.guess`、`market.guess.refund`、`admin.grant`
- 统计按北京时间的游戏日（`gameDay` / `gameTime`）；经济查询范围最长 90 天
- 界面文字全部中文；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写在 `db/migrations/index.ts` 的列表里
- 每个任务结束时 `pnpm test` 全绿再提交；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **玩家搜索输入里带 `%`、`_`**：必须按字面匹配，搜 `100%` 不能匹配所有人。→ Task 4 测试
2. **统计的日界按北京时间**：UTC 15:59 和 16:00 的流水分属两天。→ Task 6 测试
3. **两个 worker 同时处理同一个全区服补偿**：每家店仍然只到账一次。→ Task 5 测试
4. **语义上危险的覆盖值**：经验倍率 ≤ 0 必须被拒绝（400 `INVALID_CONFIG`），不能让全服拿不到经验。→ Task 3 测试
5. **回滚到一个在当前配置结构下已经不合法的历史版本**：返回 400 `INVALID_CONFIG`，不写入、不崩溃。→ Task 3 测试

---

## 文件结构

```
packages/shared/src/schemas/admin.ts        后台接口的 zod schema 和 DTO
packages/shared/src/errors.ts               新增 INVALID_CONFIG、VERSION_CONFLICT
packages/shared/src/schemas/auth.ts         MeDto 增加 role
packages/config/src/tuning.ts               expMultiplier 改为正数
apps/server/src/db/migrations/0003_admin_console.ts
apps/server/src/db/schema.ts                新表类型、account.role / ban_reason、shard_config.version
apps/server/src/infra/settingsBus.ts        区服配置变更的发布和订阅
apps/server/src/modules/shard/service.ts    invalidate(shardId)
apps/server/src/modules/admin/
  access.ts      requireRole：读角色、封禁，决定 401/404
  audit.ts       writeAudit、auditPage
  diff.ts        diffPaths：两份覆盖之间改动的叶子路径
  roles.ts       setRoleByUsername（命令行用）
  shards.ts      区服数值：settings / save / history / rollback
  players.ts     搜索、详情、餐厅、流水、封号、改名、改角色
  grants.ts      grantItemsOp、单店和全区服发放、processGrants
  stats.ts       aggregateDay、rollupDay、statDailyJob、economy、distribution、settlementRounds
  routes.ts      adminRoutes：注册所有后台路由
apps/server/src/cli/account.ts              pnpm --filter @dt/server account role <用户名> <角色>
apps/server/src/modules/restaurant/reads.ts 导出 parseCursor / cursorOf
apps/server/src/modules/growth/rules.ts     导出 renameProblem（改名校验，玩家和后台共用）
apps/web/src/api/admin.ts                   后台接口
apps/web/src/stores/admin.ts                当前管理员（role）
apps/web/src/utils/settingsTree.ts          覆盖对象的叶子遍历、按路径读写删
apps/web/src/components/admin/LineChart.vue、BarChart.vue
apps/web/src/views/admin/
  AdminLayout.vue、AdminHomeView.vue、AdminShardView.vue、AdminShardHistoryView.vue、
  AdminPlayersView.vue、AdminPlayerView.vue、AdminGrantsView.vue、AdminStatsView.vue、AdminAuditView.vue
apps/web/e2e/admin.spec.ts
```

---

### Task 1: 迁移、类型、错误码、角色进 MeDto

**Files:**
- Create: `apps/server/src/db/migrations/0003_admin_console.ts`
- Create: `apps/server/src/db/migrations/0003.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/schemas/auth.ts`（MeDto）
- Modify: `apps/server/src/modules/account/service.ts`（me 返回 role；登录被封时带原因）
- Modify: `apps/web/src/i18n/zh-CN.ts`（新错误码文案；封禁原因）
- Modify: `packages/config/src/tuning.ts`（expMultiplier 正数）
- Test: `apps/server/src/modules/account/account.test.ts`（追加）

**Interfaces:**
- Produces: 表 `shard_config_history`、`admin_grant`、`admin_grant_done`、`stat_daily`；`account.role` 取值 `'player' | 'mod' | 'admin'`；`account.ban_reason`；`shard_config.version`；`ErrorCode.INVALID_CONFIG`、`ErrorCode.VERSION_CONFLICT`；`MeDto.role: 'player' | 'mod' | 'admin'`；登录被封时 `ACCOUNT_BANNED` 的 params 为 `{ reason: string | null }`

- [ ] **Step 1: 写迁移测试**

`apps/server/src/db/migrations/0003.test.ts`：

```ts
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shardId: number;
let accountId: number;
beforeAll(async () => {
  shardId = await createShard(db);
  accountId = await createAccountRow(db);
});

describe('迁移 0003', () => {
  it('角色可以是 mod；非法角色被拒', async () => {
    await db.updateTable('account').set({ role: 'mod' }).where('id', '=', accountId).execute();
    await expect(
      sql`update account set role = 'boss' where id = ${accountId}`.execute(db),
    ).rejects.toThrow();
  });

  it('shard_config 有 version，默认 0', async () => {
    await db.insertInto('shard_config').values({ shard_id: shardId }).execute();
    const r = await db
      .selectFrom('shard_config')
      .select('version')
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(r.version).toBe(0);
  });

  it('新表可以写入和读出；stat_daily 的 day 读出为字符串', async () => {
    await db
      .insertInto('shard_config_history')
      .values({ shard_id: shardId, version: 1, override: JSON.stringify({}), note: 'n' })
      .execute();
    const g = await db
      .insertInto('admin_grant')
      .values({
        shard_id: shardId,
        target: 'shard',
        items: JSON.stringify({ coin: 1 }),
        reason: 'r',
        status: 'pending',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('admin_grant_done').values({ grant_id: g.id, rest_id: 1, ok: true }).execute();
    await db
      .insertInto('stat_daily')
      .values({ shard_id: shardId, day: '2026-09-30', kind: 'coin', source: 'x', amount: 5 })
      .execute();
    const s = await db
      .selectFrom('stat_daily')
      .selectAll()
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(s).toMatchObject({ day: '2026-09-30', amount: 5 });
    expect(typeof g.id).toBe('number');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/db/migrations/0003.test.ts`
Expected: FAIL（类型错误或表 / 列不存在）

- [ ] **Step 3: 写迁移并登记**

`apps/server/src/db/migrations/0003_admin_console.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table account drop constraint account_role_check`,
    sql`alter table account add constraint account_role_check check (role in ('player', 'mod', 'admin'))`,
    sql`alter table account add column ban_reason text`,
    sql`alter table shard_config add column version integer not null default 0`,
    sql`create table shard_config_history (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id),
      version integer not null,
      override jsonb not null,
      actor_account_id integer references account(id),
      note text not null,
      created_at timestamptz not null default now(),
      unique (shard_id, version)
    )`,
    sql`create table admin_grant (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id),
      target text not null check (target in ('rest', 'shard')),
      rest_id integer,
      min_level integer,
      items jsonb not null,
      reason text not null,
      status text not null check (status in ('pending', 'running', 'done', 'failed')),
      total integer not null default 0,
      done_count integer not null default 0,
      failed_count integer not null default 0,
      actor_account_id integer references account(id),
      created_at timestamptz not null default now(),
      finished_at timestamptz
    )`,
    sql`create index admin_grant_open on admin_grant (id) where status in ('pending', 'running')`,
    sql`create table admin_grant_done (
      grant_id bigint not null references admin_grant(id) on delete cascade,
      rest_id integer not null,
      ok boolean not null,
      error text,
      created_at timestamptz not null default now(),
      primary key (grant_id, rest_id)
    )`,
    sql`create table stat_daily (
      shard_id integer not null references shard(id),
      day date not null,
      kind text not null,
      source text not null,
      amount bigint not null,
      primary key (shard_id, day, kind, source)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['stat_daily', 'admin_grant_done', 'admin_grant', 'shard_config_history']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`alter table shard_config drop column version`.execute(db);
  await sql`alter table account drop column ban_reason`.execute(db);
  await sql`update account set role = 'player' where role = 'mod'`.execute(db);
  await sql`alter table account drop constraint account_role_check`.execute(db);
  await sql`alter table account add constraint account_role_check check (role in ('player', 'admin'))`.execute(
    db,
  );
}
```

`apps/server/src/db/migrations/index.ts`：加 `import * as m0003 from './0003_admin_console';`，列表里加 `'0003_admin_console': m0003,`。

- [ ] **Step 4: 补 schema 类型**

`apps/server/src/db/schema.ts`：

```ts
// AccountTable 里：
  role: Default<'player' | 'mod' | 'admin'>;
  banned_at: TsNullable;
  ban_reason: Nullable<string>;

// ShardConfigTable 里加：
  version: Default<number>;
```

在 `JobRunTable` 之后新增：

```ts
export interface ShardConfigHistoryTable {
  id: Generated<number>;
  shard_id: number;
  version: number;
  override: Json<Record<string, unknown>>;
  actor_account_id: Nullable<number>;
  note: string;
  created_at: TsDefault;
}

export interface AdminGrantTable {
  id: Generated<number>;
  shard_id: number;
  target: 'rest' | 'shard';
  rest_id: Nullable<number>;
  min_level: Nullable<number>;
  items: Json<unknown>;
  reason: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  total: Default<number>;
  done_count: Default<number>;
  failed_count: Default<number>;
  actor_account_id: Nullable<number>;
  created_at: TsDefault;
  finished_at: TsNullable;
}

export interface AdminGrantDoneTable {
  grant_id: number;
  rest_id: number;
  ok: boolean;
  error: Nullable<string>;
  created_at: TsDefault;
}

export interface StatDailyTable {
  shard_id: number;
  /** 北京时间的游戏日 YYYY-MM-DD */
  day: string;
  kind: string;
  source: string;
  amount: number;
}
```

`DB` 接口里加：

```ts
  shard_config_history: ShardConfigHistoryTable;
  admin_grant: AdminGrantTable;
  admin_grant_done: AdminGrantDoneTable;
  stat_daily: StatDailyTable;
```

- [ ] **Step 5: 运行迁移测试，确认通过**

Run: `pnpm exec vitest run apps/server/src/db/migrations/0003.test.ts`
Expected: PASS（测试库在全局 setup 里迁移到最新）

- [ ] **Step 6: 写 me 和封禁原因的测试**

在 `apps/server/src/modules/account/account.test.ts` 末尾追加（文件已有 `ctx`、`registerUser`、`call`）：

```ts
describe('角色和封禁原因', () => {
  it('me 返回角色，默认 player', async () => {
    const u = await registerUser(ctx.app);
    const me = await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    expect(me.json.data.role).toBe('player');
  });

  it('被封的账号登录时带出封禁原因', async () => {
    const u = await registerUser(ctx.app);
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_at: new Date(), ban_reason: '刷分' })
      .where('id', '=', u.accountId)
      .execute();
    const r = await call(ctx.app, 'POST', '/api/v1/account/login', {
      body: { username: u.username, password: 'secret123' },
    });
    expect(r.status).toBe(403);
    expect(r.json).toMatchObject({ code: 'ACCOUNT_BANNED', params: { reason: '刷分' } });
  });
});
```

- [ ] **Step 7: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/account/account.test.ts -t "角色和封禁原因"`
Expected: FAIL（role 为 undefined；params 缺失）

- [ ] **Step 8: 实现**

`packages/shared/src/errors.ts` 在 `INVALID_STATE` 之前加：

```ts
  INVALID_CONFIG: 'INVALID_CONFIG',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
```

`packages/shared/src/schemas/auth.ts`：

```ts
export type AccountRole = 'player' | 'mod' | 'admin';

export interface MeDto {
  accountId: number;
  username: string;
  email: string;
  emailVerified: boolean;
  role: AccountRole;
  shardId: number | null;
  restaurantId: number | null;
}
```

`apps/server/src/modules/account/service.ts`：

```ts
// login 里：
        .select(['id', 'password_hash', 'banned_at', 'ban_reason'])
...
      if (account.banned_at)
        throw new AppError(ErrorCode.ACCOUNT_BANNED, 403, { reason: account.ban_reason });

// me 里：
        .select(['id', 'username', 'email', 'email_verified_at', 'role'])
...
        emailVerified: a.email_verified_at !== null,
        role: a.role,
```

`packages/config/src/tuning.ts`：`expMultiplier: num,` 改为 `expMultiplier: z.number().positive(),`（文件顶部已 `import { z } from 'zod'`）。

`apps/web/src/i18n/zh-CN.ts` 的 `TEXT` 里加：

```ts
  INVALID_CONFIG: '配置不合法，请检查标红的项',
  VERSION_CONFLICT: '配置已被别人修改，请刷新后再改',
```

并在 `errorText` 开头加：

```ts
  if (code === 'ACCOUNT_BANNED' && typeof params.reason === 'string' && params.reason) {
    return `账号已被封禁：${params.reason}`;
  }
```

在 `apps/web/src/i18n/zh-CN.test.ts` 追加断言：

```ts
it('封禁带原因', () => {
  expect(errorText('ACCOUNT_BANNED', { reason: '刷分' })).toBe('账号已被封禁：刷分');
});
```

前端所有构造 `MeDto` 的测试数据补上 `role: 'player'`（用 `pnpm --filter @dt/web typecheck` 找出来）。

- [ ] **Step 9: 运行全部测试和类型检查**

Run: `pnpm --filter @dt/config build && pnpm typecheck && pnpm test`
Expected: 全部通过

- [ ] **Step 10: 提交**

```bash
git add packages apps
git commit -m "feat(admin): migration 0003, mod role, ban reason, role in me

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 权限、审计、后台入口、命令行设角色

**Files:**
- Create: `packages/shared/src/schemas/admin.ts`（本任务先放 `AdminMeDto`、`AdminRole`，后续任务往里追加）
- Modify: `packages/shared/src/index.ts`（`export * from './schemas/admin';`）
- Create: `apps/server/src/modules/admin/access.ts`
- Create: `apps/server/src/modules/admin/audit.ts`
- Create: `apps/server/src/modules/admin/roles.ts`
- Create: `apps/server/src/modules/admin/routes.ts`
- Create: `apps/server/src/cli/account.ts`
- Modify: `apps/server/src/modules/index.ts`
- Modify: `apps/server/package.json`（脚本 `account`）
- Modify: `apps/server/tsup.config.ts`（entry 加 `'cli/account': 'src/cli/account.ts'`，镜像里可以运行）
- Modify: `apps/server/src/modules/restaurant/reads.ts`（导出 `parseCursor`、`cursorOf`）
- Test: `apps/server/src/modules/admin/access.test.ts`、`apps/server/src/modules/admin/roles.test.ts`
- Create: `apps/server/test/admin.ts`（测试辅助：注册一个指定角色的用户）

**Interfaces:**
- Consumes: Task 1 的 `account.role`、`MeDto.role`
- Produces:
  - `type AdminRole = 'mod' | 'admin'`；`interface AdminMeDto { accountId: number; username: string; role: AdminRole }`
  - `interface AdminActor { accountId: number; username: string; role: AdminRole; ip: string }`
  - `requireRole(db: Kysely<DB>, req: FastifyRequest, min: AdminRole): Promise<AdminActor>`
  - `writeAudit(db: Kysely<DB>, a: { actor: AdminActor | null; action: string; target: string | null; detail?: Record<string, unknown> }): Promise<void>`
  - `setRoleByUsername(db: Kysely<DB>, username: string, role: AccountRole): Promise<number>`（返回 accountId；找不到抛 `Error('no such user')`）
  - `adminRoutes(game: Game): FastifyPluginAsync`，注册在 `/api/v1/admin`；本任务只有 `GET /me`
  - `parseCursor(before: string): { at: Date; id: string | null }`、`cursorOf(at: Date, id: string | number): string`（从 `restaurant/reads.ts` 导出）
  - 测试辅助 `userWithRole(ctx: TestContext, role: AccountRole): Promise<{ cookie: string; accountId: number; username: string }>`

- [ ] **Step 1: 写测试辅助和权限测试**

`apps/server/test/admin.ts`：

```ts
import type { AccountRole } from '@dt/shared';
import { registerUser, type TestContext } from './helpers';

/** 注册一个用户并直接在库里设好角色 */
export async function userWithRole(
  ctx: TestContext,
  role: AccountRole,
): Promise<{ cookie: string; accountId: number; username: string }> {
  const u = await registerUser(ctx.app);
  await ctx.deps.db.updateTable('account').set({ role }).where('id', '=', u.accountId).execute();
  return { cookie: u.cookie, accountId: u.accountId, username: u.username };
}
```

`apps/server/src/modules/admin/access.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const me = (cookie?: string) => call(ctx.app, 'GET', '/api/v1/admin/me', { cookie });

describe('后台权限', () => {
  it('未登录 401', async () => {
    expect((await me()).status).toBe(401);
  });

  it('普通玩家 404，不暴露后台', async () => {
    const p = await userWithRole(ctx, 'player');
    const r = await me(p.cookie);
    expect(r.status).toBe(404);
    expect(r.json.code).toBe('NOT_FOUND');
  });

  it('mod 和 admin 能看到自己的角色', async () => {
    const m = await userWithRole(ctx, 'mod');
    const a = await userWithRole(ctx, 'admin');
    expect((await me(m.cookie)).json.data).toMatchObject({ accountId: m.accountId, role: 'mod' });
    expect((await me(a.cookie)).json.data).toMatchObject({ accountId: a.accountId, role: 'admin' });
  });

  it('降级和封禁立即生效（每次请求都读库）', async () => {
    const a = await userWithRole(ctx, 'admin');
    await ctx.deps.db.updateTable('account').set({ role: 'player' }).where('id', '=', a.accountId).execute();
    expect((await me(a.cookie)).status).toBe(404);
    const b = await userWithRole(ctx, 'admin');
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_at: new Date() })
      .where('id', '=', b.accountId)
      .execute();
    expect((await me(b.cookie)).status).toBe(404);
  });
});
```

`apps/server/src/modules/admin/roles.test.ts`：

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { uniqueName } from '../../../test/fixtures';
import { setRoleByUsername } from './roles';

const db = testDb();
afterAll(() => db.destroy());

describe('命令行设角色', () => {
  it('按用户名（不区分大小写）设角色并写审计', async () => {
    const name = uniqueName('r');
    const row = await db
      .insertInto('account')
      .values({ username: name, password_hash: 'x', email: `${name}@t.local` })
      .returning('id')
      .executeTakeFirstOrThrow();
    const id = await setRoleByUsername(db, name.toUpperCase(), 'admin');
    expect(id).toBe(row.id);
    const a = await db.selectFrom('account').select('role').where('id', '=', row.id).executeTakeFirstOrThrow();
    expect(a.role).toBe('admin');
    const audit = await db
      .selectFrom('audit_log')
      .selectAll()
      .where('action', '=', 'player.role')
      .where('target', '=', `account:${row.id}`)
      .executeTakeFirstOrThrow();
    expect(audit.actor_account_id).toBeNull();
    expect(audit.detail).toMatchObject({ role: 'admin', via: 'cli' });
  });

  it('用户不存在时报错', async () => {
    await expect(setRoleByUsername(db, 'no-such-user-x', 'admin')).rejects.toThrow('no such user');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`packages/shared/src/schemas/admin.ts`：

```ts
import { z } from 'zod';

export type AdminRole = 'mod' | 'admin';

export interface AdminMeDto {
  accountId: number;
  username: string;
  role: AdminRole;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
```

`packages/shared/src/index.ts` 末尾加 `export * from './schemas/admin';`

`apps/server/src/modules/admin/access.ts`：

```ts
import type { FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { ErrorCode, type AdminRole } from '@dt/shared';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { requireAccount } from '../../security/session';

export interface AdminActor {
  accountId: number;
  username: string;
  role: AdminRole;
  ip: string;
}

const RANK: Record<string, number> = { player: 0, mod: 1, admin: 2 };

/**
 * 后台权限：未登录 401；角色不够或已封禁一律 404，不暴露后台存在（设计文档 裁定 2）。
 * 每次都读库，降级和封禁立即生效（裁定 3）
 */
export async function requireRole(db: Kysely<DB>, req: FastifyRequest, min: AdminRole): Promise<AdminActor> {
  const session = requireAccount(req);
  const a = await db
    .selectFrom('account')
    .select(['id', 'username', 'role', 'banned_at'])
    .where('id', '=', session.data.accountId)
    .executeTakeFirst();
  if (!a || a.banned_at || (RANK[a.role] ?? 0) < RANK[min]!) throw new AppError(ErrorCode.NOT_FOUND, 404);
  return { accountId: a.id, username: a.username, role: a.role as AdminRole, ip: req.ip };
}
```

`apps/server/src/modules/admin/audit.ts`：

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import type { AdminActor } from './access';

/** 写审计日志；调用方传入业务事务，保证两者一起成功或一起失败 */
export async function writeAudit(
  db: Kysely<DB>,
  a: { actor: AdminActor | null; action: string; target: string | null; detail?: Record<string, unknown> },
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      actor_account_id: a.actor?.accountId ?? null,
      action: a.action,
      target: a.target,
      detail: JSON.stringify(a.detail ?? {}),
      ip: a.actor?.ip ?? null,
    })
    .execute();
}
```

`apps/server/src/modules/admin/roles.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import type { AccountRole } from '@dt/shared';
import type { DB } from '../../db/schema';
import { writeAudit } from './audit';

/** 命令行设角色：设第一个管理员用（设计文档 4.7） */
export async function setRoleByUsername(db: Kysely<DB>, username: string, role: AccountRole): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const a = await tx
      .updateTable('account')
      .set({ role })
      .where(sql<string>`lower(username)`, '=', username.toLowerCase())
      .returning('id')
      .executeTakeFirst();
    if (!a) throw new Error('no such user');
    await writeAudit(tx, { actor: null, action: 'player.role', target: `account:${a.id}`, detail: { role, via: 'cli' } });
    return a.id;
  });
}
```

`apps/server/src/modules/admin/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import type { AdminMeDto } from '@dt/shared';
import type { Game } from '../../game';
import { ok } from '../../http/reply';
import { requireRole } from './access';

/** 后台路由（/api/v1/admin）：每个处理函数第一步都是 requireRole */
export function adminRoutes(game: Game): FastifyPluginAsync {
  const db = game.app.db;
  return async (r) => {
    r.get('/me', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const dto: AdminMeDto = { accountId: a.accountId, username: a.username, role: a.role };
      return ok(dto);
    });
  };
}
```

`apps/server/src/modules/index.ts`：加 `import { adminRoutes } from './admin/routes';` 和
`app.register(adminRoutes(game), { prefix: '/api/v1/admin' });`

`apps/server/src/cli/account.ts`：

```ts
import { parseArgs } from 'node:util';
import { createDb } from '../db';
import { loadEnv } from '../env';
import { setRoleByUsername } from '../modules/admin/roles';

const USAGE = '用法：account role <用户名> <player|mod|admin>';
const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);

try {
  const [cmd, username, role] = positionals;
  if (cmd !== 'role' || !username || !['player', 'mod', 'admin'].includes(role ?? '')) throw new Error(USAGE);
  const id = await setRoleByUsername(db, username, role as 'player' | 'mod' | 'admin');
  console.log(`account ${id} (${username}) is now ${role}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
```

`apps/server/package.json` 的 scripts 加：`"account": "tsx --env-file=.env.development src/cli/account.ts",`

`apps/server/tsup.config.ts` 的 entry 加：`'cli/account': 'src/cli/account.ts',`

`apps/server/src/modules/restaurant/reads.ts`：把 `function parseCursor` 和 `const cursorOf` 前面加 `export`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/shared apps/server
git commit -m "feat(admin): role check, audit helper, /admin/me, account role CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 区服数值（查看、保存、历史、回滚、即时生效）

**Files:**
- Create: `apps/server/src/infra/settingsBus.ts`
- Create: `apps/server/src/modules/admin/diff.ts`、`diff.test.ts`
- Create: `apps/server/src/modules/admin/shards.ts`、`shards.test.ts`
- Modify: `apps/server/src/modules/shard/service.ts`（`invalidate`）
- Modify: `apps/server/src/app.ts`（订阅）
- Modify: `apps/server/src/worker.ts`（订阅）
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `packages/shared/src/schemas/admin.ts`

**Interfaces:**
- Consumes: Task 2 的 `requireRole`、`writeAudit`、`AdminActor`；`resolveShardSettings`（`@dt/config`）；`IMPLEMENTED_FEATURES`（`core/features`）
- Produces:
  - `ShardService.invalidate(shardId: number): void`
  - `publishSettingsChanged(redis: Redis, shardId: number): Promise<void>`；`subscribeSettings(url: string, onChange: (shardId: number) => void): { close(): void }`；`SETTINGS_CHANNEL = 'shard-settings'`
  - `diffPaths(a: unknown, b: unknown): string[]`
  - `createAdminShards(game: Game)` → `{ list(), settings(shardId), save(actor, shardId, body), history(shardId), rollback(actor, shardId, body) }`
  - DTO：`AdminShardDto`、`ShardSettingsDto`、`ShardHistoryDto`；schema：`saveOverrideBody`、`rollbackBody`
  - 路由：`GET /shards`、`GET /shards/:id/settings`、`POST /shards/:id/override`（admin）、`GET /shards/:id/history`、`POST /shards/:id/rollback`（admin）

- [ ] **Step 1: 写 diffPaths 测试**

`apps/server/src/modules/admin/diff.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { diffPaths } from './diff';

describe('diffPaths', () => {
  it('列出改动、新增、删除的叶子路径，数组整体算一个叶子', () => {
    const a = { tuning: { settlement: { expMultiplier: 5 }, market: { dailyKinds: 5 } }, features: { pond: false } };
    const b = { tuning: { settlement: { expMultiplier: 10 }, market: { dailyKinds: 5, dailyHours: [8, 10] } } };
    expect(diffPaths(a, b)).toEqual(['features.pond', 'tuning.market.dailyHours', 'tuning.settlement.expMultiplier']);
  });

  it('一样时为空；类型从对象变成数值算一处改动', () => {
    expect(diffPaths({ x: { y: 1 } }, { x: { y: 1 } })).toEqual([]);
    expect(diffPaths({ x: { y: 1 } }, { x: 3 })).toEqual(['x']);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin/diff.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 diffPaths**

`apps/server/src/modules/admin/diff.ts`：

```ts
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 两份覆盖之间改动过的叶子路径（数组整体算一个叶子），按字母序；审计和历史页展示用 */
export function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  const aObj = isObj(a);
  const bObj = isObj(b);
  if ((aObj || a === undefined) && (bObj || b === undefined) && (aObj || bObj)) {
    const x = aObj ? a : {};
    const y = bObj ? b : {};
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    return keys.flatMap((k) => diffPaths(x[k], y[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin/diff.test.ts`
Expected: PASS

- [ ] **Step 5: 写区服数值测试**

`apps/server/src/modules/admin/shards.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { subscribeSettings } from '../../infra/settingsBus';
import { buildGlobals, buildInput } from '../settlement/globals';
import { settleRestaurant } from '../settlement/settle';
import type { AdminActor } from './access';
import { createAdminShards } from './shards';

let ctx: TestContext;
let admin: { cookie: string; accountId: number };
let mod: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());

const S = '/api/v1/admin/shards';
const mult = (m: number) => ({ tuning: { settlement: { expMultiplier: m } } });

describe('区服数值（HTTP）', () => {
  it('查看：默认、覆盖、生效、功能开关', async () => {
    const shardId = await createShard(ctx.deps.db);
    const r = await call(ctx.app, 'GET', `${S}/${shardId}/settings`, { cookie: mod.cookie });
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.version).toBe(0);
    expect(d.override).toEqual({});
    expect(d.effective.tuning.settlement.expMultiplier).toBe(d.defaults.tuning.settlement.expMultiplier);
    expect(d.features).toContainEqual({ name: 'market', enabled: true });
    const list = await call(ctx.app, 'GET', S, { cookie: mod.cookie });
    expect(list.json.data.some((s: { id: number }) => s.id === shardId)).toBe(true);
  });

  it('保存：版本 +1，写历史和审计；再次用旧版本号保存得到 409', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (version: number, m: number) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: mult(m), note: '试玩加速', version },
      });
    const r = await save(0, 10);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ version: 1 });
    expect((await save(0, 12)).json.code).toBe('VERSION_CONFLICT');
    const hist = await call(ctx.app, 'GET', `${S}/${shardId}/history`, { cookie: mod.cookie });
    expect(hist.json.data[0]).toMatchObject({ version: 1, note: '试玩加速', changed: ['tuning.settlement.expMultiplier'] });
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .selectAll()
      .where('target', '=', `shard:${shardId}`)
      .executeTakeFirstOrThrow();
    expect(audit).toMatchObject({ actor_account_id: admin.accountId, action: 'shard.override' });
  });

  it('非法值 400 INVALID_CONFIG 并指出路径；经验倍率 ≤ 0 被拒（Review Focus 4）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const r = await call(ctx.app, 'POST', `${S}/${shardId}/override`, {
      cookie: admin.cookie,
      body: { override: mult(0), note: 'x', version: 0 },
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('INVALID_CONFIG');
    expect(r.json.params.issues[0].path).toBe('tuning.settlement.expMultiplier');
  });

  it('mod 不能保存（404）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const r = await call(ctx.app, 'POST', `${S}/${shardId}/override`, {
      cookie: mod.cookie,
      body: { override: mult(10), note: 'x', version: 0 },
    });
    expect(r.status).toBe(404);
  });

  it('回滚：取历史版本再保存一版；历史版本在当前结构下不合法时 400（Review Focus 5）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const save = (version: number, m: number) =>
      call(ctx.app, 'POST', `${S}/${shardId}/override`, {
        cookie: admin.cookie,
        body: { override: mult(m), note: `v${m}`, version },
      });
    await save(0, 10);
    await save(1, 20);
    const rb = await call(ctx.app, 'POST', `${S}/${shardId}/rollback`, {
      cookie: admin.cookie,
      body: { version: 1, note: '回到 10' },
    });
    expect(rb.json.data).toEqual({ version: 3 });
    const now = await call(ctx.app, 'GET', `${S}/${shardId}/settings`, { cookie: admin.cookie });
    expect(now.json.data.override).toEqual(mult(10));
    await ctx.deps.db
      .insertInto('shard_config_history')
      .values({ shard_id: shardId, version: 99, override: JSON.stringify(mult(-1)), note: '旧的坏版本' })
      .execute();
    const bad = await call(ctx.app, 'POST', `${S}/${shardId}/rollback`, {
      cookie: admin.cookie,
      body: { version: 99, note: 'x' },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('INVALID_CONFIG');
  });
});

describe('区服数值（即时生效）', () => {
  let t: TestGame;
  let t2: TestGame;
  const actor: AdminActor = { accountId: 0, username: 'x', role: 'admin', ip: '127.0.0.1' };
  beforeAll(async () => {
    t = await createTestGame();
    t2 = await createTestGame();
    const a = await t.db
      .insertInto('account')
      .values({ username: `adm${Date.now() % 100000}`, password_hash: 'x', email: `adm${Date.now()}@t.local` })
      .returning('id')
      .executeTakeFirstOrThrow();
    actor.accountId = a.id;
  });
  afterAll(async () => {
    await t.close();
    await t2.close();
  });

  it('同进程下一次读取就是新值；结算用到新倍率', async () => {
    const shardId = await createShard(t.db);
    const before = await t.game.shards.settings(shardId);
    await createAdminShards(t.game).save(actor, shardId, { override: mult(10), note: 'x', version: 0 });
    const after = await t.game.shards.settings(shardId);
    expect(after.tuning.settlement.expMultiplier).toBe(10);
    const config = testConfig();
    const exp = (tuning: typeof before.tuning) =>
      settleRestaurant(
        buildInput(config),
        buildGlobals(config, tuning),
        sequenceRng([0.5, 0.65, 0.9, 0.9, 0.9, 0.9, 0.9]),
      ).exp;
    expect(exp(after.tuning)).toBeGreaterThan(exp(before.tuning));
  });

  it('另一个进程通过 Redis 订阅失效缓存', async () => {
    const shardId = await createShard(t.db);
    const sub = subscribeSettings(process.env.REDIS_URL!, (id) => t2.game.shards.invalidate(id));
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect((await t2.game.shards.settings(shardId)).tuning.settlement.expMultiplier).not.toBe(7);
      await createAdminShards(t.game).save(actor, shardId, { override: mult(7), note: 'x', version: 0 });
      let seen = 0;
      for (let i = 0; i < 40 && seen !== 7; i++) {
        await new Promise((r) => setTimeout(r, 50));
        seen = (await t2.game.shards.settings(shardId)).tuning.settlement.expMultiplier;
      }
      expect(seen).toBe(7);
    } finally {
      sub.close();
    }
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin/shards.test.ts`
Expected: FAIL（`./shards`、`settingsBus` 不存在）

- [ ] **Step 7: 实现**

`packages/shared/src/schemas/admin.ts` 追加：

```ts
export interface AdminShardDto {
  id: number;
  name: string;
  status: string;
  restaurants: number;
}

export interface ShardSettingsDto {
  version: number;
  defaults: Record<string, unknown>;
  override: Record<string, unknown>;
  effective: Record<string, unknown>;
  features: Array<{ name: string; enabled: boolean }>;
}

const note = z.string().trim().min(1).max(200);
export const saveOverrideBody = z.object({
  override: z.record(z.string(), z.unknown()),
  note,
  version: z.number().int().min(0),
});
export const rollbackBody = z.object({ version: z.number().int().min(1), note });

export interface ShardHistoryDto {
  version: number;
  override: Record<string, unknown>;
  actor: string | null;
  note: string;
  changed: string[];
  at: string;
}
```

`apps/server/src/infra/settingsBus.ts`：

```ts
import type { Redis } from 'ioredis';
import { createRedis } from './redis';

export const SETTINGS_CHANNEL = 'shard-settings';

export async function publishSettingsChanged(redis: Redis, shardId: number): Promise<void> {
  await redis.publish(SETTINGS_CHANNEL, String(shardId));
}

/** 订阅区服配置变更：每个进程一个订阅连接，收到后清掉本进程的区服配置缓存（设计文档 裁定 11） */
export function subscribeSettings(url: string, onChange: (shardId: number) => void): { close(): void } {
  const sub = createRedis(url);
  sub.on('message', (_channel: string, msg: string) => {
    const id = Number(msg);
    if (Number.isInteger(id)) onChange(id);
  });
  void sub.subscribe(SETTINGS_CHANNEL);
  return { close: () => sub.disconnect() };
}
```

`apps/server/src/modules/shard/service.ts` 的返回对象里加：

```ts
    /** 区服配置被后台修改后清掉缓存；下一次读取从库里重新解析 */
    invalidate(shardId: number): void {
      cache.delete(shardId);
    },
```

`apps/server/src/app.ts`：`import { subscribeSettings } from './infra/settingsBus';`，在 `const game = createGame(deps);` 之后：

```ts
  const settingsSub = subscribeSettings(deps.env.REDIS_URL, (id) => game.shards.invalidate(id));
  app.addHook('onClose', async () => settingsSub.close());
```

`apps/server/src/worker.ts`：`import { subscribeSettings } from './infra/settingsBus';`，在 `const game = createGame(deps);` 之后加
`const settingsSub = subscribeSettings(env.REDIS_URL, (id) => game.shards.invalidate(id));`，文件末尾 `await deps.db.destroy();` 之前加 `settingsSub.close();`。

`apps/server/src/modules/admin/shards.ts`：

```ts
import { ZodError } from 'zod';
import { isFeatureEnabled, resolveShardSettings } from '@dt/config';
import { ErrorCode, type AdminShardDto, type ShardHistoryDto, type ShardSettingsDto } from '@dt/shared';
import { IMPLEMENTED_FEATURES } from '../../core/features';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { publishSettingsChanged } from '../../infra/settingsBus';
import type { AdminActor } from './access';
import { writeAudit } from './audit';
import { diffPaths } from './diff';

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function createAdminShards(game: Game) {
  const { db, redis, config } = game.app;

  function validate(override: Record<string, unknown>): void {
    try {
      resolveShardSettings(config, override);
    } catch (e) {
      if (e instanceof ZodError)
        throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
          issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      throw e;
    }
  }

  async function assertShard(shardId: number): Promise<void> {
    const s = await db.selectFrom('shard').select('id').where('id', '=', shardId).executeTakeFirst();
    if (!s) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
  }

  /** 保存整份覆盖：校验 → 版本号乐观锁写入 → 历史和审计（同一事务）→ 清缓存并通知其他进程 */
  async function save(
    actor: AdminActor,
    shardId: number,
    override: Record<string, unknown>,
    note: string,
    expected: number | null,
    action: 'shard.override' | 'shard.rollback',
  ): Promise<{ version: number }> {
    await assertShard(shardId);
    validate(override);
    const version = await db.transaction().execute(async (tx) => {
      const cur = await tx
        .selectFrom('shard_config')
        .select(['version', 'override'])
        .where('shard_id', '=', shardId)
        .forUpdate()
        .executeTakeFirst();
      const curVersion = cur?.version ?? 0;
      if (expected !== null && expected !== curVersion)
        throw new AppError(ErrorCode.VERSION_CONFLICT, 409, { version: curVersion });
      const next = curVersion + 1;
      const now = game.deps.now();
      if (cur) {
        await tx
          .updateTable('shard_config')
          .set({ override: JSON.stringify(override), version: next, updated_at: now })
          .where('shard_id', '=', shardId)
          .execute();
      } else {
        const ins = await tx
          .insertInto('shard_config')
          .values({ shard_id: shardId, override: JSON.stringify(override), version: next, updated_at: now })
          .onConflict((oc) => oc.column('shard_id').doNothing())
          .returning('shard_id')
          .executeTakeFirst();
        if (!ins) throw new AppError(ErrorCode.VERSION_CONFLICT, 409, { version: curVersion });
      }
      await tx
        .insertInto('shard_config_history')
        .values({
          shard_id: shardId,
          version: next,
          override: JSON.stringify(override),
          actor_account_id: actor.accountId,
          note,
          created_at: now,
        })
        .execute();
      await writeAudit(tx, {
        actor,
        action,
        target: `shard:${shardId}`,
        detail: { version: next, note, changed: diffPaths(asObject(cur?.override), override) },
      });
      return next;
    });
    game.shards.invalidate(shardId);
    await publishSettingsChanged(redis, shardId);
    return { version };
  }

  return {
    async list(): Promise<AdminShardDto[]> {
      const rows = await db
        .selectFrom('shard')
        .leftJoin('restaurant', 'restaurant.shard_id', 'shard.id')
        .select(({ fn }) => [
          'shard.id',
          'shard.name',
          'shard.status',
          fn.count<number>('restaurant.id').as('restaurants'),
        ])
        .groupBy(['shard.id', 'shard.name', 'shard.status'])
        .orderBy('shard.id')
        .execute();
      return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, restaurants: Number(r.restaurants) }));
    },

    async settings(shardId: number): Promise<ShardSettingsDto> {
      await assertShard(shardId);
      const row = await db
        .selectFrom('shard_config')
        .select(['version', 'override'])
        .where('shard_id', '=', shardId)
        .executeTakeFirst();
      const override = asObject(row?.override);
      const effective = resolveShardSettings(config, override);
      return {
        version: row?.version ?? 0,
        defaults: { features: {}, restaurant: config.bundle.restaurantDefaults, tuning: config.tuning },
        override,
        effective: effective as unknown as Record<string, unknown>,
        features: [...IMPLEMENTED_FEATURES]
          .sort()
          .map((name) => ({ name, enabled: isFeatureEnabled(effective, name) })),
      };
    },

    save: (actor: AdminActor, shardId: number, b: { override: Record<string, unknown>; note: string; version: number }) =>
      save(actor, shardId, b.override, b.note, b.version, 'shard.override'),

    async history(shardId: number): Promise<ShardHistoryDto[]> {
      const rows = await db
        .selectFrom('shard_config_history as h')
        .leftJoin('account', 'account.id', 'h.actor_account_id')
        .select(['h.version', 'h.override', 'h.note', 'h.created_at', 'account.username'])
        .where('h.shard_id', '=', shardId)
        .orderBy('h.version', 'desc')
        .limit(51)
        .execute();
      return rows.slice(0, 50).map((r, i) => ({
        version: r.version,
        override: asObject(r.override),
        actor: r.username ?? null,
        note: r.note,
        changed: diffPaths(asObject(rows[i + 1]?.override), asObject(r.override)),
        at: r.created_at.toISOString(),
      }));
    },

    /** 回滚：把某个历史版本的覆盖再保存一版（历史里新增，不删旧版）；不检查版本号 */
    async rollback(actor: AdminActor, shardId: number, b: { version: number; note: string }) {
      const h = await db
        .selectFrom('shard_config_history')
        .select('override')
        .where('shard_id', '=', shardId)
        .where('version', '=', b.version)
        .executeTakeFirst();
      if (!h) throw new AppError(ErrorCode.NOT_FOUND, 404);
      return save(actor, shardId, asObject(h.override), b.note, null, 'shard.rollback');
    },
  };
}
```

`apps/server/src/modules/admin/routes.ts`：在返回的插件里（`/me` 之后）加：

```ts
    const shards = createAdminShards(game);
    const shardId = (req: { params: unknown }) => parse(idParam, req.params).id;
    r.get('/shards', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.list());
    });
    r.get('/shards/:id/settings', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.settings(shardId(req)));
    });
    r.post('/shards/:id/override', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await shards.save(a, shardId(req), parse(saveOverrideBody, req.body)));
    });
    r.get('/shards/:id/history', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.history(shardId(req)));
    });
    r.post('/shards/:id/rollback', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await shards.rollback(a, shardId(req), parse(rollbackBody, req.body)));
    });
```

并补 import：`idParam, rollbackBody, saveOverrideBody`（`@dt/shared`）、`parse`（`../../http/validate`）、`createAdminShards`（`./shards`）。

- [ ] **Step 8: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin && pnpm typecheck`
Expected: PASS

- [ ] **Step 9: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
git add packages/shared apps/server
git commit -m "feat(admin): shard settings view, validated save with history, rollback, live invalidation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 玩家（搜索、详情、餐厅、流水、封号、改名、改角色）

**Files:**
- Create: `apps/server/src/modules/admin/players.ts`、`players.test.ts`
- Modify: `apps/server/src/modules/growth/rules.ts`（`renameProblem`）
- Modify: `apps/server/src/modules/growth/service.ts`（改用 `renameProblem`）
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `packages/shared/src/schemas/admin.ts`
- Modify: `apps/web/src/utils/events.ts`、`events.test.ts`（日志文案 `admin.rename`）

**Interfaces:**
- Consumes: Task 2 的 `requireRole`、`writeAudit`、`parseCursor`、`cursorOf`；`logPage`、`incomePage`（`restaurant/reads.ts`）；`runSystemOp`、`restLog`；`uniqueViolation`（`db/errors`）；`sessions.destroyAll`
- Produces:
  - `renameProblem(name: string, maxLength: number): string | null`
  - `createAdminPlayers(game: Game)` → `{ search(q), detail(accountId), restaurant(restId), ledger(restId, q), log(restId, q), income(restId, q), ban(actor, accountId, reason), unban(actor, accountId), rename(actor, restId, name, reason), setRole(actor, accountId, role) }`
  - DTO：`PlayerRestaurantBriefDto`、`PlayerBriefDto`、`PlayerDetailDto`、`AdminRestaurantDto`、`AdminLedgerRowDto`、`AdminLedgerPageDto`；schema：`playerSearchQuery`、`adminLedgerQuery`、`reasonBody`、`adminRenameBody`、`roleBody`
  - 路由：`GET /players?q=`、`GET /players/:id`、`GET /restaurants/:id`、`GET /restaurants/:id/ledger`、`GET /restaurants/:id/log`、`GET /restaurants/:id/income`、`POST /players/:id/ban`、`POST /players/:id/unban`、`POST /restaurants/:id/rename`（以上 mod）、`POST /players/:id/role`（admin）

- [ ] **Step 1: 写测试**

`apps/server/src/modules/admin/players.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
let admin: { cookie: string; accountId: number };
let mod: { cookie: string; accountId: number };
let shardId: number;
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
  shardId = await createShard(ctx.deps.db);
});
afterAll(() => ctx.close());

const A = '/api/v1/admin';
const get = (cookie: string, path: string) => call(ctx.app, 'GET', `${A}${path}`, { cookie });
const post = (cookie: string, path: string, body: unknown) =>
  call(ctx.app, 'POST', `${A}${path}`, { cookie, body });

async function playerWithShop(name: string) {
  const u = await registerUser(ctx.app);
  const restId = await createRestaurantFull(ctx.deps.db, shardId, u.accountId, { patch: { name } });
  return { ...u, restId };
}

describe('玩家查询', () => {
  it('按账号 id、用户名（不分大小写）、邮箱、店名片段搜索', async () => {
    const shop = `搜索${Date.now() % 1_000_000}`;
    const p = await playerWithShop(shop);
    const ids = async (q: string) =>
      (await get(mod.cookie, `/players?q=${encodeURIComponent(q)}`)).json.data.map(
        (x: { accountId: number }) => x.accountId,
      );
    expect(await ids(String(p.accountId))).toEqual([p.accountId]);
    expect(await ids(p.username.toUpperCase())).toContain(p.accountId);
    expect(await ids(p.email.split('@')[0]!)).toContain(p.accountId);
    expect(await ids(shop.slice(1))).toContain(p.accountId);
    const hit = (await get(mod.cookie, `/players?q=${p.accountId}`)).json.data[0];
    expect(hit.restaurants[0]).toMatchObject({ id: p.restId, shardId, name: shop });
  });

  it('输入里的 % 和 _ 按字面匹配（Review Focus 1）', async () => {
    await playerWithShop('通配测试店');
    expect((await get(mod.cookie, `/players?q=${encodeURIComponent('%')}`)).json.data).toEqual([]);
    expect((await get(mod.cookie, `/players?q=_`)).json.data).toEqual([]);
  });

  it('详情、餐厅、流水（按类型筛选）', async () => {
    const p = await playerWithShop('详情测试店');
    await ctx.deps.db
      .insertInto('ledger')
      .values([
        { rest_id: p.restId, kind: 'coin', delta: 5, source: 'x' },
        { rest_id: p.restId, kind: 'goods', item_id: 1, delta: 1, source: 'y' },
      ])
      .execute();
    const d = (await get(mod.cookie, `/players/${p.accountId}`)).json.data;
    expect(d).toMatchObject({ accountId: p.accountId, role: 'player', banned: false, banReason: null });
    const rest = (await get(mod.cookie, `/restaurants/${p.restId}`)).json.data;
    expect(rest.overview.name).toBe('详情测试店');
    expect(Array.isArray(rest.store)).toBe(true);
    const ledger = (await get(mod.cookie, `/restaurants/${p.restId}/ledger?kind=goods`)).json.data;
    expect(ledger.items).toEqual([expect.objectContaining({ kind: 'goods', itemId: 1, source: 'y' })]);
    expect((await get(mod.cookie, '/players/999999999')).status).toBe(404);
  });
});

describe('封号', () => {
  it('封号：会话失效、登录报原因；解封后能登录', async () => {
    const p = await registerUser(ctx.app, { password: 'secret123' });
    const r = await post(mod.cookie, `/players/${p.accountId}/ban`, { reason: '刷分' });
    expect(r.status).toBe(200);
    expect((await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: p.cookie })).status).toBe(401);
    const login = () =>
      call(ctx.app, 'POST', '/api/v1/account/login', { body: { username: p.username, password: 'secret123' } });
    expect((await login()).json).toMatchObject({ code: 'ACCOUNT_BANNED', params: { reason: '刷分' } });
    await post(mod.cookie, `/players/${p.accountId}/unban`, {});
    expect((await login()).status).toBe(200);
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `account:${p.accountId}`)
      .orderBy('id')
      .execute();
    expect(audit.map((x) => x.action)).toEqual(['player.ban', 'player.unban']);
  });

  it('mod 不能封 admin；谁都不能封自己', async () => {
    expect((await post(mod.cookie, `/players/${admin.accountId}/ban`, { reason: 'x' })).status).toBe(403);
    expect((await post(admin.cookie, `/players/${admin.accountId}/ban`, { reason: 'x' })).status).toBe(403);
  });
});

describe('强制改名和改角色', () => {
  it('改名：不收费，写个人日志和审计；重名 409；非法名 400', async () => {
    const p = await playerWithShop('改名前店');
    await playerWithShop('已被占用店');
    const r = await post(mod.cookie, `/restaurants/${p.restId}/rename`, { name: '改名后店', reason: '名字违规' });
    expect(r.json.data).toEqual({ name: '改名后店' });
    const log = await ctx.deps.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', p.restId)
      .where('type', '=', 'admin.rename')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ from: '改名前店', to: '改名后店', reason: '名字违规' });
    const taken = await post(mod.cookie, `/restaurants/${p.restId}/rename`, { name: '已被占用店', reason: 'x' });
    expect(taken.status).toBe(409);
    const bad = await post(mod.cookie, `/restaurants/${p.restId}/rename`, { name: 'a b!', reason: 'x' });
    expect(bad.json.code).toBe('RESTAURANT_NAME_INVALID');
  });

  it('改角色只有 admin；不能改自己', async () => {
    const p = await registerUser(ctx.app);
    expect((await post(mod.cookie, `/players/${p.accountId}/role`, { role: 'mod' })).status).toBe(404);
    expect((await post(admin.cookie, `/players/${p.accountId}/role`, { role: 'mod' })).json.data).toEqual({
      role: 'mod',
    });
    expect((await post(admin.cookie, `/players/${admin.accountId}/role`, { role: 'player' })).status).toBe(403);
  });
});
```

在 `apps/web/src/utils/events.test.ts` 的"个人日志文案"里追加：

```ts
    expect(logText({ type: 'admin.rename', params: { from: 'A', to: 'B', reason: '违规' }, at: '' }, names)).toBe(
      '管理员把店名从「A」改为「B」：违规',
    );
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin/players.test.ts apps/web/src/utils/events.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`packages/shared/src/schemas/admin.ts` 追加（顶部补 `import type { AccountRole } from './auth';`、`import { pageQuery, type RestaurantDto } from './restaurant';`）：

```ts
export const playerSearchQuery = z.object({ q: z.string().trim().min(1).max(64) });

export interface PlayerRestaurantBriefDto {
  id: number;
  shardId: number;
  shardName: string;
  name: string;
  level: number;
  star: number;
  state: number;
}

export interface PlayerBriefDto {
  accountId: number;
  username: string;
  email: string;
  role: AccountRole;
  banned: boolean;
  restaurants: PlayerRestaurantBriefDto[];
}

export interface PlayerDetailDto extends PlayerBriefDto {
  emailVerified: boolean;
  bannedAt: string | null;
  banReason: string | null;
  createdAt: string;
}

export interface AdminRestaurantDto {
  overview: RestaurantDto;
  store: Array<{ goodsId: number; num: number; expiresAt: string | null }>;
  cupboard: Array<{ foodsId: number; num: number; fridgeNum: number; locked: boolean }>;
}

export const adminLedgerQuery = pageQuery.extend({
  kind: z.string().max(20).optional(),
  source: z.string().max(64).optional(),
});

export interface AdminLedgerRowDto {
  kind: string;
  itemId: number | null;
  delta: number;
  source: string;
  at: string;
}

export interface AdminLedgerPageDto {
  items: AdminLedgerRowDto[];
  nextBefore: string | null;
}

export const reasonBody = z.object({ reason: z.string().trim().min(1).max(200) });
export const adminRenameBody = z.object({ name: z.string().max(32), reason: z.string().trim().min(1).max(200) });
export const roleBody = z.object({ role: z.enum(['player', 'mod', 'admin']) });
```

`apps/server/src/modules/growth/rules.ts` 追加（顶部补 `import { checkRestaurantName } from '@dt/shared';`）：

```ts
const NAME_CHARS = /^[\p{Script=Han}A-Za-z0-9]+$/u;

/** 改名校验（玩家改名和后台强制改名共用）：有问题返回原因，没问题返回 null */
export function renameProblem(name: string, maxLength: number): string | null {
  const check = checkRestaurantName(name);
  if (check !== 'ok') return check;
  if (!NAME_CHARS.test(name)) return 'bad_chars';
  if ([...name].length > maxLength) return 'too_long';
  return null;
}
```

`apps/server/src/modules/growth/service.ts` 的 `rename` 里，把 `checkRestaurantName`、`NAME_CHARS`、长度三段检查换成：

```ts
        const problem = renameProblem(name, o.tuning.growth.renameMaxLength);
        if (problem) throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: problem });
```

删除文件顶部的 `const NAME_CHARS = …`，import 改为从 `./rules` 引入 `renameProblem`（`checkRestaurantName` 如不再使用就去掉）。

`apps/server/src/modules/admin/players.ts`：

```ts
import { sql } from 'kysely';
import {
  ErrorCode,
  type AccountRole,
  type AdminLedgerPageDto,
  type AdminRestaurantDto,
  type PageQuery,
  type PlayerBriefDto,
  type PlayerDetailDto,
  type PlayerRestaurantBriefDto,
} from '@dt/shared';
import { restLog, runSystemOp } from '../../core/op';
import { uniqueViolation } from '../../db/errors';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { renameProblem } from '../growth/rules';
import { cursorOf, incomePage, logPage, parseCursor } from '../restaurant/reads';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

/** LIKE 的通配符按字面匹配（Review Focus 1）；PostgreSQL 默认转义符是反斜杠 */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createAdminPlayers(game: Game) {
  const { db, sessions } = game.app;

  async function restaurantsOf(accountIds: number[]): Promise<Map<number, PlayerRestaurantBriefDto[]>> {
    const out = new Map<number, PlayerRestaurantBriefDto[]>();
    if (accountIds.length === 0) return out;
    const rows = await db
      .selectFrom('restaurant')
      .innerJoin('shard', 'shard.id', 'restaurant.shard_id')
      .select([
        'restaurant.id',
        'restaurant.account_id',
        'restaurant.shard_id',
        'shard.name as shard_name',
        'restaurant.name',
        'restaurant.level',
        'restaurant.star_level',
        'restaurant.state',
      ])
      .where('restaurant.account_id', 'in', accountIds)
      .orderBy('restaurant.shard_id')
      .execute();
    for (const r of rows) {
      const list = out.get(r.account_id) ?? [];
      list.push({
        id: r.id,
        shardId: r.shard_id,
        shardName: r.shard_name,
        name: r.name,
        level: r.level,
        star: r.star_level,
        state: r.state,
      });
      out.set(r.account_id, list);
    }
    return out;
  }

  async function accountRow(accountId: number) {
    const a = await db.selectFrom('account').selectAll().where('id', '=', accountId).executeTakeFirst();
    if (!a) throw new AppError(ErrorCode.NOT_FOUND, 404);
    return a;
  }

  async function restaurantRow(restId: number) {
    const r = await db
      .selectFrom('restaurant')
      .select(['id', 'shard_id', 'name'])
      .where('id', '=', restId)
      .executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    return r;
  }

  return {
    async search(q: string): Promise<PlayerBriefDto[]> {
      let ids: number[];
      if (/^\d+$/.test(q)) ids = [Number(q)];
      else {
        const prefix = `${likeEscape(q.toLowerCase())}%`;
        const byAccount = await db
          .selectFrom('account')
          .select('id')
          .where((eb) =>
            eb.or([eb(sql<string>`lower(username)`, 'like', prefix), eb(sql<string>`lower(email)`, 'like', prefix)]),
          )
          .limit(50)
          .execute();
        const byShop = await db
          .selectFrom('restaurant')
          .select('account_id')
          .where('name', 'ilike', `%${likeEscape(q)}%`)
          .limit(50)
          .execute();
        ids = [...new Set([...byAccount.map((r) => r.id), ...byShop.map((r) => r.account_id)])].slice(0, 50);
      }
      if (ids.length === 0) return [];
      const accounts = await db
        .selectFrom('account')
        .select(['id', 'username', 'email', 'role', 'banned_at'])
        .where('id', 'in', ids)
        .orderBy('id')
        .execute();
      const rests = await restaurantsOf(accounts.map((a) => a.id));
      return accounts.map((a) => ({
        accountId: a.id,
        username: a.username,
        email: a.email,
        role: a.role,
        banned: a.banned_at !== null,
        restaurants: rests.get(a.id) ?? [],
      }));
    },

    async detail(accountId: number): Promise<PlayerDetailDto> {
      const a = await accountRow(accountId);
      const rests = await restaurantsOf([a.id]);
      return {
        accountId: a.id,
        username: a.username,
        email: a.email,
        role: a.role,
        banned: a.banned_at !== null,
        restaurants: rests.get(a.id) ?? [],
        emailVerified: a.email_verified_at !== null,
        bannedAt: a.banned_at?.toISOString() ?? null,
        banReason: a.ban_reason,
        createdAt: a.created_at.toISOString(),
      };
    },

    async restaurant(restId: number): Promise<AdminRestaurantDto> {
      await restaurantRow(restId);
      const [overview, store, cupboard] = await Promise.all([
        game.restaurant.overview(restId),
        db
          .selectFrom('store_item')
          .select(['goods_id', 'num', 'expires_at'])
          .where('rest_id', '=', restId)
          .orderBy('goods_id')
          .execute(),
        db
          .selectFrom('cupboard_food')
          .select(['foods_id', 'num', 'fridge_num', 'locked'])
          .where('rest_id', '=', restId)
          .orderBy('foods_id')
          .execute(),
      ]);
      return {
        overview,
        store: store.map((s) => ({ goodsId: s.goods_id, num: s.num, expiresAt: s.expires_at?.toISOString() ?? null })),
        cupboard: cupboard.map((c) => ({ foodsId: c.foods_id, num: c.num, fridgeNum: c.fridge_num, locked: c.locked })),
      };
    },

    async ledger(restId: number, q: PageQuery & { kind?: string; source?: string }): Promise<AdminLedgerPageDto> {
      let s = db
        .selectFrom('ledger')
        .select(['id', 'kind', 'item_id', 'delta', 'source', 'created_at'])
        .where('rest_id', '=', restId);
      if (q.kind) s = s.where('kind', '=', q.kind);
      if (q.source) s = s.where('source', '=', q.source);
      if (q.before) {
        const c = parseCursor(q.before);
        s = c.id
          ? s.where((eb) =>
              eb.or([eb('created_at', '<', c.at), eb.and([eb('created_at', '=', c.at), eb('id', '<', Number(c.id))])]),
            )
          : s.where('created_at', '<', c.at);
      }
      const rows = await s.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(q.limit + 1).execute();
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => ({
          kind: r.kind,
          itemId: r.item_id,
          delta: r.delta,
          source: r.source,
          at: r.created_at.toISOString(),
        })),
        nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
      };
    },

    log: (restId: number, q: PageQuery) => logPage(db, restId, q),
    income: (restId: number, q: PageQuery) => incomePage(db, restId, q),

    async ban(actor: AdminActor, accountId: number, reason: string): Promise<{ banned: boolean }> {
      if (accountId === actor.accountId) throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'self' });
      const target = await accountRow(accountId);
      if (target.role === 'admin' && actor.role !== 'admin')
        throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'admin' });
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('account')
          .set({ banned_at: game.deps.now(), ban_reason: reason })
          .where('id', '=', accountId)
          .execute();
        await writeAudit(tx, { actor, action: 'player.ban', target: `account:${accountId}`, detail: { reason } });
      });
      await sessions.destroyAll(accountId);
      return { banned: true };
    },

    async unban(actor: AdminActor, accountId: number): Promise<{ banned: boolean }> {
      await accountRow(accountId);
      await db.transaction().execute(async (tx) => {
        await tx.updateTable('account').set({ banned_at: null, ban_reason: null }).where('id', '=', accountId).execute();
        await writeAudit(tx, { actor, action: 'player.unban', target: `account:${accountId}` });
      });
      return { banned: false };
    },

    /** 强制改店名：不收改名卡和银币，照样检查名称规则和重名 */
    async rename(actor: AdminActor, restId: number, rawName: string, reason: string): Promise<{ name: string }> {
      const rest = await restaurantRow(restId);
      const name = rawName.trim();
      const { tuning } = await game.shards.settings(rest.shard_id);
      const problem = renameProblem(name, tuning.growth.renameMaxLength);
      if (problem) throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: problem });
      await runSystemOp(game.deps, rest.shard_id, restId, { source: 'admin.rename' }, async (op) => {
        const from = op.rest.name;
        if (from === name) return;
        try {
          await op.tx.updateTable('restaurant').set({ name }).where('id', '=', restId).execute();
        } catch (e) {
          if (uniqueViolation(e) === 'restaurant_shard_name') throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
          throw e;
        }
        op.rest.name = name;
        restLog(op, 'admin.rename', { from, to: name, reason });
        await writeAudit(op.tx, {
          actor,
          action: 'restaurant.rename',
          target: `restaurant:${restId}`,
          detail: { from, to: name, reason },
        });
      });
      return { name };
    },

    async setRole(actor: AdminActor, accountId: number, role: AccountRole): Promise<{ role: AccountRole }> {
      if (accountId === actor.accountId) throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'self' });
      await accountRow(accountId);
      await db.transaction().execute(async (tx) => {
        await tx.updateTable('account').set({ role }).where('id', '=', accountId).execute();
        await writeAudit(tx, { actor, action: 'player.role', target: `account:${accountId}`, detail: { role } });
      });
      return { role };
    },
  };
}
```

`apps/server/src/modules/admin/routes.ts` 追加（补 import：`adminLedgerQuery, adminRenameBody, pageQuery, playerSearchQuery, reasonBody, roleBody`、`createAdminPlayers`）：

```ts
    const players = createAdminPlayers(game);
    const id = (req: { params: unknown }) => parse(idParam, req.params).id;
    r.get('/players', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.search(parse(playerSearchQuery, req.query).q));
    });
    r.get('/players/:id', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.detail(id(req)));
    });
    r.get('/restaurants/:id', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.restaurant(id(req)));
    });
    r.get('/restaurants/:id/ledger', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.ledger(id(req), parse(adminLedgerQuery, req.query)));
    });
    r.get('/restaurants/:id/log', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.log(id(req), parse(pageQuery, req.query)));
    });
    r.get('/restaurants/:id/income', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.income(id(req), parse(pageQuery, req.query)));
    });
    r.post('/players/:id/ban', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await players.ban(a, id(req), parse(reasonBody, req.body).reason));
    });
    r.post('/players/:id/unban', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await players.unban(a, id(req)));
    });
    r.post('/restaurants/:id/rename', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const b = parse(adminRenameBody, req.body);
      return ok(await players.rename(a, id(req), b.name, b.reason));
    });
    r.post('/players/:id/role', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await players.setRole(a, id(req), parse(roleBody, req.body).role));
    });
```

（Task 3 的 `shardId` 辅助函数可以换成这里的 `id`，只保留一个。）

`apps/web/src/utils/events.ts` 的 `LOGS` 里加：

```ts
  'admin.rename': (p) => `管理员把店名从「${String(p.from ?? '')}」改为「${String(p.to ?? '')}」：${String(p.reason ?? '')}`,
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin apps/server/src/modules/growth apps/web/src/utils && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
git add packages/shared apps
git commit -m "feat(admin): player search and detail, restaurant ledger, ban/unban, forced rename, roles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 发放补偿（单店立即到账、全区服 worker 分批）

**Files:**
- Create: `apps/server/src/modules/admin/grants.ts`、`grants.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `apps/server/src/worker/jobs.ts`（调度任务 `admin-grants`）
- Modify: `packages/shared/src/schemas/admin.ts`
- Modify: `apps/web/src/utils/events.ts`、`events.test.ts`（日志文案 `admin.grant`）

**Interfaces:**
- Consumes: Task 2 的 `requireRole`、`writeAudit`、`AdminActor`；`runSystemOp`、`restLog`；`gainCoin`、`gainDiamond`、`gainExp`（`core/resources`）；`grantGoodsOp`（`store/goods`）；`addFoods`（`cupboard/foods`）；`JobLogger`（`worker/scheduler`）
- Produces:
  - `GRANT_LIMITS`、`grantItems`、`type GrantItems`、`createGrantBody`、`type CreateGrantInput`、`grantPreviewQuery`、`grantListQuery`、`interface GrantDto`
  - `grantItemsOp(op: Op, items: GrantItems, reason: string): Promise<void>`
  - `createAdminGrants(game: Game)` → `{ preview(shardId, minLevel?), create(actor, body), list(shardId?) }`
  - `processGrants(game: Game, log: JobLogger, batch?: number): Promise<number>`（返回本次处理的店数）
  - 路由：`GET /grants/preview`、`POST /grants`（admin）、`GET /grants`（mod）

- [ ] **Step 1: 写测试**

`apps/server/src/modules/admin/grants.test.ts`：

```ts
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import type { AdminActor } from './access';
import { createAdminGrants, processGrants } from './grants';

describe('补偿（HTTP）', () => {
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

  const grant = (cookie: string, body: unknown) => call(ctx.app, 'POST', '/api/v1/admin/grants', { cookie, body });

  it('单店立即到账：银币、道具、食材，写流水、个人日志和记录', async () => {
    const r0 = await newRestaurant(t, { patch: { coin: 100 } });
    const r = await grant(admin.cookie, {
      shardId: r0.shardId,
      target: 'rest',
      restId: r0.restaurantId,
      items: { coin: 500, goods: [{ id: 1, num: 2 }], foods: [{ id: 101, num: 3 }] },
      reason: '停服补偿',
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ status: 'done', total: 1, doneCount: 1, reason: '停服补偿' });
    expect((await restRow(t, r0.restaurantId)).coin).toBe(600);
    expect(await goodsNum(t, r0.restaurantId, 1)).toBe(2);
    expect((await foodNum(t, r0.restaurantId, 101)).num).toBe(3);
    const ledger = await t.db.selectFrom('ledger').select('source').where('rest_id', '=', r0.restaurantId).execute();
    expect(ledger.every((l) => l.source === 'admin.grant')).toBe(true);
    const log = await t.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', r0.restaurantId)
      .where('type', '=', 'admin.grant')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ reason: '停服补偿' });
  });

  it('橱柜满了新食材进冰箱，不报错', async () => {
    const r0 = await newRestaurant(t, { patch: { cupboard_num: 1 }, foods: { 102: 1 } });
    await grant(admin.cookie, {
      shardId: r0.shardId,
      target: 'rest',
      restId: r0.restaurantId,
      items: { foods: [{ id: 101, num: 2 }] },
      reason: 'x',
    });
    expect(await foodNum(t, r0.restaurantId, 101)).toMatchObject({ num: 0, fridge_num: 2 });
  });

  it('超上限、不存在的道具、空内容都 400；mod 404', async () => {
    const r0 = await newRestaurant(t);
    const base = { shardId: r0.shardId, target: 'rest', restId: r0.restaurantId, reason: 'x' };
    expect((await grant(admin.cookie, { ...base, items: { coin: 100_000_001 } })).status).toBe(400);
    expect((await grant(admin.cookie, { ...base, items: { goods: [{ id: 99999999, num: 1 }] } })).status).toBe(400);
    expect((await grant(admin.cookie, { ...base, items: {} })).status).toBe(400);
    expect((await grant(mod.cookie, { ...base, items: { coin: 1 } })).status).toBe(404);
  });

  it('全区服：预览人数，建记录后排队', async () => {
    const shardId = await createShard(t.db);
    await newRestaurant(t, { shardId, patch: { level: 1 } });
    await newRestaurant(t, { shardId, patch: { level: 10 } });
    const pv = await call(ctx.app, 'GET', `/api/v1/admin/grants/preview?shardId=${shardId}&minLevel=5`, {
      cookie: admin.cookie,
    });
    expect(pv.json.data).toEqual({ count: 1 });
    const r = await grant(admin.cookie, { shardId, target: 'shard', minLevel: 5, items: { coin: 1 }, reason: 'x' });
    expect(r.json.data).toMatchObject({ status: 'pending', total: 1, doneCount: 0 });
    const list = await call(ctx.app, 'GET', `/api/v1/admin/grants?shardId=${shardId}`, { cookie: mod.cookie });
    expect(list.json.data[0].id).toBe(r.json.data.id);
  });
});

describe('全区服发放（worker）', () => {
  let t: TestGame;
  const actor: AdminActor = { accountId: 0, username: 'x', role: 'admin', ip: '127.0.0.1' };
  const log = { error: vi.fn() };
  beforeAll(async () => {
    t = await createTestGame();
    const a = await t.db
      .insertInto('account')
      .values({ username: `g${Date.now() % 1_000_000}`, password_hash: 'x', email: `g${Date.now()}@t.local` })
      .returning('id')
      .executeTakeFirstOrThrow();
    actor.accountId = a.id;
  });
  afterAll(() => t.close());

  const shardGrant = (shardId: number, minLevel?: number) =>
    createAdminGrants(t.game).create(actor, {
      shardId,
      target: 'shard',
      minLevel,
      items: { coin: 10 },
      reason: '全服补偿',
    });
  const grantRow = (id: number) => t.db.selectFrom('admin_grant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  it('分批处理到完成；min_level 过滤；重跑不重复', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { level: 1, coin: 0 } });
    const highs = await Promise.all(
      [1, 2, 3].map(() => newRestaurant(t, { shardId, patch: { level: 10, coin: 0 } })),
    );
    const g = await shardGrant(shardId, 5);
    while ((await processGrants(t.game, log, 2)) > 0) {
      // 每批 2 家，直到没有剩余
    }
    expect(await grantRow(g.id)).toMatchObject({ status: 'done', done_count: 3, failed_count: 0 });
    for (const h of highs) expect((await restRow(t, h.restaurantId)).coin).toBe(10);
    expect((await restRow(t, low.restaurantId)).coin).toBe(0);
    await t.db.updateTable('admin_grant').set({ status: 'running' }).where('id', '=', g.id).execute();
    await processGrants(t.game, log);
    for (const h of highs) expect((await restRow(t, h.restaurantId)).coin).toBe(10);
  });

  it('一家店出错：记失败、其他店照发，最终状态 failed', async () => {
    const shardId = await createShard(t.db);
    const ok = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const broken = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await sql`create or replace function fail_grant_log() returns trigger as $$
      begin raise exception 'boom'; end $$ language plpgsql`.execute(t.db);
    await sql
      .raw(
        `create trigger fail_grant_log_${broken.restaurantId} before insert on rest_log for each row
         when (new.rest_id = ${broken.restaurantId}) execute function fail_grant_log()`,
      )
      .execute(t.db);
    try {
      const g = await shardGrant(shardId);
      await processGrants(t.game, log);
      expect(await grantRow(g.id)).toMatchObject({ status: 'failed', done_count: 1, failed_count: 1 });
      expect((await restRow(t, ok.restaurantId)).coin).toBe(10);
      expect((await restRow(t, broken.restaurantId)).coin).toBe(0);
      expect(log.error).toHaveBeenCalled();
    } finally {
      await sql.raw(`drop trigger fail_grant_log_${broken.restaurantId} on rest_log`).execute(t.db);
    }
  });

  it('两个 worker 同时处理同一条发放：每家店只到账一次（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const rs = await Promise.all([1, 2, 3, 4].map(() => newRestaurant(t, { shardId, patch: { coin: 0 } })));
    await shardGrant(shardId);
    await Promise.all([processGrants(t.game, log), processGrants(t.game, log)]);
    for (const r of rs) expect((await restRow(t, r.restaurantId)).coin).toBe(10);
  });
});
```

`apps/web/src/utils/events.test.ts` 的"个人日志文案"里追加：

```ts
    expect(logText({ type: 'admin.grant', params: { reason: '停服补偿' }, at: '' }, names)).toBe('系统补偿：停服补偿');
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin/grants.test.ts apps/web/src/utils/events.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`packages/shared/src/schemas/admin.ts` 追加：

```ts
export const GRANT_LIMITS = { coin: 100_000_000, exp: 100_000_000, diamond: 100_000, item: 9999 } as const;

const idNum = z.object({ id: z.number().int().positive(), num: z.number().int().min(1).max(GRANT_LIMITS.item) });

export const grantItems = z
  .object({
    coin: z.number().int().min(1).max(GRANT_LIMITS.coin).optional(),
    diamond: z.number().int().min(1).max(GRANT_LIMITS.diamond).optional(),
    exp: z.number().int().min(1).max(GRANT_LIMITS.exp).optional(),
    goods: z.array(idNum).max(50).optional(),
    foods: z.array(idNum).max(50).optional(),
  })
  .refine((i) => Boolean(i.coin || i.diamond || i.exp || i.goods?.length || i.foods?.length), {
    message: 'empty',
  });
export type GrantItems = z.infer<typeof grantItems>;

export const createGrantBody = z
  .object({
    shardId: z.number().int().positive(),
    target: z.enum(['rest', 'shard']),
    restId: z.number().int().positive().optional(),
    minLevel: z.number().int().min(1).optional(),
    items: grantItems,
    reason: z.string().trim().min(1).max(200),
  })
  .refine((b) => b.target === 'shard' || b.restId !== undefined, { path: ['restId'], message: 'required' });
export type CreateGrantInput = z.infer<typeof createGrantBody>;

export const grantPreviewQuery = z.object({
  shardId: z.coerce.number().int().positive(),
  minLevel: z.coerce.number().int().min(1).optional(),
});
export const grantListQuery = z.object({ shardId: z.coerce.number().int().positive().optional() });

export interface GrantDto {
  id: number;
  shardId: number;
  target: 'rest' | 'shard';
  restId: number | null;
  minLevel: number | null;
  items: GrantItems;
  reason: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  total: number;
  doneCount: number;
  failedCount: number;
  actor: string | null;
  createdAt: string;
  finishedAt: string | null;
}
```

`apps/server/src/modules/admin/grants.ts`：

```ts
import { sql } from 'kysely';
import { ErrorCode, type CreateGrantInput, type GrantDto, type GrantItems } from '@dt/shared';
import { restLog, runSystemOp, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp } from '../../core/resources';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { JobLogger } from '../../worker/scheduler';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

const SOURCE = 'admin.grant';

/** 发放一份补偿：走正常发放逻辑（橱柜满进冰箱、仓库满照发），写流水和个人日志 */
export async function grantItemsOp(op: Op, items: GrantItems, reason: string): Promise<void> {
  if (items.coin) gainCoin(op, items.coin, { source: SOURCE });
  if (items.diamond) gainDiamond(op, items.diamond, { source: SOURCE });
  if (items.exp) gainExp(op, items.exp, { source: SOURCE });
  for (const g of items.goods ?? []) await grantGoodsOp(op, g.id, g.num, { source: SOURCE });
  for (const f of items.foods ?? []) await addFoods(op, f.id, f.num, { source: SOURCE });
  restLog(op, 'admin.grant', { reason, items });
}

type GrantRow = {
  id: number;
  shard_id: number;
  target: 'rest' | 'shard';
  rest_id: number | null;
  min_level: number | null;
  items: unknown;
  reason: string;
  status: GrantDto['status'];
  total: number;
  done_count: number;
  failed_count: number;
  created_at: Date;
  finished_at: Date | null;
  username: string | null;
};

const toDto = (r: GrantRow): GrantDto => ({
  id: r.id,
  shardId: r.shard_id,
  target: r.target,
  restId: r.rest_id,
  minLevel: r.min_level,
  items: r.items as GrantItems,
  reason: r.reason,
  status: r.status,
  total: r.total,
  doneCount: r.done_count,
  failedCount: r.failed_count,
  actor: r.username,
  createdAt: r.created_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
});

export function createAdminGrants(game: Game) {
  const { db, config } = game.app;

  function checkItems(items: GrantItems): void {
    const bad: Array<{ path: string; message: string }> = [];
    (items.goods ?? []).forEach((g, i) => {
      if (!config.goods.has(g.id)) bad.push({ path: `items.goods.${i}.id`, message: 'unknown' });
    });
    (items.foods ?? []).forEach((f, i) => {
      if (!config.foods.has(f.id)) bad.push({ path: `items.foods.${i}.id`, message: 'unknown' });
    });
    if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
  }

  function targets(shardId: number, minLevel: number | null | undefined, until: Date) {
    let q = db.selectFrom('restaurant').where('shard_id', '=', shardId).where('created_at', '<=', until);
    if (minLevel) q = q.where('level', '>=', minLevel);
    return q;
  }

  async function one(id: number): Promise<GrantDto> {
    const r = await db
      .selectFrom('admin_grant as g')
      .leftJoin('account', 'account.id', 'g.actor_account_id')
      .selectAll('g')
      .select('account.username')
      .where('g.id', '=', id)
      .executeTakeFirstOrThrow();
    return toDto(r);
  }

  return {
    async preview(shardId: number, minLevel?: number): Promise<{ count: number }> {
      const r = await targets(shardId, minLevel, game.deps.now())
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow();
      return { count: Number(r.n) };
    },

    async create(actor: AdminActor, b: CreateGrantInput): Promise<GrantDto> {
      checkItems(b.items);
      const shard = await db.selectFrom('shard').select('id').where('id', '=', b.shardId).executeTakeFirst();
      if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
      if (b.target === 'rest') {
        const restId = b.restId!;
        const rest = await db
          .selectFrom('restaurant')
          .select('id')
          .where('id', '=', restId)
          .where('shard_id', '=', b.shardId)
          .executeTakeFirst();
        if (!rest) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
        const id = await runSystemOp(game.deps, b.shardId, restId, { source: SOURCE }, async (op) => {
          await grantItemsOp(op, b.items, b.reason);
          const g = await op.tx
            .insertInto('admin_grant')
            .values({
              shard_id: b.shardId,
              target: 'rest',
              rest_id: restId,
              items: JSON.stringify(b.items),
              reason: b.reason,
              status: 'done',
              total: 1,
              done_count: 1,
              actor_account_id: actor.accountId,
              created_at: op.now,
              finished_at: op.now,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await op.tx.insertInto('admin_grant_done').values({ grant_id: g.id, rest_id: restId, ok: true }).execute();
          await writeAudit(op.tx, {
            actor,
            action: 'grant.create',
            target: `restaurant:${restId}`,
            detail: { grantId: g.id, items: b.items, reason: b.reason },
          });
          return g.id;
        });
        return one(id);
      }
      const now = game.deps.now();
      const { count } = await this.preview(b.shardId, b.minLevel);
      const id = await db.transaction().execute(async (tx) => {
        const g = await tx
          .insertInto('admin_grant')
          .values({
            shard_id: b.shardId,
            target: 'shard',
            min_level: b.minLevel ?? null,
            items: JSON.stringify(b.items),
            reason: b.reason,
            status: 'pending',
            total: count,
            actor_account_id: actor.accountId,
            created_at: now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, {
          actor,
          action: 'grant.create',
          target: `shard:${b.shardId}`,
          detail: { grantId: g.id, items: b.items, reason: b.reason, minLevel: b.minLevel ?? null, total: count },
        });
        return g.id;
      });
      return one(id);
    },

    async list(shardId?: number): Promise<GrantDto[]> {
      let q = db
        .selectFrom('admin_grant as g')
        .leftJoin('account', 'account.id', 'g.actor_account_id')
        .selectAll('g')
        .select('account.username');
      if (shardId) q = q.where('g.shard_id', '=', shardId);
      return (await q.orderBy('g.id', 'desc').limit(50).execute()).map(toDto);
    },
  };
}

/**
 * worker 调度任务：取一条未完成的全区服发放，处理一批还没有结果的店。
 * 每家店的发放和结果记录在同一事务；结果表主键保证重跑、并发都不会重复到账（Review Focus 3）。
 * 单店出错单独记失败，不影响其他店；没有剩余目标时置为 done / failed
 */
export async function processGrants(game: Game, log: JobLogger, batch = 200): Promise<number> {
  const { db } = game.app;
  const g = await db
    .selectFrom('admin_grant')
    .selectAll()
    .where('target', '=', 'shard')
    .where('status', 'in', ['pending', 'running'])
    .orderBy('id')
    .limit(1)
    .executeTakeFirst();
  if (!g) return 0;
  if (g.status === 'pending') await db.updateTable('admin_grant').set({ status: 'running' }).where('id', '=', g.id).execute();
  const items = g.items as GrantItems;
  let q = db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', g.shard_id)
    .where('created_at', '<=', g.created_at)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('admin_grant_done')
            .select('rest_id')
            .where('grant_id', '=', g.id)
            .whereRef('admin_grant_done.rest_id', '=', 'restaurant.id'),
        ),
      ),
    );
  if (g.min_level !== null) q = q.where('level', '>=', g.min_level);
  const todo = await q.orderBy('id').limit(batch).execute();
  for (const { id: restId } of todo) {
    try {
      await runSystemOp(game.deps, g.shard_id, restId, { source: SOURCE }, async (op) => {
        const claimed = await op.tx
          .insertInto('admin_grant_done')
          .values({ grant_id: g.id, rest_id: restId, ok: true })
          .onConflict((oc) => oc.columns(['grant_id', 'rest_id']).doNothing())
          .returning('rest_id')
          .executeTakeFirst();
        if (!claimed) return;
        await grantItemsOp(op, items, g.reason);
      });
    } catch (err) {
      log.error({ err, grantId: g.id, restId }, 'admin grant failed');
      await db
        .insertInto('admin_grant_done')
        .values({ grant_id: g.id, rest_id: restId, ok: false, error: err instanceof Error ? err.message : String(err) })
        .onConflict((oc) => oc.columns(['grant_id', 'rest_id']).doNothing())
        .execute();
    }
  }
  const c = await db
    .selectFrom('admin_grant_done')
    .select([
      sql<number>`count(*) filter (where ok)`.as('ok'),
      sql<number>`count(*) filter (where not ok)`.as('bad'),
    ])
    .where('grant_id', '=', g.id)
    .executeTakeFirstOrThrow();
  const bad = Number(c.bad);
  const finished = todo.length < batch;
  await db
    .updateTable('admin_grant')
    .set({
      done_count: Number(c.ok),
      failed_count: bad,
      ...(finished ? { status: bad > 0 ? ('failed' as const) : ('done' as const), finished_at: game.deps.now() } : {}),
    })
    .where('id', '=', g.id)
    .execute();
  return todo.length;
}
```

`apps/server/src/modules/admin/routes.ts` 追加（补 import：`createGrantBody, grantListQuery, grantPreviewQuery`、`createAdminGrants`）：

```ts
    const grants = createAdminGrants(game);
    r.get('/grants/preview', async (req) => {
      await requireRole(db, req, 'admin');
      const q = parse(grantPreviewQuery, req.query);
      return ok(await grants.preview(q.shardId, q.minLevel));
    });
    r.post('/grants', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await grants.create(a, parse(createGrantBody, req.body)));
    });
    r.get('/grants', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await grants.list(parse(grantListQuery, req.query).shardId));
    });
```

`apps/server/src/worker/jobs.ts`：`import { processGrants } from '../modules/admin/grants';`，在 `workerJobs` 返回的列表末尾加：

```ts
    {
      name: 'admin-grants',
      intervalMs: 5_000,
      run: async () => {
        await processGrants(game, log);
      },
    },
```

`apps/web/src/utils/events.ts` 的 `LOGS` 里加：

```ts
  'admin.grant': (p) => `系统补偿：${String(p.reason ?? '')}`,
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin apps/web/src/utils && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
git add packages/shared apps
git commit -m "feat(admin): compensation grants, per-restaurant or shard-wide via resumable worker batches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 统计（每日汇总、经济、分布、结算健康）

**Files:**
- Create: `apps/server/src/modules/admin/stats.ts`、`stats.test.ts`
- Modify: `apps/server/src/game.ts`（登记 `stat-daily` 周期任务）
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `packages/shared/src/schemas/admin.ts`

**Interfaces:**
- Consumes: `gameDay`、`gameParts`、`gameTime`、`addDays`（`@dt/shared`）；`PeriodicJob`（`core/jobs`）
- Produces:
  - `SYSTEM_SOURCES: readonly string[]`
  - `aggregateDay(db, shardId, day): Promise<EconomyRowDto[]>`、`rollupDay(db, shardId, day): Promise<number>`、`statDailyJob(db): PeriodicJob`
  - `economy(db, shardId, from, to, now): Promise<EconomyRowDto[]>`、`distribution(db, shardId): Promise<DistributionDto>`、`settlementRounds(db, shardId, rounds): Promise<SettlementRoundDto[]>`
  - DTO：`EconomyRowDto`、`BucketDto`、`DistributionDto`、`SettlementRoundDto`；schema：`economyQuery`、`shardQuery`、`settlementQuery`
  - 路由：`GET /stats/economy`、`GET /stats/distribution`、`GET /stats/settlement`（mod）

- [ ] **Step 1: 写测试**

`apps/server/src/modules/admin/stats.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { aggregateDay, distribution, rollupDay, settlementRounds, statDailyJob } from './stats';

let ctx: TestContext;
let mod: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());

const DAY = '2026-06-01';

async function shopIn(shardId: number, patch = {}) {
  return createRestaurantFull(ctx.deps.db, shardId, await createAccountRow(ctx.deps.db), { patch });
}

describe('每日汇总', () => {
  it('流水按 (kind, source) 求和，结算记 settlement，活跃店排除系统来源；日界按北京时间（Review Focus 2）', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    const a = await shopIn(shardId);
    const b = await shopIn(shardId);
    const at = (h: number, m = 0) => gameTime(DAY, h, m);
    await db
      .insertInto('ledger')
      .values([
        { rest_id: a, kind: 'coin', delta: 100, source: 'signin', created_at: at(12) },
        { rest_id: a, kind: 'coin', delta: -30, source: 'market.buy', created_at: at(13) },
        // 北京时间 23:59（UTC 15:59）算这一天；00:00（UTC 16:00）算下一天
        { rest_id: a, kind: 'coin', delta: 7, source: 'signin', created_at: at(23, 59) },
        { rest_id: a, kind: 'coin', delta: 1000, source: 'signin', created_at: gameTime(addDays(DAY, 1), 0) },
        { rest_id: b, kind: 'foods', item_id: 101, delta: -1, source: 'mouse', created_at: at(3) },
      ])
      .execute();
    await db
      .insertInto('income_round')
      .values({
        rest_id: b,
        round_no: 1,
        coin: 50,
        exp: 20,
        oil: 2,
        customers: JSON.stringify({}),
        rates: JSON.stringify({}),
        drops: JSON.stringify([]),
        created_at: at(10),
      })
      .execute();
    const rows = await aggregateDay(db, shardId, DAY);
    const amount = (kind: string, source: string) =>
      rows.find((r) => r.kind === kind && r.source === source)?.amount ?? 0;
    expect(amount('coin', 'signin')).toBe(107);
    expect(amount('coin', 'market.buy')).toBe(-30);
    expect(amount('coin', 'settlement')).toBe(50);
    expect(amount('exp', 'settlement')).toBe(20);
    expect(amount('foods', 'mouse')).toBe(-1);
    expect(amount('active', 'rest')).toBe(1);
    expect(await rollupDay(db, shardId, DAY)).toBe(rows.length);
    expect(await rollupDay(db, shardId, DAY)).toBe(rows.length);
    const stored = await db.selectFrom('stat_daily').selectAll().where('shard_id', '=', shardId).execute();
    expect(stored).toHaveLength(rows.length);
    expect(stored.every((r) => r.day === DAY)).toBe(true);
  });

  it('周期键：00:10 之后才汇总前一天', () => {
    const job = statDailyJob(ctx.deps.db);
    const s = {} as never;
    expect(job.period(gameTime(DAY, 0, 5), s)).toBeNull();
    expect(job.period(gameTime(DAY, 0, 10), s)).toBe(addDays(DAY, -1));
    expect(job.period(gameTime(DAY, 23, 0), s)).toBe(addDays(DAY, -1));
  });
});

describe('分布和结算健康', () => {
  it('等级分段、星级、食谱分段、营业和停业店数', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    await shopIn(shardId, { level: 3 });
    await shopIn(shardId, { level: 15, star_level: 1, state: 2 });
    const d = await distribution(db, shardId);
    expect(d).toMatchObject({ open: 1, closed: 1 });
    expect(d.levels).toEqual([
      { from: 1, to: 9, count: 1 },
      { from: 10, to: 19, count: 1 },
    ]);
    expect(d.stars).toEqual([
      { star: 0, count: 1 },
      { star: 1, count: 1 },
    ]);
    expect(d.cookbooks[0]).toMatchObject({ from: 0, to: 19, count: 2 });
  });

  it('最近若干轮结算：按轮次升序', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    for (const round of [1, 2, 3]) {
      await db
        .insertInto('job_run')
        .values({
          shard_id: shardId,
          job: 'settlement',
          period: String(round),
          started_at: new Date(Date.now() - (4 - round) * 240_000),
          finished_at: new Date(),
          stats: JSON.stringify({ round, ms: round * 10, settled: 5, closed: 0, failed: round === 3 ? 1 : 0 }),
        })
        .execute();
    }
    const r = await settlementRounds(db, shardId, 2);
    expect(r.map((x) => x.round)).toEqual([2, 3]);
    expect(r[1]).toMatchObject({ ms: 30, settled: 5, failed: 1 });
  });

  it('接口：范围超过 90 天 400；mod 可以看', async () => {
    const shardId = await createShard(ctx.deps.db);
    const eco = (from: string, to: string) =>
      call(ctx.app, 'GET', `/api/v1/admin/stats/economy?shardId=${shardId}&from=${from}&to=${to}`, {
        cookie: mod.cookie,
      });
    expect((await eco('2026-01-01', '2026-06-01')).status).toBe(400);
    expect((await eco(DAY, DAY)).status).toBe(200);
    const dist = await call(ctx.app, 'GET', `/api/v1/admin/stats/distribution?shardId=${shardId}`, { cookie: mod.cookie });
    expect(dist.status).toBe(200);
    const st = await call(ctx.app, 'GET', `/api/v1/admin/stats/settlement?shardId=${shardId}`, { cookie: mod.cookie });
    expect(st.json.data).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin/stats.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`packages/shared/src/schemas/admin.ts` 追加：

```ts
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const shardQuery = z.object({ shardId: z.coerce.number().int().positive() });
export const economyQuery = shardQuery.extend({ from: dayString, to: dayString });
export const settlementQuery = shardQuery.extend({ rounds: z.coerce.number().int().min(1).max(360).default(90) });

export interface EconomyRowDto {
  day: string;
  kind: string;
  source: string;
  amount: number;
}

export interface BucketDto {
  from: number;
  to: number;
  count: number;
}

export interface DistributionDto {
  open: number;
  closed: number;
  levels: BucketDto[];
  stars: Array<{ star: number; count: number }>;
  cookbooks: BucketDto[];
}

export interface SettlementRoundDto {
  round: number;
  at: string;
  ms: number;
  settled: number;
  closed: number;
  failed: number;
}
```

`apps/server/src/modules/admin/stats.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import {
  addDays,
  ErrorCode,
  gameDay,
  gameParts,
  gameTime,
  type BucketDto,
  type DistributionDto,
  type EconomyRowDto,
  type SettlementRoundDto,
} from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';

/** 不算"玩家操作"的流水来源（设计文档 裁定 10） */
export const SYSTEM_SOURCES = ['settlement', 'mouse', 'market.guess', 'market.guess.refund', 'admin.grant'] as const;

/** 一个区服一个游戏日（北京时间）的经济汇总：流水按 (kind, source)，结算收益记 source=settlement，外加活跃店数 */
export async function aggregateDay(db: Kysely<DB>, shardId: number, day: string): Promise<EconomyRowDto[]> {
  const start = gameTime(day, 0);
  const end = gameTime(addDays(day, 1), 0);
  const ledger = await db
    .selectFrom('ledger as l')
    .innerJoin('restaurant as r', 'r.id', 'l.rest_id')
    .select(['l.kind', 'l.source', sql<number>`sum(l.delta)::bigint`.as('amount')])
    .where('r.shard_id', '=', shardId)
    .where('l.created_at', '>=', start)
    .where('l.created_at', '<', end)
    .groupBy(['l.kind', 'l.source'])
    .execute();
  const income = await db
    .selectFrom('income_round as i')
    .innerJoin('restaurant as r', 'r.id', 'i.rest_id')
    .select([
      sql<number>`coalesce(sum(i.coin), 0)::bigint`.as('coin'),
      sql<number>`coalesce(sum(i.exp), 0)::bigint`.as('exp'),
    ])
    .where('r.shard_id', '=', shardId)
    .where('i.created_at', '>=', start)
    .where('i.created_at', '<', end)
    .executeTakeFirstOrThrow();
  const active = await db
    .selectFrom('ledger as l')
    .innerJoin('restaurant as r', 'r.id', 'l.rest_id')
    .select(sql<number>`count(distinct l.rest_id)`.as('n'))
    .where('r.shard_id', '=', shardId)
    .where('l.created_at', '>=', start)
    .where('l.created_at', '<', end)
    .where('l.source', 'not in', [...SYSTEM_SOURCES])
    .executeTakeFirstOrThrow();
  const rows = new Map<string, EconomyRowDto>();
  const add = (kind: string, source: string, amount: number) => {
    if (!amount) return;
    const key = `${kind}|${source}`;
    const cur = rows.get(key);
    if (cur) cur.amount += amount;
    else rows.set(key, { day, kind, source, amount });
  };
  for (const r of ledger) add(r.kind, r.source, Number(r.amount));
  add('coin', 'settlement', Number(income.coin));
  add('exp', 'settlement', Number(income.exp));
  add('active', 'rest', Number(active.n));
  return [...rows.values()];
}

/** 把一天的汇总写进 stat_daily（先删后写，重复执行结果不变） */
export async function rollupDay(db: Kysely<DB>, shardId: number, day: string): Promise<number> {
  const rows = await aggregateDay(db, shardId, day);
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('stat_daily').where('shard_id', '=', shardId).where('day', '=', day).execute();
    if (rows.length > 0)
      await tx
        .insertInto('stat_daily')
        .values(rows.map((r) => ({ shard_id: shardId, day, kind: r.kind, source: r.source, amount: r.amount })))
        .execute();
  });
  return rows.length;
}

/** 每天 00:10（北京时间）之后汇总前一天（设计文档 裁定 9） */
export function statDailyJob(db: Kysely<DB>): PeriodicJob {
  return {
    name: 'stat-daily',
    feature: 'restaurant',
    period: (now) => {
      const p = gameParts(now);
      if (p.hour === 0 && p.minute < 10) return null;
      return addDays(p.day, -1);
    },
    run: async ({ shardId, period }) => ({ rows: await rollupDay(db, shardId, period) }),
  };
}

const DAY_MS = 86_400_000;

/** 经济：已汇总的历史 + 今天（和还没汇总的昨天）实时算 */
export async function economy(
  db: Kysely<DB>,
  shardId: number,
  from: string,
  to: string,
  now: Date,
): Promise<EconomyRowDto[]> {
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (span < 0 || span > 89)
    throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: [{ path: 'to', message: 'range' }] });
  const today = gameDay(now);
  const stored = await db
    .selectFrom('stat_daily')
    .select(['day', 'kind', 'source', 'amount'])
    .where('shard_id', '=', shardId)
    .where('day', '>=', from)
    .where('day', '<=', to)
    .orderBy('day')
    .execute();
  const rows: EconomyRowDto[] = stored.filter((r) => r.day !== today).map((r) => ({ ...r, amount: Number(r.amount) }));
  const storedDays = new Set(rows.map((r) => r.day));
  for (const d of [addDays(today, -1), today]) {
    if (d < from || d > to || (d !== today && storedDays.has(d))) continue;
    rows.push(...(await aggregateDay(db, shardId, d)));
  }
  return rows;
}

function buckets(rows: Array<{ b: number; n: number }>, width: number, minFrom: number): BucketDto[] {
  return rows
    .map((r) => ({ from: Math.max(minFrom, r.b * width), to: r.b * width + width - 1, count: Number(r.n) }))
    .sort((a, b) => a.from - b.from);
}

export async function distribution(db: Kysely<DB>, shardId: number): Promise<DistributionDto> {
  const base = db.selectFrom('restaurant').where('shard_id', '=', shardId);
  const states = await base.select(['state', sql<number>`count(*)`.as('n')]).groupBy('state').execute();
  const levels = await base
    .select([sql<number>`floor(level / 10)::int`.as('b'), sql<number>`count(*)`.as('n')])
    .groupBy('b')
    .execute();
  const stars = await base
    .select(['star_level', sql<number>`count(*)`.as('n')])
    .groupBy('star_level')
    .orderBy('star_level')
    .execute();
  const cookbooks = await base
    .select([sql<number>`floor(coalesce((cookbook_counts->>'learned')::int, 0) / 20)::int`.as('b'), sql<number>`count(*)`.as('n')])
    .groupBy('b')
    .execute();
  const count = (s: number) => Number(states.find((x) => x.state === s)?.n ?? 0);
  return {
    open: count(1),
    closed: count(2),
    levels: buckets(levels, 10, 1),
    stars: stars.map((s) => ({ star: s.star_level, count: Number(s.n) })),
    cookbooks: buckets(cookbooks, 20, 0),
  };
}

export async function settlementRounds(db: Kysely<DB>, shardId: number, rounds: number): Promise<SettlementRoundDto[]> {
  const rows = await db
    .selectFrom('job_run')
    .select(['period', 'started_at', 'stats'])
    .where('shard_id', '=', shardId)
    .where('job', '=', 'settlement')
    .where('finished_at', 'is not', null)
    .orderBy('started_at', 'desc')
    .limit(rounds)
    .execute();
  return rows.reverse().map((r) => {
    const s = r.stats as Record<string, number>;
    return {
      round: Number(r.period),
      at: r.started_at.toISOString(),
      ms: s.ms ?? 0,
      settled: s.settled ?? 0,
      closed: s.closed ?? 0,
      failed: s.failed ?? 0,
    };
  });
}
```

`apps/server/src/game.ts`：`import { statDailyJob } from './modules/admin/stats';`，在 `jobs.push(...marketJobs(market));` 之后加 `jobs.push(statDailyJob(app.db));`

`apps/server/src/modules/admin/routes.ts` 追加（补 import：`economyQuery, settlementQuery, shardQuery`、`distribution, economy, settlementRounds`）：

```ts
    r.get('/stats/economy', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(economyQuery, req.query);
      return ok(await economy(db, q.shardId, q.from, q.to, game.deps.now()));
    });
    r.get('/stats/distribution', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await distribution(db, parse(shardQuery, req.query).shardId));
    });
    r.get('/stats/settlement', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(settlementQuery, req.query);
      return ok(await settlementRounds(db, q.shardId, q.rounds));
    });
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin apps/server/src/worker && pnpm typecheck`
Expected: PASS（`worker/periodic.test.ts` 若断言了 `game.jobs` 的名字列表，把 `stat-daily` 加进期望，并记 Ruling）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
git add packages/shared apps/server
git commit -m "feat(admin): daily economy rollup, economy/distribution/settlement stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 审计日志列表和权限矩阵

**Files:**
- Modify: `apps/server/src/modules/admin/audit.ts`（`auditPage`）
- Modify: `apps/server/src/modules/admin/routes.ts`
- Modify: `packages/shared/src/schemas/admin.ts`
- Create: `apps/server/src/modules/admin/permissions.test.ts`

**Interfaces:**
- Consumes: 前面所有后台路由；`parseCursor`、`cursorOf`
- Produces: `auditPage(db, q): Promise<AuditPageDto>`；`auditQuery`、`AuditRowDto`、`AuditPageDto`；路由 `GET /audit`（mod）

- [ ] **Step 1: 写测试**

`apps/server/src/modules/admin/permissions.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
const routes = new Set<string>();
let ids: { shardId: number; accountId: number; restId: number };
let cookies: Record<'player' | 'mod' | 'admin', string>;

beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.addHook('onRoute', (r) => {
      const methods = Array.isArray(r.method) ? r.method : [r.method];
      if (r.url.startsWith('/api/v1/admin')) for (const m of methods) if (m !== 'HEAD') routes.add(`${m} ${r.url}`);
    });
  });
  const shardId = await createShard(ctx.deps.db);
  const target = await registerUser(ctx.app);
  const restId = await createRestaurantFull(ctx.deps.db, shardId, target.accountId);
  ids = { shardId, accountId: target.accountId, restId };
  cookies = {
    player: (await userWithRole(ctx, 'player')).cookie,
    mod: (await userWithRole(ctx, 'mod')).cookie,
    admin: (await userWithRole(ctx, 'admin')).cookie,
  };
});
afterAll(() => ctx.close());

type Case = { method: 'GET' | 'POST'; route: string; url: () => string; body?: () => unknown; min: 'mod' | 'admin' };
const CASES: Case[] = [
  { method: 'GET', route: '/api/v1/admin/me', url: () => '/api/v1/admin/me', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/shards', url: () => '/api/v1/admin/shards', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/shards/:id/settings', url: () => `/api/v1/admin/shards/${ids.shardId}/settings`, min: 'mod' },
  {
    method: 'POST',
    route: '/api/v1/admin/shards/:id/override',
    url: () => `/api/v1/admin/shards/${ids.shardId}/override`,
    body: () => ({ override: {}, note: '权限测试', version: 0 }),
    min: 'admin',
  },
  { method: 'GET', route: '/api/v1/admin/shards/:id/history', url: () => `/api/v1/admin/shards/${ids.shardId}/history`, min: 'mod' },
  {
    method: 'POST',
    route: '/api/v1/admin/shards/:id/rollback',
    url: () => `/api/v1/admin/shards/${ids.shardId}/rollback`,
    body: () => ({ version: 1, note: '权限测试' }),
    min: 'admin',
  },
  { method: 'GET', route: '/api/v1/admin/players', url: () => '/api/v1/admin/players?q=x', min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/players/:id', url: () => `/api/v1/admin/players/${ids.accountId}`, min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/restaurants/:id', url: () => `/api/v1/admin/restaurants/${ids.restId}`, min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/restaurants/:id/ledger', url: () => `/api/v1/admin/restaurants/${ids.restId}/ledger`, min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/restaurants/:id/log', url: () => `/api/v1/admin/restaurants/${ids.restId}/log`, min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/restaurants/:id/income', url: () => `/api/v1/admin/restaurants/${ids.restId}/income`, min: 'mod' },
  {
    method: 'POST',
    route: '/api/v1/admin/players/:id/ban',
    url: () => `/api/v1/admin/players/${ids.accountId}/ban`,
    body: () => ({ reason: '权限测试' }),
    min: 'mod',
  },
  { method: 'POST', route: '/api/v1/admin/players/:id/unban', url: () => `/api/v1/admin/players/${ids.accountId}/unban`, body: () => ({}), min: 'mod' },
  {
    method: 'POST',
    route: '/api/v1/admin/restaurants/:id/rename',
    url: () => `/api/v1/admin/restaurants/${ids.restId}/rename`,
    body: () => ({ name: `权限${ids.restId % 10000}`, reason: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/players/:id/role',
    url: () => `/api/v1/admin/players/${ids.accountId}/role`,
    body: () => ({ role: 'player' }),
    min: 'admin',
  },
  { method: 'GET', route: '/api/v1/admin/grants/preview', url: () => `/api/v1/admin/grants/preview?shardId=${ids.shardId}`, min: 'admin' },
  {
    method: 'POST',
    route: '/api/v1/admin/grants',
    url: () => '/api/v1/admin/grants',
    body: () => ({ shardId: ids.shardId, target: 'rest', restId: ids.restId, items: { coin: 1 }, reason: '权限测试' }),
    min: 'admin',
  },
  { method: 'GET', route: '/api/v1/admin/grants', url: () => '/api/v1/admin/grants', min: 'mod' },
  {
    method: 'GET',
    route: '/api/v1/admin/stats/economy',
    url: () => `/api/v1/admin/stats/economy?shardId=${ids.shardId}&from=2026-06-01&to=2026-06-02`,
    min: 'mod',
  },
  { method: 'GET', route: '/api/v1/admin/stats/distribution', url: () => `/api/v1/admin/stats/distribution?shardId=${ids.shardId}`, min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/stats/settlement', url: () => `/api/v1/admin/stats/settlement?shardId=${ids.shardId}`, min: 'mod' },
  { method: 'GET', route: '/api/v1/admin/audit', url: () => '/api/v1/admin/audit', min: 'mod' },
];

describe('后台权限矩阵', () => {
  it('矩阵覆盖了所有后台路由', () => {
    expect([...routes].sort()).toEqual(CASES.map((c) => `${c.method} ${c.route}`).sort());
  });

  it.each(CASES)('$method $route', async (c) => {
    const run = (cookie?: string) => call(ctx.app, c.method, c.url(), { cookie, body: c.body?.() });
    expect((await run()).status).toBe(401);
    expect((await run(cookies.player)).status).toBe(404);
    const asMod = await run(cookies.mod);
    if (c.min === 'mod') expect([401, 404]).not.toContain(asMod.status);
    else expect(asMod.status).toBe(404);
    const asAdmin = await run(cookies.admin);
    expect([401, 404]).not.toContain(asAdmin.status);
  });
});

describe('审计日志列表', () => {
  it('按操作人和动作筛选，分页', async () => {
    const r = await call(ctx.app, 'GET', '/api/v1/admin/audit?action=player.&limit=1', { cookie: cookies.mod });
    expect(r.status).toBe(200);
    expect(r.json.data.items).toHaveLength(1);
    expect(r.json.data.items[0].action.startsWith('player.')).toBe(true);
    expect(r.json.data.nextBefore).not.toBeNull();
    const next = await call(
      ctx.app,
      'GET',
      `/api/v1/admin/audit?action=player.&limit=1&before=${encodeURIComponent(r.json.data.nextBefore)}`,
      { cookie: cookies.mod },
    );
    expect(next.json.data.items[0].id).toBeLessThan(r.json.data.items[0].id);
  });
});
```

（`it.each` 按列表顺序执行：先 override 后 rollback、先 ban 后 unban，保证写操作都有合法前提。审计列表测试放在矩阵之后，那时已有 ban / unban / role 的记录。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/server/src/modules/admin/permissions.test.ts`
Expected: FAIL（`GET /audit` 未注册，矩阵覆盖检查和最后一个用例失败）

- [ ] **Step 3: 实现**

`packages/shared/src/schemas/admin.ts` 追加：

```ts
export const auditQuery = pageQuery.extend({
  actor: z.string().trim().max(32).optional(),
  action: z.string().trim().max(64).optional(),
});

export interface AuditRowDto {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
  at: string;
}

export interface AuditPageDto {
  items: AuditRowDto[];
  nextBefore: string | null;
}
```

`apps/server/src/modules/admin/audit.ts` 追加（补 import：`sql`、`AuditPageDto`、`parseCursor`、`cursorOf`）：

```ts
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** 审计列表：按操作人用户名（不分大小写）和动作前缀筛选，游标"时间~id" */
export async function auditPage(
  db: Kysely<DB>,
  q: { actor?: string; action?: string; before?: string; limit: number },
): Promise<AuditPageDto> {
  let s = db
    .selectFrom('audit_log as a')
    .leftJoin('account', 'account.id', 'a.actor_account_id')
    .select(['a.id', 'a.action', 'a.target', 'a.detail', 'a.ip', 'a.created_at', 'account.username']);
  if (q.actor) s = s.where(sql<string>`lower(account.username)`, '=', q.actor.toLowerCase());
  if (q.action) s = s.where('a.action', 'like', `${likeEscape(q.action)}%`);
  if (q.before) {
    const c = parseCursor(q.before);
    s = c.id
      ? s.where((eb) =>
          eb.or([
            eb('a.created_at', '<', c.at),
            eb.and([eb('a.created_at', '=', c.at), eb('a.id', '<', Number(c.id))]),
          ]),
        )
      : s.where('a.created_at', '<', c.at);
  }
  const rows = await s.orderBy('a.created_at', 'desc').orderBy('a.id', 'desc').limit(q.limit + 1).execute();
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      actor: r.username ?? null,
      action: r.action,
      target: r.target,
      detail: r.detail,
      ip: r.ip,
      at: r.created_at.toISOString(),
    })),
    nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
  };
}
```

`apps/server/src/modules/admin/routes.ts` 追加（补 import：`auditQuery`、`auditPage`）：

```ts
    r.get('/audit', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await auditPage(db, parse(auditQuery, req.query)));
    });
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/server/src/modules/admin && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
git add packages/shared apps/server
git commit -m "feat(admin): audit log listing and full permission matrix test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 前端基础（接口、管理员状态、布局、图表、配置树工具、入口）

**Files:**
- Create: `apps/web/src/api/admin.ts`
- Create: `apps/web/src/stores/admin.ts`
- Create: `apps/web/src/utils/settingsTree.ts`、`settingsTree.test.ts`
- Create: `apps/web/src/components/admin/LineChart.vue`、`BarChart.vue`、`charts.test.ts`
- Create: `apps/web/src/views/admin/AdminLayout.vue`、`AdminLayout.test.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/App.vue`、`apps/web/src/styles/main.css`
- Modify: `apps/web/src/views/MoreView.vue`；Create: `apps/web/src/views/MoreView.test.ts`

**Interfaces:**
- Consumes: Task 2~7 的全部后台接口和 DTO；`MeDto.role`
- Produces:
  - `adminApi`（`api/admin.ts`）：`me, shards, settings, saveOverride, history, rollback, searchPlayers, player, restaurant, ledger, restLog, income, ban, unban, rename, setRole, grantPreview, createGrant, grants, economy, distribution, settlementRounds, audit`
  - `useAdminStore()`：state `{ me: AdminMeDto | null; loaded: boolean; shards: AdminShardDto[]; shardId: number | null }`，getter `isAdmin`，action `load()`
  - `settingsTree`：`type Tree`、`leafPaths(v)`、`getAt(v, path)`、`setAt(obj, path, value)`、`removeAt(obj, path)`、`groupOf(path)`
  - 组件 `LineChart`（props `labels: string[]`、`series: Array<{ name: string; values: number[] }>`、`height?`）、`BarChart`（props `bars: Array<{ label: string; value: number }>`、`height?`）
  - 路由 `/admin`（`AdminLayout`，子路由由后续任务添加）

- [ ] **Step 1: 写测试**

`apps/web/src/utils/settingsTree.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { getAt, groupOf, leafPaths, removeAt, setAt } from './settingsTree';

describe('settingsTree', () => {
  const tree = { tuning: { settlement: { expMultiplier: 5 }, market: { dailyHours: [8, 10] } }, restaurant: { coin: 1 } };

  it('叶子路径：数组算叶子', () => {
    expect(leafPaths(tree)).toEqual(['tuning.settlement.expMultiplier', 'tuning.market.dailyHours', 'restaurant.coin']);
  });

  it('按路径读、写（不改原对象）、删（删空的父对象）', () => {
    expect(getAt(tree, 'tuning.market.dailyHours')).toEqual([8, 10]);
    expect(getAt(tree, 'tuning.nope.x')).toBeUndefined();
    const a = setAt({}, 'tuning.settlement.expMultiplier', 10);
    expect(a).toEqual({ tuning: { settlement: { expMultiplier: 10 } } });
    const b = setAt(a, 'tuning.market.dailyKinds', 6);
    expect(a).toEqual({ tuning: { settlement: { expMultiplier: 10 } } });
    expect(removeAt(b, 'tuning.settlement.expMultiplier')).toEqual({ tuning: { market: { dailyKinds: 6 } } });
    expect(removeAt(a, 'tuning.settlement.expMultiplier')).toEqual({});
  });

  it('分组：tuning 按第二段，其他按第一段', () => {
    expect(groupOf('tuning.market.dailyKinds')).toBe('tuning.market');
    expect(groupOf('restaurant.coin')).toBe('restaurant');
  });
});
```

`apps/web/src/components/admin/charts.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BarChart from './BarChart.vue';
import LineChart from './LineChart.vue';

describe('图表', () => {
  it('折线图：每个系列一条线，带图例', () => {
    const w = mount(LineChart, {
      props: {
        labels: ['09-01', '09-02', '09-03'],
        series: [
          { name: '签到', values: [1, 2, 3] },
          { name: '结算', values: [5, -1, 0] },
        ],
      },
    });
    expect(w.findAll('[data-testid="series"]')).toHaveLength(2);
    expect(w.text()).toContain('签到');
  });

  it('柱状图：每项一根柱子', () => {
    const w = mount(BarChart, { props: { bars: [{ label: '1-9', value: 3 }, { label: '10-19', value: 0 }, { label: '20-29', value: 1 }] } });
    expect(w.findAll('[data-testid="bar"]')).toHaveLength(3);
  });
});
```

`apps/web/src/views/admin/AdminLayout.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import AdminLayout from './AdminLayout.vue';

vi.mock('../../api/admin', () => ({ adminApi: { me: vi.fn(), shards: vi.fn() } }));

const mountAt = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin', component: AdminLayout, children: [{ path: '', component: { template: '<p>子页面</p>' } }] }],
  });
  await router.push('/admin');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有权限时显示"页面不存在"', async () => {
    vi.mocked(adminApi.me).mockRejectedValue(new Error('404'));
    const w = await mountAt();
    expect(w.find('[data-testid="admin-404"]').exists()).toBe(true);
    expect(w.text()).not.toContain('子页面');
  });

  it('有权限时显示导航、区服选择和子页面', async () => {
    vi.mocked(adminApi.me).mockResolvedValue({ accountId: 1, username: 'boss', role: 'admin' });
    vi.mocked(adminApi.shards).mockResolvedValue([{ id: 1, name: '一服', status: 'open', restaurants: 3 }]);
    const w = await mountAt();
    expect(w.find('[data-testid="admin-who"]').text()).toContain('boss');
    expect(w.find('[data-testid="admin-shard"]').text()).toContain('一服');
    expect(w.text()).toContain('子页面');
  });
});
```

`apps/web/src/views/MoreView.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import MoreView from './MoreView.vue';

const me = (role: 'player' | 'mod' | 'admin') => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  role,
  shardId: 1,
  restaurantId: 1,
});

const mountView = () =>
  mount(MoreView, {
    global: {
      plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: MoreView }] })],
    },
  });

describe('MoreView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('管理员和协管能看到"管理后台"入口，普通玩家看不到', () => {
    useSessionStore().me = me('mod');
    expect(mountView().text()).toContain('管理后台');
    useSessionStore().me = me('player');
    expect(mountView().text()).not.toContain('管理后台');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/src/utils/settingsTree.test.ts apps/web/src/components/admin apps/web/src/views/admin apps/web/src/views/MoreView.test.ts`
Expected: FAIL（模块不存在；MoreView 没有入口）

- [ ] **Step 3: 实现**

`apps/web/src/api/admin.ts`：

```ts
import type {
  AccountRole,
  AdminLedgerPageDto,
  AdminMeDto,
  AdminRestaurantDto,
  AdminShardDto,
  AuditPageDto,
  CreateGrantInput,
  DistributionDto,
  EconomyRowDto,
  GrantDto,
  IncomePageDto,
  LogPageDto,
  PlayerBriefDto,
  PlayerDetailDto,
  SettlementRoundDto,
  ShardHistoryDto,
  ShardSettingsDto,
} from '@dt/shared';
import { api } from './client';

const A = '/api/v1/admin';
const qs = (q: Record<string, string | number | undefined>) => {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
};

export const adminApi = {
  me: () => api.get<AdminMeDto>(`${A}/me`),
  shards: () => api.get<AdminShardDto[]>(`${A}/shards`),
  settings: (id: number) => api.get<ShardSettingsDto>(`${A}/shards/${id}/settings`),
  saveOverride: (id: number, b: { override: Record<string, unknown>; note: string; version: number }) =>
    api.post<{ version: number }>(`${A}/shards/${id}/override`, b),
  history: (id: number) => api.get<ShardHistoryDto[]>(`${A}/shards/${id}/history`),
  rollback: (id: number, b: { version: number; note: string }) =>
    api.post<{ version: number }>(`${A}/shards/${id}/rollback`, b),
  searchPlayers: (q: string) => api.get<PlayerBriefDto[]>(`${A}/players${qs({ q })}`),
  player: (id: number) => api.get<PlayerDetailDto>(`${A}/players/${id}`),
  restaurant: (id: number) => api.get<AdminRestaurantDto>(`${A}/restaurants/${id}`),
  ledger: (id: number, q: { kind?: string; source?: string; before?: string }) =>
    api.get<AdminLedgerPageDto>(`${A}/restaurants/${id}/ledger${qs(q)}`),
  restLog: (id: number, before?: string) => api.get<LogPageDto>(`${A}/restaurants/${id}/log${qs({ before })}`),
  income: (id: number, before?: string) => api.get<IncomePageDto>(`${A}/restaurants/${id}/income${qs({ before })}`),
  ban: (id: number, reason: string) => api.post<{ banned: boolean }>(`${A}/players/${id}/ban`, { reason }),
  unban: (id: number) => api.post<{ banned: boolean }>(`${A}/players/${id}/unban`, {}),
  rename: (restId: number, name: string, reason: string) =>
    api.post<{ name: string }>(`${A}/restaurants/${restId}/rename`, { name, reason }),
  setRole: (id: number, role: AccountRole) => api.post<{ role: AccountRole }>(`${A}/players/${id}/role`, { role }),
  grantPreview: (shardId: number, minLevel?: number) =>
    api.get<{ count: number }>(`${A}/grants/preview${qs({ shardId, minLevel })}`),
  createGrant: (b: CreateGrantInput) => api.post<GrantDto>(`${A}/grants`, b),
  grants: (shardId?: number) => api.get<GrantDto[]>(`${A}/grants${qs({ shardId })}`),
  economy: (shardId: number, from: string, to: string) =>
    api.get<EconomyRowDto[]>(`${A}/stats/economy${qs({ shardId, from, to })}`),
  distribution: (shardId: number) => api.get<DistributionDto>(`${A}/stats/distribution${qs({ shardId })}`),
  settlementRounds: (shardId: number, rounds = 90) =>
    api.get<SettlementRoundDto[]>(`${A}/stats/settlement${qs({ shardId, rounds })}`),
  audit: (q: { actor?: string; action?: string; before?: string }) => api.get<AuditPageDto>(`${A}/audit${qs(q)}`),
};
```

`apps/web/src/stores/admin.ts`：

```ts
import { defineStore } from 'pinia';
import type { AdminMeDto, AdminShardDto } from '@dt/shared';
import { adminApi } from '../api/admin';

export const useAdminStore = defineStore('admin', {
  state: () => ({
    me: null as AdminMeDto | null,
    loaded: false,
    shards: [] as AdminShardDto[],
    /** 后台当前查看的区服 */
    shardId: null as number | null,
  }),
  getters: {
    isAdmin: (s) => s.me?.role === 'admin',
  },
  actions: {
    async load() {
      try {
        this.me = await adminApi.me();
        this.shards = await adminApi.shards();
        this.shardId ??= this.shards[0]?.id ?? null;
      } catch {
        this.me = null;
      } finally {
        this.loaded = true;
      }
    },
  },
});
```

`apps/web/src/utils/settingsTree.ts`：

```ts
export type Tree = Record<string, unknown>;

const isObj = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 叶子路径：数组和非对象值都是叶子 */
export function leafPaths(v: unknown, prefix = ''): string[] {
  if (!isObj(v)) return prefix ? [prefix] : [];
  return Object.keys(v).flatMap((k) => leafPaths(v[k], prefix ? `${prefix}.${k}` : k));
}

export function getAt(v: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, k) => (isObj(cur) ? cur[k] : undefined), v);
}

/** 按路径写入，返回新对象（沿途没有的对象会创建） */
export function setAt(obj: Tree, path: string, value: unknown): Tree {
  const [head, ...rest] = path.split('.');
  const key = head!;
  if (rest.length === 0) return { ...obj, [key]: value };
  const child = isObj(obj[key]) ? (obj[key] as Tree) : {};
  return { ...obj, [key]: setAt(child, rest.join('.'), value) };
}

/** 按路径删除，返回新对象；删空的父对象一并删掉（"恢复默认"） */
export function removeAt(obj: Tree, path: string): Tree {
  const [head, ...rest] = path.split('.');
  const key = head!;
  if (!(key in obj)) return obj;
  const out: Tree = { ...obj };
  if (rest.length === 0) {
    delete out[key];
    return out;
  }
  const child = obj[key];
  if (!isObj(child)) return obj;
  const next = removeAt(child, rest.join('.'));
  if (Object.keys(next).length === 0) delete out[key];
  else out[key] = next;
  return out;
}

/** 数值页的分组：tuning 下按第二段（tuning.market），其他按第一段（restaurant） */
export function groupOf(path: string): string {
  const parts = path.split('.');
  return parts[0] === 'tuning' && parts.length > 2 ? `${parts[0]}.${parts[1]}` : parts[0]!;
}
```

`apps/web/src/components/admin/LineChart.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ labels: string[]; series: Array<{ name: string; values: number[] }>; height?: number }>(),
  { height: 180 },
);

const W = 600;
const PAD = 30;
const COLORS = ['#0d6efd', '#dc3545', '#198754', '#fd7e14', '#6f42c1', '#20c997', '#6c757d'];

const values = computed(() => props.series.flatMap((s) => s.values));
const max = computed(() => Math.max(0, ...values.value));
const min = computed(() => Math.min(0, ...values.value));
const x = (i: number) => PAD + (props.labels.length <= 1 ? 0 : (i * (W - 2 * PAD)) / (props.labels.length - 1));
const y = (v: number) => {
  const span = max.value - min.value || 1;
  return props.height - PAD / 2 - ((v - min.value) * (props.height - PAD)) / span;
};
const lines = computed(() =>
  props.series.map((s, i) => ({
    name: s.name,
    color: COLORS[i % COLORS.length],
    points: s.values.map((v, j) => `${x(j)},${y(v)}`).join(' '),
  })),
);
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${height}`" class="w-100" role="img" data-testid="line-chart">
      <line :x1="PAD" :x2="W - PAD" :y1="y(0)" :y2="y(0)" stroke="#ccc" />
      <text x="2" :y="y(max) + 4" font-size="10">{{ max }}</text>
      <text x="2" :y="y(min)" font-size="10">{{ min }}</text>
      <polyline
        v-for="l in lines"
        :key="l.name"
        data-testid="series"
        :points="l.points"
        fill="none"
        :stroke="l.color"
        stroke-width="2"
      />
      <text v-if="labels.length > 0" :x="PAD" :y="height - 2" font-size="10">{{ labels[0] }}</text>
      <text v-if="labels.length > 1" :x="W - PAD" :y="height - 2" font-size="10" text-anchor="end">
        {{ labels[labels.length - 1] }}
      </text>
    </svg>
    <div class="small d-flex flex-wrap gap-2">
      <span v-for="l in lines" :key="l.name"><span :style="{ color: l.color }">●</span> {{ l.name }}</span>
    </div>
  </div>
</template>
```

`apps/web/src/components/admin/BarChart.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ bars: Array<{ label: string; value: number }>; height?: number }>(), {
  height: 160,
});

const W = 600;
const max = computed(() => Math.max(1, ...props.bars.map((b) => b.value)));
const bw = computed(() => (W - 20) / Math.max(1, props.bars.length));
const h = (v: number) => ((props.height - 40) * v) / max.value;
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${height}`" class="w-100" role="img" data-testid="bar-chart">
    <g v-for="(b, i) in bars" :key="b.label">
      <rect
        data-testid="bar"
        :x="10 + i * bw + 2"
        :width="Math.max(1, bw - 4)"
        :y="height - 20 - h(b.value)"
        :height="h(b.value)"
        fill="#0d6efd"
      />
      <text :x="10 + i * bw + bw / 2" :y="height - 6" font-size="10" text-anchor="middle">{{ b.label }}</text>
      <text :x="10 + i * bw + bw / 2" :y="height - 24 - h(b.value)" font-size="10" text-anchor="middle">
        {{ b.value }}
      </text>
    </g>
  </svg>
</template>
```

`apps/web/src/views/admin/AdminLayout.vue`（设计文档第 5 节的左侧导航简化为顶部导航条，窄屏自动换行）：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useAdminStore } from '../../stores/admin';

const admin = useAdminStore();
onMounted(() => {
  if (!admin.loaded) void admin.load();
});

const links = computed(() => [
  { to: '/admin', label: '概览' },
  { to: `/admin/shards/${admin.shardId ?? 1}`, label: '区服数值' },
  { to: '/admin/players', label: '玩家' },
  { to: '/admin/grants', label: '补偿' },
  { to: '/admin/stats', label: '统计' },
  { to: '/admin/audit', label: '审计' },
]);
</script>

<template>
  <div v-if="!admin.loaded" class="p-3 text-muted">加载中…</div>
  <div v-else-if="!admin.me" class="p-4 text-center" data-testid="admin-404">
    <h5>页面不存在</h5>
    <RouterLink to="/">回到首页</RouterLink>
  </div>
  <div v-else>
    <nav class="d-flex flex-wrap align-items-center gap-2 border-bottom pb-2 mb-2">
      <RouterLink v-for="l in links" :key="l.label" :to="l.to" class="btn btn-sm btn-outline-secondary">
        {{ l.label }}
      </RouterLink>
      <select v-model.number="admin.shardId" class="form-select form-select-sm w-auto ms-auto" data-testid="admin-shard">
        <option v-for="s in admin.shards" :key="s.id" :value="s.id">{{ s.name }}（{{ s.restaurants }} 店）</option>
      </select>
      <span class="small text-muted" data-testid="admin-who">
        {{ admin.me.username }} · {{ admin.me.role === 'admin' ? '管理员' : '协管' }}
      </span>
    </nav>
    <RouterView />
  </div>
</template>
```

`apps/web/src/router.ts`：在最后的 `{ path: '/:pathMatch(.*)*', redirect: '/' }` 之前加：

```ts
  {
    path: '/admin',
    component: () => import('./views/admin/AdminLayout.vue'),
    meta: { admin: true },
    children: [],
  },
```

`apps/web/src/App.vue`：`const wide = computed(() => route.path.startsWith('/admin'));`，外层 `<div class="dt-app">` 改为 `<div :class="['dt-app', { 'dt-app-wide': wide }]">`。

`apps/web/src/styles/main.css` 在 `.dt-app { … }` 之后加：

```css
.dt-app-wide {
  max-width: 1200px;
}
```

`apps/web/src/views/MoreView.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const base = [
  // …原有的 9 个入口保持不变…
];
const links = computed(() =>
  session.me && session.me.role !== 'player'
    ? [...base, { to: '/admin', icon: 'bi-shield-lock', label: '管理后台' }]
    : base,
);
</script>
```

（把原来的 `const links = [...]` 改名为 `base`，模板不变。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): admin api, store, layout, charts, settings tree helpers, entry link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 前端——区服数值和修改历史

**Files:**
- Create: `apps/web/src/components/admin/SettingRow.vue`
- Create: `apps/web/src/views/admin/AdminShardView.vue`、`AdminShardView.test.ts`
- Create: `apps/web/src/views/admin/AdminShardHistoryView.vue`、`AdminShardHistoryView.test.ts`
- Modify: `apps/web/src/router.ts`（`/admin` 的 children）

**Interfaces:**
- Consumes: Task 8 的 `adminApi`、`useAdminStore`、`settingsTree`
- Produces: 路由 `/admin/shards/:id`、`/admin/shards/:id/history`；输入框 `data-testid="setting-<路径>"`、生效值 `effective-<路径>`、恢复默认 `reset-<路径>`、功能开关 `feature-<名称>`、备注 `save-note`、保存 `save-settings`（端到端用例依赖这些 testid）

- [ ] **Step 1: 写测试**

`apps/web/src/views/admin/AdminShardView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ShardSettingsDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminShardView from './AdminShardView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { settings: vi.fn(), saveOverride: vi.fn() } }));

const defaults = {
  features: {},
  restaurant: { coin: 100000, giftFoods: [] },
  tuning: { settlement: { expMultiplier: 5 }, market: { dailyKinds: 5 } },
};
const dto: ShardSettingsDto = {
  version: 2,
  defaults,
  override: {},
  effective: { features: {}, ...defaults },
  features: [{ name: 'market', enabled: true }],
};

async function mountView(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'x', role };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/shards/:id', component: AdminShardView }, { path: '/:p(.*)*', component: { template: '<p/>' } }],
  });
  await router.push('/admin/shards/1');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

const field = (path: string) => `[data-testid="setting-${path}"]`;

describe('AdminShardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.settings).mockResolvedValue(structuredClone(dto));
    vi.mocked(adminApi.saveOverride).mockResolvedValue({ version: 3 });
  });

  it('常用项显示默认值；改完填备注保存，只提交覆盖', async () => {
    const w = await mountView('admin');
    const input = w.find(field('tuning.settlement.expMultiplier'));
    expect((input.element as HTMLInputElement).value).toBe('5');
    await input.setValue('10');
    await input.trigger('change');
    await w.find('[data-testid="save-note"]').setValue('加速');
    await w.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(adminApi.saveOverride).toHaveBeenCalledWith(1, {
      override: { tuning: { settlement: { expMultiplier: 10 } } },
      note: '加速',
      version: 2,
    });
  });

  it('恢复默认后没有改动，保存按钮禁用', async () => {
    const w = await mountView('admin');
    const input = w.find(field('tuning.settlement.expMultiplier'));
    await input.setValue('10');
    await input.trigger('change');
    await w.find('[data-testid="reset-tuning.settlement.expMultiplier"]').trigger('click');
    await w.find('[data-testid="save-note"]').setValue('x');
    expect(w.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();
  });

  it('JSON 写错时标红并禁止保存；关闭功能写入 false', async () => {
    const w = await mountView('admin');
    const gift = w.find(field('restaurant.giftFoods'));
    await gift.setValue('[{');
    await gift.trigger('change');
    expect(gift.classes()).toContain('is-invalid');
    await w.find('[data-testid="save-note"]').setValue('x');
    expect(w.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();
    await gift.setValue('[]');
    await gift.trigger('change');
    await w.find('[data-testid="feature-market"]').setValue(false);
    await w.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(adminApi.saveOverride).mock.calls[0]![1].override).toEqual({
      restaurant: { giftFoods: [] },
      features: { market: false },
    });
  });

  it('协管只能看：输入框禁用，没有保存', async () => {
    const w = await mountView('mod');
    expect(w.find(field('tuning.settlement.expMultiplier')).attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="save-settings"]').exists()).toBe(false);
  });
});
```

`apps/web/src/views/admin/AdminShardHistoryView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminShardHistoryView from './AdminShardHistoryView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { history: vi.fn(), rollback: vi.fn() } }));

describe('AdminShardHistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('列出版本和改动路径；管理员可以回滚旧版本', async () => {
    useAdminStore().me = { accountId: 1, username: 'x', role: 'admin' };
    vi.mocked(adminApi.history).mockResolvedValue([
      { version: 2, override: {}, actor: 'boss', note: '恢复', changed: ['tuning.settlement.expMultiplier'], at: '2026-09-30T00:00:00.000Z' },
      { version: 1, override: {}, actor: 'boss', note: '加速', changed: ['tuning.settlement.expMultiplier'], at: '2026-09-29T00:00:00.000Z' },
    ]);
    vi.mocked(adminApi.rollback).mockResolvedValue({ version: 3 });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('回到加速');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/admin/shards/:id/history', component: AdminShardHistoryView }, { path: '/:p(.*)*', component: { template: '<p/>' } }],
    });
    await router.push('/admin/shards/1/history');
    const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain('tuning.settlement.expMultiplier');
    expect(w.find('[data-testid="rollback-2"]').exists()).toBe(false);
    await w.find('[data-testid="rollback-1"]').trigger('click');
    await flushPromises();
    expect(adminApi.rollback).toHaveBeenCalledWith(1, { version: 1, note: '回到加速' });
    prompt.mockRestore();
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/src/views/admin`
Expected: FAIL（视图不存在）

- [ ] **Step 3: 实现**

`apps/web/src/components/admin/SettingRow.vue`：

```vue
<script setup lang="ts">
defineProps<{
  path: string;
  kind: 'number' | 'boolean' | 'json';
  def: unknown;
  value: unknown;
  effective: unknown;
  overridden: boolean;
  readOnly: boolean;
  error: boolean;
}>();
const emit = defineEmits<{ input: [e: Event]; reset: [] }>();
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
</script>

<template>
  <div class="row g-1 align-items-center small border-bottom py-1" :class="{ 'bg-warning-subtle': overridden }">
    <div class="col-12 col-md-4 text-break"><code>{{ path }}</code></div>
    <div class="col-5 col-md-3">
      <input
        v-if="kind === 'number'"
        type="number"
        step="any"
        class="form-control form-control-sm"
        :class="{ 'is-invalid': error }"
        :value="value"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('input', $event)"
      />
      <input
        v-else-if="kind === 'boolean'"
        type="checkbox"
        class="form-check-input"
        :checked="value === true"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('input', $event)"
      />
      <textarea
        v-else
        rows="1"
        class="form-control form-control-sm font-monospace"
        :class="{ 'is-invalid': error }"
        :value="show(value)"
        :disabled="readOnly"
        :data-testid="`setting-${path}`"
        @change="emit('input', $event)"
      ></textarea>
    </div>
    <div class="col-5 col-md-4 text-muted text-break">
      默认 {{ show(def) }} · 生效 <span :data-testid="`effective-${path}`">{{ show(effective) }}</span>
    </div>
    <div class="col-2 col-md-1 text-end">
      <button
        v-if="overridden && !readOnly"
        class="btn btn-link btn-sm p-0"
        :data-testid="`reset-${path}`"
        @click="emit('reset')"
      >
        恢复默认
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/views/admin/AdminShardView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ShardSettingsDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import SettingRow from '../../components/admin/SettingRow.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { getAt, groupOf, leafPaths, removeAt, setAt, type Tree } from '../../utils/settingsTree';

/** 常用项置顶（设计文档第 5 节） */
const PINNED = [
  'tuning.settlement.expMultiplier',
  'tuning.market.dailyStock',
  'tuning.market.dailyKinds',
  'tuning.market.specialKinds',
  'tuning.rest.atRateBase',
  'restaurant.coin',
  'restaurant.giftFoods',
];

const route = useRoute();
const admin = useAdminStore();
const toast = useToastStore();
const shardId = computed(() => Number(route.params.id));
const data = ref<ShardSettingsDto | null>(null);
const draft = ref<Tree>({});
const note = ref('');
const busy = ref(false);
const badInput = ref(new Set<string>());
const badServer = ref(new Set<string>());
const readOnly = computed(() => admin.me?.role !== 'admin');

async function load() {
  try {
    data.value = await adminApi.settings(shardId.value);
    draft.value = structuredClone(data.value.override) as Tree;
    badInput.value = new Set();
    badServer.value = new Set();
  } catch (e) {
    toast.push(errorMessage(e, '读取配置失败'), 'danger');
  }
}
watch(shardId, load, { immediate: true });

const defaults = computed<Tree>(() =>
  data.value ? { restaurant: data.value.defaults.restaurant, tuning: data.value.defaults.tuning } : {},
);
const paths = computed(() => leafPaths(defaults.value));
const pinned = computed(() => PINNED.filter((p) => paths.value.includes(p)));
const groups = computed(() => {
  const m = new Map<string, string[]>();
  for (const p of paths.value) {
    if (PINNED.includes(p)) continue;
    const g = groupOf(p);
    m.set(g, [...(m.get(g) ?? []), p]);
  }
  return [...m.entries()];
});

function kindOf(p: string): 'number' | 'boolean' | 'json' {
  const v = getAt(defaults.value, p);
  return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'json';
}
const current = (p: string) => {
  const o = getAt(draft.value, p);
  return o === undefined ? getAt(defaults.value, p) : o;
};
const rowProps = (p: string) => ({
  path: p,
  kind: kindOf(p),
  def: getAt(defaults.value, p),
  value: current(p),
  effective: getAt(data.value?.effective, p),
  overridden: getAt(draft.value, p) !== undefined,
  readOnly: readOnly.value,
  error: badInput.value.has(p) || badServer.value.has(p),
});

function mark(p: string, bad: boolean) {
  const s = new Set(badInput.value);
  if (bad) s.add(p);
  else s.delete(p);
  badInput.value = s;
}

function onInput(p: string, e: Event) {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  const kind = kindOf(p);
  let v: unknown;
  if (kind === 'number') {
    if (el.value === '' || !Number.isFinite(Number(el.value))) return mark(p, true);
    v = Number(el.value);
  } else if (kind === 'boolean') {
    v = (el as HTMLInputElement).checked;
  } else {
    try {
      v = JSON.parse(el.value);
    } catch {
      return mark(p, true);
    }
  }
  mark(p, false);
  draft.value = setAt(draft.value, p, v);
}

function reset(p: string) {
  mark(p, false);
  draft.value = removeAt(draft.value, p);
}

const featureOn = (name: string) => getAt(draft.value, `features.${name}`) !== false;
function setFeature(name: string, enabled: boolean) {
  draft.value = enabled ? removeAt(draft.value, `features.${name}`) : setAt(draft.value, `features.${name}`, false);
}

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(data.value?.override ?? {}));

async function save() {
  if (!data.value) return;
  busy.value = true;
  try {
    await adminApi.saveOverride(shardId.value, {
      override: draft.value,
      note: note.value.trim(),
      version: data.value.version,
    });
    toast.push('已保存，所有进程立即生效');
    note.value = '';
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '保存失败'), 'danger');
    if (e instanceof ApiError && e.code === 'INVALID_CONFIG') {
      const issues = (e.params.issues ?? []) as Array<{ path: string }>;
      badServer.value = new Set(issues.map((i) => i.path));
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data">
    <div class="d-flex align-items-center gap-2 mb-2">
      <h5 class="mb-0">区服数值</h5>
      <span class="small text-muted">版本 {{ data.version }}</span>
      <RouterLink :to="`/admin/shards/${shardId}/history`" class="small ms-auto">修改历史</RouterLink>
    </div>
    <p v-if="readOnly" class="small text-muted">你是协管，只能查看。</p>
    <h6>常用</h6>
    <SettingRow v-for="p in pinned" :key="p" v-bind="rowProps(p)" @input="onInput(p, $event)" @reset="reset(p)" />
    <h6 class="mt-3">功能开关</h6>
    <div class="d-flex flex-wrap gap-3 small">
      <label v-for="f in data.features" :key="f.name">
        <input
          type="checkbox"
          class="form-check-input me-1"
          :checked="featureOn(f.name)"
          :disabled="readOnly"
          :data-testid="`feature-${f.name}`"
          @change="setFeature(f.name, ($event.target as HTMLInputElement).checked)"
        />{{ f.name }}
      </label>
    </div>
    <details v-for="[g, ps] in groups" :key="g" class="mt-2">
      <summary>{{ g }}（{{ ps.length }}）</summary>
      <SettingRow v-for="p in ps" :key="p" v-bind="rowProps(p)" @input="onInput(p, $event)" @reset="reset(p)" />
    </details>
    <div v-if="!readOnly" class="sticky-bottom bg-white border-top py-2 mt-3 d-flex gap-2">
      <input v-model="note" class="form-control form-control-sm" placeholder="修改说明（必填）" data-testid="save-note" />
      <button
        class="btn btn-primary btn-sm text-nowrap"
        data-testid="save-settings"
        :disabled="busy || !dirty || !note.trim() || badInput.size > 0"
        @click="save"
      >
        保存
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/views/admin/AdminShardHistoryView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ShardHistoryDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

const route = useRoute();
const admin = useAdminStore();
const toast = useToastStore();
const shardId = computed(() => Number(route.params.id));
const rows = ref<ShardHistoryDto[]>([]);

async function load() {
  try {
    rows.value = await adminApi.history(shardId.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取历史失败'), 'danger');
  }
}
watch(shardId, load, { immediate: true });

async function rollback(version: number) {
  const note = window.prompt(`回滚到版本 ${version}，请填写说明`);
  if (!note?.trim()) return;
  try {
    const r = await adminApi.rollback(shardId.value, { version, note: note.trim() });
    toast.push(`已回滚，当前版本 ${r.version}`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '回滚失败'), 'danger');
  }
}
</script>

<template>
  <div class="d-flex align-items-center mb-2">
    <h5 class="mb-0">修改历史</h5>
    <RouterLink :to="`/admin/shards/${shardId}`" class="small ms-auto">返回数值</RouterLink>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr><th>版本</th><th>时间</th><th>操作人</th><th>说明</th><th>改动</th><th></th></tr>
    </thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="r.version">
        <td>{{ r.version }}</td>
        <td>{{ new Date(r.at).toLocaleString('zh-CN') }}</td>
        <td>{{ r.actor ?? '—' }}</td>
        <td>{{ r.note }}</td>
        <td class="text-break">{{ r.changed.join('、') || '（无）' }}</td>
        <td>
          <button
            v-if="admin.isAdmin && i > 0"
            class="btn btn-link btn-sm p-0"
            :data-testid="`rollback-${r.version}`"
            @click="rollback(r.version)"
          >
            回滚到此版
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

`apps/web/src/router.ts` 的 `/admin` children 改为：

```ts
    children: [
      { path: 'shards/:id', component: () => import('./views/admin/AdminShardView.vue') },
      { path: 'shards/:id/history', component: () => import('./views/admin/AdminShardHistoryView.vue') },
    ],
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): admin shard settings editor and history with rollback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 前端——玩家搜索和玩家详情

**Files:**
- Create: `apps/web/src/views/admin/AdminPlayersView.vue`、`AdminPlayersView.test.ts`
- Create: `apps/web/src/views/admin/AdminPlayerView.vue`、`AdminPlayerView.test.ts`
- Modify: `apps/web/src/router.ts`（children 加 `players`、`players/:id`）

**Interfaces:**
- Consumes: `adminApi.searchPlayers / player / restaurant / ledger / restLog / income / ban / unban / rename / setRole`；`useAdminStore`；`useCatalogStore`（名称）；`logText`（`utils/events`）
- Produces: 路由 `/admin/players`、`/admin/players/:id`

- [ ] **Step 1: 写测试**

`apps/web/src/views/admin/AdminPlayersView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import AdminPlayersView from './AdminPlayersView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { searchPlayers: vi.fn() } }));

describe('AdminPlayersView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('搜索后列出玩家和餐厅，链接到详情', async () => {
    vi.mocked(adminApi.searchPlayers).mockResolvedValue([
      {
        accountId: 7,
        username: 'alice',
        email: 'a@x',
        role: 'player',
        banned: true,
        restaurants: [{ id: 3, shardId: 1, shardName: '一服', name: '爱丽丝店', level: 12, star: 1, state: 1 }],
      },
    ]);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: AdminPlayersView }] });
    const w = mount(AdminPlayersView, { global: { plugins: [router] } });
    await w.find('[data-testid="player-q"]').setValue('ali');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.searchPlayers).toHaveBeenCalledWith('ali');
    expect(w.text()).toContain('爱丽丝店');
    expect(w.text()).toContain('已封禁');
    expect(w.find('a[href="/admin/players/7"]').exists()).toBe(true);
  });
});
```

`apps/web/src/views/admin/AdminPlayerView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { PlayerDetailDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminPlayerView from './AdminPlayerView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    player: vi.fn(),
    restaurant: vi.fn(),
    ledger: vi.fn(),
    restLog: vi.fn(),
    income: vi.fn(),
    ban: vi.fn(),
    unban: vi.fn(),
    rename: vi.fn(),
    setRole: vi.fn(),
  },
}));

const player: PlayerDetailDto = {
  accountId: 7,
  username: 'alice',
  email: 'a@x',
  role: 'player',
  banned: false,
  restaurants: [{ id: 3, shardId: 1, shardName: '一服', name: '爱丽丝店', level: 12, star: 1, state: 1 }],
  emailVerified: true,
  bannedAt: null,
  banReason: null,
  createdAt: '2026-09-01T00:00:00.000Z',
};

async function mountView(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/players/:id', component: AdminPlayerView }],
  });
  await router.push('/admin/players/7');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('AdminPlayerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.player).mockResolvedValue(structuredClone(player));
    vi.mocked(adminApi.restaurant).mockResolvedValue({
      overview: { id: 3, name: '爱丽丝店', level: 12, starLevel: 1, coin: 5000, diamond: 2, oil: 800, oilMax: 1000 } as never,
      store: [{ goodsId: 1, num: 3, expiresAt: null }],
      cupboard: [{ foodsId: 101, num: 4, fridgeNum: 1, locked: false }],
    });
    vi.mocked(adminApi.ledger).mockResolvedValue({
      items: [{ kind: 'coin', itemId: null, delta: 500, source: 'admin.grant', at: '2026-09-30T00:00:00.000Z' }],
      nextBefore: null,
    });
    vi.mocked(adminApi.ban).mockResolvedValue({ banned: true });
  });

  it('显示账号、餐厅和流水', async () => {
    const w = await mountView('mod');
    expect(w.text()).toContain('alice');
    expect(w.text()).toContain('爱丽丝店');
    expect(adminApi.ledger).toHaveBeenCalledWith(3, { kind: undefined, source: undefined, before: undefined });
    expect(w.text()).toContain('admin.grant');
  });

  it('封号要填原因；协管看不到改角色', async () => {
    const w = await mountView('mod');
    expect(w.find('[data-testid="role-select"]').exists()).toBe(false);
    expect(w.find('[data-testid="ban"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="ban-reason"]').setValue('刷分');
    await w.find('[data-testid="ban"]').trigger('click');
    await flushPromises();
    expect(adminApi.ban).toHaveBeenCalledWith(7, '刷分');
    expect(adminApi.player).toHaveBeenCalledTimes(2);
  });

  it('管理员可以改角色', async () => {
    vi.mocked(adminApi.setRole).mockResolvedValue({ role: 'mod' });
    const w = await mountView('admin');
    await w.find('[data-testid="role-select"]').setValue('mod');
    await flushPromises();
    expect(adminApi.setRole).toHaveBeenCalledWith(7, 'mod');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/src/views/admin/AdminPlayersView.test.ts apps/web/src/views/admin/AdminPlayerView.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`apps/web/src/views/admin/AdminPlayersView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { PlayerBriefDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';

const toast = useToastStore();
const q = ref('');
const rows = ref<PlayerBriefDto[] | null>(null);
const busy = ref(false);
const ROLE: Record<string, string> = { player: '玩家', mod: '协管', admin: '管理员' };

async function search() {
  if (!q.value.trim()) return;
  busy.value = true;
  try {
    rows.value = await adminApi.searchPlayers(q.value.trim());
  } catch (e) {
    toast.push(errorMessage(e, '搜索失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h5>玩家</h5>
  <form class="d-flex gap-2 mb-2" @submit.prevent="search">
    <input v-model="q" class="form-control form-control-sm" placeholder="用户名 / 邮箱 / 店名 / 账号 id" data-testid="player-q" />
    <button class="btn btn-primary btn-sm text-nowrap" :disabled="busy">搜索</button>
  </form>
  <p v-if="rows && rows.length === 0" class="small text-muted">没有找到。</p>
  <table v-if="rows && rows.length > 0" class="table table-sm small">
    <thead>
      <tr><th>账号</th><th>用户名</th><th>邮箱</th><th>角色</th><th>状态</th><th>餐厅</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.accountId">
        <td><RouterLink :to="`/admin/players/${r.accountId}`">{{ r.accountId }}</RouterLink></td>
        <td>{{ r.username }}</td>
        <td>{{ r.email }}</td>
        <td>{{ ROLE[r.role] }}</td>
        <td :class="{ 'text-danger': r.banned }">{{ r.banned ? '已封禁' : '正常' }}</td>
        <td>
          <div v-for="s in r.restaurants" :key="s.id">
            {{ s.shardName }} · {{ s.name }} · {{ s.level }} 级 {{ s.star }} 星{{ s.state === 2 ? ' · 停业' : '' }}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

`apps/web/src/views/admin/AdminPlayerView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type {
  AccountRole,
  AdminLedgerRowDto,
  AdminRestaurantDto,
  PlayerDetailDto,
  RoundSummaryDto,
  RestLogDto,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { logText } from '../../utils/events';

const route = useRoute();
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const id = computed(() => Number(route.params.id));
const player = ref<PlayerDetailDto | null>(null);
const restId = ref<number | null>(null);
const rest = ref<AdminRestaurantDto | null>(null);
const tab = ref<'ledger' | 'log' | 'income'>('ledger');
const kind = ref('');
const source = ref('');
const ledgerRows = ref<AdminLedgerRowDto[]>([]);
const logRows = ref<RestLogDto[]>([]);
const incomeRows = ref<RoundSummaryDto[]>([]);
const next = ref<string | null>(null);
const banReason = ref('');
const renameName = ref('');
const renameReason = ref('');
const busy = ref(false);
const ROLE: Record<AccountRole, string> = { player: '玩家', mod: '协管', admin: '管理员' };

async function run(fn: () => Promise<unknown>, fail: string, done?: string) {
  busy.value = true;
  try {
    await fn();
    if (done) toast.push(done);
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}

async function loadTab(reset: boolean) {
  if (restId.value === null) return;
  const before = reset ? undefined : (next.value ?? undefined);
  if (tab.value === 'ledger') {
    const p = await adminApi.ledger(restId.value, {
      kind: kind.value || undefined,
      source: source.value || undefined,
      before,
    });
    ledgerRows.value = reset ? p.items : [...ledgerRows.value, ...p.items];
    next.value = p.nextBefore;
  } else if (tab.value === 'log') {
    const p = await adminApi.restLog(restId.value, before);
    logRows.value = reset ? p.items : [...logRows.value, ...p.items];
    next.value = p.nextBefore;
  } else {
    const p = await adminApi.income(restId.value, before);
    incomeRows.value = reset ? p.items : [...incomeRows.value, ...p.items];
    next.value = p.nextBefore;
  }
}

async function loadRest() {
  if (restId.value === null) return;
  rest.value = await adminApi.restaurant(restId.value);
  await loadTab(true);
}

async function load() {
  await run(async () => {
    player.value = await adminApi.player(id.value);
    restId.value ??= player.value.restaurants[0]?.id ?? null;
    await loadRest();
  }, '读取玩家失败');
}
watch(id, load, { immediate: true });
watch(tab, () => void loadTab(true));

const ban = () =>
  run(async () => {
    await adminApi.ban(id.value, banReason.value.trim());
    banReason.value = '';
    await load();
  }, '封号失败', '已封号');
const unban = () =>
  run(async () => {
    await adminApi.unban(id.value);
    await load();
  }, '解封失败', '已解封');
const changeRole = (role: AccountRole) =>
  run(async () => {
    await adminApi.setRole(id.value, role);
    await load();
  }, '修改角色失败', '已修改角色');
const rename = () =>
  run(async () => {
    await adminApi.rename(restId.value!, renameName.value.trim(), renameReason.value.trim());
    renameName.value = '';
    renameReason.value = '';
    await load();
  }, '改名失败', '已改名');
</script>

<template>
  <div v-if="player">
    <h5>{{ player.username }} <small class="text-muted">#{{ player.accountId }} · {{ ROLE[player.role] }}</small></h5>
    <div class="small mb-2">
      {{ player.email }}（{{ player.emailVerified ? '已验证' : '未验证' }}） · 注册于
      {{ new Date(player.createdAt).toLocaleString('zh-CN') }}
      <span v-if="player.banned" class="text-danger"> · 已封禁：{{ player.banReason }}</span>
    </div>

    <div class="d-flex flex-wrap gap-2 mb-3">
      <template v-if="!player.banned">
        <input v-model="banReason" class="form-control form-control-sm w-auto" placeholder="封号原因" data-testid="ban-reason" />
        <button class="btn btn-outline-danger btn-sm" data-testid="ban" :disabled="busy || !banReason.trim()" @click="ban">
          封号
        </button>
      </template>
      <button v-else class="btn btn-outline-success btn-sm" data-testid="unban" :disabled="busy" @click="unban">解封</button>
      <select
        v-if="admin.isAdmin && admin.me?.accountId !== player.accountId"
        class="form-select form-select-sm w-auto"
        data-testid="role-select"
        :value="player.role"
        @change="changeRole(($event.target as HTMLSelectElement).value as AccountRole)"
      >
        <option v-for="(label, r) in ROLE" :key="r" :value="r">{{ label }}</option>
      </select>
    </div>

    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        v-for="s in player.restaurants"
        :key="s.id"
        class="btn btn-sm"
        :class="s.id === restId ? 'btn-primary' : 'btn-outline-primary'"
        @click="
          restId = s.id;
          void loadRest();
        "
      >
        {{ s.shardName }} · {{ s.name }}
      </button>
    </div>

    <div v-if="rest" class="small">
      <div class="mb-2">
        {{ rest.overview.name }} · {{ rest.overview.level }} 级 {{ rest.overview.starLevel }} 星 · 银币
        {{ rest.overview.coin }} · 钻石 {{ rest.overview.diamond }} · 油 {{ rest.overview.oil }}/{{ rest.overview.oilMax }}
      </div>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <input v-model="renameName" class="form-control form-control-sm w-auto" placeholder="新店名" />
        <input v-model="renameReason" class="form-control form-control-sm w-auto" placeholder="改名原因" />
        <button class="btn btn-outline-secondary btn-sm" :disabled="busy || !renameName.trim() || !renameReason.trim()" @click="rename">
          强制改名
        </button>
      </div>
      <div class="row">
        <div class="col-md-6">
          <h6>仓库</h6>
          <div v-for="g in rest.store" :key="g.goodsId">{{ catalog.goodsName(g.goodsId) }} ×{{ g.num }}</div>
        </div>
        <div class="col-md-6">
          <h6>橱柜 / 冰箱</h6>
          <div v-for="f in rest.cupboard" :key="f.foodsId">
            {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}<span v-if="f.fridgeNum"> · 冰箱 {{ f.fridgeNum }}</span>
          </div>
        </div>
      </div>

      <ul class="nav nav-tabs mt-3">
        <li v-for="t in [['ledger', '流水'], ['log', '个人日志'], ['income', '收益']] as const" :key="t[0]" class="nav-item">
          <a href="#" class="nav-link" :class="{ active: tab === t[0] }" @click.prevent="tab = t[0]">{{ t[1] }}</a>
        </li>
      </ul>
      <div v-if="tab === 'ledger'" class="d-flex gap-2 my-2">
        <input v-model="kind" class="form-control form-control-sm w-auto" placeholder="类型（coin / goods …）" />
        <input v-model="source" class="form-control form-control-sm w-auto" placeholder="来源（market.buy …）" />
        <button class="btn btn-sm btn-outline-secondary" @click="loadTab(true)">筛选</button>
      </div>
      <table v-if="tab === 'ledger'" class="table table-sm">
        <tbody>
          <tr v-for="(l, i) in ledgerRows" :key="i">
            <td>{{ new Date(l.at).toLocaleString('zh-CN') }}</td>
            <td>{{ l.kind }}{{ l.itemId ? ` #${l.itemId}` : '' }}</td>
            <td :class="l.delta < 0 ? 'text-danger' : 'text-success'">{{ l.delta }}</td>
            <td>{{ l.source }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="tab === 'log'">
        <div v-for="(l, i) in logRows" :key="i">
          <span class="text-muted">{{ new Date(l.at).toLocaleString('zh-CN') }}</span> {{ logText(l, catalog) }}
        </div>
      </div>
      <table v-if="tab === 'income'" class="table table-sm">
        <tbody>
          <tr v-for="r in incomeRows" :key="r.roundNo">
            <td>{{ new Date(r.at).toLocaleString('zh-CN') }}</td>
            <td>银币 {{ r.coin }}</td>
            <td>经验 {{ r.exp }}</td>
            <td>油 {{ r.oil }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="next" class="btn btn-link btn-sm" @click="loadTab(false)">加载更多</button>
    </div>
  </div>
</template>
```

`apps/web/src/router.ts` 的 `/admin` children 追加：

```ts
      { path: 'players', component: () => import('./views/admin/AdminPlayersView.vue') },
      { path: 'players/:id', component: () => import('./views/admin/AdminPlayerView.vue') },
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): admin player search and detail with ban, roles, rename, ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 前端——发放补偿

**Files:**
- Create: `apps/web/src/views/admin/AdminGrantsView.vue`、`AdminGrantsView.test.ts`
- Modify: `apps/web/src/router.ts`（children 加 `grants`）

**Interfaces:**
- Consumes: `adminApi.grantPreview / createGrant / grants`；`useAdminStore`（`shardId`、`isAdmin`）；`useCatalogStore`（名称）
- Produces: 路由 `/admin/grants`

- [ ] **Step 1: 写测试**

`apps/web/src/views/admin/AdminGrantsView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrantDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminGrantsView from './AdminGrantsView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { grantPreview: vi.fn(), createGrant: vi.fn(), grants: vi.fn() } }));

const done: GrantDto = {
  id: 1,
  shardId: 1,
  target: 'rest',
  restId: 3,
  minLevel: null,
  items: { coin: 500 },
  reason: '补偿',
  status: 'done',
  total: 1,
  doneCount: 1,
  failedCount: 0,
  actor: 'boss',
  createdAt: '2026-09-30T00:00:00.000Z',
  finishedAt: '2026-09-30T00:00:00.000Z',
};

function setup(role: 'mod' | 'admin') {
  const admin = useAdminStore();
  admin.me = { accountId: 1, username: 'boss', role };
  admin.shardId = 1;
  return mount(AdminGrantsView);
}

describe('AdminGrantsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.grants).mockResolvedValue([done]);
    vi.mocked(adminApi.createGrant).mockResolvedValue(done);
  });

  it('单店：只提交填了的内容', async () => {
    const w = setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-rest"]').setValue('3');
    await w.find('[data-testid="grant-coin"]').setValue('500');
    await w.find('[data-testid="grant-add-goods"]').trigger('click');
    await w.find('[data-testid="grant-goods-id-0"]').setValue('1');
    await w.find('[data-testid="grant-goods-num-0"]').setValue('2');
    await w.find('[data-testid="grant-reason"]').setValue('补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith({
      shardId: 1,
      target: 'rest',
      restId: 3,
      items: { coin: 500, goods: [{ id: 1, num: 2 }] },
      reason: '补偿',
    });
  });

  it('全区服：先预览人数并确认，取消就不发', async () => {
    vi.mocked(adminApi.grantPreview).mockResolvedValue({ count: 42 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-target-shard"]').setValue(true);
    await w.find('[data-testid="grant-min-level"]').setValue('10');
    await w.find('[data-testid="grant-coin"]').setValue('100');
    await w.find('[data-testid="grant-reason"]').setValue('全服补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.grantPreview).toHaveBeenCalledWith(1, 10);
    expect(confirm.mock.calls[0]![0]).toContain('42');
    expect(adminApi.createGrant).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith(expect.objectContaining({ target: 'shard', minLevel: 10 }));
    confirm.mockRestore();
  });

  it('协管只能看记录', async () => {
    const w = setup('mod');
    await flushPromises();
    expect(w.find('form').exists()).toBe(false);
    expect(w.text()).toContain('补偿');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/src/views/admin/AdminGrantsView.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`apps/web/src/views/admin/AdminGrantsView.vue`：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { GrantDto, GrantItems } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();

const target = ref<'rest' | 'shard'>('rest');
const restId = ref<number | ''>('');
const minLevel = ref<number | ''>('');
const coin = ref<number | ''>('');
const diamond = ref<number | ''>('');
const exp = ref<number | ''>('');
const goods = ref<Array<{ id: number | ''; num: number | '' }>>([]);
const foods = ref<Array<{ id: number | ''; num: number | '' }>>([]);
const reason = ref('');
const busy = ref(false);
const list = ref<GrantDto[]>([]);
const STATUS: Record<GrantDto['status'], string> = { pending: '排队中', running: '发放中', done: '完成', failed: '有失败' };

function items(): GrantItems {
  const out: GrantItems = {};
  if (coin.value) out.coin = Number(coin.value);
  if (diamond.value) out.diamond = Number(diamond.value);
  if (exp.value) out.exp = Number(exp.value);
  const lines = (rows: Array<{ id: number | ''; num: number | '' }>) =>
    rows.filter((r) => r.id && r.num).map((r) => ({ id: Number(r.id), num: Number(r.num) }));
  if (lines(goods.value).length > 0) out.goods = lines(goods.value);
  if (lines(foods.value).length > 0) out.foods = lines(foods.value);
  return out;
}

function summary(i: GrantItems): string {
  const parts: string[] = [];
  if (i.coin) parts.push(`银币 ${i.coin}`);
  if (i.diamond) parts.push(`钻石 ${i.diamond}`);
  if (i.exp) parts.push(`经验 ${i.exp}`);
  for (const g of i.goods ?? []) parts.push(`${catalog.goodsName(g.id)}×${g.num}`);
  for (const f of i.foods ?? []) parts.push(`${catalog.foodName(f.id)}×${f.num}`);
  return parts.join('、');
}

async function loadList() {
  try {
    list.value = await adminApi.grants(admin.shardId ?? undefined);
  } catch (e) {
    toast.push(errorMessage(e, '读取记录失败'), 'danger');
  }
}

async function submit() {
  const shardId = admin.shardId;
  if (!shardId) return;
  busy.value = true;
  try {
    if (target.value === 'shard') {
      const { count } = await adminApi.grantPreview(shardId, minLevel.value ? Number(minLevel.value) : undefined);
      if (!window.confirm(`将发给 ${count} 家店：${summary(items())}。确定吗？`)) return;
    }
    const g = await adminApi.createGrant({
      shardId,
      target: target.value,
      ...(target.value === 'rest' ? { restId: Number(restId.value) } : {}),
      ...(target.value === 'shard' && minLevel.value ? { minLevel: Number(minLevel.value) } : {}),
      items: items(),
      reason: reason.value.trim(),
    });
    toast.push(g.status === 'done' ? '已到账' : '已排队，worker 会分批发放');
    coin.value = diamond.value = exp.value = '';
    goods.value = [];
    foods.value = [];
    reason.value = '';
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '发放失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void loadList();
  timer = setInterval(() => {
    if (list.value.some((g) => g.status === 'pending' || g.status === 'running')) void loadList();
  }, 5000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
watch(() => admin.shardId, loadList);
</script>

<template>
  <h5>发放补偿</h5>
  <p v-if="!admin.isAdmin" class="small text-muted">只有管理员能发放，你可以查看记录。</p>
  <form v-else class="small border rounded p-2 mb-3" @submit.prevent="submit">
    <div class="d-flex flex-wrap gap-3 mb-2">
      <label><input v-model="target" type="radio" value="rest" data-testid="grant-target-rest" /> 单家餐厅</label>
      <label><input v-model="target" type="radio" value="shard" data-testid="grant-target-shard" /> 当前区服所有餐厅</label>
      <input
        v-if="target === 'rest'"
        v-model.number="restId"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="餐厅 id"
        data-testid="grant-rest"
      />
      <input
        v-else
        v-model.number="minLevel"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="最低等级（可空）"
        data-testid="grant-min-level"
      />
    </div>
    <div class="d-flex flex-wrap gap-2 mb-2">
      <input v-model.number="coin" type="number" class="form-control form-control-sm w-auto" placeholder="银币" data-testid="grant-coin" />
      <input v-model.number="diamond" type="number" class="form-control form-control-sm w-auto" placeholder="钻石" />
      <input v-model.number="exp" type="number" class="form-control form-control-sm w-auto" placeholder="经验" />
    </div>
    <div v-for="(g, i) in goods" :key="`g${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <input v-model.number="g.id" type="number" class="form-control form-control-sm w-auto" placeholder="道具 id" :data-testid="`grant-goods-id-${i}`" />
      <input v-model.number="g.num" type="number" class="form-control form-control-sm w-auto" placeholder="数量" :data-testid="`grant-goods-num-${i}`" />
      <span class="text-muted">{{ g.id ? catalog.goodsName(Number(g.id)) : '' }}</span>
    </div>
    <div v-for="(f, i) in foods" :key="`f${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <input v-model.number="f.id" type="number" class="form-control form-control-sm w-auto" placeholder="食材 id" />
      <input v-model.number="f.num" type="number" class="form-control form-control-sm w-auto" placeholder="数量" />
      <span class="text-muted">{{ f.id ? catalog.foodName(Number(f.id)) : '' }}</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button type="button" class="btn btn-link btn-sm p-0" data-testid="grant-add-goods" @click="goods.push({ id: '', num: 1 })">
        + 道具
      </button>
      <button type="button" class="btn btn-link btn-sm p-0" @click="foods.push({ id: '', num: 1 })">+ 食材</button>
    </div>
    <div class="d-flex gap-2">
      <input v-model="reason" class="form-control form-control-sm" placeholder="原因（玩家日志里能看到）" data-testid="grant-reason" />
      <button class="btn btn-primary btn-sm text-nowrap" :disabled="busy || !reason.trim()">发放</button>
    </div>
  </form>

  <table class="table table-sm small">
    <thead>
      <tr><th>#</th><th>对象</th><th>内容</th><th>原因</th><th>状态</th><th>进度</th><th>操作人</th><th>时间</th></tr>
    </thead>
    <tbody>
      <tr v-for="g in list" :key="g.id">
        <td>{{ g.id }}</td>
        <td>{{ g.target === 'rest' ? `餐厅 ${g.restId}` : `全区服${g.minLevel ? `（≥${g.minLevel} 级）` : ''}` }}</td>
        <td>{{ summary(g.items) }}</td>
        <td>{{ g.reason }}</td>
        <td :class="{ 'text-danger': g.status === 'failed' }">{{ STATUS[g.status] }}</td>
        <td>{{ g.doneCount }}/{{ g.total }}<span v-if="g.failedCount" class="text-danger">（失败 {{ g.failedCount }}）</span></td>
        <td>{{ g.actor ?? '—' }}</td>
        <td>{{ new Date(g.createdAt).toLocaleString('zh-CN') }}</td>
      </tr>
    </tbody>
  </table>
</template>
```

`apps/web/src/router.ts` 的 `/admin` children 追加：

```ts
      { path: 'grants', component: () => import('./views/admin/AdminGrantsView.vue') },
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): admin compensation form with shard-wide confirmation and progress list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 前端——概览、统计、审计

**Files:**
- Create: `apps/web/src/views/admin/AdminHomeView.vue`、`AdminHomeView.test.ts`
- Create: `apps/web/src/views/admin/AdminStatsView.vue`、`AdminStatsView.test.ts`
- Create: `apps/web/src/views/admin/AdminAuditView.vue`、`AdminAuditView.test.ts`
- Create: `apps/web/src/utils/adminLabels.ts`
- Modify: `apps/web/src/router.ts`（children 加 `''`、`stats`、`audit`）

**Interfaces:**
- Consumes: `adminApi.economy / distribution / settlementRounds / audit`；`LineChart`、`BarChart`；`gameDay`、`addDays`（`@dt/shared`）
- Produces: 路由 `/admin`（概览）、`/admin/stats`、`/admin/audit`；`ACTION_LABEL: Record<string, string>`（`utils/adminLabels.ts`，端到端用例找"修改区服数值"）

- [ ] **Step 1: 写测试**

`apps/web/src/views/admin/AdminHomeView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminHomeView from './AdminHomeView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { economy: vi.fn(), settlementRounds: vi.fn() } }));

describe('AdminHomeView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('今日活跃、结算银币经验、最近一轮耗时', async () => {
    useAdminStore().shardId = 1;
    vi.mocked(adminApi.economy).mockResolvedValue([
      { day: 'd', kind: 'active', source: 'rest', amount: 12 },
      { day: 'd', kind: 'coin', source: 'settlement', amount: 34567 },
      { day: 'd', kind: 'exp', source: 'settlement', amount: 890 },
    ]);
    vi.mocked(adminApi.settlementRounds).mockResolvedValue([
      { round: 9, at: '2026-09-30T00:00:00.000Z', ms: 123, settled: 12, closed: 0, failed: 1 },
    ]);
    const w = mount(AdminHomeView);
    await flushPromises();
    expect(w.find('[data-testid="home-active"]').text()).toContain('12');
    expect(w.find('[data-testid="home-coin"]').text()).toContain('34,567');
    expect(w.find('[data-testid="home-round"]').text()).toContain('123');
    expect(w.find('[data-testid="home-round"]').text()).toContain('失败 1');
  });
});
```

`apps/web/src/views/admin/AdminStatsView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminStatsView from './AdminStatsView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { economy: vi.fn(), distribution: vi.fn(), settlementRounds: vi.fn() } }));

describe('AdminStatsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('经济按来源画线，分布画柱', async () => {
    useAdminStore().shardId = 1;
    vi.mocked(adminApi.economy).mockResolvedValue([
      { day: '2026-09-29', kind: 'coin', source: 'settlement', amount: 100 },
      { day: '2026-09-30', kind: 'coin', source: 'settlement', amount: 120 },
      { day: '2026-09-30', kind: 'coin', source: 'market.buy', amount: -80 },
      { day: '2026-09-30', kind: 'exp', source: 'settlement', amount: 50 },
    ]);
    vi.mocked(adminApi.distribution).mockResolvedValue({
      open: 2,
      closed: 1,
      levels: [{ from: 1, to: 9, count: 2 }, { from: 10, to: 19, count: 1 }],
      stars: [{ star: 0, count: 3 }],
      cookbooks: [{ from: 0, to: 19, count: 3 }],
    });
    vi.mocked(adminApi.settlementRounds).mockResolvedValue([]);
    const w = mount(AdminStatsView);
    await flushPromises();
    const eco = w.find('[data-testid="economy-chart"]');
    expect(eco.findAll('[data-testid="series"]')).toHaveLength(2);
    expect(w.find('[data-testid="levels-chart"]').findAll('[data-testid="bar"]')).toHaveLength(2);
  });
});
```

`apps/web/src/views/admin/AdminAuditView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import AdminAuditView from './AdminAuditView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { audit: vi.fn() } }));

describe('AdminAuditView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('动作显示中文，命令行操作人显示"命令行"，可以加载更多', async () => {
    vi.mocked(adminApi.audit)
      .mockResolvedValueOnce({
        items: [
          { id: 2, actor: 'boss', action: 'shard.override', target: 'shard:1', detail: { note: '加速' }, ip: '1.1.1.1', at: '2026-09-30T00:00:00.000Z' },
        ],
        nextBefore: 'c1',
      })
      .mockResolvedValueOnce({
        items: [{ id: 1, actor: null, action: 'player.role', target: 'account:1', detail: {}, ip: null, at: '2026-09-29T00:00:00.000Z' }],
        nextBefore: null,
      });
    const w = mount(AdminAuditView);
    await flushPromises();
    expect(w.text()).toContain('修改区服数值');
    await w.find('[data-testid="audit-more"]').trigger('click');
    await flushPromises();
    expect(adminApi.audit).toHaveBeenLastCalledWith({ actor: undefined, action: undefined, before: 'c1' });
    expect(w.text()).toContain('命令行');
    expect(w.find('[data-testid="audit-more"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm exec vitest run apps/web/src/views/admin`
Expected: FAIL（三个视图不存在）

- [ ] **Step 3: 实现**

`apps/web/src/views/admin/AdminHomeView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { gameDay, type EconomyRowDto, type SettlementRoundDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const admin = useAdminStore();
const toast = useToastStore();
const rows = ref<EconomyRowDto[]>([]);
const last = ref<SettlementRoundDto | null>(null);

async function load() {
  if (!admin.shardId) return;
  const today = gameDay();
  try {
    const [eco, rounds] = await Promise.all([
      adminApi.economy(admin.shardId, today, today),
      adminApi.settlementRounds(admin.shardId, 1),
    ]);
    rows.value = eco;
    last.value = rounds.at(-1) ?? null;
  } catch (e) {
    toast.push(errorMessage(e, '读取概览失败'), 'danger');
  }
}
watch(() => admin.shardId, load, { immediate: true });

const sum = (kind: string, source?: string) =>
  rows.value.filter((r) => r.kind === kind && (!source || r.source === source)).reduce((s, r) => s + r.amount, 0);
const active = computed(() => sum('active'));
const coin = computed(() => sum('coin', 'settlement'));
const exp = computed(() => sum('exp', 'settlement'));
</script>

<template>
  <h5>今日概览</h5>
  <div class="row g-2 small">
    <div class="col-6 col-md-3"><div class="border rounded p-2" data-testid="home-active">活跃店<br /><b>{{ formatNum(active) }}</b></div></div>
    <div class="col-6 col-md-3"><div class="border rounded p-2" data-testid="home-coin">结算银币<br /><b>{{ formatNum(coin) }}</b></div></div>
    <div class="col-6 col-md-3"><div class="border rounded p-2" data-testid="home-exp">结算经验<br /><b>{{ formatNum(exp) }}</b></div></div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-2" data-testid="home-round">
        最近一轮结算<br />
        <b v-if="last">{{ last.ms }} ms · {{ last.settled }} 店 · 失败 {{ last.failed }}</b><b v-else>暂无</b>
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/views/admin/AdminStatsView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { addDays, gameDay, type DistributionDto, type EconomyRowDto, type SettlementRoundDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import BarChart from '../../components/admin/BarChart.vue';
import LineChart from '../../components/admin/LineChart.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

const admin = useAdminStore();
const toast = useToastStore();
const to = ref(gameDay());
const from = ref(addDays(to.value, -13));
const kind = ref<'coin' | 'exp' | 'diamond' | 'active'>('coin');
const rows = ref<EconomyRowDto[]>([]);
const dist = ref<DistributionDto | null>(null);
const rounds = ref<SettlementRoundDto[]>([]);
const KINDS = { coin: '银币', exp: '经验', diamond: '钻石', active: '活跃店' } as const;

async function load() {
  if (!admin.shardId) return;
  try {
    [rows.value, dist.value, rounds.value] = await Promise.all([
      adminApi.economy(admin.shardId, from.value, to.value),
      adminApi.distribution(admin.shardId),
      adminApi.settlementRounds(admin.shardId, 90),
    ]);
  } catch (e) {
    toast.push(errorMessage(e, '读取统计失败'), 'danger');
  }
}
watch(() => admin.shardId, load, { immediate: true });

const days = computed(() => {
  const out: string[] = [];
  for (let d = from.value; d <= to.value && out.length < 90; d = addDays(d, 1)) out.push(d);
  return out;
});
/** 选中资源按来源画线：取绝对值最大的 6 个来源，其余并入"其他" */
const economySeries = computed(() => {
  const picked = rows.value.filter((r) => r.kind === kind.value);
  const weight = new Map<string, number>();
  for (const r of picked) weight.set(r.source, (weight.get(r.source) ?? 0) + Math.abs(r.amount));
  const top = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
  const names = weight.size > top.length ? [...top, '其他'] : top;
  return names.map((name) => ({
    name,
    values: days.value.map((d) =>
      picked
        .filter((r) => r.day === d && (name === '其他' ? !top.includes(r.source) : r.source === name))
        .reduce((s, r) => s + r.amount, 0),
    ),
  }));
});
const levelBars = computed(() => (dist.value?.levels ?? []).map((b) => ({ label: `${b.from}-${b.to}`, value: b.count })));
const starBars = computed(() => (dist.value?.stars ?? []).map((s) => ({ label: `${s.star} 星`, value: s.count })));
const cookbookBars = computed(() => (dist.value?.cookbooks ?? []).map((b) => ({ label: `${b.from}-${b.to}`, value: b.count })));
const roundSeries = computed(() => [{ name: '结算耗时（ms）', values: rounds.value.map((r) => r.ms) }]);
</script>

<template>
  <h5>统计</h5>
  <div class="d-flex flex-wrap gap-2 small mb-2">
    <input v-model="from" type="date" class="form-control form-control-sm w-auto" />
    <input v-model="to" type="date" class="form-control form-control-sm w-auto" />
    <select v-model="kind" class="form-select form-select-sm w-auto">
      <option v-for="(label, k) in KINDS" :key="k" :value="k">{{ label }}</option>
    </select>
    <button class="btn btn-sm btn-outline-primary" @click="load">刷新</button>
  </div>
  <h6>每日{{ KINDS[kind] }}（按来源，正数流入、负数流出）</h6>
  <div data-testid="economy-chart"><LineChart :labels="days" :series="economySeries" /></div>
  <div v-if="dist" class="row mt-3">
    <div class="col-md-4" data-testid="levels-chart">
      <h6>等级分布</h6>
      <BarChart :bars="levelBars" />
    </div>
    <div class="col-md-4">
      <h6>星级分布</h6>
      <BarChart :bars="starBars" />
    </div>
    <div class="col-md-4">
      <h6>已学食谱</h6>
      <BarChart :bars="cookbookBars" />
    </div>
    <p class="small text-muted">营业 {{ dist.open }} 家，停业 {{ dist.closed }} 家</p>
  </div>
  <h6 class="mt-3">最近 {{ rounds.length }} 轮结算耗时</h6>
  <LineChart :labels="rounds.map((r) => String(r.round))" :series="roundSeries" />
</template>
```

`apps/web/src/utils/adminLabels.ts`：

```ts
/** 审计动作的中文名 */
export const ACTION_LABEL: Record<string, string> = {
  'shard.override': '修改区服数值',
  'shard.rollback': '回滚区服数值',
  'player.ban': '封号',
  'player.unban': '解封',
  'player.role': '修改角色',
  'restaurant.rename': '强制改名',
  'grant.create': '发放补偿',
};
```

`apps/web/src/views/admin/AdminAuditView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AuditRowDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { ACTION_LABEL } from '../../utils/adminLabels';

const toast = useToastStore();
const actor = ref('');
const action = ref('');
const rows = ref<AuditRowDto[]>([]);
const next = ref<string | null>(null);

async function load(reset: boolean) {
  try {
    const p = await adminApi.audit({
      actor: actor.value.trim() || undefined,
      action: action.value.trim() || undefined,
      before: reset ? undefined : (next.value ?? undefined),
    });
    rows.value = reset ? p.items : [...rows.value, ...p.items];
    next.value = p.nextBefore;
  } catch (e) {
    toast.push(errorMessage(e, '读取审计日志失败'), 'danger');
  }
}
onMounted(() => void load(true));
</script>

<template>
  <h5>审计日志</h5>
  <form class="d-flex gap-2 mb-2" @submit.prevent="load(true)">
    <input v-model="actor" class="form-control form-control-sm w-auto" placeholder="操作人用户名" />
    <select v-model="action" class="form-select form-select-sm w-auto">
      <option value="">全部动作</option>
      <option v-for="(label, a) in ACTION_LABEL" :key="a" :value="a">{{ label }}</option>
    </select>
    <button class="btn btn-sm btn-outline-primary">筛选</button>
  </form>
  <table class="table table-sm small">
    <thead>
      <tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th><th>IP</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id">
        <td>{{ new Date(r.at).toLocaleString('zh-CN') }}</td>
        <td>{{ r.actor ?? '命令行' }}</td>
        <td>{{ ACTION_LABEL[r.action] ?? r.action }}</td>
        <td>{{ r.target }}</td>
        <td class="text-break font-monospace">{{ JSON.stringify(r.detail) }}</td>
        <td>{{ r.ip ?? '—' }}</td>
      </tr>
    </tbody>
  </table>
  <button v-if="next" class="btn btn-link btn-sm" data-testid="audit-more" @click="load(false)">加载更多</button>
</template>
```

`apps/web/src/router.ts` 的 `/admin` children 追加：

```ts
      { path: '', component: () => import('./views/admin/AdminHomeView.vue') },
      { path: 'stats', component: () => import('./views/admin/AdminStatsView.vue') },
      { path: 'audit', component: () => import('./views/admin/AdminAuditView.vue') },
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm exec vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): admin overview, economy/distribution/settlement charts, audit log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 端到端、部署文档、全量检查

**Files:**
- Modify: `apps/web/e2e/helpers.ts`（`registerAndOpen` 返回 `{ username, name }`）
- Create: `apps/web/e2e/admin.spec.ts`
- Modify: `docs/deploy.md`、`README.md`

**Interfaces:**
- Consumes: Task 9 的 testid；Task 12 的 `ACTION_LABEL`；Task 2 的命令行
- Produces: 端到端用例"后台"；部署说明

- [ ] **Step 1: 改辅助函数，写端到端用例**

`apps/web/e2e/helpers.ts`：`registerAndOpen` 的返回类型改为 `Promise<{ username: string; name: string }>`，最后 `return { username, name };`（`business.spec.ts` 不使用返回值，不用改）。

`apps/web/e2e/admin.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';
const PATH = 'tuning.settlement.expMultiplier';

test('后台：设为管理员 → 改经验倍率并立即生效 → 审计里有记录 → 恢复默认', async ({ page, request }) => {
  const { username } = await registerAndOpen(page, request);
  // 等同于 pnpm --filter @dt/server account role <用户名> admin
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
  } finally {
    await client.end();
  }

  await page.goto('/admin/shards/1');
  const input = page.getByTestId(`setting-${PATH}`);
  await expect(input).toBeVisible();
  const before = (await page.getByTestId(`effective-${PATH}`).innerText()).trim();
  const target = before === '10' ? '11' : '10';
  await input.fill(target);
  await input.blur();
  await page.getByTestId('save-note').fill('e2e 调整经验倍率');
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId(`effective-${PATH}`)).toHaveText(target);

  await page.getByTestId(`reset-${PATH}`).click();
  await page.getByTestId('save-note').fill('e2e 恢复默认');
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId(`reset-${PATH}`)).toHaveCount(0);

  await page.goto('/admin/audit');
  await expect(page.getByText('修改区服数值').first()).toBeVisible();
});
```

- [ ] **Step 2: 跑端到端**

Run: `pnpm infra:dev && pnpm --filter @dt/server migrate:dev && pnpm --filter @dt/web e2e`
Expected: 三个用例都通过（开发服务器由 Playwright 启动或复用）

- [ ] **Step 3: 部署文档和 README**

`docs/deploy.md` 追加：

```markdown
## 运营控制台

- 后台在网页的 `/admin`，接口前缀 `/api/v1/admin`。没有权限的账号看到的是"页面不存在"。
- 设置第一个管理员（在服务器上执行）：
  `docker compose exec server node dist/cli/account.js role <用户名> admin`
  开发环境：`pnpm --filter @dt/server account role <用户名> admin`
  之后管理员可以在后台给别人设"协管"（只读 + 封号 + 强制改名）或"管理员"。
- 区服数值保存后，API 和 worker 通过 Redis 频道 `shard-settings` 立即清缓存，不需要重启。
- 全区服补偿和每日统计汇总都由 worker 执行：**生产环境必须跑 worker**。
- 可选：用反向代理限制 `/admin` 和 `/api/v1/admin` 的来源 IP。
```

`README.md` 的开发一节在 `pnpm dev` 那行之后加：

```bash
pnpm --filter @dt/server account role <用户名> admin   # 把自己设为管理员，后台在 http://localhost:5173/admin
```

- [ ] **Step 4: 全量检查**

Run: `pnpm --filter @dt/config build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && docker build -f apps/server/Dockerfile -t dt-server:local .`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
pnpm format
git add apps docs README.md
git commit -m "test: admin console e2e; deploy notes for the first admin and the console

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
