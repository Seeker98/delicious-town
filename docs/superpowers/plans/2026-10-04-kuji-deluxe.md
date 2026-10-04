# 豪华一番赏 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在普通一番赏旁边加一条“豪华”奖池线：每池 20 张、每张 30 万银币，A 赏和最后赏发按月轮换的限定称号并全服广播。

**Architecture:** 奖池表加一列 `line`（`normal` / `deluxe`），开池、编号、过期、限购都按线分开；区服数值在 `tuning.kuji` 下加 `deluxe` 一组，结构和普通池的价格、限购、档位、最后赏相同；服务端的看板、买券、抽签接口多一个可选参数 `line`，不传就是普通池。豪华池开池时按 `kuji.json` 的 `deluxeMonths` 把当月称号换进 A 赏和最后赏，再存进奖池快照。

**Tech Stack:** TypeScript、zod、Kysely（Postgres）、Fastify、Vue 3、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-04-kuji-deluxe-design.md`

## Global Constraints

- 回复、提交、PR 描述用中文；提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`，PR 描述末尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
- 新加 tuning 字段必须在 `packages/config/data/game/setting_docs.json` 写说明；改了 `packages/config` 先 `pnpm -F @dt/config build`。
- 不传 `line` 时，所有接口和普通池的行为与现在完全一样（现有测试一条都不改断言）。
- 默认值：`deluxe.price` 300000、`dailyBuy` 10、`maxDraw` 10、`maxPools` 3；档位 A×1（`kuji_dx_a` + 钻石 50，broadcast）、B×2（银币 300000，news）、C×5（银币 100000）、D×12（银币 50000）；最后赏 `kuji_dx_last` + 钻石 50（broadcast）。
- 豪华签券道具 id 90202；称号 `kuji_dx_a`、`kuji_dx_last`、`kuji_dx_2610_a`“金秋鸿运”、`kuji_dx_2610_last`“金秋压轴”、`kuji_dx_2611_a`“初冬鸿运”、`kuji_dx_2611_last`“初冬压轴”。
- 文案写简中、英、法、西；繁中用 `apps/web` 下 `pnpm i18n:tw` 生成，配置数据的繁中自动生成。
- 不涉及菜园。`问题记录.md` 不碰；e2e 临时脚本不提交。

## Review Focus

1. 同一天普通池和豪华池同时存在：开池编号、过期、`maxPools` 互不影响（豪华开满 3 池不挡普通池开池）。
2. 用普通券抽豪华池、用豪华券抽普通池：都报“券不够”，什么都不扣。
3. 买豪华券的每日限购和普通券分开计数：普通券买满 10 张后仍能买豪华券。
4. 豪华池跨月：9 月 30 日开的池在 10 月 1 日作废；10 月 1 日新开的池发十月称号；没有配置的月份发固定称号 `kuji_dx_a`、`kuji_dx_last`。
5. 看板“最近的大赏”分线：豪华池的看板只列豪华的大赏，普通池只列普通的（旧新闻没有 `line`，算普通）。

---

## 文件结构

- 配置：`packages/config/src/tuning.ts`（`kuji.deluxe` schema）、`packages/config/src/kuji.ts`（`kujiErrors` 顺带查豪华）、`packages/config/src/raw.ts`（`kujiFile` 加 `deluxeTicket`、`deluxeMonths`）、`packages/config/src/build.ts`（生成豪华签券道具、校验 `deluxeMonths`、写进 bundle）、`packages/config/src/types.ts`、`packages/config/src/ids.ts`（`GOODS.kujiDeluxeTicket`）；数据 `tuning.json`、`setting_docs.json`、`kuji.json`、`looks.json`、`i18n/{en,fr,es}/icons.json`、`i18n/{en,fr,es}/goods.json`。
- 数据库：新建 `apps/server/src/db/migrations/0044_kuji_line.ts`、`0044.test.ts`，登记到 `index.ts`；`db/schema.ts` 的 `KujiPoolTable` 加 `line`。
- 服务端：`modules/kuji/pool.ts`（按线开池）、`modules/kuji/service.ts`（按线买券、抽签、看板、称号轮换）、`modules/kuji/routes.ts`；共享 `packages/shared/src/schemas/kuji.ts`（`KujiLine`、请求体和查询参数）。
- 前端：`apps/web/src/api/endpoints.ts`、`apps/web/src/views/KujiView.vue`、`apps/web/src/i18n/locales/*/kuji.ts`、`*/news.ts`。

---

### Task 1: 配置——豪华池数值、豪华签券、轮换称号

**Files:**
- Modify: `packages/config/src/tuning.ts`（`kuji` 段）、`packages/config/src/kuji.ts`、`packages/config/src/raw.ts`（`kujiFile`）、`packages/config/src/build.ts`、`packages/config/src/types.ts`、`packages/config/src/ids.ts`
- Modify: `packages/config/data/game/{tuning,setting_docs,kuji,looks}.json`、`packages/config/data/i18n/{en,fr,es}/{icons,goods}.json`
- Test: `packages/config/src/kuji.test.ts`、`packages/config/src/build.test.ts`

**Interfaces:**
- Produces:
  - `Tuning['kuji']['deluxe']: { price; dailyBuy; maxDraw; maxPools; tiers; last }`（`tiers`、`last` 和普通池同一种类型）
  - `GOODS.kujiDeluxeTicket = 90202`
  - `bundle.kujiDeluxeMonths: Array<{ month: string; icons: Record<string, string> }>`（`month` 形如 `2026-10`）

- [ ] **Step 1: 写失败测试**

`build.test.ts` 末尾加：

```ts
describe('豪华一番赏（240-2）', () => {
  it('真实数据：豪华池 20 张、每张 30 万；豪华签券 90202；十月、十一月的轮换称号', () => {
    const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
    expect(errors).toEqual([]);
    const dx = bundle!.tuning.kuji.deluxe;
    expect(dx).toMatchObject({ price: 300000, dailyBuy: 10, maxDraw: 10, maxPools: 3 });
    expect(dx.tiers.map((x) => [x.key, x.count])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 5],
      ['D', 12],
    ]);
    expect(dx.tiers[0]).toMatchObject({ icon: 'kuji_dx_a', news: 'broadcast' });
    expect(dx.last).toMatchObject({ icon: 'kuji_dx_last', news: 'broadcast' });
    expect(bundle!.goods.find((g) => g.id === 90202)).toMatchObject({ name: '豪华签券', onSale: false });
    expect(bundle!.kujiDeluxeMonths).toEqual([
      { month: '2026-10', icons: { A: 'kuji_dx_2610_a', last: 'kuji_dx_2610_last' } },
      { month: '2026-11', icons: { A: 'kuji_dx_2611_a', last: 'kuji_dx_2611_last' } },
    ]);
  });

  it('deluxeMonths：年月重复、称号不存在、对照的不是豪华档位时报错', () => {
    const src = source();
    const kuji = structuredClone(src['game/kuji']) as { deluxeMonths: Array<Record<string, unknown>> };
    kuji.deluxeMonths.push({ month: '2026-10', icons: { A: 'kuji_dx_2610_a' } });
    kuji.deluxeMonths.push({ month: '2026-12', icons: { A: 'nope' } });
    kuji.deluxeMonths.push({ month: '2027-01', icons: { Z: 'kuji_dx_a' } });
    const { errors } = buildBundle({ ...src, 'game/kuji': kuji });
    expect(errors).toContain('kuji deluxeMonths duplicate month 2026-10');
    expect(errors).toContain('kuji deluxeMonths 2026-12 icon nope not in looks.icons');
    expect(errors).toContain('kuji deluxeMonths 2027-01 key Z is not a deluxe tier');
  });
});
```

`kuji.test.ts` 加（文件里已有调用 `kujiErrors` 的写法，照它构造 `ref`）：

```ts
  it('豪华池的档位、称号也检查，错误写明 deluxe（240-2）', () => {
    const k = structuredClone(config.tuning.kuji);
    k.deluxe.tiers.push({ ...k.deluxe.tiers[0]!, key: 'A' });
    k.deluxe.last = { ...k.deluxe.last, icon: 'nope' };
    const errs = kujiErrors(k, ref);
    expect(errs).toContain('tuning.kuji.deluxe.tiers duplicate key A');
    expect(errs).toContain('tuning.kuji.deluxe.last icon nope not in looks.icons');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --project config packages/config/src/build.test.ts packages/config/src/kuji.test.ts -t "豪华"`
Expected: FAIL（`deluxe` 不存在）

- [ ] **Step 3: schema 和校验**

`tuning.ts`：把 `kuji` 里 `tiers`、`last` 的 schema 提成常量 `kujiTiers`、`kujiLast`（内容不变），`kuji` 末尾加：

```ts
    /** 豪华一番赏（240-2）：一条独立的奖池线，结构和普通池的价格、限购、档位、最后赏相同 */
    deluxe: z.object({
      price: int.min(1),
      dailyBuy: int.min(1),
      maxDraw: int.min(1).max(100),
      maxPools: int.min(1),
      tiers: kujiTiers,
      last: kujiLast,
    }),
```

`kuji.ts`：把现有检查提成内部函数 `lineErrors(prefix, line, ref)`（`prefix` 是 `'tuning.kuji'` 或 `'tuning.kuji.deluxe'`，错误信息里的 `tuning.kuji` 都换成 `${prefix}`），`kujiErrors` 改成：

```ts
export function kujiErrors(k: Tuning['kuji'], ref: KujiRef): string[] {
  return [...lineErrors('tuning.kuji', k, ref), ...lineErrors('tuning.kuji.deluxe', k.deluxe, ref)];
}
```

`raw.ts` 的 `kujiFile` 加：

```ts
    /** 豪华签券（240-2） */
    deluxeTicket: z.object({ id: int.min(1), name: z.string().min(1), desc: z.string().min(1) }).strict(),
    /** 豪华池按月轮换的称号（240-2）：年月 → 档位 key（或 last）→ 称号 */
    deluxeMonths: z.array(
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), icons: z.record(z.string().min(1)) }).strict(),
    ),
```

`build.ts`：
- 照 `kujiTicket` 的写法生成 `kujiDeluxeTicket`（id、name、desc 来自 `kujiRaw.deluxeTicket`），一起放进 `goods` 列表。
- 在 `kujiErrors(...)` 那行之后校验 `kujiRaw.deluxeMonths`：

```ts
  const deluxeKeys = new Set([...tuning.kuji.deluxe.tiers.map((x) => x.key), 'last']);
  const seenMonth = new Set<string>();
  for (const m of kujiRaw.deluxeMonths) {
    if (seenMonth.has(m.month)) errors.push(`kuji deluxeMonths duplicate month ${m.month}`);
    seenMonth.add(m.month);
    for (const [key, icon] of Object.entries(m.icons)) {
      if (!deluxeKeys.has(key)) errors.push(`kuji deluxeMonths ${m.month} key ${key} is not a deluxe tier`);
      if (!iconKeys.has(icon)) errors.push(`kuji deluxeMonths ${m.month} icon ${icon} not in looks.icons`);
    }
  }
```

- bundle 里加 `kujiDeluxeMonths: kujiRaw.deluxeMonths`；`types.ts` 的 bundle 类型加 `kujiDeluxeMonths: Array<{ month: string; icons: Record<string, string> }>`。

`ids.ts` 的 `GOODS` 加 `kujiDeluxeTicket: 90202, // 豪华签券（game/kuji.json，240-2）`。

- [ ] **Step 4: 数据**

- `tuning.json` 的 `kuji` 末尾加：

```json
    "deluxe": {
      "price": 300000,
      "dailyBuy": 10,
      "maxDraw": 10,
      "maxPools": 3,
      "tiers": [
        { "key": "A", "count": 1, "award": { "diamond": 50 }, "icon": "kuji_dx_a", "news": "broadcast" },
        { "key": "B", "count": 2, "award": { "coin": 300000 }, "news": "news" },
        { "key": "C", "count": 5, "award": { "coin": 100000 } },
        { "key": "D", "count": 12, "award": { "coin": 50000 } }
      ],
      "last": { "award": { "diamond": 50 }, "icon": "kuji_dx_last", "news": "broadcast" }
    }
```

- `setting_docs.json` 在 `tuning.kuji.*` 旁边加：`tuning.kuji.deluxe`（“豪华一番赏：一条独立的奖池线，价格、限购、单次上限、每天最多几池、各档和最后赏；A 赏和最后赏的称号按 game/kuji.json 的 deluxeMonths 按月替换”）、`tuning.kuji.deluxe.price`、`dailyBuy`、`maxDraw`、`maxPools`、`tiers`、`last.award.diamond`、`last.icon`、`last.news`，措辞照普通池对应条目，前面加“豪华池：”。
- `kuji.json` 加：

```json
  "deluxeTicket": { "id": 90202, "name": "豪华签券", "desc": "抽豪华一番赏用的签券，在一番赏页切到“豪华”使用。" },
  "deluxeMonths": [
    { "month": "2026-10", "icons": { "A": "kuji_dx_2610_a", "last": "kuji_dx_2610_last" } },
    { "month": "2026-11", "icons": { "A": "kuji_dx_2611_a", "last": "kuji_dx_2611_last" } }
  ]
```

- `looks.json` 的 `icons` 加六个（不带 `shop`）：
  - `kuji_dx_a`“豪华一番赏 A 赏得主”，说明“在豪华一番赏里抽中了 A 赏”
  - `kuji_dx_last`“豪华一番赏最后赏得主”，说明“抽走了豪华一番赏奖池的最后一张签”
  - `kuji_dx_2610_a`“金秋鸿运”，说明“2026 年 10 月豪华一番赏 A 赏得主”
  - `kuji_dx_2610_last`“金秋压轴”，说明“2026 年 10 月豪华一番赏最后赏得主”
  - `kuji_dx_2611_a`“初冬鸿运”，说明“2026 年 11 月豪华一番赏 A 赏得主”
  - `kuji_dx_2611_last`“初冬压轴”，说明“2026 年 11 月豪华一番赏最后赏得主”
- 英、法、西 `icons.json` 加这六个称号的翻译，`goods.json` 加 90202 的名字和说明。

- [ ] **Step 5: 构建并跑测试**

Run: `pnpm -F @dt/config build && npx vitest run --project config`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add packages/config
git commit -m "feat(config): 豪华一番赏的区服数值、豪华签券和按月轮换称号（240-2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（`git add` 前 `git status --short` 确认只有这次的文件。）

---

### Task 2: 迁移 0044——奖池分线

**Files:**
- Create: `apps/server/src/db/migrations/0044_kuji_line.ts`、`apps/server/src/db/migrations/0044.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`（`KujiPoolTable`）

**Interfaces:**
- Produces: `kuji_pool.line: 'normal' | 'deluxe'`（默认 `normal`）；唯一约束 `(shard_id, line, day, seq)`。

- [ ] **Step 1: 写失败测试**

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

const pool = (shardId: number, line: 'normal' | 'deluxe' | undefined, seq: number) => ({
  shard_id: shardId,
  day: '2026-10-04',
  seq,
  status: 'open' as const,
  total: 20,
  created_at: new Date(),
  ...(line ? { line } : {}),
});

describe('迁移 0044：一番赏奖池分线（240-2 豪华一番赏）', () => {
  it('不写 line 的池是 normal；同一天两条线可以各有第 1 池；同一条线不能重号；line 只能是 normal 或 deluxe', async () => {
    const shardId = await createShard(db);
    const a = await db.insertInto('kuji_pool').values(pool(shardId, undefined, 1)).returning('line').executeTakeFirstOrThrow();
    expect(a.line).toBe('normal');
    await db.insertInto('kuji_pool').values(pool(shardId, 'deluxe', 1)).execute();
    await expect(db.insertInto('kuji_pool').values(pool(shardId, 'deluxe', 1)).execute()).rejects.toThrow();
    await expect(
      db.insertInto('kuji_pool').values({ ...pool(shardId, undefined, 2), line: 'gold' as 'normal' }).execute(),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/db/migrations/0044.test.ts`
Expected: FAIL（没有 `line` 列）

- [ ] **Step 3: 迁移、登记、schema 类型**

```ts
import { sql, type Kysely } from 'kysely';

/** 豪华一番赏（240-2）：奖池分线，现有的池都是 normal；编号按线分开 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table kuji_pool add column line text not null default 'normal'
    check (line in ('normal', 'deluxe'))`.execute(db);
  await sql`alter table kuji_pool drop constraint kuji_pool_shard_id_day_seq_key`.execute(db);
  await sql`alter table kuji_pool add constraint kuji_pool_shard_line_day_seq unique (shard_id, line, day, seq)`.execute(db);
  await sql`drop index kuji_pool_open`.execute(db);
  await sql`create index kuji_pool_open on kuji_pool (shard_id, line, status)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from kuji_pool where line = 'deluxe'`.execute(db);
  await sql`drop index kuji_pool_open`.execute(db);
  await sql`create index kuji_pool_open on kuji_pool (shard_id, status)`.execute(db);
  await sql`alter table kuji_pool drop constraint kuji_pool_shard_line_day_seq`.execute(db);
  await sql`alter table kuji_pool add constraint kuji_pool_shard_id_day_seq_key unique (shard_id, day, seq)`.execute(db);
  await sql`alter table kuji_pool drop column line`.execute(db);
}
```

（唯一约束的原名执行前用 `\d kuji_pool` 在开发库确认；不是 `kuji_pool_shard_id_day_seq_key` 时照实际名字改。）

`index.ts` 登记 `'0044_kuji_line': m0044`；`schema.ts` 的 `KujiPoolTable` 加 `line: Default<'normal' | 'deluxe'>;`（`Default` 是文件里已有的列默认值类型）。

- [ ] **Step 4: 跑测试**

Run: `cd apps/server && npx vitest run src/db/migrations/0044.test.ts src/modules/kuji`
Expected: 全部 PASS（普通池现有测试不受影响）

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/db/migrations/0044_kuji_line.ts apps/server/src/db/migrations/0044.test.ts apps/server/src/db/migrations/index.ts apps/server/src/db/schema.ts
git commit -m "feat(db): 迁移 0044——一番赏奖池分线，现有的池都是普通线（240-2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 开池按线分开

**Files:**
- Modify: `apps/server/src/modules/kuji/pool.ts`
- Test: `apps/server/src/modules/kuji/pool.test.ts`

**Interfaces:**
- Consumes: `kuji_pool.line`（Task 2）
- Produces:
  - `export type KujiLine = 'normal' | 'deluxe'`（放在 `packages/shared/src/schemas/kuji.ts`，从 `@dt/shared` 引入）
  - `openPool(tx, shardId, day, seq, tiers, now, last?, theme?, line = 'normal')`
  - `currentPool(tx, shardId, tiers, now, last?, opts: { maxPools?; theme?; clock?; line?: KujiLine })`
  - `latestToday(tx, shardId, day, line: KujiLine = 'normal')`
  - `PoolRow` 加 `line: KujiLine`

- [ ] **Step 1: 写失败测试**

`pool.test.ts` 加（文件里已有 `cur`、`tiers` 等辅助；按现有用例的写法取 `tiers`、`now`）：

```ts
  it('豪华线（240-2）：和普通线各自编号、各自过期、各自的每日上限（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const now = gameTime('2026-10-04', 12);
    const n1 = await cur(t.db, shardId, tiers, now);
    const d1 = await cur(t.db, shardId, tiers, now, undefined, { line: 'deluxe', maxPools: 1 });
    expect([n1.seq, n1.line, d1.seq, d1.line]).toEqual([1, 'normal', 1, 'deluxe']);
    await t.db.updateTable('kuji_pool').set({ status: 'sold_out' }).where('id', '=', d1.id).execute();
    // 豪华线今天开满 1 池：再要豪华池返回空；普通线照常返回自己的池
    expect(await currentPool(t.db, shardId, tiers, now, undefined, { line: 'deluxe', maxPools: 1 })).toBeNull();
    expect((await cur(t.db, shardId, tiers, now)).id).toBe(n1.id);
    // 第二天：两条线昨天的池各自作废
    const d2 = await cur(t.db, shardId, tiers, gameTime('2026-10-05', 1), undefined, { line: 'deluxe' });
    expect([d2.day, d2.seq, d2.line]).toEqual(['2026-10-05', 1, 'deluxe']);
    const old = await t.db.selectFrom('kuji_pool').select(['line', 'status']).where('shard_id', '=', shardId).where('day', '=', '2026-10-04').execute();
    expect(old).toContainEqual({ line: 'normal', status: 'open' }); // 普通线还没人用到第二天，不顺带作废
    expect(old).toContainEqual({ line: 'deluxe', status: 'sold_out' });
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/modules/kuji/pool.test.ts -t "豪华线"`
Expected: FAIL

- [ ] **Step 3: 实现**

- `packages/shared/src/schemas/kuji.ts` 加 `export type KujiLine = 'normal' | 'deluxe';`，`pnpm -F @dt/shared build`。
- `pool.ts`：
  - `COLS` 加 `'line'`；`PoolRow` 加 `line: KujiLine`。
  - `openPool` 末尾加参数 `line: KujiLine = 'normal'`，`values` 里写 `line`，`onConflict` 的列改成 `['shard_id', 'line', 'day', 'seq']`。
  - `currentPool` 的 `opts` 加 `line?: KujiLine`，函数开头 `const line = opts.line ?? 'normal';`：
    - 咨询锁的键：普通线保持 `kuji:${shardId}`，豪华线用 `kuji:${shardId}:deluxe`；
    - 作废过期、查最大编号都加 `.where('line', '=', line)`；
    - `findOpen`、`openPool` 都传 `line`。
  - `findOpen(tx, shardId, day, line)`、`latestToday(tx, shardId, day, line = 'normal')` 都加 `.where('line', '=', line)`。

- [ ] **Step 4: 跑测试**

Run: `cd apps/server && npx vitest run src/modules/kuji`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/schemas/kuji.ts apps/server/src/modules/kuji/pool.ts apps/server/src/modules/kuji/pool.test.ts
git commit -m "feat(server): 一番赏开池、编号、作废按线分开（240-2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 买券、抽签、看板按线，豪华称号按月轮换

**Files:**
- Modify: `apps/server/src/modules/kuji/service.ts`、`apps/server/src/modules/kuji/routes.ts`、`packages/shared/src/schemas/kuji.ts`
- Test: `apps/server/src/modules/kuji/kuji.test.ts`

**Interfaces:**
- Consumes: `KujiLine`、`currentPool(..., { line })`、`latestToday(..., line)`（Task 3）；`GOODS.kujiDeluxeTicket`、`Tuning['kuji']['deluxe']`、`bundle.kujiDeluxeMonths`（Task 1）
- Produces:
  - `svc.view(ctx, line: KujiLine = 'normal')`、`svc.buy(ctx, num, line = 'normal')`、`svc.draw(ctx, num, line = 'normal')`
  - 请求：`kujiBuyBody`、`kujiDrawBody` 加 `line?: KujiLine`；新 `kujiViewQuery = z.object({ line: z.enum(['normal', 'deluxe']).optional() })`
  - `KujiViewDto` 加 `line: KujiLine`
  - 新闻 `kuji.big`、`kuji.win` 的参数：豪华线多一个 `line: 'deluxe'`

- [ ] **Step 1: 写失败测试**

`kuji.test.ts` 加（用文件里的 `svc`、`player`、`coin`、`setTuning`；豪华券 `const DX = GOODS.kujiDeluxeTicket`）：

```ts
describe('豪华一番赏（240-2）', () => {
  const dxPlayer = (shardId: number, o: { coin?: number; tickets?: number } = {}) =>
    newRestaurant(t, {
      shardId,
      patch: { coin: o.coin ?? 10_000_000 },
      goods: o.tickets ? { [GOODS.kujiDeluxeTicket]: o.tickets } : {},
    });

  it('看板：豪华池 20 张、每张 30 万；普通看板不受影响', async () => {
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId);
    const v = await svc().view(r, 'deluxe');
    expect(v).toMatchObject({ line: 'deluxe', price: 300000, buyLeft: 10, maxDraw: 10, theme: null });
    expect(v.pool).toMatchObject({ seq: 1, total: 20, left: 20 });
    expect((await svc().view(r)).pool.total).toBe(80);
  });

  it('买豪华券扣 30 万；限购和普通券分开计（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId);
    await svc().buy(r, 10);
    await svc().buy(r, 2, 'deluxe');
    expect(await coin(r.restaurantId)).toBe(10_000_000 - 200_000 - 600_000);
    expect(await goodsNum(t, r.restaurantId, GOODS.kujiDeluxeTicket)).toBe(2);
    expect((await svc().view(r, 'deluxe')).buyLeft).toBe(8);
  });

  it('普通券不能抽豪华池，豪华券不能抽普通池；什么都不扣（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, goods: { [GOODS.kujiTicket]: 3 } });
    await expect(svc().draw(r, 1, 'deluxe')).rejects.toMatchObject({ params: { reason: 'kuji_ticket' } });
    const s = await dxPlayer(shardId, { tickets: 3 });
    await expect(svc().draw(s, 1)).rejects.toMatchObject({ params: { reason: 'kuji_ticket' } });
    expect(await goodsNum(t, s.restaurantId, GOODS.kujiDeluxeTicket)).toBe(3);
  });

  it('十月开的池发十月称号；抽完一池发最后赏，A 赏和最后赏全服广播且带 line（Review Focus 4、5）', async () => {
    t.clock.set(gameTime('2026-10-15', 12));
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId, { tickets: 20 });
    await svc().draw(r, 10, 'deluxe');
    const res = await svc().draw(r, 10, 'deluxe');
    expect(res.last).not.toBeNull();
    const icons = (await t.db.selectFrom('rest_icon').select('icon_key').where('rest_id', '=', r.restaurantId).execute()).map((x) => x.icon_key);
    expect(icons.sort()).toEqual(['kuji_dx_2610_a', 'kuji_dx_2610_last']);
    const news = await t.db.selectFrom('news').select(['type', 'params']).where('shard_id', '=', shardId).execute();
    expect(news.filter((n) => n.type === 'kuji.big').map((n) => n.params)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: 'A', line: 'deluxe' }),
        expect.objectContaining({ tier: 'last', line: 'deluxe' }),
      ]),
    );
    // 看板“最近的大赏”分线
    expect((await svc().view(r, 'deluxe')).recent.length).toBeGreaterThan(0);
    expect((await svc().view(r)).recent).toEqual([]);
    expect((await svc().view(r, 'deluxe')).pool.seq).toBe(2);
  });

  it('没有配置的月份发固定称号（Review Focus 4）', async () => {
    t.clock.set(gameTime('2027-03-15', 12));
    const shardId = await createShard(t.db);
    const v = await svc().view(await dxPlayer(shardId), 'deluxe');
    expect(v.tiers[0]!.icon).toBe('kuji_dx_a');
    expect(v.last.icon).toBe('kuji_dx_last');
  });
});
```

（每条用例结束后如果别的用例依赖时钟，按文件现有做法在 `afterEach` 里把时钟设回；没有的话在用例开头各自 `t.clock.set`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/modules/kuji/kuji.test.ts -t "豪华"`
Expected: FAIL

- [ ] **Step 3: 实现**

`packages/shared/src/schemas/kuji.ts`：

```ts
const line = z.enum(['normal', 'deluxe']).optional();
export const kujiBuyBody = z.object({ num: z.number().int().min(1).max(100), line });
export const kujiDrawBody = z.object({ num: z.number().int().min(1).max(100), line });
export const kujiViewQuery = z.object({ line });
```

`KujiViewDto` 加 `/** 哪条奖池线（240-2） */ line: KujiLine;`。

`service.ts`：
- 加一个“线的配置”：

```ts
type LineConf = Pick<K, 'price' | 'dailyBuy' | 'maxDraw' | 'maxPools' | 'tiers' | 'last'>;
const conf = (k: K, line: KujiLine): LineConf => (line === 'deluxe' ? k.deluxe : k);
const ticketOf = (line: KujiLine) => (line === 'deluxe' ? GOODS.kujiDeluxeTicket : GOODS.kujiTicket);
const buyKeyOf = (line: KujiLine) => (line === 'deluxe' ? 'kuji.deluxe.buy' : BUY_KEY);
```

- 豪华池的称号轮换（开池时用）：

```ts
  /** 豪华池按月轮换称号（240-2）：当月有对照就替换对应档和最后赏的称号，没有就用区服数值里的 */
  function deluxeThemed(c: LineConf, now: Date): { tiers: K['tiers']; last: K['last'] } {
    const month = gameDay(now).slice(0, 7);
    const m = d.config.bundle.kujiDeluxeMonths.find((x) => x.month === month);
    if (!m) return { tiers: c.tiers, last: c.last };
    return {
      tiers: c.tiers.map((x) => (m.icons[x.key] ? { ...x, icon: m.icons[x.key] } : x)),
      last: m.icons.last ? { ...c.last, icon: m.icons.last } : c.last,
    };
  }
```

- `poolFor(tx, shardId, k, now, line)`：普通线照旧走 `themed`；豪华线 `const p = deluxeThemed(k.deluxe, d.now())`，调 `currentPool(tx, shardId, p.tiers, now, p.last, { maxPools: k.deluxe.maxPools, clock: () => d.now(), line })`（不传 `theme`）。
- `shownPool`、`opView`、`viewOf`、`buy`、`draw` 都加 `line` 参数，里面用 `conf(k, line)` 取价格、限购、单次上限、档位、最后赏；`ticketOf(line)` 取券；`buyKeyOf(line)` 取限购计数键；`latestToday(..., line)`；锁池那段的 `select` 列表加 `'line'`。
- `viewOf` 返回加 `line`；“最近的大赏”查询按线过滤：

```ts
      .where((eb) =>
        line === 'deluxe'
          ? eb(sql`n.params->>'line'`, '=', 'deluxe')
          : eb(sql`n.params->>'line'`, 'is', null),
      )
```

- `prize(o, tier, p, pool)` 写新闻时：`...(pool.line === 'deluxe' ? { line: 'deluxe' } : {})`。
- `restLog(o, 'kuji.buy', ...)`、`restLog(o, 'kuji.draw', ...)` 的参数在豪华线多写 `line: 'deluxe'`。
- 导出的 `view`、`buy`、`draw` 多一个参数 `line: KujiLine = 'normal'`。

`routes.ts`：

```ts
    r.get('/kuji', async (req) => ok(await svc.view(restCtxOf(req), parse(kujiViewQuery, req.query).line)));
    r.post('/kuji/buy', async (req) => {
      const b = parse(kujiBuyBody, req.body);
      return okOp(await svc.buy(restCtxOf(req), b.num, b.line));
    });
    r.post('/kuji/draw', async (req) => {
      const b = parse(kujiDrawBody, req.body);
      return okOp(await svc.draw(restCtxOf(req), b.num, b.line));
    });
```

- [ ] **Step 4: 跑测试**

Run: `cd apps/server && npx tsc --noEmit -p . && npx vitest run src/modules/kuji`
Expected: 全部 PASS（普通池现有用例不改）

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/schemas/kuji.ts apps/server/src/modules/kuji
git commit -m "feat(server): 豪华一番赏——看板、买券、抽签按线，A 赏和最后赏称号按月轮换（240-2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 前端——普通 / 豪华切换、新闻文案

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`、`apps/web/src/views/KujiView.vue`、`apps/web/src/i18n/locales/{zh-CN,en,fr,es}/{kuji,news}.ts`（繁中生成）
- Test: `apps/web/src/views/KujiView.test.ts`、`apps/web/src/utils/news.test.ts`

**Interfaces:**
- Consumes: `KujiViewDto.line`、请求参数 `line`（Task 4）
- Produces: `endpoints.kuji(line?)`、`endpoints.kujiBuy(num, line?)`、`endpoints.kujiDraw(num, line?)`

- [ ] **Step 1: 写失败测试**

`KujiView.test.ts` 现在直接 `mount(KujiView)`，没装路由；页面改用 `useRoute` 后要装。先在文件里加一个挂载辅助，把现有的 `mount(KujiView)` 都换成 `(await mountWithRouter('/kuji')).w`（断言不改）：

```ts
import { createMemoryHistory, createRouter } from 'vue-router';

async function mountWithRouter(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<p/>' } }],
  });
  await router.push(path);
  const w = mount(KujiView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}
```

然后加（`view()` 辅助已有）：

```ts
  it('切到豪华（240-2）：请求带 line=deluxe，网址记下 line；票数写“豪华签券”；没有月度主题', async () => {
    vi.mocked(endpoints.kuji).mockImplementation(async (line) =>
      line === 'deluxe'
        ? view({ line: 'deluxe', pool: { id: 9, day: '2026-10-04', seq: 1, total: 20, left: 20 }, price: 300000, theme: null })
        : view(),
    );
    const { w, router } = await mountWithRouter('/kuji');
    await w.get('[data-testid="kj-line-deluxe"]').trigger('click');
    await flushPromises();
    expect(endpoints.kuji).toHaveBeenLastCalledWith('deluxe');
    expect(router.currentRoute.value.query.line).toBe('deluxe');
    expect(w.get('[data-testid="kj-tickets"]').text()).toContain('豪华签券');
    expect(w.find('[data-testid="kj-theme"]').exists()).toBe(false);
    expect(w.get('[data-testid="kj-pool"]').text()).toContain('20');
  });
```

`news.test.ts` 加：

```ts
  it('豪华一番赏的新闻写“豪华一番赏”（240-2）', () => {
    expect(newsText(n('kuji.big', { tier: 'A', line: 'deluxe' }), names)).toContain('豪华一番赏');
    expect(newsText(n('kuji.win', { tier: 'B', line: 'deluxe' }), names)).toContain('豪华一番赏');
    expect(newsText(n('kuji.big', { tier: 'A' }), names)).not.toContain('豪华');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --project web apps/web/src/views/KujiView.test.ts apps/web/src/utils/news.test.ts -t "豪华"`
Expected: FAIL

- [ ] **Step 3: 实现**

- `endpoints.ts`：

```ts
  kuji: (line?: KujiLine) => api.get<KujiViewDto>(`/api/v1/kuji${line === 'deluxe' ? '?line=deluxe' : ''}`),
  kujiBuy: (num: number, line?: KujiLine) => api.post<KujiViewDto>('/api/v1/kuji/buy', { num, ...(line ? { line } : {}) }),
  kujiDraw: (num: number, line?: KujiLine) => api.post<KujiDrawDto>('/api/v1/kuji/draw', { num, ...(line ? { line } : {}) }),
```

- `KujiView.vue`：
  - `const route = useRoute(); const router = useRouter(); const line = computed<KujiLine>(() => (route.query.line === 'deluxe' ? 'deluxe' : 'normal'));`
  - `load`、`buy`、`draw` 调接口时传 `line.value`；`watch(line, () => { result.value = null; void load(); })`。
  - 标题下面加两个切换按钮（`.dt-pills` 写法照其他页面），`data-testid="kj-line-normal"`、`kj-line-deluxe`，点了 `router.replace({ query: { ...route.query, line: x === 'deluxe' ? 'deluxe' : undefined } })`。
  - 票数和买券提示用 `line === 'deluxe'` 时的文案（见下），规则说明不变（张数来自看板）。
- 文案（`kuji.ts` 四种语言）：`lineNormal`“普通”、`lineDeluxe`“豪华”、`ticketsDeluxe(n)`“我的豪华签券：n 张”、`boughtDeluxe(n)`“买了 n 张豪华签券”、`deluxeNote`“豪华池：每池 20 张，A 赏和最后赏发当月限定称号并全服广播。”（豪华时显示在规则说明下面）。
- 新闻（`news.ts` 四种语言）：`kuji.big`、`kuji.win` 在 `p.line === 'deluxe'` 时把“一番赏”写成“豪华一番赏”（英 “Deluxe Ichiban Kuji”，法 « Ichiban Kuji de luxe »，西 «Ichiban Kuji de lujo»）。
- `cd apps/web && pnpm i18n:tw`。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run --project web && pnpm -F @dt/web typecheck`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/api/endpoints.ts apps/web/src/views/KujiView.vue apps/web/src/views/KujiView.test.ts apps/web/src/utils/news.test.ts apps/web/src/i18n/locales
git commit -m "feat(web): 一番赏页加普通、豪华切换；豪华一番赏的新闻文案（240-2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 全量检查、开发服试玩、终审、PR

- [ ] **Step 1: 全量检查**

```bash
pnpm -F @dt/config build
pnpm lint && pnpm format:check && pnpm -r typecheck
npx vitest run --project web --project config --project shared
pnpm -F @dt/server test
```
Expected: 全部通过（`format:check` 只允许没进仓库的 `问题记录.md`、`apps/web/shots` 报警）。

- [ ] **Step 2: 开发服试玩**

重启开发服（会执行迁移 0044）。临时 Playwright 脚本（`apps/web/e2e/_shot_kuji.spec.ts`，不提交）：注册新店、把银币改成 1,000 万、打开 `/kuji?line=deluxe`、买 2 张、抽 2 张，截图看板和抽签结果；再切回普通确认普通池正常。看完删掉脚本。

- [ ] **Step 3: 路线图**

`docs/roadmap.md` 的 240 一行：称号商店写 `#126`，豪华一番赏写“本 PR”。

- [ ] **Step 4: 推送、终审、PR**

推送分支；派新的审查 agent（最强模型）审整条分支，重点看 Review Focus 五条；重要问题先写失败测试再修，小问题记 `docs/backlog.md`；开 PR“豪华一番赏（240-2）”，描述照以往格式。
