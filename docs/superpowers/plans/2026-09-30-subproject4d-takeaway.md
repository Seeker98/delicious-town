# 子项目 4D「外卖」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能开通外卖、接全服公共单和自己刷的私人单、派骑手配送、到时领取（或用无人机立即完成）拿到银币、经验、声望和奖池道具；能雇好友当骑手，骑手会升级；主线第 34、35 步、支线「完成 100 次外卖配送」、活跃「配送外卖」开放。

**Architecture:** 配置包新增 `tuning.takeaway` 和道具 id；迁移 0013 建 `takeaway_state`、`takeaway_rider`、`takeaway_order`、`takeaway_delivery`。服务端新增 `modules/takeaway/`：纯函数 `rules.ts`（出单、数值快照、骑手属性和升级、奖池、结算系数）；`common.ts` 放公用读取和锁；`open.ts`、`orders.ts`、`deliver.ts`、`claim.ts`、`riders.ts`、`view.ts` 各管一块；`jobs.ts` 是整点补单和清理；`service.ts` 装配（写操作走 `runOp`，雇佣和"骑手是好友的领取"走 `runPairOp`），`routes.ts` 注册。前端新增 `/takeaway` 页（没开通时是开通面板，开通后三个标签：外卖单、配送中、骑手）。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4d-takeaway-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1/takeaway...` 下，由 `modules/takeaway/routes.ts` 的 `takeawayRoutes(svc)` 注册
- 写操作走 `runOp`（功能名 `takeaway`）；雇佣走 `runPairOp`（`friend: 'required'`）；骑手是好友时的领取走 `runPairOp`（`friend: 'none'`、`lenient: true`）；读接口开头 `d.shards.ensureFeature(ctx.shardId, 'takeaway')`
- 不新增错误码。原因名：`INVALID_STATE` reason `takeaway_closed`、`order_gone`、`order_taken`、`rider_gone`、`delivery_gone`、`not_arrived`（params `arriveAt`）、`target_npc`、`rider_hired`、`rider_self`、`rider_delivering`；`ALREADY_DONE` what `takeaway`；`REQUIREMENT_NOT_MET` reason `star`（`need`）、`not_learned`、`double`、`job_honor`；`LIMIT_REACHED` what `rider_busy`、`riders`（`max`）；`NOT_ENOUGH` renown / coin / diamond / goods / foods；`VALIDATION_FAILED`
- 事件键（`emitAction`）：`takeaway.open`（开通时 1 次）、`takeaway.deliver`（每次领取 1 次，成功失败都算）
- 流水来源：`takeaway.open`、`takeaway.refresh`、`takeaway.deliver`、`takeaway.claim`、`takeaway.rebate`、`takeaway.hire`、`takeaway.dismiss`
- 新闻：`takeaway.customer` `{goodsId}`（只写入，展示归 4E）
- 每日计数键：`takeaway.refresh`（日期一律传 `gameDay(o.now)`）
- 随机数一律走 `o.rng`（定时任务走 `d.rng()`）；每张单的顺序：食谱 → 品级 → 时长 → 有效期 → 声望；接单：成功率浮动；领取：成败 →（边牧）→ 奖池 →（礼券数量）→ 神秘顾客 →（失败原因）
- 浮点取整一律用 `fl(x) = Math.floor(x + 1e-9)`（避免 197.99999 被取成 197）
- 界面文字全部中文；按钮灰掉时写明原因；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交前对改动文件跑 `npx prettier --write`；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 测试命令：`pnpm --filter <包> exec vitest run <路径>`（各包没有 test 脚本）；类型检查 `pnpm --filter <包> typecheck`
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build`；`packages/config/data` 被 prettier 忽略，改 JSON 时插入文本块，不整体重写

## 计划层面的裁定（相对设计文档）

1. 表的主键用 `serial`（integer），不用设计文档 §4.1 写的 `bigserial`：Kysely 把 bigint 读成字符串，整数够用。代价：无
2. 蟹老板的雇佣报现有的 `INVALID_STATE target_npc`（前端已有文案"不能对蟹老板这样做"），不用 `npc`（它的文案是切磋专用的"不能和蟹老板切磋"）
3. 重复开通报 `ALREADY_DONE` 并带 `what: 'takeaway'`，前端 `ALREADY` 加"已经开通外卖了"
4. 咕咕、使命必达、边牧按加成汇总的键判断（`gugu`、`taFoodsDoubleFlag`、`taFailForceSuccessRate`，数据里就是这么配的）；工作证按设计文档用 `hasValidHonor(108)`
5. 骑手等级属性、奖池、神秘顾客道具都放 `tuning.takeaway`；失败原因 8 句放 `rules.ts` 常量（不需要区服调）
6. 雇佣列表的"不能雇"原因：`target_npc`、`star`、`mine`（已经是我的骑手）、`hired`（被别人雇了）
7. `task.test.ts` 的"跳过未开放功能"例子改成"区服关闭外卖后第 34、35 步跳到第 36 步"（外卖开放后主线不再有未实现的功能）；`periodic.test.ts` 的"未实现功能"例子改成 `town`
8. 概览的 `now` 给服务器时间，前端按它算剩余分钟（测试可控）；每张单附 `cookbookName`（前端目录里没有食谱名）
9. 领取时"骑手是不是好友"先无锁读一次决定用单店还是双店操作，进操作后带锁重读并校验；解雇和删店都会让旧读失效，操作内一律以带锁读为准
10. `GOODS` 只加 `takeawayTicket`（263）和 `shopJobHonor`（108）：设计文档 §4.2 列的珊迪、派大星放进 `tuning.takeaway.customer`，咕咕、使命必达按裁定 4 用加成键判断，代码里不直接引用它们的 id。代价：无

## Review Focus

1. **两个人同时接同一张公共单**：只有一个成功，另一个报 `order_taken`，他的食材和声望一点没少。→ Task 6 测试
2. **两家店互为对方的骑手、同时领取**：都能完成，不死锁，各自拿到对方给的回扣。→ Task 7 测试
3. **同一个好友同时被两个人雇**：只有一个成功，另一个报 `rider_hired`。→ Task 8 测试
4. **配送中的单过了有效期**：仍然能领取；整点清理不会删配送中的单。→ Task 5、Task 7 测试
5. **全部领取时有的还没到、有的骑手是好友**：只领已到达的，好友骑手那一单的回扣照发。→ Task 7 测试

---

## 文件结构

```
packages/config/src/tuning.ts、data/game/tuning.json   takeaway 段
packages/config/src/ids.ts                   GOODS.takeawayTicket、shopJobHonor
packages/config/src/build.ts                 奖池、神秘顾客、外卖券、工作证引用检查；品级概率合计为 1
packages/config/data/designed/tasks.json     任务 34、35、122 的 href → /takeaway
packages/shared/src/schemas/takeaway.ts      接口 body 和 DTO
apps/server/src/db/migrations/0013_takeaway.ts、0013.test.ts
apps/server/src/db/schema.ts                 4 张表类型
apps/server/src/core/features.ts             'takeaway'
apps/server/src/modules/task/service.ts      状态键 takeaway.open
apps/server/src/modules/takeaway/
  rules.ts            纯规则：出单、数值快照、骑手、奖池、结算系数
  rules.test.ts
  common.ts           KEY、fl、stateOf、requireOpen、levelsOf、busyCount、riderLuckRate、weatherEffects
  open.ts             openTakeaway
  orders.ts           rollOrders、fillPublic、cleanupOrders、refreshPrivate、takeawayPeriod
  deliver.ts          deliverOrder
  claim.ts            settleDelivery
  riders.ts           riderCandidates、hireRider、dismissRider
  view.ts             takeawayView
  jobs.ts             takeawayJobs
  service.ts          createTakeawayService
  routes.ts           takeawayRoutes
  testkit.ts          测试辅助：setWeather、addOrder、openFor
  open.test.ts、orders.test.ts、deliver.test.ts、claim.test.ts、riders.test.ts
apps/server/src/modules/index.ts、game.ts    注册服务、路由、定时任务
apps/web/src/api/endpoints.ts                takeaway 接口
apps/web/src/i18n/zh-CN.ts                   新原因的文案
apps/web/src/utils/labels.ts                 TAKEAWAY_GRADES
apps/web/src/components/takeaway/
  testData.ts
  OpenPanel.vue、OrdersPanel.vue、DeliveriesPanel.vue、RidersPanel.vue（各带 .test.ts）
apps/web/src/views/TakeawayView.vue、TakeawayView.test.ts
apps/web/src/router.ts                       /takeaway
apps/web/src/components/MoreLinks.vue        玩法里加"外卖"；MoreView.test.ts
apps/web/e2e/takeaway.spec.ts
docs/rules/收益与加成.md、docs/deploy.md
```

---

### Task 1: 配置——tuning.takeaway、道具 id、引用检查、任务跳转

**Files:**
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`
- Modify: `packages/config/src/ids.ts`、`packages/config/src/build.ts`
- Modify: `packages/config/data/designed/tasks.json`（任务 34、35、122 的 href）
- Test: `packages/config/src/build.test.ts`、`packages/config/src/runtime.test.ts`

**Interfaces:**
- Produces:
  - `Tuning['takeaway']`（字段见 Step 3）
  - `GOODS.takeawayTicket = 263`、`GOODS.shopJobHonor = 108`

- [ ] **Step 1: 写失败的测试**

在 `packages/config/src/build.test.ts` 末尾追加：

```ts
describe('外卖配置（子项目 4D）', () => {
  it('任务 34、35、122 跳到外卖页', () => {
    const { bundle } = buildBundle(source());
    for (const id of [34, 35, 122]) expect(bundle!.tasks.find((t) => t.id === id)!.href).toBe('/takeaway');
  });

  it('奖池、神秘顾客引用了不存在的道具', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as {
      takeaway: { awards: number[][]; customer: { success: number } };
    };
    tuning.takeaway.awards[1]![0] = 999998;
    tuning.takeaway.customer.success = 999999;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.takeaway.awards references unknown goods 999998');
    expect(errors).toContain('tuning.takeaway.customer references unknown goods 999999');
  });

  it('品级概率合计必须是 1', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { takeaway: { gradeRates: number[] } };
    tuning.takeaway.gradeRates[0] = 0.5;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.takeaway.gradeRates must sum to 1');
  });
});
```

在 `packages/config/src/runtime.test.ts` 末尾追加：

```ts
describe('外卖数值（子项目 4D）', () => {
  it('tuning.takeaway', () => {
    expect(config.tuning.takeaway).toMatchObject({
      openStar: 2,
      openRenown: 888,
      openCoin: 8_880_000,
      openDiamond: 300,
      refreshNum: 15,
      refreshCoin: 1_000_000,
      refreshRenown: 160,
      gradeRates: [0.4, 0.25, 0.15, 0.1, 0.05, 0.035, 0.015],
      customer: { base: 0.015, luckDiv: 50, success: 265, fail: 266 },
      rider: { maxLevel: 50, capLevels: [2, 5, 8], oddsBase: 800, oddsMax: 950 },
      awards: [
        [1, 56, 0],
        [170, 30, 0.2],
        [240, 8, 0.5],
        [171, 6, 0.5],
        [172, 2, 0.8],
        [310, 1, 1],
      ],
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts src/runtime.test.ts`
Expected: FAIL——href 还是 `/town/takeaway`；`tuning.takeaway` 是 undefined

- [ ] **Step 3: 数值段、道具 id、任务跳转**

`packages/config/src/tuning.ts`：在 `tower: z.object({ ... }),` 整段之后、`});` 之前加：

```ts
  takeaway: z.object({
    openStar: int.min(0),
    openRenown: int.min(0),
    openCoin: int.min(0),
    openDiamond: int.min(0),
    publicBase: int.min(0),
    publicRand: int.min(1),
    publicPerOpen: int.min(1),
    publicMinOpen: int.min(0),
    publicOpenFloor: int.min(0),
    gradeRates: z.array(num).length(7),
    minutesBase: int.min(1),
    minutesPerGrade: int.min(1),
    renownPerGrade: int.min(0),
    refreshNum: int.min(1),
    refreshCoin: int.min(0),
    refreshRenown: int.min(0),
    priceLine: int.min(1),
    coinRates: z.tuple([num, num]),
    expRates: z.tuple([num, num]),
    expDiv: num,
    successFloat: int.min(2),
    luckOddsRate: num,
    privateExpRate: num,
    friendRiderRate: num,
    rebateDiv: int.min(1),
    failExpRate: num,
    customer: z.object({ base: num, luckDiv: num, success: int, fail: int }),
    rider: z.object({
      maxLevel: int.min(1),
      expPerLevel2: int.min(0),
      expBase: int.min(1),
      timeSubMax: int.min(0),
      expAdd: int.min(0),
      coinAdd: int.min(0),
      renownEvery: int.min(1),
      oddsBase: int.min(0),
      oddsPerLevel: int.min(0),
      oddsMax: int.min(0),
      maxNumEvery: int.min(1),
      capLevels: z.array(int),
      dismissCoin: int.min(0),
      dismissExp: int.min(0),
    }),
    awards: z.array(z.tuple([int, int.min(0), num])).min(1),
    keepOpenDays: int.min(0),
    keepDoneDays: int.min(0),
  }),
```

`packages/config/data/game/tuning.json`：把文件末尾的

```
    "watchmanCook": { "hour": 5, "minute": 58, "priceSpread": 0.3 }
  }
}
```

改成

```
    "watchmanCook": { "hour": 5, "minute": 58, "priceSpread": 0.3 }
  },
  "takeaway": {
    "openStar": 2, "openRenown": 888, "openCoin": 8880000, "openDiamond": 300,
    "publicBase": 5, "publicRand": 18, "publicPerOpen": 15, "publicMinOpen": 10, "publicOpenFloor": 30,
    "gradeRates": [0.4, 0.25, 0.15, 0.1, 0.05, 0.035, 0.015],
    "minutesBase": 20, "minutesPerGrade": 10, "renownPerGrade": 2,
    "refreshNum": 15, "refreshCoin": 1000000, "refreshRenown": 160,
    "priceLine": 1000000, "coinRates": [0.24, 0.05], "expRates": [0.72, 0.22], "expDiv": 45,
    "successFloat": 200, "luckOddsRate": 200,
    "privateExpRate": 1.5, "friendRiderRate": 0.9, "rebateDiv": 9, "failExpRate": 0.5,
    "customer": { "base": 0.015, "luckDiv": 50, "success": 265, "fail": 266 },
    "rider": {
      "maxLevel": 50, "expPerLevel2": 800, "expBase": 500, "timeSubMax": 40,
      "expAdd": 2, "coinAdd": 1, "renownEvery": 2,
      "oddsBase": 800, "oddsPerLevel": 5, "oddsMax": 950, "maxNumEvery": 5,
      "capLevels": [2, 5, 8], "dismissCoin": 50, "dismissExp": 500
    },
    "awards": [[1, 56, 0], [170, 30, 0.2], [240, 8, 0.5], [171, 6, 0.5], [172, 2, 0.8], [310, 1, 1]],
    "keepOpenDays": 1, "keepDoneDays": 7
  }
}
```

`packages/config/src/ids.ts`：在 `GOODS` 里 `towerTicket: 136, // 厨塔挑战券` 下面加：

```ts
  takeawayTicket: 263, // 外卖券
  shopJobHonor: 108, // 商店工作证（外卖私人刷新）
```

`packages/config/data/designed/tasks.json`：三处 `"href": "/town/takeaway"` 全部改成 `"href": "/takeaway"`（任务 34、35、122）：

```bash
sed -i 's#"href": "/town/takeaway"#"href": "/takeaway"#' packages/config/data/designed/tasks.json
```

- [ ] **Step 4: 构建检查**

`packages/config/src/build.ts`：在 `if (!goodsIds.has(136)) errors.push('tower references unknown goods 136');` 之后加：

```ts
  // ---------- 外卖（子项目 4D） ----------
  for (const [id] of tuning.takeaway.awards)
    if (!goodsIds.has(id)) errors.push(`tuning.takeaway.awards references unknown goods ${id}`);
  for (const id of [tuning.takeaway.customer.success, tuning.takeaway.customer.fail])
    if (!goodsIds.has(id)) errors.push(`tuning.takeaway.customer references unknown goods ${id}`);
  // 外卖券、商店工作证（GOODS.takeawayTicket / shopJobHonor）
  for (const id of [263, 108]) if (!goodsIds.has(id)) errors.push(`takeaway references unknown goods ${id}`);
  if (Math.abs(tuning.takeaway.gradeRates.reduce((s, x) => s + x, 0) - 1) > 1e-9)
    errors.push('tuning.takeaway.gradeRates must sum to 1');
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts src/runtime.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/config typecheck` 和 `pnpm --filter @dt/config build`
Expected: 都成功

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write packages/config/src/tuning.ts packages/config/src/ids.ts packages/config/src/build.ts packages/config/src/build.test.ts packages/config/src/runtime.test.ts
git add packages/config
git commit -m "feat(config): tuning.takeaway, takeaway goods ids, award checks, task links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0013、表类型

**Files:**
- Create: `apps/server/src/db/migrations/0013_takeaway.ts`、`apps/server/src/db/migrations/0013.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`

**Interfaces:**
- Produces: 表 `takeaway_state`、`takeaway_rider`、`takeaway_order`、`takeaway_delivery`；类型 `TakeawayStateTable`、`TakeawayRiderTable`、`TakeawayOrderTable`、`TakeawayDeliveryTable`、`TakeawayStateRow`、`TakeawayRiderRow`、`TakeawayOrderRow`、`TakeawayDeliveryRow`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/db/migrations/0013.test.ts`：

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
const now = new Date();

describe('迁移 0013', () => {
  it('开通状态每店一行，骑手上限默认 1', async () => {
    const a = await newRest();
    await db.insertInto('takeaway_state').values({ rest_id: a, opened_at: now }).execute();
    expect(
      await db.selectFrom('takeaway_state').select('rider_cap').where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({ rider_cap: 1 });
    await expect(db.insertInto('takeaway_state').values({ rest_id: a, opened_at: now }).execute()).rejects.toThrow();
  });

  it('骑手：同一雇主不能重复雇同一人；一家店只能被一个别人雇；自己给自己当骑手不算；等级 1~50', async () => {
    const a = await newRest();
    const b = await newRest();
    const c = await newRest();
    const r = await db
      .insertInto('takeaway_rider')
      .values({ rest_id: a, rider_rest_id: a, hired_at: now })
      .returning(['id', 'level', 'exp'])
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({ level: 1, exp: 0 });
    await db.insertInto('takeaway_rider').values({ rest_id: c, rider_rest_id: c, hired_at: now }).execute();
    await db.insertInto('takeaway_rider').values({ rest_id: a, rider_rest_id: c, hired_at: now }).execute();
    await expect(
      db.insertInto('takeaway_rider').values({ rest_id: b, rider_rest_id: c, hired_at: now }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('takeaway_rider').values({ rest_id: a, rider_rest_id: a, hired_at: now }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('takeaway_rider').values({ rest_id: b, rider_rest_id: b, hired_at: now, level: 51 }).execute(),
    ).rejects.toThrow();
  });

  it('外卖单和配送：品级 1~7；一张单只能有一次配送；删单级联删配送', async () => {
    const a = await newRest();
    const rider = await db
      .insertInto('takeaway_rider')
      .values({ rest_id: a, rider_rest_id: a, hired_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    const order = { shard_id: shard, cookbook_id: 1, grade: 1, need_minutes: 30, need_renown: 3, created_at: now, expires_at: now };
    await expect(db.insertInto('takeaway_order').values({ ...order, grade: 8 }).execute()).rejects.toThrow();
    const o = await db.insertInto('takeaway_order').values(order).returning(['id', 'state', 'owner_rest_id']).executeTakeFirstOrThrow();
    expect(o).toMatchObject({ state: 1, owner_rest_id: null });
    const v = {
      order_id: o.id,
      rest_id: a,
      rider_id: rider.id,
      grade: 1,
      private: false,
      double: false,
      mystery_kinds: 0,
      coin: 198,
      exp: 13,
      renown: 1,
      success_odds: 820,
      started_at: now,
      arrive_at: now,
    };
    const d = await db.insertInto('takeaway_delivery').values(v).returning(['id', 'state', 'drone']).executeTakeFirstOrThrow();
    expect(d).toMatchObject({ state: 1, drone: false });
    await expect(db.insertInto('takeaway_delivery').values(v).execute()).rejects.toThrow();
    await db.deleteFrom('takeaway_order').where('id', '=', o.id).execute();
    expect(await db.selectFrom('takeaway_delivery').select('id').where('id', '=', d.id).execute()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0013.test.ts`
Expected: FAIL——`relation "takeaway_state" does not exist`

- [ ] **Step 3: 迁移和表类型**

`apps/server/src/db/migrations/0013_takeaway.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table takeaway_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      rider_cap smallint not null default 1 check (rider_cap >= 1),
      opened_at timestamptz not null
    )`,
    sql`create table takeaway_rider (
      id serial primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      rider_rest_id integer not null references restaurant(id) on delete cascade,
      level smallint not null default 1 check (level between 1 and 50),
      exp integer not null default 0 check (exp >= 0),
      hired_at timestamptz not null,
      unique (rest_id, rider_rest_id)
    )`,
    sql`create unique index takeaway_rider_one_employer on takeaway_rider (rider_rest_id) where rider_rest_id <> rest_id`,
    sql`create table takeaway_order (
      id serial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      owner_rest_id integer references restaurant(id) on delete cascade,
      cookbook_id integer not null,
      grade smallint not null check (grade between 1 and 7),
      need_minutes integer not null check (need_minutes >= 1),
      need_renown integer not null check (need_renown >= 0),
      state smallint not null default 1 check (state in (1, 2, 3)),
      created_at timestamptz not null,
      expires_at timestamptz not null
    )`,
    sql`create index takeaway_order_open on takeaway_order (shard_id, state, expires_at)`,
    sql`create table takeaway_delivery (
      id serial primary key,
      order_id integer not null unique references takeaway_order(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      rider_id integer not null references takeaway_rider(id) on delete cascade,
      grade smallint not null check (grade between 1 and 7),
      private boolean not null,
      double boolean not null,
      mystery_kinds smallint not null check (mystery_kinds >= 0),
      coin integer not null check (coin >= 0),
      exp integer not null check (exp >= 0),
      renown integer not null,
      success_odds integer not null,
      started_at timestamptz not null,
      arrive_at timestamptz not null,
      state smallint not null default 1 check (state in (1, 2, 3)),
      drone boolean not null default false,
      result jsonb,
      settled_at timestamptz
    )`,
    sql`create index takeaway_delivery_rest on takeaway_delivery (rest_id, state)`,
    sql`create index takeaway_delivery_rider on takeaway_delivery (rider_id, state)`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['takeaway_delivery', 'takeaway_order', 'takeaway_rider', 'takeaway_state']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts`：在 `import * as m0012 from './0012_tower';` 下面加 `import * as m0013 from './0013_takeaway';`，在 `'0012_tower': m0012,` 下面加 `'0013_takeaway': m0013,`。

`apps/server/src/db/schema.ts`：在 `TowerRankTable` 接口定义之后加：

```ts
/** 外卖（子项目 4D）：有这一行 = 已开通 */
export interface TakeawayStateTable {
  rest_id: number;
  /** 可雇骑手上限（含自己） */
  rider_cap: Default<number>;
  opened_at: Date;
}

/** 骑手：rest_id 是雇主，rider_rest_id 是骑手店（自己给自己当骑手时两者相同） */
export interface TakeawayRiderTable {
  id: Generated<number>;
  rest_id: number;
  rider_rest_id: number;
  level: Default<number>;
  /** 当前等级里攒的经验 */
  exp: Default<number>;
  hired_at: Date;
}

/** 外卖单：owner_rest_id 为空是全服公共单，否则是这家店的私人单；state 1 可接、2 配送中、3 完成 */
export interface TakeawayOrderTable {
  id: Generated<number>;
  shard_id: number;
  owner_rest_id: Nullable<number>;
  cookbook_id: number;
  grade: number;
  need_minutes: number;
  need_renown: number;
  state: Default<number>;
  created_at: Date;
  expires_at: Date;
}

/** 一次配送：接单时定下的数值；state 1 配送中、2 成功、3 失败 */
export interface TakeawayDeliveryTable {
  id: Generated<number>;
  order_id: number;
  rest_id: number;
  rider_id: number;
  grade: number;
  private: boolean;
  double: boolean;
  mystery_kinds: number;
  coin: number;
  exp: number;
  renown: number;
  success_odds: number;
  started_at: Date;
  arrive_at: Date;
  state: Default<number>;
  drone: Default<boolean>;
  /** 领取结果（写入传 JSON 字符串） */
  result: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
  settled_at: TsNullable;
}
```

`DB` 接口里 `tower_rank: TowerRankTable;` 下面加：

```ts
  takeaway_state: TakeawayStateTable;
  takeaway_rider: TakeawayRiderTable;
  takeaway_order: TakeawayOrderTable;
  takeaway_delivery: TakeawayDeliveryTable;
```

在 `export type TowerStateRow = Selectable<TowerStateTable>;` 下面加：

```ts
export type TakeawayStateRow = Selectable<TakeawayStateTable>;
export type TakeawayRiderRow = Selectable<TakeawayRiderTable>;
export type TakeawayOrderRow = Selectable<TakeawayOrderTable>;
export type TakeawayDeliveryRow = Selectable<TakeawayDeliveryTable>;
```

（`Nullable`、`TsNullable`、`ColumnType` 都是 schema.ts 里已有的类型别名和导入）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0013.test.ts`
Expected: PASS（3 个测试）

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/db/migrations/0013_takeaway.ts apps/server/src/db/migrations/0013.test.ts apps/server/src/db/migrations/index.ts apps/server/src/db/schema.ts
git add apps/server/src/db
git commit -m "feat(server): migration 0013 takeaway state, riders, orders, deliveries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 外卖规则（纯函数）

**Files:**
- Create: `apps/server/src/modules/takeaway/rules.ts`
- Test: `apps/server/src/modules/takeaway/rules.test.ts`

**Interfaces:**
- Consumes: `Tuning['takeaway']`（Task 1）；`Rng`（`@dt/shared`）
- Produces（`rules.ts`，`TakeawayTuning = Tuning['takeaway']`）：
  - `fl(x: number): number`、`FAIL_REASONS: readonly string[]`（8 句）
  - `pickGrade(r: number, t): number`、`interface RolledOrder { cookbookId; grade; needMinutes; needRenown; expireMinutes }`、`rollOrder(rng: Rng, cookbookIds: readonly number[], t): RolledOrder`、`publicTarget(openNum: number, roll: number, t): number`
  - `interface RiderAttrs { timeSub; expAdd; coinAdd; renownAdd; odds; maxNum; needExp }`、`riderAttrs(level, t): RiderAttrs`、`addRiderExp(level, exp, add, t): { level; exp; gained }`、`riderCapAfter(cap, from, to, t): number`
  - `sumBonus(...parts: Array<Record<string, number>>): Record<string, number>`、`interface ValueInput { price; grade; myGrade; level; needMinutes; rider: RiderAttrs; bonus: Record<string, number>; luckRate: number; floatRoll: number }`、`interface OrderValues { minutes; coin; exp; renown; odds }`、`orderValues(v: ValueInput, t): OrderValues`
  - `awardWeights(grade, t): Array<[number, number]>`、`pickAward(r: number, grade, t): number`
  - `claimExp(exp, f: { double: boolean; friend: boolean; private: boolean }, t): number`、`riderExpGain(v: { grade; fail: boolean; drone: boolean; kinds: number; rate: number }): number`、`droneDiamonds(grade): number`、`customerRate(luckRate, t): number`
  - `takeawayPeriod(now: Date): string`（游戏时间 `YYYY-MM-DD HH`）

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/takeaway/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  addRiderExp,
  awardWeights,
  claimExp,
  customerRate,
  droneDiamonds,
  FAIL_REASONS,
  fl,
  orderValues,
  pickAward,
  pickGrade,
  publicTarget,
  riderAttrs,
  riderCapAfter,
  riderExpGain,
  rollOrder,
  sumBonus,
  takeawayPeriod,
} from './rules';

const t = testConfig().tuning.takeaway;

describe('出单（设计文档 §3.2）', () => {
  it('品级按概率：普通 40%、中品 25%、上品 15%、极品 10%、金牌 5%、珍品 3.5%、佳肴 1.5%', () => {
    expect([0, 0.3, 0.5, 0.7, 0.85, 0.92, 0.96, 0.99, 0.9999].map((r) => pickGrade(r, t))).toEqual([
      1, 1, 2, 3, 4, 5, 6, 7, 7,
    ]);
  });

  it('一张单：食谱 → 品级 → 时长 20+rand(10g) → 有效期 时长+rand(10g) → 声望 2g+rand[1,g]', () => {
    expect(rollOrder(sequenceRng([0.4]), [1, 2, 3, 4, 5], t)).toEqual({
      cookbookId: 3,
      grade: 2,
      needMinutes: 28,
      expireMinutes: 36,
      needRenown: 5,
    });
    expect(rollOrder(sequenceRng([0.1]), [1, 2, 3, 4, 5], t)).toEqual({
      cookbookId: 1,
      grade: 1,
      needMinutes: 21,
      expireMinutes: 22,
      needRenown: 3,
    });
  });

  it('公共单目标数 = rand(18) + 5 + ⌊营业店/15⌋，营业店不足 10 按 30', () => {
    expect(publicTarget(5, 0, t)).toBe(7);
    expect(publicTarget(45, 17, t)).toBe(25);
  });

  it('整点周期', () => {
    expect(takeawayPeriod(gameTime('2026-09-30', 7, 30))).toBe('2026-09-30 07');
  });
});

describe('骑手（设计文档 §3.5）', () => {
  it('属性由等级算出', () => {
    expect(riderAttrs(1, t)).toEqual({
      timeSub: 0,
      expAdd: 0,
      coinAdd: 0,
      renownAdd: 0,
      odds: 800,
      maxNum: 1,
      needExp: 1300,
    });
    expect(riderAttrs(11, t)).toEqual({
      timeSub: 10,
      expAdd: 20,
      coinAdd: 10,
      renownAdd: 5,
      odds: 850,
      maxNum: 3,
      needExp: 97300,
    });
    expect(riderAttrs(50, t)).toMatchObject({ timeSub: 40, odds: 950, maxNum: 11 });
  });

  it('升级可以连升；50 级封顶，经验不再增加', () => {
    expect(addRiderExp(1, 0, 6, t)).toEqual({ level: 1, exp: 6, gained: 0 });
    expect(addRiderExp(1, 1000, 5000, t)).toEqual({ level: 3, exp: 1000, gained: 2 });
    expect(addRiderExp(49, 0, 10_000_000, t)).toEqual({ level: 50, exp: 0, gained: 1 });
    expect(addRiderExp(50, 5, 100, t)).toEqual({ level: 50, exp: 5, gained: 0 });
  });

  it('自己的骑手升到 2、5、8 级时可雇上限 +1', () => {
    expect(riderCapAfter(1, 1, 3, t)).toBe(2);
    expect(riderCapAfter(2, 4, 9, t)).toBe(4);
    expect(riderCapAfter(4, 9, 20, t)).toBe(4);
  });
});

describe('接单时的数值（设计文档 §3.3）', () => {
  it('售价 750、单品级 1、我的品级 1、1 级店、1 级骑手、没有加成', () => {
    expect(
      orderValues(
        {
          price: 750,
          grade: 1,
          myGrade: 1,
          level: 1,
          needMinutes: 30,
          rider: riderAttrs(1, t),
          bonus: {},
          luckRate: 0,
          floatRoll: 80,
        },
        t,
      ),
    ).toEqual({ minutes: 30, coin: 198, exp: 13, renown: 1, odds: 820 });
  });

  it('售价过 100 万用低系数；骑手、天气、加成都算进去；时长按减时修正（设计文档裁定 5）', () => {
    expect(
      orderValues(
        {
          price: 2_000_000,
          grade: 2,
          myGrade: 5,
          level: 10,
          needMinutes: 40,
          rider: riderAttrs(11, t),
          bonus: sumBonus(
            { taNeedtimeRate: 0.5, taCoinRate: 0.1 },
            { taExpRate: 0.2, taRenownRate: 1, taSuccessoddsRate: -0.3 },
          ),
          luckRate: 0.4,
          floatRoll: 0,
        },
        t,
      ),
    ).toEqual({ minutes: 56, coin: 360000, exp: 410666, renown: 4, odds: 730 });
  });

  it('时长最少 1 分钟', () => {
    const v = orderValues(
      {
        price: 750,
        grade: 1,
        myGrade: 1,
        level: 1,
        needMinutes: 20,
        rider: riderAttrs(1, t),
        bonus: { taNeedtimeRate: -2 },
        luckRate: 0,
        floatRoll: 0,
      },
      t,
    );
    expect(v.minutes).toBe(1);
  });

  it('sumBonus 按键相加', () => {
    expect(sumBonus({ a: 1, b: 0.5 }, { b: 0.25 }, {})).toEqual({ a: 1, b: 0.75 });
  });
});

describe('结算（设计文档 §3.4、§3.6）', () => {
  it('奖池：品级越高礼券以外越多', () => {
    expect(awardWeights(1, t)).toEqual([
      [1, 56],
      [170, 30],
      [240, 8],
      [171, 6],
      [172, 2],
      [310, 1],
    ]);
    expect(awardWeights(3, t).map(([, w]) => fl(w * 10) / 10)).toEqual([56, 42, 16, 12, 5.2, 3]);
    expect(pickAward(0.4, 1, t)).toBe(1);
    expect(pickAward(0.99, 1, t)).toBe(172);
    expect(pickAward(0.999, 1, t)).toBe(310);
  });

  it('经验：加料 ×2、好友骑手 ×0.9、私人单 ×1.5（逐步取整）', () => {
    expect(claimExp(13, { double: false, friend: false, private: false }, t)).toBe(13);
    expect(claimExp(13, { double: true, friend: true, private: true }, t)).toBe(34);
  });

  it('骑手经验 = √(10g)×2×(失败×2)×(无人机×2)×(神秘食材种数+1)×(1+加成)', () => {
    expect(riderExpGain({ grade: 1, fail: false, drone: false, kinds: 0, rate: 0 })).toBe(6);
    expect(riderExpGain({ grade: 4, fail: true, drone: true, kinds: 1, rate: 3 })).toBe(404);
  });

  it('无人机钻石 2g+1；神秘顾客概率 1.5% + 幸运率/50；失败原因 8 句', () => {
    expect(droneDiamonds(3)).toBe(7);
    expect(customerRate(0.2, t)).toBeCloseTo(0.019, 10);
    expect(FAIL_REASONS).toHaveLength(8);
    expect(FAIL_REASONS[7]).toBe('顾客退单了!');
  });

  it('fl 先加一点点再取整', () => {
    expect(fl(197.99999999999997)).toBe(198);
    expect(fl(13.2)).toBe(13);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/rules.test.ts`
Expected: FAIL——`Failed to resolve import "./rules"`

- [ ] **Step 3: 实现**

`apps/server/src/modules/takeaway/rules.ts`：

```ts
import type { Tuning } from '@dt/config';
import { gameParts, type Rng } from '@dt/shared';

export type TakeawayTuning = Tuning['takeaway'];

/** 浮点取整：先加一点点，避免 197.99999 取成 197 */
export const fl = (x: number): number => Math.floor(x + 1e-9);

/** 配送失败的原因（原版 takeawayDeliveryFailRessonList） */
export const FAIL_REASONS: readonly string[] = [
  '遇到了大堵车!',
  '前轮爆胎了!',
  '前女友挡在路中间!',
  '电瓶车没电了!',
  '摔了一跤!',
  '接单太多了!',
  '顾客不满意!',
  '顾客退单了!',
];

/** 单品级：按 gradeRates 累加，r ∈ [0,1) */
export function pickGrade(r: number, t: TakeawayTuning): number {
  let acc = 0;
  for (let i = 0; i < t.gradeRates.length; i++) {
    acc += t.gradeRates[i]!;
    if (r < acc) return i + 1;
  }
  return t.gradeRates.length;
}

export interface RolledOrder {
  cookbookId: number;
  grade: number;
  needMinutes: number;
  needRenown: number;
  /** 从生成时起的有效分钟数 */
  expireMinutes: number;
}

/** 一张单（设计文档 §3.2）：随机数顺序 食谱 → 品级 → 时长 → 有效期 → 声望 */
export function rollOrder(rng: Rng, cookbookIds: readonly number[], t: TakeawayTuning): RolledOrder {
  const cookbookId = cookbookIds[rng.int(cookbookIds.length)]!;
  const grade = pickGrade(rng.next(), t);
  const needMinutes = t.minutesBase + rng.int(t.minutesPerGrade * grade);
  const expireMinutes = needMinutes + rng.int(t.minutesPerGrade * grade);
  const needRenown = t.renownPerGrade * grade + rng.intMin1(grade);
  return { cookbookId, grade, needMinutes, needRenown, expireMinutes };
}

/** 公共单目标数；roll = rng.int(publicRand) */
export function publicTarget(openNum: number, roll: number, t: TakeawayTuning): number {
  const n = openNum < t.publicMinOpen ? t.publicOpenFloor : openNum;
  return roll + t.publicBase + Math.floor(n / t.publicPerOpen);
}

export interface RiderAttrs {
  /** 减时 % */
  timeSub: number;
  /** 经验加成 % */
  expAdd: number;
  /** 银币加成 % */
  coinAdd: number;
  /** 声望加成 % */
  renownAdd: number;
  /** 成功率 ‰ */
  odds: number;
  /** 同时配送数 */
  maxNum: number;
  /** 升到下一级所需经验 */
  needExp: number;
}

/** 骑手属性（设计文档 §3.5，规格书 20.12） */
export function riderAttrs(level: number, t: TakeawayTuning): RiderAttrs {
  const r = t.rider;
  const n = level - 1;
  return {
    timeSub: Math.min(r.timeSubMax, n),
    expAdd: r.expAdd * n,
    coinAdd: r.coinAdd * n,
    renownAdd: Math.floor(n / r.renownEvery),
    odds: Math.min(r.oddsMax, r.oddsBase + r.oddsPerLevel * n),
    maxNum: 1 + Math.floor(level / r.maxNumEvery),
    needExp: level * level * r.expPerLevel2 + r.expBase,
  };
}

/** 骑手加经验并升级：可连升；到最高级后经验不再增加 */
export function addRiderExp(
  level: number,
  exp: number,
  add: number,
  t: TakeawayTuning,
): { level: number; exp: number; gained: number } {
  const max = t.rider.maxLevel;
  if (level >= max) return { level, exp, gained: 0 };
  let l = level;
  let e = exp + add;
  while (l < max && e >= riderAttrs(l, t).needExp) {
    e -= riderAttrs(l, t).needExp;
    l += 1;
  }
  if (l >= max) e = 0;
  return { level: l, exp: e, gained: l - level };
}

/** 自己的骑手从 from 级升到 to 级后的可雇上限 */
export function riderCapAfter(cap: number, from: number, to: number, t: TakeawayTuning): number {
  return cap + t.rider.capLevels.filter((x) => x > from && x <= to).length;
}

/** 几份加成按键相加（天气 + 餐厅加成汇总） */
export function sumBonus(...parts: Array<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export interface ValueInput {
  /** 食谱售价 */
  price: number;
  /** 单品级 */
  grade: number;
  /** 我这道菜的品级 */
  myGrade: number;
  /** 餐厅等级 */
  level: number;
  needMinutes: number;
  rider: RiderAttrs;
  /** 天气 + 餐厅加成（ta* 键） */
  bonus: Record<string, number>;
  /** 骑手的幸运率 */
  luckRate: number;
  /** rng.int(successFloat) */
  floatRoll: number;
}

export interface OrderValues {
  minutes: number;
  coin: number;
  exp: number;
  renown: number;
  /** 成功率 ‰ */
  odds: number;
}

/** 接单时定下的数值（设计文档 §3.3） */
export function orderValues(v: ValueInput, t: TakeawayTuning): OrderValues {
  const hi = v.price > t.priceLine ? 1 : 0;
  const base = v.price * v.grade * (1 + v.myGrade / 10);
  const b = (k: string) => v.bonus[k] ?? 0;
  return {
    minutes: Math.max(1, fl(v.needMinutes * (1 - v.rider.timeSub / 100 + b('taNeedtimeRate')))),
    coin: fl(t.coinRates[hi] * base * (1 + v.rider.coinAdd / 100 + b('taCoinRate'))),
    exp: fl(((t.expRates[hi] * base) / t.expDiv) * v.level * (1 + v.rider.expAdd / 100 + b('taExpRate'))),
    renown: fl(v.grade * (1 + v.rider.renownAdd / 100 + b('taRenownRate'))),
    odds:
      t.successFloat / 2 -
      v.floatRoll +
      v.rider.odds +
      Math.round(b('taSuccessoddsRate') * 1000) +
      fl(v.luckRate * t.luckOddsRate),
  };
}

/** 奖池权重（设计文档 §3.6）：[道具 id, 权重] */
export function awardWeights(grade: number, t: TakeawayTuning): Array<[number, number]> {
  return t.awards.map(([id, w, bonus]) => [id, w * (1 + bonus * (grade - 1))]);
}

/** 按权重抽一件，r ∈ [0,1) */
export function pickAward(r: number, grade: number, t: TakeawayTuning): number {
  const list = awardWeights(grade, t);
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [id, w] of list) {
    if (x < w) return id;
    x -= w;
  }
  return list[list.length - 1]![0];
}

/** 领取时的经验（设计文档 §3.4）：加料 ×2、好友骑手 ×0.9，再私人单 ×1.5 */
export function claimExp(
  exp: number,
  f: { double: boolean; friend: boolean; private: boolean },
  t: TakeawayTuning,
): number {
  const a = fl(exp * (f.double ? 2 : 1) * (f.friend ? t.friendRiderRate : 1));
  return f.private ? fl(a * t.privateExpRate) : a;
}

/** 骑手经验（规格书 14.4） */
export function riderExpGain(v: { grade: number; fail: boolean; drone: boolean; kinds: number; rate: number }): number {
  return fl(Math.sqrt(v.grade * 10) * 2 * (v.fail ? 2 : 1) * (v.drone ? 2 : 1) * (v.kinds + 1) * (1 + v.rate));
}

export function droneDiamonds(grade: number): number {
  return grade * 2 + 1;
}

export function customerRate(luckRate: number, t: TakeawayTuning): number {
  return t.customer.base + luckRate / t.customer.luckDiv;
}

/** 补单任务的周期：游戏时间的整点 */
export function takeawayPeriod(now: Date): string {
  const p = gameParts(now);
  return `${p.day} ${String(p.hour).padStart(2, '0')}`;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/rules.test.ts`
Expected: PASS（16 个测试）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/takeaway
git add apps/server/src/modules/takeaway
git commit -m "feat(server): takeaway rules — orders, values, riders, award pool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 开通和概览——接口 DTO、公用读取、服务装配、主线第 34 步

**Files:**
- Create: `packages/shared/src/schemas/takeaway.ts`；Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/takeaway/common.ts`、`open.ts`、`view.ts`、`service.ts`、`routes.ts`
- Create: `apps/server/src/modules/takeaway/open.test.ts`
- Modify: `apps/server/src/core/features.ts`、`apps/server/src/game.ts`、`apps/server/src/modules/index.ts`
- Modify: `apps/server/src/modules/task/service.ts`（状态键 `takeaway.open`）
- Modify: `apps/server/src/modules/task/task.test.ts`（"跳过未开放功能"的例子）、`apps/server/src/worker/periodic.test.ts`（"未实现功能"的例子）

**Interfaces:**
- Consumes: Task 1 `Tuning['takeaway']`、`GOODS.takeawayTicket`、`GOODS.shopJobHonor`；Task 2 表；Task 3 `riderAttrs`、`droneDiamonds`、`TakeawayTuning`
- Produces:
  - `@dt/shared`：`takeawayOpenBody`、`takeawayDeliverBody`、`takeawayClaimBody`、`takeawayHireBody`、`takeawayRiderBody`；`TakeawayOrderDto`、`TakeawayDeliveryDto`、`TakeawayRiderDto`、`TakeawayOpenInfoDto`、`TakeawayDto`、`TakeawayClaimDto`、`RiderCandidateDto`
  - `common.ts`：`KEY`（`refresh`）、`stateOf(db, restId): Promise<TakeawayStateRow | undefined>`、`requireOpen(o: Op): Promise<TakeawayStateRow>`（带锁）、`levelsOf(db, restId): Promise<Uint8Array>`、`busyCount(db, riderId): Promise<number>`、`busyByRider(db, restId): Promise<Map<number, number>>`、`riderLuckRate(o: Op, riderRestId: number): Promise<number>`、`validNum(db, restId, goodsId, now): Promise<number>`
  - `open.ts`：`openTakeaway(o: Op, way: 'ticket' | 'coin'): Promise<{ opened: true }>`
  - `view.ts`：`riderDto(r: TakeawayRiderRow, name: string, busy: number, t): TakeawayRiderDto`、`takeawayView(db, config, rest, tuning: Tuning, now): Promise<TakeawayDto>`
  - `createTakeawayService(d)`：`overview(ctx)`、`open(ctx, {way})`；`TakeawayService`；`takeawayRoutes(svc)`：`GET /takeaway`、`POST /takeaway/open`；`game.takeaway`

- [ ] **Step 1: 写接口 DTO**

`packages/shared/src/schemas/takeaway.ts`：

```ts
import { z } from 'zod';

const id = z.number().int().positive();
export const takeawayOpenBody = z.object({ way: z.enum(['ticket', 'coin']) });
export const takeawayDeliverBody = z.object({ orderId: id, riderId: id, double: z.boolean().default(false) });
export const takeawayClaimBody = z.object({ deliveryId: id, drone: z.boolean().default(false) });
export const takeawayHireBody = z.object({ restId: id });
export const takeawayRiderBody = z.object({ riderId: id });

export interface TakeawayOrderDto {
  id: number;
  cookbookId: number;
  cookbookName: string;
  /** 单品级 1 普通 … 7 佳肴 */
  grade: number;
  needMinutes: number;
  needRenown: number;
  expiresAt: string;
  /** 我的私人单 */
  private: boolean;
  /** 按我这道菜的品级要的食材（没学会按品级 1），need 已乘单品级 */
  foods: Array<{ foodsId: number; need: number; have: number }>;
  /** 不能接的原因；可以接为 null（加料另算） */
  block: 'not_learned' | 'renown' | 'foods' | null;
}

export interface TakeawayDeliveryDto {
  id: number;
  orderId: number;
  cookbookId: number;
  cookbookName: string;
  grade: number;
  private: boolean;
  double: boolean;
  riderId: number;
  riderName: string;
  arriveAt: string;
  arrived: boolean;
  /** 用无人机要的钻石 */
  drone: number;
}

export interface TakeawayRiderDto {
  id: number;
  /** 骑手店 */
  restId: number;
  name: string;
  self: boolean;
  level: number;
  exp: number;
  needExp: number;
  timeSub: number;
  expAdd: number;
  coinAdd: number;
  renownAdd: number;
  /** 成功率 ‰ */
  odds: number;
  maxNum: number;
  /** 正在送几单 */
  busy: number;
  /** 解雇要花的银币、得到的经验（自己为 0） */
  dismissCoin: number;
  dismissExp: number;
}

export interface TakeawayOpenInfoDto {
  needStar: number;
  needRenown: number;
  needCoin: number;
  needDiamond: number;
  /** 持有的外卖券 */
  tickets: number;
}

export interface TakeawayDto {
  opened: boolean;
  open: TakeawayOpenInfoDto;
  orders: TakeawayOrderDto[];
  deliveries: TakeawayDeliveryDto[];
  riders: TakeawayRiderDto[];
  riderCap: number;
  /** 持有使命必达，可以加料 */
  canDouble: boolean;
  /** 私人刷新：这一次的费用、有没有有效的商店工作证 */
  refresh: { cost: number; hasJob: boolean };
  star: number;
  renown: number;
  coin: number;
  diamond: number;
  /** 服务器时间 */
  now: string;
}

export interface TakeawayClaimDto {
  deliveryId: number;
  success: boolean;
  /** 边牧把失败改判成功 */
  forced: boolean;
  drone: boolean;
  /** 失败原因 */
  reason: string | null;
  coin: number;
  exp: number;
  renown: number;
  goods: { id: number; num: number } | null;
  riderExp: number;
  riderLevel: number;
  /** 神秘顾客给的道具 */
  customer: number | null;
}

export interface RiderCandidateDto {
  restId: number;
  name: string;
  level: number;
  star: number;
  /** 不能雇的原因 */
  block: 'target_npc' | 'star' | 'mine' | 'hired' | null;
}
```

`packages/shared/src/index.ts` 末尾加 `export * from './schemas/takeaway';`。

- [ ] **Step 2: 写失败的服务测试**

`apps/server/src/modules/takeaway/open.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-09-30';
const READY = { star_level: 2, renown: 1000 };
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const open = (ctx: RestCtx, way: 'ticket' | 'coin') => t.game.takeaway.open(ctx, { way });

describe('开通（设计文档 §3.1）', () => {
  it('没开通：概览给开通条件和持有的外卖券', async () => {
    const ctx = await newRestaurant(t, { patch: READY, goods: { 263: 1 } });
    expect(await t.game.takeaway.overview(ctx)).toMatchObject({
      opened: false,
      open: { needStar: 2, needRenown: 888, needCoin: 8_880_000, needDiamond: 300, tickets: 1 },
      orders: [],
      deliveries: [],
      riders: [],
      riderCap: 0,
      star: 2,
      renown: 1000,
      now: gameTime(DAY, 12).toISOString(),
    });
  });

  it('用外卖券开通：扣 888 声望和 1 张券，自己成为 1 号骑手；主线第 34 步完成', async () => {
    const ctx = await newRestaurant(t, { patch: { ...READY, main_task_step: 34 }, goods: { 263: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 34, key: 'takeaway.open', done: false });
    expect((await open(ctx, 'ticket')).data).toEqual({ opened: true });
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(112);
    expect(await goodsNum(t, ctx.restaurantId, 263)).toBe(0);
    const v = await t.game.takeaway.overview(ctx);
    expect(v).toMatchObject({ opened: true, riderCap: 1, canDouble: false, refresh: { cost: 1_000_000, hasJob: false } });
    expect(v.riders).toEqual([
      {
        id: expect.any(Number),
        restId: ctx.restaurantId,
        name: expect.any(String),
        self: true,
        level: 1,
        exp: 0,
        needExp: 1300,
        timeSub: 0,
        expAdd: 0,
        coinAdd: 0,
        renownAdd: 0,
        odds: 800,
        maxNum: 1,
        busy: 0,
        dismissCoin: 0,
        dismissExp: 0,
      },
    ]);
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 34, progress: 1, done: true });
  });

  it('用银币和钻石开通', async () => {
    const ctx = await newRestaurant(t, { patch: { ...READY, coin: 9_000_000, diamond: 300 } });
    await open(ctx, 'coin');
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 120_000, diamond: 0, renown: 112 });
  });

  it('条件：星级、声望、外卖券、银币不够；重复开通；失败时什么都不扣', async () => {
    const low = await newRestaurant(t, { patch: { star_level: 1, renown: 1000 }, goods: { 263: 1 } });
    await expect(open(low, 'ticket')).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 2 },
    });
    const poor = await newRestaurant(t, { patch: { star_level: 2, renown: 887 }, goods: { 263: 1 } });
    await expect(open(poor, 'ticket')).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 888, have: 887 },
    });
    const bare = await newRestaurant(t, { patch: READY });
    await expect(open(bare, 'ticket')).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'goods' } });
    await expect(open(bare, 'coin')).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'coin' } });
    expect((await restRow(t, bare.restaurantId)).renown).toBe(1000);
    expect((await t.game.takeaway.overview(bare)).opened).toBe(false);
    const twice = await newRestaurant(t, { patch: READY, goods: { 263: 2 } });
    await open(twice, 'ticket');
    await expect(open(twice, 'ticket')).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'takeaway' } });
    expect(await goodsNum(t, twice.restaurantId, 263)).toBe(1);
  });

  it('区服关闭 takeaway：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: READY, goods: { 263: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { takeaway: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.takeaway.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(open(ctx, 'ticket')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/open.test.ts`
Expected: FAIL——`Cannot read properties of undefined (reading 'overview')`（`t.game.takeaway` 不存在）

- [ ] **Step 4: 公用读取、开通、概览**

`apps/server/src/modules/takeaway/common.ts`：

```ts
import type { Kysely } from 'kysely';
import { luckRate } from '@dt/shared';
import { invalidState } from '../../core/errors';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import type { DB, TakeawayStateRow } from '../../db/schema';

/** 每日计数键（日期一律传游戏日） */
export const KEY = { refresh: 'takeaway.refresh' } as const;

export function stateOf(db: Kysely<DB>, restId: number): Promise<TakeawayStateRow | undefined> {
  return db.selectFrom('takeaway_state').selectAll().where('rest_id', '=', restId).executeTakeFirst();
}

/** 已开通才能做的操作：取开通状态并锁住（整个操作已经锁了店） */
export async function requireOpen(o: Op): Promise<TakeawayStateRow> {
  const s = await o.tx
    .selectFrom('takeaway_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirst();
  if (!s) throw invalidState('takeaway_closed');
  return s;
}

/** 已学食谱的品级表：下标 = 食谱 id */
export async function levelsOf(db: Kysely<DB>, restId: number): Promise<Uint8Array> {
  const r = await db
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', restId)
    .executeTakeFirstOrThrow();
  return new Uint8Array(r.levels);
}

/** 这个骑手正在送几单 */
export async function busyCount(db: Kysely<DB>, riderId: number): Promise<number> {
  const r = await db
    .selectFrom('takeaway_delivery')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rider_id', '=', riderId)
    .where('state', '=', 1)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 我的每个骑手正在送几单，键 = 骑手 id */
export async function busyByRider(db: Kysely<DB>, restId: number): Promise<Map<number, number>> {
  const rows = await db
    .selectFrom('takeaway_delivery')
    .select(['rider_id', (eb) => eb.fn.countAll<number>().as('n')])
    .where('rest_id', '=', restId)
    .where('state', '=', 1)
    .groupBy('rider_id')
    .execute();
  return new Map(rows.map((r) => [r.rider_id, Number(r.n)]));
}

/** 骑手的幸运率：自己用本操作重算的汇总；好友骑手用他缓存的汇总，不锁他的店（设计文档裁定 9） */
export async function riderLuckRate(o: Op, riderRestId: number): Promise<number> {
  if (riderRestId === o.rest.id) return (await opLuck(o)).rate;
  const r = await o.tx
    .selectFrom('restaurant')
    .select(['luck', 'effect_agg'])
    .where('id', '=', riderRestId)
    .executeTakeFirstOrThrow();
  return luckRate(r.luck + (r.effect_agg.luckValue ?? 0));
}

/** 持有数量；已过期的勋章算 0（不在操作里时用） */
export async function validNum(db: Kysely<DB>, restId: number, goodsId: number, now: Date): Promise<number> {
  const r = await db
    .selectFrom('store_item')
    .select(['num', 'expires_at'])
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  if (!r || (r.expires_at !== null && r.expires_at <= now)) return 0;
  return r.num;
}
```

`apps/server/src/modules/takeaway/open.ts`：

```ts
import { GOODS } from '@dt/config';
import { ErrorCode } from '@dt/shared';
import { emitAction } from '../../core/action';
import { notEnough, requirement } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { gainRenown, spendCoin, spendDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { consumeGoods } from '../store/goods';
import { stateOf } from './common';

/** 开通（设计文档 §3.1）：检查顺序 已开通 → 星级 → 声望 → 付费；自己成为 1 号骑手 */
export async function openTakeaway(o: Op, way: 'ticket' | 'coin'): Promise<{ opened: true }> {
  const t = o.tuning.takeaway;
  if (await stateOf(o.tx, o.rest.id)) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'takeaway' });
  if (o.rest.star_level < t.openStar) throw requirement('star', { need: t.openStar });
  if (o.rest.renown < t.openRenown) throw notEnough('renown', t.openRenown, o.rest.renown);
  if (way === 'ticket') {
    await consumeGoods(o, GOODS.takeawayTicket, 1);
  } else {
    spendCoin(o, t.openCoin);
    spendDiamond(o, t.openDiamond);
  }
  gainRenown(o, -t.openRenown);
  await o.tx.insertInto('takeaway_state').values({ rest_id: o.rest.id, opened_at: o.now }).execute();
  await o.tx
    .insertInto('takeaway_rider')
    .values({ rest_id: o.rest.id, rider_rest_id: o.rest.id, hired_at: o.now })
    .execute();
  restLog(o, 'takeaway.open', { way });
  await emitAction(o, 'takeaway.open');
  return { opened: true };
}
```

`apps/server/src/modules/takeaway/view.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type GameConfig, type Tuning } from '@dt/config';
import { gameDay, type TakeawayDto, type TakeawayOrderDto, type TakeawayRiderDto } from '@dt/shared';
import type { DB, RestaurantRow, TakeawayOrderRow, TakeawayRiderRow } from '../../db/schema';
import { mergeNeed } from '../cookbook/rules';
import { getDaily } from '../counter/dailyCounter';
import { foodsMap } from '../cupboard/foods';
import { getEffectAgg } from '../effects/service';
import { busyByRider, KEY, levelsOf, stateOf, validNum } from './common';
import { droneDiamonds, riderAttrs, type TakeawayTuning } from './rules';

export function riderDto(r: TakeawayRiderRow, name: string, busy: number, t: TakeawayTuning): TakeawayRiderDto {
  const a = riderAttrs(r.level, t);
  const self = r.rider_rest_id === r.rest_id;
  return {
    id: r.id,
    restId: r.rider_rest_id,
    name,
    self,
    level: r.level,
    exp: r.exp,
    needExp: a.needExp,
    timeSub: a.timeSub,
    expAdd: a.expAdd,
    coinAdd: a.coinAdd,
    renownAdd: a.renownAdd,
    odds: a.odds,
    maxNum: a.maxNum,
    busy,
    dismissCoin: self ? 0 : r.exp * t.rider.dismissCoin,
    dismissExp: self ? 0 : r.exp * t.rider.dismissExp,
  };
}

/** 一张单：要的食材（按我这道菜的品级；没学会按品级 1）和不能接的原因 */
function orderDto(
  o: TakeawayOrderRow,
  config: GameConfig,
  myGrade: number,
  have: (id: number) => number,
  renown: number,
  me: number,
): TakeawayOrderDto {
  const cb = config.requireCookbook(o.cookbook_id);
  const foods = mergeNeed(cb.needFoods[Math.max(1, myGrade)] ?? []).map((f) => ({
    foodsId: f.foodsId,
    need: f.num * o.grade,
    have: have(f.foodsId),
  }));
  const block =
    myGrade < 1
      ? 'not_learned'
      : renown < o.need_renown
        ? 'renown'
        : foods.some((f) => f.have < f.need)
          ? 'foods'
          : null;
  return {
    id: o.id,
    cookbookId: o.cookbook_id,
    cookbookName: cb.name,
    grade: o.grade,
    needMinutes: o.need_minutes,
    needRenown: o.need_renown,
    expiresAt: o.expires_at.toISOString(),
    private: o.owner_rest_id === me,
    foods,
    block,
  };
}

/** 概览（设计文档 §5）：没开通时只给开通条件 */
export async function takeawayView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  tuning: Tuning,
  now: Date,
): Promise<TakeawayDto> {
  const t = tuning.takeaway;
  const base = {
    open: {
      needStar: t.openStar,
      needRenown: t.openRenown,
      needCoin: t.openCoin,
      needDiamond: t.openDiamond,
      tickets: await validNum(db, rest.id, GOODS.takeawayTicket, now),
    },
    star: rest.star_level,
    renown: rest.renown,
    coin: rest.coin,
    diamond: rest.diamond,
    now: now.toISOString(),
  };
  const state = await stateOf(db, rest.id);
  if (!state)
    return {
      ...base,
      opened: false,
      orders: [],
      deliveries: [],
      riders: [],
      riderCap: 0,
      canDouble: false,
      refresh: { cost: t.refreshCoin, hasJob: false },
    };
  const levels = await levelsOf(db, rest.id);
  const cupboard = await foodsMap(db, rest.id);
  const have = (id: number) => cupboard.get(id)?.num ?? 0;
  const orders = await db
    .selectFrom('takeaway_order')
    .selectAll()
    .where('shard_id', '=', rest.shard_id)
    .where('state', '=', 1)
    .where('expires_at', '>', now)
    .where((eb) => eb.or([eb('owner_rest_id', 'is', null), eb('owner_rest_id', '=', rest.id)]))
    .orderBy('expires_at')
    .orderBy('id')
    .execute();
  const deliveries = await db
    .selectFrom('takeaway_delivery as v')
    .innerJoin('takeaway_order as o', 'o.id', 'v.order_id')
    .innerJoin('takeaway_rider as r', 'r.id', 'v.rider_id')
    .innerJoin('restaurant as x', 'x.id', 'r.rider_rest_id')
    .select(['v.id', 'v.order_id', 'v.grade', 'v.private', 'v.double', 'v.rider_id', 'v.arrive_at', 'o.cookbook_id', 'x.name'])
    .where('v.rest_id', '=', rest.id)
    .where('v.state', '=', 1)
    .orderBy('v.arrive_at')
    .orderBy('v.id')
    .execute();
  const riders = await db
    .selectFrom('takeaway_rider as r')
    .innerJoin('restaurant as x', 'x.id', 'r.rider_rest_id')
    .selectAll('r')
    .select('x.name')
    .where('r.rest_id', '=', rest.id)
    .orderBy('r.id')
    .execute();
  const busy = await busyByRider(db, rest.id);
  const times = await getDaily(db, rest.id, KEY.refresh, gameDay(now));
  const agg = await getEffectAgg(db, rest.id, now, config, tuning);
  return {
    ...base,
    opened: true,
    orders: orders.map((o) => orderDto(o, config, levels[o.cookbook_id] ?? 0, have, rest.renown, rest.id)),
    deliveries: deliveries.map((v) => ({
      id: v.id,
      orderId: v.order_id,
      cookbookId: v.cookbook_id,
      cookbookName: config.requireCookbook(v.cookbook_id).name,
      grade: v.grade,
      private: v.private,
      double: v.double,
      riderId: v.rider_id,
      riderName: v.name,
      arriveAt: v.arrive_at.toISOString(),
      arrived: v.arrive_at <= now,
      drone: droneDiamonds(v.grade),
    })),
    riders: riders
      .map((r) => riderDto(r, r.name, busy.get(r.id) ?? 0, t))
      .sort((a, b) => Number(b.self) - Number(a.self) || a.id - b.id),
    riderCap: state.rider_cap,
    canDouble: (agg.taFoodsDoubleFlag ?? 0) > 0,
    refresh: {
      cost: t.refreshCoin * (times + 1),
      hasJob: (await validNum(db, rest.id, GOODS.shopJobHonor, now)) > 0,
    },
  };
}
```

- [ ] **Step 5: 服务、路由、注册、主线状态**

`apps/server/src/modules/takeaway/service.ts`：

```ts
import type { TakeawayDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { openTakeaway } from './open';
import { takeawayView } from './view';

export function createTakeawayService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'takeaway', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return {
    async overview(ctx: RestCtx): Promise<TakeawayDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'takeaway');
      return takeawayView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning, d.now());
    },
    open(ctx: RestCtx, b: { way: 'ticket' | 'coin' }) {
      return op(ctx, 'takeaway.open', (o) => openTakeaway(o, b.way));
    },
  };
}

export type TakeawayService = ReturnType<typeof createTakeawayService>;
```

`apps/server/src/modules/takeaway/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { takeawayOpenBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TakeawayService } from './service';

export function takeawayRoutes(svc: TakeawayService): FastifyPluginAsync {
  return async (r) => {
    r.get('/takeaway', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/takeaway/open', async (req) =>
      okOp(await svc.open(restCtxOf(req), parse(takeawayOpenBody, req.body))),
    );
  };
}
```

`apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 里 `'tower',` 下面加 `'takeaway',`。

`apps/server/src/game.ts`：
- 在 `import { createTowerService, type TowerService } from './modules/tower/service';` 下面加 `import { createTakeawayService, type TakeawayService } from './modules/takeaway/service';`
- `Game` 接口里 `tower: TowerService;` 下面加 `takeaway: TakeawayService;`
- 返回对象里 `tower: createTowerService(deps),` 下面加 `takeaway: createTakeawayService(deps),`

`apps/server/src/modules/index.ts`：
- 在 `import { towerRoutes } from './tower/routes';` 下面加 `import { takeawayRoutes } from './takeaway/routes';`
- 在 `app.register(towerRoutes(game.tower), { prefix: '/api/v1' });` 下面加 `app.register(takeawayRoutes(game.takeaway), { prefix: '/api/v1' });`

`apps/server/src/modules/task/service.ts`：在 `const extra = {` 之前加：

```ts
    const takeaway = await db
      .selectFrom('takeaway_state')
      .select('rest_id')
      .where('rest_id', '=', rest.id)
      .executeTakeFirst();
```

并在 `extra` 里 `'honor.potCount': pots,` 下面加 `'takeaway.open': takeaway ? 1 : 0,`。

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm test`
Expected: 除下面两个旧测试外全部通过。外卖开放后它们一定会失败（和 4C-2 同样的原因），按下面改（计划裁定 7）：

`apps/server/src/modules/task/task.test.ts`：4C-2 改成的"第 34、35 步外卖跳到第 36 步投喂克拉肯"整个 `it(...)` 换成：

```ts
  it('跳过区服关闭的功能（设计文档 裁定 7）：关掉外卖后第 34、35 步跳到第 36 步投喂克拉肯', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 34, level: 5 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { takeaway: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    const list = await task().tasks(ctx);
    expect(list.mainStep).toBe(36);
    expect(list.main).toMatchObject({ step: 36, key: 'kraken.feed', done: false });
  });
```

`apps/server/src/worker/periodic.test.ts`：`const f = job('f', 'takeaway', 'k');` 改成 `const f = job('f', 'town', 'k');`。

再跑 `pnpm test`，Expected：全部通过。

```bash
npx prettier --write packages/shared/src/schemas/takeaway.ts packages/shared/src/index.ts apps/server/src/modules/takeaway apps/server/src/core/features.ts apps/server/src/game.ts apps/server/src/modules/index.ts apps/server/src/modules/task apps/server/src/worker/periodic.test.ts
git add packages/shared apps/server/src
git commit -m "feat(server): open takeaway, overview, main task step 34

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 外卖单——整点补单、清理、私人刷新

**Files:**
- Create: `apps/server/test/takeaway.ts`（测试辅助）
- Create: `apps/server/src/modules/takeaway/orders.ts`、`jobs.ts`
- Modify: `apps/server/src/modules/takeaway/service.ts`、`routes.ts`、`apps/server/src/game.ts`（注册定时任务）
- Test: `apps/server/src/modules/takeaway/orders.test.ts`

**Interfaces:**
- Consumes: Task 3 `rollOrder`、`publicTarget`、`takeawayPeriod`；Task 4 `KEY`、`requireOpen`、`takeawayView`
- Produces:
  - `test/takeaway.ts`：`openFor(t, ctx): Promise<number>`（返回自己骑手的 id）、`addRider(t, employer, riderRest, level?): Promise<number>`、`setWeather(t, shardId, weatherId)`、`interface OrderInit { owner?; cookbookId?; grade?; needMinutes?; needRenown?; expiresIn?; state?; createdAgo? }`、`addOrder(t, shardId, o?): Promise<number>`
  - `orders.ts`：`fillPublic(db, config, shardId, now, rng, t): Promise<number>`、`cleanupOrders(db, shardId, now, t): Promise<number>`、`refreshPrivate(o: Op): Promise<{ created: number }>`
  - `takeawayJobs(d): PeriodicJob[]`：`takeaway-orders`（`run` 返回 `{ created, removed }`）
  - 服务 `refresh(ctx)`；路由 `POST /takeaway/refresh`

- [ ] **Step 1: 测试辅助**

`apps/server/test/takeaway.ts`：

```ts
import type { RestCtx } from '../src/core/deps';
import type { TestGame } from './game';

/** 直接把这家店设成已开通：建开通状态和自己这个骑手；返回自己骑手的 id */
export async function openFor(t: TestGame, ctx: RestCtx): Promise<number> {
  await t.db.insertInto('takeaway_state').values({ rest_id: ctx.restaurantId, opened_at: t.clock.now }).execute();
  return addRider(t, ctx.restaurantId, ctx.restaurantId);
}

/** 直接雇一个骑手（跳过好友、星级、上限检查）；返回骑手 id */
export async function addRider(t: TestGame, employer: number, riderRest: number, level = 1): Promise<number> {
  const r = await t.db
    .insertInto('takeaway_rider')
    .values({ rest_id: employer, rider_rest_id: riderRest, level, hired_at: t.clock.now })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}

/** 固定区服天气（1 晴没有外卖加成，2 阴 外卖银币 +10%） */
export async function setWeather(t: TestGame, shardId: number, weatherId: number): Promise<void> {
  const until = new Date(t.clock.now.getTime() + 86_400_000);
  await t.db
    .insertInto('world_state')
    .values({ shard_id: shardId, weather_id: weatherId, weather_until: until, krab_street: 0, updated_at: t.clock.now })
    .onConflict((oc) => oc.column('shard_id').doUpdateSet({ weather_id: weatherId, weather_until: until }))
    .execute();
}

export interface OrderInit {
  /** 私人单的单主；默认公共单 */
  owner?: number | null;
  cookbookId?: number;
  grade?: number;
  needMinutes?: number;
  needRenown?: number;
  /** 从现在起还有几分钟过期（负数 = 已过期几分钟）；默认 60 */
  expiresIn?: number;
  state?: number;
  /** 几分钟前生成；默认 0 */
  createdAgo?: number;
}

/** 直接插一张外卖单；默认 公共、食谱 1（南煎丸子）、普通、30 分钟、声望 3 */
export async function addOrder(t: TestGame, shardId: number, o: OrderInit = {}): Promise<number> {
  const now = t.clock.now.getTime();
  const r = await t.db
    .insertInto('takeaway_order')
    .values({
      shard_id: shardId,
      owner_rest_id: o.owner ?? null,
      cookbook_id: o.cookbookId ?? 1,
      grade: o.grade ?? 1,
      need_minutes: o.needMinutes ?? 30,
      need_renown: o.needRenown ?? 3,
      state: o.state ?? 1,
      created_at: new Date(now - (o.createdAgo ?? 0) * 60_000),
      expires_at: new Date(now + (o.expiresIn ?? 60) * 60_000),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
```

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/takeaway/orders.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { addOrder, openFor } from '../../../test/takeaway';
import { grantGoods } from '../store/grant';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const runJob = async (shardId: number) =>
  t.game.jobs
    .find((j) => j.name === 'takeaway-orders')!
    .run({
      shardId,
      period: '2026-09-30 12',
      now: t.clock.now,
      settings: await t.game.shards.settings(shardId),
      log: { error: () => undefined },
    });
const idsIn = async (shardId: number) =>
  (await t.db.selectFrom('takeaway_order').select('id').where('shard_id', '=', shardId).execute()).map((r) => r.id);

describe('全服公共单（设计文档 §3.2）', () => {
  it('整点补单：营业店不足 10 按 30 算，目标 = rand(18) + 5 + 2；已有的有效单算在内', async () => {
    const ctx = await newRestaurant(t);
    expect(await runJob(ctx.shardId)).toEqual({ created: 14, removed: 0 });
    const rows = await t.db
      .selectFrom('takeaway_order')
      .selectAll()
      .where('shard_id', '=', ctx.shardId)
      .orderBy('id')
      .execute();
    expect(rows).toHaveLength(14);
    const ids = [...config.cookbooks.keys()].sort((a, b) => a - b);
    expect(rows[0]).toMatchObject({
      cookbook_id: ids[945],
      grade: 2,
      need_minutes: 28,
      need_renown: 5,
      state: 1,
      owner_rest_id: null,
    });
    expect(rows[0]!.expires_at.getTime() - t.clock.now.getTime()).toBe(36 * 60_000);
    expect(await runJob(ctx.shardId)).toEqual({ created: 0, removed: 0 });
  });

  it('清理：过期超过 1 天的未接单、7 天前完成的单删掉；配送中的不删（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t);
    const week = 8 * 24 * 60;
    const oldOpen = await addOrder(t, ctx.shardId, { expiresIn: -25 * 60 });
    const recentOpen = await addOrder(t, ctx.shardId, { expiresIn: -60 });
    const oldDone = await addOrder(t, ctx.shardId, { state: 3, createdAgo: week, expiresIn: -week });
    const oldDelivering = await addOrder(t, ctx.shardId, { state: 2, createdAgo: week, expiresIn: -week });
    expect((await runJob(ctx.shardId)).removed).toBe(2);
    const left = await idsIn(ctx.shardId);
    expect(left).toEqual(expect.arrayContaining([recentOpen, oldDelivering]));
    expect(left).not.toContain(oldOpen);
    expect(left).not.toContain(oldDone);
  });
});

describe('私人刷新（设计文档 §3.2、裁定 4）', () => {
  it('要工作证；100 万 × 今天第几次；送 160 声望；15 张只有自己能看到', async () => {
    const me = await newRestaurant(t, { patch: { coin: 5_000_000 } });
    const other = await newRestaurant(t, { shardId: me.shardId });
    await openFor(t, me);
    await openFor(t, other);
    await expect(t.game.takeaway.refresh(me)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'job_honor' },
    });
    await grantGoods(t.db, config, me.restaurantId, 108, 1, t.clock.now);
    expect((await t.game.takeaway.overview(me)).refresh).toEqual({ cost: 1_000_000, hasJob: true });
    expect((await t.game.takeaway.refresh(me)).data).toEqual({ created: 15 });
    expect(await restRow(t, me.restaurantId)).toMatchObject({ coin: 4_000_000, renown: 160 });
    const v = await t.game.takeaway.overview(me);
    expect(v.orders.filter((o) => o.private)).toHaveLength(15);
    expect(v.refresh.cost).toBe(2_000_000);
    await t.game.takeaway.refresh(me);
    expect((await restRow(t, me.restaurantId)).coin).toBe(2_000_000);
    await expect(t.game.takeaway.refresh(me)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin', need: 3_000_000 },
    });
    expect((await t.game.takeaway.overview(other)).orders).toEqual([]);
  });

  it('没开通不能刷新', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5_000_000 } });
    await grantGoods(t.db, config, ctx.restaurantId, 108, 1, t.clock.now);
    await expect(t.game.takeaway.refresh(ctx)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'takeaway_closed' },
    });
  });
});

describe('概览里的单（设计文档 §5）', () => {
  it('看得到公共单和自己的私人单，看不到别人的私人单、过期的和被接走的；每张单写明能不能接', async () => {
    const me = await newRestaurant(t, {
      patch: { renown: 3 },
      cookbooks: { 1: 1 },
      foods: { 239: 1, 242: 1, 250: 1 },
    });
    const other = await newRestaurant(t, { shardId: me.shardId });
    await openFor(t, me);
    const ok = await addOrder(t, me.shardId, { cookbookId: 1, needRenown: 3 });
    const mine = await addOrder(t, me.shardId, { owner: me.restaurantId, grade: 2, needRenown: 3 });
    const renown = await addOrder(t, me.shardId, { needRenown: 4 });
    const notLearned = await addOrder(t, me.shardId, { cookbookId: 3 });
    await addOrder(t, me.shardId, { owner: other.restaurantId });
    await addOrder(t, me.shardId, { expiresIn: -1 });
    await addOrder(t, me.shardId, { state: 2 });
    const v = await t.game.takeaway.overview(me);
    const byId = new Map(v.orders.map((o) => [o.id, o]));
    expect([...byId.keys()].sort((a, b) => a - b)).toEqual([ok, mine, renown, notLearned]);
    expect(byId.get(ok)).toMatchObject({
      cookbookName: '南煎丸子',
      grade: 1,
      needMinutes: 30,
      private: false,
      block: null,
      foods: [
        { foodsId: 239, need: 1, have: 1 },
        { foodsId: 242, need: 1, have: 1 },
        { foodsId: 250, need: 1, have: 1 },
      ],
    });
    expect(byId.get(mine)).toMatchObject({ private: true, block: 'foods' });
    expect(byId.get(mine)!.foods[0]).toEqual({ foodsId: 239, need: 2, have: 1 });
    expect(byId.get(renown)!.block).toBe('renown');
    expect(byId.get(notLearned)!.block).toBe('not_learned');
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/orders.test.ts`
Expected: FAIL——找不到 `takeaway-orders` 任务（`Cannot read properties of undefined (reading 'run')`）；`t.game.takeaway.refresh is not a function`

- [ ] **Step 4: 实现**

`apps/server/src/modules/takeaway/orders.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import { gameDay, type Rng } from '@dt/shared';
import { requirement } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { gainRenown, spendCoin } from '../../core/resources';
import type { DB } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { hasValidHonor } from '../store/goods';
import { KEY, requireOpen } from './common';
import { publicTarget, rollOrder, type TakeawayTuning } from './rules';

/** 全部食谱 id（升序，同样的随机数抽到同一道） */
function cookbookIds(config: GameConfig): number[] {
  return [...config.cookbooks.keys()].sort((a, b) => a - b);
}

/** 生成 n 张单写入；owner 为空是公共单 */
async function insertOrders(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  owner: number | null,
  n: number,
  now: Date,
  rng: Rng,
  t: TakeawayTuning,
): Promise<void> {
  if (n <= 0) return;
  const ids = cookbookIds(config);
  const rows = Array.from({ length: n }, () => {
    const r = rollOrder(rng, ids, t);
    return {
      shard_id: shardId,
      owner_rest_id: owner,
      cookbook_id: r.cookbookId,
      grade: r.grade,
      need_minutes: r.needMinutes,
      need_renown: r.needRenown,
      created_at: now,
      expires_at: new Date(now.getTime() + r.expireMinutes * 60_000),
    };
  });
  await db.insertInto('takeaway_order').values(rows).execute();
}

/** 整点补公共单（设计文档 §3.2）：补到目标数；随机数顺序 目标数 → 每张单 */
export async function fillPublic(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  now: Date,
  rng: Rng,
  t: TakeawayTuning,
): Promise<number> {
  const open = await db
    .selectFrom('restaurant')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('shard_id', '=', shardId)
    .where('state', '=', 1)
    .where('npc', '=', false)
    .executeTakeFirstOrThrow();
  const cur = await db
    .selectFrom('takeaway_order')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('shard_id', '=', shardId)
    .where('owner_rest_id', 'is', null)
    .where('state', '=', 1)
    .where('expires_at', '>', now)
    .executeTakeFirstOrThrow();
  const n = publicTarget(Number(open.n), rng.int(t.publicRand), t) - Number(cur.n);
  await insertOrders(db, config, shardId, null, n, now, rng, t);
  return Math.max(0, n);
}

/** 清理（设计文档裁定 15）：过期超过 keepOpenDays 的未接单、keepDoneDays 前完成的单（配送级联删除）；配送中的不动 */
export async function cleanupOrders(db: Kysely<DB>, shardId: number, now: Date, t: TakeawayTuning): Promise<number> {
  const openBefore = new Date(now.getTime() - t.keepOpenDays * 86_400_000);
  const doneBefore = new Date(now.getTime() - t.keepDoneDays * 86_400_000);
  const r = await db
    .deleteFrom('takeaway_order')
    .where('shard_id', '=', shardId)
    .where((eb) =>
      eb.or([
        eb.and([eb('state', '=', 1), eb('expires_at', '<', openBefore)]),
        eb.and([eb('state', '=', 3), eb('created_at', '<', doneBefore)]),
      ]),
    )
    .executeTakeFirst();
  return Number(r.numDeletedRows);
}

/** 私人刷新（设计文档裁定 4）：要有效的商店工作证；费用 refreshCoin × (今天已刷新次数 + 1)；送声望 */
export async function refreshPrivate(o: Op): Promise<{ created: number }> {
  const t = o.tuning.takeaway;
  await requireOpen(o);
  if (!(await hasValidHonor(o, GOODS.shopJobHonor))) throw requirement('job_honor');
  const day = gameDay(o.now);
  const times = await getDaily(o.tx, o.rest.id, KEY.refresh, day);
  spendCoin(o, t.refreshCoin * (times + 1));
  gainRenown(o, t.refreshRenown);
  await insertOrders(o.tx, o.config, o.shardId, o.rest.id, t.refreshNum, o.now, o.rng, t);
  await incrementDaily(o.tx, o.rest.id, KEY.refresh, 1, day);
  restLog(o, 'takeaway.refresh', { times: times + 1 });
  return { created: t.refreshNum };
}
```

`apps/server/src/modules/takeaway/jobs.ts`：

```ts
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { cleanupOrders, fillPublic } from './orders';
import { takeawayPeriod } from './rules';

export function takeawayJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'takeaway-orders',
      feature: 'takeaway',
      period: (now) => takeawayPeriod(now),
      run: async ({ shardId, now, settings }) => {
        const t = settings.tuning.takeaway;
        const removed = await cleanupOrders(d.db, shardId, now, t);
        const created = await fillPublic(d.db, d.config, shardId, now, d.rng(), t);
        return { created, removed };
      },
    },
  ];
}
```

`apps/server/src/game.ts`：在 `import { towerJobs } from './modules/tower/jobs';` 下面加 `import { takeawayJobs } from './modules/takeaway/jobs';`；在 `jobs.push(...towerJobs(deps));` 下面加 `jobs.push(...takeawayJobs(deps));`。

`apps/server/src/modules/takeaway/service.ts`：加 `import { refreshPrivate } from './orders';`；返回对象里 `open(...) { ... },` 后面加：

```ts
    refresh(ctx: RestCtx) {
      return op(ctx, 'takeaway.refresh', (o) => refreshPrivate(o));
    },
```

`apps/server/src/modules/takeaway/routes.ts`：`/takeaway/open` 那段下面加：

```ts
    r.post('/takeaway/refresh', async (req) => okOp(await svc.refresh(restCtxOf(req))));
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/test/takeaway.ts apps/server/src/modules/takeaway apps/server/src/game.ts
git add apps/server/test/takeaway.ts apps/server/src
git commit -m "feat(server): hourly public takeaway orders, cleanup, private refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 接单

**Files:**
- Create: `apps/server/src/modules/takeaway/deliver.ts`
- Modify: `apps/server/src/modules/takeaway/service.ts`、`routes.ts`、`apps/server/src/game.ts`（服务改为接收 `world`）
- Test: `apps/server/src/modules/takeaway/deliver.test.ts`

**Interfaces:**
- Consumes: Task 3 `orderValues`、`riderAttrs`、`sumBonus`、`droneDiamonds`；Task 4 `requireOpen`、`levelsOf`、`busyCount`、`riderLuckRate`；`WorldService.ensure(shardId, now, db)`；`mergeNeed`（`cookbook/rules.ts`）、`foodsMap`、`subFoods`（`cupboard/foods.ts`）
- Produces: `deliverOrder(o: Op, weather: Record<string, number>, b: { orderId: number; riderId: number; double: boolean }): Promise<TakeawayDeliveryDto>`；`createTakeawayService(d, world)`；服务 `deliver(ctx, b)`；路由 `POST /takeaway/deliver`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/takeaway/deliver.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { addOrder, openFor, setWeather } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

/** 学会南煎丸子（品级 1）、每种食材 5 个、声望 10、已开通、晴天 */
const cook = async (shardId?: number): Promise<{ ctx: RestCtx; rider: number }> => {
  const ctx = await newRestaurant(t, {
    shardId,
    patch: { renown: 10 },
    cookbooks: { 1: 1 },
    foods: { 239: 5, 242: 5, 250: 5 },
  });
  const rider = await openFor(t, ctx);
  await setWeather(t, ctx.shardId, 1);
  return { ctx, rider };
};
const deliver = (ctx: RestCtx, orderId: number, riderId: number, double = false) =>
  t.game.takeaway.deliver(ctx, { orderId, riderId, double });
const foods = async (restId: number) =>
  Promise.all([239, 242, 250].map(async (id) => (await foodNum(t, restId, id)).num));

describe('接单（设计文档 §3.3）', () => {
  it('扣食材和声望；单变成配送中，别人看不到；这一单的数值定下来', async () => {
    const { ctx, rider } = await cook();
    const other = await cook(ctx.shardId);
    const order = await addOrder(t, ctx.shardId);
    const r = await deliver(ctx, order, rider);
    expect(r.data).toEqual({
      id: expect.any(Number),
      orderId: order,
      cookbookId: 1,
      cookbookName: '南煎丸子',
      grade: 1,
      private: false,
      double: false,
      riderId: rider,
      riderName: expect.any(String),
      arriveAt: new Date(t.clock.now.getTime() + 30 * 60_000).toISOString(),
      arrived: false,
      drone: 3,
    });
    expect(await foods(ctx.restaurantId)).toEqual([4, 4, 4]);
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(7);
    expect(
      await t.db.selectFrom('takeaway_delivery').selectAll().where('id', '=', r.data.id).executeTakeFirstOrThrow(),
    ).toMatchObject({ coin: 198, exp: 13, renown: 1, success_odds: 820, mystery_kinds: 0, state: 1, private: false });
    const v = await t.game.takeaway.overview(ctx);
    expect(v.deliveries.map((d) => d.id)).toEqual([r.data.id]);
    expect(v.riders[0]!.busy).toBe(1);
    expect((await t.game.takeaway.overview(other.ctx)).orders).toEqual([]);
  });

  it('天气和我的加成算进数值：阴天银币 +10%，外卖之星经验 +30%', async () => {
    const { ctx, rider } = await cook();
    await setWeather(t, ctx.shardId, 2);
    await grantGoods(t.db, config, ctx.restaurantId, 368, 1, t.clock.now);
    const r = await deliver(ctx, await addOrder(t, ctx.shardId), rider);
    expect(
      await t.db.selectFrom('takeaway_delivery').select(['coin', 'exp']).where('id', '=', r.data.id).executeTakeFirstOrThrow(),
    ).toEqual({ coin: 217, exp: 17 });
  });

  it('加料要持有使命必达：食材翻倍', async () => {
    const { ctx, rider } = await cook();
    const order = await addOrder(t, ctx.shardId);
    await expect(deliver(ctx, order, rider, true)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'double' },
    });
    await grantGoods(t.db, config, ctx.restaurantId, 370, 1, t.clock.now);
    expect((await t.game.takeaway.overview(ctx)).canDouble).toBe(true);
    expect((await deliver(ctx, order, rider, true)).data.double).toBe(true);
    expect(await foods(ctx.restaurantId)).toEqual([3, 3, 3]);
  });

  it('记下用了几种神秘食材', async () => {
    const ctx = await newRestaurant(t, {
      patch: { renown: 10 },
      cookbooks: { 4: 5 },
      foods: { 251: 1, 466: 1, 415: 1 },
    });
    const rider = await openFor(t, ctx);
    await setWeather(t, ctx.shardId, 1);
    const r = await deliver(ctx, await addOrder(t, ctx.shardId, { cookbookId: 4 }), rider);
    expect(
      await t.db.selectFrom('takeaway_delivery').select('mystery_kinds').where('id', '=', r.data.id).executeTakeFirstOrThrow(),
    ).toEqual({ mystery_kinds: 1 });
  });

  it('条件：单没了、被接走、骑手不是我的、骑手满了、没学会、声望、食材；失败时什么都不扣', async () => {
    const { ctx, rider } = await cook();
    const other = await cook(ctx.shardId);
    const gone = [
      999_999,
      await addOrder(t, ctx.shardId, { owner: other.ctx.restaurantId }),
      await addOrder(t, ctx.shardId, { expiresIn: -1 }),
    ];
    for (const id of gone)
      await expect(deliver(ctx, id, rider)).rejects.toMatchObject({ params: { reason: 'order_gone' } });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId, { state: 2 }), rider)).rejects.toMatchObject({
      params: { reason: 'order_taken' },
    });
    const order = await addOrder(t, ctx.shardId);
    await expect(deliver(ctx, order, other.rider)).rejects.toMatchObject({ params: { reason: 'rider_gone' } });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId, { cookbookId: 3 }), rider)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'not_learned' },
    });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId, { needRenown: 11 }), rider)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 11, have: 10 },
    });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId, { grade: 6 }), rider)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods', need: 6, have: 5 },
    });
    expect(await foods(ctx.restaurantId)).toEqual([5, 5, 5]);
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(10);
    await deliver(ctx, order, rider);
    await expect(deliver(ctx, await addOrder(t, ctx.shardId), rider)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'rider_busy', max: 1 },
    });
  });

  it('没开通不能接单', async () => {
    const ctx = await newRestaurant(t, { cookbooks: { 1: 1 } });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId), 1)).rejects.toMatchObject({
      params: { reason: 'takeaway_closed' },
    });
  });

  it('两个人同时接同一张公共单：只有一个成功，另一个报 order_taken，食材和声望一点没少（Review Focus 1）', async () => {
    const a = await cook();
    const b = await cook(a.ctx.shardId);
    const order = await addOrder(t, a.ctx.shardId);
    const r = await Promise.allSettled([deliver(a.ctx, order, a.rider), deliver(b.ctx, order, b.rider)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { params: { reason: 'order_taken' } },
    });
    const loser = r[0]!.status === 'rejected' ? a.ctx : b.ctx;
    expect(await foods(loser.restaurantId)).toEqual([5, 5, 5]);
    expect((await restRow(t, loser.restaurantId)).renown).toBe(10);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/deliver.test.ts`
Expected: FAIL——`t.game.takeaway.deliver is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/takeaway/deliver.ts`：

```ts
import type { TakeawayDeliveryDto } from '@dt/shared';
import { invalidState, limitReached, notEnough, requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { gainRenown } from '../../core/resources';
import { mergeNeed } from '../cookbook/rules';
import { foodsMap, subFoods } from '../cupboard/foods';
import { busyCount, levelsOf, requireOpen, riderLuckRate } from './common';
import { droneDiamonds, orderValues, riderAttrs, sumBonus } from './rules';

/**
 * 接单（设计文档 §3.3）。检查顺序：开通 → 单 → 骑手 → 学会 → 加料 → 声望 → 食材；
 * 抢单用"状态仍可接且没过期才改"的更新，改不到报 order_taken。随机数：成功率浮动
 */
export async function deliverOrder(
  o: Op,
  weather: Record<string, number>,
  b: { orderId: number; riderId: number; double: boolean },
): Promise<TakeawayDeliveryDto> {
  const t = o.tuning.takeaway;
  await requireOpen(o);
  const order = await o.tx
    .selectFrom('takeaway_order')
    .selectAll()
    .where('id', '=', b.orderId)
    .where('shard_id', '=', o.shardId)
    .executeTakeFirst();
  if (!order || (order.owner_rest_id !== null && order.owner_rest_id !== o.rest.id) || order.state === 3)
    throw invalidState('order_gone');
  if (order.state === 2) throw invalidState('order_taken');
  if (order.expires_at <= o.now) throw invalidState('order_gone');
  const rider = await o.tx
    .selectFrom('takeaway_rider as r')
    .innerJoin('restaurant as x', 'x.id', 'r.rider_rest_id')
    .selectAll('r')
    .select('x.name')
    .where('r.id', '=', b.riderId)
    .where('r.rest_id', '=', o.rest.id)
    .executeTakeFirst();
  if (!rider) throw invalidState('rider_gone');
  const attrs = riderAttrs(rider.level, t);
  if ((await busyCount(o.tx, rider.id)) >= attrs.maxNum) throw limitReached('rider_busy', { max: attrs.maxNum });
  const myGrade = (await levelsOf(o.tx, o.rest.id))[order.cookbook_id] ?? 0;
  if (myGrade < 1) throw requirement('not_learned');
  const agg = await opAgg(o);
  if (b.double && !((agg.taFoodsDoubleFlag ?? 0) > 0)) throw requirement('double');
  if (o.rest.renown < order.need_renown) throw notEnough('renown', order.need_renown, o.rest.renown);
  const cb = o.config.requireCookbook(order.cookbook_id);
  const mult = order.grade * (b.double ? 2 : 1);
  const lines = mergeNeed(cb.needFoods[myGrade] ?? []).map((f) => ({ foodsId: f.foodsId, num: f.num * mult }));
  const have = await foodsMap(o.tx, o.rest.id);
  for (const l of lines) {
    const h = have.get(l.foodsId)?.num ?? 0;
    if (h < l.num) throw notEnough('foods', l.num, h, l.foodsId);
  }
  const taken = await o.tx
    .updateTable('takeaway_order')
    .set({ state: 2 })
    .where('id', '=', order.id)
    .where('state', '=', 1)
    .where('expires_at', '>', o.now)
    .returning('id')
    .executeTakeFirst();
  if (!taken) throw invalidState('order_taken');
  for (const l of lines) await subFoods(o, l.foodsId, l.num);
  gainRenown(o, -order.need_renown);
  const v = orderValues(
    {
      price: cb.coin,
      grade: order.grade,
      myGrade,
      level: o.rest.level,
      needMinutes: order.need_minutes,
      rider: attrs,
      bonus: sumBonus(weather, agg),
      luckRate: await riderLuckRate(o, rider.rider_rest_id),
      floatRoll: o.rng.int(t.successFloat),
    },
    t,
  );
  const arriveAt = new Date(o.now.getTime() + v.minutes * 60_000);
  const isPrivate = order.owner_rest_id !== null;
  const row = await o.tx
    .insertInto('takeaway_delivery')
    .values({
      order_id: order.id,
      rest_id: o.rest.id,
      rider_id: rider.id,
      grade: order.grade,
      private: isPrivate,
      double: b.double,
      mystery_kinds: lines.filter((l) => o.config.foods.get(l.foodsId)?.level === 7).length,
      coin: v.coin,
      exp: v.exp,
      renown: v.renown,
      success_odds: v.odds,
      started_at: o.now,
      arrive_at: arriveAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  restLog(o, 'takeaway.deliver', { orderId: order.id, cookbookId: order.cookbook_id, grade: order.grade });
  return {
    id: row.id,
    orderId: order.id,
    cookbookId: order.cookbook_id,
    cookbookName: cb.name,
    grade: order.grade,
    private: isPrivate,
    double: b.double,
    riderId: rider.id,
    riderName: rider.name,
    arriveAt: arriveAt.toISOString(),
    arrived: false,
    drone: droneDiamonds(order.grade),
  };
}
```

`apps/server/src/modules/takeaway/service.ts`：
- 加 `import type { WorldService } from '../world/service';`、`import { deliverOrder } from './deliver';`
- `export function createTakeawayService(d: GameDeps) {` 改成 `export function createTakeawayService(d: GameDeps, world: WorldService) {`
- 返回对象里 `refresh(...) { ... },` 后面加：

```ts
    deliver(ctx: RestCtx, b: { orderId: number; riderId: number; double: boolean }) {
      return op(ctx, 'takeaway.deliver', async (o) =>
        deliverOrder(o, (await world.ensure(o.shardId, o.now, o.tx)).weather.effects, b),
      );
    },
```

`apps/server/src/game.ts`：`takeaway: createTakeawayService(deps),` 改成 `takeaway: createTakeawayService(deps, world),`。

`apps/server/src/modules/takeaway/routes.ts`：`@dt/shared` 的 import 加 `takeawayDeliverBody`；`/takeaway/refresh` 那行下面加：

```ts
    r.post('/takeaway/deliver', async (req) =>
      okOp(await svc.deliver(restCtxOf(req), parse(takeawayDeliverBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/takeaway apps/server/src/game.ts
git add apps/server/src
git commit -m "feat(server): take takeaway orders with value snapshot and race-safe claim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 领取结算

**Files:**
- Create: `apps/server/src/modules/takeaway/claim.ts`
- Modify: `apps/server/src/modules/takeaway/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/takeaway/claim.test.ts`

**Interfaces:**
- Consumes: Task 3 `claimExp`、`riderExpGain`、`addRiderExp`、`riderCapAfter`、`pickAward`、`customerRate`、`droneDiamonds`、`fl`、`FAIL_REASONS`；Task 4 `requireOpen`、`riderLuckRate`；Task 6 `deliverOrder`；`runPairOp`（`core/pair.ts`）、`grantGoodsOp`
- Produces: `settleDelivery(o: Op, riderOp: Op | null, deliveryId: number, drone: boolean): Promise<TakeawayClaimDto>`；服务 `claim(ctx, {deliveryId, drone})`、`claimAll(ctx)`；路由 `POST /takeaway/claim`、`POST /takeaway/claim-all`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/takeaway/claim.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { addOrder, addRider, openFor, setWeather, type OrderInit } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';

const DAY = '2026-09-30';
const config = testConfig();
let rngValues: number[] = [0.4];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());
beforeEach(() => {
  rngValues = [0.4];
  t.clock.set(gameTime(DAY, 12));
});

const COOK: NewRestaurantOptions = {
  patch: { renown: 10, diamond: 10 },
  cookbooks: { 1: 1 },
  foods: { 239: 20, 242: 20, 250: 20 },
};
/** 学会南煎丸子、食材充足、声望 10、钻石 10、已开通、晴天 */
const cook = async (opts: NewRestaurantOptions = {}): Promise<{ ctx: RestCtx; rider: number }> => {
  const ctx = await newRestaurant(t, { ...COOK, ...opts, patch: { ...COOK.patch, ...opts.patch } });
  const rider = await openFor(t, ctx);
  await setWeather(t, ctx.shardId, 1);
  return { ctx, rider };
};
/** 接一张单，返回配送 id */
const take = async (ctx: RestCtx, rider: number, o: OrderInit = {}) =>
  (await t.game.takeaway.deliver(ctx, { orderId: await addOrder(t, ctx.shardId, o), riderId: rider, double: false }))
    .data.id;
const claim = (ctx: RestCtx, deliveryId: number, drone = false) =>
  t.game.takeaway.claim(ctx, { deliveryId, drone });
const later = (min = 30) => t.clock.advance(min * 60_000);
const deliveryState = async (id: number) =>
  (await t.db.selectFrom('takeaway_delivery').select('state').where('id', '=', id).executeTakeFirstOrThrow()).state;

describe('领取（设计文档 §3.4）', () => {
  it('成功：银币、经验、声望、奖池一件；骑手经验；单完成；主线第 35 步和活跃"配送外卖"', async () => {
    // 活跃"配送外卖"要 2 星
    const { ctx, rider } = await cook({ patch: { main_task_step: 35, star_level: 2 } });
    const id = await take(ctx, rider);
    later();
    expect((await claim(ctx, id)).data).toEqual({
      deliveryId: id,
      success: true,
      forced: false,
      drone: false,
      reason: null,
      coin: 198,
      exp: 13,
      renown: 1,
      goods: { id: 1, num: 1 },
      riderExp: 6,
      riderLevel: 1,
      customer: null,
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 198, exp: 13, renown: 8 });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(1);
    expect(await deliveryState(id)).toBe(2);
    const v = await t.game.takeaway.overview(ctx);
    expect(v.deliveries).toEqual([]);
    expect(v.riders[0]).toMatchObject({ exp: 6, busy: 0 });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 35, key: 'takeaway.deliver', progress: 1 });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '配送外卖')!.count).toBe(1);
  });

  it('没到不能领；无人机随时领：花 2g+1 钻石、必定成功、骑手经验 ×2、礼券多 g 张', async () => {
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider);
    await expect(claim(ctx, id)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'not_arrived', arriveAt: new Date(t.clock.now.getTime() + 30 * 60_000).toISOString() },
    });
    expect((await claim(ctx, id, true)).data).toMatchObject({
      success: true,
      drone: true,
      riderExp: 12,
      goods: { id: 1, num: 2 },
    });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(7);
  });

  it('失败：经验减半，没有银币、声望、道具；骑手经验 ×2；给失败原因。有咕咕经验不减', async () => {
    rngValues = [0.9];
    const { ctx, rider } = await cook();
    const a = await take(ctx, rider);
    later();
    expect((await claim(ctx, a)).data).toMatchObject({
      success: false,
      coin: 0,
      exp: 6,
      renown: 0,
      goods: null,
      riderExp: 12,
      reason: '顾客退单了!',
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 0, renown: 7 });
    expect(await deliveryState(a)).toBe(3);
    await grantGoods(t.db, config, ctx.restaurantId, 388, 1, t.clock.now);
    const b = await take(ctx, rider);
    later();
    expect((await claim(ctx, b)).data).toMatchObject({ success: false, exp: 13 });
  });

  it('边牧：失败时 30% 改判成功', async () => {
    rngValues = [0.9];
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider);
    await grantGoods(t.db, config, ctx.restaurantId, 339, 1, t.clock.now);
    later();
    rngValues = [0.9, 0.1, 0.4, 0.4, 0.4];
    expect((await claim(ctx, id)).data).toMatchObject({ success: true, forced: true, coin: 198, goods: { id: 1, num: 1 } });
  });

  it('私人单必定成功，经验 ×1.5', async () => {
    rngValues = [0.9];
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider, { owner: ctx.restaurantId });
    later();
    expect((await claim(ctx, id)).data).toMatchObject({ success: true, exp: 19, goods: { id: 240, num: 1 } });
  });

  it('神秘顾客：成功时遇到珊迪，写新闻', async () => {
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider);
    later();
    rngValues = [0.01];
    expect((await claim(ctx, id)).data).toMatchObject({ success: true, customer: 265 });
    expect(await goodsNum(t, ctx.restaurantId, 265)).toBe(1);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(news).toEqual([{ type: 'takeaway.customer', params: { goodsId: 265 } }]);
  });

  it('骑手是好友：我拿 0.9 的银币和经验，他的店拿 1/9 回扣，他的骑手经验加上', async () => {
    const [a, b] = await newPair(t, COOK, {});
    await befriend(t, a.restaurantId, b.restaurantId);
    await openFor(t, a);
    await setWeather(t, a.shardId, 1);
    const rider = await addRider(t, a.restaurantId, b.restaurantId);
    const id = await take(a, rider);
    later();
    expect((await claim(a, id)).data).toMatchObject({ success: true, coin: 178, exp: 11, riderExp: 6 });
    expect(await restRow(t, b.restaurantId)).toMatchObject({ coin: 19, exp: 1 });
    expect(
      await t.db.selectFrom('takeaway_rider').select('exp').where('id', '=', rider).executeTakeFirstOrThrow(),
    ).toEqual({ exp: 6 });
  });

  it('两家店互为骑手、同时领取：都完成，不死锁，各拿对方的回扣（Review Focus 2）', async () => {
    const [a, b] = await newPair(t, COOK, COOK);
    await befriend(t, a.restaurantId, b.restaurantId);
    await openFor(t, a);
    await openFor(t, b);
    await setWeather(t, a.shardId, 1);
    const ra = await addRider(t, a.restaurantId, b.restaurantId);
    const rb = await addRider(t, b.restaurantId, a.restaurantId);
    const da = await take(a, ra);
    const db = await take(b, rb);
    later();
    const r = await Promise.all([claim(a, da), claim(b, db)]);
    expect(r.map((x) => x.data.success)).toEqual([true, true]);
    expect((await restRow(t, a.restaurantId)).coin).toBe(178 + 19);
    expect((await restRow(t, b.restaurantId)).coin).toBe(178 + 19);
  });

  it('全部领取：只领已到的；好友骑手那一单的回扣照发（Review Focus 5）', async () => {
    const [a, b] = await newPair(t, COOK, {});
    await befriend(t, a.restaurantId, b.restaurantId);
    const self = await openFor(t, a);
    await t.db.updateTable('takeaway_rider').set({ level: 5 }).where('id', '=', self).execute();
    await setWeather(t, a.shardId, 1);
    const friend = await addRider(t, a.restaurantId, b.restaurantId);
    const d1 = await take(a, self);
    const d2 = await take(a, friend);
    const d3 = await take(a, self, { needMinutes: 90 });
    later();
    const r = await t.game.takeaway.claimAll(a);
    expect(r.data.map((x) => x.deliveryId)).toEqual([d1, d2]);
    expect(await deliveryState(d3)).toBe(1);
    expect((await restRow(t, b.restaurantId)).coin).toBeGreaterThan(0);
  });

  it('配送中的单过了有效期仍能领取（Review Focus 4）', async () => {
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider, { expiresIn: 5 });
    later(60);
    expect((await claim(ctx, id)).data.success).toBe(true);
  });

  it('自己的骑手升到 2 级：可雇上限 +1', async () => {
    const { ctx, rider } = await cook();
    await t.db.updateTable('takeaway_rider').set({ exp: 1297 }).where('id', '=', rider).execute();
    const id = await take(ctx, rider);
    later();
    expect((await claim(ctx, id)).data.riderLevel).toBe(2);
    const v = await t.game.takeaway.overview(ctx);
    expect(v.riders[0]).toMatchObject({ level: 2, exp: 3 });
    expect(v.riderCap).toBe(2);
  });

  it('领过的、别人的配送报 delivery_gone', async () => {
    const { ctx, rider } = await cook();
    const other = await cook({ shardId: ctx.shardId });
    const id = await take(ctx, rider);
    later();
    await expect(claim(other.ctx, id)).rejects.toMatchObject({ params: { reason: 'delivery_gone' } });
    await claim(ctx, id);
    await expect(claim(ctx, id)).rejects.toMatchObject({ params: { reason: 'delivery_gone' } });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/claim.test.ts`
Expected: FAIL——`t.game.takeaway.claim is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/takeaway/claim.ts`：

```ts
import { GOODS } from '@dt/config';
import type { TakeawayClaimDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { opNews, restLog, type Op } from '../../core/op';
import { gainCoin, gainExp, gainRenown, spendDiamond } from '../../core/resources';
import { grantGoodsOp } from '../store/goods';
import { requireOpen, riderLuckRate } from './common';
import {
  addRiderExp,
  claimExp,
  customerRate,
  droneDiamonds,
  FAIL_REASONS,
  fl,
  pickAward,
  riderCapAfter,
  riderExpGain,
} from './rules';

/**
 * 领取（设计文档 §3.4）。riderOp 是好友骑手店的操作（双店操作里的对方），自己当骑手时为 null。
 * 随机数顺序：成败 →（边牧）→ 奖池 →（礼券数量）→ 神秘顾客 →（失败原因）
 */
export async function settleDelivery(
  o: Op,
  riderOp: Op | null,
  deliveryId: number,
  drone: boolean,
): Promise<TakeawayClaimDto> {
  const t = o.tuning.takeaway;
  const v = await o.tx
    .selectFrom('takeaway_delivery')
    .selectAll()
    .where('id', '=', deliveryId)
    .where('rest_id', '=', o.rest.id)
    .where('state', '=', 1)
    .forUpdate()
    .executeTakeFirst();
  if (!v) throw invalidState('delivery_gone');
  if (!drone && v.arrive_at > o.now) throw invalidState('not_arrived', { arriveAt: v.arrive_at.toISOString() });
  const rider = await o.tx
    .selectFrom('takeaway_rider')
    .selectAll()
    .where('id', '=', v.rider_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const self = rider.rider_rest_id === o.rest.id;
  // 计划裁定 9：进操作后以带锁读为准
  if (!self && riderOp?.rest.id !== rider.rider_rest_id) throw invalidState('delivery_gone');
  if (drone) spendDiamond(o, droneDiamonds(v.grade));
  const agg = await opAgg(o);
  let success = v.private || drone || o.rng.next() < v.success_odds / 1000;
  let forced = false;
  const force = agg.taFailForceSuccessRate ?? 0;
  if (!success && force > 0 && o.rng.next() < force) {
    success = true;
    forced = true;
  }
  let exp = claimExp(v.exp, { double: v.double, friend: !self, private: v.private }, t);
  let coin = 0;
  let renown = 0;
  let goods: { id: number; num: number } | null = null;
  if (success) {
    coin = self ? v.coin : fl(v.coin * t.friendRiderRate);
    renown = v.renown;
    gainCoin(o, coin);
    gainRenown(o, renown);
    const id = pickAward(o.rng.next(), v.grade, t);
    const num = id === GOODS.mysteryTicket ? o.rng.intMin1(2 * v.grade) + (drone ? v.grade : 0) : 1;
    goods = { id, num: await grantGoodsOp(o, id, num) };
  } else if (!((agg.gugu ?? 0) > 0)) {
    exp = fl(exp * t.failExpRate);
  }
  gainExp(o, exp);
  if (success && riderOp && !self) {
    const rc = Math.floor(coin / t.rebateDiv);
    const re = Math.floor(exp / t.rebateDiv);
    gainCoin(riderOp, rc, { source: 'takeaway.rebate' });
    gainExp(riderOp, re, { source: 'takeaway.rebate' });
    restLog(riderOp, 'takeaway.rebate', { from: o.rest.id, coin: rc, exp: re });
  }
  const riderExp = riderExpGain({
    grade: v.grade,
    fail: !success,
    drone,
    kinds: v.mystery_kinds,
    rate: agg.riderExpRate ?? 0,
  });
  const up = addRiderExp(rider.level, rider.exp, riderExp, t);
  await o.tx.updateTable('takeaway_rider').set({ level: up.level, exp: up.exp }).where('id', '=', rider.id).execute();
  if (self && up.gained > 0) {
    const st = await requireOpen(o);
    const cap = riderCapAfter(st.rider_cap, rider.level, up.level, t);
    if (cap !== st.rider_cap)
      await o.tx.updateTable('takeaway_state').set({ rider_cap: cap }).where('rest_id', '=', o.rest.id).execute();
  }
  let customer: number | null = null;
  if (o.rng.next() < customerRate(await riderLuckRate(o, rider.rider_rest_id), t)) {
    customer = success ? t.customer.success : t.customer.fail;
    await grantGoodsOp(o, customer, 1);
    opNews(o, 'takeaway.customer', { goodsId: customer });
  }
  const reason = success ? null : FAIL_REASONS[o.rng.int(FAIL_REASONS.length)]!;
  const result: TakeawayClaimDto = {
    deliveryId: v.id,
    success,
    forced,
    drone,
    reason,
    coin,
    exp,
    renown,
    goods,
    riderExp,
    riderLevel: up.level,
    customer,
  };
  await o.tx
    .updateTable('takeaway_delivery')
    .set({ state: success ? 2 : 3, drone, result: JSON.stringify(result), settled_at: o.now })
    .where('id', '=', v.id)
    .execute();
  await o.tx.updateTable('takeaway_order').set({ state: 3 }).where('id', '=', v.order_id).execute();
  restLog(o, 'takeaway.claim', { deliveryId: v.id, success, coin, exp, renown });
  await emitAction(o, 'takeaway.deliver');
  return result;
}
```

`apps/server/src/modules/takeaway/service.ts`：
- import 改成 `import type { TakeawayClaimDto, TakeawayDto } from '@dt/shared';`，加 `import { runPairOp } from '../../core/pair';`、`import { settleDelivery } from './claim';`
- 在 `const restOf = ...` 之后加：

```ts
  /** 骑手是好友时用双店操作锁住两家店（按店号顺序），回扣和结算在同一个事务里（设计文档裁定 10、计划裁定 9） */
  async function claimOne(ctx: RestCtx, deliveryId: number, drone: boolean): Promise<OpResult<TakeawayClaimDto>> {
    const row = await d.db
      .selectFrom('takeaway_delivery as v')
      .innerJoin('takeaway_rider as r', 'r.id', 'v.rider_id')
      .select(['v.rest_id', 'r.rider_rest_id'])
      .where('v.id', '=', deliveryId)
      .executeTakeFirst();
    if (row && row.rest_id === ctx.restaurantId && row.rider_rest_id !== ctx.restaurantId)
      return runPairOp(
        d,
        ctx,
        row.rider_rest_id,
        { feature: 'takeaway', source: 'takeaway.claim', friend: 'none', lenient: true },
        (p) => settleDelivery(p.me, p.them, deliveryId, drone),
      );
    return op(ctx, 'takeaway.claim', (o) => settleDelivery(o, null, deliveryId, drone));
  }
```

- 返回对象里 `deliver(...) { ... },` 后面加：

```ts
    claim(ctx: RestCtx, b: { deliveryId: number; drone: boolean }) {
      return claimOne(ctx, b.deliveryId, b.drone);
    },
    /** 依次领取所有已到达的配送（不用无人机），每一单一个操作 */
    async claimAll(ctx: RestCtx): Promise<OpResult<TakeawayClaimDto[]>> {
      await d.shards.ensureFeature(ctx.shardId, 'takeaway');
      const ids = await d.db
        .selectFrom('takeaway_delivery')
        .select('id')
        .where('rest_id', '=', ctx.restaurantId)
        .where('state', '=', 1)
        .where('arrive_at', '<=', d.now())
        .orderBy('arrive_at')
        .orderBy('id')
        .execute();
      const out: OpResult<TakeawayClaimDto[]> = { data: [], events: [] };
      for (const { id } of ids) {
        const r = await claimOne(ctx, id, false);
        out.data.push(r.data);
        out.events.push(...r.events);
      }
      return out;
    },
```

`apps/server/src/modules/takeaway/routes.ts`：`@dt/shared` 的 import 加 `takeawayClaimBody`；`/takeaway/deliver` 那段下面加：

```ts
    r.post('/takeaway/claim', async (req) =>
      okOp(await svc.claim(restCtxOf(req), parse(takeawayClaimBody, req.body))),
    );
    r.post('/takeaway/claim-all', async (req) => okOp(await svc.claimAll(restCtxOf(req))));
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/takeaway
git add apps/server/src/modules/takeaway
git commit -m "feat(server): settle takeaway deliveries — drone, pets, award pool, rider rebate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 骑手——可雇列表、雇佣、解雇

**Files:**
- Create: `apps/server/src/modules/takeaway/riders.ts`
- Modify: `apps/server/src/modules/takeaway/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/takeaway/riders.test.ts`

**Interfaces:**
- Consumes: Task 4 `requireOpen`、`busyCount`；`runPairOp`、`PairOp`、`feedLog`（`core/pair.ts`）
- Produces: `riderCandidates(db, rest: RestaurantRow): Promise<RiderCandidateDto[]>`、`hireRider(p: PairOp): Promise<{ riderId: number }>`、`dismissRider(o: Op, riderId: number): Promise<{ coin: number; exp: number }>`；服务 `candidates(ctx)`、`hire(ctx, {restId})`、`dismiss(ctx, {riderId})`；路由 `GET /takeaway/candidates`、`POST /takeaway/hire`、`POST /takeaway/dismiss`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/takeaway/riders.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { befriend, createTestGame, newPair, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { addOrder, addRider, openFor } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { ensureNpc } from '../npc/npc';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const hire = (ctx: RestCtx, restId: number) => t.game.takeaway.hire(ctx, { restId });
const dismiss = (ctx: RestCtx, riderId: number) => t.game.takeaway.dismiss(ctx, { riderId });
/** a 已开通，b 是 a 的 1 星好友 */
const pair = async (): Promise<[RestCtx, RestCtx]> => {
  const [a, b] = await newPair(t, {}, { patch: { star_level: 1 } });
  await befriend(t, a.restaurantId, b.restaurantId);
  await openFor(t, a);
  return [a, b];
};
const setCap = (restId: number, cap: number) =>
  t.db.updateTable('takeaway_state').set({ rider_cap: cap }).where('rest_id', '=', restId).execute();

describe('雇佣（设计文档 §3.5）', () => {
  it('雇 1 星好友；满员报 LIMIT riders；列表里标出能不能雇', async () => {
    const [a, b] = await pair();
    await expect(hire(a, b.restaurantId)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'riders', max: 1 },
    });
    await setCap(a.restaurantId, 2);
    const r = await hire(a, b.restaurantId);
    expect(r.data).toEqual({ riderId: expect.any(Number) });
    const v = await t.game.takeaway.overview(a);
    expect(v.riders.map((x) => [x.self, x.restId])).toEqual([
      [true, a.restaurantId],
      [false, b.restaurantId],
    ]);
    expect(await t.game.takeaway.candidates(a)).toEqual([
      { restId: b.restaurantId, name: expect.any(String), level: 1, star: 1, block: 'mine' },
    ]);
  });

  it('不能雇：蟹老板、不到 1 星、已被别人雇、不是好友、自己没开通', async () => {
    const [a, b] = await pair();
    await setCap(a.restaurantId, 4);
    const npc = await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1));
    await befriend(t, a.restaurantId, npc.id);
    await expect(hire(a, npc.id)).rejects.toMatchObject({ params: { reason: 'target_npc' } });
    const zero = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, a.restaurantId, zero.restaurantId);
    await expect(hire(a, zero.restaurantId)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const boss = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await openFor(t, boss);
    await addRider(t, boss.restaurantId, b.restaurantId);
    await expect(hire(a, b.restaurantId)).rejects.toMatchObject({ params: { reason: 'rider_hired' } });
    const stranger = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { star_level: 1 } });
    await expect(hire(a, stranger.restaurantId)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
    const blocks = new Map((await t.game.takeaway.candidates(a)).map((c) => [c.restId, c.block]));
    expect(blocks.get(npc.id)).toBe('target_npc');
    expect(blocks.get(zero.restaurantId)).toBe('star');
    expect(blocks.get(b.restaurantId)).toBe('hired');
    const [c, d] = await newPair(t, {}, { patch: { star_level: 1 } });
    await befriend(t, c.restaurantId, d.restaurantId);
    await expect(hire(c, d.restaurantId)).rejects.toMatchObject({ params: { reason: 'takeaway_closed' } });
  });

  it('同一个好友同时被两个人雇：只有一个成功（Review Focus 3）', async () => {
    const [x, z] = await pair();
    const y = await newRestaurant(t, { shardId: x.shardId, verified: true });
    await befriend(t, y.restaurantId, z.restaurantId);
    await openFor(t, y);
    await setCap(x.restaurantId, 2);
    await setCap(y.restaurantId, 2);
    const r = await Promise.allSettled([hire(x, z.restaurantId), hire(y, z.restaurantId)]);
    expect(r.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((s) => s.status === 'rejected')).toMatchObject({ reason: { params: { reason: 'rider_hired' } } });
  });
});

describe('解雇（设计文档 §3.5）', () => {
  it('花 当前经验×50 银币，得 当前经验×500 经验；解雇后别人可以雇他', async () => {
    const [a, b] = await pair();
    await t.db
      .updateTable('restaurant')
      .set({ coin: 10_000, level: 30 })
      .where('id', '=', a.restaurantId)
      .execute();
    const rider = await addRider(t, a.restaurantId, b.restaurantId);
    await t.db.updateTable('takeaway_rider').set({ exp: 3 }).where('id', '=', rider).execute();
    expect((await t.game.takeaway.overview(a)).riders[1]).toMatchObject({ dismissCoin: 150, dismissExp: 1500 });
    expect((await dismiss(a, rider)).data).toEqual({ coin: 150, exp: 1500 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 9850, exp: 1500 });
    expect((await t.game.takeaway.overview(a)).riders).toHaveLength(1);
    expect((await t.game.takeaway.candidates(a))[0]!.block).toBeNull();
  });

  it('不能解雇自己、正在配送的、别人的骑手', async () => {
    const [a, b] = await pair();
    const self = (await t.game.takeaway.overview(a)).riders[0]!.id;
    await expect(dismiss(a, self)).rejects.toMatchObject({ params: { reason: 'rider_self' } });
    const rider = await addRider(t, a.restaurantId, b.restaurantId);
    const order = await addOrder(t, a.shardId, { state: 2 });
    await t.db
      .insertInto('takeaway_delivery')
      .values({
        order_id: order,
        rest_id: a.restaurantId,
        rider_id: rider,
        grade: 1,
        private: false,
        double: false,
        mystery_kinds: 0,
        coin: 1,
        exp: 1,
        renown: 1,
        success_odds: 800,
        started_at: t.clock.now,
        arrive_at: t.clock.now,
      })
      .execute();
    await expect(dismiss(a, rider)).rejects.toMatchObject({ params: { reason: 'rider_delivering' } });
    const other = await newRestaurant(t, { shardId: a.shardId });
    await openFor(t, other);
    await expect(dismiss(other, rider)).rejects.toMatchObject({ params: { reason: 'rider_gone' } });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway/riders.test.ts`
Expected: FAIL——`t.game.takeaway.hire is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/takeaway/riders.ts`：

```ts
import type { Kysely } from 'kysely';
import type { RiderCandidateDto } from '@dt/shared';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { feedLog, type PairOp } from '../../core/pair';
import { gainExp, spendCoin } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { busyCount, requireOpen } from './common';

/** 可雇的好友（设计文档 §3.5）：不能雇的写原因（计划裁定 6） */
export async function riderCandidates(db: Kysely<DB>, rest: RestaurantRow): Promise<RiderCandidateDto[]> {
  const friends = await db
    .selectFrom('friend as f')
    .innerJoin('restaurant as r', 'r.id', 'f.friend_id')
    .select(['r.id', 'r.name', 'r.level', 'r.star_level', 'r.npc'])
    .where('f.rest_id', '=', rest.id)
    .orderBy('r.id')
    .execute();
  if (friends.length === 0) return [];
  const hired = await db
    .selectFrom('takeaway_rider')
    .select(['rest_id', 'rider_rest_id'])
    .where(
      'rider_rest_id',
      'in',
      friends.map((f) => f.id),
    )
    .whereRef('rider_rest_id', '<>', 'rest_id')
    .execute();
  const employer = new Map(hired.map((h) => [h.rider_rest_id, h.rest_id]));
  return friends.map((f) => ({
    restId: f.id,
    name: f.name,
    level: f.level,
    star: f.star_level,
    block: f.npc
      ? 'target_npc'
      : employer.get(f.id) === rest.id
        ? 'mine'
        : employer.has(f.id)
          ? 'hired'
          : f.star_level < 1
            ? 'star'
            : null,
  }));
}

/** 雇佣（双店操作，好友必需）：两家店都锁住，同一个人被两人同时雇时串行（Review Focus 3） */
export async function hireRider(p: PairOp): Promise<{ riderId: number }> {
  const o = p.me;
  const them = p.them.rest;
  const st = await requireOpen(o);
  if (them.npc) throw invalidState('target_npc');
  if (them.star_level < 1) throw requirement('star', { need: 1 });
  const hired = await o.tx
    .selectFrom('takeaway_rider')
    .select('rest_id')
    .where('rider_rest_id', '=', them.id)
    .whereRef('rider_rest_id', '<>', 'rest_id')
    .executeTakeFirst();
  if (hired) throw invalidState('rider_hired');
  const n = await o.tx
    .selectFrom('takeaway_rider')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
  if (Number(n.n) >= st.rider_cap) throw limitReached('riders', { max: st.rider_cap });
  const r = await o.tx
    .insertInto('takeaway_rider')
    .values({ rest_id: o.rest.id, rider_rest_id: them.id, hired_at: o.now })
    .returning('id')
    .executeTakeFirstOrThrow();
  restLog(o, 'takeaway.hire', { restId: them.id });
  feedLog(p, 'takeaway.hired');
  return { riderId: r.id };
}

/** 解雇（设计文档 §3.5、裁定 14）：花 当前经验 × dismissCoin 银币，得 当前经验 × dismissExp 经验 */
export async function dismissRider(o: Op, riderId: number): Promise<{ coin: number; exp: number }> {
  const t = o.tuning.takeaway;
  await requireOpen(o);
  const r = await o.tx
    .selectFrom('takeaway_rider')
    .selectAll()
    .where('id', '=', riderId)
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirst();
  if (!r) throw invalidState('rider_gone');
  if (r.rider_rest_id === o.rest.id) throw invalidState('rider_self');
  if ((await busyCount(o.tx, r.id)) > 0) throw invalidState('rider_delivering');
  const coin = r.exp * t.rider.dismissCoin;
  const exp = r.exp * t.rider.dismissExp;
  spendCoin(o, coin);
  gainExp(o, exp);
  await o.tx.deleteFrom('takeaway_rider').where('id', '=', r.id).execute();
  restLog(o, 'takeaway.dismiss', { restId: r.rider_rest_id, coin, exp });
  return { coin, exp };
}
```

`apps/server/src/modules/takeaway/service.ts`：
- import 改成 `import type { RiderCandidateDto, TakeawayClaimDto, TakeawayDto } from '@dt/shared';`，加 `import { dismissRider, hireRider, riderCandidates } from './riders';`
- 返回对象里 `claimAll(...) { ... },` 后面加：

```ts
    async candidates(ctx: RestCtx): Promise<RiderCandidateDto[]> {
      await d.shards.ensureFeature(ctx.shardId, 'takeaway');
      return riderCandidates(d.db, await restOf(ctx.restaurantId));
    },
    hire(ctx: RestCtx, b: { restId: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'takeaway', source: 'takeaway.hire', friend: 'required' },
        (p) => hireRider(p),
      );
    },
    dismiss(ctx: RestCtx, b: { riderId: number }) {
      return op(ctx, 'takeaway.dismiss', (o) => dismissRider(o, b.riderId));
    },
```

`apps/server/src/modules/takeaway/routes.ts`：`@dt/shared` 的 import 加 `takeawayHireBody`、`takeawayRiderBody`；`/takeaway/claim-all` 那行下面加：

```ts
    r.get('/takeaway/candidates', async (req) => ok(await svc.candidates(restCtxOf(req))));
    r.post('/takeaway/hire', async (req) =>
      okOp(await svc.hire(restCtxOf(req), parse(takeawayHireBody, req.body))),
    );
    r.post('/takeaway/dismiss', async (req) =>
      okOp(await svc.dismiss(restCtxOf(req), parse(takeawayRiderBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/takeaway`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/takeaway
git add apps/server/src/modules/takeaway
git commit -m "feat(server): hire and dismiss takeaway riders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 前端——接口、文案、开通面板、外卖单面板

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`、`apps/web/src/i18n/zh-CN.ts`、`apps/web/src/i18n/zh-CN.test.ts`、`apps/web/src/utils/labels.ts`
- Create: `apps/web/src/components/takeaway/testData.ts`、`format.ts`
- Create: `apps/web/src/components/takeaway/OpenPanel.vue`、`OpenPanel.test.ts`
- Create: `apps/web/src/components/takeaway/OrdersPanel.vue`、`OrdersPanel.test.ts`

**Interfaces:**
- Consumes: Task 4 的 DTO（含 `TakeawayRiderDto.dismissCoin`、`dismissExp`）
- Produces:
  - `endpoints.takeaway()`、`takeawayOpen(way)`、`takeawayRefresh()`、`takeawayDeliver(orderId, riderId, double)`、`takeawayClaim(deliveryId, drone)`、`takeawayClaimAll()`、`takeawayCandidates()`、`takeawayHire(restId)`、`takeawayDismiss(riderId)`
  - `TAKEAWAY_GRADES`（`utils/labels.ts`，下标 = 单品级）；`minutesLeft(at: string, now: string): number`（`components/takeaway/format.ts`）
  - `components/takeaway/testData.ts`：`order(patch?)`、`delivery(patch?)`、`rider(patch?)`、`claimResult(patch?)`、`takeawayData(patch?)`
  - `OpenPanel`、`OrdersPanel`（props `data: TakeawayDto`，emit `reload`）

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/takeaway/testData.ts`：

```ts
import type {
  TakeawayClaimDto,
  TakeawayDeliveryDto,
  TakeawayDto,
  TakeawayOrderDto,
  TakeawayRiderDto,
} from '@dt/shared';

export const order = (patch: Partial<TakeawayOrderDto> = {}): TakeawayOrderDto => ({
  id: 11,
  cookbookId: 1,
  cookbookName: '南煎丸子',
  grade: 1,
  needMinutes: 30,
  needRenown: 3,
  expiresAt: '2026-09-30T05:00:00.000Z',
  private: false,
  foods: [
    { foodsId: 239, need: 1, have: 5 },
    { foodsId: 242, need: 1, have: 5 },
    { foodsId: 250, need: 1, have: 5 },
  ],
  block: null,
  ...patch,
});

export const delivery = (patch: Partial<TakeawayDeliveryDto> = {}): TakeawayDeliveryDto => ({
  id: 21,
  orderId: 11,
  cookbookId: 1,
  cookbookName: '南煎丸子',
  grade: 1,
  private: false,
  double: false,
  riderId: 31,
  riderName: '我的店',
  arriveAt: '2026-09-30T04:30:00.000Z',
  arrived: false,
  drone: 3,
  ...patch,
});

export const rider = (patch: Partial<TakeawayRiderDto> = {}): TakeawayRiderDto => ({
  id: 31,
  restId: 1,
  name: '我的店',
  self: true,
  level: 1,
  exp: 6,
  needExp: 1300,
  timeSub: 0,
  expAdd: 0,
  coinAdd: 0,
  renownAdd: 0,
  odds: 800,
  maxNum: 1,
  busy: 0,
  dismissCoin: 0,
  dismissExp: 0,
  ...patch,
});

export const claimResult = (patch: Partial<TakeawayClaimDto> = {}): TakeawayClaimDto => ({
  deliveryId: 21,
  success: true,
  forced: false,
  drone: false,
  reason: null,
  coin: 198,
  exp: 13,
  renown: 1,
  goods: { id: 1, num: 1 },
  riderExp: 6,
  riderLevel: 1,
  customer: null,
  ...patch,
});

/** 已开通、有一张能接的单、一个空闲的自己骑手；服务器时间 12:00（北京） */
export const takeawayData = (patch: Partial<TakeawayDto> = {}): TakeawayDto => ({
  opened: true,
  open: { needStar: 2, needRenown: 888, needCoin: 8_880_000, needDiamond: 300, tickets: 0 },
  orders: [order()],
  deliveries: [],
  riders: [rider()],
  riderCap: 1,
  canDouble: false,
  refresh: { cost: 1_000_000, hasJob: false },
  star: 2,
  renown: 10,
  coin: 100_000,
  diamond: 10,
  now: '2026-09-30T04:00:00.000Z',
  ...patch,
});
```

`apps/web/src/components/takeaway/OpenPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import OpenPanel from './OpenPanel.vue';
import { takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { takeawayOpen: vi.fn() } }));

const closed = (patch = {}) => takeawayData({ opened: false, orders: [], riders: [], riderCap: 0, ...patch });

describe('OpenPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayOpen).mockResolvedValue({ opened: true });
  });

  it('条件不满足时两个按钮都灰掉并写明原因', () => {
    const low = mount(OpenPanel, { props: { data: closed({ star: 1 }) } });
    expect(low.find('[data-testid="block-ticket"]').text()).toBe('餐厅 2 星才能开通');
    expect(low.find('[data-testid="open-coin"]').attributes('disabled')).toBeDefined();
    const poor = mount(OpenPanel, { props: { data: closed({ renown: 1000, coin: 0 }) } });
    expect(poor.find('[data-testid="block-ticket"]').text()).toBe('没有外卖券');
    expect(poor.find('[data-testid="block-coin"]').text()).toBe('银币不够（要 8,880,000）');
  });

  it('有外卖券：开通后通知刷新', async () => {
    const data = closed({ renown: 1000 });
    data.open.tickets = 1;
    const w = mount(OpenPanel, { props: { data } });
    expect(w.find('[data-testid="open-ticket"]').text()).toBe('用外卖券开通（持有 1 张）');
    await w.find('[data-testid="open-ticket"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayOpen).toHaveBeenCalledWith('ticket');
    expect(w.emitted('reload')).toHaveLength(1);
  });
});
```

`apps/web/src/components/takeaway/OrdersPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import OrdersPanel from './OrdersPanel.vue';
import { delivery, order, rider, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { takeawayDeliver: vi.fn(), takeawayRefresh: vi.fn() } }));

describe('OrdersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayDeliver).mockResolvedValue(delivery());
    vi.mocked(endpoints.takeawayRefresh).mockResolvedValue({ created: 15 });
  });

  it('显示品级、时长、声望、剩余有效时间和食材；选空闲骑手接单后通知刷新', async () => {
    const w = mount(OrdersPanel, { props: { data: takeawayData() } });
    const row = w.find('[data-testid="order-11"]');
    expect(row.text()).toContain('普通');
    expect(row.text()).toContain('南煎丸子');
    expect(row.text()).toContain('30 分钟');
    expect(row.text()).toContain('还剩 60 分钟有效');
    expect(row.text()).toContain('食材239 1/5');
    await w.find('[data-testid="take-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).toHaveBeenCalledWith(11, 31, false);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('不能接时灰掉并写明原因：没学会、声望不够、食材不够、没有空闲骑手', () => {
    const w = mount(OrdersPanel, {
      props: {
        data: takeawayData({
          orders: [
            order({ id: 1, block: 'not_learned' }),
            order({ id: 2, block: 'renown', needRenown: 12 }),
            order({ id: 3, foods: [{ foodsId: 239, need: 6, have: 5 }], block: 'foods' }),
          ],
        }),
      },
    });
    expect(w.find('[data-testid="why-1"]').text()).toBe('还没学会这道菜');
    expect(w.find('[data-testid="why-2"]').text()).toBe('声望不够（要 12）');
    expect(w.find('[data-testid="why-3"]').text()).toBe('食材不够');
    expect(w.find('[data-testid="take-3"]').attributes('disabled')).toBeDefined();
    const busy = mount(OrdersPanel, { props: { data: takeawayData({ riders: [rider({ busy: 1 })] }) } });
    expect(busy.find('[data-testid="why-11"]').text()).toBe('没有空闲的骑手');
  });

  it('加料：没有使命必达时灰掉；有时勾上后按 double = true 接单，食材按两倍算', async () => {
    const no = mount(OrdersPanel, { props: { data: takeawayData() } });
    expect(no.find('[data-testid="double"]').attributes('disabled')).toBeDefined();
    const w = mount(OrdersPanel, { props: { data: takeawayData({ canDouble: true }) } });
    await w.find('[data-testid="double"]').setValue(true);
    expect(w.find('[data-testid="order-11"]').text()).toContain('食材239 2/5');
    await w.find('[data-testid="take-11"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayDeliver).toHaveBeenCalledWith(11, 31, true);
  });

  it('私人刷新：没有工作证时灰掉；有时点击后通知刷新', async () => {
    const no = mount(OrdersPanel, { props: { data: takeawayData() } });
    expect(no.find('[data-testid="refresh-block"]').text()).toBe('要持有有效的商店工作证');
    expect(no.find('[data-testid="refresh"]').attributes('disabled')).toBeDefined();
    const w = mount(OrdersPanel, {
      props: { data: takeawayData({ coin: 2_000_000, refresh: { cost: 1_000_000, hasJob: true } }) },
    });
    expect(w.find('[data-testid="refresh"]').text()).toBe('私人刷新（1,000,000 银币）');
    await w.find('[data-testid="refresh"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayRefresh).toHaveBeenCalled();
    expect(w.emitted('reload')).toHaveLength(1);
  });
});
```

在 `apps/web/src/i18n/zh-CN.test.ts` 末尾追加：

```ts
describe('外卖的错误文案', () => {
  it('按 reason / what 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'order_taken' })).toBe('这张单已经被别人接走了');
    expect(errorText('INVALID_STATE', { reason: 'rider_hired' })).toBe('他已经被别人雇为骑手了');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'double' })).toBe('持有"使命必达"才能加料');
    expect(errorText('LIMIT_REACHED', { what: 'rider_busy', max: 2 })).toBe('这个骑手同时送的单已经满了（2 单）');
    expect(errorText('LIMIT_REACHED', { what: 'riders', max: 1 })).toBe('骑手已经满员了（1 个）');
    expect(errorText('ALREADY_DONE', { what: 'takeaway' })).toBe('已经开通外卖了');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/takeaway src/i18n`
Expected: FAIL——`Failed to resolve import "./OpenPanel.vue"`、`"./OrdersPanel.vue"`；文案测试不等

- [ ] **Step 3: 接口、文案、标签**

`apps/web/src/api/endpoints.ts`：文件开头 `import type { ... } from '@dt/shared';` 的列表里加 `RiderCandidateDto`、`TakeawayClaimDto`、`TakeawayDeliveryDto`、`TakeawayDto`；`endpoints` 对象最后一项之后（结尾 `};` 之前）加：

```ts
  takeaway: () => api.get<TakeawayDto>('/api/v1/takeaway'),
  takeawayOpen: (way: 'ticket' | 'coin') => api.post<{ opened: true }>('/api/v1/takeaway/open', { way }),
  takeawayRefresh: () => api.post<{ created: number }>('/api/v1/takeaway/refresh'),
  takeawayDeliver: (orderId: number, riderId: number, double: boolean) =>
    api.post<TakeawayDeliveryDto>('/api/v1/takeaway/deliver', { orderId, riderId, double }),
  takeawayClaim: (deliveryId: number, drone: boolean) =>
    api.post<TakeawayClaimDto>('/api/v1/takeaway/claim', { deliveryId, drone }),
  takeawayClaimAll: () => api.post<TakeawayClaimDto[]>('/api/v1/takeaway/claim-all'),
  takeawayCandidates: () => api.get<RiderCandidateDto[]>('/api/v1/takeaway/candidates'),
  takeawayHire: (restId: number) => api.post<{ riderId: number }>('/api/v1/takeaway/hire', { restId }),
  takeawayDismiss: (riderId: number) =>
    api.post<{ coin: number; exp: number }>('/api/v1/takeaway/dismiss', { riderId }),
```

`apps/web/src/i18n/zh-CN.ts`：
1. `REQUIREMENT` 里 `mc_count: ...` 下面加：

```ts
  not_learned: () => '还没学会这道菜',
  double: () => '持有"使命必达"才能加料',
  job_honor: () => '持有有效的商店工作证才能刷新',
```

2. `LIMIT` 里 `lands: ...` 下面加：

```ts
  rider_busy: (p) => `这个骑手同时送的单已经满了（${String(p.max)} 单）`,
  riders: (p) => `骑手已经满员了（${String(p.max)} 个）`,
```

3. `STATE` 里 `seed_not_sold: ...` 下面加：

```ts
  takeaway_closed: '还没开通外卖',
  order_gone: '这张外卖单已经没有了',
  order_taken: '这张单已经被别人接走了',
  rider_gone: '没有这个骑手',
  delivery_gone: '这一单已经领过了',
  not_arrived: '还没送到，可以用无人机立即送达',
  rider_hired: '他已经被别人雇为骑手了',
  rider_self: '不能解雇自己',
  rider_delivering: '这个骑手正在配送，送完再解雇',
```

4. `ALREADY` 里 `steal: ...` 下面加 `takeaway: '已经开通外卖了',`。

（如果 typecheck 报同名键，说明已有同名文案：删掉新加的那一行、沿用已有的，并在执行记录里写一条裁定）

`apps/web/src/utils/labels.ts` 末尾加：

```ts
/** 外卖单品级（下标 = 品级，规格书 14.2） */
export const TAKEAWAY_GRADES = ['', '普通', '中品', '上品', '极品', '金牌', '珍品', '佳肴'];
```

`apps/web/src/components/takeaway/format.ts`：

```ts
/** 从 now 到 at 还剩几分钟（向上取整，最少 0）；now 用概览里的服务器时间 */
export function minutesLeft(at: string, now: string): number {
  return Math.max(0, Math.ceil((Date.parse(at) - Date.parse(now)) / 60_000));
}
```

- [ ] **Step 4: 开通面板、外卖单面板**

`apps/web/src/components/takeaway/OpenPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const busy = ref(false);
const o = computed(() => props.data.open);

/** 两种方式都要满足的条件 */
const common = computed(() => {
  if (props.data.star < o.value.needStar) return `餐厅 ${o.value.needStar} 星才能开通`;
  if (props.data.renown < o.value.needRenown) return `声望不够（要 ${formatNum(o.value.needRenown)}）`;
  return '';
});
const blockTicket = computed(() => common.value || (o.value.tickets < 1 ? '没有外卖券' : ''));
const blockCoin = computed(() => {
  if (common.value) return common.value;
  if (props.data.coin < o.value.needCoin) return `银币不够（要 ${formatNum(o.value.needCoin)}）`;
  if (props.data.diamond < o.value.needDiamond) return `钻石不够（要 ${o.value.needDiamond}）`;
  return '';
});

async function open(way: 'ticket' | 'coin') {
  if (busy.value || (way === 'ticket' ? blockTicket.value : blockCoin.value)) return;
  busy.value = true;
  try {
    await endpoints.takeawayOpen(way);
    toast.push('外卖开通了，你成了自己的 1 号骑手');
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '开通失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small" data-testid="takeaway-open">
    <p class="mb-1">开通外卖后可以接全镇的外卖单，派骑手配送，赚银币、经验、声望和道具。</p>
    <ul class="mb-2">
      <li>餐厅 {{ o.needStar }} 星以上（现在 {{ data.star }} 星）</li>
      <li>声望 {{ formatNum(o.needRenown) }} 以上，开通时扣掉（现在 {{ formatNum(data.renown) }}）</li>
      <li>再用 1 张外卖券，或者 {{ formatNum(o.needCoin) }} 银币 + {{ o.needDiamond }} 钻石</li>
    </ul>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
      <button
        class="btn btn-sm btn-primary"
        data-testid="open-ticket"
        :disabled="busy || !!blockTicket"
        @click="open('ticket')"
      >
        用外卖券开通（持有 {{ o.tickets }} 张）
      </button>
      <span v-if="blockTicket" class="text-danger" data-testid="block-ticket">{{ blockTicket }}</span>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="open-coin"
        :disabled="busy || !!blockCoin"
        @click="open('coin')"
      >
        用银币和钻石开通
      </button>
      <span v-if="blockCoin" class="text-danger" data-testid="block-coin">{{ blockCoin }}</span>
    </div>
  </div>
</template>
```

`apps/web/src/components/takeaway/OrdersPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TakeawayDto, TakeawayOrderDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { TAKEAWAY_GRADES } from '../../utils/labels';
import { minutesLeft } from './format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const double = ref(false);
/** 还有空位的骑手 */
const free = computed(() => props.data.riders.filter((r) => r.busy < r.maxNum));
const riderId = ref<number | null>(null);
watch(
  free,
  (list) => {
    if (!list.some((r) => r.id === riderId.value)) riderId.value = list[0]?.id ?? null;
  },
  { immediate: true },
);
const mult = computed(() => (double.value ? 2 : 1));

/** 不能接的原因；空串表示可以 */
function blockOf(o: TakeawayOrderDto): string {
  if (o.block === 'not_learned') return '还没学会这道菜';
  if (o.block === 'renown') return `声望不够（要 ${o.needRenown}）`;
  if (o.foods.some((f) => f.have < f.need * mult.value)) return '食材不够';
  if (riderId.value === null) return '没有空闲的骑手';
  return '';
}
const refreshBlock = computed(() => {
  const r = props.data.refresh;
  if (!r.hasJob) return '要持有有效的商店工作证';
  if (props.data.coin < r.cost) return `银币不够（要 ${formatNum(r.cost)}）`;
  return '';
});

async function run(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function take(o: TakeawayOrderDto) {
  if (blockOf(o)) return;
  return run(async () => {
    const d = await endpoints.takeawayDeliver(o.id, riderId.value!, double.value);
    toast.push(`${d.cookbookName}出发了，${minutesLeft(d.arriveAt, props.data.now)} 分钟后送到`);
  }, '接单失败');
}
function refresh() {
  if (refreshBlock.value) return;
  return run(async () => {
    const r = await endpoints.takeawayRefresh();
    toast.push(`刷出了 ${r.created} 张私人单`);
  }, '刷新失败');
}
</script>

<template>
  <div class="small">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <span>声望 {{ formatNum(data.renown) }}</span>
      <select v-if="free.length" v-model.number="riderId" class="form-select form-select-sm w-auto" data-testid="rider-select">
        <option v-for="r in free" :key="r.id" :value="r.id">{{ r.name }}（在送 {{ r.busy }}/{{ r.maxNum }}）</option>
      </select>
      <span v-else class="text-muted">骑手都在送单</span>
      <label class="d-flex align-items-center gap-1">
        <input v-model="double" type="checkbox" :disabled="!data.canDouble" data-testid="double" />
        加料（食材 ×2，经验 ×2）
      </label>
      <span v-if="!data.canDouble" class="text-muted">持有"使命必达"才能加料</span>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <button
        class="btn btn-sm btn-outline-secondary"
        data-testid="refresh"
        :disabled="busy || !!refreshBlock"
        @click="refresh"
      >
        私人刷新（{{ formatNum(data.refresh.cost) }} 银币）
      </button>
      <span v-if="refreshBlock" class="text-danger" data-testid="refresh-block">{{ refreshBlock }}</span>
    </div>
    <div v-if="data.orders.length === 0" class="text-muted">现在没有外卖单，每个整点会补一批</div>
    <div v-for="o in data.orders" :key="o.id" class="border rounded p-2 mb-1" :data-testid="`order-${o.id}`">
      <div class="d-flex align-items-center gap-1">
        <span class="dt-tag">{{ TAKEAWAY_GRADES[o.grade] }}</span>
        <b>{{ o.cookbookName }}</b>
        <span v-if="o.private" class="badge text-bg-info">私人</span>
        <span class="ms-auto text-muted">还剩 {{ minutesLeft(o.expiresAt, data.now) }} 分钟有效</span>
      </div>
      <div class="text-muted">配送 {{ o.needMinutes }} 分钟 · 要 {{ o.needRenown }} 声望</div>
      <div>
        <span
          v-for="f in o.foods"
          :key="f.foodsId"
          :class="['me-2', f.have < f.need * mult ? 'text-danger' : 'text-success']"
          >{{ catalog.foodName(f.foodsId) }} {{ f.need * mult }}/{{ f.have }}</span
        >
      </div>
      <div class="d-flex align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`take-${o.id}`"
          :disabled="busy || !!blockOf(o)"
          @click="take(o)"
        >
          接单
        </button>
        <span v-if="blockOf(o)" class="text-danger" :data-testid="`why-${o.id}`">{{ blockOf(o) }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/takeaway src/i18n`
Expected: PASS

Run: `pnpm --filter @dt/web typecheck`
Expected: 无报错

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/web/src/api/endpoints.ts apps/web/src/i18n apps/web/src/utils/labels.ts apps/web/src/components/takeaway
git add apps/web/src
git commit -m "feat(web): takeaway endpoints, error texts, open panel and orders panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 前端——配送中、骑手、外卖页、路由、入口

**Files:**
- Create: `apps/web/src/components/takeaway/DeliveriesPanel.vue`、`DeliveriesPanel.test.ts`
- Create: `apps/web/src/components/takeaway/RidersPanel.vue`、`RidersPanel.test.ts`
- Create: `apps/web/src/views/TakeawayView.vue`、`TakeawayView.test.ts`
- Modify: `apps/web/src/router.ts`、`apps/web/src/components/MoreLinks.vue`、`apps/web/src/views/MoreView.test.ts`

**Interfaces:**
- Consumes: Task 9 的接口、`testData`、`minutesLeft`、`TAKEAWAY_GRADES`、`OpenPanel`、`OrdersPanel`
- Produces: 路由 `/takeaway`（`name: 'takeaway'`，需要餐厅）；外卖页标签 `tab-orders`、`tab-deliveries`、`tab-riders`，记在 `localStorage` 的 `dt_takeaway_tab`；配送 `delivery-<id>`、`claim-<id>`、`drone-<id>`、`claim-all`、`result`、`result-head`；骑手 `rider-<id>`、`dismiss-<id>`、`cand-<restId>`、`hire-<restId>`、`hire-why-<restId>`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/takeaway/DeliveriesPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import DeliveriesPanel from './DeliveriesPanel.vue';
import { claimResult, delivery, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { takeawayClaim: vi.fn(), takeawayClaimAll: vi.fn() },
}));

describe('DeliveriesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没到：写还要几分钟，不能领；无人机立即送达，显示结果并通知刷新', async () => {
    vi.mocked(endpoints.takeawayClaim).mockResolvedValue(claimResult({ drone: true, goods: { id: 1, num: 2 } }));
    const w = mount(DeliveriesPanel, { props: { data: takeawayData({ deliveries: [delivery()] }) } });
    expect(w.find('[data-testid="delivery-21"]').text()).toContain('还要 30 分钟');
    expect(w.find('[data-testid="claim-21"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="drone-21"]').text()).toBe('无人机（3 钻石）');
    await w.find('[data-testid="drone-21"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayClaim).toHaveBeenCalledWith(21, true);
    expect(w.find('[data-testid="result-head"]').text()).toBe('无人机送到了');
    expect(w.find('[data-testid="result"]').text()).toContain('银币 +198');
    expect(w.find('[data-testid="result"]').text()).toContain('道具1×2');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('钻石不够时无人机灰掉；已到的可以领，失败写原因', async () => {
    vi.mocked(endpoints.takeawayClaim).mockResolvedValue(
      claimResult({ success: false, reason: '顾客退单了!', coin: 0, renown: 0, exp: 6, goods: null, riderExp: 12 }),
    );
    const poor = mount(DeliveriesPanel, { props: { data: takeawayData({ diamond: 2, deliveries: [delivery()] }) } });
    expect(poor.find('[data-testid="drone-21"]').attributes('disabled')).toBeDefined();
    const w = mount(DeliveriesPanel, {
      props: { data: takeawayData({ deliveries: [delivery({ arrived: true, arriveAt: '2026-09-30T03:50:00.000Z' })] }) },
    });
    expect(w.find('[data-testid="delivery-21"]').text()).toContain('已送到');
    await w.find('[data-testid="claim-21"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayClaim).toHaveBeenCalledWith(21, false);
    expect(w.find('[data-testid="result-head"]').text()).toBe('配送失败：顾客退单了!');
    expect(w.find('[data-testid="result"]').text()).toContain('骑手经验 +12');
  });

  it('全部领取：没有已到的就灰掉；领到几单显示几张结果', async () => {
    vi.mocked(endpoints.takeawayClaimAll).mockResolvedValue([
      claimResult(),
      claimResult({ deliveryId: 22, customer: 265 }),
    ]);
    const none = mount(DeliveriesPanel, { props: { data: takeawayData({ deliveries: [delivery()] }) } });
    expect(none.find('[data-testid="claim-all"]').attributes('disabled')).toBeDefined();
    const w = mount(DeliveriesPanel, {
      props: { data: takeawayData({ deliveries: [delivery({ arrived: true }), delivery({ id: 22, arrived: true })] }) },
    });
    await w.find('[data-testid="claim-all"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid="result"]')).toHaveLength(2);
    expect(w.text()).toContain('送外卖时偶遇道具265！');
  });
});
```

`apps/web/src/components/takeaway/RidersPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import RidersPanel from './RidersPanel.vue';
import { rider, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { takeawayCandidates: vi.fn(), takeawayHire: vi.fn(), takeawayDismiss: vi.fn() },
}));

const friend = rider({ id: 32, restId: 5, name: '乙店', self: false, exp: 3, busy: 0, dismissCoin: 150, dismissExp: 1500 });

describe('RidersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayCandidates).mockResolvedValue([
      { restId: 5, name: '乙店', level: 20, star: 1, block: 'mine' },
      { restId: 6, name: '丙店', level: 10, star: 1, block: null },
      { restId: 7, name: '丁店', level: 3, star: 0, block: 'star' },
    ]);
    vi.mocked(endpoints.takeawayHire).mockResolvedValue({ riderId: 33 });
    vi.mocked(endpoints.takeawayDismiss).mockResolvedValue({ coin: 150, exp: 1500 });
  });

  it('骑手的等级、经验和属性；解雇写明花费，确认后调用', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(RidersPanel, {
      props: { data: takeawayData({ riders: [rider(), friend], riderCap: 3 }) },
    });
    await flushPromises();
    expect(w.find('[data-testid="rider-31"]').text()).toContain('我的店（自己）');
    expect(w.find('[data-testid="rider-31"]').text()).toContain('经验 6/1,300');
    expect(w.find('[data-testid="rider-31"]').text()).toContain('成功率 80%');
    expect(w.find('[data-testid="dismiss-31"]').exists()).toBe(false);
    await w.find('[data-testid="dismiss-32"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('花 150 银币，得到 1,500 经验');
    expect(endpoints.takeawayDismiss).toHaveBeenCalledWith(32);
    expect(w.emitted('reload')).toHaveLength(1);
    confirm.mockRestore();
  });

  it('正在配送的骑手不能解雇', async () => {
    const w = mount(RidersPanel, { props: { data: takeawayData({ riders: [rider(), { ...friend, busy: 1 }] }) } });
    await flushPromises();
    expect(w.find('[data-testid="dismiss-32"]').attributes('disabled')).toBeDefined();
  });

  it('可雇的好友：不能雇的写原因；雇佣后刷新列表；满员时都灰掉', async () => {
    const w = mount(RidersPanel, { props: { data: takeawayData({ riders: [rider(), friend], riderCap: 3 }) } });
    await flushPromises();
    expect(w.find('[data-testid="hire-why-5"]').text()).toBe('已经是你的骑手');
    expect(w.find('[data-testid="hire-why-7"]').text()).toBe('要 1 星以上');
    await w.find('[data-testid="hire-6"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayHire).toHaveBeenCalledWith(6);
    expect(endpoints.takeawayCandidates).toHaveBeenCalledTimes(2);
    expect(w.emitted('reload')).toHaveLength(1);
    const full = mount(RidersPanel, { props: { data: takeawayData({ riders: [rider(), friend], riderCap: 2 }) } });
    await flushPromises();
    expect(full.find('[data-testid="hire-why-6"]').text()).toBe('骑手已满员');
    expect(full.find('[data-testid="hire-6"]').attributes('disabled')).toBeDefined();
  });
});
```

`apps/web/src/views/TakeawayView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { takeawayData } from '../components/takeaway/testData';
import TakeawayView from './TakeawayView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { takeaway: vi.fn() } }));

const stubs = {
  OpenPanel: { template: '<p>open-panel</p>', props: ['data'] },
  OrdersPanel: {
    template: `<button data-testid="again" @click="$emit('reload')">orders-panel</button>`,
    props: ['data'],
    emits: ['reload'],
  },
  DeliveriesPanel: { template: '<p>deliveries-panel</p>', props: ['data'] },
  RidersPanel: { template: '<p>riders-panel</p>', props: ['data'] },
};

describe('TakeawayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('没开通时只显示开通面板', async () => {
    vi.mocked(endpoints.takeaway).mockResolvedValue(takeawayData({ opened: false }));
    const w = mount(TakeawayView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain('open-panel');
    expect(w.find('[data-testid="tab-orders"]').exists()).toBe(false);
  });

  it('开通后默认外卖单标签；标签写数量；切到配送中并记住；面板要求刷新时重新读取', async () => {
    vi.mocked(endpoints.takeaway).mockResolvedValue(takeawayData());
    const w = mount(TakeawayView, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="tab-orders"]').text()).toBe('外卖单（1）');
    expect(w.find('[data-testid="tab-deliveries"]').text()).toBe('配送中（0）');
    await w.find('[data-testid="again"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeaway).toHaveBeenCalledTimes(2);
    await w.find('[data-testid="tab-deliveries"]').trigger('click');
    expect(w.text()).toContain('deliveries-panel');
    expect(localStorage.getItem('dt_takeaway_tab')).toBe('deliveries');
    const again = mount(TakeawayView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('deliveries-panel');
    await again.find('[data-testid="tab-riders"]').trigger('click');
    expect(again.text()).toContain('riders-panel');
  });
});
```

`apps/web/src/views/MoreView.test.ts`：把 `for (const x of ['特色菜', '神殿', '教室', '菜园', '酒吧', '厨塔', '厨具与加点'])` 改成 `for (const x of ['特色菜', '神殿', '教室', '菜园', '酒吧', '厨塔', '外卖', '厨具与加点'])`，标题 `'有特色菜、神殿、菜园、酒吧、厨塔、教室入口'` 改成 `'有特色菜、神殿、菜园、酒吧、厨塔、外卖、教室入口'`。

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/takeaway src/views/TakeawayView.test.ts src/views/MoreView.test.ts`
Expected: FAIL——`Failed to resolve import "./DeliveriesPanel.vue"`、`"./RidersPanel.vue"`、`"./TakeawayView.vue"`；MoreView 找不到"外卖"

- [ ] **Step 3: 配送中面板**

`apps/web/src/components/takeaway/DeliveriesPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayClaimDto, TakeawayDeliveryDto, TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { TAKEAWAY_GRADES } from '../../utils/labels';
import { minutesLeft } from './format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const results = ref<TakeawayClaimDto[]>([]);
const anyArrived = computed(() => props.data.deliveries.some((d) => d.arrived));
const droneBlock = (d: TakeawayDeliveryDto) => (props.data.diamond < d.drone ? `钻石不够（要 ${d.drone}）` : '');

async function run(fn: () => Promise<TakeawayClaimDto[]>) {
  if (busy.value) return;
  busy.value = true;
  try {
    results.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '领取失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
function claim(d: TakeawayDeliveryDto, drone: boolean) {
  if (drone ? droneBlock(d) : !d.arrived) return;
  return run(async () => [await endpoints.takeawayClaim(d.id, drone)]);
}
const claimAll = () => run(() => endpoints.takeawayClaimAll());

function headline(r: TakeawayClaimDto): string {
  if (!r.success) return `配送失败：${r.reason ?? ''}`;
  if (r.forced) return '配送成功（边牧帮了忙）';
  return r.drone ? '无人机送到了' : '配送成功';
}
function gains(r: TakeawayClaimDto): string {
  const parts: string[] = [];
  if (r.coin) parts.push(`银币 +${formatNum(r.coin)}`);
  if (r.exp) parts.push(`经验 +${formatNum(r.exp)}`);
  if (r.renown) parts.push(`声望 +${r.renown}`);
  if (r.goods) parts.push(`${catalog.goodsName(r.goods.id)}×${r.goods.num}`);
  return parts.join('、');
}
</script>

<template>
  <div class="small">
    <div
      v-for="r in results"
      :key="r.deliveryId"
      :class="['border rounded p-2 mb-2', r.success ? 'border-success' : 'border-danger']"
      data-testid="result"
    >
      <div :class="['fw-bold', r.success ? 'text-success' : 'text-danger']" data-testid="result-head">
        {{ headline(r) }}
      </div>
      <div v-if="gains(r)">得到 {{ gains(r) }}</div>
      <div class="text-muted">骑手经验 +{{ r.riderExp }}（{{ r.riderLevel }} 级）</div>
      <div v-if="r.customer" class="text-primary">送外卖时偶遇{{ catalog.goodsName(r.customer) }}！</div>
    </div>
    <div class="mb-2">
      <button
        class="btn btn-sm btn-success"
        data-testid="claim-all"
        :disabled="busy || !anyArrived"
        @click="claimAll"
      >
        全部领取
      </button>
    </div>
    <div v-if="data.deliveries.length === 0" class="text-muted">没有在送的外卖</div>
    <div
      v-for="d in data.deliveries"
      :key="d.id"
      class="border rounded p-2 mb-1"
      :data-testid="`delivery-${d.id}`"
    >
      <div class="d-flex align-items-center gap-1">
        <span class="dt-tag">{{ TAKEAWAY_GRADES[d.grade] }}</span>
        <b>{{ d.cookbookName }}</b>
        <span v-if="d.private" class="badge text-bg-info">私人</span>
        <span v-if="d.double" class="badge text-bg-warning">加料</span>
        <span class="ms-auto">{{ d.arrived ? '已送到' : `还要 ${minutesLeft(d.arriveAt, data.now)} 分钟` }}</span>
      </div>
      <div class="text-muted">骑手 {{ d.riderName }}</div>
      <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`claim-${d.id}`"
          :disabled="busy || !d.arrived"
          @click="claim(d, false)"
        >
          领取
        </button>
        <template v-if="!d.arrived">
          <button
            class="btn btn-sm btn-outline-secondary"
            :data-testid="`drone-${d.id}`"
            :disabled="busy || !!droneBlock(d)"
            @click="claim(d, true)"
          >
            无人机（{{ d.drone }} 钻石）
          </button>
          <span v-if="droneBlock(d)" class="text-danger">{{ droneBlock(d) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 骑手面板**

`apps/web/src/components/takeaway/RidersPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RiderCandidateDto, TakeawayDto, TakeawayRiderDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const busy = ref(false);
const cands = ref<RiderCandidateDto[]>([]);
const full = computed(() => props.data.riders.length >= props.data.riderCap);
const REASON: Record<string, string> = {
  target_npc: '不能雇蟹老板',
  star: '要 1 星以上',
  mine: '已经是你的骑手',
  hired: '已被别人雇了',
};

async function loadCands() {
  try {
    cands.value = await endpoints.takeawayCandidates();
  } catch (e) {
    toast.push(errorMessage(e, '读取好友失败'), 'danger');
  }
}
onMounted(loadCands);

const hireBlock = (c: RiderCandidateDto) => (c.block ? (REASON[c.block] ?? c.block) : full.value ? '骑手已满员' : '');
const attrs = (r: TakeawayRiderDto) =>
  `减时 ${r.timeSub}% · 银币 +${r.coinAdd}% · 经验 +${r.expAdd}% · 声望 +${r.renownAdd}% · 成功率 ${r.odds / 10}%`;

async function run(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await loadCands();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function hire(c: RiderCandidateDto) {
  if (hireBlock(c)) return;
  return run(async () => {
    await endpoints.takeawayHire(c.restId);
    toast.push(`雇了${c.name}当骑手`);
  }, '雇佣失败');
}
function dismiss(r: TakeawayRiderDto) {
  if (r.busy > 0) return;
  if (!window.confirm(`解雇${r.name}：花 ${formatNum(r.dismissCoin)} 银币，得到 ${formatNum(r.dismissExp)} 经验，确定吗？`))
    return;
  return run(() => endpoints.takeawayDismiss(r.id).then(() => undefined), '解雇失败');
}
</script>

<template>
  <div class="small">
    <div class="mb-2">骑手 {{ data.riders.length }}/{{ data.riderCap }}（自己这个骑手升级后上限会增加）</div>
    <div v-for="r in data.riders" :key="r.id" class="border rounded p-2 mb-1" :data-testid="`rider-${r.id}`">
      <div class="d-flex align-items-center gap-1">
        <b>{{ r.name }}{{ r.self ? '（自己）' : '' }}</b>
        <span class="dt-tag">{{ r.level }} 级</span>
        <span class="ms-auto">在送 {{ r.busy }}/{{ r.maxNum }}</span>
      </div>
      <div class="text-muted">经验 {{ formatNum(r.exp) }}/{{ formatNum(r.needExp) }} · {{ attrs(r) }}</div>
      <div v-if="!r.self" class="d-flex align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-outline-danger"
          :data-testid="`dismiss-${r.id}`"
          :disabled="busy || r.busy > 0"
          @click="dismiss(r)"
        >
          解雇
        </button>
        <span v-if="r.busy > 0" class="text-danger">在配送，送完再解雇</span>
      </div>
    </div>
    <h6 class="mt-3">雇好友当骑手</h6>
    <div v-if="cands.length === 0" class="text-muted">还没有好友</div>
    <div
      v-for="c in cands"
      :key="c.restId"
      class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
      :data-testid="`cand-${c.restId}`"
    >
      <span class="flex-fill">{{ c.name }}（{{ c.level }} 级 · {{ c.star }} 星）</span>
      <button
        class="btn btn-sm btn-outline-primary"
        :data-testid="`hire-${c.restId}`"
        :disabled="busy || !!hireBlock(c)"
        @click="hire(c)"
      >
        雇佣
      </button>
      <span v-if="hireBlock(c)" class="text-danger" :data-testid="`hire-why-${c.restId}`">{{ hireBlock(c) }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 外卖页、路由、入口**

`apps/web/src/views/TakeawayView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DeliveriesPanel from '../components/takeaway/DeliveriesPanel.vue';
import OpenPanel from '../components/takeaway/OpenPanel.vue';
import OrdersPanel from '../components/takeaway/OrdersPanel.vue';
import RidersPanel from '../components/takeaway/RidersPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'orders' | 'deliveries' | 'riders';
const KEY = 'dt_takeaway_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'deliveries' || v === 'riders' ? v : 'orders';
  } catch {
    return 'orders';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<TakeawayDto | null>(null);

async function load() {
  try {
    data.value = await endpoints.takeaway();
  } catch (e) {
    toast.push(errorMessage(e, '读取外卖失败'), 'danger');
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

const tabs = computed(() =>
  data.value
    ? [
        { key: 'orders' as Tab, label: `外卖单（${data.value.orders.length}）` },
        { key: 'deliveries' as Tab, label: `配送中（${data.value.deliveries.length}）` },
        { key: 'riders' as Tab, label: '骑手' },
      ]
    : [],
);
</script>

<template>
  <h5>外卖</h5>
  <template v-if="data">
    <OpenPanel v-if="!data.opened" :data="data" @reload="load" />
    <template v-else>
      <ul class="nav nav-tabs mb-2">
        <li v-for="x in tabs" :key="x.key" class="nav-item">
          <a
            :class="['nav-link', { active: tab === x.key }]"
            href="#"
            :data-testid="`tab-${x.key}`"
            @click.prevent="tab = x.key"
            >{{ x.label }}</a
          >
        </li>
      </ul>
      <OrdersPanel v-if="tab === 'orders'" :data="data" @reload="load" />
      <DeliveriesPanel v-else-if="tab === 'deliveries'" :data="data" @reload="load" />
      <RidersPanel v-else :data="data" @reload="load" />
    </template>
  </template>
</template>
```

`apps/web/src/router.ts`：在 `/tower` 那条路由之后加：

```ts
  {
    path: '/takeaway',
    name: 'takeaway',
    component: () => import('./views/TakeawayView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/components/MoreLinks.vue`：`玩法` 组里 `{ to: '/tower', icon: 'bi-building', label: '厨塔' },` 下面加：

```ts
      { to: '/takeaway', icon: 'bi-bicycle', label: '外卖' },
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/takeaway src/views/TakeawayView.test.ts src/views/MoreView.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/web typecheck`
Expected: 无报错

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/web/src/components/takeaway apps/web/src/views/TakeawayView.vue apps/web/src/views/TakeawayView.test.ts apps/web/src/router.ts apps/web/src/components/MoreLinks.vue apps/web/src/views/MoreView.test.ts
git add apps/web/src
git commit -m "feat(web): takeaway page with deliveries and riders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/takeaway.spec.ts`
- Modify: `docs/rules/收益与加成.md`（末尾加第 11 节）、`docs/deploy.md`（末尾加一节）

- [ ] **Step 1: 端到端测试**

`apps/web/e2e/takeaway.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('外卖：外卖券开通 → 私人刷新 → 接单 → 无人机送达', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number; shardId: number };
  };
  const { id: restId, shardId } = overview.data;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 2 星、声望和银币够开通和刷新、钻石够一次无人机
    await client.query(
      `update restaurant set star_level = 2, renown = 1000, coin = 2000000, diamond = 20 where id = $1`,
      [restId],
    );
    // 外卖券、商店工作证（勋章不带有效期即长期有效）
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 263, 1), ($1, 108, 1)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [restId],
    );
    // 学会南煎丸子（食谱 1，品级 1），备好猪肉、鸡蛋、香葱
    await client.query(`update restaurant_cookbooks set levels = set_byte(levels, 1, 1) where rest_id = $1`, [restId]);
    await client.query(
      `insert into cupboard_food (rest_id, foods_id, num) values ($1, 239, 5), ($1, 242, 5), ($1, 250, 5)
       on conflict (rest_id, foods_id) do update set num = excluded.num`,
      [restId],
    );
    // 一张自己的私人单：南煎丸子、普通
    const { rows } = await client.query<{ id: number }>(
      `insert into takeaway_order (shard_id, owner_rest_id, cookbook_id, grade, need_minutes, need_renown, created_at, expires_at)
       values ($1, $2, 1, 1, 30, 3, now(), now() + interval '2 hours') returning id`,
      [shardId, restId],
    );
    const orderId = rows[0]!.id;

    await page.goto('/takeaway');
    await page.getByTestId('open-ticket').click();
    await expect(page.getByTestId('tab-orders')).toBeVisible();

    await page.getByTestId('refresh').click();
    await expect(page.locator('[data-testid^="order-"]').filter({ hasText: '私人' })).toHaveCount(16);

    await page.getByTestId(`take-${orderId}`).click();
    await page.getByTestId('tab-deliveries').click();
    await expect(page.getByTestId('tab-deliveries')).toHaveText('配送中（1）');
    await page.locator('[data-testid^="drone-"]').first().click();
    await expect(page.getByTestId('result-head')).toHaveText('无人机送到了');
    await expect(page.getByTestId('tab-deliveries')).toHaveText('配送中（0）');
  } finally {
    await client.end();
  }
});
```

- [ ] **Step 2: 规则文档**

`docs/rules/收益与加成.md` 末尾追加：

```markdown

## 11. 外卖（子项目 4D）

**开通**：餐厅 2 星、声望 888（开通时扣掉），再用 1 张外卖券或者 888 万银币 + 300 钻石。开通后自己是 1 号骑手。

**外卖单**：
- 全服公共单每个整点补一次：目标数 = 随机 0~17 + 5 + 营业店数/15（营业店不足 10 按 30 算），先到先得。
- 私人刷新：持有商店工作证，100 万银币 × 今天第几次，每次送 160 声望，给自己刷 15 张，只有自己能接。
- 品级：普通 40%、中品 25%、上品 15%、极品 10%、金牌 5%、珍品 3.5%、佳肴 1.5%（g = 1~7）。配送时长 20 + 随机(0~10g−1) 分钟；所需声望 2g + 随机(1~g)。

**接单**：这道菜要学会；按我这道菜当前品级要的食材，每种 × g（加料再 ×2，要持有"使命必达"）；扣食材和所需声望。这一单的数值在接单时定下：
- 基础 = 售价 × g × (1 + 我的品级/10)；银币 = 基础 × 0.24（售价过 100 万时 0.05），经验 = 基础 × 0.72（过 100 万时 0.22）/ 45 × 餐厅等级。
- 银币、经验再乘 (1 + 骑手加成 + 天气 + 我的加成)；声望 = g × (1 + 骑手声望加成 + 天气 + 我的加成)。
- 配送时长 × (1 − 骑手减时 + 天气 + 我的加成)，最少 1 分钟。
- 成功率 = 随机浮动(−9.9% ~ +10%) + 骑手成功率 + 天气 + 我的加成 + 骑手幸运率 × 20%。

**领取**：送到后领取，或花 2g+1 钻石叫无人机立即完成（必定成功、骑手经验 ×2、礼券多 g 张）。
- 私人单必定成功，经验 ×1.5；骑手是好友时银币、经验 ×0.9，他的店拿 1/9 回扣。
- 成功：银币、经验、声望，奖池抽 1 件（神秘礼券 56、探险图 30、蟹币 8、高级探险图 6、顶级探险图 2、美味券 1，品级越高礼券以外越多；礼券给 1~2g 张）。
- 失败：只有一半经验（有咕咕给全部）；边牧让失败有 30% 改判成功。
- 神秘顾客：1.5% + 骑手幸运率/50，成功遇到珊迪、失败遇到派大星。

**骑手**：可以雇 1 星以上的好友（一家店同时只能被一个人雇）。从 n 级升级要 n² × 800 + 500 经验，最高 50 级。
- 每级：减时 +1%（最多 40%）、经验 +2%、银币 +1%，每 2 级声望 +1%；成功率 80% 起每级 +0.5%，最多 95%；同时配送数 1 + 等级/5。
- 骑手经验 = √(10g) × 2 × (失败 ×2) × (无人机 ×2) × (神秘食材种数 + 1) × (1 + 骑手经验加成)。
- 自己这个骑手升到 2、5、8 级时可雇上限 +1。解雇：花 当前经验 × 50 银币，得 当前经验 × 500 经验。
```

- [ ] **Step 3: 部署文档**

`docs/deploy.md` 末尾追加：

```markdown

## 外卖（子项目 4D）

- 迁移 0013 新建 `takeaway_state`（开通状态和可雇骑手上限）、`takeaway_rider`（骑手；一家店同时只能被一个人雇，用部分唯一索引保证）、`takeaway_order`（外卖单）、`takeaway_delivery`（配送）
- 新功能开关 `features.takeaway`（默认开）。关闭后外卖接口返回"这个区服暂未开放该功能"，主线第 34、35 步和配送支线跳过，定时任务跳过该区服
- worker 新任务：`takeaway-orders`（每个游戏整点补全服公共单，同时删过期超过 1 天的未接单和 7 天前完成的单）
- 数值在 `tuning.takeaway`（开通费用、公共单数量、品级概率、私人刷新、数值系数、骑手成长、奖池、神秘顾客、清理天数）
- 任务 34、35、122 的跳转地址改为 `/takeaway`
```

- [ ] **Step 4: 本地跑端到端**

1. 停掉旧的 dev 进程：PowerShell `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tsx\\dist\\cli.mjs|vite\\bin\\vite.js' } | ForEach-Object { taskkill /T /F /PID $_.ProcessId }`
2. Run: `pnpm --filter @dt/config build` 然后 `pnpm --filter @dt/server migrate:dev`
   Expected: 执行 `0013_takeaway`
3. 后台启动 `pnpm dev`，等输出里出现 "became leader" 和 "Server listening"
4. Run: `pnpm --filter @dt/web e2e`
   Expected: 全部通过（含新的 `takeaway.spec.ts`）

- [ ] **Step 5: 验收并提交**

Run: `pnpm test`、`pnpm typecheck`、`pnpm lint`
Expected: 全部通过、无报错

```bash
npx prettier --write apps/web/e2e/takeaway.spec.ts docs/rules/收益与加成.md docs/deploy.md
git add apps/web/e2e/takeaway.spec.ts docs/rules/收益与加成.md docs/deploy.md
git commit -m "test(e2e): takeaway flow; docs: takeaway rules and deploy notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
