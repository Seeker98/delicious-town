# 子项目 6A-2：兑换码、邀请 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **兑换码**：运营能建通用码和批量一次性码，玩家在邮箱页兑换，当场到账。
- **邀请**：
  - 被邀请人开店得新手礼包。
  - 被邀请人到 10 级、30 级时，邀请人得奖励，每月最多计 20 人。
  - 玩家有"邀请好友"页。
- **顺带修 6A-1 的两条小问题**（已排期）：
  - 附件失效的邮件不能永远卡住"一键领取"。
  - 后台不能悄悄丢掉没填名字的帽子，确认框要列出附件。

**Architecture:**
- 兑换走 `runOp(feature 'redeem')`，用 `redeem_use` 唯一约束和 `used_count` 条件更新防并发超发，到账复用 `grantRewardOp`。
- 邀请奖励全部由 6A-1 的 worker 扫描 `runOpsScan` 驱动，加一个 `scanInvites`，不挂进开店、升级、验证邮箱的代码。
- 迁移 0018 已经建好 `redeem_code`、`redeem_use`、`invite_reward`，本计划不加迁移。

**Tech Stack:** Fastify 5、Kysely/PostgreSQL、Redis、Zod、Vue 3 + Pinia + Bootstrap 5、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject6a-mail-codes-invite-design.md`（下文"设计"）。覆盖设计 §2 裁定 13~22、26、27，§6 的兑换、邀请接口，§7 第 1~3 步，§8 的兑换框、邀请页、注册页、后台兑换码页，§9、§10 对应部分。

## Global Constraints

- 写操作一律 POST；玩家写操作走 `runOp(d, ctx, { feature, source }, fn)`。
- 后台处理函数第一步 `requireRole`；写操作只有 admin，审计 `writeAudit` 和业务在同一事务。权限矩阵测试 `apps/server/src/modules/admin/permissions.test.ts` 要求列出每个后台路由，新增路由必须加进去。
- 附件格式用 `rewardItems`（`@dt/shared`，含命名帽子），发放用 `grantRewardOp`（`apps/server/src/modules/mail/reward.ts`），道具、食材 id 用 `checkRewardItems` 校验。
- 发邮件用 `sendMail(db, NewMail)`（`apps/server/src/modules/mail/send.ts`），`source = 'invite'`。
- 兑换码统一大写；随机码 10 位，字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（去掉 0/O/1/I）。
- 兑换码的开始、结束时间按游戏时钟 `op.now` 判断（和公告一致）。
- 月份 = 游戏日 `gameDay(now)` 的前 7 位（`YYYY-MM`）。
- 新功能开关 `redeem`、`invite`（默认开），加入 `IMPLEMENTED_FEATURES`。
- 流水来源、个人日志类型：兑换用 `redeem`；邀请奖励走邮件，领取时是 `mail.claim`。
- 文案中文；长度按字符计（`charLen`）。
- 每个任务跑自己的测试；计划结束跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter @dt/web e2e`。
- 配置改完跑 `pnpm --filter @dt/config build`。

## Review Focus

1. 同一个通用码被同一家店并发兑换两次、或总次数只剩 1 次时两家店同时兑换：只成功一次，绝不超发。（Task 3 测试"并发不超发"。）
2. 猜码：同一账号连续输错 10 次后，第 11 次即使输对也先报 `too_many_tries`；输对的有效码不计入失败次数。（Task 3 测试"失败 10 次后锁定"。）
3. 邀请人每月 20 人上限：同一个被邀请人先后达到 10 级、30 级只算 1 人；第 21 个人记为 `capped`，不发奖励；跨月重新计数。（Task 5 测试。）
4. 被邀请人先升到 10 级、后验证邮箱：验证后的下一次扫描补发。邀请人在该区服没店：先记 `pending`，开店后的下一次扫描补发。（Task 5 测试。）
5. 附件里的道具在配置里已删除的邮件：标成"附件已失效"，不能领，不计入"一键领取"，也不会让按钮一直亮着。（Task 6 测试。）

---

## 文件结构

**新建（服务端）**
- `apps/server/src/modules/redeem/code.ts`：随机码生成、规范化。
- `apps/server/src/modules/redeem/redeem.ts`：兑换。
- `apps/server/src/modules/redeem/admin.ts`：后台建码、列表、停用、导出。
- `apps/server/src/modules/redeem/service.ts`、`routes.ts`
- `apps/server/src/modules/invite/scan.ts`：新手礼包、邀请人奖励、补发待发。
- `apps/server/src/modules/invite/service.ts`、`routes.ts`：邀请好友页数据。

**新建（共享）**：`packages/shared/src/schemas/redeem.ts`、`invite.ts`。

**新建（前端）**：
- 组件：`components/RedeemBox.vue`
- 页面：`views/InviteView.vue`、`views/admin/AdminCodesView.vue`
- e2e：`e2e/codes.spec.ts`

**修改**：
- 服务端：`core/features.ts`、`game.ts`、`modules/index.ts`、`modules/ops/scan.ts`、`modules/admin/routes.ts`、`modules/admin/permissions.test.ts`、`modules/mail/{inbox,rules,service,routes}.ts`。
- 配置：`packages/config/src/tuning.ts`、`build.ts`、`data/game/tuning.json`。
- 前端：`views/MailView.vue`、`views/RegisterView.vue`、`components/MoreLinks.vue`、`components/admin/RewardItemsEditor.vue`、`views/admin/AdminMailView.vue`、`views/admin/AdminLayout.vue`、`router.ts`、`api/endpoints.ts`、`api/admin.ts`、`i18n/zh-CN.ts`。
- 文档：`docs/deploy.md`、`docs/rules/邮箱和公告.md`。

---

### Task 1：配置——邀请奖励、兑换数值、功能开关

**Files:**
- Modify: `packages/config/src/tuning.ts`, `packages/config/data/game/tuning.json`, `packages/config/src/build.ts`, `packages/config/src/build.test.ts`, `apps/server/src/core/features.ts`

**Interfaces:**
- Produces:
  - `tuning.invite: { monthlyCap: number; levels: { lv10: number; lv30: number }; newbie: Reward; rewards: { lv10: Reward; lv30: Reward } }`，其中 `Reward = { coin?; diamond?; exp?; goods?: {id,num}[]; foods?: {id,num}[] }`。
  - `tuning.redeem: { failLimit: number; failWindowSec: number; batchMax: number }`。
  - 功能 `redeem`、`invite`。

- [ ] **Step 1：写失败的测试**（追加到 `build.test.ts`）

```ts
describe('邀请和兑换码数值（子项目 6A-2）', () => {
  it('邀请：每月 20 人，10 级、30 级两档；兑换：每小时失败 10 次上限，一批最多 1000 个码', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.tuning.invite).toMatchObject({ monthlyCap: 20, levels: { lv10: 10, lv30: 30 } });
    expect(bundle!.tuning.invite.newbie).toEqual({ coin: 50000, goods: [{ id: 1, num: 5 }] });
    expect(bundle!.tuning.redeem).toEqual({ failLimit: 10, failWindowSec: 3600, batchMax: 1000 });
  });

  it('邀请奖励引用了不存在的道具时构建报错', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { invite: { rewards: { lv10: { goods?: unknown } } } };
    tuning.invite.rewards.lv10.goods = [{ id: 999999, num: 1 }];
    expect(buildBundle({ ...src, 'game/tuning': tuning }).errors).toContain(
      'invite.rewards.lv10 references unknown goods 999999',
    );
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `cd packages/config && npx vitest run src/build.test.ts`
Expected: FAIL（`tuning.invite` 是 undefined）。

- [ ] **Step 3：实现**

`tuning.ts` 在 `mail:` 一行旁边加：

```ts
  invite: z.object({
    monthlyCap: int.min(1),
    levels: z.object({ lv10: int.min(1), lv30: int.min(1) }),
    newbie: rewardSchema,
    rewards: z.object({ lv10: rewardSchema, lv30: rewardSchema }),
  }),
  redeem: z.object({ failLimit: int.min(1), failWindowSec: int.min(1), batchMax: int.min(1).max(1000) }),
```

在文件里 `int` 定义之后加：

```ts
/** 奖励（邀请等配置里用）：和后台补偿同样的五项 */
const idNum = z.object({ id: int, num: int.min(1) });
const rewardSchema = z.object({
  coin: int.min(1).optional(),
  diamond: int.min(1).optional(),
  exp: int.min(1).optional(),
  goods: z.array(idNum).optional(),
  foods: z.array(idNum).optional(),
});
```

`tuning.json` 加：

```json
  "invite": {
    "monthlyCap": 20,
    "levels": { "lv10": 10, "lv30": 30 },
    "newbie": { "coin": 50000, "goods": [{ "id": 1, "num": 5 }] },
    "rewards": { "lv10": { "diamond": 20 }, "lv30": { "diamond": 50, "coin": 200000 } }
  },
  "redeem": { "failLimit": 10, "failWindowSec": 3600, "batchMax": 1000 },
```

`build.ts` 在"论坛"的校验后加：

```ts
  // ---------- 邀请（子项目 6A-2） ----------
  const inviteRewards: Array<[string, (typeof tuning.invite)['newbie']]> = [
    ['newbie', tuning.invite.newbie],
    ['rewards.lv10', tuning.invite.rewards.lv10],
    ['rewards.lv30', tuning.invite.rewards.lv30],
  ];
  for (const [where, r] of inviteRewards) {
    for (const g of r.goods ?? [])
      if (!goodsIds.has(g.id)) errors.push(`invite.${where} references unknown goods ${g.id}`);
    for (const f of r.foods ?? [])
      if (!foodIds.has(f.id)) errors.push(`invite.${where} references unknown foods ${f.id}`);
  }
```

`features.ts` 的 `IMPLEMENTED_FEATURES` 加 `'redeem', 'invite'`。

- [ ] **Step 4：运行，确认通过**

Run: `cd packages/config && npx vitest run && cd ../.. && pnpm --filter @dt/config build`
Expected: PASS；build 成功。

- [ ] **Step 5：提交**

```bash
git add packages/config apps/server/src/core/features.ts
git commit -m "feat(config): 邀请奖励、兑换码数值；功能开关 redeem、invite"
```

---

### Task 2：共享类型——兑换码、邀请

**Files:**
- Create: `packages/shared/src/schemas/redeem.ts`, `packages/shared/src/schemas/invite.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Produces（`@dt/shared`）：
  - `REDEEM_CODE_RE = /^[A-Z0-9]{4,20}$/`；`redeemBody`（`{ code }`，去空格、转大写）；`RedeemResultDto = { code: string; items: RewardItems }`。
  - `createSharedCodeBody`：`{ code?, items, shardId?, minLevel?, maxUses?, startsAt?, endsAt?, note }`；`createBatchBody`：`{ count, items, shardId?, minLevel?, startsAt?, endsAt?, note }`；类型 `CreateSharedCodeInput`、`CreateBatchInput`。
  - `AdminCodeDto`：`{ id; kind: 'shared' | 'single'; code: string | null; batchId: number | null; count: number; usedCount: number; maxUses: number | null; items: RewardItems; shardId: number | null; minLevel: number | null; startsAt: string | null; endsAt: string | null; note: string; disabled: boolean; actor: string | null; createdAt: string }`。批次在列表里合成一行，`code` 为 null，`count` 是这批的码数。
  - `InviteDto = { code: string; monthCount: number; monthlyCap: number; invitees: InviteeDto[] }`；`InviteeDto = { restName: string | null; shardName: string | null; level: number | null; verified: boolean; lv10: InviteStatus | null; lv30: InviteStatus | null }`；`type InviteStatus = 'pending' | 'sent' | 'capped'`。

- [ ] **Step 1：写失败的测试**（追加到 `schemas.test.ts`）

```ts
describe('兑换码（子项目 6A-2）', () => {
  it('兑换：去空格、转大写；字符只能是字母数字', () => {
    expect(redeemBody.parse({ code: ' kaifu2026 ' }).code).toBe('KAIFU2026');
    expect(redeemBody.safeParse({ code: 'ab' }).success).toBe(false);
    expect(redeemBody.safeParse({ code: 'AB CD' }).success).toBe(false);
  });

  it('建通用码：自定码要合规；结束晚于开始；一批 1~1000 个', () => {
    const base = { items: { coin: 1 }, note: '开服' };
    expect(createSharedCodeBody.parse({ ...base, code: 'kaifu' }).code).toBe('KAIFU');
    expect(createSharedCodeBody.safeParse({ ...base, code: '开服' }).success).toBe(false);
    expect(
      createSharedCodeBody.safeParse({ ...base, startsAt: '2026-10-02T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(createBatchBody.safeParse({ ...base, count: 0 }).success).toBe(false);
    expect(createBatchBody.safeParse({ ...base, count: 1001 }).success).toBe(false);
    expect(createBatchBody.safeParse({ ...base, count: 5, items: { hats: [{ tier: 'jade', name: '大橘' }] } }).success).toBe(
      true,
    );
  });
});
```

import 里加 `redeemBody, createSharedCodeBody, createBatchBody`。

- [ ] **Step 2：运行，确认失败**

Run: `cd packages/shared && npx vitest run src/schemas/schemas.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现**

```ts
// packages/shared/src/schemas/redeem.ts
import { z } from 'zod';
import { rewardItems, type RewardItems } from './mail';

export const REDEEM_CODE_RE = /^[A-Z0-9]{4,20}$/;
const codeText = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(REDEEM_CODE_RE));

export const redeemBody = z.object({ code: codeText });
export interface RedeemResultDto {
  code: string;
  items: RewardItems;
}

const window = {
  shardId: z.number().int().positive().optional(),
  minLevel: z.number().int().min(1).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().max(200),
  items: rewardItems,
};
const windowOk = (b: { startsAt?: string; endsAt?: string }) =>
  !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt);

export const createSharedCodeBody = z
  .object({ ...window, code: codeText.optional(), maxUses: z.number().int().min(1).optional() })
  .refine(windowOk, { path: ['endsAt'], message: 'before_start' });
export type CreateSharedCodeInput = z.infer<typeof createSharedCodeBody>;

export const createBatchBody = z
  .object({ ...window, count: z.number().int().min(1).max(1000) })
  .refine(windowOk, { path: ['endsAt'], message: 'before_start' });
export type CreateBatchInput = z.infer<typeof createBatchBody>;

export interface AdminCodeDto {
  id: number;
  kind: 'shared' | 'single';
  /** 批次合成一行时为 null */
  code: string | null;
  batchId: number | null;
  count: number;
  usedCount: number;
  maxUses: number | null;
  items: RewardItems;
  shardId: number | null;
  minLevel: number | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string;
  disabled: boolean;
  actor: string | null;
  createdAt: string;
}
```

```ts
// packages/shared/src/schemas/invite.ts
export type InviteStatus = 'pending' | 'sent' | 'capped';
export interface InviteeDto {
  /** 被邀请人等级最高的那家店；还没开店为 null */
  restName: string | null;
  shardName: string | null;
  level: number | null;
  verified: boolean;
  lv10: InviteStatus | null;
  lv30: InviteStatus | null;
}
export interface InviteDto {
  code: string;
  monthCount: number;
  monthlyCap: number;
  invitees: InviteeDto[];
}
```

`index.ts` 加两行 `export *`。

- [ ] **Step 4：运行，确认通过**

Run: `cd packages/shared && npx vitest run && pnpm --filter @dt/shared typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add packages/shared
git commit -m "feat(shared): 兑换码、邀请的类型和校验"
```

---

### Task 3：兑换

**Files:**
- Create: `apps/server/src/modules/redeem/code.ts`, `redeem.ts`, `service.ts`, `routes.ts`, `redeem.test.ts`
- Modify: `apps/server/src/game.ts`, `apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `redeemBody`、`RedeemResultDto`（Task 2）；`grantRewardOp`；`tuning.redeem`（Task 1）。
- Produces:
  - `randomCode(len = 10): string`、`CODE_ALPHABET`（`code.ts`）。
  - `createRedeemService(d: GameDeps)`：`redeem(ctx, code): Promise<OpResult<RedeemResultDto>>`；`Game.redeem`。
  - 路由 `POST /redeem`。

**规则**（设计 裁定 13~17）：
1. 失败计数键 `redeem:fail:${accountId}`。计数 ≥ `failLimit` 时直接 `invalidState('too_many_tries')`，不再查码。
2. 查码。查不到：`incr` 失败计数（第一次设 `expire failWindowSec`），抛 `code_not_found`。只有"码不存在"计入失败次数，其他原因都说明码是真的。
3. 依次判断：`disabled_at` → `code_disabled`；`starts_at > op.now` → `code_not_started`；`ends_at <= op.now` → `code_expired`；`shard_id` 不等于本区服 → `code_wrong_shard`；`min_level > op.rest.level` → `code_level`（带 `{ level }`）。
4. `insert into redeem_use ... on conflict (code_id, rest_id) do nothing returning id`，没返回行 → `code_used`。
5. `update redeem_code set used_count = used_count + 1 where id = :id and (max_uses is null or used_count < max_uses) returning id`，没返回行 → `code_used_up`。抛错会回滚第 4 步的插入。
6. `grantRewardOp(o, items, { source: 'redeem', logType: 'redeem', logParams: { code } })`，返回 `{ code, items }`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/redeem/redeem.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { randomCode } from './code';

let t: TestGame;
let actor: number;
beforeAll(async () => {
  t = await createTestGame();
  actor = await createAccountRow(t.db);
});
afterAll(() => t.close());

const H = 3_600_000;
async function code(patch: Record<string, unknown> = {}): Promise<string> {
  const c = randomCode();
  await t.db
    .insertInto('redeem_code')
    .values({ code: c, kind: 'shared', items: JSON.stringify({ coin: 100 }), note: '', actor_account_id: actor, ...patch })
    .execute();
  return c;
}
const redeem = (ctx: Parameters<TestGame['game']['redeem']['redeem']>[0], c: string) => t.game.redeem.redeem(ctx, c);

describe('兑换（设计 裁定 13~17）', () => {
  it('随机码 10 位，不含 0/O/1/I', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it('通用码：当场到账，记流水和日志；同一家店第二次报已用过；别的店能用', async () => {
    const c = await code();
    const a = await newRestaurant(t, { patch: { coin: 0 } });
    const b = await newRestaurant(t, { patch: { coin: 0 } });
    expect((await redeem(a, c.toLowerCase())).data).toEqual({ code: c, items: { coin: 100 } });
    expect((await restRow(t, a.restaurantId)).coin).toBe(100);
    await expect(redeem(a, c)).rejects.toMatchObject({ params: { reason: 'code_used' } });
    await redeem(b, c);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'redeem')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ code: c });
  });

  it('各种失败原因', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 5 } });
    const now = t.clock.now.getTime();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ disabled_at: new Date() }, 'code_disabled'],
      [{ starts_at: new Date(now + H) }, 'code_not_started'],
      [{ ends_at: new Date(now - H) }, 'code_expired'],
      [{ shard_id: await createShard(t.db) }, 'code_wrong_shard'],
      [{ min_level: 10 }, 'code_level'],
    ];
    for (const [patch, reason] of cases)
      await expect(redeem(r, await code(patch))).rejects.toMatchObject({ params: { reason } });
    await expect(redeem(r, 'NOSUCHCODE')).rejects.toMatchObject({ params: { reason: 'code_not_found' } });
  });

  it('总次数用完报 code_used_up；一次性码只能用一次；并发不超发（Review Focus 1）', async () => {
    const c = await code({ max_uses: 1 });
    const rs = await Promise.all([1, 2, 3].map(() => newRestaurant(t)));
    const results = await Promise.allSettled(rs.map((r) => redeem(r, c)));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const row = await t.db.selectFrom('redeem_code').select('used_count').where('code', '=', c).executeTakeFirstOrThrow();
    expect(row.used_count).toBe(1);
    const same = await newRestaurant(t);
    const c2 = await code();
    const twice = await Promise.allSettled([redeem(same, c2), redeem(same, c2)]);
    expect(twice.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('同一账号连续输错 10 次后锁定，输对也先报 too_many_tries；有效码的失败不计数（Review Focus 2）', async () => {
    const r = await newRestaurant(t);
    const expired = await code({ ends_at: new Date(t.clock.now.getTime() - H) });
    for (let i = 0; i < 12; i++) await expect(redeem(r, expired)).rejects.toMatchObject({ params: { reason: 'code_expired' } });
    for (let i = 0; i < 10; i++) await expect(redeem(r, `WRONG${i}XX`)).rejects.toMatchObject({ params: { reason: 'code_not_found' } });
    await expect(redeem(r, await code())).rejects.toMatchObject({ params: { reason: 'too_many_tries' } });
  });

  it('关掉 redeem 开关时返回 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { redeem: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await newRestaurant(t, { shardId });
    await expect(redeem(r, await code())).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

`randomCode` 随机，测试里不同用例的码不会冲突。锁定用例的账号是新建的，Redis 键不会和其他用例冲突。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/redeem`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现**

```ts
// apps/server/src/modules/redeem/code.ts
import { randomInt } from 'node:crypto';

/** 去掉 0/O/1/I 这些容易看错的字符 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 10): string {
  return Array.from({ length: len }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}
```

`redeem.ts` 按"规则"实现 `redeemOp(o: Op, d: GameDeps, ctx: RestCtx, code: string): Promise<RedeemResultDto>`：
- 失败计数用 `d.redis.get`、`incr`、`expire`。
- 查码用 `o.tx.selectFrom('redeem_code').selectAll().where('code', '=', code)`。
- `items` 断言为 `RewardItems`。

`service.ts`：

```ts
export function createRedeemService(d: GameDeps) {
  return {
    redeem: (ctx: RestCtx, code: string) =>
      runOp(d, ctx, { feature: 'redeem', source: 'redeem' }, (o) => redeemOp(o, d, ctx, code)),
  };
}
export type RedeemService = ReturnType<typeof createRedeemService>;
```

`routes.ts`：`r.post('/redeem', async (req) => okOp(await svc.redeem(restCtxOf(req), parse(redeemBody, req.body).code)))`。

注册：`game.ts` 加 `redeem: createRedeemService(deps)`，`modules/index.ts` 加 `app.register(redeemRoutes(game.redeem), { prefix: '/api/v1' })`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/redeem && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src
git commit -m "feat(redeem): 兑换码兑换——各种失败原因、并发不超发、猜码锁定"
```

---

### Task 4：后台兑换码（建通用码、批量一次性码、列表、停用、导出）

**Files:**
- Create: `apps/server/src/modules/redeem/admin.ts`, `apps/server/src/modules/redeem/admin.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`, `apps/server/src/modules/admin/permissions.test.ts`

**Interfaces:**
- Consumes: `createSharedCodeBody`、`createBatchBody`、`AdminCodeDto`（Task 2）；`randomCode`（Task 3）；`checkRewardItems`。
- Produces（`/api/v1/admin`）：
  - `GET /codes?shardId=`（mod）：通用码逐行列出；一次性码按批合成一行（`count` = 这批的码数，`usedCount` = 已用数）。最近 100 行。
  - `POST /codes`（admin）：建通用码。没给 `code` 时随机生成；码已存在报 409 `CONFLICT`（`ErrorCode` 里的冲突码，以 `@dt/shared` 为准；没有就用 `VALIDATION_FAILED` 400，并在 ledger 记 Ruling）。
  - `POST /codes/batch`（admin）：生成 `count` 个一次性码，`max_uses = 1`，`batch_id` = 这批第一个码的 id。随机码撞重时重试。
  - `POST /codes/:id/disable`（admin）：停用；这个码属于某批时，整批停用。
  - `GET /codes/batches/:id/export`（admin）：返回 `{ codes: string[] }`。
  - 审计动作 `code.create`、`code.batch`、`code.disable`、`code.export`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/redeem/admin.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('后台兑换码（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());
  const post = (cookie: string, path: string, body: unknown) =>
    call(ctx.app, 'POST', `/api/v1/admin${path}`, { cookie, body });

  it('建通用码：自定码转大写；重复报错；不填就随机；mod 不能建', async () => {
    const mine = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    const r = await post(admin.cookie, '/codes', { code: mine.toLowerCase(), items: { coin: 1 }, note: '开服', maxUses: 100 });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ kind: 'shared', code: mine, maxUses: 100, usedCount: 0 });
    expect((await post(admin.cookie, '/codes', { code: mine, items: { coin: 1 }, note: '' })).status).toBeGreaterThanOrEqual(400);
    const rnd = await post(admin.cookie, '/codes', { items: { coin: 1 }, note: '' });
    expect(rnd.json.data.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect((await post(mod.cookie, '/codes', { items: { coin: 1 }, note: '' })).status).toBe(404);
    expect((await post(admin.cookie, '/codes', { items: { goods: [{ id: 999999, num: 1 }] }, note: '' })).status).toBe(400);
  });

  it('批量一次性码：列表合成一行；导出整批；停用一个就整批停用', async () => {
    const b = await post(admin.cookie, '/codes/batch', { count: 3, items: { hats: [{ tier: 'jade', name: '大橘' }] }, note: '赞助' });
    expect(b.status).toBe(200);
    expect(b.json.data).toMatchObject({ kind: 'single', code: null, count: 3, usedCount: 0, maxUses: 1 });
    const batchId = b.json.data.batchId as number;
    const ex = await call(ctx.app, 'GET', `/api/v1/admin/codes/batches/${batchId}/export`, { cookie: admin.cookie });
    expect(ex.json.data.codes).toHaveLength(3);
    expect((await call(ctx.app, 'GET', `/api/v1/admin/codes/batches/${batchId}/export`, { cookie: mod.cookie })).status).toBe(404);
    await post(admin.cookie, `/codes/${b.json.data.id}/disable`, {});
    const list = await call(ctx.app, 'GET', '/api/v1/admin/codes', { cookie: mod.cookie });
    expect(list.json.data.find((c: { batchId: number | null }) => c.batchId === batchId)).toMatchObject({ disabled: true, count: 3 });
    const rows = await ctx.deps.db.selectFrom('redeem_code').select('disabled_at').where('batch_id', '=', batchId).execute();
    expect(rows.every((r) => r.disabled_at !== null)).toBe(true);
  });
});
```

权限矩阵：在 `permissions.test.ts` 的 `beforeAll` 里插入一个通用码和一批一次性码（各 1 行，记下 `ids.codeId`、`ids.batchId`），`CASES` 加 5 条：
- `GET /api/v1/admin/codes`：mod
- `POST /api/v1/admin/codes`：admin，body `{ items: { coin: 1 }, note: '权限测试' }`
- `POST /api/v1/admin/codes/batch`：admin，body `{ count: 1, items: { coin: 1 }, note: '权限测试' }`
- `POST /api/v1/admin/codes/:id/disable`：admin
- `GET /api/v1/admin/codes/batches/:id/export`：admin

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/redeem/admin.test.ts apps/server/src/modules/admin/permissions.test.ts`
Expected: FAIL（404）。

- [ ] **Step 3：实现**

`redeem/admin.ts` 照 `mail/admin.ts` 的写法实现 `createAdminCodes(game)`：`list`、`createShared`、`createBatch`、`disable`、`exportBatch`。

- **列表**用一条 SQL：通用码逐行；一次性码 `group by batch_id`，取 `min(id)` 作 `id`、`count(*)` 作 `count`、`sum(used_count)` 作 `usedCount`、`bool_and(disabled_at is not null)` 作 `disabled`，其他字段取这批第一行。两部分 `union all` 后按 `created_at desc` 取 100 行。写不出一条 SQL 时，分两次查再在 JS 里合并排序。
- **建批**：在一个事务里逐个插入（撞唯一约束时换一个码重试，最多 5 次），第一个插入后拿到 id 作 `batch_id`，后面的直接带上，最后把第一行也更新上 `batch_id`。
- **停用**：`update redeem_code set disabled_at = now() where (id = :id or batch_id = (select batch_id from redeem_code where id = :id)) and disabled_at is null`。

`admin/routes.ts` 注册 5 个路由，id 用 `idParam`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/redeem apps/server/src/modules/admin`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src
git commit -m "feat(admin): 后台兑换码——通用码、批量一次性码、停用、导出"
```

---

### Task 5：邀请——扫描发奖和邀请好友页数据

**Files:**
- Create: `apps/server/src/modules/invite/scan.ts`, `apps/server/src/modules/invite/scan.test.ts`, `apps/server/src/modules/invite/service.ts`, `apps/server/src/modules/invite/routes.ts`
- Modify: `apps/server/src/modules/ops/scan.ts`, `apps/server/src/game.ts`, `apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: `sendMail`；`tuning.invite`（Task 1）；`InviteDto`（Task 2）；`CODE_ALPHABET`（Task 3）。
- Produces:
  - `scanInvites(game: Game, log: JobLogger, shardId: number): Promise<{ newbie: number; sent: number; pending: number; capped: number; failed: number }>`；`runOpsScan` 对每个开放区服在 `scanHats` 后调用它（区服关了 `invite` 开关就跳过）。
  - `createInviteService(d: GameDeps)`：`overview(ctx): Promise<InviteDto>`；路由 `GET /invite`；`Game.invite`。

**规则**（设计 §7 第 1~3 步、裁定 18~21）。月份 `month = gameDay(game.deps.now()).slice(0, 7)`，下面每一项各自一个事务，出错记日志、计 `failed`：
1. **新手礼包**：有 `invited_by`、还没有 `newbie` 记录的账号，取其非 NPC 的店里 id 最小的那家，并且这家在本区服。
   - `insert into invite_reward (invitee_account_id, stage='newbie', inviter_account_id=null, shard_id, invitee_rest_id, status='sent', month, sent_at=now()) on conflict do nothing returning`。
   - 插入成功就 `sendMail(scope 'rest', title '欢迎来到小镇', body '你是被朋友邀请来的，送你一份新手礼包。', items tuning.invite.newbie, source 'invite')`，再回写 `mail_id`。
2. **邀请人奖励**：对 `lv10`、`lv30` 两档（等级取 `tuning.invite.levels`）。找出已验证邮箱、有邀请人、本区服有非 NPC 店达到该等级、还没有这档记录的被邀请人，每人取一家：`distinct on (a.id)`，按等级降序、id 升序。在事务里：
   - `pg_advisory_xact_lock(hashtext('invite:' || inviter))`。
   - 本月已计 = `select count(distinct invitee_account_id) from invite_reward where inviter_account_id = :inviter and month = :month and status in ('sent', 'pending')`。这个被邀请人本月已经在名单里时不受上限限制。
   - 超上限：插入 `capped`。
   - 否则看邀请人在本区服有没有非 NPC 店（取 id 最小的）：
     - 有：插入 `sent`，发邮件（title '邀请奖励'，body `你邀请的「${店名}」达到 ${level} 级，感谢你把朋友带到小镇！`，items `tuning.invite.rewards[stage]`，source 'invite'），回写 `mail_id`。
     - 没有：插入 `pending`。
   - 插入都用 `on conflict do nothing`。
3. **补发待发**：本区服 `status = 'pending'` 并且邀请人现在在本区服有店的记录。在事务里 `update ... set status = 'sent', sent_at = now() where ... and status = 'pending' returning`，然后发邮件。待发不再重新判断上限。

**邀请好友页**（`overview`）：
- 账号的 `invite_code` 为空时生成一个 8 位码写回（照 `account/service.ts` 的 `createInviteCode`，但只在为空时写：`update account set invite_code = :code where id = :id and invite_code is null`，撞唯一约束就重试；写不进去说明已经有了，重新读）。
- `monthCount` 按上面同样的口径计。
- `invitees`：`invited_by = 我` 的账号，最多 100 个，按注册时间倒序。每人取等级最高的店（含区服名），`verified = email_verified_at is not null`，`lv10`、`lv30` 取 `invite_reward` 里的状态。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/invite/scan.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { scanInvites } from './scan';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = { error: vi.fn() };
const invite = (invitee: number, inviter: number) =>
  t.db.updateTable('account').set({ invited_by: inviter }).where('id', '=', invitee).execute();
const verify = (accountId: number) =>
  t.db.updateTable('account').set({ email_verified_at: new Date() }).where('id', '=', accountId).execute();
const mails = (restId: number) =>
  t.db.selectFrom('mail').select(['title', 'items']).where('rest_id', '=', restId).where('source', '=', 'invite').execute();
const reward = (invitee: number, stage: string) =>
  t.db
    .selectFrom('invite_reward')
    .selectAll()
    .where('invitee_account_id', '=', invitee)
    .where('stage', '=', stage as 'lv10')
    .executeTakeFirst();

describe('邀请扫描（设计 §7）', () => {
  it('新手礼包只发一次，发到被邀请人最先开的店', async () => {
    const shardId = await createShard(t.db);
    const inviter = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    await invite(b.accountId, inviter.accountId);
    expect((await scanInvites(t.game, log, shardId)).newbie).toBe(1);
    expect((await scanInvites(t.game, log, shardId)).newbie).toBe(0);
    expect((await mails(b.restaurantId)).map((m) => m.title)).toEqual(['欢迎来到小镇']);
  });

  it('10 级、30 级：要验证邮箱；先升级后验证时补发；奖励发到邀请人同区服的店', async () => {
    const shardId = await createShard(t.db);
    const inviter = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId, patch: { level: 30 } });
    await invite(b.accountId, inviter.accountId);
    await scanInvites(t.game, log, shardId);
    expect(await reward(b.accountId, 'lv10')).toBeUndefined();
    await verify(b.accountId);
    const r = await scanInvites(t.game, log, shardId);
    expect(r.sent).toBe(2);
    expect((await mails(inviter.restaurantId)).map((m) => m.title)).toEqual(['邀请奖励', '邀请奖励']);
    expect(await reward(b.accountId, 'lv30')).toMatchObject({ status: 'sent', month: gameDay(t.clock.now).slice(0, 7) });
  });

  it('邀请人在该区服没店：记待发；开店后的下一次扫描补发（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const inviterHome = await newRestaurant(t);
    const b = await newRestaurant(t, { shardId, patch: { level: 10 } });
    await invite(b.accountId, inviterHome.accountId);
    await verify(b.accountId);
    expect((await scanInvites(t.game, log, shardId)).pending).toBe(1);
    expect(await reward(b.accountId, 'lv10')).toMatchObject({ status: 'pending' });
    const there = await t.db
      .insertInto('restaurant')
      .values({ shard_id: shardId, account_id: inviterHome.accountId, name: `邀${Date.now() % 100000}`, level: 1 } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    expect((await scanInvites(t.game, log, shardId)).sent).toBe(1);
    expect(await mails(there.id)).toHaveLength(1);
  });

  it('每月上限：同一被邀请人两档只计 1 人，第 21 人记 capped（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const inviter = await newRestaurant(t, { shardId });
    const friends = [];
    for (let i = 0; i < 21; i++) {
      const f = await newRestaurant(t, { shardId, patch: { level: 30 }, verified: true });
      await invite(f.accountId, inviter.accountId);
      friends.push(f);
    }
    await scanInvites(t.game, log, shardId);
    const statuses = await t.db
      .selectFrom('invite_reward')
      .select(['invitee_account_id', 'stage', 'status'])
      .where('inviter_account_id', '=', inviter.accountId)
      .execute();
    expect(statuses.filter((s) => s.status === 'sent')).toHaveLength(40);
    expect(statuses.filter((s) => s.status === 'capped')).toHaveLength(2);
    expect(new Set(statuses.filter((s) => s.status === 'capped').map((s) => s.invitee_account_id)).size).toBe(1);
  });
});
```

`newRestaurant` 的 `patch` 要能设 `level`（`createRestaurantFull` 支持 `patch`）。如果插入餐厅行要更多必填列，就改用 `createRestaurantFull(t.db, shardId, accountId, {})` 给邀请人在该区开店，测试里两种写法都可以。

邀请好友页测试（同一文件，追加）：

```ts
describe('邀请好友页', () => {
  it('邀请码生成一次后不变；列出被邀请人和各档状态、本月已计人数', async () => {
    const shardId = await createShard(t.db);
    const me = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId, patch: { level: 12 }, verified: true });
    await invite(b.accountId, me.accountId);
    await scanInvites(t.game, log, shardId);
    const first = await t.game.invite.overview(me);
    expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await t.game.invite.overview(me)).code).toBe(first.code);
    expect(first.monthCount).toBe(1);
    expect(first.monthlyCap).toBe(20);
    expect(first.invitees).toEqual([
      expect.objectContaining({ level: 12, verified: true, lv10: 'sent', lv30: null }),
    ]);
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/invite`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现**

- 按"规则"写 `scan.ts` 和 `service.ts`。
- `ops/scan.ts` 的 `runOpsScan`：每个区服先 `scanHats`；区服的 `invite` 开关开着时（`featureAvailable(await game.shards.settings(id), 'invite')`）再 `scanInvites`。
- `routes.ts`：`r.get('/invite', async (req) => ok(await svc.overview(restCtxOf(req))))`；`overview` 开头 `ensureFeature(ctx.shardId, 'invite')`。
- 注册到 `game.ts`、`modules/index.ts`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/invite apps/server/src/modules/ops`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server/src
git commit -m "feat(invite): 邀请扫描——新手礼包、10/30 级奖励、待发补发、每月上限；邀请好友页数据"
```

---

### Task 6：邮箱小问题（已排期）——附件失效的邮件、一键领取记日志

**Files:**
- Modify: `apps/server/src/modules/mail/rules.ts`, `inbox.ts`, `service.ts`, `routes.ts`, `inbox.test.ts`; `packages/shared/src/schemas/mail.ts`; `apps/web/src/views/MailView.vue`, `MailView.test.ts`; `apps/web/src/i18n/zh-CN.ts`

**Interfaces:**
- Produces:
  - `MailDto.broken: boolean`：附件里有配置中已不存在的道具或食材。
  - `claimBlock` 新增 `'mail_broken'`，排在"没附件"之后、"已领"之前。
  - `claimAll(ctx, log?)`：已领、已失效的不计入；其他意外错误计 `failed`，并 `log.error({ err, mailId }, 'mail claim failed')`。路由把 `req.log` 传进去。

- [ ] **Step 1：写失败的测试**

`inbox.test.ts` 里把"一键全领：一封出错不影响其他"改为：

```ts
  it('附件里的道具已从配置删除：标成失效，不能领，一键领取跳过它（Review Focus 5）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await shardMail(shardId);
    const bad = await shardMail(shardId, { items: { goods: [{ id: 999999, num: 1 }] } });
    const m = (await mailSvc().list(r)).items.find((x) => x.id === bad)!;
    expect(m.broken).toBe(true);
    await expect(mailSvc().claim(r, bad)).rejects.toMatchObject({ params: { reason: 'mail_broken' } });
    const res = await mailSvc().claimAll(r);
    expect(res.data).toMatchObject({ claimed: 1, failed: 0 });
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
  });
```

`MailView.test.ts` 追加：

```ts
  it('附件失效的邮件不显示领取按钮，写明失效，可以删除；不计入一键领取', async () => {
    vi.mocked(endpoints.mail).mockResolvedValue({
      items: [mail({ id: 9, broken: true })],
      unread: 0,
      level: 5,
    });
    const w = mount(MailView);
    await flushPromises();
    expect(w.find('[data-testid="mail-claim-9"]').exists()).toBe(false);
    expect(w.find('[data-testid="mail-delete-9"]').exists()).toBe(true);
    expect(w.text()).toContain('附件已失效');
    expect(w.find('[data-testid="mail-claim-all"]').attributes('disabled')).toBeDefined();
  });
```

测试里的 `mail()` 默认值加 `broken: false`。删除测试也补一条：失效邮件能删（服务端 `removeMail` 对 `broken` 的邮件放行）。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/mail apps/web/src/views/MailView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

- `inbox.ts` 的 `visibleMails` 需要配置判断 `broken`：签名改为 `visibleMails(db, config, rest, opts)`。`broken` 的判断是附件里任一 `goods` 不在 `config.goods`，或任一 `foods` 不在 `config.foods`。调用方都传 `d.config` 或 `o.config`。
- `claimBlock` 的参数加 `broken`：在 `!hasItems` 判断之后返回 `'mail_broken'`。
- `removeMail`：`broken` 时也允许删除。
- `claimAll`：
  - 抓到的错误是 `AppError`、`code` 为 `INVALID_STATE`、`params.reason` 为 `mail_claimed` 时，不计失败（别的标签页抢先领了）。
  - 其他错误计 `failed`，并调用 `log?.error(...)`。
- `routes.ts`：`svc.claimAll(restCtxOf(req), req.log)`。
- `MailView.vue`：
  - `claimable(m)` 加上 `!m.broken`。
  - 失效的邮件显示 `<span class="text-danger">· 附件已失效，请联系运营</span>`，按钮显示"删除"。
- `zh-CN.ts`：`mail_broken: '这封邮件的附件已失效，请联系运营'`。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/mail apps/web/src/views/MailView.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps packages/shared
git commit -m "fix(mail): 附件失效的邮件标出来、不能领、不卡一键领取；一键领取的意外错误记日志"
```

---

### Task 7：后台附件编辑器小问题（已排期）——没名字的帽子、确认框列附件

**Files:**
- Modify: `apps/web/src/components/admin/RewardItemsEditor.vue`, `RewardItemsEditor.test.ts`, `apps/web/src/views/admin/AdminMailView.vue`, `AdminMailView.test.ts`

**Interfaces:**
- Produces: 编辑器里有帽子行没填名字时，`over` 事件带上"第 N 顶帽子没填名字"，父组件据此禁止提交。邮件页的发送确认框末尾带"附件：{rewardSummary}"，没有附件时写"无附件"。

- [ ] **Step 1：写失败的测试**

`RewardItemsEditor.test.ts` 追加：

```ts
  it('帽子行没填名字时报出来，父组件据此禁止提交', async () => {
    const w = mount(RewardItemsEditor, { props: { modelValue: {}, hats: true } });
    await w.find('[data-testid="ri-add-hat"]').trigger('click');
    expect(w.emitted('over')!.at(-1)![0]).toEqual(['第 1 顶帽子没填名字']);
    await w.find('[data-testid="ri-hat-name-0"]').setValue('大橘');
    expect(w.emitted('over')!.at(-1)![0]).toEqual([]);
  });
```

`AdminMailView.test.ts` 的第一个用例加断言：`expect(ask.mock.calls[0]![0]).toContain('附件：银币 100');`。

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/components/admin src/views/admin/AdminMailView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

- 编辑器的 `overLimit` 计算里，在 `props.hats` 为 true 时，遍历 `hatRows`，名字去空格后为空的追加 `第 ${i + 1} 顶帽子没填名字`。
- 父组件的 `over` 列表文案前缀"超出上限："改成"请检查："（编辑器里显示超限的那一行同步改）。
- 邮件页 `confirmText()` 之后拼 `；附件：${Object.keys(rewards.value).length ? rewardSummary(rewards.value, catalog) : '无附件'}`。

补偿页的测试里如果断言了"超出上限："的原文，同步改成"请检查："。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "fix(admin): 帽子没填名字不能发送；发邮件确认框列出附件"
```

---

### Task 8：前端——兑换框、邀请好友页、注册页带码

**Files:**
- Create: `apps/web/src/components/RedeemBox.vue`, `apps/web/src/components/RedeemBox.test.ts`, `apps/web/src/views/InviteView.vue`, `apps/web/src/views/InviteView.test.ts`
- Modify: `apps/web/src/views/MailView.vue`, `apps/web/src/views/RegisterView.vue`, `apps/web/src/views/RegisterView.test.ts`, `apps/web/src/components/MoreLinks.vue`, `apps/web/src/views/MoreView.test.ts`, `apps/web/src/router.ts`, `apps/web/src/api/endpoints.ts`, `apps/web/src/i18n/zh-CN.ts`

**Interfaces:**
- Consumes: `POST /redeem`（Task 3）、`GET /invite`（Task 5）。
- Produces:
  - `endpoints.redeem(code)`、`endpoints.invite()`。
  - `<RedeemBox @redeemed />`：输入框 `data-testid="redeem-input"`，按钮 `redeem-go`；成功后显示"兑换成功：{rewardSummary}"，清空输入，发出 `redeemed`。
  - 路由 `/invite`（`needRestaurant`）；"更多"的"其他"组加 `{ to: '/invite', icon: 'bi-person-plus', label: '邀请好友' }`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/components/RedeemBox.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { ApiError } from '../api/client';
import RedeemBox from './RedeemBox.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { redeem: vi.fn() } }));

describe('RedeemBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('兑换成功写明得到什么、清空输入并通知父组件；失败写原因', async () => {
    vi.mocked(endpoints.redeem).mockResolvedValue({ code: 'KAIFU', items: { coin: 100 } });
    const w = mount(RedeemBox);
    await w.find('[data-testid="redeem-input"]').setValue(' kaifu ');
    await w.find('[data-testid="redeem-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.redeem).toHaveBeenCalledWith('kaifu');
    expect(w.text()).toContain('兑换成功：银币 100');
    expect((w.find('[data-testid="redeem-input"]').element as HTMLInputElement).value).toBe('');
    expect(w.emitted('redeemed')).toHaveLength(1);
    vi.mocked(endpoints.redeem).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'code_used' }));
    await w.find('[data-testid="redeem-input"]').setValue('KAIFU');
    await w.find('[data-testid="redeem-go"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('这个兑换码你已经用过了');
  });
});
```

（`ApiError` 的导入路径和构造参数以 `api/client.ts` 为准，照 `DevilPanel.test.ts` 里的用法。）

```ts
// apps/web/src/views/InviteView.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import InviteView from './InviteView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { invite: vi.fn() } }));

describe('InviteView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.invite).mockResolvedValue({
      code: 'ABCD2345',
      monthCount: 3,
      monthlyCap: 20,
      invitees: [
        { restName: '小明的店', shardName: '一服', level: 12, verified: true, lv10: 'sent', lv30: null },
        { restName: null, shardName: null, level: null, verified: false, lv10: null, lv30: null },
      ],
    });
  });

  it('显示邀请码、带码的注册链接、本月已计人数和被邀请人进度', async () => {
    const w = mount(InviteView);
    await flushPromises();
    expect(w.find('[data-testid="invite-code"]').text()).toBe('ABCD2345');
    expect(w.find('[data-testid="invite-link"]').text()).toContain('/register?invite=ABCD2345');
    expect(w.text()).toContain('本月已计 3 / 20');
    expect(w.text()).toContain('小明的店');
    expect(w.text()).toContain('10 级奖励已发');
    expect(w.text()).toContain('还没开店');
    expect(w.text()).toContain('还没验证邮箱');
  });
});
```

`RegisterView.test.ts` 追加：路由带 `?invite=ABCD2345` 时，邀请码输入框的值是 `ABCD2345`。

`MoreView.test.ts` 的入口列表断言加 `'邀请好友'`。

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/components/RedeemBox.test.ts src/views/InviteView.test.ts src/views/RegisterView.test.ts src/views/MoreView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

- `endpoints.ts`：`redeem: (code: string) => api.post<RedeemResultDto>('/api/v1/redeem', { code })`，`invite: () => api.get<InviteDto>('/api/v1/invite')`。
- `RedeemBox.vue`：输入框加按钮，带 `busy`；成功和失败都在框下面用一行文字显示（成功 `text-success`，失败 `text-danger`），不用弹出提示。
- `MailView.vue`：在 `<slot name="top" />` 处放 `<RedeemBox @redeemed="load" />`；去掉插槽。
- `InviteView.vue`：
  - 标题"邀请好友"。
  - 邀请码（`invite-code`）和"复制"按钮（`navigator.clipboard.writeText`，失败时提示手动复制）。
  - 注册链接（`invite-link`）= `${location.origin}/register?invite=${code}`，也能复制。
  - 规则说明一行：好友开店得新手礼包；好友验证邮箱后到 10 级、30 级，你各得一份奖励；每月最多计 20 人。
  - "本月已计 x / 20"。
  - 被邀请人列表：
    - 店名（没开店写"还没开店"）、区服、等级；
    - 未验证邮箱写"还没验证邮箱"；
    - 两档状态：`sent` →"N 级奖励已发"，`pending` →"N 级奖励待发（你在该区开店后补发）"，`capped` →"N 级奖励超出本月上限"。
- `RegisterView.vue`：`form.inviteCode` 的初值取 `typeof route.query.invite === 'string' ? route.query.invite : ''`（需要 `useRoute`）。
- `MoreLinks.vue`、`router.ts` 按 Interfaces 加。
- `zh-CN.ts` 的 `STATE` 加：
  - `code_not_found`：兑换码不存在
  - `code_not_started`：兑换码还没到开始时间
  - `code_expired`：兑换码已过期
  - `code_used_up`：兑换码已被领完
  - `code_used`：这个兑换码你已经用过了
  - `code_wrong_shard`：这个兑换码不能在本区服使用
  - `code_disabled`：兑换码已停用
  - `too_many_tries`：输错太多次了，请一小时后再试

  `code_level` 带等级参数，照 `mail_level` 的写法：`兑换码要求 {level} 级`。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run && cd ../.. && pnpm --filter @dt/web typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(web): 邮箱页兑换码、邀请好友页、注册链接自动填邀请码"
```

---

### Task 9：后台兑换码页

**Files:**
- Create: `apps/web/src/views/admin/AdminCodesView.vue`, `apps/web/src/views/admin/AdminCodesView.test.ts`
- Modify: `apps/web/src/api/admin.ts`, `apps/web/src/views/admin/AdminLayout.vue`, `apps/web/src/router.ts`

**Interfaces:**
- Consumes: 后台兑换码接口（Task 4）；`RewardItemsEditor`（含 Task 7 的帽子校验）。
- Produces:
  - `adminApi.codes(shardId?)`、`createCode(b)`、`createCodeBatch(b)`、`disableCode(id)`、`exportCodeBatch(batchId)`。
  - 路由 `/admin/codes`；后台导航在"公告"后加"兑换码"。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/views/admin/AdminCodesView.test.ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCodeDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminCodesView from './AdminCodesView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { codes: vi.fn(), createCode: vi.fn(), createCodeBatch: vi.fn(), disableCode: vi.fn(), exportCodeBatch: vi.fn() },
}));

const batch: AdminCodeDto = {
  id: 7,
  kind: 'single',
  code: null,
  batchId: 7,
  count: 3,
  usedCount: 1,
  maxUses: 1,
  items: { hats: [{ tier: 'jade', name: '大橘' }] },
  shardId: null,
  minLevel: null,
  startsAt: null,
  endsAt: null,
  note: '赞助',
  disabled: false,
  actor: 'boss',
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('AdminCodesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.codes).mockResolvedValue([batch]);
    vi.mocked(adminApi.createCode).mockResolvedValue({ ...batch, kind: 'shared', code: 'KAIFU', batchId: null });
    vi.mocked(adminApi.exportCodeBatch).mockResolvedValue({ codes: ['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC'] });
  });

  it('建通用码：自定码、次数上限、当前区服；附件来自编辑器', async () => {
    const w = mount(AdminCodesView);
    await flushPromises();
    await w.find('[data-testid="code-kind"]').setValue('shared');
    await w.find('[data-testid="code-text"]').setValue('kaifu');
    await w.find('[data-testid="code-max"]').setValue('100');
    await w.find('[data-testid="code-scope"]').setValue('shard');
    await w.find('[data-testid="code-note"]').setValue('开服');
    await w.find('[data-testid="ri-coin"]').setValue('100');
    await w.find('[data-testid="code-create"]').trigger('click');
    await flushPromises();
    expect(adminApi.createCode).toHaveBeenCalledWith({
      code: 'KAIFU',
      maxUses: 100,
      shardId: 1,
      note: '开服',
      items: { coin: 100 },
    });
  });

  it('批次一行显示已用 1/3 和附件；导出显示整批的码；停用要确认', async () => {
    const w = mount(AdminCodesView);
    await flushPromises();
    expect(w.text()).toContain('1 / 3');
    expect(w.text()).toContain('玉•大橘之帽');
    await w.find('[data-testid="code-export-7"]').trigger('click');
    await flushPromises();
    expect((w.find('[data-testid="code-export-text"]').element as HTMLTextAreaElement).value).toBe(
      'AAAAAAAAAA\nBBBBBBBBBB\nCCCCCCCCCC',
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await w.find('[data-testid="code-disable-7"]').trigger('click');
    expect(adminApi.disableCode).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/views/admin/AdminCodesView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

`AdminCodesView.vue`：
- **表单**：
  - 种类下拉 `code-kind`：通用码 `shared` / 一次性码 `single`。
  - 通用码：自定码 `code-text`（可空，空就随机；提交时转大写）、次数上限 `code-max`（可空）。一次性码：数量 `code-count`（1~1000）。
  - 范围 `code-scope`：全部区服 / 当前区服。
  - 等级门槛、开始和结束时间（`datetime-local`，可空，转 ISO）、备注 `code-note`。
  - 附件 `<RewardItemsEditor :hats="true" />`。
  - 按钮 `code-create`。有附件提示（`over` 非空）或没有附件时禁用。
- **列表**：码（批次写"一次性码 ×N"）、范围、附件摘要、已用"x / N"（通用码不限次数时写"x / 不限"）、时间段、备注、状态、操作人、操作（停用 `code-disable-{id}`、批次的导出 `code-export-{id}`）。
- **导出**：把整批码填进只读的 `textarea`（`code-export-text`，每行一个），旁边"复制全部"和"下载 .txt"（`Blob` + 临时链接）。
- 只有 admin 看到表单和操作按钮。

`api/admin.ts` 加 5 个方法，路径同 Task 4；导航和路由照 6A-1 的写法加。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run && cd ../.. && pnpm typecheck && pnpm lint`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src
git commit -m "feat(admin): 后台兑换码页——建码、批量一次性码、导出、停用"
```

---

### Task 10：e2e、文档、全量检查

**Files:**
- Create: `apps/web/e2e/codes.spec.ts`
- Modify: `docs/deploy.md`, `docs/rules/邮箱和公告.md`

- [ ] **Step 1：写 e2e**

```ts
// apps/web/e2e/codes.spec.ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

/** 只操作本用例新注册的账号：自己设为管理员，建一个只给自己用的码 */
test('后台建兑换码 → 玩家在邮箱页兑换；带邀请链接注册的新号邮箱里有新手礼包', async ({ page, request, browser }) => {
  const { username } = await registerAndOpen(page, request);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`update account set role = 'admin' where lower(username) = lower($1)`, [username]);
  } finally {
    await client.end();
  }
  const code = `E2E${Date.now().toString(36).toUpperCase()}`.slice(0, 16);
  const made = await page.request.post('/api/v1/admin/codes', {
    data: { code, maxUses: 1, items: { coin: 4321 }, note: 'e2e' },
  });
  expect(made.ok()).toBe(true);
  await page.goto('/mail');
  await page.getByTestId('redeem-input').fill(code.toLowerCase());
  await page.getByTestId('redeem-go').click();
  await expect(page.getByText('兑换成功：银币 4,321')).toBeVisible();

  await page.goto('/invite');
  const link = (await page.getByTestId('invite-link').innerText()).trim();
  const inviteCode = new URL(link).searchParams.get('invite')!;
  // 新开一个浏览器上下文注册被邀请人
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await registerAndOpen(page2, request, { inviteCode });
  // worker 每分钟扫描一次：最多等 70 秒
  await expect(async () => {
    await page2.goto('/mail');
    await expect(page2.getByText('欢迎来到小镇')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 70_000, intervals: [5_000] });
  await ctx2.close();
});
```

`registerAndOpen` 现在不支持邀请码：在 `e2e/helpers.ts` 给它加可选参数 `opts: { inviteCode?: string } = {}`，填表时 `page.getByPlaceholder('邀请码（可不填）').fill(opts.inviteCode)`。不传时行为不变。给这个用例设 `test.setTimeout(150_000)`。

- [ ] **Step 2：运行 e2e**

Run: `pnpm --filter @dt/web e2e`（dev 服务在跑，worker 是新代码）
Expected: 18 passed。

- [ ] **Step 3：写文档**

`docs/deploy.md` 的 6A-1 小节后加"兑换码、邀请（子项目 6A-2）"：
- 新功能开关 `features.redeem`、`features.invite`（默认开）；
- `tuning.invite`（每月上限、两档等级、新手礼包和两档奖励）和 `tuning.redeem`（失败上限、窗口、每批上限）；
- worker `ops-scan` 现在也发邀请奖励；
- Redis 键 `redeem:fail:{账号}` 记一小时内输错兑换码的次数；
- 后台导出一次性码只有 admin 能做，并记审计。

`docs/rules/邮箱和公告.md` 加两节：
- **兑换码**：在邮箱页输入；当场到账；同一家店一个码只能用一次；一小时输错 10 次要等。
- **邀请好友**：分享注册链接；好友开店得新手礼包；好友验证邮箱后到 10 级、30 级，你各得一份奖励（发到你在好友那个区服的店，没有店就等你开店后补发）；每月最多计 20 人。

- [ ] **Step 4：全量检查**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm --filter @dt/web e2e`
Expected: 全部通过。

- [ ] **Step 5：提交**

```bash
git add apps/web/e2e docs
git commit -m "test(e2e): 兑换码兑换、邀请链接注册后收到新手礼包；docs: 兑换码和邀请规则、部署说明"
```
