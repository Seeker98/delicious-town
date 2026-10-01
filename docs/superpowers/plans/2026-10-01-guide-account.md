# 游玩指引、新手码、菜园姐、我的账号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加游玩指引页和配置定义的新手兑换码（150）、菜场吉祥物菜园姐（176）、"我的账号"页和改密码（178），顺带修功能开关排版（184）和仓库排序（186）。

**Architecture:** 新手码写在配置 overlay `game/newbie_codes.json`，构建时校验，服务端启动时同步进 `redeem_code` 表，指引页通过新接口读状态、用现有兑换接口领取。账号页用两个新接口（profile、change-password）。菜园姐台词和仓库排序都是网页端纯函数，服务端不改。

**Tech Stack:** TS strict、Fastify 5、Kysely/Postgres、Redis、Vue 3 + Pinia + Bootstrap 5、Vitest、Playwright、zod。

**Spec:** `docs/superpowers/specs/2026-10-01-guide-account-design.md`

## Global Constraints

- 回复和文案都用中文；不修改、不提交 `问题记录.md`。
- 配置 overlay 文件（`packages/config/data/game/*.json`）不进 prettier；改完要 `pnpm --filter @dt/config build` 重新生成 bundle，服务端测试才能读到。
- 新手码：所有区服通用（`shard_id = null`）、`kind = 'shared'`、`max_uses = null`、每家店一次；操作者是系统账号 `~krab`。
- 同步不碰 `disabled_at`、`used_count`；手动建的同名码（操作者不是系统账号）不覆盖、打警告；同步失败不阻止启动。
- 改密码：旧密码错报 `invalidState('wrong_password')`（不用 401）；新旧相同报 `invalidState('same_password')`；`rateLimit: 'auth'`；成功后其他会话失效、本机新会话保留区服选择。
- 指引页、账号页只要求登录，不要求选区服或开店。
- vitest 从仓库根目录跑；e2e 只动自己注册的账号。

## Review Focus

1. 后台手动停用的新手码重启后不能被同步重新启用；指引页显示"已结束"。
2. 改密码后，当前设备不用重新选区服就能继续玩（新会话带上原来的 shardId/restaurantId）；其他设备掉线。
3. 没开店的人打开指引页：不请求新手码接口，不报错，显示"开店后可以领"。
4. 新手码配置里的道具 id 被删了：构建直接报错，而不是线上领取时报"码已失效"。
5. 仓库里同时有过期时间和没有过期时间的道具时，排序稳定（有时间的在前、短的在前），选分类后也一致。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `packages/config/data/game/newbie_codes.json`（新） | 新手码数据 |
| `packages/config/src/raw.ts` | `newbieCodesFile` schema |
| `packages/config/src/source.ts` | 读 `game/newbie_codes` |
| `packages/config/src/newbieCodes.ts`（新） | `checkNewbieCodes` 校验 |
| `packages/config/src/build.ts`、`types.ts`、`runtime.ts` | 接进 bundle 和 runtime |
| `apps/server/src/modules/redeem/newbie.ts`（新） | `syncNewbieCodes`、`guideCodes` |
| `apps/server/src/modules/npc/npc.ts` | 导出 `npcAccountId` |
| `apps/server/src/main.ts` | 启动时同步 |
| `apps/server/src/modules/redeem/{service,routes}.ts` | `GET /guide/codes` |
| `apps/server/src/modules/account/{service,routes}.ts` | profile、change-password |
| `packages/shared/src/schemas/{redeem,auth}.ts` | DTO 和请求体 |
| `apps/web/src/views/GuideView.vue`（新） | 指引页 |
| `apps/web/src/views/AccountView.vue`（新） | 账号页 |
| `apps/web/src/components/market/GardenSis.vue`、`utils/gardenSis.ts`（新） | 菜园姐 |
| `apps/web/src/utils/storeSort.ts`（新） | 仓库排序 |
| `apps/web/src/views/admin/AdminShardView.vue`、`styles` | 功能开关网格 |
| `apps/web/e2e/guide.spec.ts`（新） | e2e |

---

### Task 1: 新手码配置和构建校验

**Files:**
- Create: `packages/config/data/game/newbie_codes.json`
- Create: `packages/config/src/newbieCodes.ts`
- Create: `packages/config/src/newbieCodes.test.ts`
- Modify: `packages/config/src/raw.ts`（`settingDocsFile` 旁边）
- Modify: `packages/config/src/source.ts`（`SOURCE_FILES` 加 `'game/newbie_codes'`）
- Modify: `packages/config/src/build.ts`（parse、空值检查、校验、bundle body）
- Modify: `packages/config/src/types.ts`（`ConfigBundle.newbieCodes`）
- Modify: `packages/config/src/runtime.ts`（`readonly newbieCodes`）
- Modify: `packages/config/src/index.ts`（导出类型 `NewbieCode`）

**Interfaces:**
- Produces: `type NewbieCode = { code: string; minLevel: number; items: RewardItems; note: string }`；`GameConfig.newbieCodes: readonly NewbieCode[]`；`checkNewbieCodes(file, goodsIds: Set<number>, foodIds: Set<number>, errors: string[]): void`

- [ ] **Step 1: 写失败的测试** `packages/config/src/newbieCodes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { checkNewbieCodes } from './newbieCodes';
import { defaultDataDir, readSourceDir } from './source';

const goods = new Set([1, 28, 29]);
const foods = new Set([10]);
const run = (codes: unknown[]) => {
  const errors: string[] = [];
  checkNewbieCodes({ codes } as never, goods, foods, errors);
  return errors;
};
const ok = { code: 'XINSHOU', minLevel: 1, items: { coin: 100 }, note: '' };

describe('新手码配置（设计 §4.1）', () => {
  it('合法的码没有错误', () => {
    expect(run([ok, { ...ok, code: 'XINSHOU10', items: { goods: [{ id: 28, num: 3 }] } }])).toEqual([]);
  });
  it('码格式不对、重复', () => {
    expect(run([{ ...ok, code: 'ab' }])).toContain('newbie_codes ab: bad code');
    expect(run([ok, ok])).toContain('newbie_codes XINSHOU: duplicate');
  });
  it('奖励为空、道具或食材不存在', () => {
    expect(run([{ ...ok, items: {} }])).toContain('newbie_codes XINSHOU: bad items');
    expect(run([{ ...ok, items: { goods: [{ id: 999, num: 1 }] } }])).toContain(
      'newbie_codes XINSHOU: unknown goods 999',
    );
    expect(run([{ ...ok, items: { foods: [{ id: 998, num: 1 }] } }])).toContain(
      'newbie_codes XINSHOU: unknown foods 998',
    );
  });
  it('真实数据：三档，构建通过，进了 bundle', () => {
    const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
    expect(errors).toEqual([]);
    expect(bundle!.newbieCodes.map((c) => [c.code, c.minLevel])).toEqual([
      ['XINSHOU', 1],
      ['XINSHOU10', 10],
      ['XINSHOU20', 20],
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/config/src/newbieCodes.test.ts`
Expected: FAIL（`./newbieCodes` 不存在）

- [ ] **Step 3: 实现**

`packages/config/data/game/newbie_codes.json`：

```json
{
  "codes": [
    { "code": "XINSHOU", "minLevel": 1, "items": { "coin": 50000, "goods": [{ "id": 28, "num": 3 }, { "id": 1, "num": 3 }] }, "note": "新手码 1 级" },
    { "code": "XINSHOU10", "minLevel": 10, "items": { "coin": 100000, "diamond": 10, "goods": [{ "id": 29, "num": 2 }, { "id": 131, "num": 2 }] }, "note": "新手码 10 级" },
    { "code": "XINSHOU20", "minLevel": 20, "items": { "coin": 200000, "diamond": 20, "goods": [{ "id": 29, "num": 3 }, { "id": 3, "num": 1 }] }, "note": "新手码 20 级" }
  ]
}
```

`raw.ts`（宽松结构，细校验交给 `checkNewbieCodes`，这样错误信息能带上码）：

```ts
/** data/game/newbie_codes.json：新手兑换码（问题记录 150）；服务端启动时同步进兑换码表 */
export const newbieCodesFile = z
  .object({
    codes: z.array(
      z.object({ code: z.string(), minLevel: int.min(1), items: z.unknown(), note: z.string() }).strict(),
    ),
  })
  .strict();
```

`newbieCodes.ts`：

```ts
import type { z } from 'zod';
import { REDEEM_CODE_RE, rewardItems, type RewardItems } from '@dt/shared';
import type { newbieCodesFile } from './raw';

export interface NewbieCode {
  code: string;
  minLevel: number;
  items: RewardItems;
  note: string;
}

/** 新手码（设计 §4.1）：码格式、不重复、奖励能通过附件校验、引用的道具食材存在 */
export function checkNewbieCodes(
  file: z.infer<typeof newbieCodesFile>,
  goodsIds: Set<number>,
  foodIds: Set<number>,
  errors: string[],
): NewbieCode[] {
  const seen = new Set<string>();
  const out: NewbieCode[] = [];
  for (const c of file.codes) {
    const err = (m: string) => errors.push(`newbie_codes ${c.code}: ${m}`);
    if (!REDEEM_CODE_RE.test(c.code)) err('bad code');
    if (seen.has(c.code)) err('duplicate');
    seen.add(c.code);
    const items = rewardItems.safeParse(c.items);
    if (!items.success) {
      err('bad items');
      continue;
    }
    for (const g of items.data.goods ?? []) if (!goodsIds.has(g.id)) err(`unknown goods ${g.id}`);
    for (const f of items.data.foods ?? []) if (!foodIds.has(f.id)) err(`unknown foods ${f.id}`);
    out.push({ code: c.code, minLevel: c.minLevel, items: items.data, note: c.note });
  }
  return out;
}
```

`build.ts`：
- `const newbieCodesRaw = parse('game/newbie_codes', raw.newbieCodesFile);`，加进空值检查列表；
- 在"邀请（子项目 6A-2）"校验后面加：

```ts
  // ---------- 新手兑换码（问题记录 150） ----------
  const newbieCodes = checkNewbieCodes(newbieCodesRaw, goodsIds, foodIds, errors);
```

- bundle body 里 `settingDocs,` 后面加 `newbieCodes,`。

`types.ts`：`ConfigBundle` 里 `settingDocs` 后面加 `/** 新手兑换码（问题记录 150） */ newbieCodes: NewbieCode[];`（从 `./newbieCodes` import type）。

`runtime.ts`：接口加 `readonly newbieCodes: ConfigBundle['newbieCodes'];`，构造里加 `newbieCodes: bundle.newbieCodes,`。

`index.ts`：`export type { NewbieCode } from './newbieCodes';`

如果 `checkNewbieCodes` 的测试里 `rewardItems` 拒绝 `hats` 之外的写法跟预期不同，以 `rewardItems` 为准调整测试数据（记 Ruling）。

- [ ] **Step 4: 跑测试确认通过，并重建 bundle**

Run: `pnpm vitest run packages/config && pnpm --filter @dt/config build && pnpm --filter @dt/config typecheck`
Expected: 全部 PASS；bundle 写出

- [ ] **Step 5: Commit**

```bash
git add packages/config
git commit -m "feat: 新手兑换码配置 newbie_codes.json 和构建校验（问题记录 150）"
```

---

### Task 2: 新手码同步进兑换码表

**Files:**
- Create: `apps/server/src/modules/redeem/newbie.ts`
- Create: `apps/server/src/modules/redeem/newbie.test.ts`
- Modify: `apps/server/src/modules/npc/npc.ts`（`npcAccountId` 加 `export`）
- Modify: `apps/server/src/main.ts`

**Interfaces:**
- Consumes: `GameConfig.newbieCodes`（Task 1）
- Produces: `syncNewbieCodes(db: Kysely<DB>, codes: readonly NewbieCode[], log: { warn(o: object, m: string): void }): Promise<{ inserted: number; updated: number; skipped: string[] }>`

- [ ] **Step 1: 写失败的测试** `newbie.test.ts`（用自造的码，不碰真实的 XINSHOU 行，避免和别的测试互相影响）

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NewbieCode } from '@dt/config';
import { createAccountRow } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { randomCode } from './code';
import { syncNewbieCodes } from './newbie';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = () => ({ warn: vi.fn() });
const row = (code: string) =>
  t.db.selectFrom('redeem_code').selectAll().where('code', '=', code).executeTakeFirstOrThrow();
const nc = (code: string, patch: Partial<NewbieCode> = {}): NewbieCode => ({
  code,
  minLevel: 5,
  items: { coin: 100 },
  note: '新手码测试',
  ...patch,
});

describe('新手码同步（设计 §4.2）', () => {
  it('第一次插入：通用码、所有区服、不限次数；第二次不重复插入', async () => {
    const c = randomCode();
    expect((await syncNewbieCodes(t.db, [nc(c)], log())).inserted).toBe(1);
    const r = await row(c);
    expect(r).toMatchObject({ kind: 'shared', shard_id: null, max_uses: null, min_level: 5, disabled_at: null });
    expect(r.items).toEqual({ coin: 100 });
    expect(await syncNewbieCodes(t.db, [nc(c)], log())).toMatchObject({ inserted: 0, updated: 0 });
  });

  it('配置改了奖励和等级就更新；停用过的保持停用，用过的次数不变（Review Focus 1）', async () => {
    const c = randomCode();
    await syncNewbieCodes(t.db, [nc(c)], log());
    await t.db
      .updateTable('redeem_code')
      .set({ disabled_at: new Date(), used_count: 7 })
      .where('code', '=', c)
      .execute();
    const r1 = await syncNewbieCodes(t.db, [nc(c, { minLevel: 8, items: { coin: 200 } })], log());
    expect(r1.updated).toBe(1);
    const r = await row(c);
    expect(r.min_level).toBe(8);
    expect(r.items).toEqual({ coin: 200 });
    expect(r.disabled_at).not.toBeNull();
    expect(r.used_count).toBe(7);
  });

  it('后台手动建的同名码不覆盖，打警告', async () => {
    const c = randomCode();
    const admin = await createAccountRow(t.db);
    await t.db
      .insertInto('redeem_code')
      .values({ code: c, kind: 'shared', items: JSON.stringify({ coin: 1 }), note: '手动', actor_account_id: admin })
      .execute();
    const l = log();
    const r = await syncNewbieCodes(t.db, [nc(c)], l);
    expect(r.skipped).toEqual([c]);
    expect(l.warn).toHaveBeenCalled();
    expect((await row(c)).items).toEqual({ coin: 1 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/redeem/newbie.test.ts`
Expected: FAIL（`./newbie` 不存在）

- [ ] **Step 3: 实现**

`npc.ts`：`async function npcAccountId` 改成 `export async function npcAccountId`。

`newbie.ts`：

```ts
import type { Kysely } from 'kysely';
import type { NewbieCode } from '@dt/config';
import type { DB } from '../../db/schema';
import { npcAccountId } from '../npc/npc';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 新手码同步（设计 §4.2）：没有就插入；系统账号建的按配置更新奖励、等级、说明；
 * 不碰停用状态和已用次数；后台手动建的同名码不覆盖
 */
export async function syncNewbieCodes(
  db: Kysely<DB>,
  codes: readonly NewbieCode[],
  log: { warn(o: object, m: string): void },
): Promise<{ inserted: number; updated: number; skipped: string[] }> {
  const actor = await npcAccountId(db);
  const out = { inserted: 0, updated: 0, skipped: [] as string[] };
  for (const c of codes) {
    const cur = await db
      .selectFrom('redeem_code')
      .select(['id', 'actor_account_id', 'items', 'min_level', 'note'])
      .where('code', '=', c.code)
      .executeTakeFirst();
    if (!cur) {
      await db
        .insertInto('redeem_code')
        .values({
          code: c.code,
          kind: 'shared',
          items: JSON.stringify(c.items),
          min_level: c.minLevel,
          note: c.note,
          actor_account_id: actor,
        })
        .onConflict((oc) => oc.column('code').doNothing())
        .execute();
      out.inserted++;
      continue;
    }
    if (cur.actor_account_id !== actor) {
      out.skipped.push(c.code);
      log.warn({ code: c.code }, 'newbie code taken by a manual code, skipped');
      continue;
    }
    if (same(cur.items, c.items) && cur.min_level === c.minLevel && cur.note === c.note) continue;
    await db
      .updateTable('redeem_code')
      .set({ items: JSON.stringify(c.items), min_level: c.minLevel, note: c.note })
      .where('id', '=', cur.id)
      .execute();
    out.updated++;
  }
  return out;
}
```

（`redeem_code.code` 若没有唯一约束，`onConflict` 会报错：先 `grep -n "redeem_code" apps/server/src/db/migrations/*.ts` 确认；没有唯一约束就去掉 `onConflict`，记 Ruling。）

`main.ts`：在 `pullOffset` 之后、`buildApp` 之前：

```ts
// 新手兑换码（问题记录 150）：每次启动按配置同步；失败只记日志，不挡启动
await syncNewbieCodes(deps.db, deps.config.newbieCodes, console).catch((err: unknown) =>
  console.error('sync newbie codes failed', err),
);
```

（`console.warn(o, m)` 能接受两个参数，类型兼容；import `syncNewbieCodes` 自 `./modules/redeem/newbie`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/redeem`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/redeem/newbie.ts apps/server/src/modules/redeem/newbie.test.ts apps/server/src/modules/npc/npc.ts apps/server/src/main.ts
git commit -m "feat: 服务端启动时把新手码同步进兑换码表（问题记录 150）"
```

---

### Task 3: 指引页新手码接口

**Files:**
- Modify: `packages/shared/src/schemas/redeem.ts`（`GuideCodeDto`）
- Modify: `apps/server/src/modules/redeem/newbie.ts`（`guideCodes`）
- Modify: `apps/server/src/modules/redeem/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/redeem/newbie.test.ts`（追加 describe）

**Interfaces:**
- Consumes: `syncNewbieCodes`（Task 2）
- Produces: `GuideCodeDto = { code: string; minLevel: number; items: RewardItems; state: 'ok' | 'level' | 'used' | 'off' }`；`GET /api/v1/guide/codes` → `GuideCodeDto[]`；`RedeemService.guideCodes(ctx: RestCtx): Promise<GuideCodeDto[]>`

- [ ] **Step 1: 写失败的测试**（追加到 `newbie.test.ts` 末尾，作为新的顶层 describe；注意别吞掉上面 describe 的 `});`）

```ts
describe('指引页新手码状态（设计 §4.3）', () => {
  it('ok / level / used / off 四种状态，顺序和配置一致', async () => {
    const [a, b, c, d] = [randomCode(), randomCode(), randomCode(), randomCode()];
    const codes = [nc(a, { minLevel: 1 }), nc(b, { minLevel: 99 }), nc(c, { minLevel: 1 }), nc(d, { minLevel: 1 })];
    await syncNewbieCodes(t.db, codes.slice(0, 3), log());
    await t.db.updateTable('redeem_code').set({ disabled_at: new Date() }).where('code', '=', c).execute();
    const ctx = await newRestaurant(t);
    const list = await guideCodes(t.db, codes, ctx.restaurantId);
    expect(list.map((x) => [x.code, x.state])).toEqual([
      [a, 'ok'],
      [b, 'level'],
      [c, 'off'],
      [d, 'off'],
    ]);
    await t.game.redeem.redeem(ctx, a);
    expect((await guideCodes(t.db, codes, ctx.restaurantId))[0]!.state).toBe('used');
  });
});
```

（文件顶部 import 加 `newRestaurant` 和 `guideCodes`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/redeem/newbie.test.ts`
Expected: FAIL（`guideCodes` 不存在）

- [ ] **Step 3: 实现**

`shared/schemas/redeem.ts` 末尾：

```ts
/** 指引页的新手码（问题记录 150）：off = 不存在、已停用或被手动码占用 */
export interface GuideCodeDto {
  code: string;
  minLevel: number;
  items: RewardItems;
  state: 'ok' | 'level' | 'used' | 'off';
}
```

`newbie.ts` 追加：

```ts
/** 指引页：配置里的新手码在本店的状态（设计 §4.3）；只认系统账号建的码 */
export async function guideCodes(
  db: Kysely<DB>,
  codes: readonly NewbieCode[],
  restId: number,
): Promise<GuideCodeDto[]> {
  if (codes.length === 0) return [];
  const actor = await npcAccountId(db);
  const rest = await db.selectFrom('restaurant').select('level').where('id', '=', restId).executeTakeFirstOrThrow();
  const rows = await db
    .selectFrom('redeem_code as c')
    .leftJoin('redeem_use as u', (j) => j.onRef('u.code_id', '=', 'c.id').on('u.rest_id', '=', restId))
    .select(['c.code', 'c.disabled_at', 'c.actor_account_id', 'u.id as used'])
    .where(
      'c.code',
      'in',
      codes.map((c) => c.code),
    )
    .execute();
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return codes.map((c) => {
    const r = byCode.get(c.code);
    // 领过的码即使后来停用也显示"已领"
    const state: GuideCodeDto['state'] =
      !r || r.actor_account_id !== actor
        ? 'off'
        : r.used
          ? 'used'
          : r.disabled_at
            ? 'off'
            : rest.level < c.minLevel
              ? 'level'
              : 'ok';
    return { code: c.code, minLevel: c.minLevel, items: c.items, state };
  });
}
```

（import `type GuideCodeDto` 自 `@dt/shared`。）

`service.ts` 加：

```ts
    guideCodes: (ctx: RestCtx) => guideCodes(d.db, d.config.newbieCodes, ctx.restaurantId),
```

（`GameDeps` 上 db/config 的字段名以实际为准，比如 `d.db`、`d.config`；不对就照 `redeemOp` 里的写法改。）

`routes.ts` 加：

```ts
    r.get('/guide/codes', async (req) => ok(await svc.guideCodes(restCtxOf(req))));
```

（import `ok` 自 `../../http/reply`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/redeem && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/redeem.ts apps/server/src/modules/redeem
git commit -m "feat: 指引页新手码状态接口 GET /guide/codes（问题记录 150）"
```

---

### Task 4: 账号 profile 和改密码接口

**Files:**
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `apps/server/src/modules/account/service.ts`、`routes.ts`
- Modify: `apps/web/src/i18n/zh-CN.ts`（`STATE` 加两条）
- Create: `apps/server/src/modules/account/profile.test.ts`

**Interfaces:**
- Produces:
  - `changePasswordBody = z.object({ oldPassword: z.string().min(1).max(64), newPassword: password })`，`ChangePasswordInput`
  - `AccountProfileDto = { username; email; emailVerified; role: AccountRole; createdAt: string; inviteCode: string | null; rests: Array<{ shardId: number; shardName: string; shardOpen: boolean; restId: number; name: string; level: number }> }`
  - `GET /api/v1/account/profile`、`POST /api/v1/account/change-password`（返回 `{}`）
  - `AccountService.profile(accountId)`、`AccountService.changePassword(accountId, input)`

- [ ] **Step 1: 写失败的测试** `profile.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, cookieOf, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const A = '/api/v1/account';
const login = (username: string, password: string) => call(ctx.app, 'POST', `${A}/login`, { body: { username, password } });

describe('我的账号（设计 §6.1）', () => {
  it('profile：用户名、注册时间、各区服的店', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const r = await call(ctx.app, 'GET', `${A}/profile`, { cookie: p.cookie });
    expect(r.status).toBe(200);
    expect(r.json.data.createdAt).toMatch(/^\d{4}-/);
    expect(r.json.data.rests).toEqual([
      expect.objectContaining({ shardId, restId: p.restId, shardOpen: true, level: expect.any(Number) }),
    ]);
  });

  it('改密码：旧密码错报 wrong_password，密码不变；新旧相同报 same_password', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const { username } = (await call(ctx.app, 'GET', `${A}/me`, { cookie: p.cookie })).json.data;
    const bad = await call(ctx.app, 'POST', `${A}/change-password`, {
      cookie: p.cookie,
      body: { oldPassword: 'nope123', newPassword: 'newpass123' },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error.params.reason).toBe('wrong_password');
    const relogin = await login(username, 'secret123');
    expect(relogin.status).toBe(200);
    const same = await call(ctx.app, 'POST', `${A}/change-password`, {
      cookie: cookieOf(relogin.res),
      body: { oldPassword: 'secret123', newPassword: 'secret123' },
    });
    expect(same.json.error.params.reason).toBe('same_password');
  });

  it('改密码成功：新密码能登录；别的会话失效；本机新 Cookie 保留区服选择（Review Focus 2）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const { username } = (await call(ctx.app, 'GET', `${A}/me`, { cookie: p.cookie })).json.data;
    const r = await call(ctx.app, 'POST', `${A}/change-password`, {
      cookie: p.cookie,
      body: { oldPassword: 'secret123', newPassword: 'newpass123' },
    });
    expect(r.status).toBe(200);
    const fresh = cookieOf(r.res);
    const me = await call(ctx.app, 'GET', `${A}/me`, { cookie: fresh });
    expect(me.json.data).toMatchObject({ shardId, restaurantId: p.restId });
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: p.cookie })).status).toBe(401);
    expect((await login(username, 'secret123')).status).toBe(401);
    expect((await login(username, 'newpass123')).status).toBe(200);
  });
});
```

（错误响应体的结构以 `http/errors` 实际输出为准，比如 `json.error.params.reason`，跑一次看输出再对齐，记 Ruling。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/account/profile.test.ts`
Expected: FAIL（404）

- [ ] **Step 3: 实现**

`auth.ts`：

```ts
export const changePasswordBody = z.object({ oldPassword: z.string().min(1).max(64), newPassword: password });
export type ChangePasswordInput = z.input<typeof changePasswordBody>;

/** 我的账号（问题记录 178） */
export interface AccountProfileDto {
  username: string;
  email: string;
  emailVerified: boolean;
  role: AccountRole;
  createdAt: string;
  inviteCode: string | null;
  rests: Array<{ shardId: number; shardName: string; shardOpen: boolean; restId: number; name: string; level: number }>;
}
```

`service.ts` 加两个方法：

```ts
    async profile(accountId: number): Promise<AccountProfileDto> {
      const a = await d.db
        .selectFrom('account')
        .select(['username', 'email', 'email_verified_at', 'role', 'created_at', 'invite_code'])
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!a) throw new AppError(ErrorCode.UNAUTHORIZED, 401);
      const rests = await d.db
        .selectFrom('restaurant as r')
        .innerJoin('shard as s', 's.id', 'r.shard_id')
        .select(['r.id', 'r.name', 'r.level', 's.id as shard_id', 's.name as shard_name', 's.status'])
        .where('r.account_id', '=', accountId)
        .where('r.npc', '=', false)
        .orderBy('s.id')
        .execute();
      return {
        username: a.username,
        email: a.email,
        emailVerified: a.email_verified_at !== null,
        role: a.role,
        createdAt: new Date(a.created_at).toISOString(),
        inviteCode: a.invite_code,
        rests: rests.map((r) => ({
          shardId: r.shard_id,
          shardName: r.shard_name,
          shardOpen: r.status === 'open',
          restId: r.id,
          name: r.name,
          level: r.level,
        })),
      };
    },

    /** 改密码（设计 §6.1）：旧密码不对 / 新旧相同都报 INVALID_STATE；会话由路由处理 */
    async changePassword(accountId: number, input: ChangePasswordInput): Promise<void> {
      const a = await d.db
        .selectFrom('account')
        .select('password_hash')
        .where('id', '=', accountId)
        .executeTakeFirstOrThrow();
      if (!(await verifyPassword(a.password_hash, input.oldPassword))) throw invalidState('wrong_password');
      if (input.oldPassword === input.newPassword) throw invalidState('same_password');
      await d.db
        .updateTable('account')
        .set({ password_hash: await hashPassword(input.newPassword) })
        .where('id', '=', accountId)
        .execute();
      await writeAudit(d.db, { actor: null, action: 'account.password', target: `account:${accountId}` });
    },
```

（`invalidState` 自 `../../core/errors`，`writeAudit` 自 `../admin/audit`。）

`routes.ts` 加：

```ts
    r.get('/profile', async (req) => ok(await svc.profile(requireAccount(req).data.accountId)));

    /** 改密码：其他设备下线；本机换一个新会话，保留选的区服（设计 §6.1） */
    r.post('/change-password', { config: { rateLimit: 'auth' } }, async (req, reply) => {
      const s = requireAccount(req);
      await svc.changePassword(s.data.accountId, parse(changePasswordBody, req.body));
      await deps.sessions.destroyAll(s.data.accountId);
      const token = await deps.sessions.create(s.data.accountId);
      await deps.sessions.update(token, { shardId: s.data.shardId, restaurantId: s.data.restaurantId });
      setSessionCookie(reply, token, deps.env);
      return ok({});
    });
```

`zh-CN.ts` 的 `STATE` 表加：

```ts
  wrong_password: '旧密码不对',
  same_password: '新密码不能和旧密码一样',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/account && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/auth.ts apps/server/src/modules/account apps/web/src/i18n/zh-CN.ts
git commit -m "feat: 账号信息接口和登录后改密码（问题记录 178）"
```

---

### Task 5: 游玩指引页

**Files:**
- Create: `apps/web/src/views/GuideView.vue`、`GuideView.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`（`guideCodes`）
- Modify: `apps/web/src/router.ts`（`/guide`）
- Modify: `apps/web/src/components/MoreLinks.vue`（"其他"组）
- Modify: `apps/web/src/views/RestaurantHomeView.vue`（等级 < 10 的提示）+ 测试
- Modify: `apps/web/src/views/ShardSelectView.vue`（底部链接）

**Interfaces:**
- Consumes: `GET /api/v1/guide/codes` → `GuideCodeDto[]`（Task 3）；`endpoints.redeem(code)`
- Produces: `endpoints.guideCodes(): Promise<GuideCodeDto[]>`；路由 `/guide`（name `guide`）

- [ ] **Step 1: 写失败的测试** `GuideView.test.ts`

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import GuideView from './GuideView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { guideCodes: vi.fn(), redeem: vi.fn() } }));

const me = (restaurantId: number | null) => ({
  accountId: 1, username: 'u', email: 'u@x', emailVerified: true, role: 'player' as const, shardId: 1, restaurantId,
});
const mountView = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: GuideView }] });
  const w = mount(GuideView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('GuideView（问题记录 150）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.guideCodes).mockReset();
    vi.mocked(endpoints.redeem).mockReset();
  });

  it('五块内容都在', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([]);
    const w = await mountView();
    for (const k of ['codes', 'start', 'daily', 'faq', 'rules']) expect(w.find(`[data-testid="guide-${k}"]`).exists()).toBe(true);
  });

  it('没开店：不请求新手码，提示开店后可以领（Review Focus 3）', async () => {
    useSessionStore().me = me(null);
    const w = await mountView();
    expect(endpoints.guideCodes).not.toHaveBeenCalled();
    expect(w.text()).toContain('开店后可以领');
  });

  it('四种状态：可领有按钮，点了领取并刷新；其他显示文字', async () => {
    useSessionStore().me = me(1);
    vi.mocked(endpoints.guideCodes).mockResolvedValue([
      { code: 'XINSHOU', minLevel: 1, items: { coin: 50000 }, state: 'ok' },
      { code: 'XINSHOU10', minLevel: 10, items: { coin: 1 }, state: 'level' },
      { code: 'OLD', minLevel: 1, items: { coin: 1 }, state: 'used' },
      { code: 'GONE', minLevel: 1, items: { coin: 1 }, state: 'off' },
    ]);
    vi.mocked(endpoints.redeem).mockResolvedValue({ code: 'XINSHOU', items: { coin: 50000 } });
    const w = await mountView();
    expect(w.text()).toContain('10 级可领');
    expect(w.text()).toContain('已领');
    expect(w.text()).toContain('已结束');
    await w.find('[data-testid="guide-redeem-XINSHOU"]').trigger('click');
    await flushPromises();
    expect(endpoints.redeem).toHaveBeenCalledWith('XINSHOU');
    expect(endpoints.guideCodes).toHaveBeenCalledTimes(2);
  });
});
```

在 `RestaurantHomeView.test.ts` 加一条（照该文件已有的挂载和数据写法）：等级 9 时 `[data-testid="guide-hint"]` 存在，等级 10 时不存在。在 `MoreView.test.ts` 的入口列表里加 `'游玩指引'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/GuideView.test.ts apps/web/src/views/RestaurantHomeView.test.ts apps/web/src/views/MoreView.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`endpoints.ts`（`redeem` 旁边）：

```ts
  guideCodes: () => api.get<GuideCodeDto[]>('/api/v1/guide/codes'),
```

`router.ts`（`/redeem` 前面）：

```ts
  { path: '/guide', name: 'guide', component: () => import('./views/GuideView.vue') },
```

`MoreLinks.vue` "其他"组，在兑换码前面：`{ to: '/guide', icon: 'bi-signpost-2', label: '游玩指引' },`

`RestaurantHomeView.vue`：在等级那行 `</div>` 之后、经验条之前：

```vue
    <RouterLink v-if="rest.level < 10" to="/guide" class="d-block small mb-1" data-testid="guide-hint"
      >新手看这里 → 游玩指引（有新手兑换码）</RouterLink
    >
```

`ShardSelectView.vue`：把"退出登录"按钮换成一行：

```vue
    <div class="d-flex gap-3 align-items-center mt-3 small">
      <RouterLink to="/account">我的账号</RouterLink>
      <RouterLink to="/guide">游玩指引</RouterLink>
      <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="logout">退出登录</button>
    </div>
```

（"我的账号"路由 Task 6 才加；这一步先加链接，Task 6 加路由前它会落到兜底重定向，不影响测试。）

`GuideView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { GuideCodeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { rewardSummary } from '../utils/reward';

/** 游玩指引（问题记录 150）：内容写在这里；新手码从服务端读状态 */
const session = useSessionStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const codes = ref<GuideCodeDto[]>([]);
const busy = ref(false);
const hasRest = () => Boolean(session.me?.restaurantId);

async function load() {
  if (!hasRest()) return;
  codes.value = await endpoints.guideCodes();
}
async function take(code: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.redeem(code);
    toast.push(`领取成功：${rewardSummary(r.items, catalog)}`, 'success');
  } catch (e) {
    toast.push(errorMessage(e, '领取失败'), 'danger');
  } finally {
    busy.value = false;
    await load().catch(() => undefined);
  }
}
onMounted(() => {
  void catalog.load().catch(() => undefined);
  load().catch((e) => toast.push(errorMessage(e, '读取新手码失败'), 'danger'));
});

const DAILY = [
  { to: '/', text: '首页签到，每天一次，连续签到奖励更多' },
  { to: '/rest/tasks', text: '任务与活跃：做日常任务攒活跃度，领活跃宝箱' },
  { to: '/town', text: '广场：和大胃哥、雯姐、13 哥各聊一次有礼物；回答镇长的问题；摇一摇钱树' },
  { to: '/yard', text: '菜园：种菜、浇水、除虫，熟了记得收，也可以去好友家偷菜' },
  { to: '/market', text: '菜场：日常菜场整点上新，特价菜场每小时上新，抢便宜的高级食材' },
  { to: '/bar', text: '酒吧：每天有几次小游戏，记忆调酒和飞镖能拿奖励' },
  { to: '/tower', text: '厨塔：挑战守塔人拿声望，声望能在声望商店换东西' },
  { to: '/takeaway', text: '外卖：接单配送赚银币，骑手也会成长' },
];
</script>

<template>
  <div class="dt-page-title"><h5>游玩指引</h5></div>

  <details open class="mb-2" data-testid="guide-codes">
    <summary class="dt-section">新手兑换码</summary>
    <p v-if="!hasRest()" class="small text-muted mb-1">开店后可以领。每家店每个码领一次。</p>
    <template v-else>
      <p class="small text-muted mb-1">每家店每个码领一次，等级够了就能领。</p>
      <div v-for="c in codes" :key="c.code" class="dt-item">
        <div class="dt-item-main">
          <div><b>{{ c.code }}</b> <span class="small text-muted">{{ c.minLevel }} 级可领</span></div>
          <div class="dt-meta">{{ rewardSummary(c.items, catalog) }}</div>
        </div>
        <div class="dt-item-actions">
          <button
            v-if="c.state === 'ok'"
            class="btn btn-sm btn-primary"
            :disabled="busy"
            :data-testid="`guide-redeem-${c.code}`"
            @click="take(c.code)"
          >
            领取
          </button>
          <span v-else-if="c.state === 'level'" class="small text-muted">{{ c.minLevel }} 级可领</span>
          <span v-else-if="c.state === 'used'" class="small text-success">已领</span>
          <span v-else class="small text-muted">已结束</span>
        </div>
      </div>
    </template>
  </details>

  <details open class="mb-2" data-testid="guide-start">
    <summary class="dt-section">开店第一天</summary>
    <ul class="small ps-3 mb-1">
      <li>餐厅自己会营业：每过一轮就结算一次，按餐桌来客人。桌子越多、会做的菜越多越好、橱柜里食材越全，收入和经验越高。</li>
      <li>做菜要用橱柜里的食材，去<RouterLink to="/market">菜场</RouterLink>买；食材用完了客人就点不到那道菜。</li>
      <li>体力每轮自然恢复，好友互动、学特色菜、厨塔挑战等会花体力，体力卡可以补。</li>
      <li>先做这几件事：到<RouterLink to="/rest/equip">厨具与加点</RouterLink>把属性点加上，去菜场买食材，在<RouterLink to="/cookbooks">食谱</RouterLink>里学新菜，回首页签到。</li>
      <li>升级会加属性点；升星、扩建餐桌在首页和<RouterLink to="/rest/floor">楼层餐桌</RouterLink>里。</li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-daily">
    <summary class="dt-section">每天的固定事项</summary>
    <ul class="small ps-3 mb-1">
      <li v-for="d in DAILY" :key="d.to"><RouterLink :to="d.to">{{ d.text }}</RouterLink></li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-faq">
    <summary class="dt-section">常见问题</summary>
    <ul class="small ps-3 mb-1">
      <li><b>万能食材能换什么？</b>在橱柜里兑换：一级万能食材只能换普通食材，二级万能食材才能换稀有食材。</li>
      <li><b>厨具怎么变强？</b>强化会消耗银币，有失败概率；高级厨具有穿戴等级要求，等级不够穿不上。</li>
      <li><b>街道有什么区别？</b>每条街的街道勋章加成不同，搬家在<RouterLink to="/society">协会</RouterLink>里办。</li>
      <li><b>店名和公告有什么规矩？</b>不能用 NPC 的名字，不能有辱骂和广告；被举报核实后会被强制改名或清空。</li>
      <li><b>兑换码在哪用？</b>"更多 → 其他 → 兑换码"，或者邮箱页最上面的兑换框。</li>
    </ul>
  </details>

  <details class="mb-2" data-testid="guide-rules">
    <summary class="dt-section">游戏规则</summary>
    <ul class="small ps-3 mb-1">
      <li>禁止一人多号刷资源、在多个账号之间转移资源。</li>
      <li>禁止利用漏洞获利。发现漏洞请到论坛"建议"版报告，不要声张或利用。</li>
      <li>禁止辱骂、广告、违法和不当内容。看到这类帖子、喇叭、店名、公告可以点举报。</li>
      <li>违规会被封号 1 天、7 天或永久，违规所得会被收回。</li>
      <li>后台的数据统计只是提醒，处罚前会人工核实。</li>
    </ul>
  </details>
</template>
```

（文案里的具体规则在执行时对照代码核对一次：签到位置、搬家入口（`/society/move` 在协会下）、万能食材规则（问题记录 140）、厨具穿戴等级。核对后不符的以代码为准改文案，记 Ruling。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web/src/views apps/web/src/components && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: 游玩指引页、新手码一键领取、首页新手提示（问题记录 150）"
```

---

### Task 6: 我的账号页

**Files:**
- Create: `apps/web/src/views/AccountView.vue`、`AccountView.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`（`accountProfile`、`changePassword`）
- Modify: `apps/web/src/router.ts`（`/account`）
- Modify: `apps/web/src/components/MoreLinks.vue`（"其他"组第一位）

**Interfaces:**
- Consumes: `GET /account/profile`、`POST /account/change-password`（Task 4）；`endpoints.selectShard`、`endpoints.sendVerifyEmail`、`session.logout()`
- Produces: `endpoints.accountProfile(): Promise<AccountProfileDto>`、`endpoints.changePassword(body: ChangePasswordInput): Promise<Empty>`

- [ ] **Step 1: 写失败的测试** `AccountView.test.ts`

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AccountView from './AccountView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { accountProfile: vi.fn(), changePassword: vi.fn(), sendVerifyEmail: vi.fn(), selectShard: vi.fn(), logout: vi.fn() },
}));

const profile = (patch: Partial<AccountProfileDto> = {}): AccountProfileDto => ({
  username: 'u1', email: 'u@x', emailVerified: true, role: 'player', createdAt: '2026-09-30T00:00:00Z', inviteCode: null,
  rests: [{ shardId: 1, shardName: '一服', shardOpen: true, restId: 5, name: '小店', level: 12 }],
  ...patch,
});
const mountView = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: AccountView }] });
  const w = mount(AccountView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('AccountView（问题记录 178）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.changePassword).mockReset();
  });

  it('显示用户名、各区服的店；邮箱未验证时有重发按钮', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile({ emailVerified: false }));
    const w = await mountView();
    expect(w.text()).toContain('u1');
    expect(w.find('[data-testid="acc-rest-1"]').text()).toContain('小店');
    expect(w.find('[data-testid="acc-resend"]').exists()).toBe(true);
  });

  it('两次新密码不一致：不发请求', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
    const w = await mountView();
    await w.find('[data-testid="acc-old"]').setValue('secret123');
    await w.find('[data-testid="acc-new"]').setValue('newpass123');
    await w.find('[data-testid="acc-new2"]').setValue('newpass999');
    await w.find('[data-testid="acc-change"]').trigger('click');
    expect(endpoints.changePassword).not.toHaveBeenCalled();
    expect(w.text()).toContain('两次输入的新密码不一样');
  });

  it('改密码成功：提示其他设备已下线，清空输入', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
    vi.mocked(endpoints.changePassword).mockResolvedValue({});
    const w = await mountView();
    await w.find('[data-testid="acc-old"]').setValue('secret123');
    await w.find('[data-testid="acc-new"]').setValue('newpass123');
    await w.find('[data-testid="acc-new2"]').setValue('newpass123');
    await w.find('[data-testid="acc-change"]').trigger('click');
    await flushPromises();
    expect(endpoints.changePassword).toHaveBeenCalledWith({ oldPassword: 'secret123', newPassword: 'newpass123' });
    expect(w.text()).toContain('其他设备已下线');
    expect((w.find('[data-testid="acc-old"]').element as HTMLInputElement).value).toBe('');
  });
});
```

`MoreView.test.ts` 入口列表加 `'我的账号'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/AccountView.test.ts apps/web/src/views/MoreView.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`endpoints.ts`（`resetPassword` 后面）：

```ts
  accountProfile: () => api.get<AccountProfileDto>('/api/v1/account/profile'),
  changePassword: (body: ChangePasswordInput) => api.post<Empty>('/api/v1/account/change-password', body),
```

`router.ts`（`/shards` 后面）：

```ts
  { path: '/account', name: 'account', component: () => import('./views/AccountView.vue') },
```

`MoreLinks.vue` "其他"组第一位：`{ to: '/account', icon: 'bi-person-circle', label: '我的账号' },`

`AccountView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

/** 我的账号（问题记录 178）：只要求登录，不要求选区服 */
const session = useSessionStore();
const router = useRouter();
const p = ref<AccountProfileDto | null>(null);
const msg = ref<{ ok: boolean; text: string } | null>(null);
const oldPw = ref('');
const newPw = ref('');
const newPw2 = ref('');
const busy = ref(false);
const ROLE: Record<string, string> = { mod: '协管', admin: '管理员' };

onMounted(async () => {
  try {
    p.value = await endpoints.accountProfile();
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '读取账号信息失败') };
  }
});

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    msg.value = { ok: true, text: '验证邮件已发送，请查收' };
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '发送失败') };
  }
}
async function enter(shardId: number) {
  try {
    const r = await endpoints.selectShard(shardId);
    if (session.me) session.me = { ...session.me, shardId: r.shardId, restaurantId: r.restaurantId };
    await router.push({ name: 'home' });
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '进入区服失败') };
  }
}
async function change() {
  if (newPw.value !== newPw2.value) {
    msg.value = { ok: false, text: '两次输入的新密码不一样' };
    return;
  }
  if (busy.value) return;
  busy.value = true;
  try {
    await endpoints.changePassword({ oldPassword: oldPw.value, newPassword: newPw.value });
    oldPw.value = newPw.value = newPw2.value = '';
    msg.value = { ok: true, text: '密码已修改，其他设备已下线' };
  } catch (e) {
    msg.value = { ok: false, text: errorMessage(e, '修改失败') };
  } finally {
    busy.value = false;
  }
}
async function logout() {
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="dt-page-title"><h5>我的账号</h5></div>
  <div v-if="msg" :class="['alert', 'py-1', 'small', msg.ok ? 'alert-success' : 'alert-danger']">{{ msg.text }}</div>
  <template v-if="p">
    <h6 class="dt-section">账号</h6>
    <div class="small mb-3">
      <div>用户名 <b>{{ p.username }}</b><span v-if="ROLE[p.role]" class="badge bg-secondary ms-1">{{ ROLE[p.role] }}</span></div>
      <div>注册于 {{ new Date(p.createdAt).toLocaleDateString('zh-CN') }}</div>
      <div>
        邮箱 {{ p.email }}
        <span v-if="p.emailVerified" class="text-success">已验证</span>
        <template v-else>
          <span class="text-danger">未验证</span>
          <button type="button" class="btn btn-link btn-sm p-0 align-baseline ms-1" data-testid="acc-resend" @click="resend">重发验证邮件</button>
        </template>
      </div>
      <div>
        邀请码
        <RouterLink to="/invite">{{ p.inviteCode ?? '去邀请页生成' }}</RouterLink>
      </div>
    </div>

    <h6 class="dt-section">我的店</h6>
    <div v-if="p.rests.length === 0" class="small text-muted mb-3">还没有开店</div>
    <div v-for="r in p.rests" :key="r.shardId" class="dt-item" :class="{ 'opacity-50': !r.shardOpen }" :data-testid="`acc-rest-${r.shardId}`">
      <div class="dt-item-main">
        <div>{{ r.shardName }} · {{ r.name }}</div>
        <div class="dt-meta">等级 {{ r.level }}<span v-if="!r.shardOpen"> · 区服已关闭</span></div>
      </div>
      <div class="dt-item-actions">
        <button class="btn btn-sm btn-outline-primary" :disabled="!r.shardOpen" @click="enter(r.shardId)">进入</button>
      </div>
    </div>

    <h6 class="dt-section mt-3">修改密码</h6>
    <div class="d-grid gap-1 mb-3" style="max-width: 20rem">
      <input v-model="oldPw" type="password" class="form-control form-control-sm" placeholder="旧密码" autocomplete="current-password" data-testid="acc-old" />
      <input v-model="newPw" type="password" class="form-control form-control-sm" placeholder="新密码（6~64 位）" autocomplete="new-password" data-testid="acc-new" />
      <input v-model="newPw2" type="password" class="form-control form-control-sm" placeholder="再输一次新密码" autocomplete="new-password" data-testid="acc-new2" />
      <button type="button" class="btn btn-sm btn-primary" :disabled="busy || !oldPw || newPw.length < 6" data-testid="acc-change" @click="change">修改密码</button>
    </div>
  </template>
  <div class="d-flex gap-2">
    <RouterLink to="/shards" class="btn btn-sm btn-outline-secondary">切换区服</RouterLink>
    <button type="button" class="btn btn-sm btn-outline-danger" @click="logout">退出登录</button>
  </div>
</template>
```

（注意"两次不一致"测试里按钮是否 disabled：`newPw.length >= 6` 且 `oldPw` 有值，所以不 disabled，点击会进 `change()`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web/src && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: 我的账号页：账号信息、各区服的店、改密码（问题记录 178）"
```

---

### Task 7: 菜园姐

**Files:**
- Create: `apps/web/src/utils/gardenSis.ts`、`gardenSis.test.ts`
- Create: `apps/web/src/components/market/GardenSis.vue`、`GardenSis.test.ts`
- Modify: `apps/web/src/views/MarketView.vue`

**Interfaces:**
- Produces: `gardenLines(data: MarketDto, now: Date): Array<{ text: string; weight: number }>`；`pickLine(lines, last: string | null, rnd: () => number): string`；组件 `<GardenSis :data="MarketDto | null" />`

- [ ] **Step 1: 写失败的测试** `gardenSis.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { MarketDto } from '@dt/shared';
import { CHAT, gardenLines, pickLine } from './gardenSis';

const item = { id: 1 } as MarketDto['special'][number];
const market = (patch: Partial<MarketDto> = {}): MarketDto =>
  ({
    daily: [], special: [], premium: [],
    nextDaily: '2026-10-01T10:00:00Z', nextSpecial: '2026-10-01T09:00:00Z', nextPremium: '2026-10-01T12:00:00Z',
    specialCooldownUntil: null, specialCooldownMin: 30, foodsMaxNum: 99, cupboardFull: false,
    manual: { hasCard: false, cost: 0 },
    guess: { period: 'p', joined: [1], last: null, cost: 0, maxPick: 3, pool: [] },
    ...patch,
  }) as MarketDto;
const texts = (d: MarketDto) => gardenLines(d, new Date('2026-10-01T08:00:00Z')).map((l) => l.text);

describe('菜园姐台词（设计 §5.2）', () => {
  it('特价有货 / 没货', () => {
    expect(texts(market({ special: [item, item] })).some((t) => t.includes('特价菜还剩 2 样'))).toBe(true);
    expect(texts(market()).some((t) => t.includes('特价菜卖光了'))).toBe(true);
  });
  it('有手动进货卡、没下注竞猜时提醒', () => {
    expect(texts(market({ manual: { hasCard: true, cost: 100 } })).some((t) => t.includes('手动进货'))).toBe(true);
    const g = { period: 'p', joined: null, last: null, cost: 0, maxPick: 3, pool: [] };
    expect(texts(market({ guess: g })).some((t) => t.includes('竞猜'))).toBe(true);
  });
  it('闲聊总在；状态台词权重 2', () => {
    const lines = gardenLines(market(), new Date());
    for (const c of CHAT) expect(lines.some((l) => l.text === c && l.weight === 1)).toBe(true);
    expect(lines.filter((l) => l.weight === 2).length).toBeGreaterThan(0);
  });
  it('pickLine 不连着说同一句', () => {
    const lines = [{ text: 'a', weight: 1 }, { text: 'b', weight: 1 }];
    for (let i = 0; i < 10; i++) expect(pickLine(lines, 'a', () => i / 10)).toBe('b');
  });
});
```

`GardenSis.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import GardenSis from './GardenSis.vue';

describe('GardenSis', () => {
  it('点一下换一句不同的', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const w = mount(GardenSis, { props: { data: null } });
    const first = w.find('[data-testid="garden-sis-line"]').text();
    await w.find('[data-testid="garden-sis"]').trigger('click');
    expect(w.find('[data-testid="garden-sis-line"]').text()).not.toBe(first);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/utils/gardenSis.test.ts apps/web/src/components/market`
Expected: FAIL

- [ ] **Step 3: 实现**

`utils/gardenSis.ts`：

```ts
import type { MarketDto } from '@dt/shared';

/** 菜园姐的闲聊（设计 §5.2）：和菜场状态无关 */
export const CHAT: readonly string[] = [
  '新来的？先去"更多 → 游玩指引"看看，还有新手兑换码哦。',
  '食材放在橱柜里也会坏，别一次囤太多。',
  '下雨天客人少，晴天生意好，记得看天气。',
  '二级万能食材才能换稀有食材，一级的只能换普通的。',
  '日常菜场整点上新，最后一轮种类最多。',
  '高级食材在特价菜场最划算，手快有手慢无。',
  '菜园里的菜熟了要及时收，不然会被人偷走。',
  '我种的菜可是全镇最新鲜的！',
  '橱柜满了就买不进新菜啦，先分解一些吧。',
  '会做的菜越多，客人越容易点到想吃的。',
  '每天签到别忘了，连签奖励更多。',
  '蟹老板又来压价了，哼。',
  '雯姐说今天要来买菜，不知道来了没有。',
  '大胃哥一天能吃掉我半个摊子。',
  '有空去广场转转，镇长的问题答对了有奖。',
  '菜价看起来贵，做成菜卖出去可就赚回来了。',
  '竞猜猜中了，奖励可不少。',
  '好友多了，互相帮忙生意更好做。',
  '累了就歇歇，体力会慢慢恢复的。',
  '有什么不懂的，论坛"答疑"版里问问大家。',
];

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 当前能说的台词：看菜场状态说的权重 2，闲聊权重 1 */
export function gardenLines(data: MarketDto | null, _now: Date): Array<{ text: string; weight: number }> {
  const out: Array<{ text: string; weight: number }> = [];
  if (data) {
    const say = (text: string) => out.push({ text, weight: 2 });
    if (data.special.length > 0) say(`特价菜还剩 ${data.special.length} 样，手快有手慢无！`);
    else say(`特价菜卖光了，下次 ${hm(data.nextSpecial)} 进货。`);
    say(`日常菜场下次 ${hm(data.nextDaily)} 上新，到时候来看看。`);
    if (data.guess.joined === null) say('今天的竞猜还没下注呢，去下面猜一猜？');
    if (data.manual.hasCard) say('你有菜场工作证，不想等的话可以手动进货。');
  }
  for (const text of CHAT) out.push({ text, weight: 1 });
  return out;
}

/** 按权重随机挑一句，跳过上一句 */
export function pickLine(
  lines: Array<{ text: string; weight: number }>,
  last: string | null,
  rnd: () => number = Math.random,
): string {
  const pool = lines.length > 1 ? lines.filter((l) => l.text !== last) : lines;
  const total = pool.reduce((s, l) => s + l.weight, 0);
  let r = rnd() * total;
  for (const l of pool) {
    r -= l.weight;
    if (r < 0) return l.text;
  }
  return pool[pool.length - 1]!.text;
}
```

`components/market/GardenSis.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MarketDto } from '@dt/shared';
import { gardenLines, pickLine } from '../../utils/gardenSis';
import GameImg from '../GameImg.vue';

/** 菜场吉祥物菜园姐（问题记录 176）：只说话，不发奖励 */
const props = defineProps<{ data: MarketDto | null }>();
const line = ref('');
const next = () => {
  line.value = pickLine(gardenLines(props.data, new Date()), line.value || null);
};
next();
// 菜场数据第一次到手时，换成看状态说的话
watch(
  () => props.data !== null,
  (has, had) => {
    if (has && !had) next();
  },
);
</script>

<template>
  <div class="d-flex align-items-center gap-2 border rounded p-2 mb-2 small" role="button" data-testid="garden-sis" @click="next">
    <GameImg path="npc/菜园姐" alt="菜园姐" fallback-icon="bi-flower2" class="flex-shrink-0" />
    <div><b>菜园姐：</b><span data-testid="garden-sis-line">{{ line }}</span></div>
  </div>
</template>
```

`MarketView.vue`：template 最上面（`HiphopCard` 前）加 `<GardenSis :data="data" />`，script 里 import。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web/src && pnpm --filter @dt/web typecheck`
Expected: PASS（`MarketView.test.ts` 若因新组件报错，按它的 mock 方式补 stub，记 Ruling）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: 菜场吉祥物菜园姐（问题记录 176）"
```

---

### Task 8: 功能开关排版（184）和仓库排序（186）

**Files:**
- Create: `apps/web/src/utils/storeSort.ts`、`storeSort.test.ts`
- Modify: `apps/web/src/views/StoreView.vue` + `StoreView.test.ts`
- Modify: `apps/web/src/views/admin/AdminShardView.vue` + `AdminShardView.test.ts`
- Modify: 全局样式文件（`apps/web/src/styles/` 里 `.dt-more-grid` 所在的文件）

**Interfaces:**
- Produces: `STORE_TYPES: readonly number[]`（`[0, 1, 2, 3, 9]`）；`sortStoreItems(items: StoreItemDto[], typeOf: (goodsId) => number, nameOf: (goodsId) => string): StoreItemDto[]`；`groupStoreItems(...same): Array<{ type: number; items: StoreItemDto[] }>`

- [ ] **Step 1: 写失败的测试** `storeSort.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { StoreItemDto } from '@dt/shared';
import { groupStoreItems, sortStoreItems } from './storeSort';

const it_ = (goodsId: number, expiresAt: string | null = null): StoreItemDto => ({
  goodsId, num: 1, expiresAt, usable: true, batch: false, maxUse: 1, sellPrice: null,
});
const TYPE: Record<number, number> = { 1: 1, 2: 0, 3: 0, 4: 0, 5: 9, 6: 7 };
const NAME: Record<number, string> = { 1: '喇叭', 2: '体力卡', 3: '小体力卡', 4: '保险卡', 5: '新手街勋章', 6: '怪东西' };
const typeOf = (id: number) => TYPE[id]!;
const nameOf = (id: number) => NAME[id]!;

describe('仓库排序（问题记录 186）', () => {
  it('按类型分组：消耗品、道具、礼包、设施、勋章，其他最后', () => {
    const g = groupStoreItems([it_(6), it_(5), it_(1), it_(2)], typeOf, nameOf);
    expect(g.map((x) => x.type)).toEqual([0, 1, 9, 7]);
  });
  it('组内：有剩余时间的在前、短的在前，再按拼音（Review Focus 5）', () => {
    const s = sortStoreItems(
      [it_(3), it_(2), it_(4, '2026-10-02T00:00:00Z'), it_(4, '2026-10-01T00:00:00Z')],
      typeOf,
      nameOf,
    );
    expect(s.map((x) => [x.goodsId, x.expiresAt])).toEqual([
      [4, '2026-10-01T00:00:00Z'],
      [4, '2026-10-02T00:00:00Z'],
      [2, null],
      [3, null],
    ]);
  });
});
```

（拼音：体力卡 ti < 小体力卡 xiao；有剩余时间的保险卡排在最前，短的在前。）

`AdminShardView.test.ts` 加：功能开关外层有 `.dt-feature-grid`，每个 `label` 带 `title`（有说明时等于说明）。

`StoreView.test.ts` 加：选"全部"时出现 `store-group-0` 和 `store-group-1` 小标题，顺序是消耗品在前。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/utils/storeSort.test.ts apps/web/src/views/StoreView.test.ts apps/web/src/views/admin/AdminShardView.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`utils/storeSort.ts`：

```ts
import type { StoreItemDto } from '@dt/shared';

/** 仓库分组顺序（问题记录 186）：消耗品、道具、礼包、设施、勋章；其他类型排最后 */
export const STORE_TYPES: readonly number[] = [0, 1, 2, 3, 9];
const rank = (t: number) => {
  const i = STORE_TYPES.indexOf(t);
  return i < 0 ? STORE_TYPES.length : i;
};
const collator = new Intl.Collator('zh-Hans-CN');

/** 组内：有剩余时间的先排、短的在前；再按名字拼音；最后按道具 id */
export function sortStoreItems(
  items: StoreItemDto[],
  typeOf: (goodsId: number) => number,
  nameOf: (goodsId: number) => string,
): StoreItemDto[] {
  const exp = (x: StoreItemDto) => (x.expiresAt ? new Date(x.expiresAt).getTime() : Infinity);
  const byExp = (a: StoreItemDto, b: StoreItemDto) => {
    const [ea, eb] = [exp(a), exp(b)];
    return ea === eb ? 0 : ea - eb;
  };
  return [...items].sort(
    (a, b) =>
      rank(typeOf(a.goodsId)) - rank(typeOf(b.goodsId)) ||
      byExp(a, b) ||
      collator.compare(nameOf(a.goodsId), nameOf(b.goodsId)) ||
      a.goodsId - b.goodsId,
  );
}

export function groupStoreItems(
  items: StoreItemDto[],
  typeOf: (goodsId: number) => number,
  nameOf: (goodsId: number) => string,
): Array<{ type: number; items: StoreItemDto[] }> {
  const out: Array<{ type: number; items: StoreItemDto[] }> = [];
  for (const it of sortStoreItems(items, typeOf, nameOf)) {
    const t = typeOf(it.goodsId);
    const last = out[out.length - 1];
    if (last && last.type === t) last.items.push(it);
    else out.push({ type: t, items: [it] });
  }
  return out;
}
```

`StoreView.vue`：
- import `groupStoreItems`；`const TYPE_LABEL = Object.fromEntries(TYPES.filter((t) => t.v !== undefined).map((t) => [t.v, t.label]))`；
- `const groups = computed(() => data.value ? groupStoreItems(data.value.items, (id) => catalog.goodsMap.get(id)?.type ?? -1, (id) => catalog.goodsName(id)) : [])`；
- 模板把 `v-for="it in data.items"` 改成外层 `<template v-for="g in groups" :key="g.type">`，`type === undefined` 时先渲染 `<h6 class="dt-section mt-2" :data-testid="`store-group-${g.type}`">{{ TYPE_LABEL[g.type] ?? '其他' }}</h6>`，内层 `v-for="it in g.items"`，原来的条目内容不变。

`AdminShardView.vue` 功能开关区：

```vue
    <div class="dt-feature-grid small">
      <label v-for="f in data.features" :key="f.name" class="dt-feature" :title="docs.features[f.name] ?? ''">
        <span class="d-flex align-items-center">
          <input
            type="checkbox"
            class="form-check-input me-1 mt-0"
            :checked="featureOn(f.name)"
            :disabled="readOnly"
            :data-testid="`feature-${f.name}`"
            @change="setFeature(f.name, ($event.target as HTMLInputElement).checked)"
          />{{ f.name }}
        </span>
        <span v-if="docs.features[f.name]" class="d-block text-muted" :data-testid="`feature-doc-${f.name}`">{{
          docs.features[f.name]
        }}</span>
      </label>
    </div>
```

样式（放在 `.dt-more-grid` 旁边）：

```css
/* 区服数值页的功能开关（问题记录 184）：手机一列，宽屏两列，说明在名字下面 */
.dt-feature-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem 1rem;
}
@media (min-width: 576px) {
  .dt-feature-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.dt-feature {
  min-width: 0;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web/src && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "fix: 功能开关改成整齐的网格（184）；仓库按类型分组、按剩余时间和拼音排序（186）"
```

---

### Task 9: e2e、部署文档、全量验证

**Files:**
- Create: `apps/web/e2e/guide.spec.ts`
- Modify: `docs/deploy.md`

- [ ] **Step 1: 写 e2e** `guide.spec.ts`

```ts
import { expect, test } from './fixtures';
import { registerAndOpen } from './helpers';

/** 只用本用例注册的账号：领新手码 → 改密码 → 用新密码登录 */
test('游玩指引领新手码；我的账号改密码后用新密码登录', async ({ page, request }) => {
  test.setTimeout(120_000);
  const me = await registerAndOpen(page, request);

  await page.goto('/guide');
  await page.getByTestId('guide-redeem-XINSHOU').click();
  await expect(page.getByText('领取成功')).toBeVisible();
  await expect(page.getByTestId('guide-redeem-XINSHOU')).toHaveCount(0);

  await page.goto('/account');
  await expect(page.getByText(me.name)).toBeVisible();
  await page.getByTestId('acc-old').fill('secret123');
  await page.getByTestId('acc-new').fill('newpass123');
  await page.getByTestId('acc-new2').fill('newpass123');
  await page.getByTestId('acc-change').click();
  await expect(page.getByText('其他设备已下线')).toBeVisible();

  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByPlaceholder('用户名').fill(me.username);
  await page.getByPlaceholder('密码').fill('newpass123');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/(shards)?$/);
});
```

（登录页的占位符、按钮名和登录后跳转以 `LoginView.vue` 实际为准；执行时先看一眼再对齐。）

- [ ] **Step 2: `docs/deploy.md` 加一节**

```markdown
## 游玩指引、新手码、我的账号（问题记录 150、176、178）

- 没有迁移。服务端每次启动会按 `packages/config/data/game/newbie_codes.json` 同步新手兑换码（目前 3 个：XINSHOU、XINSHOU10、XINSHOU20），所有区服通用、每家店领一次。
- 改奖励：改 `newbie_codes.json`，`pnpm --filter @dt/config build`，重启服务端。停用：后台兑换码页停用，重启不会恢复。
- 后台手动建过同名的码时不覆盖，日志里有 `newbie code taken by a manual code` 警告。
```

- [ ] **Step 3: 全量验证**

Run（从仓库根目录）：
```bash
pnpm --filter @dt/config build
pnpm vitest run > .superpowers/sdd/2026-10-01-guide-account/unit.log 2>&1; tail -5 .superpowers/sdd/2026-10-01-guide-account/unit.log
pnpm -r typecheck
pnpm lint
pnpm format:check
```
Expected: 全部通过（`format:check` 只允许 `问题记录.md` 一条警告，它不在仓库里）。

然后重启 dev（服务端启动时会同步新手码），跑 e2e：`pnpm --filter @dt/web e2e`（以仓库里实际的 e2e 脚本名为准）。
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/guide.spec.ts docs/deploy.md
git commit -m "test: e2e 领新手码和改密码；部署说明"
```
