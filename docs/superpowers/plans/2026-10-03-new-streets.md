# 新街道接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `data/` 下的老街道修订和 16 条新街道（菜谱、食材、勋章、译名）接进游戏，修好接入暴露的代码问题。

**Architecture:**
- 新内容放在 `packages/config/data/designed/*_new.json`，构建时和原始数据拼接后走原有校验。
- 8~10 品级用一个纯函数按老数据的换料频率生成，由导入脚本调用，结果作为静态数据提交。
- 街道勋章改用显式对应表。
- 玩家数据的修正放在两个迁移里（0039、0040）。

**Tech Stack:** pnpm monorepo；TypeScript；zod；Kysely/Postgres；Vitest；Vue 3 + Pinia；tsx。

**Spec:** `docs/superpowers/specs/2026-10-03-new-streets-design.md`

## Global Constraints

- 回复和文档用中文。提交信息结尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不提交、不格式化、不修改根目录的 `问题记录.md`。`format:check` 报它属于正常情况。
- `data/`（仓库外）只读，只从里面读文件。
- 改了 `packages/config` 后，重启 dev 前先跑 `pnpm -F @dt/config build`。
- 开发库数据只通过迁移改（用户已同意 0039/0040）；e2e 只碰自己的数据。
- **两个 PR**：
  - PR 1 分支 `feat/old-street-revision`（Task 1~4）；
  - PR 2 分支 `feat/new-streets`，建在 PR 1 之上（Task 5~11）。PR 1 带迁移，没合并前 PR 2 的分支必须基于它。
- 繁中由 OpenCC 自动转换，不导入 `data/i18n/zh-TW`。
- **路径**：
  - 菜谱数据：`packages/config/data/dataset/cookbooks.json`
  - 售价：`packages/config/data/designed/cookbooks_price.json`
  - 译名：`packages/config/data/i18n/{en,fr,es}/*.json`
- **测试命令**：
  - `pnpm -F @dt/config test`
  - `pnpm -F @dt/server test`
  - `pnpm -F @dt/web test`
  - 全量：`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`

## Review Focus

1. **只学过被删菜谱的老店，迁移后的计数**：learned、grade、street 都不能变成负数，被删字节要清 0。归 Task 3。
2. **老店字节串比新菜谱 id 短**：学新菜、做橱柜计算、特色菜课程遗忘时不能丢写入，也不能越界读到 undefined。归 Task 8。
3. **雕像勋章（devicetype 20）和印度街（id 20）**：雕像不能被当成街道勋章。搬到印度街要发印度街勋章，不能误删雕像。归 Task 6。
4. **9、10 品级生成时同一品级出现重复食材**：构建不报重复，但学菜扣料会合并成一行，配方看起来少一种。归 Task 5。
5. **配送中的单指向已删菜谱**：外卖页不能 500。归 Task 4。

---

## PR 1：老街道修订（分支 `feat/old-street-revision`，已建好，设计文档已提交）

### Task 1: 覆盖老菜谱数据（176 除外）

**Files:**
- Modify: `packages/config/data/dataset/cookbooks.json`
- Modify: `packages/config/data/designed/cookbooks_price.json`
- Modify: `packages/config/data/i18n/{en,fr,es}/cookbooks.json`
- Modify: `packages/config/scripts/sync-data.ts`
- Test: `packages/config/src/build.test.ts:15`、`packages/config/src/runtime.test.ts:40`，以及其他按 2363、72 断言的测试

**Interfaces:**
- Produces：菜谱 2331 道。被删 32 个 id（PR 1 的 Task 3 也要用）：
  `[51,6],[53,6],[57,7],[80,7],[111,3],[247,5],[291,8],[338,9],[388,10],[394,10],[430,10],[440,0],[446,0],[447,0],[459,4],[468,4],[486,4],[17204,2],[17242,2],[17247,2],[17298,2],[17307,2],[17309,4],[17352,4],[17412,8],[17559,7],[17567,7],[17593,7],[17886,10],[18197,12],[18441,5],[18622,10]`（`[id, 原街]`）
- 移街 7 个（`[id, 原街, 新街]`）：
  `[344,9,12],[345,9,12],[346,9,13],[350,9,12],[392,10,11],[401,10,11],[403,10,6]`

- [ ] **Step 1：先改测试期望**
  - `build.test.ts:15`：`toHaveLength(2363)` 改为 `toHaveLength(2331)`。
  - `runtime.test.ts:40`：`allIds.length` 改为 2331；第 39 行新手街 `idsByStreet.get(0)!.length` 改为 69。
  - 再在 `build.test.ts` 的"没有错误，数量正确"后面加一条：

```ts
  it('老街道修订（问题记录 284）：删 32 道、移街 7 道，176 先留在湖南街', () => {
    const b = realBuild().bundle!;
    const ids = new Set(b.cookbooks.map((c) => c.id));
    for (const id of [51, 446, 17204, 18441, 18622]) expect(ids.has(id), String(id)).toBe(false);
    const street = (id: number) => b.cookbooks.find((c) => c.id === id)!.streetId;
    expect([344, 345, 346, 350, 392, 401, 403].map(street)).toEqual([12, 12, 13, 12, 11, 11, 6]);
    expect(street(176)).toBe(1);
    expect(b.cookbooks.find((c) => c.id === 176)!.name).toBe('左宗棠鸡');
    expect(b.cookbooks.find((c) => c.id === 344)!.desc).toBe('楚菜，口味辛、咸、鲜');
  });
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config test -- build.test runtime.test`
Expected: FAIL（数量还是 2363，344 还在 9 号街）

- [ ] **Step 3：生成修订数据**（176 用仓库当前版本）。在仓库根目录运行：

```bash
node -e "
const fs=require('fs');
const D='packages/config/data/';
const curC=require('./'+D+'dataset/cookbooks.json');
const curP=require('./'+D+'designed/cookbooks_price.json');
const revC=require('../data/老数据修订/cookbooks.json');
const revP=require('../data/老数据修订/cookbooks_price.json');
const keep=(cur,rev)=>rev.data.map(x=>x.id===176?cur.data.find(y=>y.id===176):x);
const outC={...revC,data:keep(curC,revC)};outC.count=outC.data.length;
const outP={...curP,data:keep(curP,revP)};outP.count=outP.data.length;
fs.writeFileSync(D+'dataset/cookbooks.json',JSON.stringify(outC,null,1)+'\n');
fs.writeFileSync(D+'designed/cookbooks_price.json',JSON.stringify(outP,null,1)+'\n');
const ids=new Set(outC.data.map(x=>x.id));
for(const l of ['en','fr','es']){const p=D+'i18n/'+l+'/cookbooks.json';const t=require('./'+p);
 const o={};for(const k of Object.keys(t))if(ids.has(Number(k)))o[k]=t[k];fs.writeFileSync(p,JSON.stringify(o,null,1)+'\n');}
console.log(outC.count,outP.count);
"
```

Expected：输出 `2331 2331`。用 `git diff --stat` 确认只动了这 5 个文件。先看原文件的缩进：如果不是 1 空格，就把 `JSON.stringify` 的第三个参数改成和原文件一致，保证 diff 只有内容变化。

- [ ] **Step 4：防止同步脚本覆盖**。在 `packages/config/scripts/sync-data.ts` 的 `DATASET` 数组里删掉 `'cookbooks',`，在数组上方加一行注释：

```ts
// cookbooks 不再同步：仓库里的是老街道修订后的版本（问题记录 284），原版在 analysis/dataset
```

- [ ] **Step 5：跑配置包测试**

Run: `pnpm -F @dt/config test`
Expected: PASS

- [ ] **Step 6：修其他包里按老数量写死的断言**

Run: `pnpm -F @dt/config build && pnpm -F @dt/server test -- cookbook rules && pnpm -F @dt/web test -- CookbooksView`

- 失败的测试如果断言的是"2363 道 / 新手街 72 道"这类总数，改成新数字。
- 如果用到被删 id（如 446 番茄炒蛋），换成同街还在的菜（如 16951 番茄炒鸡蛋）。
- 每处改动都要能说明它只是数据变了。

Expected: PASS

- [ ] **Step 7：提交**

```bash
git add packages/config apps/server apps/web
git commit -m "feat(config): 老街道修订：删 32 道重复菜、7 道回迁地方街（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: "全部食谱"门槛跟随总数

**Files:**
- Modify: `packages/config/src/raw.ts:111-140`（rawStarNeed、rawTask）
- Modify: `packages/config/src/build.ts:500-545`
- Modify: `packages/config/data/designed/tasks.json`（任务 121）、`packages/config/data/designed/star_need.json`（starlevel 12）
- Test: `packages/config/src/build.test.ts`

**Interfaces:**
- Produces：bundle 里 `tasks[].cond.target`、`starNeed[].needCookbooks` 始终是数字。

- [ ] **Step 1：写失败的测试**（加到 `build.test.ts` 的"2A 新增配置"describe 里）

```ts
  it('"全部食谱"的门槛 = 菜谱总数（问题记录 284）', () => {
    const b = realBuild().bundle!;
    expect(b.tasks.find((t) => t.id === 121)!.cond.target).toBe(b.cookbooks.length);
    expect(b.starNeed.find((s) => s.star === 12)!.needCookbooks).toBe(b.cookbooks.length);
  });

  it('门槛写 "all" 时换成菜谱总数；写别的字符串报错', () => {
    const src = source();
    const tasks = structuredClone(src['designed/tasks']) as Array<{ id: number; cond: { target: unknown } }>;
    tasks.find((t) => t.id === 121)!.cond.target = 'all';
    const { bundle } = buildBundle({ ...src, 'designed/tasks': tasks });
    expect(bundle!.tasks.find((t) => t.id === 121)!.cond.target).toBe(bundle!.cookbooks.length);
    tasks.find((t) => t.id === 121)!.cond.target = 'most';
    expect(buildBundle({ ...src, 'designed/tasks': tasks }).errors.join()).toMatch(/designed\/tasks/);
  });
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config test -- build.test`
Expected: FAIL（target 还是 2363；`'all'` 被 zod 拒绝）

- [ ] **Step 3：实现**

`raw.ts`：在 `const int = z.number().int();` 下面加一行，再把两个字段换成它：

```ts
/** 数量门槛：数字，或 "all" = 菜谱总数（构建时换算，问题记录 284） */
const countOrAll = z.union([z.number().int(), z.literal('all')]);
```

```ts
  needCookbooksnum: countOrAll,
```

```ts
  cond: z.object({ kind: z.enum(['counter', 'state']), key: z.string(), target: countOrAll }),
```

`build.ts`：在 `const starNeed = starNeedRaw.map(` 上方加：

```ts
  const allOr = (n: number | 'all') => (n === 'all' ? cookbooks.length : n);
```

- starNeed 映射里，`needCookbooks: s.needCookbooksnum` 改为 `needCookbooks: allOr(s.needCookbooksnum)`；
- tasks 映射里，`cond: t.cond` 改为 `cond: { ...t.cond, target: allOr(t.cond.target) }`。

数据：
- `designed/tasks.json` 任务 121 的 `"target": 2363` 改为 `"target": "all"`；
- `designed/star_need.json` starlevel 12 的 `"needCookbooksnum": 2363` 改为 `"needCookbooksnum": "all"`。

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/config test && pnpm -F @dt/config typecheck`
Expected: PASS

- [ ] **Step 5：提交**

```bash
git add packages/config
git commit -m "feat(config): 全部食谱任务和泛紫 5 星的门槛跟随菜谱总数（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: 迁移 0039：修正已学数据和外卖单

**Files:**
- Create: `apps/server/src/db/migrations/0039_old_street_revision.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Test: `apps/server/src/db/migrations/0039.test.ts`

**Interfaces:**
- Produces：`export async function reviseCookbooks(db: Kysely<any>, deleted: ReadonlyArray<readonly [number, number]>, moved: ReadonlyArray<readonly [number, number, number]>): Promise<void>`。Task 10 的 0040 复用它，`deleted` 传空数组。

- [ ] **Step 1：写失败的测试**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { DELETED, MOVED, reviseCookbooks } from './0039_old_street_revision';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

/** 建一家店：levels 长度 len，按 learned 写品级，counts 原样存 */
async function rest(len: number, learned: Record<number, number>, counts: object): Promise<number> {
  const id = await createRestaurantRow(db, shard, await createAccountRow(db), {
    cookbook_counts: JSON.stringify(counts),
  });
  const levels = Buffer.alloc(len);
  for (const [k, v] of Object.entries(learned)) levels[Number(k)] = v;
  await db.insertInto('restaurant_cookbooks').values({ rest_id: id, levels }).execute();
  return id;
}
const read = async (id: number) => ({
  levels: (await db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', id).executeTakeFirstOrThrow()).levels,
  counts: (await db.selectFrom('restaurant').select('cookbook_counts').where('id', '=', id).executeTakeFirstOrThrow()).cookbook_counts,
});

describe('迁移 0039：老街道修订（问题记录 284）', () => {
  it('清单和设计文档一致：删 32 道、移街 7 道', () => {
    expect(DELETED).toHaveLength(32);
    expect(MOVED).toHaveLength(7);
  });

  it('被删的菜：已学数、品级数、原街已学数各减一，字节清 0；移街的菜：原街减一、新街加一；别的不动', async () => {
    const id = await rest(18747, { 446: 3, 51: 5, 1: 2, 344: 1 }, {
      learned: 4,
      grade: [0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      street: { '0': 1, '6': 2, '9': 1 },
    });
    await reviseCookbooks(db, DELETED, MOVED);
    const r = await read(id);
    expect([r.levels[446], r.levels[51], r.levels[1], r.levels[344]]).toEqual([0, 0, 2, 1]);
    expect(r.counts).toEqual({
      learned: 2,
      grade: [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      street: { '0': 0, '6': 1, '9': 0, '12': 1 },
    });
  });

  it('计数本来就不准时不减成负数；字节串比 id 短的店不受影响', async () => {
    const a = await rest(18747, { 446: 3 }, { learned: 0, grade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: {} });
    const b = await rest(100, { 1: 1 }, { learned: 1, grade: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: { '6': 1 } });
    await reviseCookbooks(db, DELETED, MOVED);
    expect((await read(a)).counts).toEqual({ learned: 0, grade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: { '0': 0 } });
    expect((await read(b)).counts).toEqual({ learned: 1, grade: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: { '6': 1 } });
    expect((await read(b)).levels.length).toBe(100);
  });

  it('外卖：删掉点了被删菜谱、还能接的单；配送中的和别的菜的单保留', async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000);
    const order = (cookbook_id: number, state: number) =>
      db
        .insertInto('takeaway_order')
        .values({ shard_id: shard, owner_rest_id: null, cookbook_id, grade: 1, need_minutes: 30, need_renown: 3, state, created_at: now, expires_at: later })
        .returning('id')
        .executeTakeFirstOrThrow();
    const gone = await order(446, 1);
    const busy = await order(446, 2);
    const fine = await order(1, 1);
    await reviseCookbooks(db, DELETED, MOVED);
    const left = (await db.selectFrom('takeaway_order').select('id').where('shard_id', '=', shard).execute()).map((r) => r.id);
    expect(left).toContain(busy.id);
    expect(left).toContain(fine.id);
    expect(left).not.toContain(gone.id);
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/server test -- 0039`
Expected: FAIL（找不到模块 `./0039_old_street_revision`）

- [ ] **Step 3：实现迁移**

```ts
import { sql, type Kysely } from 'kysely';

/** 老街道修订（问题记录 284）删掉的菜谱：[id, 原街道] */
export const DELETED: ReadonlyArray<readonly [number, number]> = [
  [51, 6], [53, 6], [57, 7], [80, 7], [111, 3], [247, 5], [291, 8], [338, 9], [388, 10], [394, 10], [430, 10],
  [440, 0], [446, 0], [447, 0], [459, 4], [468, 4], [486, 4], [17204, 2], [17242, 2], [17247, 2], [17298, 2],
  [17307, 2], [17309, 4], [17352, 4], [17412, 8], [17559, 7], [17567, 7], [17593, 7], [17886, 10], [18197, 12],
  [18441, 5], [18622, 10],
];
/** 移街的菜谱：[id, 原街道, 新街道]（176 移到杂碎街在 0040） */
export const MOVED: ReadonlyArray<readonly [number, number, number]> = [
  [344, 9, 12], [345, 9, 12], [346, 9, 13], [350, 9, 12], [392, 10, 11], [401, 10, 11], [403, 10, 6],
];

interface Counts {
  learned: number;
  grade: number[];
  street: Record<string, number>;
}
const dec = (n: number | undefined) => Math.max(0, (n ?? 0) - 1);

/**
 * 按清单修正每家店的已学食谱：被删的清字节、扣计数，移街的把街道计数挪过去（计数不低于 0）；
 * 再删掉点了被删菜谱、还能接（state 1）的外卖单。配送中的单照常走完（配送完成不读菜谱）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reviseCookbooks(
  db: Kysely<any>,
  deleted: ReadonlyArray<readonly [number, number]>,
  moved: ReadonlyArray<readonly [number, number, number]>,
): Promise<void> {
  const { rows } = await sql<{ rest_id: number; levels: Buffer; counts: Counts }>`
    select c.rest_id, c.levels, r.cookbook_counts as counts
    from restaurant_cookbooks c join restaurant r on r.id = c.rest_id
    where length(c.levels) > ${Math.min(...deleted.map((d) => d[0]), ...moved.map((m) => m[0]))}`.execute(db);
  for (const row of rows) {
    const levels = Buffer.from(row.levels);
    const c: Counts = { learned: row.counts.learned, grade: [...row.counts.grade], street: { ...row.counts.street } };
    let changed = false;
    for (const [id, street] of deleted) {
      const g = id < levels.length ? levels[id]! : 0;
      if (g === 0) continue;
      c.learned = dec(c.learned);
      c.grade[g] = dec(c.grade[g]);
      c.street[String(street)] = dec(c.street[String(street)]);
      levels[id] = 0;
      changed = true;
    }
    for (const [id, from, to] of moved) {
      if (id >= levels.length || levels[id] === 0) continue;
      c.street[String(from)] = dec(c.street[String(from)]);
      c.street[String(to)] = (c.street[String(to)] ?? 0) + 1;
      changed = true;
    }
    if (!changed) continue;
    await sql`update restaurant_cookbooks set levels = ${levels} where rest_id = ${row.rest_id}`.execute(db);
    await sql`update restaurant set cookbook_counts = ${JSON.stringify(c)}::jsonb where id = ${row.rest_id}`.execute(db);
  }
  if (deleted.length > 0)
    await sql`delete from takeaway_order where state = 1 and cookbook_id = any(${deleted.map((d) => d[0])}::int[])`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await reviseCookbooks(db, DELETED, MOVED);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {
  // 删掉的已学记录无法还原
}
```

实现时先确认 `restaurant.cookbook_counts` 的列类型（`select data_type from information_schema.columns ...`）：
- jsonb：上面写法可用；
- json：把 `::jsonb` 改成 `::json`。

`index.ts`：加 `import * as m0039 from './0039_old_street_revision';` 和 `'0039_old_street_revision': m0039,`。

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/server test -- 0039 migrate`
Expected: PASS

- [ ] **Step 5：提交**

```bash
git add apps/server/src/db/migrations
git commit -m "feat(server): 迁移 0039：老街道修订后清理已学记录、重算计数、删失效外卖单（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: 外卖页容错，PR 1 收尾

**Files:**
- Modify: `apps/server/src/modules/takeaway/view.ts:165`
- Test: `apps/server/src/modules/takeaway/deliver.test.ts`
- Modify: `docs/roadmap.md`（第 12 项状态改为"进行中：老街道修订 PR"）

- [ ] **Step 1：写失败的测试**（加到 `deliver.test.ts` 的"接单"describe 末尾）

```ts
  it('配送中的单对应的食谱被删了（老街道修订，问题记录 284）：外卖页照常打开，菜名为空', async () => {
    const { ctx, rider } = await cook();
    const order = await addOrder(t, ctx.shardId);
    await deliver(ctx, order, rider);
    await t.db.updateTable('takeaway_order').set({ cookbook_id: 999_999 }).where('id', '=', order).execute();
    const v = await t.game.takeaway.overview(ctx);
    expect(v.deliveries).toHaveLength(1);
    expect(v.deliveries[0]).toMatchObject({ cookbookId: 999_999, cookbookName: '' });
  });
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/server test -- takeaway/deliver`
Expected: FAIL（`unknown cookbook 999999`）

- [ ] **Step 3：实现**：`view.ts:165` 的 `cookbookName: config.requireCookbook(v.cookbook_id).name,` 改为 `cookbookName: config.cookbooks.get(v.cookbook_id)?.name ?? '',`

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/server test -- takeaway`
Expected: PASS

- [ ] **Step 5：PR 1 全量验证**

```bash
pnpm -F @dt/config build
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test
```

Expected：全部通过（`format:check` 只报 `问题记录.md`）。然后重启 dev（按记忆里的进程树清理方法），确认 API 能起来，dev 日志里看到迁移 0039 执行。

- [ ] **Step 6：提交、推送、开 PR**
  - roadmap 第 12 项状态写"进行中（老街道修订 #PR1）"。
  - 提交后 `git push -u origin feat/old-street-revision`。
  - 用 gh 开 PR：正文用中文写清删了哪些、移了哪些、迁移做了什么、测试结果，结尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
  - PR 链接给用户，等用户合并。

---

## PR 2：新街道接入（分支 `feat/new-streets`，从 `feat/old-street-revision` 切出）

### Task 5: 8~10 品级生成函数

**Files:**
- Create: `packages/config/src/gradeGen.ts`
- Test: `packages/config/src/gradeGen.test.ts`

**Interfaces:**
- Produces:
  - `export type FoodNum = { foodsId: number; num: number }`
  - `export type GradeTable = Record<string, FoodNum[]>`
  - `export function collectTransitions(old: ReadonlyArray<{ needFoodsByLevel: GradeTable }>, from: number, to: number): Transitions`
  - `export function extendGrades(grades: GradeTable, t89: Transitions, t910: Transitions, isMystery: (foodsId: number) => boolean, rng: Rng): GradeTable`：输入 1~7，返回 1~10

- [ ] **Step 1：写失败的测试**

```ts
import { describe, expect, it } from 'vitest';
import { seededRng, sequenceRng } from '@dt/shared';
import { collectTransitions, extendGrades, type GradeTable } from './gradeGen';

const g = (...ids: number[]) => ids.map((foodsId) => ({ foodsId, num: 1 }));
/** 1~7 品级：普通食材 1→6 品级 ×10、7 品级 ×25；900 是神秘食材（×3、×8） */
function base(ids: number[]): GradeTable {
  const t: GradeTable = {};
  for (let i = 1; i <= 5; i++) t[String(i)] = g(...ids);
  t['6'] = ids.map((foodsId) => ({ foodsId, num: foodsId === 900 ? 3 : 10 }));
  t['7'] = ids.map((foodsId) => ({ foodsId, num: foodsId === 900 ? 8 : 25 }));
  return t;
}
const isMystery = (id: number) => id === 900;

/** 老数据：食材 1 在 8→9 品级 3 次换成 50×100、1 次不换；9→10 时 50 换成 60×25 */
const old: Array<{ needFoodsByLevel: GradeTable }> = [
  ...Array.from({ length: 3 }, () => ({
    needFoodsByLevel: { '8': [{ foodsId: 1, num: 100 }], '9': [{ foodsId: 50, num: 100 }], '10': [{ foodsId: 60, num: 25 }] },
  })),
  { needFoodsByLevel: { '8': [{ foodsId: 1, num: 100 }], '9': [{ foodsId: 1, num: 100 }], '10': [{ foodsId: 1, num: 100 }] } },
];

describe('8~10 品级生成（问题记录 284）', () => {
  it('统计老数据的换料频率（按格子位置对应）', () => {
    const t = collectTransitions(old, 8, 9);
    expect([...t.get(1)!.values()]).toEqual([
      { foodsId: 50, num: 100, count: 3 },
      { foodsId: 1, num: 100, count: 1 },
    ]);
  });

  it('8 品级沿用 7 品级食材：普通 ×100、神秘 ×20；没有换料记录的食材 9、10 品级不换（普通 100、神秘 25/32）', () => {
    const r = extendGrades(base([7, 8, 900]), new Map(), new Map(), isMystery, seededRng(1));
    expect(r['8']).toEqual([{ foodsId: 7, num: 100 }, { foodsId: 8, num: 100 }, { foodsId: 900, num: 20 }]);
    expect(r['9']).toEqual([{ foodsId: 7, num: 100 }, { foodsId: 8, num: 100 }, { foodsId: 900, num: 25 }]);
    expect(r['10']).toEqual([{ foodsId: 7, num: 100 }, { foodsId: 8, num: 100 }, { foodsId: 900, num: 32 }]);
    expect(r['7']).toEqual(base([7, 8, 900])['7']);
  });

  it('按次数加权抽取：随机数落在前 3/4 换成 50，落在后 1/4 不换；10 品级接着按 9→10 抽', () => {
    const t89 = collectTransitions(old, 8, 9);
    const t910 = collectTransitions(old, 9, 10);
    const a = extendGrades(base([1, 2, 3]), t89, t910, isMystery, sequenceRng([0.5]));
    expect(a['9']![0]).toEqual({ foodsId: 50, num: 100 });
    expect(a['10']![0]).toEqual({ foodsId: 60, num: 25 });
    const b = extendGrades(base([1, 2, 3]), t89, t910, isMystery, sequenceRng([0.9]));
    expect(b['9']![0]).toEqual({ foodsId: 1, num: 100 });
  });

  it('同一品级不出现重复食材：要换成的食材已在别的格子里就不选它', () => {
    const t89 = collectTransitions(old, 8, 9);
    const r = extendGrades(base([1, 50, 3]), t89, new Map(), isMystery, sequenceRng([0.1]));
    expect(r['9']!.map((f) => f.foodsId)).toEqual([1, 50, 3]);
  });

  it('同样的种子结果相同', () => {
    const t89 = collectTransitions(old, 8, 9);
    const t910 = collectTransitions(old, 9, 10);
    const run = () => extendGrades(base([1, 2, 3]), t89, t910, isMystery, seededRng(2026));
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config test -- gradeGen`
Expected: FAIL（找不到模块 `./gradeGen`）

- [ ] **Step 3：实现 `gradeGen.ts`**

```ts
import type { Rng } from '@dt/shared';

/**
 * 新菜谱 8~10 品级生成（问题记录 284，设计文档 §5.3）。
 * 老菜谱的 8~10 品级来自原游戏：8 品级沿用 7 品级食材（普通 ×100、神秘 ×20），
 * 9、10 品级部分格子会换成更高级的食材。这里按老数据"同一食材在 8→9、9→10 品级换成什么、几个"的次数加权抽取
 */
export type FoodNum = { foodsId: number; num: number };
export type GradeTable = Record<string, FoodNum[]>;
type Option = { foodsId: number; num: number; count: number };
/** 食材 id → 换料结果（key = `${foodsId}x${num}`，含不换） */
export type Transitions = Map<number, Map<string, Option>>;

/** 统计老数据 from 品级 → to 品级每个格子的换料次数（格子按位置对应） */
export function collectTransitions(
  old: ReadonlyArray<{ needFoodsByLevel: GradeTable }>,
  from: number,
  to: number,
): Transitions {
  const out: Transitions = new Map();
  for (const c of old) {
    const a = c.needFoodsByLevel[String(from)] ?? [];
    const b = c.needFoodsByLevel[String(to)] ?? [];
    a.forEach((x, i) => {
      const y = b[i];
      if (!y) return;
      let m = out.get(x.foodsId);
      if (!m) out.set(x.foodsId, (m = new Map()));
      const key = `${y.foodsId}x${y.num}`;
      const e = m.get(key);
      if (e) e.count += 1;
      else m.set(key, { foodsId: y.foodsId, num: y.num, count: 1 });
    });
  }
  return out;
}

/** 下一个品级：逐格按次数加权抽；选项排除本品级已经用到的食材，没得选就不换 */
function step(prev: FoodNum[], t: Transitions, keepNum: (f: FoodNum) => number, rng: Rng): FoodNum[] {
  const out: FoodNum[] = [];
  prev.forEach((f, i) => {
    const taken = new Set([...out.map((x) => x.foodsId), ...prev.slice(i + 1).map((x) => x.foodsId)]);
    const options = [...(t.get(f.foodsId)?.values() ?? [])].filter((o) => !taken.has(o.foodsId));
    const total = options.reduce((s, o) => s + o.count, 0);
    if (total === 0) {
      out.push({ foodsId: f.foodsId, num: keepNum(f) });
      return;
    }
    let r = rng.next() * total;
    const pick = options.find((o) => (r -= o.count) < 0) ?? options[options.length - 1]!;
    out.push({ foodsId: pick.foodsId, num: pick.num });
  });
  return out;
}

/** 输入 1~7 品级，补出 8~10 品级 */
export function extendGrades(
  grades: GradeTable,
  t89: Transitions,
  t910: Transitions,
  isMystery: (foodsId: number) => boolean,
  rng: Rng,
): GradeTable {
  const g7 = grades['7'] ?? [];
  const g8 = g7.map((f) => ({ foodsId: f.foodsId, num: isMystery(f.foodsId) ? 20 : 100 }));
  const g9 = step(g8, t89, (f) => (isMystery(f.foodsId) ? 25 : f.num), rng);
  const g10 = step(g9, t910, (f) => (isMystery(f.foodsId) ? 32 : f.num), rng);
  return { ...grades, '8': g8, '9': g9, '10': g10 };
}
```

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/config test -- gradeGen && pnpm -F @dt/config typecheck`
Expected: PASS。`sequenceRng([0.5])` 的语义是"一直返回列表里的值"还是"循环"，先读 `packages/shared/src/rng.ts` 确认。如果用完会报错，就在测试里多给几个值。

- [ ] **Step 5：提交**

```bash
git checkout -b feat/new-streets
git add packages/config/src/gradeGen.ts packages/config/src/gradeGen.test.ts
git commit -m "feat(config): 新菜谱 8~10 品级按老数据换料频率生成（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（如果 PR 1 已经合并：先 `git checkout main && git pull`，再从 main 切 `feat/new-streets`。）

### Task 6: 导入新数据、构建合并、街道勋章对应表

**Files:**
- Create: `packages/config/scripts/import-new-streets.ts`
- Create（脚本生成）: `packages/config/data/designed/{streets_new,foods_new,street_medals_new,cookbooks_new,cookbooks_price_new}.json`
- Create（手写）: `packages/config/data/designed/street_medal_map.json`
- Modify: `packages/config/src/source.ts`、`raw.ts`、`build.ts`、`types.ts`（Street 加 `medalId`）、`runtime.ts:213-217`、`package.json`（scripts 加 `"import-streets": "tsx scripts/import-new-streets.ts"`）
- Test: `packages/config/src/build.test.ts`、`runtime.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `collectTransitions`、`extendGrades`。
- Produces:
  - `Street.medalId: number`；
  - `GameConfig.streetMedalId(streetId)`、`GameConfig.isStreetMedal(g)` 改用对应表；
  - 菜谱 3810 道；街道 30 条；食材 336 种；道具 698 件。

- [ ] **Step 1：写失败的测试**
  - `build.test.ts` 第一条里的数量改为：foods 336、goods 698、cookbooks 3810、streets 30。
  - 第一个 describe 里再加：

```ts
  it('新街道（问题记录 284）：每道菜 10 个品级、每条街一枚勋章', () => {
    const b = realBuild().bundle!;
    for (const c of b.cookbooks.filter((x) => x.id >= 18747))
      for (let g = 1; g <= 10; g++) {
        const ids = c.needFoods[g]!.map((f) => f.foodsId);
        expect(new Set(ids).size, `${c.id} grade ${g}`).toBe(ids.length);
      }
    expect(b.streets.map((s) => s.medalId)).toEqual([
      140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 187, 188, 189,
      628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643,
    ]);
    expect(b.cookbooks.find((c) => c.id === 18747)).toMatchObject({ name: '鲷鱼握寿司', streetId: 14, coin: 910, level: 3 });
  });
```

  - 在"坏数据"describe 里加：

```ts
  it('街道勋章对应表：街道缺勋章、对应的不是勋章时报错', () => {
    const src = source();
    const map = (src['designed/street_medal_map'] as Array<{ streetId: number; goodsId: number }>).filter(
      (m) => m.streetId !== 20,
    );
    map.push({ streetId: 21, goodsId: 1 });
    const { errors } = buildBundle({ ...src, 'designed/street_medal_map': map });
    expect(errors).toContain('street 20 has no medal');
    expect(errors).toContain('street_medal_map street 21 goods 1 is not a medal');
  });
```

  - `runtime.test.ts` 在 `streetMedalId` 那几行后加：

```ts
    expect(cfg.streetMedalId(20)).toBe(634);
    expect(cfg.streetMedalId(29)).toBe(643);
    // 雕像的 devicetype 也是 20，不是印度街勋章（问题记录 284）
    expect(cfg.isStreetMedal(cfg.requireGoods(397))).toBe(false);
    expect(cfg.isStreetMedal(cfg.requireGoods(634))).toBe(true);
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config test -- build.test runtime.test`
Expected: FAIL（数量不对，`medalId` 不存在）

- [ ] **Step 3：写导入脚本 `scripts/import-new-streets.ts`**

```ts
/**
 * 导入另一个 agent 生成的新街道数据（问题记录 284，设计文档 §5.1~5.3）：
 *   pnpm -F @dt/config import-streets [新街道菜谱目录] [i18n 目录]
 * 默认读仓库外的 ../data/新街道菜谱 和 ../data/i18n。写出 data/designed/*_new.json，补 8~10 品级，
 * 再把新菜的英法西菜名并进 data/i18n/<语言>/cookbooks.json。重跑会整份替换这些文件
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededRng } from '@dt/shared';
import { collectTransitions, extendGrades, type GradeTable } from '../src/gradeGen';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2] ?? resolve(pkg, '../../../data/新街道菜谱');
const i18nDir = process.argv[3] ?? resolve(pkg, '../../../data/i18n');
const data = join(pkg, 'data');
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const write = (name: string, rule: string, list: unknown[]) =>
  writeFileSync(
    join(data, 'designed', `${name}.json`),
    JSON.stringify({ source: '新设计(data/新街道菜谱，import-new-streets.ts 导入)', rule, count: list.length, data: list }, null, 1) + '\n',
  );
const pick = <T extends object>(o: T, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]]));

type Cb = { id: number; name: string; streetId: number; taste: number[]; coin: number; level: number; desc: string; needFoodsByLevel: GradeTable };
type Food = { id: number; level: number };
const streets = read<{ data: object[] }>(join(srcDir, 'streets_new.json')).data;
const foods = read<{ data: Food[] }>(join(srcDir, 'foods_new.json')).data;
const medals = read<{ data: object[] }>(join(srcDir, 'street_medals_new.json')).data;
const cookbooks = read<{ data: Cb[] }>(join(srcDir, 'cookbooks_new.json')).data;

const old = read<{ data: Array<{ needFoodsByLevel: GradeTable }> }>(join(data, 'dataset/cookbooks.json')).data;
const level = new Map([...read<{ data: Food[] }>(join(data, 'dataset/foods.json')).data, ...foods].map((f) => [f.id, f.level]));
const t89 = collectTransitions(old, 8, 9);
const t910 = collectTransitions(old, 9, 10);
const rng = seededRng(284);

write('streets_new', '新增街道 14~29；desc = 街道加成文字（与勋章 desc 一致）', streets.map((s) => pick(s, ['id', 'name', 'cookname', 'cookshortname', 'desc'])));
write('foods_new', '新增食材：13 种基础 + 10 种高级版（说明字段见 data/新街道菜谱/foods_new.json）', foods.map((f) => pick(f, ['id', 'name', 'level', 'coin', 'odds', 'maxNum', 'masterClass', 'lockflag', 'desc', 'type', 'typeName'])));
write('street_medals_new', '新街道勋章（type 9，devicetype = 街道 id；对应关系以 street_medal_map 为准）', medals.map((m) => {
  const { _src, ...rest } = m as Record<string, unknown>;
  void _src;
  return rest;
}));
const sorted = [...cookbooks].sort((a, b) => a.id - b.id);
write('cookbooks_new', '新街道菜谱；1~7 品级来自 data/新街道菜谱，8~10 品级按老数据换料频率生成（gradeGen.ts，种子 284）', sorted.map((c) => ({
  id: c.id,
  name: c.name,
  streetId: c.streetId,
  taste: c.taste,
  needFoodsByLevel: extendGrades(c.needFoodsByLevel, t89, t910, (id) => level.get(id) === 7, rng),
})));
write('cookbooks_price_new', '新街道菜谱的售价、推荐等级、描述（规则同 cookbooks_price）', sorted.map((c) => ({ id: c.id, coin: c.coin, level: c.level, desc: c.desc })));

for (const l of ['en', 'fr', 'es']) {
  const p = join(data, 'i18n', l, 'cookbooks.json');
  const mine = read<Record<string, { name: string }>>(p);
  const theirs = read<Record<string, { name: string }>>(join(i18nDir, l, 'cookbooks.json'));
  for (const c of sorted) if (theirs[c.id]) mine[c.id] = { name: theirs[c.id]!.name };
  writeFileSync(p, JSON.stringify(mine, null, 1) + '\n');
}
console.log(`streets ${streets.length}, foods ${foods.length}, medals ${medals.length}, cookbooks ${sorted.length}`);
```

缩进和换行跟 Task 1 一样，按原文件的写法来。

- [ ] **Step 4：手写 `designed/street_medal_map.json`**

```json
{
 "source": "新设计（问题记录 284）",
 "rule": "每条街对应的街道勋章；搬家时按这张表换勋章（以前按 devicetype<=13 识别，雕像 devicetype 20 会和印度街冲突）",
 "count": 30,
 "data": [
  { "streetId": 0, "goodsId": 140 }, { "streetId": 1, "goodsId": 141 }, { "streetId": 2, "goodsId": 142 },
  { "streetId": 3, "goodsId": 143 }, { "streetId": 4, "goodsId": 144 }, { "streetId": 5, "goodsId": 145 },
  { "streetId": 6, "goodsId": 146 }, { "streetId": 7, "goodsId": 147 }, { "streetId": 8, "goodsId": 148 },
  { "streetId": 9, "goodsId": 149 }, { "streetId": 10, "goodsId": 150 }, { "streetId": 11, "goodsId": 187 },
  { "streetId": 12, "goodsId": 188 }, { "streetId": 13, "goodsId": 189 }, { "streetId": 14, "goodsId": 628 },
  { "streetId": 15, "goodsId": 629 }, { "streetId": 16, "goodsId": 630 }, { "streetId": 17, "goodsId": 631 },
  { "streetId": 18, "goodsId": 632 }, { "streetId": 19, "goodsId": 633 }, { "streetId": 20, "goodsId": 634 },
  { "streetId": 21, "goodsId": 635 }, { "streetId": 22, "goodsId": 636 }, { "streetId": 23, "goodsId": 637 },
  { "streetId": 24, "goodsId": 638 }, { "streetId": 25, "goodsId": 639 }, { "streetId": 26, "goodsId": 640 },
  { "streetId": 27, "goodsId": 641 }, { "streetId": 28, "goodsId": 642 }, { "streetId": 29, "goodsId": 643 }
 ]
}
```

（先用 node 核对 `data/新街道菜谱/street_medals_new.json` 里每枚勋章的 devicetype 和 id 确实一一对应。）

- [ ] **Step 5：接进构建**
  - **`source.ts`**：`SOURCE_FILES` 里 `'designed/cookbooks_price',` 后面加：

```ts
  'designed/cookbooks_price_new',
  'designed/cookbooks_new',
  'designed/foods_new',
  'designed/streets_new',
  'designed/street_medals_new',
  'designed/street_medal_map',
```

  - **`raw.ts`** 加：

```ts
export const rawStreetMedal = z.object({ streetId: int, goodsId: int });
```

  - **`build.ts`**：parse 区域的四个原始列表改为拼接新文件：

```ts
  /** 原始数据 + 新设计的同类数据（新街道，问题记录 284）；任一份解析失败就是 null */
  const both = <T>(a: T[] | null, b: T[] | null): T[] | null => (a && b ? [...a, ...b] : null);
  const foodsRaw = both(parse('dataset/foods', z.array(raw.rawFood)), parse('designed/foods_new', z.array(raw.rawFood)));
  const goodsRaw = both(parse('dataset/goods', z.array(raw.rawGoods)), parse('designed/street_medals_new', z.array(raw.rawGoods)));
  const cookbooksRaw = both(parse('dataset/cookbooks', z.array(raw.rawCookbook)), parse('designed/cookbooks_new', z.array(raw.rawCookbook)));
  const streetsRaw = both(parse('dataset/streets', z.array(raw.rawStreet)), parse('designed/streets_new', z.array(raw.rawStreet)));
```

    `pricesRaw` 同样拼上 `designed/cookbooks_price_new`。再加：

```ts
  const medalMapRaw = parse('designed/street_medal_map', z.array(raw.rawStreetMedal));
```

    并把 `!medalMapRaw ||` 加进第 140 行附近的空值检查。

  - **街道段**（原 `const streets = streetsRaw.map(` 处）改为：

```ts
  // ---------- 街道 ----------
  // 街道勋章用显式对应表（问题记录 284）：以前按 devicetype<=13 识别，雕像 devicetype 20 会和印度街冲突
  const medalOf = new Map<number, number>();
  for (const m of medalMapRaw) {
    const g = goods.find((x) => x.id === m.goodsId);
    if (!g || g.type !== GOODS_TYPE.honor)
      errors.push(`street_medal_map street ${m.streetId} goods ${m.goodsId} is not a medal`);
    if (medalOf.has(m.streetId)) errors.push(`street_medal_map street ${m.streetId} listed twice`);
    medalOf.set(m.streetId, m.goodsId);
  }
  unique('street_medal_map goods', medalMapRaw.map((m) => m.goodsId));
  const streets = streetsRaw.map((s) => {
    const medalId = medalOf.get(s.id);
    if (medalId === undefined) errors.push(`street ${s.id} has no medal`);
    return { id: s.id, name: s.name, cookName: s.cookname ?? '', desc: s.desc ?? '', medalId: medalId ?? -1 };
  });
  for (const id of medalOf.keys())
    if (!streets.some((s) => s.id === id)) errors.push(`street_medal_map references unknown street ${id}`);
```

    如果 `goods` 是在街道段之后才定义的，就把这段挪到 `goods` 定义之后。`unique` 的签名先读一下，按现有用法传参。

  - **`types.ts`**：`Street` 加 `medalId: number;`（注释：街道勋章 goods id）。
  - **`runtime.ts`** 第 213~217 行改为：

```ts
  const streetMedals = new Map(bundle.streets.map((s) => [s.id, s.medalId]));
  const medalIds = new Set(streetMedals.values());
  const isStreetMedal = (g: Goods) => medalIds.has(g.id);
```

  - **`package.json`** scripts 加 `"import-streets": "tsx scripts/import-new-streets.ts"`。

- [ ] **Step 6：运行导入、跑测试**

```bash
pnpm -F @dt/config import-streets
pnpm -F @dt/config test -- build.test runtime.test gradeGen
```

Expected：
- 导入输出 `streets 16, foods 23, medals 16, cookbooks 1479`；
- 测试 PASS。`i18n.test` 这时会因为缺新街、新食材、新勋章的译文失败，Task 7 补。

再跑一遍导入，`git status` 应该没有新变化（可以重复执行）。

- [ ] **Step 7：修其他包的类型和测试**

Run: `pnpm typecheck`

- 有地方手写 `Street` 对象（测试夹具等）缺 `medalId`，就补上对应的勋章 id；
- 按 14 条街、2331 道断言的测试，改成新数量。

Expected: PASS

- [ ] **Step 8：提交**

```bash
git add packages/config apps
git commit -m "feat(config): 导入 16 条新街道、1479 道菜谱、23 种食材和街道勋章；勋章改用对应表（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: 新街、勋章、食材的英法西译名

**Files:**
- Modify: `packages/config/data/i18n/{en,fr,es}/streets.json`（加 14~29）
- Modify: `packages/config/data/i18n/{en,fr,es}/goods.json`（加 628~643）
- Modify: `packages/config/data/i18n/{en,fr,es}/foods.json`（加 584~606）
- Modify: `docs/i18n-glossary.md`
- Test: `packages/config/src/i18n.test.ts`（现有的"每个 id、每个字段都翻了"）

- [ ] **Step 1：运行，确认失败**

Run: `pnpm -F @dt/config test -- i18n.test`
Expected: FAIL（`en streets 14 name` 等缺失）

- [ ] **Step 2：写街道**。勋章的 name 和街名相同，desc 和街道 desc 相同。

| id | en name / cookName | fr name / cookName | es name / cookName |
|---|---|---|---|
| 14 | Japan Street / Japanese cuisine | Rue du Japon / Cuisine japonaise | Calle Japón / Cocina japonesa |
| 15 | Italy Street / Italian cuisine | Rue d'Italie / Cuisine italienne | Calle Italia / Cocina italiana |
| 16 | France Street / French cuisine | Rue de France / Cuisine française | Calle Francia / Cocina francesa |
| 17 | Spain Street / Spanish cuisine | Rue d'Espagne / Cuisine espagnole | Calle España / Cocina española |
| 18 | Mexico Street / Mexican cuisine | Rue du Mexique / Cuisine mexicaine | Calle México / Cocina mexicana |
| 19 | Thailand Street / Thai cuisine | Rue de Thaïlande / Cuisine thaïlandaise | Calle Tailandia / Cocina tailandesa |
| 20 | India Street / Indian cuisine | Rue de l'Inde / Cuisine indienne | Calle India / Cocina india |
| 21 | Turkey Street / Turkish cuisine | Rue de Turquie / Cuisine turque | Calle Turquía / Cocina turca |
| 22 | Vietnam Street / Vietnamese cuisine | Rue du Vietnam / Cuisine vietnamienne | Calle Vietnam / Cocina vietnamita |
| 23 | America Street / American cuisine | Rue d'Amérique / Cuisine américaine | Calle América / Cocina estadounidense |
| 24 | Morocco Street / Moroccan cuisine | Rue du Maroc / Cuisine marocaine | Calle Marruecos / Cocina marroquí |
| 25 | Argentina Street / Argentine cuisine | Rue d'Argentine / Cuisine argentine | Calle Argentina / Cocina argentina |
| 26 | Greece Street / Greek cuisine | Rue de Grèce / Cuisine grecque | Calle Grecia / Cocina griega |
| 27 | Peru Street / Peruvian cuisine | Rue du Pérou / Cuisine péruvienne | Calle Perú / Cocina peruana |
| 28 | Russia Street / Russian cuisine | Rue de Russie / Cuisine russe | Calle Rusia / Cocina rusa |
| 29 | Chop Suey Street / Overseas Chinese cuisine | Rue Chop Suey / Cuisine chinoise d'outre-mer | Calle Chop Suey / Cocina china de ultramar |

**加成说明（desc）**：
- 按 `designed/streets_new.json` 的中文 desc 逐项翻译，项与项之间用逗号加空格隔开；
- 英文首字母大写；法文百分号前加空格（`+12 %`）；西文 `+12%`；
- 用语和现有街道、道具保持一致：

| 中文 | en | fr | es |
|---|---|---|---|
| 上座率 | occupancy | fréquentation | ocupación |
| 挑剔率 | picky rate | clients difficiles | clientes exigentes |
| 每桌银币 | coins per table | pièces par table | monedas por mesa |
| 每桌经验 | EXP per table | EXP par table | EXP por mesa |
| 每桌耗油 | oil per table | huile par table | aceite por mesa |
| 耗油 | oil use | consommation d'huile | consumo de aceite |
| 最终银币收益 | final coins | pièces finales | monedas finales |
| 最终经验收益 | final EXP | EXP finale | EXP final |
| 幸运值 | luck | chance | suerte |
| 满足的挑剔顾客银币 | coins from satisfied picky customers | pièces des clients difficiles satisfaits | monedas de los clientes exigentes satisfechos |
| 外卖银币 / 外卖经验 / 外卖银币和经验 | takeaway coins / takeaway EXP / takeaway coins and EXP | pièces des commandes à emporter / EXP des commandes à emporter / pièces et EXP des commandes à emporter | monedas a domicilio / EXP a domicilio / monedas y EXP a domicilio |
| 消耗特色菜的顾客银币 | coins from customers eating signature dishes | pièces des clients qui mangent un plat signature | monedas de clientes que comen platos estrella |
| 特色菜烹制份数 | signature dish portions | portions de plats signature | raciones de platos estrella |
| 探险时获得神秘食材概率 | chance of mystery ingredients when exploring | chance de trouver des ingrédients mystères en exploration | probabilidad de ingredientes misteriosos al explorar |
| 烹制特色菜时高品级概率 | chance of higher grades when cooking signature dishes | chance de meilleure qualité en cuisinant un plat signature | probabilidad de mejor calidad al cocinar platos estrella |
| 餐厅产生蟑螂后有20%概率被消灭 | each roach that appears has a 20% chance of being killed | chaque cafard qui apparaît a 20 % de risque d'être tué | cada cucaracha que aparezca tiene un 20 % de probabilidad de morir |

例：14 日本街（挑剔率+12%,满足的挑剔顾客银币+15%,上座率-8%）
- en：`Picky rate +12%, coins from satisfied picky customers +15%, occupancy -8%`
- fr：`Clients difficiles +12 %, pièces des clients difficiles satisfaits +15 %, fréquentation -8 %`
- es：`Clientes exigentes +12%, monedas de los clientes exigentes satisfechos +15%, ocupación -8%`

"神秘食材"的译法先 `grep -i myster packages/config/data/i18n/en/goods.json` 和 `apps/web/src/i18n/locales/en`，和已有说法对齐；上表只是默认值。

- [ ] **Step 3：写食材**

| id | 中文 | en | fr | es |
|---|---|---|---|---|
| 584 | 奶酪 | Cheese | Fromage | Queso |
| 585 | 咖喱 | Curry | Curry | Curry |
| 586 | 椰浆 | Coconut Milk | Lait de coco | Leche de coco |
| 587 | 鱼露 | Fish Sauce | Sauce de poisson | Salsa de pescado |
| 588 | 酸奶 | Yogurt | Yaourt | Yogur |
| 589 | 味噌 | Miso | Miso | Miso |
| 590 | 葡萄酒 | Wine | Vin | Vino |
| 591 | 牛油果 | Avocado | Avocat | Aguacate |
| 592 | 帕玛森奶酪 | Parmesan | Parmesan | Parmesano |
| 593 | 暹罗椰浆 | Siamese Coconut Milk | Lait de coco du Siam | Leche de coco de Siam |
| 594 | 希腊酸奶 | Greek Yogurt | Yaourt grec | Yogur griego |
| 595 | 哈斯牛油果 | Hass Avocado | Avocat Hass | Aguacate Hass |
| 596 | 富国岛鱼露 | Phu Quoc Fish Sauce | Sauce de poisson de Phú Quốc | Salsa de pescado de Phú Quốc |
| 597 | 信州味噌 | Shinshu Miso | Miso de Shinshu | Miso de Shinshu |
| 598 | 波尔多葡萄酒 | Bordeaux Wine | Vin de Bordeaux | Vino de Burdeos |
| 599 | 西西里柠檬 | Sicilian Lemon | Citron de Sicile | Limón siciliano |
| 600 | 马德拉斯咖喱 | Madras Curry | Curry de Madras | Curry de Madrás |
| 601 | 伊思尼奶油 | Isigny Cream | Crème d'Isigny | Nata de Isigny |
| 602 | 甜菜 | Beetroot | Betterave | Remolacha |
| 603 | 薄荷 | Mint | Menthe | Menta |
| 604 | 荞麦 | Buckwheat | Sarrasin | Trigo sarraceno |
| 605 | 藜麦 | Quinoa | Quinoa | Quinoa |
| 606 | 腰果 | Cashew | Noix de cajou | Anacardo |

写之前检查这些译名没有和已有食材的译名重复（用 node 读 foods.json 比较）。重复的就加限定词区分。

- [ ] **Step 4：术语表**。`docs/i18n-glossary.md` 的表格末尾加两行：

```markdown
| X 街（新街道，如日本街） | Japan Street | Rue du Japon | Calle Japón |
| 杂碎街 | Chop Suey Street | Rue Chop Suey | Calle Chop Suey |
```

第 106 行"新街道进游戏后一起导入"改为"已随新街道导入（问题记录 284）"。

- [ ] **Step 5：运行测试**

Run: `pnpm -F @dt/config test`
Expected: PASS

- [ ] **Step 6：提交**

```bash
git add packages/config/data/i18n docs/i18n-glossary.md
git commit -m "feat(i18n): 新街道、街道勋章、新食材的英法西译名（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: 服务端：已学数据补长、摩洛哥探险加成、蟹老板、模拟器

**Files:**
- Modify: `apps/server/src/modules/cookbook/rules.ts`（加 `padLevels`）
- Modify: `apps/server/src/modules/cookbook/service.ts:31-38`、`apps/server/src/modules/cupboard/service.ts:47`、`apps/server/src/modules/mysterious/lesson.ts:35`
- Modify: `apps/server/src/modules/temple/explore.ts`
- Modify: `packages/config/data/game/tuning.json:148`（`krabStreetMax` 13 → 29）
- Modify: `apps/server/src/sim/bench.ts:63`、`apps/server/src/sim/bot.ts:212`
- Test: `apps/server/src/modules/cookbook/rules.test.ts`、`apps/server/src/modules/cookbook/cookbook.test.ts`、`apps/server/src/modules/temple/explore.test.ts`、`apps/server/src/modules/growth/*.test.ts`（搬家）

**Interfaces:**
- Produces:
  - `export function padLevels(levels: Uint8Array, maxCookbookId: number): Uint8Array`
  - `export function streetMysteriousRate(config: GameConfig, streetId: number): number`（explore.ts）

- [ ] **Step 1：写失败的测试**
  - `cookbook/rules.test.ts`：

```ts
describe('padLevels（问题记录 284）', () => {
  it('比 maxCookbookId + 1 短时补 0，原内容不变；够长时原样返回', () => {
    const short = new Uint8Array([0, 3, 0]);
    const r = padLevels(short, 5);
    expect([...r]).toEqual([0, 3, 0, 0, 0, 0]);
    const long = new Uint8Array(6);
    expect(padLevels(long, 5)).toBe(long);
  });
});
```

  - `cookbook/cookbook.test.ts`：照现有用例建一家店，再把 `restaurant_cookbooks.levels` 改成 `Buffer.alloc(18747)`，模拟新街道上线前开的店。然后学 18747 号（鲷鱼握寿司，1 品级食材 133、101、237 各 1 个，用现有给食材的辅助函数发够），断言学完 `levels.length` 是 `config.maxCookbookId + 1`、`levels[18747] === 1`、`cookbook_counts.street['14'] === 1`。
    - 写之前先读 `cookbook.test.ts` 里现有"学食谱"用例的写法，照着用同样的 fixture。
  - `temple/explore.test.ts`：

```ts
describe('街道勋章的神秘食材概率（问题记录 284）', () => {
  it('摩洛哥街 +2%，别的街 0', () => {
    expect(streetMysteriousRate(config, 24)).toBeCloseTo(0.02);
    expect(streetMysteriousRate(config, 1)).toBe(0);
  });
});
```

    （`config` 用文件里已有的 `testConfig()`；没有就 import `../../../test/config`。）
  - 搬家测试（`grep -rn "move(" apps/server/src/modules/growth/*.test.ts`，在现有搬家用例旁边加）：给店放一个雕像勋章 397，搬到 20 号印度街。断言：
    - 印度街勋章 634 在 effect_source 里；
    - 原街勋章已移除；
    - 雕像 397 还在。

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config build && pnpm -F @dt/server test -- cookbook/rules cookbook/cookbook temple/explore growth`
Expected:
- FAIL：`padLevels`、`streetMysteriousRate` 未导出；学新菜后 `levels[18747]` 是 undefined。
- 搬家用例可能直接通过：Task 6 已经修了勋章识别。这时它是回归测试，注明即可。

- [ ] **Step 3：实现**
  - **`cookbook/rules.ts`**：

```ts
/**
 * 已学食谱字节串补齐到 maxCookbookId + 1（问题记录 284）：新街道上线前开的店长度不够，
 * 往类型化数组越界写会被静默丢掉，学了新菜也存不下
 */
export function padLevels(levels: Uint8Array, maxCookbookId: number): Uint8Array {
  if (levels.length > maxCookbookId) return levels;
  const out = new Uint8Array(maxCookbookId + 1);
  out.set(levels);
  return out;
}
```

  - **调用处**：
    - `cookbook/service.ts` 的 `levelsOf` 返回 `padLevels(new Uint8Array(r.levels), d.config.maxCookbookId)`；
    - `cupboard/service.ts:47` 改为 `const levels = padLevels(new Uint8Array(cb.levels), d.config.maxCookbookId);`；
    - `mysterious/lesson.ts:35` 改为 `const levels = padLevels(new Uint8Array(cb.levels), o.config.maxCookbookId);`。
    - 三处都从 `../cookbook/rules` 导入（cookbook/service 用 `./rules`）。
    - **结算和外卖不补**（和设计 §5.5 的出入）：
      - 结算（`settlement/globals.ts`）只读、不写，`splitLearned` 按字节串实际长度遍历；
      - 外卖读品级都带 `?? 0`；
      - 补齐反而会让结算每轮多复制一次。
      - 执行时在账本里记一条 Ruling。
  - **`temple/explore.ts`**：

```ts
/** 本街勋章上的神秘食材概率（摩洛哥街 +2%，问题记录 284）；店一直持有所在街道的勋章 */
export function streetMysteriousRate(config: GameConfig, streetId: number): number {
  return config.requireGoods(config.streetMedalId(streetId)).effects.mysteriousRate ?? 0;
}
```

    rareRate 的累加里，在 `(weather.mysteriousRate ?? 0)` 前加一项 `streetMysteriousRate(o.config, o.rest.street_id) +`。`GameConfig` 从 `@dt/config` 以 type 导入。
  - **`tuning.json`**：`"krabStreetMax": 13` 改为 `29`。
  - **`sim/bench.ts:63`**：

```ts
      const street = movable[rng.int(movable.length)]!;
```

    在 `allIds` 定义下面加 `const movable = [...config.streets.keys()].filter((id) => id !== 0);`。
  - **`sim/bot.ts:212`**：`for (let street = 0; street <= 13; street++) {` 改为 `for (const street of config.streets.keys()) {`。

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/config build && pnpm -F @dt/server test`
Expected: PASS。如果有测试断言蟹老板街道在 1~13 之间，改成 1~29。

- [ ] **Step 5：提交**

```bash
git add apps/server packages/config/data/game/tuning.json
git commit -m "feat(server): 老店补齐已学数据长度、摩洛哥街探险加成、蟹老板和模拟器覆盖新街（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: 目录带街道加成，搬家页显示加成

**Files:**
- Modify: `packages/shared/src/schemas/world.ts:48`（streets 加 `desc: string`）
- Modify: `apps/server/src/modules/world/service.ts:189`、`:276`
- Modify: `apps/web/src/views/SocietyMoveView.vue`
- Modify: `apps/web/src/i18n/locales/{zh-CN,en,fr,es}/society.ts`（move 加 `bonus`）
- Test: `apps/server/src/modules/world/*.test.ts`（目录用例）、Create `apps/web/src/views/SocietyMoveView.test.ts`

- [ ] **Step 1：写失败的测试**
  - 服务端：在现有目录测试里加断言，`catalog('en').streets` 里 id 14 是 `{ id: 14, name: 'Japan Street', cookName: 'Japanese cuisine', desc: 'Picky rate +12%, coins from satisfied picky customers +15%, occupancy -8%' }`；简中 id 24 的 desc 是 `'探险时获得神秘食材概率+2%,幸运值+25,最终经验收益+8%'`。照现有目录用例的取法写。
  - 前端 `SocietyMoveView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogStore } from '../stores/catalog';
import SocietyMoveView from './SocietyMoveView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { move: vi.fn(), overview: vi.fn().mockRejectedValue(new Error('x')) } }));

describe('SocietyMoveView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('选中一条街后显示它的加成（问题记录 284：30 条街只看名字不好选）', async () => {
    useCatalogStore().streets = [
      { id: 0, name: '新手街', cookName: '家常菜', desc: '上座率+35%' },
      { id: 24, name: '摩洛哥街', cookName: '摩洛哥菜', desc: '探险时获得神秘食材概率+2%,幸运值+25' },
    ];
    const w = mount(SocietyMoveView);
    await flushPromises();
    expect(w.find('[data-testid="move-bonus"]').exists()).toBe(false);
    await w.find('select').setValue(24);
    expect(w.get('[data-testid="move-bonus"]').text()).toBe('街道加成：探险时获得神秘食材概率+2%,幸运值+25');
  });
});
```

  `restaurant.refresh` 实际调用的接口先看 `stores/restaurant.ts`，mock 里给对应的方法。没有餐厅时，选项列表就是全部街道。

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/server test -- world && pnpm -F @dt/web test -- SocietyMoveView`
Expected: FAIL（streets 没有 desc；没有 `move-bonus`）

- [ ] **Step 3：实现**
  - **`world.ts`**：`streets: Array<{ id: number; name: string; cookName: string; desc: string }>;`
  - **`world/service.ts:189`**：`streets: d.config.bundle.streets.map((s) => ({ id: s.id, name: s.name, cookName: s.cookName, desc: s.desc })),`
  - **`world/service.ts:276`**：`pick(base.streets, t.streets, ['name', 'cookName', 'desc'])`
  - **`SocietyMoveView.vue`**：script 里加：

```ts
const picked = computed(() => catalog.streets.find((s) => s.id === target.value) ?? null);
```

    select 和按钮之间加：

```vue
  <p v-if="picked" class="small mb-2" data-testid="move-bonus">{{ t.society.move.bonus(picked.desc) }}</p>
```

  - **文案**（`move` 里 `pick` 后面）：
    - zh-CN：`bonus: (desc: string) => \`街道加成：${desc}\`,`
    - en：`bonus: (desc) => \`Street bonus: ${desc}\`,`
    - fr：`bonus: (desc) => \`Bonus de la rue : ${desc}\`,`
    - es：`bonus: (desc) => \`Bonificación de la calle: ${desc}\`,`
    - zh-TW 跑 `pnpm -F @dt/web i18n:tw`（先 prettier 格式化 zh-CN）。
  - 前端其他构造 `streets` 测试数据的地方，如果类型检查报缺 `desc`，补 `desc: ''`。

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/server test -- world && pnpm -F @dt/web test && pnpm typecheck`
Expected: PASS

- [ ] **Step 5：提交**

```bash
git add packages/shared apps/server apps/web
git commit -m "feat(web): 搬家页显示所选街道的加成；目录带街道加成说明（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: 176 左宗棠鸡移到杂碎街（迁移 0040）

**Files:**
- Modify: `packages/config/data/dataset/cookbooks.json`、`packages/config/data/designed/cookbooks_price.json`（176 条目）、`packages/config/data/i18n/{en,fr,es}/cookbooks.json`（176）
- Create: `apps/server/src/db/migrations/0040_move_176.ts`；Modify: `index.ts`
- Test: `apps/server/src/db/migrations/0040.test.ts`、`packages/config/src/build.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `reviseCookbooks(db, deleted, moved)`。

- [ ] **Step 1：写失败的测试**
  - `build.test.ts` 的"老街道修订"用例：`expect(street(176)).toBe(1)` 改为 `toBe(29)`；名字改为 `'左宗棠鸡（美国/加拿大）'`；再加 `expect(b.cookbooks.filter((c) => c.streetId === 29)).toHaveLength(117);`
  - `0040.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { up } from './0040_move_176';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

describe('迁移 0040：左宗棠鸡移到杂碎街（问题记录 284）', () => {
  it('学过 176 的店：湖南街已学数减一，杂碎街加一', async () => {
    const id = await createRestaurantRow(db, shard, await createAccountRow(db), {
      cookbook_counts: JSON.stringify({ learned: 1, grade: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], street: { '1': 1 } }),
    });
    const levels = Buffer.alloc(18747);
    levels[176] = 2;
    await db.insertInto('restaurant_cookbooks').values({ rest_id: id, levels }).execute();
    await up(db);
    const r = await db.selectFrom('restaurant').select('cookbook_counts').where('id', '=', id).executeTakeFirstOrThrow();
    expect(r.cookbook_counts).toEqual({ learned: 1, grade: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], street: { '1': 0, '29': 1 } });
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config test -- build.test && pnpm -F @dt/server test -- 0040`
Expected: FAIL

- [ ] **Step 3：实现**
  - **数据**：用 node 把 `../data/老数据修订/cookbooks.json`、`cookbooks_price.json` 里 id 176 的条目，替换进仓库对应文件（其他条目不动）；英法西 `cookbooks.json` 的 176 改成 `../data/i18n/<语言>/cookbooks.json` 里 176 的 name。
  - **`0040_move_176.ts`**：

```ts
import type { Kysely } from 'kysely';
import { reviseCookbooks } from './0039_old_street_revision';

/** 问题记录 284：176 左宗棠鸡（海外中餐）随杂碎街上线，从湖南街移过去 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await reviseCookbooks(db, [], [[176, 1, 29]]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
```

  - `reviseCookbooks` 里查询的 `where length(c.levels) > min(...)`：`deleted` 为空时 `Math.min` 只看 moved，没问题；删单的语句因为 `deleted.length > 0` 不执行。
  - `index.ts` 注册 `'0040_move_176': m0040`。

- [ ] **Step 4：运行测试**

Run: `pnpm -F @dt/config build && pnpm -F @dt/config test && pnpm -F @dt/server test -- 0039 0040`
Expected: PASS

- [ ] **Step 5：提交**

```bash
git add packages/config apps/server/src/db/migrations
git commit -m "feat: 左宗棠鸡随杂碎街移街改名，迁移 0040 挪已学计数（问题记录 284）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: 文档、全量验证、PR 2

**Files:**
- Modify: `docs/roadmap.md`（第 12 项改为已完成，写 PR 号）
- Modify: `docs/backlog.md`：加一节"新街道（问题记录 284）"，两条：
  - 新街勋章数值先按数据上线，强度分见 `data/新街道菜谱/report.md`；
  - 23 种新食材按等级进入随机池，同等级老食材份额略降。

- [ ] **Step 1：写文档**（内容如上）

- [ ] **Step 2：全量验证**

```bash
pnpm -F @dt/config build
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test
```

Expected：全部通过（`format:check` 只报 `问题记录.md`）。

- [ ] **Step 3：重启 dev，实测**
  - 按记忆清理进程树后，后台跑 `pnpm -F @dt/config build; pnpm dev`；
  - 等 `localhost:3000/api/v1/world/catalog` 和 `:5173` 都能访问；
  - dev 日志里应该有迁移 0040；
  - 记下英文目录接口的压缩后大小（`curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' 'localhost:3000/api/v1/world/catalog?lang=en'`），和 PR 1 时对比，写进 PR 说明。
  - 跑 e2e：`pnpm -F @dt/e2e test -- business i18n`（命令以仓库 e2e 的 package.json 为准）。

- [ ] **Step 4：提交、推送、开 PR**
  - 推送 `feat/new-streets`。
  - 开 PR：
    - 如果 PR 1 还没合并，base 选 `feat/old-street-revision`，并在正文说明；
    - 合并后改 base 为 main。
  - 正文用中文，写清：数据规模、8~10 品级生成规则、勋章对应表、修的几个代码问题、翻译、测试结果、目录大小，结尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
