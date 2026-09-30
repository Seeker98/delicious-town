# 子项目 2B「厨具」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能获得、穿戴、强化、回退、分解、出售、打孔、镶嵌厨具，宝石能升阶，能存 5 套预设、一键处理厨具；穿戴厨具的幸运和套装加成进入结算；主线第 30、31 步和厨具支线开放。

**Architecture:** 配置包把厨具 / 宝石道具的 value 解析成 `EquipDef` / `GemDef`，加载套装表；迁移 0006 建 `equip`、`equip_gem`、`equip_stress_log`、`equip_preset`。服务端新增 `modules/equip/`（纯规则、实例、加成同步、业务、路由、旧数据转换任务），`grantGoods` 遇到厨具时生成实例。穿戴变化后把幸运和套装加成写进 `effect_source`，结算不改。前端新增厨具页、厨具详情页、宝石页。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject2b-equip-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1` 下（`/equip/...`、`/gem/...`），由 `modules/equip/routes.ts` 的 `equipRoutes(svc)` 注册
- 厨具的所有写操作走 `runOp`（锁自己的店），功能名 `equip`；读接口开头调用 `d.shards.ensureFeature(ctx.shardId, 'equip')`
- 不新增错误码。原因名用下划线（与现有一致）：`INVALID_STATE` reason `locked` / `has_gems` / `in_preset` / `worn` / `not_worn` / `max_stress` / `no_stress` / `hole_full` / `cannot_drill` / `no_hole` / `gem_max` / `not_gem` / `not_back_stress` / `preset_name` / `batch_dirty`（params `ids`）/ `not_sellable`；`REQUIREMENT_NOT_MET` reason `level`（params `need`）；`LIMIT_REACHED` what `presets`（params `max`）；`NOT_FOUND` params `{ what: 'equip' | 'gem' | 'preset' }`；资源不够一律用现有的 `consumeGoods` / `spendCoin` / `spendStrength`（`NOT_ENOUGH` kind `goods` / `coin` / `strength`）
- 事件键（`emitAction`，驱动任务）：`equip.wear`、`equip.stress`、`equip.drill`、`equip.gemIn`；任务状态键 `equip.maxStress`
- 流水来源（`runOp` 的 source）：`equip.wear`、`equip.unwear`、`equip.stress`、`equip.rollback`、`equip.lock`、`equip.salvage`、`equip.sell`、`equip.batch`、`equip.drill`、`equip.inlay`、`equip.ungem`、`gem.levelUp`、`equip.preset`
- 新闻类型：`equip.stress`（强化到 +8 起）、`gem.levelUp`、`gem.broken`；个人日志类型：`equip.stress`
- 加成来源：`effect_source(source_type='equip', source_id=0)` 存 `{ luckValue }`；`source_type='suit'`、`source_id = suitId*10 + 档位序号`
- 界面文字全部中文；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build` 并重启 `pnpm dev`（测试的 globalSetup 自己生成）

## 计划层面的裁定（相对设计文档）

1. 出售厨具走新接口 `POST /equip/sell {id}`（功能 `equip`），不改 `/shop/sell`——商店出售按 goodsId + 数量，厨具按实例；两套检查放在一起反而更乱。代价：前端出售按钮调另一个接口
2. 旧数据转换不在迁移里做（迁移命令没有配置包，生成属性要读道具 value），改成 worker 周期任务 `equip-convert`（每小时，功能 `store`，幂等）。代价：部署后最多一小时老号的厨具才出现在厨具页
3. 任务的 href 不改：前端现在不用 href 跳转
4. tuning 里不放一键处理上限和预设名长度：zod 直接限制（200 件、12 字）
5. 单件详情路径用 `/equip/item/:id`，避免和 `/equip/list`、`/equip/overview` 混在一起

## Review Focus

1. **连点两次强化（同一件厨具两个请求同时到）**：按行锁串行，两次都扣费、等级正确累加，+9 时第二个请求得到 `max_stress` 而不是冲到 +11。→ Task 6 测试
2. **一边穿戴一边分解同一件厨具**：只有一个成功；不会出现"穿着的厨具被分解"或"已删除的厨具被穿上"。→ Task 7 测试
3. **回退时强化记录比等级少（例如管理员改过等级）**：等级照常下降，属性不减成负数。→ Task 6 测试
4. **一次发多件厨具（礼包、任务、后台补偿发 10 件）且仓库已满**：生成 10 个实例，都不进 `store_item`，奖励不丢。→ Task 4 测试
5. **2 星以上摘除宝石时银币不够**：返回 `NOT_ENOUGH coin`，宝石还在厨具上、没有退进仓库（不会先删宝石再报错）。→ Task 8 测试

---

## 文件结构

```
packages/config/src/ids.ts                         EQUIP_ATTRS、厨具相关道具 id
packages/config/src/types.ts                       EquipDef、GemDef、SuitDef；Goods.equip / gem；ConfigBundle.suits
packages/config/src/raw.ts                         rawSuit
packages/config/src/equip.ts                       parseEquipDef、parseGemDef、buildSuits（纯函数）
packages/config/src/equip.test.ts
packages/config/src/build.ts                       接入上面三个函数、引用检查
packages/config/src/runtime.ts                     GameConfig.suits
packages/config/src/source.ts                      designed/equip_suits
packages/config/src/tuning.ts、data/game/tuning.json   equip 段
packages/shared/src/schemas/equip.ts               接口 body 和 DTO
packages/shared/src/schemas/world.ts               CatalogGoodsDto.equip / gem、CatalogDto.suits
packages/shared/src/schemas/friend.ts              FriendRestDto.equips
packages/shared/src/schemas/store.ts               StoreDto.equips
apps/server/src/db/migrations/0006_equip.ts、0006.test.ts、index.ts
apps/server/src/db/schema.ts                       四张新表的类型
apps/server/src/modules/equip/rules.ts             纯规则
apps/server/src/modules/equip/rules.test.ts
apps/server/src/modules/equip/instances.ts         创建实例、读取、DTO、旧数据转换
apps/server/src/modules/equip/effects.ts           syncEquipEffects
apps/server/src/modules/equip/service.ts           业务
apps/server/src/modules/equip/routes.ts
apps/server/src/modules/equip/jobs.ts              equip-convert
apps/server/src/modules/equip/*.test.ts            集成测试（按任务分文件）
apps/server/src/modules/store/grant.ts             厨具生成实例
apps/server/src/modules/store/goods.ts             storeKinds 计入未穿戴厨具
apps/server/src/modules/store/service.ts           StoreDto.equips
apps/server/src/modules/world/service.ts           目录带厨具、宝石、套装
apps/server/src/modules/friend/reads.ts            好友餐厅页带穿戴
apps/server/src/modules/task/service.ts            equip.maxStress
apps/server/src/core/features.ts                   equip
apps/server/src/game.ts、modules/index.ts          装配
apps/web/src/api/endpoints.ts
apps/web/src/i18n/zh-CN.ts
apps/web/src/utils/labels.ts                       PART_NAMES、ATTR_NAMES
apps/web/src/utils/events.ts                       equip.stress 日志文案
apps/web/src/router.ts
apps/web/src/views/EquipView.vue、EquipDetailView.vue、GemView.vue（+ 测试）
apps/web/src/views/RestaurantHomeView.vue、StoreView.vue、FriendRestView.vue
apps/web/e2e/equip.spec.ts
docs/deploy.md
```

---

### Task 1: 配置——厨具 / 宝石定义、套装、数值、道具常量

**Files:**
- Create: `packages/config/src/equip.ts`, `packages/config/src/equip.test.ts`
- Modify: `packages/config/src/ids.ts`, `types.ts`, `raw.ts`, `build.ts`, `runtime.ts`, `source.ts`, `tuning.ts`, `index.ts`（如果没有 `export *` 就加导出）, `packages/config/data/game/tuning.json`, `packages/config/src/build.test.ts`

**Interfaces:**
- Produces:
  - `EQUIP_ATTRS: readonly ['cook','cutting','fire','season','creatives','luck']`，`type EquipAttr`，`type EquipAttrs = Record<EquipAttr, number>`
  - `interface EquipDef { part; essence; hole; maxHole; minLevel; suitId; total: number | null; ranges: Record<EquipAttr, number | [number, number]> }`
  - `interface GemDef { level; nextId: number | null; attrs: EquipAttrs }`
  - `interface SuitDef { id; name; maxNum; tiers: Array<{ need; desc; effects: Record<string, number> }> }`
  - `Goods.equip: EquipDef | null`、`Goods.gem: GemDef | null`、`ConfigBundle.suits: SuitDef[]`、`GameConfig.suits: ReadonlyMap<number, SuitDef>`
  - `GOODS.essence 52`、`GOODS.stressStone 40`、`GOODS.drillStone 46`、`GOODS.backStressOne 225`、`GOODS.backStressAll 224`
  - `NON_SUIT_IDS: ReadonlySet<number>`（0、90、99）
  - `Tuning['equip']`：`maxStress, baseRate, ratePerStress, floorPerFail, coinPerEssence, newsFromStress, gemBaseRate, gemRatePerLevel, gemExpPerLevel, gemNewsLevel, gemBrokenNewsLevel, ungemCoinPerLevel, ungemMinStar, maxPresets, historyLimit`

- [ ] **Step 1: 写失败的测试 `packages/config/src/equip.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildSuits, parseEquipDef, parseGemDef } from './equip';

describe('parseEquipDef（规格书 07 §7.7）', () => {
  it('固定属性：数字原样保留', () => {
    const d = parseEquipDef({
      part: 1, essence: 1, cook: 3, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0,
      hole: 0, max_hole: 0, min_level: 0, suitid: 0,
    });
    expect(d).toEqual({
      part: 1, essence: 1, hole: 0, maxHole: 0, minLevel: 0, suitId: 0, total: null,
      ranges: { cook: 3, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 },
    });
  });

  it('随机属性："min,max" 解析成区间，带 total', () => {
    const d = parseEquipDef({
      part: 3, essence: 12, total: 25, cook: '0,25', cutting: '0,25', fire: '0,25', season: '0,25',
      creatives: '0,25', luck: '0,25', hole: 1, max_hole: 3, min_level: 13, suitid: 5,
    });
    expect(typeof d).toBe('object');
    const def = d as Exclude<typeof d, string>;
    expect(def.total).toBe(25);
    expect(def.ranges.fire).toEqual([0, 25]);
    expect(def).toMatchObject({ part: 3, essence: 12, hole: 1, maxHole: 3, minLevel: 13, suitId: 5 });
  });

  it('部位不在 1~5、属性写错时返回错误说明', () => {
    expect(parseEquipDef({ part: 9, essence: 1 })).toMatch(/part/);
    expect(parseEquipDef({ part: 1, essence: 1, cook: 'abc' })).toMatch(/cook/);
    expect(parseEquipDef(null)).toMatch(/value/);
  });
});

describe('parseGemDef', () => {
  it('nextid -1 表示最高阶；两种 is_fuse 写法都接受', () => {
    expect(
      parseGemDef({ level: 1, cook: 0, cutting: 0, fire: 0, season: 0, creatives: 1, luck: 0, is_fuse: 0, nextid: 274 }),
    ).toEqual({ level: 1, nextId: 274, attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 1, luck: 0 } });
    expect(parseGemDef({ level: 6, creatives: 24, isfuse: 0, nextid: -1 })).toMatchObject({ level: 6, nextId: null });
    expect(parseGemDef({ nextid: 3 })).toMatch(/level/);
  });
});

describe('buildSuits（规格书 20 §20.15，设计文档 裁定 2）', () => {
  it('按属性百分比放大的键改名为 xxxPct，其他键原样', () => {
    const suits = buildSuits([
      {
        suitid: 3,
        name: '宋嫂套装',
        maxnum: 4,
        tiers: [
          { neednum: 3, desc: '上座率+5%, 刀工+3%', value: { atRate: 0.05, cutting: 0.03 } },
          { neednum: 4, desc: '火候+5%', value: { fire: 0.05 } },
        ],
      },
    ]);
    expect(suits).toEqual([
      {
        id: 3,
        name: '宋嫂套装',
        maxNum: 4,
        tiers: [
          { need: 3, desc: '上座率+5%, 刀工+3%', effects: { atRate: 0.05, cuttingPct: 0.03 } },
          { need: 4, desc: '火候+5%', effects: { firePct: 0.05 } },
        ],
      },
    ]);
  });
});
```

在 `packages/config/src/build.test.ts` 的 `describe('buildBundle（真实数据）'` 里加：

```ts
  it('厨具和宝石解析出定义，套装 7 套，引用都有效', () => {
    const { bundle } = buildBundle(source());
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(30)!.equip).toMatchObject({ part: 1, essence: 1, total: null, suitId: 0 });
    expect(goods.get(56)!.equip).toMatchObject({ part: 3, total: 25, suitId: 5 });
    expect(goods.get(41)!.gem).toMatchObject({ level: 1, nextId: 274 });
    expect(goods.get(341)!.gem).toMatchObject({ level: 6, nextId: null });
    expect(goods.get(13)!.equip).toBeNull();
    expect(bundle!.goods.filter((g) => g.type === 4).every((g) => g.equip !== null)).toBe(true);
    expect(bundle!.goods.filter((g) => g.type === 5).every((g) => g.gem !== null)).toBe(true);
    expect(bundle!.suits.map((s) => s.id).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 80, 81, 100]);
  });
```

并在 `describe('buildBundle（坏数据）'` 里加：

```ts
  it('厨具引用了不存在的套装', () => {
    const src = source();
    const goods = structuredClone(src['dataset/goods']) as Array<{ id: number; value: string }>;
    const g = goods.find((x) => x.id === 30)!;
    g.value = g.value.replace('"suitid": 0', '"suitid": 777');
    const { errors } = buildBundle({ ...src, 'dataset/goods': goods });
    expect(errors).toContain('goods 30 references unknown suit 777');
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/config exec vitest run src/equip.test.ts src/build.test.ts`
Expected: FAIL，`Cannot find module './equip'`，build 测试 `goods.get(30)!.equip` 为 undefined

- [ ] **Step 3: 实现**

`packages/config/src/ids.ts` 末尾加：

```ts
/** 厨具六项属性（生成、强化、宝石都按这个名字） */
export const EQUIP_ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;

/** 不构成套装的 suitid：0 无套装，90 玉•xx之帽、99 铉•xx之帽（规格书 20 §20.15） */
export const NON_SUIT_IDS: ReadonlySet<number> = new Set([0, 90, 99]);
```

`GOODS` 里加（放在 `townCare` 后面）：

```ts
  essence: 52, // 厨具精华
  stressStone: 40, // 强化石
  drillStone: 46, // 打孔石
  backStressOne: 225, // 归元石（回退 1 级）
  backStressAll: 224, // 神秘水晶（回退 10 级）
```

`packages/config/src/types.ts`：顶部加 `import type { EQUIP_ATTRS } from './ids';`，并加：

```ts
export type EquipAttr = (typeof EQUIP_ATTRS)[number];
export type EquipAttrs = Record<EquipAttr, number>;

/** 厨具道具的 value（规格书 07 §7.7） */
export interface EquipDef {
  /** 1 铲 2 刀 3 锅 4 瓶 5 帽 */
  part: number;
  essence: number;
  hole: number;
  maxHole: number;
  minLevel: number;
  suitId: number;
  /** 有 total 时按部位顺序在范围内随机分配；null = 固定属性 */
  total: number | null;
  ranges: Record<EquipAttr, number | [number, number]>;
}

export interface GemDef {
  level: number;
  /** null = 最高阶 */
  nextId: number | null;
  attrs: EquipAttrs;
}

export interface SuitTier {
  need: number;
  desc: string;
  /** 百分比放大属性的键已改名为 cookPct / cuttingPct / firePct / seasonPct */
  effects: Record<string, number>;
}

export interface SuitDef {
  id: number;
  name: string;
  maxNum: number;
  tiers: SuitTier[];
}
```

`Goods` 接口里 `use` 后面加：

```ts
  /** 厨具（type 4）的定义；其他为 null */
  equip: EquipDef | null;
  /** 宝石（type 5）的定义；其他为 null */
  gem: GemDef | null;
```

`ConfigBundle` 里 `looks: Looks;` 后面加 `suits: SuitDef[];`

`packages/config/src/raw.ts` 末尾加：

```ts
export const rawSuit = z.object({
  suitid: int,
  name: z.string(),
  maxnum: int,
  tiers: z.array(z.object({ neednum: int.min(1), desc: z.string(), value: z.record(z.number()) })).min(1),
});
```

新建 `packages/config/src/equip.ts`：

```ts
import type { z } from 'zod';
import { EQUIP_ATTRS } from './ids';
import type { rawSuit } from './raw';
import type { EquipAttr, EquipAttrs, EquipDef, GemDef, SuitDef } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const intOr = (v: unknown, dflt: number): number | null =>
  v === undefined || v === null ? dflt : typeof v === 'number' && Number.isInteger(v) ? v : null;

/** 数字 → 固定值；"min,max" → 区间；缺省 → 0；其他 → null（错误） */
function rangeOf(v: unknown): number | [number, number] | null {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string') {
    const m = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(v);
    if (m && Number(m[1]) <= Number(m[2])) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

/** 厨具 value → 定义；数据不对时返回错误说明 */
export function parseEquipDef(value: unknown): EquipDef | string {
  if (!isObj(value)) return 'value is not an object';
  const part = intOr(value.part, -1);
  if (part === null || part < 1 || part > 5) return `bad part ${String(value.part)}`;
  const fields = {
    essence: intOr(value.essence, 0),
    hole: intOr(value.hole, 0),
    maxHole: intOr(value.max_hole, 0),
    minLevel: intOr(value.min_level, 0),
    suitId: intOr(value.suitid, 0),
    total: value.total === undefined ? null : intOr(value.total, 0),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v === null && !(k === 'total' && value.total === undefined)) return `bad ${k}`;
  }
  const ranges = {} as Record<EquipAttr, number | [number, number]>;
  for (const a of EQUIP_ATTRS) {
    const r = rangeOf(value[a]);
    if (r === null) return `bad ${a} ${String(value[a])}`;
    ranges[a] = r;
  }
  return {
    part,
    essence: fields.essence!,
    hole: fields.hole!,
    maxHole: fields.maxHole!,
    minLevel: fields.minLevel!,
    suitId: fields.suitId!,
    total: fields.total,
    ranges,
  };
}

/** 宝石 value → 定义 */
export function parseGemDef(value: unknown): GemDef | string {
  if (!isObj(value)) return 'value is not an object';
  const level = intOr(value.level, -1);
  if (level === null || level < 1) return `bad level ${String(value.level)}`;
  const next = intOr(value.nextid, -1);
  if (next === null) return `bad nextid ${String(value.nextid)}`;
  const attrs = {} as EquipAttrs;
  for (const a of EQUIP_ATTRS) {
    const v = intOr(value[a], 0);
    if (v === null) return `bad ${a}`;
    attrs[a] = v;
  }
  return { level, nextId: next > 0 ? next : null, attrs };
}

/** 套装里按百分比放大基础属性的键（设计文档 裁定 2） */
const PCT: Record<string, string> = {
  cook: 'cookPct',
  cutting: 'cuttingPct',
  fire: 'firePct',
  season: 'seasonPct',
};

export function buildSuits(list: Array<z.infer<typeof rawSuit>>): SuitDef[] {
  return list.map((s) => ({
    id: s.suitid,
    name: s.name,
    maxNum: s.maxnum,
    tiers: [...s.tiers]
      .sort((a, b) => a.neednum - b.neednum)
      .map((t) => ({
        need: t.neednum,
        desc: t.desc,
        effects: Object.fromEntries(Object.entries(t.value).map(([k, v]) => [PCT[k] ?? k, v])),
      })),
  }));
}
```

`packages/config/src/source.ts` 的 `SOURCE_FILES` 在 `'designed/shop_pools',` 后面加 `'designed/equip_suits',`。

`packages/config/src/build.ts`：
1. 顶部 `import { buildSuits, parseEquipDef, parseGemDef } from './equip';`，`import { GOODS_TYPE, NON_SUIT_IDS } from './ids';`
2. 在 `const shopPoolsRaw = ...` 后面加 `const suitsRaw = parse('designed/equip_suits', z.array(raw.rawSuit));`，并在下面的 `if (errors.length > 0 || ...` 条件里加 `!suitsRaw ||`
3. `const goods: Goods[] = goodsRaw.map((g) => {` 里，`const item: Goods = {` 的 `use: null,` 后面加 `equip: null, gem: null,`；`item.use = deriveGoodsUse(item);` 后面加：

```ts
    if (item.type === GOODS_TYPE.equip) {
      const d = parseEquipDef(value);
      if (typeof d === 'string') errors.push(`goods ${g.id} equip ${d}`);
      else item.equip = d;
    } else if (item.type === GOODS_TYPE.gem) {
      const d = parseGemDef(value);
      if (typeof d === 'string') errors.push(`goods ${g.id} gem ${d}`);
      else item.gem = d;
    }
```

4. 在"奖励引用检查"之前加：

```ts
  // ---------- 厨具套装、宝石升阶 ----------
  const suits = buildSuits(suitsRaw);
  unique(
    'equip_suits',
    suits.map((s) => s.id),
  );
  const suitIds = new Set(suits.map((s) => s.id));
  const goodsById = new Map(goods.map((g) => [g.id, g]));
  for (const g of goods) {
    if (g.equip && !NON_SUIT_IDS.has(g.equip.suitId) && !suitIds.has(g.equip.suitId))
      errors.push(`goods ${g.id} references unknown suit ${g.equip.suitId}`);
    if (g.gem && g.gem.nextId !== null && !goodsById.get(g.gem.nextId)?.gem)
      errors.push(`goods ${g.id} gem next ${g.gem.nextId} is not a gem`);
  }
```

5. `const body: Omit<ConfigBundle, 'version'> = {` 里 `looks,` 后面加 `suits,`

`packages/config/src/runtime.ts`：`GameConfig` 里加 `readonly suits: ReadonlyMap<number, SuitDef>;`（`SuitDef` 加进 import），`createGameConfig` 返回对象里加 `suits: new Map(bundle.suits.map((s) => [s.id, s])),`（照现有字段的写法放在返回对象里）。

`packages/config/src/tuning.ts` 的 `friend: z.object({...}),` 后面加：

```ts
  equip: z.object({
    maxStress: int.min(1),
    baseRate: num,
    ratePerStress: num,
    /** 连续失败每次加的成功率（保底） */
    floorPerFail: num,
    coinPerEssence: int,
    /** 强化到这一级起发新闻 */
    newsFromStress: int,
    gemBaseRate: num,
    gemRatePerLevel: num,
    gemExpPerLevel: int,
    /** 升阶成功得到的宝石阶数大于它时发新闻 */
    gemNewsLevel: int,
    /** 下一阶不小于它且有失败时发新闻 */
    gemBrokenNewsLevel: int,
    ungemCoinPerLevel: int,
    /** 从这个星级起摘除宝石要花银币 */
    ungemMinStar: int,
    maxPresets: int.min(1),
    historyLimit: int.min(1),
  }),
```

`packages/config/data/game/tuning.json` 的 `"friend": {...}` 后面加（注意前一个对象的逗号）：

```json
  "equip": {
    "maxStress": 10,
    "baseRate": 0.8,
    "ratePerStress": 0.08,
    "floorPerFail": 0.01,
    "coinPerEssence": 10000,
    "newsFromStress": 8,
    "gemBaseRate": 0.95,
    "gemRatePerLevel": 0.18,
    "gemExpPerLevel": 1000,
    "gemNewsLevel": 3,
    "gemBrokenNewsLevel": 5,
    "ungemCoinPerLevel": 10000,
    "ungemMinStar": 2,
    "maxPresets": 5,
    "historyLimit": 50
  }
```

检查 `packages/config/src/index.ts` 导出了 `ids`、`types`、`equip`（`export * from './equip';` 没有就加）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/config exec vitest run && pnpm -s typecheck`
Expected: PASS；typecheck 可能在服务端报 `Goods` 缺 `equip` / `gem`（测试里手写 Goods 对象的地方）——给那些对象补 `equip: null, gem: null`

- [ ] **Step 5: 全量测试、生成配置包、提交**

```bash
pnpm test && pnpm --filter @dt/config build
git add packages apps
git commit -m "feat(config): cookware and gem definitions, equip suits, equip tuning and goods ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0006 和表类型

**Files:**
- Create: `apps/server/src/db/migrations/0006_equip.ts`, `apps/server/src/db/migrations/0006.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`, `apps/server/src/db/schema.ts`

**Interfaces:**
- Produces: `DB.equip`（`EquipTable`）、`DB.equip_gem`、`DB.equip_stress_log`、`DB.equip_preset`；`type EquipRow = Selectable<EquipTable>`、`type EquipGemRow = Selectable<EquipGemTable>`；列名 `base_<attr>`、`st_<attr>`（attr ∈ EQUIP_ATTRS）

- [ ] **Step 1: 写失败的测试 `apps/server/src/db/migrations/0006.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let rest: number;
beforeAll(async () => {
  const shardId = await createShard(db);
  rest = await createRestaurantRow(db, shardId, await createAccountRow(db));
});

const piece = (part: number, worn = false) => ({ rest_id: rest, goods_id: 30, part, worn, base_cook: 3 });

describe('迁移 0006', () => {
  it('厨具默认值；同一部位只能穿一件', async () => {
    const e = await db.insertInto('equip').values(piece(1, true)).returningAll().executeTakeFirstOrThrow();
    expect(e).toMatchObject({ stress: 0, fail_streak: 0, locked: false, suit_id: 0, st_cook: 0, cur_hole: 0 });
    await db.insertInto('equip').values(piece(1)).execute();
    await expect(db.insertInto('equip').values(piece(1, true)).execute()).rejects.toThrow();
  });

  it('宝石和强化记录随厨具删除；预设名称同店不重复、引用的厨具删除后置空', async () => {
    const e = await db.insertInto('equip').values(piece(2)).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('equip_gem').values({ equip_id: e.id, rest_id: rest, gem_goods_id: 44, level: 1, cook: 1 }).execute();
    await db
      .insertInto('equip_stress_log')
      .values({ equip_id: e.id, rest_id: rest, stress: 1, success: true, attr: 'cutting', val: 2 })
      .execute();
    await db.insertInto('equip_preset').values({ rest_id: rest, name: '日常', part2: e.id }).execute();
    await expect(db.insertInto('equip_preset').values({ rest_id: rest, name: '日常' }).execute()).rejects.toThrow();
    await db.deleteFrom('equip').where('id', '=', e.id).execute();
    expect(await db.selectFrom('equip_gem').selectAll().where('equip_id', '=', e.id).execute()).toEqual([]);
    expect(await db.selectFrom('equip_stress_log').selectAll().where('equip_id', '=', e.id).execute()).toEqual([]);
    const p = await db.selectFrom('equip_preset').select('part2').where('rest_id', '=', rest).executeTakeFirstOrThrow();
    expect(p.part2).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0006.test.ts`
Expected: FAIL（`relation "equip" does not exist`，或 typecheck 层面 `equip` 不在 DB 里）

- [ ] **Step 3: 实现**

`apps/server/src/db/migrations/0006_equip.ts`：

```ts
import { sql, type Kysely } from 'kysely';

const ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'];
const cols = (prefix: string) =>
  ATTRS.map((a) => `${prefix}${a} integer not null default 0`).join(',\n      ');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table equip (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      goods_id integer not null,
      part smallint not null,
      suit_id integer not null default 0,
      min_level integer not null default 0,
      cur_hole smallint not null default 0,
      max_hole smallint not null default 0,
      stress smallint not null default 0,
      fail_streak integer not null default 0,
      locked boolean not null default false,
      worn boolean not null default false,
      ${sql.raw(cols('base_'))},
      ${sql.raw(cols('st_'))},
      acquired_at timestamptz not null default now()
    )`,
    sql`create index equip_rest on equip (rest_id)`,
    sql`create unique index equip_worn_part on equip (rest_id, part) where worn`,
    sql`create table equip_gem (
      id integer generated always as identity primary key,
      equip_id integer not null references equip(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      gem_goods_id integer not null,
      level smallint not null,
      ${sql.raw(ATTRS.map((a) => `${a} integer not null default 0`).join(',\n      '))},
      created_at timestamptz not null default now()
    )`,
    sql`create index equip_gem_equip on equip_gem (equip_id)`,
    sql`create table equip_stress_log (
      id integer generated always as identity primary key,
      equip_id integer not null references equip(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      stress smallint not null,
      success boolean not null,
      attr text,
      val integer not null default 0,
      lucky boolean not null default false,
      floor boolean not null default false,
      stone boolean not null default false,
      created_at timestamptz not null default now()
    )`,
    sql`create index equip_stress_log_equip on equip_stress_log (equip_id, id)`,
    sql`create table equip_preset (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      name text not null,
      part1 integer references equip(id) on delete set null,
      part2 integer references equip(id) on delete set null,
      part3 integer references equip(id) on delete set null,
      part4 integer references equip(id) on delete set null,
      part5 integer references equip(id) on delete set null,
      created_at timestamptz not null default now(),
      unique (rest_id, name)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['equip_preset', 'equip_stress_log', 'equip_gem', 'equip']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts` 加 `import * as m0006 from './0006_equip';` 和 `'0006_equip': m0006,`。

`apps/server/src/db/schema.ts`：在 `RestIconTable` 后面加：

```ts
type AttrCols<P extends string> = { [K in `${P}${'cook' | 'cutting' | 'fire' | 'season' | 'creatives' | 'luck'}`]: Default<number> };

/** 厨具实例（子项目 2B）：base_ 为生成时的属性，st_ 为强化累计增量 */
export type EquipTable = {
  id: Generated<number>;
  rest_id: number;
  goods_id: number;
  /** 1 铲 2 刀 3 锅 4 瓶 5 帽 */
  part: number;
  suit_id: Default<number>;
  min_level: Default<number>;
  cur_hole: Default<number>;
  max_hole: Default<number>;
  stress: Default<number>;
  fail_streak: Default<number>;
  locked: Default<boolean>;
  worn: Default<boolean>;
  acquired_at: TsDefault;
} & AttrCols<'base_'> &
  AttrCols<'st_'>;

export type EquipGemTable = {
  id: Generated<number>;
  equip_id: number;
  rest_id: number;
  gem_goods_id: number;
  level: number;
  created_at: TsDefault;
} & AttrCols<''>;

export interface EquipStressLogTable {
  id: Generated<number>;
  equip_id: number;
  rest_id: number;
  /** 这次尝试的目标等级 */
  stress: number;
  success: boolean;
  attr: Nullable<string>;
  val: Default<number>;
  lucky: Default<boolean>;
  floor: Default<boolean>;
  stone: Default<boolean>;
  created_at: TsDefault;
}

export interface EquipPresetTable {
  id: Generated<number>;
  rest_id: number;
  name: string;
  part1: Nullable<number>;
  part2: Nullable<number>;
  part3: Nullable<number>;
  part4: Nullable<number>;
  part5: Nullable<number>;
  created_at: TsDefault;
}

export type EquipRow = Selectable<EquipTable>;
export type EquipGemRow = Selectable<EquipGemTable>;
```

`DB` 接口里加：

```ts
  equip: EquipTable;
  equip_gem: EquipGemTable;
  equip_stress_log: EquipStressLogTable;
  equip_preset: EquipPresetTable;
```

（`Selectable` 已经从 kysely 导入。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 全量测试、迁移开发库、提交**

```bash
pnpm test && pnpm --filter @dt/server migrate:dev
git add apps/server/src/db
git commit -m "feat(db): migration 0006 for cookware, gems, enhancement log and presets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 纯规则（生成、强化、宝石升阶、套装、属性汇总）

**Files:**
- Create: `apps/server/src/modules/equip/rules.ts`, `apps/server/src/modules/equip/rules.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `EQUIP_ATTRS`、`EquipAttr`、`EquipAttrs`、`EquipDef`、`SuitDef`、`NON_SUIT_IDS`、`Tuning['equip']`
- Produces（都是纯函数，随机数只走传入的 `rng`）：
  - `attrSeq(part: number): readonly EquipAttr[]`
  - `zeroAttrs(): EquipAttrs`、`addAttrs(a: EquipAttrs, b: EquipAttrs): EquipAttrs`
  - `rollEquipAttrs(def: EquipDef, rng: Rng): EquipAttrs`
  - `interface StressRate { base; luck; weather; floor; total }`；`stressRate(stress, luckSum, weatherRate, failStreak, t: EquipTuning): StressRate`
  - `rollStress(rate: StressRate, stone: boolean, rng): { success: boolean; lucky: boolean; floor: boolean }`
  - `stressGain(part, mainBase, stone, rng): { attr: EquipAttr; val: number }`
  - `gemLevelUp(num, level, weatherRate, luckRate, t, rng): { success: number; lucky: number; fail: number }`；`gemRate(level, weatherRate, t): number`
  - `interface ActiveSuit { suit: SuitDef; count: number; active: boolean[] }`；`activeSuits(suitIds: number[], suits: ReadonlyMap<number, SuitDef>): ActiveSuit[]`
  - `suitAggEffects(effects: Record<string, number>): Record<string, number>`（只留进加成汇总的键）
  - `suitPct(list: ActiveSuit[]): { cook; cutting; fire; season }`
  - `attrSummary(points: EquipAttrs, gear: EquipAttrs, pct): { total: EquipAttrs; power: number }`
  - `type EquipTuning = Tuning['equip']`

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/rules.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { luckRate, sequenceRng } from '@dt/shared';
import type { EquipDef, SuitDef } from '@dt/config';
import { testConfig } from '../../../test/config';
import {
  activeSuits,
  attrSeq,
  attrSummary,
  gemLevelUp,
  rollEquipAttrs,
  rollStress,
  stressGain,
  stressRate,
  suitAggEffects,
  suitPct,
} from './rules';

const t = testConfig().tuning.equip;
const range = (min: number, max: number): [number, number] => [min, max];

describe('生成（规格书 07 §7.7）', () => {
  it('部位属性顺序：主属性在第一位', () => {
    expect(attrSeq(1)).toEqual(['cook', 'cutting', 'fire', 'season', 'luck', 'creatives']);
    expect(attrSeq(5)).toEqual(['creatives', 'cook', 'cutting', 'fire', 'season', 'luck']);
    expect(() => attrSeq(6)).toThrow();
  });

  it('固定属性原样生成', () => {
    const def: EquipDef = {
      part: 1, essence: 1, hole: 0, maxHole: 0, minLevel: 0, suitId: 0, total: null,
      ranges: { cook: 3, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 },
    };
    expect(rollEquipAttrs(def, sequenceRng([0.9]))).toEqual({
      cook: 3, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0,
    });
  });

  it('有 total：按部位顺序在范围内随机、从 total 里扣，扣完后面为 0，最后一项取剩余', () => {
    const def: EquipDef = {
      part: 3, essence: 12, hole: 1, maxHole: 3, minLevel: 13, suitId: 5, total: 25,
      ranges: {
        cook: range(0, 25), cutting: range(0, 25), fire: range(0, 25),
        season: range(0, 25), creatives: range(0, 25), luck: range(0, 25),
      },
    };
    // 锅的顺序：火候 调味 厨艺 刀工 幸运 创意；rand = ⌊0.4×26⌋ = 10
    const a = rollEquipAttrs(def, sequenceRng([0.4]));
    expect(a).toEqual({ fire: 10, season: 10, cook: 5, cutting: 0, luck: 0, creatives: 0 });
    // 每项都很小时最后一项拿走剩余
    const b = rollEquipAttrs(def, sequenceRng([0.05]));
    expect(b.fire + b.season + b.cook + b.cutting + b.luck).toBe(5);
    expect(b.creatives).toBe(20);
  });
});

describe('强化（规格书 07 §7.7）', () => {
  it('成功率 = 基础 + 幸运率/(等级+1)/4 + 天气 + 连续失败×1%', () => {
    const r = stressRate(2, 100, 0.1, 3, t);
    expect(r.base).toBeCloseTo(0.64);
    expect(r.luck).toBeCloseTo(luckRate(100) / 3 / 4);
    expect(r.weather).toBe(0.1);
    expect(r.floor).toBeCloseTo(0.03);
    expect(r.total).toBeCloseTo(0.64 + luckRate(100) / 12 + 0.1 + 0.03);
  });

  it('幸运标记：只靠幸运才成功；保底标记：只靠连续失败才成功；强化石必成', () => {
    const rate = { base: 0.5, luck: 0.1, weather: 0, floor: 0.1, total: 0.7 };
    expect(rollStress(rate, false, sequenceRng([0.45]))).toEqual({ success: true, lucky: false, floor: false });
    expect(rollStress(rate, false, sequenceRng([0.55]))).toEqual({ success: true, lucky: true, floor: false });
    expect(rollStress(rate, false, sequenceRng([0.65]))).toEqual({ success: true, lucky: true, floor: true });
    expect(rollStress(rate, false, sequenceRng([0.75]))).toEqual({ success: false, lucky: false, floor: false });
    expect(rollStress(rate, true, sequenceRng([0.99]))).toEqual({ success: true, lucky: false, floor: false });
  });

  it('选属性：按顺序每项 50%，都没选中取最后一项；增量 rand[1, 主属性]，强化石 +1 不超过主属性', () => {
    // 刀：刀工 火候 调味 厨艺 幸运 创意；0.7 跳过刀工，0.3 选中火候；增量 ⌊0.5×9⌋ = 4
    expect(stressGain(2, 8, false, sequenceRng([0.7, 0.3, 0.5]))).toEqual({ attr: 'fire', val: 4 });
    expect(stressGain(2, 8, true, sequenceRng([0.7, 0.3, 0.5]))).toEqual({ attr: 'fire', val: 5 });
    // 都没选中 → 创意；增量 ⌊0.9×9⌋ = 8 已经等于主属性，强化石不再 +1
    expect(stressGain(2, 8, true, sequenceRng([0.9]))).toEqual({ attr: 'creatives', val: 8 });
    // 主属性为 0 时增量至少 1
    expect(stressGain(1, 0, false, sequenceRng([0.1])).val).toBe(1);
  });
});

describe('宝石升阶（规格书 07 §7.7）', () => {
  it('每组独立：成功 / 幸运补救 / 失败', () => {
    // 1 阶成功率 0.95 − 0.18 = 0.77；幸运率 0.2
    const r = gemLevelUp(3, 1, 0, 0.2, t, sequenceRng([0.5, 0.9, 0.1, 0.9, 0.9]));
    expect(r).toEqual({ success: 2, lucky: 1, fail: 1 });
  });
});

describe('套装（规格书 20 §20.15）', () => {
  const suits = new Map<number, SuitDef>([
    [
      100,
      {
        id: 100,
        name: '真爱套装',
        maxNum: 5,
        tiers: [
          { need: 3, desc: '', effects: { atRate: 0.05, spRate: 0.03 } },
          { need: 5, desc: '', effects: { coinRate: 0.05, luckValue: 52 } },
        ],
      },
    ],
    [6, { id: 6, name: '裁决套装', maxNum: 3, tiers: [{ need: 2, desc: '', effects: { cookPct: 0.05, seasonPct: 0.06 } }] }],
  ]);

  it('按件数激活档位，达到的档位都生效；0 / 90 / 99 和未知套装不算', () => {
    const r = activeSuits([100, 100, 100, 0, 90], suits);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ count: 3, active: [true, false] });
    expect(activeSuits([100, 100, 100, 100, 100], suits)[0]!.active).toEqual([true, true]);
    expect(activeSuits([99, 777], suits)).toEqual([]);
  });

  it('进加成汇总的键不含 Pct、进攻 / 防守、探险', () => {
    expect(
      suitAggEffects({
        atRate: 0.08,
        cookPct: 0.1,
        attackFire: 0.08,
        defendCutting: 0.04,
        exploreSuccessRate: 0.02,
        operFoodsAddRate: 0.05,
      }),
    ).toEqual({ atRate: 0.08, operFoodsAddRate: 0.05 });
  });

  it('属性百分比只取激活的档位', () => {
    expect(suitPct(activeSuits([6, 6], suits))).toEqual({ cook: 0.05, cutting: 0, fire: 0, season: 0.06 });
    expect(suitPct(activeSuits([6], suits))).toEqual({ cook: 0, cutting: 0, fire: 0, season: 0 });
  });
});

describe('属性和厨力（规格书 20 §20.18）', () => {
  it('(加点 + 厨具) × (1 + 套装百分比) 四舍五入；厨力 = 五项之和 + ⌊幸运/2⌋', () => {
    const r = attrSummary(
      { cook: 5, cutting: 0, fire: 3, season: 0, creatives: 0, luck: 10 },
      { cook: 10, cutting: 4, fire: 0, season: 6, creatives: 2, luck: 7 },
      { cook: 0.1, cutting: 0, fire: 0, season: 0.06 },
    );
    expect(r.total).toEqual({ cook: 17, cutting: 4, fire: 3, season: 6, creatives: 2, luck: 17 });
    expect(r.power).toBe(17 + 4 + 3 + 6 + 2 + 8);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/rules.test.ts`
Expected: FAIL，`Cannot find module './rules'`

- [ ] **Step 3: 实现 `apps/server/src/modules/equip/rules.ts`**

```ts
import {
  EQUIP_ATTRS,
  NON_SUIT_IDS,
  type EquipAttr,
  type EquipAttrs,
  type EquipDef,
  type SuitDef,
  type Tuning,
} from '@dt/config';
import { luckRate as toLuckRate, type Rng } from '@dt/shared';

export type EquipTuning = Tuning['equip'];

/** 各部位生成随机属性、强化选属性时的顺序，主属性在第一位（原版 DtRestEquip.getAttrSeq） */
const SEQ: Record<number, readonly EquipAttr[]> = {
  1: ['cook', 'cutting', 'fire', 'season', 'luck', 'creatives'],
  2: ['cutting', 'fire', 'season', 'cook', 'luck', 'creatives'],
  3: ['fire', 'season', 'cook', 'cutting', 'luck', 'creatives'],
  4: ['season', 'cook', 'cutting', 'fire', 'luck', 'creatives'],
  5: ['creatives', 'cook', 'cutting', 'fire', 'season', 'luck'],
};

export function attrSeq(part: number): readonly EquipAttr[] {
  const s = SEQ[part];
  if (!s) throw new Error(`bad equip part ${part}`);
  return s;
}

export function zeroAttrs(): EquipAttrs {
  return { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
}

export function addAttrs(a: EquipAttrs, b: EquipAttrs): EquipAttrs {
  const out = zeroAttrs();
  for (const k of EQUIP_ATTRS) out[k] = a[k] + b[k];
  return out;
}

/** 获得厨具时生成基础属性（原版 Tools.createEquipForStore） */
export function rollEquipAttrs(def: EquipDef, rng: Rng): EquipAttrs {
  const out = zeroAttrs();
  const seq = attrSeq(def.part);
  if (def.total === null) {
    for (const a of seq) {
      const r = def.ranges[a];
      out[a] = typeof r === 'number' ? r : r[0];
    }
    return out;
  }
  let left = def.total;
  seq.forEach((a, i) => {
    if (i === seq.length - 1) {
      out[a] = left;
      return;
    }
    const r = def.ranges[a];
    if (left === 0 || typeof r === 'number') return;
    const v = Math.min(r[0] + rng.int(r[1] - r[0] + 1), left);
    out[a] = v;
    left -= v;
  });
  return out;
}

export interface StressRate {
  base: number;
  luck: number;
  weather: number;
  floor: number;
  total: number;
}

/** 强化成功率分项（规格书 07 §7.7） */
export function stressRate(
  stress: number,
  luckSum: number,
  weatherRate: number,
  failStreak: number,
  t: EquipTuning,
): StressRate {
  const base = t.baseRate - t.ratePerStress * stress;
  const luck = toLuckRate(luckSum) / (stress + 1) / 4;
  const floor = failStreak * t.floorPerFail;
  return { base, luck, weather: weatherRate, floor, total: base + luck + weatherRate + floor };
}

/** 掷一次：幸运 = 只靠幸运那部分才成功；保底 = 只靠连续失败那部分才成功（原版 stressEquip） */
export function rollStress(
  rate: StressRate,
  stone: boolean,
  rng: Rng,
): { success: boolean; lucky: boolean; floor: boolean } {
  if (stone) return { success: true, lucky: false, floor: false };
  const r = rng.next();
  const success = r < rate.total;
  return {
    success,
    lucky: success && r >= rate.base + rate.weather,
    floor: success && r >= rate.base + rate.weather + rate.luck,
  };
}

/** 强化成功时加哪一项、加多少（原版 Tools.stressUpEquip） */
export function stressGain(
  part: number,
  mainBase: number,
  stone: boolean,
  rng: Rng,
): { attr: EquipAttr; val: number } {
  const seq = attrSeq(part);
  let attr = seq[seq.length - 1]!;
  for (const a of seq) {
    if (rng.next() < 0.5) {
      attr = a;
      break;
    }
  }
  const cap = Math.max(1, mainBase);
  let val = Math.max(1, rng.int(cap + 1));
  if (stone && val < cap) val += 1;
  return { attr, val };
}

export function gemRate(level: number, weatherRate: number, t: EquipTuning): number {
  return t.gemBaseRate - t.gemRatePerLevel * level + weatherRate;
}

/** 宝石升阶：每组独立，失败后再以幸运率补救（原版 levelUpGem） */
export function gemLevelUp(
  num: number,
  level: number,
  weatherRate: number,
  luckRate: number,
  t: EquipTuning,
  rng: Rng,
): { success: number; lucky: number; fail: number } {
  const base = gemRate(level, weatherRate, t);
  let success = 0;
  let lucky = 0;
  let fail = 0;
  for (let i = 0; i < num; i++) {
    if (rng.next() < base) success++;
    else if (rng.chance(luckRate)) {
      success++;
      lucky++;
    } else fail++;
  }
  return { success, lucky, fail };
}

export interface ActiveSuit {
  suit: SuitDef;
  count: number;
  /** 与 suit.tiers 一一对应 */
  active: boolean[];
}

/** 穿戴中各套装的件数和激活档位；0、90、99 和配置里没有的不算套装 */
export function activeSuits(suitIds: number[], suits: ReadonlyMap<number, SuitDef>): ActiveSuit[] {
  const counts = new Map<number, number>();
  for (const id of suitIds) {
    if (NON_SUIT_IDS.has(id) || !suits.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([id, count]) => {
      const suit = suits.get(id)!;
      return { suit, count, active: suit.tiers.map((tier) => count >= tier.need) };
    });
}

/** 进加成汇总的套装键（设计文档 裁定 2）：属性百分比、进攻 / 防守、探险留给展示和子项目 4 */
export function suitAggEffects(effects: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(effects)) {
    if (k.endsWith('Pct') || k.startsWith('attack') || k.startsWith('defend') || k === 'exploreSuccessRate')
      continue;
    out[k] = v;
  }
  return out;
}

export function suitPct(list: ActiveSuit[]): { cook: number; cutting: number; fire: number; season: number } {
  const out = { cook: 0, cutting: 0, fire: 0, season: 0 };
  for (const s of list) {
    s.suit.tiers.forEach((tier, i) => {
      if (!s.active[i]) return;
      out.cook += tier.effects.cookPct ?? 0;
      out.cutting += tier.effects.cuttingPct ?? 0;
      out.fire += tier.effects.firePct ?? 0;
      out.season += tier.effects.seasonPct ?? 0;
    });
  }
  return out;
}

/** 餐厅属性 = (加点 + 厨具) × (1 + 套装百分比)；厨力 = 五项之和 + ⌊幸运/2⌋（规格书 20 §20.18） */
export function attrSummary(
  points: EquipAttrs,
  gear: EquipAttrs,
  pct: { cook: number; cutting: number; fire: number; season: number },
): { total: EquipAttrs; power: number } {
  const total = addAttrs(points, gear);
  for (const k of ['cook', 'cutting', 'fire', 'season'] as const) total[k] = Math.round(total[k] * (1 + pct[k]));
  const power =
    total.cook + total.cutting + total.fire + total.season + total.creatives + Math.floor(total.luck / 2);
  return { total, power };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/rules.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps/server/src/modules/equip
git commit -m "feat(equip): pure rules for rolling stats, enhancement, gem tier-up, sets and attribute totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 厨具实例、发放生成实例、仓库容量、旧数据转换

**Files:**
- Create: `apps/server/src/modules/equip/instances.ts`, `apps/server/src/modules/equip/jobs.ts`, `apps/server/src/modules/equip/grant.test.ts`
- Modify: `apps/server/src/modules/store/grant.ts`, `apps/server/src/modules/store/goods.ts`, `apps/server/src/modules/store/service.ts`, `packages/shared/src/schemas/store.ts`, `apps/server/src/game.ts`, `apps/web/src/views/StoreView.test.ts`

**Interfaces:**
- Consumes: Task 2 的表；Task 3 的 `rollEquipAttrs`、`zeroAttrs`、`addAttrs`
- Produces:
  - `attrCols(prefix: 'base_' | 'st_', a: EquipAttrs)`：插入 / 更新用的列对象
  - `baseAttrs(e: EquipRow)`、`boostAttrs(e: EquipRow)`、`gemAttrs(gems: EquipGemRow[])`、`pieceTotal(e, gems)`：`EquipAttrs`
  - `createEquips(db, config, restId, goodsId, num, now, rng): Promise<number[]>`
  - `loadGems(db, equipIds: number[]): Promise<Map<number, EquipGemRow[]>>`
  - `convertLegacyEquips(db, config, shardId): Promise<number>`
  - `equipJobs(d: GameDeps): PeriodicJob[]`（`equip-convert`）
  - `grantGoods(..., opts: { hours?; rng? })`：厨具生成实例，返回 `{ granted: num, dropped: 0, expiresAt: null }`
  - `looseEquipCount(db, restId): Promise<number>`（store/goods.ts）
  - `StoreDto.equips: number`（未穿戴的厨具件数，也计入 `kinds`）

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/grant.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { grantGoodsOp } from '../store/goods';
import { convertLegacyEquips } from './instances';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const equips = (restId: number) =>
  t.db.selectFrom('equip').selectAll().where('rest_id', '=', restId).orderBy('id').execute();
const grant = (ctx: RestCtx, goodsId: number, num: number) =>
  runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, (op) => grantGoodsOp(op, goodsId, num));

describe('发放厨具生成实例（设计文档 §4.2）', () => {
  it('固定属性：每件一个实例，不进仓库表', async () => {
    const ctx = await newRestaurant(t);
    await grant(ctx, 30, 2);
    const rows = await equips(ctx.restaurantId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ goods_id: 30, part: 1, base_cook: 3, stress: 0, worn: false, max_hole: 0 });
    expect(await goodsNum(t, ctx.restaurantId, 30)).toBe(0);
  });

  it('随机属性：总和等于 total，孔位、等级门槛、套装取自道具', async () => {
    const ctx = await newRestaurant(t);
    await grant(ctx, 56, 1);
    const [e] = await equips(ctx.restaurantId);
    const sum = e!.base_cook + e!.base_cutting + e!.base_fire + e!.base_season + e!.base_creatives + e!.base_luck;
    expect(sum).toBe(25);
    expect(e).toMatchObject({ part: 3, cur_hole: 1, max_hole: 3, min_level: 13, suit_id: 5 });
  });

  it('仓库满了照发：一次 10 件都生成（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: { store_num: 1 }, goods: { 85: 1 } });
    await grant(ctx, 30, 10);
    expect(await equips(ctx.restaurantId)).toHaveLength(10);
  });

  it('商店买厨具生成实例；未穿戴的厨具占仓库格，满了不能再买', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, store_num: 2 }, goods: { 85: 1 } });
    await t.game.shop.buy(ctx, { goodsId: 30, num: 1 });
    expect(await equips(ctx.restaurantId)).toHaveLength(1);
    const list = await t.game.store.list(ctx, {});
    expect(list).toMatchObject({ kinds: 2, equips: 1 });
    await expect(t.game.shop.buy(ctx, { goodsId: 31, num: 1 })).rejects.toMatchObject({ code: 'STORE_FULL' });
    await t.db.updateTable('equip').set({ worn: true }).where('rest_id', '=', ctx.restaurantId).execute();
    expect((await t.game.store.list(ctx, {})).kinds).toBe(1);
  });
});

describe('旧数据转换（计划裁定 2）', () => {
  it('仓库表里的厨具按数量转成实例，再跑一次不重复', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, goods: { 30: 2, 56: 1, 85: 3 } });
    expect(await convertLegacyEquips(t.db, t.deps.config, shardId)).toBe(3);
    expect((await equips(ctx.restaurantId)).map((e) => e.goods_id).sort()).toEqual([30, 30, 56]);
    expect(await goodsNum(t, ctx.restaurantId, 30)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 85)).toBe(3);
    expect(await convertLegacyEquips(t.db, t.deps.config, shardId)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/grant.test.ts`
Expected: FAIL，`Cannot find module './instances'`

- [ ] **Step 3: 实现**

`apps/server/src/modules/equip/instances.ts`：

```ts
import type { Kysely } from 'kysely';
import { EQUIP_ATTRS, GOODS_TYPE, type EquipAttr, type EquipAttrs, type GameConfig } from '@dt/config';
import { hashSeed, seededRng, type Rng } from '@dt/shared';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { withRestaurant } from '../../db/tx';
import { addAttrs, rollEquipAttrs, zeroAttrs } from './rules';

type Prefix = 'base_' | 'st_';

export function attrCols<P extends Prefix>(prefix: P, a: EquipAttrs): Record<`${P}${EquipAttr}`, number> {
  return Object.fromEntries(EQUIP_ATTRS.map((k) => [`${prefix}${k}`, a[k]])) as Record<
    `${P}${EquipAttr}`,
    number
  >;
}

function readCols(e: EquipRow, prefix: Prefix): EquipAttrs {
  const out = zeroAttrs();
  for (const k of EQUIP_ATTRS) out[k] = e[`${prefix}${k}`];
  return out;
}

export const baseAttrs = (e: EquipRow): EquipAttrs => readCols(e, 'base_');
export const boostAttrs = (e: EquipRow): EquipAttrs => readCols(e, 'st_');

export function gemAttrs(gems: readonly EquipGemRow[]): EquipAttrs {
  const out = zeroAttrs();
  for (const g of gems) for (const k of EQUIP_ATTRS) out[k] += g[k];
  return out;
}

/** 单件属性 = 基础 + 强化增量 + 宝石 */
export function pieceTotal(e: EquipRow, gems: readonly EquipGemRow[]): EquipAttrs {
  return addAttrs(addAttrs(baseAttrs(e), boostAttrs(e)), gemAttrs(gems));
}

/** 生成 num 件厨具实例（规格书 07 §7.7） */
export async function createEquips(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  num: number,
  now: Date,
  rng: Rng,
): Promise<number[]> {
  const def = config.requireGoods(goodsId).equip;
  if (!def) throw new Error(`goods ${goodsId} is not equip`);
  const ids: number[] = [];
  for (let i = 0; i < num; i++) {
    const row = await db
      .insertInto('equip')
      .values({
        rest_id: restId,
        goods_id: goodsId,
        part: def.part,
        suit_id: def.suitId,
        min_level: def.minLevel,
        cur_hole: def.hole,
        max_hole: def.maxHole,
        acquired_at: now,
        ...attrCols('base_', rollEquipAttrs(def, rng)),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    ids.push(row.id);
  }
  return ids;
}

export async function loadGems(db: Kysely<DB>, equipIds: number[]): Promise<Map<number, EquipGemRow[]>> {
  const out = new Map<number, EquipGemRow[]>();
  if (equipIds.length === 0) return out;
  const rows = await db
    .selectFrom('equip_gem')
    .selectAll()
    .where('equip_id', 'in', equipIds)
    .orderBy('id')
    .execute();
  for (const r of rows) out.set(r.equip_id, [...(out.get(r.equip_id) ?? []), r]);
  return out;
}

/** 旧版把厨具当普通道具存在 store_item 里：按数量转成实例（计划裁定 2），幂等 */
export async function convertLegacyEquips(db: Kysely<DB>, config: GameConfig, shardId: number): Promise<number> {
  const ids = config.bundle.goods.filter((g) => g.type === GOODS_TYPE.equip).map((g) => g.id);
  const rows = await db
    .selectFrom('store_item as s')
    .innerJoin('restaurant as r', 'r.id', 's.rest_id')
    .select(['s.rest_id', 's.goods_id'])
    .where('r.shard_id', '=', shardId)
    .where('s.goods_id', 'in', ids)
    .execute();
  const byRest = new Map<number, number[]>();
  for (const r of rows) byRest.set(r.rest_id, [...(byRest.get(r.rest_id) ?? []), r.goods_id]);
  let made = 0;
  for (const [restId, goodsIds] of byRest) {
    made += await withRestaurant(db, restId, async (tx) => {
      let n = 0;
      for (const goodsId of goodsIds) {
        const del = await tx
          .deleteFrom('store_item')
          .where('rest_id', '=', restId)
          .where('goods_id', '=', goodsId)
          .returning('num')
          .executeTakeFirst();
        if (!del || del.num <= 0) continue;
        const rng = seededRng(hashSeed(restId, goodsId, 'legacy-equip'));
        await createEquips(tx, config, restId, goodsId, del.num, new Date(), rng);
        n += del.num;
      }
      return n;
    });
  }
  return made;
}
```

`apps/server/src/modules/equip/jobs.ts`：

```ts
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { convertLegacyEquips } from './instances';

const HOUR = 3_600_000;

export function equipJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 每小时：把旧版存在仓库表里的厨具转成实例（计划裁定 2）；没有旧数据时是一次空查询
      name: 'equip-convert',
      feature: 'store',
      period: (now) => String(Math.floor(now.getTime() / HOUR)),
      run: async ({ shardId }) => ({ converted: await convertLegacyEquips(d.db, d.config, shardId) }),
    },
  ];
}
```

`apps/server/src/game.ts`：`import { equipJobs } from './modules/equip/jobs';`，在 `jobs.push(friendWeeklyJob(deps));` 后面加 `jobs.push(...equipJobs(deps));`。

`apps/server/src/modules/store/grant.ts`：
1. import 加 `import { hashSeed, seededRng, type Rng } from '@dt/shared';` 和 `import { createEquips } from '../equip/instances';`
2. `opts: { hours?: number | null } = {}` 改成 `opts: { hours?: number | null; rng?: Rng } = {}`
3. `const g = config.requireGoods(goodsId);` 后面加：

```ts
  if (g.type === GOODS_TYPE.equip) {
    // 厨具每件是一个实例，不进仓库表（设计文档 §4.2）；仓库满了也照发
    const rng = opts.rng ?? seededRng(hashSeed(restId, goodsId, now.getTime(), 'equip'));
    await createEquips(db, config, restId, goodsId, num, now, rng);
    return { granted: num, dropped: 0, expiresAt: null };
  }
```

`apps/server/src/modules/store/goods.ts`：
1. `grantGoodsOp` 里的 `{ hours: opts.hours }` 改成 `{ hours: opts.hours, rng: op.rng }`
2. `storeKinds` 换成下面两个函数（顶部补 `import type { Kysely } from 'kysely';`、`import type { DB } from '../../db/schema';`）：

```ts
/** 仓库占用 = 持有的不同非勋章道具种数 + 未穿戴的厨具件数（2A 裁定 6，2B 裁定 7） */
export async function storeKinds(op: Op): Promise<number> {
  const rows = await op.tx
    .selectFrom('store_item')
    .select('goods_id')
    .where('rest_id', '=', op.rest.id)
    .where('num', '>', 0)
    .execute();
  const kinds = rows.filter((r) => op.config.goods.get(r.goods_id)?.type !== GOODS_TYPE.honor).length;
  return kinds + (await looseEquipCount(op.tx, op.rest.id));
}

/** 未穿戴的厨具件数 */
export async function looseEquipCount(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('equip')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', restId)
    .where('worn', '=', false)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}
```

3. `assertStoreRoom` 里 `if ((await countGoods(op, goodsId)) > 0) return;` 改成 `if (g.type !== GOODS_TYPE.equip && (await countGoods(op, goodsId)) > 0) return;`（厨具每件都占新格）

`apps/server/src/modules/store/service.ts` 的 `list`：import `looseEquipCount`；`const kinds = rows.filter(...).length; return {...}` 改成：

```ts
      const equips = await looseEquipCount(d.db, ctx.restaurantId);
      const kinds =
        rows.filter((r) => d.config.goods.get(r.goods_id)?.type !== GOODS_TYPE.honor).length + equips;
      return { kinds, storeNum: rest.store_num, equips, items };
```

`packages/shared/src/schemas/store.ts` 的 `StoreDto` 加：

```ts
  /** 未穿戴的厨具件数（在厨具页，占仓库格） */
  equips: number;
```

`apps/web/src/views/StoreView.test.ts` 的 `data` 夹具加 `equips: 0,`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ src/modules/store/ src/modules/shop/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps packages
git commit -m "feat(equip): granted cookware becomes rolled instances, loose pieces take warehouse room, hourly job converts old counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 接口类型、加成同步、穿戴、概览和列表、路由和装配

**Files:**
- Create: `packages/shared/src/schemas/equip.ts`, `apps/server/src/modules/equip/effects.ts`, `apps/server/src/modules/equip/service.ts`, `apps/server/src/modules/equip/routes.ts`, `apps/server/src/modules/equip/wear.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/schemas/world.ts`, `apps/server/src/modules/world/service.ts`, `apps/server/src/game.ts`, `apps/server/src/modules/index.ts`

**Interfaces:**
- Consumes: Task 3 `activeSuits`、`suitAggEffects`、`suitPct`、`attrSummary`、`addAttrs`、`zeroAttrs`；Task 4 `loadGems`、`pieceTotal`、`baseAttrs`、`boostAttrs`、`gemAttrs`
- Produces:
  - `syncEquipEffects(op: Op): Promise<void>`（effects.ts）
  - `createEquipService(d: GameDeps, world: WorldService)`，`type EquipService`；本任务的方法：`overview(ctx)`、`list(ctx, { part? })`、`wear(ctx, { id })`、`unwear(ctx, { id })`、`unwearAll(ctx)`
  - service.ts 内部工具（后面任务继续用）：`own(o, id): Promise<EquipRow>`、`putOn(o, e)`、`notFound(what, id)`、`presetNames(db, restId)`、`listPresets(db, restId)`、`toEquipDto(d, tuning, e, gems, presets)`、`PART_COLS`、`op(ctx, source, fn)`（`own`、`putOn`、`op` 是 `createEquipService` 里的闭包函数，不放进返回对象）
  - `equipRoutes(svc): FastifyPluginAsync`，挂在 `/api/v1`
  - `Game.equip: EquipService`
  - shared：本任务定义的所有 body 和 DTO（后面任务直接用），见 Step 3

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/wear.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../effects/service';
import { settleShardRound } from '../settlement/runner';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const eq = () => t.game.equip;
/** 直接写一件厨具（属性可指定），返回 id */
async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: ctx.restaurantId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      min_level: def.minLevel,
      cur_hole: def.hole,
      max_hole: def.maxHole,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const agg = (ctx: RestCtx) =>
  getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
const wornIds = async (ctx: RestCtx) =>
  (
    await t.db
      .selectFrom('equip')
      .select('id')
      .where('rest_id', '=', ctx.restaurantId)
      .where('worn', '=', true)
      .orderBy('id')
      .execute()
  ).map((r) => r.id);

describe('穿戴（设计文档 §3.10）', () => {
  it('等级不够不能穿；同部位已有的自动换下', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1 } });
    const a = await piece(ctx, 56);
    await expect(eq().wear(ctx, { id: a })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'level', need: 13 },
    });
    await t.db.updateTable('restaurant').set({ level: 20 }).where('id', '=', ctx.restaurantId).execute();
    await eq().wear(ctx, { id: a });
    const b = await piece(ctx, 56);
    await eq().wear(ctx, { id: b });
    expect(await wornIds(ctx)).toEqual([b]);
  });

  it('卸下、全部卸下；卸下没穿的报 not_worn；别人的厨具报 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    const [a, b] = [await piece(ctx, 30), await piece(ctx, 31)];
    await eq().wear(ctx, { id: a });
    await eq().wear(ctx, { id: b });
    await eq().unwear(ctx, { id: a });
    expect(await wornIds(ctx)).toEqual([b]);
    await expect(eq().unwear(ctx, { id: a })).rejects.toMatchObject({ params: { reason: 'not_worn' } });
    await eq().unwearAll(ctx);
    expect(await wornIds(ctx)).toEqual([]);
    const other = await newRestaurant(t);
    await expect(eq().wear(other, { id: a })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('穿上后厨具幸运进加成汇总，卸下后去掉', async () => {
    const ctx = await newRestaurant(t);
    const before = (await agg(ctx)).luckValue ?? 0;
    const a = await piece(ctx, 30, { base_luck: 5, st_luck: 2 });
    await eq().wear(ctx, { id: a });
    expect((await agg(ctx)).luckValue).toBe(before + 7);
    await eq().unwear(ctx, { id: a });
    expect((await agg(ctx)).luckValue ?? 0).toBe(before);
  });

  it('真爱套装：3 件上座 +5%、挑剔 +3%；5 件再加最终银币 +5%、幸运 +52', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13 } });
    const base = await agg(ctx);
    for (const g of [62, 103, 64]) await eq().wear(ctx, { id: await piece(ctx, g) });
    const three = await agg(ctx);
    expect((three.atRate ?? 0) - (base.atRate ?? 0)).toBeCloseTo(0.05);
    expect((three.spRate ?? 0) - (base.spRate ?? 0)).toBeCloseTo(0.03);
    for (const g of [105, 63]) await eq().wear(ctx, { id: await piece(ctx, g) });
    const five = await agg(ctx);
    expect((five.coinRate ?? 0) - (base.coinRate ?? 0)).toBeCloseTo(0.05);
    expect((five.luckValue ?? 0) - (base.luckValue ?? 0)).toBe(52);
  });

  it('结算用上厨具幸运', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { oil: 1000 } });
    await eq().wear(ctx, { id: await piece(ctx, 30, { base_luck: 30 }) });
    await settleShardRound(t.game.deps, t.game.world, shardId, roundOf(new Date()), new Date());
    const row = await t.db
      .selectFrom('income_round')
      .select('rates')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const rates = row.rates as { luck: { parts: Record<string, number> } };
    expect(rates.luck.parts.effects).toBe(30);
  });

  it('概览：5 个部位、套装状态、属性（加点 + 厨具）和厨力', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13, attr_cook: 4, luck: 10 } });
    await eq().wear(ctx, { id: await piece(ctx, 30, { base_cook: 3, st_cook: 2 }) });
    const o = await eq().overview(ctx);
    expect(o.worn.map((w) => w?.goodsId ?? null)).toEqual([30, null, null, null, null]);
    expect(o.worn[0]).toMatchObject({ stress: 0, base: { cook: 3 }, boost: { cook: 2 }, total: { cook: 5 } });
    expect(o.attrs.gear.cook).toBe(5);
    expect(o.attrs.total.cook).toBe(9);
    expect(o.attrs.power).toBe(9 + 5);
    expect(o.suits).toEqual([]);
    expect(o.count).toBe(1);
    const list = await eq().list(ctx, { part: 1 });
    expect(list.map((x) => x.goodsId)).toEqual([30]);
    expect(await eq().list(ctx, { part: 2 })).toEqual([]);
  });

  it('功能关闭时读写接口都返回 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { equip: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const ctx = await newRestaurant(t, { shardId });
    await expect(eq().overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(eq().unwearAll(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/wear.test.ts`
Expected: FAIL，`t.game.equip` 为 undefined

- [ ] **Step 3: 实现**

新建 `packages/shared/src/schemas/equip.ts`（后面各任务的 body 和 DTO 都在这里）：

```ts
import { z } from 'zod';

const id = z.number().int().positive();
export const equipIdBody = z.object({ id });
export const equipIdParam = z.object({ id: z.coerce.number().int().positive() });
export const equipListQuery = z.object({ part: z.coerce.number().int().min(1).max(5).optional() });
export const stressBody = z.object({ id, stone: z.boolean().default(false) });
export const rollbackBody = z.object({ id, goodsId: id });
export const lockBody = z.object({ id, locked: z.boolean() });
export const inlayBody = z.object({ id, gemId: id });
export const ungemBody = z.object({ gemRowId: id });
export const equipBatchBody = z.object({ ids: z.array(id).min(1).max(200), way: z.enum(['salvage', 'sell']) });
export const gemLevelUpBody = z.object({ goodsId: id, num: z.number().int().min(1).max(99) });
export const presetSaveBody = z.object({ name: z.string().trim().min(1).max(12) });

export interface AttrsDto {
  cook: number;
  cutting: number;
  fire: number;
  season: number;
  creatives: number;
  luck: number;
}

export interface EquipGemDto {
  /** equip_gem 行 id（摘除时用） */
  id: number;
  goodsId: number;
  level: number;
  attrs: AttrsDto;
}

export interface EquipDto {
  id: number;
  goodsId: number;
  /** 1 铲 2 刀 3 锅 4 瓶 5 帽 */
  part: number;
  suitId: number;
  minLevel: number;
  /** 强化等级 0~10 */
  stress: number;
  curHole: number;
  maxHole: number;
  locked: boolean;
  worn: boolean;
  /** 所在预设的名称 */
  inPresets: string[];
  base: AttrsDto;
  /** 强化累计增量 */
  boost: AttrsDto;
  gem: AttrsDto;
  total: AttrsDto;
  gems: EquipGemDto[];
  /** 分解能得到的精华 */
  salvage: number;
  /** 出售价；不能卖为 null */
  sellPrice: number | null;
}

export interface SuitStatusDto {
  suitId: number;
  name: string;
  count: number;
  maxNum: number;
  tiers: Array<{ need: number; desc: string; active: boolean }>;
}

export interface EquipPresetDto {
  id: number;
  name: string;
  /** 下标 0~4 = 部位 1~5 的厨具 id */
  parts: Array<number | null>;
}

export interface EquipOverviewDto {
  /** 下标 0~4 = 部位 1~5 */
  worn: Array<EquipDto | null>;
  suits: SuitStatusDto[];
  attrs: { points: AttrsDto; gear: AttrsDto; total: AttrsDto; power: number };
  presets: EquipPresetDto[];
  /** 持有的厨具件数 */
  count: number;
  level: number;
}

export interface StressRateDto {
  base: number;
  luck: number;
  weather: number;
  floor: number;
  total: number;
}

export interface StressLogDto {
  stress: number;
  success: boolean;
  attr: string | null;
  val: number;
  lucky: boolean;
  floor: boolean;
  stone: boolean;
  at: string;
}

export interface EquipDetailDto {
  equip: EquipDto;
  /** 下一级成功率；已满级为 null */
  rate: StressRateDto | null;
  /** 强化一次的花费 */
  cost: { essence: number; coin: number };
  history: StressLogDto[];
  have: { essence: number; stone: number; drill: number };
  /** 持有的回退道具 */
  backItems: Array<{ goodsId: number; num: number; back: number }>;
  /** 持有的宝石（镶嵌时选） */
  gems: Array<{ goodsId: number; num: number; level: number }>;
  /** 摘除一颗宝石的银币（按阶数算之前的单价；0 = 免费） */
  ungemCoinPerLevel: number;
}

export interface StressResultDto {
  success: boolean;
  lucky: boolean;
  floor: boolean;
  attr: string | null;
  val: number;
  stress: number;
}

export interface GemItemDto {
  goodsId: number;
  num: number;
  level: number;
  nextId: number | null;
  /** 不含幸运补救的成功率 */
  rate: number;
  attrs: AttrsDto;
}

export interface GemsDto {
  items: GemItemDto[];
  /** 失败后幸运补救的概率 */
  luckRate: number;
  strength: number;
}

export interface GemLevelUpDto {
  success: number;
  lucky: number;
  fail: number;
  exp: number;
}

export interface EquipBatchDto {
  count: number;
  essence: number;
  coin: number;
}
```

`packages/shared/src/index.ts` 加 `export * from './schemas/equip';`。

`packages/shared/src/schemas/world.ts`：`CatalogGoodsDto` 加

```ts
  /** 厨具：部位、等级门槛、套装、强化一次的精华、最大孔数 */
  equip?: { part: number; minLevel: number; suitId: number; essence: number; maxHole: number };
  /** 宝石：阶数、下一阶 */
  gem?: { level: number; nextId: number | null };
```

`CatalogDto` 加

```ts
  /** 厨具套装；旧缓存里没有 */
  suits?: Array<{ id: number; name: string; maxNum: number; tiers: Array<{ need: number; desc: string }> }>;
```

`apps/server/src/modules/world/service.ts` 的 `catalog()`：goods 映射里 `stackable: g.stackable,` 后面加

```ts
          ...(g.equip
            ? {
                equip: {
                  part: g.equip.part,
                  minLevel: g.equip.minLevel,
                  suitId: g.equip.suitId,
                  essence: g.equip.essence,
                  maxHole: g.equip.maxHole,
                },
              }
            : {}),
          ...(g.gem ? { gem: { level: g.gem.level, nextId: g.gem.nextId } } : {}),
```

`looks: d.config.bundle.looks,` 后面加

```ts
        suits: d.config.bundle.suits.map((s) => ({
          id: s.id,
          name: s.name,
          maxNum: s.maxNum,
          tiers: s.tiers.map((x) => ({ need: x.need, desc: x.desc })),
        })),
```

新建 `apps/server/src/modules/equip/effects.ts`：

```ts
import { invalidateAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { markEffectsDirty, removeEffectSource, upsertEffectSource } from '../effects/service';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, suitAggEffects } from './rules';

/**
 * 穿戴变化后同步加成来源（设计文档 §3.3）：equip 行存穿戴厨具的幸运之和，
 * suit 行每个激活档位一行（只含进汇总的键）。结算从加成汇总里读，不需要改
 */
export async function syncEquipEffects(op: Op): Promise<void> {
  const worn = await op.tx
    .selectFrom('equip')
    .selectAll()
    .where('rest_id', '=', op.rest.id)
    .where('worn', '=', true)
    .execute();
  const gems = await loadGems(
    op.tx,
    worn.map((e) => e.id),
  );
  const luck = worn.reduce((s, e) => s + pieceTotal(e, gems.get(e.id) ?? []).luck, 0);
  if (luck !== 0) {
    await upsertEffectSource(op.tx, op.rest.id, {
      sourceType: 'equip',
      sourceId: 0,
      effects: { luckValue: luck },
      expiresAt: null,
    });
  } else {
    await removeEffectSource(op.tx, op.rest.id, 'equip', 0);
  }
  await op.tx
    .deleteFrom('effect_source')
    .where('rest_id', '=', op.rest.id)
    .where('source_type', '=', 'suit')
    .execute();
  for (const s of activeSuits(
    worn.map((e) => e.suit_id),
    op.config.suits,
  )) {
    for (const [i, tier] of s.suit.tiers.entries()) {
      if (!s.active[i]) continue;
      const effects = suitAggEffects(tier.effects);
      if (Object.keys(effects).length === 0) continue;
      await upsertEffectSource(op.tx, op.rest.id, {
        sourceType: 'suit',
        sourceId: s.suit.id * 10 + i,
        effects,
        expiresAt: null,
      });
    }
  }
  await markEffectsDirty(op.tx, op.rest.id);
  invalidateAgg(op);
}
```

新建 `apps/server/src/modules/equip/service.ts`：

```ts
import type { Kysely } from 'kysely';
import type { Tuning } from '@dt/config';
import {
  ErrorCode,
  type AttrsDto,
  type EquipDto,
  type EquipOverviewDto,
  type EquipPresetDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, requirement } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { sellPrice } from '../store/rules';
import type { WorldService } from '../world/service';
import { syncEquipEffects } from './effects';
import { baseAttrs, boostAttrs, gemAttrs, loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs } from './rules';

export const PART_COLS = ['part1', 'part2', 'part3', 'part4', 'part5'] as const;

export function notFound(what: string, id: number): AppError {
  return new AppError(ErrorCode.NOT_FOUND, 404, { what, id });
}

/** 厨具 id → 所在预设的名称 */
export async function presetNames(db: Kysely<DB>, restId: number): Promise<Map<number, string[]>> {
  const rows = await db.selectFrom('equip_preset').selectAll().where('rest_id', '=', restId).orderBy('id').execute();
  const out = new Map<number, string[]>();
  for (const p of rows) {
    for (const c of PART_COLS) {
      const id = p[c];
      if (id !== null) out.set(id, [...(out.get(id) ?? []), p.name]);
    }
  }
  return out;
}

export async function listPresets(db: Kysely<DB>, restId: number): Promise<EquipPresetDto[]> {
  const rows = await db.selectFrom('equip_preset').selectAll().where('rest_id', '=', restId).orderBy('id').execute();
  return rows.map((p) => ({ id: p.id, name: p.name, parts: PART_COLS.map((c) => p[c]) }));
}

export function toEquipDto(
  d: GameDeps,
  tuning: Tuning,
  e: EquipRow,
  gems: readonly EquipGemRow[],
  presets: string[],
): EquipDto {
  const g = d.config.requireGoods(e.goods_id);
  return {
    id: e.id,
    goodsId: e.goods_id,
    part: e.part,
    suitId: e.suit_id,
    minLevel: e.min_level,
    stress: e.stress,
    curHole: e.cur_hole,
    maxHole: e.max_hole,
    locked: e.locked,
    worn: e.worn,
    inPresets: presets,
    base: baseAttrs(e),
    boost: boostAttrs(e),
    gem: gemAttrs(gems),
    total: pieceTotal(e, gems),
    gems: gems.map((x) => ({
      id: x.id,
      goodsId: x.gem_goods_id,
      level: x.level,
      attrs: {
        cook: x.cook,
        cutting: x.cutting,
        fire: x.fire,
        season: x.season,
        creatives: x.creatives,
        luck: x.luck,
      },
    })),
    salvage: (g.equip?.essence ?? 0) * (e.stress + 1),
    sellPrice: sellPrice(g, tuning),
  };
}

export function createEquipService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'equip', source }, fn);

  async function own(o: Op, id: number): Promise<EquipRow> {
    const e = await o.tx
      .selectFrom('equip')
      .selectAll()
      .where('id', '=', id)
      .where('rest_id', '=', o.rest.id)
      .executeTakeFirst();
    if (!e) throw notFound('equip', id);
    return e;
  }

  /** 穿上（换下同部位的）；等级门槛见设计文档 裁定 1。调用方负责同步加成 */
  async function putOn(o: Op, e: EquipRow): Promise<void> {
    if (o.rest.level < e.min_level) throw requirement('level', { need: e.min_level });
    await o.tx
      .updateTable('equip')
      .set({ worn: false })
      .where('rest_id', '=', o.rest.id)
      .where('part', '=', e.part)
      .where('worn', '=', true)
      .execute();
    await o.tx.updateTable('equip').set({ worn: true }).where('id', '=', e.id).execute();
  }

  async function mine(restId: number, part?: number): Promise<EquipRow[]> {
    let q = d.db.selectFrom('equip').selectAll().where('rest_id', '=', restId);
    if (part !== undefined) q = q.where('part', '=', part);
    return q.orderBy('worn', 'desc').orderBy('stress', 'desc').orderBy('id').execute();
  }

  return {
    async overview(ctx: RestCtx): Promise<EquipOverviewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const rest = await d.db
        .selectFrom('restaurant')
        .select(['level', 'attr_cook', 'attr_cutting', 'attr_fire', 'attr_season', 'attr_creatives', 'luck'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const rows = await mine(ctx.restaurantId);
      const gems = await loadGems(
        d.db,
        rows.map((r) => r.id),
      );
      const names = await presetNames(d.db, ctx.restaurantId);
      const worn = rows.filter((r) => r.worn);
      const suits = activeSuits(
        worn.map((w) => w.suit_id),
        d.config.suits,
      );
      const gear = worn.reduce((acc, e) => addAttrs(acc, pieceTotal(e, gems.get(e.id) ?? [])), zeroAttrs());
      const points: AttrsDto = {
        cook: rest.attr_cook,
        cutting: rest.attr_cutting,
        fire: rest.attr_fire,
        season: rest.attr_season,
        creatives: rest.attr_creatives,
        luck: rest.luck,
      };
      const { total, power } = attrSummary(points, gear, suitPct(suits));
      return {
        worn: [1, 2, 3, 4, 5].map((p) => {
          const e = worn.find((w) => w.part === p);
          return e ? toEquipDto(d, s.tuning, e, gems.get(e.id) ?? [], names.get(e.id) ?? []) : null;
        }),
        suits: suits.map((x) => ({
          suitId: x.suit.id,
          name: x.suit.name,
          count: x.count,
          maxNum: x.suit.maxNum,
          tiers: x.suit.tiers.map((tier, i) => ({ need: tier.need, desc: tier.desc, active: x.active[i]! })),
        })),
        attrs: { points, gear, total, power },
        presets: await listPresets(d.db, ctx.restaurantId),
        count: rows.length,
        level: rest.level,
      };
    },

    async list(ctx: RestCtx, q: { part?: number }): Promise<EquipDto[]> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const rows = await mine(ctx.restaurantId, q.part);
      const gems = await loadGems(
        d.db,
        rows.map((r) => r.id),
      );
      const names = await presetNames(d.db, ctx.restaurantId);
      return rows.map((e) => toEquipDto(d, s.tuning, e, gems.get(e.id) ?? [], names.get(e.id) ?? []));
    },

    wear(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.wear', async (o) => {
        const e = await own(o, b.id);
        if (!e.worn) {
          await putOn(o, e);
          await syncEquipEffects(o);
          await emitAction(o, 'equip.wear');
        }
        return { id: e.id };
      });
    },

    unwear(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.unwear', async (o) => {
        const e = await own(o, b.id);
        if (!e.worn) throw invalidState('not_worn');
        await o.tx.updateTable('equip').set({ worn: false }).where('id', '=', e.id).execute();
        await syncEquipEffects(o);
        return { id: e.id };
      });
    },

    unwearAll(ctx: RestCtx) {
      return op(ctx, 'equip.unwear', async (o) => {
        await o.tx
          .updateTable('equip')
          .set({ worn: false })
          .where('rest_id', '=', o.rest.id)
          .where('worn', '=', true)
          .execute();
        await syncEquipEffects(o);
        return { ok: true };
      });
    },
  };
}

export type EquipService = ReturnType<typeof createEquipService>;
```

新建 `apps/server/src/modules/equip/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { equipIdBody, equipListQuery } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { EquipService } from './service';

export function equipRoutes(svc: EquipService): FastifyPluginAsync {
  return async (r) => {
    r.get('/equip/overview', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.get('/equip/list', async (req) => ok(await svc.list(restCtxOf(req), parse(equipListQuery, req.query))));
    r.post('/equip/wear', async (req) => okOp(await svc.wear(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/unwear', async (req) => okOp(await svc.unwear(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/unwearAll', async (req) => okOp(await svc.unwearAll(restCtxOf(req))));
  };
}
```

`apps/server/src/game.ts`：import `createEquipService, type EquipService`；`Game` 接口加 `equip: EquipService;`；返回对象里加 `equip: createEquipService(deps, world),`。

`apps/server/src/modules/index.ts`：import `equipRoutes`，`registerModules` 里加 `app.register(equipRoutes(game.equip), { prefix: '/api/v1' });`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps packages
git commit -m "feat(equip): wear and take off, worn luck and set bonuses feed settlement, overview and list endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 单件详情、强化、强化回退、锁定

**Files:**
- Create: `apps/server/src/modules/equip/stress.test.ts`
- Modify: `apps/server/src/modules/equip/service.ts`, `apps/server/src/modules/equip/routes.ts`

**Interfaces:**
- Consumes: Task 3 `stressRate`、`rollStress`、`stressGain`、`attrSeq`；Task 4 `attrCols`、`baseAttrs`、`boostAttrs`；Task 5 `own`、`op`、`toEquipDto`、`presetNames`、`notFound`、`syncEquipEffects`
- Produces: service 方法 `detail(ctx, id): Promise<EquipDetailDto>`、`stress(ctx, { id, stone }): OpResult<StressResultDto>`、`rollback(ctx, { id, goodsId }): OpResult<{ stress }>`、`lock(ctx, { id, locked })`；路由 `GET /equip/item/:id`、`POST /equip/stress`、`POST /equip/rollback`、`POST /equip/lock`

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/stress.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../effects/service';

/** 每个操作取一个新的固定序列随机数：测试里改 seq 就能控制成败 */
let seq = [0.01];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());

const eq = () => t.game.equip;
async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number | boolean> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId, ...patch })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const row = (id: number) => t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const logs = (id: number) =>
  t.db.selectFrom('equip_stress_log').selectAll().where('equip_id', '=', id).orderBy('id').execute();
const rich = () => newRestaurant(t, { patch: { coin: 1_000_000 }, goods: { 52: 50 } });

describe('强化（设计文档 §3.5）', () => {
  it('成功：扣精华和银币，等级 +1，按规则加属性，写记录', async () => {
    seq = [0.01];
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 3 });
    const r = await eq().stress(ctx, { id, stone: false });
    // 见习之铲 essence 1：精华 1、银币 1 万；0.01 选中第一项厨艺，增量 max(1, ⌊0.01×4⌋) = 1
    expect(r.data).toEqual({ success: true, lucky: false, floor: false, attr: 'cook', val: 1, stress: 1 });
    expect(await row(id)).toMatchObject({ stress: 1, st_cook: 1, fail_streak: 0 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000 - 10_000);
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(49);
    expect(await logs(id)).toMatchObject([{ stress: 1, success: true, attr: 'cook', val: 1, stone: false }]);
  });

  it('失败：照样扣费，等级不变，连续失败 +1，详情里保底 +1%；成功后清零', async () => {
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 3 });
    seq = [0.99];
    const r = await eq().stress(ctx, { id, stone: false });
    expect(r.data).toMatchObject({ success: false, stress: 0 });
    expect(await row(id)).toMatchObject({ stress: 0, fail_streak: 1 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000 - 10_000);
    const d = await eq().detail(ctx, id);
    expect(d.rate!.floor).toBeCloseTo(0.01);
    expect(d.cost).toEqual({ essence: 1, coin: 10_000 });
    seq = [0.01];
    await eq().stress(ctx, { id, stone: false });
    expect(await row(id)).toMatchObject({ stress: 1, fail_streak: 0 });
  });

  it('强化石：必定成功，增量 +1（不超过主属性）；没有强化石报 NOT_ENOUGH', async () => {
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 8 });
    seq = [0.3];
    await expect(eq().stress(ctx, { id, stone: true })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 40 },
    });
    await t.db.insertInto('store_item').values({ rest_id: ctx.restaurantId, goods_id: 40, num: 1 }).execute();
    // 0.3 选中厨艺，增量 ⌊0.3×9⌋ = 2，强化石 +1
    const r = await eq().stress(ctx, { id, stone: true });
    expect(r.data).toMatchObject({ success: true, attr: 'cook', val: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 40)).toBe(0);
  });

  it('精华或银币不够报 NOT_ENOUGH，什么都不扣', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000 }, goods: { 52: 1 } });
    const id = await piece(ctx, 30);
    await expect(eq().stress(ctx, { id, stone: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(1);
    const poor = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const id2 = await piece(poor, 30);
    await expect(eq().stress(poor, { id: id2, stone: false })).rejects.toMatchObject({
      params: { kind: 'goods', id: 52 },
    });
  });

  it('强化到 +8 发新闻；满级不能再强化', async () => {
    seq = [0.01];
    const ctx = await rich();
    const id = await piece(ctx, 30, { stress: 7 });
    await eq().stress(ctx, { id, stone: false });
    const news = await t.db
      .selectFrom('news')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .where('type', '=', 'equip.stress')
      .execute();
    expect(news).toHaveLength(1);
    expect(news[0]!.params).toMatchObject({ goodsId: 30, stress: 8 });
    await t.db.updateTable('equip').set({ stress: 10 }).where('id', '=', id).execute();
    await expect(eq().stress(ctx, { id, stone: false })).rejects.toMatchObject({
      params: { reason: 'max_stress' },
    });
    expect((await eq().detail(ctx, id)).rate).toBeNull();
  });

  it('穿着的厨具强化加到幸运时，加成汇总同步', async () => {
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 3 });
    await eq().wear(ctx, { id });
    const before = (await getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning))
      .luckValue ?? 0;
    // 成功 0.01；铲的顺序 厨艺 刀工 火候 调味 幸运：前四个 0.9 跳过，0.1 选中幸运；增量 ⌊0.5×4⌋ = 2
    seq = [0.01, 0.9, 0.9, 0.9, 0.9, 0.1, 0.5];
    const r = await eq().stress(ctx, { id, stone: false });
    expect(r.data).toMatchObject({ attr: 'luck', val: 2 });
    const after = await getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(after.luckValue).toBe(before + 2);
  });

  it('连点两次（+9 时两个请求同时到）：只有一个成功，不会超过 +10（Review Focus 1）', async () => {
    seq = [0.01];
    const ctx = await rich();
    const id = await piece(ctx, 30, { stress: 9 });
    const rs = await Promise.allSettled([
      eq().stress(ctx, { id, stone: false }),
      eq().stress(ctx, { id, stone: false }),
    ]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rs.find((r) => r.status === 'rejected')).toMatchObject({ reason: { params: { reason: 'max_stress' } } });
    expect((await row(id)).stress).toBe(10);
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(49);
  });
});

describe('强化回退（设计文档 §3.6、裁定 3）', () => {
  it('归元石回退 1 级扣回最近一次的增量；神秘水晶回到 +0；道具不对、没强化过都拒绝', async () => {
    seq = [0.01];
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 }, goods: { 52: 10, 225: 1, 224: 1 } });
    const id = await piece(ctx, 30, { base_cook: 3 });
    await eq().stress(ctx, { id, stone: false });
    await eq().stress(ctx, { id, stone: false });
    expect(await row(id)).toMatchObject({ stress: 2, st_cook: 2 });
    await expect(eq().rollback(ctx, { id, goodsId: 52 })).rejects.toMatchObject({
      params: { reason: 'not_back_stress' },
    });
    await eq().rollback(ctx, { id, goodsId: 225 });
    expect(await row(id)).toMatchObject({ stress: 1, st_cook: 1 });
    expect(await logs(id)).toHaveLength(1);
    expect(await goodsNum(t, ctx.restaurantId, 225)).toBe(0);
    await eq().rollback(ctx, { id, goodsId: 224 });
    expect(await row(id)).toMatchObject({ stress: 0, st_cook: 0 });
    expect(await logs(id)).toEqual([]);
    await expect(eq().rollback(ctx, { id, goodsId: 225 })).rejects.toMatchObject({
      params: { reason: 'no_stress' },
    });
  });

  it('强化记录比等级少：等级照降，属性不减成负数；回到 +0 时增量清零（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { goods: { 225: 1, 224: 1 } });
    const id = await piece(ctx, 30, { stress: 5, st_cook: 7 });
    await eq().rollback(ctx, { id, goodsId: 225 });
    expect(await row(id)).toMatchObject({ stress: 4, st_cook: 7 });
    await eq().rollback(ctx, { id, goodsId: 224 });
    expect(await row(id)).toMatchObject({ stress: 0, st_cook: 0 });
  });
});

describe('锁定和详情', () => {
  it('锁定 / 解锁；详情带花费、持有的回退道具和宝石、强化记录', async () => {
    seq = [0.01];
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 }, goods: { 52: 3, 225: 2, 44: 1 } });
    const id = await piece(ctx, 56, { base_fire: 12 });
    await eq().lock(ctx, { id, locked: true });
    expect((await row(id)).locked).toBe(true);
    await eq().stress(ctx, { id, stone: false }).catch(() => undefined);
    const d = await eq().detail(ctx, id);
    expect(d.equip).toMatchObject({ id, goodsId: 56, locked: true });
    expect(d.cost).toEqual({ essence: 12, coin: 120_000 });
    expect(d.have).toEqual({ essence: 3, stone: 0, drill: 0 });
    expect(d.backItems).toEqual([{ goodsId: 225, num: 2, back: 1 }]);
    expect(d.gems).toEqual([{ goodsId: 44, num: 1, level: 1 }]);
    await eq().lock(ctx, { id, locked: false });
    expect((await row(id)).locked).toBe(false);
    await expect(eq().detail(await newRestaurant(t), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/stress.test.ts`
Expected: FAIL，`eq().stress is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/equip/service.ts`：
1. import 补充：

```ts
import { EQUIP_ATTRS, GOODS, type EquipAttr, type Tuning } from '@dt/config';
import type { EquipDetailDto, StressResultDto } from '@dt/shared';
import { opLuck } from '../../core/luck';
import { opNews, restLog } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { aggregateEffects } from '../effects/aggregate';
import { listActiveEffects } from '../effects/service';
import { consumeGoods } from '../store/goods';
import { attrCols } from './instances';
import { attrSeq, rollStress, stressGain, stressRate } from './rules';
```

（和已有的 import 合并：`@dt/config` 那行改成上面这样，`../../core/op` 那行加 `opNews, restLog`，`./instances`、`./rules` 那两行把新名字并进去。）

2. `createEquipService` 前面加：

```ts
const isAttr = (s: string | null): s is EquipAttr => s !== null && (EQUIP_ATTRS as readonly string[]).includes(s);
```

3. 返回对象里 `unwearAll` 后面加：

```ts
    async detail(ctx: RestCtx, id: number): Promise<EquipDetailDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const t = s.tuning.equip;
      const e = await d.db
        .selectFrom('equip')
        .selectAll()
        .where('id', '=', id)
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirst();
      if (!e) throw notFound('equip', id);
      const now = d.now();
      const gems = (await loadGems(d.db, [e.id])).get(e.id) ?? [];
      const names = await presetNames(d.db, ctx.restaurantId);
      const def = d.config.requireGoods(e.goods_id).equip!;
      const rest = await d.db
        .selectFrom('restaurant')
        .select('luck')
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      // 读接口不写加成缓存：直接从来源求 luckValue（和 opLuck 的口径一致）
      const luckValue =
        aggregateEffects(await listActiveEffects(d.db, ctx.restaurantId, now), now).agg.luckValue ?? 0;
      const weather = (await world.ensure(ctx.shardId, now)).weather.effects;
      const store = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('num', '>', 0)
        .execute();
      const have = (gid: number) => store.find((x) => x.goods_id === gid)?.num ?? 0;
      const history = await d.db
        .selectFrom('equip_stress_log')
        .selectAll()
        .where('equip_id', '=', e.id)
        .orderBy('id', 'desc')
        .limit(t.historyLimit)
        .execute();
      return {
        equip: toEquipDto(d, s.tuning, e, gems, names.get(e.id) ?? []),
        rate:
          e.stress >= t.maxStress
            ? null
            : stressRate(e.stress, rest.luck + luckValue, weather.equipRate ?? 0, e.fail_streak, t),
        cost: { essence: def.essence, coin: def.essence * t.coinPerEssence },
        history: history.map((h) => ({
          stress: h.stress,
          success: h.success,
          attr: h.attr,
          val: h.val,
          lucky: h.lucky,
          floor: h.floor,
          stone: h.stone,
          at: h.created_at.toISOString(),
        })),
        have: { essence: have(GOODS.essence), stone: have(GOODS.stressStone), drill: have(GOODS.drillStone) },
        backItems: store
          .map((x) => ({ goodsId: x.goods_id, num: x.num, back: d.config.goods.get(x.goods_id)?.effects.backStress ?? 0 }))
          .filter((x) => x.back > 0)
          .sort((a, b) => a.back - b.back),
        gems: store
          .filter((x) => d.config.goods.get(x.goods_id)?.gem)
          .map((x) => ({ goodsId: x.goods_id, num: x.num, level: d.config.goods.get(x.goods_id)!.gem!.level })),
        ungemCoinPerLevel: t.ungemCoinPerLevel,
      };
    },

    stress(ctx: RestCtx, b: { id: number; stone: boolean }) {
      return op(ctx, 'equip.stress', async (o): Promise<StressResultDto> => {
        const t = o.tuning.equip;
        const e = await own(o, b.id);
        if (e.stress >= t.maxStress) throw invalidState('max_stress');
        const def = o.config.requireGoods(e.goods_id).equip!;
        await consumeGoods(o, GOODS.essence, def.essence);
        spendCoin(o, def.essence * t.coinPerEssence);
        if (b.stone) await consumeGoods(o, GOODS.stressStone, 1);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const { sum } = await opLuck(o);
        const rate = stressRate(e.stress, sum, weather.equipRate ?? 0, e.fail_streak, t);
        const r = rollStress(rate, b.stone, o.rng);
        const to = e.stress + 1;
        let gain: { attr: EquipAttr; val: number } | null = null;
        if (r.success) {
          const main = baseAttrs(e)[attrSeq(e.part)[0]!];
          gain = stressGain(e.part, main, b.stone, o.rng);
          const boost = boostAttrs(e);
          boost[gain.attr] += gain.val;
          await o.tx
            .updateTable('equip')
            .set({ stress: to, fail_streak: 0, ...attrCols('st_', boost) })
            .where('id', '=', e.id)
            .execute();
        } else {
          await o.tx
            .updateTable('equip')
            .set({ fail_streak: e.fail_streak + 1 })
            .where('id', '=', e.id)
            .execute();
        }
        await o.tx
          .insertInto('equip_stress_log')
          .values({
            equip_id: e.id,
            rest_id: o.rest.id,
            stress: to,
            success: r.success,
            attr: gain?.attr ?? null,
            val: gain?.val ?? 0,
            lucky: r.lucky,
            floor: r.floor,
            stone: b.stone,
            created_at: o.now,
          })
          .execute();
        restLog(o, 'equip.stress', { goodsId: e.goods_id, to, success: r.success });
        if (r.success && to >= t.newsFromStress)
          opNews(o, 'equip.stress', { goodsId: e.goods_id, stress: to, lucky: r.lucky, name: o.rest.name });
        await emitAction(o, 'equip.stress');
        if (e.worn) await syncEquipEffects(o);
        return {
          success: r.success,
          lucky: r.lucky,
          floor: r.floor,
          attr: gain?.attr ?? null,
          val: gain?.val ?? 0,
          stress: r.success ? to : e.stress,
        };
      });
    },

    rollback(ctx: RestCtx, b: { id: number; goodsId: number }) {
      return op(ctx, 'equip.rollback', async (o) => {
        const back = o.config.requireGoods(b.goodsId).effects.backStress ?? 0;
        if (back <= 0) throw invalidState('not_back_stress', { goodsId: b.goodsId });
        const e = await own(o, b.id);
        if (e.stress === 0) throw invalidState('no_stress');
        const n = Math.min(back, e.stress);
        const undo = await o.tx
          .selectFrom('equip_stress_log')
          .select(['id', 'attr', 'val'])
          .where('equip_id', '=', e.id)
          .where('success', '=', true)
          .orderBy('stress', 'desc')
          .orderBy('id', 'desc')
          .limit(n)
          .execute();
        const to = e.stress - n;
        // 回到 +0 时增量全部清零；否则逐条扣回（记录缺失时不会减成负数，设计文档 裁定 3）
        const boost = to === 0 ? zeroAttrs() : boostAttrs(e);
        if (to > 0) for (const l of undo) if (isAttr(l.attr)) boost[l.attr] = Math.max(0, boost[l.attr] - l.val);
        await o.tx
          .updateTable('equip')
          .set({ stress: to, ...attrCols('st_', boost) })
          .where('id', '=', e.id)
          .execute();
        if (undo.length > 0)
          await o.tx
            .deleteFrom('equip_stress_log')
            .where(
              'id',
              'in',
              undo.map((l) => l.id),
            )
            .execute();
        await consumeGoods(o, b.goodsId, 1);
        if (e.worn) await syncEquipEffects(o);
        return { stress: to };
      });
    },

    lock(ctx: RestCtx, b: { id: number; locked: boolean }) {
      return op(ctx, 'equip.lock', async (o) => {
        const e = await own(o, b.id);
        await o.tx.updateTable('equip').set({ locked: b.locked }).where('id', '=', e.id).execute();
        return { id: e.id, locked: b.locked };
      });
    },
```

`apps/server/src/modules/equip/routes.ts`：import 加 `equipIdParam, lockBody, rollbackBody, stressBody`，加：

```ts
    r.get('/equip/item/:id', async (req) => ok(await svc.detail(restCtxOf(req), parse(equipIdParam, req.params).id)));
    r.post('/equip/stress', async (req) => okOp(await svc.stress(restCtxOf(req), parse(stressBody, req.body))));
    r.post('/equip/rollback', async (req) => okOp(await svc.rollback(restCtxOf(req), parse(rollbackBody, req.body))));
    r.post('/equip/lock', async (req) => okOp(await svc.lock(restCtxOf(req), parse(lockBody, req.body))));
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps
git commit -m "feat(equip): enhancement with luck, weather and pity, rollback by 归元石 / 神秘水晶, lock, item detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 分解、出售、一键处理

**Files:**
- Create: `apps/server/src/modules/equip/salvage.test.ts`
- Modify: `apps/server/src/modules/equip/service.ts`, `apps/server/src/modules/equip/routes.ts`

**Interfaces:**
- Consumes: Task 5 `own`、`op`、`presetNames`、`notFound`；Task 4 `loadGems`；`sellPrice`（store/rules）、`grantGoodsOp`（store/goods）、`gainCoin`（core/resources）
- Produces: service 方法 `salvage(ctx, { id })`、`sell(ctx, { id })`、`batch(ctx, { ids, way })`，内部工具 `blockers(o, rows): Promise<Map<number, string>>`；路由 `POST /equip/salvage`、`/equip/sell`、`/equip/batch`

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/salvage.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const eq = () => t.game.equip;
async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number | boolean> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId, ...patch })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const exists = async (id: number) =>
  (await t.db.selectFrom('equip').select('id').where('id', '=', id).executeTakeFirst()) !== undefined;

describe('分解（设计文档 §3.7）', () => {
  it('得精华 = value.essence × (强化等级 + 1)，厨具删除', async () => {
    const ctx = await newRestaurant(t);
    const id = await piece(ctx, 56, { stress: 2 });
    const r = await eq().salvage(ctx, { id });
    expect(r.data).toEqual({ essence: 36 });
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(36);
    expect(await exists(id)).toBe(false);
  });

  it('锁定、正在穿戴、有宝石、在预设里都不能分解或出售（设计文档 裁定 5）', async () => {
    const ctx = await newRestaurant(t);
    const locked = await piece(ctx, 30, { locked: true });
    const worn = await piece(ctx, 31, { worn: true });
    const gemmed = await piece(ctx, 32);
    await t.db
      .insertInto('equip_gem')
      .values({ equip_id: gemmed, rest_id: ctx.restaurantId, gem_goods_id: 44, level: 1, cook: 1 })
      .execute();
    const preset = await piece(ctx, 47);
    await t.db.insertInto('equip_preset').values({ rest_id: ctx.restaurantId, name: 'A', part1: preset }).execute();
    for (const [id, reason] of [
      [locked, 'locked'],
      [worn, 'worn'],
      [gemmed, 'has_gems'],
      [preset, 'in_preset'],
    ] as const) {
      await expect(eq().salvage(ctx, { id })).rejects.toMatchObject({ params: { reason } });
      await expect(eq().sell(ctx, { id })).rejects.toMatchObject({ params: { reason } });
      expect(await exists(id)).toBe(true);
    }
  });
});

describe('出售（计划裁定 1）', () => {
  it('价格 = 道具 coin × 0.7，与强化等级无关；没有价格的不能卖', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 } });
    const id = await piece(ctx, 30, { stress: 5 });
    expect((await eq().sell(ctx, { id })).data).toEqual({ coin: 42_000 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(42_000);
    const love = await piece(ctx, 62);
    await expect(eq().sell(ctx, { id: love })).rejects.toMatchObject({ params: { reason: 'not_sellable' } });
  });
});

describe('一键处理（设计文档 §3.11）', () => {
  it('全部干净：分解得精华合计 / 出售得银币合计', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 } });
    const a = await piece(ctx, 30);
    const b = await piece(ctx, 56);
    expect((await eq().batch(ctx, { ids: [a, b], way: 'salvage' })).data).toEqual({ count: 2, essence: 13, coin: 0 });
    const c = await piece(ctx, 30);
    const d = await piece(ctx, 31);
    expect((await eq().batch(ctx, { ids: [c, d], way: 'sell' })).data).toEqual({ count: 2, essence: 0, coin: 84_000 });
    expect(await exists(a)).toBe(false);
  });

  it('有一件不干净（强化过、锁定……）整批拒绝并列出；不是我的报 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    const a = await piece(ctx, 30);
    const b = await piece(ctx, 30, { stress: 1 });
    await expect(eq().batch(ctx, { ids: [a, b], way: 'salvage' })).rejects.toMatchObject({
      params: { reason: 'batch_dirty', ids: [b] },
    });
    expect(await exists(a)).toBe(true);
    const other = await newRestaurant(t);
    await expect(eq().batch(other, { ids: [a], way: 'salvage' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('一边穿戴一边分解同一件：只有一个成功（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t);
    const id = await piece(ctx, 30);
    const rs = await Promise.allSettled([eq().wear(ctx, { id }), eq().salvage(ctx, { id })]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const row = await t.db.selectFrom('equip').select('worn').where('id', '=', id).executeTakeFirst();
    if (rs[0]!.status === 'fulfilled') expect(row?.worn).toBe(true);
    else expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/salvage.test.ts`
Expected: FAIL，`eq().salvage is not a function`

- [ ] **Step 3: 实现**

`service.ts` import 补充：`import { gainCoin } from '../../core/resources';`（和 `spendCoin` 合并）、`import { consumeGoods, grantGoodsOp } from '../store/goods';`（和已有的合并）、`import type { EquipBatchDto } from '@dt/shared';`（合并进 shared 那行）。

`createEquipService` 里 `putOn` 后面加：

```ts
  /** 分解 / 出售的阻挡原因（设计文档 裁定 5）；没有阻挡的不在返回值里 */
  async function blockers(o: Op, rows: EquipRow[]): Promise<Map<number, string>> {
    const gems = await loadGems(
      o.tx,
      rows.map((r) => r.id),
    );
    const names = await presetNames(o.tx, o.rest.id);
    const out = new Map<number, string>();
    for (const e of rows) {
      const reason = e.locked
        ? 'locked'
        : e.worn
          ? 'worn'
          : (gems.get(e.id)?.length ?? 0) > 0
            ? 'has_gems'
            : names.has(e.id)
              ? 'in_preset'
              : null;
      if (reason) out.set(e.id, reason);
    }
    return out;
  }

  async function assertFree(o: Op, e: EquipRow): Promise<void> {
    const reason = (await blockers(o, [e])).get(e.id);
    if (reason) throw invalidState(reason);
  }
```

返回对象里加：

```ts
    salvage(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.salvage', async (o) => {
        const e = await own(o, b.id);
        await assertFree(o, e);
        const essence = o.config.requireGoods(e.goods_id).equip!.essence * (e.stress + 1);
        await o.tx.deleteFrom('equip').where('id', '=', e.id).execute();
        await grantGoodsOp(o, GOODS.essence, essence);
        return { essence };
      });
    },

    sell(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.sell', async (o) => {
        const e = await own(o, b.id);
        await assertFree(o, e);
        const coin = sellPrice(o.config.requireGoods(e.goods_id), o.tuning);
        if (coin === null) throw invalidState('not_sellable', { goodsId: e.goods_id });
        await o.tx.deleteFrom('equip').where('id', '=', e.id).execute();
        gainCoin(o, coin);
        return { coin };
      });
    },

    batch(ctx: RestCtx, b: { ids: number[]; way: 'salvage' | 'sell' }) {
      return op(ctx, 'equip.batch', async (o): Promise<EquipBatchDto> => {
        const ids = [...new Set(b.ids)];
        const rows = await o.tx
          .selectFrom('equip')
          .selectAll()
          .where('rest_id', '=', o.rest.id)
          .where('id', 'in', ids)
          .execute();
        const missing = ids.find((id) => !rows.some((r) => r.id === id));
        if (missing !== undefined) throw notFound('equip', missing);
        const block = await blockers(o, rows);
        const dirty = rows
          .filter(
            (e) =>
              block.has(e.id) ||
              e.stress > 0 ||
              (b.way === 'sell' && sellPrice(o.config.requireGoods(e.goods_id), o.tuning) === null),
          )
          .map((e) => e.id);
        if (dirty.length > 0) throw invalidState('batch_dirty', { ids: dirty });
        let essence = 0;
        let coin = 0;
        for (const e of rows) {
          const g = o.config.requireGoods(e.goods_id);
          if (b.way === 'salvage') essence += g.equip!.essence;
          else coin += sellPrice(g, o.tuning)!;
        }
        await o.tx.deleteFrom('equip').where('id', 'in', ids).execute();
        if (essence > 0) await grantGoodsOp(o, GOODS.essence, essence);
        gainCoin(o, coin);
        return { count: rows.length, essence, coin };
      });
    },
```

`routes.ts`：import 加 `equipBatchBody`，加：

```ts
    r.post('/equip/salvage', async (req) => okOp(await svc.salvage(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/sell', async (req) => okOp(await svc.sell(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/batch', async (req) => okOp(await svc.batch(restCtxOf(req), parse(equipBatchBody, req.body))));
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps
git commit -m "feat(equip): salvage into essence, sell, and batch processing of clean pieces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 打孔、镶嵌、摘除、宝石列表和升阶

**Files:**
- Create: `apps/server/src/modules/equip/gem.test.ts`
- Modify: `apps/server/src/modules/equip/service.ts`, `apps/server/src/modules/equip/routes.ts`

**Interfaces:**
- Consumes: Task 3 `gemLevelUp`、`gemRate`；Task 5 `own`、`op`、`notFound`、`syncEquipEffects`；`spendStrength`、`gainExp`（core/resources）、`opLuck`
- Produces: service 方法 `drill(ctx, { id })`、`inlay(ctx, { id, gemId })`、`ungem(ctx, { gemRowId })`、`gems(ctx): GemsDto`、`gemLevelUp(ctx, { goodsId, num })`；路由 `POST /equip/drill`、`/equip/inlay`、`/equip/ungem`、`GET /gem/list`、`POST /gem/levelup`

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/gem.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let seq = [0.5];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());

const eq = () => t.game.equip;
async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number | boolean> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: ctx.restaurantId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      cur_hole: def.hole,
      max_hole: def.maxHole,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const gemsOn = (id: number) => t.db.selectFrom('equip_gem').selectAll().where('equip_id', '=', id).execute();
async function setWeather(shardId: number, weatherId: number) {
  await t.game.world.ensure(shardId);
  await t.db.updateTable('world_state').set({ weather_id: weatherId }).where('shard_id', '=', shardId).execute();
}

describe('打孔（设计文档 §3.8）', () => {
  it('消耗打孔石，孔位 +1，到上限后不能再打；不能打孔的厨具、没有打孔石都拒绝', async () => {
    const ctx = await newRestaurant(t, { goods: { 46: 5 } });
    const id = await piece(ctx, 56, { cur_hole: 2 });
    expect((await eq().drill(ctx, { id })).data).toEqual({ curHole: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 46)).toBe(4);
    await expect(eq().drill(ctx, { id })).rejects.toMatchObject({ params: { reason: 'hole_full' } });
    const plain = await piece(ctx, 30);
    await expect(eq().drill(ctx, { id: plain })).rejects.toMatchObject({ params: { reason: 'cannot_drill' } });
    const poor = await newRestaurant(t);
    const p2 = await piece(poor, 56);
    await expect(eq().drill(poor, { id: p2 })).rejects.toMatchObject({ params: { kind: 'goods', id: 46 } });
  });
});

describe('镶嵌和摘除（设计文档 §3.8、裁定 6）', () => {
  it('镶嵌：扣宝石和体力（= 阶数），属性加到厨具上；孔满了、不是宝石都拒绝', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 10 }, goods: { 44: 2, 52: 1 } });
    const id = await piece(ctx, 56);
    await eq().inlay(ctx, { id, gemId: 44 });
    expect(await gemsOn(id)).toMatchObject([{ gem_goods_id: 44, level: 1, cook: 1 }]);
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(9);
    expect(await goodsNum(t, ctx.restaurantId, 44)).toBe(1);
    const o = await eq().list(ctx, {});
    expect(o[0]!.gem.cook).toBe(1);
    await expect(eq().inlay(ctx, { id, gemId: 44 })).rejects.toMatchObject({ params: { reason: 'no_hole' } });
    await t.db.updateTable('equip').set({ cur_hole: 2 }).where('id', '=', id).execute();
    await expect(eq().inlay(ctx, { id, gemId: 52 })).rejects.toMatchObject({ params: { reason: 'not_gem' } });
  });

  it('摘除：2 星以下免费；2 星起花 阶数 × 1 万；酸雨免费；宝石退回仓库', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2, coin: 25_000 } });
    const id = await piece(ctx, 56, { cur_hole: 3 });
    const row = (gid: number, level: number) =>
      t.db
        .insertInto('equip_gem')
        .values({ equip_id: id, rest_id: ctx.restaurantId, gem_goods_id: gid, level })
        .returning('id')
        .executeTakeFirstOrThrow();
    const g1 = await row(274, 2);
    expect((await eq().ungem(ctx, { gemRowId: g1.id })).data).toEqual({ coin: 20_000 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(5_000);
    expect(await goodsNum(t, ctx.restaurantId, 274)).toBe(1);
    const g2 = await row(274, 2);
    await setWeather(ctx.shardId, 18);
    expect((await eq().ungem(ctx, { gemRowId: g2.id })).data).toEqual({ coin: 0 });
  });

  it('银币不够时拒绝，宝石还在厨具上（Review Focus 5）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 3, coin: 100 } });
    const id = await piece(ctx, 56);
    const g = await t.db
      .insertInto('equip_gem')
      .values({ equip_id: id, rest_id: ctx.restaurantId, gem_goods_id: 44, level: 1 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(eq().ungem(ctx, { gemRowId: g.id })).rejects.toMatchObject({ params: { kind: 'coin' } });
    expect(await gemsOn(id)).toHaveLength(1);
    expect(await goodsNum(t, ctx.restaurantId, 44)).toBe(0);
    await expect(eq().ungem(await newRestaurant(t), { gemRowId: g.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('宝石升阶（设计文档 §3.9）', () => {
  it('每组独立：成功 / 幸运补救 / 失败；扣 2×组数 颗和 组数×阶数 体力；失败给经验', async () => {
    // 1 阶成功率 0.77；幸运 100 → 幸运率约 0.17
    seq = [0.5, 0.9, 0.0, 0.9, 0.9];
    const ctx = await newRestaurant(t, { patch: { strength: 10, luck: 100 }, goods: { 44: 7 } });
    const r = await eq().gemLevelUp(ctx, { goodsId: 44, num: 3 });
    expect(r.data).toEqual({ success: 2, lucky: 1, fail: 1, exp: 1000 });
    expect(await goodsNum(t, ctx.restaurantId, 44)).toBe(1);
    expect(await goodsNum(t, ctx.restaurantId, 286)).toBe(2);
    const rest = await restRow(t, ctx.restaurantId);
    expect(rest.strength).toBe(7);
  });

  it('最高阶、宝石不够、体力不够都拒绝', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 1 }, goods: { 341: 2, 44: 3 } });
    await expect(eq().gemLevelUp(ctx, { goodsId: 341, num: 1 })).rejects.toMatchObject({
      params: { reason: 'gem_max' },
    });
    await expect(eq().gemLevelUp(ctx, { goodsId: 44, num: 2 })).rejects.toMatchObject({
      params: { kind: 'goods', id: 44 },
    });
    await t.db.updateTable('restaurant').set({ strength: 0 }).where('id', '=', ctx.restaurantId).execute();
    await expect(eq().gemLevelUp(ctx, { goodsId: 44, num: 1 })).rejects.toMatchObject({
      params: { kind: 'strength' },
    });
  });

  it('升到 4 阶以上发新闻；5 阶以上失败发破碎新闻', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 100, luck: 0 }, goods: { 276: 4 } });
    seq = [0.0];
    await eq().gemLevelUp(ctx, { goodsId: 276, num: 1 });
    seq = [0.99];
    await eq().gemLevelUp(ctx, { goodsId: 276, num: 1 });
    const types = (
      await t.db.selectFrom('news').select('type').where('rest_id', '=', ctx.restaurantId).orderBy('id').execute()
    ).map((n) => n.type);
    expect(types).toEqual(['gem.levelUp', 'gem.broken']);
  });

  it('宝石列表：持有数、下一阶、成功率（不含幸运）', async () => {
    const ctx = await newRestaurant(t, { goods: { 44: 3, 341: 1 } });
    const g = await eq().gems(ctx);
    expect(g.items.find((x) => x.goodsId === 44)).toMatchObject({ num: 3, level: 1, nextId: 286 });
    expect(g.items.find((x) => x.goodsId === 44)!.rate).toBeCloseTo(0.77);
    expect(g.items.find((x) => x.goodsId === 341)).toMatchObject({ nextId: null });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/gem.test.ts`
Expected: FAIL，`eq().drill is not a function`

- [ ] **Step 3: 实现**

`service.ts` import 补充（合并进已有的行）：`gainExp, spendStrength`（core/resources）、`luckRate`（@dt/shared）、`type GemsDto, type GemLevelUpDto`（@dt/shared）、`gemLevelUp, gemRate`（./rules）。

返回对象里加：

```ts
    drill(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.drill', async (o) => {
        const e = await own(o, b.id);
        if (e.max_hole === 0) throw invalidState('cannot_drill');
        if (e.cur_hole >= e.max_hole) throw invalidState('hole_full');
        await consumeGoods(o, GOODS.drillStone, 1);
        await o.tx
          .updateTable('equip')
          .set({ cur_hole: e.cur_hole + 1 })
          .where('id', '=', e.id)
          .execute();
        await emitAction(o, 'equip.drill');
        return { curHole: e.cur_hole + 1 };
      });
    },

    inlay(ctx: RestCtx, b: { id: number; gemId: number }) {
      return op(ctx, 'equip.inlay', async (o) => {
        const e = await own(o, b.id);
        const gem = o.config.goods.get(b.gemId)?.gem;
        if (!gem) throw invalidState('not_gem', { goodsId: b.gemId });
        const used = await o.tx
          .selectFrom('equip_gem')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .where('equip_id', '=', e.id)
          .executeTakeFirstOrThrow();
        if (Number(used.n) >= e.cur_hole) throw invalidState('no_hole');
        await consumeGoods(o, b.gemId, 1);
        spendStrength(o, gem.level);
        const row = await o.tx
          .insertInto('equip_gem')
          .values({
            equip_id: e.id,
            rest_id: o.rest.id,
            gem_goods_id: b.gemId,
            level: gem.level,
            created_at: o.now,
            ...gem.attrs,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (e.worn) await syncEquipEffects(o);
        await emitAction(o, 'equip.gemIn');
        return { gemRowId: row.id };
      });
    },

    ungem(ctx: RestCtx, b: { gemRowId: number }) {
      return op(ctx, 'equip.ungem', async (o) => {
        const t = o.tuning.equip;
        const g = await o.tx
          .selectFrom('equip_gem')
          .selectAll()
          .where('id', '=', b.gemRowId)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (!g) throw notFound('gem', b.gemRowId);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const free = (weather.removeGemFree ?? 0) > 0 || o.rest.star_level < t.ungemMinStar;
        const coin = free ? 0 : g.level * t.ungemCoinPerLevel;
        spendCoin(o, coin);
        await o.tx.deleteFrom('equip_gem').where('id', '=', g.id).execute();
        await grantGoodsOp(o, g.gem_goods_id, 1);
        const e = await own(o, g.equip_id);
        if (e.worn) await syncEquipEffects(o);
        return { coin };
      });
    },

    async gems(ctx: RestCtx): Promise<GemsDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const now = d.now();
      const rest = await d.db
        .selectFrom('restaurant')
        .select(['luck', 'strength'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const luckValue =
        aggregateEffects(await listActiveEffects(d.db, ctx.restaurantId, now), now).agg.luckValue ?? 0;
      const weather = (await world.ensure(ctx.shardId, now)).weather.effects;
      const rows = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('num', '>', 0)
        .orderBy('goods_id')
        .execute();
      return {
        items: rows.flatMap((r) => {
          const gem = d.config.goods.get(r.goods_id)?.gem;
          if (!gem) return [];
          return [
            {
              goodsId: r.goods_id,
              num: r.num,
              level: gem.level,
              nextId: gem.nextId,
              rate: gemRate(gem.level, weather.gemLevelUpRate ?? 0, s.tuning.equip),
              attrs: gem.attrs,
            },
          ];
        }),
        luckRate: luckRate(rest.luck + luckValue),
        strength: rest.strength,
      };
    },

    gemLevelUp(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'gem.levelUp', async (o): Promise<GemLevelUpDto> => {
        const t = o.tuning.equip;
        const gem = o.config.goods.get(b.goodsId)?.gem;
        if (!gem) throw invalidState('not_gem', { goodsId: b.goodsId });
        if (gem.nextId === null) throw invalidState('gem_max', { goodsId: b.goodsId });
        await consumeGoods(o, b.goodsId, 2 * b.num);
        spendStrength(o, b.num * gem.level);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const { rate } = await opLuck(o);
        const r = gemLevelUp(b.num, gem.level, weather.gemLevelUpRate ?? 0, rate, t, o.rng);
        if (r.success > 0) await grantGoodsOp(o, gem.nextId, r.success);
        const exp = r.fail * gem.level * t.gemExpPerLevel;
        gainExp(o, exp);
        const nextLevel = o.config.requireGoods(gem.nextId).gem!.level;
        if (r.success > 0 && nextLevel > t.gemNewsLevel)
          opNews(o, 'gem.levelUp', { goodsId: gem.nextId, num: r.success, name: o.rest.name });
        if (r.fail > 0 && nextLevel >= t.gemBrokenNewsLevel)
          opNews(o, 'gem.broken', { goodsId: b.goodsId, num: r.fail * 2, name: o.rest.name });
        return { ...r, exp };
      });
    },
```

`routes.ts`：import 加 `gemLevelUpBody, inlayBody, ungemBody`，加：

```ts
    r.post('/equip/drill', async (req) => okOp(await svc.drill(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/inlay', async (req) => okOp(await svc.inlay(restCtxOf(req), parse(inlayBody, req.body))));
    r.post('/equip/ungem', async (req) => okOp(await svc.ungem(restCtxOf(req), parse(ungemBody, req.body))));
    r.get('/gem/list', async (req) => ok(await svc.gems(restCtxOf(req))));
    r.post('/gem/levelup', async (req) => okOp(await svc.gemLevelUp(restCtxOf(req), parse(gemLevelUpBody, req.body))));
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps
git commit -m "feat(equip): drill sockets, inlay and remove gems, gem list and tier-up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 预设

**Files:**
- Create: `apps/server/src/modules/equip/preset.test.ts`
- Modify: `apps/server/src/modules/equip/service.ts`, `apps/server/src/modules/equip/routes.ts`

**Interfaces:**
- Consumes: Task 5 `own`、`putOn`、`op`、`PART_COLS`、`notFound`、`syncEquipEffects`；`limitReached`（core/errors）
- Produces: service 方法 `savePreset(ctx, { name })`、`applyPreset(ctx, { id }): OpResult<{ skipped: number[] }>`、`deletePreset(ctx, { id })`；路由 `POST /equip/preset/save`、`/equip/preset/apply`、`/equip/preset/delete`

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/preset.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const eq = () => t.game.equip;
async function piece(ctx: RestCtx, goodsId: number): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId, min_level: def.minLevel })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const wornIds = async (ctx: RestCtx) =>
  (
    await t.db
      .selectFrom('equip')
      .select('id')
      .where('rest_id', '=', ctx.restaurantId)
      .where('worn', '=', true)
      .orderBy('id')
      .execute()
  ).map((r) => r.id);

describe('预设（设计文档 §3.10、裁定 11）', () => {
  it('保存当前穿戴；全部卸下后一键套用恢复；列表里标出所在预设', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 20 } });
    const a = await piece(ctx, 30);
    const b = await piece(ctx, 56);
    await eq().wear(ctx, { id: a });
    await eq().wear(ctx, { id: b });
    const saved = await eq().savePreset(ctx, { name: '日常' });
    const o = await eq().overview(ctx);
    expect(o.presets).toEqual([{ id: saved.data.id, name: '日常', parts: [a, null, b, null, null] }]);
    expect((await eq().list(ctx, {})).find((x) => x.id === a)!.inPresets).toEqual(['日常']);
    await eq().unwearAll(ctx);
    expect(await wornIds(ctx)).toEqual([]);
    const r = await eq().applyPreset(ctx, { id: saved.data.id });
    expect(r.data.skipped).toEqual([]);
    expect(await wornIds(ctx)).toEqual([a, b]);
  });

  it('套用时等级不够的部位留空并列出', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 20 } });
    const a = await piece(ctx, 30);
    const b = await piece(ctx, 56);
    await eq().wear(ctx, { id: a });
    await eq().wear(ctx, { id: b });
    const saved = await eq().savePreset(ctx, { name: 'A' });
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', ctx.restaurantId).execute();
    const r = await eq().applyPreset(ctx, { id: saved.data.id });
    expect(r.data.skipped).toEqual([3]);
    expect(await wornIds(ctx)).toEqual([a]);
  });

  it('名称不能重复；最多 5 套；删除；别人的预设报 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    const ids: number[] = [];
    for (const name of ['1', '2', '3', '4', '5']) ids.push((await eq().savePreset(ctx, { name })).data.id);
    await expect(eq().savePreset(ctx, { name: '1' })).rejects.toMatchObject({ params: { reason: 'preset_name' } });
    await expect(eq().savePreset(ctx, { name: '6' })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'presets', max: 5 },
    });
    await eq().deletePreset(ctx, { id: ids[0]! });
    expect((await eq().overview(ctx)).presets).toHaveLength(4);
    const other = await newRestaurant(t);
    await expect(eq().deletePreset(other, { id: ids[1]! })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(eq().applyPreset(other, { id: ids[1]! })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/preset.test.ts`
Expected: FAIL，`eq().savePreset is not a function`

- [ ] **Step 3: 实现**

`service.ts`：`../../core/errors` 那行加 `limitReached`。返回对象里加：

```ts
    savePreset(ctx: RestCtx, b: { name: string }) {
      return op(ctx, 'equip.preset', async (o) => {
        const t = o.tuning.equip;
        const presets = await o.tx
          .selectFrom('equip_preset')
          .select(['id', 'name'])
          .where('rest_id', '=', o.rest.id)
          .execute();
        if (presets.some((p) => p.name === b.name)) throw invalidState('preset_name');
        if (presets.length >= t.maxPresets) throw limitReached('presets', { max: t.maxPresets });
        const worn = await o.tx
          .selectFrom('equip')
          .select(['id', 'part'])
          .where('rest_id', '=', o.rest.id)
          .where('worn', '=', true)
          .execute();
        const parts = Object.fromEntries(
          PART_COLS.map((c, i) => [c, worn.find((w) => w.part === i + 1)?.id ?? null]),
        ) as Record<(typeof PART_COLS)[number], number | null>;
        const row = await o.tx
          .insertInto('equip_preset')
          .values({ rest_id: o.rest.id, name: b.name, created_at: o.now, ...parts })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { id: row.id };
      });
    },

    applyPreset(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.preset', async (o) => {
        const p = await o.tx
          .selectFrom('equip_preset')
          .selectAll()
          .where('id', '=', b.id)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (!p) throw notFound('preset', b.id);
        await o.tx
          .updateTable('equip')
          .set({ worn: false })
          .where('rest_id', '=', o.rest.id)
          .where('worn', '=', true)
          .execute();
        const skipped: number[] = [];
        for (const [i, c] of PART_COLS.entries()) {
          const id = p[c];
          if (id === null) continue;
          const e = await o.tx
            .selectFrom('equip')
            .selectAll()
            .where('id', '=', id)
            .where('rest_id', '=', o.rest.id)
            .executeTakeFirst();
          // 裁定 11：等级不够（或厨具已经不在）的部位留空
          if (!e || o.rest.level < e.min_level) {
            skipped.push(i + 1);
            continue;
          }
          await putOn(o, e);
        }
        await syncEquipEffects(o);
        return { skipped };
      });
    },

    deletePreset(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.preset', async (o) => {
        const r = await o.tx
          .deleteFrom('equip_preset')
          .where('id', '=', b.id)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (Number(r.numDeletedRows) === 0) throw notFound('preset', b.id);
        return { id: b.id };
      });
    },
```

`routes.ts`：import 加 `presetSaveBody`，加：

```ts
    r.post('/equip/preset/save', async (req) => okOp(await svc.savePreset(restCtxOf(req), parse(presetSaveBody, req.body))));
    r.post('/equip/preset/apply', async (req) => okOp(await svc.applyPreset(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/preset/delete', async (req) => okOp(await svc.deletePreset(restCtxOf(req), parse(equipIdBody, req.body))));
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps
git commit -m "feat(equip): save, apply and delete up to five presets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 开放功能、任务、好友餐厅页、功能关闭时加成保留

**Files:**
- Create: `apps/server/src/modules/equip/integration.test.ts`
- Modify: `apps/server/src/core/features.ts`, `apps/server/src/modules/task/service.ts`, `apps/server/src/modules/friend/reads.ts`, `packages/shared/src/schemas/friend.ts`, `apps/web/src/views/FriendRestView.test.ts`（夹具补 `equips: []`）

**Interfaces:**
- Consumes: Task 5 `wear`、`overview`；`t.game.task.tasks(ctx)`；`t.game.social.reads.detail(ctx, restId)`
- Produces: `IMPLEMENTED_FEATURES` 含 `equip`；任务状态键 `equip.maxStress`；`FriendRestDto.equips: Array<{ part: number; goodsId: number; stress: number }>`

- [ ] **Step 1: 写失败的测试 `apps/server/src/modules/equip/integration.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, newPair, newRestaurant, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../effects/service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId, ...patch })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}

describe('任务（设计文档 §4.2）', () => {
  it('主线第 30 步「穿戴一件厨具」不再跳过，穿一件就完成', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 30 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 30, key: 'equip.wear', done: false });
    await t.game.equip.wear(ctx, { id: await piece(ctx, 30) });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 30, done: true });
  });

  it('支线「把厨具强化到 +5」按最高强化等级算', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 40 } });
    await piece(ctx, 30, { stress: 5 });
    await piece(ctx, 31, { stress: 2 });
    const side = (await t.game.task.tasks(ctx)).side.find((x) => x.key === 'equip.maxStress');
    expect(side).toMatchObject({ progress: 5, done: true });
  });
});

describe('好友餐厅页显示对方穿戴（子项目 3 留给 2B）', () => {
  it('只列穿着的厨具', async () => {
    const [a, b] = await newPair(t);
    const id = await piece(b, 30, { stress: 3 });
    await piece(b, 31);
    await t.game.equip.wear(b, { id });
    const d = await t.game.social.reads.detail(a, b.restaurantId);
    expect(d.equips).toEqual([{ part: 1, goodsId: 30, stress: 3 }]);
  });
});

describe('功能关闭（设计文档 裁定 10）', () => {
  it('接口拒绝，已穿戴的幸运和套装加成照常生效', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13, main_task_step: 40 } });
    expect((await t.game.task.tasks(ctx)).side.some((x) => x.key.startsWith('equip.'))).toBe(true);
    for (const g of [62, 103, 64]) await t.game.equip.wear(ctx, { id: await piece(ctx, g, { base_luck: 4 }) });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { equip: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.equip.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    const agg = await getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(agg.luckValue).toBeGreaterThanOrEqual(12);
    expect(agg.atRate).toBeGreaterThanOrEqual(0.05);
    const off = await t.game.task.tasks(ctx);
    expect(off.side.some((x) => x.key.startsWith('equip.'))).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/integration.test.ts`
Expected: FAIL：主线第 30 步被跳过（`step` 不是 30）；`d.equips` 为 undefined；`equip.maxStress` 支线不显示

- [ ] **Step 3: 实现**

`apps/server/src/core/features.ts` 的 `IMPLEMENTED_FEATURES` 里 `'friend',` 后面加 `'equip',`。

`apps/server/src/modules/task/service.ts` 的 `snapshot` 里 `const friends = ...` 后面加：

```ts
    const maxStress = await db
      .selectFrom('equip')
      .select((eb) => eb.fn.max('stress').as('m'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirst();
```

`extra` 改成：

```ts
    const extra = {
      'friends.count': Number(friends.n),
      'rest.thumbs': counters.get('thumbs.received') ?? 0,
      'equip.maxStress': Number(maxStress?.m ?? 0),
    };
```

`packages/shared/src/schemas/friend.ts` 的 `FriendRestDto` 里 `thumbedToday` 后面加：

```ts
  /** 对方穿着的厨具（子项目 2B） */
  equips: Array<{ part: number; goodsId: number; stress: number }>;
```

`apps/server/src/modules/friend/reads.ts` 的 `detail`：`const thumbed = ...` 后面加

```ts
      const equips = await d.db
        .selectFrom('equip')
        .select(['part', 'goods_id', 'stress'])
        .where('rest_id', '=', restId)
        .where('worn', '=', true)
        .orderBy('part')
        .execute();
```

返回对象里 `thumbedToday: thumbed !== undefined,` 后面加 `equips: equips.map((e) => ({ part: e.part, goodsId: e.goods_id, stress: e.stress })),`。

`apps/web/src/views/FriendRestView.test.ts` 里的 `FriendRestDto` 夹具补 `equips: []`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/equip/ src/modules/task/ src/modules/friend/ src/modules/admin/ && pnpm -s typecheck`
Expected: PASS（后台区服页的功能开关列表多了 `equip`；如果有测试断言了完整列表，把 `equip` 加进去）

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps packages
git commit -m "feat(equip): open the equip feature so quests 30/31 and cookware side quests count, friends see worn gear

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 前端——接口、错误文案、厨具页、首页入口、仓库提示

**Files:**
- Create: `apps/web/src/views/EquipView.vue`, `apps/web/src/views/EquipView.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`, `apps/web/src/i18n/zh-CN.ts`, `apps/web/src/utils/labels.ts`, `apps/web/src/utils/events.ts`, `apps/web/src/router.ts`, `apps/web/src/views/RestaurantHomeView.vue`, `apps/web/src/views/StoreView.vue`

**Interfaces:**
- Consumes: Task 5~9 的接口和 shared DTO
- Produces:
  - `endpoints.equipOverview()`、`equipList(part?)`、`equipDetail(id)`、`equipWear(id)`、`equipUnwear(id)`、`equipUnwearAll()`、`equipStress(id, stone)`、`equipRollback(id, goodsId)`、`equipLock(id, locked)`、`equipSalvage(id)`、`equipSell(id)`、`equipBatch(ids, way)`、`equipDrill(id)`、`equipInlay(id, gemId)`、`equipUngem(gemRowId)`、`gems()`、`gemLevelUp(goodsId, num)`、`equipPresetSave(name)`、`equipPresetApply(id)`、`equipPresetDelete(id)`
  - `PART_NAMES: string[]`（下标 = 部位）、`ATTR_NAMES: Record<string, string>`、`ATTR_KEYS`
  - 路由 `/rest/equip`（name `equip`）；Task 12 再加 `/rest/equip/:id`、`/rest/gem`

- [ ] **Step 1: 写失败的测试 `apps/web/src/views/EquipView.test.ts`**

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AttrsDto, EquipDto, EquipOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import EquipView from './EquipView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    equipOverview: vi.fn(),
    equipList: vi.fn(),
    equipWear: vi.fn(),
    equipUnwear: vi.fn(),
    equipUnwearAll: vi.fn(),
    equipBatch: vi.fn(),
    equipPresetSave: vi.fn(),
    equipPresetApply: vi.fn(),
    equipPresetDelete: vi.fn(),
  },
}));

const attrs = (patch: Partial<AttrsDto> = {}): AttrsDto => ({
  cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0, ...patch,
});
const piece = (patch: Partial<EquipDto> = {}): EquipDto => ({
  id: 1, goodsId: 30, part: 1, suitId: 0, minLevel: 0, stress: 0, curHole: 0, maxHole: 0,
  locked: false, worn: false, inPresets: [], base: attrs({ cook: 3 }), boost: attrs(), gem: attrs(),
  total: attrs({ cook: 3 }), gems: [], salvage: 1, sellPrice: 42000, ...patch,
});
const overview = (patch: Partial<EquipOverviewDto> = {}): EquipOverviewDto => ({
  worn: [piece({ worn: true, stress: 2 }), null, null, null, null],
  suits: [
    {
      suitId: 100, name: '真爱套装', count: 3, maxNum: 5,
      tiers: [
        { need: 3, desc: '上座率+5%, 挑剔率+3%', active: true },
        { need: 5, desc: '最终银币+5%, 幸运+52', active: false },
      ],
    },
  ],
  attrs: { points: attrs({ cook: 4 }), gear: attrs({ cook: 3 }), total: attrs({ cook: 7 }), power: 7 },
  presets: [{ id: 9, name: '日常', parts: [1, null, null, null, null] }],
  count: 3,
  level: 5,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: EquipView }],
  });
  const w = mount(EquipView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('EquipView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.equipOverview).mockResolvedValue(overview());
    vi.mocked(endpoints.equipList).mockResolvedValue([
      piece({ id: 2, goodsId: 47, minLevel: 13 }),
      piece({ id: 3, goodsId: 30 }),
    ]);
    vi.mocked(endpoints.equipWear).mockResolvedValue({});
    vi.mocked(endpoints.equipBatch).mockResolvedValue({ count: 1, essence: 1, coin: 0 });
    vi.mocked(endpoints.equipPresetSave).mockResolvedValue({ id: 10 });
    vi.mocked(endpoints.equipPresetApply).mockResolvedValue({ skipped: [3] });
  });

  it('显示属性、厨力、5 个部位和套装档位', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="power"]').text()).toBe('7');
    expect(w.find('[data-testid="slot-1"]').text()).toContain('+2');
    expect(w.find('[data-testid="slot-2"]').text()).toContain('空');
    expect(w.text()).toContain('真爱套装（3/5）');
    expect(w.text()).toContain('上座率+5%, 挑剔率+3%');
  });

  it('点部位列出厨具；等级不够的不能穿；点穿戴调用接口', async () => {
    const w = await mountView();
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipList).toHaveBeenCalledWith(1);
    const tooHigh = w.find('[data-testid="wear-2"]');
    expect(tooHigh.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('需要 13 级');
    await w.find('[data-testid="wear-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipWear).toHaveBeenCalledWith(3);
  });

  it('预设：保存当前、套用（提示留空的部位）', async () => {
    const w = await mountView();
    await w.find('[data-testid="open-presets"]').trigger('click');
    await w.find('[data-testid="preset-name"]').setValue('打架');
    await w.find('[data-testid="preset-save"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipPresetSave).toHaveBeenCalledWith('打架');
    await w.find('[data-testid="preset-apply-9"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipPresetApply).toHaveBeenCalledWith(9);
    expect(useToastStore().items.some((x) => x.text.includes('锅'))).toBe(true);
  });

  it('一键处理：默认只选干净的厨具，显示合计，确认后调用接口', async () => {
    vi.mocked(endpoints.equipList).mockResolvedValue([
      piece({ id: 4, salvage: 2 }),
      piece({ id: 5, locked: true }),
      piece({ id: 6, stress: 1 }),
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView();
    await w.find('[data-testid="open-batch"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid^="batch-item-"]')).toHaveLength(1);
    expect(w.find('[data-testid="batch-total"]').text()).toContain('2');
    await w.find('[data-testid="batch-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipBatch).toHaveBeenCalledWith([4], 'salvage');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/views/EquipView.test.ts`
Expected: FAIL，`Failed to resolve import "./EquipView.vue"`

- [ ] **Step 3: 实现**

`apps/web/src/api/endpoints.ts`：类型 import 里加 `EquipBatchDto, EquipDetailDto, EquipDto, EquipOverviewDto, GemLevelUpDto, GemsDto, StressResultDto`（按字母顺序插入），`endpoints` 末尾加：

```ts
  equipOverview: () => api.get<EquipOverviewDto>('/api/v1/equip/overview'),
  equipList: (part?: number) => api.get<EquipDto[]>(`/api/v1/equip/list${qs({ part })}`),
  equipDetail: (id: number) => api.get<EquipDetailDto>(`/api/v1/equip/item/${id}`),
  equipWear: (id: number) => api.post<Anything>('/api/v1/equip/wear', { id }),
  equipUnwear: (id: number) => api.post<Anything>('/api/v1/equip/unwear', { id }),
  equipUnwearAll: () => api.post<Anything>('/api/v1/equip/unwearAll'),
  equipStress: (id: number, stone: boolean) => api.post<StressResultDto>('/api/v1/equip/stress', { id, stone }),
  equipRollback: (id: number, goodsId: number) =>
    api.post<{ stress: number }>('/api/v1/equip/rollback', { id, goodsId }),
  equipLock: (id: number, locked: boolean) => api.post<Anything>('/api/v1/equip/lock', { id, locked }),
  equipSalvage: (id: number) => api.post<{ essence: number }>('/api/v1/equip/salvage', { id }),
  equipSell: (id: number) => api.post<{ coin: number }>('/api/v1/equip/sell', { id }),
  equipBatch: (ids: number[], way: 'salvage' | 'sell') =>
    api.post<EquipBatchDto>('/api/v1/equip/batch', { ids, way }),
  equipDrill: (id: number) => api.post<{ curHole: number }>('/api/v1/equip/drill', { id }),
  equipInlay: (id: number, gemId: number) => api.post<Anything>('/api/v1/equip/inlay', { id, gemId }),
  equipUngem: (gemRowId: number) => api.post<{ coin: number }>('/api/v1/equip/ungem', { gemRowId }),
  gems: () => api.get<GemsDto>('/api/v1/gem/list'),
  gemLevelUp: (goodsId: number, num: number) => api.post<GemLevelUpDto>('/api/v1/gem/levelup', { goodsId, num }),
  equipPresetSave: (name: string) => api.post<{ id: number }>('/api/v1/equip/preset/save', { name }),
  equipPresetApply: (id: number) => api.post<{ skipped: number[] }>('/api/v1/equip/preset/apply', { id }),
  equipPresetDelete: (id: number) => api.post<Anything>('/api/v1/equip/preset/delete', { id }),
```

`apps/web/src/utils/labels.ts` 末尾加：

```ts
/** 厨具部位（下标 = part） */
export const PART_NAMES = ['', '铲', '刀', '锅', '瓶', '帽'];

export const ATTR_KEYS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;

export const ATTR_NAMES: Record<string, string> = {
  cook: '厨艺',
  cutting: '刀工',
  fire: '火候',
  season: '调味',
  creatives: '创意',
  luck: '幸运',
};
```

`apps/web/src/i18n/zh-CN.ts`：`STATE` 里加

```ts
  locked: '厨具已锁定，先解锁',
  has_gems: '厨具上镶着宝石，先摘下来',
  in_preset: '厨具在预设里，先删掉那个预设',
  worn: '厨具正穿在身上，先卸下',
  not_worn: '这件厨具没有穿戴',
  max_stress: '已经强化到最高了',
  no_stress: '这件厨具还没有强化过',
  hole_full: '孔位已经打满了',
  cannot_drill: '这件厨具不能打孔',
  no_hole: '没有空的孔位了',
  gem_max: '已经是最高阶的宝石',
  not_gem: '这不是宝石',
  not_back_stress: '这个道具不能回退强化',
  preset_name: '预设名称重复了',
  batch_dirty: '有厨具不满足条件（锁定、穿戴、强化过、有宝石或在预设里），请刷新后重试',
```

`LIMIT` 里加 `presets: (p) => \`预设最多 ${String(p.max)} 套\`,`。

`apps/web/src/utils/events.ts` 的 `LOGS` 里加：

```ts
  'equip.stress': (p, names) =>
    `${names.goodsName(n(p, 'goodsId'))}强化到 +${n(p, 'to')}${p.success ? '成功' : '失败'}`,
```

（失败时 `to` 是尝试的等级；文案写"强化到 +N 失败"。）

`apps/web/src/router.ts`：在 `/rest/look` 那条后面加

```ts
  {
    path: '/rest/equip',
    name: 'equip',
    component: () => import('./views/EquipView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/views/EquipView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { EquipDto, EquipOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const o = ref<EquipOverviewDto | null>(null);
const part = ref<number | null>(null);
const pieces = ref<EquipDto[]>([]);
const panel = ref<'none' | 'presets' | 'batch'>('none');
const presetName = ref('');
const all = ref<EquipDto[]>([]);
const picked = ref(new Set<number>());
const way = ref<'salvage' | 'sell'>('salvage');
const busy = ref(false);

async function load() {
  o.value = await endpoints.equipOverview();
  if (part.value !== null) pieces.value = await endpoints.equipList(part.value);
}
async function run(fn: () => Promise<unknown>, fallback: string): Promise<boolean> {
  busy.value = true;
  try {
    await fn();
    await load();
    return true;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return false;
  } finally {
    busy.value = false;
  }
}
const name = (e: EquipDto) => `${catalog.goodsName(e.goodsId)}${e.stress > 0 ? ` +${e.stress}` : ''}`;

async function pick(p: number) {
  part.value = part.value === p ? null : p;
  pieces.value = part.value === null ? [] : await endpoints.equipList(p);
}

async function savePreset() {
  const n = presetName.value.trim();
  if (!n) return;
  if (await run(() => endpoints.equipPresetSave(n), '保存失败')) presetName.value = '';
}
async function applyPreset(id: number) {
  let skipped: number[] = [];
  const ok = await run(async () => {
    skipped = (await endpoints.equipPresetApply(id)).skipped;
  }, '套用失败');
  if (ok && skipped.length > 0)
    toast.push(`等级不够，这些部位留空：${skipped.map((p) => PART_NAMES[p]).join('、')}`, 'info');
}
async function deletePreset(id: number) {
  if (window.confirm('确定删除这个预设吗？')) await run(() => endpoints.equipPresetDelete(id), '删除失败');
}

/** 一键处理只能选"未锁定、未穿戴、没强化、没宝石、不在预设"的；出售还要有价格 */
const candidates = computed(() =>
  all.value.filter(
    (e) =>
      !e.locked &&
      !e.worn &&
      e.stress === 0 &&
      e.gems.length === 0 &&
      e.inPresets.length === 0 &&
      (way.value === 'salvage' || e.sellPrice !== null),
  ),
);
const batchTotal = computed(() =>
  candidates.value
    .filter((e) => picked.value.has(e.id))
    .reduce((s, e) => s + (way.value === 'salvage' ? e.salvage : (e.sellPrice ?? 0)), 0),
);
async function openBatch() {
  panel.value = panel.value === 'batch' ? 'none' : 'batch';
  if (panel.value !== 'batch') return;
  all.value = await endpoints.equipList();
  picked.value = new Set(candidates.value.map((e) => e.id));
}
function toggle(id: number) {
  const s = new Set(picked.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  picked.value = s;
}
async function doBatch() {
  const ids = candidates.value.filter((e) => picked.value.has(e.id)).map((e) => e.id);
  if (ids.length === 0) return;
  const what = way.value === 'salvage' ? `分解得到 ${batchTotal.value} 精华` : `出售得到 ${formatNum(batchTotal.value)} 银币`;
  if (!window.confirm(`处理 ${ids.length} 件厨具，${what}？`)) return;
  await run(() => endpoints.equipBatch(ids, way.value), '处理失败');
  all.value = await endpoints.equipList();
  picked.value = new Set(candidates.value.map((e) => e.id));
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取厨具失败'), 'danger')));
</script>

<template>
  <div v-if="o">
    <h5>厨具 <small class="text-muted">共 {{ o.count }} 件</small></h5>
    <table class="table table-sm small mb-2">
      <thead>
        <tr>
          <th></th>
          <th v-for="k in ATTR_KEYS" :key="k">{{ ATTR_NAMES[k] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>加点</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ o.attrs.points[k] }}</td>
        </tr>
        <tr>
          <td>厨具</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ o.attrs.gear[k] }}</td>
        </tr>
        <tr class="fw-bold">
          <td>合计</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ o.attrs.total[k] }}</td>
        </tr>
      </tbody>
    </table>
    <div class="small mb-2">
      厨力 <b data-testid="power">{{ o.attrs.power }}</b>
      <span class="text-muted">（五项之和 + 幸运/2；厨塔、切磋开放后使用）</span>
    </div>

    <div class="row g-1 mb-2">
      <div v-for="p in [1, 2, 3, 4, 5]" :key="p" class="col">
        <div
          class="border rounded p-1 small text-center"
          :class="{ 'border-primary': part === p }"
          role="button"
          :data-testid="`slot-${p}`"
          @click="pick(p)"
        >
          <div class="text-muted">{{ PART_NAMES[p] }}</div>
          <div v-if="o.worn[p - 1]">{{ name(o.worn[p - 1]!) }}</div>
          <div v-else class="text-muted">空</div>
        </div>
      </div>
    </div>

    <div v-if="part !== null" class="border rounded p-2 mb-2 small">
      <div v-if="pieces.length === 0" class="text-muted">没有这个部位的厨具</div>
      <div v-for="e in pieces" :key="e.id" class="d-flex align-items-center gap-1 border-bottom py-1">
        <RouterLink :to="`/rest/equip/${e.id}`" class="flex-fill">
          {{ name(e) }}
          <span v-if="e.locked" class="bi bi-lock"></span>
          <span class="text-muted">
            {{ ATTR_KEYS.filter((k) => e.total[k] > 0).map((k) => `${ATTR_NAMES[k]}${e.total[k]}`).join(' ') }}
          </span>
        </RouterLink>
        <span v-if="o.level < e.minLevel" class="text-danger">需要 {{ e.minLevel }} 级</span>
        <button
          v-if="!e.worn"
          class="btn btn-sm btn-primary"
          :disabled="busy || o.level < e.minLevel"
          :data-testid="`wear-${e.id}`"
          @click="run(() => endpoints.equipWear(e.id), '穿戴失败')"
        >
          穿戴
        </button>
        <button
          v-else
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          @click="run(() => endpoints.equipUnwear(e.id), '卸下失败')"
        >
          卸下
        </button>
      </div>
    </div>

    <div v-for="s in o.suits" :key="s.suitId" class="small mb-1">
      <b>{{ s.name }}（{{ s.count }}/{{ s.maxNum }}）</b>
      <span v-for="t in s.tiers" :key="t.need" :class="['ms-2', t.active ? 'text-success' : 'text-muted']">
        {{ t.need }} 件：{{ t.desc }}
      </span>
    </div>

    <div class="d-flex flex-wrap gap-1 my-2">
      <RouterLink to="/rest/gem" class="btn btn-sm btn-outline-primary">宝石</RouterLink>
      <button class="btn btn-sm btn-outline-primary" data-testid="open-presets" @click="panel = panel === 'presets' ? 'none' : 'presets'">
        预设
      </button>
      <button class="btn btn-sm btn-outline-primary" data-testid="open-batch" @click="openBatch">一键处理</button>
      <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="run(() => endpoints.equipUnwearAll(), '卸下失败')">
        全部卸下
      </button>
    </div>

    <div v-if="panel === 'presets'" class="border rounded p-2 small mb-2">
      <div v-for="p in o.presets" :key="p.id" class="d-flex align-items-center gap-1 border-bottom py-1">
        <span class="flex-fill">{{ p.name }}</span>
        <button class="btn btn-sm btn-primary" :disabled="busy" :data-testid="`preset-apply-${p.id}`" @click="applyPreset(p.id)">
          套用
        </button>
        <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="deletePreset(p.id)">删除</button>
      </div>
      <div class="d-flex gap-1 mt-2">
        <input v-model="presetName" maxlength="12" class="form-control form-control-sm" placeholder="预设名称" data-testid="preset-name" />
        <button class="btn btn-sm btn-primary text-nowrap" :disabled="busy" data-testid="preset-save" @click="savePreset">
          保存当前
        </button>
      </div>
    </div>

    <div v-if="panel === 'batch'" class="border rounded p-2 small mb-2">
      <div class="mb-1">
        <label class="me-2"><input v-model="way" type="radio" value="salvage" /> 分解成精华</label>
        <label><input v-model="way" type="radio" value="sell" /> 出售</label>
      </div>
      <div class="text-muted mb-1">只列出未锁定、未穿戴、没强化、没宝石、不在预设里的厨具</div>
      <div v-for="e in candidates" :key="e.id" :data-testid="`batch-item-${e.id}`">
        <label><input type="checkbox" :checked="picked.has(e.id)" @change="toggle(e.id)" /> {{ name(e) }}</label>
      </div>
      <div class="d-flex align-items-center mt-2">
        <span data-testid="batch-total">合计 {{ way === 'salvage' ? `${batchTotal} 精华` : `${formatNum(batchTotal)} 银币` }}</span>
        <button class="btn btn-sm btn-danger ms-auto" :disabled="busy" data-testid="batch-go" @click="doBatch">处理</button>
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/views/RestaurantHomeView.vue`：在上一轮收益那个 `div`（`data-testid="last-round"`）后面加

```vue
    <div class="small my-2">
      <RouterLink to="/rest/equip" data-testid="link-equip"><i class="bi bi-tools"></i> 厨具 ›</RouterLink>
    </div>
```

`apps/web/src/views/StoreView.vue`：`import { RouterLink } from 'vue-router';`；在 `已用 {{ data.kinds }}/...` 那个 `div` 后面加

```vue
    <div v-if="data.equips > 0" class="small text-muted mb-2">
      另有 {{ data.equips }} 件厨具在 <RouterLink to="/rest/equip">厨具页</RouterLink>（每件占一格）
    </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/web exec vitest run && pnpm -s typecheck && pnpm -s lint`
Expected: PASS（`RestaurantHomeView.test.ts` 如果断言了链接数量，按新增的一个链接调整）

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps/web
git commit -m "feat(web): cookware page with stats, slots, sets, presets and batch processing; home and warehouse links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 前端——厨具详情、宝石页、好友餐厅页的穿戴

**Files:**
- Create: `apps/web/src/views/EquipDetailView.vue`, `apps/web/src/views/EquipDetailView.test.ts`, `apps/web/src/views/GemView.vue`, `apps/web/src/views/GemView.test.ts`
- Modify: `apps/web/src/router.ts`, `apps/web/src/views/FriendRestView.vue`, `apps/web/src/views/FriendRestView.test.ts`

**Interfaces:**
- Consumes: Task 11 的 `endpoints.*`、`PART_NAMES`、`ATTR_KEYS`、`ATTR_NAMES`
- Produces: 路由 `/rest/equip/:id(\\d+)`（name `equipDetail`）、`/rest/gem`（name `gems`）；E2E 用到的 data-testid：`stone`、`stress-go`、`drill-go`、`inlay-pick`、`inlay-go`、`ungem-<行 id>`、`rollback-go`、`lock-go`、`salvage-go`、`sell-go`、`hole-count`、`levelup-<goodsId>`、`levelup-num-<goodsId>`、`friend-equips`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/EquipDetailView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AttrsDto, EquipDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import EquipDetailView from './EquipDetailView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    equipDetail: vi.fn(),
    equipStress: vi.fn(),
    equipRollback: vi.fn(),
    equipLock: vi.fn(),
    equipSalvage: vi.fn(),
    equipSell: vi.fn(),
    equipDrill: vi.fn(),
    equipInlay: vi.fn(),
    equipUngem: vi.fn(),
  },
}));

const attrs = (patch: Partial<AttrsDto> = {}): AttrsDto => ({
  cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0, ...patch,
});
const detail = (patch: Partial<EquipDetailDto['equip']> = {}): EquipDetailDto => ({
  equip: {
    id: 7, goodsId: 56, part: 3, suitId: 5, minLevel: 13, stress: 2, curHole: 2, maxHole: 3,
    locked: false, worn: false, inPresets: [], base: attrs({ fire: 12 }), boost: attrs({ fire: 3 }),
    gem: attrs({ cook: 1 }), total: attrs({ fire: 15, cook: 1 }),
    gems: [{ id: 55, goodsId: 44, level: 1, attrs: attrs({ cook: 1 }) }],
    salvage: 36, sellPrice: 350000, ...patch,
  },
  rate: { base: 0.64, luck: 0.01, weather: 0, floor: 0.02, total: 0.67 },
  cost: { essence: 12, coin: 120000 },
  history: [{ stress: 2, success: true, attr: 'fire', val: 3, lucky: false, floor: false, stone: false, at: '2026-09-30T00:00:00.000Z' }],
  have: { essence: 30, stone: 1, drill: 1 },
  backItems: [{ goodsId: 225, num: 1, back: 1 }],
  gems: [{ goodsId: 44, num: 2, level: 1 }],
  ungemCoinPerLevel: 10000,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/rest/equip/:id', component: EquipDetailView },
      { path: '/:p(.*)*', component: { template: '<p/>' } },
    ],
  });
  await router.push('/rest/equip/7');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe('EquipDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.equipDetail).mockResolvedValue(detail());
    vi.mocked(endpoints.equipStress).mockResolvedValue({ success: true, lucky: false, floor: false, attr: 'fire', val: 4, stress: 3 });
    for (const f of ['equipRollback', 'equipLock', 'equipSalvage', 'equipSell', 'equipDrill', 'equipInlay', 'equipUngem'] as const)
      vi.mocked(endpoints[f]).mockResolvedValue({} as never);
  });

  it('显示属性分项、成功率、花费；勾强化石强化，提示结果', async () => {
    const { w } = await mountView();
    expect(w.text()).toContain('67.0%');
    expect(w.text()).toContain('精华 ×12');
    await w.find('[data-testid="stone"]').setValue(true);
    await w.find('[data-testid="stress-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipStress).toHaveBeenCalledWith(7, true);
    expect(useToastStore().items.some((x) => x.text.includes('强化成功 +3'))).toBe(true);
  });

  it('回退、打孔、镶嵌、摘除调用对应接口', async () => {
    const { w } = await mountView();
    await w.find('[data-testid="rollback-go"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="drill-go"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ungem-55"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipRollback).toHaveBeenCalledWith(7, 225);
    expect(endpoints.equipDrill).toHaveBeenCalledWith(7);
    expect(endpoints.equipUngem).toHaveBeenCalledWith(55);
    expect(w.find('[data-testid="hole-count"]').text()).toContain('1/2');
    await w.find('[data-testid="inlay-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipInlay).toHaveBeenCalledWith(7, 44);
  });

  it('有宝石时分解和出售按钮禁用；干净的厨具确认后分解并回到厨具页', async () => {
    const { w: dirty } = await mountView();
    expect(dirty.find('[data-testid="salvage-go"]').attributes('disabled')).toBeDefined();
    vi.mocked(endpoints.equipDetail).mockResolvedValue(detail({ gems: [], gem: attrs() }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { w, router } = await mountView();
    await w.find('[data-testid="salvage-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipSalvage).toHaveBeenCalledWith(7);
    expect(router.currentRoute.value.path).toBe('/rest/equip');
  });
});
```

`apps/web/src/views/GemView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GemsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import GemView from './GemView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { gems: vi.fn(), gemLevelUp: vi.fn() } }));

const attrs = { cook: 1, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const data: GemsDto = {
  items: [
    { goodsId: 44, num: 5, level: 1, nextId: 286, rate: 0.77, attrs },
    { goodsId: 341, num: 1, level: 6, nextId: null, rate: 0, attrs },
  ],
  luckRate: 0.17,
  strength: 100,
};

describe('GemView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.gems).mockResolvedValue(structuredClone(data));
    vi.mocked(endpoints.gemLevelUp).mockResolvedValue({ success: 1, lucky: 0, fail: 1, exp: 1000 });
  });

  it('组数不超过 持有/2；最高阶不能升；结果提示成功、失败和经验', async () => {
    const w = mount(GemView);
    await flushPromises();
    expect(w.text()).toContain('77.0%');
    expect(w.find('[data-testid="levelup-341"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="levelup-num-44"]').setValue('9');
    await w.find('[data-testid="levelup-44"]').trigger('click');
    await flushPromises();
    expect(endpoints.gemLevelUp).toHaveBeenCalledWith(44, 2);
    expect(useToastStore().items.some((x) => x.text.includes('成功 1') && x.text.includes('经验 1,000'))).toBe(true);
  });
});
```

`apps/web/src/views/FriendRestView.test.ts`：把 Task 10 补的 `equips: []` 所在的 `detail()` 夹具保留，加一个用例：

```ts
  it('显示对方穿着的厨具', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ equips: [{ part: 1, goodsId: 30, stress: 3 }] }));
    const w = await mountView();
    expect(w.find('[data-testid="friend-equips"]').text()).toContain('铲');
    expect(w.find('[data-testid="friend-equips"]').text()).toContain('+3');
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/views/EquipDetailView.test.ts src/views/GemView.test.ts src/views/FriendRestView.test.ts`
Expected: FAIL（找不到两个新页面；好友页没有 `friend-equips`）

- [ ] **Step 3: 实现**

`apps/web/src/router.ts`：`/rest/equip` 后面加

```ts
  {
    path: '/rest/equip/:id(\\d+)',
    name: 'equipDetail',
    component: () => import('./views/EquipDetailView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/rest/gem',
    name: 'gems',
    component: () => import('./views/GemView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/views/EquipDetailView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { EquipDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../utils/labels';

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const toast = useToastStore();
const id = Number(route.params.id);
const d = ref<EquipDetailDto | null>(null);
const stone = ref(false);
const gemPick = ref<number | null>(null);
const backPick = ref<number | null>(null);
const busy = ref(false);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ROWS = [
  ['基础', 'base'],
  ['强化', 'boost'],
  ['宝石', 'gem'],
  ['合计', 'total'],
] as const;

async function load() {
  d.value = await endpoints.equipDetail(id);
  gemPick.value = d.value.gems[0]?.goodsId ?? null;
  backPick.value = d.value.backItems[0]?.goodsId ?? null;
  if (d.value.have.stone === 0) stone.value = false;
}
/** 执行操作；reload=false 用于分解 / 出售（厨具已经没了） */
async function run<T>(fn: () => Promise<T>, fallback: string, reload = true): Promise<T | null> {
  busy.value = true;
  try {
    const r = await fn();
    if (reload) await load();
    return r;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return null;
  } finally {
    busy.value = false;
  }
}

const e = computed(() => d.value?.equip ?? null);
const freeHoles = computed(() => (e.value ? e.value.curHole - e.value.gems.length : 0));
/** 分解 / 出售的阻挡原因（和服务端一致） */
const blocked = computed(() => {
  const x = e.value;
  if (!x) return '';
  if (x.locked) return '已锁定';
  if (x.worn) return '正在穿戴';
  if (x.gems.length > 0) return '镶着宝石';
  if (x.inPresets.length > 0) return `在预设「${x.inPresets.join('、')}」里`;
  return '';
});

async function stress() {
  const r = await run(() => endpoints.equipStress(id, stone.value), '强化失败');
  if (!r) return;
  if (r.success) {
    const extra = `${r.lucky ? '（幸运）' : ''}${r.floor ? '（保底）' : ''}`;
    toast.push(`强化成功 +${r.stress}：${ATTR_NAMES[r.attr ?? ''] ?? ''} +${r.val}${extra}`);
  } else toast.push('强化失败，下次成功率会提高', 'info');
}
async function salvage() {
  if (!e.value || !window.confirm(`分解得到 ${e.value.salvage} 个厨具精华，确定吗？`)) return;
  if ((await run(() => endpoints.equipSalvage(id), '分解失败', false)) !== null) await router.push('/rest/equip');
}
async function sell() {
  if (!e.value?.sellPrice || !window.confirm(`出售得到 ${formatNum(e.value.sellPrice)} 银币，确定吗？`)) return;
  if ((await run(() => endpoints.equipSell(id), '出售失败', false)) !== null) await router.push('/rest/equip');
}

onMounted(() => load().catch((err) => toast.push(errorMessage(err, '读取厨具失败'), 'danger')));
</script>

<template>
  <div v-if="d && e">
    <h5>
      {{ catalog.goodsName(e.goodsId) }} <span v-if="e.stress > 0" class="text-success">+{{ e.stress }}</span>
      <small class="text-muted">{{ PART_NAMES[e.part] }} · {{ e.minLevel }} 级可穿{{ e.worn ? ' · 穿戴中' : '' }}</small>
    </h5>

    <table class="table table-sm small">
      <thead>
        <tr>
          <th></th>
          <th v-for="k in ATTR_KEYS" :key="k">{{ ATTR_NAMES[k] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="[label, key] in ROWS" :key="key">
          <td>{{ label }}</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ e[key][k] }}</td>
        </tr>
      </tbody>
    </table>

    <div class="border rounded p-2 mb-2 small">
      <div class="fw-bold mb-1">强化</div>
      <template v-if="d.rate">
        <div>
          成功率 <b>{{ pct(d.rate.total) }}</b>
          <span class="text-muted">（基础 {{ pct(d.rate.base) }} + 幸运 {{ pct(d.rate.luck) }} + 天气 {{ pct(d.rate.weather) }} + 保底
            {{ pct(d.rate.floor) }}）</span>
        </div>
        <div>
          消耗：精华 ×{{ d.cost.essence }}（有 {{ d.have.essence }}）、银币 {{ formatNum(d.cost.coin) }}
        </div>
        <label class="me-2">
          <input v-model="stone" type="checkbox" :disabled="d.have.stone === 0" data-testid="stone" />
          用强化石（必定成功，有 {{ d.have.stone }}）
        </label>
        <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="stress-go" @click="stress">强化</button>
      </template>
      <div v-else class="text-muted">已经强化到最高</div>
      <div v-if="e.stress > 0 && d.backItems.length > 0" class="mt-2 d-flex gap-1 align-items-center">
        <select v-model="backPick" class="form-select form-select-sm w-auto">
          <option v-for="b in d.backItems" :key="b.goodsId" :value="b.goodsId">
            {{ catalog.goodsName(b.goodsId) }}（回退 {{ b.back }} 级，有 {{ b.num }}）
          </option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy || backPick === null"
          data-testid="rollback-go"
          @click="run(() => endpoints.equipRollback(id, backPick!), '回退失败')"
        >
          回退
        </button>
      </div>
    </div>

    <div class="border rounded p-2 mb-2 small">
      <div class="fw-bold mb-1">
        宝石 <span data-testid="hole-count">{{ e.gems.length }}/{{ e.curHole }}</span>
        <span class="text-muted">（最多 {{ e.maxHole }} 孔；2 星起摘除要花 阶数×{{ formatNum(d.ungemCoinPerLevel) }} 银币，酸雨免费）</span>
      </div>
      <div v-for="g in e.gems" :key="g.id" class="d-flex align-items-center gap-1">
        <span class="flex-fill">{{ catalog.goodsName(g.goodsId) }}</span>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          :data-testid="`ungem-${g.id}`"
          @click="run(() => endpoints.equipUngem(g.id), '摘除失败')"
        >
          摘除
        </button>
      </div>
      <div v-if="freeHoles > 0 && d.gems.length > 0" class="d-flex gap-1 mt-1">
        <select v-model="gemPick" class="form-select form-select-sm w-auto" data-testid="inlay-pick">
          <option v-for="g in d.gems" :key="g.goodsId" :value="g.goodsId">
            {{ catalog.goodsName(g.goodsId) }}（有 {{ g.num }}，耗体力 {{ g.level }}）
          </option>
        </select>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || gemPick === null"
          data-testid="inlay-go"
          @click="run(() => endpoints.equipInlay(id, gemPick!), '镶嵌失败')"
        >
          镶嵌
        </button>
      </div>
      <button
        v-if="e.maxHole > 0 && e.curHole < e.maxHole"
        class="btn btn-sm btn-outline-primary mt-1"
        :disabled="busy"
        data-testid="drill-go"
        @click="run(() => endpoints.equipDrill(id), '打孔失败')"
      >
        打孔（打孔石，有 {{ d.have.drill }}）
      </button>
    </div>

    <div class="d-flex flex-wrap gap-1 mb-2 align-items-center">
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        data-testid="lock-go"
        @click="run(() => endpoints.equipLock(id, !e!.locked), '操作失败')"
      >
        {{ e.locked ? '解锁' : '锁定' }}
      </button>
      <button class="btn btn-sm btn-outline-danger" :disabled="busy || !!blocked" data-testid="salvage-go" @click="salvage">
        分解（{{ e.salvage }} 精华）
      </button>
      <button
        v-if="e.sellPrice !== null"
        class="btn btn-sm btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="sell-go"
        @click="sell"
      >
        出售（{{ formatNum(e.sellPrice) }}）
      </button>
      <span v-if="blocked" class="small text-muted">{{ blocked }}，不能分解或出售</span>
    </div>

    <div v-if="d.history.length > 0" class="small">
      <div class="fw-bold">强化记录</div>
      <div v-for="(h, i) in d.history" :key="i" :class="h.success ? 'text-success' : 'text-muted'">
        +{{ h.stress }} {{ h.success ? `成功 ${ATTR_NAMES[h.attr ?? ''] ?? ''}+${h.val}` : '失败' }}
        {{ h.stone ? '（强化石）' : '' }}{{ h.lucky ? '（幸运）' : '' }}{{ h.floor ? '（保底）' : '' }}
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/views/GemView.vue`：

```vue
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { GemItemDto, GemsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { ATTR_KEYS, ATTR_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const g = ref<GemsDto | null>(null);
const nums = reactive<Record<number, number>>({});
const busy = ref(false);
const pct = (x: number) => `${(Math.max(0, x) * 100).toFixed(1)}%`;

async function load() {
  g.value = await endpoints.gems();
}
/** 最多能升几组：持有 / 2、体力 / 阶数、99 */
const maxOf = (x: GemItemDto) =>
  Math.min(Math.floor(x.num / 2), Math.floor((g.value?.strength ?? 0) / x.level), 99);
const numOf = (x: GemItemDto) => Math.max(1, Math.min(nums[x.goodsId] ?? 1, maxOf(x)));

async function levelUp(x: GemItemDto) {
  busy.value = true;
  try {
    const r = await endpoints.gemLevelUp(x.goodsId, numOf(x));
    const lucky = r.lucky > 0 ? `（含幸运补救 ${r.lucky}）` : '';
    const exp = r.exp > 0 ? `，得到经验 ${formatNum(r.exp)}` : '';
    toast.push(`升阶完成：成功 ${r.success}${lucky}，失败 ${r.fail}${exp}`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '升阶失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取宝石失败'), 'danger')));
</script>

<template>
  <div v-if="g">
    <h5>宝石</h5>
    <p class="small text-muted">
      两颗同阶合成一颗下一阶，每组耗体力 = 阶数；失败时还有 {{ pct(g.luckRate) }} 的幸运补救，失败的每组得 阶数×1000
      经验。体力 {{ g.strength }}。
    </p>
    <div v-if="g.items.length === 0" class="text-muted small">还没有宝石</div>
    <div v-for="x in g.items" :key="x.goodsId" class="d-flex align-items-center gap-1 border-bottom py-1 small">
      <div class="flex-fill">
        <b>{{ catalog.goodsName(x.goodsId) }}</b> ×{{ x.num }}
        <span class="text-muted">
          {{ ATTR_KEYS.filter((k) => x.attrs[k] > 0).map((k) => `${ATTR_NAMES[k]}+${x.attrs[k]}`).join(' ') }}
        </span>
        <div class="text-muted">
          {{ x.nextId === null ? '已是最高阶' : `→ ${catalog.goodsName(x.nextId)}，成功率 ${pct(x.rate)}` }}
        </div>
      </div>
      <input
        v-model.number="nums[x.goodsId]"
        type="number"
        min="1"
        :max="Math.max(1, maxOf(x))"
        class="form-control form-control-sm"
        style="width: 60px"
        :data-testid="`levelup-num-${x.goodsId}`"
      />
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || x.nextId === null || maxOf(x) < 1"
        :data-testid="`levelup-${x.goodsId}`"
        @click="levelUp(x)"
      >
        升阶 ×{{ numOf(x) }}
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/views/FriendRestView.vue`：import 加 `import { useCatalogStore } from '../stores/catalog';`、`import { PART_NAMES } from '../utils/labels';`，`const catalog = useCatalogStore();`；在个性图标那个 `div`（`v-if="rest.icons.length > 0"`）后面加：

```vue
    <div v-if="rest.equips.length > 0" class="small mb-2" data-testid="friend-equips">
      厨具：
      <span v-for="e in rest.equips" :key="e.part" class="me-2">
        {{ PART_NAMES[e.part] }} {{ catalog.goodsName(e.goodsId) }}{{ e.stress > 0 ? ` +${e.stress}` : '' }}
      </span>
    </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @dt/web exec vitest run && pnpm -s typecheck && pnpm -s lint`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
pnpm test
git add apps/web
git commit -m "feat(web): cookware detail with enhance, rollback, gems, drill, lock, salvage and sell; gem tier-up page; friends' worn gear

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 端到端、部署说明、验收

**Files:**
- Create: `apps/web/e2e/equip.spec.ts`
- Modify: `docs/deploy.md`

**Interfaces:**
- Consumes: Task 11、12 的页面和 data-testid

- [ ] **Step 1: 写端到端测试 `apps/web/e2e/equip.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('厨具：买见习之铲 → 穿戴 → 强化 → 打孔 → 镶嵌 → 保存预设 → 全部卸下 → 套用预设', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  // 准备：钱、等级、精华、强化石（保证成功）、打孔石、一颗宝石、一件可以打孔的锅（等同于奖励发放）
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set coin = 2000000, level = 20 where id = $1', [restId]);
    for (const [goodsId, num] of [
      [52, 20],
      [40, 1],
      [46, 1],
      [44, 1],
    ]) {
      await client.query('insert into store_item (rest_id, goods_id, num) values ($1, $2, $3)', [restId, goodsId, num]);
    }
    await client.query(
      `insert into equip (rest_id, goods_id, part, suit_id, min_level, cur_hole, max_hole, base_fire)
       values ($1, 56, 3, 5, 13, 1, 3, 12)`,
      [restId],
    );
  } finally {
    await client.end();
  }

  // 商店买一件见习之铲（生成实例）
  const buy = await page.request.post('/api/v1/shop/buy', { data: { goodsId: 30, num: 1 } });
  expect(buy.ok()).toBe(true);

  // 穿上铲和锅
  await page.goto('/rest/equip');
  await page.getByTestId('slot-1').click();
  await page.locator('[data-testid^="wear-"]').first().click();
  await expect(page.getByTestId('slot-1')).toContainText('见习之铲');
  await page.getByTestId('slot-3').click();
  await page.locator('[data-testid^="wear-"]').first().click();
  await expect(page.getByTestId('slot-3')).toContainText('沉默静谧之镬');

  // 铲：用强化石强化到 +1
  await page.getByTestId('slot-1').click();
  await page.getByRole('link', { name: /见习之铲/ }).first().click();
  await page.getByTestId('stone').check();
  await page.getByTestId('stress-go').click();
  await expect(page.getByText(/强化成功 \+1/)).toBeVisible();

  // 锅：打孔、镶嵌
  await page.goto('/rest/equip');
  await page.getByTestId('slot-3').click();
  await page.getByRole('link', { name: /沉默静谧之镬/ }).first().click();
  await page.getByTestId('drill-go').click();
  await expect(page.getByTestId('hole-count')).toHaveText('0/2');
  await page.getByTestId('inlay-go').click();
  await expect(page.getByTestId('hole-count')).toHaveText('1/2');

  // 预设：保存 → 全部卸下 → 套用
  await page.goto('/rest/equip');
  await page.getByTestId('open-presets').click();
  await page.getByTestId('preset-name').fill('全套');
  await page.getByTestId('preset-save').click();
  await expect(page.locator('[data-testid^="preset-apply-"]')).toHaveCount(1);
  await page.getByRole('button', { name: '全部卸下' }).click();
  await expect(page.getByTestId('slot-1')).toContainText('空');
  await page.locator('[data-testid^="preset-apply-"]').first().click();
  await expect(page.getByTestId('slot-1')).toContainText('见习之铲 +1');
  await expect(page.getByTestId('slot-3')).toContainText('沉默静谧之镬');
});
```

- [ ] **Step 2: 生成配置包、迁移开发库、重启开发服务器，跑端到端**

```bash
pnpm --filter @dt/config build
pnpm --filter @dt/server migrate:dev
```

停掉后台的 `pnpm dev`，按进程树清掉残留的 main.ts / worker.ts / vite 进程，再启动 `pnpm dev`，确认日志里有 `became leader` 且没有 `"level":50`。

Run: `pnpm --filter @dt/web e2e`
Expected: 5 passed（原有 4 个 + 厨具）

- [ ] **Step 3: `docs/deploy.md` 末尾加**

```markdown
## 厨具（子项目 2B）

- 迁移 0006 新建 `equip`、`equip_gem`、`equip_stress_log`、`equip_preset`
- 厨具不再存在仓库表里：发放时每件生成一个实例（按道具 value 随机属性）。旧数据由 worker 的 `equip-convert` 任务每小时转换一次（幂等），部署后最多一小时老号的厨具出现在厨具页
- 未穿戴的厨具每件占一个仓库格；穿戴中的不占
- 区服关闭 `features.equip` 后所有厨具接口返回"这个区服暂未开放该功能"，已穿戴厨具的幸运和套装加成照常生效
- 数值在 `tuning.equip`（强化成功率、保底、宝石升阶、摘除费用、预设上限）
```

- [ ] **Step 4: 全量验收**

Run: `pnpm test && pnpm -s typecheck && pnpm -s lint && pnpm -s format:check`
Expected: 全部通过（`format:check` 只允许 `问题记录.md` 报警告——那是用户自己的文件，不格式化、不提交）

- [ ] **Step 5: 提交**

```bash
git add apps/web/e2e/equip.spec.ts docs/deploy.md
git commit -m "test(e2e): buy, wear, enhance, drill, inlay and presets; deploy notes for cookware

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
