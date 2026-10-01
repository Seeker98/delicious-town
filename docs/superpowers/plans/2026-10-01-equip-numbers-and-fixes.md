# 厨具数值重定（问题记录 120、162）和小修 136~154 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户给的强化数值表重定全部厨具，强化改成固定增量，守塔人第 5、6 层互换并重算厨力，已有厨具可一键重算；顺带修 6 条小问题。

**Architecture:**
- 数值表放在手写覆盖文件 `game/equip_lore.json` 的 `stressTables`，构建时：
  - 写进 `EquipDef.stressTable`；
  - 按 +0 值缩放基础属性；
  - 改写说明里的数字；
  - 覆盖穿戴等级。
- 守塔人用新覆盖文件 `game/tower_fix.json`。
- 服务端强化按表取增量。
- 已生成的厨具用新命令 `equip:rescale` 重算（可重复跑）。

**Tech Stack:** pnpm monorepo、TS strict、Zod、Fastify 5、Kysely/PostgreSQL、Vue 3、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-01-equip-numbers-and-fixes-design.md`（下文"设计"）。

## Global Constraints

- `packages/config/data/dataset/*` 会被 `scripts/sync-data.ts` 覆盖，不能改；所有数据改动放 `packages/config/data/game/`。`packages/config/data/` 在 `.prettierignore` 里，不要 prettier 它。
- 改完配置跑 `pnpm --filter @dt/config build`。
- 数值表 11 个数 = 强化 +0…+10 时单件属性总和；单调不减，+0 ≥ 1。
- 穿戴等级：见习 0，中厨 13，宋嫂 13，真爱 13，赞助帽 13；沙利叶 40，茵蔯 50，巴贝雷特 60，度玛 65，古尔图格 70，阿卡玛 80，食神 90。
- 强化成功：增量 = `表[当前+1] − 表[当前]`（可以为 0，仍算成功），属性按原规则随机选；强化石只保证成功。
- 守塔人厨力：1~10 层依次 14、66、168、236、420、494、640、802、1162、1522；第 5 层换成"裁决之巴贝雷特 / 裁决长老"，第 6 层换成"沉默的度玛 / 育才长老"（连同台词），最低等级、每日次数、是否比特色菜不动。
- 不改开发库数据：重算命令只写代码和文档，不在开发库上跑（交给用户部署时跑）。
- 文案中文。每个任务跑自己的测试；计划结束跑 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter @dt/web e2e`。
- 旧测试里写死旧数值（阿卡玛 38、守塔人厨力 211 等）的断言，改成新数值，并在 ledger 记一行 Ruling。

## Review Focus

1. 一件厨具同时被两张表覆盖（比如按套装和按道具 id 都写了）或没被覆盖：构建必须报错，不能静默取第一张。（Task 1 测试）
2. 固定属性的厨具有次属性（中厨之锅：厨艺 1、火候 8）：缩放后总和必须正好等于 +0 值，不能因取整多 1 或少 1。（Task 1 测试）
3. 强化到两档数值相同的一级（增量 0）：仍算成功、等级 +1、写记录，回退时不出错。（Task 3 测试）
4. 重算命令遇到强化记录比强化等级少、或同一等级有多条记录（回退后重强）：强化加成总和必须等于 `表[等级] − 表[0]`，再跑一次结果不变。（Task 4 测试）
5. 个人日志类型以后新加：没有中文文案时测试直接失败，不能再显示英文类型名。（Task 6 测试）

---

## 文件结构

**新建**
- `packages/config/src/stressTable.ts`：缩放、说明改写、套用数值表。
- `packages/config/src/stressTable.test.ts`
- `packages/config/data/game/tower_fix.json`
- `apps/server/src/modules/equip/rescale.ts`、`rescale.test.ts`：重算已生成的厨具。
- `apps/server/src/cli/equip-rescale.ts`
- `apps/web/src/utils/logLabels.test.ts`：日志文案全覆盖的守卫测试。
- `apps/web/src/components/admin/SettingRow.test.ts`
- `docs/rules/厨具与厨塔.md`

**修改**
- 配置：`packages/config/src/{raw,types,equip,build,source}.ts`、`build.test.ts`、`data/game/equip_lore.json`。
- 服务端：`apps/server/src/modules/equip/{rules,service}.ts` 及测试、`modules/shop/rules.ts`、`shop.test.ts`、`apps/server/package.json`。
- 共享：`packages/shared/src/schemas/equip.ts`。
- 前端：`views/EquipDetailView.vue`、`utils/events.ts`、`views/CupboardView.vue`、`views/RestaurantHomeView.vue`、`components/admin/SettingRow.vue` 及测试。
- 文档：`docs/deploy.md`。

---

### Task 1：配置——数值表、缩放、说明改写、穿戴等级

**Files:**
- Create: `packages/config/src/stressTable.ts`, `packages/config/src/stressTable.test.ts`
- Modify: `packages/config/src/raw.ts`, `types.ts`, `equip.ts`, `build.ts`, `build.test.ts`, `packages/config/data/game/equip_lore.json`

**Interfaces:**
- Produces（`@dt/config`）：
  - `EquipDef.stressTable: readonly number[]`（11 个数）。
  - `PART_MAIN: Record<number, EquipAttr>`（1 cook、2 cutting、3 fire、4 season、5 creatives）。
  - `scaleToTotal(attrs: EquipAttrs, total: number, main: EquipAttr): EquipAttrs`。
  - `rewriteStatDesc(desc: string, base: EquipAttrs, total: number): string`。
  - `applyStressTables(goods: Goods[], tables: StressTableEntry[], errors: string[]): Goods[]`。

- [ ] **Step 1：写失败的测试**

```ts
// packages/config/src/stressTable.test.ts
import { describe, expect, it } from 'vitest';
import { buildBundle, defaultDataDir, readSourceDir } from './index';
import { rewriteStatDesc, scaleToTotal } from './stressTable';

const zero = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const source = () => readSourceDir(defaultDataDir());

describe('数值表（问题记录 120）', () => {
  it('按比例缩放到总和，最大余数法，总和正好相等（Review Focus 2）', () => {
    expect(scaleToTotal({ ...zero, cook: 1, fire: 8 }, 4, 'fire')).toEqual({ ...zero, fire: 4 });
    expect(scaleToTotal({ ...zero, cook: 1, fire: 8 }, 28, 'fire')).toEqual({ ...zero, cook: 3, fire: 25 });
    expect(scaleToTotal({ ...zero, creatives: 22 }, 25, 'creatives')).toEqual({ ...zero, creatives: 25 });
    expect(scaleToTotal(zero, 6, 'cook')).toEqual({ ...zero, cook: 6 });
  });

  it('改写说明里的数字', () => {
    expect(rewriteStatDesc('厨艺+38。阿卡玛……', { ...zero, cook: 51 }, 51)).toBe('厨艺+51。阿卡玛……');
    expect(rewriteStatDesc('随机增加35点属性。巴贝雷特……', zero, 31)).toBe('随机增加31点属性。巴贝雷特……');
    expect(rewriteStatDesc('感谢……。增加22点创意。', { ...zero, creatives: 25 }, 25)).toBe('感谢……。增加25点创意。');
    expect(rewriteStatDesc('餐厅12专属厨具，增加22点属性', { ...zero, creatives: 25 }, 25)).toBe(
      '餐厅12专属厨具，增加25点属性',
    );
  });

  it('构建：每件厨具都有表，+0 和穿戴等级按表', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const g = (id: number) => bundle!.goods.find((x) => x.id === id)!;
    expect(bundle!.goods.filter((x) => x.equip && x.equip.stressTable.length !== 11)).toEqual([]);
    // 阿卡玛之铲：固定厨艺 51，80 级
    expect(g(352).equip).toMatchObject({ minLevel: 80, total: null, stressTable: [51, 55, 59, 65, 71, 79, 87, 97, 107, 119, 131] });
    expect(g(352).equip!.ranges.cook).toBe(51);
    expect(g(352).desc.startsWith('厨艺+51。')).toBe(true);
    // 巴贝雷特之铲：随机总和 31，60 级
    expect(g(59).equip).toMatchObject({ minLevel: 60, total: 31 });
    expect(g(59).desc.startsWith('随机增加31点属性。')).toBe(true);
    // 中厨之锅：厨艺 1、火候 8 缩放到 4
    expect(g(49).equip!.ranges).toMatchObject({ cook: 0, fire: 4 });
    // 赞助帽：玉级 25、铉级 41
    expect(g(641).equip!.ranges.creatives).toBe(25);
    expect(g(642).equip!.ranges.creatives).toBe(41);
    const levels = Object.fromEntries([33, 637, 59, 56, 632, 352, 358, 73, 30].map((id) => [id, g(id).equip!.minLevel]));
    expect(levels).toEqual({ 33: 40, 637: 50, 59: 60, 56: 65, 632: 70, 352: 80, 358: 90, 73: 13, 30: 0 });
  });

  it('一件厨具没有表、或被两张表覆盖时报错（Review Focus 1）', () => {
    const src = source();
    const lore = structuredClone(src['game/equip_lore']) as { stressTables: Array<{ goods?: number[]; suits?: number[] }> };
    lore.stressTables[0]!.goods = [...(lore.stressTables[0]!.goods ?? []), 352];
    const two = buildBundle({ ...src, 'game/equip_lore': lore }).errors;
    expect(two).toContain('goods 352 equip needs exactly one stress table (found 2)');
    const lore2 = structuredClone(src['game/equip_lore']) as { stressTables: Array<{ name: string }> };
    lore2.stressTables = lore2.stressTables.filter((t) => t.name !== '阿卡玛');
    expect(buildBundle({ ...src, 'game/equip_lore': lore2 }).errors).toContain(
      'goods 352 equip needs exactly one stress table (found 0)',
    );
  });

  it('表必须 11 个数、单调不减', () => {
    const src = source();
    const lore = structuredClone(src['game/equip_lore']) as { stressTables: Array<{ name: string; values: number[] }> };
    lore.stressTables[0]!.values = [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    expect(buildBundle({ ...src, 'game/equip_lore': lore }).errors).toContain(
      `stressTables ${lore.stressTables[0]!.name} must not decrease`,
    );
  });
});
```

（`buildBundle` 的签名、`readSourceDir`、`defaultDataDir` 从 `./index` 或 `./build`、`./source` 导入，以 `build.test.ts` 顶部的写法为准。）

- [ ] **Step 2：运行，确认失败**

Run: `cd packages/config && npx vitest run src/stressTable.test.ts`
Expected: FAIL（`./stressTable` 不存在）。

- [ ] **Step 3：实现**

`raw.ts`：`equipLoreFile` 加

```ts
  stressTables: z.array(stressTableEntry),
```

并在它前面定义：

```ts
/** 强化数值表（问题记录 120）：单件厨具 +0~+10 的属性总和；按套装或道具 id 覆盖，可带穿戴等级 */
export const stressTableEntry = z
  .object({
    name: z.string().min(1),
    suits: z.array(int).optional(),
    goods: z.array(int).optional(),
    minLevel: int.min(0).optional(),
    values: z.array(int),
  })
  .strict();
export type StressTableEntry = z.infer<typeof stressTableEntry>;
```

`types.ts` 的 `EquipDef` 加：

```ts
  /** 强化 +0~+10 时的属性总和（问题记录 120）；构建时由 equip_lore.stressTables 填 */
  stressTable: readonly number[];
```

`equip.ts` 的 `parseEquipDef` 返回值加 `stressTable: []`。

新建 `stressTable.ts`：

```ts
import { EQUIP_ATTRS } from './ids';
import type { StressTableEntry } from './raw';
import type { EquipAttr, EquipAttrs, EquipDef, Goods } from './types';

/** 部位主属性（规格书 07：属性顺序的第一项） */
export const PART_MAIN: Record<number, EquipAttr> = {
  1: 'cook',
  2: 'cutting',
  3: 'fire',
  4: 'season',
  5: 'creatives',
};

const ATTR_CN: Record<EquipAttr, string> = {
  cook: '厨艺',
  cutting: '刀工',
  fire: '火候',
  season: '调味',
  creatives: '创意',
  luck: '幸运',
};

const zeroAttrs = (): EquipAttrs => ({ cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 });

/** 按原各项比例缩放到 total，最大余数法取整（余数相同按属性顺序）；原来全为 0 时全给主属性 */
export function scaleToTotal(attrs: EquipAttrs, total: number, main: EquipAttr): EquipAttrs {
  const out = zeroAttrs();
  const sum = EQUIP_ATTRS.reduce((s, a) => s + attrs[a], 0);
  if (sum <= 0) {
    out[main] = total;
    return out;
  }
  const parts = EQUIP_ATTRS.map((a, i) => {
    const exact = (attrs[a] * total) / sum;
    return { a, i, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = total;
  for (const p of parts) {
    out[p.a] = p.floor;
    left -= p.floor;
  }
  for (const p of [...parts].sort((x, y) => y.rem - x.rem || x.i - y.i)) {
    if (left <= 0) break;
    out[p.a] += 1;
    left -= 1;
  }
  return out;
}

/** 改写说明里写死的属性数字："厨艺+N"、"增加N点创意"、"（随机）增加N点属性" */
export function rewriteStatDesc(desc: string, base: EquipAttrs, total: number): string {
  let s = desc.replace(/增加\d+点属性/, `增加${total}点属性`);
  for (const a of EQUIP_ATTRS) {
    const cn = ATTR_CN[a];
    s = s
      .replace(new RegExp(`${cn}\\+\\d+`), `${cn}+${base[a]}`)
      .replace(new RegExp(`增加\\d+点${cn}`), `增加${base[a]}点${cn}`);
  }
  return s;
}

/** 套用数值表：每件厨具恰好一张表；固定属性按比例缩放到 +0，随机分配的总和改为 +0、各项上限等比缩放 */
export function applyStressTables(goods: Goods[], tables: StressTableEntry[], errors: string[]): Goods[] {
  const ids = new Set(goods.map((g) => g.id));
  for (const t of tables) {
    if (t.values.length !== 11) errors.push(`stressTables ${t.name} needs 11 values`);
    if ((t.values[0] ?? 0) < 1) errors.push(`stressTables ${t.name} +0 must be at least 1`);
    for (let i = 1; i < t.values.length; i++)
      if (t.values[i]! < t.values[i - 1]!) {
        errors.push(`stressTables ${t.name} must not decrease`);
        break;
      }
    if (!t.suits?.length && !t.goods?.length) errors.push(`stressTables ${t.name} covers nothing`);
    for (const id of t.goods ?? []) if (!ids.has(id)) errors.push(`stressTables ${t.name} references unknown goods ${id}`);
  }
  return goods.map((g) => {
    const e = g.equip;
    if (!e) return g;
    const hits = tables.filter((t) => t.goods?.includes(g.id) || t.suits?.includes(e.suitId));
    if (hits.length !== 1) {
      errors.push(`goods ${g.id} equip needs exactly one stress table (found ${hits.length})`);
      return g;
    }
    const t = hits[0]!;
    const v0 = t.values[0] ?? 1;
    let equip: EquipDef;
    let base = zeroAttrs();
    if (e.total === null) {
      const fixed = zeroAttrs();
      for (const a of EQUIP_ATTRS) fixed[a] = e.ranges[a] as number;
      base = scaleToTotal(fixed, v0, PART_MAIN[e.part]!);
      equip = { ...e, ranges: base };
    } else {
      const k = e.total > 0 ? v0 / e.total : 1;
      const ranges = {} as EquipDef['ranges'];
      for (const a of EQUIP_ATTRS) {
        const r = e.ranges[a];
        ranges[a] = typeof r === 'number' ? Math.round(r * k) : [Math.round(r[0] * k), Math.max(1, Math.round(r[1] * k))];
      }
      equip = { ...e, total: v0, ranges };
    }
    equip = { ...equip, stressTable: t.values, minLevel: t.minLevel ?? e.minLevel };
    return { ...g, equip, desc: rewriteStatDesc(g.desc, base, v0) };
  });
}
```

`index.ts` 导出 `stressTable.ts` 的 `PART_MAIN`、`scaleToTotal`、`rewriteStatDesc`（`export * from './stressTable'`），`raw.ts` 的 `StressTableEntry` 类型。

`build.ts`：把 `const goods: Goods[] = lored.goods.map(...)` 改名为 `const builtGoods: Goods[] = ...`，紧接着：

```ts
  // ---------- 强化数值表（问题记录 120） ----------
  const goods = applyStressTables(builtGoods, equipLore.stressTables, errors);
```

`equip_lore.json` 加 `stressTables` 段（紧凑写法，一行一张表）：

```json
  "stressTables": [
    { "name": "见习", "goods": [30, 31, 32], "values": [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18] },
    { "name": "中厨", "goods": [47, 48, 49, 50], "values": [4, 5, 6, 8, 10, 13, 16, 19, 22, 25, 28] },
    { "name": "宋嫂", "suits": [3], "minLevel": 13, "values": [6, 7, 9, 12, 16, 20, 24, 28, 32, 36, 40] },
    { "name": "真爱", "suits": [100], "minLevel": 13, "values": [6, 7, 9, 12, 16, 20, 24, 28, 32, 36, 40] },
    { "name": "沙利叶", "suits": [4], "minLevel": 40, "values": [21, 24, 27, 30, 34, 38, 42, 46, 50, 54, 59] },
    { "name": "茵蔯", "suits": [7], "minLevel": 50, "values": [25, 28, 31, 34, 38, 42, 46, 50, 54, 59, 65] },
    { "name": "巴贝雷特", "suits": [6], "minLevel": 60, "values": [31, 33, 35, 38, 41, 45, 49, 54, 59, 65, 71] },
    { "name": "度玛", "suits": [5], "minLevel": 65, "values": [36, 38, 40, 43, 46, 50, 54, 59, 66, 74, 82] },
    { "name": "古尔图格", "suits": [82], "minLevel": 70, "values": [41, 43, 45, 48, 51, 55, 59, 65, 73, 83, 93] },
    { "name": "阿卡玛", "suits": [80], "minLevel": 80, "values": [51, 55, 59, 65, 71, 79, 87, 97, 107, 119, 131] },
    { "name": "食神", "suits": [81], "minLevel": 90, "values": [61, 66, 71, 78, 86, 95, 105, 116, 128, 141, 155] },
    { "name": "玉级赞助帽", "suits": [90], "minLevel": 13, "values": [25, 28, 31, 34, 38, 42, 46, 50, 54, 59, 65] },
    { "name": "铉级赞助帽", "suits": [99], "minLevel": 13, "values": [41, 43, 45, 48, 51, 55, 59, 65, 73, 83, 93] }
  ]
```

同一文件里两条说明的"第五层"改成"第六层"（度玛到第 6 层）：id 58 的"再也没回到第五层"、茵蔯那件"离开第五层那天"。

- [ ] **Step 4：运行，确认通过**

Run: `cd packages/config && npx vitest run && cd ../.. && pnpm --filter @dt/config build`
Expected: PASS。`build.test.ts` 里写死旧数值的断言（如阿卡玛 38、套装件数之外的属性值）按新表更新，并记 Ruling。

- [ ] **Step 5：提交**

```bash
git add packages/config
git commit -m "feat(config): 厨具强化数值表——+0 缩放、说明数字、穿戴等级（问题记录 120）"
```

---

### Task 2：配置——守塔人第 5、6 层互换和新厨力

**Files:**
- Create: `packages/config/data/game/tower_fix.json`
- Modify: `packages/config/src/raw.ts`, `source.ts`, `build.ts`, `build.test.ts`

**Interfaces:**
- Produces：`towerFloors` 第 5 层 `name '裁决之巴贝雷特'`、`title '裁决长老'`，第 6 层 `name '沉默的度玛'`、`title '育才长老'`；`power` 和表一致（`calibrateWatchman` 取整后误差 ≤ 3）。

- [ ] **Step 1：写失败的测试**（追加到 `build.test.ts`）

```ts
describe('守塔人（问题记录 120）', () => {
  it('第 5、6 层互换；厨力按参照玩家重算', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const f = bundle!.towerFloors;
    expect(f[4]).toMatchObject({ floor: 5, name: '裁决之巴贝雷特', title: '裁决长老', minLevel: 41, maxTimes: 5 });
    expect(f[5]).toMatchObject({ floor: 6, name: '沉默的度玛', title: '育才长老', minLevel: 51, maxTimes: 3 });
    const want = [14, 66, 168, 236, 420, 494, 640, 802, 1162, 1522];
    f.forEach((x, i) => expect(Math.abs(x.power - want[i]!)).toBeLessThanOrEqual(3));
  });

  it('覆盖文件写了不存在的层时报错', () => {
    const src = source();
    expect(
      buildBundle({ ...src, 'game/tower_fix': { floors: [{ floor: 11, power: 1 }] } }).errors,
    ).toContain('tower_fix references unknown floor 11');
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `cd packages/config && npx vitest run src/build.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

`raw.ts`：

```ts
/** data/game/tower_fix.json：守塔人厨力和换层（问题记录 120）；数据集会被同步覆盖，所以单独放 */
export const towerFixFile = z.object({
  floors: z.array(
    z
      .object({
        floor: int.min(1),
        power: int.min(1),
        watchmanRestName: z.string().min(1).optional(),
        watchman: z.string().min(1).optional(),
        note: z.string().optional(),
      })
      .strict(),
  ),
});
```

`source.ts` 的文件列表在 `'game/equip_lore'` 后加 `'game/tower_fix'`。

`build.ts`：读 `const towerFix = parse('game/tower_fix', raw.towerFixFile);`，加入"缺文件就不构建"的判断（和 `equipLore` 同一处）。在 `towerFloors` 之前：

```ts
  const fixByFloor = new Map(towerFix.floors.map((f) => [f.floor, f]));
  for (const f of towerFix.floors)
    if (!towerRaw.some((r) => r.floor === f.floor)) errors.push(`tower_fix references unknown floor ${f.floor}`);
  const towerSrc = towerRaw.map((r) => {
    const x = fixByFloor.get(r.floor);
    return x
      ? {
          ...r,
          attrSum: x.power,
          watchmanRestName: x.watchmanRestName ?? r.watchmanRestName,
          watchman: x.watchman ?? r.watchman,
          note: x.note ?? r.note,
        }
      : r;
  });
```

原来 `towerFloors` 和后面的校验用 `towerRaw` 的地方改用 `towerSrc`。

`tower_fix.json`：

```json
{
  "floors": [
    { "floor": 1, "power": 14 },
    { "floor": 2, "power": 66 },
    { "floor": 3, "power": 168 },
    { "floor": 4, "power": 236 },
    { "floor": 5, "power": 420, "watchmanRestName": "裁决之巴贝雷特", "watchman": "裁决长老", "note": "能和我切磋厨艺,是很多人十辈子都遥不可及的!" },
    { "floor": 6, "power": 494, "watchmanRestName": "沉默的度玛", "watchman": "育才长老", "note": "你看起来天生厨根,老夫平生最爱与有实力的人切磋厨艺了!" },
    { "floor": 7, "power": 640 },
    { "floor": 8, "power": 802 },
    { "floor": 9, "power": 1162 },
    { "floor": 10, "power": 1522 }
  ]
}
```

- [ ] **Step 4：运行，确认通过**

Run: `cd packages/config && npx vitest run && cd ../.. && pnpm --filter @dt/config build && npx vitest run apps/server/src/modules/tower`
Expected: PASS。厨塔测试里写死旧厨力、旧层名的断言按新值更新，记 Ruling。

- [ ] **Step 5：提交**

```bash
git add packages/config apps/server/src/modules/tower
git commit -m "feat(config): 守塔人第 5、6 层互换，厨力按新厨具数值重算（问题记录 120）"
```

---

### Task 3：强化按数值表固定增量

**Files:**
- Modify: `apps/server/src/modules/equip/rules.ts`, `rules.test.ts`, `service.ts`, `stress.test.ts`; `packages/shared/src/schemas/equip.ts`; `apps/web/src/views/EquipDetailView.vue`, `EquipDetailView.test.ts`

**Interfaces:**
- Consumes：`EquipDef.stressTable`（Task 1）。
- Produces：
  - `stressGain(part: number, delta: number, rng: Rng): { attr: EquipAttr; val: number }`（`val = delta`）。
  - `EquipDetailDto.next: { gain: number; total: number } | null`（满级为 null；`total = stressTable[stress+1]`）。

- [ ] **Step 1：写失败的测试**

`rules.test.ts` 把"选属性"用例改成：

```ts
  it('选属性：按顺序每项 50%，都没选中取最后一项；增量固定为表里两档之差（问题记录 120）', () => {
    // 刀：刀工 火候 调味 厨艺 幸运 创意；0.7 跳过刀工，0.3 选中火候
    expect(stressGain(2, 4, sequenceRng([0.7, 0.3]))).toEqual({ attr: 'fire', val: 4 });
    // 都没选中 → 创意
    expect(stressGain(2, 7, sequenceRng([0.9]))).toEqual({ attr: 'creatives', val: 7 });
    // 增量可以是 0
    expect(stressGain(1, 0, sequenceRng([0.1])).val).toBe(0);
  });
```

`stress.test.ts` 追加：

```ts
describe('强化数值表（问题记录 120）', () => {
  it('成功后属性总和到表里下一档；用强化石不再多加；详情给出下一档', async () => {
    seq = [0.01];
    const ctx = await rich();
    const table = t.deps.config.requireGoods(30).equip!.stressTable;
    const id = await piece(ctx, 30, { base_cook: table[0]! });
    const d0 = await eq().detail(ctx, id);
    expect(d0.next).toEqual({ gain: table[1]! - table[0]!, total: table[1]! });
    await eq().stress(ctx, { id, stone: false });
    await t.db.insertInto('store_item').values({ rest_id: ctx.restaurantId, goods_id: 40, num: 1 }).execute();
    const r = await eq().stress(ctx, { id, stone: true });
    expect(r.data.val).toBe(table[2]! - table[1]!);
    const e = await row(id);
    const sum = (p: 'base_' | 'st_') =>
      (['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const).reduce((s, a) => s + Number(e[`${p}${a}`]), 0);
    expect(sum('base_') + sum('st_')).toBe(table[2]);
  });

  it('两档相同（增量 0）也算成功，等级 +1，写记录（Review Focus 3）', async () => {
    seq = [0.01];
    const ctx = await rich();
    const def = t.deps.config.requireGoods(30).equip!;
    const table = def.stressTable as number[];
    const orig = [...table];
    table.splice(1, 1, table[0]!);
    try {
      const id = await piece(ctx, 30, { base_cook: table[0]! });
      const r = await eq().stress(ctx, { id, stone: false });
      expect(r.data).toMatchObject({ success: true, val: 0, stress: 1 });
      expect((await logs(id)).at(-1)).toMatchObject({ success: true, val: 0 });
    } finally {
      table.splice(0, table.length, ...orig);
    }
  });
});
```

（`EquipDetailView.test.ts`：mock 的详情加 `next: { gain: 2, total: 9 }`，断言页面有"成功后属性总和 +2（到 9，不含宝石）"；`next: null` 时不显示。强化石道具 id 以 `GOODS.stressStone` 为准，上面写的 40 按实际改。测试改的是共享的配置对象，`finally` 里一定要还原。）

**和设计的差异**：设计 §3 说"手改说明里的数字、构建时校验"；本计划改成构建时按新数值自动改写说明（`rewriteStatDesc`），因为数据集里的几十件命名帽子说明不能手改（会被同步覆盖）。效果一样，且不会和表不一致。

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/equip/rules.test.ts apps/server/src/modules/equip/stress.test.ts apps/web/src/views/EquipDetailView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

`rules.ts`：

```ts
/** 强化成功（问题记录 120）：增量固定为数值表两档之差；属性按顺序每项 50%，都没选中取最后一项 */
export function stressGain(part: number, delta: number, rng: Rng): { attr: EquipAttr; val: number } {
  const seq = attrSeq(part);
  let attr = seq[seq.length - 1]!;
  for (const a of seq) {
    if (rng.next() < 0.5) {
      attr = a;
      break;
    }
  }
  return { attr, val: delta };
}
```

`service.ts` 的 `stress` 里：

```ts
        if (r.success) {
          const table = def.stressTable;
          gain = stressGain(e.part, (table[to] ?? 0) - (table[e.stress] ?? 0), o.rng);
```

（删掉 `main` 变量。）`detail` 返回值加：

```ts
        next:
          e.stress >= t.maxStress
            ? null
            : (() => {
                const table = d.config.requireGoods(e.goods_id).equip!.stressTable;
                return { gain: table[e.stress + 1]! - table[e.stress]!, total: table[e.stress + 1]! };
              })(),
```

`packages/shared/src/schemas/equip.ts` 的 `EquipDetailDto` 加：

```ts
  /** 下一次强化成功后的增量和属性总和（不含宝石）；满级为 null（问题记录 120） */
  next: { gain: number; total: number } | null;
```

`EquipDetailView.vue` 在成功率那行下面加：

```vue
        <div v-if="d.next" data-testid="stress-next">
          成功后属性总和 +{{ d.next.gain }}（到 {{ d.next.total }}，不含宝石）
        </div>
```

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/equip apps/web/src/views/EquipDetailView.test.ts && pnpm typecheck`
Expected: PASS。原来按随机增量写死数值的强化测试（如"增量 max(1, ⌊0.01×4⌋) = 1"）按新表改，记 Ruling。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/equip packages/shared apps/web/src/views
git commit -m "feat(equip): 强化增量按数值表固定，详情显示下一档（问题记录 120）"
```

---

### Task 4：已生成厨具的重算命令

**Files:**
- Create: `apps/server/src/modules/equip/rescale.ts`, `rescale.test.ts`, `apps/server/src/cli/equip-rescale.ts`
- Modify: `apps/server/package.json`, `docs/deploy.md`

**Interfaces:**
- Consumes：`scaleToTotal`、`PART_MAIN`（Task 1）；`baseAttrs`、`attrCols`（`equip/instances.ts`）。
- Produces：`rescaleEquips(db: Kysely<DB>, config: GameConfig): Promise<{ total: number; changed: number }>`；命令 `pnpm --filter @dt/server equip:rescale`。

**规则**（设计 §6）：对每件厨具（配置里不是厨具的跳过）：
1. 基础属性 = `scaleToTotal(原基础属性, 表[0], PART_MAIN[part])`。
2. 成功的强化记录按 `stress` 分组，每个等级取 id 最大的一条；只看 `stress <= 当前等级` 的。每条的 `val` 重写为 `表[k] − 表[k−1]`。
3. `st_` = 这些记录按 `attr` 累加；`1..当前等级` 里没有记录的等级，增量记到主属性。
4. `min_level` = 配置的穿戴等级。
5. 有任何一项变化才更新这一行，计入 `changed`。

- [ ] **Step 1：写失败的测试**

```ts
// apps/server/src/modules/equip/rescale.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { rescaleEquips } from './rescale';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;
const sum = (r: Record<string, unknown>, p: string) => ATTRS.reduce((s, a) => s + Number(r[`${p}${a}`]), 0);

async function oldPiece(restId: number, goodsId: number, patch: Record<string, unknown>) {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: restId, goods_id: goodsId, part: def.part, suit_id: def.suitId, min_level: 13, ...patch })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const log = (equipId: number, restId: number, stress: number, attr: string, val: number) =>
  t.db.insertInto('equip_stress_log').values({ equip_id: equipId, rest_id: restId, stress, success: true, attr, val }).execute();

describe('重算已生成的厨具（设计 §6）', () => {
  it('基础按比例缩放到 +0；增量按记录重写；缺记录的等级记到主属性；穿戴等级更新；再跑不变（Review Focus 4）', async () => {
    const r = await newRestaurant(t);
    const table = t.deps.config.requireGoods(59).equip!.stressTable; // 巴贝雷特之铲
    // 旧的随机分配：厨艺 20、刀工 15（总和 35）；强化到 +3，只有 +1、+2 的记录，+2 回退后重强过一次
    const id = await oldPiece(r.restaurantId, 59, { base_cook: 20, base_cutting: 15, stress: 3, st_cook: 40, st_fire: 9 });
    await log(id, r.restaurantId, 1, 'cutting', 30);
    await log(id, r.restaurantId, 2, 'fire', 5);
    await log(id, r.restaurantId, 2, 'fire', 9);
    const first = await rescaleEquips(t.db, t.deps.config);
    expect(first.changed).toBeGreaterThanOrEqual(1);
    const e = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(sum(e, 'base_')).toBe(table[0]);
    expect(sum(e, 'st_')).toBe(table[3]! - table[0]!);
    expect(e.st_cutting).toBe(table[1]! - table[0]!);
    expect(e.st_fire).toBe(table[2]! - table[1]!);
    expect(e.st_cook).toBe(table[3]! - table[2]!);
    expect(e.min_level).toBe(60);
    const again = await rescaleEquips(t.db, t.deps.config);
    const e2 = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(e2).toEqual(e);
    expect(again.total).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/equip/rescale.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现**

```ts
// apps/server/src/modules/equip/rescale.ts
import type { Kysely } from 'kysely';
import { EQUIP_ATTRS, PART_MAIN, scaleToTotal, type EquipAttr, type GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { attrCols, baseAttrs, boostAttrs } from './instances';

const isAttr = (a: string | null): a is EquipAttr => a !== null && (EQUIP_ATTRS as readonly string[]).includes(a);

/**
 * 按当前配置的数值表重算已生成的厨具（问题记录 120、设计 §6）：基础缩放到 +0，强化增量按记录重写，
 * 穿戴等级跟配置；幂等，部署改表后可以再跑
 */
export async function rescaleEquips(db: Kysely<DB>, config: GameConfig): Promise<{ total: number; changed: number }> {
  return db.transaction().execute(async (tx) => {
    const rows = await tx.selectFrom('equip').selectAll().orderBy('id').execute();
    let changed = 0;
    for (const e of rows) {
      const def = config.goods.get(e.goods_id)?.equip;
      if (!def) continue;
      const table = def.stressTable;
      const main = PART_MAIN[def.part]!;
      const base = scaleToTotal(baseAttrs(e), table[0]!, main);
      const logs = await tx
        .selectFrom('equip_stress_log')
        .select(['id', 'stress', 'attr', 'val'])
        .where('equip_id', '=', e.id)
        .where('success', '=', true)
        .where('stress', '<=', e.stress)
        .orderBy('id')
        .execute();
      const latest = new Map<number, (typeof logs)[number]>();
      for (const l of logs) latest.set(l.stress, l);
      const st = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
      for (let k = 1; k <= e.stress; k++) {
        const delta = (table[k] ?? table[table.length - 1]!) - (table[k - 1] ?? table[table.length - 1]!);
        const l = latest.get(k);
        st[l && isAttr(l.attr) ? l.attr : main] += delta;
        if (l && l.val !== delta)
          await tx.updateTable('equip_stress_log').set({ val: delta }).where('id', '=', l.id).execute();
      }
      const same =
        EQUIP_ATTRS.every((a) => baseAttrs(e)[a] === base[a] && boostAttrs(e)[a] === st[a]) && e.min_level === def.minLevel;
      if (same) continue;
      await tx
        .updateTable('equip')
        .set({ ...attrCols('base_', base), ...attrCols('st_', st), min_level: def.minLevel })
        .where('id', '=', e.id)
        .execute();
      changed++;
    }
    return { total: rows.length, changed };
  });
}
```

（`EQUIP_ATTRS`、`EquipAttr` 已从 `@dt/config` 导出；如果没有，从对应模块导出。）

```ts
// apps/server/src/cli/equip-rescale.ts
import { loadGameConfig } from '@dt/config';
import { createDb } from '../db';
import { loadEnv } from '../env';
import { rescaleEquips } from '../modules/equip/rescale';

/** 按当前配置的强化数值表重算全部已生成的厨具（问题记录 120）；可重复跑 */
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
try {
  const r = await rescaleEquips(db, loadGameConfig(env.CONFIG_BUNDLE_PATH));
  console.log(`equip rescaled: ${r.changed} / ${r.total}`);
} finally {
  await db.destroy();
}
```

`apps/server/package.json` scripts 加 `"equip:rescale": "tsx --env-file=.env.development src/cli/equip-rescale.ts"`。

`docs/deploy.md` 末尾加一节"厨具数值重定（问题记录 120）"：
- 强化改为按 `game/equip_lore.json` 的 `stressTables` 固定增量；
- 守塔人数值在 `game/tower_fix.json`；
- 部署后跑一次 `pnpm --filter @dt/server equip:rescale` 重算已生成的厨具，生产环境把 `--env-file` 换成生产的；
- 以后改表也要再跑；可以重复跑。

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/equip/rescale.test.ts && pnpm --filter @dt/server typecheck`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/server docs/deploy.md
git commit -m "feat(equip): 已生成厨具按新数值表重算的命令 equip:rescale（问题记录 120）"
```

---

### Task 5：商店——买满持有上限的不可叠放道具时按钮变灰（136）

**Files:**
- Modify: `apps/server/src/modules/shop/rules.ts`, `apps/server/src/modules/shop/shop.test.ts`

- [ ] **Step 1：写失败的测试**（`shop.test.ts` 追加到"受持有上限"附近）

```ts
  it('教师证（不可叠放、持有上限 1）已有 1 张时不能再买（问题记录 136）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000_000 }, goods: { 177: 1 } });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', 177)).toMatchObject({ maxBuy: 0, blocked: 'max' });
  });
```

- [ ] **Step 2：运行，确认失败**

Run: `npx vitest run apps/server/src/modules/shop/shop.test.ts`
Expected: FAIL（`maxBuy` 为 1）。

- [ ] **Step 3：实现**

`rules.ts` 的 `buyCap`：

```ts
  // 不可叠放的道具一次只能买 1 个，也受持有上限限制（问题记录 136：教师证买完按钮不变灰）
  const cap = plaque || honor ? 1 : Math.min(g.stackable ? maxBuy : 1, g.maxNum - s.owned);
```

- [ ] **Step 4：运行，确认通过**

Run: `npx vitest run apps/server/src/modules/shop`
Expected: PASS（"厨具一次只能买 1 件"的用例仍通过）。

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/shop
git commit -m "fix(shop): 不可叠放道具到持有上限后不能再买，按钮变灰（问题记录 136）"
```

---

### Task 6：个人日志类型全部有中文文案（154）

**Files:**
- Create: `apps/web/src/utils/logLabels.test.ts`
- Modify: `apps/web/src/utils/events.ts`

**Interfaces:**
- Produces：`events.ts` 导出 `LOG_TYPES_WITH_LABEL: ReadonlySet<string>`（`LOGS` 的键）；`logText` 不变。

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/utils/logLabels.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logText } from './events';

const SERVER = join(__dirname, '../../../server/src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}
/** 服务端写进个人日志的类型：restLog(x, 'type' …) 和 grantRewardOp 的 logType: 'type' */
function serverLogTypes(): string[] {
  const out = new Set<string>();
  for (const f of files(SERVER)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/restLog\(\s*[\w.]+\s*,\s*'([\w.]+)'/g)) out.add(m[1]!);
    for (const m of src.matchAll(/logType:\s*'([\w.]+)'/g)) out.add(m[1]!);
  }
  return [...out].sort();
}

const names = { goodsName: () => '道具', foodName: () => '食材', mcName: () => '秘', seedName: () => '种子' };

describe('个人日志文案全覆盖（问题记录 154，Review Focus 5）', () => {
  it('能扫到服务端的日志类型', () => {
    expect(serverLogTypes()).toEqual(expect.arrayContaining(['bar.memory', 'level.up', 'mail.claim']));
  });
  it('每个类型都有中文文案，不显示类型名', () => {
    const raw = serverLogTypes().filter((type) => {
      const text = logText({ type, params: {}, at: '' } as never, names as never);
      return text === type || /^[a-z.]+$/.test(text);
    });
    expect(raw).toEqual([]);
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/utils/logLabels.test.ts`
Expected: FAIL，列出 32 个类型（`bar.darts`、`bar.devil`、`bar.memory`、`dine.ended`……）。

- [ ] **Step 3：实现**

`events.ts` 的 `LOGS` 加下面这些（参数名以服务端 `restLog` 调用为准；`n(p, k)` 是已有的取数函数）：

```ts
  'bar.darts': (p) => `酒吧飞镖${p.result === 'win' ? '赢了' : p.result === 'draw' ? '打平' : '输了'}`,
  'bar.devil': (p) =>
    p.result === 'win' ? `魔鬼辣杯撑过 ${n(p, 'survived')} 杯，赢了` : `魔鬼辣杯撑过 ${n(p, 'survived')} 杯，倒下了`,
  'bar.memory': (p) => `记忆调酒第 ${n(p, 'level')} 关${p.correct ? '调对了' : '没调对'}`,
  'dine.started': (p) => `去「${String(p.hostName ?? '')}」白食`,
  'dine.ended': (p) => `在「${String(p.hostName ?? '')}」白食结束`,
  'forum.post': (p) => `在论坛发了帖子 #${n(p, 'postId')}`,
  'forum.reply': (p) => `回复了论坛帖子 #${n(p, 'postId')}`,
  'forum.edit': (p) => `编辑了论坛帖子 #${n(p, 'postId')}`,
  'forum.delete': (p) => `删除了论坛帖子 #${n(p, 'postId')}`,
  'forum.reply.delete': (p) => `删除了在帖子 #${n(p, 'postId')} 的回复`,
  'forum.admin': (p) => `对论坛帖子 #${n(p, 'postId')} 做了管理操作`,
  'friend.weekly': (p, names) => `好友周榜第 ${n(p, 'rank')} 名，获得 ${names.goodsName(n(p, 'goodsId'))}`,
  'hiphop.event': () => '嘻哈男孩来店里办了活动',
  'hiphop.tip': () => '打赏了嘻哈男孩',
  'hiphop.wage': (p, names) => `领到嘻哈男孩的工资（${names.goodsName(n(p, 'cardId'))}）`,
  'hiphop.weekly': (p, names) => `嘻哈周榜第 ${n(p, 'rank')} 名，获得 ${names.goodsName(n(p, 'goodsId'))}`,
  'market.manual': (p) => `菜场手动进货，花费银币 ${formatNum(n(p, 'cost'))}`,
  'market.share': (p, names) => `你在菜场分享的 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} 被买走了`,
  'takeaway.open': () => '开通了外卖',
  'takeaway.refresh': (p) => `刷新了外卖订单（今天第 ${n(p, 'times')} 次）`,
  'takeaway.deliver': () => '派出了一单外卖',
  'takeaway.claim': (p) => (p.success ? `外卖送达，获得银币 ${formatNum(n(p, 'coin'))}` : '外卖配送失败'),
  'takeaway.hire': () => '雇了一位好友当骑手',
  'takeaway.dismiss': () => '和一位骑手结算后解约',
  'tower.rank.week': (p, names) => `赛厨榜周榜第 ${n(p, 'rank')} 名，获得 ${names.goodsName(n(p, 'goodsId'))}`,
  'town.exchange': (p) => `在广场兑换了 ${n(p, 'num')} 次`,
  'town.feast': () => '参加了广场宴席',
  'town.hammer': () => '敲了天气锤，改变了天气',
  'town.mayor': (p) => (p.right ? '答对了镇长的问题' : '答错了镇长的问题'),
  'town.shake': (p) => `摇钱树摇到银币 ${formatNum(n(p, 'coin'))}`,
  'town.talk': () => '和广场上的居民聊了天',
  'town.wish': () => '在广场许了愿',
```

（`formatNum` 若 `events.ts` 里还没导入，从 `./format` 导入，以现有写法为准。）`events.test.ts` 加两条代表性断言：`bar.memory` 和 `takeaway.claim`。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run src/utils`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src/utils
git commit -m "fix(web): 个人日志全部类型有中文文案，加覆盖测试（问题记录 154）"
```

---

### Task 7：橱柜——食材名不截断、万能食材写明兑换规则（138、140）

**Files:**
- Modify: `apps/web/src/views/CupboardView.vue`, `apps/web/src/views/CupboardView.test.ts`

- [ ] **Step 1：写失败的测试**（`CupboardView.test.ts` 追加，照文件里已有的挂载和 mock 写法）

```ts
  it('食材名不截断：不再用 text-truncate（问题记录 138）', async () => {
    const w = await mountCupboard(); // 文件里已有的挂载辅助；没有就照第一个用例写
    expect(w.find('[data-testid^="pick-"] .text-truncate').exists()).toBe(false);
    expect(w.find('[data-testid^="pick-"] .dt-tile-name').exists()).toBe(true);
  });

  it('选中万能食材时写明兑换规则（问题记录 140）', async () => {
    // mock 的橱柜里放 467 一级、469 三级万能食材各 4 个
    const w = await mountCupboard({ foods: [{ foodsId: 467, num: 4 }, { foodsId: 469, num: 4 }] });
    await w.find('[data-testid="pick-467"]').trigger('click');
    expect(w.find('[data-testid="master-rule"]').text()).toContain('2 个一级万能食材换 1 个随机二级稀有食材');
    await w.find('[data-testid="pick-469"]').trigger('click');
    expect(w.find('[data-testid="master-rule"]').text()).toContain('三级及以上的万能食材不能兑换稀有食材');
  });
```

（`mountCupboard` 的名字和 mock 数据形状以现有测试为准；橱柜条目的其他字段照现有 mock 补齐。）

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/views/CupboardView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

方块里名字和数量：

```vue
          <div class="d-flex justify-content-center gap-1 align-items-start">
            <i v-if="f.locked" class="bi bi-lock-fill"></i>
            <span class="dt-tile-name">{{ catalog.foodName(f.foodsId) }}</span>
            <span class="dt-tile-num text-nowrap">×{{ f.num }}</span>
          </div>
```

`<style scoped>` 加：

```css
/* 问题记录 138：窄屏下五个字以上的食材名不截断，最多两行 */
.dt-tile-name {
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

万能食材说明（放在"一次最多分解"那段之前，`pickedItem.foodsId` 在 467~471 时显示）：

```ts
/** 问题记录 140：万能食材能不能换稀有食材 */
const MASTER_RULE: Record<number, string> = {
  467: '2 个一级万能食材换 1 个随机二级稀有食材。',
  468: '2 个二级万能食材换 1 个随机三级稀有食材。',
  469: '三级及以上的万能食材不能兑换稀有食材，只能在学食谱时顶替同级缺的那一种食材。',
  470: '三级及以上的万能食材不能兑换稀有食材，只能在学食谱时顶替同级缺的那一种食材。',
  471: '三级及以上的万能食材不能兑换稀有食材，只能在学食谱时顶替同级缺的那一种食材。',
};
```

```vue
      <div v-if="MASTER_RULE[pickedItem.foodsId]" class="text-muted mt-1" data-testid="master-rule">
        {{ MASTER_RULE[pickedItem.foodsId] }}
      </div>
```

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run src/views/CupboardView.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src/views
git commit -m "fix(web): 橱柜食材名不截断；万能食材写明能否兑换稀有食材（问题记录 138、140）"
```

---

### Task 8：首页签到（144）

**Files:**
- Modify: `apps/web/src/views/RestaurantHomeView.vue`, `RestaurantHomeView.test.ts`

- [ ] **Step 1：写失败的测试**（mock 里加 `activation: vi.fn()`、`signIn: vi.fn()`；`beforeEach` 里 `activation` 默认返回 `{ total: 0, signedIn: false, star: 0, items: [], rewards: [] }`）

```ts
  it('首页显示今日签到，点了就签（问题记录 144）', async () => {
    vi.mocked(endpoints.signIn).mockResolvedValue({} as never);
    const w = await mountView();
    const btn = w.find('[data-testid="home-signin"]');
    expect(btn.text()).toContain('签到');
    vi.mocked(endpoints.activation).mockResolvedValue({ total: 0, signedIn: true, star: 0, items: [], rewards: [] });
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
    expect(w.find('[data-testid="home-signin"]').exists()).toBe(false);
    expect(w.text()).toContain('今天已签到');
  });

  it('读签到状态失败时不显示这一行', async () => {
    vi.mocked(endpoints.activation).mockRejectedValue(new Error('x'));
    const w = await mountView();
    expect(w.find('[data-testid="home-signin-row"]').exists()).toBe(false);
  });
```

（`mountView` 用文件里已有的挂载函数名。）

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/views/RestaurantHomeView.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

```ts
/** 首页签到（问题记录 144）：读失败就不显示 */
const signedIn = ref<boolean | null>(null);
async function loadSignIn() {
  try {
    signedIn.value = (await endpoints.activation()).signedIn;
  } catch {
    signedIn.value = null;
  }
}
```

`load()` 开头加 `void loadSignIn();`。模板在主线任务栏（`data-testid="main-task"`）之前：

```vue
    <div v-if="signedIn !== null" class="dt-card my-2 small d-flex align-items-center gap-2" data-testid="home-signin-row">
      <span class="flex-fill"><i class="bi bi-calendar-check me-1"></i>每日签到</span>
      <span v-if="signedIn" class="text-muted">今天已签到</span>
      <button
        v-else
        class="btn btn-sm btn-success"
        :disabled="busy"
        data-testid="home-signin"
        @click="act(() => endpoints.signIn(), '签到失败')"
      >
        签到
      </button>
    </div>
```

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run src/views/RestaurantHomeView.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src/views
git commit -m "feat(web): 首页加每日签到（问题记录 144）"
```

---

### Task 9：后台区服数值——JSON 值输入框占整行（152）

**Files:**
- Create: `apps/web/src/components/admin/SettingRow.test.ts`
- Modify: `apps/web/src/components/admin/SettingRow.vue`

- [ ] **Step 1：写失败的测试**

```ts
// apps/web/src/components/admin/SettingRow.test.ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingRow from './SettingRow.vue';

const props = (kind: 'number' | 'json', value: unknown) => ({
  path: 'restaurant.giftFoods',
  kind,
  def: value,
  value,
  effective: value,
  overridden: false,
  readOnly: false,
  error: false,
});

describe('SettingRow（问题记录 152）', () => {
  it('JSON 值的输入框占整行，按内容行数调高', () => {
    const value = [{ id: 1, num: 2 }, { id: 3, num: 4 }];
    const w = mount(SettingRow, { props: props('json', value) });
    const box = w.find('[data-testid="setting-restaurant.giftFoods"]');
    expect(box.element.parentElement!.className).toContain('col-12');
    expect(Number(box.attributes('rows'))).toBeGreaterThanOrEqual(2);
  });

  it('数字仍然是窄输入框', () => {
    const w = mount(SettingRow, { props: props('number', 3) });
    expect(w.find('[data-testid="setting-restaurant.giftFoods"]').element.parentElement!.className).toContain('col-md-3');
  });
});
```

- [ ] **Step 2：运行，确认失败**

Run: `cd apps/web && npx vitest run src/components/admin/SettingRow.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

`SettingRow.vue`：
- 输入框外层 `div` 的 class 改为 `:class="kind === 'json' ? 'col-12' : 'col-5 col-md-3'"`。
- 默认值、生效值那一格同样：`kind === 'json'` 时 `col-10`，否则 `col-5 col-md-4`。
- textarea 的 `rows` 改为 `:rows="rowsOf(value)"`：

```ts
/** JSON 值按格式化后的行数调高（问题记录 152），最少 2 行、最多 8 行 */
const rowsOf = (v: unknown) =>
  Math.min(8, Math.max(2, (typeof v === 'string' ? v : JSON.stringify(v, null, 1)).split('\n').length));
```

  显示仍用 `show(value)`（一行 JSON），`rows` 只决定高度。

- [ ] **Step 4：运行，确认通过**

Run: `cd apps/web && npx vitest run src/components/admin src/views/admin/AdminShardView.test.ts`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add apps/web/src/components/admin
git commit -m "fix(admin): 区服数值里 JSON 值的输入框占整行（问题记录 152）"
```

---

### Task 10：规则文档、e2e、全量检查

**Files:**
- Create: `docs/rules/厨具与厨塔.md`
- Modify: e2e 里写死旧数值的断言（如有）

- [ ] **Step 1：写规则文档**

`docs/rules/厨具与厨塔.md`：
- **强化**：+0~+10；每次成功属性总和到表里的下一档，加在哪项随机；强化石必定成功；回退按记录扣回。
- **数值表**：贴设计 §3 的表，并写明穿戴等级。
- **守塔人**：10 层的守塔人、最低等级、厨力（设计 §5 的表），第 5 层巴贝雷特、第 6 层度玛。
- 对应代码：`packages/config/data/game/equip_lore.json` 的 `stressTables`、`game/tower_fix.json`、`apps/server/src/modules/equip/`。

- [ ] **Step 2：全量检查**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 3：e2e**

重启 dev 让服务端读到新配置，然后：
Run: `pnpm --filter @dt/web e2e`
Expected: 18 passed。`equip.spec.ts` 若断言了旧属性值，按新值改并记 Ruling。

- [ ] **Step 4：提交**

```bash
git add docs apps/web/e2e
git commit -m "docs: 厨具强化数值表和守塔人规则；e2e 适配新数值"
```
