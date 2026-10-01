# 子项目 6B-2：可疑数据、区服数值说明、上线检查、问题记录 172~181 小改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本 PR 做四件事：
- 后台能看可疑数据（酒吧、资源暴涨、多号、兑换码被锁）；
- 区服数值 520 项左右全部有中文说明，可搜索；
- 概览页有上线检查，能一键改成上线值；
- 顺带修 172~181 的五条小改。

**Architecture:**
- **可疑数据**：只读查询放在 `modules/ops/suspicious.ts`。多号需要的登录记录建新表 `login_trace`（迁移 0020），注册、登录时写入，worker 每天清理。
- **数值说明**：放在手写文件 `game/setting_docs.json`，构建时和真实的数值树交叉检查，随 `ShardSettingsDto` 下发。
- **上线检查**：检查项是代码里的常量表；修复走现有的 `shards.save`。

**Tech Stack:** Fastify 5、Kysely/PostgreSQL、Redis、Zod、Vue 3 + Pinia + Bootstrap 5、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject6b-moderation-design.md` 的 §5、§6、§7、§10（6B-2 部分）。172~181 是用户在问题记录里新提的，裁定见 Task 8。

## Global Constraints

- 后台处理函数第一步 `requireRole`；可疑数据和上线检查的查看 mod 能用，上线检查的修复只有 admin 能用；新路由加进权限矩阵 `permissions.test.ts`。
- 可疑数据只读，不改任何数据；页面顶部写明"只作提醒，不能单凭这里处罚"。
- 游戏日用 `gameDay(now)`、`gameTime(day, 0)`、`addDays(day, n)`（`@dt/shared`）。
- 门槛放在 `tuning.ops.suspicious`：`barPerfectDaily` 3、`dartsBullDaily` 20、`sharedAccounts` 3、`topN` 50。
- 数值说明要覆盖：功能开关（服务端 `IMPLEMENTED_FEATURES`）、分组（`tuning.xxx` 和 `restaurant`）、叶子路径（对象逐层展开，数组算一个叶子）。漏写、多写都是构建错误。
- 上线检查项：
  - `tuning.hiphop.requireVerifiedEmail` 应为 true；
  - `tuning.town.shake.limitIp` 应为 true；
  - `tuning.town.shake.limitDevice` 应为 true；
  - `tuning.friend.requireVerifiedEmail` 应为 true。
- **不改开发库的区服数值**；e2e 只操作自己新建的区服和账号。
- `packages/config/data/` 不要 prettier。改完配置跑 `pnpm --filter @dt/config build`。
- 文案中文。每个任务跑自己的测试；计划结束跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter @dt/web e2e`。

## Review Focus

1. 同一 IP 登录过很多次的同一个账号：多号页只算 1 个账号（按账号去重），不能把一个人的多次登录报成多号。（Task 2 测试）
2. 资源暴涨：一家店当天既有大额收入又有大额支出，按净增排序，不能只看收入。（Task 2 测试）
3. 区服覆盖里写过一个数值（比如 `tuning.hiphop`），上线检查修复时只改没通过的那几项，其他已有的覆盖原样保留。（Task 6 测试）
4. 两个管理员同时点上线检查修复：第二个报版本冲突（409），不会互相覆盖。（Task 6 测试）
5. 以后新加一个 tuning 字段忘了写说明：构建报错并指出路径，不能悄悄缺说明。（Task 4 测试）

---

## 文件结构

**新建**
- 服务端：
  - `apps/server/src/db/migrations/0020_login_trace.ts`、`0020.test.ts`
  - `apps/server/src/modules/account/loginTrace.ts`、`loginTrace.test.ts`
  - `apps/server/src/modules/ops/suspicious.ts`、`suspicious.test.ts`
  - `apps/server/src/modules/admin/launch.ts`、`launch.test.ts`
- 配置：`packages/config/data/game/setting_docs.json`、`packages/config/src/settingDocs.ts`、`settingDocs.test.ts`
- 共享：`packages/shared/src/schemas/ops.ts`
- 前端：`apps/web/src/views/admin/AdminSuspiciousView.vue` 及测试、`apps/web/src/components/admin/LaunchCheck.vue` 及测试
- e2e：`apps/web/e2e/launch.spec.ts`

**修改**
- 服务端：`db/schema.ts`、`db/migrations/index.ts`、`modules/account/routes.ts`、`core/deps.ts`、`worker/jobs.ts`、`modules/admin/{routes,shards,permissions.test}.ts`
- 配置：`packages/config/src/{raw,types,build,source,tuning}.ts`、`data/game/tuning.json`、`build.test.ts`
- 共享：`packages/shared/src/{index.ts,schemas/admin.ts}`
- 前端：
  - 页面：`views/admin/{AdminShardView,AdminHomeView,AdminLayout}.vue`、`components/admin/SettingRow.vue`、`views/RestaurantHomeView.vue`、`views/MarketView.vue`、`views/FriendsView.vue`、`components/MoreLinks.vue`
  - 其他：`router.ts`、`api/admin.ts`
- 文档：`docs/deploy.md`

---

### Task 1：登录记录（迁移 0020）

**Files:**
- Create: `apps/server/src/db/migrations/0020_login_trace.ts`, `0020.test.ts`, `apps/server/src/modules/account/loginTrace.ts`, `loginTrace.test.ts`
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/db/migrations/index.ts`, `apps/server/src/modules/account/routes.ts`, `apps/server/src/core/deps.ts`, `apps/server/src/worker/jobs.ts`

**Interfaces:**
- Produces：
  - 表 `login_trace(account_id, ip, device_id, first_seen, last_seen)`，唯一约束 `(account_id, ip, device_key)`；`device_key` 是生成列 `coalesce(device_id, '')`。
  - `recordLogin(db, accountId, ip, deviceId): Promise<void>`：upsert，更新 `last_seen`。
  - `cleanLoginTrace(db, now): Promise<number>`：删掉 `last_seen < now − 30 天` 的行，返回删了几行。
  - `deviceIdOf(req): string | null`（从 `restCtxOf` 抽出来，`core/deps.ts` 导出）。
  - worker 任务 `login-trace-clean`，每 6 小时一次。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/account/loginTrace.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow } from '../../../test/fixtures';
import { cleanLoginTrace, recordLogin } from './loginTrace';

const db = testDb();
afterAll(() => db.destroy());
let account: number;
beforeAll(async () => {
  account = await createAccountRow(db);
});
const rows = () => db.selectFrom('login_trace').selectAll().where('account_id', '=', account).execute();

describe('登录记录（设计 §5）', () => {
  it('同一账号、IP、设备只一行，再登录更新最近时间；没有设备也能记', async () => {
    await recordLogin(db, account, '10.0.0.1', 'dev-aaaaaaaa');
    const [first] = await rows();
    await new Promise((r) => setTimeout(r, 10));
    await recordLogin(db, account, '10.0.0.1', 'dev-aaaaaaaa');
    await recordLogin(db, account, '10.0.0.1', null);
    await recordLogin(db, account, '10.0.0.1', null);
    const all = await rows();
    expect(all).toHaveLength(2);
    const same = all.find((r) => r.device_id === 'dev-aaaaaaaa')!;
    expect(same.first_seen.getTime()).toBe(first!.first_seen.getTime());
    expect(same.last_seen.getTime()).toBeGreaterThan(first!.last_seen.getTime());
  });

  it('清理 30 天没再出现的记录', async () => {
    await db
      .insertInto('login_trace')
      .values({ account_id: account, ip: '10.9.9.9', device_id: null, first_seen: new Date(0), last_seen: new Date(0) })
      .execute();
    expect(await cleanLoginTrace(db, new Date())).toBeGreaterThanOrEqual(1);
    expect((await rows()).some((r) => r.ip === '10.9.9.9')).toBe(false);
  });
});
```

`0020.test.ts`：插入同一 `(account, ip, null)` 两次，第二次违反唯一约束（证明 `device_key` 生效）。

HTTP 测试（加到 `modules/account` 现有的注册/登录测试文件里）：注册后 `login_trace` 有一行，`ip` 是请求的 IP；带 `x-device-id: dev-12345678` 登录后有一行 `device_id = 'dev-12345678'`。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/account apps/server/src/db/migrations/0020.test.ts`
Expected: FAIL（表、模块不存在）。

- [ ] **Step 3：实现**

```ts
// apps/server/src/db/migrations/0020_login_trace.ts
import { sql, type Kysely } from 'kysely';

/** 子项目 6B-2：登录记录，多号检测用（设计 §5）；只留 30 天 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table login_trace (
    account_id integer not null references account(id) on delete cascade,
    ip text not null,
    device_id text,
    device_key text generated always as (coalesce(device_id, '')) stored,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    primary key (account_id, ip, device_key)
  )`.execute(db);
  await sql`create index login_trace_ip on login_trace (ip, last_seen)`.execute(db);
  await sql`create index login_trace_device on login_trace (device_id, last_seen) where device_id is not null`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table login_trace`.execute(db);
}
```

- `schema.ts` 加 `LoginTraceTable`，字段 `account_id`、`ip`、`device_id: Nullable<string>`、`device_key: Generated<string>`、`first_seen: TsDefault`、`last_seen: TsDefault`，并加入 `DB`。
- `loginTrace.ts`：
  - `recordLogin`：`insert … on conflict (account_id, ip, device_key) do update set last_seen = now()`，写法用 `sql`。
  - `cleanLoginTrace`：`delete … where last_seen < now − 30d`，返回 `numDeletedRows`。
- `core/deps.ts`：抽出 `export function deviceIdOf(req)`，`restCtxOf` 改用它。
- `account/routes.ts`：注册、登录成功后 `await recordLogin(deps.db, accountId, req.clientIp, deviceIdOf(req)).catch((err) => req.log.warn({ err }, 'record login failed'))`，失败不影响登录。
- `worker/jobs.ts` 加：`{ name: 'login-trace-clean', intervalMs: 6 * 3_600_000, run: async () => { await cleanLoginTrace(game.app.db, new Date()); } }`；字段形状以现有任务为准。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/account apps/server/src/db apps/server/src/worker && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src
git commit -m "feat(ops): 登录记录表 login_trace，注册登录时写入、worker 清理 30 天前的"
```

---

### Task 2：可疑数据查询

**Files:**
- Create: `apps/server/src/modules/ops/suspicious.ts`, `suspicious.test.ts`, `packages/shared/src/schemas/ops.ts`
- Modify: `packages/config/src/tuning.ts`, `packages/config/data/game/tuning.json`, `packages/config/src/build.test.ts`, `packages/shared/src/index.ts`, `apps/server/src/modules/admin/routes.ts`, `apps/server/src/modules/admin/permissions.test.ts`

**Interfaces:**
- Produces（配置）：`tuning.ops.suspicious: { barPerfectDaily: 3; dartsBullDaily: 20; sharedAccounts: 3; topN: 50 }`。
- Produces（`@dt/shared` 的 `ops.ts`）：

```ts
export interface SuspectRest { restId: number; restName: string; accountId: number; username: string }
export interface SuspiciousBarRow extends SuspectRest {
  perfectSum: number; perfectMax: number; bullSum: number; bullMax: number; flagged: boolean;
}
export interface SuspiciousSurgeRow extends SuspectRest {
  net: number;
  topSources: Array<{ source: string; delta: number }>;
}
export interface SuspiciousSurgeDto { day: string; coin: SuspiciousSurgeRow[]; diamond: SuspiciousSurgeRow[]; exp: SuspiciousSurgeRow[] }
export interface SuspiciousMultiGroup {
  kind: 'ip' | 'device';
  key: string;
  accounts: Array<{ accountId: number; username: string; restId: number | null; restName: string | null; lastSeen: string }>;
}
export interface SuspiciousRedeemRow { accountId: number; username: string; fails: number; ttlSec: number }
export const suspiciousQuery: z.ZodObject<{ shardId: number; day?: string }>; // shardId 必填；day 是 YYYY-MM-DD，可空
```

- Produces（服务端）：`createSuspicious(game)`，方法：
  - `bar(shardId): Promise<SuspiciousBarRow[]>`
  - `surge(shardId, day?): Promise<SuspiciousSurgeDto>`
  - `multi(shardId): Promise<SuspiciousMultiGroup[]>`
  - `redeemLocked(shardId): Promise<SuspiciousRedeemRow[]>`
- 路由（全部 mod）：`GET /admin/suspicious/bar|surge|multi|redeem?shardId=&day=`。

**口径**（设计 §5）：
- **酒吧**：
  - 数据：`daily_counter` 里 `key in ('bar.memory.perfect','bar.darts.bull')`、`day >= addDays(今天, -6)` 的行，关联 `restaurant` 限本区服、非 NPC，关联 `account`。
  - 按店汇总两项的合计和单日最大值。任一单日最大值超过门槛就标 `flagged`。
  - 排序：`flagged desc`，再按 `max(perfectMax / 门槛, bullMax / 门槛) desc`，取 `topN`。
- **资源暴涨**：
  - 日期：`day` 默认昨天（`addDays(今天, -1)`）。时间范围 `[gameTime(day,0), gameTime(addDays(day,1),0))`。
  - 数据：`ledger`，`kind in ('coin','diamond','exp')`，关联本区服的店。
  - 每种资源按店 `sum(delta)` 取净增最大的 `topN` 家；每家附上按 `source` 汇总、绝对值最大的 3 个来源。
- **多号**：
  - 数据：`login_trace` 里 `last_seen >= now − 30 天` 的行。
  - 按 `ip` 分组，`count(distinct account_id) >= sharedAccounts` 的列出；按 `device_id`（非空）同样分组。
  - 每组列出账号（去重）、用户名、在本区服的店（没有为 null）、最近一次时间。最多 `topN` 组。
  - 只列"组内至少一个账号在本区服有店"的组。
- **兑换码被锁**：
  - 用 Redis `SCAN` 找 `redeem:fail:*`，计数 `>= tuning.redeem.failLimit`（本区服的设置）的；取 `TTL`，账号 id 从键名解析，查用户名。
  - 不按区服过滤（兑换码失败是按账号计的），页面上注明。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/ops/suspicious.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { recordLogin } from '../account/loginTrace';
import { createSuspicious } from './suspicious';

let t: TestGame;
let s: ReturnType<typeof createSuspicious>;
beforeAll(async () => {
  t = await createTestGame();
  s = createSuspicious(t.game);
});
afterAll(() => t.close());

const counter = (restId: number, key: string, day: string, count: number) =>
  t.db.insertInto('daily_counter').values({ rest_id: restId, key, day, count }).execute();
const ledger = (restId: number, kind: string, delta: number, source: string, at: Date) =>
  t.db.insertInto('ledger').values({ rest_id: restId, kind, delta, source, created_at: at }).execute();

describe('可疑数据（设计 §5）', () => {
  it('酒吧：最近 7 天合计和单日最高；超过门槛的标红排前面', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const today = gameDay(t.clock.now);
    await counter(a.restaurantId, 'bar.memory.perfect', today, 5);
    await counter(a.restaurantId, 'bar.memory.perfect', addDays(today, -1), 1);
    await counter(b.restaurantId, 'bar.darts.bull', today, 4);
    await counter(b.restaurantId, 'bar.darts.bull', addDays(today, -9), 99);
    const rows = await s.bar(shardId);
    expect(rows[0]).toMatchObject({ restId: a.restaurantId, perfectSum: 6, perfectMax: 5, flagged: true });
    expect(rows.find((r) => r.restId === b.restaurantId)).toMatchObject({ bullSum: 4, flagged: false });
  });

  it('资源暴涨：按净增排序（Review Focus 2），附最大的来源', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const day = addDays(gameDay(t.clock.now), -1);
    const at = new Date(gameTime(day, 0).getTime() + 3_600_000);
    await ledger(a.restaurantId, 'coin', 1_000_000, 'tower.challenge', at);
    await ledger(a.restaurantId, 'coin', -990_000, 'shop.buy', at);
    await ledger(b.restaurantId, 'coin', 500_000, 'settlement', at);
    const r = await s.surge(shardId, day);
    expect(r.coin.map((x) => x.restId)).toEqual([b.restaurantId, a.restaurantId]);
    expect(r.coin[1]).toMatchObject({ net: 10_000 });
    expect(r.coin[1]!.topSources[0]).toEqual({ source: 'tower.challenge', delta: 1_000_000 });
  });

  it('多号：同一 IP 3 个账号列出；同一账号多次登录只算 1 个（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const rs = await Promise.all([1, 2, 3].map(() => newRestaurant(t, { shardId })));
    const ip = `10.66.${Date.now() % 250}.1`;
    for (const r of rs) await recordLogin(t.db, r.accountId, ip, null);
    const solo = await newRestaurant(t, { shardId });
    const ip2 = `10.67.${Date.now() % 250}.2`;
    for (let i = 0; i < 5; i++) await recordLogin(t.db, solo.accountId, ip2, `dev-solo-${i}aaaa`);
    const groups = await s.multi(shardId);
    const g = groups.find((x) => x.kind === 'ip' && x.key === ip)!;
    expect(g.accounts).toHaveLength(3);
    expect(g.accounts[0]!.restId).not.toBeNull();
    expect(groups.some((x) => x.key === ip2)).toBe(false);
  });

  it('兑换码被锁：计数达到上限的账号', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    await t.deps.redis.set(`redeem:fail:${r.accountId}`, '10', 'EX', 600);
    const rows = await s.redeemLocked(shardId);
    expect(rows.find((x) => x.accountId === r.accountId)).toMatchObject({ fails: 10 });
    expect(rows.find((x) => x.accountId === r.accountId)!.ttlSec).toBeGreaterThan(0);
  });
});
```

（`daily_counter`、`ledger` 的必填列以 `schema.ts` 为准。）

`build.test.ts` 加：`tuning.ops.suspicious` 等于 `{ barPerfectDaily: 3, dartsBullDaily: 20, sharedAccounts: 3, topN: 50 }`。

`permissions.test.ts` 加 4 条，`min` 都是 `mod`，url 带 `?shardId=${ids.shardId}`。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/ops/suspicious.test.ts packages/config/src/build.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**：按"口径"写 `suspicious.ts`（Kysely 查询，复杂的汇总用 `sql`）；`ops.ts` 放类型和 `suspiciousQuery`；配置加 `ops: z.object({ suspicious: z.object({ barPerfectDaily: int.min(1), dartsBullDaily: int.min(1), sharedAccounts: int.min(2), topN: int.min(1).max(200) }) })`，`tuning.json` 加对应默认值；`admin/routes.ts` 注册 4 个路由。

- [ ] **Step 4：运行，确认通过**

Run: `pnpm --filter @dt/config build && npx vitest run apps/server/src/modules/ops apps/server/src/modules/admin packages/config && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src packages
git commit -m "feat(ops): 可疑数据查询——酒吧计数、资源暴涨、多号、兑换码被锁"
```

---

### Task 3：前端——可疑数据页

**Files:**
- Create: `apps/web/src/views/admin/AdminSuspiciousView.vue`, `AdminSuspiciousView.test.ts`
- Modify: `apps/web/src/api/admin.ts`, `apps/web/src/views/admin/AdminLayout.vue`, `apps/web/src/router.ts`

**Interfaces:**
- Produces：
  - `adminApi.suspiciousBar(shardId)`、`suspiciousSurge(shardId, day?)`、`suspiciousMulti(shardId)`、`suspiciousRedeem(shardId)`。
  - 路由 `/admin/suspicious`；导航在"举报"后面加"可疑数据"。

**页面**：
- 顶部一行灰字："只作提醒，不能单凭这里处罚。同一宿舍、网吧的人会共用 IP。"
- 四个标签（`sus-tab-bar|surge|multi|redeem`），切换时按当前区服读取：
  - **酒吧**：表格列出店名、账号、记忆全过 7 天合计/单日最高、飞镖 50 分 7 天合计/单日最高，`flagged` 的行加 `table-danger`。
  - **资源暴涨**：日期选择框（`sus-day`，默认空即昨天），三张小表（银币/钻石/经验），每行显示店名、净增（`formatNum`）、来源（`source +delta` 用顿号隔开）。
  - **多号**：每组一张卡片，标题写"同一 IP：x.x.x.x"或"同一设备：…"，下面列出账号、店名、最近时间。
  - **兑换码被锁**：账号、输错次数、剩余锁定（分钟）。注明"按账号计，不分区服"。
- 店名和账号都是 `RouterLink` 到 `/admin/players/{accountId}`。

- [ ] **Step 1：写失败的测试**（mock `adminApi`；admin store 的 `shardId` 设 1）
- 默认标签是酒吧：`suspiciousBar` 被 `1` 调用；`flagged` 行有 `table-danger`；店名链接 `href` 是 `/admin/players/{id}`。
- 点 `sus-tab-surge`：`suspiciousSurge` 被 `(1, undefined)` 调用；在 `sus-day` 填 `2026-09-30` 后被 `(1, '2026-09-30')` 调用；来源文案包含 `tower.challenge +1,000,000`。
- 点 `sus-tab-multi`：显示"同一 IP：10.0.0.1"，下面有三个账号。

- [ ] **Step 2：运行，确认失败**：`cd apps/web && npx vitest run src/views/admin/AdminSuspiciousView.test.ts` → FAIL。
- [ ] **Step 3：实现**：按"页面"写，加 api、导航、路由。
- [ ] **Step 4：运行，确认通过**：`cd apps/web && npx vitest run src/views/admin && cd ../.. && pnpm --filter @dt/web typecheck` → PASS。
- [ ] **Step 5：提交**：`git commit -m "feat(admin): 可疑数据页"`

---

### Task 4：区服数值说明——说明文件和构建检查

**Files:**
- Create: `packages/config/data/game/setting_docs.json`, `packages/config/src/settingDocs.ts`, `packages/config/src/settingDocs.test.ts`
- Modify: `packages/config/src/raw.ts`, `types.ts`, `build.ts`, `source.ts`, `index.ts`

**Interfaces:**
- Produces：
  - `ConfigBundle.settingDocs: { features: Record<string,string>; groups: Record<string,string>; fields: Record<string,string> }`；`GameConfig` 上同名只读属性。
  - `settingLeaves(tree: unknown, prefix: string): string[]`：对象逐层展开，数组、标量是叶子。
  - `settingGroup(path): string`：和前端 `groupOf` 同一规则（`tuning.x.y` 取 `tuning.x`，`restaurant.x` 取 `restaurant`）。
  - `checkSettingDocs(docs, tuning, restaurantDefaults, errors)`：漏写报 `setting_docs missing <path>`，多写报 `setting_docs unknown <path>`（字段和分组都查）；说明不能为空。
- 功能开关的说明在服务端测试里对 `IMPLEMENTED_FEATURES` 检查（配置包不知道服务端的开关列表）：
  - 测试放 `apps/server/src/core/features.test.ts`；
  - 每个开关都要有说明，多写的报错。

**写说明的原则**（设计 §6）：
- 一句话，说清管什么，带单位：秒、分钟、小时、游戏日、倍数、0~1 的概率、百分比、银币、个、次。
- 有特殊值的写出来，比如"0 表示不限"。
- 不确定含义时，读用到它的代码，用 `grep -rn "tuning.<组>.<字段>"`、`grep -rn "\.<字段>\b" apps/server/src/modules/<组>`。
- 写法示例：
  - `"tuning.settlement.expMultiplier": "结算经验倍率（倍数，1 = 原版）"`
  - `"tuning.mail.expiresDays": "邮件多少天后过期（天）"`
  - `"restaurant.giftFoods": "开店时送的食材（[{ id, num }] 列表）"`

- [ ] **Step 1：写失败的测试**

```ts
// packages/config/src/settingDocs.test.ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { checkSettingDocs, settingGroup, settingLeaves } from './settingDocs';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('区服数值说明（问题记录 126）', () => {
  it('叶子：对象展开，数组算一个；分组规则', () => {
    expect(settingLeaves({ a: { b: 1, c: [1, 2] }, d: 'x' }, 'tuning')).toEqual(['tuning.a.b', 'tuning.a.c', 'tuning.d']);
    expect(settingGroup('tuning.market.dailyStock')).toBe('tuning.market');
    expect(settingGroup('restaurant.giftFoods')).toBe('restaurant');
  });

  it('真实数据：每个数值、每个分组都有说明', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const d = bundle!.settingDocs;
    expect(Object.keys(d.fields).length).toBeGreaterThan(500);
    expect(d.fields['tuning.settlement.expMultiplier']).toMatch(/经验/);
    expect(d.groups['restaurant']).toBeTruthy();
  });

  it('漏写、多写、空说明都报错（Review Focus 5）', () => {
    const errors: string[] = [];
    checkSettingDocs(
      { features: {}, groups: { 'tuning.a': 'A 组', 'tuning.z': '多余的组' }, fields: { 'tuning.a.x': '', 'tuning.a.gone': '旧的' } },
      { a: { x: 1, y: 2 } } as never,
      {} as never,
      errors,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'setting_docs missing tuning.a.y',
        'setting_docs unknown tuning.a.gone',
        'setting_docs unknown tuning.z',
        'setting_docs empty tuning.a.x',
      ]),
    );
  });
});
```

`apps/server/src/core/features.test.ts`：每个 `IMPLEMENTED_FEATURES` 都在 `testConfig().settingDocs.features` 里，并且反过来也一样。

- [ ] **Step 2：运行，确认失败**：`cd packages/config && npx vitest run src/settingDocs.test.ts` → FAIL。

- [ ] **Step 3：实现**
- `settingDocs.ts`：按 Interfaces 写。
- `raw.ts`：加 `settingDocsFile = z.object({ features: z.record(z.string()), groups: z.record(z.string()), fields: z.record(z.string()) }).strict()`。
- `source.ts` 的文件列表加 `'game/setting_docs'`。
- `build.ts`：读这个文件（缺了就不构建），调 `checkSettingDocs(docs, tuning, restaurantDefaults, errors)`，放进 bundle。
- `types.ts`：加 `settingDocs` 类型。
- `runtime.ts`：暴露 `settingDocs`。
- **写 `setting_docs.json`**：用 `settingLeaves` 跑一遍真实数据，生成全部路径清单，然后**按组逐个写说明**。每写完一组跑一次测试，看剩下多少 `missing`。
  - 文件按组排序，一行一项，不要 prettier。
  - 功能开关写 `IMPLEMENTED_FEATURES` 里的每一个。

- [ ] **Step 4：运行，确认通过**：`cd packages/config && npx vitest run && cd ../.. && pnpm --filter @dt/config build && npx vitest run apps/server/src/core/features.test.ts` → PASS。

- [ ] **Step 5：提交**：`git commit -m "feat(config): 区服数值全部有中文说明，构建检查漏写多写（问题记录 126）"`

---

### Task 5：后台区服数值页——显示说明、搜索

**Files:**
- Modify: `apps/server/src/modules/admin/shards.ts`, `packages/shared/src/schemas/admin.ts`, `apps/web/src/views/admin/AdminShardView.vue`, `AdminShardView.test.ts`, `apps/web/src/components/admin/SettingRow.vue`, `SettingRow.test.ts`

**Interfaces:**
- Produces：`ShardSettingsDto.docs: { features; groups; fields }`（来自 `config.settingDocs`）；`SettingRow` 新 prop `doc?: string`。

- [ ] **Step 1：写失败的测试**
- `SettingRow.test.ts`：传 `doc: '结算经验倍率'`，字段名下面有 `[data-testid="doc-tuning.x"]`，文字是这句说明。
- `AdminShardView.test.ts`：
  - mock 的 settings 带 `docs`。
  - 搜索框 `setting-search` 输入"经验"后：
    - 只显示说明或路径包含"经验"的行；
    - 匹配到的组 `details` 自动展开（`open` 属性）；
    - 不匹配的组不渲染。
  - 清空搜索后，恢复显示全部。
  - 功能开关下面显示说明（`feature-doc-mail`）。
- 服务端 `shards` 的测试（`modules/admin/shards.test.ts` 或现有文件）：`settings()` 返回 `docs.fields['tuning.settlement.expMultiplier']` 非空。

- [ ] **Step 2：运行，确认失败**。
- [ ] **Step 3：实现**
- `shards.ts` 的 `settings()` 加 `docs: config.settingDocs`。
- `SettingRow` 在路径下面显示 `<div v-if="doc" class="text-muted" :data-testid="\`doc-${path}\`">{{ doc }}</div>`。
- `AdminShardView`：
  - 加 `search` ref 和输入框；
  - `match(p) = !q || p.includes(q) || (docs.fields[p] ?? '').includes(q)`；
  - 常用区和每个分组都用 `match` 过滤；
  - 有搜索词时组的 `details` 加 `:open="true"`，过滤后为空的组不渲染；
  - 组标题后显示组说明（小字）；
  - 功能开关的 label 下显示说明。
- [ ] **Step 4：运行，确认通过**：`cd apps/web && npx vitest run src/views/admin src/components/admin && cd ../.. && npx vitest run apps/server/src/modules/admin && pnpm typecheck` → PASS。
- [ ] **Step 5：提交**：`git commit -m "feat(admin): 区服数值页显示说明、按名字或说明搜索（问题记录 126）"`

---

### Task 6：上线检查——服务端

**Files:**
- Create: `apps/server/src/modules/admin/launch.ts`, `launch.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`, `permissions.test.ts`, `apps/server/src/modules/admin/shards.ts`（导出给 launch 用的保存函数）, `packages/shared/src/schemas/admin.ts`

**Interfaces:**
- Produces：
  - `LAUNCH_CHECKS: ReadonlyArray<{ path: string; want: boolean; why: string }>`（四条，见 Global Constraints）。
  - `LaunchCheckDto = { shards: Array<{ shardId; shardName; version; items: Array<{ path; want; current: unknown; ok: boolean; why }> }>; allOk: boolean }`（只列开着的区服）。
  - `launchCheckFixBody = { shardId: number; version: number }`。
  - `GET /admin/launch-check`（mod）、`POST /admin/launch-check/fix`（admin）。修复：
    1. 读这个区服当前的 `override`。
    2. 对每个没通过的项 `setAt(override, path, want)`，保留已有的其他覆盖。
    3. 调 `shards.save(actor, shardId, { override, note: '上线检查', version })`。版本不对报 409。
    4. 返回新的 `LaunchCheckDto`。

- [ ] **Step 1：写失败的测试**（HTTP，`createTestApp`；建自己的区服，不用一服、二服）

```ts
// apps/server/src/modules/admin/launch.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('上线检查（设计 §7）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  let shardId: number;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
    shardId = await createShard(ctx.deps.db);
  });
  afterAll(() => ctx.close());
  const get = (cookie: string) => call(ctx.app, 'GET', '/api/v1/admin/launch-check', { cookie });
  const mine = (dto: { shards: Array<{ shardId: number }> }) => dto.shards.find((s) => s.shardId === shardId)!;

  it('默认值下列出没通过的项；修复只改这几项，保留其他覆盖（Review Focus 3）', async () => {
    const pre = await call(ctx.app, 'POST', `/api/v1/admin/shards/${shardId}/override`, {
      cookie: admin.cookie,
      body: { override: { tuning: { hiphop: { tipMax: 3 } } }, note: '原有覆盖', version: 0 },
    });
    expect(pre.status).toBe(200);
    const r = await get(mod.cookie);
    const s = mine(r.json.data);
    expect(s.items.filter((i: { ok: boolean }) => !i.ok).map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['tuning.hiphop.requireVerifiedEmail', 'tuning.town.shake.limitIp', 'tuning.town.shake.limitDevice']),
    );
    const fix = await call(ctx.app, 'POST', '/api/v1/admin/launch-check/fix', {
      cookie: admin.cookie,
      body: { shardId, version: s.version },
    });
    expect(fix.status).toBe(200);
    expect(mine(fix.json.data).items.every((i: { ok: boolean }) => i.ok)).toBe(true);
    const settings = await call(ctx.app, 'GET', `/api/v1/admin/shards/${shardId}/settings`, { cookie: admin.cookie });
    expect(settings.json.data.override.tuning.hiphop).toMatchObject({ tipMax: 3, requireVerifiedEmail: true });
    const hist = await call(ctx.app, 'GET', `/api/v1/admin/shards/${shardId}/history`, { cookie: admin.cookie });
    expect(hist.json.data[0].note).toBe('上线检查');
  });

  it('协管不能修复；版本过期报 409（Review Focus 4）', async () => {
    const s = mine((await get(mod.cookie)).json.data);
    expect(
      (await call(ctx.app, 'POST', '/api/v1/admin/launch-check/fix', { cookie: mod.cookie, body: { shardId, version: s.version } })).status,
    ).toBe(404);
    expect(
      (await call(ctx.app, 'POST', '/api/v1/admin/launch-check/fix', { cookie: admin.cookie, body: { shardId, version: s.version - 1 } })).status,
    ).toBe(409);
  });
});
```

（`tipMax` 只是示例：用 `tuning.hiphop` 下任意一个真实存在的数值字段，以 `tuning.json` 为准；`shards/:id/history` 返回的字段名以现有 DTO 为准。）

`permissions.test.ts` 加两条：`GET /api/v1/admin/launch-check`（mod）；`POST /api/v1/admin/launch-check/fix`（admin，body `{ shardId: ids.shardId, version: 0 }`；管理员这一次可能因版本号报 409，只要不是 404 就算通过——以矩阵测试现有的判定为准）。

- [ ] **Step 2：运行，确认失败**。
- [ ] **Step 3：实现** `launch.ts`：
  - `setAt` 写一个服务端的小工具，或复用 `shards.ts` 里已有的路径工具。
  - 读当前值用 `resolveShardSettings` 的结果按路径取。
  - 只列 `status = 'open'` 的区服。
  - 注册路由。
- [ ] **Step 4：运行，确认通过**：`npx vitest run apps/server/src/modules/admin && pnpm --filter @dt/server typecheck` → PASS。
- [ ] **Step 5：提交**：`git commit -m "feat(admin): 上线检查——列出开发期关掉的开关，管理员一键改成上线值"`

---

### Task 7：前端——概览页的上线检查

**Files:**
- Create: `apps/web/src/components/admin/LaunchCheck.vue`, `LaunchCheck.test.ts`
- Modify: `apps/web/src/views/admin/AdminHomeView.vue`, `apps/web/src/api/admin.ts`

**组件**：
- 读 `adminApi.launchCheck()`。
- `allOk` 时显示绿色"上线检查：全部通过"（`launch-ok`）。
- 否则逐个区服列出没通过的项：路径、当前值、应为、为什么。每个区服一个"改成上线值"按钮（`launch-fix-{shardId}`），只有管理员看得到。点之前 `confirm`，写明"把 N 项改成上线值，记一条修改历史"；成功后用返回值刷新。

- [ ] **Step 1：写失败的测试**
- 有未通过项时列出路径。
- 协管看不到修复按钮。
- 管理员点修复、确认后调用 `launchCheckFix({ shardId, version })`，刷新后显示"全部通过"。
- [ ] **Step 2**：确认失败。
- [ ] **Step 3**：实现，`AdminHomeView` 顶部放 `<LaunchCheck />`。
- [ ] **Step 4**：`cd apps/web && npx vitest run src/components/admin src/views/admin` 通过。
- [ ] **Step 5**：`git commit -m "feat(admin): 概览页显示上线检查"`

---

### Task 8：问题记录 172~181 小改

**Files:**
- Modify: `apps/web/src/views/RestaurantHomeView.vue`, `RestaurantHomeView.test.ts`, `apps/web/src/components/MoreLinks.vue`, `apps/web/src/views/MoreView.test.ts`, `apps/web/src/views/MarketView.vue`, `MarketView.test.ts`, `apps/web/src/views/FriendsView.vue`, `FriendsView.test.ts`

| # | 现象 | 改法 | 测试 |
|---|---|---|---|
| 172 | 经验条卡在银币等四项数字和油量中间 | 经验条移到"街道 · 星 · 等级"那一行正下方（常用入口之前），和等级放在一起 | 首页里 `[data-testid="exp-text"]` 在 DOM 中位于 `[data-testid="quick-links"]` 之前（`compareDocumentPosition`） |
| 173 | 装扮在"经营"组 | "装扮"从"经营"移到"其他"组（在"邀请好友"前） | `MoreView.test.ts`：找到"其他"分组的元素，里面包含"装扮"；"经营"分组里不再有 |
| 176 | 菜场"日常菜场""特价菜场"标题不加粗，菜名加粗，主次反了 | 分区标题用 `dt-section`（加粗、左侧色条）；菜名去掉 `<b>`，正常字重 | `MarketView.test.ts`：分区标题有 `dt-section` 类；菜名不在 `<b>` 里 |
| 179 | 好友列表头像和文字没对齐、间距大 | 头像恢复默认 24px（去掉 32px 样式），`me-1`，加 `flex-shrink-0`；整行 `align-items-center` | `FriendsView.test.ts`：头像元素有 `flex-shrink-0`、没有 `dt-friend-avatar` |
| 181 | 设施剩余时间只显示到小时 | `expiresText` 改为：≥1 小时显示"剩余 X 小时 Y 分"，<1 小时显示"剩余 Y 分钟"，向上取整到分钟 | 用 `vi.setSystemTime` 固定时间，设施到期在 90 分钟后，显示"剩余 1 小时 30 分"；30 分钟后显示"剩余 30 分钟" |

- [ ] **Step 1**：按表写 5 处失败的测试。
- [ ] **Step 2**：`cd apps/web && npx vitest run src/views` 确认失败。
- [ ] **Step 3**：按表实现。
- [ ] **Step 4**：`cd apps/web && npx vitest run` 通过。
- [ ] **Step 5**：`git commit -m "fix(web): 经验条位置、装扮归到其他、菜场标题、好友头像对齐、设施剩余到分钟（问题记录 172~181）"`

---

### Task 9：e2e、部署说明、全量检查

**Files:**
- Create: `apps/web/e2e/launch.spec.ts`
- Modify: `docs/deploy.md`

- [ ] **Step 1：写 e2e**：
  1. 用 pg 新建一个开着的区服，id 用 `9000 + 时间戳取模`，名字 `e2e上线{id}`。
  2. 注册一个账号，设为 admin。
  3. 进 `/admin`，在上线检查里找到这个区服，点 `launch-fix-{id}`，接受确认框。
  4. 断言这个区服不再出现在未通过列表里。
  5. 再进 `/admin/suspicious`，四个标签都能点开，不报错。

  只改自己建的区服；不碰一服、二服。
- [ ] **Step 2：部署说明**：`docs/deploy.md` 加一节"可疑数据、数值说明、上线检查（子项目 6B-2）"：
  - 迁移 0020 `login_trace`（只留 30 天，worker `login-trace-clean`）；
  - `tuning.ops.suspicious`；
  - 新数值必须同时在 `game/setting_docs.json` 写说明，否则构建失败；
  - **上线前**到后台概览页把每个区服的上线检查改成全部通过。
- [ ] **Step 3：全量检查**：
  - `pnpm test && pnpm typecheck && pnpm lint`；
  - `pnpm --filter @dt/server migrate:dev`（只加表）；
  - 重启 dev，`pnpm --filter @dt/web e2e`，期望 20 passed。
- [ ] **Step 4：提交**：`git commit -m "test(e2e): 上线检查一键修复、可疑数据页；docs: 部署说明"`
