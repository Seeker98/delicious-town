# 重新编号 PR 2：去掉写死的编号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 代码和测试里写死的道具、食材、菜谱编号全部换成命名常量或按名字查，并加一条扫描测试防止再写死；行为不变、配置包不变。

**Architecture:** 源码里少数几处手改成常量（前端要用的放进 `@dt/shared`）；测试里约 600 处用一次性改写脚本按上下文识别“编号位置上的真实编号”，有 `GOODS` 常量的换常量，其余换成 `gid('名字')` / `fid('名字')` / `cid('名字')`（按名字查编号，名字全唯一）；扫描测试用同一套上下文规则检查服务端、配置包、共享包和前端源码。

**Tech Stack:** TypeScript、Vitest、node 脚本。

**Spec:** `docs/superpowers/specs/2026-10-05-id-renumber-design.md`（第 4 节、第 6 节 PR 2）

## Global Constraints

- 行为不变：`pnpm -F @dt/config build` 的版本号不变；全部测试照旧通过。
- 道具、食材、菜谱的名字各自唯一（已核对：0 重复），按名字查时找不到或重名要抛错。
- 前端测试里的编号属于测试自造的假目录，不在本 PR 范围（换号时它们不受影响；用到 `SHARED_GOODS` 含义的，第 4 步会因为常量变了而失败，那时再改）。
- 配置数据文件（区服数值默认值等）里的编号是第 4 步的事。
- 中文注释、提交说明；提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；只 `git add` 明确路径；推送前 `pnpm format:check`。

## Review Focus

1. 改写脚本把“不是编号的数字”（数量、等级、价格）当成编号改掉——只在编号上下文里改、且数值必须是现有编号；Task 3 Step 4 抽查 diff，并靠全量测试兜底。
2. 改写成 `GOODS.xxx` 时选错同值常量（170 探险图 / 普通探险图、180 蟹黄堡 / 碎片基数、240 蟹币 / N 级券基数）——这三个值一律改成按名字查，Task 3 脚本里写死排除。
3. `{ id: N, num: M }` 分不清是道具还是食材——按前面最近的 `goods` / `foods` 键判断，判断不了的跳过并列出，人工处理。
4. 扫描测试误报（例如 `foods.get(239)` 是模拟器里按食材编号记数的 Map）——误报也换成 `fid`，语义不变；真正的非编号用法加进允许名单并写原因。
5. 前端源码 467/468、87 改成共享常量后，类型（字面量联合）不变——Task 1 typecheck 覆盖。

---

## File Structure

- Modify `packages/shared/src/goodsIds.ts`：`SHARED_GOODS.starPromoHonor`、新增 `SHARED_FOODS`。
- Modify `packages/config/src/ids.ts`：`GOODS.starPromoHonor`、`FOODS.masterLevel1/2` 引用共享常量。
- Modify 源码：`apps/server/src/modules/cupboard/service.ts`、`apps/server/src/modules/growth/rules.ts`、`packages/shared/src/schemas/cupboard.ts`、`apps/web/src/api/endpoints.ts`、`apps/web/src/views/CupboardView.vue`、`apps/web/src/views/StoreView.vue`、`packages/config/src/build.ts`、`packages/config/src/itemRefs.ts`。
- Create `packages/config/src/itemLiterals.test.ts`：扫描测试。
- Create `packages/config/src/itemLiterals.ts`：扫描规则（扫描测试和改写脚本共用）。
- Create `packages/config/src/testItems.ts`：配置包测试用的 `gid/fid/cid`。
- Create `apps/server/test/items.ts`：服务端测试用的 `gid/fid/cid`。
- Modify：约 110 个测试文件（脚本改写）。

---

### Task 1: 源码里的编号换成常量；扫描规则和源码扫描测试

**Files:**
- Create: `packages/config/src/itemLiterals.ts`、`packages/config/src/itemLiterals.test.ts`
- Modify: 上面“源码”列的文件、`goodsIds.ts`、`ids.ts`

**Interfaces:**
- Produces:
  - `SHARED_GOODS.starPromoHonor = 87`；`SHARED_FOODS = { masterLevel1: 467, masterLevel2: 468 } as const`
  - `ITEM_PATTERNS: Array<{ kind: 'goods' | 'foods' | 'cookbooks' | 'either'; re: RegExp }>`（每个正则第 1 个捕获组是编号数字）
  - `findItemLiterals(text: string, ids: { goods: Set<number>; foods: Set<number>; cookbooks: Set<number> }): Array<{ kind: 'goods' | 'foods' | 'cookbooks'; id: number; index: number; length: number }>`（`either` 按前面最近的 `goods` / `foods` 键定；定不了的不返回、另由 `ambiguous` 返回）

- [ ] **Step 1: 写扫描规则的单元测试和源码扫描测试（先失败）**

```ts
// packages/config/src/itemLiterals.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findItemLiterals } from './itemLiterals';
import { realBuild } from './testBundle';

const b = realBuild().bundle!;
const ids = {
  goods: new Set(b.goods.map((g) => g.id)),
  foods: new Set(b.foods.map((f) => f.id)),
  cookbooks: new Set(b.cookbooks.map((c) => c.id)),
};
const ROOT = join(__dirname, '..', '..', '..');

describe('写死的编号的识别（重新编号 PR 2）', () => {
  it('只认编号位置上的现有编号', () => {
    const hits = findItemLiterals(
      "goodsNum(t, rest, 93); foodNum(t, r, 101); x = { goodsId: 999999, num: 93 }; requireCookbook(1); level: 93",
      ids,
    );
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 93],
      ['foods', 101],
      ['cookbooks', 1],
    ]);
  });

  it('{ id, num } 按前面最近的 goods / foods 键判断', () => {
    const hits = findItemLiterals('award: { goods: [{ id: 93, num: 1 }], foods: [{ id: 101, num: 2 }] }', ids);
    expect(hits.map((h) => [h.kind, h.id])).toEqual([
      ['goods', 93],
      ['foods', 101],
    ]);
  });
});

/** 源码（非测试）：除常量文件外不能写死编号 */
const SOURCE_DIRS = ['apps/server/src', 'packages/config/src', 'packages/shared/src', 'apps/web/src'];
const ALLOW = new Set(['packages/config/src/ids.ts', 'packages/shared/src/goodsIds.ts']);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p);
    return /\.(ts|vue)$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');

describe('源码里不写死编号（重新编号 PR 2）', () => {
  it('服务端、配置包、共享包、前端源码', () => {
    const bad: string[] = [];
    for (const d of SOURCE_DIRS)
      for (const p of files(join(ROOT, d))) {
        const r = rel(p);
        if (ALLOW.has(r) || /\.test\.ts$|testData\.ts$|testItems\.ts$/.test(r)) continue;
        for (const h of findItemLiterals(readFileSync(p, 'utf8'), ids)) bad.push(`${r}: ${h.kind} ${h.id}`);
      }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑，确认失败**

Run: `cd packages/config && npx vitest run src/itemLiterals.test.ts`
Expected: FAIL，`Cannot find module './itemLiterals'`

- [ ] **Step 3: 写扫描规则**

```ts
// packages/config/src/itemLiterals.ts
/**
 * 写死的道具、食材、菜谱编号（重新编号 PR 2）：只认“编号位置”上的数字。
 * 扫描测试和一次性改写脚本共用；第 1 个捕获组是编号
 */
export type ItemLiteralKind = 'goods' | 'foods' | 'cookbooks';
export const ITEM_PATTERNS: Array<{ kind: ItemLiteralKind | 'either'; re: RegExp }> = [
  { kind: 'goods', re: /\bgoodsNum\([^,()]+,\s*[^,()]+,\s*(\d+)\)/g },
  { kind: 'goods', re: /\bgrantGoods\w*\([^,()]+,\s*[^,()]+,\s*(\d+)\b/g },
  { kind: 'goods', re: /\b(?:goods_id|goodsId|gem_goods_id)\s*:\s*(\d+)\b/g },
  { kind: 'goods', re: /\brequireGoods\((\d+)\)/g },
  { kind: 'goods', re: /\bgoods\.(?:get|has)\((\d+)\)/g },
  { kind: 'foods', re: /\bfoodNum\([^,()]+,\s*[^,()]+,\s*(\d+)\b/g },
  { kind: 'foods', re: /\baddFoods\([^,()]+,\s*(\d+)\b/g },
  { kind: 'foods', re: /\b(?:foods_id|foodsId)\s*:\s*(\d+)\b/g },
  { kind: 'foods', re: /\brequireFood\((\d+)\)/g },
  { kind: 'foods', re: /\bfoods\.(?:get|has)\((\d+)\)/g },
  { kind: 'cookbooks', re: /\bcookbook(?:Id|_id)\s*:\s*(\d+)\b/g },
  { kind: 'cookbooks', re: /\brequireCookbook\((\d+)\)/g },
  { kind: 'cookbooks', re: /\bcookbooks\.(?:get|has)\((\d+)\)/g },
  { kind: 'either', re: /\{\s*id:\s*(\d+),\s*num\b/g },
];

export interface ItemLiteral {
  kind: ItemLiteralKind;
  id: number;
  /** 数字在文本里的位置和长度 */
  index: number;
  length: number;
}

/** 文本里编号位置上、确实是现有编号的数字；either 按前面最近的 goods / foods 键定种类，定不了的放进 ambiguous */
export function findItemLiterals(
  text: string,
  ids: Record<ItemLiteralKind, ReadonlySet<number>>,
  ambiguous: ItemLiteral[] = [],
): ItemLiteral[] {
  const out: ItemLiteral[] = [];
  const seen = new Set<number>();
  for (const { kind, re } of ITEM_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const digits = m[1]!;
      const index = m.index! + m[0].lastIndexOf(digits);
      if (seen.has(index)) continue;
      const id = Number(digits);
      let k: ItemLiteralKind | null = kind === 'either' ? null : kind;
      if (kind === 'either') {
        const before = text.slice(Math.max(0, index - 300), index);
        const g = before.lastIndexOf('goods');
        const f = before.lastIndexOf('foods');
        k = g < 0 && f < 0 ? null : g > f ? 'goods' : 'foods';
      }
      if (k === null) {
        ambiguous.push({ kind: 'goods', id, index, length: digits.length });
        continue;
      }
      if (!ids[k].has(id)) continue;
      seen.add(index);
      out.push({ kind: k, id, index, length: digits.length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
```

- [ ] **Step 4: 跑，规则测试过、源码扫描列出待改的地方**

Run: `cd packages/config && npx vitest run src/itemLiterals.test.ts`
Expected: 两条规则测试 PASS；源码扫描 FAIL，列出 `apps/server/src/modules/cupboard/service.ts`、`growth/rules.ts`、`packages/shared/src/schemas/cupboard.ts`、`apps/web/...` 等（以实际输出为准，逐条处理）。

- [ ] **Step 5: 加共享常量**

`packages/shared/src/goodsIds.ts`：

```ts
export const SHARED_GOODS = {
  mysteryTicket: 1, // 神秘礼券
  starPromoHonor: 87, // 升星促销勋章（仓库页单独说明）
  krabCoin: 240, // 蟹币
} as const;

/** 前后端都要用到的食材 id：一级、二级万能食材（换稀有食材，重新编号 PR 2） */
export const SHARED_FOODS = {
  masterLevel1: 467,
  masterLevel2: 468,
} as const;
```

确认 `packages/shared/src/index.ts` 导出了 `goodsIds.ts`（已导出 `SHARED_GOODS` 的那行同时导出 `SHARED_FOODS`）。
`packages/config/src/ids.ts`：`starPromoHonor: SHARED_GOODS.starPromoHonor`；`FOODS` 改成：

```ts
export const FOODS = {
  masterBase: 466,
  masterLevel1: SHARED_FOODS.masterLevel1,
  masterLevel2: SHARED_FOODS.masterLevel2,
} as const;
```

（`import { SHARED_FOODS, SHARED_GOODS } from '@dt/shared';`）

- [ ] **Step 6: 改源码**

- `packages/shared/src/schemas/cupboard.ts`：`foodsId: z.union([z.literal(SHARED_FOODS.masterLevel1), z.literal(SHARED_FOODS.masterLevel2)])`。
- `apps/server/src/modules/cupboard/service.ts`：参数类型 `foodsId: typeof FOODS.masterLevel1 | typeof FOODS.masterLevel2`；`const lv = b.foodsId === FOODS.masterLevel1 ? 2 : 3;`（加 `FOODS` 的 import）。
- `apps/server/src/modules/growth/rules.ts`：`id: 86` → `id: GOODS.starCert`；`id: 610` → `id: GOODS.purpleShell`。
- `apps/web/src/api/endpoints.ts`：`exchangeMaster: (foodsId: typeof SHARED_FOODS.masterLevel1 | typeof SHARED_FOODS.masterLevel2, times: number)`。
- `apps/web/src/views/CupboardView.vue`：两处 467/468 换 `SHARED_FOODS.masterLevel1/2`。
- `apps/web/src/views/StoreView.vue`：`it.goodsId === 87` → `it.goodsId === SHARED_GOODS.starPromoHonor`。
- `packages/config/src/build.ts`：点名检查的编号列表换成 `GOODS` 常量：
  - `[1, 240, 389]` → `[GOODS.mysteryTicket, GOODS.krabCoin, GOODS.magicLamp]`
  - `136` → `GOODS.towerTicket`
  - `[263, 108]` → `[GOODS.takeawayTicket, GOODS.shopJobHonor]`
  - `[464, 465, 469, 470, 339]` → `[GOODS.formulaScroll, GOODS.moonScroll, GOODS.starTear, GOODS.formulaEssence, GOODS.borderCollie]`
  - 小镇 `[1, 19, 20, 180, 240, 241, 242, 243, 244, 245, 256, 315, 389, 491]` → 对应常量（`mysteryTicket, missileBurst, mysteryFoodExchange, krabBurger, krabCoin`、`GOODS.levelTicketBase + 1..5`、`thorHammer, horn, magicLamp, luckyCookie`）
  - 嘻哈 `230, 231, 232` → `hiphopCulture, mayorFavor, mayorAgainst`
- `packages/config/src/itemRefs.ts`：`CODE_GOODS` 里的字面量换成同一组常量（菜园、小镇两组）。

- [ ] **Step 7: 跑扫描测试、类型检查、配置包测试、版本号**

Run:
```bash
cd packages/config && npx vitest run src/itemLiterals.test.ts && npx vitest run && cd ../.. && pnpm -r typecheck && pnpm -F @dt/config build
```
Expected: 全部 PASS；typecheck 无错；配置包版本号与改动前相同（改动前先记下 `pnpm -F @dt/config build` 输出的版本号）。

- [ ] **Step 8: 提交**

```bash
git add packages/shared/src/goodsIds.ts packages/config/src/ids.ts packages/config/src/itemLiterals.ts packages/config/src/itemLiterals.test.ts \
  packages/shared/src/schemas/cupboard.ts apps/server/src/modules/cupboard/service.ts apps/server/src/modules/growth/rules.ts \
  apps/web/src/api/endpoints.ts apps/web/src/views/CupboardView.vue apps/web/src/views/StoreView.vue \
  packages/config/src/build.ts packages/config/src/itemRefs.ts
git commit -F - <<'EOF'
refactor: 源码里写死的道具、食材编号换成常量；加扫描测试（重新编号 PR 2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 测试用的按名字查编号

**Files:**
- Create: `packages/config/src/testItems.ts`、`apps/server/test/items.ts`
- Test: `packages/config/src/testItems.test.ts`

**Interfaces:**
- Produces: `gid(name: string): number`、`fid(name: string): number`、`cid(name: string): number`（两份实现，配置包的基于 `realBuild()`，服务端的基于 `testConfig()`；找不到抛 `Error('no goods named X')` 等）

- [ ] **Step 1: 失败的测试**

```ts
// packages/config/src/testItems.test.ts
import { describe, expect, it } from 'vitest';
import { cid, fid, gid } from './testItems';

describe('测试里按名字查编号（重新编号 PR 2）', () => {
  it('道具、食材、菜谱', () => {
    expect(gid('神秘礼券')).toBe(1);
    expect(fid('大米')).toBe(101);
    expect(cid('南煎丸子')).toBe(1);
  });
  it('名字不存在时抛错', () => {
    expect(() => gid('没有这件')).toThrow('no goods named 没有这件');
  });
});
```

- [ ] **Step 2: 跑，确认失败**

Run: `cd packages/config && npx vitest run src/testItems.test.ts`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现**

```ts
// packages/config/src/testItems.ts
import { realBuild } from './testBundle';

/** 测试里按名字查编号（重新编号 PR 2）：名字各自唯一，换编号后测试不用改 */
let maps: Record<'goods' | 'foods' | 'cookbooks', Map<string, number>> | null = null;
function lookup(kind: 'goods' | 'foods' | 'cookbooks', name: string): number {
  if (!maps) {
    const b = realBuild().bundle!;
    const of = (list: ReadonlyArray<{ id: number; name: string }>) => new Map(list.map((x) => [x.name, x.id]));
    maps = { goods: of(b.goods), foods: of(b.foods), cookbooks: of(b.cookbooks) };
  }
  const id = maps[kind].get(name);
  if (id === undefined) throw new Error(`no ${kind} named ${name}`);
  return id;
}
export const gid = (name: string) => lookup('goods', name);
export const fid = (name: string) => lookup('foods', name);
export const cid = (name: string) => lookup('cookbooks', name);
```

```ts
// apps/server/test/items.ts
import { testConfig } from './config';

/** 测试里按名字查编号（重新编号 PR 2）：名字各自唯一，换编号后测试不用改 */
let maps: Record<'goods' | 'foods' | 'cookbooks', Map<string, number>> | null = null;
function lookup(kind: 'goods' | 'foods' | 'cookbooks', name: string): number {
  if (!maps) {
    const b = testConfig().bundle;
    const of = (list: ReadonlyArray<{ id: number; name: string }>) => new Map(list.map((x) => [x.name, x.id]));
    maps = { goods: of(b.goods), foods: of(b.foods), cookbooks: of(b.cookbooks) };
  }
  const id = maps[kind].get(name);
  if (id === undefined) throw new Error(`no ${kind} named ${name}`);
  return id;
}
export const gid = (name: string) => lookup('goods', name);
export const fid = (name: string) => lookup('foods', name);
export const cid = (name: string) => lookup('cookbooks', name);
```

- [ ] **Step 4: 跑，确认通过；提交**

Run: `cd packages/config && npx vitest run src/testItems.test.ts`
Expected: PASS（2 条）

```bash
git add packages/config/src/testItems.ts packages/config/src/testItems.test.ts apps/server/test/items.ts
git commit -F - <<'EOF'
test: 测试里按名字查道具、食材、菜谱编号的工具（重新编号 PR 2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: 改写测试里的编号；扫描测试覆盖测试文件

**Files:**
- Create（不提交）: `$SCRATCH/rewrite-literals.ts`
- Modify: 扫描测试 `packages/config/src/itemLiterals.test.ts`；约 110 个测试文件

- [ ] **Step 1: 扫描测试加上测试文件（先失败）**

在 `itemLiterals.test.ts` 末尾加：

```ts
describe('测试里不写死编号（重新编号 PR 2）', () => {
  it('服务端、配置包的测试用常量或按名字查', () => {
    const bad: string[] = [];
    for (const d of ['apps/server/src', 'apps/server/test', 'packages/config/src'])
      for (const p of files(join(ROOT, d))) {
        const r = rel(p);
        if (!/\.test\.ts$/.test(r) && !r.startsWith('apps/server/test/')) continue;
        if (r === 'packages/config/src/itemLiterals.test.ts') continue; // 本文件的规则样例
        for (const h of findItemLiterals(readFileSync(p, 'utf8'), ids)) bad.push(`${r}: ${h.kind} ${h.id}`);
      }
    expect(bad).toEqual([]);
  });
});
```

Run: `cd packages/config && npx vitest run src/itemLiterals.test.ts`
Expected: 新用例 FAIL，列出约 600 处。

- [ ] **Step 2: 写改写脚本（不提交）**

```ts
// $SCRATCH/rewrite-literals.ts —— 在 packages/config 下用 npx tsx 运行
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { GOODS } from '<repo>/packages/config/src/ids';
import { findItemLiterals, type ItemLiteral } from '<repo>/packages/config/src/itemLiterals';
import { realBuild } from '<repo>/packages/config/src/testBundle';

const ROOT = '<repo>';
const b = realBuild().bundle!;
const ids = {
  goods: new Set(b.goods.map((g) => g.id)),
  foods: new Set(b.foods.map((f) => f.id)),
  cookbooks: new Set(b.cookbooks.map((c) => c.id)),
};
const name = {
  goods: new Map(b.goods.map((g) => [g.id, g.name])),
  foods: new Map(b.foods.map((f) => [f.id, f.name])),
  cookbooks: new Map(b.cookbooks.map((c) => [c.id, c.name])),
};
// GOODS 常量：同一个值只有一个键的才用（170、180、240 有两个键，改按名字查）
const keyOf = new Map<number, string>();
const dup = new Set<number>();
for (const [k, v] of Object.entries(GOODS)) {
  if (keyOf.has(v)) dup.add(v);
  keyOf.set(v, k);
}
for (const v of dup) keyOf.delete(v);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p);
    return /\.ts$/.test(n) ? [p] : [];
  });
const ambiguousAll: string[] = [];
let changed = 0;
for (const d of ['apps/server/src', 'apps/server/test', 'packages/config/src'])
  for (const p of files(join(ROOT, d))) {
    const r = relative(ROOT, p).replaceAll('\\', '/');
    if (!/\.test\.ts$/.test(r) || r.endsWith('itemLiterals.test.ts')) continue;
    let s = readFileSync(p, 'utf8');
    const amb: ItemLiteral[] = [];
    const hits = findItemLiterals(s, ids, amb);
    for (const a of amb) ambiguousAll.push(`${r}: ${a.id} @${a.index}`);
    if (hits.length === 0) continue;
    let usesG = false;
    const helpers = new Set<string>();
    for (const h of [...hits].reverse()) {
      let rep: string;
      if (h.kind === 'goods' && keyOf.has(h.id)) {
        rep = `GOODS.${keyOf.get(h.id)}`;
        usesG = true;
      } else {
        const fn = h.kind === 'goods' ? 'gid' : h.kind === 'foods' ? 'fid' : 'cid';
        helpers.add(fn);
        rep = `${fn}('${name[h.kind].get(h.id)!.replaceAll("'", "\\'")}')`;
      }
      s = s.slice(0, h.index) + rep + s.slice(h.index + h.length);
    }
    // import：GOODS 从 @dt/config；gid/fid/cid 从测试工具
    const imports: string[] = [];
    if (usesG && !/\bGOODS\b[^\n]*from '@dt\/config'|from '\.\/ids'/.test(s.split('\n').filter((l) => l.startsWith('import')).join('\n')))
      imports.push(r.startsWith('packages/config/') ? "import { GOODS } from './ids';" : "import { GOODS } from '@dt/config';");
    if (helpers.size > 0) {
      const from = r.startsWith('packages/config/')
        ? './testItems'
        : relative(dirname(p), join(ROOT, 'apps/server/test/items')).replaceAll('\\', '/');
      imports.push(`import { ${[...helpers].sort().join(', ')} } from '${from.startsWith('.') ? from : './' + from}';`);
    }
    const lines = s.split('\n');
    const lastImport = lines.reduce((acc, l, i) => (l.startsWith('import ') ? i : acc), -1);
    // 多行 import 的结尾：从最后一个 import 行往后找到以 ; 结尾的行
    let end = lastImport;
    while (end >= 0 && !lines[end]!.trimEnd().endsWith(';')) end++;
    lines.splice(end + 1, 0, ...imports);
    writeFileSync(p, lines.join('\n'));
    changed += hits.length;
  }
console.log(`rewrote ${changed}`);
console.log(`ambiguous ${ambiguousAll.length}`);
for (const a of ambiguousAll) console.log('  ' + a);
```

（`<repo>` 换成仓库的绝对路径；`GOODS` 已经从 `@dt/config` 导入的文件不重复导入——脚本按 import 行判断，若误判产生重复 import，typecheck 会报，手工删掉。）

- [ ] **Step 3: 运行**

Run: `cd packages/config && npx tsx "$SCRATCH/rewrite-literals.ts" && cd ../.. && npx prettier --write apps/server/src apps/server/test packages/config/src >/dev/null`
Expected: `rewrote` 约 600；`ambiguous` 列出的逐条人工处理（多数是 `{ id, num }` 前面没有 goods/foods 键，按语义改成 `gid`/`fid`）。

- [ ] **Step 4: 抽查改写**

Run: `git diff --stat | tail -3; git diff | grep '^+' | grep -E "gid\(|fid\(|cid\(|GOODS\." | shuf -n 30`
Expected: 抽到的每一处都是编号位置；发现把数量、等级改掉的，回退那一处并收紧 `ITEM_PATTERNS` 再从 Step 3 重来。

- [ ] **Step 5: 类型检查、全部测试**

Run:
```bash
pnpm -r typecheck && pnpm lint
cd packages/config && npx vitest run; cd ../../apps/server && npx vitest run
```
Expected: 全部通过（扫描测试转绿）。失败时先看是不是 import 位置、重复 import 或 `'名字'` 转义问题。

- [ ] **Step 6: 提交**

```bash
git add -u apps/server/src apps/server/test packages/config/src
git commit -F - <<'EOF'
test: 测试里写死的编号改成常量或按名字查；扫描测试覆盖测试文件（重新编号 PR 2）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 全量验证、PR、审查

- [ ] **Step 1:** `pnpm -F @dt/config build`（版本号与改动前相同）、`pnpm -r typecheck`、`pnpm lint`、`pnpm format:check`、配置包 / 服务端 / 前端全部测试。
- [ ] **Step 2:** 推送 `feat/id-renumber-2`，开 PR（base main），说明写：源码改了哪几处、测试改写的方式和数量、扫描测试的规则和范围、前端测试和配置数据为什么不在本 PR。
- [ ] **Step 3:** opus 审查整个分支，Critical / Important 先写测试再修，Minor 记 backlog。
