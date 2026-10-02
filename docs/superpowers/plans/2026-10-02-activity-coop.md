# 限时活动 148-3 全服合力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增活动类型"全服合力"（`coop`）：行为计分进个人贡献，本区服贡献总和过里程碑后达标的店可领礼包，结束后按贡献榜名次段发邮件奖励并发新闻。

**Architecture:** 计数复用战令的 `points` 计数和每天上限。全服总分在读取时求和，玩家列表按"活动 + 区服"缓存 30 秒，领取和结算在事务里实时求和。`rewardsOf` 多一个可选的 `{ pool }` 参数。贡献榜在现有补发任务 `activity-settle` 里结算：逐店锁店写领奖记录（`r<段>`）后发邮件；新闻和"结算完成"写在同一个事务里。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-activity-3-coop-design.md`

## Global Constraints

- 定义：
  - 规则 1~20 条，同战令：`points 1..1000`、`dailyCap 1..100000`，行为不重复；
  - 里程碑 1~10 个：`target 1..1_000_000_000`，严格递增；`minContribution 0..100_000_000`；
  - 名次段 0~10 段：`from`、`to` 都在 `1..100`，`from ≤ to`，按升序不重叠。
- 校验错误码：
  - `def.milestones.<i>.target:not_increasing`；
  - `def.ranks.<i>.to:bad_range`；
  - `def.ranks.<i>.from:overlap`；
  - `def.rules:duplicate_key`。
- 键名：
  - 里程碑奖励键 `s<i>`；
  - 名次段领奖记录键 `r<i>`（`via='mail'`）；
  - 个人贡献计数键 `points`；
  - 每天上限键 `act<id>:<行为键>`（`passDailyKey`）。
- 名次：积分为 0 的不上榜；同分同名次（1、1、3）；名次段边界上并列的全部发奖。
- 邮件：
  - 标题：`《活动名》贡献榜第 N 名奖励`；
  - 正文：`感谢你为全服合力做出的贡献，这是你的名次奖励。`
- 新闻 `activity.coopRank`：
  - 参数 `{ title, top: [{ rank, name, points }] }`，最多 3 名；
  - 文案：`《国庆合力》贡献榜：第 1 名 甲餐厅（1,234 分）、第 2 名 乙餐厅（1,100 分）`。
- DTO：`coop: { pool, top: [{ rank, restId, name, points, mine }], myRank } | null`。
- 测试约定：
  - 测试从仓库根目录跑；
  - 不碰 `问题记录.md`；
  - 测试库共用：测试里的全服活动（`shard_id` 为空）一律放在 2099 年的时间窗口，并在 `finally` 里删掉、把时钟拨回。

## Review Focus

1. **名次段边界并列**：第 2~2 名有两家同分并列，两家都要发；积分 0 的店不上榜也不发。→ Task 4 测试。
2. **补发重跑不重复**：上一轮有店失败、下一分钟重跑时，已经发过的名次邮件不再发；新闻只发一次。→ Task 4 测试。
3. **区服隔离**：全服活动在两个区服的总分、名次各算各的。→ Task 2 测试。
4. **领取以实时总分为准**：总分不够时领取报"未达成"；个人门槛不够时也报"未达成"。→ Task 3 测试。
5. **玩家页的提示**：全服已达成、个人贡献不够时显示"个人贡献还差 N 分"，不能显示成"全服还差"。→ Task 5 测试。

---

### Task 1: shared——全服合力定义和 DTO

**Files:**
- Modify: `packages/shared/src/schemas/activity.ts`
- Modify: `apps/web/src/views/ActivitiesView.test.ts`（夹具 `base` 加 `coop: null`）
- Test: `packages/shared/src/schemas/activity.test.ts`（追加）

**Interfaces:**
- Produces:
  - `coopDef`、`type CoopDef`；
  - `ACTIVITY_KINDS` 含 `'coop'`；
  - `ActivitySpec` 含 `{ kind: 'coop'; def: CoopDef }`；
  - `ActivityCoopDto`；
  - `ActivityDto.coop: ActivityCoopDto | null`。

- [ ] **Step 1: 写失败的测试**（追加到 `activity.test.ts`）

```ts
describe('全服合力定义（148-3 设计 §3）', () => {
  const award = { coin: 1 };
  const def = (patch: Record<string, unknown> = {}) => ({
    rules: [{ key: 'market.buy', points: 10, dailyCap: 100 }],
    milestones: [
      { target: 100, minContribution: 0, award },
      { target: 500, minContribution: 20, award },
    ],
    ranks: [
      { from: 1, to: 1, award },
      { from: 2, to: 3, award },
    ],
    ...patch,
  });
  const co = (patch: Record<string, unknown> = {}) => ({ ...base, kind: 'coop', def: def(patch) });
  it('合法的能过；名次段可以为空', () => {
    expect(paths(co())).toEqual([]);
    expect(paths(co({ ranks: [] }))).toEqual([]);
  });
  it('目标分不递增、名次段颠倒或重叠、超过 100 名、规则行为重复都报错', () => {
    expect(
      paths(
        co({
          milestones: [
            { target: 100, minContribution: 0, award },
            { target: 100, minContribution: 0, award },
          ],
        }),
      ),
    ).toContain('def.milestones.1.target:not_increasing');
    expect(paths(co({ ranks: [{ from: 3, to: 2, award }] }))).toContain('def.ranks.0.to:bad_range');
    expect(
      paths(
        co({
          ranks: [
            { from: 1, to: 3, award },
            { from: 3, to: 5, award },
          ],
        }),
      ),
    ).toContain('def.ranks.1.from:overlap');
    expect(paths(co({ ranks: [{ from: 1, to: 101, award }] }))[0]).toMatch(/^def\.ranks\.0\.to:/);
    expect(
      paths(
        co({
          rules: [
            { key: 'signin', points: 1, dailyCap: 1 },
            { key: 'signin', points: 2, dailyCap: 2 },
          ],
        }),
      ),
    ).toContain('def.rules:duplicate_key');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/shared/src/schemas/activity.test.ts`
Expected: FAIL（kind 不接受 `coop`）

- [ ] **Step 3: 实现**（`schemas/activity.ts`）

`ACTIVITY_KINDS` 改成 `['goals', 'grid', 'pass', 'boost', 'exchange', 'coop'] as const`。在 `export type GoalsDef` 那一行前加：

```ts
/** 全服合力（148-3 设计 §3）：规则同战令；里程碑看本区服总分和个人门槛；名次段结束后发邮件 */
export const coopDef = z
  .object({
    rules: passDef.shape.rules,
    milestones: z
      .array(
        z.object({
          target: z.number().int().min(1).max(1_000_000_000),
          minContribution: z.number().int().min(0).max(100_000_000),
          award: rewardItems,
        }),
      )
      .min(1)
      .max(10),
    ranks: z
      .array(
        z.object({
          from: z.number().int().min(1).max(100),
          to: z.number().int().min(1).max(100),
          award: rewardItems,
        }),
      )
      .max(10),
  })
  .superRefine((d, ctx) => {
    d.milestones.forEach((m, i) => {
      if (i > 0 && m.target <= d.milestones[i - 1]!.target)
        ctx.addIssue({ code: 'custom', path: ['milestones', i, 'target'], message: 'not_increasing' });
    });
    d.ranks.forEach((r, i) => {
      if (r.from > r.to) ctx.addIssue({ code: 'custom', path: ['ranks', i, 'to'], message: 'bad_range' });
      if (i > 0 && r.from <= d.ranks[i - 1]!.to)
        ctx.addIssue({ code: 'custom', path: ['ranks', i, 'from'], message: 'overlap' });
    });
  });
export type CoopDef = z.infer<typeof coopDef>;
```

`ActivitySpec` 末尾加 `| { kind: 'coop'; def: CoopDef }`。`DEF_SCHEMAS` 加 `coop: coopDef`。`ActivityDto` 在 `exchangeUntil` 后加：

```ts
  /** 全服合力：本区服总分、前 10 名、我的名次（148-3 设计 §8.1）；其他类型为 null */
  coop: ActivityCoopDto | null;
```

文件末尾加：

```ts
export interface ActivityCoopDto {
  pool: number;
  top: Array<{ rank: number; restId: number; name: string; points: number; mine: boolean }>;
  myRank: number | null;
}
```

`apps/web/src/views/ActivitiesView.test.ts` 的 `base` 夹具里，`exchangeUntil: null,` 后加 `coop: null,`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/shared/src/schemas/activity.test.ts && pnpm --filter @dt/shared typecheck`
Expected: PASS（服务端 DTO 缺 `coop` 的类型错误在 Task 3 补上）

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src apps/web/src/views/ActivitiesView.test.ts
git commit -m "feat(shared): 全服合力定义校验和 DTO"
```

---

### Task 2: 服务端——迁移 0024、计数、总分和名次

**Files:**
- Create: `apps/server/src/db/migrations/0024_activity_coop.ts`（+ `index.ts` 登记）
- Modify: `apps/server/src/db/schema.ts`（kind 加 `'coop'`）
- Modify: `apps/server/src/modules/activity/rules.ts`（`rewardsOf` 的 `ctx`、`rankRows`）
- Modify: `apps/server/src/modules/activity/handler.ts`（coop 走战令计数）
- Create: `apps/server/src/modules/activity/coop.ts`
- Create: `apps/server/src/modules/activity/coop.test.ts`
- Test: `apps/server/src/modules/activity/rules.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 `CoopDef`
- Produces:
  - `rewardsOf(spec, counters, premium, ctx?: { pool?: number }): RewardState[]`；
  - `rankRows<T extends { points: number }>(rows: T[]): Array<T & { rank: number }>`；
  - `poolOf(db, activityId, shardId): Promise<number>`；
  - `rankedOf(db, activityId, shardId, limit?): Promise<RankedRow[]>`，其中 `RankedRow = { rank; restId; name; points }`；
  - `myRankOf(db, activityId, shardId, mine): Promise<number | null>`。

- [ ] **Step 1: 写失败的测试**

`rules.test.ts`：import 改成 `import { activityState, mergeRewards, rankRows, rewardsOf, scaleRewards } from './rules';`，追加：

```ts
describe('全服合力（148-3 设计 §5.2、§6）', () => {
  const coop = {
    kind: 'coop' as const,
    def: {
      rules: [{ key: 'signin', points: 1, dailyCap: 1 }],
      milestones: [
        { target: 100, minContribution: 0, award: { coin: 1 } },
        { target: 200, minContribution: 50, award: { coin: 2 } },
      ],
      ranks: [],
    },
  };
  it('里程碑要总分和个人门槛都够；不传总分按 0 算', () => {
    const reached = (c: Record<string, number>, pool?: number) =>
      rewardsOf(coop, c, false, { pool }).map((x) => x.reached);
    expect(reached({ points: 10 }, 250)).toEqual([true, false]);
    expect(reached({ points: 50 }, 250)).toEqual([true, true]);
    expect(reached({ points: 50 }, 150)).toEqual([true, false]);
    expect(reached({ points: 999 })).toEqual([false, false]);
    expect(rewardsOf(coop, {}, false).map((x) => x.key)).toEqual(['s0', 's1']);
  });
  it('rankRows：同分同名次，积分 0 不上榜', () => {
    expect(
      rankRows([
        { restId: 1, points: 5 },
        { restId: 2, points: 9 },
        { restId: 3, points: 9 },
        { restId: 4, points: 0 },
        { restId: 5, points: 1 },
      ]),
    ).toEqual([
      { restId: 2, points: 9, rank: 1 },
      { restId: 3, points: 9, rank: 1 },
      { restId: 1, points: 5, rank: 3 },
      { restId: 5, points: 1, rank: 4 },
    ]);
  });
});
```

`coop.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { activityCacheFor } from './active';
import { myRankOf, poolOf, rankedOf } from './coop';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const award = { coin: 10 };
const spec = (patch: Record<string, unknown> = {}) => ({
  kind: 'coop' as const,
  def: {
    rules: [
      { key: 'market.buy', points: 10, dailyCap: 30 },
      { key: 'shop.buy', points: 1, dailyCap: 100 },
    ],
    milestones: [
      { target: 20, minContribution: 0, award },
      { target: 50, minContribution: 15, award: { coin: 50 } },
    ],
    ranks: [
      { from: 1, to: 1, award: { diamond: 5 } },
      { from: 2, to: 3, award: { diamond: 1 } },
    ],
    ...patch,
  },
});
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));

describe('全服合力计数和总分（148-3 设计 §4、§5）', () => {
  it('按规则计分、有每天上限；总分只算本区服的店', async () => {
    const s1 = await createShard(t.db);
    const s2 = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: s1 });
    const b = await newRestaurant(t, { shardId: s1 });
    const c = await newRestaurant(t, { shardId: s2 });
    const id = await insertActivity(t, { shardId: s1, spec: spec() });
    await act(a, 'market.buy', 5);
    await act(b, 'shop.buy', 3);
    await act(c, 'market.buy');
    expect(await counters(t, id, a.restaurantId)).toEqual({ points: 30 });
    expect(await counters(t, id, c.restaurantId)).toEqual({});
    expect(await poolOf(t.db, id, s1)).toBe(33);
    expect(await poolOf(t.db, id, s2)).toBe(0);
  });

  it('全服活动每个区服各自求和、各自排名；同分同名次；我的名次', async () => {
    const s1 = await createShard(t.db);
    const s2 = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: s1 });
    const b = await newRestaurant(t, { shardId: s1 });
    const x = await newRestaurant(t, { shardId: s1 });
    const c = await newRestaurant(t, { shardId: s2 });
    const back = t.clock.now;
    t.clock.set(new Date('2099-01-02T00:00:00Z'));
    const id = await insertActivity(t, {
      shardId: null,
      spec: spec(),
      startsAt: new Date('2099-01-01T00:00:00Z'),
      endsAt: new Date('2099-01-10T00:00:00Z'),
    });
    try {
      await act(a, 'market.buy', 2);
      await act(b, 'market.buy', 2);
      await act(x, 'shop.buy', 5);
      await act(c, 'market.buy');
      expect(await poolOf(t.db, id, s1)).toBe(45);
      expect(await poolOf(t.db, id, s2)).toBe(10);
      expect((await rankedOf(t.db, id, s1)).map((r) => [r.restId, r.rank, r.points])).toEqual([
        [a.restaurantId, 1, 20],
        [b.restaurantId, 1, 20],
        [x.restaurantId, 3, 5],
      ]);
      expect((await rankedOf(t.db, id, s1, 1)).map((r) => r.restId)).toEqual([a.restaurantId]);
      expect(await myRankOf(t.db, id, s1, 5)).toBe(3);
      expect(await myRankOf(t.db, id, s1, 20)).toBe(1);
      expect(await myRankOf(t.db, id, s1, 0)).toBeNull();
    } finally {
      t.clock.set(back);
      await t.db.deleteFrom('activity').where('id', '=', id).execute();
      activityCacheFor(t.deps.bus, t.game.deps).invalidate();
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/activity/rules.test.ts apps/server/src/modules/activity/coop.test.ts`
Expected: FAIL（`rankRows` 不存在，`./coop` 不存在）

- [ ] **Step 3: 迁移** `0024_activity_coop.ts`

```ts
import { sql, type Kysely } from 'kysely';

/** 148-3：活动类型加上全服合力 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost', 'exchange', 'coop'))`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from activity where kind = 'coop'`.execute(db);
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost', 'exchange'))`.execute(
    db,
  );
}
```

`migrations/index.ts`：在 0023 的 import 和登记后面，各加 `import * as m0024 from './0024_activity_coop';` 和 `'0024_activity_coop': m0024,`。`schema.ts` 的 `kind: 'goals' | 'grid' | 'pass' | 'boost' | 'exchange';` 改成末尾加 `| 'coop'`。

- [ ] **Step 4: 规则**（`rules.ts`）

`rewardsOf` 的签名改成：

```ts
export function rewardsOf(
  spec: ActivitySpec,
  counters: Record<string, number>,
  premium: boolean,
  ctx: { pool?: number } = {},
): RewardState[] {
```

在 `const count = (k: string) => counters[k] ?? 0;` 下一行加：

```ts
  // 全服合力：本区服总分到了、个人贡献到了门槛才算达成（148-3 设计 §6）
  if (spec.kind === 'coop') {
    const pool = ctx.pool ?? 0;
    return spec.def.milestones.map((m, i) => ({
      key: `s${i}`,
      award: m.award,
      reached: pool >= m.target && count('points') >= m.minContribution,
    }));
  }
```

在 `mergeRewards` 前加：

```ts
/** 贡献榜名次（148-3 设计 §5.2）：积分 0 不上榜；同分同名次（1、1、3）；同分时保持传入顺序 */
export function rankRows<T extends { points: number }>(rows: T[]): Array<T & { rank: number }> {
  const sorted = rows.filter((r) => r.points > 0).sort((x, y) => y.points - x.points);
  const out: Array<T & { rank: number }> = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && prev.points === r.points ? prev.rank : i + 1 });
  });
  return out;
}
```

- [ ] **Step 5: 计数**（`handler.ts`）

`count` 里的 `if (spec.kind === 'pass') {` 改成 `if (spec.kind === 'pass' || spec.kind === 'coop') {`，上面加一行注释 `// 战令和全服合力：按规则计分，每条规则每天有上限（148-3 设计 §4）`。

- [ ] **Step 6: 总分和名次** `coop.ts`

```ts
import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { rankRows } from './rules';

/** 本区服的店在这个活动里的个人贡献 */
const pointsOf = (db: Kysely<DB>, activityId: number, shardId: number) =>
  db
    .selectFrom('activity_counter as c')
    .innerJoin('restaurant as r', 'r.id', 'c.rest_id')
    .where('c.activity_id', '=', activityId)
    .where('c.key', '=', 'points')
    .where('r.shard_id', '=', shardId);

/** 本区服全服总分（148-3 设计 §5.1）：读取时求和，不另设一行累加 */
export async function poolOf(db: Kysely<DB>, activityId: number, shardId: number): Promise<number> {
  const r = await pointsOf(db, activityId, shardId)
    .select(sql<string>`coalesce(sum(c.count), 0)`.as('n'))
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export interface RankedRow {
  rank: number;
  restId: number;
  name: string;
  points: number;
}

/** 本区服贡献榜：积分从高到低、同分按店 id；limit 不填时取全部 */
export async function rankedOf(
  db: Kysely<DB>,
  activityId: number,
  shardId: number,
  limit?: number,
): Promise<RankedRow[]> {
  let q = pointsOf(db, activityId, shardId)
    .select(['c.rest_id', 'r.name', 'c.count'])
    .where('c.count', '>', '0')
    .orderBy('c.count', 'desc')
    .orderBy('c.rest_id');
  if (limit !== undefined) q = q.limit(limit);
  const rows = await q.execute();
  return rankRows(rows.map((x) => ({ restId: x.rest_id, name: x.name, points: Number(x.count) })));
}

/** 我的名次 = 积分比我高的店数 + 1；积分 0 没有名次 */
export async function myRankOf(
  db: Kysely<DB>,
  activityId: number,
  shardId: number,
  mine: number,
): Promise<number | null> {
  if (mine <= 0) return null;
  const r = await pointsOf(db, activityId, shardId)
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('c.count', '>', String(mine))
    .executeTakeFirstOrThrow();
  return Number(r.n) + 1;
}
```

（`rankRows` 返回的对象带 `restId/name/points/rank`，正好是 `RankedRow`。`c.count` 是 bigint 列，`count` 的比较值用字符串。）

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/activity apps/server/src/db`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server
git commit -m "feat(server): 全服合力的计数、总分和名次；迁移 0024"
```

---

### Task 3: 服务端——列表 DTO 和领取

**Files:**
- Modify: `apps/server/src/modules/activity/service.ts`
- Test: `apps/server/src/modules/activity/coop.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 `poolOf`、`rankedOf`、`myRankOf`、`rewardsOf(..., { pool })`
- Produces: `ActivityDto.coop` 有值；合力活动的 `today` 和战令一样按规则键返回今天已得分；`claim` / `claimAll` 用实时总分

- [ ] **Step 1: 写失败的测试**（追加到 `coop.test.ts`）

```ts
describe('全服合力领取和列表（148-3 设计 §6、§8.1）', () => {
  it('总分不够不能领；够了能领、领过再领报已领；个人门槛不够不能领', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const c = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await act(a, 'market.buy');
    await expect(t.game.activity.claim(a, id, 's0')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await act(b, 'market.buy', 3);
    expect((await t.game.activity.claim(a, id, 's0')).data.keys).toEqual(['s0']);
    await expect(t.game.activity.claim(a, id, 's0')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await act(a, 'shop.buy', 20);
    await act(c, 'shop.buy', 5);
    await expect(t.game.activity.claim(c, id, 's1')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    expect((await t.game.activity.claim(a, id, 's1')).data.keys).toEqual(['s1']);
  });

  it('列表带总分、前 10 名（标出自己）、我的名次、今天各规则得分；别的类型 coop 为 null', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    const goals = await insertActivity(t, {
      shardId,
      spec: { kind: 'goals', def: { goals: [{ key: 'signin', target: 1, award }] } },
    });
    await act(a, 'market.buy', 2);
    await act(b, 'market.buy');
    const items = (await t.game.activity.list(b)).items;
    const x = items.find((i) => i.id === id)!;
    expect(x.coop).toEqual({
      pool: 30,
      top: [
        { rank: 1, restId: a.restaurantId, name: expect.any(String), points: 20, mine: false },
        { rank: 2, restId: b.restaurantId, name: expect.any(String), points: 10, mine: true },
      ],
      myRank: 2,
    });
    expect(x.today).toEqual({ 'market.buy': 10, 'shop.buy': 0 });
    expect(x.rewards.map((r) => r.reached)).toEqual([true, false]);
    expect(items.find((i) => i.id === goals)!.coop).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/activity/coop.test.ts`
Expected: FAIL（领取时 `s0` 不存在，报 `no_reward`；`coop` 为 undefined）

- [ ] **Step 3: 实现**（`service.ts`）

import 加：

```ts
import { myRankOf, poolOf, rankedOf, type RankedRow } from './coop';
```

`LIST_AFTER_END_MS` 后加：

```ts
/** 全服合力的总分和前 10 名在本进程缓存多久（148-3 设计 §5.3） */
const COOP_CACHE_MS = 30_000;
```

`createActivityService` 里，`visible` 定义之后加：

```ts
  const coopCache = new Map<string, { expires: number; pool: number; top: RankedRow[] }>();
  /** 玩家列表用的总分和前 10 名，按"活动 + 区服"缓存；领取、结算不走缓存 */
  async function coopBoard(activityId: number, shardId: number) {
    const k = `${activityId}:${shardId}`;
    const nowMs = Date.now();
    const hit = coopCache.get(k);
    if (hit && hit.expires > nowMs) return hit;
    const v = {
      expires: nowMs + COOP_CACHE_MS,
      pool: await poolOf(d.db, activityId, shardId),
      top: await rankedOf(d.db, activityId, shardId, 10),
    };
    coopCache.set(k, v);
    return v;
  }
```

`todayOf` 里的 `if (spec.kind !== 'pass') return {};` 改成 `if (spec.kind !== 'pass' && spec.kind !== 'coop') return {};`。

`dto` 里把

```ts
    const rewards = rewardsOf(specOf(row), p.counters, p.premium).map((x) => ({
```

改成

```ts
    const spec = specOf(row);
    const board = spec.kind === 'coop' ? await coopBoard(row.id, shardId) : null;
    const rewards = rewardsOf(spec, p.counters, p.premium, { pool: board?.pool }).map((x) => ({
```

返回对象的 `exchangeUntil` 后加：

```ts
      coop: board
        ? {
            pool: board.pool,
            top: board.top.map((r) => ({ ...r, mine: r.restId === restId })),
            myRank: await myRankOf(d.db, row.id, shardId, p.counters.points ?? 0),
          }
        : null,
```

`claimKeys` 里把 `const all = rewardsOf(specOf(row), p.counters, p.premium);` 改成：

```ts
    const spec = specOf(row);
    // 全服合力：领取时在事务里实时求和，不用列表的缓存（148-3 设计 §6）
    const pool = spec.kind === 'coop' ? await poolOf(o.tx, row.id, o.shardId) : undefined;
    const all = rewardsOf(spec, p.counters, p.premium, { pool });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/activity && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/activity
git commit -m "feat(server): 全服合力的列表和领取"
```

---

### Task 4: 服务端——结束结算、贡献榜邮件和新闻

**Files:**
- Modify: `apps/server/src/modules/activity/settle.ts`
- Modify: `packages/shared/src/news.ts`（`NEWS_TYPES` 加 `'activity.coopRank'`）
- Modify: `apps/web/src/utils/news.ts`（文案）
- Test: `apps/server/src/modules/activity/settle.test.ts`（追加）、`apps/web/src/utils/news.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 `poolOf`、`rankedOf`、`rewardsOf(..., { pool })`
- Produces: 新闻类型 `activity.coopRank`，参数 `{ title: string; top: Array<{ rank; name; points }> }`

- [ ] **Step 1: 写失败的测试**

`settle.test.ts` 追加：

```ts
describe('全服合力结算（148-3 设计 §7）', () => {
  const coop = {
    kind: 'coop' as const,
    def: {
      rules: [{ key: 'market.buy', points: 10, dailyCap: 1000 }],
      milestones: [{ target: 30, minContribution: 20, award: { coin: 7 } }],
      ranks: [
        { from: 1, to: 1, award: { diamond: 3 } },
        { from: 2, to: 2, award: { diamond: 1 } },
      ],
    },
  };
  it('补发里程碑；名次段边界并列都发；积分 0 不发；每区服一条新闻；重跑不重复发邮件', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const c = await newRestaurant(t, { shardId });
    const idle = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: coop, endsAt: end, title: '合力' });
    await act(a, 'market.buy', 3);
    await act(b, 'market.buy', 2);
    await act(c, 'market.buy', 2);
    await act(idle, 'shop.buy');
    const after = new Date(end.getTime() + 3 * 60_000);
    await settleActivities(t.game.deps, shardId, after, log);
    await settleActivities(t.game.deps, shardId, after, log);
    const titles = async (restId: number) => (await mails(restId)).map((m) => m.title).sort();
    expect(await titles(a.restaurantId)).toEqual(['《合力》未领取奖励', '《合力》贡献榜第 1 名奖励'].sort());
    expect(await titles(b.restaurantId)).toEqual(['《合力》未领取奖励', '《合力》贡献榜第 2 名奖励'].sort());
    expect(await titles(c.restaurantId)).toEqual(['《合力》未领取奖励', '《合力》贡献榜第 2 名奖励'].sort());
    expect(await mails(idle.restaurantId)).toHaveLength(0);
    const rankMail = (await mails(b.restaurantId)).find((m) => m.title.includes('贡献榜'))!;
    expect(rankMail.items).toEqual({ diamond: 1 });
    const news = await t.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'activity.coopRank')
      .execute();
    expect(news).toHaveLength(1);
    expect(news[0]!.params).toMatchObject({
      title: '合力',
      top: [
        { rank: 1, points: 30 },
        { rank: 2, points: 20 },
        { rank: 2, points: 20 },
      ],
    });
    // 模拟上一轮有店失败没写结算完成：重跑时已发过的邮件不再发
    await t.db.deleteFrom('activity_settle').where('activity_id', '=', id).execute();
    await settleActivities(t.game.deps, shardId, after, log);
    expect(await mails(a.restaurantId)).toHaveLength(2);
    expect(await mails(b.restaurantId)).toHaveLength(2);
  });
});
```

`news.test.ts` 追加：

```ts
describe('全服合力贡献榜新闻（148-3）', () => {
  it('列出名次、店名和积分', () => {
    expect(
      newsText(
        n(
          'activity.coopRank',
          {
            title: '国庆合力',
            top: [
              { rank: 1, name: '甲餐厅', points: 1234 },
              { rank: 2, name: '乙餐厅', points: 1100 },
            ],
          },
          null,
        ),
        names,
      ),
    ).toBe('《国庆合力》贡献榜：第 1 名 甲餐厅（1,234 分）、第 2 名 乙餐厅（1,100 分）');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/activity/settle.test.ts apps/web/src/utils/news.test.ts`
Expected: FAIL（没有贡献榜邮件和新闻；新闻文案是"小镇发生了一件事"）

- [ ] **Step 3: 实现**（`settle.ts`）

import 加：

```ts
import { postNews } from '../news/news';
import { poolOf, rankedOf, type RankedRow } from './coop';
```

`MAIL_BODY` 后加：

```ts
const RANK_BODY = '感谢你为全服合力做出的贡献，这是你的名次奖励。';
```

在 `for (const a of due) {` 循环里、`const spec = …` 下一行加：

```ts
    // 全服合力：本区服总分在结束后不会再变，先算一次（148-3 设计 §7）
    const pool = spec.kind === 'coop' ? await poolOf(d.db, a.id, shardId) : undefined;
```

把 `const pending = rewardsOf(spec, p.counters, p.premium).filter(` 改成 `const pending = rewardsOf(spec, p.counters, p.premium, { pool }).filter(`。

把原来循环末尾的

```ts
    if (ok)
      await d.db
        .insertInto('activity_settle')
        .values({ activity_id: a.id, shard_id: shardId, settled_at: now })
        .onConflict((oc) => oc.doNothing())
        .execute();
```

整段换成：

```ts
    // 贡献榜：名次段内的店逐个发邮件，领奖记录 r<段> 防重复；段边界并列的全部发
    let top: RankedRow[] = [];
    if (ok && spec.kind === 'coop') {
      const ranked = await rankedOf(d.db, a.id, shardId);
      top = ranked.slice(0, 3);
      for (const [s, seg] of spec.def.ranks.entries()) {
        for (const row of ranked.filter((x) => x.rank >= seg.from && x.rank <= seg.to)) {
          try {
            const sent = await runSystemOp(d, shardId, row.restId, { source: 'activity', now }, async (o) => {
              const w = await o.tx
                .insertInto('activity_claim')
                .values({ activity_id: a.id, rest_id: row.restId, reward_key: `r${s}`, via: 'mail' })
                .onConflict((oc) => oc.doNothing())
                .returning('reward_key')
                .executeTakeFirst();
              if (!w) return false;
              await sendMail(o.tx, {
                scope: 'rest',
                shardId,
                restId: row.restId,
                minLevel: null,
                title: `《${a.title}》贡献榜第 ${row.rank} 名奖励`,
                body: RANK_BODY,
                items: seg.award,
                source: 'activity',
                actorAccountId: null,
              });
              return true;
            });
            if (sent) mails++;
          } catch (err) {
            ok = false;
            failed++;
            log.error({ err, activityId: a.id, restId: row.restId }, 'activity rank settle failed');
          }
        }
      }
    }
    // 结算完成和贡献榜新闻同一个事务：只有这一轮真的写进了结算记录才发新闻，重跑不重复
    if (ok)
      await d.db.transaction().execute(async (trx) => {
        const ins = await trx
          .insertInto('activity_settle')
          .values({ activity_id: a.id, shard_id: shardId, settled_at: now })
          .onConflict((oc) => oc.doNothing())
          .returning('activity_id')
          .executeTakeFirst();
        if (ins && top.length > 0)
          await postNews(
            trx,
            {
              shardId,
              type: 'activity.coopRank',
              params: { title: a.title, top: top.map((r) => ({ rank: r.rank, name: r.name, points: r.points })) },
            },
            now,
          );
      });
```

`packages/shared/src/news.ts` 的 `NEWS_TYPES` 在 `'bar.cup',` 前加 `'activity.coopRank',`。

`apps/web/src/utils/news.ts` 的 `RENDER` 对象里，`'tower.rank.week'` 前加：

```ts
  'activity.coopRank': (_w, p) =>
    `《${str(p.title)}》贡献榜：${list(p.top)
      .map((r) => `第 ${num((r as P).rank)} 名 ${str((r as P).name)}（${formatNum(num((r as P).points))} 分）`)
      .join('、')}`,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/activity apps/server/src/modules/news apps/web/src/utils/news.test.ts`
Expected: PASS（新闻类型清单测试也要过：`postNews(` 后 120 个字符内有 `type: 'activity.coopRank'`）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/activity packages/shared/src/news.ts apps/web/src/utils/news.ts apps/web/src/utils/news.test.ts
git commit -m "feat(server): 全服合力结束结算、贡献榜邮件和新闻"
```

---

### Task 5: 前端——玩家卡片

**Files:**
- Create: `apps/web/src/components/activity/ActivityCoop.vue`
- Modify: `apps/web/src/views/ActivitiesView.vue`
- Test: `apps/web/src/views/ActivitiesView.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 `CoopDef`、`ActivityDto.coop`

- [ ] **Step 1: 写失败的测试**（追加）

```ts
describe('ActivitiesView 全服合力（148-3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
  });
  const co = (patch: Record<string, unknown> = {}) => ({
    ...base,
    id: 21,
    kind: 'coop',
    def: {
      rules: [{ key: 'market.buy', points: 10, dailyCap: 50 }],
      milestones: [
        { target: 100, minContribution: 0, award: { coin: 1 } },
        { target: 1000, minContribution: 0, award: { coin: 2 } },
        { target: 2000, minContribution: 300, award: { coin: 3 } },
      ],
      ranks: [
        { from: 1, to: 1, award: { diamond: 5 } },
        { from: 2, to: 3, award: { diamond: 1 } },
      ],
    },
    counters: { points: 200 },
    today: { 'market.buy': 30 },
    rewards: [
      { key: 's0', award: { coin: 1 }, reached: true, claimed: null },
      { key: 's1', award: { coin: 2 }, reached: false, claimed: null },
      { key: 's2', award: { coin: 3 }, reached: false, claimed: null },
    ],
    claimable: 1,
    coop: {
      pool: 550,
      top: [
        { rank: 1, restId: 9, name: '甲餐厅', points: 300, mine: false },
        { rank: 2, restId: 7, name: '我的店', points: 200, mine: true },
      ],
      myRank: 2,
    },
    ...patch,
  });
  const text = (w: ReturnType<typeof mount>, id: string) => w.find(`[data-testid="${id}"]`).text().replace(/\s+/g, ' ');

  it('总分、贡献、名次、进度、还差多少、名次段奖励、前 10 名里自己加粗', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [co() as never], level: 10 });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(text(w, 'coop-head-21')).toBe('全服 550 分 · 我的贡献 200 分 · 第 2 名');
    expect(w.find('[data-testid="coop-bar-21"]').attributes('style')).toContain('width: 50%');
    expect(text(w, 'coop-hint-21-1')).toBe('全服还差 450 分');
    expect(w.find('[data-testid="coop-hint-21-0"]').exists()).toBe(false);
    expect(w.find('[data-testid="activity-21"]').text()).toContain('第 2~3 名：钻石 1');
    expect(w.find('[data-testid="claim-21-s0"]').exists()).toBe(true);
    const rows = w.findAll('[data-testid="coop-top-21"] tr');
    expect(rows[1]!.classes()).toContain('fw-bold');
    expect(rows[0]!.classes()).not.toContain('fw-bold');
  });

  it('全服已达成、个人贡献不够时提示个人还差；全部达成时满格', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [co({ coop: { pool: 2500, top: [], myRank: 3 } }) as never],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(text(w, 'coop-hint-21-2')).toBe('个人贡献还差 100 分');
    expect(w.find('[data-testid="coop-bar-21"]').attributes('style')).toContain('width: 100%');
    expect(w.text()).toContain('全部里程碑已达成');
  });

  it('结束后显示贡献榜已结算', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [co({ state: 'ended', claimable: 0 }) as never],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('贡献榜已结算，奖励已发邮件');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/ActivitiesView.test.ts`
Expected: FAIL（找不到 `coop-head-21`）

- [ ] **Step 3: 卡片** `components/activity/ActivityCoop.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { ActivityDto, CoopDef } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { actionName } from '../../utils/activity';
import { formatNum } from '../../utils/format';
import { rewardSummary } from '../../utils/reward';
import RewardButton from './RewardButton.vue';

/** 全服合力卡片（148-3 设计 §8.2）：全服总分、里程碑、贡献榜 */
const props = defineProps<{ a: ActivityDto & { kind: 'coop'; def: CoopDef }; busy: boolean }>();
defineEmits<{ claim: [key: string] }>();
const catalog = useCatalogStore();
const board = computed(() => props.a.coop ?? { pool: 0, top: [], myRank: null });
const mine = computed(() => props.a.counters.points ?? 0);
const ms = computed(() => props.a.def.milestones);
/** 下一个还没到的里程碑；-1 = 全部达成 */
const nextIdx = computed(() => ms.value.findIndex((m) => m.target > board.value.pool));
/** 进度条：从上一个里程碑到下一个里程碑 */
const progress = computed(() => {
  if (nextIdx.value < 0) return 100;
  const lo = nextIdx.value === 0 ? 0 : ms.value[nextIdx.value - 1]!.target;
  const hi = ms.value[nextIdx.value]!.target;
  return Math.floor(((board.value.pool - lo) / (hi - lo)) * 100);
});
function hint(i: number): string {
  const m = ms.value[i]!;
  if (board.value.pool < m.target) return `全服还差 ${formatNum(m.target - board.value.pool)} 分`;
  if (mine.value < m.minContribution) return `个人贡献还差 ${formatNum(m.minContribution - mine.value)} 分`;
  return '';
}
const rankLabel = (r: { from: number; to: number }) =>
  r.from === r.to ? `第 ${r.from} 名` : `第 ${r.from}~${r.to} 名`;
</script>

<template>
  <div class="mb-1" :data-testid="`coop-head-${a.id}`">
    全服 <b>{{ formatNum(board.pool) }}</b> 分 · 我的贡献 {{ formatNum(mine) }} 分<template
      v-if="board.myRank !== null"
    >
      · 第 {{ board.myRank }} 名</template
    >
  </div>
  <div class="progress mb-1" style="height: 0.5rem">
    <div class="progress-bar" :style="{ width: `${progress}%` }" :data-testid="`coop-bar-${a.id}`"></div>
  </div>
  <div v-if="nextIdx < 0" class="small text-success mb-2">全部里程碑已达成</div>
  <div class="small text-muted mb-2">
    今天：
    <span v-for="r in a.def.rules" :key="r.key" class="me-2"
      >{{ actionName(r.key) }} {{ a.today[r.key] ?? 0 }}/{{ r.dailyCap }}</span
    >
  </div>
  <div
    v-for="(m, i) in a.def.milestones"
    :key="`s${i}`"
    class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
  >
    <span class="flex-fill"
      >全服 {{ formatNum(m.target) }} 分<span v-if="m.minContribution > 0" class="small text-muted"
        >（个人 ≥ {{ formatNum(m.minContribution) }} 分）</span
      ></span
    >
    <span v-if="hint(i)" class="small text-muted" :data-testid="`coop-hint-${a.id}-${i}`">{{ hint(i) }}</span>
    <RewardButton
      :activity-id="a.id"
      :reward="a.rewards[i]!"
      :state="a.state"
      :busy="busy"
      @claim="$emit('claim', $event)"
    />
  </div>
  <template v-if="a.def.ranks.length > 0 || board.top.length > 0">
    <div class="small fw-bold mt-2">贡献榜</div>
    <div v-if="a.state === 'ended'" class="small text-muted">贡献榜已结算，奖励已发邮件</div>
    <div v-else-if="a.state === 'settling'" class="small text-muted">贡献榜结算中</div>
    <div v-for="(r, i) in a.def.ranks" :key="`r${i}`" class="small">
      {{ rankLabel(r) }}：{{ rewardSummary(r.award, catalog) }}
    </div>
    <table v-if="board.top.length > 0" class="table table-sm mt-1 mb-0" :data-testid="`coop-top-${a.id}`">
      <tbody>
        <tr v-for="r in board.top" :key="r.restId" :class="{ 'fw-bold': r.mine }">
          <td>{{ r.rank }}</td>
          <td>{{ r.name }}</td>
          <td class="text-end">{{ formatNum(r.points) }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
```

`ActivitiesView.vue`：import `ActivityCoop`，在 `<ActivityExchange …/>` 之后加：

```vue
    <ActivityCoop v-else-if="a.kind === 'coop'" :a="a" :busy="busy" @claim="claim(a, $event)" />
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web/src/views/ActivitiesView.test.ts`
Expected: PASS（如果"全服 550 分 · …"因模板空白多出空格，测试已经把连续空白压成一个；仍不符合就调整模板空白，不改断言）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/activity/ActivityCoop.vue apps/web/src/views/ActivitiesView.vue apps/web/src/views/ActivitiesView.test.ts
git commit -m "feat(web): 全服合力卡片"
```

---

### Task 6: 前端——后台编辑器

**Files:**
- Create: `apps/web/src/components/admin/activity/RuleRows.vue`
- Create: `apps/web/src/components/admin/activity/CoopEditor.vue`
- Modify: `apps/web/src/components/admin/activity/PassEditor.vue`（规则表改用 `RuleRows`）
- Modify: `apps/web/src/utils/activityForm.ts`
- Modify: `apps/web/src/views/admin/AdminActivitiesView.vue`
- Test: `apps/web/src/views/admin/AdminActivitiesView.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 `CoopDef`
- Produces: `RuleRows`（props `modelValue: PassDef['rules']`、`errors`；emit `update:modelValue`）；测试 id `rule-points-<i>`、`ms-add`、`ms-target-<i>`、`ms-min-<i>`、`ms-del-<i>`、`rank-add`、`rank-from-<i>`、`rank-to-<i>`、`rank-del-<i>`、`err-<路径>`

- [ ] **Step 1: 写失败的测试**（追加）

```ts
describe('AdminActivitiesView 全服合力（148-3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });
  const open = async (kind: string) => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue(kind);
    await w.find('[data-testid="ac-title"]').setValue('合力');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    return w;
  };

  it('规则、里程碑、名次段都进提交内容；可以增删', async () => {
    const w = await open('coop');
    await w.find('[data-testid="ms-add"]').trigger('click');
    await w.find('[data-testid="ms-target-1"]').setValue('5000');
    await w.find('[data-testid="ms-min-1"]').setValue('100');
    await w.find('[data-testid="rank-add"]').trigger('click');
    await w.find('[data-testid="rank-to-1"]').setValue('10');
    await w.find('[data-testid="rank-add"]').trigger('click');
    await w.find('[data-testid="rank-del-2"]').trigger('click');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('coop');
    expect(b.def).toMatchObject({
      rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
      milestones: [
        { target: 1000, minContribution: 0 },
        { target: 5000, minContribution: 100 },
      ],
      ranks: [
        { from: 1, to: 1 },
        { from: 2, to: 10 },
      ],
    });
  });

  it('服务端字段错误显示在对应行', async () => {
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', {
        issues: [
          { path: 'def.milestones.1.target', message: 'not_increasing' },
          { path: 'def.ranks.0.to', message: 'bad_range' },
        ],
      }),
    );
    const w = await open('coop');
    await w.find('[data-testid="ms-add"]').trigger('click');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.milestones.1.target"]').text()).toBe('积分要比上一档高');
    expect(w.find('[data-testid="err-def.ranks.0.to"]').text()).toBe('起始名次不能大于结束名次');
  });

  it('战令的规则表改用共用组件后照常提交', async () => {
    const w = await open('pass');
    await w.find('[data-testid="rule-points-0"]').setValue('7');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.def).toMatchObject({ rules: [{ key: 'signin', points: 7, dailyCap: 10 }] });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/admin/AdminActivitiesView.test.ts`
Expected: FAIL（下拉里没有 `coop`；找不到 `rule-points-0`）

- [ ] **Step 3: 共用规则行** `RuleRows.vue`

```vue
<script setup lang="ts">
import { ACTIVITY_ACTIONS, type PassDef } from '@dt/shared';

type Rule = PassDef['rules'][number];
/** 积分规则表（战令和全服合力共用，148-3）：行为、每次几分、每天上限 */
const props = defineProps<{ modelValue: Rule[]; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [Rule[]] }>();
const setRule = (i: number, p: Partial<Rule>) =>
  emit(
    'update:modelValue',
    props.modelValue.map((r, j) => (j === i ? { ...r, ...p } : r)),
  );
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
</script>

<template>
  <div v-if="errors['def.rules']" class="text-danger small" data-testid="err-def.rules">
    {{ errors['def.rules'] }}
  </div>
  <div v-for="(r, i) in modelValue" :key="`r${i}`" class="d-flex gap-2 align-items-center py-1">
    <select
      class="form-select form-select-sm w-auto"
      :value="r.key"
      @change="setRule(i, { key: ($event.target as HTMLSelectElement).value })"
    >
      <option v-for="(name, k) in ACTIVITY_ACTIONS" :key="k" :value="k">{{ name }}</option>
    </select>
    每次
    <input
      type="number"
      min="1"
      class="form-control form-control-sm"
      style="width: 5rem"
      :value="r.points"
      :data-testid="`rule-points-${i}`"
      @input="setRule(i, { points: num($event) })"
    />
    分 每天最多
    <input
      type="number"
      min="1"
      class="form-control form-control-sm"
      style="width: 6rem"
      :value="r.dailyCap"
      @input="setRule(i, { dailyCap: num($event) })"
    />
    分
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.length <= 1"
      @click="emit('update:modelValue', modelValue.filter((_, j) => j !== i))"
    >
      删除
    </button>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mb-3"
    :disabled="modelValue.length >= 20"
    @click="emit('update:modelValue', [...modelValue, { key: 'signin', points: 10, dailyCap: 10 }])"
  >
    加一条规则
  </button>
</template>
```

`PassEditor.vue`：模板里从 `<div v-if="err('def.rules')"` 到第一个"加一条规则"按钮的 `</button>` 整段，换成：

```vue
  <RuleRows :model-value="modelValue.rules" :errors="errors" @update:model-value="patch({ rules: $event })" />
```

（保留上面的 `<div class="small fw-bold">积分规则</div>`。）脚本里删掉 `setRule` 和 `type Rule`，import 去掉 `ACTIVITY_ACTIONS`，加 `import RuleRows from './RuleRows.vue';`。lint 报未使用的变量就一并删掉。

- [ ] **Step 4: 编辑器** `CoopEditor.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { CoopDef } from '@dt/shared';
import { rowKeys } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';
import RuleRows from './RuleRows.vue';

/** 全服合力编辑器（148-3 设计 §8.3）：贡献规则、里程碑、名次段 */
const props = defineProps<{ modelValue: CoopDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [CoopDef] }>();
type Def = CoopDef;
const patch = (p: Partial<Def>) => emit('update:modelValue', { ...props.modelValue, ...p });
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
/** 行的稳定 key（终审 I1）：删掉中间一行时，下面的奖励编辑器不错位 */
const msKeys = ref(rowKeys(props.modelValue.milestones.length));
const rankKeys = ref(rowKeys(props.modelValue.ranks.length));
const setMs = (i: number, p: Partial<Def['milestones'][number]>) =>
  patch({ milestones: props.modelValue.milestones.map((m, j) => (j === i ? { ...m, ...p } : m)) });
const setRank = (i: number, p: Partial<Def['ranks'][number]>) =>
  patch({ ranks: props.modelValue.ranks.map((r, j) => (j === i ? { ...r, ...p } : r)) });
function addMs() {
  msKeys.value = [...msKeys.value, ...rowKeys(1)];
  const last = props.modelValue.milestones.at(-1)?.target ?? 0;
  patch({
    milestones: [...props.modelValue.milestones, { target: last + 1000, minContribution: 0, award: {} as never }],
  });
}
function removeMs(i: number) {
  msKeys.value = msKeys.value.filter((_, j) => j !== i);
  patch({ milestones: props.modelValue.milestones.filter((_, j) => j !== i) });
}
function addRank() {
  rankKeys.value = [...rankKeys.value, ...rowKeys(1)];
  const next = (props.modelValue.ranks.at(-1)?.to ?? 0) + 1;
  patch({ ranks: [...props.modelValue.ranks, { from: next, to: next, award: {} as never }] });
}
function removeRank(i: number) {
  rankKeys.value = rankKeys.value.filter((_, j) => j !== i);
  patch({ ranks: props.modelValue.ranks.filter((_, j) => j !== i) });
}
const errsUnder = (prefix: string) => Object.entries(props.errors).filter(([k]) => k.startsWith(prefix));
</script>

<template>
  <div class="small fw-bold">贡献规则</div>
  <RuleRows :model-value="modelValue.rules" :errors="errors" @update:model-value="patch({ rules: $event })" />

  <div class="small fw-bold">里程碑（全服总分达到目标、个人贡献达到门槛才能领）</div>
  <div
    v-for="(m, i) in modelValue.milestones"
    :key="msKeys[i]"
    class="border-bottom py-2"
    :data-testid="`ms-row-${i}`"
  >
    <div class="d-flex flex-wrap gap-2 align-items-center">
      全服
      <input
        type="number"
        min="1"
        class="form-control form-control-sm"
        style="width: 8rem"
        :value="m.target"
        :data-testid="`ms-target-${i}`"
        @input="setMs(i, { target: num($event) })"
      />
      分，个人至少
      <input
        type="number"
        min="0"
        class="form-control form-control-sm"
        style="width: 6rem"
        :value="m.minContribution"
        :data-testid="`ms-min-${i}`"
        @input="setMs(i, { minContribution: num($event) })"
      />
      分
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="modelValue.milestones.length <= 1"
        :data-testid="`ms-del-${i}`"
        @click="removeMs(i)"
      >
        删除
      </button>
    </div>
    <RewardItemsEditor
      :model-value="m.award"
      :hats="true"
      :id-prefix="`ms${i}`"
      @update:model-value="setMs(i, { award: $event })"
    />
    <span
      v-for="[k, msg] in errsUnder(`def.milestones.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ msg }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary my-2"
    data-testid="ms-add"
    :disabled="modelValue.milestones.length >= 10"
    @click="addMs"
  >
    加一个里程碑
  </button>

  <div class="small fw-bold">贡献榜名次奖励（活动结束后发邮件，可以不设）</div>
  <div
    v-for="(r, i) in modelValue.ranks"
    :key="rankKeys[i]"
    class="border-bottom py-2"
    :data-testid="`rank-row-${i}`"
  >
    <div class="d-flex flex-wrap gap-2 align-items-center">
      第
      <input
        type="number"
        min="1"
        max="100"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="r.from"
        :data-testid="`rank-from-${i}`"
        @input="setRank(i, { from: num($event) })"
      />
      ~
      <input
        type="number"
        min="1"
        max="100"
        class="form-control form-control-sm"
        style="width: 5rem"
        :value="r.to"
        :data-testid="`rank-to-${i}`"
        @input="setRank(i, { to: num($event) })"
      />
      名
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :data-testid="`rank-del-${i}`"
        @click="removeRank(i)"
      >
        删除
      </button>
    </div>
    <RewardItemsEditor
      :model-value="r.award"
      :hats="true"
      :id-prefix="`rk${i}`"
      @update:model-value="setRank(i, { award: $event })"
    />
    <span
      v-for="[k, msg] in errsUnder(`def.ranks.${i}.`)"
      :key="k"
      class="text-danger small"
      :data-testid="`err-${k}`"
      >{{ msg }}</span
    >
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary my-2"
    data-testid="rank-add"
    :disabled="modelValue.ranks.length >= 10"
    @click="addRank"
  >
    加一个名次段
  </button>
</template>
```

- [ ] **Step 5: 表单默认值、文案、后台页**

`activityForm.ts`：
- import 加 `CoopDef`；
- 加重载 `export function defaultDef(kind: 'coop'): CoopDef;`；
- 两处联合返回类型末尾加 `| CoopDef`；
- 在 `if (kind === 'exchange')` 前加：

```ts
  if (kind === 'coop')
    return {
      rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
      milestones: [{ target: 1000, minContribution: 0, award: {} as Goal['award'] }],
      ranks: [{ from: 1, to: 1, award: {} as Goal['award'] }],
    };
```

`TEXT` 加 `bad_range: '起始名次不能大于结束名次',` 和 `overlap: '名次段不能重叠，要按名次从小到大排',`。

`AdminActivitiesView.vue`：
- import 加 `CoopDef` 和 `import CoopEditor from '../../components/admin/activity/CoopEditor.vue';`；
- `defs` 的类型加 `coop: CoopDef;`，两处初值（声明处和 `fill` 里）都加 `coop: defaultDef('coop'),`；
- `KIND` 加 `coop: '全服合力',`；
- 类型下拉在 `<option value="exchange">兑换活动</option>` 后加 `<option value="coop">全服合力</option>`；
- 编辑器分支在 `<ExchangeEditor …/>` 后加：

```vue
      <CoopEditor v-else-if="kind === 'coop'" v-model="defs.coop" :errors="errors" />
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm --filter @dt/web lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 全服合力后台编辑器；战令和合力共用规则行"
```

---

### Task 7: 全量检查

- [ ] **Step 1:** `pnpm vitest run`（输出写到工作区文件，读尾部）→ 全部通过
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → 通过
- [ ] **Step 3:** `pnpm format:check` → 只允许 `问题记录.md` 报警
