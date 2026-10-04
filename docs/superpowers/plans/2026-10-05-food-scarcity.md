# 稀缺食材平衡 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：**
- 食材出现权重向全服需求靠一部分（α = 0.2）；
- 玩家自己抽随机食材时，有一定概率改成本街学菜正缺的食材，概率随幸运升高（问题记录 50、68）。

**Architecture：**
- **配置包**：构建时给每种食材算 `weight`，所有抽食材的池子改用 `weight`；新区服数值 `tuning.scarcity`。
- **服务端**：新增 `core/scarcity.ts`。
  - 纯函数：缺料清单、概率、抽取；
  - `opNeedPick(o)`：一次操作只算一次缺料。
  - 7 类个人来源改用它。
- **快速模拟**：接同一套纯函数，改前、改后各跑一次。

**Tech Stack：** TypeScript、zod、Kysely、Vitest。

**Spec：** `docs/superpowers/specs/2026-10-05-food-scarcity-design.md`

## Global Constraints

- **提交和 PR**：
  - 回复、提交、PR 描述用中文；
  - 提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；
  - PR 描述末尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
- **默认值**：
  - `food_supply.json` 里 `demandBlend` 0.2；
  - `tuning.scarcity` = `{ needBase: 0.05, needLuckFactor: 0.6, needMax: 0.3 }`。
- **权重公式**：同等级里 `weight = odds × (1 − α) + α × 需求份额 × 同级 odds 之和`。
  - 需求份额 = 这种食材在全部菜谱、全部品级里需求数量之和 ÷ 同级所有食材的需求数量之和；
  - 同级没有需求时 `weight = odds`。
- **只换池子**：只有“抽食材用的池子”改用 `weight`。凡是判断“稀有”（`odds < 100`、`odds === 100`）、按 `odds` 算价格和费用的地方一律不动。
- **缺料**：本街每道菜下一品级的需要合计，减去橱柜已有，大于 0 的部分。不算别的街；满级的菜不算。
- **概率**：`p = min(needMax, needBase + max(0, 幸运率) × needLuckFactor)`，幸运率就是现有的 `luckRate(幸运总值)`。
  - 命中时按缺口加权抽；
  - 没命中，或者范围里没有缺料时，照原池子抽。
- **用缺料倾向的来源**：
  - 礼包按等级给的食材；
  - 随机奖励的食材；
  - 随机食材券；
  - 合成；
  - 万能食材换稀有（只挑稀有缺料）；
  - 神殿探险和守护兽；
  - 大胃王。
- **不用缺料倾向的来源**：菜场货架、交易所和系统做市、嘻哈男孩、好友互动。
- **其他**：
  - 改了 `packages/config` 先 `pnpm -F @dt/config build`；
  - 新区服数值必须写 `setting_docs.json`；
  - 不碰菜园，不碰 `问题记录.md`；e2e 临时脚本不提交。
- **文案**：
  - 游玩指引一句：“幸运越高，随机得到的食材越容易是你学菜正缺的那种”，简中、英、法、西，繁中用 `pnpm i18n:tw`；
  - 更新记录加一条（`apps/web/src/data/changelog.ts` + 各语言 `site.changelog`）。

## Review Focus

1. 玩家所在街道的菜全部满级或没有缺料：抽取必须照原池子，不能报错或抽出空。
2. 随机奖励命中缺料时只能给 `min(奖励等级, 5)` 以内的食材，不能给超等级的（例如 3 级奖励给出 5 级长胡椒）。
3. 合成命中缺料时仍然遵守“不抽已经堆满的食材”。缺料本来就没满，但要确认用的是同一个目标等级。
4. 一次开几十个礼包或用几十张券：缺料清单只算一次，不能每抽一次查一次数据库（性能）；抽到的食材不回头改清单，可以接受。
5. 区服把 `needMax` 设成 0：行为和改前一样（只剩全服权重的变化）。

---

## 文件结构

- **配置**：
  - 新建 `packages/config/data/game/food_supply.json`、`packages/config/src/foodSupply.ts`（`foodWeights`）、`foodSupply.test.ts`；
  - 改 `raw.ts`（`foodSupplyFile`）、`source.ts`、`types.ts`（`Food.weight`）、`build.ts`、`runtime.ts`（池子用 `weight`）、`tuning.ts`（`scarcity`）；
  - 数据 `tuning.json`、`setting_docs.json`。
- **服务端**：
  - 新建 `apps/server/src/core/scarcity.ts`、`scarcity.test.ts`；
  - 改 `modules/cupboard/rules.ts`（`composePool` 用 `weight`；`runHandle` 可传抽取函数）、`modules/cupboard/service.ts`；
  - 改 `modules/award/award.ts`、`modules/award/random.ts`、`modules/store/use.ts`、`modules/temple/common.ts`、`modules/temple/guardian.ts`、`modules/town/talk.ts`；
  - 新建 `apps/server/src/modules/cupboard/scarcity.test.ts`（各来源的集成测试）。
- **快速模拟**：改 `apps/server/src/sim/fast/bot.ts`、`ops.ts`。
- **前端**：改 `apps/web/src/data/changelog.ts`、`apps/web/src/i18n/locales/*/site.ts`、`apps/web/src/i18n/locales/*/guide.ts`（指引那一句）。

---

### Task 1: 配置——出现权重和区服数值

**Files:**
- Create: `packages/config/data/game/food_supply.json`、`packages/config/src/foodSupply.ts`、`packages/config/src/foodSupply.test.ts`
- Modify: `packages/config/src/{raw,source,types,build,runtime,tuning}.ts`、`packages/config/data/game/{tuning,setting_docs}.json`

**Interfaces:**
- Produces:
  - `Food.weight: number`（构建后每种食材都有）；
  - `foodWeights(foods, cookbooks, alpha): Map<number, number>`；
  - `Tuning['scarcity']: { needBase: number; needLuckFactor: number; needMax: number }`；
  - `config.foodPools`、`rareFoodPools`、`hotFoodPool`、`masterFoodPool` 按 `weight` 建。

- [ ] **Step 0: 改前先跑一次快速模拟留底**

Run: `pnpm sim:fast --days 30 --bots 20 --seed 1 > <scratchpad>/sim-before.txt`
Expected: 正常输出报告（之后 Task 4 对比用）

- [ ] **Step 1: 写失败测试** `packages/config/src/foodSupply.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { foodWeights } from './foodSupply';
import { defaultDataDir, readSourceDir } from './source';
import type { Cookbook, Food } from './types';

const source = () => readSourceDir(defaultDataDir());
const food = (id: number, level: number, odds: number) => ({ id, level, odds }) as Food;
const book = (needs: Array<[number, number]>) =>
  ({ needFoods: { 1: needs.map(([foodsId, num]) => ({ foodsId, num })) } }) as unknown as Cookbook;

describe('食材出现权重（问题记录 50）', () => {
  it('按公式向需求份额拉 α；同级没有需求时等于 odds；α = 0 时等于 odds', () => {
    const foods = [food(1, 1, 100), food(2, 1, 100), food(3, 2, 50)];
    const books = [book([[1, 3]]), book([[1, 1]])];
    // 1 级 odds 和 200，需求全在 1 号：w1 = 100×0.8 + 0.2×1×200 = 120；w2 = 80
    expect(Object.fromEntries(foodWeights(foods, books, 0.2))).toEqual({ 1: 120, 2: 80, 3: 50 });
    expect(Object.fromEntries(foodWeights(foods, books, 0))).toEqual({ 1: 100, 2: 100, 3: 50 });
  });

  it('真实数据：长胡椒、草鸡蛋的同级份额变大；区服数值默认值', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const share = (name: string) => {
      const f = bundle!.foods.find((x) => x.name === name)!;
      const same = bundle!.foods.filter((x) => x.level === f.level);
      return [f.odds / same.reduce((a, x) => a + x.odds, 0), f.weight / same.reduce((a, x) => a + x.weight, 0)];
    };
    const [p0, p1] = share('长胡椒');
    expect(p0).toBeCloseTo(0.0252, 3);
    expect(p1).toBeCloseTo(0.072, 2);
    const [e0, e1] = share('草鸡蛋');
    expect(e0).toBeCloseTo(0.0157, 3);
    expect(e1).toBeCloseTo(0.051, 2);
    expect(bundle!.tuning.scarcity).toEqual({ needBase: 0.05, needLuckFactor: 0.6, needMax: 0.3 });
  });

  it('检查：α 越界、needBase 大于 needMax 时报错', () => {
    const src = source();
    expect(buildBundle({ ...src, 'game/food_supply': { demandBlend: 1.5 } }).errors.join()).toContain('food_supply');
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.scarcity.needBase = 0.5;
    expect(buildBundle({ ...src, 'game/tuning': t }).errors.join()).toContain('scarcity');
  });
});
```

（`Cookbook` 类型名以 `types.ts` 实际导出的为准。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --project config packages/config/src/foodSupply.test.ts`
Expected: FAIL（`foodSupply` 不存在）

- [ ] **Step 3: 实现**
  - `food_supply.json`：`{ "demandBlend": 0.2 }`。
  - `raw.ts`：

    ```ts
    /** data/game/food_supply.json：食材出现权重向需求靠的比例（问题记录 50） */
    export const foodSupplyFile = z.object({ demandBlend: z.number().min(0).max(1) }).strict();
    ```

  - `source.ts` 在 `'game/fund',` 后登记 `'game/food_supply',`。
  - `foodSupply.ts`：

    ```ts
    import type { Cookbook, Food } from './types';

    /**
     * 食材出现权重（问题记录 50）：同等级里 weight = odds × (1 − α) + α × 需求份额 × 同级 odds 之和；
     * 需求份额按全部菜谱、全部品级要的数量算，同级没有需求时 weight = odds
     */
    export function foodWeights(
      foods: ReadonlyArray<Pick<Food, 'id' | 'level' | 'odds'>>,
      cookbooks: ReadonlyArray<Pick<Cookbook, 'needFoods'>>,
      alpha: number,
    ): Map<number, number> {
      const need = new Map<number, number>();
      for (const c of cookbooks)
        for (const list of Object.values(c.needFoods))
          for (const x of list) need.set(x.foodsId, (need.get(x.foodsId) ?? 0) + x.num);
      const byLevel = new Map<number, Array<Pick<Food, 'id' | 'level' | 'odds'>>>();
      for (const f of foods) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f]);
      const out = new Map<number, number>();
      for (const list of byLevel.values()) {
        const odds = list.reduce((a, f) => a + f.odds, 0);
        const demand = list.reduce((a, f) => a + (need.get(f.id) ?? 0), 0);
        for (const f of list) {
          const share = demand > 0 ? (need.get(f.id) ?? 0) / demand : f.odds / odds;
          out.set(f.id, f.odds * (1 - alpha) + alpha * share * odds);
        }
      }
      return out;
    }
    ```

  - `types.ts` 的 `Food` 加 `/** 抽食材用的出现权重（问题记录 50）；稀有判断仍看 odds */ weight: number;`。
  - `build.ts`：
    - 解析 `const foodSupply = parse('game/food_supply', raw.foodSupplyFile);`，加进“缺文件就停”；
    - 食材先照原样建（`weight: f.odds`）；菜谱建好后用 `foodWeights(foods, cookbooks, foodSupply.demandBlend)` 回填每种食材的 `weight`。变量名以实际代码为准；要在 `bundle.foods` 输出之前回填。
  - `runtime.ts`：
    - `foodPools`、`rareFoodPools`（成员仍按 `odds < 100` 选）、`hotFoodPool`、`masterFoodPool` 的权重函数全改成 `(f) => f.weight`；
    - `hot` 的成员条件不变。
  - `tuning.ts` 在 `fund` 前加：

    ```ts
      /** 个人缺料倾向（问题记录 50、68）：随机食材有 p 的概率改成本街学菜正缺的；p = min(上限, 基础 + 幸运率 × 系数) */
      scarcity: z
        .object({
          needBase: z.number().min(0).max(1),
          needLuckFactor: z.number().min(0),
          needMax: z.number().min(0).max(1),
        })
        .refine((s) => s.needBase <= s.needMax, { message: 'scarcity needBase must not exceed needMax' }),
    ```

  - `tuning.json` 加 `"scarcity": { "needBase": 0.05, "needLuckFactor": 0.6, "needMax": 0.3 }`。
  - `setting_docs.json`：
    - 分组 `tuning.scarcity`：“个人缺料倾向（问题记录 50、68）：玩家自己抽随机食材时，有 p 的概率改成本街学菜正缺的那种，p 随幸运升高；菜场、交易所不受影响”；
    - 三条字段说明：
      - `needBase`：“幸运为 0 时的概率（0~1）”；
      - `needLuckFactor`：“幸运率乘的系数；幸运 100 的幸运率约 0.17、300 是 0.30”；
      - `needMax`：“概率上限（0~1，设成 0 就关掉缺料倾向）”。
  - `cupboard/rules.ts` 的 `composePool` 里 `buildPool(left, (f) => f.odds)` 改成 `(f) => f.weight`。它在服务端，但属于“池子”，和本任务一起改，放在 Task 2 的提交里也可以。

- [ ] **Step 4: 构建并跑测试**

Run: `pnpm -F @dt/config build && npx vitest run --project config && (cd apps/server && npx tsc --noEmit -p .)`
Expected: 全部 PASS。类型报错的测试替身（手写的 `Food` 对象）补 `weight`。

- [ ] **Step 5: 提交**

```bash
git add packages/config apps/server/src/modules/cupboard/rules.ts
git commit -m "feat(config): 食材出现权重向需求靠 20%，新增个人缺料倾向的区服数值（问题记录 50）"
```

---

### Task 2: 服务端——缺料倾向

**Files:**
- Create: `apps/server/src/core/scarcity.ts`、`apps/server/src/core/scarcity.test.ts`、`apps/server/src/modules/cupboard/scarcity.test.ts`
- Modify: `modules/cupboard/{rules,service}.ts`、`modules/award/{award,random}.ts`、`modules/store/use.ts`、`modules/temple/{common,guardian}.ts`、`modules/town/talk.ts`

**Interfaces:**
- Consumes：`Food.weight`、`Tuning['scarcity']`（Task 1）
- Produces（`core/scarcity.ts`）：

```ts
export type NeedMap = ReadonlyMap<number, number>; // 食材 id → 缺口
export function needMapOf(
  ids: readonly number[],
  levels: Uint8Array,
  maxGrade: number,
  needOf: (id: number, grade: number) => ReadonlyArray<{ foodsId: number; num: number }>,
  have: (foodsId: number) => number,
): Map<number, number>;
export function needChance(t: Tuning['scarcity'], luckRate: number): number;
export function pickWithNeed(
  need: NeedMap,
  accept: (foodsId: number) => boolean,
  p: number,
  rng: Rng,
  fallback: () => number,
): number;
export type NeedPick = (accept: (foodsId: number) => boolean, fallback: () => number) => number;
export async function opNeedPick(o: Op): Promise<NeedPick>;
```

- [ ] **Step 1: 写纯函数的失败测试** `core/scarcity.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { needChance, needMapOf, pickWithNeed } from './scarcity';

const t = { needBase: 0.05, needLuckFactor: 0.6, needMax: 0.3 };

describe('缺料清单（问题记录 50）', () => {
  it('本街每道菜下一品级的需要合计，减去已有；满级不算', () => {
    const levels = new Uint8Array([0, 0, 2, 10]);
    const needOf = (id: number, g: number) =>
      id === 1 ? [{ foodsId: 101, num: 2 }] : id === 2 && g === 3 ? [{ foodsId: 101, num: 1 }, { foodsId: 102, num: 3 }] : [{ foodsId: 103, num: 9 }];
    const have = (f: number) => (f === 101 ? 1 : f === 102 ? 5 : 0);
    expect(Object.fromEntries(needMapOf([1, 2, 3], levels, 10, needOf, have))).toEqual({ 101: 2 });
  });
});

describe('缺料概率', () => {
  it('基础 + 幸运率 × 系数，封顶；幸运为负按 0', () => {
    expect(needChance(t, 0)).toBeCloseTo(0.05);
    expect(needChance(t, 0.17)).toBeCloseTo(0.152);
    expect(needChance(t, 2)).toBe(0.3);
    expect(needChance(t, -0.5)).toBeCloseTo(0.05);
  });
});

describe('抽取', () => {
  const need = new Map([[101, 3], [102, 1], [201, 5]]);
  const lv1 = (id: number) => id < 200;
  it('命中时在范围内按缺口加权抽', () => {
    // 第一个随机数判定命中（< p），第二个在 [101×3, 102×1] 里抽：0.8 × 4 = 3.2 → 102
    expect(pickWithNeed(need, lv1, 0.5, sequenceRng([0.1, 0.8]), () => 999)).toBe(102);
    expect(pickWithNeed(need, lv1, 0.5, sequenceRng([0.1, 0.5]), () => 999)).toBe(101);
  });
  it('没命中、p 为 0、范围里没有缺料时走原来的抽法', () => {
    expect(pickWithNeed(need, lv1, 0.5, sequenceRng([0.9]), () => 999)).toBe(999);
    expect(pickWithNeed(need, lv1, 0, sequenceRng([0]), () => 999)).toBe(999);
    expect(pickWithNeed(need, (id) => id > 300, 1, sequenceRng([0]), () => 999)).toBe(999);
    expect(pickWithNeed(new Map(), lv1, 1, sequenceRng([0]), () => 999)).toBe(999);
  });
});
```

（`sequenceRng` 的 `chance(p)` 判定规则以 `packages/shared` 的实现为准；若是 `next() < p`，上面的随机数序列就成立。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/core/scarcity.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `core/scarcity.ts`

```ts
import type { Tuning } from '@dt/config';
import { buildPool, pickWeighted, type Rng } from '@dt/shared';
import { foodsMap } from '../modules/cupboard/foods';
import { levelsOf } from '../modules/takeaway/common';
import { opLuck } from './luck';
import type { Op } from './op';

/** 个人缺料倾向（问题记录 50、68）：设计 docs/superpowers/specs/2026-10-05-food-scarcity-design.md §3 */
export type NeedMap = ReadonlyMap<number, number>;

export function needMapOf(
  ids: readonly number[],
  levels: Uint8Array,
  maxGrade: number,
  needOf: (id: number, grade: number) => ReadonlyArray<{ foodsId: number; num: number }>,
  have: (foodsId: number) => number,
): Map<number, number> {
  const total = new Map<number, number>();
  for (const id of ids) {
    const next = (levels[id] ?? 0) + 1;
    if (next > maxGrade) continue;
    for (const x of needOf(id, next)) total.set(x.foodsId, (total.get(x.foodsId) ?? 0) + x.num);
  }
  const out = new Map<number, number>();
  for (const [id, n] of total) if (n > have(id)) out.set(id, n - have(id));
  return out;
}

export function needChance(t: Tuning['scarcity'], luckRate: number): number {
  return Math.min(t.needMax, t.needBase + Math.max(0, luckRate) * t.needLuckFactor);
}

export function pickWithNeed(
  need: NeedMap,
  accept: (foodsId: number) => boolean,
  p: number,
  rng: Rng,
  fallback: () => number,
): number {
  if (p <= 0 || need.size === 0 || !rng.chance(p)) return fallback();
  const pool = buildPool(
    [...need].filter(([id]) => accept(id)),
    ([, gap]) => gap,
  );
  return pool.total > 0 ? pickWeighted(pool, rng)[0] : fallback();
}

export type NeedPick = (accept: (foodsId: number) => boolean, fallback: () => number) => number;

/** 一次操作里的缺料抽取器：缺料清单和概率只算一次（缓存在 op 上） */
export async function opNeedPick(o: Op): Promise<NeedPick> {
  const hit = o.cache.get('needPick') as NeedPick | undefined;
  if (hit) return hit;
  const p = needChance(o.tuning.scarcity, (await opLuck(o)).rate);
  let need: NeedMap = new Map();
  if (p > 0) {
    const [levels, foods] = await Promise.all([levelsOf(o.tx, o.rest.id), foodsMap(o.tx, o.rest.id)]);
    need = needMapOf(
      o.config.cookbookIndex.idsByStreet.get(o.rest.street_id) ?? [],
      levels,
      o.tuning.rest.cookbookMaxGrade,
      (id, g) => o.config.requireCookbook(id).needFoods[g] ?? [],
      (id) => foods.get(id)?.num ?? 0,
    );
  }
  const pick: NeedPick = (accept, fallback) => pickWithNeed(need, accept, p, o.rng, fallback);
  o.cache.set('needPick', pick);
  return pick;
}
```

注意：`pickWithNeed` 在 `p <= 0` 或没有缺料时不消耗随机数。`need.size > 0` 时会先消耗一次判定。原来依赖固定随机序列的测试可能要调整，调整时在 ledger 记 Ruling。

- [ ] **Step 4: 跑纯函数测试**

Run: `cd apps/server && npx vitest run src/core/scarcity.test.ts`
Expected: PASS

- [ ] **Step 5: 写各来源的失败测试** `modules/cupboard/scarcity.test.ts`

照 `kuji.test.ts` 的头部（`createTestGame`、`newRestaurant`、`createShard`、`setTuning`）。思路：
- 建一个区服，`setTuning(t, shardId, { scarcity: { needBase: 1, needLuckFactor: 0, needMax: 1 } })`，让每次都命中；
- 店在新手街（`patch.street_id` 用实际新手街 id），橱柜空；
- 那么 5 级缺料只有本街菜谱下一品级要的 5 级食材（长胡椒 150）。

```ts
it('随机食材券（5 级）在 p = 1 时全出缺料', async () => { /* 发 93005 ×10 用掉，橱柜里只有长胡椒 */ });
it('随机奖励命中缺料时只给 ≤ min(等级,5) 的食材（Review Focus 2）', async () => { /* randomAward level 3：出的食材等级 ≤ 3，而且是缺料里的 */ });
it('合成命中缺料（Review Focus 3）', async () => { /* 放 4 级食材 ×20 合成到 5 级：出的全是长胡椒 */ });
it('needMax = 0 时和原来一样：同一个随机种子下结果等于不带倾向（Review Focus 5）', async () => { /* 两个区服对比 */ });
it('本街菜全部满级时照常抽，不报错（Review Focus 1）', async () => { /* 把 rest_cookbook 全设到上限再用券 */ });
it('菜场货架不受影响', async () => { /* rollShelf 不经过缺料倾向：区服 p=1 时货架照常（直接调 market 的进货，断言出现非缺料食材） */ });
```

每条用例的具体写法以测试工具的实际函数为准（发道具 `goods`、用道具 `t.game.store.use`、合成 `t.game.cupboard.handle`、随机奖励可在 op 内直接调 `randomAward`，照 `award/random.test.ts`）。断言都写成“结果集合 ⊆ 缺料集合”或“等级不超过”，不写死具体 id 序列。

- [ ] **Step 6: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/modules/cupboard/scarcity.test.ts`
Expected: FAIL（来源还没接）

- [ ] **Step 7: 接各来源**
  - **`award/award.ts`** `pickGiftFood`：数字等级的分支改成

    ```ts
      const lv = Number(item.flag);
      const pool = op.config.foodPools.get(lv);
      if (!pool || pool.total <= 0) return null;
      const pick = await opNeedPick(op);
      return pick((id) => op.config.foods.get(id)?.level === lv, () => pickWeighted(pool, op.rng).id);
    ```

    （函数改成 `async`，调用处补 `await`。）
  - **`award/random.ts`**：食材分支里原来从 `awardFoodsPool` 平均抽一个 `id`。改成

    ```ts
    pick((id) => (o.config.foods.get(id)?.level ?? 99) <= Math.min(level, 5), () => 原来的抽法)
    ```

    命中缺料时可以给稀有食材（68）。
  - **`store/use.ts`** `randomFood`：循环里

    ```ts
    const id = pick((f) => o.config.foods.get(f)?.level === use.level, () => pickWeighted(pool, op.rng).id)
    ```

  - **`cupboard/rules.ts`** `runHandle`：加可选第 4 个参数 `pick?: () => number`，内部两处 `pickWeighted(pool, rng).id` 改成 `(pick ?? (() => pickWeighted(pool, rng).id))()`。
  - **`cupboard/service.ts`**：
    - `handle`（compose）：传

      ```ts
      () => needPick((id) => o.config.foods.get(id)?.level === target, () => pickWeighted(cp, o.rng).id)
      ```

      其中 `cp` 是 `composePool(...)` 的结果；
    - `exchange`（万能食材换稀有）：

      ```ts
      pick((id) => { const f = o.config.foods.get(id); return f?.level === lv && f.odds < 100; }, () => pickWeighted(pool, o.rng).id)
      ```

  - **`temple/common.ts`** `pickFood(o, level)` 改成 `async`，用 `pick((id) => level 相同, 原抽法)`，调用处（`explore.ts`、`guardian.ts`）补 `await`。`guardian.ts` 里直接 `pickWeighted(o.config.foodPools.get(7)!)` 的那处同样包一层。
  - **`town/talk.ts`** 大胃王：

    ```ts
    const id = pick((f) => o.config.foods.get(f)?.level === lv, () => pickWeighted(pool, o.rng).id)
    ```

    后面用 `id`，原来用 `food.id` 的地方改掉。
  - 不改：`market/*`、`exchange/*`、`hiphop/*`、`interact/*`。

- [ ] **Step 8: 跑测试**

Run: `cd apps/server && npx tsc --noEmit -p . && npx vitest run src/core src/modules/cupboard src/modules/award src/modules/store src/modules/temple src/modules/town src/modules/bar src/modules/tower src/modules/market`
Expected: 全部 PASS。原来用固定随机序列的测试，若因为多一次判定而变：在 ledger 写 Ruling，并把断言改成不依赖序列，或在测试区服设 `needMax: 0`。

- [ ] **Step 9: 提交**

```bash
git add apps/server/src/core/scarcity.ts apps/server/src/core/scarcity.test.ts apps/server/src/modules
git commit -m "feat(server): 个人缺料倾向——随机食材有一定概率改成本街学菜正缺的，概率随幸运升高（问题记录 50、68）"
```

---

### Task 3: 快速模拟接上缺料倾向，改前、改后对比

**Files:**
- Modify: `apps/server/src/sim/fast/bot.ts`（随机食材券、合成）、`apps/server/src/sim/fast/ops.ts`（礼包、随机奖励）

**Interfaces:**
- Consumes：`needMapOf`、`needChance`、`pickWithNeed`（Task 2）

- [ ] **Step 1: 写失败测试**：在 `sim/fast/bot.test.ts` 加一条。
  - 设置：机器人在新手街、橱柜空、`tuning.scarcity` 设成 p = 1，用 10 张 5 级随机券；
  - 断言：拿到的 5 级食材都在缺料清单里。
- [ ] **Step 2: 跑测试确认失败**（Run: `cd apps/server && npx vitest run src/sim/fast/bot.test.ts`）
- [ ] **Step 3: 实现**
  - `sim/fast/ops.ts` 加 `needPickOf(c, r)`：
    - 用 `needMapOf(c.config.cookbookIndex.idsByStreet.get(r.streetId) ?? [], r.levels, c.tuning.rest.cookbookMaxGrade, needOf(c), (id) => r.foods.get(id) ?? 0)`；
    - 用 `needChance(c.tuning.scarcity, luckOf(c, r).rate)`；
    - 返回和服务端同形的 `NeedPick`。
  - `bot.ts` 的 `randomFood`、合成，以及 `ops.ts` 的 `pickGiftFood`、随机奖励食材，照 Task 2 的方式包一层。
  - 快速模拟每次调用都重新算缺料清单，代价可以接受；慢的话按 `r.foodsVersion`、`r.levelsVersion` 缓存。
- [ ] **Step 4: 跑测试**（Run: `cd apps/server && npx vitest run src/sim`）Expected: PASS
- [ ] **Step 5: 改后再跑一次模拟，和 Task 1 Step 0 的结果对比**

Run: `pnpm sim:fast --days 30 --bots 20 --seed 1 > <scratchpad>/sim-after.txt`
对比“学会的食谱”等指标和学菜卡住的情况，摘要写进 PR 说明。不反复调参。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/sim
git commit -m "feat(sim): 快速模拟接上缺料倾向（问题记录 50）"
```

---

### Task 4: 前端文案、全量检查、终审、PR

**Files:**
- Modify: `apps/web/src/data/changelog.ts`、`apps/web/src/i18n/locales/{zh-CN,en,fr,es}/site.ts`、游玩指引所在的 locale 文件（`guide.ts`，以实际为准）、`docs/roadmap.md`

- [ ] **Step 1: 更新记录和指引**
  - **`changelog.ts`**：最前面加 `{ id: 'scarcity', date: <合并当天，北京时间> }`。
  - **`site.changelog.scarcity`**：
    - zh-CN：“稀缺食材更容易拿到：长胡椒、草鸡蛋这类菜谱常用的食材出现得更多；随机得到的食材有一定概率是你学菜正缺的，幸运越高越容易”；
    - 英、法、西照意思写。
  - **游玩指引**：在讲幸运或食材的那一段加一句“幸运越高，随机得到的食材越容易是你学菜正缺的那种”（五种语言）。
  - 繁中：`cd apps/web && pnpm i18n:tw`。
- [ ] **Step 2: 跑前端测试**（Run: `npx vitest run --project web`）Expected: PASS（更新记录测试会检查五种语言都有）
- [ ] **Step 3: 全量检查**

```bash
pnpm -F @dt/config build
pnpm lint && pnpm -r typecheck && npx prettier --check apps packages
npx vitest run --project web --project config --project shared
pnpm -F @dt/server test
```

- [ ] **Step 4: 路线图**：50 一行写“本 PR”，68 一并完成。
- [ ] **Step 5: 提交、推送、终审、PR**
  - 派新的审查 agent（最强模型）审整条分支，重点看 Review Focus 五条；
  - 重要问题先写失败测试再修，小问题记 `docs/backlog.md`；
  - 开 PR “稀缺食材平衡（问题记录 50、68）”，PR 说明里放 Task 3 的模拟对比。
