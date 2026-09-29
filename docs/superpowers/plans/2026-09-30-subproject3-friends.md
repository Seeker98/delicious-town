# 子项目 3「好友互动」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一区服的玩家能加好友、互访餐厅，完成白食、放 / 灭蟑螂、帮忙加油、翻橱、交换食材、点赞；每个区服有一家 NPC「蟹老板」；装扮（门、头像、公告栏、个性图标）；周奖励；主线第 8/9/14/19 步开放。

**Architecture:** 服务端新增 `core/pair.ts`（按 id 顺序锁两家店的双店操作 `runPairOp`）、`modules/friend/`（关系、读取、装扮、周奖励、路由）、`modules/interact/`（纯规则 + 白食、蟑螂、加油、翻橱、交换、点赞）、`modules/npc/`（蟹老板的创建、邀请、补货、餐桌结算）和迁移 0004。前端新增好友页、好友餐厅页、翻橱页、交换页、装扮页，自己的楼层页可以灭蟑螂和请走白食者。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、ioredis、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject3-friends-design.md`

## Global Constraints

- 所有写接口都用 POST，参数用 zod 校验；读接口 GET；新接口统一挂在 `/api/v1` 下（路径见各任务），由 `modules/friend/routes.ts` 的 `socialRoutes(game)` 注册
- 两家店的写操作一律走 `runPairOp`（按 restaurant.id 升序加锁）；只动自己店的走 `runOp`；功能名 `friend`
- 不新增错误码，只加一个 `NOT_FRIEND`。设计文档 §4.13 的错误名按下表落到现有错误码（前端 `i18n/zh-CN.ts` 按 reason 出文案）：

| 设计文档 | 实现 |
|---|---|
| TARGET_NOT_FOUND | `RESTAURANT_NOT_FOUND` 404 |
| TARGET_IS_SELF / TARGET_IS_NPC / TARGET_BANNED / TARGET_CLOSED | `INVALID_STATE` reason `target_self` / `target_npc` / `target_banned` / `target_closed` |
| EMAIL_NOT_VERIFIED / TARGET_EMAIL_NOT_VERIFIED | `EMAIL_NOT_VERIFIED`，params `{ who: 'me' }` 403 / `{ who: 'target' }` 400 |
| NOT_FRIEND | `NOT_FRIEND`（新增） |
| FRIEND_LIMIT | `LIMIT_REACHED` what `friends` / `target_friends` |
| ALREADY_FRIEND / THUMB_DONE | `ALREADY_DONE` params `{ what: 'friend' }` / `{ what: 'thumb' }` / `{ what: 'thumb_ip' }` |
| REQUEST_NOT_FOUND | `INVALID_STATE` reason `no_request` |
| AVATAR_REQUIRED / DINE_TOO_SHORT / RENOWN_NEGATIVE | `REQUIREMENT_NOT_MET` reason `avatar` / `dine_minutes`（params need）/ `renown` |
| ALREADY_DINING / NOT_DINING / DINER_PROTECTED / TABLE_OCCUPIED / NO_ROACH / OWN_ROACH / FRIEND_OIL_FULL / FLIP_SLOT_INVALID / FLIP_BLESSED / FOODS_LEVEL_MISMATCH / FOODS_LOCKED / DOOR_INVALID / AVATAR_INVALID | `INVALID_STATE` reason `already_dining` / `not_dining` / `diner_protected` / `table_occupied` / `no_roach` / `own_roach` / `friend_oil_full` / `bad_slot` / `blessed` / `level_mismatch` / `foods_locked` / `bad_look` / `bad_look` |
| DINE_DONE_TODAY / SEATS_FULL / ROACH_LIMIT / EXCHANGE_LIMIT / ICON_SHOW_LIMIT | `LIMIT_REACHED` what `dine` / `seats` / `roach_lay` / `exchange`、`exchange_total`、`exchange_taken` / `icons`（params 带 max） |
| STRENGTH_NOT_ENOUGH / COIN_NOT_ENOUGH / FOODS_NOT_ENOUGH | `NOT_ENOUGH` kind `strength` / `coin` / `foods` |
| FLIP_COOLING | `COOLDOWN` params `{ what: 'flip', until }` |
| NOTICE_TOO_LONG | `VALIDATION_FAILED`（zod max 200） |
| CUPBOARD_FULL | `CUPBOARD_FULL` |

- 每日计数键（`daily_counter`）：`dine.done`、`roach.lay`、`roach.laidOn`、`roach.kill`、`flip.times`、`flip.caught`、`flip.flipped`、`exchange.with:<restId>`、`exchange.total`、`exchange.taken`、`exchange.krab`、`thumbs.given`；游戏日一律 `gameDay(op.now)`
- 事件键（`emitAction`，驱动任务和活跃）：`roach.kill`、`roach.lay`、`friend.dineAndDash`、`friend.refuel`、`cupboard.flip`、`foods.exchange`、`thumbs.up`；被点赞方 `thumbs.received`
- 好友动态日志类型（写在**目标餐厅**的 `rest_log`，params 至少有 `by`、`byName`）：`dine.start`、`dine.expelled`、`roach.laid`、`roach.killed`、`friend.refuel`、`friend.flip`、`exchange`、`thumb`、`friend.apply`、`friend.accept`
- 流水来源（`op.source`）：`dine.start`、`dine.end`、`dine.expel`、`roach.lay`、`roach.kill`、`friend.refuel`、`cupboard.flip`、`foods.exchange`、`thumbs.up`、`rest.door`、`friend.weekly`；`runPairOp` 给两边的流水补上 `ref_rest_id` = 对方
- 界面文字全部中文；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 改了 `packages/config/data` 之后先跑 `pnpm --filter @dt/config build`（生成 `generated/bundle.json`，开发服务器用它；测试的 globalSetup 自己生成）

## 计划层面的裁定（相对设计文档）

1. 错误码按上表复用现有码（设计文档 §4.13 只是名字）——代价：前端文案按 reason 分派
2. `friend/list` 一次返回全部好友（最多 200），不分页——人数上限小，分页没有意义
3. 新表 `npc_invite`：蟹老板每家店只邀请一次，玩家拒绝或删掉蟹老板后不会每天再收到申请；单独成表而不是餐厅列，后台任务批量写邀请时不锁餐厅行（不会和玩家操作抢锁）
4. 蟹老板由周期任务 `npc-maintain`（每小时）和命令行 `shard ensure` 创建，不在迁移里用 SQL 建——开店默认值在配置里，SQL 拿不到；部署后最多一小时出现
5. 互动接口用默认限流规则，不单独设权重
6. 午夜蟑螂杀手的体力上限、神之一手的次数、激动的心、神灯、红内裤、点赞王、巫毒娃娃都读加成汇总里的键（`killRoachONightNS`、`killRoachODayNS`、`godHand`、`excitedHeart`、`freeEatExpRate`、`addStrengthRate`、`magicLamp`、`redPants`、`getStrengthRate`、`killRoachNoStrengthRate`、`flipCBNoStrengthRate`、`flipNoLostCoinRate`），数值来自道具 value；因此 tuning 里不再放这些数
7. "空桌" = `customer` 为 0 或 -3（被蟑螂药消灭）且没有蟑螂、没有白食者
8. 灭**自己店里**的蟑螂走 `runOp`，不要求验证邮箱——自然蟑螂人人都会遇到，未验证的玩家也必须能清掉；只有涉及别人店的操作才检查邮箱
9. 设计文档 §4.12 说 `AdminRestaurantDto` 加 `npc`：不加。后台玩家搜索已经排除系统账号，玩家详情页不会出现蟹老板

## Review Focus

1. **两个人同时在同一张空桌白食（或放蟑螂）**：只有一个成功，另一个得到 `INVALID_STATE table_occupied`，不是 500，桌子上只有一个白食者。→ Task 8 测试
2. **A 翻 B 的橱柜的同时 B 翻 A 的橱柜 / 互相交换**：都成功、不死锁。→ Task 3 测试
3. **白食开始后结算轮次照常跑**：白食桌不被结算覆盖，累计值增长；互动写的桌子状态不会被结算写回的旧值冲掉。→ Task 8 测试
4. **白食进行中好友被删除、或店主被封号**：白食者仍能结束，店主仍能请走。→ Task 8 测试
5. **公告栏里有换行以外的控制字符、超过 200 字、全是空白**：控制字符被去掉，超长返回 `VALIDATION_FAILED`，空白保存为空串。→ Task 13 测试

---

## 文件结构

```
packages/shared/src/errors.ts                   新增 NOT_FRIEND
packages/shared/src/schemas/friend.ts           互动接口的 zod body 和 DTO
packages/shared/src/schemas/restaurant.ts       TableDto 加 roachBy / freeloaderName / freeloaderSince；RestaurantDto 加 door / avatar
packages/shared/src/schemas/world.ts            CatalogDto.looks
packages/config/data/game/looks.json            门、头像、个性图标
packages/config/data/game/tuning.json           friend 段
packages/config/data/game/action_map.json       krab.shake → town
packages/config/src/{tuning,raw,types,build,source,ids}.ts
apps/server/src/db/migrations/0004_friends.ts、0004.test.ts、index.ts
apps/server/src/db/schema.ts
apps/server/src/core/pair.ts                    runPairOp、isFriend、feedLog
apps/server/src/core/tickets.ts                 美味券抽取（结算和互动共用）
apps/server/src/core/features.ts                加入 friend
apps/server/src/modules/settlement/tables.ts    抽出 dineAccrual
apps/server/src/modules/settlement/runner.ts    排除 NPC；每轮跑 NPC 餐桌
apps/server/src/modules/interact/
  rules.ts       纯函数：白食、灭蟑螂、放蟑螂、翻橱、交换、加油的数值
  tables.ts      读写餐桌、空桌判断
  dine.ts        白食开始、结束、请走、当前
  roach.ts       放、灭蟑螂
  refuel.ts      帮好友加油
  flip.ts        翻橱
  exchange.ts    交换食材
  thumbs.ts      点赞、一键回赞
  honor.ts       勋章延长 1 小时
apps/server/src/modules/friend/
  relations.ts   申请、处理、删除
  reads.ts       好友列表、申请列表、搜索、同街、详情、动态、今日点赞、橱柜位、可交换食材
  looks.ts       门、头像、公告栏、个性图标
  weekly.ts      周奖励、上周计数
  service.ts     createSocialService：组装以上
  routes.ts      socialRoutes
apps/server/src/modules/npc/
  npc.ts         ensureNpc、npcInvite、restockNpc、npcTableRound
  jobs.ts        npc-maintain、npc-restock
apps/server/test/game.ts                         newPair、befriend、setTables、tablesOf
apps/web/src/api/endpoints.ts                    互动接口
apps/web/src/stores/friends.ts                   待处理申请数（导航红点）
apps/web/src/components/BottomNav.vue            好友标签和红点
apps/web/src/components/TableGrid.vue            餐桌网格（自己的楼层页和好友餐厅页共用）
apps/web/src/components/admin/RestIcons.vue      后台个性图标
apps/web/src/views/FriendsView.vue               好友 / 申请 / 找好友 / 动态
apps/web/src/views/FriendRestView.vue            好友餐厅
apps/web/src/views/FriendFlipView.vue            翻橱
apps/web/src/views/FriendExchangeView.vue        交换食材
apps/web/src/views/RestLookView.vue              装扮
apps/web/src/views/RestFloorView.vue             灭蟑螂、请走
apps/web/src/views/RestaurantHomeView.vue        正在白食卡片
apps/web/e2e/friends.spec.ts
```

---

### Task 1: 配置——friend 数值、装扮列表、道具常量、功能映射

**Files:**
- Create: `packages/config/data/game/looks.json`
- Create: `packages/config/src/friend.test.ts`
- Modify: `packages/config/data/game/tuning.json`（加 `friend` 段）
- Modify: `packages/config/data/game/action_map.json`（`krab.shake` → `town`）
- Modify: `packages/config/src/tuning.ts`、`raw.ts`、`types.ts`、`build.ts`、`source.ts`、`ids.ts`
- Modify: `packages/shared/src/schemas/world.ts`（`CatalogDto.looks`）
- Modify: `apps/server/src/modules/world/service.ts`（目录带上 looks）

**Interfaces:**
- Produces: `Tuning['friend']`（结构见 Step 3）；`ConfigBundle.looks: Looks`；`GOODS.redPants / roachKiller / firecracker / lantern / fu / bangle / heartache / godsHand / thumbKing / magicLamp / excitedHeart / voodoo / townCare`；`LooksDto`、`CatalogDto.looks?`

- [ ] **Step 1: 写失败的测试** `packages/config/src/friend.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig } from './runtime';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('好友互动的配置', () => {
  it('装扮列表和 friend 数值能加载', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.looks.doors[0]).toEqual({ id: 0, name: '木门', coin: 0 });
    expect(bundle!.looks.avatars.length).toBeGreaterThanOrEqual(12);
    expect(bundle!.looks.icons.map((i) => i.key)).toContain('founder');
    expect(bundle!.tuning.friend.maxFriends).toBe(199);
    expect(bundle!.tuning.friend.npc.name).toBe('蟹老板');
  });

  it('摇钱袋归小镇玩法，蟑螂和好友归 friend', () => {
    const c = createGameConfig(buildBundle(source()).bundle!);
    expect(c.featureOfKey('krab.shake')).toBe('town');
    expect(c.featureOfKey('roach.kill')).toBe('friend');
    expect(c.featureOfKey('friends.count')).toBe('friend');
  });

  it('门 id 重复、0 号门收费、蟹老板的头像不存在时报错', () => {
    const src = source();
    const looks = structuredClone(src['game/looks']) as {
      doors: Array<{ id: number; name: string; coin: number }>;
    };
    looks.doors.push({ id: 1, name: '重复', coin: 1 });
    looks.doors[0]!.coin = 5;
    const tuning = structuredClone(src['game/tuning']) as { friend: { npc: { avatar: number } } };
    tuning.friend.npc.avatar = 999;
    const { errors } = buildBundle({ ...src, 'game/looks': looks, 'game/tuning': tuning });
    expect(errors).toContain('looks: duplicate door 1');
    expect(errors).toContain('looks: door 0 must be free');
    expect(errors).toContain('tuning.friend.npc.avatar 999 not in looks');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run packages/config/src/friend.test.ts`
Expected: FAIL（`bundle.looks` 为 undefined / tuning 里没有 friend）

- [ ] **Step 3: 实现**

`packages/config/data/game/looks.json`：

```json
{
  "doors": [
    { "id": 0, "name": "木门", "coin": 0 },
    { "id": 1, "name": "红漆门", "coin": 20000 },
    { "id": 2, "name": "玻璃门", "coin": 20000 },
    { "id": 3, "name": "竹门", "coin": 20000 },
    { "id": 4, "name": "铁艺门", "coin": 20000 },
    { "id": 5, "name": "圆拱门", "coin": 20000 },
    { "id": 6, "name": "海盗门", "coin": 20000 },
    { "id": 7, "name": "蟹黄堡门", "coin": 20000 }
  ],
  "avatars": [
    { "id": 1, "name": "小厨师" },
    { "id": 2, "name": "大厨" },
    { "id": 3, "name": "服务员" },
    { "id": 4, "name": "采购员" },
    { "id": 5, "name": "美食家" },
    { "id": 6, "name": "甜点师" },
    { "id": 7, "name": "面点师" },
    { "id": 8, "name": "烧烤师" },
    { "id": 9, "name": "调酒师" },
    { "id": 10, "name": "渔夫" },
    { "id": 11, "name": "园丁" },
    { "id": 12, "name": "蟹老板" }
  ],
  "icons": [
    { "key": "founder", "title": "开服元老", "desc": "开服第一周加入小镇" },
    { "key": "helper", "title": "热心帮手", "desc": "帮小镇找到了问题" },
    { "key": "tester", "title": "测试先锋", "desc": "参加了内测" },
    { "key": "champion", "title": "比赛冠军", "desc": "小镇活动的冠军" },
    { "key": "artist", "title": "小镇画家", "desc": "为小镇画了图" },
    { "key": "chef", "title": "金牌大厨", "desc": "厨艺出众" }
  ]
}
```

`packages/config/data/game/tuning.json` 末尾加一段（与 `world` 同级）：

```json
  "friend": {
    "requireVerifiedEmail": true,
    "maxFriends": 199,
    "dine": { "minMinutes": 30, "strengthPerHour": 20, "strengthMax": 100, "heartExpMul": 3, "heartStrengthMul": 1.5, "baseSeats": 1 },
    "roach": {
      "layBase": 3, "layLevelRate": 0.2, "layCoin": 5, "layExp": 5,
      "killCoin": 10, "killExp": 5, "killCoinLevelRate": 0.5, "killSelfRate": 1.5,
      "killStrength": { "self": 1, "friend": 2, "npc": 0 },
      "ticketRate": 0.1, "ticketMax": 3
    },
    "flip": {
      "baseSlots": 5, "slotsPerStar": 5, "coolHours": 22, "coolRandHours": 4, "npcCoolHours": 10,
      "cheapTimes": 100, "caughtCoinPerLevel": 100, "npcCaughtCoinPerStar": 10,
      "hitRate": 0.3, "blessedRate": 0.8, "handleFoodsRate": 0.9, "handleFoodsRatePerStar": 0.01, "luckDivisor": 3
    },
    "exchange": {
      "maxLevel": 5, "base": 14, "feeRate": 0.5, "lockedFeeMul": 2, "perDayTotalMul": 10, "takenBase": 10,
      "npcBase": 8, "stormCaughtRate": 0.5, "bangleBase": 0.3, "bangleFactor": 0.0006
    },
    "thumbs": { "rewardTimes": 10, "ticketMax": 2, "overRenown": -1, "strengthMax": 3 },
    "refuel": { "bigTank": 8000, "drawsPerChunk": 2 },
    "npc": {
      "name": "蟹老板", "level": 60, "star": 5, "tables": 32, "oil": 1000000000, "avatar": 12, "door": 7,
      "roachRate": 0.02, "restockKinds": 30, "restockNum": 5
    }
  }
```

`packages/config/data/game/action_map.json`：把 `"krab.shake": "friend"` 改成 `"krab.shake": "town"`。

`packages/config/src/tuning.ts`：在 `world` 之后加：

```ts
  friend: z.object({
    requireVerifiedEmail: z.boolean(),
    maxFriends: int.min(1),
    dine: z.object({
      minMinutes: int.min(0),
      strengthPerHour: int,
      strengthMax: int,
      heartExpMul: num,
      heartStrengthMul: num,
      baseSeats: int.min(0),
    }),
    roach: z.object({
      layBase: int,
      layLevelRate: num,
      layCoin: int,
      layExp: int,
      killCoin: int,
      killExp: int,
      killCoinLevelRate: num,
      killSelfRate: num,
      killStrength: z.object({ self: int, friend: int, npc: int }),
      ticketRate: num,
      ticketMax: int.min(1),
    }),
    flip: z.object({
      baseSlots: int.min(1),
      slotsPerStar: int,
      coolHours: num,
      coolRandHours: num,
      npcCoolHours: num,
      cheapTimes: int,
      caughtCoinPerLevel: int,
      npcCaughtCoinPerStar: int,
      hitRate: num,
      blessedRate: num,
      handleFoodsRate: num,
      handleFoodsRatePerStar: num,
      luckDivisor: z.number().positive(),
    }),
    exchange: z.object({
      maxLevel: int,
      base: int,
      feeRate: num,
      lockedFeeMul: num,
      perDayTotalMul: int,
      takenBase: int,
      npcBase: int,
      stormCaughtRate: num,
      bangleBase: num,
      bangleFactor: num,
    }),
    thumbs: z.object({ rewardTimes: int, ticketMax: int, overRenown: int, strengthMax: int.min(1) }),
    refuel: z.object({ bigTank: int.min(2), drawsPerChunk: int }),
    npc: z.object({
      name: z.string().min(1),
      level: int.min(1),
      star: int.min(0),
      tables: int.min(1),
      oil: int.min(1),
      avatar: int,
      door: int,
      roachRate: num,
      restockKinds: int.min(1),
      restockNum: int.min(1),
    }),
  }),
```

`packages/config/src/raw.ts` 末尾：

```ts
export const looksFile = z.object({
  doors: z.array(z.object({ id: int.min(0), name: z.string().min(1), coin: int.min(0) })).min(1),
  avatars: z.array(z.object({ id: int.min(1), name: z.string().min(1) })).min(1),
  icons: z.array(
    z.object({ key: z.string().regex(/^[a-z0-9_-]{1,32}$/), title: z.string().min(1), desc: z.string() }),
  ),
});
```

`packages/config/src/types.ts`：

```ts
export interface Looks {
  doors: Array<{ id: number; name: string; coin: number }>;
  avatars: Array<{ id: number; name: string }>;
  icons: Array<{ key: string; title: string; desc: string }>;
}
```

并在 `ConfigBundle` 里 `restaurantDefaults` 之后加 `looks: Looks;`。

`packages/config/src/source.ts`：`SOURCE_FILES` 里 `'game/action_map'` 之后加 `'game/looks'`。

`packages/config/src/build.ts`：
- `const actionMap = parse(...)` 之后加 `const looks = parse('game/looks', raw.looksFile);`
- 空值检查的条件里加 `!looks ||`
- "开店默认值"校验之后、`if (errors.length > 0) return` 之前加：

```ts
  // ---------- 装扮 ----------
  const doorIds = new Set<number>();
  for (const d of looks.doors) {
    if (doorIds.has(d.id)) errors.push(`looks: duplicate door ${d.id}`);
    doorIds.add(d.id);
  }
  if (looks.doors.find((d) => d.id === 0)?.coin !== 0) errors.push('looks: door 0 must be free');
  const avatarIds = new Set<number>();
  for (const a of looks.avatars) {
    if (avatarIds.has(a.id)) errors.push(`looks: duplicate avatar ${a.id}`);
    avatarIds.add(a.id);
  }
  const iconKeys = new Set<string>();
  for (const i of looks.icons) {
    if (iconKeys.has(i.key)) errors.push(`looks: duplicate icon ${i.key}`);
    iconKeys.add(i.key);
  }
  if (!avatarIds.has(tuning.friend.npc.avatar))
    errors.push(`tuning.friend.npc.avatar ${tuning.friend.npc.avatar} not in looks`);
  if (!doorIds.has(tuning.friend.npc.door))
    errors.push(`tuning.friend.npc.door ${tuning.friend.npc.door} not in looks`);
```

- `body` 里 `restaurantDefaults: defaults,` 之后加 `looks,`

`packages/config/src/ids.ts` 的 `GOODS` 里加：

```ts
  redPants: 100, // 红内裤
  roachKiller: 156, // 午夜蟑螂杀手（灭蟑能手）
  firecracker: 157, // 鞭炮
  lantern: 158, // 灯笼
  fu: 159, // 福
  bangle: 228, // 银手镯
  heartache: 250, // 痛心入骨
  godsHand: 251, // 神之一手
  thumbKing: 348, // 点赞王
  magicLamp: 389, // 神灯
  excitedHeart: 406, // 激动的心
  voodoo: 423, // 巫毒娃娃
  townCare: 459, // 镇长的关心
```

`packages/shared/src/schemas/world.ts`：

```ts
export interface LooksDto {
  doors: Array<{ id: number; name: string; coin: number }>;
  avatars: Array<{ id: number; name: string }>;
  icons: Array<{ key: string; title: string; desc: string }>;
}
```

`CatalogDto` 里加一行（旧版本缓存在浏览器里的目录没有这个字段，所以可选）：

```ts
  /** 门、头像、个性图标；旧缓存里没有 */
  looks?: LooksDto;
```

`apps/server/src/modules/world/service.ts` 的 `catalog()` 返回对象里加 `looks: d.config.bundle.looks,`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run packages/config/src/friend.test.ts && pnpm --filter @dt/config build`
Expected: PASS 3/3；输出 `config bundle <版本> -> .../generated/bundle.json`

- [ ] **Step 5: 全量测试、类型检查、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/config packages/shared/src/schemas/world.ts apps/server/src/modules/world/service.ts
git commit -m "feat(config): friend tuning, looks (doors, avatars, icons), goods ids; krab.shake belongs to town

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0004、表类型、NOT_FRIEND、桌子和餐厅 DTO

**Files:**
- Create: `apps/server/src/db/migrations/0004_friends.ts`
- Create: `apps/server/src/db/migrations/0004.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/schemas/restaurant.ts`（`TableDto`、`RestaurantDto`）
- Modify: `apps/server/src/modules/restaurant/reads.ts`（`tableDto` 接收名称表）
- Modify: `apps/server/src/modules/restaurant/rules.ts`（`toRestaurantDto` 输出 door、avatar）
- Modify: `apps/server/src/modules/restaurant/service.ts`（`floor` 带白食者名称）
- Modify: `apps/web/src/i18n/zh-CN.ts`（`NOT_FRIEND` 文案，否则 `Record<ErrorCode,…>` 类型检查失败）
- Modify: `apps/web/src/views/RestaurantHomeView.test.ts`（测试数据加 door、avatar）

**Interfaces:**
- Produces: 表 `friend`、`friend_request`、`dine_dash`、`cupboard_flip`、`thumb`、`rest_icon`、`npc_invite`；列 `account.is_system`、`restaurant.npc / door / avatar / notice`；`ErrorCode.NOT_FRIEND`；`tableDto(t: TableState, names?: ReadonlyMap<number, string>): TableDto`；`restNames(db, ids: number[]): Promise<Map<number, string>>`（`restaurant/reads.ts`）

- [ ] **Step 1: 写失败的测试** `apps/server/src/db/migrations/0004.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shardId: number;
let a: number;
let b: number;
beforeAll(async () => {
  shardId = await createShard(db);
  a = await createRestaurantRow(db, shardId, await createAccountRow(db));
  b = await createRestaurantRow(db, shardId, await createAccountRow(db));
});

describe('迁移 0004', () => {
  it('餐厅的新列有默认值', async () => {
    const r = await db
      .selectFrom('restaurant')
      .select(['npc', 'door', 'avatar', 'notice'])
      .where('id', '=', a)
      .executeTakeFirstOrThrow();
    expect(r).toEqual({ npc: false, door: 0, avatar: null, notice: '' });
  });

  it('每个区服最多一家 NPC', async () => {
    await db.updateTable('restaurant').set({ npc: true }).where('id', '=', a).execute();
    await expect(db.updateTable('restaurant').set({ npc: true }).where('id', '=', b).execute()).rejects.toThrow();
    await db.updateTable('restaurant').set({ npc: false }).where('id', '=', a).execute();
  });

  it('新表可以写入；thumb.day 读出为字符串；同一天同一 IP 不能给同一家点两次', async () => {
    await db.insertInto('friend').values([{ rest_id: a, friend_id: b }, { rest_id: b, friend_id: a }]).execute();
    await db.insertInto('friend_request').values({ from_rest: a, to_rest: b }).execute();
    await db
      .insertInto('dine_dash')
      .values({ diner_rest_id: a, host_rest_id: b, table_no: 1, started_at: new Date() })
      .execute();
    await db
      .insertInto('cupboard_flip')
      .values({ host_rest_id: b, slot_no: 1, by_rest_id: a, cool_until: new Date() })
      .execute();
    await db.insertInto('thumb').values({ day: '2026-09-30', from_rest: a, to_rest: b, ip: '1.2.3.4' }).execute();
    const t = await db.selectFrom('thumb').select('day').where('from_rest', '=', a).executeTakeFirstOrThrow();
    expect(t.day).toBe('2026-09-30');
    const c = await createRestaurantRow(db, shardId, await createAccountRow(db));
    await expect(
      db.insertInto('thumb').values({ day: '2026-09-30', from_rest: c, to_rest: b, ip: '1.2.3.4' }).execute(),
    ).rejects.toThrow();
    await db.insertInto('rest_icon').values({ rest_id: a, icon_key: 'founder' }).execute();
    await expect(db.insertInto('rest_icon').values({ rest_id: a, icon_key: 'founder' }).execute()).rejects.toThrow();
  });

  it('account.is_system 默认 false', async () => {
    const id = await createAccountRow(db);
    const r = await db.selectFrom('account').select('is_system').where('id', '=', id).executeTakeFirstOrThrow();
    expect(r.is_system).toBe(false);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/db/migrations/0004.test.ts`
Expected: FAIL（列 npc 不存在）

- [ ] **Step 3: 实现**

`apps/server/src/db/migrations/0004_friends.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table account add column is_system boolean not null default false`,
    sql`alter table restaurant add column npc boolean not null default false`,
    sql`alter table restaurant add column door smallint not null default 0`,
    sql`alter table restaurant add column avatar smallint`,
    sql`alter table restaurant add column notice text not null default ''`,
    sql`create unique index restaurant_npc_shard on restaurant (shard_id) where npc`,
    sql`create table friend (
      rest_id integer not null references restaurant(id) on delete cascade,
      friend_id integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (rest_id, friend_id)
    )`,
    sql`create index friend_friend on friend (friend_id)`,
    sql`create table friend_request (
      from_rest integer not null references restaurant(id) on delete cascade,
      to_rest integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (from_rest, to_rest)
    )`,
    sql`create index friend_request_to on friend_request (to_rest)`,
    sql`create table dine_dash (
      diner_rest_id integer primary key references restaurant(id) on delete cascade,
      host_rest_id integer not null references restaurant(id) on delete cascade,
      table_no integer not null,
      started_at timestamptz not null
    )`,
    sql`create index dine_dash_host on dine_dash (host_rest_id)`,
    sql`create table cupboard_flip (
      host_rest_id integer not null references restaurant(id) on delete cascade,
      slot_no integer not null,
      by_rest_id integer not null references restaurant(id) on delete cascade,
      cool_until timestamptz not null,
      primary key (host_rest_id, slot_no)
    )`,
    sql`create table thumb (
      day date not null,
      from_rest integer not null references restaurant(id) on delete cascade,
      to_rest integer not null references restaurant(id) on delete cascade,
      ip text,
      returned boolean not null default false,
      created_at timestamptz not null default now(),
      primary key (day, from_rest, to_rest)
    )`,
    sql`create index thumb_to on thumb (day, to_rest)`,
    sql`create unique index thumb_ip on thumb (day, ip, to_rest) where ip is not null`,
    sql`create table rest_icon (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      icon_key text not null,
      shown boolean not null default false,
      granted_at timestamptz not null default now(),
      granted_by integer references account(id),
      unique (rest_id, icon_key)
    )`,
    sql`create table npc_invite (
      rest_id integer primary key references restaurant(id) on delete cascade,
      created_at timestamptz not null default now()
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['npc_invite', 'rest_icon', 'thumb', 'cupboard_flip', 'dine_dash', 'friend_request', 'friend']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`drop index if exists restaurant_npc_shard`.execute(db);
  for (const c of ['notice', 'avatar', 'door', 'npc']) {
    await sql`alter table restaurant drop column ${sql.id(c)}`.execute(db);
  }
  await sql`alter table account drop column is_system`.execute(db);
}
```

`apps/server/src/db/migrations/index.ts`：加 `import * as m0004 from './0004_friends';` 和 `'0004_friends': m0004,`。

`apps/server/src/db/schema.ts`：
- `AccountTable` 加 `is_system: Default<boolean>;`
- `RestaurantTable` 在 `state_reason` 之后加：

```ts
  npc: Default<boolean>;
  door: Default<number>;
  /** null = 没设置头像（不能白食） */
  avatar: Nullable<number>;
  notice: Default<string>;
```

- 新表类型（放在 `StatDailyTable` 之后）并加进 `DB`：

```ts
export interface FriendTable {
  rest_id: number;
  friend_id: number;
  created_at: TsDefault;
}

export interface FriendRequestTable {
  from_rest: number;
  to_rest: number;
  created_at: TsDefault;
}

export interface DineDashTable {
  diner_rest_id: number;
  host_rest_id: number;
  table_no: number;
  started_at: Ts;
}

export interface CupboardFlipTable {
  host_rest_id: number;
  slot_no: number;
  by_rest_id: number;
  cool_until: Ts;
}

export interface ThumbTable {
  /** YYYY-MM-DD（游戏日） */
  day: string;
  from_rest: number;
  to_rest: number;
  ip: Nullable<string>;
  returned: Default<boolean>;
  created_at: TsDefault;
}

/** 蟹老板已经邀请过的店（每家只邀请一次） */
export interface NpcInviteTable {
  rest_id: number;
  created_at: TsDefault;
}

export interface RestIconTable {
  id: Generated<number>;
  rest_id: number;
  icon_key: string;
  shown: Default<boolean>;
  granted_at: TsDefault;
  granted_by: Nullable<number>;
}
```

`DB` 里加：`friend: FriendTable; friend_request: FriendRequestTable; dine_dash: DineDashTable; cupboard_flip: CupboardFlipTable; thumb: ThumbTable; rest_icon: RestIconTable; npc_invite: NpcInviteTable;`

`packages/shared/src/errors.ts`：在 `INVALID_STATE` 之前加 `NOT_FRIEND: 'NOT_FRIEND',`。

`apps/web/src/i18n/zh-CN.ts` 的 `TEXT` 里加 `NOT_FRIEND: '你们还不是好友',`。

`packages/shared/src/schemas/restaurant.ts`：`TableDto` 改成：

```ts
export interface TableDto {
  no: number;
  floor: number;
  /** 顾客类型（规格书 01 §1.4），0 = 空桌 */
  customer: number;
  roach?: boolean;
  /** 放蟑螂的店；自然产生的为 null */
  roachBy?: number | null;
  freeloaderRestId?: number;
  freeloaderName?: string;
  /** 白食开始时间 */
  freeloaderSince?: string;
  last?: TableResultDto;
}
```

`RestaurantDto` 在 `isPlanktonHost` 之后加：

```ts
  door: number;
  /** null = 没设置头像 */
  avatar: number | null;
```

`apps/server/src/modules/restaurant/reads.ts`：`tableDto` 改成（并新增 `restNames`）：

```ts
export function tableDto(t: TableState, names?: ReadonlyMap<number, string>): TableDto {
  return {
    no: t.no,
    floor: t.floor,
    customer: t.customer,
    ...(t.roach ? { roach: true, roachBy: t.roach.by } : {}),
    ...(t.freeloader
      ? {
          freeloaderRestId: t.freeloader.restId,
          freeloaderSince: t.freeloader.since,
          ...(names?.has(t.freeloader.restId) ? { freeloaderName: names.get(t.freeloader.restId)! } : {}),
        }
      : {}),
    ...(t.last ? { last: t.last } : {}),
  };
}

/** 一批餐厅的名称 */
export async function restNames(db: Kysely<DB>, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.selectFrom('restaurant').select(['id', 'name']).where('id', 'in', ids).execute();
  return new Map(rows.map((r) => [r.id, r.name]));
}
```

`apps/server/src/modules/restaurant/rules.ts` 的 `toRestaurantDto` 返回对象里加 `door: r.door, avatar: r.avatar,`。

`apps/server/src/modules/restaurant/service.ts` 的 `floor` 改成：

```ts
    async floor(restId: number): Promise<TableDto[]> {
      const r = await d.db
        .selectFrom('restaurant_tables')
        .select('tables')
        .where('rest_id', '=', restId)
        .executeTakeFirstOrThrow();
      const ids = r.tables.flatMap((t) => (t.freeloader ? [t.freeloader.restId] : []));
      const names = await restNames(d.db, ids);
      return r.tables.map((t) => tableDto(t, names));
    },
```

（`restNames` 从 `./reads` 导入。）

`apps/web/src/views/RestaurantHomeView.test.ts` 的餐厅测试数据里 `isPlanktonHost` 之后加 `door: 0, avatar: null,`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/db/migrations/0004.test.ts apps/server/src/modules/restaurant`
Expected: PASS

- [ ] **Step 5: 全量测试、类型检查、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/server/src/db apps/server/src/modules/restaurant packages/shared apps/web/src/i18n/zh-CN.ts apps/web/src/views/RestaurantHomeView.test.ts
git commit -m "feat(db): migration 0004 for friends, dine-and-dash, flips, thumbs, icons; NOT_FRIEND; table and restaurant dto fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 双店操作 runPairOp 和测试工具

**Files:**
- Create: `apps/server/src/core/pair.ts`
- Create: `apps/server/src/core/pair.test.ts`
- Modify: `apps/server/test/game.ts`（`newPair`、`befriend`、`setTables`、`tablesOf`）

**Interfaces:**
- Consumes: `withRestaurants(db, ids, fn)`（`db/tx.ts`）、`createOp`、`flushOp`、`restLog`（`core/op.ts`）
- Produces:

```ts
export interface PairOp { me: Op; them: Op }
export interface PairOptions { feature: string; source: string; friend: 'required' | 'none'; lenient?: boolean }
export function runPairOp<T>(deps: GameDeps, ctx: RestCtx, targetRestId: number, opts: PairOptions, fn: (p: PairOp) => Promise<T>): Promise<OpResult<T>>;
export function isFriend(db: Kysely<DB>, restId: number, friendId: number): Promise<boolean>;
export function feedLog(p: PairOp, type: string, params?: Record<string, unknown>): void;
// test/game.ts
export function newPair(t: TestGame, a?: NewRestaurantOptions, b?: NewRestaurantOptions): Promise<[RestCtx, RestCtx]>;
export function befriend(t: TestGame, a: number, b: number): Promise<void>;
export function setTables(t: TestGame, restId: number, tables: TableState[]): Promise<void>;
export function tablesOf(t: TestGame, restId: number): Promise<TableState[]>;
```

- [ ] **Step 1: 测试工具** 在 `apps/server/test/game.ts` 末尾加（`TableState` 从 `../src/db/schema` 导入）：

```ts
/** 同一区服、都已验证邮箱的两家店；b 默认和 a 同区服 */
export async function newPair(
  t: TestGame,
  a: NewRestaurantOptions = {},
  b: NewRestaurantOptions = {},
): Promise<[RestCtx, RestCtx]> {
  const x = await newRestaurant(t, { verified: true, ...a });
  const y = await newRestaurant(t, { verified: true, shardId: x.shardId, ...b });
  return [x, y];
}

/** 直接写两条好友关系 */
export async function befriend(t: TestGame, a: number, b: number): Promise<void> {
  await t.db
    .insertInto('friend')
    .values([
      { rest_id: a, friend_id: b },
      { rest_id: b, friend_id: a },
    ])
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function setTables(t: TestGame, restId: number, tables: TableState[]): Promise<void> {
  await t.db
    .updateTable('restaurant_tables')
    .set({ tables: JSON.stringify(tables) })
    .where('rest_id', '=', restId)
    .execute();
}

export async function tablesOf(t: TestGame, restId: number): Promise<TableState[]> {
  const r = await t.db
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', restId)
    .executeTakeFirstOrThrow();
  return r.tables;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/core/pair.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { failRestLog } from '../../test/fixtures';
import { befriend, createTestGame, newPair, newRestaurant, restRow, type TestGame } from '../../test/game';
import { feedLog, runPairOp, type PairOptions } from './pair';
import { gainCoin, spendCoin } from './resources';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const opts: PairOptions = { feature: 'friend', source: 'test.pair', friend: 'required' };

describe('runPairOp', () => {
  it('两边一起写回；流水互相记 ref_rest_id；动态写在对方日志里', async () => {
    const [a, b] = await newPair(t, { patch: { coin: 100 } }, { patch: { coin: 0 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    const r = await runPairOp(t.game.deps, a, b.restaurantId, opts, async (p) => {
      spendCoin(p.me, 30);
      gainCoin(p.them, 30);
      feedLog(p, 'test.feed', { x: 1 });
      return 'ok';
    });
    expect(r.data).toBe('ok');
    expect((await restRow(t, a.restaurantId)).coin).toBe(70);
    expect((await restRow(t, b.restaurantId)).coin).toBe(30);
    const led = await t.db
      .selectFrom('ledger')
      .select(['rest_id', 'ref_rest_id', 'delta'])
      .where('source', '=', 'test.pair')
      .where('rest_id', 'in', [a.restaurantId, b.restaurantId])
      .orderBy('rest_id')
      .execute();
    expect(led).toEqual([
      { rest_id: a.restaurantId, ref_rest_id: b.restaurantId, delta: -30 },
      { rest_id: b.restaurantId, ref_rest_id: a.restaurantId, delta: 30 },
    ]);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', b.restaurantId)
      .where('type', '=', 'test.feed')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ by: a.restaurantId, x: 1 });
  });

  it('一方写入失败时两边都回滚', async () => {
    const [a, b] = await newPair(t, { patch: { coin: 100 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    const restore = await failRestLog(t.db, b.restaurantId);
    try {
      await expect(
        runPairOp(t.game.deps, a, b.restaurantId, opts, async (p) => {
          spendCoin(p.me, 30);
          feedLog(p, 'test.feed');
        }),
      ).rejects.toThrow();
    } finally {
      await restore();
    }
    expect((await restRow(t, a.restaurantId)).coin).toBe(100);
  });

  it('不是好友、对自己、跨区服、对方不存在、对方被封、对方未验证邮箱都拒绝', async () => {
    const [a, b] = await newPair(t);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'NOT_FRIEND',
    });
    await expect(runPairOp(t.game.deps, a, a.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      params: { reason: 'target_self' },
    });
    const other = await newRestaurant(t, { verified: true });
    await expect(runPairOp(t.game.deps, a, other.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
    });
    await expect(runPairOp(t.game.deps, a, 2_000_000_000, opts, async () => 1)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
    });
    await befriend(t, a.restaurantId, b.restaurantId);
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', b.accountId).execute();
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      params: { reason: 'target_banned' },
    });
    // lenient：结束白食、请走时对方被封也放行
    await expect(
      runPairOp(t.game.deps, a, b.restaurantId, { ...opts, lenient: true }, async () => 1),
    ).resolves.toMatchObject({ data: 1 });
    const c = await newRestaurant(t, { shardId: a.shardId });
    await befriend(t, a.restaurantId, c.restaurantId);
    await expect(runPairOp(t.game.deps, a, c.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      params: { who: 'target' },
    });
  });

  it('我未验证邮箱时拒绝；区服关闭 requireVerifiedEmail 后放行', async () => {
    const a = await newRestaurant(t);
    const b = await newRestaurant(t, { shardId: a.shardId });
    await befriend(t, a.restaurantId, b.restaurantId);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      params: { who: 'me' },
    });
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: a.shardId,
        override: JSON.stringify({ tuning: { friend: { requireVerifiedEmail: false } } }),
      })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).resolves.toMatchObject({
      data: 1,
    });
  });

  it('区服关闭 friend 功能时返回 FEATURE_DISABLED（设计文档 §7）', async () => {
    const [a, b] = await newPair(t);
    await befriend(t, a.restaurantId, b.restaurantId);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ features: { friend: false } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('A、B 同时互相操作不会死锁（Review Focus 2）', async () => {
    const [a, b] = await newPair(t, { patch: { coin: 1000 } }, { patch: { coin: 1000 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    const move = (from: typeof a, to: number) =>
      runPairOp(t.game.deps, from, to, opts, async (p) => {
        spendCoin(p.me, 1);
        gainCoin(p.them, 1);
      });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? move(a, b.restaurantId) : move(b, a.restaurantId))),
    );
    expect((await restRow(t, a.restaurantId)).coin).toBe(1000);
    expect((await restRow(t, b.restaurantId)).coin).toBe(1000);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/core/pair.test.ts`
Expected: FAIL（找不到模块 `./pair`）

- [ ] **Step 4: 实现** `apps/server/src/core/pair.ts`

```ts
import type { Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { withRestaurants } from '../db/tx';
import type { DB } from '../db/schema';
import { AppError } from '../http/errors';
import type { GameDeps, RestCtx } from './deps';
import { invalidState } from './errors';
import { createOp, flushOp, restLog, type Op, type OpResult } from './op';

/** 双店操作：me 是发起人（会话里的店），them 是目标店 */
export interface PairOp {
  me: Op;
  them: Op;
}

export interface PairOptions {
  feature: string;
  source: string;
  /** required：对方必须是我的好友 */
  friend: 'required' | 'none';
  /** 结束白食、请走：对方被封或未验证邮箱也放行（设计文档 裁定 7、§6 边界） */
  lenient?: boolean;
}

export async function isFriend(db: Kysely<DB>, restId: number, friendId: number): Promise<boolean> {
  const r = await db
    .selectFrom('friend')
    .select('rest_id')
    .where('rest_id', '=', restId)
    .where('friend_id', '=', friendId)
    .executeTakeFirst();
  return r !== undefined;
}

/**
 * 同时改两家店（设计文档 §4.1）：一个事务里按 id 升序锁两家，锁后做公共检查，
 * 两份快照一起写回；任何异常整体回滚。结算每次只锁一家，固定顺序保证不死锁
 */
export async function runPairOp<T>(
  deps: GameDeps,
  ctx: RestCtx,
  targetRestId: number,
  opts: PairOptions,
  fn: (p: PairOp) => Promise<T>,
): Promise<OpResult<T>> {
  if (targetRestId === ctx.restaurantId) throw invalidState('target_self');
  const settings = await deps.shards.ensureFeature(ctx.shardId, opts.feature);
  return withRestaurants(deps.db, [ctx.restaurantId, targetRestId], async (tx, rests) => {
    const meRow = rests.get(ctx.restaurantId)!;
    const themRow = rests.get(targetRestId)!;
    if (themRow.shard_id !== meRow.shard_id)
      throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId: targetRestId });
    const accounts = await tx
      .selectFrom('account')
      .select(['id', 'banned_at', 'email_verified_at'])
      .where('id', 'in', [meRow.account_id, themRow.account_id])
      .execute();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const meAcc = byId.get(meRow.account_id)!;
    const themAcc = byId.get(themRow.account_id)!;
    const t = settings.tuning.friend;
    if (meAcc.banned_at) throw new AppError(ErrorCode.ACCOUNT_BANNED, 403);
    if (t.requireVerifiedEmail && meAcc.email_verified_at === null)
      throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
    if (!opts.lenient) {
      if (themAcc.banned_at) throw invalidState('target_banned');
      if (t.requireVerifiedEmail && !themRow.npc && themAcc.email_verified_at === null)
        throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 400, { who: 'target' });
    }
    if (opts.friend === 'required' && !(await isFriend(tx, meRow.id, themRow.id)))
      throw new AppError(ErrorCode.NOT_FRIEND, 400);
    const me = createOp(deps, tx, meRow, settings, { source: opts.source, ctx });
    const them = createOp(deps, tx, themRow, settings, { source: opts.source, now: me.now, rng: me.rng });
    const data = await fn({ me, them });
    for (const e of me.ledger) e.refRestId ??= themRow.id;
    for (const e of them.ledger) e.refRestId ??= meRow.id;
    await flushOp(me);
    await flushOp(them);
    return { data, events: me.events };
  });
}

/** 在对方的个人日志里记一条"谁对我做了什么"（好友动态） */
export function feedLog(p: PairOp, type: string, params: Record<string, unknown> = {}): void {
  restLog(p.them, type, { by: p.me.rest.id, byName: p.me.rest.name, ...params });
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/core/pair.test.ts`
Expected: PASS 6/6

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/server/src/core/pair.ts apps/server/src/core/pair.test.ts apps/server/test/game.ts
git commit -m "feat(server): runPairOp locks two restaurants in id order with shared checks; feed log helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: 纯规则、餐桌工具、美味券抽取、抽出白食累计函数

**Files:**
- Create: `apps/server/src/modules/interact/rules.ts`
- Create: `apps/server/src/modules/interact/rules.test.ts`
- Create: `apps/server/src/modules/interact/tables.ts`
- Create: `apps/server/src/core/tickets.ts`
- Create: `apps/server/src/core/tickets.test.ts`
- Modify: `apps/server/src/modules/settlement/tables.ts`（抽出 `dineAccrual`）
- Modify: `apps/server/src/modules/settlement/settle.ts`（美味券改用 `dtTicketDraws`）

**Interfaces:**
- Produces（`interact/rules.ts`，`F = Tuning['friend']`）：

```ts
export function dineStrength(hours: number, heart: boolean, t: F['dine']): number;
export function dineEndReward(acc: { coin: number; exp: number }, hours: number, agg: Record<string, number>, t: F['dine']): { coin: number; exp: number; strength: number };
export function expelReward(acc: { coin: number; exp: number }, hours: number, dinerAgg: Record<string, number>, t: F['dine']): { hostCoin: number; dinerLoss: number; dinerExp: number; dinerStrength: number };
export function layReward(level: number, t: F['roach']): { coin: number; exp: number };
export type KillPlace = 'self' | 'friend' | 'npc';
export function killStrength(place: KillPlace, agg: Record<string, number>, hour: number, t: F['roach']): number;
export function killReward(level: number, place: KillPlace, agg: Record<string, number>, t: F['roach']): { coin: number; exp: number };
export function flipSlots(star: number, t: F['flip']): number;
export function flipCoolMs(npc: boolean, rng: Rng, t: F['flip']): number;
export function caughtCoin(level: number, star: number, npc: boolean, rng: Rng, t: F['flip']): number;
export function exchangeFee(food: { coin: number; odds: number }, locked: boolean, t: F['exchange']): number;
export function bangleRate(level: number, odds: number, t: F['exchange']): number;
export function exchangeLimits(myStar: number, theirStar: number, t: F['exchange']): { perFriend: number; total: number; taken: number; npc: number };
export function refuelDraws(added: number, oilMax: number, t: F['refuel']): number;
```

- Produces（`interact/tables.ts`）：`readTables(op: Op): Promise<TableState[]>`、`writeTables(op: Op, tables: TableState[]): Promise<void>`、`findTable(tables: TableState[], no: number): TableState`（找不到抛 `INVALID_STATE no_table`）、`isEmptyTable(t: TableState): boolean`、`clearTable(t: TableState): TableState`
- Produces（`core/tickets.ts`）：`dtTicketDraws(times: number, luckRate: number, holiday: number, t: Tuning['settlement'], rng: Rng): { num: number; lucky: number }`、`drawDtTickets(op: Op, times: number): Promise<number>`
- Produces（`settlement/tables.ts`）：`dineAccrual(f: { level: number; since: string }, now: Date, star: number, base: { oilBase: number; coinBase: number; expBase: number }, rng: Rng): { oil: number; exp: number; loss: number }`

- [ ] **Step 1: 写失败的测试** `apps/server/src/modules/interact/rules.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { dineAccrual } from '../settlement/tables';
import {
  bangleRate,
  caughtCoin,
  dineEndReward,
  dineStrength,
  exchangeFee,
  exchangeLimits,
  expelReward,
  flipCoolMs,
  flipSlots,
  killReward,
  killStrength,
  layReward,
  refuelDraws,
} from './rules';
import { clearTable, isEmptyTable } from './tables';

const f = testConfig().tuning.friend;

describe('白食（规格书 13 §13.3）', () => {
  it('体力 = min(整小时 × 20, 100)，激动的心 ×1.5', () => {
    expect(dineStrength(0.9, false, f.dine)).toBe(0);
    expect(dineStrength(2.5, false, f.dine)).toBe(40);
    expect(dineStrength(9, false, f.dine)).toBe(100);
    expect(dineStrength(2, true, f.dine)).toBe(60);
  });
  it('自己结束：银币照拿，经验有激动的心 ×3', () => {
    expect(dineEndReward({ coin: 100, exp: 50 }, 2, {}, f.dine)).toEqual({ coin: 100, exp: 50, strength: 40 });
    expect(dineEndReward({ coin: 100, exp: 50 }, 2, { excitedHeart: 1 }, f.dine)).toEqual({
      coin: 100,
      exp: 150,
      strength: 60,
    });
  });
  it('被请走：店主 2 倍，白食者赔银币；没有激动的心不得经验（设计文档 裁定 3）', () => {
    expect(expelReward({ coin: 100, exp: 50 }, 1, {}, f.dine)).toEqual({
      hostCoin: 200,
      dinerLoss: 100,
      dinerExp: 0,
      dinerStrength: 20,
    });
    expect(expelReward({ coin: 100, exp: 50 }, 1, { excitedHeart: 1 }, f.dine).dinerExp).toBe(150);
  });
  it('每轮累计（规格书 01 §1.5B）：7 小时以内 ×3，之后 ×1', () => {
    const base = { oilBase: 1, coinBase: 10, expBase: 5 };
    const since = '2026-09-30T00:00:00.000Z';
    const early = dineAccrual({ level: 16, since }, new Date('2026-09-30T01:00:00Z'), 2, base, sequenceRng([0]));
    expect(early).toEqual({ oil: 4, exp: 21, loss: 36 });
    const late = dineAccrual({ level: 16, since }, new Date('2026-09-30T08:00:00Z'), 2, base, sequenceRng([0]));
    expect(late).toEqual({ oil: 2, exp: 7, loss: 12 });
  });
});

describe('蟑螂（规格书 13 §13.4、20 §20.18）', () => {
  it('放蟑螂奖励 ×(1 + 0.2 × 等级)', () => {
    expect(layReward(10, f.roach)).toEqual({ coin: 15, exp: 15 });
  });
  it('灭蟑螂体力：自己店 1、好友店 2、蟹老板 0；午夜蟑螂杀手按时段封顶', () => {
    expect(killStrength('self', {}, 12, f.roach)).toBe(1);
    expect(killStrength('friend', {}, 12, f.roach)).toBe(2);
    expect(killStrength('npc', {}, 12, f.roach)).toBe(0);
    const killer = { killRoachONightNS: 1, killRoachODayNS: 3 };
    expect(killStrength('friend', killer, 23, f.roach)).toBe(1);
    expect(killStrength('friend', killer, 12, f.roach)).toBe(2);
  });
  it('灭蟑螂奖励：自己店 ×1.5；别人店 ×(1 + cockroachIncomeRate)', () => {
    expect(killReward(10, 'self', {}, f.roach)).toEqual({ coin: 90, exp: 83 });
    expect(killReward(10, 'friend', {}, f.roach)).toEqual({ coin: 60, exp: 55 });
    expect(killReward(10, 'friend', { cockroachIncomeRate: 0.5 }, f.roach)).toEqual({ coin: 90, exp: 83 });
  });
});

describe('翻橱（规格书 05 §5.7）', () => {
  it('位置数 5 + 5 × 星级；冷却 22 小时 + 随机，蟹老板 10 小时', () => {
    expect(flipSlots(0, f.flip)).toBe(5);
    expect(flipSlots(3, f.flip)).toBe(20);
    expect(flipCoolMs(false, sequenceRng([0]), f.flip)).toBe(22 * 3600_000);
    expect(flipCoolMs(true, sequenceRng([0]), f.flip)).toBe(10 * 3600_000);
    expect(flipCoolMs(false, sequenceRng([0.5]), f.flip)).toBe(24 * 3600_000);
  });
  it('被夹掉银币：100 × 等级 的一半 + 随机一半；低于 2 星减半；蟹老板店 = 星级 × 10', () => {
    expect(caughtCoin(10, 2, false, sequenceRng([0]), f.flip)).toBe(500);
    expect(caughtCoin(10, 1, false, sequenceRng([0]), f.flip)).toBe(250);
    expect(caughtCoin(10, 3, true, sequenceRng([0]), f.flip)).toBe(30);
  });
});

describe('交换（规格书 05 §5.6）', () => {
  it('手续费 = 单价 × 0.5 × 100/odds，锁定 ×2', () => {
    expect(exchangeFee({ coin: 100, odds: 50 }, false, f.exchange)).toBe(100);
    expect(exchangeFee({ coin: 100, odds: 50 }, true, f.exchange)).toBe(200);
  });
  it('次数：14 − ⌊星/2⌋，总数 ×10，对方被换 10 + 星级，蟹老板 8 − 星级', () => {
    expect(exchangeLimits(3, 2, f.exchange)).toEqual({ perFriend: 13, total: 130, taken: 12, npc: 5 });
  });
  it('被抓后得银手镯的概率', () => {
    expect(bangleRate(3, 95, f.exchange)).toBeCloseTo(0.3 + 3 * 10 * 0.0006);
  });
});

describe('加油抽美味券（设计文档 裁定 4）', () => {
  it('油上限 ≥8000 时每 8000 油 2 次，否则每 4000 油 2 次', () => {
    expect(refuelDraws(16000, 20000, f.refuel)).toBe(4);
    expect(refuelDraws(7999, 20000, f.refuel)).toBe(0);
    expect(refuelDraws(4000, 6000, f.refuel)).toBe(2);
  });
});

describe('空桌（计划裁定 7）', () => {
  it('0 和 -3 且没有蟑螂、没有白食者才算空桌', () => {
    expect(isEmptyTable({ no: 1, floor: 1, customer: 0 })).toBe(true);
    expect(isEmptyTable({ no: 1, floor: 1, customer: -3 })).toBe(true);
    expect(isEmptyTable({ no: 1, floor: 1, customer: 1 })).toBe(false);
    expect(isEmptyTable({ no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } })).toBe(false);
    expect(clearTable({ no: 2, floor: 1, customer: 3, roach: { by: 1, at: 'x' } })).toEqual({
      no: 2,
      floor: 1,
      customer: 0,
    });
  });
});
```

`apps/server/src/core/tickets.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../test/config';
import { dtTicketDraws } from './tickets';

const t = testConfig().tuning.settlement;

describe('美味券抽取', () => {
  it('概率 = 基础 × 节日 + 幸运率 / 除数；幸运部分单独计数', () => {
    // 基础 0.0025，幸运率 0.3 / 150 = 0.002
    expect(dtTicketDraws(3, 0.3, 1, t, sequenceRng([0.001, 0.003, 0.9]))).toEqual({ num: 2, lucky: 1 });
    expect(dtTicketDraws(2, 0, 2, t, sequenceRng([0.004]))).toEqual({ num: 2, lucky: 0 });
    expect(dtTicketDraws(0, 1, 1, t, sequenceRng([0]))).toEqual({ num: 0, lucky: 0 });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/interact/rules.test.ts apps/server/src/core/tickets.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`apps/server/src/modules/interact/rules.ts`：

```ts
import type { Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';

type F = Tuning['friend'];

/** 白食体力 = min(整小时 × 每小时, 上限)，激动的心再乘倍数 */
export function dineStrength(hours: number, heart: boolean, t: F['dine']): number {
  const base = Math.min(Math.floor(hours) * t.strengthPerHour, t.strengthMax);
  return Math.floor(base * (heart ? t.heartStrengthMul : 1));
}

const hasHeart = (agg: Record<string, number>) => (agg.excitedHeart ?? 0) > 0;

/** 白食者自己结束（规格书 13 §13.3）：累计的银币照拿，经验有激动的心时 ×3 */
export function dineEndReward(
  acc: { coin: number; exp: number },
  hours: number,
  agg: Record<string, number>,
  t: F['dine'],
): { coin: number; exp: number; strength: number } {
  const heart = hasHeart(agg);
  return {
    coin: acc.coin,
    exp: Math.floor(acc.exp * (heart ? t.heartExpMul : 1)),
    strength: dineStrength(hours, heart, t),
  };
}

/** 被店主请走：店主拿 2 倍被吃掉的银币，白食者赔这些银币；经验只在有激动的心时给（设计文档 裁定 3） */
export function expelReward(
  acc: { coin: number; exp: number },
  hours: number,
  dinerAgg: Record<string, number>,
  t: F['dine'],
): { hostCoin: number; dinerLoss: number; dinerExp: number; dinerStrength: number } {
  const heart = hasHeart(dinerAgg);
  return {
    hostCoin: acc.coin * 2,
    dinerLoss: acc.coin,
    dinerExp: heart ? Math.floor(acc.exp * t.heartExpMul) : 0,
    dinerStrength: dineStrength(hours, heart, t),
  };
}

export function layReward(level: number, t: F['roach']): { coin: number; exp: number } {
  const m = 1 + t.layLevelRate * level;
  return { coin: Math.floor(t.layCoin * m), exp: Math.floor(t.layExp * m) };
}

export type KillPlace = 'self' | 'friend' | 'npc';

/** 灭蟑螂体力（规格书 20 §20.18）；午夜蟑螂杀手在 23~7 点、其他时段各有上限（计划裁定 6） */
export function killStrength(place: KillPlace, agg: Record<string, number>, hour: number, t: F['roach']): number {
  const base = t.killStrength[place];
  const night = hour === 23 || hour < 7;
  const cap = night ? (agg.killRoachONightNS ?? 0) : (agg.killRoachODayNS ?? 0);
  return cap > 0 ? Math.min(base, cap) : base;
}

export function killReward(
  level: number,
  place: KillPlace,
  agg: Record<string, number>,
  t: F['roach'],
): { coin: number; exp: number } {
  const rate = place === 'self' ? t.killSelfRate : 1 + (agg.cockroachIncomeRate ?? 0);
  return {
    coin: Math.round(t.killCoin * (1 + t.killCoinLevelRate * level) * rate),
    exp: Math.round(t.killExp * (1 + level) * rate),
  };
}

export function flipSlots(star: number, t: F['flip']): number {
  return t.baseSlots + t.slotsPerStar * star;
}

export function flipCoolMs(npc: boolean, rng: Rng, t: F['flip']): number {
  const hours = npc ? t.npcCoolHours : t.coolHours;
  return (hours * 3600 + rng.int(Math.round(t.coolRandHours * 3600))) * 1000;
}

/** 翻橱被老鼠夹夹住掉的银币（规格书 05 §5.7；设计文档 裁定 10） */
export function caughtCoin(level: number, star: number, npc: boolean, rng: Rng, t: F['flip']): number {
  let coin: number;
  if (npc) coin = star * t.npcCaughtCoinPerStar;
  else {
    const half = Math.floor((t.caughtCoinPerLevel * level) / 2);
    coin = half + rng.int(half);
  }
  return star < 2 ? Math.floor(coin / 2) : coin;
}

export function exchangeFee(food: { coin: number; odds: number }, locked: boolean, t: F['exchange']): number {
  return Math.floor(food.coin * t.feeRate * (100 / food.odds) * (locked ? t.lockedFeeMul : 1));
}

export function bangleRate(level: number, odds: number, t: F['exchange']): number {
  return t.bangleBase + level * (105 - odds) * t.bangleFactor;
}

export function exchangeLimits(
  myStar: number,
  theirStar: number,
  t: F['exchange'],
): { perFriend: number; total: number; taken: number; npc: number } {
  const perFriend = t.base - Math.floor(myStar / 2);
  return {
    perFriend,
    total: perFriend * t.perDayTotalMul,
    taken: t.takenBase + theirStar,
    npc: t.npcBase - myStar,
  };
}

/** 帮好友加油的美味券次数，按实际加的油算（设计文档 裁定 4） */
export function refuelDraws(added: number, oilMax: number, t: F['refuel']): number {
  const chunk = oilMax >= t.bigTank ? t.bigTank : t.bigTank / 2;
  return Math.floor(added / chunk) * t.drawsPerChunk;
}
```

`apps/server/src/modules/interact/tables.ts`：

```ts
import type { Op } from '../../core/op';
import { invalidState } from '../../core/errors';
import type { TableState } from '../../db/schema';

/** 读餐桌；调用方必须持有这家店的锁（runOp / runPairOp 里） */
export async function readTables(op: Op): Promise<TableState[]> {
  const r = await op.tx
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  return r.tables;
}

export async function writeTables(op: Op, tables: TableState[]): Promise<void> {
  await op.tx
    .updateTable('restaurant_tables')
    .set({ tables: JSON.stringify(tables) })
    .where('rest_id', '=', op.rest.id)
    .execute();
}

export function findTable(tables: TableState[], no: number): TableState {
  const t = tables.find((x) => x.no === no);
  if (!t) throw invalidState('no_table', { no });
  return t;
}

/** 空桌：没有顾客（0）或蟑螂刚被蟑螂药消灭（-3），且没有蟑螂、没有白食者（计划裁定 7） */
export function isEmptyTable(t: TableState): boolean {
  return (t.customer === 0 || t.customer === -3) && !t.roach && !t.freeloader;
}

/** 清空一张桌子（灭蟑螂、结束白食后） */
export function clearTable(t: TableState): TableState {
  return { no: t.no, floor: t.floor, customer: 0 };
}
```

`apps/server/src/core/tickets.ts`：

```ts
import { GOODS, type Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';
import { grantGoodsOp } from '../modules/store/goods';
import { opLuck } from './luck';
import type { Op } from './op';

/** 美味券：每次以 基础×节日倍数 + 幸运率/除数 的概率得 1 张；超出基础概率的那部分算"幸运" */
export function dtTicketDraws(
  times: number,
  luckRate: number,
  holiday: number,
  t: Tuning['settlement'],
  rng: Rng,
): { num: number; lucky: number } {
  const base = t.dtTicketBaseRate * holiday;
  const p = base + luckRate / t.dtTicketLuckDivisor;
  let num = 0;
  let lucky = 0;
  for (let i = 0; i < times; i++) {
    const r = rng.next();
    if (r < p) {
      num += 1;
      if (r >= base) lucky += 1;
    }
  }
  return { num, lucky };
}

/** 在一个操作里抽 times 次美味券并发放，返回张数 */
export async function drawDtTickets(op: Op, times: number): Promise<number> {
  if (times <= 0) return 0;
  const { rate } = await opLuck(op);
  const r = dtTicketDraws(times, rate, op.config.holidayMultiplier(op.now), op.tuning.settlement, op.rng);
  if (r.num > 0) await grantGoodsOp(op, GOODS.dtTicket, r.num, { lucky: r.lucky > 0 });
  return r.num;
}
```

`apps/server/src/modules/settlement/settle.ts`：把

```ts
    const p = t.dtTicketBaseRate * g.holidayMultiplier + flags.luckRate / t.dtTicketLuckDivisor;
    let tickets = 0;
    for (let i = 0; i < times; i++) if (rng.chance(p)) tickets += 1;
```

换成（随机数消耗次数不变，结算测试结果不变）：

```ts
    const tickets = dtTicketDraws(times, flags.luckRate, g.holidayMultiplier, t, rng).num;
```

并加 `import { dtTicketDraws } from '../../core/tickets';`。

`apps/server/src/modules/settlement/tables.ts`：在 `allocateTables` 之前加

```ts
/** 白食桌每轮（规格书 01 §1.5B）：店主的油、白食者本轮累计的经验、店主被吃掉的银币 */
export function dineAccrual(
  f: { level: number; since: string },
  now: Date,
  star: number,
  base: { oilBase: number; coinBase: number; expBase: number },
  rng: Rng,
): { oil: number; exp: number; loss: number } {
  const tt = Math.floor(Math.sqrt(f.level));
  const hours = (now.getTime() - Date.parse(f.since)) / 3_600_000;
  if (hours < 7) {
    return {
      oil: base.oilBase + 1 + Math.floor(Math.sqrt(tt)),
      exp: (base.expBase + star) * 3 + rng.int(6 * tt),
      loss: (base.coinBase + star) * 3 + rng.int(3 * tt),
    };
  }
  return { oil: base.oilBase + 1, exp: base.expBase + star + rng.int(tt), loss: base.coinBase + star + rng.int(tt) };
}
```

并把 `allocateTables` 里 "B. 白食桌" 的计算换成：

```ts
    if (table.customer === 9 && table.freeloader) {
      const f = table.freeloader;
      const acc = dineAccrual(f, input.now, s, { oilBase, coinBase, expBase }, rng);
      oil = acc.oil;
      const loss = acc.loss;
      const fexp = acc.exp;
      if (table.no <= seatedLimit) seatedLimit += 1;
```

（后面的 `const oilT = ...` 到 `continue;` 不变；删除原来的 `tt`、`hours`、`let loss`、`let fexp` 和 if/else。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/interact apps/server/src/core/tickets.test.ts apps/server/src/modules/settlement`
Expected: PASS（结算原有测试也全部通过）

- [ ] **Step 5: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/server/src/modules/interact apps/server/src/core/tickets.ts apps/server/src/core/tickets.test.ts apps/server/src/modules/settlement
git commit -m "feat(server): interaction rules, table helpers, shared dt ticket draws, dine accrual extracted from settlement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 好友关系、列表、搜索、路由和装配

**Files:**
- Create: `packages/shared/src/schemas/friend.ts`
- Modify: `packages/shared/src/index.ts`（导出 friend）
- Create: `apps/server/src/modules/friend/relations.ts`
- Create: `apps/server/src/modules/friend/reads.ts`
- Create: `apps/server/src/modules/friend/service.ts`
- Create: `apps/server/src/modules/friend/routes.ts`
- Create: `apps/server/src/modules/friend/relations.test.ts`
- Create: `apps/server/src/modules/friend/routes.test.ts`
- Create: `apps/server/test/players.ts`
- Modify: `apps/server/src/game.ts`（`social`）
- Modify: `apps/server/src/modules/index.ts`（注册 `socialRoutes`）

**Interfaces:**
- Consumes: `isFriend`（Task 3）、`isEmptyTable`（Task 4）、`flipSlots`（Task 4）
- Produces:

```ts
// relations.ts
export function createRelations(d: GameDeps): {
  apply(ctx: RestCtx, restId: number): Promise<{ status: 'requested' | 'friends' }>;
  respond(ctx: RestCtx, restId: number, accept: boolean): Promise<{ status: 'friends' | 'rejected' }>;
  remove(ctx: RestCtx, restId: number): Promise<{ removed: true }>;
};
export function makeFriends(db: Kysely<DB>, a: number, b: number): Promise<void>;
export function friendCount(db: Kysely<DB>, restId: number): Promise<number>; // 不含 NPC
export function writeLog(db: Kysely<DB>, restId: number, type: string, params: Record<string, unknown>, at: Date): Promise<void>;
// reads.ts
export function createFriendReads(d: GameDeps): { list(ctx, sort): Promise<FriendsDto>; requests(ctx): Promise<FriendRequestDto[]>; search(ctx, q): Promise<RestBriefDto[]>; street(ctx): Promise<RestBriefDto[]> };
// service.ts
export function createSocialService(d: GameDeps, world: WorldService): { relations; reads };
export type SocialService = ReturnType<typeof createSocialService>;
// routes.ts
export function socialRoutes(svc: SocialService): FastifyPluginAsync;   // 注册在 /api/v1
// test/players.ts
export function playerIn(ctx: TestContext, shardId: number, opts?: { verified?: boolean }): Promise<{ cookie: string; accountId: number; restId: number }>;
```

- [ ] **Step 1: 共享 schema** `packages/shared/src/schemas/friend.ts`（后面的任务往这个文件里追加）：

```ts
import { z } from 'zod';

const restId = z.number().int().positive();
export const restIdBody = z.object({ restId });
export const restIdParam = z.object({ restId: z.coerce.number().int().positive() });
export const respondBody = z.object({ restId, accept: z.boolean() });
export const friendListQuery = z.object({ sort: z.enum(['level', 'star', 'recent']).default('level') });
export const friendSearchQuery = z.object({ q: z.string().trim().min(1).max(20) });

export interface FriendBriefDto {
  id: number;
  name: string;
  level: number;
  star: number;
  avatar: number | null;
  npc: boolean;
  /** 桌上的蟑螂数 */
  roaches: number;
  /** 营业中、有空桌、白食人数没满 */
  dineSeat: boolean;
  /** 不在冷却中的橱柜位数 */
  flipReady: number;
  /** 成为好友的时间 */
  since: string;
}

export interface FriendsDto {
  items: FriendBriefDto[];
  /** 好友数（不含蟹老板）和上限 */
  count: number;
  max: number;
}

export interface FriendRequestDto {
  id: number;
  name: string;
  level: number;
  star: number;
  avatar: number | null;
  npc: boolean;
  at: string;
}

export interface RestBriefDto {
  id: number;
  name: string;
  level: number;
  star: number;
  avatar: number | null;
  isFriend: boolean;
  /** 我已经申请过 */
  requested: boolean;
}
```

`packages/shared/src/index.ts` 加 `export * from './schemas/friend';`。

- [ ] **Step 2: 测试工具** `apps/server/test/players.ts`

```ts
import { uniqueName } from './fixtures';
import { call, registerUser, type TestContext } from './helpers';

/** 注册 → （可选）验证邮箱 → 选区服 → 开店，走真实接口 */
export async function playerIn(
  ctx: TestContext,
  shardId: number,
  opts: { verified?: boolean } = {},
): Promise<{ cookie: string; accountId: number; restId: number }> {
  const u = await registerUser(ctx.app);
  if (opts.verified !== false) {
    await ctx.deps.db
      .updateTable('account')
      .set({ email_verified_at: new Date() })
      .where('id', '=', u.accountId)
      .execute();
  }
  await call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
  const r = await call(ctx.app, 'POST', '/api/v1/restaurant/create', {
    cookie: u.cookie,
    body: { name: uniqueName('r') },
  });
  if (r.status !== 200) throw new Error(`open restaurant failed: ${r.res.body}`);
  return { cookie: u.cookie, accountId: u.accountId, restId: r.json.data.id as number };
}
```

- [ ] **Step 3: 写失败的测试** `apps/server/src/modules/friend/relations.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { befriend, createTestGame, newPair, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const rel = () => t.game.social.relations;
const reads = () => t.game.social.reads;
const isFriendRow = async (a: number, b: number) =>
  (await t.db
    .selectFrom('friend')
    .select('rest_id')
    .where('rest_id', '=', a)
    .where('friend_id', '=', b)
    .executeTakeFirst()) !== undefined;

describe('好友关系（规格书 13 §13.1）', () => {
  it('申请 → 对方同意 → 双向好友；对方收到动态', async () => {
    const [a, b] = await newPair(t);
    expect(await rel().apply(a, b.restaurantId)).toEqual({ status: 'requested' });
    expect((await reads().requests(b)).map((r) => r.id)).toEqual([a.restaurantId]);
    expect(await rel().respond(b, a.restaurantId, true)).toEqual({ status: 'friends' });
    expect(await isFriendRow(a.restaurantId, b.restaurantId)).toBe(true);
    expect(await isFriendRow(b.restaurantId, a.restaurantId)).toBe(true);
    expect(await reads().requests(b)).toEqual([]);
    const log = await t.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'friend.accept')
      .execute();
    expect(log).toHaveLength(1);
  });

  it('对方已经向我申请时，我申请直接成为好友', async () => {
    const [a, b] = await newPair(t);
    await rel().apply(a, b.restaurantId);
    expect(await rel().apply(b, a.restaurantId)).toEqual({ status: 'friends' });
    expect(await isFriendRow(a.restaurantId, b.restaurantId)).toBe(true);
  });

  it('两人同时互相申请只产生一对好友', async () => {
    const [a, b] = await newPair(t);
    const r = await Promise.all([rel().apply(a, b.restaurantId), rel().apply(b, a.restaurantId)]);
    expect(r.map((x) => x.status).sort()).toEqual(['friends', 'requested']);
    const rows = await t.db
      .selectFrom('friend')
      .select('rest_id')
      .where('rest_id', 'in', [a.restaurantId, b.restaurantId])
      .execute();
    expect(rows).toHaveLength(2);
  });

  it('拒绝后申请消失；删除好友后双方都不是好友', async () => {
    const [a, b] = await newPair(t);
    await rel().apply(a, b.restaurantId);
    expect(await rel().respond(b, a.restaurantId, false)).toEqual({ status: 'rejected' });
    expect(await reads().requests(b)).toEqual([]);
    await befriend(t, a.restaurantId, b.restaurantId);
    await rel().remove(a, b.restaurantId);
    expect(await isFriendRow(b.restaurantId, a.restaurantId)).toBe(false);
    await expect(rel().remove(a, b.restaurantId)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
  });

  it('已是好友、对自己、对方未验证邮箱、没有申请时报错', async () => {
    const [a, b] = await newPair(t);
    await befriend(t, a.restaurantId, b.restaurantId);
    await expect(rel().apply(a, b.restaurantId)).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'friend' },
    });
    await expect(rel().apply(a, a.restaurantId)).rejects.toMatchObject({ params: { reason: 'target_self' } });
    const c = await newRestaurant(t, { shardId: a.shardId });
    await expect(rel().apply(a, c.restaurantId)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      params: { who: 'target' },
    });
    await expect(rel().respond(a, c.restaurantId, true)).rejects.toMatchObject({
      params: { reason: 'no_request' },
    });
  });

  it('好友上限（不含蟹老板）', async () => {
    const [a, b] = await newPair(t);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ tuning: { friend: { maxFriends: 1 } } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await befriend(t, a.restaurantId, b.restaurantId);
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await expect(rel().apply(a, c.restaurantId)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'friends', max: 1 },
    });
  });
});

describe('好友列表和搜索', () => {
  it('列表带蟑螂数、白食空位、可翻橱位；按等级排序', async () => {
    const [a, b] = await newPair(t, {}, { patch: { level: 20, star_level: 1 } });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { level: 5 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    await befriend(t, a.restaurantId, c.restaurantId);
    await t.db
      .updateTable('restaurant_tables')
      .set({
        tables: JSON.stringify([
          { no: 1, floor: 1, customer: 3, roach: { by: null, at: '2026-09-30T00:00:00Z' } },
          { no: 2, floor: 1, customer: 1 },
        ]),
      })
      .where('rest_id', '=', b.restaurantId)
      .execute();
    await t.db
      .insertInto('cupboard_flip')
      .values({
        host_rest_id: b.restaurantId,
        slot_no: 1,
        by_rest_id: a.restaurantId,
        cool_until: new Date(Date.now() + 3600_000),
      })
      .execute();
    const list = await reads().list(a, 'level');
    expect(list.count).toBe(2);
    expect(list.items.map((x) => x.id)).toEqual([b.restaurantId, c.restaurantId]);
    expect(list.items[0]).toMatchObject({ roaches: 1, dineSeat: false, flipReady: 9 });
    expect(list.items[1]).toMatchObject({ roaches: 0, dineSeat: true, flipReady: 5 });
  });

  it('搜索按店名（通配符按字面），标出是否好友和是否已申请', async () => {
    const [a, b] = await newPair(t);
    await t.db.updateTable('restaurant').set({ name: `搜%${b.restaurantId}` }).where('id', '=', b.restaurantId).execute();
    await rel().apply(a, b.restaurantId);
    const found = await reads().search(a, `搜%${b.restaurantId}`);
    expect(found).toEqual([expect.objectContaining({ id: b.restaurantId, isFriend: false, requested: true })]);
    expect(await reads().search(a, '%')).not.toContainEqual(expect.objectContaining({ id: a.restaurantId }));
  });
});
```

`apps/server/src/modules/friend/routes.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('好友接口', () => {
  it('申请、同意、列表走通；参数不合法返回 VALIDATION_FAILED', async () => {
    const shardId = await createShard(ctx.deps.db);
    const a = await playerIn(ctx, shardId);
    const b = await playerIn(ctx, shardId);
    const r1 = await call(ctx.app, 'POST', '/api/v1/friend/apply', { cookie: a.cookie, body: { restId: b.restId } });
    expect(r1.json).toMatchObject({ ok: true, data: { status: 'requested' } });
    const r2 = await call(ctx.app, 'POST', '/api/v1/friend/respond', {
      cookie: b.cookie,
      body: { restId: a.restId, accept: true },
    });
    expect(r2.json.data).toEqual({ status: 'friends' });
    const list = await call(ctx.app, 'GET', '/api/v1/friend/list?sort=recent', { cookie: a.cookie });
    expect(list.json.data.items.map((x: { id: number }) => x.id)).toEqual([b.restId]);
    const bad = await call(ctx.app, 'POST', '/api/v1/friend/apply', { cookie: a.cookie, body: { restId: 'x' } });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
  });
});
```

- [ ] **Step 4: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/friend`
Expected: FAIL（`t.game.social` 为 undefined / 路由 404）

- [ ] **Step 5: 实现**

`apps/server/src/modules/friend/relations.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { isFriend } from '../../core/pair';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';

export async function writeLog(
  db: Kysely<DB>,
  restId: number,
  type: string,
  params: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await db
    .insertInto('rest_log')
    .values({ rest_id: restId, type, params: JSON.stringify(params), created_at: at })
    .execute();
}

/** 好友数，不含蟹老板（设计文档 裁定 9） */
export async function friendCount(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('friend as f')
    .innerJoin('restaurant as r', 'r.id', 'f.friend_id')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('f.rest_id', '=', restId)
    .where('r.npc', '=', false)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 写两条好友关系，删掉双方之间的申请 */
export async function makeFriends(db: Kysely<DB>, a: number, b: number): Promise<void> {
  await db
    .insertInto('friend')
    .values([
      { rest_id: a, friend_id: b },
      { rest_id: b, friend_id: a },
    ])
    .onConflict((oc) => oc.doNothing())
    .execute();
  await db
    .deleteFrom('friend_request')
    .where((eb) =>
      eb.or([
        eb.and([eb('from_rest', '=', a), eb('to_rest', '=', b)]),
        eb.and([eb('from_rest', '=', b), eb('to_rest', '=', a)]),
      ]),
    )
    .execute();
}

/** 同一对餐厅的关系操作串行（两人同时互相申请只产生一对好友） */
async function lockPair(db: Kysely<DB>, a: number, b: number): Promise<void> {
  await sql`select pg_advisory_xact_lock(${Math.min(a, b)}::int, ${Math.max(a, b)}::int)`.execute(db);
}

type Row = { id: number; shard_id: number; name: string; npc: boolean; banned: boolean; verified: boolean };

async function loadRest(db: Kysely<DB>, restId: number): Promise<Row | undefined> {
  const r = await db
    .selectFrom('restaurant as r')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select(['r.id', 'r.shard_id', 'r.name', 'r.npc', 'a.banned_at', 'a.email_verified_at'])
    .where('r.id', '=', restId)
    .executeTakeFirst();
  return (
    r && {
      id: r.id,
      shard_id: r.shard_id,
      name: r.name,
      npc: r.npc,
      banned: r.banned_at !== null,
      verified: r.email_verified_at !== null,
    }
  );
}

export function createRelations(d: GameDeps) {
  /** 两家店的公共检查（与 runPairOp 一致，但不锁餐厅：关系操作不改餐厅行） */
  async function pair(db: Kysely<DB>, ctx: RestCtx, restId: number, requireVerified: boolean) {
    const me = await loadRest(db, ctx.restaurantId);
    const them = await loadRest(db, restId);
    if (!me) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    if (!them || them.shard_id !== me.shard_id)
      throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
    if (me.banned) throw new AppError(ErrorCode.ACCOUNT_BANNED, 403);
    if (requireVerified && !me.verified) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
    if (them.banned) throw invalidState('target_banned');
    if (requireVerified && !them.npc && !them.verified)
      throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 400, { who: 'target' });
    return { me, them };
  }

  return {
    async apply(ctx: RestCtx, restId: number): Promise<{ status: 'requested' | 'friends' }> {
      if (restId === ctx.restaurantId) throw invalidState('target_self');
      const settings = await d.shards.ensureFeature(ctx.shardId, 'friend');
      const t = settings.tuning.friend;
      const now = d.now();
      return d.db.transaction().execute(async (tx) => {
        await lockPair(tx, ctx.restaurantId, restId);
        const { me, them } = await pair(tx, ctx, restId, t.requireVerifiedEmail);
        if (them.npc) throw invalidState('target_npc');
        if (await isFriend(tx, me.id, them.id)) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'friend' });
        if ((await friendCount(tx, me.id)) >= t.maxFriends) throw limitReached('friends', { max: t.maxFriends });
        const back = await tx
          .selectFrom('friend_request')
          .select('from_rest')
          .where('from_rest', '=', them.id)
          .where('to_rest', '=', me.id)
          .executeTakeFirst();
        if (back) {
          if ((await friendCount(tx, them.id)) >= t.maxFriends)
            throw limitReached('target_friends', { max: t.maxFriends });
          await makeFriends(tx, me.id, them.id);
          await writeLog(tx, them.id, 'friend.accept', { by: me.id, byName: me.name }, now);
          return { status: 'friends' as const };
        }
        await tx
          .insertInto('friend_request')
          .values({ from_rest: me.id, to_rest: them.id, created_at: now })
          .onConflict((oc) => oc.doNothing())
          .execute();
        await writeLog(tx, them.id, 'friend.apply', { by: me.id, byName: me.name }, now);
        return { status: 'requested' as const };
      });
    },

    async respond(ctx: RestCtx, restId: number, accept: boolean): Promise<{ status: 'friends' | 'rejected' }> {
      const settings = await d.shards.ensureFeature(ctx.shardId, 'friend');
      const t = settings.tuning.friend;
      const now = d.now();
      return d.db.transaction().execute(async (tx) => {
        await lockPair(tx, ctx.restaurantId, restId);
        const req = await tx
          .selectFrom('friend_request')
          .select('from_rest')
          .where('from_rest', '=', restId)
          .where('to_rest', '=', ctx.restaurantId)
          .executeTakeFirst();
        if (!req) throw invalidState('no_request');
        if (!accept) {
          await tx
            .deleteFrom('friend_request')
            .where('from_rest', '=', restId)
            .where('to_rest', '=', ctx.restaurantId)
            .execute();
          return { status: 'rejected' as const };
        }
        const { me, them } = await pair(tx, ctx, restId, t.requireVerifiedEmail);
        if (!them.npc && (await friendCount(tx, me.id)) >= t.maxFriends)
          throw limitReached('friends', { max: t.maxFriends });
        if (!them.npc && (await friendCount(tx, them.id)) >= t.maxFriends)
          throw limitReached('target_friends', { max: t.maxFriends });
        await makeFriends(tx, me.id, them.id);
        if (!them.npc) await writeLog(tx, them.id, 'friend.accept', { by: me.id, byName: me.name }, now);
        return { status: 'friends' as const };
      });
    },

    async remove(ctx: RestCtx, restId: number): Promise<{ removed: true }> {
      await d.shards.ensureFeature(ctx.shardId, 'friend');
      const r = await d.db
        .deleteFrom('friend')
        .where((eb) =>
          eb.or([
            eb.and([eb('rest_id', '=', ctx.restaurantId), eb('friend_id', '=', restId)]),
            eb.and([eb('rest_id', '=', restId), eb('friend_id', '=', ctx.restaurantId)]),
          ]),
        )
        .executeTakeFirst();
      if (Number(r.numDeletedRows) === 0) throw new AppError(ErrorCode.NOT_FRIEND, 400);
      return { removed: true };
    },
  };
}
```

`apps/server/src/modules/friend/reads.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import type { FriendBriefDto, FriendRequestDto, FriendsDto, RestBriefDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import type { DB } from '../../db/schema';
import { flipSlots } from '../interact/rules';
import { isEmptyTable } from '../interact/tables';

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function countBy(
  db: Kysely<DB>,
  table: 'dine_dash' | 'cupboard_flip',
  ids: number[],
  now: Date,
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows =
    table === 'dine_dash'
      ? await db
          .selectFrom('dine_dash')
          .select(['host_rest_id as id', sql<number>`count(*)`.as('n')])
          .where('host_rest_id', 'in', ids)
          .groupBy('host_rest_id')
          .execute()
      : await db
          .selectFrom('cupboard_flip')
          .select(['host_rest_id as id', sql<number>`count(*)`.as('n')])
          .where('host_rest_id', 'in', ids)
          .where('cool_until', '>', now)
          .groupBy('host_rest_id')
          .execute();
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

export function createFriendReads(d: GameDeps) {
  async function me(ctx: RestCtx) {
    return d.db
      .selectFrom('restaurant')
      .select(['id', 'shard_id', 'street_id'])
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
  }

  /** 给一批餐厅标上"是否好友 / 是否已申请" */
  async function annotate(
    ctx: RestCtx,
    rows: Array<{ id: number; name: string; level: number; star_level: number; avatar: number | null }>,
  ): Promise<RestBriefDto[]> {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const friends = new Set(
      (
        await d.db
          .selectFrom('friend')
          .select('friend_id')
          .where('rest_id', '=', ctx.restaurantId)
          .where('friend_id', 'in', ids)
          .execute()
      ).map((r) => r.friend_id),
    );
    const requested = new Set(
      (
        await d.db
          .selectFrom('friend_request')
          .select('to_rest')
          .where('from_rest', '=', ctx.restaurantId)
          .where('to_rest', 'in', ids)
          .execute()
      ).map((r) => r.to_rest),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      star: r.star_level,
      avatar: r.avatar,
      isFriend: friends.has(r.id),
      requested: requested.has(r.id),
    }));
  }

  return {
    async list(ctx: RestCtx, sort: 'level' | 'star' | 'recent'): Promise<FriendsDto> {
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.friend;
      const now = d.now();
      const rows = await d.db
        .selectFrom('friend as f')
        .innerJoin('restaurant as r', 'r.id', 'f.friend_id')
        .innerJoin('restaurant_tables as rt', 'rt.rest_id', 'r.id')
        .select(['r.id', 'r.name', 'r.level', 'r.star_level', 'r.avatar', 'r.npc', 'r.state', 'rt.tables', 'f.created_at'])
        .where('f.rest_id', '=', ctx.restaurantId)
        .execute();
      const ids = rows.map((r) => r.id);
      const diners = await countBy(d.db, 'dine_dash', ids, now);
      const cooling = await countBy(d.db, 'cupboard_flip', ids, now);
      const items: FriendBriefDto[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level,
        star: r.star_level,
        avatar: r.avatar,
        npc: r.npc,
        roaches: r.tables.filter((x) => x.customer === 3).length,
        dineSeat:
          r.state === 1 &&
          r.tables.some(isEmptyTable) &&
          (r.npc || (diners.get(r.id) ?? 0) < t.dine.baseSeats + r.star_level),
        flipReady: Math.max(0, flipSlots(r.star_level, t.flip) - (cooling.get(r.id) ?? 0)),
        since: r.created_at.toISOString(),
      }));
      const key = (x: FriendBriefDto): number =>
        sort === 'star' ? x.star : sort === 'recent' ? Date.parse(x.since) : x.level;
      items.sort((a, b) => Number(b.npc) - Number(a.npc) || key(b) - key(a) || a.id - b.id);
      return { items, count: items.filter((x) => !x.npc).length, max: t.maxFriends };
    },

    async requests(ctx: RestCtx): Promise<FriendRequestDto[]> {
      const rows = await d.db
        .selectFrom('friend_request as q')
        .innerJoin('restaurant as r', 'r.id', 'q.from_rest')
        .select(['r.id', 'r.name', 'r.level', 'r.star_level', 'r.avatar', 'r.npc', 'q.created_at'])
        .where('q.to_rest', '=', ctx.restaurantId)
        .orderBy('q.created_at', 'desc')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level,
        star: r.star_level,
        avatar: r.avatar,
        npc: r.npc,
        at: r.created_at.toISOString(),
      }));
    },

    async search(ctx: RestCtx, q: string): Promise<RestBriefDto[]> {
      const m = await me(ctx);
      const rows = await d.db
        .selectFrom('restaurant')
        .select(['id', 'name', 'level', 'star_level', 'avatar'])
        .where('shard_id', '=', m.shard_id)
        .where('npc', '=', false)
        .where('id', '!=', m.id)
        .where('name', 'ilike', `%${likeEscape(q)}%`)
        .orderBy('level', 'desc')
        .limit(20)
        .execute();
      return annotate(ctx, rows);
    },

    async street(ctx: RestCtx): Promise<RestBriefDto[]> {
      const m = await me(ctx);
      const rows = await d.db
        .selectFrom('restaurant')
        .select(['id', 'name', 'level', 'star_level', 'avatar'])
        .where('shard_id', '=', m.shard_id)
        .where('street_id', '=', m.street_id)
        .where('state', '=', 1)
        .where('npc', '=', false)
        .where('id', '!=', m.id)
        .orderBy(sql`random()`)
        .limit(20)
        .execute();
      return annotate(ctx, rows);
    },
  };
}
```

`apps/server/src/modules/friend/service.ts`：

```ts
import type { GameDeps } from '../../core/deps';
import type { WorldService } from '../world/service';
import { createFriendReads } from './reads';
import { createRelations } from './relations';

/** 好友互动的所有服务（后面的任务往这里加） */
export function createSocialService(d: GameDeps, world: WorldService) {
  void world;
  return {
    relations: createRelations(d),
    reads: createFriendReads(d),
  };
}

export type SocialService = ReturnType<typeof createSocialService>;
```

`apps/server/src/modules/friend/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { friendListQuery, friendSearchQuery, respondBody, restIdBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { SocialService } from './service';

/** 好友互动的接口，注册在 /api/v1 下 */
export function socialRoutes(svc: SocialService): FastifyPluginAsync {
  return async (r) => {
    r.get('/friend/list', async (req) =>
      ok(await svc.reads.list(restCtxOf(req), parse(friendListQuery, req.query).sort)),
    );
    r.get('/friend/requests', async (req) => ok(await svc.reads.requests(restCtxOf(req))));
    r.get('/friend/search', async (req) =>
      ok(await svc.reads.search(restCtxOf(req), parse(friendSearchQuery, req.query).q)),
    );
    r.get('/friend/street', async (req) => ok(await svc.reads.street(restCtxOf(req))));
    r.post('/friend/apply', async (req) =>
      ok(await svc.relations.apply(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
    r.post('/friend/respond', async (req) => {
      const b = parse(respondBody, req.body);
      return ok(await svc.relations.respond(restCtxOf(req), b.restId, b.accept));
    });
    r.post('/friend/remove', async (req) =>
      ok(await svc.relations.remove(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
  };
}
```

`apps/server/src/game.ts`：`import { createSocialService, type SocialService } from './modules/friend/service';`；`Game` 接口加 `social: SocialService;`；返回对象里加 `social: createSocialService(deps, world),`。

`apps/server/src/modules/index.ts`：`import { socialRoutes } from './friend/routes';`，最后加 `app.register(socialRoutes(game.social), { prefix: '/api/v1' });`。

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/friend`
Expected: PASS 8/8

- [ ] **Step 7: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/friend apps/server/src/game.ts apps/server/src/modules/index.ts apps/server/test/players.ts
git commit -m "feat(server): friend requests, accept, reject, remove; friend list, search, same street; social routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 蟹老板 NPC、功能开启、排除 NPC

**Files:**
- Create: `apps/server/src/modules/npc/npc.ts`
- Create: `apps/server/src/modules/npc/jobs.ts`
- Create: `apps/server/src/modules/npc/npc.test.ts`
- Modify: `apps/server/src/core/features.ts`（加 `friend`）
- Modify: `apps/server/src/game.ts`（NPC 任务、`restaurant.created` 处理器）
- Modify: `apps/server/src/modules/account/service.ts`（验证邮箱后邀请；系统账号不能登录）
- Modify: `apps/server/src/modules/settlement/runner.ts`（排除 NPC；NPC 餐桌轮）
- Modify: `apps/server/src/modules/settlement/mouse.ts`（排除 NPC）
- Modify: `apps/server/src/modules/admin/stats.ts`、`players.ts`、`grants.ts`（排除 NPC 和系统账号）
- Modify: `apps/server/src/worker/periodic.test.ts`（未实现功能的例子从 `friend` 换成 `bar`）
- Modify: `apps/server/src/modules/task/task.test.ts`（第 8、9 步不再跳过）
- Modify: `apps/server/src/modules/settlement/runner.test.ts`（自然蟑螂跟随 friend 开关）

**Interfaces:**
- Consumes: `dineAccrual`（Task 4）、`isEmptyTable`（Task 4）、`makeFriends`（Task 5）
- Produces:

```ts
export const NPC_USERNAME = '~krab';
export function npcIdOf(db: Kysely<DB>, shardId: number): Promise<number | null>;
export function ensureNpc(db: Kysely<DB>, config: GameConfig, t: Tuning['friend']['npc'], shardId: number, rng: Rng): Promise<{ id: number; created: boolean }>;
export function npcInvite(db: Kysely<DB>, where: { shardId?: number; accountId?: number; restId?: number }): Promise<number>;
export function restockNpc(db: Kysely<DB>, config: GameConfig, t: Tuning['friend']['npc'], npcId: number, rng: Rng): Promise<number>;
export function npcTableRound(d: GameDeps, shardId: number, round: number, now: Date): Promise<'settled' | 'skipped' | 'none'>;
export function npcJobs(d: GameDeps): PeriodicJob[];              // npc-maintain、npc-restock
export function registerNpcHandlers(bus: EventBus): void;
```

- [ ] **Step 1: 写失败的测试** `apps/server/src/modules/npc/npc.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, setTables, tablesOf, type TestGame } from '../../../test/game';
import { settleShardRound } from '../settlement/runner';
import { ensureNpc, npcIdOf, npcInvite, npcTableRound, NPC_USERNAME } from './npc';

const config = testConfig();
const npcT = config.tuning.friend.npc;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('蟹老板（设计文档 §4.9）', () => {
  it('每区一家，重复调用不重复建；32 张桌，橱柜已补货；系统账号', async () => {
    const shardId = await createShard(t.db);
    const a = await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    const b = await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    expect(await tablesOf(t, a.id)).toHaveLength(32);
    const foods = await t.db.selectFrom('cupboard_food').select('foods_id').where('rest_id', '=', a.id).execute();
    expect(foods).toHaveLength(npcT.restockKinds);
    const acc = await t.db
      .selectFrom('restaurant as r')
      .innerJoin('account as x', 'x.id', 'r.account_id')
      .select(['x.username', 'x.is_system', 'r.npc', 'r.name'])
      .where('r.id', '=', a.id)
      .executeTakeFirstOrThrow();
    expect(acc).toEqual({ username: NPC_USERNAME, is_system: true, npc: true, name: '蟹老板' });
  });

  it('只邀请邮箱已验证的店，每家只邀请一次（拒绝后不会再来）', async () => {
    const shardId = await createShard(t.db);
    const npc = (await ensureNpc(t.db, config, npcT, shardId, seededRng(1))).id;
    const v = await newRestaurant(t, { shardId, verified: true });
    const u = await newRestaurant(t, { shardId });
    expect(await npcInvite(t.db, { shardId })).toBe(1);
    const reqs = await t.db.selectFrom('friend_request').selectAll().where('from_rest', '=', npc).execute();
    expect(reqs.map((r) => r.to_rest)).toEqual([v.restaurantId]);
    await t.game.social.relations.respond(v, npc, false);
    expect(await npcInvite(t.db, { shardId })).toBe(0);
    void u;
  });

  it('同意蟹老板的申请后成为好友，不占好友上限', async () => {
    const shardId = await createShard(t.db);
    const npc = (await ensureNpc(t.db, config, npcT, shardId, seededRng(1))).id;
    const v = await newRestaurant(t, { shardId, verified: true });
    await npcInvite(t.db, { restId: v.restaurantId });
    expect(await t.game.social.relations.respond(v, npc, true)).toEqual({ status: 'friends' });
    const list = await t.game.social.reads.list(v, 'level');
    expect(list.items[0]).toMatchObject({ id: npc, npc: true });
    expect(list.count).toBe(0);
  });

  it('已验证的账号开店时收到邀请', async () => {
    const shardId = await createShard(t.db);
    await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    const accountId = await createAccountRow(t.db);
    await t.db.updateTable('account').set({ email_verified_at: new Date() }).where('id', '=', accountId).execute();
    const restId = await t.game.restaurant.open(accountId, shardId, `n${accountId}`);
    const req = await t.db.selectFrom('friend_request').select('from_rest').where('to_rest', '=', restId).execute();
    expect(req).toHaveLength(1);
  });

  it('系统账号不能登录', async () => {
    const shardId = await createShard(t.db);
    await ensureNpc(t.db, config, npcT, shardId, seededRng(1));
    await expect(t.game.account.login({ username: NPC_USERNAME, password: '!' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('餐桌轮：白食桌累计、空桌按 roachRate 长蟑螂；同一轮只跑一次；普通结算不含 NPC', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { friend: { npc: { roachRate: 1 } } } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const npc = (await ensureNpc(t.db, config, npcT, shardId, seededRng(1))).id;
    const now = new Date('2026-09-30T04:00:00Z');
    await setTables(t, npc, [
      { no: 1, floor: 1, customer: 9, freeloader: { restId: 1, level: 16, since: '2026-09-30T03:00:00Z', coin: 0, exp: 0 } },
      { no: 2, floor: 1, customer: 0 },
    ]);
    expect(await npcTableRound(t.game.deps, shardId, roundOf(now), now)).toBe('settled');
    const tables = await tablesOf(t, npc);
    expect(tables[0]!.freeloader!.exp).toBeGreaterThan(0);
    expect(tables[1]).toMatchObject({ customer: 3, roach: { by: null } });
    expect(await npcTableRound(t.game.deps, shardId, roundOf(now), now)).toBe('skipped');
    const stats = await settleShardRound(t.game.deps, t.game.world, shardId, roundOf(now) + 1, now);
    expect(stats.restaurants).toBe(0);
    const inc = await t.db.selectFrom('income_round').select('id').where('rest_id', '=', npc).execute();
    expect(inc).toHaveLength(0);
    expect(await npcIdOf(t.db, shardId)).toBe(npc);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/npc`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `apps/server/src/modules/npc/npc.ts`

```ts
import { sql, type Kysely } from 'kysely';
import type { GameConfig, Tuning } from '@dt/config';
import { hashSeed, seededRng, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { isEmptyTable } from '../interact/tables';
import { emptyCookbookLevels, initialTables } from '../restaurant/rules';
import { dineAccrual } from '../settlement/tables';

/** 系统账号的用户名：注册规则不允许 "~"，玩家不会撞名 */
export const NPC_USERNAME = '~krab';
const NPC_EMAIL = 'krab@npc.invalid';

async function npcAccountId(db: Kysely<DB>): Promise<number> {
  await sql`insert into account (username, password_hash, email, email_verified_at, is_system)
    values (${NPC_USERNAME}, '!', ${NPC_EMAIL}, now(), true) on conflict do nothing`.execute(db);
  const r = await db
    .selectFrom('account')
    .select('id')
    .where('username', '=', NPC_USERNAME)
    .executeTakeFirstOrThrow();
  return r.id;
}

export async function npcIdOf(db: Kysely<DB>, shardId: number): Promise<number | null> {
  const r = await db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('npc', '=', true)
    .executeTakeFirst();
  return r?.id ?? null;
}

/** 蟹老板的橱柜：清空后从 1~5 级食材里随机放 restockKinds 种、每种 restockNum 个；返回种数 */
export async function restockNpc(
  db: Kysely<DB>,
  config: GameConfig,
  t: Tuning['friend']['npc'],
  npcId: number,
  rng: Rng,
): Promise<number> {
  await db.deleteFrom('cupboard_food').where('rest_id', '=', npcId).execute();
  const pool = [1, 2, 3, 4, 5].flatMap((l) => config.foodsByLevel.get(l) ?? []);
  const want = Math.min(t.restockKinds, pool.length);
  const picked = new Set<number>();
  while (picked.size < want) picked.add(pool[rng.int(pool.length)]!.id);
  if (picked.size > 0)
    await db
      .insertInto('cupboard_food')
      .values([...picked].map((id) => ({ rest_id: npcId, foods_id: id, num: t.restockNum })))
      .execute();
  return picked.size;
}

/** 区服的蟹老板餐厅：没有就建（幂等）；新建时顺便补一次货 */
export async function ensureNpc(
  db: Kysely<DB>,
  config: GameConfig,
  t: Tuning['friend']['npc'],
  shardId: number,
  rng: Rng,
): Promise<{ id: number; created: boolean }> {
  const found = await npcIdOf(db, shardId);
  if (found !== null) return { id: found, created: false };
  const accountId = await npcAccountId(db);
  return db.transaction().execute(async (tx) => {
    const ins = await tx
      .insertInto('restaurant')
      .values({
        shard_id: shardId,
        account_id: accountId,
        name: t.name,
        level: t.level,
        coin: 0,
        diamond: 0,
        strength: 0,
        strength_max: 0,
        oil: t.oil,
        oil_max: t.oil,
        star_level: t.star,
        street_id: 0,
        renown: 0,
        attr_left: 0,
        table_num: t.tables,
        cupboard_num: 999,
        store_num: 0,
        foods_max_num: 999,
        foods_lock_num: 0,
        npc: true,
        avatar: t.avatar,
        door: t.door,
        notice: '欢迎光临蟹黄堡！',
      })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!ins) {
      const id = await npcIdOf(tx, shardId);
      if (id === null) throw new Error(`cannot create npc restaurant in shard ${shardId}: name taken`);
      return { id, created: false };
    }
    await tx
      .insertInto('restaurant_tables')
      .values({ rest_id: ins.id, tables: JSON.stringify(initialTables(t.tables)) })
      .execute();
    await tx
      .insertInto('restaurant_cookbooks')
      .values({ rest_id: ins.id, levels: emptyCookbookLevels(config.maxCookbookId) })
      .execute();
    await restockNpc(tx, config, t, ins.id, rng);
    return { id: ins.id, created: true };
  });
}

/**
 * 蟹老板向邮箱已验证、还没邀请过的店发好友申请（每家店只邀请一次，计划裁定 3）；
 * 已经是好友的只记邀请不发申请。返回发出的申请数
 */
export async function npcInvite(
  db: Kysely<DB>,
  where: { shardId?: number; accountId?: number; restId?: number },
): Promise<number> {
  const conds = [
    sql`not r.npc`,
    sql`a.email_verified_at is not null`,
    sql`not exists (select 1 from npc_invite i where i.rest_id = r.id)`,
  ];
  if (where.shardId !== undefined) conds.push(sql`r.shard_id = ${where.shardId}`);
  if (where.accountId !== undefined) conds.push(sql`r.account_id = ${where.accountId}`);
  if (where.restId !== undefined) conds.push(sql`r.id = ${where.restId}`);
  const res = await sql<{ to_rest: number }>`
    with picked as (
      select r.id, n.id as npc_id
      from restaurant r
      join account a on a.id = r.account_id
      join restaurant n on n.shard_id = r.shard_id and n.npc
      where ${sql.join(conds, sql` and `)}
    ), mark as (
      insert into npc_invite (rest_id) select id from picked on conflict do nothing returning rest_id
    )
    insert into friend_request (from_rest, to_rest)
    select p.npc_id, p.id from picked p join mark m on m.rest_id = p.id
    where not exists (select 1 from friend f where f.rest_id = p.id and f.friend_id = p.npc_id)
    on conflict do nothing
    returning to_rest`.execute(db);
  return res.rows.length;
}

/** 结算轮次里蟹老板只跑餐桌：白食累计（不扣蟹老板银币，设计文档 裁定 11）、空桌长蟑螂 */
export async function npcTableRound(
  d: GameDeps,
  shardId: number,
  round: number,
  now: Date,
): Promise<'settled' | 'skipped' | 'none'> {
  const npcId = await npcIdOf(d.db, shardId);
  if (npcId === null) return 'none';
  return runSystemOp(
    d,
    shardId,
    npcId,
    { source: 'settlement', now, rng: seededRng(hashSeed(shardId, round, npcId)) },
    async (op) => {
      const tr = await op.tx
        .selectFrom('restaurant_tables')
        .selectAll()
        .where('rest_id', '=', npcId)
        .executeTakeFirstOrThrow();
      if (tr.round_no >= round) return 'skipped';
      const rt = op.tuning.rest;
      const s = op.rest.star_level;
      const base = {
        oilBase: rt.oilBase,
        coinBase: rt.coinBase - Math.floor(s / 2),
        expBase: rt.expBase + Math.floor(s / 2),
      };
      const tables = tr.tables.map((tb) => {
        if (tb.customer === 9 && tb.freeloader) {
          const a = dineAccrual(tb.freeloader, now, s, base, op.rng);
          return { ...tb, freeloader: { ...tb.freeloader, coin: tb.freeloader.coin + a.loss, exp: tb.freeloader.exp + a.exp } };
        }
        if (isEmptyTable(tb) && op.rng.chance(op.tuning.friend.npc.roachRate))
          return { no: tb.no, floor: tb.floor, customer: 3, roach: { by: null, at: now.toISOString() } };
        return tb;
      });
      await op.tx
        .updateTable('restaurant_tables')
        .set({ round_no: round, tables: JSON.stringify(tables) })
        .where('rest_id', '=', npcId)
        .execute();
      return 'settled';
    },
  );
}

const registered = new WeakSet<EventBus>();

/** 已验证邮箱的账号开新店时，蟹老板立即发申请 */
export function registerNpcHandlers(bus: EventBus): void {
  if (registered.has(bus)) return;
  registered.add(bus);
  bus.on('restaurant.created', async (tx, e) => {
    await npcInvite(tx, { restId: e.restId });
  });
}
```

`apps/server/src/modules/npc/jobs.ts`：

```ts
import { gameParts, hashSeed, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { withRestaurant } from '../../db/tx';
import { ensureNpc, npcIdOf, npcInvite, restockNpc } from './npc';

const HOUR = 3_600_000;

export function npcJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 每小时：没有蟹老板就建（新区服、首次部署），并补发邀请
      name: 'npc-maintain',
      feature: 'friend',
      period: (now) => String(Math.floor(now.getTime() / HOUR)),
      run: async ({ shardId, settings, period }) => {
        const npc = await ensureNpc(
          d.db,
          d.config,
          settings.tuning.friend.npc,
          shardId,
          seededRng(hashSeed(shardId, 'npc-create', period)),
        );
        const invited = await npcInvite(d.db, { shardId });
        return { npcId: npc.id, created: npc.created, invited };
      },
    },
    {
      // 每天 00:05 之后补一次货
      name: 'npc-restock',
      feature: 'friend',
      period: (now) => {
        const p = gameParts(now);
        return p.hour * 60 + p.minute >= 5 ? p.day : null;
      },
      run: async ({ shardId, settings, period }) => {
        const id = await npcIdOf(d.db, shardId);
        if (id === null) return { skipped: true };
        const kinds = await withRestaurant(d.db, id, (tx) =>
          restockNpc(tx, d.config, settings.tuning.friend.npc, id, seededRng(hashSeed(shardId, 'npc-restock', period))),
        );
        return { kinds };
      },
    },
  ];
}
```

`apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 里 `'task'` 之后加 `'friend',`。

`apps/server/src/game.ts`：
- 导入 `npcJobs`、`registerNpcHandlers`
- `registerTaskHandlers(app.bus, app.config);` 之后加 `registerNpcHandlers(app.bus);`
- `jobs.push(statDailyJob(app.db));` 之后加 `jobs.push(...npcJobs(deps));`

`apps/server/src/modules/account/service.ts`：
- `login` 的查询加 `'is_system'` 列，`if (!account || !valid)` 改成 `if (!account || !valid || account.is_system)`
- `verifyEmail` 末尾加 `await npcInvite(d.db, { accountId });`（`import { npcInvite } from '../npc/npc';`）

`apps/server/src/modules/settlement/runner.ts`：
- 痞老板候选和本轮 `ids` 两个查询都加 `.where('npc', '=', false)`
- `stats.ms = ...` 之前加：

```ts
  if (featureAvailable(settings, 'friend')) {
    try {
      await npcTableRound(d, shardId, round, now);
    } catch (err) {
      opts.log?.error({ err, shardId, round }, 'npc table round failed');
    }
  }
```

（`import { npcTableRound } from '../npc/npc';`）

`apps/server/src/modules/settlement/mouse.ts`：`mouseRound` 里选店的查询加 `.where('npc', '=', false)`。

`apps/server/src/modules/admin/stats.ts`：`aggregateDay` 的三个查询各加 `.where('r.npc', '=', false)`；`distribution` 的 `base` 改成 `db.selectFrom('restaurant').where('shard_id', '=', shardId).where('npc', '=', false)`。

`apps/server/src/modules/admin/players.ts`：`search` 里 `byAccount` 查询和最后的 `accounts` 查询都加 `.where('is_system', '=', false)`。

`apps/server/src/modules/admin/grants.ts`：`targets()` 的查询加 `.where('npc', '=', false)`。

`apps/server/src/worker/periodic.test.ts`：`const f = job('f', 'friend', 'k');` 改成 `const f = job('f', 'bar', 'k');`（friend 已实现，换一个未实现的功能）。

`apps/server/src/modules/task/task.test.ts`：把"第 8 步起跳过未开放的功能"改成：

```ts
  it('跳过未开放的功能（设计文档 裁定 7）：第 13 步酒吧跳到第 14 步翻橱', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 13, level: 5 } });
    const list = await task().tasks(ctx);
    expect(list.mainStep).toBe(14);
    expect(list.main).toMatchObject({ step: 14, key: 'cupboard.flip', done: false });
  });

  it('第 8 步打蟑螂、第 9 步加好友不再跳过', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 8 } });
    expect((await task().tasks(ctx)).main).toMatchObject({ step: 8, key: 'roach.kill' });
  });
```

`apps/server/src/modules/settlement/runner.test.ts`：把"打蟑螂（friend 功能）不可用时不自然产生蟑螂"换成（friend 已实现，蟑螂跟随区服的 friend 开关）：

```ts
  it('自然蟑螂跟随 friend 功能：开启时产生，区服关闭 friend 时不产生', async () => {
    // 概率给到 100：乘上任何天气系数都必定出现
    const tuning = { settlement: { roachRateBase: 100, roachRatePerStar: 0 } };
    const on = await createShard(t.db);
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values([
        { shard_id: on, override: JSON.stringify({ tuning }) },
        { shard_id: off, override: JSON.stringify({ tuning, features: { friend: false } }) },
      ])
      .execute();
    const a = await newRestaurant(t, { shardId: on, patch: { coin: 1000, oil: 1000 } });
    const b = await newRestaurant(t, { shardId: off, patch: { coin: 1000, oil: 1000 } });
    await settle(on);
    await settle(off);
    const roaches = async (restId: number) =>
      (
        await t.db
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', restId)
          .executeTakeFirstOrThrow()
      ).tables.filter((x) => x.customer === 3).length;
    expect(await roaches(a.restaurantId)).toBe(4);
    expect(await roaches(b.restaurantId)).toBe(0);
  });
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/npc apps/server/src/modules/task apps/server/src/worker apps/server/src/modules/settlement apps/server/src/modules/admin`
Expected: PASS

- [ ] **Step 5: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过。若模拟器测试（`sim.test.ts`）因为自然蟑螂开启而失败：只可能是断言写死了数值，按新输出核对后更新断言，并在台账写 Ruling

```bash
git add apps/server
git commit -m "feat(server): krab npc per shard (create, invite once, restock, table-only rounds); friend feature on; npc excluded from settlement, mouse, admin stats and search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: 访问好友餐厅、好友动态

**Files:**
- Modify: `packages/shared/src/schemas/friend.ts`（`FriendRestDto`）
- Modify: `apps/server/src/modules/restaurant/reads.ts`（`logPage` 支持按类型和起始时间过滤）
- Modify: `apps/server/src/modules/friend/reads.ts`（`detail`、`feed`、`FEED_TYPES`）
- Modify: `apps/server/src/modules/friend/routes.ts`
- Create: `apps/server/src/modules/friend/detail.test.ts`

**Interfaces:**
- Consumes: `isFriend`（Task 3）、`restNames`、`tableDto`（Task 2）
- Produces: `FEED_TYPES: readonly string[]`；`reads.detail(ctx: RestCtx, restId: number): Promise<FriendRestDto>`；`reads.feed(ctx: RestCtx, q: PageQuery): Promise<LogPageDto>`；`logPage(db, restId, q, filter?: { types?: readonly string[]; since?: Date })`；接口 `GET /api/v1/friend/detail/:restId`、`GET /api/v1/friend/feed`

- [ ] **Step 1: 共享 DTO**（追加到 `packages/shared/src/schemas/friend.ts`；文件顶部加 `import type { TableDto } from './restaurant';`）

```ts
export interface FriendRestDto {
  id: number;
  name: string;
  level: number;
  star: number;
  streetId: number;
  renown: number;
  door: number;
  avatar: number | null;
  notice: string;
  npc: boolean;
  /** 1 营业，2 停业 */
  state: number;
  isFriend: boolean;
  /** 我已经向它申请过 */
  requested: boolean;
  /** 展示中的个性图标 */
  icons: Array<{ key: string; title: string }>;
  /** 有效勋章（道具 id） */
  honors: number[];
  /** 摆着的牌匾（道具 id） */
  plaques: number[];
  tables: TableDto[];
  /** 我今天已经给它点过赞 */
  thumbedToday: boolean;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/modules/friend/detail.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { testConfig } from '../../../test/config';
import { befriend, createTestGame, newPair, newRestaurant, setTables, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const reads = () => t.game.social.reads;

describe('访问好友餐厅（规格书 13 §13.2）', () => {
  it('公开信息：不含银币等资产；只显示展示中的图标、有效勋章；白食者带名字', async () => {
    const [a, b] = await newPair(t, {}, { patch: { notice: '你好', door: 3, avatar: 2, coin: 999 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    await t.db
      .insertInto('rest_icon')
      .values([
        { rest_id: b.restaurantId, icon_key: 'founder', shown: true },
        { rest_id: b.restaurantId, icon_key: 'helper', shown: false },
      ])
      .execute();
    await grantGoods(t.db, config, b.restaurantId, GOODS.magicLamp, 1, new Date());
    await grantGoods(t.db, config, b.restaurantId, GOODS.bangle, 1, new Date(Date.now() - 2 * 3600_000));
    await setTables(t, b.restaurantId, [
      {
        no: 1,
        floor: 1,
        customer: 9,
        freeloader: { restId: a.restaurantId, level: 1, since: '2026-09-30T00:00:00.000Z', coin: 0, exp: 0 },
      },
    ]);
    const r = await reads().detail(a, b.restaurantId);
    expect(r).toMatchObject({
      id: b.restaurantId,
      notice: '你好',
      door: 3,
      avatar: 2,
      isFriend: true,
      icons: [{ key: 'founder', title: '开服元老' }],
      honors: [GOODS.magicLamp],
      thumbedToday: false,
    });
    expect(r).not.toHaveProperty('coin');
    const name = (await t.db.selectFrom('restaurant').select('name').where('id', '=', a.restaurantId).executeTakeFirstOrThrow()).name;
    expect(r.tables[0]).toMatchObject({ customer: 9, freeloaderRestId: a.restaurantId, freeloaderName: name });
  });

  it('非好友也能看，isFriend=false；别的区服的店看不到', async () => {
    const [a, b] = await newPair(t);
    expect((await reads().detail(a, b.restaurantId)).isFriend).toBe(false);
    const other = await newRestaurant(t);
    await expect(reads().detail(a, other.restaurantId)).rejects.toMatchObject({ code: 'RESTAURANT_NOT_FOUND' });
  });
});

describe('好友动态（规格书 13 §13.8）', () => {
  it('只含互动类型、近 3 天', async () => {
    const a = await newRestaurant(t);
    const now = Date.now();
    await t.db
      .insertInto('rest_log')
      .values([
        { rest_id: a.restaurantId, type: 'thumb', params: JSON.stringify({ by: 1 }), created_at: new Date(now) },
        { rest_id: a.restaurantId, type: 'level.up', params: '{}', created_at: new Date(now) },
        {
          rest_id: a.restaurantId,
          type: 'friend.flip',
          params: '{}',
          created_at: new Date(now - 4 * 86_400_000),
        },
      ])
      .execute();
    const page = await reads().feed(a, { limit: 30 });
    expect(page.items.map((x) => x.type)).toEqual(['thumb']);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/friend/detail.test.ts`
Expected: FAIL（`reads().detail` 不是函数）

- [ ] **Step 4: 实现**

`apps/server/src/modules/restaurant/reads.ts` 的 `logPage` 改签名，按可选过滤条件查询（原调用不受影响）：

```ts
export async function logPage(
  db: Kysely<DB>,
  restId: number,
  q: PageQuery,
  filter: { types?: readonly string[]; since?: Date } = {},
): Promise<LogPageDto> {
  let s = db
    .selectFrom('rest_log')
    .select(['id', 'type', 'params', 'created_at'])
    .where('rest_id', '=', restId);
  if (filter.types) s = s.where('type', 'in', [...filter.types]);
  if (filter.since) s = s.where('created_at', '>=', filter.since);
```

（后面的游标、排序、分页代码不变。）

`apps/server/src/modules/friend/reads.ts`：导入并追加

```ts
import { DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import { ErrorCode, gameDay, type FriendRestDto, type LogPageDto, type PageQuery } from '@dt/shared';
import { isFriend } from '../../core/pair';
import { AppError } from '../../http/errors';
import { logPage, restNames, tableDto } from '../restaurant/reads';

/** 好友动态：别人对我做的操作（设计文档 §4.10） */
export const FEED_TYPES = [
  'dine.start',
  'dine.expelled',
  'roach.laid',
  'roach.killed',
  'friend.refuel',
  'friend.flip',
  'exchange',
  'thumb',
  'friend.apply',
  'friend.accept',
] as const;
const FEED_DAYS = 3;
```

`createFriendReads` 返回对象里加：

```ts
    async detail(ctx: RestCtx, restId: number): Promise<FriendRestDto> {
      const now = d.now();
      const r = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
      if (!r || r.shard_id !== ctx.shardId) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      const tables = (
        await d.db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', restId).executeTakeFirstOrThrow()
      ).tables;
      const names = await restNames(d.db, tables.flatMap((x) => (x.freeloader ? [x.freeloader.restId] : [])));
      const iconDefs = new Map(d.config.bundle.looks.icons.map((i) => [i.key, i]));
      const icons = (
        await d.db
          .selectFrom('rest_icon')
          .select('icon_key')
          .where('rest_id', '=', restId)
          .where('shown', '=', true)
          .orderBy('id')
          .execute()
      ).flatMap((i) => {
        const def = iconDefs.get(i.icon_key);
        return def ? [{ key: def.key, title: def.title }] : [];
      });
      const store = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'expires_at'])
        .where('rest_id', '=', restId)
        .where('num', '>', 0)
        .execute();
      const honors = store
        .filter(
          (s) =>
            d.config.goods.get(s.goods_id)?.type === GOODS_TYPE.honor && (s.expires_at === null || s.expires_at > now),
        )
        .map((s) => s.goods_id)
        .sort((x, y) => x - y);
      const plaques = (
        await d.db.selectFrom('restaurant_device').select('goods_id').where('rest_id', '=', restId).execute()
      )
        .map((x) => x.goods_id)
        .filter((id) => {
          const g = d.config.goods.get(id);
          return g?.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque;
        });
      const requested = await d.db
        .selectFrom('friend_request')
        .select('to_rest')
        .where('from_rest', '=', ctx.restaurantId)
        .where('to_rest', '=', restId)
        .executeTakeFirst();
      const thumbed = await d.db
        .selectFrom('thumb')
        .select('to_rest')
        .where('day', '=', gameDay(now))
        .where('from_rest', '=', ctx.restaurantId)
        .where('to_rest', '=', restId)
        .executeTakeFirst();
      return {
        id: r.id,
        name: r.name,
        level: r.level,
        star: r.star_level,
        streetId: r.street_id,
        renown: r.renown,
        door: r.door,
        avatar: r.avatar,
        notice: r.notice,
        npc: r.npc,
        state: r.state,
        isFriend: restId !== ctx.restaurantId && (await isFriend(d.db, ctx.restaurantId, restId)),
        requested: requested !== undefined,
        icons,
        honors,
        plaques,
        tables: tables.map((x) => tableDto(x, names)),
        thumbedToday: thumbed !== undefined,
      };
    },

    feed(ctx: RestCtx, q: PageQuery): Promise<LogPageDto> {
      return logPage(d.db, ctx.restaurantId, q, {
        types: FEED_TYPES,
        since: new Date(d.now().getTime() - FEED_DAYS * 86_400_000),
      });
    },
```

`apps/server/src/modules/friend/routes.ts` 加（`pageQuery`、`restIdParam` 从 `@dt/shared` 导入）：

```ts
    r.get('/friend/detail/:restId', async (req) =>
      ok(await svc.reads.detail(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.get('/friend/feed', async (req) => ok(await svc.reads.feed(restCtxOf(req), parse(pageQuery, req.query))));
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/friend apps/server/src/modules/restaurant`
Expected: PASS

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/friend apps/server/src/modules/restaurant/reads.ts
git commit -m "feat(server): visit a friend's restaurant (public info, icons, honors, tables) and the 3-day friend feed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 白食

**Files:**
- Modify: `packages/shared/src/schemas/friend.ts`（`dineStartBody`、`tableBody`、`DineCurrentDto`、`DineRewardDto`）
- Create: `apps/server/src/modules/interact/dine.ts`
- Create: `apps/server/src/modules/interact/dine.test.ts`
- Modify: `apps/server/src/modules/friend/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: `runPairOp`、`feedLog`（Task 3）；`readTables`、`writeTables`、`findTable`、`isEmptyTable`、`clearTable`、`dineEndReward`、`expelReward`（Task 4）
- Produces: `createDine(d)` → `{ current(ctx): Promise<DineCurrentDto | null>; start(ctx, { restId, tableNo }): Promise<OpResult<{ hostRestId: number; tableNo: number; startedAt: string }>>; end(ctx): Promise<OpResult<DineRewardDto>>; expel(ctx, { tableNo }): Promise<OpResult<{ hostCoin: number; dinerLoss: number }>> }`；`svc.dine`；接口 `GET /dine/current`、`POST /dine/start`、`/dine/end`、`/dine/expel`

- [ ] **Step 1: 共享 schema**（追加到 `friend.ts`）

```ts
const tableNo = z.number().int().min(1).max(500);
export const dineStartBody = z.object({ restId, tableNo });
export const tableBody = z.object({ tableNo });
/** restId 为自己时表示自己店 */
export const restTableBody = z.object({ restId, tableNo });

export interface DineCurrentDto {
  hostRestId: number;
  hostName: string;
  tableNo: number;
  startedAt: string;
  minutes: number;
  /** 已满最短时长，可以结束 */
  canEnd: boolean;
}

export interface DineRewardDto {
  coin: number;
  exp: number;
  strength: number;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/modules/interact/dine.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { roundOf } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  newPair,
  newRestaurant,
  restRow,
  setTables,
  tablesOf,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { settleShardRound } from '../settlement/runner';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const dine = () => t.game.social.dine;
const MIN = 60_000;

/** 白食者 a（有头像、1000 银币）和店主 b，互为好友 */
async function setup(host: NewRestaurantOptions = {}) {
  t.clock.set(new Date());
  const [a, b] = await newPair(t, { patch: { avatar: 1, coin: 1000 } }, host);
  await befriend(t, a.restaurantId, b.restaurantId);
  return [a, b] as const;
}
const dineRow = (id: number) =>
  t.db.selectFrom('dine_dash').selectAll().where('diner_rest_id', '=', id).executeTakeFirst();
/** 把白食桌上的累计值改成给定值 */
async function setAcc(host: number, coin: number, exp: number) {
  const tables = await tablesOf(t, host);
  await setTables(
    t,
    host,
    tables.map((x) => (x.freeloader ? { ...x, freeloader: { ...x.freeloader, coin, exp } } : x)),
  );
}

describe('白食开始（规格书 13 §13.3）', () => {
  it('空桌变白食桌；记下白食者；店主收到动态', async () => {
    const [a, b] = await setup();
    const r = await dine().start(a, { restId: b.restaurantId, tableNo: 2 });
    expect(r.data).toMatchObject({ hostRestId: b.restaurantId, tableNo: 2 });
    const table = (await tablesOf(t, b.restaurantId)).find((x) => x.no === 2)!;
    expect(table).toMatchObject({ customer: 9, freeloader: { restId: a.restaurantId, coin: 0, exp: 0 } });
    expect(await dineRow(a.restaurantId)).toMatchObject({ host_rest_id: b.restaurantId, table_no: 2 });
    expect(await dine().current(a)).toMatchObject({ hostRestId: b.restaurantId, tableNo: 2, canEnd: false });
    const feed = await t.game.social.reads.feed(b, { limit: 30 });
    expect(feed.items[0]).toMatchObject({ type: 'dine.start', params: { by: a.restaurantId } });
  });

  it('没设置头像、已在白食、对方停业、桌子有人、白食位满时拒绝；蟹老板不限人数', async () => {
    const [a, b] = await setup();
    await t.db.updateTable('restaurant').set({ avatar: null }).where('id', '=', a.restaurantId).execute();
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'avatar' },
    });
    await t.db.updateTable('restaurant').set({ avatar: 1 }).where('id', '=', a.restaurantId).execute();
    await setTables(t, b.restaurantId, [
      { no: 1, floor: 1, customer: 1 },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
    ]);
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'table_occupied' },
    });
    await dine().start(a, { restId: b.restaurantId, tableNo: 2 });
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 3 })).rejects.toMatchObject({
      params: { reason: 'already_dining' },
    });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { avatar: 1 } });
    await befriend(t, c.restaurantId, b.restaurantId);
    await expect(dine().start(c, { restId: b.restaurantId, tableNo: 3 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'seats', max: 1 },
    });
    const [d, e] = await setup({ patch: { state: 2 } });
    await expect(dine().start(d, { restId: e.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'target_closed' },
    });
  });

  it('两个人同时抢同一张空桌：只有一个成功（Review Focus 1）', async () => {
    const [a, b] = await setup({ patch: { star_level: 2 } });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { avatar: 1 } });
    await befriend(t, c.restaurantId, b.restaurantId);
    const r = await Promise.allSettled([
      dine().start(a, { restId: b.restaurantId, tableNo: 1 }),
      dine().start(c, { restId: b.restaurantId, tableNo: 1 }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ params: { reason: 'table_occupied' } });
    expect((await tablesOf(t, b.restaurantId)).filter((x) => x.customer === 9)).toHaveLength(1);
  });

  it('白食中结算照常跑：白食桌保留并累计（Review Focus 3）', async () => {
    const [a, b] = await setup({ patch: { oil: 1000, coin: 1000 } });
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    t.clock.advance(5 * MIN);
    await settleShardRound(t.game.deps, t.game.world, b.shardId, roundOf(t.clock.now), t.clock.now);
    const table = (await tablesOf(t, b.restaurantId)).find((x) => x.no === 1)!;
    expect(table.customer).toBe(9);
    expect(table.freeloader!.exp).toBeGreaterThan(0);
    expect(table.freeloader!.coin).toBeGreaterThan(0);
  });
});

describe('白食结束、请走', () => {
  it('不满 30 分钟不能结束；结束后拿累计银币经验和体力，今天不能再白食', async () => {
    const [a, b] = await setup();
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    await expect(dine().end(a)).rejects.toMatchObject({ params: { reason: 'dine_minutes', need: 30 } });
    await setAcc(b.restaurantId, 100, 50);
    t.clock.advance(121 * MIN);
    const r = await dine().end(a);
    expect(r.data).toEqual({ coin: 100, exp: 50, strength: 40 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 1100, exp: 50, strength: 140 });
    expect(await dineRow(a.restaurantId)).toBeUndefined();
    expect((await tablesOf(t, b.restaurantId))[0]).toEqual({ no: 1, floor: 1, customer: 0 });
    await expect(dine().start(a, { restId: b.restaurantId, tableNo: 2 })).rejects.toMatchObject({
      params: { what: 'dine' },
    });
  });

  it('激动的心：经验 ×3、体力 ×1.5', async () => {
    const [a, b] = await setup();
    await grantGoods(t.db, config, a.restaurantId, GOODS.excitedHeart, 1, t.clock.now);
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    await setAcc(b.restaurantId, 0, 50);
    t.clock.advance(121 * MIN);
    expect((await dine().end(a)).data).toEqual({ coin: 0, exp: 150, strength: 60 });
  });

  it('请走：不满 30 分钟不行；有神灯不行；店主拿 2 倍，白食者赔银币、不得经验', async () => {
    const [a, b] = await setup({ patch: { coin: 0 } });
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    await expect(dine().expel(b, { tableNo: 1 })).rejects.toMatchObject({ params: { reason: 'dine_minutes' } });
    await setAcc(b.restaurantId, 100, 50);
    t.clock.advance(61 * MIN);
    const r = await dine().expel(b, { tableNo: 1 });
    expect(r.data).toEqual({ hostCoin: 200, dinerLoss: 100 });
    expect((await restRow(t, b.restaurantId)).coin).toBe(200);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 900, exp: 0, strength: 120 });
    expect(await dineRow(a.restaurantId)).toBeUndefined();
    const feed = await t.game.social.reads.feed(a, { limit: 30 });
    expect(feed.items[0]).toMatchObject({ type: 'dine.expelled', params: { by: b.restaurantId, coin: 100 } });

    const [c, e] = await setup();
    await grantGoods(t.db, config, c.restaurantId, GOODS.magicLamp, 1, t.clock.now);
    await dine().start(c, { restId: e.restaurantId, tableNo: 1 });
    t.clock.advance(31 * MIN);
    await expect(dine().expel(e, { tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'diner_protected' },
    });
  });

  it('白食中删了好友、店主被封：白食者仍能结束；白食者被封：店主仍能请走（Review Focus 4）', async () => {
    const [a, b] = await setup();
    await dine().start(a, { restId: b.restaurantId, tableNo: 1 });
    t.clock.advance(31 * MIN);
    await t.game.social.relations.remove(a, b.restaurantId);
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', b.accountId).execute();
    await expect(dine().end(a)).resolves.toMatchObject({ data: { coin: 0 } });

    const [c, e] = await setup();
    await dine().start(c, { restId: e.restaurantId, tableNo: 1 });
    t.clock.advance(31 * MIN);
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', c.accountId).execute();
    await expect(dine().expel(e, { tableNo: 1 })).resolves.toMatchObject({ data: { hostCoin: 0 } });
  });

  it('没在白食时结束、请走一张普通桌都报 not_dining', async () => {
    const [a, b] = await setup();
    await expect(dine().end(a)).rejects.toMatchObject({ params: { reason: 'not_dining' } });
    await expect(dine().expel(b, { tableNo: 1 })).rejects.toMatchObject({ params: { reason: 'not_dining' } });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/interact/dine.test.ts`
Expected: FAIL（`t.game.social.dine` 为 undefined）

- [ ] **Step 4: 实现** `apps/server/src/modules/interact/dine.ts`

```ts
import type { Kysely } from 'kysely';
import { gameDay, type DineCurrentDto, type DineRewardDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, gainExp, gainStrength } from '../../core/resources';
import type { DB, TableState } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { dineEndReward, expelReward } from './rules';
import { clearTable, findTable, isEmptyTable, readTables, writeTables } from './tables';

const row = (db: Kysely<DB>, dinerId: number) =>
  db.selectFrom('dine_dash').selectAll().where('diner_rest_id', '=', dinerId).executeTakeFirst();
const hoursSince = (since: Date, now: Date) => (now.getTime() - since.getTime()) / 3_600_000;

function assertMinutes(op: Op, since: Date): void {
  const need = op.tuning.friend.dine.minMinutes;
  if (op.now.getTime() - since.getTime() < need * 60_000) throw requirement('dine_minutes', { need });
}

/** 清空白食者的桌子，取出累计值；桌子已经不在时累计按 0 */
function takeSeat(tables: TableState[], tableNo: number, dinerId: number) {
  let acc = { coin: 0, exp: 0 };
  const next = tables.map((tb) => {
    if (tb.no === tableNo && tb.customer === 9 && tb.freeloader?.restId === dinerId) {
      acc = { coin: tb.freeloader.coin, exp: tb.freeloader.exp };
      return clearTable(tb);
    }
    return tb;
  });
  return { tables: next, acc };
}

/** 白食（规格书 13 §13.3） */
export function createDine(d: GameDeps) {
  return {
    async current(ctx: RestCtx): Promise<DineCurrentDto | null> {
      const r = await row(d.db, ctx.restaurantId);
      if (!r) return null;
      const host = await d.db
        .selectFrom('restaurant')
        .select('name')
        .where('id', '=', r.host_rest_id)
        .executeTakeFirstOrThrow();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const minutes = Math.floor((d.now().getTime() - r.started_at.getTime()) / 60_000);
      return {
        hostRestId: r.host_rest_id,
        hostName: host.name,
        tableNo: r.table_no,
        startedAt: r.started_at.toISOString(),
        minutes,
        canEnd: minutes >= tuning.friend.dine.minMinutes,
      };
    },

    start(ctx: RestCtx, b: { restId: number; tableNo: number }) {
      return runPairOp(d, ctx, b.restId, { feature: 'friend', source: 'dine.start', friend: 'required' }, async (p) => {
        const { me, them } = p;
        if (me.rest.avatar === null) throw requirement('avatar');
        if (await row(me.tx, me.rest.id)) throw invalidState('already_dining');
        if ((await getDaily(me.tx, me.rest.id, 'dine.done', gameDay(me.now))) > 0)
          throw limitReached('dine', { max: 1 });
        if (them.rest.state !== 1) throw invalidState('target_closed');
        const tables = await readTables(them);
        if (!isEmptyTable(findTable(tables, b.tableNo))) throw invalidState('table_occupied');
        if (!them.rest.npc) {
          const n = await me.tx
            .selectFrom('dine_dash')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('host_rest_id', '=', them.rest.id)
            .executeTakeFirstOrThrow();
          const max = me.tuning.friend.dine.baseSeats + them.rest.star_level;
          if (Number(n.n) >= max) throw limitReached('seats', { max });
        }
        const since = me.now.toISOString();
        await writeTables(
          them,
          tables.map((tb) =>
            tb.no === b.tableNo
              ? {
                  no: tb.no,
                  floor: tb.floor,
                  customer: 9,
                  freeloader: { restId: me.rest.id, level: me.rest.level, since, coin: 0, exp: 0 },
                }
              : tb,
          ),
        );
        await me.tx
          .insertInto('dine_dash')
          .values({ diner_rest_id: me.rest.id, host_rest_id: them.rest.id, table_no: b.tableNo, started_at: me.now })
          .execute();
        feedLog(p, 'dine.start', { table: b.tableNo });
        restLog(me, 'dine.started', { host: them.rest.id, hostName: them.rest.name, table: b.tableNo });
        return { hostRestId: them.rest.id, tableNo: b.tableNo, startedAt: since };
      });
    },

    /** 白食者自己结束；删了好友、店主被封也能结束（设计文档 裁定 7） */
    async end(ctx: RestCtx) {
      const cur = await row(d.db, ctx.restaurantId);
      if (!cur) throw invalidState('not_dining');
      return runPairOp(
        d,
        ctx,
        cur.host_rest_id,
        { feature: 'friend', source: 'dine.end', friend: 'none', lenient: true },
        async (p): Promise<DineRewardDto> => {
          const { me, them } = p;
          const r = await row(me.tx, me.rest.id);
          if (!r || r.host_rest_id !== them.rest.id) throw invalidState('not_dining');
          assertMinutes(me, r.started_at);
          const seat = takeSeat(await readTables(them), r.table_no, me.rest.id);
          await writeTables(them, seat.tables);
          const reward = dineEndReward(seat.acc, hoursSince(r.started_at, me.now), await opAgg(me), me.tuning.friend.dine);
          gainCoin(me, reward.coin);
          gainExp(me, reward.exp);
          gainStrength(me, reward.strength);
          await me.tx.deleteFrom('dine_dash').where('diner_rest_id', '=', me.rest.id).execute();
          await incrementDaily(me.tx, me.rest.id, 'dine.done', 1, gameDay(me.now));
          await emitAction(me, 'friend.dineAndDash');
          restLog(me, 'dine.ended', { host: them.rest.id, hostName: them.rest.name, ...reward });
          return reward;
        },
      );
    },

    /** 店主请走白食者（me = 店主，them = 白食者）；白食者被封也能请走 */
    async expel(ctx: RestCtx, b: { tableNo: number }) {
      const tables = (
        await d.db
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow()
      ).tables;
      const tb = tables.find((x) => x.no === b.tableNo);
      if (!tb || tb.customer !== 9 || !tb.freeloader) throw invalidState('not_dining');
      return runPairOp(
        d,
        ctx,
        tb.freeloader.restId,
        { feature: 'friend', source: 'dine.expel', friend: 'none', lenient: true },
        async (p) => {
          const { me, them } = p;
          const r = await row(me.tx, them.rest.id);
          if (!r || r.host_rest_id !== me.rest.id || r.table_no !== b.tableNo) throw invalidState('not_dining');
          assertMinutes(me, r.started_at);
          const dinerAgg = await opAgg(them);
          if ((dinerAgg.magicLamp ?? 0) > 0) throw invalidState('diner_protected');
          const seat = takeSeat(await readTables(me), b.tableNo, them.rest.id);
          await writeTables(me, seat.tables);
          const x = expelReward(seat.acc, hoursSince(r.started_at, me.now), dinerAgg, me.tuning.friend.dine);
          gainCoin(me, x.hostCoin);
          const loss = Math.min(x.dinerLoss, them.rest.coin);
          gainCoin(them, -loss, { event: false });
          gainStrength(them, x.dinerStrength, { event: false });
          gainExp(them, x.dinerExp, { event: false });
          await me.tx.deleteFrom('dine_dash').where('diner_rest_id', '=', them.rest.id).execute();
          await incrementDaily(me.tx, them.rest.id, 'dine.done', 1, gameDay(me.now));
          feedLog(p, 'dine.expelled', { coin: loss, table: b.tableNo });
          return { hostCoin: x.hostCoin, dinerLoss: loss };
        },
      );
    },
  };
}
```

`apps/server/src/modules/friend/service.ts` 的返回对象加 `dine: createDine(d),`（`import { createDine } from '../interact/dine';`）。

`routes.ts` 加（`dineStartBody`、`tableBody` 从 `@dt/shared` 导入，`okOp` 从 `../../http/reply` 导入）：

```ts
    r.get('/dine/current', async (req) => ok(await svc.dine.current(restCtxOf(req))));
    r.post('/dine/start', async (req) => okOp(await svc.dine.start(restCtxOf(req), parse(dineStartBody, req.body))));
    r.post('/dine/end', async (req) => okOp(await svc.dine.end(restCtxOf(req))));
    r.post('/dine/expel', async (req) => okOp(await svc.dine.expel(restCtxOf(req), parse(tableBody, req.body))));
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/interact/dine.test.ts`
Expected: PASS 9/9

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/interact/dine.ts apps/server/src/modules/interact/dine.test.ts apps/server/src/modules/friend
git commit -m "feat(server): dine-and-dash start, end, expel with seats, lamp protection and daily limit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 放蟑螂、灭蟑螂

**Files:**
- Create: `apps/server/src/modules/interact/roach.ts`
- Create: `apps/server/src/modules/interact/roach.test.ts`
- Modify: `apps/server/src/modules/friend/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: `runPairOp`、`feedLog`（Task 3）；`layReward`、`killStrength`、`killReward`、表格工具、`drawDtTickets`（Task 4）；`restTableBody`（Task 8）
- Produces: `createRoach(d)` → `{ lay(ctx, { restId, tableNo }): Promise<OpResult<{ coin: number; exp: number }>>; kill(ctx, { restId, tableNo }): Promise<OpResult<KillResultDto>> }`；`svc.roach`；接口 `POST /roach/lay`、`POST /roach/kill`；`KillResultDto`（shared）

- [ ] **Step 1: 共享 DTO**（追加到 `friend.ts`）

```ts
export interface KillResultDto {
  strength: number;
  coin: number;
  exp: number;
  /** 捡到的神秘礼券 */
  tickets: number;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/modules/interact/roach.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  restRow,
  setTables,
  tablesOf,
  type TestGame,
} from '../../../test/game';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { ensureNpc } from '../npc/npc';
import { grantGoods } from '../store/grant';

const config = testConfig();
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  // 0.99：所有概率判定都不中（没有礼券、巫毒娃娃不触发），便于断言数值
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const roach = () => t.game.social.roach;

async function friends() {
  seq = [0.99];
  const [a, b] = await newPair(t, { patch: { level: 10 } }, { patch: { level: 10 } });
  await befriend(t, a.restaurantId, b.restaurantId);
  return [a, b] as const;
}

describe('放蟑螂（规格书 13 §13.4）', () => {
  it('好友空桌放一只；奖励 ×(1+0.2×等级)；对方被放计数 +1、收到动态', async () => {
    const [a, b] = await friends();
    const r = await roach().lay(a, { restId: b.restaurantId, tableNo: 1 });
    expect(r.data).toEqual({ coin: 15, exp: 15 });
    expect((await tablesOf(t, b.restaurantId))[0]).toMatchObject({ customer: 3, roach: { by: a.restaurantId } });
    expect(await getDaily(t.db, b.restaurantId, 'roach.laidOn', gameDay(t.clock.now))).toBe(1);
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('roach.laid');
  });

  it('每天上限 3 × (星级 + 1)；桌上有人时不能放', async () => {
    const [a, b] = await friends();
    await incrementDaily(t.db, a.restaurantId, 'roach.lay', 3, gameDay(t.clock.now));
    await expect(roach().lay(a, { restId: b.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { what: 'roach_lay', max: 3 },
    });
    const [c, e] = await friends();
    await setTables(t, e.restaurantId, [{ no: 1, floor: 1, customer: 2 }]);
    await expect(roach().lay(c, { restId: e.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'table_occupied' },
    });
  });
});

describe('灭蟑螂（规格书 13 §13.4、20 §20.18）', () => {
  it('自己店：1 体力，奖励 ×1.5，桌子清空', async () => {
    const [a, b] = await friends();
    await setTables(t, a.restaurantId, [{ no: 1, floor: 1, customer: 3, roach: { by: b.restaurantId, at: 'x' } }]);
    const r = await roach().kill(a, { restId: a.restaurantId, tableNo: 1 });
    expect(r.data).toEqual({ strength: 1, coin: 90, exp: 83, tickets: 0 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ strength: 99, coin: 90 });
    expect((await tablesOf(t, a.restaurantId))[0]).toEqual({ no: 1, floor: 1, customer: 0 });
    expect(await getDaily(t.db, a.restaurantId, 'roach.kill', gameDay(t.clock.now))).toBe(1);
  });

  it('好友店：2 体力、奖励 ×1；不能灭自己放的；没蟑螂时报错', async () => {
    const [a, b] = await friends();
    await setTables(t, b.restaurantId, [
      { no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } },
      { no: 2, floor: 1, customer: 3, roach: { by: a.restaurantId, at: 'x' } },
      { no: 3, floor: 1, customer: 0 },
    ]);
    const r = await roach().kill(a, { restId: b.restaurantId, tableNo: 1 });
    expect(r.data).toMatchObject({ strength: 2, coin: 60, exp: 55 });
    await expect(roach().kill(a, { restId: b.restaurantId, tableNo: 2 })).rejects.toMatchObject({
      params: { reason: 'own_roach' },
    });
    await expect(roach().kill(a, { restId: b.restaurantId, tableNo: 3 })).rejects.toMatchObject({
      params: { reason: 'no_roach' },
    });
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('roach.killed');
  });

  it('蟹老板店不耗体力；巫毒娃娃可以免体力；礼券和美味券', async () => {
    const [a] = await friends();
    const npc = (await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1))).id;
    await befriend(t, a.restaurantId, npc);
    await setTables(t, npc, [
      { no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } },
      { no: 2, floor: 1, customer: 3, roach: { by: null, at: 'x' } },
    ]);
    expect((await roach().kill(a, { restId: npc, tableNo: 1 })).data.strength).toBe(0);

    const [c, e] = await friends();
    await grantGoods(t.db, config, c.restaurantId, GOODS.voodoo, 1, t.clock.now);
    await setTables(t, e.restaurantId, [{ no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } }]);
    seq = [0]; // 所有概率判定都中
    const r = await roach().kill(c, { restId: e.restaurantId, tableNo: 1 });
    expect(r.data).toMatchObject({ strength: 0, tickets: 1 });
    expect(await goodsNum(t, c.restaurantId, GOODS.mysteryTicket)).toBe(1);
    expect(await goodsNum(t, c.restaurantId, GOODS.dtTicket)).toBe(1);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/interact/roach.test.ts`
Expected: FAIL（`t.game.social.roach` 为 undefined）

- [ ] **Step 4: 实现** `apps/server/src/modules/interact/roach.ts`

```ts
import { GOODS } from '@dt/config';
import { gameDay, gameParts, type KillResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { runOp, type Op } from '../../core/op';
import { feedLog, runPairOp, type PairOp } from '../../core/pair';
import { gainCoin, gainExp, spendStrength } from '../../core/resources';
import { drawDtTickets } from '../../core/tickets';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { grantGoodsOp } from '../store/goods';
import { killReward, killStrength, layReward, type KillPlace } from './rules';
import { clearTable, findTable, isEmptyTable, readTables, writeTables } from './tables';

/** 在 host 店灭 tableNo 桌的蟑螂；me 和 host 可以是同一个 Op（自己店） */
async function killIn(me: Op, host: Op, place: KillPlace, tableNo: number, p: PairOp | null): Promise<KillResultDto> {
  const rt = me.tuning.friend.roach;
  const tables = await readTables(host);
  const table = findTable(tables, tableNo);
  if (table.customer !== 3) throw invalidState('no_roach');
  if (table.roach?.by === me.rest.id) throw invalidState('own_roach');
  const agg = await opAgg(me);
  let strength = killStrength(place, agg, gameParts(me.now).hour, rt);
  if (strength > 0 && me.rng.chance(agg.killRoachNoStrengthRate ?? 0)) strength = 0;
  spendStrength(me, strength);
  await writeTables(host, tables.map((tb) => (tb.no === tableNo ? clearTable(tb) : tb)));
  const r = killReward(me.rest.level, place, agg, rt);
  gainCoin(me, r.coin);
  gainExp(me, r.exp);
  const { rate } = await opLuck(me);
  let tickets = 0;
  if (me.rng.chance(rt.ticketRate + rate / 2)) {
    tickets = me.rng.intMin1(rt.ticketMax);
    await grantGoodsOp(me, GOODS.mysteryTicket, tickets);
  }
  if (place !== 'self') await drawDtTickets(me, 1);
  await incrementDaily(me.tx, me.rest.id, 'roach.kill', 1, gameDay(me.now));
  await emitAction(me, 'roach.kill');
  if (p) feedLog(p, 'roach.killed', { table: tableNo });
  return { strength, coin: r.coin, exp: r.exp, tickets };
}

/** 放蟑螂、灭蟑螂（规格书 13 §13.4） */
export function createRoach(d: GameDeps) {
  return {
    lay(ctx: RestCtx, b: { restId: number; tableNo: number }) {
      return runPairOp(d, ctx, b.restId, { feature: 'friend', source: 'roach.lay', friend: 'required' }, async (p) => {
        const { me, them } = p;
        const rt = me.tuning.friend.roach;
        const day = gameDay(me.now);
        const max = rt.layBase * (me.rest.star_level + 1);
        if ((await getDaily(me.tx, me.rest.id, 'roach.lay', day)) >= max) throw limitReached('roach_lay', { max });
        const tables = await readTables(them);
        if (!isEmptyTable(findTable(tables, b.tableNo))) throw invalidState('table_occupied');
        await writeTables(
          them,
          tables.map((tb) =>
            tb.no === b.tableNo
              ? { no: tb.no, floor: tb.floor, customer: 3, roach: { by: me.rest.id, at: me.now.toISOString() } }
              : tb,
          ),
        );
        const r = layReward(me.rest.level, rt);
        gainCoin(me, r.coin);
        gainExp(me, r.exp);
        await incrementDaily(me.tx, me.rest.id, 'roach.lay', 1, day);
        await incrementDaily(me.tx, them.rest.id, 'roach.laidOn', 1, day);
        await emitAction(me, 'roach.lay');
        feedLog(p, 'roach.laid', { table: b.tableNo });
        return r;
      });
    },

    kill(ctx: RestCtx, b: { restId: number; tableNo: number }) {
      if (b.restId === ctx.restaurantId)
        return runOp(d, ctx, { feature: 'friend', source: 'roach.kill' }, (o) => killIn(o, o, 'self', b.tableNo, null));
      return runPairOp(d, ctx, b.restId, { feature: 'friend', source: 'roach.kill', friend: 'required' }, (p) =>
        killIn(p.me, p.them, p.them.rest.npc ? 'npc' : 'friend', b.tableNo, p),
      );
    },
  };
}
```

`service.ts` 加 `roach: createRoach(d),`；`routes.ts` 加（`restTableBody` 从 `@dt/shared` 导入）：

```ts
    r.post('/roach/lay', async (req) => okOp(await svc.roach.lay(restCtxOf(req), parse(restTableBody, req.body))));
    r.post('/roach/kill', async (req) => okOp(await svc.roach.kill(restCtxOf(req), parse(restTableBody, req.body))));
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/interact/roach.test.ts`
Expected: PASS 5/5

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/server/src/modules/interact/roach.ts apps/server/src/modules/interact/roach.test.ts apps/server/src/modules/friend packages/shared
git commit -m "feat(server): lay cockroaches on friends' tables and kill them at home, at friends' or at krab's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 帮好友加油、翻橱

**Files:**
- Modify: `packages/shared/src/schemas/friend.ts`（`refuelBody`、`flipBody`、`FlipSlotsDto`、`FlipResultDto`）
- Create: `apps/server/src/modules/interact/refuel.ts`
- Create: `apps/server/src/modules/interact/flip.ts`
- Create: `apps/server/src/modules/interact/refuel-flip.test.ts`
- Modify: `apps/server/src/modules/friend/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: `runPairOp`、`feedLog`；`refuelDraws`、`flipSlots`、`flipCoolMs`、`caughtCoin`、`drawDtTickets`（Task 4）；`addFoods`、`subFoods`（cupboard/foods）
- Produces: `createRefuel(d)` → `{ refuel(ctx, { restId, num }): Promise<OpResult<{ oil: number; tickets: number }>> }`；`createFlip(d)` → `{ slots(ctx, restId): Promise<FlipSlotsDto>; flip(ctx, { restId, slotNo }): Promise<OpResult<FlipResultDto>> }`；接口 `POST /friend/refuel`、`GET /friend/cupboard/:restId`、`POST /cupboard/flip`

- [ ] **Step 1: 共享 schema**（追加到 `friend.ts`）

```ts
export const refuelBody = z.object({
  restId,
  /** -1 = 加满 */
  num: z.union([z.literal(-1), z.number().int().min(1).max(100_000_000)]),
});
export const flipBody = z.object({ restId, slotNo: z.number().int().min(1).max(200) });

export interface FlipSlotsDto {
  slots: number;
  cooling: Array<{ slotNo: number; until: string }>;
  /** 我今天已经翻了几次（超过 100 次每次 2 体力） */
  todayTimes: number;
}

export type FlipOutcome = 'food' | 'ticket' | 'nothing' | 'caught' | 'escaped';

export interface FlipResultDto {
  outcome: FlipOutcome;
  foodsId: number | null;
  /** 被夹时掉的银币 */
  coin: number;
  strength: number;
  dtTickets: number;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/modules/interact/refuel-flip.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  foodNum,
  goodsNum,
  newPair,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { upsertEffectSource } from '../effects/service';
import { grantGoods } from '../store/grant';

const config = testConfig();
const FOOD = config.foodsByLevel.get(2)![0]!.id;
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const svc = () => t.game.social;

async function friends(a: NewRestaurantOptions = {}, b: NewRestaurantOptions = {}) {
  seq = [0.99];
  t.clock.set(new Date());
  const pair = await newPair(t, a, b);
  await befriend(t, pair[0].restaurantId, pair[1].restaurantId);
  return pair;
}

describe('帮好友加油（规格书 13 §13.5）', () => {
  it('加满：1 银币 1 油；停业的店恢复营业；对方收到动态', async () => {
    const [a, b] = await friends({ patch: { coin: 20000 } }, { patch: { oil: 0, oil_max: 20000, state: 2 } });
    const r = await svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 });
    expect(r.data).toEqual({ oil: 20000, tickets: 0 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 0 });
    expect(await restRow(t, b.restaurantId)).toMatchObject({ oil: 20000, state: 1 });
  });

  it('银币不够时按现有银币加；指定数量；油满和没银币时报错', async () => {
    const [a, b] = await friends({ patch: { coin: 300 } }, { patch: { oil: 0, oil_max: 1000 } });
    expect((await svc().refuel.refuel(a, { restId: b.restaurantId, num: 100 })).data.oil).toBe(100);
    expect((await svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 })).data.oil).toBe(200);
    await expect(svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
    await t.db.updateTable('restaurant').set({ oil: 1000, coin: 10 }).where('id', '=', b.restaurantId).execute();
    await expect(svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 })).rejects.toMatchObject({
      params: { reason: 'friend_oil_full' },
    });
  });
});

describe('翻橱（规格书 05 §5.7）', () => {
  it('翻到食材：对方 -1、我 +1；这个位置冷却 22 小时；扣 1 体力', async () => {
    const [a, b] = await friends({ patch: { coin: 100 } }, { foods: { [FOOD]: 5 } });
    seq = [0];
    const r = await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 });
    expect(r.data).toMatchObject({ outcome: 'food', foodsId: FOOD, strength: 1 });
    expect((await foodNum(t, a.restaurantId, FOOD)).num).toBe(1);
    expect((await foodNum(t, b.restaurantId, FOOD)).num).toBe(4);
    expect((await restRow(t, a.restaurantId)).strength).toBe(99);
    const slots = await svc().flip.slots(a, b.restaurantId);
    expect(slots.slots).toBe(5);
    expect(slots.cooling).toEqual([
      { slotNo: 1, until: new Date(t.clock.now.getTime() + 22 * 3600_000).toISOString() },
    ]);
    expect(slots.todayTimes).toBe(1);
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 })).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'flip' },
    });
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 6 })).rejects.toMatchObject({
      params: { reason: 'bad_slot' },
    });
  });

  it('被老鼠夹夹住：银币给对方（低于 2 星减半）', async () => {
    const [a, b] = await friends({ patch: { coin: 1000, level: 10 } }, { foods: { [FOOD]: 5 } });
    await upsertEffectSource(t.db, b.restaurantId, {
      sourceType: 'device',
      sourceId: 4,
      effects: { trapRate: 1 },
      expiresAt: null,
    });
    seq = [0.5];
    const r = await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 2 });
    expect(r.data).toMatchObject({ outcome: 'caught', coin: 375 });
    expect((await restRow(t, a.restaurantId)).coin).toBe(625);
    expect((await restRow(t, b.restaurantId)).coin).toBe(375);
  });

  it('对方有神灯：80% 直接失败，不扣体力、不占冷却（设计文档 裁定 6）', async () => {
    const [a, b] = await friends({ patch: { coin: 100 } });
    await grantGoods(t.db, config, b.restaurantId, GOODS.magicLamp, 1, t.clock.now);
    seq = [0];
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 })).rejects.toMatchObject({
      params: { reason: 'blessed' },
    });
    expect((await restRow(t, a.restaurantId)).strength).toBe(100);
    expect((await svc().flip.slots(a, b.restaurantId)).cooling).toEqual([]);
  });

  it('对方橱柜空：改为神秘礼券；没翻中：什么都没有；没银币不能翻', async () => {
    const [a, b] = await friends({ patch: { coin: 100 } });
    seq = [0];
    expect((await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 })).data.outcome).toBe('ticket');
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(1);
    seq = [0.99];
    expect((await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 2 })).data.outcome).toBe('nothing');
    await t.db.updateTable('restaurant').set({ coin: 0 }).where('id', '=', a.restaurantId).execute();
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 3 })).rejects.toMatchObject({
      params: { kind: 'coin' },
    });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/interact/refuel-flip.test.ts`
Expected: FAIL（`refuel` / `flip` 未定义）

- [ ] **Step 4: 实现**

`apps/server/src/modules/interact/refuel.ts`：

```ts
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough } from '../../core/errors';
import { restLog, setRest } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainOil, spendCoin } from '../../core/resources';
import { drawDtTickets } from '../../core/tickets';
import { refuelDraws } from './rules';

/** 帮好友加油（规格书 13 §13.5） */
export function createRefuel(d: GameDeps) {
  return {
    refuel(ctx: RestCtx, b: { restId: number; num: number }) {
      return runPairOp(d, ctx, b.restId, { feature: 'friend', source: 'friend.refuel', friend: 'required' }, async (p) => {
        const { me, them } = p;
        const need = them.rest.oil_max - them.rest.oil;
        if (need <= 0) throw invalidState('friend_oil_full');
        if (me.rest.coin <= 0) throw notEnough('coin', 1, me.rest.coin);
        const add = Math.min(need, b.num === -1 ? need : b.num, me.rest.coin);
        spendCoin(me, add);
        gainOil(them, add, { event: false });
        if (them.rest.state === 2 && them.rest.oil > 0) {
          setRest(them, 'state', 1);
          setRest(them, 'state_reason', null);
          restLog(them, 'rest.reopen');
        }
        const tickets = await drawDtTickets(me, refuelDraws(add, them.rest.oil_max, me.tuning.friend.refuel));
        await emitAction(me, 'friend.refuel');
        feedLog(p, 'friend.refuel', { oil: add });
        return { oil: add, tickets };
      });
    },
  };
}
```

`apps/server/src/modules/interact/flip.ts`：

```ts
import { GOODS, type Food } from '@dt/config';
import {
  buildPool,
  ErrorCode,
  gameDay,
  luckRate,
  pickWeighted,
  type FlipOutcome,
  type FlipResultDto,
  type FlipSlotsDto,
  type Rng,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, spendCoin, spendStrength } from '../../core/resources';
import { drawDtTickets } from '../../core/tickets';
import { AppError } from '../../http/errors';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { addFoods, subFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import { caughtCoin, flipCoolMs, flipSlots } from './rules';

/** 从对方未锁定的 1~5 级食材里按 odds 抽一种；没有返回 null */
async function pickFood(op: Op, rng: Rng): Promise<number | null> {
  const rows = await op.tx
    .selectFrom('cupboard_food')
    .select('foods_id')
    .where('rest_id', '=', op.rest.id)
    .where('num', '>', 0)
    .where('locked', '=', false)
    .orderBy('foods_id')
    .execute();
  const foods = rows
    .map((r) => op.config.foods.get(r.foods_id))
    .filter((f): f is Food => f !== undefined && f.level >= 1 && f.level <= 5);
  if (foods.length === 0) return null;
  return pickWeighted(buildPool(foods, (f) => f.odds), rng).id;
}

/** 翻好友橱柜（规格书 05 §5.7） */
export function createFlip(d: GameDeps) {
  return {
    async slots(ctx: RestCtx, restId: number): Promise<FlipSlotsDto> {
      const r = await d.db
        .selectFrom('restaurant')
        .select(['shard_id', 'star_level'])
        .where('id', '=', restId)
        .executeTakeFirst();
      if (!r || r.shard_id !== ctx.shardId) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      const { tuning } = await d.shards.settings(ctx.shardId);
      const now = d.now();
      const rows = await d.db
        .selectFrom('cupboard_flip')
        .select(['slot_no', 'cool_until'])
        .where('host_rest_id', '=', restId)
        .where('cool_until', '>', now)
        .orderBy('slot_no')
        .execute();
      return {
        slots: flipSlots(r.star_level, tuning.friend.flip),
        cooling: rows.map((x) => ({ slotNo: x.slot_no, until: x.cool_until.toISOString() })),
        todayTimes: await getDaily(d.db, ctx.restaurantId, 'flip.times', gameDay(now)),
      };
    },

    flip(ctx: RestCtx, b: { restId: number; slotNo: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'cupboard.flip', friend: 'required' },
        async (p): Promise<FlipResultDto> => {
          const { me, them } = p;
          const t = me.tuning.friend.flip;
          const day = gameDay(me.now);
          const max = flipSlots(them.rest.star_level, t);
          if (b.slotNo > max) throw invalidState('bad_slot', { max });
          const cool = await me.tx
            .selectFrom('cupboard_flip')
            .select('cool_until')
            .where('host_rest_id', '=', them.rest.id)
            .where('slot_no', '=', b.slotNo)
            .executeTakeFirst();
          if (cool && cool.cool_until > me.now)
            throw new AppError(ErrorCode.COOLDOWN, 400, { what: 'flip', until: cool.cool_until.toISOString() });
          if (me.rest.coin <= 0) throw notEnough('coin', 1, me.rest.coin);
          const n = (await getDaily(me.tx, me.rest.id, 'flip.times', day)) + 1;
          const meAgg = await opAgg(me);
          const themAgg = await opAgg(them);
          let strength = n <= t.cheapTimes ? 1 : 2;
          if (me.rng.chance(meAgg.flipCBNoStrengthRate ?? 0)) strength = 0;
          spendStrength(me, strength);
          const luck = luckRate((await opLuck(me)).sum - (await opLuck(them)).sum) / t.luckDivisor;
          const godsHand = (meAgg.godHand ?? 0) > 0 && n < (meAgg.godHand ?? 0);
          let outcome: FlipOutcome = 'nothing';
          let foodsId: number | null = null;
          let coin = 0;
          const trap = themAgg.trapRate ?? 0;
          if (!godsHand && trap > 0 && me.rng.chance(trap)) {
            if (me.rng.chance(luck)) outcome = 'escaped';
            else {
              outcome = 'caught';
              coin = caughtCoin(me.rest.level, me.rest.star_level, them.rest.npc, me.rng, t);
              if (coin > 0 && me.rng.chance(meAgg.flipNoLostCoinRate ?? 0)) coin = 0;
              coin = Math.min(coin, me.rest.coin);
              if (coin > 0) {
                spendCoin(me, coin);
                gainCoin(them, coin, { event: false });
              }
              await incrementDaily(me.tx, me.rest.id, 'flip.caught', 1, day);
            }
          } else {
            if ((themAgg.magicLamp ?? 0) > 0 && me.rng.chance(t.blessedRate)) throw invalidState('blessed');
            let ticket = false;
            if (godsHand || me.rng.next() - luck < t.hitRate) {
              foodsId = await pickFood(them, me.rng);
              if (foodsId === null) ticket = true;
              else {
                await subFoods(them, foodsId, 1, { event: false });
                await addFoods(me, foodsId, 1);
                outcome = 'food';
              }
            } else if (me.rng.next() - luck < (t.handleFoodsRate + t.handleFoodsRatePerStar * me.rest.star_level) / 2)
              ticket = true;
            if (ticket) {
              await grantGoodsOp(me, GOODS.mysteryTicket, 1);
              outcome = 'ticket';
            }
          }
          const dtTickets = await drawDtTickets(me, n <= t.cheapTimes && me.rng.next() < luck ? 2 : 1);
          const coolUntil = new Date(me.now.getTime() + flipCoolMs(them.rest.npc, me.rng, t));
          await me.tx
            .insertInto('cupboard_flip')
            .values({ host_rest_id: them.rest.id, slot_no: b.slotNo, by_rest_id: me.rest.id, cool_until: coolUntil })
            .onConflict((oc) =>
              oc.columns(['host_rest_id', 'slot_no']).doUpdateSet({ by_rest_id: me.rest.id, cool_until: coolUntil }),
            )
            .execute();
          await incrementDaily(me.tx, me.rest.id, 'flip.times', 1, day);
          await incrementDaily(me.tx, them.rest.id, 'flip.flipped', 1, day);
          await emitAction(me, 'cupboard.flip');
          feedLog(p, 'friend.flip', { slot: b.slotNo, outcome, ...(foodsId ? { foodsId } : {}), ...(coin ? { coin } : {}) });
          return { outcome, foodsId, coin, strength, dtTickets };
        },
      );
    },
  };
}
```

`service.ts` 加 `refuel: createRefuel(d), flip: createFlip(d),`；`routes.ts` 加（`refuelBody`、`flipBody` 从 `@dt/shared` 导入）：

```ts
    r.post('/friend/refuel', async (req) => okOp(await svc.refuel.refuel(restCtxOf(req), parse(refuelBody, req.body))));
    r.get('/friend/cupboard/:restId', async (req) =>
      ok(await svc.flip.slots(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.post('/cupboard/flip', async (req) => okOp(await svc.flip.flip(restCtxOf(req), parse(flipBody, req.body))));
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/interact/refuel-flip.test.ts`
Expected: PASS 6/6

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/interact apps/server/src/modules/friend
git commit -m "feat(server): refuel a friend and flip friends' cupboards (traps, god's hand, lamp, cooldowns)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: 交换食材

**Files:**
- Modify: `packages/shared/src/schemas/friend.ts`（`exchangeBody`、`exchangeFoodsQuery`、`ExchangeFoodsDto`、`ExchangeResultDto`）
- Create: `apps/server/src/modules/interact/honor.ts`
- Create: `apps/server/src/modules/interact/exchange.ts`
- Create: `apps/server/src/modules/interact/exchange.test.ts`
- Modify: `apps/server/src/modules/friend/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: `runPairOp`、`feedLog`；`exchangeFee`、`exchangeLimits`、`bangleRate`（Task 4）；`WorldService.ensure(shardId, now, db)`；`cupboardSlotsUsed`、`addFoods`、`subFoods`
- Produces: `extendHonor(op: Op, goodsId: number, hours: number): Promise<void>`；`createExchange(d, world)` → `{ foods(ctx, restId, level): Promise<ExchangeFoodsDto>; exchange(ctx, { restId, giveFoodsId, takeFoodsId }): Promise<OpResult<ExchangeResultDto>> }`；接口 `GET /friend/foods/:restId?level=`、`POST /foods/exchange`

- [ ] **Step 1: 共享 schema**（追加到 `friend.ts`）

```ts
const foodsId = z.number().int().positive();
export const exchangeBody = z.object({ restId, giveFoodsId: foodsId, takeFoodsId: foodsId });
export const exchangeFoodsQuery = z.object({ level: z.coerce.number().int().min(1).max(5) });

export interface ExchangeFoodsDto {
  level: number;
  /** 对方这个等级的食材；fee = 换它要付的手续费 */
  theirs: Array<{ foodsId: number; num: number; locked: boolean; fee: number }>;
  /** 我这个等级的食材 */
  mine: Array<{ foodsId: number; num: number }>;
  /** 今天和它还能换几次 */
  left: number;
  /** 飓风天：可以换对方锁定的食材 */
  storm: boolean;
  npc: boolean;
}

export interface ExchangeResultDto {
  /** caught = 飓风天偷换锁定食材被抓 */
  result: 'ok' | 'caught';
  fee: number;
  /** 对方有红内裤时我额外损失的食材 */
  redPantsFoodsId: number | null;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/modules/interact/exchange.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  foodNum,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { ensureNpc } from '../npc/npc';
import { grantGoods } from '../store/grant';

const config = testConfig();
const [F1, F2, F3] = config.foodsByLevel.get(2)!.slice(0, 3).map((f) => f.id) as [number, number, number];
const L1 = config.foodsByLevel.get(1)![0]!.id;
const STORM = config.bundle.weather.find((w) => w.effects.changeFoodsFlag === 1)!.id;
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const ex = () => t.game.social.exchange;
const fee = (id: number, locked = false) => {
  const f = config.requireFood(id);
  return Math.floor(f.coin * 0.5 * (100 / f.odds) * (locked ? 2 : 1));
};

async function friends(a: NewRestaurantOptions = {}, b: NewRestaurantOptions = {}) {
  seq = [0.99];
  const pair = await newPair(
    t,
    { foods: { [F1]: 5, [L1]: 5 }, patch: { coin: 10_000_000 }, ...a },
    { foods: { [F2]: 3 }, ...b },
  );
  await befriend(t, pair[0].restaurantId, pair[1].restaurantId);
  return pair;
}

async function setStorm(shardId: number) {
  await t.game.world.ensure(shardId);
  await t.db
    .updateTable('world_state')
    .set({ weather_id: STORM, weather_until: new Date(Date.now() + 3600_000) })
    .where('shard_id', '=', shardId)
    .execute();
}

describe('交换食材（规格书 05 §5.6）', () => {
  it('2 换 1：我 -2 A +1 B，对方 +1 A -1 B（设计文档 裁定 1）；付手续费给对方', async () => {
    const [a, b] = await friends();
    const r = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    expect(r.data).toEqual({ result: 'ok', fee: fee(F2), redPantsFoodsId: null });
    expect((await foodNum(t, a.restaurantId, F1)).num).toBe(3);
    expect((await foodNum(t, a.restaurantId, F2)).num).toBe(1);
    expect((await foodNum(t, b.restaurantId, F1)).num).toBe(1);
    expect((await foodNum(t, b.restaurantId, F2)).num).toBe(2);
    expect((await restRow(t, b.restaurantId)).coin).toBe(fee(F2));
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('exchange');
  });

  it('等级不同或超过 5 级不能换；我的不够 2 个不能换', async () => {
    const [a, b] = await friends();
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: L1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { reason: 'level_mismatch' } });
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F3, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'foods' } });
  });

  it('次数：和这个好友每天 14 − ⌊星/2⌋ 次；对方每天被换 10 + 星级 次', async () => {
    const [a, b] = await friends();
    const day = gameDay(t.clock.now);
    await incrementDaily(t.db, a.restaurantId, `exchange.with:${b.restaurantId}`, 14, day);
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { what: 'exchange', max: 14 } });
    const [c, e] = await friends();
    await incrementDaily(t.db, e.restaurantId, 'exchange.taken', 10, day);
    await expect(
      ex().exchange(c, { restId: e.restaurantId, giveFoodsId: F1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { what: 'exchange_taken', max: 10 } });
  });

  it('对方锁定的食材：平时不能换；飓风天可以换，50% 被抓（2 个 A 白给、得银手镯），对方得镇长的关心', async () => {
    const [a, b] = await friends();
    await t.db
      .updateTable('cupboard_food')
      .set({ locked: true })
      .where('rest_id', '=', b.restaurantId)
      .where('foods_id', '=', F2)
      .execute();
    await expect(
      ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 }),
    ).rejects.toMatchObject({ params: { reason: 'foods_locked' } });
    await setStorm(a.shardId);
    seq = [0];
    const caught = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    expect(caught.data.result).toBe('caught');
    expect((await foodNum(t, a.restaurantId, F1)).num).toBe(3);
    expect((await foodNum(t, b.restaurantId, F1)).num).toBe(2);
    expect((await foodNum(t, b.restaurantId, F2)).num).toBe(3);
    expect(await goodsNum(t, a.restaurantId, GOODS.bangle)).toBe(1);
    expect(await goodsNum(t, b.restaurantId, GOODS.townCare)).toBe(1);
    seq = [0.99];
    const ok = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    expect(ok.data).toMatchObject({ result: 'ok', fee: fee(F2, true) });
  });

  it('对方有红内裤、我星级比它高：额外损失 1 个同级食材给对方', async () => {
    const [a, b] = await friends({ foods: { [F1]: 5, [F3]: 5 }, patch: { coin: 10_000_000, star_level: 1 } });
    await grantGoods(t.db, config, b.restaurantId, GOODS.redPants, 1, t.clock.now);
    const r = await ex().exchange(a, { restId: b.restaurantId, giveFoodsId: F1, takeFoodsId: F2 });
    const lost = r.data.redPantsFoodsId!;
    expect([F1, F2, F3]).toContain(lost);
    expect((await foodNum(t, b.restaurantId, lost)).num).toBeGreaterThanOrEqual(1);
  });

  it('蟹老板：不收手续费；每天 8 − 星级 次；同一 IP 也受限', async () => {
    const [a] = await friends();
    const npc = (await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1))).id;
    await befriend(t, a.restaurantId, npc);
    await t.db.deleteFrom('cupboard_food').where('rest_id', '=', npc).execute();
    await t.db.insertInto('cupboard_food').values({ rest_id: npc, foods_id: F2, num: 50 }).execute();
    const r = await ex().exchange(a, { restId: npc, giveFoodsId: F1, takeFoodsId: F2 });
    expect(r.data.fee).toBe(0);
    await incrementDaily(t.db, a.restaurantId, 'exchange.krab', 7, gameDay(t.clock.now));
    await expect(ex().exchange(a, { restId: npc, giveFoodsId: F1, takeFoodsId: F2 })).rejects.toMatchObject({
      params: { what: 'exchange', max: 8 },
    });
    const c = await newRestaurant(t, {
      shardId: a.shardId,
      verified: true,
      foods: { [F1]: 5 },
      patch: { coin: 1_000_000 },
    });
    await befriend(t, c.restaurantId, npc);
    await t.deps.redis.set(`krabx:${c.shardId}:${gameDay(t.clock.now)}:ip:${c.ip}`, '8');
    await expect(ex().exchange(c, { restId: npc, giveFoodsId: F1, takeFoodsId: F2 })).rejects.toMatchObject({
      params: { what: 'exchange' },
    });
  });

  it('可交换食材列表：对方的（带锁定和手续费）、我的、剩余次数', async () => {
    const [a, b] = await friends();
    const r = await ex().foods(a, b.restaurantId, 2);
    expect(r).toMatchObject({
      level: 2,
      theirs: [{ foodsId: F2, num: 3, locked: false, fee: fee(F2) }],
      mine: [{ foodsId: F1, num: 5 }],
      left: 14,
      storm: false,
      npc: false,
    });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/interact/exchange.test.ts`
Expected: FAIL（`t.game.social.exchange` 为 undefined）

- [ ] **Step 4: 实现**

`apps/server/src/modules/interact/honor.ts`：

```ts
import type { Op } from '../../core/op';
import { grantGoodsOp } from '../store/goods';

/** 给勋章：已持有且没过期时在剩余时间上再加 hours 小时（规格书 05 §5.6 "或延长 1 小时"） */
export async function extendHonor(op: Op, goodsId: number, hours: number): Promise<void> {
  const row = await op.tx
    .selectFrom('store_item')
    .select('expires_at')
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  const left =
    row?.expires_at && row.expires_at > op.now ? (row.expires_at.getTime() - op.now.getTime()) / 3_600_000 : 0;
  await grantGoodsOp(op, goodsId, 1, { hours: left + hours });
}
```

`apps/server/src/modules/interact/exchange.ts`：

```ts
import { GOODS } from '@dt/config';
import { ErrorCode, gameDay, type ExchangeFoodsDto, type ExchangeResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { addFoods, cupboardSlotsUsed, subFoods } from '../cupboard/foods';
import type { WorldService } from '../world/service';
import { extendHonor } from './honor';
import { bangleRate, exchangeFee, exchangeLimits } from './rules';

const foodRow = (op: Op, foodsId: number) =>
  op.tx
    .selectFrom('cupboard_food')
    .select(['num', 'locked'])
    .where('rest_id', '=', op.rest.id)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();

/** 蟹老板交换的 IP / 设备计数键（当天有效） */
function krabKeys(ctx: RestCtx, day: string): string[] {
  const base = `krabx:${ctx.shardId}:${day}`;
  return [`${base}:ip:${ctx.ip}`, ...(ctx.deviceId ? [`${base}:dev:${ctx.deviceId}`] : [])];
}

/** 交换食材（规格书 05 §5.6） */
export function createExchange(d: GameDeps, world: WorldService) {
  async function storm(shardId: number, now: Date, op?: Op): Promise<boolean> {
    const w = await world.ensure(shardId, now, op?.tx ?? d.db);
    return (w.weather.effects.changeFoodsFlag ?? 0) === 1;
  }

  return {
    async foods(ctx: RestCtx, restId: number, level: number): Promise<ExchangeFoodsDto> {
      const them = await d.db
        .selectFrom('restaurant')
        .select(['shard_id', 'star_level', 'npc'])
        .where('id', '=', restId)
        .executeTakeFirst();
      if (!them || them.shard_id !== ctx.shardId) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      const me = await d.db
        .selectFrom('restaurant')
        .select('star_level')
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.friend.exchange;
      const now = d.now();
      const day = gameDay(now);
      const ofLevel = async (id: number) =>
        (
          await d.db
            .selectFrom('cupboard_food')
            .select(['foods_id', 'num', 'locked'])
            .where('rest_id', '=', id)
            .where('num', '>', 0)
            .orderBy('foods_id')
            .execute()
        ).filter((r) => d.config.foods.get(r.foods_id)?.level === level);
      const lim = exchangeLimits(me.star_level, them.star_level, t);
      const used = them.npc
        ? await getDaily(d.db, ctx.restaurantId, 'exchange.krab', day)
        : await getDaily(d.db, ctx.restaurantId, `exchange.with:${restId}`, day);
      return {
        level,
        theirs: (await ofLevel(restId)).map((r) => ({
          foodsId: r.foods_id,
          num: r.num,
          locked: r.locked,
          fee: them.npc ? 0 : exchangeFee(d.config.requireFood(r.foods_id), r.locked, t),
        })),
        mine: (await ofLevel(ctx.restaurantId)).map((r) => ({ foodsId: r.foods_id, num: r.num })),
        left: Math.max(0, (them.npc ? lim.npc : lim.perFriend) - used),
        storm: await storm(ctx.shardId, now),
        npc: them.npc,
      };
    },

    async exchange(ctx: RestCtx, b: { restId: number; giveFoodsId: number; takeFoodsId: number }) {
      let krab = false;
      const r = await runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'foods.exchange', friend: 'required' },
        async (p): Promise<ExchangeResultDto> => {
          const { me, them } = p;
          const t = me.tuning.friend.exchange;
          const day = gameDay(me.now);
          const give = me.config.foods.get(b.giveFoodsId);
          const take = me.config.foods.get(b.takeFoodsId);
          if (!give || !take || give.level !== take.level || give.level > t.maxLevel)
            throw invalidState('level_mismatch');
          const mine = await foodRow(me, give.id);
          if ((mine?.num ?? 0) < 2) throw notEnough('foods', 2, mine?.num ?? 0, give.id);
          const theirs = await foodRow(them, take.id);
          if (!theirs || theirs.num < 1) throw invalidState('target_no_food');
          const myTake = await foodRow(me, take.id);
          if ((myTake?.num ?? 0) === 0 && (await cupboardSlotsUsed(me.tx, me.rest.id)) >= me.rest.cupboard_num)
            throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
          const locked = theirs.locked;
          if (locked && !(await storm(me.shardId, me.now, me))) throw invalidState('foods_locked');

          const lim = exchangeLimits(me.rest.star_level, them.rest.star_level, t);
          if (them.rest.npc) {
            krab = true;
            if ((await getDaily(me.tx, me.rest.id, 'exchange.krab', day)) >= lim.npc)
              throw limitReached('exchange', { max: lim.npc });
            for (const key of krabKeys(ctx, day)) {
              if (Number((await d.redis.get(key)) ?? 0) >= lim.npc) throw limitReached('exchange', { max: lim.npc });
            }
            await incrementDaily(me.tx, me.rest.id, 'exchange.krab', 1, day);
          } else {
            const withKey = `exchange.with:${them.rest.id}`;
            if ((await getDaily(me.tx, me.rest.id, withKey, day)) >= lim.perFriend)
              throw limitReached('exchange', { max: lim.perFriend });
            if ((await getDaily(me.tx, me.rest.id, 'exchange.total', day)) >= lim.total)
              throw limitReached('exchange_total', { max: lim.total });
            if ((await getDaily(me.tx, them.rest.id, 'exchange.taken', day)) >= lim.taken)
              throw limitReached('exchange_taken', { max: lim.taken });
            await incrementDaily(me.tx, me.rest.id, withKey, 1, day);
            await incrementDaily(me.tx, me.rest.id, 'exchange.total', 1, day);
            await incrementDaily(me.tx, them.rest.id, 'exchange.taken', 1, day);
          }

          if (locked) {
            await extendHonor(them, GOODS.townCare, 1);
            if (me.rng.chance(t.stormCaughtRate)) {
              await subFoods(me, give.id, 2);
              await addFoods(them, give.id, 2, { event: false });
              if (me.rng.chance(bangleRate(take.level, take.odds, t))) await extendHonor(me, GOODS.bangle, 1);
              feedLog(p, 'exchange', { give: give.id, take: take.id, result: 'caught' });
              return { result: 'caught', fee: 0, redPantsFoodsId: null };
            }
          }
          await subFoods(me, give.id, 2);
          await addFoods(them, give.id, 1, { event: false });
          await subFoods(them, take.id, 1, { event: false });
          await addFoods(me, take.id, 1);
          let fee = 0;
          if (!them.rest.npc) {
            fee = exchangeFee(take, locked, t);
            if (fee > 0) {
              spendCoin(me, fee);
              gainCoin(them, fee, { event: false });
            }
          }
          let redPantsFoodsId: number | null = null;
          if (me.rest.star_level > them.rest.star_level && ((await opAgg(them)).redPants ?? 0) > 0) {
            const pool = (
              await me.tx
                .selectFrom('cupboard_food')
                .select('foods_id')
                .where('rest_id', '=', me.rest.id)
                .where('num', '>', 0)
                .orderBy('foods_id')
                .execute()
            )
              .map((x) => x.foods_id)
              .filter((id) => me.config.foods.get(id)?.level === give.level);
            if (pool.length > 0) {
              redPantsFoodsId = pool[me.rng.int(pool.length)]!;
              await subFoods(me, redPantsFoodsId, 1);
              await addFoods(them, redPantsFoodsId, 1, { event: false });
            }
          }
          await emitAction(me, 'foods.exchange');
          feedLog(p, 'exchange', { give: give.id, take: take.id, result: 'ok' });
          return { result: 'ok', fee, redPantsFoodsId };
        },
      );
      if (krab) {
        for (const key of krabKeys(ctx, gameDay(d.now()))) {
          await d.redis.incr(key);
          await d.redis.expire(key, 2 * 86_400);
        }
      }
      return r;
    },
  };
}
```

`service.ts`：`createSocialService(d, world)` 的返回对象加 `exchange: createExchange(d, world),`，并删掉 `void world;`。`routes.ts` 加（`exchangeBody`、`exchangeFoodsQuery` 从 `@dt/shared` 导入）：

```ts
    r.get('/friend/foods/:restId', async (req) =>
      ok(
        await svc.exchange.foods(
          restCtxOf(req),
          parse(restIdParam, req.params).restId,
          parse(exchangeFoodsQuery, req.query).level,
        ),
      ),
    );
    r.post('/foods/exchange', async (req) =>
      okOp(await svc.exchange.exchange(restCtxOf(req), parse(exchangeBody, req.body))),
    );
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/interact/exchange.test.ts`
Expected: PASS 7/7

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/interact apps/server/src/modules/friend
git commit -m "feat(server): exchange foods with friends and krab (fees, limits, storm, red pants, ip limits)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 点赞、一键回赞

**Files:**
- Modify: `packages/shared/src/schemas/friend.ts`（`ThumbResultDto`、`ThumbTodayDto`、`ReturnAllDto`）
- Create: `apps/server/src/modules/interact/thumbs.ts`
- Create: `apps/server/src/modules/interact/thumbs.test.ts`
- Modify: `apps/server/src/modules/friend/service.ts`、`routes.ts`

**Interfaces:**
- Consumes: `runPairOp`、`feedLog`
- Produces: `createThumbs(d)` → `{ up(ctx, restId): Promise<OpResult<ThumbResultDto>>; returnAll(ctx): Promise<OpResult<ReturnAllDto>>; today(ctx): Promise<ThumbTodayDto[]> }`；接口 `GET /thumbs/today`、`POST /thumbs/up`、`POST /thumbs/returnAll`

- [ ] **Step 1: 共享 DTO**（追加到 `friend.ts`）

```ts
export interface ThumbResultDto {
  /** 我今天第几次点赞 */
  count: number;
  /** 前 10 次有奖励，之后每次扣 1 声望 */
  rewarded: boolean;
  tickets: number;
  strength: number;
}

export interface ThumbTodayDto {
  restId: number;
  name: string;
  avatar: number | null;
  at: string;
  /** 我已经回赞 */
  returned: boolean;
}

export interface ReturnAllDto {
  ok: number[];
  failed: Array<{ restId: number; code: string }>;
}
```

- [ ] **Step 2: 写失败的测试** `apps/server/src/modules/interact/thumbs.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { befriend, createTestGame, goodsNum, newPair, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { grantGoods } from '../store/grant';

const config = testConfig();
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const th = () => t.game.social.thumbs;

async function friends() {
  seq = [0.99];
  const [a, b] = await newPair(t);
  await befriend(t, a.restaurantId, b.restaurantId);
  return [a, b] as const;
}

describe('点赞（规格书 13 §13.7）', () => {
  it('前 10 次奖励 0~2 张礼券；对方被赞数 +1、收到动态', async () => {
    const [a, b] = await friends();
    const r = await th().up(a, b.restaurantId);
    expect(r.data).toEqual({ count: 1, rewarded: true, tickets: 2, strength: 0 });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(2);
    const c = await t.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', b.restaurantId)
      .where('key', '=', 'thumbs.received')
      .executeTakeFirstOrThrow();
    expect(c.count).toBe(1);
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('thumb');
  });

  it('同一天不能给同一家点两次；同一 IP 的另一个号也不行', async () => {
    const [a, b] = await friends();
    await th().up(a, b.restaurantId);
    await expect(th().up(a, b.restaurantId)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'thumb' } });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, c.restaurantId, b.restaurantId);
    await expect(th().up(c, b.restaurantId)).rejects.toMatchObject({ params: { what: 'thumb_ip' } });
  });

  it('超过 10 次：没有奖励、声望 -1；声望为负时不能点赞', async () => {
    const [a, b] = await friends();
    await incrementDaily(t.db, a.restaurantId, 'thumbs.given', 10, gameDay(t.clock.now));
    const r = await th().up(a, b.restaurantId);
    expect(r.data).toMatchObject({ count: 11, rewarded: false });
    expect((await restRow(t, a.restaurantId)).renown).toBe(-1);
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, a.restaurantId, c.restaurantId);
    await expect(th().up(a, c.restaurantId)).rejects.toMatchObject({ params: { reason: 'renown' } });
  });

  it('点赞王：按概率加 1~3 体力', async () => {
    const [a, b] = await friends();
    await grantGoods(t.db, config, a.restaurantId, GOODS.thumbKing, 1, t.clock.now);
    seq = [0];
    expect((await th().up(a, b.restaurantId)).data).toMatchObject({ tickets: 0, strength: 1 });
  });

  it('一键回赞：回赞今天赞过我、我还没回赞的人', async () => {
    const [a, b] = await friends();
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, c.restaurantId, b.restaurantId);
    await th().up(a, b.restaurantId);
    await th().up({ ...c, ip: '10.0.0.2' }, b.restaurantId);
    expect((await th().today(b)).map((x) => x.returned)).toEqual([false, false]);
    const r = await th().returnAll(b);
    expect(r.data.ok.sort((x, y) => x - y)).toEqual([a.restaurantId, c.restaurantId].sort((x, y) => x - y));
    expect(r.data.failed).toEqual([]);
    expect((await th().today(b)).every((x) => x.returned)).toBe(true);
    expect((await th().returnAll(b)).data.ok).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/interact/thumbs.test.ts`
Expected: FAIL（`t.game.social.thumbs` 为 undefined）

- [ ] **Step 4: 实现** `apps/server/src/modules/interact/thumbs.ts`

```ts
import { GOODS } from '@dt/config';
import {
  ErrorCode,
  gameDay,
  type GameEvent,
  type ReturnAllDto,
  type ThumbResultDto,
  type ThumbTodayDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import type { OpResult } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainRenown, gainStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { grantGoodsOp } from '../store/goods';

/** 点赞、一键回赞（规格书 13 §13.7） */
export function createThumbs(d: GameDeps) {
  function up(ctx: RestCtx, restId: number): Promise<OpResult<ThumbResultDto>> {
    return runPairOp(d, ctx, restId, { feature: 'friend', source: 'thumbs.up', friend: 'required' }, async (p) => {
      const { me, them } = p;
      const t = me.tuning.friend.thumbs;
      const day = gameDay(me.now);
      if (me.rest.renown < 0) throw requirement('renown');
      const done = await me.tx
        .selectFrom('thumb')
        .select('to_rest')
        .where('day', '=', day)
        .where('from_rest', '=', me.rest.id)
        .where('to_rest', '=', them.rest.id)
        .executeTakeFirst();
      if (done) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'thumb' });
      const ip = ctx.ip || null;
      if (ip) {
        const byIp = await me.tx
          .selectFrom('thumb')
          .select('to_rest')
          .where('day', '=', day)
          .where('ip', '=', ip)
          .where('to_rest', '=', them.rest.id)
          .executeTakeFirst();
        if (byIp) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'thumb_ip' });
      }
      await me.tx
        .insertInto('thumb')
        .values({ day, from_rest: me.rest.id, to_rest: them.rest.id, ip, created_at: me.now })
        .execute();
      const count = await incrementDaily(me.tx, me.rest.id, 'thumbs.given', 1, day);
      const rewarded = count <= t.rewardTimes;
      let tickets = 0;
      let strength = 0;
      if (rewarded) {
        tickets = me.rng.int(t.ticketMax + 1);
        await grantGoodsOp(me, GOODS.mysteryTicket, tickets);
        if (me.rng.chance((await opAgg(me)).getStrengthRate ?? 0)) {
          strength = me.rng.intMin1(t.strengthMax);
          gainStrength(me, strength);
        }
      } else gainRenown(me, t.overRenown);
      await me.tx
        .updateTable('thumb')
        .set({ returned: true })
        .where('day', '=', day)
        .where('from_rest', '=', them.rest.id)
        .where('to_rest', '=', me.rest.id)
        .execute();
      await emitAction(me, 'thumbs.up');
      await emitAction(them, 'thumbs.received');
      feedLog(p, 'thumb');
      return { count, rewarded, tickets, strength };
    });
  }

  return {
    up,

    async today(ctx: RestCtx): Promise<ThumbTodayDto[]> {
      const rows = await d.db
        .selectFrom('thumb as t')
        .innerJoin('restaurant as r', 'r.id', 't.from_rest')
        .select(['r.id', 'r.name', 'r.avatar', 't.created_at', 't.returned'])
        .where('t.day', '=', gameDay(d.now()))
        .where('t.to_rest', '=', ctx.restaurantId)
        .orderBy('t.created_at')
        .execute();
      return rows.map((r) => ({
        restId: r.id,
        name: r.name,
        avatar: r.avatar,
        at: r.created_at.toISOString(),
        returned: r.returned,
      }));
    },

    /** 逐家回赞，各自独立事务；失败的列出错误码，不影响其他 */
    async returnAll(ctx: RestCtx): Promise<OpResult<ReturnAllDto>> {
      const pending = await d.db
        .selectFrom('thumb')
        .select('from_rest')
        .where('day', '=', gameDay(d.now()))
        .where('to_rest', '=', ctx.restaurantId)
        .where('returned', '=', false)
        .orderBy('created_at')
        .execute();
      const data: ReturnAllDto = { ok: [], failed: [] };
      const events: GameEvent[] = [];
      for (const { from_rest } of pending) {
        try {
          const r = await up(ctx, from_rest);
          data.ok.push(from_rest);
          events.push(...r.events);
        } catch (e) {
          if (!(e instanceof AppError)) throw e;
          data.failed.push({ restId: from_rest, code: e.code });
        }
      }
      return { data, events };
    },
  };
}
```

`service.ts` 加 `thumbs: createThumbs(d),`；`routes.ts` 加：

```ts
    r.get('/thumbs/today', async (req) => ok(await svc.thumbs.today(restCtxOf(req))));
    r.post('/thumbs/up', async (req) => okOp(await svc.thumbs.up(restCtxOf(req), parse(restIdBody, req.body).restId)));
    r.post('/thumbs/returnAll', async (req) => okOp(await svc.thumbs.returnAll(restCtxOf(req))));
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/interact/thumbs.test.ts`
Expected: PASS 5/5

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/interact apps/server/src/modules/friend
git commit -m "feat(server): thumbs up with daily rewards, renown penalty, ip limit and return-all

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 装扮（门、头像、公告栏、个性图标）和后台发个性图标

**Files:**
- Modify: `packages/shared/src/schemas/friend.ts`（`doorBody`、`avatarBody`、`noticeBody`、`iconShowBody`、`MyLooksDto`）
- Modify: `packages/shared/src/schemas/admin.ts`（`grantIconBody`、`AdminIconDto`）
- Create: `apps/server/src/modules/friend/looks.ts`
- Create: `apps/server/src/modules/friend/looks.test.ts`
- Create: `apps/server/src/modules/admin/icons.ts`
- Create: `apps/server/src/modules/admin/icons.test.ts`
- Modify: `apps/server/src/modules/friend/service.ts`、`routes.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`

**Interfaces:**
- Produces: `cleanNotice(s: string): string`；`createLooks(d)` → `{ mine(ctx): Promise<MyLooksDto>; door(ctx, door); avatar(ctx, avatar); notice(ctx, text); iconShow(ctx, iconId, shown) }`；`createAdminIcons(game)` → `{ list(restId); grant(actor, restId, key); revoke(actor, restId, iconId) }`；接口 `GET /rest/looks`、`POST /rest/door`、`/rest/avatar`、`/rest/notice`、`/rest/icon/show`；后台 `GET /admin/restaurants/:id/icons`（mod）、`POST /admin/restaurants/:id/icons`（admin）、`POST /admin/restaurants/:id/icons/:iconId/revoke`（admin）

- [ ] **Step 1: 共享 schema**

追加到 `friend.ts`：

```ts
export const doorBody = z.object({ door: z.number().int().min(0).max(1000) });
export const avatarBody = z.object({ avatar: z.number().int().min(1).max(1000) });
export const noticeBody = z.object({ text: z.string().max(200) });
export const iconShowBody = z.object({ iconId: z.number().int().positive(), shown: z.boolean() });

export interface MyLooksDto {
  door: number;
  avatar: number | null;
  notice: string;
  icons: Array<{ id: number; key: string; title: string; desc: string; shown: boolean }>;
}
```

追加到 `admin.ts`：

```ts
export const grantIconBody = z.object({ key: z.string().regex(/^[a-z0-9_-]{1,32}$/) });

export interface AdminIconDto {
  id: number;
  key: string;
  title: string;
  shown: boolean;
  grantedAt: string;
}
```

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/friend/looks.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';
import { cleanNotice } from './looks';

let t: TestGame;
let ctx: TestContext;
beforeAll(async () => {
  t = await createTestGame();
  ctx = await createTestApp();
});
afterAll(async () => {
  await t.close();
  await ctx.close();
});
const looks = () => t.game.social.looks;

describe('装扮（规格书 02 §2.8）', () => {
  it('换门 20000 银币，换回默认门免费；门不存在、和现在一样时报错', async () => {
    const a = await newRestaurant(t, { patch: { coin: 30_000 } });
    await looks().door(a, 2);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ door: 2, coin: 10_000 });
    await expect(looks().door(a, 2)).rejects.toMatchObject({ params: { reason: 'same_door' } });
    await expect(looks().door(a, 99)).rejects.toMatchObject({ params: { reason: 'bad_look' } });
    await expect(looks().door(a, 3)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    await looks().door(a, 0);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ door: 0, coin: 10_000 });
  });

  it('头像只能选列表里的', async () => {
    const a = await newRestaurant(t);
    await looks().avatar(a, 5);
    expect((await restRow(t, a.restaurantId)).avatar).toBe(5);
    await expect(looks().avatar(a, 999)).rejects.toMatchObject({ params: { reason: 'bad_look' } });
  });

  it('公告栏：去掉换行以外的控制字符和首尾空白（Review Focus 5）', async () => {
    expect(cleanNotice('  你好\u0007\n明天见\u0000  ')).toBe('你好\n明天见');
    expect(cleanNotice('   ')).toBe('');
    const a = await newRestaurant(t);
    await looks().notice(a, ' 欢迎\u0001光临 ');
    expect((await restRow(t, a.restaurantId)).notice).toBe('欢迎光临');
  });

  it('个性图标最多展示 5 个；不是自己的图标不能动', async () => {
    const a = await newRestaurant(t);
    const keys = ['founder', 'helper', 'tester', 'champion', 'artist', 'chef'];
    const ids = (
      await t.db
        .insertInto('rest_icon')
        .values(keys.map((k) => ({ rest_id: a.restaurantId, icon_key: k })))
        .returning('id')
        .execute()
    ).map((r) => r.id);
    for (const id of ids.slice(0, 5)) await looks().iconShow(a, id, true);
    await expect(looks().iconShow(a, ids[5]!, true)).rejects.toMatchObject({ params: { what: 'icons', max: 5 } });
    await looks().iconShow(a, ids[0]!, false);
    await looks().iconShow(a, ids[5]!, true);
    const mine = await looks().mine(a);
    expect(mine.icons.filter((i) => i.shown)).toHaveLength(5);
    expect(mine.icons.find((i) => i.key === 'founder')).toMatchObject({ title: '开服元老', shown: false });
    const b = await newRestaurant(t);
    await expect(looks().iconShow(b, ids[1]!, false)).rejects.toMatchObject({ params: { reason: 'not_owned' } });
  });

  it('接口：公告超过 200 字返回 VALIDATION_FAILED', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const r = await call(ctx.app, 'POST', '/api/v1/rest/notice', { cookie: p.cookie, body: { text: 'x'.repeat(201) } });
    expect(r.json.code).toBe('VALIDATION_FAILED');
    const ok = await call(ctx.app, 'POST', '/api/v1/rest/notice', { cookie: p.cookie, body: { text: '你好' } });
    expect(ok.json.data).toEqual({ notice: '你好' });
  });
});
```

`apps/server/src/modules/admin/icons.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('后台发个性图标', () => {
  it('管理员发放、收回，写审计；协管只能看', async () => {
    const admin = await userWithRole(ctx, 'admin');
    const mod = await userWithRole(ctx, 'mod');
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const url = `/api/v1/admin/restaurants/${p.restId}/icons`;
    const g = await call(ctx.app, 'POST', url, { cookie: admin.cookie, body: { key: 'founder' } });
    expect(g.json.data).toEqual([expect.objectContaining({ key: 'founder', title: '开服元老', shown: false })]);
    expect((await call(ctx.app, 'POST', url, { cookie: mod.cookie, body: { key: 'helper' } })).status).toBe(404);
    expect((await call(ctx.app, 'GET', url, { cookie: mod.cookie })).json.data).toHaveLength(1);
    const bad = await call(ctx.app, 'POST', url, { cookie: admin.cookie, body: { key: 'nope' } });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    const id = g.json.data[0].id as number;
    const rv = await call(ctx.app, 'POST', `${url}/${id}/revoke`, { cookie: admin.cookie });
    expect(rv.json.data).toEqual([]);
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `restaurant:${p.restId}`)
      .orderBy('id')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(['restaurant.icon.grant', 'restaurant.icon.revoke']);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/friend/looks.test.ts apps/server/src/modules/admin/icons.test.ts`
Expected: FAIL（模块不存在 / 404）

- [ ] **Step 4: 实现**

`apps/server/src/modules/friend/looks.ts`：

```ts
import type { MyLooksDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { runOp, setRest, type Op, type OpResult } from '../../core/op';
import { spendCoin } from '../../core/resources';

/** 最多同时展示的个性图标数（规格书 02 §2.8） */
export const MAX_SHOWN_ICONS = 5;

/** 公告栏：去掉换行以外的控制字符，再去掉首尾空白（Review Focus 5） */
export function cleanNotice(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}

/** 餐厅装扮 */
export function createLooks(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'friend', source }, fn);

  return {
    async mine(ctx: RestCtx): Promise<MyLooksDto> {
      const r = await d.db
        .selectFrom('restaurant')
        .select(['door', 'avatar', 'notice'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const defs = new Map(d.config.bundle.looks.icons.map((i) => [i.key, i]));
      const rows = await d.db
        .selectFrom('rest_icon')
        .select(['id', 'icon_key', 'shown'])
        .where('rest_id', '=', ctx.restaurantId)
        .orderBy('id')
        .execute();
      return {
        door: r.door,
        avatar: r.avatar,
        notice: r.notice,
        icons: rows.flatMap((x) => {
          const def = defs.get(x.icon_key);
          return def ? [{ id: x.id, key: def.key, title: def.title, desc: def.desc, shown: x.shown }] : [];
        }),
      };
    },

    door(ctx: RestCtx, door: number) {
      return op(ctx, 'rest.door', async (o) => {
        const def = o.config.bundle.looks.doors.find((x) => x.id === door);
        if (!def) throw invalidState('bad_look');
        if (door === o.rest.door) throw invalidState('same_door');
        spendCoin(o, def.coin);
        setRest(o, 'door', door);
        return { door };
      });
    },

    avatar(ctx: RestCtx, avatar: number) {
      return op(ctx, 'rest.avatar', async (o) => {
        if (!o.config.bundle.looks.avatars.some((x) => x.id === avatar)) throw invalidState('bad_look');
        setRest(o, 'avatar', avatar);
        return { avatar };
      });
    },

    notice(ctx: RestCtx, text: string) {
      return op(ctx, 'rest.notice', async (o) => {
        const notice = cleanNotice(text);
        setRest(o, 'notice', notice);
        return { notice };
      });
    },

    iconShow(ctx: RestCtx, iconId: number, shown: boolean) {
      return op(ctx, 'rest.icon', async (o) => {
        const row = await o.tx
          .selectFrom('rest_icon')
          .select('shown')
          .where('id', '=', iconId)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (!row) throw invalidState('not_owned');
        if (shown && !row.shown) {
          const n = await o.tx
            .selectFrom('rest_icon')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('rest_id', '=', o.rest.id)
            .where('shown', '=', true)
            .executeTakeFirstOrThrow();
          if (Number(n.n) >= MAX_SHOWN_ICONS) throw limitReached('icons', { max: MAX_SHOWN_ICONS });
        }
        await o.tx.updateTable('rest_icon').set({ shown }).where('id', '=', iconId).execute();
        return { iconId, shown };
      });
    },
  };
}
```

`service.ts` 加 `looks: createLooks(d),`；`routes.ts` 加（`doorBody`、`avatarBody`、`noticeBody`、`iconShowBody` 从 `@dt/shared` 导入）：

```ts
    r.get('/rest/looks', async (req) => ok(await svc.looks.mine(restCtxOf(req))));
    r.post('/rest/door', async (req) => okOp(await svc.looks.door(restCtxOf(req), parse(doorBody, req.body).door)));
    r.post('/rest/avatar', async (req) =>
      okOp(await svc.looks.avatar(restCtxOf(req), parse(avatarBody, req.body).avatar)),
    );
    r.post('/rest/notice', async (req) =>
      okOp(await svc.looks.notice(restCtxOf(req), parse(noticeBody, req.body).text)),
    );
    r.post('/rest/icon/show', async (req) => {
      const b = parse(iconShowBody, req.body);
      return okOp(await svc.looks.iconShow(restCtxOf(req), b.iconId, b.shown));
    });
```

`apps/server/src/modules/admin/icons.ts`：

```ts
import { ErrorCode, type AdminIconDto } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

/** 后台的个性图标：发放、收回（设计文档 §4.12） */
export function createAdminIcons(game: Game) {
  const { db, config } = game.app;
  const defs = new Map(config.bundle.looks.icons.map((i) => [i.key, i]));

  async function list(restId: number): Promise<AdminIconDto[]> {
    const rows = await db
      .selectFrom('rest_icon')
      .select(['id', 'icon_key', 'shown', 'granted_at'])
      .where('rest_id', '=', restId)
      .orderBy('id')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      key: r.icon_key,
      title: defs.get(r.icon_key)?.title ?? r.icon_key,
      shown: r.shown,
      grantedAt: r.granted_at.toISOString(),
    }));
  }

  return {
    list,

    async grant(actor: AdminActor, restId: number, key: string): Promise<AdminIconDto[]> {
      if (!defs.has(key))
        throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: [{ path: 'key', message: 'unknown' }] });
      const r = await db.selectFrom('restaurant').select('id').where('id', '=', restId).executeTakeFirst();
      if (!r) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
      await db.transaction().execute(async (tx) => {
        await tx
          .insertInto('rest_icon')
          .values({ rest_id: restId, icon_key: key, granted_by: actor.accountId })
          .onConflict((oc) => oc.columns(['rest_id', 'icon_key']).doNothing())
          .execute();
        await writeAudit(tx, { actor, action: 'restaurant.icon.grant', target: `restaurant:${restId}`, detail: { key } });
      });
      return list(restId);
    },

    async revoke(actor: AdminActor, restId: number, iconId: number): Promise<AdminIconDto[]> {
      await db.transaction().execute(async (tx) => {
        const del = await tx
          .deleteFrom('rest_icon')
          .where('id', '=', iconId)
          .where('rest_id', '=', restId)
          .returning('icon_key')
          .executeTakeFirst();
        if (!del) throw new AppError(ErrorCode.NOT_FOUND, 404);
        await writeAudit(tx, {
          actor,
          action: 'restaurant.icon.revoke',
          target: `restaurant:${restId}`,
          detail: { key: del.icon_key },
        });
      });
      return list(restId);
    },
  };
}
```

`apps/server/src/modules/admin/routes.ts`（`grantIconBody` 从 `@dt/shared` 导入；`id(req)` 是文件里已有的取 `:id` 的函数）：

```ts
    const icons = createAdminIcons(game);
    r.get('/restaurants/:id/icons', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await icons.list(id(req)));
    });
    r.post('/restaurants/:id/icons', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await icons.grant(a, id(req), parse(grantIconBody, req.body).key));
    });
    r.post('/restaurants/:id/icons/:iconId/revoke', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const iconId = Number((req.params as { iconId: string }).iconId);
      if (!Number.isInteger(iconId) || iconId <= 0) throw new AppError(ErrorCode.NOT_FOUND, 404);
      return ok(await icons.revoke(a, id(req), iconId));
    });
```

（`AppError`、`ErrorCode` 若 routes.ts 里还没导入则补上。）

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/friend/looks.test.ts apps/server/src/modules/admin/icons.test.ts`
Expected: PASS 6/6

- [ ] **Step 6: 全量测试、提交**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过

```bash
git add packages/shared apps/server/src/modules/friend apps/server/src/modules/admin
git commit -m "feat(server): doors, avatars, notice board, personal icons; admin grants and revokes icons with audit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 周奖励、改名费、任务状态、模拟器机器人灭蟑螂

**Files:**
- Create: `apps/server/src/modules/friend/weekly.ts`
- Create: `apps/server/src/modules/friend/weekly.test.ts`
- Modify: `apps/server/src/game.ts`（周奖励任务）
- Modify: `apps/server/src/modules/growth/service.ts`（改名费）
- Modify: `apps/server/src/modules/task/rules.ts`、`service.ts`（`friends.count`、`rest.thumbs`）
- Modify: `apps/server/src/sim/bot.ts`、`bot.test.ts`

**Interfaces:**
- Produces:

```ts
export function mondayOf(day: string): string;
export function weeklyPeriod(now: Date): string;           // 被结算那一周的周一
export function lastWeekCount(db: Kysely<DB>, restId: number, key: string, now: Date): Promise<number>;
export function friendWeeklyJob(d: GameDeps): PeriodicJob;  // name 'friend-weekly'
export function stateValue(key, rest, counts, extra?: Record<string, number>): number | null;  // 新增第 4 个参数
```

- [ ] **Step 1: 写失败的测试** `apps/server/src/modules/friend/weekly.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GOODS } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { befriend, createTestGame, goodsNum, newPair, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { incrementDaily } from '../counter/dailyCounter';
import { friendWeeklyJob, lastWeekCount, mondayOf, weeklyPeriod } from './weekly';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('周期', () => {
  it('2026-10-05 是周一；07:59 之前结算上上周，之后结算上周', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(weeklyPeriod(new Date('2026-10-04T23:58:00Z'))).toBe('2026-09-21'); // 北京时间 10-05 07:58
    expect(weeklyPeriod(new Date('2026-10-04T23:59:00Z'))).toBe('2026-09-28'); // 北京时间 10-05 07:59
  });
});

describe('周奖励（规格书 16）', () => {
  it('上周被夹最多 → 神之一手；被翻前 4 → 四种勋章；灭蟑螂前 2 → 午夜蟑螂杀手；重复执行不重复发', async () => {
    const shardId = await createShard(t.db);
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => newRestaurant(t, { shardId })));
    const ids = rs.map((r) => r.restaurantId);
    const put = (i: number, key: string, n: number, day = '2026-09-30') =>
      incrementDaily(t.db, ids[i]!, key, n, day);
    await put(0, 'flip.caught', 3);
    await put(1, 'flip.caught', 1);
    for (const [i, n] of [5, 4, 3, 2, 1].entries()) await put(i, 'flip.flipped', n);
    await put(2, 'roach.kill', 9);
    await put(3, 'roach.kill', 9);
    await put(4, 'roach.kill', 20, '2026-10-05'); // 本周的不算
    t.clock.set(new Date('2026-10-05T00:30:00Z')); // 北京时间周一 08:30
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: vi.fn() } };
    const job = friendWeeklyJob(t.game.deps);
    await runDueJobs(deps, [job], { shardIds: [shardId] });
    await runDueJobs(deps, [job], { shardIds: [shardId] });
    expect(await goodsNum(t, ids[0]!, GOODS.godsHand)).toBe(1);
    expect(await goodsNum(t, ids[1]!, GOODS.godsHand)).toBe(0);
    expect(await goodsNum(t, ids[0]!, GOODS.heartache)).toBe(1);
    expect(await goodsNum(t, ids[1]!, GOODS.firecracker)).toBe(1);
    expect(await goodsNum(t, ids[2]!, GOODS.lantern)).toBe(1);
    expect(await goodsNum(t, ids[3]!, GOODS.fu)).toBe(1);
    expect(await goodsNum(t, ids[2]!, GOODS.roachKiller)).toBe(1);
    expect(await goodsNum(t, ids[3]!, GOODS.roachKiller)).toBe(1);
    expect(await goodsNum(t, ids[4]!, GOODS.roachKiller)).toBe(0);
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(news.filter((n) => n.type === 'friend.weekly')).toHaveLength(7);
    t.clock.set(new Date());
  });
});

describe('改名费（规格书 02 §2.8）', () => {
  it('= 上周被放蟑螂数 × 100 × 等级 × (星级 + 1)', async () => {
    const a = await newRestaurant(t, { patch: { level: 10, star_level: 1, coin: 100_000 }, goods: { 53: 1 } });
    t.clock.set(new Date('2026-10-07T04:00:00Z'));
    await incrementDaily(t.db, a.restaurantId, 'roach.laidOn', 2, '2026-09-29');
    await incrementDaily(t.db, a.restaurantId, 'roach.laidOn', 5, '2026-10-06'); // 本周的不算
    expect(await lastWeekCount(t.db, a.restaurantId, 'roach.laidOn', t.clock.now)).toBe(2);
    await t.game.growth.rename(a, `改${a.restaurantId}`);
    expect((await restRow(t, a.restaurantId)).coin).toBe(100_000 - 2 * 100 * 10 * 2);
    t.clock.set(new Date());
  });
});

describe('任务状态', () => {
  it('第 9 步"添加一位好友"看好友数（含蟹老板）；支线"被点赞 100 次"看被赞数', async () => {
    const [a, b] = await newPair(t, { patch: { main_task_step: 9 } });
    expect((await t.game.task.tasks(a)).main).toMatchObject({ step: 9, done: false });
    await befriend(t, a.restaurantId, b.restaurantId);
    expect((await t.game.task.tasks(a)).main).toMatchObject({ step: 9, progress: 1, done: true });
    await t.db
      .insertInto('event_counter')
      .values({ rest_id: a.restaurantId, key: 'thumbs.received', count: 100 })
      .execute();
    await t.db.updateTable('restaurant').set({ main_task_step: 40 }).where('id', '=', a.restaurantId).execute();
    const side = (await t.game.task.tasks(a)).side.find((x) => x.key === 'rest.thumbs');
    expect(side).toMatchObject({ progress: 100, done: true });
  });
});
```

`apps/server/src/sim/bot.test.ts` 追加：

```ts
  it('有体力时灭掉自己店里的蟑螂', async () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: null, at: '2026-09-30T00:00:00Z' } },
      { no: 2, floor: 1, customer: 0 },
    ];
    const ctx = await newRestaurant(t, { patch: { coin: 1000 }, tables });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    expect(r.tables.find((x) => x.no === 1)!.customer).not.toBe(3);
  }, 60_000);
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/server/src/modules/friend/weekly.test.ts apps/server/src/sim/bot.test.ts`
Expected: FAIL（`./weekly` 不存在；机器人不灭蟑螂）

- [ ] **Step 3: 实现**

`apps/server/src/modules/friend/weekly.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { GOODS } from '@dt/config';
import { addDays, gameDay, gameParts, gameTime } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { opNews, restLog, runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { grantGoodsOp } from '../store/goods';

/** 游戏日 day 所在周的周一 */
export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** 周奖励的周期：每周一 07:59 结算上一周；返回被结算那一周的周一 */
export function weeklyPeriod(now: Date): string {
  const mon = mondayOf(gameParts(now).day);
  return now >= gameTime(mon, 7, 59) ? addDays(mon, -7) : addDays(mon, -14);
}

async function sumBetween(db: Kysely<DB>, restId: number, key: string, from: string, to: string): Promise<number> {
  const r = await db
    .selectFrom('daily_counter')
    .select(sql<number>`coalesce(sum(count), 0)::int`.as('n'))
    .where('rest_id', '=', restId)
    .where('key', '=', key)
    .where('day', '>=', from)
    .where('day', '<=', to)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 上周（周一到周日）某个每日计数之和；改名费用"上周被放蟑螂数" */
export function lastWeekCount(db: Kysely<DB>, restId: number, key: string, now: Date): Promise<number> {
  const mon = mondayOf(gameDay(now));
  return sumBetween(db, restId, key, addDays(mon, -7), addDays(mon, -1));
}

const AWARDS: Array<{ key: string; goods: number[] }> = [
  { key: 'flip.caught', goods: [GOODS.godsHand] },
  { key: 'flip.flipped', goods: [GOODS.heartache, GOODS.firecracker, GOODS.lantern, GOODS.fu] },
  { key: 'roach.kill', goods: [GOODS.roachKiller, GOODS.roachKiller] },
];

/** 周奖励（规格书 16）：按上周计数排名，并列按餐厅 id；计数为 0 不发；排除蟹老板 */
export function friendWeeklyJob(d: GameDeps): PeriodicJob {
  return {
    name: 'friend-weekly',
    feature: 'friend',
    period: (now) => weeklyPeriod(now),
    run: async ({ shardId, period, now }) => {
      const to = addDays(period, 6);
      let awarded = 0;
      for (const a of AWARDS) {
        const top = await d.db
          .selectFrom('daily_counter as c')
          .innerJoin('restaurant as r', 'r.id', 'c.rest_id')
          .select(['c.rest_id', sql<number>`sum(c.count)::int`.as('n')])
          .where('r.shard_id', '=', shardId)
          .where('r.npc', '=', false)
          .where('c.key', '=', a.key)
          .where('c.day', '>=', period)
          .where('c.day', '<=', to)
          .groupBy('c.rest_id')
          .having(sql`sum(c.count)`, '>', 0)
          .orderBy('n', 'desc')
          .orderBy('c.rest_id')
          .limit(a.goods.length)
          .execute();
        for (const [i, w] of top.entries()) {
          const goodsId = a.goods[i]!;
          await runSystemOp(d, shardId, w.rest_id, { source: 'friend.weekly', now }, async (op) => {
            await grantGoodsOp(op, goodsId, 1, { event: false });
            restLog(op, 'friend.weekly', { key: a.key, rank: i + 1, goodsId, count: Number(w.n) });
            opNews(op, 'friend.weekly', { key: a.key, rank: i + 1, goodsId, name: op.rest.name });
          });
          awarded += 1;
        }
      }
      return { week: period, awarded };
    },
  };
}
```

`apps/server/src/game.ts`：`jobs.push(...npcJobs(deps));` 之后加 `jobs.push(friendWeeklyJob(deps));`。

`apps/server/src/modules/growth/service.ts` 的 `rename`：把

```ts
        // 上周被放蟑螂数：子项目 3 接入前为 0（设计文档 裁定 8）
        const roaches = 0;
```

换成

```ts
        const roaches = await lastWeekCount(o.tx, o.rest.id, 'roach.laidOn', o.now);
```

（`import { lastWeekCount } from '../friend/weekly';`）

`apps/server/src/modules/task/rules.ts`：`stateValue` 加第 4 个参数，函数开头先查它：

```ts
export function stateValue(
  key: string,
  rest: { level: number; star_level: number; oil_level: number },
  counts: CookbookCounts,
  extra: Record<string, number> = {},
): number | null {
  if (key in extra) return extra[key]!;
```

`apps/server/src/modules/task/service.ts` 的 `snapshot`：在 `const counts = ...` 之后加

```ts
    const friends = await db
      .selectFrom('friend')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirstOrThrow();
    const extra = { 'friends.count': Number(friends.n), 'rest.thumbs': counters.get('thumbs.received') ?? 0 };
```

并把 `stateValue(t.cond.key, rest, counts)` 改成 `stateValue(t.cond.key, rest, counts, extra)`。

`apps/server/src/sim/bot.ts` 的 `botTurn`：在 `if (r.oil < r.oilMax * 0.6) await attempt(() => game.growth.refuel(ctx));` 之后加

```ts
  // 自然蟑螂占着餐桌不走，有体力就灭掉（自己店不要求验证邮箱）
  for (const tb of await game.restaurant.floor(ctx.restaurantId)) {
    if (tb.customer !== 3) continue;
    if (!(await attempt(() => game.social.roach.kill(ctx, { restId: ctx.restaurantId, tableNo: tb.no })))) break;
  }
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/server/src/modules/friend/weekly.test.ts apps/server/src/sim apps/server/src/modules/task apps/server/src/modules/growth`
Expected: PASS

- [ ] **Step 5: 全量测试、提交**

Run: `pnpm test && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/server
git commit -m "feat(server): weekly friend awards, rename fee from last week's roaches, friends/thumbs task states, bots kill roaches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: 前端——接口、错误文案、好友页、导航红点

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`
- Modify: `apps/web/src/i18n/zh-CN.ts`、`zh-CN.test.ts`
- Create: `apps/web/src/stores/friends.ts`
- Modify: `apps/web/src/components/BottomNav.vue`
- Create: `apps/web/src/components/BottomNav.test.ts`
- Create: `apps/web/src/utils/feed.ts`、`feed.test.ts`
- Create: `apps/web/src/views/FriendsView.vue`、`FriendsView.test.ts`
- Modify: `apps/web/src/router.ts`（`/friends`）

**Interfaces:**
- Consumes: 服务端接口（Task 5~13）和 shared 里的 DTO
- Produces: `endpoints.friendList / friendRequests / friendSearch / friendStreet / friendApply / friendRespond / friendRemove / friendDetail / friendFeed / dineCurrent / dineStart / dineEnd / dineExpel / roachLay / roachKill / friendRefuel / flipSlots / flip / exchangeFoods / exchange / thumbsToday / thumbUp / thumbsReturnAll / myLooks / setDoor / setAvatar / setNotice / iconShow`；`useFriendsStore()`（`pending`、`refreshPending()`）；`describeFeed(item: RestLogDto, foodName: (id: number) => string): string`

- [ ] **Step 1: 接口**（`apps/web/src/api/endpoints.ts`，类型从 `@dt/shared` 导入）

```ts
  friendList: (sort: 'level' | 'star' | 'recent' = 'level') =>
    api.get<FriendsDto>(`/api/v1/friend/list${qs({ sort })}`),
  friendRequests: () => api.get<FriendRequestDto[]>('/api/v1/friend/requests'),
  friendSearch: (q: string) => api.get<RestBriefDto[]>(`/api/v1/friend/search${qs({ q })}`),
  friendStreet: () => api.get<RestBriefDto[]>('/api/v1/friend/street'),
  friendApply: (restId: number) =>
    api.post<{ status: 'requested' | 'friends' }>('/api/v1/friend/apply', { restId }),
  friendRespond: (restId: number, accept: boolean) =>
    api.post<{ status: 'friends' | 'rejected' }>('/api/v1/friend/respond', { restId, accept }),
  friendRemove: (restId: number) => api.post<{ removed: true }>('/api/v1/friend/remove', { restId }),
  friendDetail: (restId: number) => api.get<FriendRestDto>(`/api/v1/friend/detail/${restId}`),
  friendFeed: (before?: string) => api.get<LogPageDto>(`/api/v1/friend/feed${qs({ before })}`),
  dineCurrent: () => api.get<DineCurrentDto | null>('/api/v1/dine/current'),
  dineStart: (restId: number, tableNo: number) => api.post<Anything>('/api/v1/dine/start', { restId, tableNo }),
  dineEnd: () => api.post<DineRewardDto>('/api/v1/dine/end'),
  dineExpel: (tableNo: number) =>
    api.post<{ hostCoin: number; dinerLoss: number }>('/api/v1/dine/expel', { tableNo }),
  roachLay: (restId: number, tableNo: number) =>
    api.post<{ coin: number; exp: number }>('/api/v1/roach/lay', { restId, tableNo }),
  roachKill: (restId: number, tableNo: number) =>
    api.post<KillResultDto>('/api/v1/roach/kill', { restId, tableNo }),
  friendRefuel: (restId: number, num: number) =>
    api.post<{ oil: number; tickets: number }>('/api/v1/friend/refuel', { restId, num }),
  flipSlots: (restId: number) => api.get<FlipSlotsDto>(`/api/v1/friend/cupboard/${restId}`),
  flip: (restId: number, slotNo: number) => api.post<FlipResultDto>('/api/v1/cupboard/flip', { restId, slotNo }),
  exchangeFoods: (restId: number, level: number) =>
    api.get<ExchangeFoodsDto>(`/api/v1/friend/foods/${restId}${qs({ level })}`),
  exchange: (b: { restId: number; giveFoodsId: number; takeFoodsId: number }) =>
    api.post<ExchangeResultDto>('/api/v1/foods/exchange', b),
  thumbsToday: () => api.get<ThumbTodayDto[]>('/api/v1/thumbs/today'),
  thumbUp: (restId: number) => api.post<ThumbResultDto>('/api/v1/thumbs/up', { restId }),
  thumbsReturnAll: () => api.post<ReturnAllDto>('/api/v1/thumbs/returnAll'),
  myLooks: () => api.get<MyLooksDto>('/api/v1/rest/looks'),
  setDoor: (door: number) => api.post<{ door: number }>('/api/v1/rest/door', { door }),
  setAvatar: (avatar: number) => api.post<{ avatar: number }>('/api/v1/rest/avatar', { avatar }),
  setNotice: (text: string) => api.post<{ notice: string }>('/api/v1/rest/notice', { text }),
  iconShow: (iconId: number, shown: boolean) =>
    api.post<{ iconId: number; shown: boolean }>('/api/v1/rest/icon/show', { iconId, shown }),
```

- [ ] **Step 2: 写失败的测试**

`apps/web/src/i18n/zh-CN.test.ts` 追加：

```ts
describe('好友互动的错误文案', () => {
  it('按 reason / what / who 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'table_occupied' })).toBe('这张桌子有人了');
    expect(errorText('LIMIT_REACHED', { what: 'seats', max: 2 })).toBe('对方的白食位满了（最多 2 人）');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'dine_minutes', need: 30 })).toBe('白食满 30 分钟才能结束或请走');
    expect(errorText('ALREADY_DONE', { what: 'thumb' })).toBe('今天已经给它点过赞了');
    expect(errorText('EMAIL_NOT_VERIFIED', { who: 'target' })).toBe('对方还没验证邮箱，不能互动');
    expect(errorText('COOLDOWN', { what: 'flip' })).toBe('这个橱柜位还在冷却中');
    expect(errorText('NOT_FRIEND')).toBe('你们还不是好友');
  });
});
```

`apps/web/src/utils/feed.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { describeFeed } from './feed';

const at = '2026-09-30T00:00:00.000Z';
const food = (id: number) => `食材${id}`;

describe('好友动态文案', () => {
  it('各种互动', () => {
    expect(describeFeed({ type: 'thumb', params: { byName: '甲' }, at }, food)).toBe('甲 给你点了赞');
    expect(describeFeed({ type: 'roach.laid', params: { byName: '甲', table: 3 }, at }, food)).toBe(
      '甲 在你店里第 3 桌放了一只蟑螂',
    );
    expect(describeFeed({ type: 'friend.flip', params: { byName: '甲', outcome: 'food', foodsId: 7 }, at }, food)).toBe(
      '甲 翻了你的橱柜，拿走了 食材7',
    );
    expect(describeFeed({ type: 'friend.flip', params: { byName: '甲', outcome: 'caught', coin: 50 }, at }, food)).toBe(
      '甲 翻你的橱柜被老鼠夹夹住，掉了 50 银币给你',
    );
    expect(describeFeed({ type: 'dine.expelled', params: { byName: '乙', coin: 10 }, at }, food)).toBe(
      '乙 把你请出了店，你赔了 10 银币',
    );
    expect(describeFeed({ type: 'weird', params: {}, at }, food)).toBe('weird');
  });
});
```

`apps/web/src/components/BottomNav.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import BottomNav from './BottomNav.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { friendRequests: vi.fn() } }));

const mountNav = () =>
  mount(BottomNav, {
    global: {
      plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: BottomNav }] })],
    },
  });

describe('BottomNav', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('有待处理的好友申请时"好友"上显示红点', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([
      { id: 2, name: '乙', level: 1, star: 0, avatar: null, npc: false, at: '2026-09-30T00:00:00Z' },
    ]);
    const w = mountNav();
    await flushPromises();
    expect(w.text()).toContain('好友');
    expect(w.find('[data-testid="friend-dot"]').exists()).toBe(true);
  });

  it('没有申请时不显示', async () => {
    vi.mocked(endpoints.friendRequests).mockResolvedValue([]);
    const w = mountNav();
    await flushPromises();
    expect(w.find('[data-testid="friend-dot"]').exists()).toBe(false);
  });
});
```

`apps/web/src/views/FriendsView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendsView from './FriendsView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    friendList: vi.fn(),
    friendRequests: vi.fn(),
    friendRespond: vi.fn(),
    friendSearch: vi.fn(),
    friendStreet: vi.fn(),
    friendApply: vi.fn(),
    friendFeed: vi.fn(),
    thumbsToday: vi.fn(),
    thumbsReturnAll: vi.fn(),
  },
}));

const mountView = () =>
  mount(FriendsView, {
    global: {
      plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: FriendsView }] })],
    },
  });

describe('FriendsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.friendList).mockResolvedValue({
      count: 1,
      max: 199,
      items: [
        { id: 9, name: '蟹老板', level: 60, star: 5, avatar: 12, npc: true, roaches: 3, dineSeat: true, flipReady: 30, since: 'x' },
        { id: 2, name: '乙', level: 5, star: 0, avatar: 1, npc: false, roaches: 0, dineSeat: false, flipReady: 5, since: 'x' },
      ],
    });
    vi.mocked(endpoints.friendRequests).mockResolvedValue([
      { id: 3, name: '丙', level: 2, star: 0, avatar: null, npc: false, at: '2026-09-30T00:00:00Z' },
    ]);
    vi.mocked(endpoints.friendRespond).mockResolvedValue({ status: 'friends' });
    vi.mocked(endpoints.friendSearch).mockResolvedValue([
      { id: 4, name: '丁', level: 3, star: 0, avatar: null, isFriend: false, requested: false },
    ]);
    vi.mocked(endpoints.friendStreet).mockResolvedValue([]);
    vi.mocked(endpoints.friendApply).mockResolvedValue({ status: 'requested' });
  });

  it('好友列表：蟹老板在前，显示蟑螂数和可白食', async () => {
    const w = mountView();
    await flushPromises();
    const rows = w.findAll('[data-testid^="friend-row-"]');
    expect(rows[0]!.text()).toContain('蟹老板');
    expect(rows[0]!.text()).toContain('蟑螂 3');
    expect(rows[0]!.text()).toContain('可白食');
    expect(w.text()).toContain('好友 1/199');
  });

  it('同意申请', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="tab-requests"]').trigger('click');
    await w.find('[data-testid="accept-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendRespond).toHaveBeenCalledWith(3, true);
  });

  it('搜索并申请加好友', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="tab-find"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="search-input"]').setValue('丁');
    await w.find('[data-testid="search-form"]').trigger('submit');
    await flushPromises();
    await w.find('[data-testid="apply-4"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendApply).toHaveBeenCalledWith(4);
    expect(w.find('[data-testid="apply-4"]').text()).toBe('已申请');
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/i18n apps/web/src/utils/feed.test.ts apps/web/src/components/BottomNav.test.ts apps/web/src/views/FriendsView.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现**

`apps/web/src/i18n/zh-CN.ts`：
- `STATE` 追加：

```ts
  target_self: '不能对自己这样做',
  target_npc: '不用申请，蟹老板会主动来加你',
  target_banned: '对方账号已被封禁',
  target_closed: '对方正在停业',
  target_no_food: '对方已经没有这个食材了',
  no_request: '没有这条好友申请',
  no_table: '没有这张桌子',
  already_dining: '你已经在别人店里白食了',
  not_dining: '没有在白食',
  diner_protected: '对方受蟹老板庇佑（神灯），请不走',
  table_occupied: '这张桌子有人了',
  no_roach: '这张桌上没有蟑螂',
  own_roach: '不能消灭自己放的蟑螂',
  friend_oil_full: '好友的油壶已经满了',
  bad_slot: '没有这个橱柜位',
  blessed: '对方的餐厅受到蟹老板的庇佑，这次什么也没翻到',
  level_mismatch: '只能交换同等级、5 级以内的食材',
  foods_locked: '对方锁定了这种食材，飓风天才能换',
  bad_look: '没有这个款式',
  same_door: '已经是这扇门了',
```

- `LIMIT` 追加：

```ts
  friends: (p) => `好友已满（最多 ${String(p.max)} 个）`,
  target_friends: () => '对方的好友已满',
  dine: () => '今天已经白食过了，明天再来',
  seats: (p) => `对方的白食位满了（最多 ${String(p.max)} 人）`,
  roach_lay: (p) => `今天放蟑螂的次数用完了（${String(p.max)} 次）`,
  exchange: (p) => `今天和它的交换次数用完了（${String(p.max)} 次）`,
  exchange_total: () => '今天换得太多了，明天再来',
  exchange_taken: () => '对方今天已经被换太多次了，放过它吧',
  icons: (p) => `最多展示 ${String(p.max)} 个图标`,
```

- `REQUIREMENT` 追加：

```ts
  avatar: () => '先在"装扮"里设置头像才能白食',
  dine_minutes: (p) => `白食满 ${String(p.need)} 分钟才能结束或请走`,
  renown: () => '声望为负时不能点赞',
```

- 新增 `ALREADY` 表，并在 `errorText` 里 `NOT_ENOUGH` 分支之前加三个分支：

```ts
const ALREADY: Record<string, string> = {
  friend: '已经是好友了',
  thumb: '今天已经给它点过赞了',
  thumb_ip: '同一网络今天已经给它点过赞了',
};
```

```ts
  if (code === 'ALREADY_DONE' && typeof params.what === 'string' && ALREADY[params.what]) {
    return ALREADY[params.what]!;
  }
  if (code === 'EMAIL_NOT_VERIFIED' && params.who === 'target') return '对方还没验证邮箱，不能互动';
  if (code === 'COOLDOWN' && params.what === 'flip') return '这个橱柜位还在冷却中';
```

`apps/web/src/utils/feed.ts`：

```ts
import type { RestLogDto } from '@dt/shared';

/** 好友动态的一行文案（服务端只存结构化参数） */
export function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? '有人');
  switch (item.type) {
    case 'dine.start':
      return `${who} 在你店里第 ${String(p.table)} 桌白食`;
    case 'dine.expelled':
      return `${who} 把你请出了店，你赔了 ${String(p.coin)} 银币`;
    case 'roach.laid':
      return `${who} 在你店里第 ${String(p.table)} 桌放了一只蟑螂`;
    case 'roach.killed':
      return `${who} 帮你消灭了第 ${String(p.table)} 桌的蟑螂`;
    case 'friend.refuel':
      return `${who} 帮你加了 ${String(p.oil)} 油`;
    case 'friend.flip':
      if (p.outcome === 'food') return `${who} 翻了你的橱柜，拿走了 ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught') return `${who} 翻你的橱柜被老鼠夹夹住，掉了 ${String(p.coin)} 银币给你`;
      return `${who} 翻了你的橱柜，什么也没拿到`;
    case 'exchange':
      return p.result === 'caught' ? `${who} 偷换你锁定的食材被抓住了` : `${who} 和你交换了食材`;
    case 'thumb':
      return `${who} 给你点了赞`;
    case 'friend.apply':
      return `${who} 申请加你为好友`;
    case 'friend.accept':
      return `${who} 同意了你的好友申请`;
    default:
      return item.type;
  }
}
```

`apps/web/src/stores/friends.ts`：

```ts
import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/** 待处理的好友申请数（导航红点） */
export const useFriendsStore = defineStore('friends', {
  state: () => ({ pending: 0 }),
  actions: {
    async refreshPending() {
      try {
        this.pending = (await endpoints.friendRequests()).length;
      } catch {
        // 红点取不到不影响使用
      }
    },
  },
});
```

`apps/web/src/components/BottomNav.vue`：

```vue
<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useFriendsStore } from '../stores/friends';

const tabs = [
  { to: '/', icon: 'bi-shop', label: '餐厅' },
  { to: '/cookbooks', icon: 'bi-journal-text', label: '食谱' },
  { to: '/cupboard', icon: 'bi-box-seam', label: '橱柜' },
  { to: '/market', icon: 'bi-basket', label: '菜场' },
  { to: '/friends', icon: 'bi-people', label: '好友' },
  { to: '/more', icon: 'bi-grid', label: '更多' },
];
const friends = useFriendsStore();
const route = useRoute();
onMounted(() => friends.refreshPending());
watch(
  () => route.path,
  () => friends.refreshPending(),
);
</script>

<template>
  <nav class="dt-bottom-nav d-flex">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="flex-fill text-center small py-1 position-relative">
      <i :class="['bi', t.icon, 'd-block', 'fs-5']"></i>{{ t.label }}
      <span
        v-if="t.to === '/friends' && friends.pending > 0"
        class="position-absolute top-0 start-50 badge rounded-pill bg-danger"
        data-testid="friend-dot"
        >{{ friends.pending }}</span
      >
    </RouterLink>
  </nav>
</template>
```

`apps/web/src/views/FriendsView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendRequestDto, FriendsDto, RestBriefDto, RestLogDto, ThumbTodayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useFriendsStore } from '../stores/friends';
import { useToastStore } from '../stores/toast';
import { describeFeed } from '../utils/feed';

type Tab = 'friends' | 'requests' | 'find' | 'feed';
const toast = useToastStore();
const catalog = useCatalogStore();
const friendsStore = useFriendsStore();
const tab = ref<Tab>('friends');
const sort = ref<'level' | 'star' | 'recent'>('level');
const list = ref<FriendsDto | null>(null);
const requests = ref<FriendRequestDto[]>([]);
const q = ref('');
const found = ref<RestBriefDto[]>([]);
const street = ref<RestBriefDto[]>([]);
const feed = ref<RestLogDto[]>([]);
const thumbs = ref<ThumbTodayDto[]>([]);
const busy = ref(false);

async function run(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

async function loadFriends() {
  list.value = await endpoints.friendList(sort.value);
}
async function loadRequests() {
  requests.value = await endpoints.friendRequests();
  friendsStore.pending = requests.value.length;
}
async function show(t: Tab) {
  tab.value = t;
  await run(async () => {
    if (t === 'friends') await loadFriends();
    if (t === 'requests') await loadRequests();
    if (t === 'find') street.value = await endpoints.friendStreet();
    if (t === 'feed') {
      feed.value = (await endpoints.friendFeed()).items;
      thumbs.value = await endpoints.thumbsToday();
    }
  }, '读取失败');
}

function respond(r: FriendRequestDto, accept: boolean) {
  return run(async () => {
    await endpoints.friendRespond(r.id, accept);
    toast.push(accept ? `你和「${r.name}」成为了好友` : '已拒绝');
    await loadRequests();
  }, '处理申请失败');
}

function search() {
  if (!q.value.trim()) return;
  return run(async () => {
    found.value = await endpoints.friendSearch(q.value.trim());
    if (found.value.length === 0) toast.push('没有找到这家餐厅', 'info');
  }, '搜索失败');
}

function apply(r: RestBriefDto) {
  return run(async () => {
    const res = await endpoints.friendApply(r.id);
    if (res.status === 'friends') {
      r.isFriend = true;
      toast.push(`你和「${r.name}」成为了好友`);
    } else {
      r.requested = true;
      toast.push('申请已发出');
    }
  }, '申请失败');
}

function returnAll() {
  return run(async () => {
    const r = await endpoints.thumbsReturnAll();
    toast.push(`回赞了 ${r.ok.length} 人${r.failed.length > 0 ? `，${r.failed.length} 人没成功` : ''}`);
    thumbs.value = await endpoints.thumbsToday();
  }, '回赞失败');
}

onMounted(() => show('friends'));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li v-for="[k, label] in [['friends', '好友'], ['requests', '申请'], ['find', '找好友'], ['feed', '动态']]" :key="k" class="nav-item">
      <button
        :class="['nav-link', { active: tab === k }]"
        :data-testid="`tab-${k}`"
        @click="show(k as 'friends' | 'requests' | 'find' | 'feed')"
      >
        {{ label }}<span v-if="k === 'requests' && friendsStore.pending > 0" class="badge bg-danger ms-1">{{ friendsStore.pending }}</span>
      </button>
    </li>
  </ul>

  <template v-if="tab === 'friends' && list">
    <div class="d-flex justify-content-between align-items-center mb-2 small">
      <span>好友 {{ list.count }}/{{ list.max }}</span>
      <select v-model="sort" class="form-select form-select-sm w-auto" @change="show('friends')">
        <option value="level">按等级</option>
        <option value="star">按星级</option>
        <option value="recent">最近加的</option>
      </select>
    </div>
    <p v-if="list.items.length === 0" class="text-muted small">还没有好友，去"找好友"看看吧。</p>
    <RouterLink
      v-for="f in list.items"
      :key="f.id"
      :to="`/friends/${f.id}`"
      class="d-flex align-items-center border rounded p-2 mb-1 text-decoration-none"
      :data-testid="`friend-row-${f.id}`"
    >
      <GameImg :path="`avatar/${f.avatar ?? 0}`" :alt="f.name" fallback-icon="bi-person-circle" class="me-2" />
      <div class="flex-fill">
        <div>{{ f.name }} <span class="text-muted small">{{ f.level }} 级 · {{ f.star }} 星</span></div>
        <div class="small text-muted">
          <span v-if="f.roaches > 0" class="me-2">蟑螂 {{ f.roaches }}</span>
          <span v-if="f.dineSeat" class="me-2">可白食</span>
          <span v-if="f.flipReady > 0">可翻橱 {{ f.flipReady }}</span>
        </div>
      </div>
    </RouterLink>
  </template>

  <template v-if="tab === 'requests'">
    <p v-if="requests.length === 0" class="text-muted small">没有新的好友申请。</p>
    <div
      v-for="r in requests"
      :key="r.id"
      class="d-flex align-items-center border rounded p-2 mb-1"
      :data-testid="`request-${r.id}`"
    >
      <div class="flex-fill">{{ r.name }} <span class="text-muted small">{{ r.level }} 级</span></div>
      <button class="btn btn-sm btn-primary me-1" :data-testid="`accept-${r.id}`" :disabled="busy" @click="respond(r, true)">
        同意
      </button>
      <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="respond(r, false)">拒绝</button>
    </div>
  </template>

  <template v-if="tab === 'find'">
    <form class="d-flex mb-2" data-testid="search-form" @submit.prevent="search">
      <input v-model="q" class="form-control me-1" placeholder="餐厅名称" maxlength="20" data-testid="search-input" />
      <button class="btn btn-primary text-nowrap" :disabled="busy">搜索</button>
    </form>
    <div v-for="(group, gi) in [found, street]" :key="gi">
      <h6 v-if="gi === 1 && street.length > 0" class="mt-3">同街道的餐厅</h6>
      <div v-for="r in group" :key="r.id" class="d-flex align-items-center border rounded p-2 mb-1">
        <RouterLink :to="`/friends/${r.id}`" class="flex-fill text-decoration-none">
          {{ r.name }} <span class="text-muted small">{{ r.level }} 级 · {{ r.star }} 星</span>
        </RouterLink>
        <span v-if="r.isFriend" class="small text-muted">已是好友</span>
        <button
          v-else
          class="btn btn-sm btn-outline-primary"
          :data-testid="`apply-${r.id}`"
          :disabled="busy || r.requested"
          @click="apply(r)"
        >
          {{ r.requested ? '已申请' : '加好友' }}
        </button>
      </div>
    </div>
  </template>

  <template v-if="tab === 'feed'">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="small">今天 {{ thumbs.length }} 人给你点赞</span>
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="return-all"
        :disabled="busy || thumbs.every((x) => x.returned)"
        @click="returnAll"
      >
        一键回赞
      </button>
    </div>
    <p v-if="feed.length === 0" class="text-muted small">最近 3 天没有动态。</p>
    <div v-for="(f, i) in feed" :key="i" class="border-bottom py-1 small">
      <span class="text-muted me-2">{{ new Date(f.at).toLocaleString('zh-CN', { hour12: false }) }}</span>
      {{ describeFeed(f, (id) => catalog.foodName(id)) }}
    </div>
  </template>
</template>
```

`apps/web/src/router.ts`：`/more` 之前加

```ts
  {
    path: '/friends',
    name: 'friends',
    component: () => import('./views/FriendsView.vue'),
    meta: { needRestaurant: true },
  },
```

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm vitest run apps/web`
Expected: PASS

- [ ] **Step 6: 全量测试、类型检查、lint、提交**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过

```bash
git add apps/web
git commit -m "feat(web): friends page (list, requests, find, feed with return-all), nav tab with request badge, error texts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 前端——好友餐厅、翻橱、交换

**Files:**
- Create: `apps/web/src/components/TableGrid.vue`、`TableGrid.test.ts`
- Create: `apps/web/src/views/FriendRestView.vue`、`FriendRestView.test.ts`
- Create: `apps/web/src/views/FriendFlipView.vue`、`FriendFlipView.test.ts`
- Create: `apps/web/src/views/FriendExchangeView.vue`、`FriendExchangeView.test.ts`
- Modify: `apps/web/src/router.ts`

**Interfaces:**
- Consumes: Task 15 的 `endpoints`
- Produces: `TableGrid`（props `tables: TableDto[]`、`selected?: number | null`；emit `pick(table: TableDto)`）；路由 `/friends/:restId`、`/friends/:restId/flip`、`/friends/:restId/exchange`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/TableGrid.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TableGrid from './TableGrid.vue';

describe('TableGrid', () => {
  it('按楼层显示，标出蟑螂和白食者；点桌子发出 pick', async () => {
    const w = mount(TableGrid, {
      props: {
        tables: [
          { no: 1, floor: 1, customer: 3, roach: true, roachBy: null },
          { no: 2, floor: 1, customer: 9, freeloaderRestId: 5, freeloaderName: '乙', freeloaderSince: 'x' },
          { no: 17, floor: 2, customer: 0 },
        ],
      },
    });
    expect(w.find('[data-testid="table-1"]').text()).toContain('蟑螂');
    expect(w.find('[data-testid="table-2"]').text()).toContain('乙');
    expect(w.find('[data-testid="table-17"]').exists()).toBe(false);
    await w.find('[data-testid="table-1"]').trigger('click');
    expect(w.emitted('pick')![0]).toEqual([expect.objectContaining({ no: 1 })]);
  });
});
```

`apps/web/src/views/FriendRestView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { FriendRestDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import FriendRestView from './FriendRestView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    friendDetail: vi.fn(),
    dineStart: vi.fn(),
    roachLay: vi.fn(),
    roachKill: vi.fn(),
    thumbUp: vi.fn(),
    friendApply: vi.fn(),
    friendRefuel: vi.fn(),
    friendRemove: vi.fn(),
  },
}));

const detail = (patch: Partial<FriendRestDto> = {}): FriendRestDto => ({
  id: 2,
  name: '乙店',
  level: 5,
  star: 0,
  streetId: 0,
  renown: 10,
  door: 0,
  avatar: 1,
  notice: '欢迎光临',
  npc: false,
  state: 1,
  isFriend: true,
  requested: false,
  icons: [{ key: 'founder', title: '开服元老' }],
  honors: [],
  plaques: [],
  tables: [
    { no: 1, floor: 1, customer: 0 },
    { no: 2, floor: 1, customer: 3, roach: true, roachBy: null },
  ],
  thumbedToday: false,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId', component: FriendRestView }],
  });
  await router.push('/friends/2');
  const w = mount(FriendRestView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendRestView', () => {
  beforeEach(() => {
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
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail());
    vi.mocked(endpoints.dineStart).mockResolvedValue({});
    vi.mocked(endpoints.roachKill).mockResolvedValue({ strength: 2, coin: 10, exp: 5, tickets: 0 });
  });

  it('显示公告栏和图标；点空桌可以白食', async () => {
    const w = await mountView();
    expect(w.text()).toContain('欢迎光临');
    expect(w.text()).toContain('开服元老');
    await w.find('[data-testid="table-1"]').trigger('click');
    await w.find('[data-testid="act-dine"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineStart).toHaveBeenCalledWith(2, 1);
  });

  it('点蟑螂可以消灭', async () => {
    const w = await mountView();
    await w.find('[data-testid="table-2"]').trigger('click');
    await w.find('[data-testid="act-kill"]').trigger('click');
    await flushPromises();
    expect(endpoints.roachKill).toHaveBeenCalledWith(2, 2);
  });

  it('不是好友时只显示加好友', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ isFriend: false }));
    const w = await mountView();
    expect(w.find('[data-testid="add-friend"]').exists()).toBe(true);
    expect(w.find('[data-testid="act-bar"]').exists()).toBe(false);
  });
});
```

`apps/web/src/views/FriendFlipView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendFlipView from './FriendFlipView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { flipSlots: vi.fn(), flip: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId/flip', component: FriendFlipView }],
  });
  await router.push('/friends/2/flip');
  const w = mount(FriendFlipView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendFlipView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.flipSlots).mockResolvedValue({
      slots: 5,
      cooling: [{ slotNo: 2, until: new Date(Date.now() + 3 * 3600_000).toISOString() }],
      todayTimes: 0,
    });
    vi.mocked(endpoints.flip).mockResolvedValue({ outcome: 'nothing', foodsId: null, coin: 0, strength: 1, dtTickets: 0 });
  });

  it('冷却中的位置不能点；点其他位置翻橱并显示结果', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="slot-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-2"]').text()).toMatch(/2 小时/);
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.flip).toHaveBeenCalledWith(2, 1);
    expect(w.text()).toContain('什么都没有');
  });
});
```

`apps/web/src/views/FriendExchangeView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendExchangeView from './FriendExchangeView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { exchangeFoods: vi.fn(), exchange: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId/exchange', component: FriendExchangeView }],
  });
  await router.push('/friends/2/exchange');
  const w = mount(FriendExchangeView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendExchangeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 1,
      theirs: [{ foodsId: 11, num: 3, locked: false, fee: 20 }],
      mine: [
        { foodsId: 12, num: 5 },
        { foodsId: 13, num: 1 },
      ],
      left: 14,
      storm: false,
      npc: false,
    });
    vi.mocked(endpoints.exchange).mockResolvedValue({ result: 'ok', fee: 20, redPantsFoodsId: null });
  });

  it('选对方的和我的（不足 2 个的不能选），确认后交换', async () => {
    const w = await mountView();
    expect(w.text()).toContain('今天还能换 14 次');
    expect(w.find('[data-testid="mine-13"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="theirs-11"]').trigger('click');
    await w.find('[data-testid="mine-12"]').trigger('click');
    expect(w.find('[data-testid="confirm"]').text()).toContain('手续费 20');
    await w.find('[data-testid="confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchange).toHaveBeenCalledWith({ restId: 2, giveFoodsId: 12, takeFoodsId: 11 });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/components/TableGrid.test.ts apps/web/src/views/FriendRestView.test.ts apps/web/src/views/FriendFlipView.test.ts apps/web/src/views/FriendExchangeView.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`apps/web/src/components/TableGrid.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { CUSTOMER_NAMES } from '../utils/labels';

const props = defineProps<{ tables: TableDto[]; selected?: number | null }>();
const emit = defineEmits<{ pick: [table: TableDto] }>();
const floor = ref(1);
const floors = computed(() => [...new Set(props.tables.map((t) => t.floor))].sort((a, b) => a - b));
const shown = computed(() => props.tables.filter((t) => t.floor === floor.value));

function label(t: TableDto): string {
  if (t.customer === 9) return `白食：${t.freeloaderName ?? '好友'}`;
  return CUSTOMER_NAMES[String(t.customer)] ?? '';
}
</script>

<template>
  <div v-if="floors.length > 1" class="btn-group btn-group-sm mb-2">
    <button
      v-for="f in floors"
      :key="f"
      :class="['btn', f === floor ? 'btn-primary' : 'btn-outline-primary']"
      @click="floor = f"
    >
      {{ f }} 楼
    </button>
  </div>
  <div class="row g-1">
    <div v-for="t in shown" :key="t.no" class="col-3">
      <button
        type="button"
        :class="[
          'w-100 border rounded p-1 small text-center bg-transparent',
          { 'border-primary border-2': selected === t.no, 'text-danger': t.customer === 3 },
        ]"
        :data-testid="`table-${t.no}`"
        @click="emit('pick', t)"
      >
        <div class="fw-bold">{{ t.no }}</div>
        <div><i v-if="t.customer === 3" class="bi bi-bug me-1"></i>{{ label(t) }}</div>
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/views/FriendRestView.vue`：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { FriendRestDto, TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import TableGrid from '../components/TableGrid.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const session = useSessionStore();
const restId = computed(() => Number(route.params.restId));
const rest = ref<FriendRestDto | null>(null);
const picked = ref<TableDto | null>(null);
const busy = ref(false);
const error = ref('');

async function load() {
  try {
    rest.value = await endpoints.friendDetail(restId.value);
    if (picked.value) picked.value = rest.value.tables.find((t) => t.no === picked.value!.no) ?? null;
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '读取餐厅失败');
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    picked.value = null;
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const isEmpty = (t: TableDto) => (t.customer === 0 || t.customer === -3) && !t.roach && !t.freeloaderRestId;
const mine = computed(() => session.me?.restaurantId ?? null);

function refuel(num: number) {
  return act(() => endpoints.friendRefuel(restId.value, num), '加油成功', '加油失败');
}
function remove() {
  if (!rest.value || !window.confirm(`确定删除好友「${rest.value.name}」吗？`)) return;
  return act(
    async () => {
      await endpoints.friendRemove(restId.value);
      await router.push('/friends');
    },
    '已删除好友',
    '删除失败',
  );
}

const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onFocus));
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <template v-if="rest">
    <div class="d-flex align-items-center mb-2">
      <GameImg :path="`avatar/${rest.avatar ?? 0}`" :alt="rest.name" fallback-icon="bi-person-circle" class="me-2" />
      <div class="flex-fill">
        <div class="fw-bold">{{ rest.name }}</div>
        <div class="small text-muted">
          {{ rest.level }} 级 · {{ rest.star }} 星 · 声望 {{ rest.renown }}<span v-if="rest.state !== 1"> · 停业中</span>
        </div>
      </div>
      <GameImg :path="`door/${rest.door}`" alt="门" fallback-icon="bi-door-closed" />
    </div>
    <div v-if="rest.icons.length > 0" class="mb-2">
      <span v-for="i in rest.icons" :key="i.key" class="badge bg-warning text-dark me-1">{{ i.title }}</span>
    </div>
    <div v-if="rest.notice" class="border rounded p-2 mb-2 small" style="white-space: pre-wrap">{{ rest.notice }}</div>

    <div v-if="rest.isFriend" class="d-flex flex-wrap gap-1 mb-2" data-testid="act-bar">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || rest.thumbedToday"
        @click="act(() => endpoints.thumbUp(restId), '点赞成功', '点赞失败')"
      >
        {{ rest.thumbedToday ? '已点赞' : '点赞' }}
      </button>
      <button class="btn btn-sm btn-outline-primary" :disabled="busy" @click="refuel(-1)">帮它加满油</button>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="`/friends/${restId}/flip`">翻橱柜</RouterLink>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="`/friends/${restId}/exchange`">换食材</RouterLink>
      <button v-if="!rest.npc" class="btn btn-sm btn-outline-danger ms-auto" :disabled="busy" @click="remove">
        删除好友
      </button>
    </div>
    <div v-else-if="rest.id !== mine" class="mb-2">
      <button
        class="btn btn-sm btn-primary"
        data-testid="add-friend"
        :disabled="busy || rest.requested"
        @click="act(() => endpoints.friendApply(restId), '申请已发出', '申请失败')"
      >
        {{ rest.requested ? '已申请' : '加好友' }}
      </button>
    </div>

    <TableGrid :tables="rest.tables" :selected="picked?.no ?? null" @pick="(t) => (picked = t)" />

    <div v-if="picked && rest.isFriend" class="border rounded p-2 mt-2 small">
      <div class="mb-1">第 {{ picked.no }} 桌</div>
      <template v-if="isEmpty(picked)">
        <button
          class="btn btn-sm btn-primary me-1"
          data-testid="act-dine"
          :disabled="busy"
          @click="act(() => endpoints.dineStart(restId, picked!.no), '开始白食', '白食失败')"
        >
          白食
        </button>
        <button
          class="btn btn-sm btn-outline-danger"
          data-testid="act-lay"
          :disabled="busy"
          @click="act(() => endpoints.roachLay(restId, picked!.no), '放了一只蟑螂', '放蟑螂失败')"
        >
          放蟑螂
        </button>
      </template>
      <button
        v-else-if="picked.customer === 3 && picked.roachBy !== mine"
        class="btn btn-sm btn-success"
        data-testid="act-kill"
        :disabled="busy"
        @click="act(() => endpoints.roachKill(restId, picked!.no), '消灭了蟑螂', '灭蟑螂失败')"
      >
        消灭蟑螂
      </button>
      <span v-else class="text-muted">这张桌现在不能操作</span>
    </div>
  </template>
</template>
```

`apps/web/src/views/FriendFlipView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { FlipResultDto, FlipSlotsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const toast = useToastStore();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const data = ref<FlipSlotsDto | null>(null);
const result = ref('');
const busy = ref(false);

const coolOf = (slot: number) => data.value?.cooling.find((c) => c.slotNo === slot) ?? null;
function left(until: string): string {
  const ms = Math.max(0, Date.parse(until) - Date.now());
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return `${h} 小时 ${m} 分`;
}

function describe(r: FlipResultDto): string {
  const head = r.strength > 0 ? `体力 -${r.strength}，` : '';
  const tail = r.dtTickets > 0 ? `，还得到 ${r.dtTickets} 张美味券` : '';
  switch (r.outcome) {
    case 'food':
      return `${head}翻到了 ${catalog.foodName(r.foodsId!)}${tail}`;
    case 'ticket':
      return `${head}橱柜里有一张神秘礼券${tail}`;
    case 'caught':
      return `${head}手被老鼠夹夹住了，掉了 ${r.coin} 银币${tail}`;
    case 'escaped':
      return `${head}差点被老鼠夹夹住，真是老天保佑${tail}`;
    default:
      return `${head}什么都没有${tail}`;
  }
}

async function load() {
  try {
    data.value = await endpoints.flipSlots(restId.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取橱柜失败'), 'danger');
  }
}

async function flip(slot: number) {
  if (busy.value) return;
  busy.value = true;
  try {
    result.value = describe(await endpoints.flip(restId.value, slot));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '翻橱失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <h5>翻橱柜</h5>
  <p class="small text-muted">
    每个位置翻过后要冷却一段时间。每天前 100 次每次 1 体力，之后 2 体力<span v-if="data">（今天已翻 {{ data.todayTimes }} 次）</span>。
  </p>
  <div v-if="result" class="alert alert-info small py-2" data-testid="flip-result">{{ result }}</div>
  <div v-if="data" class="row g-1">
    <div v-for="slot in data.slots" :key="slot" class="col-3">
      <button
        class="btn btn-outline-secondary w-100 small"
        :data-testid="`slot-${slot}`"
        :disabled="busy || coolOf(slot) !== null"
        @click="flip(slot)"
      >
        <div>{{ slot }}</div>
        <div v-if="coolOf(slot)" class="text-muted" style="font-size: 0.7rem">{{ left(coolOf(slot)!.until) }}</div>
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/views/FriendExchangeView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ExchangeFoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const toast = useToastStore();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const level = ref(1);
const data = ref<ExchangeFoodsDto | null>(null);
const take = ref<number | null>(null);
const give = ref<number | null>(null);
const busy = ref(false);
const fee = computed(() => data.value?.theirs.find((x) => x.foodsId === take.value)?.fee ?? 0);

async function load() {
  take.value = null;
  give.value = null;
  try {
    data.value = await endpoints.exchangeFoods(restId.value, level.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取食材失败'), 'danger');
  }
}

async function confirm() {
  if (busy.value || take.value === null || give.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.exchange({ restId: restId.value, giveFoodsId: give.value, takeFoodsId: take.value });
    if (r.result === 'caught') toast.push('太不走运了！偷换食材被抓住了', 'danger');
    else
      toast.push(
        r.redPantsFoodsId !== null
          ? `交换成功，但对方有红内裤，你额外损失了 1 个${catalog.foodName(r.redPantsFoodsId)}`
          : '交换成功',
      );
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '交换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <h5>交换食材</h5>
  <p class="small text-muted">用 2 个同等级的食材换对方 1 个；只能换 5 级以内的食材。</p>
  <div class="btn-group btn-group-sm mb-2">
    <button
      v-for="l in 5"
      :key="l"
      :class="['btn', l === level ? 'btn-primary' : 'btn-outline-primary']"
      @click="
        level = l;
        load();
      "
    >
      {{ l }} 级
    </button>
  </div>
  <template v-if="data">
    <p class="small">
      今天还能换 {{ data.left }} 次<span v-if="data.storm">；飓风天可以换对方锁定的食材（有一半概率被抓）</span>
    </p>
    <h6>对方的</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="data.theirs.length === 0" class="small text-muted">没有这个等级的食材</span>
      <button
        v-for="f in data.theirs"
        :key="f.foodsId"
        :class="['btn btn-sm', take === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`theirs-${f.foodsId}`"
        :disabled="f.locked && !data.storm"
        @click="take = f.foodsId"
      >
        {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}<i v-if="f.locked" class="bi bi-lock ms-1"></i>
      </button>
    </div>
    <h6>我给出（每次 2 个）</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="data.mine.length === 0" class="small text-muted">你没有这个等级的食材</span>
      <button
        v-for="f in data.mine"
        :key="f.foodsId"
        :class="['btn btn-sm', give === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`mine-${f.foodsId}`"
        :disabled="f.num < 2"
        @click="give = f.foodsId"
      >
        {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
      </button>
    </div>
    <button
      class="btn btn-primary w-100"
      data-testid="confirm"
      :disabled="busy || take === null || give === null || data.left <= 0"
      @click="confirm"
    >
      交换<span v-if="fee > 0">（手续费 {{ fee }} 银币）</span>
    </button>
  </template>
</template>
```

`apps/web/src/router.ts`：`/friends` 之后加

```ts
  {
    path: '/friends/:restId(\\d+)',
    name: 'friend-rest',
    component: () => import('./views/FriendRestView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/friends/:restId(\\d+)/flip',
    name: 'friend-flip',
    component: () => import('./views/FriendFlipView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/friends/:restId(\\d+)/exchange',
    name: 'friend-exchange',
    component: () => import('./views/FriendExchangeView.vue'),
    meta: { needRestaurant: true },
  },
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/web`
Expected: PASS

- [ ] **Step 5: 全量测试、类型检查、lint、提交**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过

```bash
git add apps/web
git commit -m "feat(web): friend restaurant page (dine, roach, thumbs, refuel), cupboard flip and food exchange pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 前端——自己的楼层（灭蟑螂、请走）、首页白食卡片、装扮页、后台图标

**Files:**
- Modify: `apps/web/src/views/RestFloorView.vue`
- Create: `apps/web/src/views/RestFloorView.test.ts`
- Modify: `apps/web/src/views/RestaurantHomeView.vue`、`RestaurantHomeView.test.ts`
- Create: `apps/web/src/views/RestLookView.vue`、`RestLookView.test.ts`
- Modify: `apps/web/src/views/MoreView.vue`（装扮入口）
- Modify: `apps/web/src/router.ts`（`/rest/look`）
- Modify: `apps/web/src/api/admin.ts`
- Create: `apps/web/src/components/admin/RestIcons.vue`、`RestIcons.test.ts`
- Modify: `apps/web/src/views/admin/AdminPlayerView.vue`

**Interfaces:**
- Consumes: `TableGrid`（Task 16）、`endpoints`（Task 15）
- Produces: `adminApi.icons(restId)`、`adminApi.grantIcon(restId, key)`、`adminApi.revokeIcon(restId, iconId)`；组件 `RestIcons`（prop `restId: number`）

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/RestFloorView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import RestFloorView from './RestFloorView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { floor: vi.fn(), roachKill: vi.fn(), dineExpel: vi.fn() } }));

describe('RestFloorView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 7,
    };
    vi.mocked(endpoints.floor).mockResolvedValue([
      { no: 1, floor: 1, customer: 3, roach: true, roachBy: 9 },
      {
        no: 2,
        floor: 1,
        customer: 9,
        freeloaderRestId: 9,
        freeloaderName: '乙',
        freeloaderSince: new Date(Date.now() - 40 * 60_000).toISOString(),
      },
      {
        no: 3,
        floor: 1,
        customer: 9,
        freeloaderRestId: 8,
        freeloaderName: '丙',
        freeloaderSince: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    ]);
    vi.mocked(endpoints.roachKill).mockResolvedValue({ strength: 1, coin: 15, exp: 10, tickets: 0 });
    vi.mocked(endpoints.dineExpel).mockResolvedValue({ hostCoin: 20, dinerLoss: 10 });
  });

  it('点自己店里的蟑螂消灭', async () => {
    const w = mount(RestFloorView);
    await flushPromises();
    await w.find('[data-testid="table-1"]').trigger('click');
    await w.find('[data-testid="act-kill"]').trigger('click');
    await flushPromises();
    expect(endpoints.roachKill).toHaveBeenCalledWith(7, 1);
  });

  it('白食满 30 分钟才能请走', async () => {
    const w = mount(RestFloorView);
    await flushPromises();
    await w.find('[data-testid="table-3"]').trigger('click');
    expect(w.find('[data-testid="act-expel"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="table-2"]').trigger('click');
    await w.find('[data-testid="act-expel"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineExpel).toHaveBeenCalledWith(2);
  });
});
```

`apps/web/src/views/RestLookView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import RestLookView from './RestLookView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { myLooks: vi.fn(), setDoor: vi.fn(), setAvatar: vi.fn(), setNotice: vi.fn(), iconShow: vi.fn() },
}));

describe('RestLookView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 't',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      looks: {
        doors: [
          { id: 0, name: '木门', coin: 0 },
          { id: 1, name: '红漆门', coin: 20000 },
        ],
        avatars: [
          { id: 1, name: '小厨师' },
          { id: 2, name: '大厨' },
        ],
        icons: [],
      },
    });
    vi.mocked(endpoints.myLooks).mockResolvedValue({
      door: 0,
      avatar: null,
      notice: '',
      icons: [{ id: 5, key: 'founder', title: '开服元老', desc: 'x', shown: false }],
    });
    for (const f of ['setDoor', 'setAvatar', 'setNotice', 'iconShow'] as const)
      vi.mocked(endpoints[f]).mockResolvedValue({} as never);
  });

  it('没设头像时提示；选头像、换门、保存公告、展示图标', async () => {
    const w = mount(RestLookView);
    await flushPromises();
    expect(w.text()).toContain('还没有设置头像');
    // 每次操作完成（busy 复位、重新读取）后再做下一个
    await w.find('[data-testid="avatar-2"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="door-1"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="notice"]').setValue('你好');
    await w.find('[data-testid="save-notice"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="icon-5"]').trigger('change');
    await flushPromises();
    expect(endpoints.setAvatar).toHaveBeenCalledWith(2);
    expect(endpoints.setDoor).toHaveBeenCalledWith(1);
    expect(endpoints.setNotice).toHaveBeenCalledWith('你好');
    expect(endpoints.iconShow).toHaveBeenCalledWith(5, true);
  });
});
```

`apps/web/src/components/admin/RestIcons.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useCatalogStore } from '../../stores/catalog';
import RestIcons from './RestIcons.vue';

vi.mock('../../api/admin', () => ({ adminApi: { icons: vi.fn(), grantIcon: vi.fn(), revokeIcon: vi.fn() } }));

describe('RestIcons', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 't',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      looks: { doors: [], avatars: [], icons: [{ key: 'founder', title: '开服元老', desc: 'x' }] },
    });
    vi.mocked(adminApi.icons).mockResolvedValue([]);
    vi.mocked(adminApi.grantIcon).mockResolvedValue([
      { id: 1, key: 'founder', title: '开服元老', shown: false, grantedAt: '2026-09-30T00:00:00Z' },
    ]);
  });

  it('选一个图标发放', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(RestIcons, { props: { restId: 3 } });
    await flushPromises();
    await w.find('[data-testid="icon-select"]').setValue('founder');
    await w.find('[data-testid="icon-grant"]').trigger('click');
    await flushPromises();
    expect(adminApi.grantIcon).toHaveBeenCalledWith(3, 'founder');
    expect(w.text()).toContain('开服元老');
  });
});
```

`apps/web/src/views/RestaurantHomeView.test.ts`：在 `vi.mock('../api/endpoints', …)` 的对象里加 `dineCurrent: vi.fn(), dineEnd: vi.fn(),`；`beforeEach` 里加 `vi.mocked(endpoints.dineCurrent).mockResolvedValue(null);`；并追加：

```ts
  it('正在白食时显示卡片，满 30 分钟可以结束', async () => {
    vi.mocked(endpoints.dineCurrent).mockResolvedValue({
      hostRestId: 2,
      hostName: '乙店',
      tableNo: 3,
      startedAt: '2026-09-30T00:00:00Z',
      minutes: 45,
      canEnd: true,
    });
    vi.mocked(endpoints.dineEnd).mockResolvedValue({ coin: 10, exp: 5, strength: 0 });
    const w = await mountView();
    expect(w.find('[data-testid="dine-card"]').text()).toContain('乙店');
    await w.find('[data-testid="dine-end"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineEnd).toHaveBeenCalled();
  });
```

（`mountView` 是这个测试文件里已有的挂载函数。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm vitest run apps/web/src/views/RestFloorView.test.ts apps/web/src/views/RestLookView.test.ts apps/web/src/components/admin/RestIcons.test.ts apps/web/src/views/RestaurantHomeView.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`apps/web/src/views/RestFloorView.vue`（整个替换）：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import TableGrid from '../components/TableGrid.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const DINE_MINUTES = 30;
const session = useSessionStore();
const toast = useToastStore();
const tables = ref<TableDto[]>([]);
const picked = ref<TableDto | null>(null);
const error = ref('');
const busy = ref(false);
const me = computed(() => session.me?.restaurantId ?? 0);

async function load() {
  try {
    tables.value = await endpoints.floor();
    if (picked.value) picked.value = tables.value.find((t) => t.no === picked.value!.no) ?? null;
  } catch (e) {
    error.value = errorMessage(e, '读取餐桌失败');
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    picked.value = null;
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const dinedMinutes = (t: TableDto) =>
  t.freeloaderSince ? Math.floor((Date.now() - Date.parse(t.freeloaderSince)) / 60_000) : 0;

onMounted(load);
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <TableGrid :tables="tables" :selected="picked?.no ?? null" @pick="(t) => (picked = t)" />
  <div v-if="picked" class="border rounded p-2 mt-2 small">
    <div class="mb-1">第 {{ picked.no }} 桌</div>
    <div v-if="picked.last && picked.last.type !== 0" class="text-muted mb-1">
      上一轮 {{ formatNum(Math.floor(picked.last.coin)) }} 银 / {{ formatNum(Math.floor(picked.last.exp)) }} 经
    </div>
    <button
      v-if="picked.customer === 3"
      class="btn btn-sm btn-success"
      data-testid="act-kill"
      :disabled="busy"
      @click="act(() => endpoints.roachKill(me, picked!.no), '消灭了蟑螂', '灭蟑螂失败')"
    >
      消灭蟑螂
    </button>
    <template v-else-if="picked.customer === 9">
      <div class="mb-1">{{ picked.freeloaderName ?? '好友' }} 已经白食 {{ dinedMinutes(picked) }} 分钟</div>
      <button
        class="btn btn-sm btn-outline-danger"
        data-testid="act-expel"
        :disabled="busy || dinedMinutes(picked) < DINE_MINUTES"
        @click="act(() => endpoints.dineExpel(picked!.no), '已请走白食者', '请走失败')"
      >
        请走（满 {{ DINE_MINUTES }} 分钟）
      </button>
    </template>
  </div>
</template>
```

`apps/web/src/views/RestaurantHomeView.vue`：
- `import type { DeviceOptionsDto, DineCurrentDto, EffectDto, TaskDto } from '@dt/shared';`
- 状态加 `const dining = ref<DineCurrentDto | null>(null);`
- `load()` 里 `mainTask.value = ...` 之后加 `dining.value = await endpoints.dineCurrent();`
- 模板里主线任务卡片之前加：

```vue
  <div v-if="dining" class="card mb-2" data-testid="dine-card">
    <div class="card-body py-2 d-flex align-items-center small">
      <div class="flex-fill">
        正在 <RouterLink :to="`/friends/${dining.hostRestId}`">{{ dining.hostName }}</RouterLink> 第
        {{ dining.tableNo }} 桌白食，已 {{ dining.minutes }} 分钟
      </div>
      <button
        class="btn btn-sm btn-primary"
        data-testid="dine-end"
        :disabled="busy || !dining.canEnd"
        @click="act(() => endpoints.dineEnd(), '结束白食失败')"
      >
        结束白食
      </button>
    </div>
  </div>
```

`apps/web/src/views/RestLookView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MyLooksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const looks = computed(() => catalog.looks);
const mine = ref<MyLooksDto | null>(null);
const notice = ref('');
const busy = ref(false);

async function load() {
  try {
    mine.value = await endpoints.myLooks();
    notice.value = mine.value.notice;
  } catch (e) {
    toast.push(errorMessage(e, '读取装扮失败'), 'danger');
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await catalog.load().catch(() => undefined);
  await load();
});
</script>

<template>
  <h5>装扮</h5>
  <template v-if="mine">
    <h6>头像</h6>
    <p v-if="mine.avatar === null" class="small text-danger">还没有设置头像（去好友店里白食需要头像）</p>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="a in looks?.avatars ?? []"
        :key="a.id"
        :class="['btn btn-sm', mine.avatar === a.id ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`avatar-${a.id}`"
        :disabled="busy"
        @click="act(() => endpoints.setAvatar(a.id), '头像已更换', '更换头像失败')"
      >
        <GameImg :path="`avatar/${a.id}`" :alt="a.name" fallback-icon="bi-person-circle" /> {{ a.name }}
      </button>
    </div>

    <h6>门</h6>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="d in looks?.doors ?? []"
        :key="d.id"
        :class="['btn btn-sm', mine.door === d.id ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`door-${d.id}`"
        :disabled="busy || mine.door === d.id"
        @click="act(() => endpoints.setDoor(d.id), '换门成功', '换门失败')"
      >
        {{ d.name }}<span v-if="d.coin > 0" class="ms-1 small">{{ formatNum(d.coin) }} 银</span>
      </button>
    </div>

    <h6>公告栏</h6>
    <textarea v-model="notice" class="form-control mb-1" rows="3" maxlength="200" data-testid="notice"></textarea>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <span class="small text-muted">{{ notice.length }}/200</span>
      <button
        class="btn btn-sm btn-primary"
        data-testid="save-notice"
        :disabled="busy"
        @click="act(() => endpoints.setNotice(notice), '公告已保存', '保存公告失败')"
      >
        保存
      </button>
    </div>

    <h6>个性图标（最多展示 5 个）</h6>
    <p v-if="mine.icons.length === 0" class="small text-muted">还没有个性图标。</p>
    <div v-for="i in mine.icons" :key="i.id" class="form-check">
      <input
        :id="`icon-${i.id}`"
        class="form-check-input"
        type="checkbox"
        :checked="i.shown"
        :data-testid="`icon-${i.id}`"
        :disabled="busy"
        @change="act(() => endpoints.iconShow(i.id, !i.shown), '已更新', '更新图标失败')"
      />
      <label class="form-check-label" :for="`icon-${i.id}`">{{ i.title }} <span class="small text-muted">{{ i.desc }}</span></label>
    </div>
  </template>
</template>
```

`apps/web/src/stores/catalog.ts`：state 加 `looks: null as LooksDto | null,`（`LooksDto` 从 `@dt/shared` 导入），`apply` 里加 `this.looks = c.looks ?? null;`。

`apps/web/src/views/MoreView.vue`：`base` 里 `'/rest/info'` 之后加 `{ to: '/rest/look', icon: 'bi-palette', label: '装扮' },`。

`apps/web/src/router.ts`：`/rest/tasks` 之后加

```ts
  {
    path: '/rest/look',
    name: 'look',
    component: () => import('./views/RestLookView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/api/admin.ts` 的 `adminApi` 加（`AdminIconDto` 从 `@dt/shared` 导入）：

```ts
  icons: (restId: number) => api.get<AdminIconDto[]>(`${A}/restaurants/${restId}/icons`),
  grantIcon: (restId: number, key: string) => api.post<AdminIconDto[]>(`${A}/restaurants/${restId}/icons`, { key }),
  revokeIcon: (restId: number, iconId: number) =>
    api.post<AdminIconDto[]>(`${A}/restaurants/${restId}/icons/${iconId}/revoke`),
```

`apps/web/src/components/admin/RestIcons.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminIconDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';

const props = defineProps<{ restId: number }>();
const catalog = useCatalogStore();
const icons = ref<AdminIconDto[]>([]);
const key = ref('');
const error = ref('');
const busy = ref(false);
const options = computed(() => (catalog.looks?.icons ?? []).filter((i) => !icons.value.some((x) => x.key === i.key)));

async function load() {
  try {
    icons.value = await adminApi.icons(props.restId);
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '读取图标失败');
  }
}

async function run(fn: () => Promise<AdminIconDto[]>) {
  busy.value = true;
  try {
    icons.value = await fn();
    key.value = '';
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '操作失败');
  } finally {
    busy.value = false;
  }
}

function grant() {
  if (!key.value || !window.confirm(`给餐厅 #${props.restId} 发放图标「${key.value}」？`)) return;
  return run(() => adminApi.grantIcon(props.restId, key.value));
}
function revoke(i: AdminIconDto) {
  if (!window.confirm(`收回「${i.title}」？`)) return;
  return run(() => adminApi.revokeIcon(props.restId, i.id));
}

onMounted(async () => {
  await catalog.load().catch(() => undefined);
  await load();
});
watch(() => props.restId, load);
</script>

<template>
  <div class="border rounded p-2 mb-2">
    <h6 class="mb-1">个性图标</h6>
    <div v-if="error" class="text-danger small">{{ error }}</div>
    <div class="mb-1">
      <span v-for="i in icons" :key="i.id" class="badge bg-warning text-dark me-1">
        {{ i.title }}<span v-if="i.shown">（展示中）</span>
        <button class="btn btn-link btn-sm p-0 ms-1" :disabled="busy" @click="revoke(i)">收回</button>
      </span>
      <span v-if="icons.length === 0" class="small text-muted">没有</span>
    </div>
    <div class="d-flex gap-1">
      <select v-model="key" class="form-select form-select-sm" data-testid="icon-select">
        <option value="">选择图标</option>
        <option v-for="o in options" :key="o.key" :value="o.key">{{ o.title }}（{{ o.key }}）</option>
      </select>
      <button class="btn btn-sm btn-primary text-nowrap" data-testid="icon-grant" :disabled="busy || !key" @click="grant">
        发放
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/views/admin/AdminPlayerView.vue`：导入 `RestIcons`，在"给这家店发补偿"链接（`data-testid="grant-link"`）所在区块之后加 `<RestIcons v-if="restId !== null" :restId="restId" />`；`AdminPlayerView.test.ts` 的 `vi.mock('../../api/admin', …)` 里补 `icons: vi.fn().mockResolvedValue([])`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm vitest run apps/web`
Expected: PASS

- [ ] **Step 5: 全量测试、类型检查、lint、提交**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过

```bash
git add apps/web
git commit -m "feat(web): kill roaches and expel diners on my floor, dining card on home, looks page, admin personal icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/friends.spec.ts`
- Modify: `docs/deploy.md`（蟹老板、周奖励、requireVerifiedEmail 的说明）

**Interfaces:**
- Consumes: 前面所有任务；`registerAndOpen(page, request)`（`e2e/helpers.ts`）

- [ ] **Step 1: 写端到端测试** `apps/web/e2e/friends.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { registerAndOpen } from './helpers';

test('两个玩家互加好友、放蟑螂、灭蟑螂、白食、点赞和回赞', async ({ browser, request }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const A = await registerAndOpen(a, request);
  const B = await registerAndOpen(b, request);

  // 结算每 4 分钟一轮，桌子上可能已经坐了顾客；按内容找"空桌"和"蟑螂"，不写死桌号
  const emptyTable = (p: typeof a) => p.locator('[data-testid^="table-"]', { hasText: '空桌' }).first();

  // A 搜索 B 并申请
  await a.goto('/friends');
  await a.getByTestId('tab-find').click();
  await a.getByTestId('search-input').fill(B.name);
  await a.getByTestId('search-input').press('Enter');
  await a.getByRole('button', { name: '加好友' }).first().click();
  await expect(a.getByText('申请已发出')).toBeVisible();

  // B 同意（蟹老板的申请可能也在列表里，按名字找 A 的那条）
  await b.goto('/friends');
  await b.getByTestId('tab-requests').click();
  await b.locator('[data-testid^="request-"]', { hasText: A.name }).getByRole('button', { name: '同意' }).click();
  await expect(b.getByText(`你和「${A.name}」成为了好友`)).toBeVisible();

  // A 在 B 店的一张空桌放蟑螂
  await a.goto('/friends');
  await a.getByText(B.name).click();
  await emptyTable(a).click();
  await a.getByTestId('act-lay').click();
  await expect(a.getByText('放了一只蟑螂')).toBeVisible();

  // B 在自己楼层消灭一只蟑螂
  await b.goto('/rest/floor');
  // 活着的蟑螂桌标红（"蟑螂（已消灭）"的桌子不标）
  await b.locator('[data-testid^="table-"].text-danger').first().click();
  await b.getByTestId('act-kill').click();
  await expect(b.getByText('消灭了蟑螂')).toBeVisible();

  // A 设置头像后在 B 店的一张空桌白食，首页出现白食卡片
  await a.goto('/rest/look');
  await a.getByTestId('avatar-1').click();
  await expect(a.getByText('头像已更换')).toBeVisible();
  await a.goto('/friends');
  await a.getByText(B.name).click();
  await emptyTable(a).click();
  await a.getByTestId('act-dine').click();
  await expect(a.getByText('开始白食')).toBeVisible();
  await a.goto('/');
  await expect(a.getByTestId('dine-card')).toContainText(B.name);

  // B 给 A 点赞，A 在动态里一键回赞
  await b.goto('/friends');
  await b.getByText(A.name).click();
  await b.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(b.getByText('点赞成功')).toBeVisible();
  await a.goto('/friends');
  await a.getByTestId('tab-feed').click();
  await expect(a.getByText(`${B.name} 给你点了赞`)).toBeVisible();
  await a.getByTestId('return-all').click();
  await expect(a.getByText('回赞了 1 人')).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
```

- [ ] **Step 2: 运行端到端**

先按 `docs/deploy.md` 的开发环境步骤启动（Docker 里的 PostgreSQL、Redis、Mailpit 和 `pnpm dev`；Windows 上先按进程树清掉旧的 dev 进程）。

Run: `pnpm --filter @dt/web e2e`
Expected: 全部通过（原有 3 个 + 新增 1 个）

- [ ] **Step 3: 文档** `docs/deploy.md` 的"运营控制台"一节之后加：

```markdown
## 好友互动

- 每个区服有一家 NPC 餐厅「蟹老板」，由 worker 的 `npc-maintain` 任务每小时检查并创建（新区服、首次部署后一小时内出现），同时向邮箱已验证的玩家发好友申请（每家店只发一次）；`npc-restock` 每天 00:05 给它补橱柜
- 周奖励 `friend-weekly` 每周一 07:59 之后发放：上周翻橱被夹最多、被翻最多前 4、灭蟑螂最多前 2
- 互动默认要求双方邮箱已验证；本地没配邮件时可在控制台把区服数值 `tuning.friend.requireVerifiedEmail` 改成 `false`
- 区服关闭 `features.friend` 后所有互动接口返回"这个区服暂未开放该功能"，自然蟑螂也会停止
```

- [ ] **Step 4: 全量验证、提交**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部通过

```bash
git add apps/web/e2e/friends.spec.ts docs/deploy.md
git commit -m "test(e2e): two players befriend, lay and kill a roach, dine, thumbs and return-all; deploy notes for friends

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
