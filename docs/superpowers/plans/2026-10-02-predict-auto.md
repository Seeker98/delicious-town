# 事件合约 238-2 系统自动出题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每个区服每天自动出 4 道事件合约题（蟹老板/嘻哈男孩、菜场货架、天气、全服数据），到点自动判定并写"判定依据"。

**Architecture:** `apps/server/src/modules/predict/auto/` 每类题一个文件，各自导出 `create`（出题草稿）和 `resolve`（判定或"还判不了"）；`index.ts` 放出题任务（每天一次，挂 `predict`）和判定任务（每分钟，挂 `restaurant`）。判定和作废的"改终态"逻辑从后台抽成 `finalize.ts` 共用。迁移 0031 给事件加 `auto_key`（唯一）、`result_note`、`resolve_at`。前端显示"系统出题"和"判定依据"。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-02-predict-2-auto-design.md`

## Global Constraints

- `tuning.predict.auto` = `{ "krab": true, "market": true, "weather": true, "stats": true, "b": 100, "marketCloseMin": 5, "statsCloseHour": 18 }`，`tuning.json`、zod、`setting_docs.json` 都要加。
- 自动题 `kind` ∈ `krab | hiphop | market | weather | stats`；`auto_key = '<开关名>:<出题当天 D>'`（蟹老板和嘻哈男孩共用 `krab:D`）；`created_by` 为空。
- 出题选择（街段、地点、时段、天气类型）用 `d.rng()`；判定时重算的天气、蟹老板用 `gameSeed`（和世界服务一致）。
- 截止：蟹老板/嘻哈男孩 D 当天 23:50；菜场 H 点前 `marketCloseMin` 分钟；天气 H 点前 5 分钟；全服数据 D 当天 `statsCloseHour` 点。
- 判定时间：蟹老板 D+1 的 `krabHour`；嘻哈男孩 D+1 的 `hiphop.hour`；菜场 H 点；天气 H+2 小时；全服数据 D+1 的 00:10。
- 时段约束：菜场 `H 点 − marketCloseMin ≥ 出题 + 1 小时`；天气 `H 点 ≥ 出题 + 3 小时`。
- 初始概率夹在 5%~95%；天气类型只选占比 15%~85% 的，没有就选最接近 50% 的。
- 依赖功能关掉不出这一类：菜场看 `market`；嘻哈男孩看 `hiphop`（这天改出蟹老板）；蟹老板、天气看 `world`。区服关掉 `predict` 不出题（出题任务挂 `predict`）。
- 判定：只改 `open`/`closed` 的事件（管理员已手动判定或作废的不动）；`resolve_at` 过了 24 小时还判不了就作废（按比例退款），`result_note = '数据缺失，自动作废'`；自动判定不写审计。
- 文案中文；不改 `问题记录.md`。

## Review Focus

1. 出题任务重跑（worker 重启、两个 worker）：同一区服同一天每类只有一题（Task 4 测试"重跑不重复出题"）。
2. 管理员在自动判定前手动判定或作废：自动判定不能覆盖（Task 4 测试"已手动判定的不覆盖"）。
3. 天气被雷神锤改过：结果按自动轮换判，判定依据写明改成了什么（Task 3 测试"雷神锤改过"）。
4. 判定时数据还没生成（货架、嘻哈男孩地点）：等下一分钟，不误判为"否"（Task 3 测试"货架还没生成返回 null"）。
5. 玩家自己手动进货的货也在日常货架上：菜场题只看系统进货，不看 `owner_rest_id` 不为空的货（Task 3 测试）。

---

### Task 1: 数值、迁移、DTO 字段、终态函数

**Files:**
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`、`packages/config/data/game/setting_docs.json`
- Create: `apps/server/src/db/migrations/0031_predict_auto.ts`；Modify: `migrations/index.ts`、`db/schema.ts`
- Create: `apps/server/src/modules/predict/finalize.ts`；Modify: `predict/admin.ts`（`finish` 改用它）
- Modify: `packages/shared/src/schemas/predict.ts`（`PredictEventDto.auto`、`resultNote`；`PredictAdminRow.auto`、`resultNote`）、`predict/service.ts`、`predict/admin.ts`（列表）
- Test: `apps/server/src/modules/predict/auto-schema.test.ts`

**Interfaces:**
- Produces:
  - `finalizeEvent(tx: Kysely<DB>, id: string, set: { status: 'resolved' | 'void'; outcome: boolean | null; note?: string | null }, now: Date): Promise<{ title: string; voidRatio: number | null } | null>`（已是终态返回 null，不改）
  - 表列 `predict_event.auto_key`、`result_note`、`resolve_at`；唯一索引 `(shard_id, auto_key)`
  - `Tuning['predict']['auto']`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/predict/auto-schema.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { trader } from '../exchange/test';
import { finalizeEvent } from './finalize';
import { newEvent } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('自动出题的数值、字段和终态函数（238-2 设计 §3、§5）', () => {
  it('区服数值默认值', () => {
    expect(t.deps.config.tuning.predict.auto).toEqual({
      krab: true,
      market: true,
      weather: true,
      stats: true,
      b: 100,
      marketCloseMin: 5,
      statsCloseHour: 18,
    });
  });

  it('同一区服 auto_key 唯一；手动题 auto_key 为空不冲突', async () => {
    const shardId = await createShard(t.db);
    const a = await newEvent(t, shardId);
    const b = await newEvent(t, shardId);
    await t.db.updateTable('predict_event').set({ auto_key: 'krab:2026-10-02' }).where('id', '=', String(a)).execute();
    await expect(
      t.db.updateTable('predict_event').set({ auto_key: 'krab:2026-10-02' }).where('id', '=', String(b)).execute(),
    ).rejects.toThrow(/unique|duplicate/i);
    const other = await createShard(t.db);
    const c = await newEvent(t, other);
    await t.db.updateTable('predict_event').set({ auto_key: 'krab:2026-10-02' }).where('id', '=', String(c)).execute();
  });

  it('finalizeEvent：判定写结果和判定依据；作废算退款比例；已是终态返回 null 不改', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const r = await trader(t, { shardId });
    await t.game.predict.trade(r, id, { side: 'yes', dir: 'buy', qty: 3 });
    const done = await t.db.transaction().execute((tx) =>
      finalizeEvent(tx, String(id), { status: 'resolved', outcome: true, note: '依据' }, t.clock.now),
    );
    expect(done).toEqual({ title: '测试事件', voidRatio: null });
    const e = await t.db.selectFrom('predict_event').selectAll().where('id', '=', String(id)).executeTakeFirstOrThrow();
    expect(e).toMatchObject({ status: 'resolved', outcome: true, result_note: '依据' });
    const again = await t.db.transaction().execute((tx) =>
      finalizeEvent(tx, String(id), { status: 'void', outcome: null }, t.clock.now),
    );
    expect(again).toBeNull();
    const v = await newEvent(t, shardId);
    await t.game.predict.trade(r, v, { side: 'no', dir: 'buy', qty: 2 });
    const voided = await t.db.transaction().execute((tx) =>
      finalizeEvent(tx, String(v), { status: 'void', outcome: null, note: '数据缺失，自动作废' }, t.clock.now),
    );
    expect(voided).toEqual({ title: '测试事件', voidRatio: 1 });
  });

  it('列表和详情带 auto、resultNote', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    await t.db
      .updateTable('predict_event')
      .set({ auto_key: 'stats:2026-10-02', result_note: '今天 3，昨天 2' })
      .where('id', '=', String(id))
      .execute();
    const r = await trader(t, { shardId });
    const l = await t.game.predict.list(r);
    expect(l.events.find((e) => e.id === id)).toMatchObject({ auto: true, resultNote: '今天 3，昨天 2' });
    expect((await t.game.predict.detail(r, id)).event).toMatchObject({ auto: true, resultNote: '今天 3，昨天 2' });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict/auto-schema.test.ts`
Expected: FAIL（`./finalize` 不存在；`tuning.predict.auto` undefined）。

- [ ] **Step 3: 数值**

`tuning.ts` 的 `predict: z.object({` 里，`minAccountDays: int.min(0),` 之后加：

```ts
    /** 系统自动出题（238-2） */
    auto: z.object({
      krab: z.boolean(),
      market: z.boolean(),
      weather: z.boolean(),
      stats: z.boolean(),
      b: int.min(10).max(10000),
      marketCloseMin: int.min(1).max(60),
      statsCloseHour: int.min(1).max(23),
    }),
```

`tuning.json` 的 `predict` 行改为（在 `"minAccountDays": 7` 后加）：

```json
  "predict": { "unit": 1000, "feeRate": 0.02, "maxHold": 200, "maxTrade": 100, "defaultB": 100, "minLevel": 20, "minAccountDays": 7, "auto": { "krab": true, "market": true, "weather": true, "stats": true, "b": 100, "marketCloseMin": 5, "statsCloseHour": 18 } },
```

`setting_docs.json` 的 fields 里 `tuning.predict.minAccountDays` 之后加：

```json
    "tuning.predict.auto.krab": "每天自动出\"明天蟹老板/嘻哈男孩在哪\"题（隔天轮换）",
    "tuning.predict.auto.market": "每天自动出\"某个整点日常货架会不会出稀有食材\"题",
    "tuning.predict.auto.weather": "每天自动出\"某个时段自动轮换的天气是不是某类\"题（雷神锤改的不算）",
    "tuning.predict.auto.stats": "每天自动出\"今天全服营业银币/活跃店数会不会超过昨天\"题",
    "tuning.predict.auto.b": "自动题的流动性 b（份）",
    "tuning.predict.auto.marketCloseMin": "菜场题在开货前几分钟截止（分钟）",
    "tuning.predict.auto.statsCloseHour": "全服数据题当天几点截止（点）",
```

`tuning.predict` 分组说明末尾加"；auto 是系统每天自动出的题"。

- [ ] **Step 4: 迁移和类型**

`0031_predict_auto.ts`：

```ts
import { sql, type Kysely } from 'kysely';

/** 238-2：系统自动出题的唯一键、判定依据、最早判定时间 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table predict_event
    add column auto_key text,
    add column result_note text,
    add column resolve_at timestamptz`.execute(db);
  await sql`create unique index predict_event_auto on predict_event (shard_id, auto_key)`.execute(db);
  await sql`create index predict_event_resolve on predict_event (shard_id, resolve_at) where auto_key is not null and status in ('open', 'closed')`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index predict_event_resolve`.execute(db);
  await sql`drop index predict_event_auto`.execute(db);
  await sql`alter table predict_event drop column resolve_at, drop column result_note, drop column auto_key`.execute(db);
}
```

（`auto_key` 为空的行在唯一索引里互不冲突，Postgres 的 NULL 不相等。）

`index.ts` 加 `0031_predict_auto`；`schema.ts` 的 `PredictEventTable` 加：

```ts
  /** 自动题的唯一键，例如 krab:2026-10-03；手动题为空（238-2） */
  auto_key: Nullable<string>;
  /** 判定依据 */
  result_note: Nullable<string>;
  /** 自动题最早判定时间 */
  resolve_at: TsNullable;
```

- [ ] **Step 5: `finalize.ts`，后台改用它**

```ts
import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';

/**
 * 把事件改为终态（判定或作废），调用方在事务里、事件行已可加锁。
 * 已经是终态（被别人先判定或作废）返回 null、不改。作废时算退款比例（238-1 终审 I1）：
 * 系统净收入（所有人净投入之和，含手续费）÷ 亏损的人的净投入之和，夹在 0~1
 */
export async function finalizeEvent(
  tx: Kysely<DB>,
  id: string,
  set: { status: 'resolved' | 'void'; outcome: boolean | null; note?: string | null },
  now: Date,
): Promise<{ title: string; voidRatio: number | null } | null> {
  const e = await tx
    .selectFrom('predict_event')
    .select(['status', 'title'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst();
  if (!e || (e.status !== 'open' && e.status !== 'closed')) return null;
  let voidRatio: number | null = null;
  if (set.status === 'void') {
    const agg = await tx
      .selectFrom('predict_position')
      .select([
        sql<string>`coalesce(sum(net_cost), 0)`.as('net'),
        sql<string>`coalesce(sum(greatest(net_cost, 0)), 0)`.as('owed'),
      ])
      .where('event_id', '=', id)
      .executeTakeFirstOrThrow();
    const owed = Number(agg.owed);
    voidRatio = owed > 0 ? Math.min(1, Math.max(0, Number(agg.net) / owed)) : 1;
  }
  await tx
    .updateTable('predict_event')
    .set({
      status: set.status,
      outcome: set.outcome,
      resolved_at: now,
      void_ratio: voidRatio,
      ...(set.note !== undefined ? { result_note: set.note } : {}),
    })
    .where('id', '=', id)
    .execute();
  return { title: e.title, voidRatio };
}
```

`admin.ts` 的 `finish` 改为：先查事件是否存在（不存在 404），再调 `finalizeEvent`；返回 null 时报 `invalidState('predict_final')`；审计日志照旧（`refundRatio: r.voidRatio`）。去掉 `finish` 里原来的比例计算和更新语句；`sql` 若不再使用就从 import 去掉（`list` 里还用 `sql`，保留）。

```ts
  async function finish(actor: AdminActor, id: number, set: { status: 'resolved' | 'void'; outcome: boolean | null }) {
    const now = game.deps.now();
    await db.transaction().execute(async (tx) => {
      const exists = await tx.selectFrom('predict_event').select('id').where('id', '=', String(id)).executeTakeFirst();
      if (!exists) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'predict_event', id });
      const r = await finalizeEvent(tx, String(id), set, now);
      if (!r) throw invalidState('predict_final');
      await writeAudit(tx, {
        actor,
        action: set.status === 'resolved' ? 'predict.resolve' : 'predict.void',
        target: `predict_event:${id}`,
        detail: {
          title: r.title,
          ...(set.status === 'resolved' ? { outcome: set.outcome } : { refundRatio: r.voidRatio }),
        },
      });
    });
    return { ok: true as const };
  }
```

- [ ] **Step 6: DTO 字段**

`packages/shared/src/schemas/predict.ts`：`PredictEventDto` 在 `payout` 之后加

```ts
  /** 系统自动出的题（238-2） */
  auto: boolean;
  /** 判定依据；没有为 null */
  resultNote: string | null;
```

`PredictAdminRow` 在 `creator` 之后加同样两项。

`service.ts`：`EVENT_COLS` 加 `'e.auto_key'`、`'e.result_note'`；`Row` 类型加 `auto_key: string | null; result_note: string | null;`；`toDto` 加 `auto: r.auto_key !== null, resultNote: r.result_note,`。

`admin.ts` 的 `list`：select 加 `'e.auto_key'`、`'e.result_note'`，映射加 `auto: r.auto_key !== null, resultNote: r.result_note ?? null,`。

- [ ] **Step 7: 运行，确认通过；预测模块全部测试、类型检查**

Run: `pnpm vitest run apps/server/src/modules/predict packages/config && pnpm -F @dt/server typecheck`
Expected: PASS。前端测试的夹具缺 `auto`/`resultNote` 字段会让 `pnpm -F @dt/web typecheck` 报错，留到 Task 5 补。

- [ ] **Step 8: 提交**

```bash
git add packages/config packages/shared/src/schemas/predict.ts apps/server/src/db apps/server/src/modules/predict
git commit -m "feat: 事件合约自动出题的数值、字段和终态函数（238-2）"
```

---

### Task 2: 纯函数——菜场稀有概率、天气类型占比

**Files:**
- Create: `apps/server/src/modules/predict/auto/odds.ts`
- Test: `apps/server/src/modules/predict/auto/odds.test.ts`

**Interfaces:**
- Produces:
  - `marketRareChance(config: GameConfig, mt: Tuning['market'], hour: number, level: number, n: number, rng: Rng): number`
  - `weatherTypeShares(config: GameConfig, w: Tuning['world'], hour: number): Map<number, number>`（type → 占比，和为 1）
  - `WEATHER_TYPE_NAMES: Record<number, string>` = `{ 1: '晴', 2: '雨', 3: '雪', 4: '风沙雾霾' }`
  - `clampP(p: number): number`（夹到 0.05~0.95）

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../../test/config';
import { rollShelf } from '../../market/rules';
import { weatherPool, isNight } from '../../world/rules';
import { clampP, marketRareChance, weatherTypeShares, WEATHER_TYPE_NAMES } from './odds';

const config = testConfig();
const mt = config.tuning.market;
const w = config.tuning.world;

describe('菜场稀有食材概率估算（238-2 设计 §4.3）', () => {
  it('和另一组随机数直接模拟的结果相差在 3% 以内', () => {
    for (const level of [1, 2]) {
      const est = marketRareChance(config, mt, 12, level, 2000, seededRng(1));
      const rng = seededRng(99);
      let hit = 0;
      for (let i = 0; i < 4000; i++)
        if (rollShelf(0, 12, config, mt, rng).some((x) => {
          const f = config.requireFood(x.foodsId);
          return f.level === level && f.odds < 100;
        }))
          hit++;
      expect(Math.abs(est - hit / 4000)).toBeLessThan(0.03);
    }
  });
});

describe('天气类型占比（238-2 设计 §4.4）', () => {
  it('白天、夜间各类占比和为 1，和天气池权重一致', () => {
    for (const hour of [13, 23]) {
      const shares = weatherTypeShares(config, w, hour);
      const sum = [...shares.values()].reduce((s, x) => s + x, 0);
      expect(sum).toBeCloseTo(1, 9);
      const pool = weatherPool(config, isNight(hour, w), w);
      const rain = pool.items.filter((x) => x.type === 2);
      const rainW = rain.reduce((s, x) => s + (pool.prefix[pool.items.indexOf(x)]! - (pool.prefix[pool.items.indexOf(x) - 1] ?? 0)), 0);
      expect(shares.get(2) ?? 0).toBeCloseTo(rainW / pool.total, 9);
    }
    expect(WEATHER_TYPE_NAMES[2]).toBe('雨');
  });

  it('概率夹在 5%~95%', () => {
    expect(clampP(0.01)).toBe(0.05);
    expect(clampP(0.99)).toBe(0.95);
    expect(clampP(0.4)).toBe(0.4);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict/auto/odds.test.ts`
Expected: FAIL（`./odds` 不存在）。

- [ ] **Step 3: 实现**

```ts
import type { GameConfig, Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';
import { rollShelf } from '../../market/rules';
import { isNight, weatherPool } from '../../world/rules';

export const WEATHER_TYPE_NAMES: Record<number, string> = { 1: '晴', 2: '雨', 3: '雪', 4: '风沙雾霾' };

/** 初始概率夹到 5%~95%（238-1 出题范围） */
export const clampP = (p: number) => Math.min(0.95, Math.max(0.05, p));

/** H 点日常货架至少上一种 level 级稀有食材（odds < 100）的概率：按进货算法模拟 n 次估算 */
export function marketRareChance(
  config: GameConfig,
  mt: Tuning['market'],
  hour: number,
  level: number,
  n: number,
  rng: Rng,
): number {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const items = rollShelf(0, hour, config, mt, rng);
    if (
      items.some((x) => {
        const f = config.requireFood(x.foodsId);
        return f.level === level && f.odds < 100;
      })
    )
      hit++;
  }
  return hit / n;
}

/** H 点自动轮换时各天气类型的占比（按天气池权重） */
export function weatherTypeShares(config: GameConfig, w: Tuning['world'], hour: number): Map<number, number> {
  const pool = weatherPool(config, isNight(hour, w), w);
  const out = new Map<number, number>();
  pool.items.forEach((x, i) => {
    const weight = pool.prefix[i]! - (i > 0 ? pool.prefix[i - 1]! : 0);
    out.set(x.type, (out.get(x.type) ?? 0) + weight / pool.total);
  });
  return out;
}
```

（测试里计算雨类权重的那行用了 `indexOf`，等价于实现里的写法；如果 `prettier` 改了换行，按格式化结果为准。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/predict/auto/odds.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/predict/auto
git commit -m "feat: 自动出题的菜场稀有概率和天气类型占比（238-2）"
```

---

### Task 3: 五类题目的出题和判定

**Files:**
- Create: `apps/server/src/modules/predict/auto/types.ts`、`krab.ts`、`hiphop.ts`、`market.ts`、`weather.ts`、`stats.ts`
- Test: `apps/server/src/modules/predict/auto/kinds.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `marketRareChance`、`weatherTypeShares`、`WEATHER_TYPE_NAMES`、`clampP`；`gameSeed`（`../../../core/seed`）；`featureAvailable`（`../../../core/features`）；`aggregateDay`（`../../admin/stats`）。
- Produces（`types.ts`）：

```ts
import type { ShardSettings } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { GameDeps } from '../../../core/deps';

export interface AutoCtx {
  d: GameDeps;
  shardId: number;
  settings: ShardSettings;
  now: Date;
  /** 出题当天（游戏日） */
  day: string;
  rng: Rng;
}

export interface AutoDraft {
  title: string;
  description: string;
  p0: number;
  closeAt: Date;
  resolveAt: Date;
  params: Record<string, unknown>;
}

export interface AutoKind {
  kind: 'krab' | 'hiphop' | 'market' | 'weather' | 'stats';
  create(c: AutoCtx): Promise<AutoDraft | null>;
  /** 判出来返回结果和判定依据；数据还没生成返回 null */
  resolve(
    c: { d: GameDeps; shardId: number; settings: ShardSettings },
    params: Record<string, unknown>,
  ): Promise<{ outcome: boolean; note: string } | null>;
}
```

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/predict/auto/kinds.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime, seededRng, slotKey } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../../test/game';
import { hiphop } from './hiphop';
import { krab } from './krab';
import { market } from './market';
import { stats } from './stats';
import type { AutoCtx } from './types';
import { weather } from './weather';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 出题时间固定在某天 0:05（游戏时间） */
const DAY = '2026-11-03';
const at0 = gameTime(DAY, 0, 5);
async function ctx(shardId: number, seed = 1): Promise<AutoCtx> {
  return {
    d: t.game.deps,
    shardId,
    settings: await t.game.deps.shards.settings(shardId),
    now: at0,
    day: DAY,
    rng: seededRng(seed),
  };
}
const rctx = async (shardId: number) => ({
  d: t.game.deps,
  shardId,
  settings: await t.game.deps.shards.settings(shardId),
});

describe('蟹老板（238-2 设计 §4.1）', () => {
  it('出题：明天 a~a+5 号街，概率 6/13，当天 23:50 截止，明天 9 点判定', async () => {
    const shardId = await createShard(t.db);
    const dr = (await krab.create(await ctx(shardId)))!;
    const { from, to } = dr.params as { from: number; to: number };
    expect(to - from).toBe(5);
    expect(from).toBeGreaterThanOrEqual(1);
    expect(to).toBeLessThanOrEqual(13);
    expect(dr.title).toBe(`明天蟹老板会在 ${from}~${to} 号街出现吗`);
    expect(dr.p0).toBeCloseTo(6 / 13, 9);
    expect(dr.closeAt).toEqual(gameTime(DAY, 23, 50));
    expect(dr.resolveAt).toEqual(gameTime(addDays(DAY, 1), 9));
  });

  it('判定：和世界服务 9 点刷新出的街一致（之后被驱赶改的不算）', async () => {
    const shardId = await createShard(t.db);
    const tomorrow = addDays(DAY, 1);
    const slot = { key: slotKey(tomorrow, 9), day: tomorrow, hour: 9, start: gameTime(tomorrow, 9) };
    const { street } = await t.game.world.changeKrabStreet(shardId, slot, gameTime(tomorrow, 9));
    for (const from of [1, 5, 8]) {
      const r = (await krab.resolve(await rctx(shardId), { day: tomorrow, from, to: from + 5 }))!;
      expect(r.outcome).toBe(street >= from && street <= from + 5);
      expect(r.note).toBe(`明天 9 点蟹老板刷新在 ${street} 号街`);
    }
  });
});

describe('嘻哈男孩（238-2 设计 §4.2）', () => {
  it('出题：按地点权重，明天 hiphop.hour 判定；判定读地点记录，没生成返回 null', async () => {
    const shardId = await createShard(t.db);
    const dr = (await hiphop.create(await ctx(shardId, 3)))!;
    const place = dr.params.place as number;
    const weights = t.deps.config.tuning.hiphop.placeWeights;
    const total = weights.reduce((s, [, x]) => s + x, 0);
    expect(dr.p0).toBeCloseTo(weights.find(([p]) => p === place)![1] / total, 9);
    expect(dr.resolveAt).toEqual(gameTime(addDays(DAY, 1), t.deps.config.tuning.hiphop.hour));
    expect(await hiphop.resolve(await rctx(shardId), dr.params)).toBeNull();
    const other = place === 1 ? 2 : 1;
    await t.db
      .insertInto('hiphop_day')
      .values({ shard_id: shardId, day: addDays(DAY, 1), place: other, foods_id: 101, worth: 1, created_at: at0 })
      .execute();
    const r = (await hiphop.resolve(await rctx(shardId), dr.params))!;
    expect(r.outcome).toBe(false);
    expect(r.note).toMatch(/^明天嘻哈男孩出现在/);
  });
});

describe('菜场（238-2 设计 §4.3）', () => {
  it('出题：时段在出题 1 小时之后；截止在开货前 5 分钟', async () => {
    const shardId = await createShard(t.db);
    const dr = (await market.create(await ctx(shardId)))!;
    const { hour, level } = dr.params as { hour: number; level: number };
    expect(t.deps.config.tuning.market.dailyHours).toContain(hour);
    expect([1, 2]).toContain(level);
    expect(dr.title).toBe(`今天 ${hour} 点的日常货架会出现 ${level} 级稀有食材吗`);
    expect(dr.closeAt).toEqual(new Date(gameTime(DAY, hour).getTime() - 5 * 60_000));
    expect(dr.resolveAt).toEqual(gameTime(DAY, hour));
    expect(dr.closeAt.getTime() - at0.getTime()).toBeGreaterThanOrEqual(3_600_000);
    expect(dr.p0).toBeGreaterThanOrEqual(0.05);
    expect(dr.p0).toBeLessThanOrEqual(0.95);
  });

  it('判定：货架还没生成返回 null；只看系统进货，不看玩家手动进的货（Review Focus 4、5）', async () => {
    const shardId = await createShard(t.db);
    const period = slotKey(DAY, 12);
    const params = { hour: 12, level: 2, period };
    expect(await market.resolve(await rctx(shardId), params)).toBeNull();
    const rare2 = [...t.deps.config.foods.values()].find((f) => f.level === 2 && f.odds < 100 && f.odds > 0)!;
    const common1 = [...t.deps.config.foods.values()].find((f) => f.level === 1 && f.odds >= 100)!;
    const owner = await newRestaurant(t, { shardId });
    const row = (foodsId: number, owner_rest_id: number | null) => ({
      shard_id: shardId,
      shelf: 0,
      period,
      foods_id: foodsId,
      stock: 10,
      opened_at: gameTime(DAY, 12),
      owner_rest_id,
    });
    await t.db.insertInto('market_item').values([row(common1.id, null), row(rare2.id, owner.restaurantId)]).execute();
    const no = (await market.resolve(await rctx(shardId), params))!;
    expect(no).toEqual({ outcome: false, note: '12 点日常货架没有 2 级稀有食材' });
    await t.db.insertInto('market_item').values(row(rare2.id, null)).execute();
    const yes = (await market.resolve(await rctx(shardId), params))!;
    expect(yes).toEqual({ outcome: true, note: `12 点日常货架上了 2 级稀有食材：${rare2.name}` });
  });
});

describe('天气（238-2 设计 §4.4）', () => {
  it('出题：时段在出题 3 小时之后，截止在整点前 5 分钟，时段结束后判定', async () => {
    const shardId = await createShard(t.db);
    const dr = (await weather.create(await ctx(shardId)))!;
    const { hour, type } = dr.params as { hour: number; type: number };
    expect(gameTime(DAY, hour).getTime() - at0.getTime()).toBeGreaterThanOrEqual(3 * 3_600_000);
    expect(dr.closeAt).toEqual(new Date(gameTime(DAY, hour).getTime() - 5 * 60_000));
    expect(dr.resolveAt).toEqual(new Date(gameTime(DAY, hour).getTime() + 2 * 3_600_000));
    expect([1, 2, 3, 4]).toContain(type);
    expect(dr.description).toContain('雷神锤');
  });

  it('判定：按自动轮换判；雷神锤改过时判定依据写明（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const hour = 15;
    const period = slotKey(DAY, hour);
    const slot = { key: period, day: DAY, hour, start: gameTime(DAY, hour) };
    const { to } = await t.game.world.changeWeather(shardId, slot, gameTime(DAY, hour));
    const auto = t.deps.config.weather.get(to)!;
    const r = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r.outcome).toBe(true);
    expect(r.note).toBe(`${hour} 点自动轮换的天气是${auto.name}（${['', '晴', '雨', '雪', '风沙雾霾'][auto.type]}类）`);
    const other = [...t.deps.config.weather.values()].find((x) => !x.special && x.type !== auto.type)!;
    await t.db
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'weather.change',
        params: JSON.stringify({ from: to, to: other.id, by: 1 }),
        created_at: new Date(gameTime(DAY, hour).getTime() + 600_000),
      })
      .execute();
    const r2 = (await weather.resolve(await rctx(shardId), { hour, type: auto.type, period }))!;
    expect(r2.outcome).toBe(true);
    expect(r2.note).toBe(`${r.note}；之后有人用雷神锤改成了${other.name}，按题目规则不算`);
  });
});

describe('全服数据（238-2 设计 §4.5）', () => {
  it('出题：营业银币和活跃店数隔天轮换，概率 50%，当天 18 点截止，明天 0:10 判定', async () => {
    const shardId = await createShard(t.db);
    const dr = (await stats.create(await ctx(shardId)))!;
    expect(dr.p0).toBe(0.5);
    expect(dr.closeAt).toEqual(gameTime(DAY, 18));
    expect(dr.resolveAt).toEqual(gameTime(addDays(DAY, 1), 0, 10));
    const odd = Number(DAY.slice(8)) % 2 === 1;
    expect(dr.title).toBe(odd ? '今天全服营业银币会超过昨天吗' : '今天全服活跃店数会超过昨天吗');
  });

  it('判定：今天严格大于昨天才算"是"', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const income = (day: string, coin: number) =>
      t.db
        .insertInto('income_round')
        .values({
          rest_id: r.restaurantId,
          round_no: 1,
          coin,
          exp: 0,
          oil: 0,
          customers: JSON.stringify([]),
          rates: JSON.stringify({}),
          drops: JSON.stringify([]),
          created_at: gameTime(day, 12),
        })
        .execute();
    await income(addDays(DAY, -1), 1000);
    await income(DAY, 1000);
    const tie = (await stats.resolve(await rctx(shardId), { day: DAY, metric: 'coin' }))!;
    expect(tie).toEqual({ outcome: false, note: '今天 1,000，昨天 1,000' });
    await income(DAY, 1);
    expect((await stats.resolve(await rctx(shardId), { day: DAY, metric: 'coin' }))!.outcome).toBe(true);
  });
});
```

（`income_round` 的 jsonb 列和 `market_item`、`news` 的列名以 `schema.ts` 为准；如果某列类型不同，按 schema 调整插入值，不改断言。`gameDay` 未使用时从 import 去掉。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict/auto/kinds.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现五个文件**

`krab.ts`：

```ts
import { addDays, gameTime, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { featureAvailable } from '../../../core/features';
import { rollKrabStreet } from '../../world/rules';
import type { AutoKind } from './types';

const SPAN = 6;

/** 明天蟹老板在哪（238-2 设计 §4.1）：以明天 krabHour 按种子刷新的街为准 */
export const krab: AutoKind = {
  kind: 'krab',
  async create(c) {
    if (!featureAvailable(c.settings, 'world')) return null;
    const w = c.settings.tuning.world;
    const total = w.krabStreetMax - w.krabStreetMin + 1;
    if (total <= SPAN) return null;
    const from = w.krabStreetMin + c.rng.int(total - SPAN + 1);
    const to = from + SPAN - 1;
    const tomorrow = addDays(c.day, 1);
    return {
      title: `明天蟹老板会在 ${from}~${to} 号街出现吗`,
      description: `以明天 ${w.krabHour} 点系统刷新的位置为准，之后被驱赶改变的不算。`,
      p0: SPAN / total,
      closeAt: gameTime(c.day, 23, 50),
      resolveAt: gameTime(tomorrow, w.krabHour),
      params: { day: tomorrow, from, to },
    };
  },
  async resolve(c, p) {
    const w = c.settings.tuning.world;
    const day = String(p.day);
    const street = rollKrabStreet(w, seededRng(gameSeed(c.shardId, 'krab', slotKey(day, w.krabHour))));
    return {
      outcome: street >= Number(p.from) && street <= Number(p.to),
      note: `明天 ${w.krabHour} 点蟹老板刷新在 ${street} 号街`,
    };
  },
};
```

`hiphop.ts`：

```ts
import { addDays, gameTime, HIPHOP_PLACE_NAMES, type HiphopPlace } from '@dt/shared';
import { featureAvailable } from '../../../core/features';
import { clampP } from './odds';
import type { AutoKind } from './types';

const placeName = (p: number) => HIPHOP_PLACE_NAMES[p as HiphopPlace] ?? `地点 ${p}`;

/** 明天嘻哈男孩在哪（238-2 设计 §4.2）：读明天生成的地点记录 */
export const hiphop: AutoKind = {
  kind: 'hiphop',
  async create(c) {
    if (!featureAvailable(c.settings, 'hiphop')) return null;
    const t = c.settings.tuning.hiphop;
    const total = t.placeWeights.reduce((s, [, x]) => s + x, 0);
    if (total <= 0) return null;
    let r = c.rng.next() * total;
    let pick = t.placeWeights[0]!;
    for (const pw of t.placeWeights) {
      if (r < pw[1]) {
        pick = pw;
        break;
      }
      r -= pw[1];
    }
    const [place, weight] = pick;
    const tomorrow = addDays(c.day, 1);
    return {
      title: place === 9 ? '明天嘻哈男孩会去某家玩家餐厅吗' : `明天嘻哈男孩会出现在${placeName(place)}吗`,
      description: `以明天 ${t.hour} 点嘻哈男孩出现的地点为准。`,
      p0: clampP(weight / total),
      closeAt: gameTime(c.day, 23, 50),
      resolveAt: gameTime(tomorrow, t.hour),
      params: { day: tomorrow, place },
    };
  },
  async resolve(c, p) {
    const row = await c.d.db
      .selectFrom('hiphop_day')
      .select('place')
      .where('shard_id', '=', c.shardId)
      .where('day', '=', String(p.day))
      .executeTakeFirst();
    if (!row) return null;
    return { outcome: row.place === Number(p.place), note: `明天嘻哈男孩出现在${placeName(row.place)}` };
  },
};
```

（测试里 `p0` 用未夹的权重占比比较；现有权重 7/67~10/67 都在 5%~95% 内，夹不夹结果相同。）

`market.ts`：

```ts
import { gameTime, seededRng, slotKey } from '@dt/shared';
import { featureAvailable } from '../../../core/features';
import { clampP, marketRareChance } from './odds';
import type { AutoKind } from './types';

const SIMS = 2000;

/** 今天某个整点日常货架会不会出稀有食材（238-2 设计 §4.3）：读系统进货（不看玩家手动进的货） */
export const market: AutoKind = {
  kind: 'market',
  async create(c) {
    if (!featureAvailable(c.settings, 'market')) return null;
    const mt = c.settings.tuning.market;
    const closeMin = c.settings.tuning.predict.auto.marketCloseMin;
    const hours = mt.dailyHours.filter(
      (h) => gameTime(c.day, h).getTime() - closeMin * 60_000 >= c.now.getTime() + 3_600_000,
    );
    if (hours.length === 0) return null;
    const hour = hours[c.rng.int(hours.length)]!;
    const sim = seededRng(c.rng.int(2 ** 31));
    const odds = [1, 2].map((level) => ({ level, p: marketRareChance(c.d.config, mt, hour, level, SIMS, sim) }));
    const best = odds.sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5))[0]!;
    return {
      title: `今天 ${hour} 点的日常货架会出现 ${best.level} 级稀有食材吗`,
      description: `以 ${hour} 点系统进货的日常货架为准，玩家手动进的货不算。`,
      p0: clampP(best.p),
      closeAt: new Date(gameTime(c.day, hour).getTime() - closeMin * 60_000),
      resolveAt: gameTime(c.day, hour),
      params: { hour, level: best.level, period: slotKey(c.day, hour) },
    };
  },
  async resolve(c, p) {
    const rows = await c.d.db
      .selectFrom('market_item')
      .select('foods_id')
      .where('shard_id', '=', c.shardId)
      .where('shelf', '=', 0)
      .where('period', '=', String(p.period))
      .where('owner_rest_id', 'is', null)
      .execute();
    if (rows.length === 0) return null;
    const level = Number(p.level);
    const rare = rows
      .map((r) => c.d.config.requireFood(r.foods_id))
      .filter((f) => f.level === level && f.odds < 100);
    const hour = Number(p.hour);
    return rare.length > 0
      ? { outcome: true, note: `${hour} 点日常货架上了 ${level} 级稀有食材：${rare.map((f) => f.name).join('、')}` }
      : { outcome: false, note: `${hour} 点日常货架没有 ${level} 级稀有食材` };
  },
};
```

`weather.ts`：

```ts
import { gameTime, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { featureAvailable } from '../../../core/features';
import { rollWeather } from '../../world/rules';
import { WEATHER_TYPE_NAMES, weatherTypeShares } from './odds';
import type { AutoKind } from './types';

const SLOT_MS = 2 * 3_600_000;

/** 今天某个时段自动轮换的天气是不是某类（238-2 设计 §4.4）：按种子重算，雷神锤改的不算但写进判定依据 */
export const weather: AutoKind = {
  kind: 'weather',
  async create(c) {
    if (!featureAvailable(c.settings, 'world')) return null;
    const w = c.settings.tuning.world;
    const hours = w.weatherHours.filter((h) => gameTime(c.day, h).getTime() >= c.now.getTime() + 3 * 3_600_000);
    if (hours.length === 0) return null;
    const hour = hours[c.rng.int(hours.length)]!;
    const shares = [...weatherTypeShares(c.d.config, w, hour)];
    const mid = shares.filter(([, s]) => s >= 0.15 && s <= 0.85);
    const [type, p] =
      mid.length > 0
        ? mid[c.rng.int(mid.length)]!
        : shares.sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5))[0]!;
    const start = gameTime(c.day, hour);
    return {
      title: `今天 ${hour} 点自动轮换的天气是${WEATHER_TYPE_NAMES[type]}类吗`,
      description: `以 ${hour} 点系统自动轮换出的天气为准，之后有人用雷神锤改的不算。`,
      p0: Math.min(0.95, Math.max(0.05, p)),
      closeAt: new Date(start.getTime() - 5 * 60_000),
      resolveAt: new Date(start.getTime() + SLOT_MS),
      params: { hour, type, period: slotKey(c.day, hour) },
    };
  },
  async resolve(c, p) {
    const hour = Number(p.hour);
    const period = String(p.period);
    const auto = rollWeather(c.d.config, hour, c.settings.tuning.world, seededRng(gameSeed(c.shardId, 'weather', period)));
    const typeName = WEATHER_TYPE_NAMES[auto.type] ?? String(auto.type);
    let note = `${hour} 点自动轮换的天气是${auto.name}（${typeName}类）`;
    const day = period.split('@')[0]!;
    const start = gameTime(day, hour);
    const hammer = await c.d.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', c.shardId)
      .where('type', '=', 'weather.change')
      .where('created_at', '>=', start)
      .where('created_at', '<', new Date(start.getTime() + SLOT_MS))
      .where(sql<boolean>`params ? 'by'`)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (hammer) {
      const to = c.d.config.weather.get(Number((hammer.params as { to?: number }).to));
      if (to) note += `；之后有人用雷神锤改成了${to.name}，按题目规则不算`;
    }
    return { outcome: auto.type === Number(p.type), note };
  },
};
```

（文件顶部补 `import { sql } from 'kysely';`。`slotKey` 的格式是 `日期@两位小时`，执行时先看 `packages/shared/src/time.ts` 确认分隔符；若不同，用 `params.day` 另存日期，不靠拆 `period`。）

`stats.ts`：

```ts
import { addDays, gameTime } from '@dt/shared';
import { aggregateDay } from '../../admin/stats';
import type { AutoKind } from './types';

const METRIC = {
  coin: { title: '今天全服营业银币会超过昨天吗', kind: 'coin', source: 'settlement' },
  active: { title: '今天全服活跃店数会超过昨天吗', kind: 'active', source: 'rest' },
} as const;
type Metric = keyof typeof METRIC;

const valueOf = async (c: Parameters<AutoKind['resolve']>[0], day: string, m: Metric) =>
  (await aggregateDay(c.d.db, c.shardId, day))
    .filter((r) => r.kind === METRIC[m].kind && r.source === METRIC[m].source)
    .reduce((s, r) => s + r.amount, 0);

/** 今天全服营业银币 / 活跃店数会不会超过昨天（238-2 设计 §4.5）：单数日问银币，双数日问店数 */
export const stats: AutoKind = {
  kind: 'stats',
  async create(c) {
    const metric: Metric = Number(c.day.slice(8)) % 2 === 1 ? 'coin' : 'active';
    const close = c.settings.tuning.predict.auto.statsCloseHour;
    return {
      title: METRIC[metric].title,
      description: `以今天全天的统计为准，明天 0 点后判定；严格多于昨天才算"是"。${close} 点截止交易。`,
      p0: 0.5,
      closeAt: gameTime(c.day, close),
      resolveAt: gameTime(addDays(c.day, 1), 0, 10),
      params: { day: c.day, metric },
    };
  },
  async resolve(c, p) {
    const day = String(p.day);
    const m = p.metric as Metric;
    const today = await valueOf(c, day, m);
    const yesterday = await valueOf(c, addDays(day, -1), m);
    const f = (n: number) => n.toLocaleString('en-US');
    return { outcome: today > yesterday, note: `今天 ${f(today)}，昨天 ${f(yesterday)}` };
  },
};
```

（出题时间若已过 `statsCloseHour`，截止时间早于现在，出题任务会跳过它：`createAutoEvents` 里 `dr.closeAt <= now` 就不出。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/predict/auto && pnpm -F @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/predict/auto
git commit -m "feat: 自动出题五类题目的出题和判定（238-2）"
```

---

### Task 4: 出题、判定任务

**Files:**
- Create: `apps/server/src/modules/predict/auto/index.ts`
- Modify: `apps/server/src/modules/predict/jobs.ts`（`predictJobs` 加两个任务）
- Test: `apps/server/src/modules/predict/auto/jobs.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `finalizeEvent`；Task 3 的五个 `AutoKind`；`initialShares`。
- Produces:
  - `createAutoEvents(d: GameDeps, shardId: number, now: Date, rng?: Rng): Promise<{ created: string[] }>`
  - `resolveAutoEvents(d: GameDeps, shardId: number, now: Date): Promise<{ resolved: number; voided: number }>`
  - 任务 `predict-auto-create`（feature `predict`，周期键 = 游戏日）、`predict-auto-resolve`（feature `restaurant`，每分钟）

- [ ] **Step 1: 写失败的测试**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../../test/game';
import { setTuning } from '../../../../test/town';
import { createAutoEvents, resolveAutoEvents } from './index';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const DAY = '2026-11-03';
const at0 = gameTime(DAY, 0, 5);
const events = (shardId: number) =>
  t.db.selectFrom('predict_event').selectAll().where('shard_id', '=', shardId).orderBy('id').execute();

describe('出题任务（238-2 设计 §5.2）', () => {
  it('每类一题，auto_key 为 <开关>:D；重跑不重复出题（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const first = await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    expect(first.created.sort()).toEqual(['krab', 'market', 'stats', 'weather']);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(2));
    const rows = await events(shardId);
    expect(rows.map((r) => r.auto_key).sort()).toEqual([
      `krab:${DAY}`,
      `market:${DAY}`,
      `stats:${DAY}`,
      `weather:${DAY}`,
    ]);
    expect(rows.every((r) => r.created_by === null && r.b === 100 && r.status === 'open')).toBe(true);
    // 2026-11-03 是单数日：出蟹老板题
    expect(rows.find((r) => r.auto_key === `krab:${DAY}`)!.kind).toBe('krab');
  });

  it('双数日出嘻哈男孩；关掉嘻哈男孩功能时改出蟹老板；关掉开关不出这一类', async () => {
    const even = '2026-11-04';
    const s1 = await createShard(t.db);
    await createAutoEvents(t.game.deps, s1, gameTime(even, 0, 5), seededRng(1));
    expect((await events(s1)).find((r) => r.auto_key === `krab:${even}`)!.kind).toBe('hiphop');
    const s2 = await createShard(t.db);
    await setTuning(t, s2, { predict: { auto: { market: false, weather: false } } });
    await t.db
      .updateTable('shard_config')
      .set({ override: JSON.stringify({ features: { hiphop: false }, tuning: { predict: { auto: { market: false, weather: false } } } }) })
      .where('shard_id', '=', s2)
      .execute();
    t.game.shards.invalidate(s2);
    const r = await createAutoEvents(t.game.deps, s2, gameTime(even, 0, 5), seededRng(1));
    expect(r.created.sort()).toEqual(['krab', 'stats']);
  });
});

describe('判定任务（238-2 设计 §5.3）', () => {
  it('到判定时间写结果和判定依据；没到的不动', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const stats = (await events(shardId)).find((r) => r.kind === 'stats')!;
    expect(await resolveAutoEvents(t.game.deps, shardId, new Date(stats.resolve_at!.getTime() - 1))).toEqual({
      resolved: 0,
      voided: 0,
    });
    const res = await resolveAutoEvents(t.game.deps, shardId, stats.resolve_at!);
    expect(res.resolved).toBeGreaterThanOrEqual(1);
    const after = (await events(shardId)).find((r) => r.id === stats.id)!;
    expect(after).toMatchObject({ status: 'resolved', outcome: false });
    expect(after.result_note).toBe('今天 0，昨天 0');
  });

  it('已手动判定或作废的不覆盖（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const stats = (await events(shardId)).find((r) => r.kind === 'stats')!;
    await t.db
      .updateTable('predict_event')
      .set({ status: 'resolved', outcome: true, resolved_at: at0 })
      .where('id', '=', stats.id)
      .execute();
    await resolveAutoEvents(t.game.deps, shardId, stats.resolve_at!);
    const after = (await events(shardId)).find((r) => r.id === stats.id)!;
    expect(after).toMatchObject({ outcome: true, result_note: null });
  });

  it('过了判定时间 24 小时还判不了：自动作废，判定依据写数据缺失', async () => {
    const shardId = await createShard(t.db);
    await createAutoEvents(t.game.deps, shardId, at0, seededRng(1));
    const m = (await events(shardId)).find((r) => r.kind === 'market')!;
    const late = new Date(m.resolve_at!.getTime() + 24 * 3_600_000);
    const res = await resolveAutoEvents(t.game.deps, shardId, late);
    expect(res.voided).toBeGreaterThanOrEqual(1);
    const after = (await events(shardId)).find((r) => r.id === m.id)!;
    expect(after).toMatchObject({ status: 'void', result_note: '数据缺失，自动作废', void_ratio: 1 });
  });
});
```

（第二个用例里 `setTuning` 之后再覆盖整行 override 是为了同时写 features；可以只保留后一次写入，删掉 `setTuning` 那行。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/predict/auto/jobs.test.ts`
Expected: FAIL（`./index` 不存在）。

- [ ] **Step 3: 实现 `auto/index.ts`**

```ts
import { gameDay, initialShares, type Rng } from '@dt/shared';
import type { GameDeps } from '../../../core/deps';
import { featureAvailable } from '../../../core/features';
import { finalizeEvent } from '../finalize';
import { hiphop } from './hiphop';
import { krab } from './krab';
import { market } from './market';
import { stats } from './stats';
import type { AutoKind } from './types';
import { weather } from './weather';

const KINDS: Record<AutoKind['kind'], AutoKind> = { krab, hiphop, market, weather, stats };
const GIVE_UP_MS = 24 * 3_600_000;

/** 出当天的自动题（238-2 设计 §5.2）：每类一题，auto_key 唯一，重跑不重复 */
export async function createAutoEvents(
  d: GameDeps,
  shardId: number,
  now: Date,
  rng: Rng = d.rng(),
): Promise<{ created: string[] }> {
  const settings = await d.shards.settings(shardId);
  const t = settings.tuning.predict;
  const day = gameDay(now);
  const plan: Array<[string, AutoKind]> = [];
  if (t.auto.krab) {
    const odd = Number(day.slice(8)) % 2 === 1;
    plan.push(['krab', odd || !featureAvailable(settings, 'hiphop') ? krab : hiphop]);
  }
  if (t.auto.market) plan.push(['market', market]);
  if (t.auto.weather) plan.push(['weather', weather]);
  if (t.auto.stats) plan.push(['stats', stats]);
  const created: string[] = [];
  for (const [flag, k] of plan) {
    const autoKey = `${flag}:${day}`;
    const exists = await d.db
      .selectFrom('predict_event')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('auto_key', '=', autoKey)
      .executeTakeFirst();
    if (exists) continue;
    const dr = await k.create({ d, shardId, settings, now, day, rng });
    if (!dr || dr.closeAt <= now) continue;
    const s = initialShares(dr.p0, t.auto.b);
    const r = await d.db
      .insertInto('predict_event')
      .values({
        shard_id: shardId,
        kind: k.kind,
        title: dr.title,
        description: dr.description,
        params: JSON.stringify(dr.params),
        b: t.auto.b,
        unit: t.unit,
        q_yes: s.y,
        q_no: s.n,
        p0: dr.p0,
        open_at: now,
        close_at: dr.closeAt,
        status: 'open',
        auto_key: autoKey,
        resolve_at: dr.resolveAt,
      })
      .onConflict((oc) => oc.columns(['shard_id', 'auto_key']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (r) created.push(flag);
  }
  return { created };
}

/** 判定到时间的自动题（238-2 设计 §5.3）：判出来写结果和依据；过 24 小时判不了就作废 */
export async function resolveAutoEvents(
  d: GameDeps,
  shardId: number,
  now: Date,
): Promise<{ resolved: number; voided: number }> {
  const due = await d.db
    .selectFrom('predict_event')
    .select(['id', 'kind', 'params', 'resolve_at'])
    .where('shard_id', '=', shardId)
    .where('auto_key', 'is not', null)
    .where('status', 'in', ['open', 'closed'])
    .where('resolve_at', '<=', now)
    .orderBy('id')
    .execute();
  if (due.length === 0) return { resolved: 0, voided: 0 };
  const settings = await d.shards.settings(shardId);
  let resolved = 0;
  let voided = 0;
  for (const e of due) {
    const k = KINDS[e.kind as AutoKind['kind']];
    if (!k) continue;
    const r = await k.resolve({ d, shardId, settings }, e.params);
    if (r) {
      const done = await d.db
        .transaction()
        .execute((tx) => finalizeEvent(tx, e.id, { status: 'resolved', outcome: r.outcome, note: r.note }, now));
      if (done) resolved++;
    } else if (now.getTime() - e.resolve_at!.getTime() >= GIVE_UP_MS) {
      const done = await d.db
        .transaction()
        .execute((tx) => finalizeEvent(tx, e.id, { status: 'void', outcome: null, note: '数据缺失，自动作废' }, now));
      if (done) voided++;
    }
  }
  return { resolved, voided };
}
```

（出题前先查 `auto_key` 是否已存在，免得重跑时白跑 2,000 次模拟；唯一索引兜底并发。）

`jobs.ts` 的 `predictJobs` 加：

```ts
    {
      name: 'predict-auto-create',
      feature: 'predict',
      period: (now) => gameDay(now),
      run: ({ shardId, now }) => createAutoEvents(d, shardId, now),
    },
    {
      name: 'predict-auto-resolve',
      feature: 'restaurant',
      period: minute,
      run: ({ shardId, now }) => resolveAutoEvents(d, shardId, now),
    },
```

（import `gameDay` 和 `createAutoEvents, resolveAutoEvents`。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/predict && pnpm -F @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/predict
git commit -m "feat: 事件合约自动出题和自动判定任务（238-2）"
```

---

### Task 5: 前端显示"系统出题"和判定依据

**Files:**
- Modify: `apps/web/src/views/PredictView.vue`、`apps/web/src/views/PredictView.test.ts`
- Modify: `apps/web/src/views/admin/AdminPredictView.vue`、`apps/web/src/views/admin/AdminPredictView.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `auto`、`resultNote`。
- Produces: testid `pd-auto-<id>`（列表里的"系统出题"标记）、`pd-note`（详情判定依据）、`pd-ended-note-<id>`、`apd-note-<id>`。

- [ ] **Step 1: 写失败的测试**

`PredictView.test.ts`：`ev()` 夹具加 `auto: false, resultNote: null`。加用例：

```ts
  it('系统出题标记；已结束的事件显示判定依据（238-2）', async () => {
    vi.mocked(endpoints.predictList).mockResolvedValue(
      list({
        events: [
          ev({ auto: true }),
          ev({ id: 2, title: '15 点是雨类吗', status: 'resolved', outcome: false, auto: true, resultNote: '15 点自动轮换的天气是晴（晴类）', payout: 0 }),
        ],
      }),
    );
    vi.mocked(endpoints.predictDetail).mockResolvedValue({
      ...detail,
      event: { ...detail.event, id: 2, status: 'resolved', outcome: false, auto: true, resultNote: '15 点自动轮换的天气是晴（晴类）', payout: 0 },
    });
    const w = mount(PredictView);
    await flushPromises();
    expect(w.get('[data-testid="pd-auto-1"]').text()).toContain('系统出题');
    expect(w.get('[data-testid="pd-ended-note-2"]').text()).toContain('判定依据：15 点自动轮换的天气是晴');
    await w.get('[data-testid="pd-ended-2"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="pd-note"]').text()).toContain('判定依据：15 点自动轮换的天气是晴（晴类）');
  });
```

`AdminPredictView.test.ts`：`row` 夹具加 `auto: false, resultNote: null`；加用例：

```ts
  it('系统出的题出题人显示"系统"，显示判定依据', async () => {
    vi.mocked(adminApi.predictList).mockResolvedValue([
      { ...row, auto: true, creator: null, status: 'resolved', outcome: true, resultNote: '明天 9 点蟹老板刷新在 7 号街' },
    ]);
    const w = await mountAs('mod');
    const t = w.get('[data-testid="apd-row-7"]').text();
    expect(t).toContain('系统');
    expect(w.get('[data-testid="apd-note-7"]').text()).toContain('明天 9 点蟹老板刷新在 7 号街');
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/views/PredictView.test.ts apps/web/src/views/admin/AdminPredictView.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`PredictView.vue`：

- 进行中列表的标题后加 `<span v-if="e.auto" class="badge text-bg-light ms-1" :data-testid="`pd-auto-${e.id}`">系统出题</span>`；
- 已结束列表每行末尾加 `<div v-if="e.resultNote" class="text-muted" :data-testid="`pd-ended-note-${e.id}`">判定依据：{{ e.resultNote }}</div>`；
- 详情的说明下面加 `<div v-if="detail.event.resultNote" class="small text-muted" data-testid="pd-note">判定依据：{{ detail.event.resultNote }}</div>`；详情标题旁同样加"系统出题"标记（不带 testid）。

`AdminPredictView.vue`：

- 出题人显示改为 `{{ r.auto ? '系统' : (r.creator ?? '?') }}`；
- 状态那一格下面加 `<div v-if="r.resultNote" class="text-muted" :data-testid="`apd-note-${r.id}`">{{ r.resultNote }}</div>`。

- [ ] **Step 4: 运行，确认通过；前端全部测试、类型检查**

Run: `pnpm vitest run apps/web && pnpm -F @dt/web typecheck`
Expected: PASS（其他测试夹具缺 `auto`/`resultNote` 时补上）。

- [ ] **Step 5: 全量测试、lint**

Run: `pnpm vitest run > "$TEMP/auto-full.log" 2>&1; grep -E "Test Files|      Tests" "$TEMP/auto-full.log"; pnpm lint; pnpm typecheck`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add apps/web
git commit -m "feat: 预测页显示系统出题和判定依据（238-2）"
```
