# 子项目 4C-2「厨塔」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能挑战守塔人、打赛厨榜、和好友切磋（胜负按五项评分），赛厨榜每周一结算发名次礼包，声望能在声望商店换东西；主线第 27 步、支线「和好友切磋 10 次」开放，厨塔挑战券能用。

**Architecture:** 配置包新增守塔人 `towerFloors`（构建时按原版厨力校准属性）、声望商店 `renownShop` 正式字段和 `tuning.tower`；迁移 0012 建 `tower_state`、`tower_watchman_mc`、`tower_rank`。服务端新增 `modules/tower/`：纯函数 `duel.ts`（五项评分和胜负）和 `rules.ts`；`sides.ts` 组装一方的对决属性；`common.ts` 放每日计数键和切磋奖励；`tower.ts`、`watchman.ts`、`rank.ts`、`friendDuel.ts`、`shop.ts` 各管一块；`jobs.ts` 是守塔人换菜和赛厨榜周结算；`service.ts` 装配（写操作走 `runOp`，好友切磋走 `runPairOp`），`routes.ts` 注册。前端新增 `/tower` 页（厨塔、赛厨榜、声望商店）和好友店的"切磋"。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4c2-tower-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1/tower...` 下，由 `modules/tower/routes.ts` 的 `towerRoutes(svc)` 注册
- 厨塔、赛厨榜、声望商店的写操作走 `runOp`（功能名 `tower`）；好友切磋走 `runPairOp`（`friend: 'required'`）；读接口开头 `d.shards.ensureFeature(ctx.shardId, 'tower')`
- 赛厨榜的占位和挑战在事务里先取咨询锁 `pg_advisory_xact_lock(hashtext('tower.rank:<区服>:<周一>'))`，再读名次、判断、改写
- 不新增错误码。原因名：`INVALID_STATE` reason `floor_locked`（params `minLevel`、`needFloor`）、`tower_night`（`openHour`）、`rank_taken`、`rank_empty`、`rank_not_better`、`rank_gap`（`need`）、`npc`、`not_on_sale`；`LIMIT_REACHED` what `tower`、`watchman`、`rank`、`duel`、`weekly`、`owned`（`max`）；`REQUIREMENT_NOT_MET` reason `renown`（params `what: 'duel'`）、`star`（`need: 1`）；`NOT_ENOUGH` strength / renown；`VALIDATION_FAILED` reason `floor`、`rank`、`num`
- 事件键（`emitAction`）：`tower.challenge`（正式挑战，每次 1）、`tower.rank`（赛厨榜挑战）、`tower.friendDuel`（好友切磋）；占位、试打、商店不发事件
- 流水来源：`tower.challenge`、`tower.rank`、`tower.duel`、`tower.shop`、`tower.rank.week`
- 新闻：`tower.rank.week` `{top: [{rank, restId, name}]}`、`tower.shop.rare` `{goodsId}`（只写入，展示归 4E）
- 每日计数键（`daily_counter`，日期一律传 `gameDay(o.now)`，不要用默认参数）：`tower.done`、`tower.ticket`、`tower.floor:<层>`、`tower.rankDone`、`tower.spar`、`tower.duel:<好友店 id>`；声望商店 `renownShop:<goodsId>`（日期 = 本周一，用 `friend/weekly.ts` 的 `mondayOf`）
- 随机数一律走 `o.rng`（守塔人换菜走 `d.rng()`）；对决的随机数顺序：挑战方色香味形养，再被挑战方；每项先抽"正"（1 或 2 个），再抽幅度；之后才是随机奖励
- 界面文字全部中文；按钮灰掉时写明原因；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交前对改动文件跑 `npx prettier --write`；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 测试命令：`pnpm --filter <包> exec vitest run <路径>`（各包没有 test 脚本）；类型检查 `pnpm --filter <包> typecheck`
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build`；`packages/config/data` 被 prettier 忽略，改 JSON 时插入文本块，不整体重写

## 计划层面的裁定（相对设计文档）

1. 赛厨榜被挑战方的幸运 = 它的基础幸运 + 它缓存的加成汇总（`restaurant.effect_agg.luckValue`），不重算、不锁它的店：重算会写它的餐厅行，两个人互相挑战时会死锁。代价：它的幸运最多落后一次加成变化
2. 雕像已拥有报现有的 `LIMIT_REACHED` what `owned`（前端已有文案"已经拥有了，不能再买"），不用设计文档 §7 写的 `ALREADY_DONE` what `owned`。代价：无
3. 赛厨榜每日次数的计数键叫 `tower.rankDone`（设计文档 §4.1 写的 `tower.rank` 和事件键同名，容易混）。代价：无
4. 本周一用现有 `modules/friend/weekly.ts` 的 `mondayOf`；ISO 周数放在 `tower/rules.ts`。代价：无
5. 试打也跑一次对决（消耗随机数、显示五项），只是没有奖励和声望
6. 好友切磋声望为负报 `REQUIREMENT_NOT_MET` reason `renown` 并带 `what: 'duel'`，前端据此显示"声望为负时不能切磋"（点赞的同名原因不带 what）
7. `store.test.ts` 里"厨塔挑战券报 NOT_USABLE"的断言去掉：功能开放后挑战券能用
8. 守塔人换菜：每层依次"抽菜 → 抽价值"两个随机数；已经抽过的层当天再跑会覆盖（任务只在每期跑一次）
9. `task.test.ts` 的"跳过未开放功能"例子改成第 34、35 步外卖（厨塔开放后第 27 步不再跳过）；`periodic.test.ts` 的"未实现功能"例子改成 `takeaway`
10. 厨塔概览多给每层正式挑战的体力 `cost` 和试打体力 `testCost`（设计文档 §5 没列），前端据此写"体力不够（要 n）"

## Review Focus

1. **两个人同时占同一个空位**：只有一个成功，另一个报 `rank_taken`，榜上不会出现两个人。→ Task 6 测试
2. **周一 0 点之后**：本周的榜是空的，上周的名次只在 00:01 的结算里发礼包，不带到新一周。→ Task 6 测试
3. **守塔人的菜还没抽过**（新区服或 05:58 之前）：4 层以上"养"按 0 算，概览里菜为空，挑战不报错。→ Task 5 测试
4. **今日厨塔次数用完之后试打**：仍然可以，只扣 1 体力，次数不变。→ Task 4 测试
5. **赛厨榜挑战也计入切磋总次数**：好友切磋的声望上限按合计算。→ Task 6 测试

---

## 文件结构

```
packages/config/src/types.ts                 TowerFloor、RenownShopItem；ConfigBundle.towerFloors / renownShop
packages/config/src/raw.ts                   rawTowerFloor；rawRenownShop 完整结构
packages/config/src/towerFloor.ts            calibrateWatchman（纯函数）
packages/config/src/towerFloor.test.ts
packages/config/src/source.ts                加 dataset/tower_floors
packages/config/src/build.ts                 守塔人、声望商店正式字段、礼包和挑战券校验；extra 去掉 renownShop
packages/config/src/runtime.ts               GameConfig.towerFloors（按层）
packages/config/src/ids.ts                   GOODS.towerTicket
packages/config/src/tuning.ts、data/game/tuning.json   tower 段
packages/config/data/game/action_map.json    tower.rank → 与好友赛厨
packages/shared/src/schemas/tower.ts         接口 body 和 DTO
apps/server/src/db/migrations/0012_tower.ts、0012.test.ts
apps/server/src/db/schema.ts                 3 张表类型
apps/server/src/core/features.ts             'tower'
apps/server/src/modules/store/use.ts         挑战券
apps/server/src/modules/store/store.test.ts  去掉挑战券 NOT_USABLE 断言
apps/server/src/modules/tower/
  duel.ts             五项评分、胜负、厨力（纯函数）
  rules.ts            厨塔、切磋、赛厨榜、商店的纯规则
  rules.test.ts       duel 和 rules 的测试
  sides.ts            sideOf、playerSide、cachedSide、watchmanSide、mcPriceOf、sideDto
  common.ts           KEY、badInput、lockTowerState、sparAwards
  tower.ts            towerView、challengeTower
  watchman.ts         cookWatchmen、watchmanPeriod
  rank.ts             rankView、occupyRank、challengeRank、settleRankWeek、rankWeekPeriod
  friendDuel.ts       duelInfo、friendDuel
  shop.ts             shopView、buyShop
  jobs.ts             towerJobs
  service.ts          createTowerService
  routes.ts           towerRoutes
  tower.test.ts、watchman.test.ts、rank.test.ts、duel.test.ts、shop.test.ts
apps/server/src/modules/index.ts、game.ts    注册服务、路由、定时任务
apps/web/src/api/endpoints.ts                tower 接口
apps/web/src/i18n/zh-CN.ts                   新原因的文案；KIND 加声望
apps/web/src/components/tower/
  DuelResult.vue、FloorPanel.vue、RankPanel.vue、ShopPanel.vue、FriendDuel.vue（各带 .test.ts）
  testData.ts
apps/web/src/views/TowerView.vue、TowerView.test.ts
apps/web/src/views/FriendRestView.vue、FriendRestView.test.ts   切磋
apps/web/src/router.ts                       /tower
apps/web/src/views/MoreView.vue、MoreView.test.ts   厨塔入口
apps/web/e2e/tower.spec.ts
docs/rules/收益与加成.md、docs/deploy.md
```

---

### Task 1: 配置——守塔人、声望商店、tuning.tower、挑战券、活跃映射

**Files:**
- Create: `packages/config/src/towerFloor.ts`、`packages/config/src/towerFloor.test.ts`
- Modify: `packages/config/src/types.ts`、`raw.ts`、`source.ts`、`build.ts`、`runtime.ts`、`ids.ts`、`tuning.ts`
- Modify: `packages/config/data/game/tuning.json`、`packages/config/data/game/action_map.json`
- Test: `packages/config/src/build.test.ts`、`packages/config/src/runtime.test.ts`

**Interfaces:**
- Produces:
  - `calibrateWatchman(floor: number, minLevel: number, power: number): { attrs: EquipAttrs; power: number }`
  - `interface TowerFloor { floor; name; title; minLevel; maxTimes; mc: boolean; note: string; attrs: EquipAttrs; power: number }`
  - `interface RenownShopItem { goodsId; renown; rare: boolean; weeklyLimit; weekGroup; require: string | null }`
  - `ConfigBundle.towerFloors: TowerFloor[]`（按层排序）、`ConfigBundle.renownShop: RenownShopItem[]`
  - `GameConfig.towerFloors: ReadonlyMap<number, TowerFloor>`（键 = 层）
  - `Tuning['tower']`（字段见 Step 4）
  - `GOODS.towerTicket = 136`

- [ ] **Step 1: 写失败的测试**

`packages/config/src/towerFloor.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { calibrateWatchman } from './towerFloor';

describe('calibrateWatchman（设计文档裁定 1）', () => {
  it('按规格书 20.14 的比例缩放到原版厨力', () => {
    expect(calibrateWatchman(1, 1, 30)).toEqual({
      attrs: { cook: 7, cutting: 7, fire: 7, season: 4, creatives: 4, luck: 1 },
      power: 29,
    });
    expect(calibrateWatchman(10, 91, 2601)).toEqual({
      attrs: { cook: 599, cutting: 599, fire: 599, season: 331, creatives: 331, luck: 288 },
      power: 2603,
    });
  });
});
```

在 `packages/config/src/build.test.ts` 末尾追加：

```ts
describe('厨塔配置（子项目 4C-2）', () => {
  it('守塔人 10 层：名字、称号、最低等级、每日次数、是否比拼特色菜；属性按原版厨力校准', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const f = bundle!.towerFloors;
    expect(f.map((x) => x.floor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(f.map((x) => x.power)).toEqual([29, 96, 211, 334, 508, 707, 961, 1225, 1720, 2603]);
    expect(f[9]).toMatchObject({
      name: '彭祖',
      title: '食神',
      minLevel: 91,
      maxTimes: 2,
      mc: true,
      note: '你会做蛋炒饭吗?',
      attrs: { cook: 599, cutting: 599, fire: 599, season: 331, creatives: 331, luck: 288 },
    });
    expect(f.filter((x) => x.mc).map((x) => x.floor)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(f.map((x) => x.maxTimes)).toEqual([10, 10, 10, 10, 5, 3, 2, 1, 1, 2]);
  });

  it('声望商店是正式字段', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.renownShop).toHaveLength(12);
    expect(bundle!.renownShop[0]).toEqual({
      goodsId: 310,
      renown: 60,
      rare: false,
      weeklyLimit: 10,
      weekGroup: 0,
      require: null,
    });
    expect(bundle!.renownShop.find((x) => x.goodsId === 439)).toMatchObject({
      renown: 5000,
      rare: true,
      weekGroup: 4,
    });
    expect(bundle!.renownShop.find((x) => x.goodsId === 506)).toMatchObject({ require: 'xz' });
    expect('renownShop' in bundle!.extra).toBe(false);
  });

  it('赛厨榜礼包引用了不存在的道具', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { tower: { rankGifts: number[][] } };
    tuning.tower.rankGifts[0]![1] = 999999;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.tower.rankGifts references unknown goods 999999');
  });

  it('赛厨榜挑战计入活跃"与好友赛厨"', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.actionMap.activation['tower.rank']).toBe('与好友赛厨');
  });
});
```

在 `packages/config/src/runtime.test.ts` 末尾追加：

```ts
describe('厨塔索引（子项目 4C-2）', () => {
  it('守塔人按层索引；tuning.tower', () => {
    expect(config.towerFloors.get(1)).toMatchObject({ name: '见习模范餐厅', minLevel: 1, power: 29 });
    expect(config.towerFloors.get(11)).toBeUndefined();
    expect(config.tuning.tower).toMatchObject({
      dailyBase: 5,
      nightFloor: 3,
      openHour: 6,
      rankSize: 15,
      duelPerFriend: 10,
      sparMaxAt: 50,
      rankGifts: [
        [1, 202],
        [2, 203],
        [3, 204],
        [8, 205],
        [15, 206],
      ],
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run src/towerFloor.test.ts src/build.test.ts src/runtime.test.ts`
Expected: FAIL——`Failed to resolve import "./towerFloor"`；`bundle.towerFloors` 是 undefined；`config.towerFloors` 是 undefined

- [ ] **Step 3: 校准函数、类型、原始结构、数据源**

`packages/config/src/towerFloor.ts`：

```ts
import type { EquipAttrs } from './types';

/**
 * 守塔人属性（4C-2 设计文档裁定 1）：规格书 20.14 的比例
 * （厨艺 = 刀工 = 火候 = 等级×1.2 + 8×层，调味 = 创意 = 等级×0.6 + 5×层，幸运 = 等级），
 * 整体缩放到厨力 = power（原版数据的 attrSum）；返回取整后的属性和它们算出的厨力
 */
export function calibrateWatchman(
  floor: number,
  minLevel: number,
  power: number,
): { attrs: EquipAttrs; power: number } {
  const a = minLevel * 1.2 + 8 * floor;
  const b = minLevel * 0.6 + 5 * floor;
  const k = power / (3 * a + 2 * b + Math.floor(minLevel / 2));
  const x = Math.round(a * k);
  const y = Math.round(b * k);
  const luck = Math.round(minLevel * k);
  return {
    attrs: { cook: x, cutting: x, fire: x, season: y, creatives: y, luck },
    power: 3 * x + 2 * y + Math.floor(luck / 2),
  };
}
```

`packages/config/src/types.ts`：在 `ConfigBundle` 的 `slotAwards: SlotAward[];` 下面加：

```ts
  towerFloors: TowerFloor[];
  renownShop: RenownShopItem[];
```

在 `export interface SlotAward { ... }` 整个定义之后加：

```ts
/** 厨塔守塔人（dataset/tower_floors；子项目 4C-2）。attrs 由构建按设计文档裁定 1 校准 */
export interface TowerFloor {
  floor: number;
  name: string;
  title: string;
  minLevel: number;
  /** 每人每天能挑战他几次 */
  maxTimes: number;
  /** 是否比拼特色菜（每天 05:58 换菜） */
  mc: boolean;
  note: string;
  attrs: EquipAttrs;
  /** attrs 算出的厨力 */
  power: number;
}

/** 声望商店（designed/renown_shop；子项目 4C-2） */
export interface RenownShopItem {
  goodsId: number;
  renown: number;
  /** 稀有品：每人限拥有 1 个 */
  rare: boolean;
  weeklyLimit: number;
  /** 0 常驻；1~4 按 ISO 周数 % 4 + 1 轮换 */
  weekGroup: number;
  /** 前置玩法（xz 仙珍、tz 天馔）；有前置的暂不上架 */
  require: string | null;
}
```

`packages/config/src/raw.ts`：把

```ts
export const rawRenownShop = z.object({ goodsId: int }).passthrough();
```

换成：

```ts
export const rawRenownShop = z.object({
  goodsId: int,
  renown: int.min(1),
  rareflag: int,
  weeklyLimit: int.min(1),
  weekGroup: int.min(0).max(4),
  require: z.string().nullable(),
});
export const rawTowerFloor = z.object({
  floor: int.min(1),
  watchmanRestName: z.string(),
  watchman: z.string(),
  minlevel: int.min(1),
  challengemaxtimes: int,
  specialflag: int,
  attrSum: int,
  note: z.string().nullish(),
});
```

`packages/config/src/source.ts`：在 `'dataset/bar_slot_machine_award',` 下面加一行 `'dataset/tower_floors',`。

`packages/config/src/ids.ts`：在 `GOODS` 里 `borderCollie: 339, // 边牧（偷菜惩罚）` 下面加：

```ts
  towerTicket: 136, // 厨塔挑战券
```

- [ ] **Step 4: 数值段和活跃映射**

`packages/config/src/tuning.ts`：在 `bar: z.object({ ... }),` 整段之后、`});` 之前加：

```ts
  tower: z.object({
    dailyBase: int.min(0),
    nightFloor: int.min(0),
    openHour: int.min(0).max(23),
    testStrength: int.min(0),
    strengthPerFloor: int.min(0),
    strengthBase: int.min(0),
    winRenownBase: int,
    loseRenown: int,
    rankSize: int.min(1).max(15),
    rankTop: int.min(0),
    rankGap: int.min(1),
    rankDaily: int.min(1),
    rankWinRenown: int,
    rankLoseRenown: int,
    rankGifts: z.array(z.tuple([int, int])).min(1),
    duelStrength: int.min(0),
    duelPerFriend: int.min(1),
    duelWeakRate: num,
    duelStrongRate: num,
    duelRenown: z.object({
      weak: z.tuple([int, int]),
      strong: z.tuple([int, int]),
      normal: z.tuple([int, int]),
    }),
    sparFullAt: int.min(0),
    sparFullRenown: int,
    sparMaxAt: int.min(0),
    sparAwards: z.array(z.tuple([int, int.min(0), int.min(1)])).min(1),
    sparEquipFlag: int.min(0),
    watchmanCook: z.object({ hour: int.min(0).max(23), minute: int.min(0).max(59), priceSpread: num }),
  }),
```

`packages/config/data/game/tuning.json`：把文件末尾的

```
    "awardRates": { "foods": 0.25, "goods": 0.15, "coin": 0.3, "exp": 0.3 }
  }
}
```

改成

```
    "awardRates": { "foods": 0.25, "goods": 0.15, "coin": 0.3, "exp": 0.3 }
  },
  "tower": {
    "dailyBase": 5, "nightFloor": 3, "openHour": 6,
    "testStrength": 1, "strengthPerFloor": 1, "strengthBase": 4,
    "winRenownBase": 6, "loseRenown": 6,
    "rankSize": 15, "rankTop": 8, "rankGap": 3, "rankDaily": 10,
    "rankWinRenown": 2, "rankLoseRenown": 1,
    "rankGifts": [[1, 202], [2, 203], [3, 204], [8, 205], [15, 206]],
    "duelStrength": 5, "duelPerFriend": 10,
    "duelWeakRate": 0.7, "duelStrongRate": 1.15,
    "duelRenown": { "weak": [0, -3], "strong": [6, -2], "normal": [5, -2] },
    "sparFullAt": 20, "sparFullRenown": 2, "sparMaxAt": 50,
    "sparAwards": [[10, 2, 4], [20, 2, 2], [999999, 1, 2]], "sparEquipFlag": 3,
    "watchmanCook": { "hour": 5, "minute": 58, "priceSpread": 0.3 }
  }
}
```

`packages/config/data/game/action_map.json`：在 `"tower.friendDuel": "与好友赛厨",` 下面加一行：

```
    "tower.rank": "与好友赛厨",
```

- [ ] **Step 5: 构建和运行时**

`packages/config/src/build.ts`：

1. 在 `import { tuningSchema } from './tuning';` 下面加 `import { calibrateWatchman } from './towerFloor';`；`import type { ... } from './types';` 里加 `RenownShopItem`、`TowerFloor`。
2. 在 `const slotRaw = parse('dataset/bar_slot_machine_award', z.array(raw.rawSlotAward));` 下面加：

```ts
  const towerRaw = parse('dataset/tower_floors', z.array(raw.rawTowerFloor));
```

3. 在空值检查的 `!slotRaw ||` 下面加一行 `!towerRaw ||`。
4. 在 4C-1 加的 `for (const id of [1, 240, 389]) if (!goodsIds.has(id)) errors.push(\`bar references unknown goods ${id}\`);` 之后加：

```ts
  // ---------- 厨塔（子项目 4C-2） ----------
  const towerFloors: TowerFloor[] = [...towerRaw]
    .sort((a, b) => a.floor - b.floor)
    .map((f) => ({
      floor: f.floor,
      name: f.watchmanRestName,
      title: f.watchman,
      minLevel: f.minlevel,
      maxTimes: f.challengemaxtimes,
      mc: f.specialflag === 1,
      note: f.note ?? '',
      ...calibrateWatchman(f.floor, f.minlevel, f.attrSum),
    }));
  towerFloors.forEach((f, i) => {
    if (f.floor !== i + 1) errors.push(`tower_floors: floor ${f.floor} out of order`);
  });
  for (const f of towerRaw) {
    if (f.attrSum <= 0 || f.challengemaxtimes <= 0)
      errors.push(`tower_floors ${f.floor} needs positive attrSum and challengemaxtimes`);
  }
  const renownShop: RenownShopItem[] = renownRaw.map((r) => ({
    goodsId: r.goodsId,
    renown: r.renown,
    rare: r.rareflag === 1,
    weeklyLimit: r.weeklyLimit,
    weekGroup: r.weekGroup,
    require: r.require,
  }));
  for (const [, id] of tuning.tower.rankGifts)
    if (!goodsIds.has(id)) errors.push(`tuning.tower.rankGifts references unknown goods ${id}`);
  // 厨塔挑战券（GOODS.towerTicket）
  if (!goodsIds.has(136)) errors.push('tower references unknown goods 136');
```

5. `const body: Omit<ConfigBundle, 'version'> = {` 里 `slotAwards,` 下面加两行 `towerFloors,`、`renownShop,`；`extra: { ... }` 里删掉 `renownShop: renownRaw,` 这一行。

`packages/config/src/runtime.ts`：

1. `import type { ... } from './types';` 里加 `TowerFloor`。
2. `GameConfig` 里 `readonly slotAwards: ReadonlyMap<number, SlotAward>;` 下面加：

```ts
  /** 守塔人，键 = 层 */
  readonly towerFloors: ReadonlyMap<number, TowerFloor>;
```

3. `return { ... }` 里 `slotAwards: byId(bundle.slotAwards),` 下面加：

```ts
    towerFloors: new Map(bundle.towerFloors.map((f) => [f.floor, f])),
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/config exec vitest run src/towerFloor.test.ts src/build.test.ts src/runtime.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/config typecheck` 和 `pnpm --filter @dt/config build`
Expected: 都成功

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write packages/config/src/towerFloor.ts packages/config/src/towerFloor.test.ts packages/config/src/types.ts packages/config/src/raw.ts packages/config/src/source.ts packages/config/src/build.ts packages/config/src/runtime.ts packages/config/src/ids.ts packages/config/src/tuning.ts packages/config/src/build.test.ts packages/config/src/runtime.test.ts
git add packages/config
git commit -m "feat(config): tower watchmen, renown shop, tuning.tower, tower ticket id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0012、表类型

**Files:**
- Create: `apps/server/src/db/migrations/0012_tower.ts`、`apps/server/src/db/migrations/0012.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`

**Interfaces:**
- Produces: 表 `tower_state`、`tower_watchman_mc`、`tower_rank`；类型 `TowerStateTable`、`TowerWatchmanMcTable`、`TowerRankTable`、`TowerStateRow`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/db/migrations/0012.test.ts`：

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

describe('迁移 0012', () => {
  it('每店一行最高层，默认 0，只能 0~10', async () => {
    const a = await newRest();
    await db.insertInto('tower_state').values({ rest_id: a }).execute();
    expect(
      await db.selectFrom('tower_state').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({ rest_id: a, best_floor: 0 });
    await expect(db.insertInto('tower_state').values({ rest_id: a }).execute()).rejects.toThrow();
    const b = await newRest();
    await expect(db.insertInto('tower_state').values({ rest_id: b, best_floor: 11 }).execute()).rejects.toThrow();
  });

  it('守塔人的菜每区服每层一行；层 1~10；价值不能为负', async () => {
    const row = { shard_id: shard, floor: 4, mc_id: 2, price: 50, day: '2026-09-30' };
    await db.insertInto('tower_watchman_mc').values(row).execute();
    await expect(db.insertInto('tower_watchman_mc').values(row).execute()).rejects.toThrow();
    await expect(
      db
        .insertInto('tower_watchman_mc')
        .values({ ...row, floor: 11 })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('tower_watchman_mc')
        .values({ ...row, floor: 5, price: -1 })
        .execute(),
    ).rejects.toThrow();
  });

  it('赛厨榜：一格一人、同一周一家店只占一格、名次 1~15、删店级联', async () => {
    const a = await newRest();
    const b = await newRest();
    const week = '2026-09-28';
    await db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 1, rest_id: a }).execute();
    await expect(
      db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 1, rest_id: b }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 2, rest_id: a }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 16, rest_id: b }).execute(),
    ).rejects.toThrow();
    await db.insertInto('tower_rank').values({ shard_id: shard, week: '2026-10-05', rank: 1, rest_id: a }).execute();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    expect(await db.selectFrom('tower_rank').select('rank').where('rest_id', '=', a).execute()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0012.test.ts`
Expected: FAIL——`relation "tower_state" does not exist`

- [ ] **Step 3: 迁移和表类型**

`apps/server/src/db/migrations/0012_tower.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table tower_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      best_floor smallint not null default 0 check (best_floor between 0 and 10)
    )`,
    sql`create table tower_watchman_mc (
      shard_id integer not null references shard(id) on delete cascade,
      floor smallint not null check (floor between 1 and 10),
      mc_id integer not null,
      price integer not null check (price >= 0),
      day date not null,
      primary key (shard_id, floor)
    )`,
    sql`create table tower_rank (
      shard_id integer not null references shard(id) on delete cascade,
      week date not null,
      rank smallint not null check (rank between 1 and 15),
      rest_id integer not null references restaurant(id) on delete cascade,
      primary key (shard_id, week, rank),
      unique (shard_id, week, rest_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['tower_rank', 'tower_watchman_mc', 'tower_state']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts`：在 `import * as m0011 from './0011_bar';` 下面加 `import * as m0012 from './0012_tower';`，在 `'0011_bar': m0011,` 下面加 `'0012_tower': m0012,`。

`apps/server/src/db/schema.ts`：在 `BarSlotStatTable` 接口定义之后加：

```ts
/** 厨塔（子项目 4C-2）：每店打赢过的最高层 */
export interface TowerStateTable {
  rest_id: number;
  best_floor: Default<number>;
}

/** 守塔人当天抽到的特色菜：每区服每层一行，每天覆盖 */
export interface TowerWatchmanMcTable {
  shard_id: number;
  floor: number;
  mc_id: number;
  /** 每份价值 */
  price: number;
  /** YYYY-MM-DD（抽菜的游戏日） */
  day: string;
}

/** 赛厨榜：只存有人的格子；week 是本周一 */
export interface TowerRankTable {
  shard_id: number;
  week: string;
  rank: number;
  rest_id: number;
}
```

`DB` 接口里 `bar_slot_stat: BarSlotStatTable;` 下面加：

```ts
  tower_state: TowerStateTable;
  tower_watchman_mc: TowerWatchmanMcTable;
  tower_rank: TowerRankTable;
```

在 `export type BarStateRow = Selectable<BarStateTable>;` 下面加：

```ts
export type TowerStateRow = Selectable<TowerStateTable>;
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0012.test.ts`
Expected: PASS（3 个测试）

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/db/migrations/0012_tower.ts apps/server/src/db/migrations/0012.test.ts apps/server/src/db/migrations/index.ts apps/server/src/db/schema.ts
git add apps/server/src/db
git commit -m "feat(server): migration 0012 tower state, watchman dishes, weekly rank

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 对决和规则（纯函数）

**Files:**
- Create: `apps/server/src/modules/tower/duel.ts`、`apps/server/src/modules/tower/rules.ts`
- Test: `apps/server/src/modules/tower/rules.test.ts`

**Interfaces:**
- Consumes: `Tuning['tower']`、`TowerFloor`、`RenownShopItem`（Task 1）；`luckRate`、`Rng`（`@dt/shared`）
- Produces:
  - `duel.ts`：`interface DuelAttrs { cook; cutting; fire; season; creatives; luck }`、`interface DuelSide { name: string; attrs: DuelAttrs; mcPrice: number }`、`type Scores = number[]`（5 项）、`duelPower(a: DuelAttrs): number`、`duelScores(s: DuelSide, rng: Rng): Scores`、`sumScores(s: Scores): number`、`duelWin(me: Scores, them: Scores): boolean`、`duel(me: DuelSide, them: DuelSide, rng: Rng): { win: boolean; me: { scores: Scores; sum: number }; them: { scores: Scores; sum: number } }`
  - `rules.ts`（`TowerTuning = Tuning['tower']`）：`towerStrength(floor, test, t)`、`floorUnlocked(f: TowerFloor, level, bestFloor)`、`towerNight(floor, hour, t)`、`towerDailyTotal(tickets, t)`、`towerRenown(floor, win, t)`、`sparAward(before, t): { times; level }`、`type DuelTier = 'weak' | 'strong' | 'normal'`、`duelTier(mine, theirs, t)`、`duelRenown(tier, win, before, t)`、`rankChallengeError(myRank: number | null, target, t): { reason: string; need?: number } | null`、`rankOccupyError(myRank: number | null, target): string | null`、`rankGift(rank, t): number | null`、`isoWeek(day: string): number`、`shopOnSale(items: readonly RenownShopItem[], day: string): RenownShopItem[]`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/tower/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { duel, duelPower, duelScores, duelWin, sumScores, type DuelAttrs } from './duel';
import {
  duelRenown,
  duelTier,
  floorUnlocked,
  isoWeek,
  rankChallengeError,
  rankGift,
  rankOccupyError,
  shopOnSale,
  sparAward,
  towerDailyTotal,
  towerNight,
  towerRenown,
  towerStrength,
} from './rules';

const config = testConfig();
const t = config.tuning.tower;
const zero: DuelAttrs = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const floor1 = config.towerFloors.get(1)!;

describe('五项评分（规格书 11.1）', () => {
  it('1 层守塔人，随机数 0.4：每项先判正（0.4 < 0.5），波动 = (创意×0.4+1)×1.1×0.4', () => {
    const s = duelScores({ name: '守', attrs: floor1.attrs, mcPrice: 0 }, sequenceRng([0.4]));
    expect(s).toEqual([8.1, 8, 6.6, 8.8, 3.6]);
    expect(sumScores(s)).toBe(35.1);
  });

  it('第一个随机数 ≥ 0.5 时再抽一个比幸运率：没中为负，负数记 0', () => {
    expect(duelScores({ name: 'a', attrs: zero, mcPrice: 0 }, sequenceRng([0.6]))).toEqual([0, 0, 0, 0, 0]);
  });

  it('幸运 700（幸运率 0.4）时第二个随机数 0.3 为正', () => {
    const s = duelScores({ name: 'a', attrs: { ...zero, luck: 700 }, mcPrice: 0 }, sequenceRng([0.6, 0.3, 0.4]));
    expect(s).toEqual([0.4, 0.4, 0.4, 0.4, 0.4]);
  });

  it('"养"加上特色菜每份价值 × 0.6', () => {
    const s = duelScores({ name: 'a', attrs: zero, mcPrice: 50 }, sequenceRng([0.4]));
    expect(s[4]).toBe(30.4);
  });

  it('胜负：赢 ≥ 4 项；赢 3 项时五项总和 ≥ 对方；平项不算赢', () => {
    expect(duelWin([5, 5, 5, 5, 1], [4, 4, 4, 4, 9])).toBe(true);
    expect(duelWin([5, 5, 5, 1, 1], [4, 4, 4, 9, 9])).toBe(false);
    expect(duelWin([5, 5, 5, 1, 1], [4, 4, 4, 2, 2])).toBe(true);
    expect(duelWin([5, 5, 5, 0, 0], [4, 4, 4, 1.5, 1.5])).toBe(true);
    expect(duelWin([5, 5, 5, 5, 5], [5, 5, 5, 5, 5])).toBe(false);
  });

  it('厨力 = 五项属性 + ⌊幸运/2⌋；duel 按顺序先算挑战方', () => {
    expect(duelPower(floor1.attrs)).toBe(29);
    const r = duel(
      { name: '我', attrs: { ...zero, cook: 20, cutting: 20, fire: 20, season: 10 }, mcPrice: 0 },
      { name: '守', attrs: floor1.attrs, mcPrice: 0 },
      sequenceRng([0.4]),
    );
    expect(r.win).toBe(true);
    expect(r.me.scores).toEqual([20.4, 19.4, 15.4, 22.4, 7.4]);
    expect(r.them).toEqual({ scores: [8.1, 8, 6.6, 8.8, 3.6], sum: 35.1 });
  });
});

describe('厨塔（设计文档 §3.2）', () => {
  it('体力 = 层 + 4，试打 1；每日总次数 = 5 + 挑战券；声望 胜 层+6 / 负 6', () => {
    expect(towerStrength(1, false, t)).toBe(5);
    expect(towerStrength(10, false, t)).toBe(14);
    expect(towerStrength(10, true, t)).toBe(1);
    expect(towerDailyTotal(0, t)).toBe(5);
    expect(towerDailyTotal(2, t)).toBe(7);
    expect(towerRenown(3, true, t)).toBe(9);
    expect(towerRenown(3, false, t)).toBe(6);
  });

  it('解锁：等级 ≥ 最低等级，且打赢过下一层（1 层不要求）', () => {
    const f2 = config.towerFloors.get(2)!;
    expect(floorUnlocked(floor1, 1, 0)).toBe(true);
    expect(floorUnlocked(f2, 10, 1)).toBe(false);
    expect(floorUnlocked(f2, 11, 0)).toBe(false);
    expect(floorUnlocked(f2, 11, 1)).toBe(true);
    expect(floorUnlocked(f2, 50, 9)).toBe(true);
  });

  it('夜间：4 层以上 0~5 点不能挑战', () => {
    expect(towerNight(4, 5, t)).toBe(true);
    expect(towerNight(4, 6, t)).toBe(false);
    expect(towerNight(3, 0, t)).toBe(false);
  });
});

describe('切磋（设计文档裁定 7、8）', () => {
  it('奖励：本次之前 < 10 次 2 次等级 4；< 20 次 2 次等级 2；之后 1 次等级 2', () => {
    expect(sparAward(0, t)).toEqual({ times: 2, level: 4 });
    expect(sparAward(9, t)).toEqual({ times: 2, level: 4 });
    expect(sparAward(10, t)).toEqual({ times: 2, level: 2 });
    expect(sparAward(19, t)).toEqual({ times: 2, level: 2 });
    expect(sparAward(20, t)).toEqual({ times: 1, level: 2 });
    expect(sparAward(100, t)).toEqual({ times: 1, level: 2 });
  });

  it('三档：对方 > 我×1.15 以弱胜强，< 我×0.7 以强凌弱', () => {
    expect(duelTier(70, 81, t)).toBe('strong');
    expect(duelTier(70, 80, t)).toBe('normal');
    expect(duelTier(70, 49, t)).toBe('normal');
    expect(duelTier(70, 48, t)).toBe('weak');
  });

  it('声望：普通胜 +5，满 20 次 +2，满 50 次 0；负声望照扣；以弱胜强不受上限', () => {
    expect(duelRenown('normal', true, 0, t)).toBe(5);
    expect(duelRenown('normal', true, 20, t)).toBe(2);
    expect(duelRenown('normal', true, 50, t)).toBe(0);
    expect(duelRenown('normal', false, 50, t)).toBe(-2);
    expect(duelRenown('strong', true, 60, t)).toBe(6);
    expect(duelRenown('strong', false, 0, t)).toBe(-2);
    expect(duelRenown('weak', true, 0, t)).toBe(0);
    expect(duelRenown('weak', false, 0, t)).toBe(-3);
  });
});

describe('赛厨榜（设计文档 §3.3）', () => {
  it('挑战：只能往前；前 8 名要在榜上且名次差 ≤ 3', () => {
    expect(rankChallengeError(null, 10, t)).toBeNull();
    expect(rankChallengeError(null, 8, t)).toEqual({ reason: 'rank_gap', need: 11 });
    expect(rankChallengeError(5, 1, t)).toEqual({ reason: 'rank_gap', need: 4 });
    expect(rankChallengeError(4, 1, t)).toBeNull();
    expect(rankChallengeError(3, 5, t)).toEqual({ reason: 'rank_not_better' });
    expect(rankChallengeError(5, 5, t)).toEqual({ reason: 'rank_not_better' });
  });

  it('占位：没上榜随便占；在榜上只能往前', () => {
    expect(rankOccupyError(null, 1)).toBeNull();
    expect(rankOccupyError(4, 2)).toBeNull();
    expect(rankOccupyError(4, 6)).toBe('rank_not_better');
    expect(rankOccupyError(4, 4)).toBe('rank_not_better');
  });

  it('名次礼包：1、2、3 名 202~204，4~8 名 205，9~15 名 206', () => {
    expect([1, 2, 3, 4, 8, 9, 15, 16].map((r) => rankGift(r, t))).toEqual([202, 203, 204, 205, 205, 206, 206, null]);
  });
});

describe('声望商店（设计文档 §3.5）', () => {
  it('ISO 周数', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-09-28')).toBe(40);
    expect(isoWeek('2026-10-04')).toBe(40);
    expect(isoWeek('2026-10-05')).toBe(41);
    expect(isoWeek('2021-01-03')).toBe(53);
  });

  it('本周在售：常驻且没有前置条件的，加上 ISO 周数 % 4 + 1 组的雕像', () => {
    const ids = (day: string) => shopOnSale(config.bundle.renownShop, day).map((x) => x.goodsId);
    expect(ids('2026-09-30')).toEqual([310, 397, 460]);
    expect(ids('2026-10-05')).toEqual([310, 402, 476]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/rules.test.ts`
Expected: FAIL——`Failed to resolve import "./duel"`

- [ ] **Step 3: 对决**

`apps/server/src/modules/tower/duel.ts`：

```ts
import { luckRate, type Rng } from '@dt/shared';

export interface DuelAttrs {
  cook: number;
  cutting: number;
  fire: number;
  season: number;
  creatives: number;
  luck: number;
}

export interface DuelSide {
  name: string;
  /** 刀工、火候已按进攻 / 防守算好 */
  attrs: DuelAttrs;
  /** 在售特色菜每份价值；没有为 0 */
  mcPrice: number;
}

/** 色、香、味、形、养 */
export type Scores = number[];

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** 厨力 = 五项属性 + ⌊幸运/2⌋（规格书 20.18） */
export function duelPower(a: DuelAttrs): number {
  return a.cook + a.cutting + a.fire + a.season + a.creatives + Math.floor(a.luck / 2);
}

/**
 * 五项评分（规格书 11.1，原版 getCookAttr）。每项：基础 + 波动，波动 = (创意×0.4 + 1) × (正 ? 1.1 : −0.9) × rand；
 * 正 = rand < 0.5，否则再抽一个 rand < 幸运率（短路）。每项 < 0 记 0，保留 1 位小数
 */
export function duelScores(s: DuelSide, rng: Rng): Scores {
  const a = s.attrs;
  const rate = luckRate(a.luck);
  const amp = a.creatives * 0.4 + 1;
  const wave = () => {
    const up = rng.next() < 0.5 || rng.next() < rate;
    return amp * (up ? 1.1 : -0.9) * rng.next();
  };
  const bases = [
    a.cook * 0.7 + a.cutting * 0.3,
    a.cook * 0.7 + a.season * 0.5,
    a.fire * 0.5 + a.season * 0.5,
    a.fire * 0.4 + a.cutting * 0.7,
    a.fire * 0.2 + a.season * 0.1 + a.cutting * 0.1 + s.mcPrice * 0.6,
  ];
  return bases.map((b) => Math.max(0, round1(b + wave())));
}

export function sumScores(s: Scores): number {
  return round1(s.reduce((x, y) => x + y, 0));
}

/** 赢 ≥ 4 项，或赢 3 项且五项总和 ≥ 对方（平项不算赢） */
export function duelWin(me: Scores, them: Scores): boolean {
  const wins = me.filter((v, i) => v > (them[i] ?? 0)).length;
  return wins >= 4 || (wins === 3 && sumScores(me) >= sumScores(them));
}

/** 一局对决：随机数顺序是挑战方五项、再被挑战方五项 */
export function duel(
  me: DuelSide,
  them: DuelSide,
  rng: Rng,
): { win: boolean; me: { scores: Scores; sum: number }; them: { scores: Scores; sum: number } } {
  const a = duelScores(me, rng);
  const b = duelScores(them, rng);
  return { win: duelWin(a, b), me: { scores: a, sum: sumScores(a) }, them: { scores: b, sum: sumScores(b) } };
}
```

- [ ] **Step 4: 规则**

`apps/server/src/modules/tower/rules.ts`：

```ts
import type { RenownShopItem, TowerFloor, Tuning } from '@dt/config';

export type TowerTuning = Tuning['tower'];

/** 体力：试打 testStrength，否则 层 × strengthPerFloor + strengthBase */
export function towerStrength(floor: number, test: boolean, t: TowerTuning): number {
  return test ? t.testStrength : floor * t.strengthPerFloor + t.strengthBase;
}

/** 解锁：等级 ≥ 最低等级，且打赢过下一层（设计文档裁定 4） */
export function floorUnlocked(f: TowerFloor, level: number, bestFloor: number): boolean {
  return level >= f.minLevel && bestFloor >= f.floor - 1;
}

/** nightFloor 层以上、游戏时间 openHour 点以前不能挑战 */
export function towerNight(floor: number, hour: number, t: TowerTuning): boolean {
  return floor > t.nightFloor && hour < t.openHour;
}

export function towerDailyTotal(tickets: number, t: TowerTuning): number {
  return t.dailyBase + tickets;
}

/** 胜 = 层 + winRenownBase，负 = loseRenown（设计文档裁定 13） */
export function towerRenown(floor: number, win: boolean, t: TowerTuning): number {
  return win ? floor + t.winRenownBase : t.loseRenown;
}

/** 切磋奖励（裁定 7）：before = 本次之前的今日切磋总次数 */
export function sparAward(before: number, t: TowerTuning): { times: number; level: number } {
  for (const [lt, times, level] of t.sparAwards) if (before < lt) return { times, level };
  const last = t.sparAwards[t.sparAwards.length - 1]!;
  return { times: last[1], level: last[2] };
}

export type DuelTier = 'weak' | 'strong' | 'normal';

/** 按厨力分档（裁定 8）：对方 > 我 × strongRate 以弱胜强，< 我 × weakRate 以强凌弱 */
export function duelTier(mine: number, theirs: number, t: TowerTuning): DuelTier {
  if (theirs > mine * t.duelStrongRate) return 'strong';
  if (theirs < mine * t.duelWeakRate) return 'weak';
  return 'normal';
}

/** 好友切磋声望（裁定 7、8）：正声望按今日切磋总次数封顶，以弱胜强不受影响；负声望照扣 */
export function duelRenown(tier: DuelTier, win: boolean, before: number, t: TowerTuning): number {
  const [w, l] = t.duelRenown[tier];
  const r = win ? w : l;
  if (r <= 0 || tier === 'strong') return r;
  if (before >= t.sparMaxAt) return 0;
  if (before >= t.sparFullAt) return t.sparFullRenown;
  return r;
}

/** 挑战名次 target 的问题（设计文档 §3.3）；null = 可以。格子有没有人、是不是自己由调用方先判断 */
export function rankChallengeError(
  myRank: number | null,
  target: number,
  t: TowerTuning,
): { reason: string; need?: number } | null {
  if (myRank !== null && myRank <= target) return { reason: 'rank_not_better' };
  if (target <= t.rankTop && (myRank === null || myRank - target > t.rankGap))
    return { reason: 'rank_gap', need: target + t.rankGap };
  return null;
}

/** 占位（裁定 14）：没上榜随便占；在榜上只能往前 */
export function rankOccupyError(myRank: number | null, target: number): string | null {
  return myRank !== null && myRank <= target ? 'rank_not_better' : null;
}

/** 名次礼包：rankGifts 里第一个"名次 ≤ 上限"的礼包 */
export function rankGift(rank: number, t: TowerTuning): number | null {
  for (const [max, id] of t.rankGifts) if (rank <= max) return id;
  return null;
}

/** ISO 8601 周数（周一开始；每年第一个周四所在的周是第 1 周） */
export function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((d.getTime() - first.getTime()) / (7 * 86_400_000));
}

/** 本周在售（裁定 12）：没有前置条件，且常驻或轮到本周 */
export function shopOnSale(items: readonly RenownShopItem[], day: string): RenownShopItem[] {
  const group = (isoWeek(day) % 4) + 1;
  return items.filter((x) => x.require === null && (x.weekGroup === 0 || x.weekGroup === group));
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/rules.test.ts`
Expected: PASS（17 个测试）

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/tower
git add apps/server/src/modules/tower
git commit -m "feat(server): tower duel scoring and rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 厨塔挑战——接口 DTO、双方属性、概览、挑战、挑战券、服务装配、主线第 27 步

**Files:**
- Create: `packages/shared/src/schemas/tower.ts`；Modify: `packages/shared/src/index.ts`
- Create: `apps/server/src/modules/tower/sides.ts`、`common.ts`、`tower.ts`、`service.ts`、`routes.ts`
- Create: `apps/server/src/modules/tower/tower.test.ts`
- Modify: `apps/server/src/modules/store/use.ts`（`towerTicket`）、`apps/server/src/modules/store/store.test.ts:109-113`
- Modify: `apps/server/src/core/features.ts`、`apps/server/src/game.ts`、`apps/server/src/modules/index.ts`
- Modify: `apps/server/src/modules/task/task.test.ts`（"跳过未开放功能"的例子）、`apps/server/src/worker/periodic.test.ts`（"未实现功能"的例子）

**Interfaces:**
- Consumes: Task 1 `GameConfig.towerFloors`、`Tuning['tower']`、`GOODS.towerTicket`；Task 2 表；Task 3 `duel`、`duelPower`、`DuelSide`、`Scores`、规则函数；4C-1 `randomAward`、`RandomAward`、`BarAwardDto`
- Produces:
  - `@dt/shared`：`towerChallengeBody`、`rankBody`、`duelBody`、`renownBuyBody`；`DuelSideDto`、`DuelResultDto`、`TowerFloorDto`、`TowerDto`、`RankSlotDto`、`RankDto`、`DuelInfoDto`、`RenownShopItemDto`、`RenownShopDto`
  - `sides.ts`：`type DuelMode = 'attack' | 'defend'`、`mcPriceOf(db, rest): Promise<number>`、`sideOf(db, config, rest, luckValue, mode): Promise<DuelSide>`、`playerSide(o: Op, mode): Promise<DuelSide>`、`cachedSide(db, config, rest, mode): Promise<DuelSide>`、`watchmanSide(f: TowerFloor, price: number): DuelSide`、`sideDto(s: DuelSide, r: { scores: Scores; sum: number }): DuelSideDto`
  - `common.ts`：`KEY`（`done`、`ticket`、`rankDone`、`spar`、`floor(n)`、`duel(restId)`、`shop(goodsId)`）、`badInput(reason)`、`lockTowerState(o): Promise<TowerStateRow>`、`sparAwards(o, before): Promise<RandomAward[]>`
  - `tower.ts`：`towerView(db, config, rest, t, now): Promise<TowerDto>`、`challengeTower(o, floor, test): Promise<DuelResultDto>`
  - `createTowerService(d)`：`overview(ctx)`、`challenge(ctx, {floor, test})`；`TowerService`；`towerRoutes(svc)`：`GET /tower`、`POST /tower/challenge`；`game.tower`

- [ ] **Step 1: 写接口 DTO**

`packages/shared/src/schemas/tower.ts`：

```ts
import { z } from 'zod';
import type { BarAwardDto } from './bar';

export const towerChallengeBody = z.object({
  floor: z.number().int().min(1).max(10),
  test: z.boolean().default(false),
});
export const rankBody = z.object({ rank: z.number().int().min(1).max(15) });
export const duelBody = z.object({ restId: z.number().int().positive() });
export const renownBuyBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(99),
});

export interface DuelSideDto {
  name: string;
  power: number;
  /** 色、香、味、形、养 */
  scores: number[];
  sum: number;
}

export interface DuelResultDto {
  win: boolean;
  me: DuelSideDto;
  them: DuelSideDto;
  /** 我的声望变化 */
  renown: number;
  awards: BarAwardDto[];
  /** 试打 */
  test: boolean;
  /** 赛厨榜：挑战后我的名次（没上榜为 null）；其他挑战为 null */
  rank: number | null;
}

export interface TowerFloorDto {
  floor: number;
  name: string;
  title: string;
  note: string;
  minLevel: number;
  power: number;
  maxTimes: number;
  /** 我今天还能挑战他几次 */
  left: number;
  unlocked: boolean;
  /** 正式挑战要的体力 */
  cost: number;
  /** 当天的特色菜；1~3 层和还没换菜时为 null */
  mc: { mcId: number; price: number } | null;
}

export interface TowerDto {
  floors: TowerFloorDto[];
  /** 我的进攻厨力 */
  power: number;
  /** 今日厨塔剩余次数、总次数（5 + 用掉的挑战券） */
  left: number;
  dailyTotal: number;
  /** 持有的挑战券 */
  tickets: number;
  bestFloor: number;
  strength: number;
  level: number;
  /** 当前游戏时间的小时；nightFloor 层以上 openHour 点前不能挑战 */
  hour: number;
  nightFloor: number;
  openHour: number;
  /** 试打要的体力 */
  testCost: number;
}

export interface RankSlotDto {
  rank: number;
  restId: number | null;
  name: string | null;
  level: number | null;
}

export interface RankDto {
  /** 本周一 */
  week: string;
  /** 本周结束（下周一 0 点）的 ISO 时间 */
  weekEnd: string;
  slots: RankSlotDto[];
  myRank: number | null;
  /** 今日赛厨榜剩余次数 */
  left: number;
  /** 今日切磋总次数（好友切磋 + 赛厨榜） */
  spar: number;
  strength: number;
  rankTop: number;
  rankGap: number;
  duelStrength: number;
}

export interface DuelInfoDto {
  /** 今天还能和他切磋几次 */
  left: number;
  spar: number;
  strength: number;
  duelStrength: number;
}

export interface RenownShopItemDto {
  goodsId: number;
  renown: number;
  weeklyLimit: number;
  /** 本周已兑 */
  bought: number;
  rare: boolean;
  /** 稀有品是否已拥有 */
  owned: boolean;
}

export interface RenownShopDto {
  renown: number;
  items: RenownShopItemDto[];
}
```

`packages/shared/src/index.ts` 末尾加 `export * from './schemas/tower';`。

- [ ] **Step 2: 写失败的服务测试**

`apps/server/src/modules/tower/tower.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const DAY = '2026-09-30';
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
let t: TestGame;
let rngValues: number[] = [0.4];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());
beforeEach(() => {
  rngValues = [0.4];
  t.clock.set(gameTime(DAY, 12));
});

const setDaily = (restId: number, key: string, count: number) =>
  t.db.insertInto('daily_counter').values({ rest_id: restId, day: DAY, key, count }).execute();
const setBest = (restId: number, best: number) =>
  t.db.insertInto('tower_state').values({ rest_id: restId, best_floor: best }).execute();

describe('厨塔概览', () => {
  it('新店：1 层解锁、2 层没有；今日 5 次；守塔人厨力；还没换菜', async () => {
    const ctx = await newRestaurant(t, { patch: STRONG });
    const v = await t.game.tower.overview(ctx);
    expect(v).toMatchObject({
      left: 5,
      dailyTotal: 5,
      tickets: 0,
      bestFloor: 0,
      level: 1,
      hour: 12,
      nightFloor: 3,
      openHour: 6,
      testCost: 1,
      power: 70,
    });
    expect(v.floors).toHaveLength(10);
    expect(v.floors[0]).toMatchObject({
      floor: 1,
      name: '见习模范餐厅',
      title: '见习守护者',
      power: 29,
      left: 10,
      maxTimes: 10,
      unlocked: true,
      cost: 5,
      mc: null,
    });
    expect(v.floors[1]).toMatchObject({ floor: 2, unlocked: false, cost: 6 });
  });
});

describe('挑战（设计文档 §3.2）', () => {
  it('胜：扣 层+4 体力；声望 +(层+6)；随机奖励"层"次；最高层更新；主线第 27 步、活跃"厨塔挑战"', async () => {
    const ctx = await newRestaurant(t, { patch: { ...STRONG, level: 5, main_task_step: 27 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 27, key: 'tower.challenge', done: false });
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data).toMatchObject({
      win: true,
      renown: 7,
      test: false,
      rank: null,
      awards: [{ kind: 'coin', id: null, num: 600, lucky: false }],
    });
    expect(r.data.me).toMatchObject({ power: 70, scores: [20.4, 19.4, 15.4, 22.4, 7.4], sum: 85 });
    expect(r.data.them).toEqual({ name: '见习模范餐厅', power: 29, scores: [8.1, 8, 6.6, 8.8, 3.6], sum: 35.1 });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 95, renown: 7, coin: 600 });
    const v = await t.game.tower.overview(ctx);
    expect(v).toMatchObject({ bestFloor: 1, left: 4 });
    expect(v.floors[0]!.left).toBe(9);
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 27, progress: 1, done: true });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '厨塔挑战')!.count).toBe(1);
  });

  it('负：声望 +6，没有奖励，最高层不变', async () => {
    const ctx = await newRestaurant(t);
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data).toMatchObject({ win: false, renown: 6, awards: [] });
    expect((await t.game.tower.overview(ctx)).bestFloor).toBe(0);
  });

  it('试打只扣 1 体力，没有奖励声望、不计次数、不算打赢；今日次数用完后仍能试打（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: STRONG });
    await setDaily(ctx.restaurantId, 'tower.done', 5);
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: true });
    expect(r.data).toMatchObject({ win: true, renown: 0, awards: [], test: true });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 99, renown: 0, coin: 0 });
    expect(await t.game.tower.overview(ctx)).toMatchObject({ bestFloor: 0, left: 0 });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: false })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'tower', max: 5 },
    });
  });

  it('挑战券：一次只能用 1 张，用了当天多一次', async () => {
    const ctx = await newRestaurant(t, { goods: { 136: 2 } });
    await setDaily(ctx.restaurantId, 'tower.done', 5);
    await expect(t.game.store.use(ctx, { goodsId: 136, num: 2 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_batch' },
    });
    await t.game.store.use(ctx, { goodsId: 136, num: 1 });
    expect(await t.game.tower.overview(ctx)).toMatchObject({ left: 1, dailyTotal: 6, tickets: 1 });
    await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect((await t.game.tower.overview(ctx)).left).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 136)).toBe(1);
  });

  it('解锁：2 层要 11 级且打赢过 1 层', async () => {
    const low = await newRestaurant(t, { patch: { level: 10 } });
    await setBest(low.restaurantId, 1);
    await expect(t.game.tower.challenge(low, { floor: 2, test: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'floor_locked', minLevel: 11, needFloor: 1 },
    });
    const fresh = await newRestaurant(t, { patch: { level: 11 } });
    await expect(t.game.tower.challenge(fresh, { floor: 2, test: true })).rejects.toMatchObject({
      params: { reason: 'floor_locked' },
    });
    await setBest(fresh.restaurantId, 1);
    expect((await t.game.tower.challenge(fresh, { floor: 2, test: true })).data.test).toBe(true);
  });

  it('夜间：4 层以上 6 点前不能挑战，3 层可以', async () => {
    t.clock.set(gameTime(DAY, 3));
    const ctx = await newRestaurant(t, { patch: { level: 31 } });
    await setBest(ctx.restaurantId, 3);
    await expect(t.game.tower.challenge(ctx, { floor: 4, test: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'tower_night', openHour: 6 },
    });
    expect((await t.game.tower.challenge(ctx, { floor: 3, test: true })).data.test).toBe(true);
    t.clock.set(gameTime(DAY, 6));
    expect((await t.game.tower.challenge(ctx, { floor: 4, test: true })).data.test).toBe(true);
  });

  it('守塔人每日次数：8 层每人每天 1 次', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 71 } });
    await setBest(ctx.restaurantId, 7);
    await t.game.tower.challenge(ctx, { floor: 8, test: false });
    await expect(t.game.tower.challenge(ctx, { floor: 8, test: false })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'watchman', max: 1 },
    });
    expect((await t.game.tower.overview(ctx)).floors[7]!.left).toBe(0);
  });

  it('层号越界报 VALIDATION_FAILED；体力不够报 NOT_ENOUGH，什么都不变', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 3 } });
    await expect(t.game.tower.challenge(ctx, { floor: 11, test: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'floor' },
    });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength', need: 5 },
    });
    expect((await t.game.tower.overview(ctx)).left).toBe(5);
  });

  it('区服关闭 tower：接口报 FEATURE_DISABLED，挑战券不能用', async () => {
    const ctx = await newRestaurant(t, { goods: { 136: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { tower: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.tower.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: true })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await expect(t.game.store.use(ctx, { goodsId: 136, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/tower.test.ts`
Expected: FAIL——`Cannot read properties of undefined (reading 'overview')`（`t.game.tower` 不存在）

- [ ] **Step 4: 双方属性和公用小件**

`apps/server/src/modules/tower/sides.ts`：

```ts
import type { Kysely } from 'kysely';
import type { GameConfig, TowerFloor } from '@dt/config';
import type { DuelSideDto } from '@dt/shared';
import { opAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import type { DB, RestaurantRow } from '../../db/schema';
import { restGear, suitEffect } from '../equip/power';
import { duelPower, type DuelSide, type Scores } from './duel';

export type DuelMode = 'attack' | 'defend';

/** 在售特色菜每份价值：mc_cook_id 指向、没结束、还有剩；没有为 0 */
export async function mcPriceOf(db: Kysely<DB>, rest: RestaurantRow): Promise<number> {
  if (rest.mc_cook_id === null) return 0;
  const r = await db
    .selectFrom('mc_cook')
    .select(['price', 'left_num', 'ended_at'])
    .where('id', '=', rest.mc_cook_id)
    .executeTakeFirst();
  return r && r.left_num > 0 && r.ended_at === null ? r.price : 0;
}

/**
 * 一方的对决属性（设计文档 §3.1）：加点 + 厨具 + 宝石，四项乘套装百分比；
 * 刀工、火候再乘套装的进攻或防守加成；幸运 = 基础幸运 + 加成的 luckValue
 */
export async function sideOf(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  luckValue: number,
  mode: DuelMode,
): Promise<DuelSide> {
  const gear = await restGear(db, rest, config.suits);
  const cut = suitEffect(gear.suits, mode === 'attack' ? 'attackCutting' : 'defendCutting');
  const fire = suitEffect(gear.suits, mode === 'attack' ? 'attackFire' : 'defendFire');
  return {
    name: rest.name,
    attrs: {
      ...gear.total,
      cutting: Math.round(gear.total.cutting * (1 + cut)),
      fire: Math.round(gear.total.fire * (1 + fire)),
      luck: rest.luck + luckValue,
    },
    mcPrice: await mcPriceOf(db, rest),
  };
}

/** 操作里的一方（已锁店）：加成汇总按需重算 */
export async function playerSide(o: Op, mode: DuelMode): Promise<DuelSide> {
  return sideOf(o.tx, o.config, o.rest, (await opAgg(o)).luckValue ?? 0, mode);
}

/** 不锁对方的店：幸运用它缓存的加成汇总（计划裁定 1） */
export function cachedSide(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  mode: DuelMode,
): Promise<DuelSide> {
  return sideOf(db, config, rest, rest.effect_agg.luckValue ?? 0, mode);
}

/** 守塔人：属性来自配置；只有比拼特色菜的层才算当天的菜 */
export function watchmanSide(f: TowerFloor, price: number): DuelSide {
  return { name: f.name, attrs: f.attrs, mcPrice: f.mc ? price : 0 };
}

export function sideDto(s: DuelSide, r: { scores: Scores; sum: number }): DuelSideDto {
  return { name: s.name, power: duelPower(s.attrs), scores: r.scores, sum: r.sum };
}
```

`apps/server/src/modules/tower/common.ts`：

```ts
import { ErrorCode } from '@dt/shared';
import type { Op } from '../../core/op';
import type { TowerStateRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { randomAward, type RandomAward } from '../award/random';
import { sparAward } from './rules';

/** 每日计数键（日期一律传游戏日；shop 的日期是本周一） */
export const KEY = {
  done: 'tower.done',
  ticket: 'tower.ticket',
  rankDone: 'tower.rankDone',
  spar: 'tower.spar',
  floor: (n: number) => `tower.floor:${n}`,
  duel: (restId: number) => `tower.duel:${restId}`,
  shop: (goodsId: number) => `renownShop:${goodsId}`,
} as const;

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** 取本店的厨塔状态行并锁住；第一次时先插入（整个操作已经锁了店） */
export async function lockTowerState(o: Op): Promise<TowerStateRow> {
  await o.tx
    .insertInto('tower_state')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('tower_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/** 切磋奖励（设计文档裁定 7）：before = 本次之前的今日切磋总次数 */
export async function sparAwards(o: Op, before: number): Promise<RandomAward[]> {
  const t = o.tuning.tower;
  const { times, level } = sparAward(before, t);
  const out: RandomAward[] = [];
  for (let i = 0; i < times; i++) out.push(await randomAward(o, { level, equipFlag: t.sparEquipFlag }));
  return out;
}
```

- [ ] **Step 5: 厨塔概览和挑战**

`apps/server/src/modules/tower/tower.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import { gameParts, type DuelResultDto, type TowerDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import type { Op } from '../../core/op';
import { gainRenown, spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { randomAward, type RandomAward } from '../award/random';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { KEY, badInput, lockTowerState } from './common';
import { duel, duelPower } from './duel';
import {
  floorUnlocked,
  towerDailyTotal,
  towerNight,
  towerRenown,
  towerStrength,
  type TowerTuning,
} from './rules';
import { cachedSide, playerSide, sideDto, watchmanSide } from './sides';

/** 本区服守塔人当天的菜，键 = 层 */
async function watchmanMcs(db: Kysely<DB>, shardId: number): Promise<Map<number, { mcId: number; price: number }>> {
  const rows = await db
    .selectFrom('tower_watchman_mc')
    .select(['floor', 'mc_id', 'price'])
    .where('shard_id', '=', shardId)
    .execute();
  return new Map(rows.map((r) => [r.floor, { mcId: r.mc_id, price: r.price }]));
}

export async function towerView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: TowerTuning,
  now: Date,
): Promise<TowerDto> {
  const { day, hour } = gameParts(now);
  const state = await db
    .selectFrom('tower_state')
    .select('best_floor')
    .where('rest_id', '=', rest.id)
    .executeTakeFirst();
  const best = state?.best_floor ?? 0;
  const rows = await db
    .selectFrom('daily_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', rest.id)
    .where('day', '=', day)
    .where('key', 'like', 'tower.%')
    .execute();
  const count = (key: string) => rows.find((r) => r.key === key)?.count ?? 0;
  const tickets = await db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', rest.id)
    .where('goods_id', '=', GOODS.towerTicket)
    .executeTakeFirst();
  const mcs = await watchmanMcs(db, rest.shard_id);
  const total = towerDailyTotal(count(KEY.ticket), t);
  const me = await cachedSide(db, config, rest, 'attack');
  return {
    floors: [...config.towerFloors.values()].map((f) => ({
      floor: f.floor,
      name: f.name,
      title: f.title,
      note: f.note,
      minLevel: f.minLevel,
      power: f.power,
      maxTimes: f.maxTimes,
      left: Math.max(0, f.maxTimes - count(KEY.floor(f.floor))),
      unlocked: floorUnlocked(f, rest.level, best),
      cost: towerStrength(f.floor, false, t),
      mc: f.mc ? (mcs.get(f.floor) ?? null) : null,
    })),
    power: duelPower(me.attrs),
    left: Math.max(0, total - count(KEY.done)),
    dailyTotal: total,
    tickets: tickets?.num ?? 0,
    bestFloor: best,
    strength: rest.strength,
    level: rest.level,
    hour,
    nightFloor: t.nightFloor,
    openHour: t.openHour,
    testCost: t.testStrength,
  };
}

/**
 * 挑战守塔人（设计文档 §3.2）。检查顺序：层号、解锁、夜间、（正式挑战）今日总次数、守塔人次数、体力。
 * 随机数顺序：对决（我五项、守塔人五项）→ 随机奖励
 */
export async function challengeTower(o: Op, floorNo: number, test: boolean): Promise<DuelResultDto> {
  const t = o.tuning.tower;
  const f = o.config.towerFloors.get(floorNo);
  if (!f) throw badInput('floor');
  const state = await lockTowerState(o);
  if (!floorUnlocked(f, o.rest.level, state.best_floor))
    throw invalidState('floor_locked', { minLevel: f.minLevel, needFloor: floorNo - 1 });
  const { day, hour } = gameParts(o.now);
  if (towerNight(floorNo, hour, t)) throw invalidState('tower_night', { openHour: t.openHour });
  if (!test) {
    const total = towerDailyTotal(await getDaily(o.tx, o.rest.id, KEY.ticket, day), t);
    if ((await getDaily(o.tx, o.rest.id, KEY.done, day)) >= total) throw limitReached('tower', { max: total });
    if ((await getDaily(o.tx, o.rest.id, KEY.floor(floorNo), day)) >= f.maxTimes)
      throw limitReached('watchman', { max: f.maxTimes });
  }
  spendStrength(o, towerStrength(floorNo, test, t));
  const mc = await o.tx
    .selectFrom('tower_watchman_mc')
    .select('price')
    .where('shard_id', '=', o.shardId)
    .where('floor', '=', floorNo)
    .executeTakeFirst();
  const me = await playerSide(o, 'attack');
  const them = watchmanSide(f, mc?.price ?? 0);
  const r = duel(me, them, o.rng);
  let renown = 0;
  const awards: RandomAward[] = [];
  if (!test) {
    renown = towerRenown(floorNo, r.win, t);
    gainRenown(o, renown);
    if (r.win) {
      for (let i = 0; i < floorNo; i++)
        awards.push(await randomAward(o, { level: floorNo + 2, equipFlag: floorNo }));
      if (floorNo > state.best_floor)
        await o.tx
          .updateTable('tower_state')
          .set({ best_floor: floorNo })
          .where('rest_id', '=', o.rest.id)
          .execute();
    }
    await incrementDaily(o.tx, o.rest.id, KEY.done, 1, day);
    await incrementDaily(o.tx, o.rest.id, KEY.floor(floorNo), 1, day);
    await emitAction(o, 'tower.challenge');
  }
  return { win: r.win, me: sideDto(me, r.me), them: sideDto(them, r.them), renown, awards, test, rank: null };
}
```

- [ ] **Step 6: 挑战券**

`apps/server/src/modules/store/use.ts`：

1. 在文件的 import 里加 `import { gameDay } from '@dt/shared';`（已有 `@dt/shared` 的 import 时把 `gameDay` 加进去）、`import { incrementDaily } from '../counter/dailyCounter';`、`import { KEY } from '../tower/common';`
2. 把

```ts
    case 'towerTicket':
      throw new AppError(ErrorCode.NOT_USABLE, 400, { goodsId });
```

换成：

```ts
    case 'towerTicket':
      // 当天厨塔次数 +1（4C-2 设计文档 §3.2）；一次 1 张（NO_BATCH_KINDS）
      await incrementDaily(op.tx, op.rest.id, KEY.ticket, num, gameDay(op.now));
      break;
```

（换完后如果 `AppError` / `ErrorCode` 在 use.ts 里没有别的用处，删掉对应 import；`pnpm --filter @dt/server typecheck` 会提示）

`apps/server/src/modules/store/store.test.ts`：把

```ts
  it('不能用的道具、功能没开的道具报 NOT_USABLE', async () => {
    const ctx = await newRestaurant(t, { goods: { 86: 1, 136: 1 } });
    await expect(s().use(ctx, { goodsId: 86, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
    await expect(s().use(ctx, { goodsId: 136, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
  });
```

换成（计划裁定 7；功能关闭时挑战券不能用由 `tower.test.ts` 覆盖）：

```ts
  it('不能用的道具报 NOT_USABLE', async () => {
    const ctx = await newRestaurant(t, { goods: { 86: 1 } });
    await expect(s().use(ctx, { goodsId: 86, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
  });
```

- [ ] **Step 7: 服务、路由、注册**

`apps/server/src/modules/tower/service.ts`：

```ts
import type { TowerDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { challengeTower, towerView } from './tower';

export function createTowerService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'tower', source }, fn);
  const restOf = (id: number) =>
    d.db.selectFrom('restaurant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return {
    async overview(ctx: RestCtx): Promise<TowerDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return towerView(d.db, d.config, await restOf(ctx.restaurantId), s.tuning.tower, d.now());
    },
    challenge(ctx: RestCtx, b: { floor: number; test: boolean }) {
      return op(ctx, 'tower.challenge', (o) => challengeTower(o, b.floor, b.test));
    },
  };
}

export type TowerService = ReturnType<typeof createTowerService>;
```

`apps/server/src/modules/tower/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { towerChallengeBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TowerService } from './service';

export function towerRoutes(svc: TowerService): FastifyPluginAsync {
  return async (r) => {
    r.get('/tower', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/tower/challenge', async (req) =>
      okOp(await svc.challenge(restCtxOf(req), parse(towerChallengeBody, req.body))),
    );
  };
}
```

`apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 里 `'bar',` 下面加 `'tower',`。

`apps/server/src/game.ts`：
- 在 `import { createBarService, type BarService } from './modules/bar/service';` 下面加 `import { createTowerService, type TowerService } from './modules/tower/service';`
- `Game` 接口里 `bar: BarService;` 下面加 `tower: TowerService;`
- 返回对象里 `bar: createBarService(deps),` 下面加 `tower: createTowerService(deps),`

`apps/server/src/modules/index.ts`：
- 在 `import { barRoutes } from './bar/routes';` 下面加 `import { towerRoutes } from './tower/routes';`
- 在 `app.register(barRoutes(game.bar), { prefix: '/api/v1' });` 下面加 `app.register(towerRoutes(game.tower), { prefix: '/api/v1' });`

- [ ] **Step 8: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower src/modules/store`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 9: 全量测试并提交**

Run: `pnpm test`
Expected: 除下面两个旧测试外全部通过。厨塔开放后它们一定会失败（和 4C-1 同样的原因），按下面改（计划裁定 9）：

`apps/server/src/modules/task/task.test.ts`：4C-1 改成的"第 27 步厨塔跳到第 28 步"整个 `it(...)` 换成：

```ts
  it('跳过未开放的功能（设计文档 裁定 7）：第 34、35 步外卖跳到第 36 步投喂克拉肯', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 34, level: 5 } });
    const list = await task().tasks(ctx);
    expect(list.mainStep).toBe(36);
    expect(list.main).toMatchObject({ step: 36, key: 'kraken.feed', done: false });
  });
```

`apps/server/src/worker/periodic.test.ts`：`const f = job('f', 'tower', 'k');` 改成 `const f = job('f', 'takeaway', 'k');`。

再跑 `pnpm test`，Expected：全部通过。

```bash
npx prettier --write packages/shared/src/schemas/tower.ts packages/shared/src/index.ts apps/server/src/modules/tower apps/server/src/modules/store apps/server/src/core/features.ts apps/server/src/game.ts apps/server/src/modules/index.ts apps/server/src/modules/task/task.test.ts apps/server/src/worker/periodic.test.ts
git add packages/shared apps/server/src
git commit -m "feat(server): tower overview, challenges, test runs and challenge tickets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 守塔人换菜

**Files:**
- Create: `apps/server/src/modules/tower/watchman.ts`、`apps/server/src/modules/tower/jobs.ts`
- Modify: `apps/server/src/game.ts`（注册定时任务）
- Test: `apps/server/src/modules/tower/watchman.test.ts`

**Interfaces:**
- Consumes: Task 1 `GameConfig.towerFloors`、`tuning.tower.watchmanCook`；Task 2 `tower_watchman_mc`；Task 4 `towerView`、`challengeTower`（读 `tower_watchman_mc`）
- Produces:
  - `watchmanPeriod(now: Date, t: TowerTuning): string`（游戏日）
  - `cookWatchmen(db, config, shardId, day, rng, t): Promise<number>`（换了几层）
  - `towerJobs(d: GameDeps): PeriodicJob[]`：`tower-watchman`（`run` 返回 `{ floors }`）；Task 6 往里加 `tower-rank-week`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/tower/watchman.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { watchmanPeriod } from './watchman';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const runJob = async (shardId: number, period: string) =>
  t.game.jobs
    .find((j) => j.name === 'tower-watchman')!
    .run({
      shardId,
      period,
      now: t.clock.now,
      settings: await t.game.shards.settings(shardId),
      log: { error: () => undefined },
    });
const floor4Ready = async () => {
  const ctx = await newRestaurant(t, { patch: { level: 31 } });
  await t.db.insertInto('tower_state').values({ rest_id: ctx.restaurantId, best_floor: 3 }).execute();
  return ctx;
};

describe('守塔人换菜（设计文档裁定 2）', () => {
  it('周期：05:58 以后是今天，之前是昨天', () => {
    const tw = config.tuning.tower;
    expect(watchmanPeriod(gameTime(DAY, 5, 57), tw)).toBe('2026-09-29');
    expect(watchmanPeriod(gameTime(DAY, 5, 58), tw)).toBe(DAY);
  });

  it('还没换过菜：概览里菜为空，4 层"养"按 0 算，挑战不报错（Review Focus 3）', async () => {
    const ctx = await floor4Ready();
    expect((await t.game.tower.overview(ctx)).floors[3]!.mc).toBeNull();
    const r = await t.game.tower.challenge(ctx, { floor: 4, test: true });
    expect(r.data.them.scores[4]).toBe(35.4);
  });

  it('4~10 层各换一道：等级在 [⌊(层−2)/2⌋, +3]，每份价值在营养值的 1~1.3 倍；再跑覆盖', async () => {
    const ctx = await newRestaurant(t);
    expect(await runJob(ctx.shardId, DAY)).toEqual({ floors: 7 });
    const rows = await t.db
      .selectFrom('tower_watchman_mc')
      .selectAll()
      .where('shard_id', '=', ctx.shardId)
      .orderBy('floor')
      .execute();
    expect(rows.map((r) => r.floor)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    for (const r of rows) {
      const mc = config.requireMc(r.mc_id);
      const lo = Math.floor((r.floor - 2) / 2);
      expect(mc.level).toBeGreaterThanOrEqual(lo);
      expect(mc.level).toBeLessThanOrEqual(lo + 3);
      expect(r.price).toBeGreaterThanOrEqual(mc.nutritive);
      expect(r.price).toBeLessThanOrEqual(Math.floor(mc.nutritive * 1.3));
      expect(r.day).toBe(DAY);
    }
    expect((await t.game.tower.overview(ctx)).floors[3]!.mc).toEqual({ mcId: rows[0]!.mc_id, price: rows[0]!.price });
    await runJob(ctx.shardId, '2026-10-01');
    const again = await t.db
      .selectFrom('tower_watchman_mc')
      .select('day')
      .where('shard_id', '=', ctx.shardId)
      .execute();
    expect(again.map((r) => r.day)).toEqual(Array(7).fill('2026-10-01'));
  });

  it('"养"加上守塔人当天的菜每份价值 × 0.6', async () => {
    const ctx = await floor4Ready();
    await t.db
      .insertInto('tower_watchman_mc')
      .values({ shard_id: ctx.shardId, floor: 4, mc_id: 2, price: 100, day: DAY })
      .execute();
    const r = await t.game.tower.challenge(ctx, { floor: 4, test: true });
    expect(r.data.them.scores[4]).toBe(95.4);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/watchman.test.ts`
Expected: FAIL——`Failed to resolve import "./watchman"`

- [ ] **Step 3: 实现**

`apps/server/src/modules/tower/watchman.ts`：

```ts
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { addDays, gameParts, type Rng } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { TowerTuning } from './rules';

/** 换菜的周期（游戏日）：今天到了 hour:minute 就是今天，否则是昨天 */
export function watchmanPeriod(now: Date, t: TowerTuning): string {
  const p = gameParts(now);
  const reached = p.hour * 60 + p.minute >= t.watchmanCook.hour * 60 + t.watchmanCook.minute;
  return reached ? p.day : addDays(p.day, -1);
}

/**
 * 守塔人换菜（设计文档裁定 2）：比拼特色菜的层各从 [⌊(层−2)/2⌋, +3] 级的特色菜里均匀抽一道，
 * 每份价值 = ⌊营养值 × (1 + rand × priceSpread)⌋，覆盖这一层的菜。每层随机数顺序：抽菜 → 抽价值
 */
export async function cookWatchmen(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  day: string,
  rng: Rng,
  t: TowerTuning,
): Promise<number> {
  let n = 0;
  for (const f of config.towerFloors.values()) {
    if (!f.mc) continue;
    const lo = Math.floor((f.floor - 2) / 2);
    const pool = config.bundle.mysteriousCookbooks.filter((m) => m.level >= lo && m.level <= lo + 3);
    if (pool.length === 0) continue;
    const mc = pool[rng.int(pool.length)]!;
    const price = Math.floor(mc.nutritive * (1 + rng.next() * t.watchmanCook.priceSpread));
    await db
      .insertInto('tower_watchman_mc')
      .values({ shard_id: shardId, floor: f.floor, mc_id: mc.id, price, day })
      .onConflict((oc) => oc.columns(['shard_id', 'floor']).doUpdateSet({ mc_id: mc.id, price, day }))
      .execute();
    n += 1;
  }
  return n;
}
```

`apps/server/src/modules/tower/jobs.ts`：

```ts
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { cookWatchmen, watchmanPeriod } from './watchman';

export function towerJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'tower-watchman',
      feature: 'tower',
      period: (now, s) => watchmanPeriod(now, s.tuning.tower),
      run: async ({ shardId, period, settings }) => ({
        floors: await cookWatchmen(d.db, d.config, shardId, period, d.rng(), settings.tuning.tower),
      }),
    },
  ];
}
```

`apps/server/src/game.ts`：在 `import { yardJobs } from './modules/yard/jobs';` 下面加 `import { towerJobs } from './modules/tower/jobs';`；在 `jobs.push(...yardJobs(deps, world));` 下面加 `jobs.push(...towerJobs(deps));`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/tower apps/server/src/game.ts
git add apps/server/src
git commit -m "feat(server): daily watchman dishes for tower floors 4-10

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 赛厨榜和周结算

**Files:**
- Create: `apps/server/src/modules/tower/rank.ts`
- Modify: `apps/server/src/modules/tower/jobs.ts`、`service.ts`、`routes.ts`
- Test: `apps/server/src/modules/tower/rank.test.ts`

**Interfaces:**
- Consumes: Task 3 `rankChallengeError`、`rankOccupyError`、`rankGift`；Task 4 `KEY`、`badInput`、`sparAwards`、`playerSide`、`cachedSide`、`sideDto`；`mondayOf`（`modules/friend/weekly.ts`）；`openGift`（`modules/award/award.ts`）
- Produces:
  - `rankView(db, rest, t, now): Promise<RankDto>`、`occupyRank(o, rank): Promise<{ rank: number }>`、`challengeRank(o, rank): Promise<DuelResultDto>`
  - `rankWeekPeriod(now: Date): string`（被结算那一周的周一）、`settleRankWeek(d, shardId, week, now): Promise<{ awarded: number }>`
  - 定时任务 `tower-rank-week`；服务 `rank(ctx)`、`occupy(ctx, {rank})`、`challengeRank(ctx, {rank})`；路由 `GET /tower/rank`、`POST /tower/rank/occupy`、`POST /tower/rank/challenge`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/tower/rank.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { rankWeekPeriod } from './rank';

const DAY = '2026-09-30';
const WEEK = '2026-09-28';
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const two = async (a = {}, b = {}): Promise<[RestCtx, RestCtx]> => {
  const x = await newRestaurant(t, { patch: a });
  const y = await newRestaurant(t, { shardId: x.shardId, patch: b });
  return [x, y];
};
const board = async (shardId: number, week = WEEK) =>
  (
    await t.db
      .selectFrom('tower_rank')
      .select(['rank', 'rest_id'])
      .where('shard_id', '=', shardId)
      .where('week', '=', week)
      .orderBy('rank')
      .execute()
  ).map((r) => [r.rank, r.rest_id]);
const occupy = (ctx: RestCtx, rank: number) => t.game.tower.occupy(ctx, { rank });
const challenge = (ctx: RestCtx, rank: number) => t.game.tower.challengeRank(ctx, { rank });

describe('占位（设计文档裁定 14）', () => {
  it('空位谁都能占（包括第 1 名），不花体力；已在榜上只能往前占，原位置让出；被占的报 rank_taken', async () => {
    const [a, b] = await two();
    expect((await occupy(a, 1)).data).toEqual({ rank: 1 });
    await expect(occupy(b, 1)).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'rank_taken' } });
    await occupy(b, 6);
    await expect(occupy(b, 9)).rejects.toMatchObject({ params: { reason: 'rank_not_better' } });
    await occupy(b, 4);
    expect(await board(a.shardId)).toEqual([
      [1, a.restaurantId],
      [4, b.restaurantId],
    ]);
    expect((await restRow(t, a.restaurantId)).strength).toBe(100);
    const v = await t.game.tower.rank(b);
    expect(v).toMatchObject({ week: WEEK, myRank: 4, left: 10, spar: 0, rankTop: 8, rankGap: 3, duelStrength: 5 });
    expect(v.weekEnd).toBe(gameTime('2026-10-05', 0).toISOString());
    expect(v.slots).toHaveLength(15);
    expect(v.slots[0]).toMatchObject({ rank: 1, restId: a.restaurantId, level: 1 });
    expect(v.slots[1]).toEqual({ rank: 2, restId: null, name: null, level: null });
  });

  it('两个人同时占同一个空位：只有一个成功（Review Focus 1）', async () => {
    const [a, b] = await two();
    const r = await Promise.allSettled([occupy(a, 3), occupy(b, 3)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: { params: { reason: 'rank_taken' } } });
    expect(await board(a.shardId)).toHaveLength(1);
  });
});

describe('挑战（设计文档 §3.3）', () => {
  it('胜：交换名次，声望 +2，切磋奖励 2 次（等级 4）；计入切磋总次数（Review Focus 5）和活跃"与好友赛厨"', async () => {
    const [a, b] = await two({}, STRONG);
    await occupy(a, 1);
    await occupy(b, 4);
    const r = await challenge(b, 1);
    expect(r.data).toMatchObject({ win: true, renown: 2, rank: 1, test: false });
    expect(r.data.awards).toEqual([
      { kind: 'coin', id: null, num: 1600, lucky: false },
      { kind: 'coin', id: null, num: 1600, lucky: false },
    ]);
    expect(await board(a.shardId)).toEqual([
      [1, b.restaurantId],
      [4, a.restaurantId],
    ]);
    expect(await restRow(t, b.restaurantId)).toMatchObject({ strength: 95, renown: 2, coin: 3200 });
    expect(await t.game.tower.rank(b)).toMatchObject({ myRank: 1, left: 9, spar: 1 });
    const act = await t.game.task.activation(b);
    expect(act.items.find((i) => i.name === '与好友赛厨')!.count).toBe(1);
  });

  it('负：声望 +1，名次不变；没上榜的挑战第 9~15 名，胜了对方下榜', async () => {
    const [a, b] = await two(STRONG, {});
    await occupy(a, 10);
    expect((await challenge(b, 10)).data).toMatchObject({ win: false, renown: 1, rank: null, awards: [] });
    expect(await board(a.shardId)).toEqual([[10, a.restaurantId]]);
    const c = await newRestaurant(t, {
      shardId: a.shardId,
      patch: { attr_cook: 40, attr_cutting: 40, attr_fire: 40, attr_season: 20 },
    });
    expect((await challenge(c, 10)).data).toMatchObject({ win: true, rank: 10 });
    expect(await board(a.shardId)).toEqual([[10, c.restaurantId]]);
  });

  it('规则：前 8 名要在榜上且名次差 ≤ 3；只能往前；空格报 rank_empty；每天 10 次', async () => {
    const [a, b] = await two();
    await occupy(a, 1);
    await expect(challenge(b, 1)).rejects.toMatchObject({ params: { reason: 'rank_gap', need: 4 } });
    await occupy(b, 5);
    await expect(challenge(b, 1)).rejects.toMatchObject({ params: { reason: 'rank_gap', need: 4 } });
    await expect(challenge(b, 2)).rejects.toMatchObject({ params: { reason: 'rank_empty' } });
    await expect(challenge(a, 5)).rejects.toMatchObject({ params: { reason: 'rank_not_better' } });
    await occupy(b, 4);
    await t.db
      .insertInto('daily_counter')
      .values({ rest_id: b.restaurantId, day: DAY, key: 'tower.rankDone', count: 10 })
      .execute();
    await expect(challenge(b, 1)).rejects.toMatchObject({ code: 'LIMIT_REACHED', params: { what: 'rank', max: 10 } });
  });
});

describe('周结算（设计文档 §3.3）', () => {
  it('周一 0 点后本周榜是空的；上周只在结算时按名次开礼包，前三名得称号勋章并发新闻（Review Focus 2）', async () => {
    const [a, b] = await two();
    const c = await newRestaurant(t, { shardId: a.shardId });
    await occupy(a, 1);
    await occupy(b, 4);
    await occupy(c, 9);
    t.clock.set(new Date(gameTime('2026-10-05', 0).getTime() + 30_000));
    const v = await t.game.tower.rank(a);
    expect(v).toMatchObject({ week: '2026-10-05', myRank: null });
    expect(v.slots.every((s) => s.restId === null)).toBe(true);
    expect(rankWeekPeriod(new Date(gameTime('2026-10-05', 0).getTime() + 30_000))).toBe('2026-09-21');
    expect(rankWeekPeriod(gameTime('2026-10-05', 0, 1))).toBe(WEEK);
    const out = await t.game.jobs
      .find((j) => j.name === 'tower-rank-week')!
      .run({
        shardId: a.shardId,
        period: WEEK,
        now: t.clock.now,
        settings: await t.game.shards.settings(a.shardId),
        log: { error: () => undefined },
      });
    expect(out).toEqual({ awarded: 3 });
    expect(await goodsNum(t, a.restaurantId, 199)).toBe(1);
    expect((await restRow(t, a.restaurantId)).renown).toBe(500);
    expect((await restRow(t, b.restaurantId)).renown).toBe(150);
    expect((await restRow(t, c.restaurantId)).renown).toBe(100);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', a.shardId)
      .where('type', '=', 'tower.rank.week')
      .execute();
    expect(news).toHaveLength(1);
    expect(news[0]!.params).toMatchObject({ week: WEEK, top: [{ rank: 1, restId: a.restaurantId }] });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/rank.test.ts`
Expected: FAIL——`Failed to resolve import "./rank"`

- [ ] **Step 3: 实现**

`apps/server/src/modules/tower/rank.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { addDays, gameDay, gameParts, gameTime, type DuelResultDto, type RankDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, runSystemOp, type Op } from '../../core/op';
import { gainRenown, spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { openGift } from '../award/award';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { mondayOf } from '../friend/weekly';
import { KEY, badInput, sparAwards } from './common';
import { duel } from './duel';
import { rankChallengeError, rankGift, rankOccupyError, type TowerTuning } from './rules';
import { cachedSide, playerSide, sideDto } from './sides';

/** 锁住本区服本周的榜（事务级咨询锁），再读名次 */
async function lockBoard(o: Op, week: string): Promise<Array<{ rank: number; rest_id: number }>> {
  await sql`select pg_advisory_xact_lock(hashtext(${`tower.rank:${o.shardId}:${week}`}))`.execute(o.tx);
  return o.tx
    .selectFrom('tower_rank')
    .select(['rank', 'rest_id'])
    .where('shard_id', '=', o.shardId)
    .where('week', '=', week)
    .orderBy('rank')
    .execute();
}

export async function rankView(db: Kysely<DB>, rest: RestaurantRow, t: TowerTuning, now: Date): Promise<RankDto> {
  const day = gameDay(now);
  const week = mondayOf(day);
  const rows = await db
    .selectFrom('tower_rank as k')
    .innerJoin('restaurant as r', 'r.id', 'k.rest_id')
    .select(['k.rank', 'k.rest_id', 'r.name', 'r.level'])
    .where('k.shard_id', '=', rest.shard_id)
    .where('k.week', '=', week)
    .execute();
  const byRank = new Map(rows.map((r) => [r.rank, r]));
  return {
    week,
    weekEnd: gameTime(addDays(week, 7), 0).toISOString(),
    slots: Array.from({ length: t.rankSize }, (_, i) => {
      const r = byRank.get(i + 1);
      return { rank: i + 1, restId: r?.rest_id ?? null, name: r?.name ?? null, level: r?.level ?? null };
    }),
    myRank: rows.find((r) => r.rest_id === rest.id)?.rank ?? null,
    left: Math.max(0, t.rankDaily - (await getDaily(db, rest.id, KEY.rankDone, day))),
    spar: await getDaily(db, rest.id, KEY.spar, day),
    strength: rest.strength,
    rankTop: t.rankTop,
    rankGap: t.rankGap,
    duelStrength: t.duelStrength,
  };
}

/** 占位（设计文档裁定 14）：空格；不在榜上或往前占，原格子让出；不花体力、不计次数 */
export async function occupyRank(o: Op, rank: number): Promise<{ rank: number }> {
  if (rank > o.tuning.tower.rankSize) throw badInput('rank');
  const week = mondayOf(gameDay(o.now));
  const rows = await lockBoard(o, week);
  if (rows.some((r) => r.rank === rank)) throw invalidState('rank_taken');
  const mine = rows.find((r) => r.rest_id === o.rest.id)?.rank ?? null;
  const err = rankOccupyError(mine, rank);
  if (err) throw invalidState(err);
  if (mine !== null)
    await o.tx
      .deleteFrom('tower_rank')
      .where('shard_id', '=', o.shardId)
      .where('week', '=', week)
      .where('rank', '=', mine)
      .execute();
  await o.tx.insertInto('tower_rank').values({ shard_id: o.shardId, week, rank, rest_id: o.rest.id }).execute();
  return { rank };
}

/**
 * 挑战名次（设计文档 §3.3）：胜了我到目标名次、对方到我原来的名次（我原来不在榜上则对方下榜）。
 * 被挑战方不锁店，幸运用它缓存的加成（计划裁定 1）。随机数顺序：对决 → 切磋奖励
 */
export async function challengeRank(o: Op, rank: number): Promise<DuelResultDto> {
  const t = o.tuning.tower;
  if (rank > t.rankSize) throw badInput('rank');
  const day = gameDay(o.now);
  const week = mondayOf(day);
  const rows = await lockBoard(o, week);
  const target = rows.find((r) => r.rank === rank);
  if (!target) throw invalidState('rank_empty');
  const mine = rows.find((r) => r.rest_id === o.rest.id)?.rank ?? null;
  const err = rankChallengeError(mine, rank, t);
  if (err) throw invalidState(err.reason, err.need === undefined ? {} : { need: err.need });
  if ((await getDaily(o.tx, o.rest.id, KEY.rankDone, day)) >= t.rankDaily)
    throw limitReached('rank', { max: t.rankDaily });
  spendStrength(o, t.duelStrength);
  const themRest = await o.tx
    .selectFrom('restaurant')
    .selectAll()
    .where('id', '=', target.rest_id)
    .executeTakeFirstOrThrow();
  const me = await playerSide(o, 'attack');
  const them = await cachedSide(o.tx, o.config, themRest, 'defend');
  const r = duel(me, them, o.rng);
  const before = await getDaily(o.tx, o.rest.id, KEY.spar, day);
  let myRank = mine;
  if (r.win) {
    await o.tx
      .deleteFrom('tower_rank')
      .where('shard_id', '=', o.shardId)
      .where('week', '=', week)
      .where('rest_id', 'in', [o.rest.id, target.rest_id])
      .execute();
    const values = [{ shard_id: o.shardId, week, rank, rest_id: o.rest.id }];
    if (mine !== null) values.push({ shard_id: o.shardId, week, rank: mine, rest_id: target.rest_id });
    await o.tx.insertInto('tower_rank').values(values).execute();
    myRank = rank;
  }
  const renown = r.win ? t.rankWinRenown : t.rankLoseRenown;
  gainRenown(o, renown);
  const awards = r.win ? await sparAwards(o, before) : [];
  await incrementDaily(o.tx, o.rest.id, KEY.rankDone, 1, day);
  await incrementDaily(o.tx, o.rest.id, KEY.spar, 1, day);
  await emitAction(o, 'tower.rank');
  return { win: r.win, me: sideDto(me, r.me), them: sideDto(them, r.them), renown, awards, test: false, rank: myRank };
}

/** 周结算的周期：每周一 00:01 结算上一周；返回被结算那一周的周一 */
export function rankWeekPeriod(now: Date): string {
  const mon = mondayOf(gameParts(now).day);
  return now >= gameTime(mon, 0, 1) ? addDays(mon, -7) : addDays(mon, -14);
}

/** 结算一周（设计文档 §3.3）：按名次打开礼包（每家店一个系统操作）；有前三名时发一条新闻 */
export async function settleRankWeek(
  d: GameDeps,
  shardId: number,
  week: string,
  now: Date,
): Promise<{ awarded: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const rows = await d.db
    .selectFrom('tower_rank as k')
    .innerJoin('restaurant as r', 'r.id', 'k.rest_id')
    .select(['k.rank', 'k.rest_id', 'r.name'])
    .where('k.shard_id', '=', shardId)
    .where('k.week', '=', week)
    .orderBy('k.rank')
    .execute();
  const top = rows.filter((r) => r.rank <= 3).map((r) => ({ rank: r.rank, restId: r.rest_id, name: r.name }));
  let awarded = 0;
  for (const row of rows) {
    const giftId = rankGift(row.rank, tuning.tower);
    if (giftId === null) continue;
    const first = awarded === 0;
    await runSystemOp(d, shardId, row.rest_id, { source: 'tower.rank.week', now }, async (op) => {
      await openGift(op, op.config.requireGoods(giftId), 1, { source: 'tower.rank.week' });
      restLog(op, 'tower.rank.week', { week, rank: row.rank, goodsId: giftId });
      if (first && top.length > 0) opNews(op, 'tower.rank.week', { week, top });
    });
    awarded += 1;
  }
  return { awarded };
}
```

`apps/server/src/modules/tower/jobs.ts`：import 加 `import { rankWeekPeriod, settleRankWeek } from './rank';`，数组里 `tower-watchman` 之后加：

```ts
    {
      name: 'tower-rank-week',
      feature: 'tower',
      period: (now) => rankWeekPeriod(now),
      run: ({ shardId, period, now }) => settleRankWeek(d, shardId, period, now),
    },
```

`apps/server/src/modules/tower/service.ts`：
- import 改成 `import type { RankDto, TowerDto } from '@dt/shared';`，加 `import { challengeRank, occupyRank, rankView } from './rank';`
- 返回对象里 `challenge(...) { ... },` 后面加：

```ts
    async rank(ctx: RestCtx): Promise<RankDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return rankView(d.db, await restOf(ctx.restaurantId), s.tuning.tower, d.now());
    },
    occupy(ctx: RestCtx, b: { rank: number }) {
      return op(ctx, 'tower.rank', (o) => occupyRank(o, b.rank));
    },
    challengeRank(ctx: RestCtx, b: { rank: number }) {
      return op(ctx, 'tower.rank', (o) => challengeRank(o, b.rank));
    },
```

`apps/server/src/modules/tower/routes.ts`：`@dt/shared` 的 import 加 `rankBody`；`/tower/challenge` 那段下面加：

```ts
    r.get('/tower/rank', async (req) => ok(await svc.rank(restCtxOf(req))));
    r.post('/tower/rank/occupy', async (req) => okOp(await svc.occupy(restCtxOf(req), parse(rankBody, req.body))));
    r.post('/tower/rank/challenge', async (req) =>
      okOp(await svc.challengeRank(restCtxOf(req), parse(rankBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/tower
git add apps/server/src/modules/tower
git commit -m "feat(server): weekly cooking rank with occupy, challenge and Monday settlement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 好友切磋

**Files:**
- Create: `apps/server/src/modules/tower/friendDuel.ts`
- Modify: `apps/server/src/modules/tower/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/tower/duel.test.ts`

**Interfaces:**
- Consumes: Task 3 `duelTier`、`duelRenown`、`duelPower`；Task 4 `KEY`、`sparAwards`、`playerSide`、`sideDto`；`runPairOp`、`PairOp`（`core/pair.ts`）
- Produces: `duelInfo(db, me: RestaurantRow, targetId, t, now): Promise<DuelInfoDto>`、`friendDuel(p: PairOp): Promise<DuelResultDto>`；服务 `duelInfo(ctx, restId)`、`duel(ctx, {restId})`；路由 `GET /tower/duel/:restId`、`POST /tower/duel`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/tower/duel.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { befriend, createTestGame, newPair, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { ensureNpc } from '../npc/npc';

const DAY = '2026-09-30';
const config = testConfig();
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
const MID = { attr_cook: 15, attr_cutting: 15, attr_fire: 15, attr_season: 10 };
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const pair = async (a = {}, b = {}): Promise<[RestCtx, RestCtx]> => {
  const [x, y] = await newPair(t, { patch: { star_level: 1, ...a } }, { patch: { star_level: 1, ...b } });
  await befriend(t, x.restaurantId, y.restaurantId);
  return [x, y];
};
const duel = (me: RestCtx, them: RestCtx) => t.game.tower.duel(me, { restId: them.restaurantId });
const setDaily = (restId: number, key: string, count: number) =>
  t.db
    .insertInto('daily_counter')
    .values({ rest_id: restId, day: DAY, key, count })
    .onConflict((oc) => oc.columns(['rest_id', 'day', 'key']).doUpdateSet({ count }))
    .execute();

describe('好友切磋（设计文档 §3.4）', () => {
  it('普通档胜：声望 +5，切磋奖励 2 次；扣 5 体力；计入支线 110 和活跃；对方不受影响', async () => {
    const [a, b] = await pair({ ...STRONG, main_task_step: 23 }, MID);
    expect(await t.game.tower.duelInfo(a, b.restaurantId)).toEqual({
      left: 10,
      spar: 0,
      strength: 100,
      duelStrength: 5,
    });
    const r = await duel(a, b);
    expect(r.data).toMatchObject({ win: true, renown: 5, rank: null, test: false });
    expect(r.data.me.power).toBe(70);
    expect(r.data.them.power).toBe(55);
    expect(r.data.awards).toHaveLength(2);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ strength: 95, renown: 5, coin: 3200 });
    expect(await restRow(t, b.restaurantId)).toMatchObject({ strength: 100, renown: 0, coin: 0 });
    expect(await t.game.tower.duelInfo(a, b.restaurantId)).toMatchObject({ left: 9, spar: 1 });
    const side = (await t.game.task.tasks(a)).side.find((x) => x.id === 110)!;
    expect(side).toMatchObject({ key: 'tower.friendDuel', progress: 1 });
    const act = await t.game.task.activation(a);
    expect(act.items.find((i) => i.name === '与好友赛厨')!.count).toBe(1);
  });

  it('以强凌弱胜 0；以弱胜强胜 +6，满 50 次也照给但没有奖励；以弱胜强负 −2（声望可以为负）', async () => {
    const [a, b] = await pair(STRONG, {});
    expect((await duel(a, b)).data).toMatchObject({ win: true, renown: 0 });
    const [c, d] = await pair(STRONG, { luck: 200 });
    await setDaily(c.restaurantId, 'tower.spar', 50);
    expect((await duel(c, d)).data).toMatchObject({ win: true, renown: 6, awards: [] });
    const [e, f] = await pair({}, MID);
    expect((await duel(e, f)).data).toMatchObject({ win: false, renown: -2 });
    expect((await restRow(t, e.restaurantId)).renown).toBe(-2);
  });

  it('上限：今日切磋满 20 次后普通胜只给 +2、奖励 1 次；满 50 次后 0 且没有奖励', async () => {
    const [a, b] = await pair(STRONG, MID);
    await setDaily(a.restaurantId, 'tower.spar', 20);
    const r1 = await duel(a, b);
    expect(r1.data).toMatchObject({ win: true, renown: 2 });
    expect(r1.data.awards).toHaveLength(1);
    await setDaily(a.restaurantId, 'tower.spar', 50);
    expect((await duel(a, b)).data).toMatchObject({ win: true, renown: 0, awards: [] });
  });

  it('条件：对方是蟹老板、不是好友、声望为负、不到 1 星、同一好友满 10 次都不能切磋', async () => {
    const [a, b] = await pair();
    const npc = await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1));
    await befriend(t, a.restaurantId, npc.id);
    await expect(t.game.tower.duel(a, { restId: npc.id })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'npc' },
    });
    const [x, y] = await newPair(t, { patch: { star_level: 1 } }, { patch: { star_level: 1 } });
    await expect(duel(x, y)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
    const [neg, n2] = await pair({ renown: -1 }, {});
    await expect(duel(neg, n2)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'renown', what: 'duel' },
    });
    const [nostar, s2] = await pair({ star_level: 0 }, {});
    await expect(duel(nostar, s2)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    await setDaily(a.restaurantId, `tower.duel:${b.restaurantId}`, 10);
    await expect(duel(a, b)).rejects.toMatchObject({ code: 'LIMIT_REACHED', params: { what: 'duel', max: 10 } });
    expect((await t.game.tower.duelInfo(a, b.restaurantId)).left).toBe(0);
    expect((await restRow(t, a.restaurantId)).strength).toBe(100);
  });

  it('区服关闭 tower：切磋报 FEATURE_DISABLED', async () => {
    const [a, b] = await pair();
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ features: { tower: false } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(duel(a, b)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.tower.duelInfo(a, b.restaurantId)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/duel.test.ts`
Expected: FAIL——`t.game.tower.duel is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/tower/friendDuel.ts`：

```ts
import type { Kysely } from 'kysely';
import { gameDay, type DuelInfoDto, type DuelResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached, requirement } from '../../core/errors';
import type { PairOp } from '../../core/pair';
import { gainRenown, spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { KEY, sparAwards } from './common';
import { duel, duelPower } from './duel';
import { duelRenown, duelTier, type TowerTuning } from './rules';
import { playerSide, sideDto } from './sides';

export async function duelInfo(
  db: Kysely<DB>,
  me: RestaurantRow,
  targetId: number,
  t: TowerTuning,
  now: Date,
): Promise<DuelInfoDto> {
  const day = gameDay(now);
  return {
    left: Math.max(0, t.duelPerFriend - (await getDaily(db, me.id, KEY.duel(targetId), day))),
    spar: await getDaily(db, me.id, KEY.spar, day),
    strength: me.strength,
    duelStrength: t.duelStrength,
  };
}

/**
 * 好友切磋（设计文档 §3.4）：我进攻、对方防守，对方不受影响。声望按厨力分档和今日切磋总次数（裁定 7、8）。
 * 随机数顺序：对决 → 切磋奖励
 */
export async function friendDuel(p: PairOp): Promise<DuelResultDto> {
  const o = p.me;
  const t = o.tuning.tower;
  if (p.them.rest.npc) throw invalidState('npc');
  if (o.rest.renown < 0) throw requirement('renown', { what: 'duel' });
  if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, KEY.duel(p.them.rest.id), day)) >= t.duelPerFriend)
    throw limitReached('duel', { max: t.duelPerFriend });
  spendStrength(o, t.duelStrength);
  const me = await playerSide(o, 'attack');
  const them = await playerSide(p.them, 'defend');
  const r = duel(me, them, o.rng);
  const before = await getDaily(o.tx, o.rest.id, KEY.spar, day);
  const renown = duelRenown(duelTier(duelPower(me.attrs), duelPower(them.attrs), t), r.win, before, t);
  gainRenown(o, renown);
  const awards = r.win && before < t.sparMaxAt ? await sparAwards(o, before) : [];
  await incrementDaily(o.tx, o.rest.id, KEY.duel(p.them.rest.id), 1, day);
  await incrementDaily(o.tx, o.rest.id, KEY.spar, 1, day);
  await emitAction(o, 'tower.friendDuel');
  return { win: r.win, me: sideDto(me, r.me), them: sideDto(them, r.them), renown, awards, test: false, rank: null };
}
```

`apps/server/src/modules/tower/service.ts`：
- import 改成 `import type { DuelInfoDto, RankDto, TowerDto } from '@dt/shared';`，加 `import { runPairOp } from '../../core/pair';`、`import { duelInfo, friendDuel } from './friendDuel';`
- 返回对象里 `challengeRank(...) { ... },` 后面加：

```ts
    async duelInfo(ctx: RestCtx, restId: number): Promise<DuelInfoDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'tower');
      return duelInfo(d.db, await restOf(ctx.restaurantId), restId, s.tuning.tower, d.now());
    },
    duel(ctx: RestCtx, b: { restId: number }) {
      return runPairOp(d, ctx, b.restId, { feature: 'tower', source: 'tower.duel', friend: 'required' }, (p) =>
        friendDuel(p),
      );
    },
```

`apps/server/src/modules/tower/routes.ts`：`@dt/shared` 的 import 加 `duelBody`、`restIdParam`；`/tower/rank/challenge` 那段下面加：

```ts
    r.get('/tower/duel/:restId', async (req) =>
      ok(await svc.duelInfo(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.post('/tower/duel', async (req) => okOp(await svc.duel(restCtxOf(req), parse(duelBody, req.body))));
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/tower
git add apps/server/src/modules/tower
git commit -m "feat(server): friend duels with renown tiers and daily caps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 声望商店

**Files:**
- Create: `apps/server/src/modules/tower/shop.ts`
- Modify: `apps/server/src/modules/tower/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/tower/shop.test.ts`

**Interfaces:**
- Consumes: Task 1 `bundle.renownShop`；Task 3 `shopOnSale`；Task 4 `KEY.shop`、`badInput`；`mondayOf`；`countGoods`、`grantGoodsOp`
- Produces: `shopView(db, config, rest, now): Promise<RenownShopDto>`、`buyShop(o, goodsId, num): Promise<{ renown: number }>`；服务 `shop(ctx)`、`buy(ctx, {goodsId, num})`；路由 `GET /tower/shop`、`POST /tower/shop/buy`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/tower/shop.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-09-30', 12)));

describe('声望商店（设计文档 §3.5）', () => {
  it('本周在售：美味券和本周轮到的两座雕像', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 123 } });
    const v = await t.game.tower.shop(ctx);
    expect(v.renown).toBe(123);
    expect(v.items).toEqual([
      { goodsId: 310, renown: 60, weeklyLimit: 10, bought: 0, rare: false, owned: false },
      { goodsId: 397, renown: 3000, weeklyLimit: 1, bought: 0, rare: true, owned: false },
      { goodsId: 460, renown: 3000, weeklyLimit: 1, bought: 0, rare: true, owned: false },
    ]);
  });

  it('美味券：扣声望、发物品、计本周已兑；超过每周限兑报 LIMIT weekly；下周重新计', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 2000 } });
    expect((await t.game.tower.buy(ctx, { goodsId: 310, num: 3 })).data).toEqual({ renown: 1820 });
    expect(await goodsNum(t, ctx.restaurantId, 310)).toBe(3);
    expect((await t.game.tower.shop(ctx)).items[0]).toMatchObject({ bought: 3 });
    await expect(t.game.tower.buy(ctx, { goodsId: 310, num: 8 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'weekly', max: 10 },
    });
    t.clock.set(gameTime('2026-10-05', 12));
    expect((await t.game.tower.shop(ctx)).items[0]).toMatchObject({ goodsId: 310, bought: 0 });
    await t.game.tower.buy(ctx, { goodsId: 310, num: 8 });
    expect(await goodsNum(t, ctx.restaurantId, 310)).toBe(11);
  });

  it('雕像：每人只能 1 个，兑换后发新闻；已拥有报 LIMIT owned；数量不是 1 报 VALIDATION_FAILED', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 7000 } });
    await expect(t.game.tower.buy(ctx, { goodsId: 397, num: 2 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'num' },
    });
    expect((await t.game.tower.buy(ctx, { goodsId: 397, num: 1 })).data).toEqual({ renown: 4000 });
    expect(await goodsNum(t, ctx.restaurantId, 397)).toBe(1);
    expect((await t.game.tower.shop(ctx)).items[1]).toMatchObject({ goodsId: 397, owned: true, bought: 1 });
    await expect(t.game.tower.buy(ctx, { goodsId: 397, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'owned' },
    });
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(news).toEqual([{ type: 'tower.shop.rare', params: { goodsId: 397 } }]);
  });

  it('本周不卖的、要前置玩法的报 not_on_sale；声望不够报 NOT_ENOUGH，什么都不变', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 50 } });
    for (const goodsId of [402, 506])
      await expect(t.game.tower.buy(ctx, { goodsId, num: 1 })).rejects.toMatchObject({
        code: 'INVALID_STATE',
        params: { reason: 'not_on_sale' },
      });
    await expect(t.game.tower.buy(ctx, { goodsId: 310, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 60, have: 50 },
    });
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(50);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower/shop.test.ts`
Expected: FAIL——`t.game.tower.shop is not a function`

- [ ] **Step 3: 实现**

`apps/server/src/modules/tower/shop.ts`：

```ts
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { gameDay, type RenownShopDto } from '@dt/shared';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opNews, type Op } from '../../core/op';
import { gainRenown } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { mondayOf } from '../friend/weekly';
import { countGoods, grantGoodsOp } from '../store/goods';
import { KEY, badInput } from './common';
import { shopOnSale } from './rules';

export async function shopView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  now: Date,
): Promise<RenownShopDto> {
  const day = gameDay(now);
  const items = shopOnSale(config.bundle.renownShop, day);
  if (items.length === 0) return { renown: rest.renown, items: [] };
  const counts = await db
    .selectFrom('daily_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', rest.id)
    .where('day', '=', mondayOf(day))
    .where('key', 'like', 'renownShop:%')
    .execute();
  const held = await db
    .selectFrom('store_item')
    .select(['goods_id', 'expires_at'])
    .where('rest_id', '=', rest.id)
    .where('num', '>', 0)
    .where(
      'goods_id',
      'in',
      items.map((x) => x.goodsId),
    )
    .execute();
  return {
    renown: rest.renown,
    items: items.map((x) => ({
      goodsId: x.goodsId,
      renown: x.renown,
      weeklyLimit: x.weeklyLimit,
      bought: counts.find((c) => c.key === KEY.shop(x.goodsId))?.count ?? 0,
      rare: x.rare,
      owned:
        x.rare && held.some((h) => h.goods_id === x.goodsId && (h.expires_at === null || h.expires_at > now)),
    })),
  };
}

/** 兑换（设计文档 §3.5）：本周在售；稀有品一次 1 个且没有拥有（计划裁定 2）；每周限兑；扣声望 */
export async function buyShop(o: Op, goodsId: number, num: number): Promise<{ renown: number }> {
  const day = gameDay(o.now);
  const item = shopOnSale(o.config.bundle.renownShop, day).find((x) => x.goodsId === goodsId);
  if (!item) throw invalidState('not_on_sale');
  if (item.rare) {
    if (num !== 1) throw badInput('num');
    if ((await countGoods(o, goodsId)) > 0) throw limitReached('owned');
  }
  const week = mondayOf(day);
  const bought = await getDaily(o.tx, o.rest.id, KEY.shop(goodsId), week);
  if (bought + num > item.weeklyLimit) throw limitReached('weekly', { max: item.weeklyLimit });
  const cost = item.renown * num;
  if (o.rest.renown < cost) throw notEnough('renown', cost, o.rest.renown);
  gainRenown(o, -cost);
  await grantGoodsOp(o, goodsId, num);
  await incrementDaily(o.tx, o.rest.id, KEY.shop(goodsId), num, week);
  if (item.rare) opNews(o, 'tower.shop.rare', { goodsId });
  return { renown: o.rest.renown };
}
```

`apps/server/src/modules/tower/service.ts`：
- import 改成 `import type { DuelInfoDto, RankDto, RenownShopDto, TowerDto } from '@dt/shared';`，加 `import { buyShop, shopView } from './shop';`
- 返回对象里 `duel(...) { ... },` 后面加：

```ts
    async shop(ctx: RestCtx): Promise<RenownShopDto> {
      await d.shards.ensureFeature(ctx.shardId, 'tower');
      return shopView(d.db, d.config, await restOf(ctx.restaurantId), d.now());
    },
    buy(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'tower.shop', (o) => buyShop(o, b.goodsId, b.num));
    },
```

`apps/server/src/modules/tower/routes.ts`：`@dt/shared` 的 import 加 `renownBuyBody`；`/tower/duel` 那行下面加：

```ts
    r.get('/tower/shop', async (req) => ok(await svc.shop(restCtxOf(req))));
    r.post('/tower/shop/buy', async (req) => okOp(await svc.buy(restCtxOf(req), parse(renownBuyBody, req.body))));
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/tower`
Expected: PASS

Run: `pnpm --filter @dt/server typecheck`
Expected: 无报错

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/server/src/modules/tower
git add apps/server/src/modules/tower
git commit -m "feat(server): renown shop with weekly statue rotation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 前端——接口、文案、对决结果、厨塔面板、好友切磋

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`、`apps/web/src/i18n/zh-CN.ts`、`apps/web/src/i18n/zh-CN.test.ts`
- Create: `apps/web/src/components/tower/testData.ts`
- Create: `apps/web/src/components/tower/DuelResult.vue`、`DuelResult.test.ts`
- Create: `apps/web/src/components/tower/FloorPanel.vue`、`FloorPanel.test.ts`
- Create: `apps/web/src/components/tower/FriendDuel.vue`、`FriendDuel.test.ts`
- Modify: `apps/web/src/views/FriendRestView.vue`、`apps/web/src/views/FriendRestView.test.ts`

**Interfaces:**
- Consumes: Task 4 的 DTO（含 `TowerFloorDto.cost`、`TowerDto.testCost`）；4C-1 `awardText`（`components/bar/award.ts`）
- Produces:
  - `endpoints.tower()`、`towerChallenge(floor, test)`、`towerRank()`、`rankOccupy(rank)`、`rankChallenge(rank)`、`duelInfo(restId)`、`friendDuel(restId)`、`renownShop()`、`renownBuy(goodsId, num)`
  - `components/tower/testData.ts`：`duelResult(patch?)`、`towerData(patch?)`、`rankData(patch?)`、`shopData(patch?)`
  - `DuelResult`（props `result: DuelResultDto`）、`FloorPanel`（props `data: TowerDto`，emit `reload`）、`FriendDuel`（props `restId: number`）

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/tower/testData.ts`：

```ts
import type { DuelResultDto, RankDto, RenownShopDto, TowerDto, TowerFloorDto } from '@dt/shared';

export const duelResult = (patch: Partial<DuelResultDto> = {}): DuelResultDto => ({
  win: true,
  me: { name: '我的店', power: 70, scores: [20.4, 19.4, 15.4, 22.4, 7.4], sum: 85 },
  them: { name: '见习模范餐厅', power: 29, scores: [8.1, 8, 6.6, 8.8, 3.6], sum: 35.1 },
  renown: 7,
  awards: [{ kind: 'coin', id: null, num: 600, lucky: false }],
  test: false,
  rank: null,
  ...patch,
});

const floor = (n: number, patch: Partial<TowerFloorDto> = {}): TowerFloorDto => ({
  floor: n,
  name: `守塔人${n}`,
  title: `称号${n}`,
  note: '来挑战吧',
  minLevel: n === 1 ? 1 : (n - 1) * 10 + 1,
  power: n * 100,
  maxTimes: 10,
  left: 10,
  unlocked: n === 1,
  mc: null,
  cost: n + 4,
  ...patch,
});

export const towerData = (patch: Partial<TowerDto> = {}): TowerDto => ({
  floors: [floor(1), floor(2), floor(3), floor(4)],
  power: 70,
  left: 5,
  dailyTotal: 5,
  tickets: 0,
  bestFloor: 0,
  strength: 100,
  level: 1,
  hour: 12,
  nightFloor: 3,
  openHour: 6,
  testCost: 1,
  ...patch,
});
export { floor as towerFloor };

export const rankData = (patch: Partial<RankDto> = {}): RankDto => ({
  week: '2026-09-28',
  weekEnd: '2026-10-04T16:00:00.000Z',
  slots: Array.from({ length: 15 }, (_, i) => ({ rank: i + 1, restId: null, name: null, level: null })),
  myRank: null,
  left: 10,
  spar: 0,
  strength: 100,
  rankTop: 8,
  rankGap: 3,
  duelStrength: 5,
  ...patch,
});

export const shopData = (patch: Partial<RenownShopDto> = {}): RenownShopDto => ({
  renown: 200,
  items: [
    { goodsId: 310, renown: 60, weeklyLimit: 10, bought: 8, rare: false, owned: false },
    { goodsId: 397, renown: 3000, weeklyLimit: 1, bought: 1, rare: true, owned: true },
    { goodsId: 460, renown: 3000, weeklyLimit: 1, bought: 0, rare: true, owned: false },
  ],
  ...patch,
});
```

`apps/web/src/components/tower/DuelResult.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import DuelResult from './DuelResult.vue';
import { duelResult } from './testData';

describe('DuelResult', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('胜负和声望；五项并排，赢的一项加粗；奖励', () => {
    const w = mount(DuelResult, { props: { result: duelResult() } });
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了，声望 +7');
    const first = w.findAll('tbody tr')[0]!.findAll('td');
    expect(first[0]!.text()).toBe('20.4');
    expect(first[0]!.classes()).toContain('fw-bold');
    expect(first[1]!.classes()).not.toContain('fw-bold');
    expect(w.text()).toContain('我的店（厨力 70）');
    expect(w.find('[data-testid="duel-awards"]').text()).toBe('得到 银币 600');
  });

  it('试打没有声望；赛厨榜写新名次；输了', () => {
    const test = mount(DuelResult, { props: { result: duelResult({ test: true, renown: 0, awards: [] }) } });
    expect(test.find('[data-testid="duel-headline"]').text()).toBe('试打：赢了');
    expect(test.find('[data-testid="duel-awards"]').exists()).toBe(false);
    const rank = mount(DuelResult, { props: { result: duelResult({ renown: 2, rank: 1 }) } });
    expect(rank.find('[data-testid="duel-headline"]').text()).toBe('你赢了，声望 +2，你现在是第 1 名');
    const lose = mount(DuelResult, { props: { result: duelResult({ win: false, renown: -2, awards: [] }) } });
    expect(lose.find('[data-testid="duel-headline"]').text()).toBe('你输了，声望 -2');
  });
});
```

`apps/web/src/components/tower/FloorPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FloorPanel from './FloorPanel.vue';
import { duelResult, towerData, towerFloor } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { towerChallenge: vi.fn() } }));

describe('FloorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.towerChallenge).mockResolvedValue(duelResult());
  });

  it('挑战后显示对决结果并通知刷新；试打按 test = true 调用', async () => {
    const w = mount(FloorPanel, { props: { data: towerData() } });
    await w.find('[data-testid="tc-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.towerChallenge).toHaveBeenCalledWith(1, false);
    expect(w.find('[data-testid="duel-result"]').exists()).toBe(true);
    expect(w.emitted('reload')).toHaveLength(1);
    await w.find('[data-testid="tp-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.towerChallenge).toHaveBeenLastCalledWith(1, true);
  });

  it('不能挑战时写明原因：等级不够、没打赢下一层、夜间、次数用完（试打仍可用）、体力不够', () => {
    const w = mount(FloorPanel, {
      props: {
        data: towerData({
          level: 15,
          hour: 3,
          floors: [towerFloor(1, { unlocked: true }), towerFloor(2, { unlocked: false }), towerFloor(3), towerFloor(4, { unlocked: true })],
        }),
      },
    });
    expect(w.find('[data-testid="block-2"]').text()).toBe('先打赢第 1 层');
    expect(w.find('[data-testid="block-3"]').text()).toBe('餐厅 21 级才能挑战');
    expect(w.find('[data-testid="block-4"]').text()).toBe('4 层以上 6 点以后才能挑战');
    expect(w.find('[data-testid="tc-4"]').attributes('disabled')).toBeDefined();
    const used = mount(FloorPanel, { props: { data: towerData({ left: 0 }) } });
    expect(used.find('[data-testid="block-1"]').text()).toBe('今天的挑战次数用完了');
    expect(used.find('[data-testid="tc-1"]').attributes('disabled')).toBeDefined();
    expect(used.find('[data-testid="tp-1"]').attributes('disabled')).toBeUndefined();
    const tired = mount(FloorPanel, { props: { data: towerData({ strength: 3 }) } });
    expect(tired.find('[data-testid="block-1"]').text()).toBe('体力不够（要 5）');
  });
});
```

`apps/web/src/components/tower/FriendDuel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FriendDuel from './FriendDuel.vue';
import { duelResult } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { duelInfo: vi.fn(), friendDuel: vi.fn() } }));

describe('FriendDuel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 10, spar: 0, strength: 100, duelStrength: 5 });
    vi.mocked(endpoints.friendDuel).mockResolvedValue(duelResult({ them: { ...duelResult().them, name: '乙店' } }));
  });

  it('写明今天还能切磋几次；切磋后显示结果并刷新次数', async () => {
    const w = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(endpoints.duelInfo).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="act-duel"]').text()).toBe('切磋（今天还能 10 次）');
    await w.find('[data-testid="act-duel"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendDuel).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="duel-result"]').text()).toContain('乙店');
    expect(endpoints.duelInfo).toHaveBeenCalledTimes(2);
  });

  it('次数用完、体力不够时灰掉并写明原因', async () => {
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 0, spar: 12, strength: 100, duelStrength: 5 });
    const w = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(w.find('[data-testid="act-duel"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="duel-block"]').text()).toBe('今天和它切磋的次数用完了');
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 3, spar: 0, strength: 2, duelStrength: 5 });
    const tired = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(tired.find('[data-testid="duel-block"]').text()).toBe('体力不够（要 5）');
  });
});
```

`apps/web/src/views/FriendRestView.test.ts`：
- `vi.mock` 的 `endpoints` 里加 `duelInfo: vi.fn(),`、`friendDuel: vi.fn(),`
- `beforeEach` 里加 `vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 10, spar: 0, strength: 100, duelStrength: 5 });`
- 末尾（最后一个 `});` 之前）加：

```ts
  it('好友店有"切磋"，蟹老板店没有', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="act-duel"]').exists()).toBe(true);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true }));
    const npc = await mountView();
    expect(npc.find('[data-testid="act-duel"]').exists()).toBe(false);
  });
```

`apps/web/src/i18n/zh-CN.test.ts` 末尾追加：

```ts
describe('厨塔的错误文案', () => {
  it('按 reason / what 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'floor_locked', minLevel: 11, needFloor: 1 })).toBe(
      '这一层还没解锁：餐厅等级要够，并且先打赢下一层',
    );
    expect(errorText('INVALID_STATE', { reason: 'rank_taken' })).toBe('这个名次已经有人了');
    expect(errorText('LIMIT_REACHED', { what: 'tower', max: 5 })).toBe(
      '今天的厨塔挑战次数用完了（5 次），可以在仓库用厨塔挑战券加次数',
    );
    expect(errorText('LIMIT_REACHED', { what: 'watchman', max: 1 })).toBe('他今天已经很累了（每人每天 1 次），明天再来');
    expect(errorText('LIMIT_REACHED', { what: 'weekly', max: 10 })).toBe('本周兑换已达上限（10 个）');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown', what: 'duel' })).toBe('声望为负时不能切磋');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown' })).toBe('声望为负时不能点赞');
    expect(errorText('NOT_ENOUGH', { kind: 'renown', need: 60, have: 50 })).toContain('声望');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/tower src/views/FriendRestView.test.ts src/i18n`
Expected: FAIL——`Failed to resolve import "./DuelResult.vue"` 等；FriendRestView 找不到 `act-duel`；文案测试不等

- [ ] **Step 3: 接口和文案**

`apps/web/src/api/endpoints.ts`：文件开头 `import type { ... } from '@dt/shared';` 的列表里加 `DuelInfoDto`、`DuelResultDto`、`RankDto`、`RenownShopDto`、`TowerDto`；`endpoints` 对象最后一项之后（结尾 `};` 之前）加：

```ts
  tower: () => api.get<TowerDto>('/api/v1/tower'),
  towerChallenge: (floor: number, test: boolean) =>
    api.post<DuelResultDto>('/api/v1/tower/challenge', { floor, test }),
  towerRank: () => api.get<RankDto>('/api/v1/tower/rank'),
  rankOccupy: (rank: number) => api.post<{ rank: number }>('/api/v1/tower/rank/occupy', { rank }),
  rankChallenge: (rank: number) => api.post<DuelResultDto>('/api/v1/tower/rank/challenge', { rank }),
  duelInfo: (restId: number) => api.get<DuelInfoDto>(`/api/v1/tower/duel/${restId}`),
  friendDuel: (restId: number) => api.post<DuelResultDto>('/api/v1/tower/duel', { restId }),
  renownShop: () => api.get<RenownShopDto>('/api/v1/tower/shop'),
  renownBuy: (goodsId: number, num: number) =>
    api.post<{ renown: number }>('/api/v1/tower/shop/buy', { goodsId, num }),
```

`apps/web/src/i18n/zh-CN.ts`：
1. `KIND` 里 `portions: '份数',` 下面加 `renown: '声望',`
2. `REQUIREMENT` 里的 `renown` 换成：

```ts
  renown: (p) =>
    p.what === 'duel'
      ? '声望为负时不能切磋'
      : p.need === undefined
        ? '声望为负时不能点赞'
        : `声望不够（偷菜要 ${String(p.need)} 点声望）`,
```

3. `LIMIT` 里 `lands: ...` 下面加：

```ts
  tower: (p) => `今天的厨塔挑战次数用完了（${String(p.max)} 次），可以在仓库用厨塔挑战券加次数`,
  watchman: (p) => `他今天已经很累了（每人每天 ${String(p.max)} 次），明天再来`,
  rank: (p) => `今天的赛厨榜挑战次数用完了（${String(p.max)} 次）`,
  duel: (p) => `今天和它切磋的次数用完了（${String(p.max)} 次）`,
  weekly: (p) => `本周兑换已达上限（${String(p.max)} 个）`,
```

4. `STATE` 里 `seed_not_sold: ...` 下面加：

```ts
  floor_locked: '这一层还没解锁：餐厅等级要够，并且先打赢下一层',
  tower_night: '4 层以上 6 点以后才能挑战',
  rank_taken: '这个名次已经有人了',
  rank_empty: '这个名次现在没人，可以直接占位',
  rank_not_better: '只能往前挑战或占位',
  rank_gap: '前 8 名只能由名次相差 3 以内的人挑战',
  npc: '不能和蟹老板切磋',
  not_on_sale: '这件商品本周不卖',
```

- [ ] **Step 4: 对决结果、厨塔面板、好友切磋**

`apps/web/src/components/tower/DuelResult.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { DuelResultDto } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { awardText } from '../bar/award';

const props = defineProps<{ result: DuelResultDto }>();
const catalog = useCatalogStore();
const ITEMS = ['色', '香', '味', '形', '养'];
const rows = computed(() =>
  ITEMS.map((label, i) => ({
    label,
    me: props.result.me.scores[i] ?? 0,
    them: props.result.them.scores[i] ?? 0,
  })),
);
const headline = computed(() => {
  const r = props.result;
  const head = r.test ? `试打：${r.win ? '赢了' : '输了'}` : r.win ? '你赢了' : '你输了';
  const renown = r.renown === 0 ? '' : `，声望 ${r.renown > 0 ? '+' : ''}${r.renown}`;
  const rank = r.win && r.rank !== null ? `，你现在是第 ${r.rank} 名` : '';
  return `${head}${renown}${rank}`;
});
const awards = computed(() => props.result.awards.map((a) => awardText(a, catalog)).join('、'));
</script>

<template>
  <div class="border rounded p-2 small mt-2" data-testid="duel-result">
    <div :class="['fw-bold mb-1', result.win ? 'text-success' : 'text-danger']" data-testid="duel-headline">
      {{ headline }}
    </div>
    <table class="table table-sm mb-1 text-center">
      <thead>
        <tr>
          <th></th>
          <th>{{ result.me.name }}（厨力 {{ result.me.power }}）</th>
          <th>{{ result.them.name }}（厨力 {{ result.them.power }}）</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.label">
          <th>{{ r.label }}</th>
          <td :class="{ 'text-success fw-bold': r.me > r.them }">{{ r.me }}</td>
          <td :class="{ 'text-success fw-bold': r.them > r.me }">{{ r.them }}</td>
        </tr>
        <tr>
          <th>总和</th>
          <td>{{ result.me.sum }}</td>
          <td>{{ result.them.sum }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="awards" data-testid="duel-awards">得到 {{ awards }}</div>
  </div>
</template>
```

`apps/web/src/components/tower/FloorPanel.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { DuelResultDto, TowerDto, TowerFloorDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const props = defineProps<{ data: TowerDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const last = ref<DuelResultDto | null>(null);

/** 不能挑战（test = 试打）的原因；空串表示可以 */
function blockOf(f: TowerFloorDto, test: boolean): string {
  const d = props.data;
  if (!f.unlocked) return d.level < f.minLevel ? `餐厅 ${f.minLevel} 级才能挑战` : `先打赢第 ${f.floor - 1} 层`;
  if (f.floor > d.nightFloor && d.hour < d.openHour)
    return `${d.nightFloor + 1} 层以上 ${d.openHour} 点以后才能挑战`;
  if (!test && d.left <= 0) return '今天的挑战次数用完了';
  if (!test && f.left <= 0) return '他今天已经累了';
  const cost = test ? d.testCost : f.cost;
  if (d.strength < cost) return `体力不够（要 ${cost}）`;
  return '';
}

async function go(f: TowerFloorDto, test: boolean) {
  if (busy.value || blockOf(f, test)) return;
  busy.value = true;
  try {
    last.value = await endpoints.towerChallenge(f.floor, test);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '挑战失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="mb-2" data-testid="tower-head">
      我的厨力 {{ data.power }} · 今日还能挑战 {{ data.left }}/{{ data.dailyTotal }} 次 · 挑战券
      {{ data.tickets }}（在仓库使用，当天多一次）· 体力 {{ data.strength }}
    </div>
    <DuelResult v-if="last" :result="last" />
    <div v-for="f in data.floors" :key="f.floor" class="border rounded p-2 mb-1" :data-testid="`floor-${f.floor}`">
      <div class="d-flex align-items-center">
        <b>{{ f.floor }} 层 · {{ f.name }}</b>
        <span class="dt-tag ms-2">{{ f.title }}</span>
        <span class="ms-auto text-muted">厨力 {{ f.power }}</span>
      </div>
      <div class="text-muted">
        「{{ f.note }}」{{ f.minLevel }} 级起；今天还能挑战他 {{ f.left }}/{{ f.maxTimes }} 次<span v-if="f.mc"
          >；今日特色菜 {{ catalog.mcName(f.mc.mcId) }}（每份 {{ f.mc.price }}）</span
        >
      </div>
      <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`tp-${f.floor}`"
          :disabled="busy || !!blockOf(f, true)"
          @click="go(f, true)"
        >
          试打（{{ data.testCost }} 体力）
        </button>
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`tc-${f.floor}`"
          :disabled="busy || !!blockOf(f, false)"
          @click="go(f, false)"
        >
          挑战（{{ f.cost }} 体力）
        </button>
        <span v-if="blockOf(f, false)" class="text-danger" :data-testid="`block-${f.floor}`">{{
          blockOf(f, false)
        }}</span>
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/components/tower/FriendDuel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelInfoDto, DuelResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const props = defineProps<{ restId: number }>();
const toast = useToastStore();
const info = ref<DuelInfoDto | null>(null);
const last = ref<DuelResultDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    info.value = await endpoints.duelInfo(props.restId);
  } catch (e) {
    toast.push(errorMessage(e, '读取切磋次数失败'), 'danger');
  }
}
const block = computed(() => {
  const i = info.value;
  if (!i) return '';
  if (i.left <= 0) return '今天和它切磋的次数用完了';
  if (i.strength < i.duelStrength) return `体力不够（要 ${i.duelStrength}）`;
  return '';
});
async function duel() {
  if (busy.value || !info.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.friendDuel(props.restId);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '切磋失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div data-testid="friend-duel">
    <button
      class="btn btn-sm btn-outline-success"
      data-testid="act-duel"
      :disabled="busy || !info || !!block"
      @click="duel"
    >
      切磋{{ info ? `（今天还能 ${info.left} 次）` : '' }}
    </button>
    <span v-if="block" class="small text-danger ms-1" data-testid="duel-block">{{ block }}</span>
    <DuelResult v-if="last" :result="last" />
  </div>
</template>
```

`apps/web/src/views/FriendRestView.vue`：
- 在 `import TableGrid from '../components/TableGrid.vue';` 下面加 `import FriendDuel from '../components/tower/FriendDuel.vue';`
- 在 `data-testid="act-bar"` 那个 `<div ...>...</div>` 整块结束之后加：

```vue
    <FriendDuel v-if="rest.isFriend && !rest.npc" :key="restId" :rest-id="restId" class="mb-2" />
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/tower src/views/FriendRestView.test.ts src/i18n`
Expected: PASS

Run: `pnpm --filter @dt/web typecheck`
Expected: 无报错

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/web/src/api/endpoints.ts apps/web/src/i18n apps/web/src/components/tower apps/web/src/views/FriendRestView.vue apps/web/src/views/FriendRestView.test.ts
git add apps/web/src
git commit -m "feat(web): duel result, tower floors panel and friend duels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 前端——赛厨榜、声望商店、厨塔页、路由、入口

**Files:**
- Create: `apps/web/src/components/tower/RankPanel.vue`、`RankPanel.test.ts`
- Create: `apps/web/src/components/tower/ShopPanel.vue`、`ShopPanel.test.ts`
- Create: `apps/web/src/views/TowerView.vue`、`TowerView.test.ts`
- Modify: `apps/web/src/router.ts`、`apps/web/src/views/MoreView.vue`、`apps/web/src/views/MoreView.test.ts`

**Interfaces:**
- Consumes: Task 9 的接口、`DuelResult`、`FloorPanel`、`testData`
- Produces: 路由 `/tower`（`name: 'tower'`，需要餐厅）；厨塔页标签 `tab-tower`、`tab-rank`、`tab-shop`，记在 `localStorage` 的 `dt_tower_tab`；赛厨榜 `my-rank`、`occupy-<名次>`、`rc-<名次>`；商店 `shop-renown`、`buy-<goodsId>`、`num-<goodsId>`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/tower/RankPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useSessionStore } from '../../stores/session';
import RankPanel from './RankPanel.vue';
import { duelResult, rankData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { towerRank: vi.fn(), rankOccupy: vi.fn(), rankChallenge: vi.fn() },
}));

const withSlots = (taken: Array<[number, number, string]>) =>
  rankData({
    slots: rankData().slots.map((s) => {
      const hit = taken.find(([r]) => r === s.rank);
      return hit ? { rank: s.rank, restId: hit[1], name: hit[2], level: 30 } : s;
    }),
  });

describe('RankPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 1,
    };
    vi.mocked(endpoints.rankOccupy).mockResolvedValue({ rank: 15 });
    vi.mocked(endpoints.rankChallenge).mockResolvedValue(duelResult({ renown: 2, rank: 10 }));
  });

  it('空位可以占；占完刷新', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue(rankData());
    const w = mount(RankPanel);
    await flushPromises();
    expect(w.find('[data-testid="my-rank"]').text()).toBe('未上榜');
    await w.find('[data-testid="occupy-15"]').trigger('click');
    await flushPromises();
    expect(endpoints.rankOccupy).toHaveBeenCalledWith(15);
    expect(endpoints.towerRank).toHaveBeenCalledTimes(2);
  });

  it('前 8 名不在范围内时灰掉并写明原因；第 10 名可以挑战，显示结果', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue(
      withSlots([
        [1, 5, '甲店'],
        [10, 6, '乙店'],
      ]),
    );
    const w = mount(RankPanel);
    await flushPromises();
    expect(w.find('[data-testid="rc-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-1"]').text()).toContain('前 8 名要在榜上、名次相差 3 以内才能挑战');
    expect(w.find('[data-testid="occupy-1"]').exists()).toBe(false);
    await w.find('[data-testid="rc-10"]').trigger('click');
    await flushPromises();
    expect(endpoints.rankChallenge).toHaveBeenCalledWith(10);
    expect(w.find('[data-testid="duel-headline"]').text()).toBe('你赢了，声望 +2，你现在是第 10 名');
  });

  it('自己的格子标"我"，排在我后面的不能挑战', async () => {
    vi.mocked(endpoints.towerRank).mockResolvedValue({
      ...withSlots([
        [3, 1, '我的店'],
        [5, 7, '丙店'],
      ]),
      myRank: 3,
    });
    const w = mount(RankPanel);
    await flushPromises();
    expect(w.find('[data-testid="slot-3"]').text()).toContain('我');
    expect(w.find('[data-testid="rc-5"]').exists()).toBe(false);
    expect(w.find('[data-testid="occupy-7"]').exists()).toBe(false);
    expect(w.find('[data-testid="occupy-2"]').exists()).toBe(true);
  });
});
```

`apps/web/src/components/tower/ShopPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ShopPanel from './ShopPanel.vue';
import { shopData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { renownShop: vi.fn(), renownBuy: vi.fn() } }));

describe('ShopPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.renownShop).mockResolvedValue(shopData());
    vi.mocked(endpoints.renownBuy).mockResolvedValue({ renown: 80 });
  });

  it('数量不超过 本周剩余 和 声望÷单价；兑换后刷新', async () => {
    const w = mount(ShopPanel);
    await flushPromises();
    expect(w.find('[data-testid="shop-renown"]').text()).toContain('200');
    await w.find('[data-testid="num-310"]').setValue('5');
    await w.find('[data-testid="buy-310"]').trigger('click');
    await flushPromises();
    expect(endpoints.renownBuy).toHaveBeenCalledWith(310, 2);
    expect(endpoints.renownShop).toHaveBeenCalledTimes(2);
  });

  it('雕像：已拥有、声望不够时灰掉并写明原因；没有数量输入', async () => {
    const w = mount(ShopPanel);
    await flushPromises();
    expect(w.find('[data-testid="num-397"]').exists()).toBe(false);
    expect(w.find('[data-testid="buy-397"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="item-397"]').text()).toContain('已拥有');
    expect(w.find('[data-testid="buy-460"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="item-460"]').text()).toContain('声望不够');
  });
});
```

`apps/web/src/views/TowerView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { towerData } from '../components/tower/testData';
import TowerView from './TowerView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { tower: vi.fn() } }));

const stubs = {
  FloorPanel: { template: '<p>floor-panel</p>', props: ['data'] },
  RankPanel: { template: '<p>rank-panel</p>' },
  ShopPanel: { template: '<p>shop-panel</p>' },
};

describe('TowerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.tower).mockResolvedValue(towerData());
  });

  it('默认厨塔标签并读取厨塔数据；切到赛厨榜并记住', async () => {
    const w = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(endpoints.tower).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('floor-panel');
    await w.find('[data-testid="tab-rank"]').trigger('click');
    expect(w.text()).toContain('rank-panel');
    expect(localStorage.getItem('dt_tower_tab')).toBe('rank');
    const again = mount(TowerView, { global: { stubs } });
    await flushPromises();
    expect(again.text()).toContain('rank-panel');
    await again.find('[data-testid="tab-shop"]').trigger('click');
    expect(again.text()).toContain('shop-panel');
  });

  it('厨塔面板要求刷新时重新读取', async () => {
    const w = mount(TowerView, {
      global: {
        stubs: {
          ...stubs,
          FloorPanel: {
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
    expect(endpoints.tower).toHaveBeenCalledTimes(2);
  });
});
```

`apps/web/src/views/MoreView.test.ts`：把 `it('有特色菜、神殿、菜园、酒吧、教室入口', ...)` 里的列表改成 `['特色菜', '神殿', '教室', '菜园', '酒吧', '厨塔']`，标题改成 `'有特色菜、神殿、菜园、酒吧、厨塔、教室入口'`。

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/tower src/views/TowerView.test.ts src/views/MoreView.test.ts`
Expected: FAIL——`Failed to resolve import "./RankPanel.vue"`、`"./ShopPanel.vue"`、`"./TowerView.vue"`；MoreView 找不到"厨塔"

- [ ] **Step 3: 赛厨榜面板**

`apps/web/src/components/tower/RankPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DuelResultDto, RankDto, RankSlotDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const toast = useToastStore();
const session = useSessionStore();
const data = ref<RankDto | null>(null);
const last = ref<DuelResultDto | null>(null);
const busy = ref(false);
const myId = computed(() => session.me?.restaurantId ?? null);

async function load() {
  try {
    data.value = await endpoints.towerRank();
  } catch (e) {
    toast.push(errorMessage(e, '读取赛厨榜失败'), 'danger');
  }
}
onMounted(load);

/** 在 s 前面（数字更大）或没上榜 */
const behind = (s: RankSlotDto) => data.value!.myRank === null || data.value!.myRank > s.rank;
const canOccupy = (s: RankSlotDto) => s.restId === null && behind(s);
const canChallenge = (s: RankSlotDto) => s.restId !== null && s.restId !== myId.value && behind(s);
function challengeBlock(s: RankSlotDto): string {
  const d = data.value!;
  if (d.left <= 0) return '今天的挑战次数用完了';
  if (s.rank <= d.rankTop && (d.myRank === null || d.myRank - s.rank > d.rankGap))
    return `前 ${d.rankTop} 名要在榜上、名次相差 ${d.rankGap} 以内才能挑战`;
  if (d.strength < d.duelStrength) return `体力不够（要 ${d.duelStrength}）`;
  return '';
}

async function act(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const occupy = (rank: number) =>
  act(async () => {
    await endpoints.rankOccupy(rank);
    toast.push(`占到了第 ${rank} 名`);
  }, '占位失败');
const challenge = (s: RankSlotDto) => {
  if (challengeBlock(s)) return;
  return act(async () => {
    last.value = await endpoints.rankChallenge(s.rank);
  }, '挑战失败');
};
</script>

<template>
  <div v-if="data" class="small">
    <div class="mb-2">
      我的名次 <b data-testid="my-rank">{{ data.myRank === null ? '未上榜' : `第 ${data.myRank} 名` }}</b> · 今日还能挑战
      {{ data.left }} 次 · 每次 {{ data.duelStrength }} 体力
      <div class="text-muted">每周一 0 点换新榜：第 1~3 名、4~8 名、9~15 名有名次礼包，前三名得厨神、厨圣、厨王</div>
    </div>
    <DuelResult v-if="last" :result="last" />
    <div
      v-for="s in data.slots"
      :key="s.rank"
      class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
      :data-testid="`slot-${s.rank}`"
    >
      <span style="width: 4em">第 {{ s.rank }} 名</span>
      <span class="flex-fill">
        <template v-if="s.restId !== null">{{ s.name }}（{{ s.level }} 级）</template>
        <span v-else class="text-muted">空</span>
        <span v-if="s.restId !== null && s.restId === myId" class="badge text-bg-success ms-1">我</span>
      </span>
      <button
        v-if="canOccupy(s)"
        class="btn btn-sm btn-outline-primary"
        :data-testid="`occupy-${s.rank}`"
        :disabled="busy"
        @click="occupy(s.rank)"
      >
        占位
      </button>
      <template v-else-if="canChallenge(s)">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`rc-${s.rank}`"
          :disabled="busy || !!challengeBlock(s)"
          @click="challenge(s)"
        >
          挑战
        </button>
        <span v-if="challengeBlock(s)" class="text-danger">{{ challengeBlock(s) }}</span>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 声望商店面板**

`apps/web/src/components/tower/ShopPanel.vue`：

```vue
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { RenownShopDto, RenownShopItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<RenownShopDto | null>(null);
const nums = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.renownShop();
  } catch (e) {
    toast.push(errorMessage(e, '读取声望商店失败'), 'danger');
  }
}
onMounted(load);

/** 这次最多能换几个 */
function maxOf(x: RenownShopItemDto): number {
  if (x.rare) return x.owned ? 0 : 1;
  return Math.max(0, Math.min(x.weeklyLimit - x.bought, Math.floor(data.value!.renown / x.renown)));
}
function blockOf(x: RenownShopItemDto): string {
  if (x.rare && x.owned) return '已拥有';
  if (x.bought >= x.weeklyLimit) return '本周已兑完';
  if (data.value!.renown < x.renown) return '声望不够';
  return '';
}
async function buy(x: RenownShopItemDto) {
  if (busy.value || blockOf(x)) return;
  const n = Math.max(1, Math.min(Math.floor(nums[x.goodsId] ?? 1), maxOf(x)));
  busy.value = true;
  try {
    await endpoints.renownBuy(x.goodsId, n);
    toast.push(`换到了 ${catalog.goodsName(x.goodsId)}×${n}`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="mb-2" data-testid="shop-renown">我的声望 {{ formatNum(data.renown) }}</div>
    <div class="text-muted mb-2">美味券常驻；雕像每周轮换，每人限拥有 1 个</div>
    <div
      v-for="x in data.items"
      :key="x.goodsId"
      class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
      :data-testid="`item-${x.goodsId}`"
    >
      <span class="flex-fill">
        {{ catalog.goodsName(x.goodsId) }}
        <span v-if="x.rare" class="badge text-bg-warning ms-1">限拥有 1 个</span>
        <span class="text-muted ms-1">{{ formatNum(x.renown) }} 声望 · 本周 {{ x.bought }}/{{ x.weeklyLimit }}</span>
      </span>
      <input
        v-if="!x.rare"
        v-model.number="nums[x.goodsId]"
        type="number"
        min="1"
        :max="Math.max(1, maxOf(x))"
        class="form-control form-control-sm"
        style="width: 70px"
        :data-testid="`num-${x.goodsId}`"
      />
      <button
        class="btn btn-sm btn-outline-success"
        :data-testid="`buy-${x.goodsId}`"
        :disabled="busy || !!blockOf(x)"
        @click="buy(x)"
      >
        兑换
      </button>
      <span v-if="blockOf(x)" class="text-danger">{{ blockOf(x) }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 厨塔页、路由、入口**

`apps/web/src/views/TowerView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { TowerDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import FloorPanel from '../components/tower/FloorPanel.vue';
import RankPanel from '../components/tower/RankPanel.vue';
import ShopPanel from '../components/tower/ShopPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'tower' | 'rank' | 'shop';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'tower', label: '厨塔' },
  { key: 'rank', label: '赛厨榜' },
  { key: 'shop', label: '声望商店' },
];
const KEY = 'dt_tower_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((x) => x.key === v) ? (v as Tab) : 'tower';
  } catch {
    return 'tower';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<TowerDto | null>(null);

async function load() {
  if (tab.value !== 'tower') return;
  try {
    data.value = await endpoints.tower();
  } catch (e) {
    toast.push(errorMessage(e, '读取厨塔失败'), 'danger');
  }
}
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
  void load();
});
onMounted(load);
</script>

<template>
  <h5>厨塔</h5>
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
  <template v-if="tab === 'tower'">
    <FloorPanel v-if="data" :data="data" @reload="load" />
  </template>
  <RankPanel v-else-if="tab === 'rank'" />
  <ShopPanel v-else />
</template>
```

`apps/web/src/router.ts`：在 `/bar` 那条路由之后加：

```ts
  {
    path: '/tower',
    name: 'tower',
    component: () => import('./views/TowerView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/views/MoreView.vue`：`base` 里 `{ to: '/bar', icon: 'bi-cup-straw', label: '酒吧' },` 下面加：

```ts
  { to: '/tower', icon: 'bi-building', label: '厨塔' },
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/tower src/views/TowerView.test.ts src/views/MoreView.test.ts`
Expected: PASS

Run: `pnpm --filter @dt/web typecheck`
Expected: 无报错

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm test`
Expected: 全部通过

```bash
npx prettier --write apps/web/src/components/tower apps/web/src/views/TowerView.vue apps/web/src/views/TowerView.test.ts apps/web/src/router.ts apps/web/src/views/MoreView.vue apps/web/src/views/MoreView.test.ts
git add apps/web/src
git commit -m "feat(web): tower page with cooking rank and renown shop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/tower.spec.ts`
- Modify: `docs/rules/收益与加成.md`（末尾加第 10 节）、`docs/deploy.md`（末尾加一节）

- [ ] **Step 1: 端到端测试**

`apps/web/e2e/tower.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('厨塔：试打 → 挑战 1 层 → 赛厨榜占位 → 声望商店兑换美味券', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 属性远高于 1 层守塔人（厨力 29），挑战必胜；声望 100
    await client.query(
      `update restaurant set strength = 100, renown = 100,
         attr_cook = 50, attr_cutting = 50, attr_fire = 50, attr_season = 30 where id = $1`,
      [restId],
    );
    // 只清掉端到端测试账号自己占的名次，免得一服的榜被以前的测试占满
    await client.query(
      `delete from tower_rank where rest_id in (
         select r.id from restaurant r join account a on a.id = r.account_id where a.email like '%@e2e.local')`,
    );

    await page.goto('/tower');
    await page.getByTestId('tab-tower').click();
    await page.getByTestId('tp-1').click();
    await expect(page.getByTestId('duel-headline')).toContainText('试打：赢了');
    await page.getByTestId('tc-1').click();
    await expect(page.getByTestId('duel-headline')).toContainText('你赢了，声望 +7');

    await page.getByTestId('tab-rank').click();
    await expect(page.getByTestId('my-rank')).toHaveText('未上榜');
    await page.locator('[data-testid^="occupy-"]').first().click();
    await expect(page.getByTestId('my-rank')).toContainText('名');
    await expect(page.getByTestId('my-rank')).not.toHaveText('未上榜');

    await page.getByTestId('tab-shop').click();
    await expect(page.getByTestId('shop-renown')).toContainText('107');
    await page.getByTestId('buy-310').click();
    await expect(page.getByTestId('shop-renown')).toContainText('47');
  } finally {
    await client.end();
  }
});
```

- [ ] **Step 2: 规则文档**

`docs/rules/收益与加成.md` 末尾追加：

```markdown

## 10. 厨塔（子项目 4C-2）

**厨力对决**（厨塔、赛厨榜、好友切磋共用）：双方各算色、香、味、形、养五项。
- 属性 = 加点 + 厨具 + 宝石（四项乘套装百分比）；挑战方的刀工、火候再乘套装的进攻加成，被挑战方乘防守加成；幸运 = 基础幸运 + 加成里的幸运值。
- 色 = 厨艺×0.7 + 刀工×0.3；香 = 厨艺×0.7 + 调味×0.5；味 = 火候×0.5 + 调味×0.5；形 = 火候×0.4 + 刀工×0.7；养 = 火候×0.2 + 调味×0.1 + 刀工×0.1 + 在售特色菜每份价值×0.6。
- 每项再加波动 (创意×0.4 + 1) × (正 1.1 / 负 −0.9) × 随机数；一半概率为正，没中时再按幸运率判一次。每项最低 0，保留 1 位小数。
- 赢 4 项以上，或赢 3 项且五项总和不低于对方，算胜。
- 厨力 = 厨艺 + 刀工 + 火候 + 调味 + 创意 + 幸运/2。

**厨塔**：10 层守塔人，属性按原版厨力校准（1 层 29 … 10 层 2603）。
- 解锁：餐厅等级够，且打赢过下一层。4 层以上 6 点以后才能挑战。
- 每天 5 次，每用一张厨塔挑战券多一次；每个守塔人每人每天还有次数上限（1~4 层 10 次，10 层 2 次）。
- 体力 层数 + 4；试打 1 体力，不计次数、没有奖励。
- 胜：声望 +(层数 + 6)，随机奖励"层数"次（奖励等级 层数 + 2）；负：声望 +6。
- 4~10 层守塔人每天 05:58 换一道特色菜，计入"养"。

**赛厨榜**：每区服每周 15 格。空位谁都能占；在榜上只能往前占。挑战排在前面的人：前 8 名要在榜上且名次差不超过 3；每天 10 次，体力 5。胜了交换名次、声望 +2，负了声望 +1。每周一 00:01 结算：第 1、2、3 名、第 4~8 名、第 9~15 名分别打开对应的名次礼包（前三名得厨神、厨圣、厨王勋章）。

**好友切磋**：要 1 星、声望不为负，同一好友每天 10 次，体力 5。
- 声望：对方厨力高于我 1.15 倍（以弱胜强）胜 +6、负 −2；低于我 0.7 倍胜 0、负 −3；其他胜 +5、负 −2。
- 今天切磋（含赛厨榜）满 20 次后胜利只给 +2，满 50 次后不给声望和奖励；以弱胜强不受影响。

**切磋奖励**（赛厨榜、好友切磋胜利时）：今天第 1~10 次 2 次随机奖励（等级 4），第 11~20 次 2 次（等级 2），之后 1 次（等级 2）。

**声望商店**：美味券 60 声望、每周限 10 个；雕像 3000（非洲复兴纪念碑 5000）声望，每周轮换 2 座，每人限拥有 1 个。
```

- [ ] **Step 3: 部署文档**

`docs/deploy.md` 末尾追加：

```markdown

## 厨塔（子项目 4C-2）

- 迁移 0012 新建 `tower_state`（每店打赢过的最高层）、`tower_watchman_mc`（守塔人当天的菜）、`tower_rank`（每区服每周的赛厨榜）
- 新功能开关 `features.tower`（默认开）。关闭后厨塔、赛厨榜、好友切磋、声望商店的接口返回"这个区服暂未开放该功能"，厨塔挑战券不能用，主线第 27 步和切磋支线跳过，两个定时任务跳过该区服
- worker 新任务：`tower-watchman`（每天 05:58 给 4~10 层守塔人换菜）、`tower-rank-week`（每周一 00:01 结算上一周赛厨榜）
- 数值在 `tuning.tower`（次数、体力、声望、切磋奖励档位、名次礼包、换菜时间）
- 守塔人来自配置包的 `dataset/tower_floors`，属性在构建时按原版厨力校准；声望商店从 `extra` 挪到正式字段 `renownShop`
- 活跃映射新增 `tower.rank` → "与好友赛厨"
```

- [ ] **Step 4: 本地跑端到端**

1. 停掉旧的 dev 进程：PowerShell `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tsx\\dist\\cli.mjs|vite\\bin\\vite.js' } | ForEach-Object { taskkill /T /F /PID $_.ProcessId }`
2. Run: `pnpm --filter @dt/config build` 然后 `pnpm --filter @dt/server migrate:dev`
   Expected: 执行 `0012_tower`
3. 后台启动 `pnpm dev`，等输出里出现 "became leader" 和 "Server listening"
4. Run: `pnpm --filter @dt/web e2e`
   Expected: 全部通过（含新的 `tower.spec.ts`）

- [ ] **Step 5: 验收并提交**

Run: `pnpm test`、`pnpm typecheck`、`pnpm lint`
Expected: 全部通过、无报错

```bash
npx prettier --write apps/web/e2e/tower.spec.ts docs/rules/收益与加成.md docs/deploy.md
git add apps/web/e2e/tower.spec.ts docs/rules/收益与加成.md docs/deploy.md
git commit -m "test(e2e): tower flow; docs: tower rules and deploy notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
