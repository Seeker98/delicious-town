# 子项目 4C-1「酒吧」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能在酒吧用神秘礼券玩划拳、猜酒杯、转数字，用蟹币玩老虎机，用礼券换蟹币；连胜跨请求累计，老虎机有保底；主线第 13 步、支线「玩一次老虎机」「集齐 4 株盆栽」开放。

**Architecture:** 配置包新增老虎机奖池 `slotAwards` / `slotPool` 和 `tuning.bar`；迁移 0011 建 `bar_state`（每店一行，只存当前状态）和 `bar_slot_stat`（按奖项累计格数）。服务端新增公用的随机奖励 `modules/award/random.ts`（4C-2 厨塔也用），和 `modules/bar/`：纯规则 `rules.ts`、状态行 `state.ts`、三个礼券游戏和兑换 `games.ts`、老虎机 `slot.ts`、概览 `view.ts`、装配 `service.ts`（写操作走 `runOp`，功能名 `bar`）、`routes.ts`。任务模块加状态键 `honor.potCount`。前端新增 `/bar` 页（划拳、猜酒杯、转数字、老虎机四个标签）和"更多"页入口。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4c1-bar-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1/bar...` 下，由 `modules/bar/routes.ts` 的 `barRoutes(svc)` 注册
- 酒吧写操作一律走 `runOp`（锁自己的店），功能名 `bar`；读接口开头 `d.shards.ensureFeature(ctx.shardId, 'bar')`
- `bar_state` 行由 `lockBarState(o)` 取：`insert ... on conflict do nothing` 后 `select ... for update`
- 不新增错误码：礼券 / 蟹币不够用 `consumeGoods`（`NOT_ENOUGH goods 1` / `goods 240`）；老虎机没验证邮箱 `EMAIL_NOT_VERIFIED`（403）；转数字的数字 > `tuning.bar.numMax` 报 `VALIDATION_FAILED` reason `num`；出拳、杯号、次数越界由 zod 报 `VALIDATION_FAILED`
- 所有检查在扣除前完成或在同一事务里，失败整体回滚
- 事件键（`emitAction`）：每局 `bar.play` + `bar.fg` / `bar.cup` / `bar.num`（各 1）；老虎机 `bar.play`、`bar.slot`（n = 次数）；兑换蟹币不发事件
- 流水来源：`bar.fg`、`bar.cup`、`bar.num`、`bar.slot`、`bar.exchange`
- 新闻（`opNews`）：`bar.fg` `{times, lucky, award}`、`bar.cup` `{times, lucky}`、`bar.num` `{lucky, award}`、`bar.slot` `{awardId, kind, itemId, num}`（只写入，展示归 4E）
- 道具 id 用现有的 `GOODS.mysteryTicket`(1)、`GOODS.krabCoin`(240)、`GOODS.magicLamp`(389)
- 随机数一律走 `o.rng`；每个函数的随机数顺序写在它的注释里，测试按这个顺序给固定序列（`sequenceRng` 用完后循环）
- 界面文字全部中文；按钮灰掉时写明原因；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交前对改动文件跑 `npx prettier --write`；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 测试命令：`pnpm --filter <包> exec vitest run <路径>`（各包没有 test 脚本）
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build`；`packages/config/data` 被 prettier 忽略，改 JSON 时插入文本块，不整体重写

## 计划层面的裁定（相对设计文档）

1. 猜酒杯的随机奖励也不出神秘礼券（`noTicket`）：原版 `getAwardJson` 对三个酒吧来源（11、12、13）都排除礼券，设计文档 §3.3 漏写。代价：无
2. 随机奖励的经验 / 银币、划拳平局银币在幸运总值为负时按 0 算（`Math.max(0, …)`），不发负数。代价：负幸运的玩家少受一点惩罚
3. 转数字没中时只抽一次随机数：`k = rng.int(numMax − 1)`，`k + 1 ≥ num` 时取 `k + 2`，否则 `k + 1`。和原版"重抽到不相等为止"同分布。代价：无
4. 转数字的返回多一个 `times`（连续中奖 / 连续没中的次数），前端用来写提示（设计文档裁定 8）。代价：无
5. 老虎机每格的随机数：已到强制保底时不抽；否则先抽一个判提前保底，再按权重抽一个。代价：无
6. 随机奖励的物品池、食材池每次现算（按 id 排序后 `rng.int` 取），不进 `GameConfig`：只有 600 条，划拳一次只算一次。代价：无
7. 猜酒杯的杯号只做参数校验，不参与判定（原版也是）；服务函数 `playCup(o)` 不收杯号
8. `task.test.ts` 里"跳过未开放功能"的例子从第 13 步酒吧改为第 27 步厨塔（酒吧开放后第 13 步不再跳过）
9. 模拟器 bot 不加酒吧：bot 不加好友，本来就停在主线第 9 步，不受影响

## Review Focus

1. **老虎机一次请求跨过 300 格保底**：那一格出蟹黄堡，之后 `slot_fail` 从 0 重新计；返回的距离保底是 100。→ Task 7 测试
2. **老虎机抽到食材时橱柜没格子**：进冰箱，不报错；蟹币照扣、统计照记。→ Task 7 测试
3. **猜酒杯连胜后礼券不够下一局**：报 `NOT_ENOUGH`，礼券和连胜都不变（补够礼券还能接着连）。→ Task 6 测试
4. **划拳连胜中间出一次平局**：连胜断掉，下一次胜是 1 连胜、奖励等级回到 2。→ Task 5 测试
5. **蟹币只够抽 1 次**：老虎机"抽 10 次"灰掉并写明原因，"抽 1 次"可用；没验证邮箱时两个都灰掉。→ Task 10 测试

---

## 文件结构

```
packages/config/src/types.ts                 SlotAward；ConfigBundle.slotAwards
packages/config/src/raw.ts                   rawSlotAward
packages/config/src/source.ts                加 dataset/bar_slot_machine_award
packages/config/src/build.ts                 老虎机奖池、保底奖项、酒吧道具校验
packages/config/src/runtime.ts               GameConfig.slotPool / slotAwards
packages/config/src/tuning.ts、data/game/tuning.json   bar 段
packages/config/data/designed/tasks.json     任务 13、108 链接改 /bar
packages/shared/src/schemas/bar.ts           接口 body 和 DTO
packages/shared/src/schemas/bar.test.ts
apps/server/src/db/migrations/0011_bar.ts、0011.test.ts
apps/server/src/db/schema.ts                 2 张表类型
apps/server/src/core/features.ts             'bar'
apps/server/src/modules/award/random.ts      随机奖励（公用）
apps/server/src/modules/award/random.test.ts
apps/server/src/modules/bar/
  rules.ts            纯规则
  rules.test.ts
  common.ts           badInput、resultDto
  state.ts            lockBarState、saveBarState
  games.ts            划拳、猜酒杯、转数字、兑换蟹币
  slot.ts             老虎机
  view.ts             barView
  service.ts          createBarService
  routes.ts           barRoutes
  fg.test.ts          划拳、概览、功能开关、主线第 13 步、活跃
  games.test.ts       猜酒杯、转数字、兑换
  slot.test.ts        老虎机、支线 108
apps/server/src/modules/task/service.ts      状态键 honor.potCount
apps/server/src/modules/task/task.test.ts    跳过例子改第 27 步；集盆栽支线
apps/server/src/modules/index.ts、game.ts    注册
apps/web/src/api/endpoints.ts                bar 接口
apps/web/src/components/bar/
  award.ts            awardText、HANDS、NUM_HINTS
  award.test.ts
  testData.ts         barData
  FgPanel.vue、CupPanel.vue、NumPanel.vue、SlotPanel.vue（各带 .test.ts）
apps/web/src/views/BarView.vue、BarView.test.ts
apps/web/src/router.ts                       /bar
apps/web/src/views/MoreView.vue、MoreView.test.ts   酒吧入口
apps/web/e2e/bar.spec.ts
docs/rules/收益与加成.md、docs/deploy.md
```

---

### Task 1: 配置——老虎机奖池、tuning.bar、任务链接

**Files:**
- Modify: `packages/config/src/types.ts`（`IncomeAction` 后面；`ConfigBundle`）
- Modify: `packages/config/src/raw.ts`（`rawIncomeAction` 后面）
- Modify: `packages/config/src/source.ts`
- Modify: `packages/config/src/build.ts`
- Modify: `packages/config/src/runtime.ts`
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`
- Modify: `packages/config/data/designed/tasks.json`
- Test: `packages/config/src/build.test.ts`、`packages/config/src/runtime.test.ts`

**Interfaces:**
- Produces:
  - `interface SlotAward { id: number; kind: 'empty' | 'foods' | 'goods'; itemId: number | null; odds: number; rare: boolean; getNum: number; news: boolean }`
  - `ConfigBundle.slotAwards: SlotAward[]`
  - `GameConfig.slotPool: WeightedPool<SlotAward>`、`GameConfig.slotAwards: ReadonlyMap<number, SlotAward>`
  - `Tuning['bar']`：`fgWinRate, fgDrawRate, fgNewsStreak, cupNewsStreak, numMax, numCost, numLuckDiv, numAwardLevel, krabCoinTickets, slotCells, slotFloorSpins, slotFloorRate, slotFloorAwardId, awardRates: { foods, goods, coin, exp }`

- [ ] **Step 1: 写失败的测试**

在 `packages/config/src/build.test.ts` 末尾追加：

```ts
describe('酒吧配置（子项目 4C-1）', () => {
  it('老虎机奖池 22 项：空格、食材、道具，稀有和新闻标记', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const s = bundle!.slotAwards;
    expect(s).toHaveLength(22);
    expect(s.reduce((x, a) => x + a.odds, 0)).toBe(19553);
    expect(s.find((a) => a.id === 0)).toEqual({
      id: 0,
      kind: 'empty',
      itemId: null,
      odds: 15000,
      rare: false,
      getNum: 1,
      news: false,
    });
    expect(s.find((a) => a.id === 1)).toMatchObject({ kind: 'foods', itemId: 326, odds: 720 });
    expect(s.find((a) => a.id === 100)).toEqual({
      id: 100,
      kind: 'goods',
      itemId: 180,
      odds: 12,
      rare: true,
      getNum: 1,
      news: true,
    });
    expect(s.filter((a) => a.rare).map((a) => a.id)).toEqual([100]);
    expect(s.filter((a) => a.news).map((a) => a.id)).toEqual([11, 19, 21, 99, 100]);
  });

  it('任务 13、108 链接到 /bar', () => {
    const { bundle } = buildBundle(source());
    for (const id of [13, 108]) expect(bundle!.tasks.find((t) => t.id === id)!.href).toBe('/bar');
  });

  it('老虎机奖项引用了不存在的食材', () => {
    const src = source();
    const awards = structuredClone(src['dataset/bar_slot_machine_award']) as Array<{
      id: number;
      foodsId: number | null;
    }>;
    awards.find((a) => a.id === 1)!.foodsId = 999999;
    const { errors } = buildBundle({ ...src, 'dataset/bar_slot_machine_award': awards });
    expect(errors).toContain('bar_slot_machine_award 1 references unknown food 999999');
  });

  it('保底奖项不在奖池里', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { bar: { slotFloorAwardId: number } };
    tuning.bar.slotFloorAwardId = 555;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.bar.slotFloorAwardId 555 not in slot awards');
  });
});
```

在 `packages/config/src/runtime.test.ts` 末尾追加：

```ts
describe('酒吧索引（子项目 4C-1）', () => {
  it('老虎机奖池按 odds 抽、按 id 索引；tuning.bar', () => {
    expect(config.slotPool.total).toBe(19553);
    expect(config.slotPool.items).toHaveLength(22);
    expect(config.slotAwards.get(100)).toMatchObject({ kind: 'goods', itemId: 180, rare: true });
    expect(config.tuning.bar).toMatchObject({
      fgWinRate: 0.25,
      numCost: 8,
      numMax: 25,
      krabCoinTickets: 100,
      slotCells: 3,
      slotFloorSpins: 100,
      slotFloorAwardId: 100,
      awardRates: { foods: 0.25, goods: 0.15, coin: 0.3, exp: 0.3 },
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts src/runtime.test.ts`
Expected: FAIL——`bundle.slotAwards` 是 undefined（`toHaveLength` 报错）、任务 13 的 href 是 `/town/bar`、`config.slotPool` 是 undefined

- [ ] **Step 3: 类型和原始结构**

`packages/config/src/types.ts`：在 `ConfigBundle` 的 `incomeActions: IncomeAction[];` 下面加一行：

```ts
  slotAwards: SlotAward[];
```

在 `export interface IncomeAction { ... }` 整个定义的后面加：

```ts
/** 老虎机奖项（dataset/bar_slot_machine_award；子项目 4C-1）。库存、过期日不做（设计文档裁定 4） */
export interface SlotAward {
  id: number;
  kind: 'empty' | 'foods' | 'goods';
  /** 食材或道具 id；空格为 null */
  itemId: number | null;
  odds: number;
  rare: boolean;
  /** 每格给几个 */
  getNum: number;
  news: boolean;
}
```

`packages/config/src/raw.ts`：在 `export const rawIncomeAction = ...;` 整个定义的后面加：

```ts
export const rawSlotAward = z.object({
  id: int,
  /** 0 空、1 食材、2 道具 */
  type: int,
  goodsId: int.nullish(),
  foodsId: int.nullish(),
  odds: int,
  rareflag: int,
  getNum: int,
  newsflag: int,
});
```

`packages/config/src/source.ts`：在 `'dataset/market_guess_foods',` 下面加一行：

```ts
  'dataset/bar_slot_machine_award',
```

- [ ] **Step 4: 数值段**

`packages/config/src/tuning.ts`：在 `yard: z.object({ ... }),` 整段之后、`});` 之前加：

```ts
  bar: z.object({
    fgWinRate: num,
    fgDrawRate: num,
    fgNewsStreak: int.min(1),
    cupNewsStreak: int.min(1),
    numMax: int.min(2),
    numCost: int.min(1),
    numLuckDiv: num,
    numAwardLevel: int.min(1),
    krabCoinTickets: int.min(1),
    slotCells: int.min(1),
    slotFloorSpins: int.min(1),
    slotFloorRate: num,
    slotFloorAwardId: int,
    awardRates: z.object({ foods: num, goods: num, coin: num, exp: num }),
  }),
```

`packages/config/data/game/tuning.json`：把文件末尾的

```
      "dryStartRate": 0.002, "dryStartGrassRate": 0.008, "wormRate": 0.003
    }
  }
}
```

改成

```
      "dryStartRate": 0.002, "dryStartGrassRate": 0.008, "wormRate": 0.003
    }
  },
  "bar": {
    "fgWinRate": 0.25, "fgDrawRate": 0.25, "fgNewsStreak": 5,
    "cupNewsStreak": 4,
    "numMax": 25, "numCost": 8, "numLuckDiv": 20, "numAwardLevel": 10,
    "krabCoinTickets": 100,
    "slotCells": 3, "slotFloorSpins": 100, "slotFloorRate": 0.0000016, "slotFloorAwardId": 100,
    "awardRates": { "foods": 0.25, "goods": 0.15, "coin": 0.3, "exp": 0.3 }
  }
}
```

`packages/config/data/designed/tasks.json`：两处 `"href": "/town/bar"`（任务 13 和 108）都改成 `"href": "/bar"`（Edit 用 replace_all）。

- [ ] **Step 5: 构建和校验**

`packages/config/src/build.ts`：

1. `import type { ... } from './types';` 里加 `SlotAward`（按字母序插入）。
2. 在 `const incomeRaw = parse('designed/income_action', z.array(raw.rawIncomeAction));` 下面加：

```ts
  const slotRaw = parse('dataset/bar_slot_machine_award', z.array(raw.rawSlotAward));
```

3. 在空值检查的 `!incomeRaw ||` 下面加一行 `!slotRaw ||`。
4. 在 `for (const g of goods) { if (g.deviceType === 80 && ...` 那个肥料校验循环之后加：

```ts
  // ---------- 酒吧（子项目 4C-1） ----------
  const SLOT_KINDS = ['empty', 'foods', 'goods'] as const;
  const slotAwards: SlotAward[] = [];
  for (const a of slotRaw) {
    const kind = SLOT_KINDS[a.type];
    if (kind === undefined) {
      errors.push(`bar_slot_machine_award ${a.id} has unknown type ${a.type}`);
      continue;
    }
    const itemId = kind === 'foods' ? (a.foodsId ?? null) : kind === 'goods' ? (a.goodsId ?? null) : null;
    if (kind === 'foods' && (itemId === null || !foodIds.has(itemId)))
      errors.push(`bar_slot_machine_award ${a.id} references unknown food ${itemId}`);
    if (kind === 'goods' && (itemId === null || !goodsIds.has(itemId)))
      errors.push(`bar_slot_machine_award ${a.id} references unknown goods ${itemId}`);
    slotAwards.push({
      id: a.id,
      kind,
      itemId,
      odds: a.odds,
      rare: a.rareflag === 1,
      getNum: a.getNum,
      news: a.newsflag === 1,
    });
  }
  unique(
    'bar_slot_machine_award',
    slotAwards.map((a) => a.id),
  );
  if (!slotAwards.some((a) => a.id === tuning.bar.slotFloorAwardId && a.kind !== 'empty'))
    errors.push(`tuning.bar.slotFloorAwardId ${tuning.bar.slotFloorAwardId} not in slot awards`);
  // 神秘礼券、蟹币、神灯（GOODS.mysteryTicket / krabCoin / magicLamp）
  for (const id of [1, 240, 389]) if (!goodsIds.has(id)) errors.push(`bar references unknown goods ${id}`);
```

5. 在 `const body: Omit<ConfigBundle, 'version'> = {` 里 `incomeActions,` 下面加一行 `slotAwards,`。

`packages/config/src/runtime.ts`：

1. `import type { ... } from './types';` 里加 `SlotAward`。
2. `GameConfig` 接口里 `readonly fertilizers: ReadonlyMap<number, number>;` 下面加：

```ts
  /** 老虎机奖池（按 odds 抽，含空格） */
  readonly slotPool: WeightedPool<SlotAward>;
  readonly slotAwards: ReadonlyMap<number, SlotAward>;
```

3. `return { ... }` 里 `fertilizers,` 下面加：

```ts
    slotPool: buildPool(bundle.slotAwards, (a) => a.odds),
    slotAwards: byId(bundle.slotAwards),
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts src/runtime.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/config build`
Expected: 成功，无报错

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write packages/config/src/types.ts packages/config/src/raw.ts packages/config/src/source.ts packages/config/src/build.ts packages/config/src/runtime.ts packages/config/src/tuning.ts packages/config/src/build.test.ts packages/config/src/runtime.test.ts
git add packages/config
git commit -m "feat(config): bar slot awards, tuning.bar, task links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0011、表类型

**Files:**
- Create: `apps/server/src/db/migrations/0011_bar.ts`
- Create: `apps/server/src/db/migrations/0011.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Modify: `apps/server/src/db/schema.ts`

**Interfaces:**
- Produces: 表 `bar_state`、`bar_slot_stat`；类型 `BarStateTable`、`BarSlotStatTable`、`BarStateRow`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/db/migrations/0011.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

const newRest = async () => createRestaurantRow(db, shard, await createAccountRow(db));

describe('迁移 0011', () => {
  it('每店一行；默认结果为空、次数 0；slot_fail 不能为负；结果只能是 -1~1', async () => {
    const a = await newRest();
    await db.insertInto('bar_state').values({ rest_id: a }).execute();
    expect(
      await db.selectFrom('bar_state').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({
      rest_id: a,
      fg_result: null,
      fg_times: 0,
      cup_result: null,
      cup_times: 0,
      num_result: null,
      num_times: 0,
      slot_fail: 0,
    });
    await expect(db.insertInto('bar_state').values({ rest_id: a }).execute()).rejects.toThrow();
    const b = await newRest();
    await expect(db.insertInto('bar_state').values({ rest_id: b, slot_fail: -1 }).execute()).rejects.toThrow();
    await expect(db.insertInto('bar_state').values({ rest_id: b, fg_result: 2 }).execute()).rejects.toThrow();
  });

  it('统计按（店, 奖项）唯一、数量不能为负；删店级联', async () => {
    const a = await newRest();
    await db.insertInto('bar_state').values({ rest_id: a }).execute();
    await db.insertInto('bar_slot_stat').values({ rest_id: a, award_id: 0, num: 3 }).execute();
    await expect(
      db.insertInto('bar_slot_stat').values({ rest_id: a, award_id: 0, num: 1 }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('bar_slot_stat').values({ rest_id: a, award_id: 1, num: -1 }).execute(),
    ).rejects.toThrow();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    expect(await db.selectFrom('bar_state').select('rest_id').where('rest_id', '=', a).execute()).toEqual([]);
    expect(
      await db.selectFrom('bar_slot_stat').select('rest_id').where('rest_id', '=', a).execute(),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0011.test.ts`
Expected: FAIL——类型检查不影响 vitest，运行时报 `relation "bar_state" does not exist`

- [ ] **Step 3: 迁移**

`apps/server/src/db/migrations/0011_bar.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table bar_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      fg_result smallint check (fg_result between -1 and 1),
      fg_times integer not null default 0 check (fg_times >= 0),
      cup_result smallint check (cup_result between -1 and 1),
      cup_times integer not null default 0 check (cup_times >= 0),
      num_result smallint check (num_result between -1 and 1),
      num_times integer not null default 0 check (num_times >= 0),
      slot_fail integer not null default 0 check (slot_fail >= 0)
    )`,
    sql`create table bar_slot_stat (
      rest_id integer not null references restaurant(id) on delete cascade,
      award_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, award_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['bar_slot_stat', 'bar_state']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts`：在 `import * as m0010 from './0010_yard';` 下面加 `import * as m0011 from './0011_bar';`，在 `'0010_yard': m0010,` 下面加 `'0011_bar': m0011,`。

`apps/server/src/db/schema.ts`：在 `RestFormulaTable` 接口定义之后加：

```ts
/** 酒吧（子项目 4C-1）：每店一行，只存三个游戏的上一局结果（1 胜 / 0 平 / -1 负）和连续次数，老虎机连续没出稀有的格数 */
export interface BarStateTable {
  rest_id: number;
  fg_result: number | null;
  fg_times: Default<number>;
  cup_result: number | null;
  cup_times: Default<number>;
  num_result: number | null;
  num_times: Default<number>;
  slot_fail: Default<number>;
}

/** 老虎机统计：每个奖项（含空格 0）累计格数 */
export interface BarSlotStatTable {
  rest_id: number;
  award_id: number;
  num: number;
}
```

`DB` 接口里 `rest_formula: RestFormulaTable;` 下面加：

```ts
  bar_state: BarStateTable;
  bar_slot_stat: BarSlotStatTable;
```

在 `export type YardPlantRow = Selectable<YardPlantTable>;` 下面加：

```ts
export type BarStateRow = Selectable<BarStateTable>;
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0011.test.ts`
Expected: PASS（2 个测试）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/db/migrations/0011_bar.ts apps/server/src/db/migrations/0011.test.ts apps/server/src/db/migrations/index.ts apps/server/src/db/schema.ts
git add apps/server/src/db
git commit -m "feat(server): migration 0011 bar state and slot stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 随机奖励（公用）

**Files:**
- Create: `apps/server/src/modules/award/random.ts`
- Test: `apps/server/src/modules/award/random.test.ts`

**Interfaces:**
- Consumes: `Tuning['bar'].awardRates`（Task 1）
- Produces:
  - `type RandomAwardKind = 'foods' | 'goods' | 'coin' | 'exp'`
  - `interface RandomAward { kind: RandomAwardKind; id: number | null; num: number; lucky: boolean }`（和 Task 5 的 `BarAwardDto` 结构相同）
  - `awardKindOf(r: number, luckRate: number, level: number, rates: Record<RandomAwardKind, number>): RandomAwardKind`
  - `awardExp(luckSum: number, level: number, equipFlag: number): number`
  - `awardGoodsPool(goods: readonly Goods[], level: number, equipFlag: number, noTicket: boolean): number[]`
  - `awardFoodsPool(foods: readonly Food[], level: number): number[]`
  - `randomAward(o: Op, opts: { level: number; equipFlag?: number; onlyGoods?: boolean; noTicket?: boolean; source?: string }): Promise<RandomAward>`——随机数顺序：类型（`onlyGoods` 时没有）→ 幸运翻倍（物品、食材）→ 抽取（物品、食材）

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/award/random.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS, GOODS_TYPE } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { awardExp, awardFoodsPool, awardGoodsPool, awardKindOf, randomAward } from './random';

const config = testConfig();
const rates = { foods: 0.25, goods: 0.15, coin: 0.3, exp: 0.3 };

describe('awardKindOf（规格书 00 §0.8）', () => {
  it('幸运 0、等级 2：起点 −0.00002，依次是食材、物品、银币、经验，超出算食材', () => {
    expect(awardKindOf(0, 0, 2, rates)).toBe('foods');
    expect(awardKindOf(0.24997, 0, 2, rates)).toBe('foods');
    expect(awardKindOf(0.24999, 0, 2, rates)).toBe('goods');
    expect(awardKindOf(0.39999, 0, 2, rates)).toBe('coin');
    expect(awardKindOf(0.69999, 0, 2, rates)).toBe('exp');
    expect(awardKindOf(0.99999, 0, 2, rates)).toBe('foods');
  });

  it('幸运率让起点更低：0.2499 在幸运率 0.3 时已经是物品', () => {
    expect(awardKindOf(0.2499, 0, 1, rates)).toBe('foods');
    expect(awardKindOf(0.2499, 0.3, 1, rates)).toBe('goods');
  });
});

describe('awardExp', () => {
  it('(50 + 幸运总值) × 等级 × (厨具档 + 1)；幸运总值很低时不为负（计划裁定 2）', () => {
    expect(awardExp(0, 2, 0)).toBe(100);
    expect(awardExp(100, 3, 1)).toBe(900);
    expect(awardExp(-80, 2, 0)).toBe(0);
  });
});

describe('物品池、食材池', () => {
  it('物品池：非厨具的奖励等级在 [等级−4, 等级]；noTicket 去掉神秘礼券；厨具只在厨具档 ≥ 奖励等级时出现', () => {
    const p2 = awardGoodsPool(config.bundle.goods, 2, 0, false);
    expect(p2).toHaveLength(8);
    expect(p2).toContain(GOODS.mysteryTicket);
    expect(awardGoodsPool(config.bundle.goods, 2, 0, true)).toEqual(p2.filter((id) => id !== 1));
    for (const id of awardGoodsPool(config.bundle.goods, 10, 0, false)) {
      const g = config.requireGoods(id);
      expect(g.type).not.toBe(GOODS_TYPE.equip);
      expect(g.awardFlag!).toBeGreaterThanOrEqual(6);
      expect(g.awardFlag!).toBeLessThanOrEqual(10);
    }
    const withEquip = awardGoodsPool(config.bundle.goods, 2, 1, false);
    const equips = withEquip.filter((id) => config.requireGoods(id).type === GOODS_TYPE.equip);
    expect(equips.length).toBeGreaterThan(0);
    for (const id of equips) expect(config.requireGoods(id).awardFlag).toBe(1);
    expect(awardGoodsPool(config.bundle.goods, 100, 0, false)).toEqual([]);
  });

  it('食材池：权重 100、等级 ≤ min(等级, 5)，按 id 排序', () => {
    expect(awardFoodsPool(config.bundle.foods, 1)).toHaveLength(16);
    expect(awardFoodsPool(config.bundle.foods, 2)).toHaveLength(77);
    expect(awardFoodsPool(config.bundle.foods, 9)).toHaveLength(171);
    const p = awardFoodsPool(config.bundle.foods, 5);
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });
});

describe('randomAward（发放）', () => {
  let t: TestGame;
  let rngValues: number[] = [0.5];
  beforeAll(async () => {
    t = await createTestGame({ rng: () => sequenceRng(rngValues) });
  });
  afterAll(() => t.close());
  const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
    runOp(t.game.deps, ctx, { feature: 'store', source: 'test' }, fn);

  it('银币 = 经验 × 2；经验', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.5];
    expect((await run(ctx, (o) => randomAward(o, { level: 2 }))).data).toEqual({
      kind: 'coin',
      id: null,
      num: 200,
      lucky: false,
    });
    rngValues = [0.8];
    expect((await run(ctx, (o) => randomAward(o, { level: 2 }))).data).toEqual({
      kind: 'exp',
      id: null,
      num: 100,
      lucky: false,
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 200, exp: 100 });
  });

  it('物品：从池里按 rng.int 取，noTicket 时池里没有礼券', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.3, 0.9, 0];
    const pool = awardGoodsPool(config.bundle.goods, 2, 0, true);
    const r = await run(ctx, (o) => randomAward(o, { level: 2, noTicket: true }));
    expect(r.data).toEqual({ kind: 'goods', id: pool[0], num: 1, lucky: false });
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBe(1);
  });

  it('食材：幸运率 0.3 时随机数 0.2 让数量翻倍、标记幸运', async () => {
    const ctx = await newRestaurant(t, { patch: { luck: 300 } });
    rngValues = [0.1, 0.2, 0];
    const pool = awardFoodsPool(config.bundle.foods, 2);
    const r = await run(ctx, (o) => randomAward(o, { level: 2 }));
    expect(r.data).toEqual({ kind: 'foods', id: pool[0], num: 2, lucky: true });
    expect((await foodNum(t, ctx.restaurantId, pool[0]!)).num).toBe(2);
    expect(r.events).toContainEqual(expect.objectContaining({ kind: 'foods', id: pool[0], lucky: true }));
  });

  it('onlyGoods：不抽类型，直接从奖励等级 10 的物品池取', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.9, 0.99];
    const pool = awardGoodsPool(config.bundle.goods, 10, 0, true);
    const r = await run(ctx, (o) => randomAward(o, { level: 10, onlyGoods: true, noTicket: true }));
    expect(r.data).toEqual({ kind: 'goods', id: pool[pool.length - 1], num: 1, lucky: false });
  });

  it('物品池空时改发银币', async () => {
    const ctx = await newRestaurant(t);
    rngValues = [0.5];
    const r = await run(ctx, (o) => randomAward(o, { level: 100, onlyGoods: true }));
    expect(r.data).toEqual({ kind: 'coin', id: null, num: 10_000, lucky: false });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(10_000);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/award/random.test.ts`
Expected: FAIL——`Failed to resolve import "./random"`

- [ ] **Step 3: 实现**

`apps/server/src/modules/award/random.ts`：

```ts
import { GOODS, GOODS_TYPE, type Food, type Goods } from '@dt/config';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { gainCoin, gainExp } from '../../core/resources';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';

export type RandomAwardKind = 'foods' | 'goods' | 'coin' | 'exp';
const KINDS: readonly RandomAwardKind[] = ['foods', 'goods', 'coin', 'exp'];

export interface RandomAward {
  kind: RandomAwardKind;
  /** 物品或食材 id；银币、经验为 null */
  id: number | null;
  num: number;
  /** 物品、食材因幸运数量翻倍 */
  lucky: boolean;
}

export interface RandomAwardOptions {
  level: number;
  /** 厨具档：物品池里放进奖励等级 ≤ 它的厨具；经验、银币 × (厨具档 + 1) */
  equipFlag?: number;
  onlyGoods?: boolean;
  /** 酒吧的奖励不出神秘礼券 */
  noTicket?: boolean;
  source?: string;
}

/** 奖励类型（规格书 00 §0.8）：起点 −(幸运率/1000 + 等级/100000)，依次累加食材、物品、银币、经验；都没中是食材 */
export function awardKindOf(
  r: number,
  luckRate: number,
  level: number,
  rates: Record<RandomAwardKind, number>,
): RandomAwardKind {
  let acc = -(luckRate / 1000 + level / 100000);
  for (const k of KINDS) {
    acc += rates[k];
    if (r < acc) return k;
  }
  return 'foods';
}

/** 经验 = (50 + 幸运总值) × 等级 × (厨具档 + 1)，不为负（计划裁定 2）；银币是它的 2 倍 */
export function awardExp(luckSum: number, level: number, equipFlag: number): number {
  return Math.max(0, 50 + luckSum) * level * (equipFlag + 1);
}

/** 物品池：非厨具且 等级−4 ≤ 奖励等级 ≤ 等级，或厨具且奖励等级 ≤ 厨具档；按 id 排序 */
export function awardGoodsPool(
  goods: readonly Goods[],
  level: number,
  equipFlag: number,
  noTicket: boolean,
): number[] {
  return goods
    .filter((g) => {
      if (g.awardFlag === null) return false;
      if (noTicket && g.id === GOODS.mysteryTicket) return false;
      return g.type === GOODS_TYPE.equip
        ? g.awardFlag <= equipFlag
        : g.awardFlag >= level - 4 && g.awardFlag <= level;
    })
    .map((g) => g.id)
    .sort((a, b) => a - b);
}

/** 食材池：权重 100（普通食材）且等级 ≤ min(等级, 5)；按 id 排序 */
export function awardFoodsPool(foods: readonly Food[], level: number): number[] {
  const max = Math.min(level, 5);
  return foods
    .filter((f) => f.odds === 100 && f.level <= max)
    .map((f) => f.id)
    .sort((a, b) => a - b);
}

/**
 * 随机奖励（规格书 00 §0.8），当场发放。
 * 随机数顺序：类型（onlyGoods 时没有）→ 幸运翻倍（物品、食材）→ 抽取（物品、食材）。物品池空时改发银币
 */
export async function randomAward(o: Op, opts: RandomAwardOptions): Promise<RandomAward> {
  const { level } = opts;
  const equipFlag = opts.equipFlag ?? 0;
  const luck = await opLuck(o);
  const gain = { source: opts.source };
  const coinOrExp = (kind: 'coin' | 'exp'): RandomAward => {
    const exp = awardExp(luck.sum, level, equipFlag);
    const num = kind === 'coin' ? exp * 2 : exp;
    if (kind === 'coin') gainCoin(o, num, gain);
    else gainExp(o, num, gain);
    return { kind, id: null, num, lucky: false };
  };

  const kind = opts.onlyGoods ? 'goods' : awardKindOf(o.rng.next(), luck.rate, level, o.tuning.bar.awardRates);
  if (kind === 'coin' || kind === 'exp') return coinOrExp(kind);
  const lucky = o.rng.next() < luck.rate;
  const num = lucky ? 2 : 1;
  if (kind === 'goods') {
    const pool = awardGoodsPool(o.config.bundle.goods, level, equipFlag, opts.noTicket ?? false);
    if (pool.length === 0) return coinOrExp('coin');
    const id = pool[o.rng.int(pool.length)]!;
    await grantGoodsOp(o, id, num, { ...gain, lucky });
    return { kind, id, num, lucky };
  }
  const pool = awardFoodsPool(o.config.bundle.foods, level);
  const id = pool[o.rng.int(pool.length)]!;
  await addFoods(o, id, num, { ...gain, lucky });
  return { kind, id, num, lucky };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/award/random.test.ts`
Expected: PASS（10 个测试）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/award/random.ts apps/server/src/modules/award/random.test.ts
git add apps/server/src/modules/award
git commit -m "feat(server): shared random award

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 酒吧纯规则

**Files:**
- Create: `apps/server/src/modules/bar/rules.ts`
- Test: `apps/server/src/modules/bar/rules.test.ts`

**Interfaces:**
- Consumes: `Tuning['bar']`（Task 1）
- Produces（全部纯函数，`BarTuning = Tuning['bar']`）：
  - `type BarResult = 1 | 0 | -1`
  - `fgOutcome(r: number, luckRate: number, t: BarTuning): BarResult`
  - `barHand(hand: number, result: BarResult): number`
  - `nextTimes(prev: BarResult | null, prevTimes: number, result: BarResult): number`
  - `fgAwardLevel(times: number): number`
  - `cupRound(prev: BarResult | null, prevTimes: number): number`
  - `cupWinRate(n: number, luckRate: number): number`
  - `numWinRate(luckRate: number, t: BarTuning): number`
  - `numMissValue(num: number, k: number): number`
  - `type NumHint = 'close' | 'soft' | 'hard'`、`numHint(num: number, barNum: number): NumHint`
  - `slotForced(fail: number, t: BarTuning): boolean`、`slotFloorRate(fail: number, lamp: boolean, t: BarTuning): number`、`slotFloorLeft(fail: number, t: BarTuning): number`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/bar/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import {
  barHand,
  cupRound,
  cupWinRate,
  fgAwardLevel,
  fgOutcome,
  nextTimes,
  numHint,
  numMissValue,
  numWinRate,
  slotFloorLeft,
  slotFloorRate,
  slotForced,
} from './rules';

const t = testConfig().tuning.bar;

describe('划拳（设计文档 §3.2）', () => {
  it('幸运 0：< 0.25 胜、< 0.5 平、其余负', () => {
    expect(fgOutcome(0, 0, t)).toBe(1);
    expect(fgOutcome(0.2499, 0, t)).toBe(1);
    expect(fgOutcome(0.25, 0, t)).toBe(0);
    expect(fgOutcome(0.4999, 0, t)).toBe(0);
    expect(fgOutcome(0.5, 0, t)).toBe(-1);
  });

  it('幸运率 0.1：胜到 0.35、平到 0.7', () => {
    expect(fgOutcome(0.34, 0.1, t)).toBe(1);
    expect(fgOutcome(0.36, 0.1, t)).toBe(0);
    expect(fgOutcome(0.69, 0.1, t)).toBe(0);
    expect(fgOutcome(0.71, 0.1, t)).toBe(-1);
  });

  it('服务器出拳：胜 (h+1)%3、平 h、负 (h+2)%3', () => {
    expect([0, 1, 2].map((h) => barHand(h, 1))).toEqual([1, 2, 0]);
    expect([0, 1, 2].map((h) => barHand(h, 0))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((h) => barHand(h, -1))).toEqual([2, 0, 1]);
  });

  it('连续次数：和上一局相同 +1，否则 1；奖励等级 2 + ⌊连胜/3⌋', () => {
    expect(nextTimes(null, 0, 1)).toBe(1);
    expect(nextTimes(1, 4, 1)).toBe(5);
    expect(nextTimes(1, 4, 0)).toBe(1);
    expect(nextTimes(-1, 2, -1)).toBe(3);
    expect([1, 2, 3, 5, 6].map(fgAwardLevel)).toEqual([2, 2, 3, 3, 4]);
  });
});

describe('猜酒杯（设计文档 §3.3）', () => {
  it('第几连 = 上一局赢了 ? 上一局连胜 + 1 : 1；胜率 = (1 + 幸运率)/(n + 1)', () => {
    expect(cupRound(null, 0)).toBe(1);
    expect(cupRound(1, 3)).toBe(4);
    expect(cupRound(-1, 5)).toBe(1);
    expect(cupWinRate(1, 0)).toBe(0.5);
    expect(cupWinRate(3, 0.2)).toBeCloseTo(0.3, 10);
  });
});

describe('转数字（设计文档 §3.4）', () => {
  it('胜率 = 1/25 + 幸运率/20', () => {
    expect(numWinRate(0, t)).toBeCloseTo(0.04, 10);
    expect(numWinRate(0.2, t)).toBeCloseTo(0.05, 10);
  });

  it('没中时的数字：k 映射到 1~25 里除猜的数以外的 24 个数（计划裁定 3）', () => {
    expect(numMissValue(13, 0)).toBe(1);
    expect(numMissValue(13, 11)).toBe(12);
    expect(numMissValue(13, 12)).toBe(14);
    expect(numMissValue(1, 0)).toBe(2);
    expect(numMissValue(25, 23)).toBe(24);
    for (let num = 1; num <= 25; num++) {
      const vs = Array.from({ length: 24 }, (_, k) => numMissValue(num, k));
      expect(new Set(vs).size).toBe(24);
      for (const v of vs) {
        expect(v).not.toBe(num);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(25);
      }
    }
  });

  it('提示：差 < 3 差一丝丝、< 5 轻一点、其他力气太大', () => {
    expect(numHint(13, 15)).toBe('close');
    expect(numHint(13, 10)).toBe('soft');
    expect(numHint(13, 17)).toBe('soft');
    expect(numHint(13, 18)).toBe('hard');
  });
});

describe('老虎机（设计文档 §3.5）', () => {
  it('⌊fail/3⌋ ≥ 100 强制保底；提前保底率 = fail × 0.0000016，神灯翻倍；距离保底次数', () => {
    expect(slotForced(299, t)).toBe(false);
    expect(slotForced(300, t)).toBe(true);
    expect(slotFloorRate(100, false, t)).toBeCloseTo(0.00016, 12);
    expect(slotFloorRate(100, true, t)).toBeCloseTo(0.00032, 12);
    expect(slotFloorLeft(0, t)).toBe(100);
    expect(slotFloorLeft(5, t)).toBe(99);
    expect(slotFloorLeft(299, t)).toBe(1);
    expect(slotFloorLeft(300, t)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/rules.test.ts`
Expected: FAIL——`Failed to resolve import "./rules"`

- [ ] **Step 3: 实现**

`apps/server/src/modules/bar/rules.ts`：

```ts
import type { Tuning } from '@dt/config';

export type BarTuning = Tuning['bar'];
/** 1 胜 / 0 平 / -1 负（bar_state 的 *_result 列） */
export type BarResult = 1 | 0 | -1;

/** 划拳：先判胜、再判平（规格书 10 §10.1） */
export function fgOutcome(r: number, luckRate: number, t: BarTuning): BarResult {
  const win = t.fgWinRate + luckRate;
  if (r < win) return 1;
  if (r < win + t.fgDrawRate + luckRate) return 0;
  return -1;
}

/** 服务器出拳（0 石头、1 剪刀、2 布）：胜 (h+1)%3，平 h，负 (h+2)%3 */
export function barHand(hand: number, result: BarResult): number {
  return result === 1 ? (hand + 1) % 3 : result === 0 ? hand : (hand + 2) % 3;
}

/** 连续次数：和上一局结果相同 +1，否则 1 */
export function nextTimes(prev: BarResult | null, prevTimes: number, result: BarResult): number {
  return prev === result ? prevTimes + 1 : 1;
}

/** 划拳胜利的奖励等级 = 2 + ⌊连胜 / 3⌋ */
export function fgAwardLevel(times: number): number {
  return 2 + Math.floor(times / 3);
}

/** 猜酒杯这一局是第几连（也是要花的礼券数）：上一局赢了是上一局连胜 + 1，否则 1 */
export function cupRound(prev: BarResult | null, prevTimes: number): number {
  return prev === 1 ? prevTimes + 1 : 1;
}

/** 猜酒杯胜率 = (1 + 幸运率) / (n + 1) */
export function cupWinRate(n: number, luckRate: number): number {
  return (1 + luckRate) / (n + 1);
}

/** 转数字胜率 = 1/numMax + 幸运率/numLuckDiv */
export function numWinRate(luckRate: number, t: BarTuning): number {
  return 1 / t.numMax + luckRate / t.numLuckDiv;
}

/** 没中时转到的数字：k ∈ [0, numMax−1) 映射到 1~numMax 里除 num 以外的数（计划裁定 3） */
export function numMissValue(num: number, k: number): number {
  const v = k + 1;
  return v >= num ? v + 1 : v;
}

export type NumHint = 'close' | 'soft' | 'hard';

/** 差 < 3 "差一丝丝"、< 5 "轻一点"、其他"力气太大" */
export function numHint(num: number, barNum: number): NumHint {
  const d = Math.abs(num - barNum);
  return d < 3 ? 'close' : d < 5 ? 'soft' : 'hard';
}

/** 连续没出稀有的格数达到 slotFloorSpins 次（每次 slotCells 格）时强制保底 */
export function slotForced(fail: number, t: BarTuning): boolean {
  return Math.floor(fail / t.slotCells) >= t.slotFloorSpins;
}

/** 提前保底率 = fail × slotFloorRate × (神灯 ? 2 : 1) */
export function slotFloorRate(fail: number, lamp: boolean, t: BarTuning): number {
  return fail * t.slotFloorRate * (lamp ? 2 : 1);
}

/** 距离强制保底还剩几次 */
export function slotFloorLeft(fail: number, t: BarTuning): number {
  return Math.max(0, t.slotFloorSpins - Math.floor(fail / t.slotCells));
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/rules.test.ts`
Expected: PASS（9 个测试）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/bar/rules.ts apps/server/src/modules/bar/rules.test.ts
git add apps/server/src/modules/bar
git commit -m "feat(server): bar rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 服务骨架——接口 DTO、概览、划拳、路由、功能、主线第 13 步

**Files:**
- Create: `packages/shared/src/schemas/bar.ts`、`packages/shared/src/schemas/bar.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/bar/common.ts`、`state.ts`、`view.ts`、`games.ts`、`service.ts`、`routes.ts`
- Create: `apps/server/src/modules/bar/fg.test.ts`
- Modify: `apps/server/src/core/features.ts`、`apps/server/src/game.ts`、`apps/server/src/modules/index.ts`
- Modify: `apps/server/src/modules/task/task.test.ts:37-42`

**Interfaces:**
- Consumes: Task 1 的 `GameConfig.slotPool` / `slotAwards`、`Tuning['bar']`；Task 2 的 `bar_state`、`bar_slot_stat`、`BarStateRow`；Task 3 的 `randomAward`、`RandomAward`；Task 4 的规则函数
- Produces:
  - `@dt/shared`：`barFgBody`、`barCupBody`、`barNumBody`、`barSlotBody`、`barExchangeBody`；`BarResultDto`、`BarAwardDto`、`BarGameDto`、`SlotAwardDto`、`BarDto`、`FgResultDto`、`CupResultDto`、`NumResultDto`、`SlotResultDto`、`BarExchangeResultDto`
  - `modules/bar/common.ts`：`badInput(reason: string): AppError`、`resultDto(r: number | null): BarResultDto | null`
  - `modules/bar/state.ts`：`lockBarState(o: Op): Promise<BarStateRow>`、`saveBarState(o: Op, patch: BarStatePatch): Promise<void>`
  - `modules/bar/view.ts`：`barView(db, config, rest, t: BarTuning, now: Date): Promise<BarDto>`
  - `modules/bar/games.ts`：`playFg(o: Op, hand: number): Promise<FgResultDto>`；内部 `played(o, game)`
  - `createBarService(d)`：`overview(ctx)`、`fg(ctx, {hand})`；`BarService`
  - `barRoutes(svc)`：`GET /bar`、`POST /bar/fg`
  - `game.bar`

- [ ] **Step 1: 写失败的 body 测试**

`packages/shared/src/schemas/bar.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { barCupBody, barExchangeBody, barFgBody, barNumBody, barSlotBody } from './bar';

describe('酒吧接口 body', () => {
  it('出拳 0~2、杯号 1~3、数字 1~99（上限由服务端按 numMax 再查）、次数和兑换数量 1~99 的整数', () => {
    expect(barFgBody.safeParse({ hand: 2 }).success).toBe(true);
    expect(barFgBody.safeParse({ hand: 3 }).success).toBe(false);
    expect(barCupBody.safeParse({ cup: 0 }).success).toBe(false);
    expect(barCupBody.safeParse({ cup: 3 }).success).toBe(true);
    expect(barNumBody.safeParse({ num: 0 }).success).toBe(false);
    expect(barNumBody.safeParse({ num: 26 }).success).toBe(true);
    expect(barSlotBody.safeParse({ times: 99 }).success).toBe(true);
    expect(barSlotBody.safeParse({ times: 100 }).success).toBe(false);
    expect(barExchangeBody.safeParse({ num: 1.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/shared exec vitest run src/schemas/bar.test.ts`
Expected: FAIL——`Failed to resolve import "./bar"`

- [ ] **Step 3: 接口 body 和 DTO**

`packages/shared/src/schemas/bar.ts`：

```ts
import { z } from 'zod';

const times = z.number().int().min(1).max(99);
/** 0 石头、1 剪刀、2 布 */
export const barFgBody = z.object({ hand: z.number().int().min(0).max(2) });
export const barCupBody = z.object({ cup: z.number().int().min(1).max(3) });
/** 上限由服务端按 tuning.bar.numMax 再查 */
export const barNumBody = z.object({ num: times });
export const barSlotBody = z.object({ times });
export const barExchangeBody = z.object({ num: times });

export type BarResultDto = 'win' | 'draw' | 'lose';

/** 随机奖励（规格书 00 §0.8） */
export interface BarAwardDto {
  kind: 'foods' | 'goods' | 'coin' | 'exp';
  /** 物品或食材 id；银币、经验为 null */
  id: number | null;
  num: number;
  /** 物品、食材因幸运数量翻倍 */
  lucky: boolean;
}

export interface BarGameDto {
  /** 上一局结果；没玩过为 null */
  result: BarResultDto | null;
  /** 上一局结果连续出现的次数 */
  times: number;
}

export interface SlotAwardDto {
  id: number;
  kind: 'empty' | 'foods' | 'goods';
  itemId: number | null;
  /** 每格抽中的概率 */
  rate: number;
  rare: boolean;
}

export interface BarDto {
  tickets: number;
  krabCoins: number;
  fg: BarGameDto;
  /** nextCost：下一局要几张礼券 */
  cup: BarGameDto & { nextCost: number };
  num: BarGameDto & { cost: number; max: number };
  slot: {
    emailVerified: boolean;
    /** 持有有效神灯（提前保底率翻倍） */
    lamp: boolean;
    /** 距离保底还剩几次 */
    floorLeft: number;
    pool: SlotAwardDto[];
    /** 我的统计：每个奖项累计格数（含空格 id 0），按奖项 id 排序 */
    stats: Array<{ awardId: number; num: number }>;
  };
  /** 多少张礼券换 1 个蟹币 */
  krabCoinTickets: number;
}

export interface FgResultDto {
  result: BarResultDto;
  /** 对方出的拳 */
  barHand: number;
  times: number;
  lucky: boolean;
  /** 平局得到的银币 */
  coin: number;
  award: BarAwardDto | null;
}

export interface CupResultDto {
  win: boolean;
  /** 这一局花的礼券 */
  cost: number;
  /** 猜对：当前连胜；猜错：连错次数 */
  times: number;
  lucky: boolean;
  award: BarAwardDto | null;
}

export interface NumResultDto {
  win: boolean;
  /** 转到的数字；中奖时等于猜的数 */
  barNum: number;
  hint: 'close' | 'soft' | 'hard' | null;
  /** 连续中奖 / 连续没中的次数（计划裁定 4） */
  times: number;
  lucky: boolean;
  award: BarAwardDto | null;
}

export interface SlotResultDto {
  /** 每次 3 格的奖项 id */
  spins: number[][];
  /** 合并后的奖励（不含空格），按奖项 id 排序 */
  rewards: Array<{ awardId: number; kind: 'foods' | 'goods'; itemId: number; num: number }>;
  krabCoins: number;
  floorLeft: number;
}

export interface BarExchangeResultDto {
  krabCoins: number;
  tickets: number;
}
```

`packages/shared/src/index.ts` 末尾加一行：

```ts
export * from './schemas/bar';
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/shared exec vitest run src/schemas/bar.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败的服务测试**

`apps/server/src/modules/bar/fg.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('划拳（设计文档 §3.2）', () => {
  it('胜：扣 1 张礼券；对方出 (h+1)%3；奖励等级 2 → 银币 200；连胜跨请求累计，第 3 连奖励等级 3', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 10 } });
    rngValues = [0.1, 0.5]; // 胜；随机奖励类型 = 银币
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toEqual({
      result: 'win',
      barHand: 1,
      times: 1,
      lucky: false,
      coin: 0,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
    });
    await t.game.bar.fg(ctx, { hand: 2 });
    expect((await t.game.bar.fg(ctx, { hand: 1 })).data).toMatchObject({
      result: 'win',
      barHand: 2,
      times: 3,
      award: { kind: 'coin', num: 300 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(7);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(700);
  });

  it('平：银币 = 餐厅等级 × 10 + 幸运总值，对方出同样的拳；负：对方出克制的拳；结果变了从 1 开始计', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 3 }, goods: { 1: 5 } });
    rngValues = [0.3];
    expect((await t.game.bar.fg(ctx, { hand: 2 })).data).toEqual({
      result: 'draw',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 30,
      award: null,
    });
    expect((await t.game.bar.fg(ctx, { hand: 2 })).data).toMatchObject({ result: 'draw', times: 2 });
    rngValues = [0.9];
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toEqual({
      result: 'lose',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 0,
      award: null,
    });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(60);
  });

  it('连胜中间出一次平局：连胜断掉，下一次胜是 1 连胜、奖励等级回到 2（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    rngValues = [0.1, 0.5];
    await t.game.bar.fg(ctx, { hand: 0 });
    await t.game.bar.fg(ctx, { hand: 0 });
    rngValues = [0.3];
    await t.game.bar.fg(ctx, { hand: 0 });
    expect((await t.game.bar.overview(ctx)).fg).toEqual({ result: 'draw', times: 1 });
    rngValues = [0.1, 0.5];
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toMatchObject({
      result: 'win',
      times: 1,
      award: { kind: 'coin', num: 200 },
    });
  });

  it('幸运：幸运 300（幸运率 0.3）时 0.4 也胜，标记幸运；银币按幸运总值算', async () => {
    const ctx = await newRestaurant(t, { patch: { luck: 300 }, goods: { 1: 1 } });
    rngValues = [0.4, 0.5];
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toMatchObject({
      result: 'win',
      lucky: true,
      award: { kind: 'coin', num: 1400 },
    });
  });

  it('连胜 5 发新闻 bar.fg', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    rngValues = [0.1, 0.5];
    for (let i = 0; i < 4; i++) await t.game.bar.fg(ctx, { hand: 0 });
    expect(await newsOf(ctx.restaurantId)).toEqual([]);
    await t.game.bar.fg(ctx, { hand: 0 });
    const news = await newsOf(ctx.restaurantId);
    expect(news.map((n) => n.type)).toEqual(['bar.fg']);
    expect(news[0]!.params).toMatchObject({ times: 5, lucky: false, award: { kind: 'coin' } });
  });

  it('礼券不够报 NOT_ENOUGH goods 1，什么都不变', async () => {
    const ctx = await newRestaurant(t);
    await expect(t.game.bar.fg(ctx, { hand: 0 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 1, need: 1 },
    });
    expect(await t.db.selectFrom('bar_state').selectAll().where('rest_id', '=', ctx.restaurantId).execute()).toEqual(
      [],
    );
  });

  it('计活跃"酒吧娱乐"；主线第 13 步「去酒吧玩一次划拳」不再跳过，玩一次完成', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 13, level: 5 }, goods: { 1: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 13, key: 'bar.fg', done: false });
    rngValues = [0.9];
    await t.game.bar.fg(ctx, { hand: 0 });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 13, progress: 1, done: true });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(1);
  });
});

describe('酒吧概览', () => {
  it('礼券、蟹币、三个游戏的上一局、猜酒杯下一局花费、老虎机保底和奖池', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 3, 240: 2 } });
    const v = await t.game.bar.overview(ctx);
    expect(v).toMatchObject({
      tickets: 3,
      krabCoins: 2,
      fg: { result: null, times: 0 },
      cup: { result: null, times: 0, nextCost: 1 },
      num: { result: null, times: 0, cost: 8, max: 25 },
      slot: { emailVerified: false, lamp: false, floorLeft: 100, stats: [] },
      krabCoinTickets: 100,
    });
    expect(v.slot.pool).toHaveLength(22);
    expect(v.slot.pool.find((a) => a.id === 100)).toEqual({
      id: 100,
      kind: 'goods',
      itemId: 180,
      rate: 12 / 19553,
      rare: true,
    });
    rngValues = [0.1, 0.5];
    await t.game.bar.fg(ctx, { hand: 0 });
    expect((await t.game.bar.overview(ctx)).fg).toEqual({ result: 'win', times: 1 });
  });

  it('区服关闭 bar：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { bar: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.bar.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.bar.fg(ctx, { hand: 0 })).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/fg.test.ts`
Expected: FAIL——`Cannot read properties of undefined (reading 'fg')` / `'overview'`（`t.game.bar` 不存在）

- [ ] **Step 7: 公用小件和状态行**

`apps/server/src/modules/bar/common.ts`：

```ts
import { ErrorCode, type BarResultDto } from '@dt/shared';
import { AppError } from '../../http/errors';

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** bar_state 的 1 / 0 / -1 → 'win' / 'draw' / 'lose' */
export function resultDto(r: number | null): BarResultDto | null {
  return r === null ? null : r === 1 ? 'win' : r === 0 ? 'draw' : 'lose';
}
```

`apps/server/src/modules/bar/state.ts`：

```ts
import type { Op } from '../../core/op';
import type { BarStateRow } from '../../db/schema';

export type BarStatePatch = Partial<Omit<BarStateRow, 'rest_id'>>;

/** 取本店的酒吧状态行并锁住；第一次玩时先插入（整个操作已经锁了店） */
export async function lockBarState(o: Op): Promise<BarStateRow> {
  await o.tx
    .insertInto('bar_state')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('bar_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export async function saveBarState(o: Op, patch: BarStatePatch): Promise<void> {
  await o.tx.updateTable('bar_state').set(patch).where('rest_id', '=', o.rest.id).execute();
}
```

- [ ] **Step 8: 概览**

`apps/server/src/modules/bar/view.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import type { BarDto } from '@dt/shared';
import type { DB, RestaurantRow } from '../../db/schema';
import { resultDto } from './common';
import { cupRound, slotFloorLeft, type BarResult, type BarTuning } from './rules';

export async function barView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: BarTuning,
  now: Date,
): Promise<BarDto> {
  const s = await db.selectFrom('bar_state').selectAll().where('rest_id', '=', rest.id).executeTakeFirst();
  const items = await db
    .selectFrom('store_item')
    .select(['goods_id', 'num', 'expires_at'])
    .where('rest_id', '=', rest.id)
    .where('goods_id', 'in', [GOODS.mysteryTicket, GOODS.krabCoin, GOODS.magicLamp])
    .execute();
  const have = (id: number) => {
    const r = items.find((x) => x.goods_id === id);
    return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
  };
  const acc = await db
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', rest.account_id)
    .executeTakeFirstOrThrow();
  const stats = await db
    .selectFrom('bar_slot_stat')
    .select(['award_id', 'num'])
    .where('rest_id', '=', rest.id)
    .orderBy('award_id')
    .execute();
  const cupResult = (s?.cup_result ?? null) as BarResult | null;
  const total = config.slotPool.total;
  return {
    tickets: have(GOODS.mysteryTicket),
    krabCoins: have(GOODS.krabCoin),
    fg: { result: resultDto(s?.fg_result ?? null), times: s?.fg_times ?? 0 },
    cup: {
      result: resultDto(cupResult),
      times: s?.cup_times ?? 0,
      nextCost: cupRound(cupResult, s?.cup_times ?? 0),
    },
    num: { result: resultDto(s?.num_result ?? null), times: s?.num_times ?? 0, cost: t.numCost, max: t.numMax },
    slot: {
      emailVerified: acc.email_verified_at !== null,
      lamp: have(GOODS.magicLamp) > 0,
      floorLeft: slotFloorLeft(s?.slot_fail ?? 0, t),
      pool: config.slotPool.items.map((a) => ({
        id: a.id,
        kind: a.kind,
        itemId: a.itemId,
        rate: a.odds / total,
        rare: a.rare,
      })),
      stats: stats.map((x) => ({ awardId: x.award_id, num: x.num })),
    },
    krabCoinTickets: t.krabCoinTickets,
  };
}
```

- [ ] **Step 9: 划拳**

`apps/server/src/modules/bar/games.ts`：

```ts
import { GOODS } from '@dt/config';
import type { FgResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opLuck } from '../../core/luck';
import { opNews, type Op } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { randomAward, type RandomAward } from '../award/random';
import { consumeGoods } from '../store/goods';
import { resultDto } from './common';
import { barHand, fgAwardLevel, fgOutcome, nextTimes, type BarResult } from './rules';
import { lockBarState, saveBarState } from './state';

/** 每局都计活跃"酒吧娱乐"（action_map：bar.play）和本游戏的计数 */
async function played(o: Op, game: 'fg' | 'cup' | 'num'): Promise<void> {
  await emitAction(o, 'bar.play');
  await emitAction(o, `bar.${game}`);
}

/** 划拳（设计文档 §3.2）。随机数顺序：胜平负 → 随机奖励 */
export async function playFg(o: Op, hand: number): Promise<FgResultDto> {
  const t = o.tuning.bar;
  await consumeGoods(o, GOODS.mysteryTicket, 1);
  const s = await lockBarState(o);
  const luck = await opLuck(o);
  const r = o.rng.next();
  const result = fgOutcome(r, luck.rate, t);
  const times = nextTimes(s.fg_result as BarResult | null, s.fg_times, result);
  await saveBarState(o, { fg_result: result, fg_times: times });
  const lucky = result === 1 && r >= t.fgWinRate;
  let coin = 0;
  let award: RandomAward | null = null;
  if (result === 1) {
    award = await randomAward(o, { level: fgAwardLevel(times), noTicket: true });
    if (times >= t.fgNewsStreak) opNews(o, 'bar.fg', { times, lucky, award });
  } else if (result === 0) {
    coin = Math.max(0, o.rest.level * 10 + luck.sum);
    gainCoin(o, coin);
  }
  await played(o, 'fg');
  return { result: resultDto(result)!, barHand: barHand(hand, result), times, lucky, coin, award };
}
```

- [ ] **Step 10: 服务、路由、注册**

`apps/server/src/modules/bar/service.ts`：

```ts
import type { BarDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { playFg } from './games';
import { barView } from './view';

export function createBarService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'bar', source }, fn);

  return {
    async overview(ctx: RestCtx): Promise<BarDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'bar');
      const rest = await d.db
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      return barView(d.db, d.config, rest, s.tuning.bar, d.now());
    },
    fg(ctx: RestCtx, b: { hand: number }) {
      return op(ctx, 'bar.fg', (o) => playFg(o, b.hand));
    },
  };
}

export type BarService = ReturnType<typeof createBarService>;
```

`apps/server/src/modules/bar/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { barFgBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { BarService } from './service';

export function barRoutes(svc: BarService): FastifyPluginAsync {
  return async (r) => {
    r.get('/bar', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/bar/fg', async (req) => okOp(await svc.fg(restCtxOf(req), parse(barFgBody, req.body))));
  };
}
```

`apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 里 `'yard',` 下面加 `'bar',`。

`apps/server/src/game.ts`：
- 在 `import { createYardService, type YardService } from './modules/yard/service';` 下面加 `import { createBarService, type BarService } from './modules/bar/service';`
- `Game` 接口里 `yard: YardService;` 下面加 `bar: BarService;`
- 返回对象里 `yard: createYardService(deps),` 下面加 `bar: createBarService(deps),`

`apps/server/src/modules/index.ts`：
- 在 `import { yardRoutes } from './yard/routes';` 下面加 `import { barRoutes } from './bar/routes';`
- 在 `app.register(yardRoutes(game.yard), { prefix: '/api/v1' });` 下面加 `app.register(barRoutes(game.bar), { prefix: '/api/v1' });`

- [ ] **Step 11: 改"跳过未开放功能"的例子（计划裁定 8）**

`apps/server/src/modules/task/task.test.ts` 第 37~42 行整个 `it(...)` 换成：

```ts
  it('跳过未开放的功能（设计文档 裁定 7）：第 27 步厨塔跳到第 28 步开垦菜园', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 27, level: 5 } });
    const list = await task().tasks(ctx);
    expect(list.mainStep).toBe(28);
    expect(list.main).toMatchObject({ step: 28, key: 'yard.lands', done: false });
  });
```

- [ ] **Step 12: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/fg.test.ts src/modules/task/task.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 13: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write packages/shared/src/schemas/bar.ts packages/shared/src/schemas/bar.test.ts packages/shared/src/index.ts apps/server/src/modules/bar apps/server/src/core/features.ts apps/server/src/game.ts apps/server/src/modules/index.ts apps/server/src/modules/task/task.test.ts
git add packages/shared apps/server/src
git commit -m "feat(server): bar overview and finger guessing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 猜酒杯、转数字、礼券换蟹币

**Files:**
- Modify: `apps/server/src/modules/bar/games.ts`、`service.ts`、`routes.ts`
- Test: `apps/server/src/modules/bar/games.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `played`、`lockBarState` / `saveBarState`、`badInput`、`resultDto`；Task 3 的 `randomAward`、`awardGoodsPool`
- Produces:
  - `playCup(o: Op): Promise<CupResultDto>`、`playNum(o: Op, num: number): Promise<NumResultDto>`、`exchangeKrabCoin(o: Op, num: number): Promise<BarExchangeResultDto>`
  - 服务 `cup(ctx)`、`num(ctx, {num})`、`exchange(ctx, {num})`；路由 `POST /bar/cup`、`/bar/num`、`/bar/exchange`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/bar/games.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { awardGoodsPool } from '../award/random';

const config = testConfig();
let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('猜酒杯（设计文档 §3.3）', () => {
  it('按连胜收礼券 1、2、3、4；胜率 1/(n+1) 随连胜下降；奖励等级 2 + (n−1)；输了下一局回到 1 张', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 10 } });
    rngValues = [0.1, 0.5]; // 猜中；随机奖励类型 = 银币
    expect((await t.game.bar.cup(ctx)).data).toEqual({
      win: true,
      cost: 1,
      times: 1,
      lucky: false,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
    });
    expect((await t.game.bar.cup(ctx)).data).toMatchObject({ win: true, cost: 2, times: 2, award: { num: 300 } });
    expect((await t.game.bar.cup(ctx)).data).toMatchObject({ win: true, cost: 3, times: 3, award: { num: 400 } });
    rngValues = [0.3]; // 第 4 连胜率 0.2
    expect((await t.game.bar.cup(ctx)).data).toEqual({ win: false, cost: 4, times: 1, lucky: false, award: null });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(900);
    expect((await t.game.bar.overview(ctx)).cup).toEqual({ result: 'lose', times: 1, nextCost: 1 });
  });

  it('猜错：连错次数累计，每局 1 张', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 2 } });
    rngValues = [0.9];
    await t.game.bar.cup(ctx);
    expect((await t.game.bar.cup(ctx)).data).toEqual({ win: false, cost: 1, times: 2, lucky: false, award: null });
  });

  it('连胜后礼券不够下一局：NOT_ENOUGH，礼券和连胜都不变（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 2 } });
    rngValues = [0.1, 0.5];
    await t.game.bar.cup(ctx);
    await expect(t.game.bar.cup(ctx)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 1, need: 2, have: 1 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(1);
    expect((await t.game.bar.overview(ctx)).cup).toEqual({ result: 'win', times: 1, nextCost: 2 });
  });

  it('幸运：幸运率 0.3 时第 1 连胜率 0.65，随机数 0.6 猜中并标记幸运', async () => {
    const ctx = await newRestaurant(t, { patch: { luck: 300 }, goods: { 1: 1 } });
    rngValues = [0.6, 0.5];
    expect((await t.game.bar.cup(ctx)).data).toMatchObject({ win: true, lucky: true });
  });

  it('连胜 4 发新闻 bar.cup', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 10 } });
    rngValues = [0.1, 0.5];
    for (let i = 0; i < 3; i++) await t.game.bar.cup(ctx);
    expect(await newsOf(ctx.restaurantId)).toEqual([]);
    await t.game.bar.cup(ctx);
    expect(await newsOf(ctx.restaurantId)).toEqual([{ type: 'bar.cup', params: { times: 4, lucky: false } }]);
  });
});

describe('转数字（设计文档 §3.4）', () => {
  it('中奖：扣 8 张；只给物品（奖励等级 10、不出礼券）；必发新闻', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 8 } });
    rngValues = [0.01, 0.9, 0]; // 中奖（胜率 0.04）；不翻倍；取池里第一个
    const pool = awardGoodsPool(config.bundle.goods, 10, 0, true);
    expect((await t.game.bar.num(ctx, { num: 7 })).data).toEqual({
      win: true,
      barNum: 7,
      hint: null,
      times: 1,
      lucky: false,
      award: { kind: 'goods', id: pool[0], num: 1, lucky: false },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBe(1);
    const news = await newsOf(ctx.restaurantId);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ type: 'bar.num', params: { lucky: false, award: { id: pool[0] } } });
  });

  it('没中：转到的数字不等于猜的；三档提示；连续没中计次', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 24 } });
    rngValues = [0.5]; // 没中；k = 12 → 14
    expect((await t.game.bar.num(ctx, { num: 13 })).data).toEqual({
      win: false,
      barNum: 14,
      hint: 'close',
      times: 1,
      lucky: false,
      award: null,
    });
    rngValues = [0.6]; // k = 14 → 16
    expect((await t.game.bar.num(ctx, { num: 13 })).data).toMatchObject({ barNum: 16, hint: 'soft', times: 2 });
    rngValues = [0.99]; // k = 23 → 25
    expect((await t.game.bar.num(ctx, { num: 13 })).data).toMatchObject({ barNum: 25, hint: 'hard', times: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(0);
    expect((await t.game.bar.overview(ctx)).num).toMatchObject({ result: 'lose', times: 3 });
  });

  it('数字超过 numMax 报 VALIDATION_FAILED，不扣礼券', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 8 } });
    await expect(t.game.bar.num(ctx, { num: 26 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'num' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(8);
  });
});

describe('礼券换蟹币（设计文档 §3.6）', () => {
  it('100 张换 1 个；礼券不够报 NOT_ENOUGH、不扣；不计活跃', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 250 } });
    expect((await t.game.bar.exchange(ctx, { num: 2 })).data).toEqual({ krabCoins: 2, tickets: 50 });
    await expect(t.game.bar.exchange(ctx, { num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 1, need: 100, have: 50 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 240)).toBe(2);
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/games.test.ts`
Expected: FAIL——`t.game.bar.cup is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/bar/games.ts`：把文件开头的 import 整块换成：

```ts
import { GOODS } from '@dt/config';
import type { BarExchangeResultDto, CupResultDto, FgResultDto, NumResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opLuck } from '../../core/luck';
import { opNews, type Op } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { randomAward, type RandomAward } from '../award/random';
import { consumeGoods, countGoods, grantGoodsOp } from '../store/goods';
import { badInput, resultDto } from './common';
import {
  barHand,
  cupRound,
  cupWinRate,
  fgAwardLevel,
  fgOutcome,
  nextTimes,
  numHint,
  numMissValue,
  numWinRate,
  type BarResult,
} from './rules';
import { lockBarState, saveBarState } from './state';
```

文件末尾追加：

```ts
/**
 * 猜酒杯（设计文档 §3.3）。杯号不参与判定（计划裁定 7）；奖励不出礼券（计划裁定 1）。
 * 随机数顺序：猜中 → 随机奖励
 */
export async function playCup(o: Op): Promise<CupResultDto> {
  const t = o.tuning.bar;
  const s = await lockBarState(o);
  const prev = s.cup_result as BarResult | null;
  const n = cupRound(prev, s.cup_times);
  await consumeGoods(o, GOODS.mysteryTicket, n);
  const luck = await opLuck(o);
  const r = o.rng.next();
  const win = r < cupWinRate(n, luck.rate);
  const lucky = win && r >= 1 / (n + 1);
  const times = win ? n : nextTimes(prev, s.cup_times, -1);
  await saveBarState(o, { cup_result: win ? 1 : -1, cup_times: times });
  let award: RandomAward | null = null;
  if (win) {
    award = await randomAward(o, { level: 2 + (n - 1), noTicket: true });
    if (n >= t.cupNewsStreak) opNews(o, 'bar.cup', { times: n, lucky });
  }
  await played(o, 'cup');
  return { win, cost: n, times, lucky, award };
}

/**
 * 转数字（设计文档 §3.4）。
 * 随机数顺序：中奖 → 随机奖励（只给物品，没有类型那一次）；没中时 → 转到的数字（计划裁定 3）
 */
export async function playNum(o: Op, num: number): Promise<NumResultDto> {
  const t = o.tuning.bar;
  if (num > t.numMax) throw badInput('num');
  await consumeGoods(o, GOODS.mysteryTicket, t.numCost);
  const s = await lockBarState(o);
  const luck = await opLuck(o);
  const r = o.rng.next();
  const win = r < numWinRate(luck.rate, t);
  const result: BarResult = win ? 1 : -1;
  const times = nextTimes(s.num_result as BarResult | null, s.num_times, result);
  await saveBarState(o, { num_result: result, num_times: times });
  await played(o, 'num');
  if (!win) {
    const barNum = numMissValue(num, o.rng.int(t.numMax - 1));
    return { win, barNum, hint: numHint(num, barNum), times, lucky: false, award: null };
  }
  const lucky = r >= 1 / t.numMax;
  const award = await randomAward(o, { level: t.numAwardLevel, onlyGoods: true, noTicket: true });
  opNews(o, 'bar.num', { lucky, award });
  return { win, barNum: num, hint: null, times, lucky, award };
}

/** 礼券换蟹币（设计文档 §3.6）：krabCoinTickets 张换 1 个；不计活跃 */
export async function exchangeKrabCoin(o: Op, num: number): Promise<BarExchangeResultDto> {
  await consumeGoods(o, GOODS.mysteryTicket, o.tuning.bar.krabCoinTickets * num);
  await grantGoodsOp(o, GOODS.krabCoin, num);
  return {
    krabCoins: await countGoods(o, GOODS.krabCoin),
    tickets: await countGoods(o, GOODS.mysteryTicket),
  };
}
```

`apps/server/src/modules/bar/service.ts`：`import { playFg } from './games';` 改成 `import { exchangeKrabCoin, playCup, playFg, playNum } from './games';`；返回对象里 `fg(...) { ... },` 后面加：

```ts
    /** 杯号只在路由里校验（计划裁定 7） */
    cup(ctx: RestCtx) {
      return op(ctx, 'bar.cup', (o) => playCup(o));
    },
    num(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'bar.num', (o) => playNum(o, b.num));
    },
    exchange(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'bar.exchange', (o) => exchangeKrabCoin(o, b.num));
    },
```

`apps/server/src/modules/bar/routes.ts`：`import { barFgBody } from '@dt/shared';` 改成 `import { barCupBody, barExchangeBody, barFgBody, barNumBody } from '@dt/shared';`；`/bar/fg` 那行下面加：

```ts
    r.post('/bar/cup', async (req) => {
      parse(barCupBody, req.body);
      return okOp(await svc.cup(restCtxOf(req)));
    });
    r.post('/bar/num', async (req) => okOp(await svc.num(restCtxOf(req), parse(barNumBody, req.body))));
    r.post('/bar/exchange', async (req) =>
      okOp(await svc.exchange(restCtxOf(req), parse(barExchangeBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/games.test.ts src/modules/bar/fg.test.ts`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/bar
git add apps/server/src/modules/bar
git commit -m "feat(server): bar cup guessing, number wheel, krab coin exchange

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 老虎机

**Files:**
- Create: `apps/server/src/modules/bar/slot.ts`
- Modify: `apps/server/src/modules/bar/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/bar/slot.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `GameConfig.slotPool` / `slotAwards`；Task 4 的 `slotForced`、`slotFloorRate`、`slotFloorLeft`；Task 5 的 `lockBarState` / `saveBarState`
- Produces: `playSlot(o: Op, times: number): Promise<SlotResultDto>`；服务 `slot(ctx, {times})`；路由 `POST /bar/slot`

老虎机奖池的累计权重（数据顺序，总 19553）：0 空 15000、1 十三香(326) 15720、…、10 神秘宁乡猪 18500、11 迷迭香(450，新闻) 18550、…、100 蟹黄堡(道具 180，稀有、新闻) 19553。测试里 `pickWeighted` 的随机数：0.5 → 空、0.77 → 十三香、0.9474 → 迷迭香、0.0005 → 空。

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/bar/slot.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { createTestGame, foodNum, goodsNum, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const setFail = (restId: number, fail: number) =>
  t.db.insertInto('bar_state').values({ rest_id: restId, slot_fail: fail }).execute();
const failOf = async (restId: number) =>
  (await t.db.selectFrom('bar_state').select('slot_fail').where('rest_id', '=', restId).executeTakeFirstOrThrow())
    .slot_fail;
const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('老虎机（设计文档 §3.5）', () => {
  it('抽 2 次：每次 3 格，相同奖项合并发放；扣蟹币；统计累计；距离保底；支线「玩一次老虎机」完成', async () => {
    const ctx = await newRestaurant(t, { verified: true, goods: { 240: 5 }, patch: { main_task_step: 16 } });
    rngValues = [0.5, 0.77]; // 每格：不提前保底；抽到十三香
    expect((await t.game.bar.slot(ctx, { times: 2 })).data).toEqual({
      spins: [
        [1, 1, 1],
        [1, 1, 1],
      ],
      rewards: [{ awardId: 1, kind: 'foods', itemId: 326, num: 6 }],
      krabCoins: 3,
      floorLeft: 98,
    });
    expect((await foodNum(t, ctx.restaurantId, 326)).num).toBe(6);
    expect(await goodsNum(t, ctx.restaurantId, 240)).toBe(3);
    expect(await newsOf(ctx.restaurantId)).toEqual([]);
    rngValues = [0.5]; // 空
    expect((await t.game.bar.slot(ctx, { times: 1 })).data).toMatchObject({ spins: [[0, 0, 0]], rewards: [] });
    expect((await t.game.bar.overview(ctx)).slot).toMatchObject({
      emailVerified: true,
      floorLeft: 97,
      stats: [
        { awardId: 0, num: 3 },
        { awardId: 1, num: 6 },
      ],
    });
    const side = (await t.game.task.tasks(ctx)).side.find((x) => x.id === 108)!;
    expect(side).toMatchObject({ key: 'bar.slot', progress: 3, done: true });
  });

  it('一次请求跨过 300 格保底：那一格出蟹黄堡并发新闻，之后从 0 重新计（Review Focus 1）', async () => {
    const ctx = await newRestaurant(t, { verified: true, goods: { 240: 2 } });
    await setFail(ctx.restaurantId, 297);
    rngValues = [0.5];
    expect((await t.game.bar.slot(ctx, { times: 2 })).data).toEqual({
      spins: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      rewards: [{ awardId: 100, kind: 'goods', itemId: 180, num: 1 }],
      krabCoins: 0,
      floorLeft: 100,
    });
    expect(await goodsNum(t, ctx.restaurantId, 180)).toBe(1);
    expect(await failOf(ctx.restaurantId)).toBe(2);
    expect(await newsOf(ctx.restaurantId)).toEqual([
      { type: 'bar.slot', params: { awardId: 100, kind: 'goods', itemId: 180, num: 1 } },
    ]);
  });

  it('提前保底：fail 200 时随机数 0.0005，有神灯（率翻倍到 0.00064）出蟹黄堡，没有神灯（0.00032）不出', async () => {
    const lampy = await newRestaurant(t, { verified: true, goods: { 240: 1, 389: 1 } });
    const plain = await newRestaurant(t, { verified: true, goods: { 240: 1 } });
    for (const c of [lampy, plain]) await setFail(c.restaurantId, 200);
    rngValues = [0.0005];
    expect((await t.game.bar.slot(lampy, { times: 1 })).data.spins).toEqual([[100, 0, 0]]);
    expect((await t.game.bar.slot(plain, { times: 1 })).data.spins).toEqual([[0, 0, 0]]);
    expect(await failOf(plain.restaurantId)).toBe(203);
    expect((await t.game.bar.overview(lampy)).slot.lamp).toBe(true);
  });

  it('奖池标了新闻的奖项（迷迭香）也发新闻，每种一条', async () => {
    const ctx = await newRestaurant(t, { verified: true, goods: { 240: 1 } });
    rngValues = [0.5, 0.9474];
    expect((await t.game.bar.slot(ctx, { times: 1 })).data.rewards).toEqual([
      { awardId: 11, kind: 'foods', itemId: 450, num: 3 },
    ]);
    expect(await newsOf(ctx.restaurantId)).toEqual([
      { type: 'bar.slot', params: { awardId: 11, kind: 'foods', itemId: 450, num: 3 } },
    ]);
  });

  it('抽到食材时橱柜没格子：进冰箱，不报错；蟹币照扣（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t, {
      verified: true,
      goods: { 240: 1 },
      foods: { 101: 1 },
      patch: { cupboard_num: 1 },
    });
    rngValues = [0.5, 0.77];
    await t.game.bar.slot(ctx, { times: 1 });
    expect(await foodNum(t, ctx.restaurantId, 326)).toEqual({ num: 0, fridge: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 240)).toBe(0);
  });

  it('没验证邮箱报 EMAIL_NOT_VERIFIED；蟹币不够报 NOT_ENOUGH goods 240；都不扣', async () => {
    const unverified = await newRestaurant(t, { goods: { 240: 1 } });
    await expect(t.game.bar.slot(unverified, { times: 1 })).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(await goodsNum(t, unverified.restaurantId, 240)).toBe(1);
    const poor = await newRestaurant(t, { verified: true, goods: { 240: 1 } });
    await expect(t.game.bar.slot(poor, { times: 2 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 240, need: 2, have: 1 },
    });
    expect(await goodsNum(t, poor.restaurantId, 240)).toBe(1);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/slot.test.ts`
Expected: FAIL——`t.game.bar.slot is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/bar/slot.ts`：

```ts
import { sql } from 'kysely';
import { GOODS } from '@dt/config';
import { ErrorCode, pickWeighted, type SlotResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opNews, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';
import { consumeGoods, countGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { slotFloorLeft, slotFloorRate, slotForced } from './rules';
import { lockBarState, saveBarState } from './state';

/** 老虎机要验证邮箱（设计文档裁定 7） */
async function assertVerified(o: Op): Promise<void> {
  const acc = await o.tx
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', o.rest.account_id)
    .executeTakeFirstOrThrow();
  if (!acc.email_verified_at) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
}

/**
 * 老虎机（设计文档 §3.5）：每次 slotCells 格；同一请求里相同奖项合并发放，稀有或标了新闻的每种发一条新闻。
 * 每格随机数顺序：已到强制保底时不抽；否则先抽一个判提前保底，再按权重抽一个（计划裁定 5）
 */
export async function playSlot(o: Op, times: number): Promise<SlotResultDto> {
  const t = o.tuning.bar;
  await assertVerified(o);
  await consumeGoods(o, GOODS.krabCoin, times);
  const s = await lockBarState(o);
  const lamp = await hasValidHonor(o, GOODS.magicLamp);
  const floorAward = o.config.slotAwards.get(t.slotFloorAwardId)!;
  let fail = s.slot_fail;
  const spins: number[][] = [];
  /** 奖项 id → 格数 */
  const got = new Map<number, number>();
  for (let i = 0; i < times; i++) {
    const spin: number[] = [];
    for (let c = 0; c < t.slotCells; c++) {
      const floor = slotForced(fail, t) || o.rng.next() < slotFloorRate(fail, lamp, t);
      const a = floor ? floorAward : pickWeighted(o.config.slotPool, o.rng);
      fail = floor || a.rare ? 0 : fail + 1;
      spin.push(a.id);
      got.set(a.id, (got.get(a.id) ?? 0) + 1);
    }
    spins.push(spin);
  }
  await saveBarState(o, { slot_fail: fail });
  await o.tx
    .insertInto('bar_slot_stat')
    .values([...got].map(([award_id, num]) => ({ rest_id: o.rest.id, award_id, num })))
    .onConflict((oc) =>
      oc.columns(['rest_id', 'award_id']).doUpdateSet({ num: sql<number>`bar_slot_stat.num + excluded.num` }),
    )
    .execute();

  const rewards: SlotResultDto['rewards'] = [];
  for (const [id, cells] of [...got].sort((x, y) => x[0] - y[0])) {
    const a = o.config.slotAwards.get(id)!;
    if (a.kind === 'empty' || a.itemId === null) continue;
    const num = cells * a.getNum;
    if (a.kind === 'foods') await addFoods(o, a.itemId, num);
    else await grantGoodsOp(o, a.itemId, num);
    rewards.push({ awardId: id, kind: a.kind, itemId: a.itemId, num });
    if (a.rare || a.news) opNews(o, 'bar.slot', { awardId: id, kind: a.kind, itemId: a.itemId, num });
  }
  await emitAction(o, 'bar.play', times);
  await emitAction(o, 'bar.slot', times);
  return { spins, rewards, krabCoins: await countGoods(o, GOODS.krabCoin), floorLeft: slotFloorLeft(fail, t) };
}
```

`apps/server/src/modules/bar/service.ts`：加 `import { playSlot } from './slot';`；返回对象里 `exchange(...) { ... },` 后面加：

```ts
    slot(ctx: RestCtx, b: { times: number }) {
      return op(ctx, 'bar.slot', (o) => playSlot(o, b.times));
    },
```

`apps/server/src/modules/bar/routes.ts`：`@dt/shared` 的 import 里加 `barSlotBody`；`/bar/exchange` 那段下面加：

```ts
    r.post('/bar/slot', async (req) => okOp(await svc.slot(restCtxOf(req), parse(barSlotBody, req.body))));
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar`
Expected: PASS（rules、fg、games、slot 四个文件）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/bar
git add apps/server/src/modules/bar
git commit -m "feat(server): bar slot machine with floor and stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 状态键 honor.potCount（支线「集齐 4 株盆栽」）

**Files:**
- Modify: `apps/server/src/modules/task/service.ts`（`snapshot` 的 `extra`）
- Test: `apps/server/src/modules/bar/pots.test.ts`

**Interfaces:**
- Consumes: `listActiveEffects(db, restId, now)`（`modules/effects/service.ts`）、`DEVICE_TYPE.pot`（36）
- Produces: 任务状态键 `honor.potCount` = 有效盆栽勋章的种数（设计文档裁定 10）

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/bar/pots.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('支线「集齐 4 株盆栽」（设计文档裁定 10）', () => {
  it('按有效盆栽勋章的种数计；过期的不算；集齐 4 株完成', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 40 } });
    const side = async () => (await t.game.task.tasks(ctx)).side.find((x) => x.id === 120)!;
    expect(await side()).toMatchObject({ key: 'honor.potCount', progress: 0, done: false });
    const now = new Date();
    for (const id of [248, 249, 254]) await grantGoods(t.db, config, ctx.restaurantId, id, 1, now);
    // 两小时前拿到、有效期 1 小时：已过期
    await grantGoods(t.db, config, ctx.restaurantId, 338, 1, new Date(now.getTime() - 2 * 3600_000), { hours: 1 });
    expect(await side()).toMatchObject({ progress: 3, done: false });
    await grantGoods(t.db, config, ctx.restaurantId, 387, 1, now);
    expect(await side()).toMatchObject({ progress: 4, done: true });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/pots.test.ts`
Expected: FAIL——`expected { progress: 0 } to match { progress: 3 }`（状态键还没有值，一直是 0）

- [ ] **Step 3: 实现**

`apps/server/src/modules/task/service.ts`：
- 第 2 行 `import { GOODS, type Award, type ShardSettings, type Task } from '@dt/config';` 改成 `import { DEVICE_TYPE, GOODS, type Award, type ShardSettings, type Task } from '@dt/config';`
- 在 `import { incrementDaily } from '../counter/dailyCounter';` 下面加 `import { listActiveEffects } from '../effects/service';`
- `snapshot` 里 `const lands = await db ... .executeTakeFirstOrThrow();` 之后加：

```ts
    // 有效盆栽勋章的种数，和"集盆栽"加成同一套计数（4C-1 设计文档裁定 10）
    const pots = (await listActiveEffects(db, rest.id, d.now())).filter(
      (s) => s.sourceType === 'honor' && d.config.goods.get(s.sourceId)?.deviceType === DEVICE_TYPE.pot,
    ).length;
```

- `extra` 对象里 `'yard.lands': Number(lands.n),` 下面加 `'honor.potCount': pots,`

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/bar/pots.test.ts src/modules/task`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/task/service.ts apps/server/src/modules/bar/pots.test.ts
git add apps/server/src/modules/task/service.ts apps/server/src/modules/bar/pots.test.ts
git commit -m "feat(server): task state key honor.potCount

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 前端——接口、奖励文字、划拳 / 猜酒杯 / 转数字面板

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`
- Create: `apps/web/src/components/bar/award.ts`、`award.test.ts`、`testData.ts`
- Create: `apps/web/src/components/bar/FgPanel.vue`、`FgPanel.test.ts`
- Create: `apps/web/src/components/bar/CupPanel.vue`、`CupPanel.test.ts`
- Create: `apps/web/src/components/bar/NumPanel.vue`、`NumPanel.test.ts`

**Interfaces:**
- Consumes: Task 5 的 DTO（`BarDto`、`FgResultDto`、`CupResultDto`、`NumResultDto`、`SlotResultDto`、`BarExchangeResultDto`、`BarAwardDto`）
- Produces:
  - `endpoints.bar()`、`barFg(hand)`、`barCup(cup)`、`barNum(num)`、`barSlot(times)`、`barExchange(num)`
  - `components/bar/award.ts`：`HANDS`、`handName(h: number): string`、`NUM_HINTS`、`awardText(a: BarAwardDto, names: Pick<Names, 'goodsName' | 'foodName'>): string`
  - `components/bar/testData.ts`：`barData(patch?: Partial<BarDto>): BarDto`
  - 面板组件：props `{ data: BarDto }`，emit `reload`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/bar/testData.ts`：

```ts
import type { BarDto } from '@dt/shared';

export const barData = (patch: Partial<BarDto> = {}): BarDto => ({
  tickets: 20,
  krabCoins: 3,
  fg: { result: null, times: 0 },
  cup: { result: null, times: 0, nextCost: 1 },
  num: { result: null, times: 0, cost: 8, max: 25 },
  slot: {
    emailVerified: true,
    lamp: false,
    floorLeft: 100,
    pool: [
      { id: 0, kind: 'empty', itemId: null, rate: 0.77, rare: false },
      { id: 1, kind: 'foods', itemId: 101, rate: 0.2, rare: false },
      { id: 100, kind: 'goods', itemId: 180, rate: 0.03, rare: true },
    ],
    stats: [],
  },
  krabCoinTickets: 100,
  ...patch,
});
```

`apps/web/src/components/bar/award.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { awardText, handName } from './award';

const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}` };

describe('awardText', () => {
  it('银币、经验带千分位；物品、食材写名字和数量；幸运翻倍标出来', () => {
    expect(awardText({ kind: 'coin', id: null, num: 1400, lucky: false }, names)).toBe('银币 1,400');
    expect(awardText({ kind: 'exp', id: null, num: 100, lucky: false }, names)).toBe('经验 100');
    expect(awardText({ kind: 'goods', id: 5, num: 1, lucky: false }, names)).toBe('道具5×1');
    expect(awardText({ kind: 'foods', id: 101, num: 2, lucky: true }, names)).toBe('食材101×2（幸运）');
  });

  it('出拳名', () => {
    expect([0, 1, 2].map(handName)).toEqual(['石头', '剪刀', '布']);
  });
});
```

`apps/web/src/components/bar/FgPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FgPanel from './FgPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barFg: vi.fn() } }));

describe('FgPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('出拳后显示双方出的拳、胜负和奖励，并通知刷新', async () => {
    vi.mocked(endpoints.barFg).mockResolvedValue({
      result: 'win',
      barHand: 1,
      times: 2,
      lucky: true,
      coin: 0,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
    });
    const w = mount(FgPanel, { props: { data: barData({ fg: { result: 'win', times: 1 } }) } });
    expect(w.find('[data-testid="fg-streak"]').text()).toContain('1 连胜');
    await w.find('[data-testid="fg-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.barFg).toHaveBeenCalledWith(0);
    expect(w.find('[data-testid="fg-result"]').text()).toBe(
      '你出石头，对方出剪刀：幸运地赢了（2 连胜），得到 银币 200',
    );
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('平局写银币；输了写对方的拳', async () => {
    vi.mocked(endpoints.barFg).mockResolvedValue({
      result: 'draw',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 30,
      award: null,
    });
    const w = mount(FgPanel, { props: { data: barData() } });
    await w.find('[data-testid="fg-2"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="fg-result"]').text()).toBe('你出布，对方出布：平局，得到银币 30');
    vi.mocked(endpoints.barFg).mockResolvedValue({
      result: 'lose',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 0,
      award: null,
    });
    await w.find('[data-testid="fg-0"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="fg-result"]').text()).toBe('你出石头，对方出布：你输了');
  });

  it('礼券不够时按钮灰掉并写明原因', () => {
    const w = mount(FgPanel, { props: { data: barData({ tickets: 0 }) } });
    expect(w.find('[data-testid="fg-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('神秘礼券不够');
  });
});
```

`apps/web/src/components/bar/CupPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import CupPanel from './CupPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barCup: vi.fn() } }));

describe('CupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('写明这一局要几张礼券和当前连胜；猜对显示连胜和奖励', async () => {
    vi.mocked(endpoints.barCup).mockResolvedValue({
      win: true,
      cost: 3,
      times: 3,
      lucky: false,
      award: { kind: 'exp', id: null, num: 300, lucky: false },
    });
    const w = mount(CupPanel, { props: { data: barData({ cup: { result: 'win', times: 2, nextCost: 3 } }) } });
    expect(w.find('[data-testid="cup-cost"]').text()).toBe('3');
    expect(w.find('[data-testid="cup-streak"]').text()).toContain('2 连胜');
    await w.find('[data-testid="cup-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.barCup).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="cup-result"]').text()).toBe('猜对了！3 连胜，得到 经验 300');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('猜错写连错次数', async () => {
    vi.mocked(endpoints.barCup).mockResolvedValue({ win: false, cost: 1, times: 2, lucky: false, award: null });
    const w = mount(CupPanel, { props: { data: barData() } });
    await w.find('[data-testid="cup-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="cup-result"]').text()).toBe('猜错了，已经连错 2 次。下一局从 1 张礼券开始');
  });

  it('礼券不够这一局时按钮灰掉并写明原因', () => {
    const w = mount(CupPanel, {
      props: { data: barData({ tickets: 2, cup: { result: 'win', times: 2, nextCost: 3 } }) },
    });
    expect(w.find('[data-testid="cup-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('这一局要 3 张');
  });
});
```

`apps/web/src/components/bar/NumPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import NumPanel from './NumPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barNum: vi.fn() } }));

describe('NumPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('选数字转；没中时显示转到的数字和提示', async () => {
    vi.mocked(endpoints.barNum).mockResolvedValue({
      win: false,
      barNum: 18,
      hint: 'close',
      times: 1,
      lucky: false,
      award: null,
    });
    const w = mount(NumPanel, { props: { data: barData() } });
    expect(w.findAll('[data-testid="num-pick"] option')).toHaveLength(25);
    await w.find('[data-testid="num-pick"]').setValue('20');
    await w.find('[data-testid="num-spin"]').trigger('click');
    await flushPromises();
    expect(endpoints.barNum).toHaveBeenCalledWith(20);
    expect(w.find('[data-testid="num-result"]').text()).toBe('转到了 18，就差一丝丝了');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('中奖写连续中奖次数和物品', async () => {
    vi.mocked(endpoints.barNum).mockResolvedValue({
      win: true,
      barNum: 13,
      hint: null,
      times: 2,
      lucky: false,
      award: { kind: 'goods', id: 5, num: 1, lucky: false },
    });
    const w = mount(NumPanel, { props: { data: barData() } });
    await w.find('[data-testid="num-spin"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="num-result"]').text()).toBe('中了！连续中奖 2 次，得到 道具5×1');
  });

  it('礼券不够 8 张时按钮灰掉并写明原因', () => {
    const w = mount(NumPanel, { props: { data: barData({ tickets: 7 }) } });
    expect(w.find('[data-testid="num-spin"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('每次 8 张');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/bar`
Expected: FAIL——`Failed to resolve import "./award"` / `"./FgPanel.vue"` 等

- [ ] **Step 3: 接口**

`apps/web/src/api/endpoints.ts`：文件开头 `import type { ... } from '@dt/shared';` 的列表里加 `BarDto`、`BarExchangeResultDto`、`CupResultDto`、`FgResultDto`、`NumResultDto`、`SlotResultDto`（按字母序）；`endpoints` 对象的最后一项之后（结尾 `};` 之前）加：

```ts
  bar: () => api.get<BarDto>('/api/v1/bar'),
  barFg: (hand: number) => api.post<FgResultDto>('/api/v1/bar/fg', { hand }),
  barCup: (cup: number) => api.post<CupResultDto>('/api/v1/bar/cup', { cup }),
  barNum: (num: number) => api.post<NumResultDto>('/api/v1/bar/num', { num }),
  barSlot: (times: number) => api.post<SlotResultDto>('/api/v1/bar/slot', { times }),
  barExchange: (num: number) => api.post<BarExchangeResultDto>('/api/v1/bar/exchange', { num }),
```

- [ ] **Step 4: 奖励文字**

`apps/web/src/components/bar/award.ts`：

```ts
import type { BarAwardDto } from '@dt/shared';
import type { Names } from '../../utils/events';
import { formatNum } from '../../utils/format';

/** 0 石头、1 剪刀、2 布 */
export const HANDS = ['石头', '剪刀', '布'] as const;

export function handName(h: number): string {
  return HANDS[h] ?? '?';
}

export const NUM_HINTS = { close: '就差一丝丝了', soft: '下次再轻一点', hard: '力气用得太大了' } as const;

/** 随机奖励的文字：银币 1,400、经验 100、物品名×1（幸运） */
export function awardText(a: BarAwardDto, names: Pick<Names, 'goodsName' | 'foodName'>): string {
  const what =
    a.kind === 'coin'
      ? `银币 ${formatNum(a.num)}`
      : a.kind === 'exp'
        ? `经验 ${formatNum(a.num)}`
        : `${a.kind === 'goods' ? names.goodsName(a.id ?? 0) : names.foodName(a.id ?? 0)}×${a.num}`;
  return a.lucky ? `${what}（幸运）` : what;
}
```

- [ ] **Step 5: 划拳面板**

`apps/web/src/components/bar/FgPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, FgResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { awardText, handName, HANDS } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const hand = ref(0);
const last = ref<FgResultDto | null>(null);

const block = computed(() => (props.data.tickets < 1 ? '神秘礼券不够（每局 1 张）' : ''));
const streak = computed(() => (props.data.fg.result === 'win' ? props.data.fg.times : 0));
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  const head = `你出${handName(hand.value)}，对方出${handName(r.barHand)}：`;
  if (r.result === 'draw') return `${head}平局，得到银币 ${formatNum(r.coin)}`;
  if (r.result === 'lose') return `${head}你输了`;
  const streakText = r.times > 1 ? `（${r.times} 连胜）` : '';
  const award = r.award ? `，得到 ${awardText(r.award, catalog)}` : '';
  return `${head}${r.lucky ? '幸运地' : ''}赢了${streakText}${award}`;
});

async function play(h: number) {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    const r = await endpoints.barFg(h);
    hand.value = h;
    last.value = r;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '划拳失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      每局 1 张神秘礼券。赢了得随机奖励，连胜越多奖励越好；平局得银币。
      <span v-if="streak > 0" data-testid="fg-streak">当前 {{ streak }} 连胜</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        v-for="(h, i) in HANDS"
        :key="i"
        class="btn btn-outline-primary"
        :data-testid="`fg-${i}`"
        :disabled="busy || !!block"
        @click="play(i)"
      >
        {{ h }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="fg-result">{{ resultText }}</div>
  </div>
</template>
```

- [ ] **Step 6: 猜酒杯面板**

`apps/web/src/components/bar/CupPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, CupResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const last = ref<CupResultDto | null>(null);

const cost = computed(() => props.data.cup.nextCost);
const streak = computed(() => (props.data.cup.result === 'win' ? props.data.cup.times : 0));
const block = computed(() =>
  props.data.tickets < cost.value ? `神秘礼券不够（这一局要 ${cost.value} 张）` : '',
);
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  if (!r.win) return `猜错了${r.times > 1 ? `，已经连错 ${r.times} 次` : ''}。下一局从 1 张礼券开始`;
  const award = r.award ? `，得到 ${awardText(r.award, catalog)}` : '';
  return `${r.lucky ? '幸运地' : ''}猜对了！${r.times} 连胜${award}`;
});

async function play(cup: number) {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.barCup(cup);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '猜酒杯失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      选一个酒杯。这一局要 <b data-testid="cup-cost">{{ cost }}</b> 张神秘礼券；连胜越多，花得越多、奖励越好。
      <span v-if="streak > 0" data-testid="cup-streak">当前 {{ streak }} 连胜</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        v-for="c in [1, 2, 3]"
        :key="c"
        class="btn btn-outline-primary"
        :data-testid="`cup-${c}`"
        :disabled="busy || !!block"
        @click="play(c)"
      >
        {{ c }} 号杯
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="cup-result">{{ resultText }}</div>
  </div>
</template>
```

- [ ] **Step 7: 转数字面板**

`apps/web/src/components/bar/NumPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, NumResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText, NUM_HINTS } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const pick = ref(13);
const last = ref<NumResultDto | null>(null);

const nums = computed(() => Array.from({ length: props.data.num.max }, (_, i) => i + 1));
const cost = computed(() => props.data.num.cost);
const block = computed(() => (props.data.tickets < cost.value ? `神秘礼券不够（每次 ${cost.value} 张）` : ''));
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  if (!r.win) return `转到了 ${r.barNum}，${NUM_HINTS[r.hint ?? 'hard']}`;
  const times = r.times > 1 ? `连续中奖 ${r.times} 次，` : '';
  const award = r.award ? `得到 ${awardText(r.award, catalog)}` : '';
  return `${r.lucky ? '幸运地' : ''}中了！${times}${award}`;
});

async function spin() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.barNum(pick.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '转数字失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">猜 1~{{ data.num.max }} 里的一个数字，转中了得一件物品。每次 {{ cost }} 张神秘礼券。</div>
    <div class="d-flex gap-1 align-items-center mb-2">
      <select v-model.number="pick" class="form-select form-select-sm" style="width: 80px" data-testid="num-pick">
        <option v-for="n in nums" :key="n" :value="n">{{ n }}</option>
      </select>
      <button class="btn btn-sm btn-primary text-nowrap" data-testid="num-spin" :disabled="busy || !!block" @click="spin">
        转（{{ cost }} 张礼券）
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="num-result">{{ resultText }}</div>
  </div>
</template>
```

- [ ] **Step 8: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/bar`
Expected: PASS（award、FgPanel、CupPanel、NumPanel 四个文件）

Run: `pnpm --filter @dt/web typecheck`
Expected: 无报错

- [ ] **Step 9: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/web/src/api/endpoints.ts apps/web/src/components/bar
git add apps/web/src/api/endpoints.ts apps/web/src/components/bar
git commit -m "feat(web): bar finger guessing, cup and number panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 前端——老虎机面板、酒吧页、路由、入口

**Files:**
- Create: `apps/web/src/components/bar/SlotPanel.vue`、`SlotPanel.test.ts`
- Create: `apps/web/src/views/BarView.vue`、`BarView.test.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/MoreView.vue`、`MoreView.test.ts`

**Interfaces:**
- Consumes: Task 9 的 `endpoints.bar / barSlot / barExchange`、`barData`、三个面板
- Produces: 路由 `/bar`（`name: 'bar'`，需要餐厅）；酒吧页标签 `tab-fg`、`tab-cup`、`tab-num`、`tab-slot`，记在 `localStorage` 的 `dt_bar_tab`；`bar-wallet`（"神秘礼券 N；蟹币 M"）

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/bar/SlotPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import SlotPanel from './SlotPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barSlot: vi.fn(), barExchange: vi.fn() } }));

const slotOf = (patch: Partial<ReturnType<typeof barData>['slot']>) => ({ ...barData().slot, ...patch });

describe('SlotPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('抽 1 次：显示每格的奖项和合并后的奖励，并通知刷新', async () => {
    vi.mocked(endpoints.barSlot).mockResolvedValue({
      spins: [[1, 0, 100]],
      rewards: [
        { awardId: 1, kind: 'foods', itemId: 101, num: 1 },
        { awardId: 100, kind: 'goods', itemId: 180, num: 1 },
      ],
      krabCoins: 2,
      floorLeft: 100,
    });
    const w = mount(SlotPanel, { props: { data: barData() } });
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.barSlot).toHaveBeenCalledWith(1);
    const text = w.find('[data-testid="slot-result"]').text();
    expect(text).toContain('第 1 次：食材101 / 空 / 道具180');
    expect(text).toContain('得到 食材101×1、道具180×1');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('蟹币只够 1 次：抽 10 次灰掉并写明原因，抽 1 次可用；没验证邮箱时都灰掉（Review Focus 5）', () => {
    const w = mount(SlotPanel, { props: { data: barData({ krabCoins: 3 }) } });
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="slot-10"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-block"]').text()).toContain('蟹币不够');
    const u = mount(SlotPanel, { props: { data: barData({ slot: slotOf({ emailVerified: false }) }) } });
    expect(u.find('[data-testid="slot-1"]').attributes('disabled')).toBeDefined();
    expect(u.find('[data-testid="slot-10"]').attributes('disabled')).toBeDefined();
    expect(u.find('[data-testid="slot-block"]').text()).toContain('验证邮箱');
  });

  it('礼券换蟹币：数量不超过 礼券÷100 和 99；不够 100 张时灰掉并写明原因', async () => {
    vi.mocked(endpoints.barExchange).mockResolvedValue({ krabCoins: 5, tickets: 50 });
    const w = mount(SlotPanel, { props: { data: barData({ tickets: 250 }) } });
    await w.find('[data-testid="ex-num"]').setValue('5');
    await w.find('[data-testid="ex-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.barExchange).toHaveBeenCalledWith(2);
    expect(w.emitted('reload')).toHaveLength(1);
    const poor = mount(SlotPanel, { props: { data: barData({ tickets: 50 }) } });
    expect(poor.find('[data-testid="ex-go"]').attributes('disabled')).toBeDefined();
    expect(poor.find('[data-testid="ex-block"]').text()).toContain('神秘礼券不够');
  });

  it('距离保底、奖池概率和稀有标记、我的统计', () => {
    const w = mount(SlotPanel, {
      props: {
        data: barData({
          slot: slotOf({
            floorLeft: 97,
            stats: [
              { awardId: 0, num: 3 },
              { awardId: 1, num: 6 },
            ],
          }),
        }),
      },
    });
    expect(w.find('[data-testid="floor-left"]').text()).toBe('97');
    const pool = w.find('[data-testid="slot-pool"]');
    expect(pool.findAll('tr')).toHaveLength(3);
    expect(pool.text()).toContain('3.00%');
    expect(pool.text()).toContain('稀有');
    const stats = w.find('[data-testid="slot-stats"]').text();
    expect(stats).toContain('共 9 格');
    expect(stats).toContain('食材101 6 格');
  });
});
```

`apps/web/src/views/BarView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { barData } from '../components/bar/testData';
import BarView from './BarView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { bar: vi.fn() } }));

const stubs = {
  FgPanel: { template: '<p>fg-panel</p>', props: ['data'] },
  CupPanel: { template: '<p>cup-panel</p>', props: ['data'] },
  NumPanel: { template: '<p>num-panel</p>', props: ['data'] },
  SlotPanel: { template: '<p>slot-panel</p>', props: ['data'] },
};

describe('BarView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.bar).mockResolvedValue(barData());
  });

  it('读取后显示礼券和蟹币；默认划拳；切到老虎机并记住', async () => {
    const w = mount(BarView, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="bar-wallet"]').text()).toBe('神秘礼券 20；蟹币 3');
    expect(w.text()).toContain('fg-panel');
    await w.find('[data-testid="tab-slot"]').trigger('click');
    expect(w.text()).toContain('slot-panel');
    expect(localStorage.getItem('dt_bar_tab')).toBe('slot');
    const again = mount(BarView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('slot-panel');
  });

  it('面板要求刷新时重新读取', async () => {
    const w = mount(BarView, {
      global: {
        stubs: {
          ...stubs,
          FgPanel: {
            template: `<button data-testid="again" @click="$emit('reload')">again</button>`,
            props: ['data'],
            emits: ['reload'],
          },
        },
      },
    });
    await flushPromises();
    await w.find('[data-testid="again"]').trigger('click');
    await flushPromises();
    expect(endpoints.bar).toHaveBeenCalledTimes(2);
  });
});
```

`apps/web/src/views/MoreView.test.ts`：把 `it('有特色菜、神殿、教室入口', ...)` 整个换成：

```ts
  it('有特色菜、神殿、菜园、酒吧、教室入口', () => {
    useSessionStore().me = me('player');
    const text = mountView().text();
    for (const x of ['特色菜', '神殿', '教室', '菜园', '酒吧']) expect(text).toContain(x);
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/bar/SlotPanel.test.ts src/views/BarView.test.ts src/views/MoreView.test.ts`
Expected: FAIL——`Failed to resolve import "./SlotPanel.vue"` / `"./BarView.vue"`；MoreView 找不到"酒吧"

- [ ] **Step 3: 老虎机面板**

`apps/web/src/components/bar/SlotPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, SlotResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const last = ref<SlotResultDto | null>(null);
const exNum = ref(1);

const slot = computed(() => props.data.slot);
function awardName(id: number): string {
  const a = slot.value.pool.find((x) => x.id === id);
  if (!a || a.kind === 'empty' || a.itemId === null) return '空';
  return a.kind === 'foods' ? catalog.foodName(a.itemId) : catalog.goodsName(a.itemId);
}
/** 抽 times 次的限制原因；空串表示能抽 */
function blockOf(times: number): string {
  if (!slot.value.emailVerified) return '老虎机要先验证邮箱';
  if (props.data.krabCoins < times) return `蟹币不够（每次 1 个，持有 ${props.data.krabCoins} 个）`;
  return '';
}
const block1 = computed(() => blockOf(1));
const block10 = computed(() => blockOf(10));
const blockText = computed(() => block1.value || (block10.value ? `抽 10 次：${block10.value}` : ''));
const spinsText = computed(() =>
  (last.value?.spins ?? []).map((s, i) => `第 ${i + 1} 次：${s.map((id) => awardName(id)).join(' / ')}`),
);
const rewardText = computed(() => {
  const rs = last.value?.rewards ?? [];
  return rs.length === 0 ? '什么也没抽到' : `得到 ${rs.map((r) => `${awardName(r.awardId)}×${r.num}`).join('、')}`;
});
const statTotal = computed(() => slot.value.stats.reduce((s, x) => s + x.num, 0));
const exMax = computed(() => Math.min(99, Math.floor(props.data.tickets / props.data.krabCoinTickets)));
const exN = computed(() => Math.max(1, Math.min(exNum.value || 1, exMax.value)));
const exBlock = computed(() =>
  exMax.value < 1 ? `神秘礼券不够（${props.data.krabCoinTickets} 张换 1 个蟹币）` : '',
);

async function spin(times: number) {
  if (busy.value || blockOf(times)) return;
  busy.value = true;
  try {
    last.value = await endpoints.barSlot(times);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '老虎机失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
async function exchange() {
  if (busy.value || exBlock.value) return;
  busy.value = true;
  try {
    await endpoints.barExchange(exN.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      每次 1 个蟹币，开 3 格。距离保底还剩 <b data-testid="floor-left">{{ slot.floorLeft }}</b> 次<span
        v-if="slot.lamp"
        >（有神灯：提前出保底的机会翻倍）</span
      >
    </div>
    <div class="d-flex gap-2 mb-1">
      <button class="btn btn-primary" data-testid="slot-1" :disabled="busy || !!block1" @click="spin(1)">
        抽 1 次
      </button>
      <button
        class="btn btn-outline-primary"
        data-testid="slot-10"
        :disabled="busy || !!block10"
        :title="block10"
        @click="spin(10)"
      >
        抽 10 次
      </button>
    </div>
    <div v-if="blockText" class="text-danger mb-1" data-testid="slot-block">{{ blockText }}</div>
    <div v-if="last" class="mb-2" data-testid="slot-result">
      <div v-for="(line, i) in spinsText" :key="i">{{ line }}</div>
      <div>{{ rewardText }}</div>
    </div>

    <h6 class="mt-3">礼券换蟹币</h6>
    <div class="d-flex gap-1 align-items-center mb-1">
      <input
        v-model.number="exNum"
        type="number"
        min="1"
        :max="Math.max(1, exMax)"
        class="form-control form-control-sm"
        style="width: 80px"
        data-testid="ex-num"
      />
      <button
        class="btn btn-sm btn-outline-success text-nowrap"
        data-testid="ex-go"
        :disabled="busy || !!exBlock"
        @click="exchange"
      >
        换 {{ exN }} 个（{{ exN * data.krabCoinTickets }} 张礼券）
      </button>
    </div>
    <div v-if="exBlock" class="text-danger mb-1" data-testid="ex-block">{{ exBlock }}</div>

    <h6 class="mt-3">奖池</h6>
    <table class="table table-sm mb-2" data-testid="slot-pool">
      <tbody>
        <tr v-for="a in slot.pool" :key="a.id">
          <td>
            {{ awardName(a.id) }}<span v-if="a.rare" class="badge text-bg-warning ms-1">稀有</span>
          </td>
          <td class="text-end">{{ (a.rate * 100).toFixed(2) }}%</td>
        </tr>
      </tbody>
    </table>

    <h6>我的统计</h6>
    <div data-testid="slot-stats">
      <span v-if="slot.stats.length === 0" class="text-muted">还没抽过</span>
      <template v-else>
        共 {{ statTotal }} 格：<span v-for="s in slot.stats" :key="s.awardId" class="me-2"
          >{{ awardName(s.awardId) }} {{ s.num }} 格</span
        >
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 酒吧页、路由、入口**

`apps/web/src/views/BarView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import CupPanel from '../components/bar/CupPanel.vue';
import FgPanel from '../components/bar/FgPanel.vue';
import NumPanel from '../components/bar/NumPanel.vue';
import SlotPanel from '../components/bar/SlotPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'fg' | 'cup' | 'num' | 'slot';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'fg', label: '划拳' },
  { key: 'cup', label: '猜酒杯' },
  { key: 'num', label: '转数字' },
  { key: 'slot', label: '老虎机' },
];
const KEY = 'dt_bar_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((x) => x.key === v) ? (v as Tab) : 'fg';
  } catch {
    return 'fg';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<BarDto | null>(null);

async function load() {
  try {
    data.value = await endpoints.bar();
  } catch (e) {
    toast.push(errorMessage(e, '读取酒吧失败'), 'danger');
  }
}
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
});
onMounted(load);
</script>

<template>
  <h5>酒吧</h5>
  <div v-if="data" class="small mb-2" data-testid="bar-wallet">
    神秘礼券 {{ data.tickets }}；蟹币 {{ data.krabCoins }}
  </div>
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x.key" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x.key }]"
        href="#"
        :data-testid="`tab-${x.key}`"
        @click.prevent="tab = x.key"
        >{{ x.label }}</a
      >
    </li>
  </ul>
  <template v-if="data">
    <FgPanel v-if="tab === 'fg'" :data="data" @reload="load" />
    <CupPanel v-else-if="tab === 'cup'" :data="data" @reload="load" />
    <NumPanel v-else-if="tab === 'num'" :data="data" @reload="load" />
    <SlotPanel v-else :data="data" @reload="load" />
  </template>
</template>
```

`apps/web/src/router.ts`：在 `/yard` 那条路由之后加：

```ts
  {
    path: '/bar',
    name: 'bar',
    component: () => import('./views/BarView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/views/MoreView.vue`：`base` 里 `{ to: '/yard', icon: 'bi-flower1', label: '菜园' },` 下面加：

```ts
  { to: '/bar', icon: 'bi-cup-straw', label: '酒吧' },
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/bar src/views/BarView.test.ts src/views/MoreView.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/web typecheck`
Expected: 无报错

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/web/src/components/bar apps/web/src/views/BarView.vue apps/web/src/views/BarView.test.ts apps/web/src/router.ts apps/web/src/views/MoreView.vue apps/web/src/views/MoreView.test.ts
git add apps/web/src
git commit -m "feat(web): bar page with slot machine and krab coin exchange

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/bar.spec.ts`
- Modify: `docs/rules/收益与加成.md`（末尾加第 9 节）
- Modify: `docs/deploy.md`（末尾加一节）

- [ ] **Step 1: 端到端测试**

`apps/web/e2e/bar.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('酒吧：划拳一次 → 礼券换蟹币 → 老虎机抽一次', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 神秘礼券定为 300 张（开店礼包可能已经送了一些）
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 1, 300)
       on conflict (rest_id, goods_id) do update set num = 300`,
      [restId],
    );

    await page.goto('/bar');
    await expect(page.getByTestId('bar-wallet')).toContainText('神秘礼券 300');
    await page.getByTestId('tab-fg').click();
    await page.getByTestId('fg-0').click();
    await expect(page.getByTestId('fg-result')).toContainText('你出石头');
    await expect(page.getByTestId('bar-wallet')).toContainText('神秘礼券 299');

    await page.getByTestId('tab-slot').click();
    await page.getByTestId('ex-num').fill('1');
    await page.getByTestId('ex-go').click();
    await expect(page.getByTestId('bar-wallet')).toContainText('蟹币 1');

    await page.getByTestId('slot-1').click();
    await expect(page.getByTestId('slot-result')).toContainText('第 1 次');
    await expect(page.getByTestId('slot-stats')).toContainText('共 3 格');
  } finally {
    await client.end();
  }
});
```

说明：划拳赢了的奖励等级 2 物品池里没有蟹币和礼券，所以划拳后礼券一定是 299、换完一定是 1 个蟹币；老虎机这一次可能抽到蟹币（奖项 13），所以抽完后不断言蟹币数量。

- [ ] **Step 2: 规则文档**

`docs/rules/收益与加成.md` 末尾追加：

```markdown

## 9. 酒吧（子项目 4C-1）

**随机奖励**（酒吧、厨塔共用）：类型按 食材 25%、物品 15%、银币 30%、经验 30% 抽（起点 −(幸运率/1000 + 奖励等级/100000)，超出算食材）。经验 = (50 + 幸运总值) × 奖励等级；银币 = 经验 × 2。物品从奖励等级在 [等级−4, 等级] 的非厨具道具里抽；食材从 1~min(等级, 5) 级的普通食材里抽；物品、食材按幸运率数量翻倍。酒吧的奖励不出神秘礼券。

**划拳**：每局 1 张礼券。胜率、平率各 25% + 幸运率。胜：奖励等级 2 + ⌊连胜/3⌋；连胜 5 发新闻。平：银币 = 餐厅等级 × 10 + 幸运总值。

**猜酒杯**：第 n 连要 n 张礼券，胜率 (1 + 幸运率)/(n + 1)，奖励等级 n + 1；连胜 4 发新闻。猜错后回到 1 张。

**转数字**：每次 8 张礼券，猜 1~25，胜率 1/25 + 幸运率/20；中了得一件奖励等级 10 的物品，必发新闻。

**老虎机**：要验证邮箱。每次 1 个蟹币，开 3 格，按奖池权重抽（空格约 76.7%）。连续 100 次（300 格）没出稀有必出蟹黄堡；每格还有 连续没出稀有的格数 × 0.00016% 的提前保底机会，持有神灯翻倍。同一次里相同奖项合并发放，稀有和标了新闻的奖项发新闻。

**兑换**：100 张礼券换 1 个蟹币。
```

- [ ] **Step 3: 部署文档**

`docs/deploy.md` 末尾追加：

```markdown

## 酒吧（子项目 4C-1）

- 迁移 0011 新建 `bar_state`（每店一行：三个游戏的上一局结果和连续次数、老虎机连续没出稀有的格数）、`bar_slot_stat`（老虎机按奖项累计格数）
- 新功能开关 `features.bar`（默认开）。关闭后酒吧接口返回"这个区服暂未开放该功能"，主线第 13 步和酒吧支线跳过
- 数值在 `tuning.bar`（划拳、猜酒杯、转数字的胜率和新闻门槛，蟹币兑换比例，老虎机保底，随机奖励的类型概率 `awardRates`）
- 老虎机奖池来自配置包的 `dataset/bar_slot_machine_award`（22 项）
- 任务 13、108 的链接改为 `/bar`；新状态键 `honor.potCount`（支线"集齐 4 株盆栽"）
```

- [ ] **Step 4: 本地跑端到端**

1. 停掉旧的 dev 进程：PowerShell `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tsx\\dist\\cli.mjs|vite\\bin\\vite.js' } | ForEach-Object { taskkill /T /F /PID $_.ProcessId }`
2. Run: `pnpm --filter @dt/server migrate:dev`
   Expected: 执行 `0011_bar`
3. 后台启动 `pnpm dev`，等输出里出现 "became leader" 和 "Server listening"
4. Run: `pnpm --filter @dt/web e2e`
   Expected: 全部通过（含新的 `bar.spec.ts`）

- [ ] **Step 5: 验收并提交**

Run: `pnpm test`
Expected: 全部通过

Run: `pnpm typecheck` 和 `pnpm lint`
Expected: 无报错

```bash
npx prettier --write apps/web/e2e/bar.spec.ts docs/rules/收益与加成.md docs/deploy.md
git add apps/web/e2e/bar.spec.ts docs/rules/收益与加成.md docs/deploy.md
git commit -m "test(e2e): bar flow; docs: bar rules and deploy notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
