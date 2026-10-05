# 重新编号 PR 4：换号和数据迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户审过的对照表（`packages/config/data/renumber/map.json`）把道具、食材、菜谱换成新编号：配置、常量、测试、导入脚本、旧链接跳转一起改，再用一个迁移把数据库里所有的旧编号（含历史记录）改写过来。

**Architecture:** 一个按键名认编号的 JSON 改写器（`@dt/config` 的 `renumber.ts`）同时服务两边：一次性脚本用它就地改配置文件（只替换数字、不动排版），迁移 0049 用它改 JSON 列。普通列用临时对照表 `update … from`；学会记录按“旧编号 → 新存储位”重排。迁移在一个事务里跑，结束前自检，不通过整体回滚；另给一个“只演练、总是回滚”的命令，上线前在线上数据的副本上先跑。

**Tech Stack:** TypeScript、zod、Kysely + Postgres、Vitest、Fastify 5、Vue 3、Playwright（e2e）。

**Spec:** `docs/superpowers/specs/2026-10-05-id-renumber-design.md`（§2 编号规则、§3 主表、§5 旧编号兼容、§6 PR 4）

## Global Constraints

- 道具 5 位 10000~89999，按类别分段、段内按小类（`group`）从整百起；食材 = 等级 × 1000 + 序号，万能食材 9001~9005；菜谱 = 100000 + 街道 × 1000 + 序号（设计 §2）。
- 编号一经分配就固定：以后改了食材等级、菜谱换街道，编号不跟着改（设计 §2.2）。
- 新号段和所有旧号段不重叠（道具旧 1~642、90001~93208；食材旧 101~606；菜谱旧 1~20225）。
- 特色菜、天气、街道、设施、种子、配方等其他编号都不动（设计开头“不动”）。
- `goods_sources.json` 仍按旧编号保留（原版资料），工具通过 `legacyId` 对上（设计 §3）。
- 迁移：一个迁移、一个事务；对照表冻结一份放进迁移目录；结束前自检，不通过回滚（设计 §6 PR 4 第 3 步）。
- 迁移不提供回退，出问题从备份恢复；上线顺序：停服 → 备份 → 迁移 → 启动（设计 §6 PR 4 第 5 步）。
- 旧链接：`/wiki/{goods,foods,cookbooks}/<旧编号>` 和开放接口详情按对照表跳到新编号；列表接口直接是新编号；对照表永久保留（设计 §5）。
- 项目约定：回复用中文；不改、不提交 `问题记录.md`；临时 e2e 脚本 `apps/web/e2e/_*.spec.ts` 不提交，只 `git add` 明确路径；不改开发库数据（演练在开发库的副本上做）；菜园当独立系统，只做机械换号；玩家可见的改动加五种语言的更新记录；推送前跑 `pnpm format:check`；提交信息结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **日志、新闻、邮件等 JSON 里有改写器不认识的编号键**：历史记录会显示错名字。规则表按开发库全部 JSON 列的路径清点和代码里全部写日志、新闻的地方定出来（见 Task 1 的规则说明）；Task 6 的迁移测试每个带编号的日志类型至少放一条，也放几条“看着像编号但不是”的反例（`level.up` 的 `from/to`、`rest.move` 的街道、`num`）。
2. **线上有开发库没有的旧编号（已删的菜谱、已不存在的道具）**：迁移遇到“在用的表”里查不到对照的旧编号就整体回滚；历史表里的照原样留下并列出来。上线前用 Task 6 的只演练命令在线上数据的副本上先跑一遍（Task 8 的上线步骤写明）。
3. **区服数值覆盖里的编号是元组、不带键名**（`hiphop.wages`、`tower.rankGifts` 等）：按 `TUNING_ID_PATHS` 改写；Task 1 有测试保证它和 `tuningRefs` 认的编号完全一致，Task 6 测试覆盖 `shard_config.override`。
4. **学会记录的字节串长短不一**（老店比旧最大编号短、或带着已删菜谱位置上的字节）：Task 6 测试放一条短字节串、一条在已删菜谱位置上有字节的。
5. **重跑导入新街道脚本**：换号后外部数据仍是旧编号，导入要按 `legacyId` 对上、不能产生新条目或改动已有编号；Task 4 测试 `assignIds`，并实跑一次确认主表无变化。

---

## 文件结构

| 文件 | 做什么 |
|---|---|
| `packages/config/src/renumber.ts`（新） | JSON 编号改写器 `rewriteIds`、保留排版的 `patchJsonText`、`TUNING_ID_PATHS`、号段判断 `isNewId`。冻结：迁移 0049 依赖它 |
| `packages/config/src/renumber.test.ts`（新） | 改写器、文本替换、区服数值路径覆盖的测试 |
| `packages/config/src/itemRefs.ts` | `tuningRefs` 补上 `shop.discardable`（漏的） |
| `packages/config/scripts/renumber-apply.ts`（新） | 一次性：按对照表改配置文件、翻译表、存储位 |
| `packages/config/scripts/renumber-verify.ts`（新） | 一次性：新旧配置包逐叶子比对 + 引用比对 |
| `packages/config/src/ids.ts`、`packages/shared/src/goodsIds.ts` | 常量换新编号 |
| `packages/config/src/raw.ts`、`types.ts`、`build.ts`、`runtime.ts` | 主表加 `legacyId`、道具加 `group`；构建检查号段；配置包带旧 → 新对照 |
| `packages/config/data/game/goods_groups.json`（由 `data/renumber/goods_groups.json` 移来） | 道具小类定义 |
| `packages/config/src/streetImport.ts`、`scripts/import-new-streets.ts` | 导入按 `legacyId` 对照、按规则分配新编号 |
| `packages/config/scripts/sync-data.ts` | 停止同步带编号的三份原版表 |
| `apps/server/src/items/main.ts`、`tool.ts` | 原版获取途径按 `legacyId` 对上 |
| `apps/server/src/modules/open/routes.ts`、`apps/web/src/views/wiki/Wiki{Goods,Food,Cookbook}View.vue` | 旧编号跳转 |
| `apps/server/src/db/migrations/0049_renumber_map.ts`（新，生成） | 冻结的对照表 |
| `apps/server/src/db/migrations/0049_renumber.ts`（新） | 迁移：普通列、文本、JSON、学会记录、自检、报告 |
| `apps/server/src/db/migrations/0049.test.ts`（新） | 在独立 schema 里从 0048 迁到 0049 的测试 |
| `apps/server/src/cli/renumber-dry-run.ts`（新） | 只演练：跑迁移逻辑、打印报告、总是回滚 |
| `apps/server/src/sim/fast/side-income.json`、`sim/examples/star3.json`、`apps/web/e2e/*.spec.ts` | 测试数据换号 |
| `docs/data-maintenance.md`、`docs/deploy.md`、`apps/web/src/data/changelog.ts`、`apps/web/src/i18n/locales/*/site.ts` | 编号规则、上线步骤、更新记录 |

---

### Task 1：JSON 编号改写器

**Files:**
- Create: `packages/config/src/renumber.ts`
- Create: `packages/config/src/renumber.test.ts`
- Modify: `packages/config/src/itemRefs.ts`（`tuningRefs` 加 `shop.discardable`）
- Modify: `packages/config/src/index.ts`（导出）

**Interfaces:**
- Produces:
  - `type IdKind = 'goods' | 'foods' | 'cookbooks'`
  - `type IdMaps = Record<IdKind, ReadonlyMap<number, number>>`
  - `type JsonPath = Array<string | number>`
  - `type PathRule = readonly [ReadonlyArray<string | number | '*'>, IdKind]`
  - `isNewId(kind: IdKind, id: number): boolean`
  - `rewriteIds(value: unknown, maps: IdMaps, opts?: { paths?: readonly PathRule[]; keys?: Readonly<Record<string, IdKind>> }): { value: unknown; edits: Map<string, number>; orphans: Array<{ kind: IdKind; id: number; path: JsonPath }> }` —— `edits` 的键是 `JSON.stringify(路径)`，值是新编号
  - `patchJsonText(text: string, edits: ReadonlyMap<string, number>): string` —— 按路径替换数字，其余字符原样保留；没用上的 edit 抛错
  - `TUNING_ID_PATHS: readonly PathRule[]`（相对 tuning 根）

规则（按开发库全部 JSON 列的叶子路径清点 + 服务端 144 处写日志、新闻的地方 + 配置数据定出来）：

- **键名**（`ID_KEYS`）：`goodsId`、`cardId`（嘻哈工资卡）、`medal`（基金勋章）、`nextid`（宝石下一阶）→ 道具；`foodsId`、`mainFoodsId`、`subFoodsId`、`addFoodsId`、`resFoodsId`、`punished`（菜园偷菜被逮留下的食材）→ 食材；`cookbookId` → 菜谱。
- **列表键**（`ID_LIST_KEYS`）：`goods`、`needGoods` → 道具；`foods` → 食材；`cookbooks`（特色菜课遗忘的菜谱）→ 菜谱。值必须是数组；元素是数字就换元素，是对象就换它的 `id`，是数组就换第 0 个（论坛精华奖励 `[编号, 数量]`）。值不是数组（如 `awardRates.goods` 是比例）不管。
- **带种类的对象**：`kind` 或 `type` 是 `'goods'` / `'foods'` 时换同一对象的 `id` 或 `itemId`（礼包内容、小镇对话奖励、酒吧拉霸新闻、随机奖励）。
- **0 和负数不换**（礼包里 `id: 0` 表示随机）；对照表里没有、但已在新号段的不换；两样都不是的记为 `orphans`，原样保留。
- 同一个对象里一个字段只换一次（先按所在列表、再按种类、再按键名）。
- `opts.paths`：按位置认的编号（元组、主表的 `id`）；`opts.keys`：只对这一处生效的额外键名（日志 `exchange` 的 `give`/`take` 是食材）。

- [ ] **Step 1：写失败的测试**

`packages/config/src/renumber.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { patchJsonText, rewriteIds, TUNING_ID_PATHS, type IdMaps } from './renumber';
import { tuningRefs } from './itemRefs';
import { realBuild } from './testBundle';

const maps: IdMaps = {
  goods: new Map([
    [1, 10001],
    [87, 60301],
    [108, 60401],
    [110, 60402],
  ]),
  foods: new Map([
    [101, 1001],
    [467, 9001],
  ]),
  cookbooks: new Map([[1, 106001]]),
};
const run = (v: unknown, opts?: Parameters<typeof rewriteIds>[2]) => rewriteIds(v, maps, opts);

describe('按键名改写编号（重新编号 PR 4）', () => {
  it('键名、列表、带种类的对象都换；数量、等级、街道这些同名旁边的数字不换', () => {
    const r = run({
      goodsId: 1,
      num: 101,
      level: 1,
      items: { goods: [{ id: 1, num: 87 }], foods: [{ id: 101, num: 1 }], coin: 1 },
      rewards: [
        { kind: 'goods', id: 87, num: 1 },
        { kind: 'coin', id: null, num: 5 },
      ],
      award: { kind: 'foods', itemId: 467, num: 2 },
      foods: [101, 467],
      log: { foodsId: 101, cookbookId: 1, from: 1, to: 1 },
    });
    expect(r.value).toEqual({
      goodsId: 10001,
      num: 101,
      level: 1,
      items: { goods: [{ id: 10001, num: 87 }], foods: [{ id: 1001, num: 1 }], coin: 1 },
      rewards: [
        { kind: 'goods', id: 60301, num: 1 },
        { kind: 'coin', id: null, num: 5 },
      ],
      award: { kind: 'foods', itemId: 9001, num: 2 },
      foods: [1001, 9001],
      log: { foodsId: 1001, cookbookId: 106001, from: 1, to: 1 },
    });
    expect(r.orphans).toEqual([]);
  });

  it('列表元素是 [编号, 数量] 时只换第 0 个；列表键的值不是数组时不管', () => {
    const r = run({ featureReward: { goods: [[1, 87]] }, awardRates: { goods: 0.2, foods: 0.5 } });
    expect(r.value).toEqual({ featureReward: { goods: [[10001, 87]] }, awardRates: { goods: 0.2, foods: 0.5 } });
  });

  it('礼包里 type 写种类：id 为 0（随机）不换；同一个字段不会换两次', () => {
    const r = run({
      gift: [
        { type: 'goods', id: 1, num: 20, rate: 1 },
        { type: 'goods', id: 0, level: 7, num: 1, rate: 0.2 },
      ],
      goods: [{ kind: 'goods', id: 1, num: 1 }],
    });
    expect(r.value).toEqual({
      gift: [
        { type: 'goods', id: 10001, num: 20, rate: 1 },
        { type: 'goods', id: 0, level: 7, num: 1, rate: 0.2 },
      ],
      goods: [{ kind: 'goods', id: 10001, num: 1 }],
    });
  });

  it('对照表里没有、也不在新号段的记为 orphans，原样保留；已在新号段的不动', () => {
    const r = run({ goodsId: 999, foodsId: 1001, cookbookId: 51 });
    expect(r.value).toEqual({ goodsId: 999, foodsId: 1001, cookbookId: 51 });
    expect(r.orphans).toEqual([
      { kind: 'goods', id: 999, path: ['goodsId'] },
      { kind: 'cookbooks', id: 51, path: ['cookbookId'] },
    ]);
  });

  it('按位置的规则（* 是任意下标或键）和只对这一处生效的键名', () => {
    const r = run(
      { data: [{ id: 1, type: 3 }], figures: { A: 1 }, give: 101, take: 467 },
      {
        paths: [
          [['data', '*', 'id'], 'goods'],
          [['figures', '*'], 'goods'],
        ],
        keys: { give: 'foods', take: 'foods' },
      },
    );
    expect(r.value).toEqual({ data: [{ id: 10001, type: 3 }], figures: { A: 10001 }, give: 1001, take: 9001 });
    expect([...r.edits]).toEqual([
      ['["data",0,"id"]', 10001],
      ['["figures","A"]', 10001],
      ['["give"]', 1001],
      ['["take"]', 9001],
    ]);
  });

  it('不改传进来的对象', () => {
    const input = { goodsId: 1 };
    run(input);
    expect(input).toEqual({ goodsId: 1 });
  });
});

describe('按路径替换 JSON 文本里的数字（保留排版）', () => {
  it('只换指定位置，空格、换行、键顺序原样', () => {
    const text = '{\n  "a": [ 1, {"goodsId":87} ],\n "b" : -2.5e3, "c": "1"\n}\n';
    const out = patchJsonText(
      text,
      new Map([
        ['["a",0]', 10001],
        ['["a",1,"goodsId"]', 60301],
      ]),
    );
    expect(out).toBe('{\n  "a": [ 10001, {"goodsId":60301} ],\n "b" : -2.5e3, "c": "1"\n}\n');
  });

  it('有没用上的路径时报错（防止规则和文件对不上）', () => {
    expect(() => patchJsonText('{"a":1}', new Map([['["b"]', 2]]))).toThrow('["b"]');
  });

  it('字符串里的转义引号、括号不影响定位', () => {
    const text = '{"s":"a\\"]}[","n":1}';
    expect(patchJsonText(text, new Map([['["n"]', 2]]))).toBe('{"s":"a\\"]}[","n":2}');
  });
});

describe('区服数值里的编号（TUNING_ID_PATHS）', () => {
  it('和 tuningRefs 认的编号一一对应：改写后引用的编号正好是原编号的对照，别的数字一个没动', () => {
    const t = realBuild().bundle!.tuning;
    const before = tuningRefs(t);
    const shift = (ids: Iterable<number>) => new Map([...ids].map((id) => [id, id + 1_000_000] as [number, number]));
    const all: IdMaps = {
      goods: shift(before.filter((r) => r.kind === 'goods').map((r) => r.id)),
      foods: shift(before.filter((r) => r.kind === 'foods').map((r) => r.id)),
      cookbooks: new Map(),
    };
    const r = rewriteIds(t, all, { paths: TUNING_ID_PATHS });
    const after = tuningRefs(r.value as typeof t);
    expect(after.map((x) => `${x.kind} ${x.id} ${x.where}`)).toEqual(
      before.map((x) => `${x.kind} ${x.id + 1_000_000} ${x.where}`),
    );
    expect(r.edits.size).toBe(before.length);
    expect(r.orphans).toEqual([]);
  });
});

describe('tuningRefs', () => {
  it('商店可丢弃的道具也算引用（下架检查要看到）', () => {
    const t = realBuild().bundle!.tuning;
    expect(tuningRefs(t).filter((r) => r.where === '商店丢弃').map((r) => r.id)).toEqual(t.shop.discardable);
  });
});
```

注：“改写后引用一一对应”这条用 `edits.size === before.length`，要求 `tuningRefs` 里同一个编号出现几次就有几处叶子；如果某个编号在两处被 `tuningRefs` 收了一次以上而叶子只有一处，按实际情况把断言改成按叶子路径数（记 Ruling）。

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config exec vitest run src/renumber.test.ts`
Expected: FAIL，`Cannot find module './renumber'`（或 `rewriteIds is not a function`）

- [ ] **Step 3：实现**

`packages/config/src/renumber.ts`：

```ts
/**
 * 重新编号（设计 docs/superpowers/specs/2026-10-05-id-renumber-design.md）：按对照表改写 JSON 里的道具、食材、菜谱编号。
 * 配置数据的一次性改写（scripts/renumber-apply.ts）和数据库迁移 0049 共用。规则按键名认（见 ID_KEYS 等），
 * 是按开发库全部 JSON 列的路径和服务端写日志、新闻的地方清点出来的。
 * 冻结：迁移 0049 依赖它，上线后不要改规则（改了以后在空库上重跑迁移的结果会和线上不一样）
 */
export type IdKind = 'goods' | 'foods' | 'cookbooks';
export type IdMaps = Record<IdKind, ReadonlyMap<number, number>>;
export type JsonPath = Array<string | number>;
/** 按位置认的编号：路径里的 '*' 匹配任意数组下标或对象键 */
export type PathRule = readonly [ReadonlyArray<string | number | '*'>, IdKind];
export interface Orphan {
  kind: IdKind;
  id: number;
  path: JsonPath;
}

/** 新号段（设计 §2）：和所有旧号段都不重叠 */
export function isNewId(kind: IdKind, id: number): boolean {
  if (kind === 'goods') return id >= 10000 && id <= 89999;
  if (kind === 'foods') return id >= 1001 && id <= 9999;
  return id >= 100001 && id <= 199999;
}

/** 值是某类编号的键 */
export const ID_KEYS: Readonly<Record<string, IdKind>> = {
  goodsId: 'goods',
  cardId: 'goods', // 嘻哈男孩的工资卡（日志 hiphop.wage）
  medal: 'goods', // 基金勋章（日志 fund.claim、区服数值 fund.tiers）
  nextid: 'goods', // 宝石的下一阶（主表 value）
  foodsId: 'foods',
  mainFoodsId: 'foods',
  subFoodsId: 'foods',
  addFoodsId: 'foods',
  resFoodsId: 'foods',
  punished: 'foods', // 菜园偷菜被边牧逮住留下的食材（日志 yard.stolen）
  cookbookId: 'cookbooks',
};
/** 值是编号列表的键：元素是数字、{ id, … } 或 [编号, …] */
export const ID_LIST_KEYS: Readonly<Record<string, IdKind>> = {
  goods: 'goods',
  needGoods: 'goods',
  foods: 'foods',
  cookbooks: 'cookbooks', // 特色菜课遗忘的菜谱（日志 mc.forget）
};

/** 区服数值（data/game/tuning.json、shard_config.override.tuning）里不带键名的编号；带键名的由通用规则处理 */
export const TUNING_ID_PATHS: readonly PathRule[] = [
  [['shop', 'specialFallbackGoods'], 'goods'],
  [['shop', 'discardable', '*'], 'goods'],
  [['tower', 'rankGifts', '*', 1], 'goods'],
  [['takeaway', 'awards', '*', 0], 'goods'],
  [['takeaway', 'customer', 'success'], 'goods'],
  [['takeaway', 'customer', 'fail'], 'goods'],
  [['hiphop', 'weeklyCards', '*'], 'goods'],
  [['hiphop', 'wages', '*', 0], 'goods'],
  [['hiphop', 'wages', '*', 1], 'goods'],
  [['temple', 'missileAttack', '*', 0], 'goods'],
  [['mysterious', 'championGoodsId'], 'goods'],
];

const KIND_VALUES: ReadonlySet<unknown> = new Set(['goods', 'foods']);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function matches(rule: PathRule[0], path: JsonPath): boolean {
  return rule.length === path.length && rule.every((seg, i) => seg === '*' || seg === path[i]);
}

export function rewriteIds(
  value: unknown,
  maps: IdMaps,
  opts: { paths?: readonly PathRule[]; keys?: Readonly<Record<string, IdKind>> } = {},
): { value: unknown; edits: Map<string, number>; orphans: Orphan[] } {
  const edits = new Map<string, number>();
  const orphans: Orphan[] = [];
  const keys = { ...ID_KEYS, ...opts.keys };
  const paths = opts.paths ?? [];

  const swap = (kind: IdKind, v: unknown, path: JsonPath): unknown => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) return v;
    const n = maps[kind].get(v);
    if (n !== undefined) {
      edits.set(JSON.stringify(path), n);
      return n;
    }
    if (!isNewId(kind, v)) orphans.push({ kind, id: v, path });
    return v;
  };
  const byPath = (path: JsonPath): IdKind | undefined => paths.find(([p]) => matches(p, path))?.[1];

  const walk = (x: unknown, path: JsonPath, listKind: IdKind | undefined): unknown => {
    if (Array.isArray(x)) {
      return x.map((el, i) => {
        const p = [...path, i];
        if (listKind !== undefined) {
          if (typeof el === 'number') return swap(listKind, el, p);
          if (Array.isArray(el)) return el.map((y, j) => (j === 0 ? swap(listKind, y, [...p, 0]) : walk(y, [...p, j], undefined)));
        }
        return walk(el, p, listKind);
      });
    }
    if (isObj(x)) {
      // 这个对象里哪些字段是编号：所在列表 > 自带种类 > 键名；一个字段只换一次
      const fieldKind = new Map<string, IdKind>();
      if (listKind !== undefined && typeof x.id === 'number') fieldKind.set('id', listKind);
      const own = KIND_VALUES.has(x.kind) ? x.kind : KIND_VALUES.has(x.type) ? x.type : undefined;
      if (own !== undefined)
        for (const f of ['id', 'itemId']) if (!fieldKind.has(f) && typeof x[f] === 'number') fieldKind.set(f, own as IdKind);
      for (const k of Object.keys(x)) if (!fieldKind.has(k) && keys[k] && typeof x[k] === 'number') fieldKind.set(k, keys[k]);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) {
        const p = [...path, k];
        const pk = byPath(p);
        const fk = fieldKind.get(k);
        if (pk !== undefined && typeof v === 'number') out[k] = swap(pk, v, p);
        else if (fk !== undefined) out[k] = swap(fk, v, p);
        else out[k] = walk(v, p, Array.isArray(v) ? ID_LIST_KEYS[k] : undefined);
      }
      return out;
    }
    if (typeof x === 'number') {
      const pk = byPath(path);
      return pk === undefined ? x : swap(pk, x, path);
    }
    return x;
  };

  return { value: walk(value, [], undefined), edits, orphans };
}

/**
 * 按路径替换 JSON 文本里的数字，其余字符（空格、换行、键顺序、注释式的排版）原样保留。
 * edits 的键是 JSON.stringify(路径)；有没用上的路径时抛错
 */
export function patchJsonText(text: string, edits: ReadonlyMap<string, number>): string {
  type Frame = { arr: boolean; idx: number; key: string | null; wantKey: boolean };
  const stack: Frame[] = [];
  const used = new Set<string>();
  let out = '';
  let i = 0;
  const pathNow = (): JsonPath => stack.map((f) => (f.arr ? f.idx : f.key!));
  while (i < text.length) {
    const c = text[i]!;
    if (c === '{' || c === '[') {
      stack.push({ arr: c === '[', idx: 0, key: null, wantKey: c === '{' });
      out += c;
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      out += c;
      i++;
    } else if (c === ',') {
      const top = stack[stack.length - 1]!;
      if (top.arr) top.idx++;
      else top.wantKey = true;
      out += c;
      i++;
    } else if (c === ':') {
      stack[stack.length - 1]!.wantKey = false;
      out += c;
      i++;
    } else if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const raw = text.slice(i, j + 1);
      const top = stack[stack.length - 1];
      if (top && !top.arr && top.wantKey) top.key = JSON.parse(raw) as string;
      out += raw;
      i = j + 1;
    } else if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i + 1;
      while (j < text.length && /[0-9eE+\-.]/.test(text[j]!)) j++;
      const key = JSON.stringify(pathNow());
      const n = edits.get(key);
      if (n !== undefined) {
        used.add(key);
        out += String(n);
      } else out += text.slice(i, j);
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  const missed = [...edits.keys()].filter((k) => !used.has(k));
  if (missed.length > 0) throw new Error(`patchJsonText: paths not found ${missed.join(' ')}`);
  return out;
}
```

`packages/config/src/itemRefs.ts` 的 `tuningRefs` 第一行后加：

```ts
  for (const id of t.shop.discardable) add('goods', id, 'uses', '商店丢弃');
```

`packages/config/src/index.ts` 末尾加：

```ts
export {
  isNewId,
  patchJsonText,
  rewriteIds,
  TUNING_ID_PATHS,
  type IdKind,
  type IdMaps,
  type JsonPath,
  type Orphan,
  type PathRule,
} from './renumber';
```

- [ ] **Step 4：运行，确认通过**

Run: `pnpm -F @dt/config exec vitest run src/renumber.test.ts src/itemRefs.test.ts src/retired.test.ts`
Expected: PASS（`retired.test` 照旧通过：87 不在下架表里）

- [ ] **Step 5：提交**

```bash
git add packages/config/src/renumber.ts packages/config/src/renumber.test.ts packages/config/src/itemRefs.ts packages/config/src/index.ts
git commit -m "feat(config): 按键名改写编号的工具和区服数值编号路径（重新编号 第 4 步）"
```

---

### Task 2：换号——配置数据、常量、测试数据

一次提交里完成：数据换号 + 常量换号 + 测试跟上，提交后整个仓库测试是绿的。主表这一步**不重排、不加字段**（Task 3 做），这样新旧配置包结构完全一样，可以逐叶子比对。

**Files:**
- Create: `packages/config/scripts/renumber-apply.ts`
- Create: `packages/config/scripts/renumber-verify.ts`
- Modify: `packages/config/data/**`（脚本改）
- Modify: `packages/config/src/ids.ts`、`packages/shared/src/goodsIds.ts`
- Modify: `apps/server/src/sim/fast/side-income.json`、`apps/server/src/sim/examples/star3.json`
- Modify: 测试文件里漏网的编号（运行后逐个改）、`packages/config/src/itemLiterals.test.ts` 的样例编号

**Interfaces:**
- Consumes: Task 1 的 `rewriteIds`、`patchJsonText`、`TUNING_ID_PATHS`、`IdMaps`
- Produces: 新编号的配置数据；`data/game/cookbook_slots.json` 的 `next` = 3810；常量 `GOODS.fragmentBase = 10800`、`GOODS.levelTicketBase = 10100`、`NEWBIE.foodVoucherBase = 10200`、`SHARED_FOODS.masterBase = 9000`

- [ ] **Step 1：留一份换号前的数据，做比对用**

```bash
OLD="$SCRATCH/renumber-old"   # $SCRATCH = 会话 scratchpad 目录
rm -rf "$OLD" && mkdir -p "$OLD"
git archive HEAD packages/config/data | tar -x -C "$OLD"
```
Expected: `$OLD/packages/config/data/master/goods.json` 存在。

- [ ] **Step 2：写比对脚本 `packages/config/scripts/renumber-verify.ts`**

```ts
/**
 * 重新编号 第 4 步（一次性）：比对换号前后的配置包。
 *   pnpm -F @dt/config exec tsx scripts/renumber-verify.ts <换号前的 data 目录>
 * 1. 两个包逐叶子比：不同的数字必须正好是某一类的“旧 → 新”；同一路径样式（下标写成 *）下有的换了有的没换、
 *    没换的又是旧编号时报错。打印每个路径样式换了多少、按哪一类换的，给人看一遍。
 * 2. itemRefs（全部引用）按对照换算后必须完全一样。
 * 3. 翻译：goods / foods / cookbooks 按新编号对上后内容一样，其余种类原样。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBundle, defaultDataDir, itemRefs, readSourceDir, type IdKind } from '../src/index';

const oldDir = process.argv[2];
if (!oldDir) throw new Error('usage: renumber-verify.ts <old data dir>');
const map = JSON.parse(readFileSync(join(defaultDataDir(), 'renumber', 'map.json'), 'utf8')) as Record<
  IdKind | 'cookbookSlots',
  Array<[number, number]>
>;
const M = {
  goods: new Map(map.goods),
  foods: new Map(map.foods),
  cookbooks: new Map(map.cookbooks),
  slot: new Map(map.cookbookSlots),
};
const b0 = buildBundle(readSourceDir(oldDir));
const b1 = buildBundle(readSourceDir(defaultDataDir()));
if (!b0.bundle || !b1.bundle) throw new Error(`build failed:\n${[...b0.errors, ...b1.errors].join('\n')}`);

const errors: string[] = [];
const changed = new Map<string, Map<string, number>>(); // 路径样式 → 类别 → 次数
const unchanged = new Map<string, Array<{ path: string; v: number }>>();
const pattern = (p: Array<string | number>) => p.map((x) => (typeof x === 'number' ? '*' : x)).join('.');
const kindOf = (a: number, b: number) =>
  (['goods', 'foods', 'cookbooks', 'slot'] as const).filter((k) => M[k].get(a) === b);

function walk(a: unknown, b: unknown, p: Array<string | number>) {
  if (typeof a === 'number' && typeof b === 'number') {
    const pat = pattern(p);
    if (a === b) {
      const list = unchanged.get(pat) ?? [];
      list.push({ path: p.join('.'), v: a });
      unchanged.set(pat, list);
      return;
    }
    const ks = kindOf(a, b);
    if (ks.length === 0) return void errors.push(`${p.join('.')}: ${a} → ${b} 不是任何对照`);
    const m = changed.get(pat) ?? new Map<string, number>();
    m.set(ks.join('|'), (m.get(ks.join('|')) ?? 0) + 1);
    changed.set(pat, m);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return void errors.push(`${p.join('.')}: 数组长度 ${a.length} ≠ ${b.length}`);
    a.forEach((x, i) => walk(x, b[i], [...p, i]));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.join() !== kb.join()) return void errors.push(`${p.join('.')}: 键不同 ${ka.join()} / ${kb.join()}`);
    for (const k of ka) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...p, k]);
    return;
  }
  if (a !== b) errors.push(`${p.join('.')}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
const { version: _v0, i18n: i0, ...rest0 } = b0.bundle;
const { version: _v1, i18n: i1, ...rest1 } = b1.bundle;
walk(rest0, rest1, []);

// 有换有没换的路径样式：没换的值如果是旧编号，就是漏改
for (const [pat, kinds] of changed) {
  for (const { path, v } of unchanged.get(pat) ?? []) {
    for (const k of kinds.keys())
      for (const kk of k.split('|'))
        if (M[kk as keyof typeof M].has(v)) errors.push(`${path}: ${v} 没换（同样式的换成了 ${k}）`);
  }
}

// 引用
const mapRef = (r: { kind: 'goods' | 'foods'; id: number; role: string }) =>
  `${r.kind} ${M[r.kind].get(r.id) ?? r.id} ${r.role}`;
const refs0 = itemRefs(b0.bundle).map(mapRef).sort();
const refs1 = itemRefs(b1.bundle)
  .map((r) => `${r.kind} ${r.id} ${r.role}`)
  .sort();
if (refs0.join('\n') !== refs1.join('\n')) errors.push('itemRefs 换算后不一致');

// 翻译
for (const l of Object.keys(i0) as Array<keyof typeof i0>) {
  for (const kind of Object.keys(i0[l]) as Array<keyof (typeof i0)[typeof l]>) {
    const m = kind === 'goods' ? M.goods : kind === 'foods' ? M.foods : kind === 'cookbooks' ? M.cookbooks : null;
    const want = Object.fromEntries(
      Object.entries(i0[l][kind]).map(([k, v]) => [m ? String(m.get(Number(k)) ?? k) : k, v]),
    );
    if (JSON.stringify(Object.entries(want).sort()) !== JSON.stringify(Object.entries(i1[l][kind]).sort()))
      errors.push(`i18n ${l}.${kind} 不一致`);
  }
}

for (const [pat, kinds] of [...changed].sort())
  console.log(`${pat}  ${[...kinds].map(([k, n]) => `${k} ×${n}`).join(', ')}`);
if (errors.length) {
  console.error(errors.slice(0, 200).join('\n'));
  console.error(`${errors.length} errors`);
  process.exit(1);
}
console.log(`ok: refs ${refs1.length}, patterns ${changed.size}`);
```

- [ ] **Step 3：写换号脚本 `packages/config/scripts/renumber-apply.ts`**

```ts
/**
 * 重新编号 第 4 步（一次性）：按 data/renumber/map.json 把配置数据换成新编号。
 *   pnpm -F @dt/config exec tsx scripts/renumber-apply.ts
 * - SOURCE_FILES 里的每个文件按 rewriteIds 的通用规则 + 下面 FILE_RULES 的位置规则换，按路径就地替换数字，排版不动；
 * - 菜谱主表的 slot 按新编号顺序重排（对照表的 cookbookSlots），cookbook_slots.json 的 next 改成菜谱总数；
 * - 翻译表（data/i18n/<语言>/{goods,foods,cookbooks}.json）换键；
 * - dataset/goods_sources.json 不在 SOURCE_FILES 里，按设计 §3 保留旧编号。
 * 主表已经是新编号时什么都不做（防止重跑）；有查不到对照的旧编号时报错、什么都不写
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultDataDir, SOURCE_FILES } from '../src/index';
import { patchJsonText, rewriteIds, TUNING_ID_PATHS, type IdMaps, type PathRule } from '../src/renumber';

const data = defaultDataDir();
const read = (name: string) => readFileSync(join(data, `${name}.json`), 'utf8');
const map = JSON.parse(read('renumber/map.json')) as Record<string, Array<[number, number]>>;
const maps: IdMaps = {
  goods: new Map(map.goods),
  foods: new Map(map.foods),
  cookbooks: new Map(map.cookbooks),
};
const slotOf = new Map(map.cookbookSlots);

const master = JSON.parse(read('master/goods')) as { data: Array<{ id: number }> };
if (master.data.every((g) => g.id >= 10000)) {
  console.log('主表已经是新编号，跳过');
  process.exit(0);
}

/** 按位置认的编号（通用键名规则认不出的）；路径从文件的根算 */
const FILE_RULES: Record<string, readonly PathRule[]> = {
  'master/goods': [[['data', '*', 'id'], 'goods']],
  'master/foods': [[['data', '*', 'id'], 'foods']],
  'master/cookbooks': [[['data', '*', 'id'], 'cookbooks']],
  'game/kuji': [[['themes', '*', 'figures', '*'], 'goods']],
  'game/fund': [[['medals', '*', 'id'], 'goods']],
  'game/tuning': TUNING_ID_PATHS,
  'dataset/market_guess_foods': [[['data', '*', 'i'], 'foods']],
  restaurant_defaults: [
    [['giftGoods', '*', 'id'], 'goods'],
    [['giftFoods', '*', 'id'], 'foods'],
  ],
};

const out = new Map<string, string>();
const problems: string[] = [];
for (const name of SOURCE_FILES) {
  const text = read(name);
  const r = rewriteIds(JSON.parse(text), maps, { paths: FILE_RULES[name] ?? [] });
  for (const o of r.orphans) problems.push(`${name} ${o.path.join('.')}: ${o.kind} ${o.id} 没有对照`);
  const edits = new Map(r.edits);
  if (name === 'master/cookbooks') {
    const list = (JSON.parse(text) as { data: Array<{ id: number; slot: number }> }).data;
    list.forEach((c, i) => {
      if (c.slot !== c.id) problems.push(`cookbook ${c.id} slot ${c.slot} ≠ id（对照表按 slot = 旧编号生成）`);
      edits.set(JSON.stringify(['data', i, 'slot']), slotOf.get(c.id)!);
    });
  }
  if (name === 'game/cookbook_slots') edits.set(JSON.stringify(['next']), slotOf.size);
  if (edits.size > 0) {
    out.set(name, patchJsonText(text, edits));
    console.log(`${name}: ${edits.size}`);
  }
}
// 翻译表换键（JSON.stringify(…, null, 2) + 换行，和原文件一样）
for (const l of ['en', 'fr', 'es']) {
  for (const kind of ['goods', 'foods', 'cookbooks'] as const) {
    const name = `i18n/${l}/${kind}`;
    const t = JSON.parse(read(name)) as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      const n = maps[kind].get(Number(k));
      if (n === undefined) problems.push(`${name} ${k} 没有对照`);
      else next[String(n)] = v;
    }
    out.set(name, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`${name}: ${Object.keys(next).length} keys`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
for (const [name, text] of out) writeFileSync(join(data, `${name}.json`), text);
```

- [ ] **Step 4：跑换号脚本，看输出**

Run: `pnpm -F @dt/config exec tsx scripts/renumber-apply.ts`
Expected: 每个改了的文件一行“文件: 处数”，至少有 `master/goods`、`master/foods`、`master/cookbooks`、`game/kuji`、`game/fund`、`game/tuning`、`designed/goods_exchange`、`designed/quest_*`、`game/retired`、`game/cookbook_slots: 1`、九个翻译表；没有“没有对照”。
如果报“没有对照”：看是哪个文件哪条路径——是规则误认（不是编号）就在 FILE_RULES 或规则里排除并记 Ruling；是真的旧编号查不到（主表里没有的道具）就停下，属于数据错误，查清再继续。

- [ ] **Step 5：跑比对脚本**

Run: `pnpm -F @dt/config exec tsx scripts/renumber-verify.ts "$OLD/packages/config/data"`
Expected: 打印路径样式清单，最后一行 `ok: refs N, patterns M`，退出码 0。
逐行看一遍路径样式清单：每一行都应该是编号字段（`goods.*.id goods`、`cookbooks.*.needFoods.*.*.foodsId foods`、`cookbooks.*.slot slot` 之类）。出现 `num`、`level`、`coin` 这类字段说明规则误认，改规则重来（`git checkout packages/config/data` 后重跑 Step 4）。

- [ ] **Step 6：常量换号**

`packages/config/src/ids.ts`：`GOODS` 里每个编号按 map.json 的 goods 换（写个临时脚本放 scratchpad 读 map.json 替换 `^\s+\w+: (\d+),` 行，基数两行手改），然后手改：

```ts
  fragmentBase: 10800, // 残卷碎片 = 10800 + 特色菜等级（10801~10806）
  levelTicketBase: 10100, // N 级食材兑换券 = 10100 + N（10101~10105）
```
`krabBurger` 那行的注释删掉“注意：fragmentBase 也是 180……”（不再冲突，设计 §2.1）。`FOODS` 的注释改成“万能食材：id = 9000 + 食材等级（1~5 级）”。`SPONSOR_HATS`、`WIKI_HIDDEN_GOODS`、`NEWBIE.pack`、`FUND` 按对照换；`NEWBIE.foodVoucherBase: 10200`，注释里的 93001~93005 改成 10201~10205，`FUND` 注释不提旧号。

`packages/shared/src/goodsIds.ts`：`mysteryTicket`、`starPromoHonor`、`krabCoin` 按对照换；`SHARED_FOODS = { masterBase: 9000, masterLevel1: 9001, masterLevel2: 9002 }`，注释同步。

改完检查：`grep -nE ": [0-9]{1,3}[,]| [0-9]{5}," packages/config/src/ids.ts packages/shared/src/goodsIds.ts` 里不再有旧号段的道具编号（`DEVICE_TYPE`、`GOODS_TYPE`、`NON_SUIT_IDS` 这些不是编号，不动）。

- [ ] **Step 7：模拟器输入换号**

- `apps/server/src/sim/fast/side-income.json`：`"goods": [{ "id": 1, … }, { "id": 315, … }]` 两个 id 按对照换（神秘礼券、喇叭）。
- `apps/server/src/sim/examples/star3.json`：`"cookbooks": { "149": 3, "150": 2, "151": 1 }` 三个键按菜谱对照换。

- [ ] **Step 8：构建、跑全部测试，修漏网的编号**

```bash
pnpm -F @dt/shared build
pnpm -F @dt/config build
pnpm -F @dt/config exec vitest run > "$WS/t2-config.txt" 2>&1; tail -30 "$WS/t2-config.txt"
pnpm -F @dt/server test > "$WS/t2-server.txt" 2>&1; tail -60 "$WS/t2-server.txt"
pnpm -F @dt/web test > "$WS/t2-web.txt" 2>&1; tail -30 "$WS/t2-web.txt"
pnpm -r typecheck
```
（`$WS` = 计划的工作目录 `.superpowers/sdd/2026-10-05-id-renumber-pr4-migrate/`）

Expected：第一次会有失败。已知会失败、要改的：
- `packages/config/src/itemLiterals.test.ts` 的规则样例用的是旧编号（93、101、1、30）：按对照换成新编号（93 → 对照里的新号，101 → 1001，菜谱 1 → 对照里的新号，30 → 对照里的新号），`999999` 仍是“不存在的编号”样例（不在任何号段里，留着）。
- `apps/server/src/modules/open/data.test.ts` 的 `goodsDetail('zh-CN', 115 / 10 / 310 / 30)`：改成 `gid('每日签到礼包')` 等按名字查。
- 其他失败逐个看：是写死的旧编号就改成常量或 `gid` / `fid` / `cid`；是种子随机结果变了（不应该：这一步配置包结构和顺序都没变）就停下查原因。
全部通过后再跑一遍 `itemLiterals.test.ts`（它扫源码和测试里的新编号，确认没有写死新编号）。

- [ ] **Step 9：提交**

```bash
git add packages/config/scripts/renumber-apply.ts packages/config/scripts/renumber-verify.ts packages/config/data packages/config/src/ids.ts packages/shared/src/goodsIds.ts apps/server/src/sim/fast/side-income.json apps/server/src/sim/examples/star3.json
git add <Step 8 改过的测试文件，逐个列出>
git commit -m "feat: 道具、食材、菜谱换成新编号（配置、常量、测试数据）（重新编号 第 4 步）"
```

---

### Task 3：主表带旧编号和小类，按新编号排序，配置包带对照

**Files:**
- Modify: `packages/config/src/raw.ts`（`masterGoods` 加 `legacyId`、`group`；`masterFood`、`masterCookbook` 加 `legacyId`；新 `goodsGroupsFile`）
- Modify: `packages/config/src/source.ts`（加 `game/goods_groups`）
- Modify: `packages/config/src/build.ts`（号段检查、`legacy` 输出）
- Modify: `packages/config/src/types.ts`（`ConfigBundle.legacy`）
- Modify: `packages/config/src/runtime.ts`（`GameConfig.legacy`）
- Move: `packages/config/data/renumber/goods_groups.json` → `packages/config/data/game/goods_groups.json`（包成 `{ "rule", "groups" }`）
- Modify: `packages/config/data/master/{goods,foods,cookbooks}.json`（一次性脚本：加字段、按新编号排序，用 `formatMaster` 写）
- Test: `packages/config/src/build.test.ts`、`packages/config/src/runtime.test.ts`
- Modify: `docs/data-maintenance.md`

**Interfaces:**
- Consumes: Task 2 的新编号主表、`data/renumber/map.json`
- Produces:
  - 主表条目：道具 `{ id, legacyId?, src, group, … }`，食材、菜谱 `{ id, legacyId?, src, … }`（`legacyId` 只在换号前就有的条目上）
  - `ConfigBundle.legacy: { goods: Array<[number, number]>; foods: Array<[number, number]>; cookbooks: Array<[number, number]> }`（[旧, 新]，按旧编号排）
  - `GameConfig.legacy: { goods: ReadonlyMap<number, number>; foods: ReadonlyMap<number, number>; cookbooks: ReadonlyMap<number, number> }`
  - `data/game/goods_groups.json`：`{ rule: string; groups: Array<{ key: string; name: string; base: number; size: number }> }`

- [ ] **Step 1：写失败的测试**

`packages/config/src/build.test.ts` 末尾加（沿用文件里现成的“改一份源数据再构建”的写法，用 `realSource()` 之类的现有辅助函数；下面按 `source()` 返回可改的源数据、`build(src)` 返回 `{ bundle, errors }` 写，实际名字以文件为准）：

```ts
describe('编号规则（重新编号 PR 4）', () => {
  it('道具必须在所属小类的号段里；小类不能重叠、不能不存在', () => {
    const src = source();
    const goods = src['master/goods'] as Array<{ id: number; group: string }>;
    goods[0]!.group = 'nope';
    goods[1]!.id = 99999;
    const groups = (src['game/goods_groups'] as { groups: Array<{ key: string; base: number; size: number }> }).groups;
    groups[1]!.base = groups[0]!.base + 50;
    const { errors } = build(src);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`goods ${goods[0]!.id} group nope unknown`),
        expect.stringContaining('goods 99999 outside group'),
        expect.stringContaining(`goods groups ${groups[0]!.key} and ${groups[1]!.key} overlap`),
      ]),
    );
  });

  it('食材、菜谱编号在各自号段里；旧编号不能重复', () => {
    const src = source();
    const foods = src['master/foods'] as Array<{ id: number; legacyId?: number }>;
    foods[0]!.id = 606;
    foods[2]!.legacyId = foods[1]!.legacyId;
    const cbs = src['master/cookbooks'] as Array<{ id: number }>;
    cbs[0]!.id = 18000;
    const { errors } = build(src);
    expect(errors).toEqual(
      expect.arrayContaining([
        'foods 606 outside 1001~9999',
        `foods: duplicate legacyId ${foods[1]!.legacyId}`,
        'cookbooks 18000 outside 100001~199999',
      ]),
    );
  });

  it('配置包带旧 → 新对照（旧链接跳转、原版获取途径用）', () => {
    const b = realBuild().bundle!;
    const g = b.goods.find((x) => x.name === '神秘礼券')!;
    expect(b.legacy.goods).toContainEqual([1, g.id]);
    expect(b.legacy.foods.length).toBe(b.foods.length);
    expect(b.legacy.cookbooks.length).toBe(b.cookbooks.length);
  });
});
```

`packages/config/src/runtime.test.ts` 加：

```ts
it('legacy 是旧编号 → 新编号的查找表', () => {
  const c = createGameConfig(realBuild().bundle!);
  const g = c.bundle.goods.find((x) => x.name === '神秘礼券')!;
  expect(c.legacy.goods.get(1)).toBe(g.id);
  expect(c.legacy.goods.get(g.id)).toBeUndefined();
});
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config exec vitest run src/build.test.ts src/runtime.test.ts`
Expected: FAIL（`legacy` 不存在 / 没有号段错误）

- [ ] **Step 3：主表加字段、排序（一次性，scratchpad 脚本，不提交）**

`$SCRATCH/t3-master.ts`（用 `pnpm -F @dt/config exec tsx` 跑，`import { formatMaster } from '<repo>/packages/config/src/master'`）：
- 读 `data/renumber/map.json`，建 新 → 旧 的反查；读 `data/renumber/goods_groups.json`（数组）。
- 道具：每条 `{ id, legacyId: 旧, src, group: 所在号段的 key, ...其余字段原顺序 }`；号段按 `base <= id < base + size` 找，找不到就报错。食材、菜谱：`{ id, legacyId: 旧, src, ...其余 }`。
- 三份都按 `id` 升序，用 `formatMaster(原 rule, list)` 写回；道具主表的 `rule` 末尾补“；legacyId = 重新编号前的编号，group = 小类（data/game/goods_groups.json）”，食材、菜谱主表的 `rule` 补“；legacyId = 重新编号前的编号”。
- 写 `data/game/goods_groups.json`：`{ "rule": "道具小类（重新编号，设计 §2.1）：编号 = base 起的整百段，size 是容量；新道具接在小类已用的最大编号后面", "groups": [...] }`（1 空格缩进，结尾换行），删掉 `data/renumber/goods_groups.json`。

- [ ] **Step 4：实现 schema、构建检查和输出**

`raw.ts`：

```ts
// masterGoods 的 object 里，id 后面加：
    /** 重新编号前的编号（之后新加的道具没有） */
    legacyId: int.optional(),
// src 后面加：
    /** 小类（data/game/goods_groups.json 的 key），编号必须在它的号段里 */
    group: z.string().min(1),
// masterFood、masterCookbook 的 id 后面同样加 legacyId: int.optional(),

/** data/game/goods_groups.json：道具小类 */
export const goodsGroupsFile = z
  .object({
    rule: z.string(),
    groups: z.array(z.object({ key: z.string().min(1), name: z.string().min(1), base: int, size: int.min(1) }).strict()),
  })
  .strict();
```

`source.ts` 的 `SOURCE_FILES` 在 `'game/cookbook_slots',` 后加 `'game/goods_groups',`。

`build.ts`：读 `const groupsRaw = parse('game/goods_groups', raw.goodsGroupsFile);`，加进缺失检查（和 `slotsRaw` 一样）；在道具、食材、菜谱构建完之后加：

```ts
  // ---------- 编号规则（重新编号，设计 §2） ----------
  const groupByKey = new Map(groupsRaw.groups.map((g) => [g.key, g]));
  const sortedGroups = [...groupsRaw.groups].sort((a, b) => a.base - b.base);
  sortedGroups.forEach((g, i) => {
    const next = sortedGroups[i + 1];
    if (next && g.base + g.size > next.base) errors.push(`goods groups ${g.key} and ${next.key} overlap`);
  });
  for (const m of goodsRaw) {
    const g = groupByKey.get(m.group);
    if (!g) errors.push(`goods ${m.id} group ${m.group} unknown`);
    else if (m.id < g.base || m.id >= g.base + g.size)
      errors.push(`goods ${m.id} outside group ${g.key} (${g.base}~${g.base + g.size - 1})`);
  }
  for (const f of foodsRaw) if (f.id < 1001 || f.id > 9999) errors.push(`foods ${f.id} outside 1001~9999`);
  for (const c of cookbooksRaw)
    if (c.id < 100001 || c.id > 199999) errors.push(`cookbooks ${c.id} outside 100001~199999`);
  const legacyPairs = (name: string, list: ReadonlyArray<{ id: number; legacyId?: number }>) => {
    const seen = new Set<number>();
    const out: Array<[number, number]> = [];
    for (const x of list) {
      if (x.legacyId === undefined) continue;
      if (seen.has(x.legacyId)) errors.push(`${name}: duplicate legacyId ${x.legacyId}`);
      seen.add(x.legacyId);
      out.push([x.legacyId, x.id]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  const legacy = {
    goods: legacyPairs('goods', goodsRaw),
    foods: legacyPairs('foods', foodsRaw),
    cookbooks: legacyPairs('cookbooks', cookbooksRaw),
  };
```
（`goodsRaw` / `foodsRaw` / `cookbooksRaw` 用 build.ts 里读主表后的变量名；返回的 bundle 加 `legacy`。）

`types.ts` 的 `ConfigBundle` 加：

```ts
  /** 重新编号前的编号 → 新编号（设计 §5：旧链接跳转、原版获取途径），按旧编号排 */
  legacy: { goods: Array<[number, number]>; foods: Array<[number, number]>; cookbooks: Array<[number, number]> };
```

`runtime.ts` 的 `GameConfig` 加 `readonly legacy: { goods: ReadonlyMap<number, number>; foods: ReadonlyMap<number, number>; cookbooks: ReadonlyMap<number, number> };`，`createGameConfig` 里：

```ts
    legacy: {
      goods: new Map(bundle.legacy.goods),
      foods: new Map(bundle.legacy.foods),
      cookbooks: new Map(bundle.legacy.cookbooks),
    },
```

其他构造 `ConfigBundle` 的地方（测试辅助、`apps/server/test/config.ts` 等）跟着 typecheck 报错补上。

- [ ] **Step 5：运行，确认通过；全部测试**

```bash
pnpm -F @dt/config build
pnpm -F @dt/config exec vitest run > "$WS/t3-config.txt" 2>&1; tail -30 "$WS/t3-config.txt"
pnpm -F @dt/server test > "$WS/t3-server.txt" 2>&1; tail -60 "$WS/t3-server.txt"
pnpm -F @dt/web test > "$WS/t3-web.txt" 2>&1; tail -20 "$WS/t3-web.txt"
pnpm -r typecheck
```
Expected: 全部 PASS。主表按新编号重排后，按配置顺序抽随机的测试结果可能变（道具奖励池的顺序变了）：失败的看断言——是“具体抽到哪件”的断言就按新顺序更新期望值并记 Ruling（行为没变，只是池子顺序变了）；是其他原因就查。

- [ ] **Step 6：文档**

`docs/data-maintenance.md` 主表那一节加“编号规则”小节：
- 道具：先在 `data/game/goods_groups.json` 选小类（没有合适的就新开一个整百段，不能和已有的重叠），编号取该小类已用的最大编号 + 1，`group` 填小类的 key；不填 `legacyId`。
- 食材：等级 × 1000 + 该等级已用的最大序号 + 1；以后改等级编号不变。
- 菜谱：100000 + 街道 × 1000 + 该街道已用的最大序号 + 1；`slot` 取 `game/cookbook_slots.json` 的 `next`，再把 `next` 加 1。
- 构建会检查：道具在小类号段里、食材 1001~9999、菜谱 100001~199999、`legacyId` 不重复。
- `legacyId` 是 2026-10 重新编号前的编号，只给旧链接跳转和原版获取途径（`dataset/goods_sources.json`）用；对照表原件在 `data/renumber/map.json`，审阅报告在 `docs/design/重新编号对照.md`。

- [ ] **Step 7：提交**

```bash
git add packages/config/src/raw.ts packages/config/src/source.ts packages/config/src/build.ts packages/config/src/types.ts packages/config/src/runtime.ts packages/config/src/build.test.ts packages/config/src/runtime.test.ts packages/config/data/master packages/config/data/game/goods_groups.json packages/config/data/renumber/goods_groups.json docs/data-maintenance.md
git add <Step 4、5 改过的其他文件，逐个列出>
git commit -m "feat(config): 主表记旧编号和道具小类、按新编号排序，构建检查号段（重新编号 第 4 步）"
```

---

### Task 4：导入新街道、同步脚本、道具整理工具跟上新编号

**Files:**
- Modify: `packages/config/src/streetImport.ts`（`assignIds`）
- Test: `packages/config/src/streetImport.test.ts`
- Modify: `packages/config/src/master.ts`（`goodsFromRaw`、`foodFromRaw` 带 `legacyId`、`group`）
- Modify: `packages/config/scripts/import-new-streets.ts`
- Modify: `packages/config/scripts/sync-data.ts`
- Modify: `apps/server/src/items/tool.ts`、`apps/server/src/items/main.ts`
- Test: `apps/server/src/items/tool.test.ts`

**Interfaces:**
- Consumes: Task 3 的主表字段 `legacyId`、`group`
- Produces:
  - `assignIds(known: ReadonlyMap<number, number>, items: ReadonlyArray<{ legacyId: number; base: number }>, taken: Iterable<number>, size?: number): Map<number, number>` —— 旧编号 → 新编号
  - `originalSources(rows, legend, toNew: (legacyId: number) => number | undefined): Map<number, string[]>`（键是新编号）

- [ ] **Step 1：写失败的测试**

`packages/config/src/streetImport.test.ts` 加：

```ts
describe('按旧编号分配新编号（重新编号 PR 4）', () => {
  it('主表里有这个旧编号的沿用；新的接在同一段已用的最大编号后面，按出现顺序', () => {
    const known = new Map([[501, 7003]]);
    const m = assignIds(
      known,
      [
        { legacyId: 501, base: 7000 },
        { legacyId: 640, base: 7000 },
        { legacyId: 641, base: 6000 },
        { legacyId: 642, base: 7000 },
      ],
      [7001, 7002, 7003, 6001],
    );
    expect([...m]).toEqual([
      [501, 7003],
      [640, 7004],
      [641, 6002],
      [642, 7005],
    ]);
  });

  it('段里还没有编号时从 base + 1 开始；段满了报错', () => {
    expect(assignIds(new Map(), [{ legacyId: 1, base: 129000 }], []).get(1)).toBe(129001);
    expect(() => assignIds(new Map(), [{ legacyId: 1, base: 9000 }], [9999], 1000)).toThrow('9000');
  });
});
```

`apps/server/src/items/tool.test.ts` 加（`originalSources` 的现有测试改成传第三个参数）：

```ts
it('原版获取途径按旧编号对上新编号；对不上的（已删的道具）丢掉', () => {
  const m = originalSources(
    [
      { id: 1, t: 1 },
      { id: 999, t: 1 },
    ],
    { t: '任务' },
    (old) => (old === 1 ? 10001 : undefined),
  );
  expect([...m]).toEqual([[10001, ['任务']]]);
});
```

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/config exec vitest run src/streetImport.test.ts` 和 `pnpm -F @dt/server exec vitest run src/items/tool.test.ts`
Expected: FAIL（`assignIds` 不存在；`originalSources` 键还是旧编号）

- [ ] **Step 3：实现**

`streetImport.ts`：

```ts
/**
 * 按旧编号（外部数据里的编号）分配新编号（重新编号，设计 §3）：主表里已有这个 legacyId 的沿用；
 * 新出现的接在同一段（base + 1 ~ base + size - 1）已用的最大编号后面，按 items 的顺序
 */
export function assignIds(
  known: ReadonlyMap<number, number>,
  items: ReadonlyArray<{ legacyId: number; base: number }>,
  taken: Iterable<number>,
  size = 1000,
): Map<number, number> {
  const used = new Set(taken);
  const out = new Map<number, number>();
  for (const { legacyId, base } of items) {
    const had = known.get(legacyId);
    if (had !== undefined) {
      out.set(legacyId, had);
      continue;
    }
    let max = base;
    for (const id of used) if (id > base && id < base + size && id > max) max = id;
    if (max + 1 >= base + size) throw new Error(`no free id after ${base}`);
    used.add(max + 1);
    out.set(legacyId, max + 1);
  }
  return out;
}
```

`master.ts`：`goodsFromRaw(g, src, extra: { id: number; legacyId: number; group: string })` 产出 `{ id: extra.id, legacyId: extra.legacyId, src, group: extra.group, … }`；`foodFromRaw(f, src, extra: { id: number; legacyId: number })` 同理（字段顺序和 Task 3 的主表一致：`id, legacyId, src, group?`）。`master.test.ts` 跟着改调用。

`import-new-streets.ts`（只列改动；文件头注释同步改成“外部数据的编号是旧编号，按主表 legacyId 对照，新条目按设计 §2 分配”）：

```ts
const legacyOf = <T extends { id: number; legacyId?: number }>(list: T[]) =>
  new Map(list.filter((x) => x.legacyId !== undefined).map((x) => [x.legacyId!, x.id]));
/** 外部食材旧编号 → 新编号：原版食材也在里面（新菜谱的用料引用原版食材的旧编号） */
const foodId = assignIds(
  legacyOf(mFoods.data),
  foods.map((f) => ({ legacyId: f.id, base: f.level * 1000 })),
  mFoods.data.map((f) => f.id),
);
for (const [old, id] of legacyOf(mFoods.data)) if (!foodId.has(old)) foodId.set(old, id);
const cbId = assignIds(
  legacyOf(mCookbooks.data),
  sorted.map((c) => ({ legacyId: c.id, base: 100000 + c.streetId * 1000 })),
  mCookbooks.data.map((c) => c.id),
);
/** 街道勋章：60000 + 街道编号（小类 streetMedal）；旧编号是之前的 92000 + 街道编号 */
const medalId = (streetId: number) => 60000 + streetId;
const toFood = (old: number) => {
  const id = foodId.get(old);
  if (id === undefined) throw new Error(`food ${old} not found`);
  return id;
};
```
其余替换：
- `importConflicts` 比较时，主表一侧用 `legacyId` 作编号：`importConflicts(mCookbooks.data.filter((c) => c.src === 'streets').map((c) => ({ ...c, id: c.legacyId! })), sorted)`。
- `level` 表按新编号：`new Map([...mFoods.data.filter((f) => f.src === 'original'), ...foods.map((f) => ({ ...f, id: toFood(f.id) }))].map((f) => [f.id, f.level]))`。
- `extendGrades` 前先把外部用料换成新编号：`mapGrades(c.needFoodsByLevel, toFood)`（在脚本里写一个小函数，把每个品级列表的 `foodsId` 过一遍 `toFood`）。
- 写食材主表：`foodFromRaw(f, 'streets', { id: toFood(f.id), legacyId: f.id })`。
- 写勋章：`goodsFromRaw(…, 'streets', { id: medalId(m.devicetype), legacyId: 92000 + (m.devicetype as number), group: 'streetMedal' })`。
- 写菜谱：`id: cbId.get(c.id)!, legacyId: c.id`；`assignSlots(mCookbooks.data, sorted.map((c) => cbId.get(c.id)!), slotsFile.next)`。
- 主表写回前按 `id` 排序（`replaceSrc` 之后 `.sort((a, b) => a.id - b.id)`）。
- 翻译：`theirs[c.id]` 写到 `mine[cbId.get(c.id)!]`；`pruneNames(…, oldIds, newIds)` 的两个集合都用新编号。

`sync-data.ts` 的 `DATASET` 删掉 `'mysterious_cookbooks'`、`'bar_slot_machine_award'`、`'market_guess_foods'`，上面注释加一行：“特色菜用料、老虎机奖品、菜场竞猜食材里有食材、道具编号，重新编号后不再同步（原版数据里是旧编号）”。

`tool.ts`：

```ts
export function originalSources(
  rows: ReadonlyArray<Record<string, number>>,
  legend: Readonly<Record<string, string>>,
  toNew: (legacyId: number) => number | undefined,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const r of rows) {
    const id = toNew(r.id!);
    if (id === undefined) continue;
    const list = out.get(id) ?? [];
    for (const [k, v] of Object.entries(r)) {
      const name = legend[k];
      if (v === 1 && name && !list.includes(name)) list.push(name);
    }
    out.set(id, list);
  }
  return out;
}
```
注释改成“dataset/goods_sources 按旧编号（原版资料），按主表 legacyId 换成新编号”。`main.ts` 传 `toNew`：读 `master/goods.json` 建 `legacyId → id` 的 Map。

- [ ] **Step 4：运行，确认通过；实跑导入确认主表不变**

```bash
pnpm -F @dt/config exec vitest run src/streetImport.test.ts src/master.test.ts
pnpm -F @dt/server exec vitest run src/items
pnpm -F @dt/config import-streets
git status --short packages/config/data
```
Expected: 测试 PASS；导入脚本跑完 `git status` 没有 `packages/config/data` 下的改动（外部数据没变，按 legacyId 全部对上）。外部数据目录（`../data/新街道菜谱`）不在时脚本会报找不到文件：记 Ruling“没有外部数据，只靠单元测试”，继续。

- [ ] **Step 5：提交**

```bash
git add packages/config/src/streetImport.ts packages/config/src/streetImport.test.ts packages/config/src/master.ts packages/config/src/master.test.ts packages/config/scripts/import-new-streets.ts packages/config/scripts/sync-data.ts apps/server/src/items/tool.ts apps/server/src/items/main.ts apps/server/src/items/tool.test.ts
git commit -m "feat(config): 导入新街道按旧编号对照分配新编号，原版获取途径按旧编号对上（重新编号 第 4 步）"
```

---

### Task 5：旧链接跳转

**Files:**
- Modify: `apps/server/src/modules/open/routes.ts`
- Test: `apps/server/src/modules/open/routes.test.ts`（没有就新建，写法照 open 目录里已有的接口测试）
- Modify: `apps/web/src/views/wiki/WikiGoodsView.vue`、`WikiFoodView.vue`、`WikiCookbookView.vue`

**Interfaces:**
- Consumes: Task 3 的 `GameConfig.legacy`
- Produces: `GET /api/v1/open/{goods,foods,cookbooks}/<旧编号>` → 301，`Location: /api/v1/open/<种类>/<新编号>`（带原查询串）

- [ ] **Step 1：写失败的测试**

```ts
describe('开放接口：旧编号跳到新编号（重新编号，设计 §5）', () => {
  it.each([
    ['goods', 1, () => gid('神秘礼券')],
    ['foods', 101, () => fid('大米')],
    ['cookbooks', 1, () => cid('南煎丸子')],
  ] as const)('%s 旧编号 %i', async (kind, old, now) => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/open/${kind}/${old}?lang=en` });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe(`/api/v1/open/${kind}/${now()}?lang=en`);
  });

  it('新编号照常返回；两边都没有的照常 404', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/v1/open/goods/${gid('神秘礼券')}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/open/goods/999999' })).statusCode).toBe(404);
  });
});
```
（`app` 的建法照 `apps/server/src/modules/open/` 下已有测试；`gid`/`fid`/`cid` 来自 `apps/server/test/items.ts`。）

- [ ] **Step 2：运行，确认失败**

Run: `pnpm -F @dt/server exec vitest run src/modules/open`
Expected: FAIL（旧编号返回 404，不是 301）

- [ ] **Step 3：实现**

`routes.ts` 三个详情路由在 `parse(idParam, …)` 之后、`send` 之前加（`config` 取 open 路由里能拿到的 `GameConfig`，按文件现有写法，例如 `deps.config`）：

```ts
/** 重新编号前的编号：301 到新编号（设计 §5），查询串原样带上 */
function legacyRedirect(
  req: FastifyRequest,
  reply: FastifyReply,
  kind: 'goods' | 'foods' | 'cookbooks',
  id: number,
  legacy: ReadonlyMap<number, number>,
) {
  const now = legacy.get(id);
  if (now === undefined) return null;
  const q = req.url.indexOf('?');
  return reply.redirect(`/api/v1/open/${kind}/${now}${q >= 0 ? req.url.slice(q) : ''}`, 301);
}
```
每个路由：`const moved = legacyRedirect(req, reply, 'goods', id, config.legacy.goods); if (moved) return moved;`（旧号段和新号段不重叠，旧编号不会是现有编号）。

三个 Wiki 详情页：数据读到以后，如果接口给的 `id` 和地址里的不一样（旧编号被接口 301 到新编号，fetch 自动跟随），把地址换成新编号：

```ts
// 旧链接（重新编号前的编号）：接口已跳到新编号，地址栏也换成新的（设计 §5）
if (data.id !== Number(route.params.id)) void router.replace(`/wiki/goods/${data.id}`);
```
（`router` 用 `useRouter()`；食材、菜谱页路径分别是 `/wiki/foods/`、`/wiki/cookbooks/`；放在各页现有的加载成功分支里。）

- [ ] **Step 4：运行，确认通过**

Run: `pnpm -F @dt/server exec vitest run src/modules/open && pnpm -F @dt/web test && pnpm -r typecheck`
Expected: PASS

- [ ] **Step 5：提交**

```bash
git add apps/server/src/modules/open/routes.ts apps/server/src/modules/open/routes.test.ts apps/web/src/views/wiki/WikiGoodsView.vue apps/web/src/views/wiki/WikiFoodView.vue apps/web/src/views/wiki/WikiCookbookView.vue
git commit -m "feat: 旧编号的 Wiki 链接和开放接口跳到新编号（重新编号 第 4 步）"
```

---

### Task 6：数据库迁移 0049

**Files:**
- Create: `apps/server/src/db/migrations/0049_renumber_map.ts`（由 map.json 生成，冻结）
- Create: `apps/server/src/db/migrations/0049_renumber.ts`
- Create: `apps/server/src/db/migrations/0049.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Create: `apps/server/src/cli/renumber-dry-run.ts`
- Modify: `apps/server/tsup.config.ts`（加 `cli/renumber-dry-run` 入口）、`apps/server/package.json`（`renumber:dry` 脚本）

**Interfaces:**
- Consumes: Task 1 的 `rewriteIds`、`isNewId`、`TUNING_ID_PATHS`（从 `@dt/config` 导入）
- Produces:
  - `0049_renumber_map.ts`：`export const GOODS: readonly number[]`、`FOODS`、`COOKBOOKS`（扁平的 `[旧, 新, 旧, 新, …]`），`COOKBOOK_SLOTS`（`[旧编号(= 旧存储位), 新存储位, …]`），`SLOTS: number`（3810）
  - `renumber(db: Kysely<DB>, log?: (line: string) => void): Promise<RenumberReport>`，必须在事务里调用
  - `interface RenumberReport { rows: Record<string, number>; orphans: Array<{ table: string; kind: IdKind; id: number; count: number }>; learned: number; ms: number }`

迁移要改的地方（来自对开发库 schema 和数据的清点）：

| 种类 | 普通列（在用） |
|---|---|
| 道具 | `store_item.goods_id`、`restaurant_device.goods_id`、`equip.goods_id`、`equip_gem.gem_goods_id`、`shop_special.goods_id`、`fund_deposit.medal`、`effect_source.source_id`（只限 `source_type in ('honor','street')`） |
| 食材 | `cupboard_food.foods_id`、`market_item.foods_id`、`yard_plant.foods_id`、`yard_basket.foods_id`、`hiphop_day.foods_id`、`hiphop_tip.foods_id`、`exchange_order`、`exchange_trade`、`exchange_ref`、`exchange_wallet_food`、`exchange_hold`、`exchange_stock`、`exchange_maker_day` 的 `foods_id`；`market_guess.foods_ids`（数组） |
| 菜谱 | `takeaway_order.cookbook_id` |

| 历史（查不到对照的照原样留下、列进报告） |
|---|
| `ledger.item_id`（`kind = 'goods'` 按道具，`kind in ('foods','basket')` 按食材；`remnant`、`seed` 不是道具食材，不动）、`ledger.source` 和 `stat_daily.source` 的 `gift.<道具>`、`daily_counter.key` 的 `renownShop:<道具>` |

| JSON 列 | 在用 / 历史 | 额外规则 |
|---|---|---|
| `mail.items`、`redeem_code.items`、`activity.def`、`admin_grant.items`、`kuji_pool.tiers`、`kuji_pool.last`、`restaurant_tables.tables`、`bar_round.state` | 在用 | — |
| `shard_config.override` | 在用 | `TUNING_ID_PATHS` 加 `tuning` 前缀 |
| `shard_config_history.override` | 历史 | 同上 |
| `rest_log.params` | 历史 | 类型 `exchange` 的 `give`、`take` 是食材 |
| `news.params`、`audit_log.detail`、`income_round.drops`、`predict_event.params`、`predict_event.result_params` | 历史 | — |

不动：`mail.tpl_params`、`report_*`、`tentacle_shop.slots`（特色菜）、`restaurant.effect_agg`、`job_run.stats`、所有特色菜、种子、配方、街道、天气编号。

- [ ] **Step 1：生成冻结的对照表**

scratchpad 脚本读 `packages/config/data/renumber/map.json`，写 `apps/server/src/db/migrations/0049_renumber_map.ts`：

```ts
/**
 * 迁移 0049 的对照表（重新编号，设计 docs/superpowers/specs/2026-10-05-id-renumber-design.md）：
 * 由 packages/config/data/renumber/map.json 生成后冻结，以后主表再改也不影响这次迁移。
 * 每个数组是扁平的 [旧, 新, 旧, 新, …]；COOKBOOK_SLOTS 是 [旧编号, 新存储位, …]（换号前存储位 = 菜谱编号，PR 3）
 */
export const GOODS: readonly number[] = [ /* … */ ];
export const FOODS: readonly number[] = [ /* … */ ];
export const COOKBOOKS: readonly number[] = [ /* … */ ];
export const COOKBOOK_SLOTS: readonly number[] = [ /* … */ ];
/** 换号后学会记录字节串的长度（菜谱总数） */
export const SLOTS = 3810;
```
写完跑 `pnpm exec prettier --write apps/server/src/db/migrations/0049_renumber_map.ts`（数字数组会按行宽排满）。

- [ ] **Step 2：写失败的测试 `0049.test.ts`**

在独立 schema 里迁到 0048、放旧编号数据、再迁到 0049：

```ts
import { Migrator, sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '..';
import { ensureDailyPartitions } from '../partitions';
import type { DB } from '../schema';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { migrations } from './index';
import { renumber } from './0049_renumber';
import { COOKBOOK_SLOTS, COOKBOOKS, FOODS, GOODS, SLOTS } from './0049_renumber_map';

const pairs = (flat: readonly number[]) => new Map(Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i]!, flat[2 * i + 1]!]));
const G = pairs(GOODS);
const F = pairs(FOODS);
const C = pairs(COOKBOOKS);
const S = pairs(COOKBOOK_SLOTS);
const g = (old: number) => G.get(old)!;
const f = (old: number) => F.get(old)!;

const admin = testDb();
let db: Kysely<DB>;
const SCHEMA = 'renumber_0049';
const migrator = () =>
  new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
let rest: number;
let shard: number;

beforeAll(async () => {
  await sql`drop schema if exists ${sql.id(SCHEMA)} cascade`.execute(admin);
  await sql`create schema ${sql.id(SCHEMA)}`.execute(admin);
  db = createDb(`${process.env.DATABASE_URL!}?options=-c%20search_path%3D${SCHEMA},public`, 2);
  const r = await migrator().migrateTo('0048_rest_door');
  if (r.error) throw r.error;
  for (const t of ['ledger', 'news', 'income_round', 'rest_log'] as const)
    await ensureDailyPartitions(db, t, new Date(Date.now() - 86_400_000), 3);
  shard = await createShard(db);
  rest = await createRestaurantRow(db, shard, await createAccountRow(db));
  // 旧编号的数据：每种表、每种日志结构至少一条（Review Focus 1）
  // store_item 1（神秘礼券）×3、cupboard_food 101 ×5、takeaway_order 菜谱 1、equip 30、equip_gem 41、
  // effect_source honor 140 / device 3（device 的 3 是摆放位，不动）、ledger goods 115 / foods 101 / basket 104 / remnant 1、
  // ledger.source 'gift.115'、stat_daily 'gift.115'、daily_counter 'renownShop:310'、market_guess foods_ids {104, 101}、
  // rest_log：fridge.drop {foodsId 467}、exchange {give 252, take 437}、town.talk rewards [{kind goods id 315},{kind foods id 101},{kind coin id null}]、
  //   admin.grant items {goods [{id 355}], foods [{id 468}]}、krab.happy {cookbookId 1}、krab.happy {cookbookId 51}（已删的菜：历史里留着）、
  //   mc.forget {cookbooks [1], mcId 3}、yard.stolen {foodsId 101, punished 104}、hiphop.wage {cardId 108}、fund.claim {medal 93101}、
  //   level.up {from 1, to 2}、rest.move {from 10, to 1}、mouse.steal {foodsId 239, num 101}
  // news：market.restock {foods [104, 275]}、bar.slot {awardId 1, kind 'foods', itemId 326}、bar.num {award {kind 'goods', id 240, num 1}}、
  //   shop.special {goodsId 464}、temple.explore.rare {foods [{foodsId 574, num 1}]}
  // mail.items {goods [{id 396}]}、redeem_code.items {goods [{id 54}]}、activity.def（pass：price goods、levels award goods）、
  // admin_grant.items、kuji_pool tiers [{award {goods [{id 91101}]}}] / last {award {goods [{id 91104}]}}、
  // shard_config.override {tuning {shop {discardable [87]}, hiphop {wages [[108, 110]]}, predict {unit 500}}}、
  // restaurant_tables [{no 1, last {cookbookId 442, grade 7}}]、income_round drops [{goodsId 134, num 1}]
  // restaurant_cookbooks：levels 长 18747，[1] = 3、[17204] = 2（0039 删掉的菜）
  await seedOld(db, shard, rest);
});
afterAll(async () => {
  await db.destroy();
  await sql`drop schema if exists ${sql.id(SCHEMA)} cascade`.execute(admin);
  await admin.destroy();
});

describe('迁移 0049：重新编号', () => {
  it('在用的表里有查不到对照的旧编号：报错，整个事务回滚', async () => {
    await db.insertInto('store_item').values({ rest_id: rest, goods_id: 999, num: 1 }).execute();
    await expect(db.transaction().execute((trx) => renumber(trx, () => {}))).rejects.toThrow('store_item');
    expect(
      (await db.selectFrom('store_item').select('goods_id').where('rest_id', '=', rest).orderBy('goods_id').execute()).map(
        (r) => r.goods_id,
      ),
    ).toEqual([1, 999]);
    await db.deleteFrom('store_item').where('goods_id', '=', 999).execute();
  });

  it('迁完：普通列、文本、JSON、学会记录都是新编号；不是编号的数字不动', async () => {
    const r = await migrator().migrateTo('0049_renumber');
    if (r.error) throw r.error;
    const one = <T>(q: Promise<T | undefined>) => q.then((x) => x!);
    expect((await db.selectFrom('store_item').selectAll().where('rest_id', '=', rest).execute()).map((x) => [x.goods_id, x.num])).toEqual([[g(1), 3]]);
    // …每条种子数据一条断言，期望值用 g / f / C / S 从冻结对照算，不写新编号字面量
    const logs = await db.selectFrom('rest_log').select(['type', 'params']).where('rest_id', '=', rest).execute();
    const byType = (t: string) => logs.filter((l) => l.type === t).map((l) => l.params);
    expect(byType('exchange')).toEqual([{ give: f(252), take: f(437) }]);
    expect(byType('level.up')).toEqual([{ from: 1, to: 2 }]);
    expect(byType('rest.move')).toEqual([{ from: 10, to: 1 }]);
    expect(byType('mouse.steal')).toEqual([{ foodsId: f(239), num: 101 }]);
    expect(byType('krab.happy')).toEqual(expect.arrayContaining([{ cookbookId: C.get(1) }, { cookbookId: 51 }]));
    const lv = await one(db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', rest).executeTakeFirst());
    expect(lv.levels.length).toBe(SLOTS);
    expect(lv.levels[S.get(1)!]).toBe(3);
    expect([...lv.levels].filter((b) => b > 0)).toEqual([3]);
  });
});
```

把注释里列的每条种子数据写成 `seedOld`（同文件里的函数，直接 `insertInto`，JSON 列传 `JSON.stringify`），并在第二个测试里逐条断言（`effect_source` device 那条 `source_id` 仍是 3；`ledger` remnant 那条 `item_id` 仍是 1；`shard_config.override.tuning.predict.unit` 仍是 500；`bar.slot` 的 `awardId` 仍是 1）。

- [ ] **Step 3：运行，确认失败**

Run: `pnpm -F @dt/server exec vitest run src/db/migrations/0049.test.ts`
Expected: FAIL（`./0049_renumber` 不存在）。如果先卡在 schema 隔离上（某个旧迁移写死了 `public.`，`ensureDailyPartitions` 建分区到了别的 schema），改用独立数据库（`create database dt_test_0049`，测试结束删掉）并记 Ruling。

- [ ] **Step 4：实现 `0049_renumber.ts`**

```ts
import { sql, type Kysely, type Transaction } from 'kysely';
import { isNewId, rewriteIds, TUNING_ID_PATHS, type IdKind, type IdMaps, type PathRule } from '@dt/config';
import type { DB } from '../schema';
import { COOKBOOK_SLOTS, COOKBOOKS, FOODS, GOODS, SLOTS } from './0049_renumber_map';

/**
 * 重新编号（设计 docs/superpowers/specs/2026-10-05-id-renumber-design.md §6 PR 4 第 3 步）：
 * 道具、食材、菜谱的旧编号全部换成新编号，历史记录一起改；学会记录按新存储位重排、截到 SLOTS。
 * 整个在迁移的事务里：在用的表里有查不到对照的旧编号、或自检不通过就抛错，全部回滚。
 * 不提供 down：出问题从备份恢复
 */
const pairs = (flat: readonly number[]) =>
  new Map(Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i]!, flat[2 * i + 1]!] as [number, number]));
const MAPS: IdMaps = { goods: pairs(GOODS), foods: pairs(FOODS), cookbooks: pairs(COOKBOOKS) };
const SLOT_OF = pairs(COOKBOOK_SLOTS);
const RANGE: Record<IdKind, [number, number]> = { goods: [10000, 89999], foods: [1001, 9999], cookbooks: [100001, 199999] };
const BATCH = 2000;

export interface RenumberReport {
  rows: Record<string, number>;
  orphans: Array<{ table: string; kind: IdKind; id: number; count: number }>;
  learned: number;
  ms: number;
}

/** 普通列：[表, 列, 种类, 附加条件] */
const LIVE_COLUMNS: ReadonlyArray<readonly [string, string, IdKind, string?]> = [
  ['store_item', 'goods_id', 'goods'],
  ['restaurant_device', 'goods_id', 'goods'],
  ['equip', 'goods_id', 'goods'],
  ['equip_gem', 'gem_goods_id', 'goods'],
  ['shop_special', 'goods_id', 'goods'],
  ['fund_deposit', 'medal', 'goods'],
  ['effect_source', 'source_id', 'goods', "source_type in ('honor', 'street')"],
  ['cupboard_food', 'foods_id', 'foods'],
  ['market_item', 'foods_id', 'foods'],
  ['yard_plant', 'foods_id', 'foods'],
  ['yard_basket', 'foods_id', 'foods'],
  ['hiphop_day', 'foods_id', 'foods'],
  ['hiphop_tip', 'foods_id', 'foods'],
  ['exchange_order', 'foods_id', 'foods'],
  ['exchange_trade', 'foods_id', 'foods'],
  ['exchange_ref', 'foods_id', 'foods'],
  ['exchange_wallet_food', 'foods_id', 'foods'],
  ['exchange_hold', 'foods_id', 'foods'],
  ['exchange_stock', 'foods_id', 'foods'],
  ['exchange_maker_day', 'foods_id', 'foods'],
  ['takeaway_order', 'cookbook_id', 'cookbooks'],
];
const HISTORY_COLUMNS: ReadonlyArray<readonly [string, string, IdKind, string?]> = [
  ['ledger', 'item_id', 'goods', "kind = 'goods'"],
  ['ledger', 'item_id', 'foods', "kind in ('foods', 'basket')"],
];
/** 带编号的文本：[表, 列, 前缀]（前缀后面是道具编号） */
const TEXT_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ['ledger', 'source', 'gift.'],
  ['stat_daily', 'source', 'gift.'],
  ['daily_counter', 'key', 'renownShop:'],
];
const tuningPaths = (prefix: string): PathRule[] => TUNING_ID_PATHS.map(([p, k]) => [[prefix, ...p], k] as const);
/**
 * JSON 列。key 是唯一键的 SQL 表达式（分批按它排序、写回按它对上），keyType 是它的类型
 * （bigint 列读出来是字符串，写回时显式转换；bar_round 是联合主键，拼成文本）
 */
interface JsonColumn {
  table: string;
  key: string;
  keyType: 'int' | 'bigint' | 'text';
  column: string;
  live: boolean;
  typeColumn?: string;
  opts?: (type: string | null) => Parameters<typeof rewriteIds>[2];
}
const JSON_COLUMNS: readonly JsonColumn[] = [
  { table: 'mail', key: 'id', keyType: 'bigint', column: 'items', live: true },
  { table: 'redeem_code', key: 'id', keyType: 'bigint', column: 'items', live: true },
  { table: 'activity', key: 'id', keyType: 'bigint', column: 'def', live: true },
  { table: 'admin_grant', key: 'id', keyType: 'bigint', column: 'items', live: true },
  { table: 'kuji_pool', key: 'id', keyType: 'bigint', column: 'tiers', live: true },
  { table: 'kuji_pool', key: 'id', keyType: 'bigint', column: 'last', live: true },
  { table: 'restaurant_tables', key: 'rest_id', keyType: 'int', column: 'tables', live: true },
  { table: 'bar_round', key: "rest_id::text || ':' || game", keyType: 'text', column: 'state', live: true },
  {
    table: 'shard_config',
    key: 'shard_id',
    keyType: 'int',
    column: 'override',
    live: true,
    opts: () => ({ paths: tuningPaths('tuning') }),
  },
  {
    table: 'shard_config_history',
    key: 'id',
    keyType: 'bigint',
    column: 'override',
    live: false,
    opts: () => ({ paths: tuningPaths('tuning') }),
  },
  {
    table: 'rest_log',
    key: 'id',
    keyType: 'bigint',
    column: 'params',
    live: false,
    typeColumn: 'type',
    // 交换食材（core/pair 的 exchange 日志）：give / take 是食材
    opts: (type) => (type === 'exchange' ? { keys: { give: 'foods', take: 'foods' } } : {}),
  },
  { table: 'news', key: 'id', keyType: 'bigint', column: 'params', live: false },
  { table: 'audit_log', key: 'id', keyType: 'bigint', column: 'detail', live: false },
  { table: 'income_round', key: 'id', keyType: 'bigint', column: 'drops', live: false },
  { table: 'predict_event', key: 'id', keyType: 'bigint', column: 'params', live: false },
  { table: 'predict_event', key: 'id', keyType: 'bigint', column: 'result_params', live: false },
];

export async function renumber(db: Kysely<DB> | Transaction<DB>, log: (line: string) => void = console.log): Promise<RenumberReport> {
  const t0 = Date.now();
  const report: RenumberReport = { rows: {}, orphans: [], learned: 0, ms: 0 };
  const liveOrphans: string[] = [];
  // 临时对照表（事务结束即删）
  for (const kind of ['goods', 'foods', 'cookbooks'] as const) {
    await sql`create temp table ${sql.id(`rn_${kind}`)} (old int primary key, new int not null) on commit drop`.execute(db);
    const list = [...MAPS[kind]];
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000);
      await sql`insert into ${sql.id(`rn_${kind}`)} (old, new) values ${sql.join(chunk.map(([o, n]) => sql`(${o}, ${n})`))}`.execute(db);
    }
  }
  const where = (cond?: string) => (cond ? sql` and ${sql.raw(cond)}` : sql``);
  const inNew = (kind: IdKind, col: string) => sql`${sql.raw(col)} between ${RANGE[kind][0]} and ${RANGE[kind][1]}`;

  // 1. 普通列：先找查不到对照的旧编号
  for (const [cols, live] of [[LIVE_COLUMNS, true], [HISTORY_COLUMNS, false]] as const) {
    for (const [table, col, kind, cond] of cols) {
      const bad = await sql<{ id: number; n: string }>`
        select ${sql.raw(col)} as id, count(*) as n from ${sql.raw(table)}
        where ${sql.raw(col)} is not null and ${sql.raw(col)} > 0${where(cond)}
          and not ${inNew(kind, col)} and ${sql.raw(col)} not in (select old from ${sql.id(`rn_${kind}`)})
        group by 1`.execute(db);
      for (const b of bad.rows) {
        report.orphans.push({ table: `${table}.${col}`, kind, id: b.id, count: Number(b.n) });
        if (live) liveOrphans.push(`${table}.${col} ${kind} ${b.id} ×${b.n}`);
      }
    }
  }
  if (liveOrphans.length) throw new Error(`renumber: 在用的表里有查不到对照的旧编号：${liveOrphans.join('; ')}`);
  // 持有总数（设计：自检时和迁移前相同）
  const totals = async () =>
    (
      await sql<{ t: string }>`select concat_ws(' ',
        (select count(*) || '/' || coalesce(sum(num), 0) from store_item),
        (select count(*) || '/' || coalesce(sum(num + fridge_num), 0) from cupboard_food),
        (select count(*) || '/' || coalesce(sum(num), 0) from yard_basket),
        (select count(*) || '/' || coalesce(sum(num), 0) from exchange_wallet_food),
        (select count(*) from equip), (select count(*) from restaurant_device)) as t`.execute(db)
    ).rows[0]!.t;
  const totalsBefore = await totals();
  // 2. 普通列：改
  for (const [table, col, kind, cond] of [...LIVE_COLUMNS, ...HISTORY_COLUMNS]) {
    // 附加条件里的列（kind、source_type）只在 t 上有，不用加前缀
    const r = await sql`update ${sql.raw(table)} t set ${sql.raw(col)} = m.new from ${sql.id(`rn_${kind}`)} m
      where t.${sql.raw(col)} = m.old${where(cond)}`.execute(db);
    report.rows[`${table}.${col}${cond ? ` (${cond})` : ''}`] = Number(r.numAffectedRows ?? 0);
  }
  const mg = await sql`update market_guess set foods_ids = (
      select array_agg(coalesce(m.new, u.x) order by u.ord) from unnest(foods_ids) with ordinality u(x, ord)
      left join rn_foods m on m.old = u.x)
    where foods_ids && (select array_agg(old) from rn_foods)`.execute(db);
  report.rows['market_guess.foods_ids'] = Number(mg.numAffectedRows ?? 0);
  // 3. 文本：前缀 + 道具编号
  for (const [table, col, prefix] of TEXT_COLUMNS) {
    const r = await sql`update ${sql.raw(table)} t set ${sql.raw(col)} = ${prefix} || m.new
      from rn_goods m where t.${sql.raw(col)} = ${prefix} || m.old`.execute(db);
    report.rows[`${table}.${col} ${prefix}`] = Number(r.numAffectedRows ?? 0);
  }
  // 4. JSON 列：分批读、改、写回
  for (const c of JSON_COLUMNS) {
    let changed = 0;
    let last: unknown = null;
    for (;;) {
      const rows = await sql<{ k: number | string; t: string | null; v: unknown }>`
        select ${sql.raw(c.key)} as k, ${c.typeColumn ? sql.raw(c.typeColumn) : sql`null`} as t, ${sql.raw(c.column)} as v
        from ${sql.raw(c.table)}
        where ${sql.raw(c.column)} is not null${last === null ? sql`` : sql` and (${sql.raw(c.key)}) > ${String(last)}::${sql.raw(c.keyType)}`}
        order by (${sql.raw(c.key)}) limit ${BATCH}`.execute(db);
      if (rows.rows.length === 0) break;
      last = rows.rows[rows.rows.length - 1]!.k;
      const updates: Array<{ k: number | string; v: string }> = [];
      for (const row of rows.rows) {
        const r = rewriteIds(row.v, MAPS, c.opts?.(row.t) ?? {});
        for (const o of r.orphans) {
          if (c.live) liveOrphans.push(`${c.table}.${c.column} ${c.key}=${row.k} ${o.kind} ${o.id} at ${o.path.join('.')}`);
          const ex = report.orphans.find((x) => x.table === `${c.table}.${c.column}` && x.kind === o.kind && x.id === o.id);
          if (ex) ex.count++;
          else report.orphans.push({ table: `${c.table}.${c.column}`, kind: o.kind, id: o.id, count: 1 });
        }
        if (r.edits.size > 0) updates.push({ k: row.k, v: JSON.stringify(r.value) });
      }
      for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        await sql`update ${sql.raw(c.table)} t set ${sql.raw(c.column)} = v.v::jsonb
          from (values ${sql.join(chunk.map((u) => sql`(${String(u.k)}, ${u.v})`))}) v(k, v)
          where (${sql.raw(c.key.replace(/\b(rest_id|game|id|shard_id)\b/g, 't.$1'))}) = v.k::${sql.raw(c.keyType)}`.execute(db);
      }
      changed += updates.length;
    }
    report.rows[`${c.table}.${c.column}`] = changed;
  }
  if (liveOrphans.length) throw new Error(`renumber: 在用的表里有查不到对照的旧编号：${liveOrphans.join('; ')}`);
  // 5. 学会记录：旧编号位置上的字节搬到新存储位，长度截到 SLOTS
  let before = 0;
  let after = 0;
  let dropped = 0;
  let lastRest = 0;
  for (;;) {
    const rows = await db
      .selectFrom('restaurant_cookbooks')
      .select(['rest_id', 'levels'])
      .where('rest_id', '>', lastRest)
      .orderBy('rest_id')
      .limit(BATCH)
      .execute();
    if (rows.length === 0) break;
    lastRest = rows[rows.length - 1]!.rest_id;
    for (const r of rows) {
      const next = Buffer.alloc(SLOTS);
      for (let i = 0; i < r.levels.length; i++) {
        const b = r.levels[i]!;
        if (b === 0) continue;
        const s = SLOT_OF.get(i);
        if (s === undefined) dropped++;
        else {
          next[s] = b;
          before++;
        }
      }
      after += next.filter((b) => b > 0).length;
      await db.updateTable('restaurant_cookbooks').set({ levels: next }).where('rest_id', '=', r.rest_id).execute();
    }
  }
  if (before !== after) throw new Error(`renumber: 学会的菜 ${before} → ${after}`);
  report.learned = after;
  if (dropped > 0) report.orphans.push({ table: 'restaurant_cookbooks.levels', kind: 'cookbooks', id: 0, count: dropped });
  // 6. 自检：在用的普通列不再有旧号段的编号
  for (const [table, col, kind, cond] of LIVE_COLUMNS) {
    const r = await sql<{ n: string }>`select count(*) as n from ${sql.raw(table)}
      where ${sql.raw(col)} is not null and ${sql.raw(col)} > 0${where(cond)} and not ${inNew(kind, col)}`.execute(db);
    if (Number(r.rows[0]!.n) > 0) throw new Error(`renumber: ${table}.${col} 还有 ${r.rows[0]!.n} 行不在新号段`);
  }
  const totalsAfter = await totals();
  if (totalsAfter !== totalsBefore) throw new Error(`renumber: 持有总数变了 ${totalsBefore} → ${totalsAfter}`);
  report.ms = Date.now() - t0;
  for (const [k, n] of Object.entries(report.rows)) log(`renumber ${k}: ${n}`);
  for (const o of report.orphans) log(`renumber orphan ${o.table} ${o.kind} ${o.id} ×${o.count}`);
  log(`renumber learned ${report.learned}, ${report.ms} ms`);
  return report;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await renumber(db as Kysely<DB>);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
```

（实现时以 Kysely 实际行为为准：`numAffectedRows` 是 `bigint`，用 `Number()`；`sql.raw` 拼的都是上面常量表里的固定表名列名，没有外部输入。各表唯一键的实际类型以建表迁移为准（`kuji_pool.id` 是 bigserial；`bar_round` 主键是 `(rest_id, game)`），对不上的改 `keyType` 并记 Ruling。）

`index.ts` 加 `import * as m0049 from './0049_renumber';` 和 `'0049_renumber': m0049,`。

`apps/server/src/cli/renumber-dry-run.ts`：

```ts
import { createDb } from '../db';
import { renumber } from '../db/migrations/0049_renumber';
import { loadEnv } from '../env';

/**
 * 重新编号只演练（上线前用，docs/deploy.md）：在一个事务里跑迁移 0049 的全部改写和自检，打印报告，然后总是回滚。
 * 在线上数据的副本上跑；直接对线上跑会在几秒到几十秒里锁住要改的行
 */
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
const ROLLBACK = new Error('dry run');
try {
  await db.transaction().execute(async (trx) => {
    await renumber(trx);
    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) throw e;
  console.log('dry run ok（已回滚）');
} finally {
  await db.destroy();
}
```
`tsup.config.ts` 的 `entry` 加 `'cli/renumber-dry-run': 'src/cli/renumber-dry-run.ts',`；`package.json` 加 `"renumber:dry": "tsx --env-file=.env.development src/cli/renumber-dry-run.ts"`。

- [ ] **Step 5：运行，确认通过；全部服务端测试（空库上也要能迁）**

```bash
pnpm -F @dt/server exec vitest run src/db/migrations/0049.test.ts
pnpm -F @dt/server test > "$WS/t6-server.txt" 2>&1; tail -40 "$WS/t6-server.txt"
pnpm -r typecheck
```
Expected: PASS；globalSetup 在空库上迁到 0049 不报错。

- [ ] **Step 6：提交**

```bash
git add apps/server/src/db/migrations/0049_renumber_map.ts apps/server/src/db/migrations/0049_renumber.ts apps/server/src/db/migrations/0049.test.ts apps/server/src/db/migrations/index.ts apps/server/src/cli/renumber-dry-run.ts apps/server/tsup.config.ts apps/server/package.json
git commit -m "feat(server): 迁移 0049——数据库里的道具、食材、菜谱编号换成新编号，含历史记录和学会记录（重新编号 第 4 步）"
```

---

### Task 7：e2e 换号和演练

**Files:**
- Modify: `apps/web/e2e/{bar-games,bar,business,equip,mysterious,takeaway,temple,tower,town,wiki,yard,kuji,hiphop-rank}.spec.ts` 里的旧编号
- Create（不提交）: 演练记录写进 `$WS/rehearsal.md`

**Interfaces:**
- Consumes: Task 2~6 全部

- [ ] **Step 1：e2e 换号**

逐个文件读，按 map.json 换（SQL 插入的编号、接口参数、带编号的 testid、`selectOption`、Wiki 路径）。已知的：
- `bar-games.spec.ts`、`bar.spec.ts`：`values ($1, 1, …)` 的 1 是神秘礼券 → `GOODS` 对照。
- `business.spec.ts`：`[302, 253, 366]`（食材）、`learn-194`（菜谱 194）。
- `equip.spec.ts`：`[goodsId, num]` 列表、`goodsId: 30`。
- `mysterious.spec.ts`：`[162, 1]`、`[165, 1]`（道具）、`[390, 412, 261]`（食材）、`selectOption('165')`。
- `takeaway.spec.ts`：`(263, 1), (108, 1)`（道具）、`(239…), (242…), (250…)`（食材）；`set_byte(levels, 1, 1)` 的第一个 1 是**存储位**：换成南煎丸子（旧菜谱 1）的新存储位（map.json 的 `cookbookSlots` 里 `[1, x]` 的 x），不要当编号换。
- 其余文件用 `grep -nE "goods_id|foods_id|goodsId|foodsId|buy-|basket-store-|learn-|selectOption|/wiki/(goods|foods|cookbooks)/" apps/web/e2e/*.spec.ts`（排除 `_*.spec.ts`）找到后逐个换。
- `wiki.spec.ts` 加一条：打开 `/wiki/goods/1`，地址变成 `/wiki/goods/<神秘礼券的新编号>`，页面显示“神秘礼券”。

- [ ] **Step 2：开发库副本**

开发服务器停掉（可以直接停，见约定）。在 Postgres 容器里复制开发库（开发库本身不动）：

```bash
D=/c/Users/vic11/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe
"$D" exec dt-dev-postgres-1 dropdb -U dt --if-exists dt_renumber
"$D" exec dt-dev-postgres-1 createdb -U dt -T dt dt_renumber
```
Expected: 成功（失败说明还有连接连着 `dt`：按进程树停掉开发服务器的 node 进程再试）。

记录迁移前的数字（写进 `$WS/rehearsal.md`）：

```sql
select 'store', count(*), sum(num) from store_item
union all select 'cupboard', count(*), sum(num + fridge_num) from cupboard_food
union all select 'ledger goods', count(*), sum(delta) from ledger where kind = 'goods'
union all select 'ledger foods', count(*), sum(delta) from ledger where kind in ('foods', 'basket');
select sum(length(replace(encode(levels, 'hex'), '00', ''))) from restaurant_cookbooks; -- 粗看：非零字节（按两位一组数，执行时用 get_byte 循环或在 node 里算更准）
```

- [ ] **Step 3：先只演练，再正式迁移副本**

```bash
cd apps/server
time DATABASE_URL=postgres://dt:dt@localhost:5432/dt_renumber pnpm renumber:dry > "$WS/rehearsal-dry.txt" 2>&1; tail -60 "$WS/rehearsal-dry.txt"
time DATABASE_URL=postgres://dt:dt@localhost:5432/dt_renumber pnpm migrate:dev > "$WS/rehearsal-migrate.txt" 2>&1; tail -60 "$WS/rehearsal-migrate.txt"
```
Expected: 两次都打印各表改了多少行、孤立编号清单、`renumber learned N`；只演练最后一行 `dry run ok（已回滚）`；正式迁移 `migrations applied`。
- 有“在用的表里有查不到对照的旧编号”：停下，查是什么编号（库里有、主表里没有的道具）——问用户怎么处理，不要自己删数据。
- 孤立编号清单里的历史记录项（如已删菜谱的 `krab.happy`）：记进 `$WS/rehearsal.md`，正常。
- 耗时记下来，按开发库行数（流水约 11 万、结算 15 万、日志 2.5 万）估线上停服时长。

迁移后对数：重跑 Step 2 的 SQL，件数、总数一致；`learned` 等于迁移前学会的菜数。抽查：

```sql
select min(goods_id), max(goods_id) from store_item;      -- 都在 10000~89999
select min(foods_id), max(foods_id) from cupboard_food;   -- 都在 1001~9999
select type, params from rest_log where params::text ~ '"(goodsId|foodsId|cookbookId)"' order by id desc limit 20;
select params from news where type in ('market.restock', 'equip.stress', 'shop.special') order by id desc limit 10;
```

- [ ] **Step 4：在副本上跑开发服务器和 e2e**

```bash
DATABASE_URL=postgres://dt:dt@localhost:5432/dt_renumber pnpm dev   # 按 dev-server-detached 的做法独立进程启动
cd apps/web && E2E_DATABASE_URL=postgres://dt:dt@localhost:5432/dt_renumber pnpm exec playwright test > "$WS/rehearsal-e2e.txt" 2>&1; tail -40 "$WS/rehearsal-e2e.txt"
```
Expected: e2e 全部通过（和换号前一样的通过情况；换号前就不稳定的用例对照 main 上的结果）。另写一个临时 `apps/web/e2e/_renumber-check.spec.ts`（不提交）登录一个 e2e 测试号，截图仓库、橱柜、食谱、日志、邮件页，看名字都正常显示（不是“道具 12345”这类兜底名）。

演练完：停掉开发服务器，`dropdb dt_renumber`（自己建的副本，不是开发库），开发服务器照常用开发库启动——**注意**：开发库仍是旧编号，在本分支上启动开发服务器会自动跑迁移 0049 改开发库；本分支合并前不要在开发库上启动本分支的开发服务器，需要时先问用户。

- [ ] **Step 5：提交**

```bash
git add apps/web/e2e/bar-games.spec.ts apps/web/e2e/bar.spec.ts apps/web/e2e/business.spec.ts apps/web/e2e/equip.spec.ts apps/web/e2e/mysterious.spec.ts apps/web/e2e/takeaway.spec.ts apps/web/e2e/wiki.spec.ts
git add <Step 1 改过的其他 e2e 文件，逐个列出，不含 _*.spec.ts>
git commit -m "test(e2e): e2e 脚本换成新编号，Wiki 旧链接跳转（重新编号 第 4 步）"
```

---

### Task 8：上线步骤、更新记录、收尾

**Files:**
- Modify: `docs/deploy.md`（新增“重新编号上线（一次性）”）
- Modify: `apps/web/src/data/changelog.ts`、`apps/web/src/i18n/locales/{zh-CN,en,fr,es}/site.ts`（zh-TW 用 `pnpm i18n:tw` 生成）
- Modify: `packages/config/package.json`（删掉 `renumber-map` 脚本入口；三个一次性脚本留在 `scripts/` 作记录，文件头写明已执行）
- Modify: `docs/backlog.md`（演练里发现、没处理的小问题）

- [ ] **Step 1：上线步骤（`docs/deploy.md`）**

写清楚（演练耗时、孤立编号数从 `$WS/rehearsal.md` 填）：
1. **先演练线上数据**：在别处（本机或服务器上临时容器）恢复最近一次备份到一个新库，用新版本镜像跑 `node dist/cli/renumber-dry-run.js`（`DATABASE_URL` 指向那个库）。报“在用的表里有查不到对照的旧编号”就先处理再上线。记下耗时，按它定停服时长（开发库演练：X 秒）。
2. 提前公告停服时间。
3. 停服：服务器上 `cd /opt/dt/infra && docker compose -f compose.prod.yml stop api worker`。
4. 备份：`./backup.sh`（上传 R2），另在本机留一份 `docker compose -f compose.prod.yml exec -T postgres pg_dump -U dt -d dt -Fc > /opt/dt/renumber-before.dump`。
5. 合并 PR：main 的 CI 通过后自动部署（`deploy.sh` → 先跑 migrate，成功才启动 api、worker）。前端（Cloudflare Pages）同时发布。
6. 看迁移日志：`docker compose -f compose.prod.yml logs migrate`，有 `renumber learned …` 和 `migrations applied`。
7. 迁移失败：事务整体回滚，数据库保持原样，api、worker 不会启动。在 GitHub 上 revert 这个 PR（自动部署旧版本），查清原因再来。
8. 迁移成功但游戏里发现问题：从第 4 步的备份恢复（`pg_restore --clean`），revert PR。
9. 上线后抽查：仓库、橱柜、学会的菜、邮件、活动、个人日志、新闻；Wiki 旧链接 `/wiki/goods/1` 跳到神秘礼券。

- [ ] **Step 2：更新记录**

`changelog.ts` 顶部加 `{ id: 'renumber1005', date: '2026-10-05' },`（日期按实际合并日）。各语言 `site.ts` 加：
- zh-CN：`'道具、食材、菜谱按类别重新编号：游戏资料和开放接口里的编号都换成了新的，旧的资料链接会自动跳到新编号；已有的道具、食材、学会的菜和历史记录都不受影响'`
- en：`'Items, ingredients and recipes have been renumbered by category: IDs in the game wiki and the open API have changed, and old wiki links redirect to the new IDs. Everything you own, every recipe you have learned and your history are unaffected'`
- fr：`'Les objets, ingrédients et recettes ont été renumérotés par catégorie : les identifiants du wiki du jeu et de l’API ouverte ont changé, et les anciens liens du wiki redirigent vers les nouveaux. Vos objets, vos recettes apprises et votre historique ne changent pas'`
- es：`'Objetos, ingredientes y recetas se han renumerado por categoría: los identificadores de la wiki del juego y de la API abierta han cambiado, y los enlaces antiguos de la wiki redirigen a los nuevos. Lo que tienes, las recetas que has aprendido y tu historial no cambian'`

然后 `pnpm exec prettier --write apps/web/src && cd apps/web && pnpm i18n:tw`。

- [ ] **Step 3：一次性脚本收尾**

`packages/config/package.json` 删掉 `"renumber-map"` 一行。`scripts/renumber-map.ts`、`renumber-apply.ts`、`renumber-verify.ts` 文件头第一行后加：`* 已于重新编号 PR 4 执行；主表已是新编号，重跑会报错或跳过，留作记录。`

- [ ] **Step 4：全量检查**

```bash
pnpm -F @dt/shared build && pnpm -F @dt/config build
pnpm -F @dt/config exec vitest run > "$WS/t8-config.txt" 2>&1; tail -10 "$WS/t8-config.txt"
pnpm -F @dt/server test > "$WS/t8-server.txt" 2>&1; tail -10 "$WS/t8-server.txt"
pnpm -F @dt/web test > "$WS/t8-web.txt" 2>&1; tail -10 "$WS/t8-web.txt"
pnpm -r typecheck && pnpm lint && pnpm format:check
```
Expected: 全部通过；`format:check` 只允许已知的三处警告（`问题记录.md`、`e2e/_*.spec.ts`、`apps/web/shots/v100/overflow.json`）。

- [ ] **Step 5：提交**

```bash
git add docs/deploy.md apps/web/src/data/changelog.ts apps/web/src/i18n/locales/zh-CN/site.ts apps/web/src/i18n/locales/en/site.ts apps/web/src/i18n/locales/fr/site.ts apps/web/src/i18n/locales/es/site.ts apps/web/src/i18n/locales/zh-TW/site.ts packages/config/package.json packages/config/scripts/renumber-map.ts packages/config/scripts/renumber-apply.ts packages/config/scripts/renumber-verify.ts
git add docs/backlog.md   # 有新增时
git commit -m "docs: 重新编号的上线步骤和更新记录（重新编号 第 4 步）"
```

---

## 计划自查

- 设计 §6 PR 4 第 1 步（对照表、审阅报告）：c99de89 已完成，用户已审。第 2 步（配置、翻译、默认值、常量、存储位、模拟器和 e2e）：Task 2、3、7。第 3 步（迁移：冻结对照、普通列、学会记录截长、JSON 和文本、自检、回滚）：Task 6。第 4 步（演练、耗时）：Task 7。第 5 步（停服 → 备份 → 迁移 → 启动）：Task 8。
- 设计 §3：主表 `legacyId`、`group`（Task 3）；`sync-data` 不再同步带编号的表（Task 4）；导入按 `legacyId`（Task 4）；配置包带对照（Task 3）；`goods_sources` 按旧编号、工具按 `legacyId` 对上（Task 4）。
- 设计 §5：Wiki 和开放接口旧链接（Task 5）；对照表永久保留（`map.json` 和配置包 `legacy`）。
- 设计 §1.3 第 3 条列的 `weekly_counter` 的 `renownShop:` 键：代码实际写在 `daily_counter`（`modules/tower/common.ts` 的 `KEY.shop`，按周一的日期记），迁移按 `daily_counter` 改。`effect_source` 只有 `honor`、`street` 两类的 `source_id` 是道具。
- 设计未列、清点时补上的：`hiphop_tip.foods_id`、`ledger` 的 `basket` 类、`stat_daily.source`、`kuji_pool.tiers/last`、`bar_round.state`、`restaurant_tables` 以外的 `predict_event.result_params`；`tuningRefs` 漏的 `shop.discardable`（Task 1）。
