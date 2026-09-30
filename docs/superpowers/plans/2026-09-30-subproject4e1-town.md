# 子项目 4E-1「小镇日常」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新开"小镇"页：新闻与广播、三个 NPC 每日对话、摇蟹老板钱包、雷神锤换天气、镇长兑换和两种食材兑换券、许愿 / 共飨，当天星愿给全镇结算加成。

**Architecture:** 服务端新增 `modules/town`（纯规则 `rules.ts` + 每个玩法一个文件 + `service.ts` / `routes.ts`），全部写操作走 `runOp`（功能 `town`）。新闻读取放在 `modules/news/news.ts`，首页概览带上"头条"。星愿加成在结算每轮开始时读 `town_bless` 填进 `globals.bless`。前端新增 `/town` 页三个标签和首页"小镇新闻"块，新闻文案集中在 `utils/news.ts`。

**Tech Stack:** pnpm monorepo，TypeScript strict，Fastify 5 + Kysely + PostgreSQL 16，Vue 3 + Pinia + Bootstrap 5，Vitest，Playwright。

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4e1-town-design.md`

## Global Constraints

- 回复、注释、文案用中文；不提交、不格式化、不修改仓库根目录的 `问题记录.md`。
- 每日计数一律传 `gameDay(o.now)`；时间一律用 `o.now` / `d.now()`，不用 `new Date()`。
- 写操作都在 `runOp(d, ctx, { feature: 'town', source }, fn)` 里；错误用 `notEnough` / `requirement` / `limitReached` / `invalidState` / `AppError(ErrorCode.ALREADY_DONE | COOLDOWN | EMAIL_NOT_VERIFIED)`。
- 广播内容纯文字：去首尾空白后 1~64 个字符；前端只用文本插值，不用 `v-html`。
- 摇钱包：同店每天一次（唯一索引兜底）；同 IP、同设备的限制由 tuning `town.shake.limitIp` / `limitDevice` 控制，**开发期默认 false**（用户要求）。
- 雷神锤：冷却 6 小时；全镇两次换天气间隔 ≥ 90 秒；银币 100,000 送爆裂飞弹（19），钻石 8 送幸运饼干（491）；换出的天气和当前不同。
- 星愿：每区服每天只有第一个许愿的人生效；共飨要当天活跃度 ≥ needAct，每人每天一次；持有神灯（389）多领（随机食材多 1 种，自选食材 / 道具 / 钻石 +1，银币 +10%）。
- `rareExchange` 默认 false：N 级券只能换 odds = 100 的普通食材；神秘券不能换 573、574。
- 样式只写在 `apps/web/src/styles/main.css`（本计划不新增样式类，沿用 `dt-row`、`dt-tile` 等），组件里不写 `<style>`。
- Vue 模板里标签之间只含换行的空白会被删掉，需要间距时给后一个元素加 `ms-1`。
- 提交信息结尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **两个请求同时许愿 / 同时换天气**：只能一个成功，另一个得到"今天已经许过愿""90 秒内刚换过"之类的明确错误，不扣钱不扣物品。→ Task 7（雷神锤并发测试）、Task 9（许愿并发测试）。
2. **蟹老板钱不够或没有蟹老板店**：摇到的是剩余银币；0 银币或没有店时报"钱袋空空如也"，不写摇钱记录，第二次还能摇。→ Task 6。
3. **兑换数量越界**：`num` 让累计次数超过上限、材料按 `need × num` 不够时整单拒绝，不扣一半。→ Task 8。
4. **跨天**：昨天许的愿今天不再给结算加成、今天可以重新许愿；昨天聊过的 NPC 今天可以再聊。→ Task 5、Task 9。
5. **新闻里提到的店已改名 / 删除**：新闻显示当前店名；店不存在时显示"某家餐厅"，不报错。→ Task 3（`listNews` 左连接测试）、Task 11（`newsText` 测试）。

---

## 文件结构

**服务端 `apps/server/src/modules/town/`（新建）**

| 文件 | 职责 |
|---|---|
| `rules.ts` | 纯函数：大胃哥抽等级、摇钱包银币和彩蛋、雷神锤天气池、许愿抽取、共飨奖励、神灯加成 |
| `common.ts` | `townRest` / `setTownRest`、`emailVerified`、`cooldownError`、`activationPoints` |
| `broadcast.ts` | 广播 |
| `talk.ts` | NPC 对话 |
| `shake.ts` | 摇钱包 |
| `hammer.ts` | 雷神锤 |
| `exchange.ts` | 镇长兑换、N 级券、神秘券、兑换页数据 |
| `bless.ts` | 许愿、共飨、`todayBless`、`blessBuff` |
| `view.ts` | 小镇概览 `GET /town` |
| `service.ts` / `routes.ts` | 装配和路由 |

**其他服务端改动**：`modules/news/news.ts`（`listNews`、`headlines`）、`modules/world/{rules,service}.ts`（雷神锤天气池、`weather_changed_at`）、`modules/settlement/{runner,rates}.ts`（星愿进结算）、`modules/restaurant/{service,rules}.ts`（头条、今日星愿加成）、`core/features.ts`、`game.ts`、`modules/index.ts`、`db/schema.ts`、`db/migrations/0014_town.ts`。

**配置 `packages/config`**：`tuning.ts`、`ids.ts`、`types.ts`、`raw.ts`、`build.ts`、`runtime.ts`、`data/game/tuning.json`、`data/game/action_map.json`、`data/designed/tasks.json`。

**共享 `packages/shared/src`**：`schemas/town.ts`（请求体和 DTO）、`news.ts`（`NEWS_TYPES`）、`schemas/restaurant.ts`（`headlines`）。

**前端 `apps/web/src`**：`views/TownView.vue`、`components/town/{NewsPanel,TownPanel,ExchangePanel,TicketPanel,HomeNews}.vue`、`components/town/testData.ts`、`utils/news.ts`、`utils/rewards.ts`、`api/endpoints.ts`、`stores/catalog.ts`（天气名）、`i18n/zh-CN.ts`、`router.ts`、`components/MoreLinks.vue`、`views/WeatherView.vue`、`views/RestaurantHomeView.vue`、`e2e/town.spec.ts`。

**文档**：`docs/rules/收益与加成.md` 第 12 节、`docs/deploy.md`。

---

### Task 1: 配置——tuning、道具 id、镇长兑换和星愿的类型化

**Files:**
- Modify: `packages/config/src/tuning.ts`（`tuningSchema` 末尾加 `town`）
- Modify: `packages/config/data/game/tuning.json`（加 `"town"`）
- Modify: `packages/config/src/ids.ts`（`GOODS` 加几项）
- Modify: `packages/config/src/types.ts`（`GoodsExchange`、`Bless`，`ConfigBundle` 加两字段）
- Modify: `packages/config/src/raw.ts`（`rawGoodsExchange`、`rawBless` 收紧）
- Modify: `packages/config/src/build.ts`（生成 `goodsExchange`、`bless`，`extra` 置空，校验）
- Modify: `packages/config/src/runtime.ts`（`goodsExchange`、`bless`、`blessPool`）
- Modify: `packages/config/data/game/action_map.json`（`hiphop.` → `hiphop`，`post.` → `forum`）
- Modify: `packages/config/data/designed/tasks.json`（任务 102、109 的 href 改 `/town`）
- Test: `packages/config/src/build.test.ts`

**Interfaces:**
- Produces:
  - `Tuning['town']`：`{ broadcast: {minStar, cooldownSec, maxLen}, npc: {bigEaterLevelWeights: number[5], bigEaterNum: [min,max], wenjieNum: [min,max], bro13Num: [min,max]}, shake: {base, rand, eggMod, eggTail, burgerEvery, burgerNum, krabCoinNum, limitIp: boolean, limitDevice: boolean}, hammer: {cooldownHours, gapSec, coin, diamond}, bless: {lampCoinBonus}, news: {pageSize}, rareExchange: boolean, mysteryExclude: number[], exchangeMaxNum }`
  - `GOODS.horn = 315`、`GOODS.thorHammer = 256`、`GOODS.krabBurger = 180`、`GOODS.levelTicketBase = 240`（N 级券 = 240 + N）
  - `GoodsExchange { id, category, goodsId, num, need: {goodsId,num}[], times, news }`
  - `Bless { id, name, type: 0|2|3|4|5, num, needAct, levels: [number,number] | null, goodsId: number | null, buff: Record<string,number>, odds }`
  - `GameConfig.goodsExchange: ReadonlyMap<number, GoodsExchange>`、`GameConfig.bless: ReadonlyMap<number, Bless>`、`GameConfig.blessPool: WeightedPool<Bless>`
  - 功能键：`featureOfKey('hiphop.reward') === 'hiphop'`、`featureOfKey('post.create') === 'forum'`、`featureOfKey('broadcast') === 'town'`

- [ ] **Step 1: 写失败的测试**

在 `packages/config/src/build.test.ts` 的 `describe('buildBundle（真实数据）'` 里追加：

```ts
  it('镇长兑换和星愿类型化（子项目 4E-1）', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.goodsExchange).toHaveLength(73);
    expect(bundle!.goodsExchange[1]).toEqual({
      id: 2,
      category: 'bg',
      goodsId: 238,
      num: 1,
      need: [{ goodsId: 180, num: 8 }],
      times: 1,
      news: true,
    });
    expect(bundle!.bless).toHaveLength(12);
    expect(bundle!.bless[0]).toEqual({
      id: 1,
      name: '五谷丰登',
      type: 5,
      num: 3,
      needAct: 60,
      levels: [1, 2],
      goodsId: null,
      buff: { atRate: 0.05 },
      odds: 10,
    });
    expect(bundle!.bless.find((b) => b.id === 6)).toMatchObject({ type: 2, goodsId: 1, levels: null });
    expect('goodsExchange' in bundle!.extra).toBe(false);
    expect('bless' in bundle!.extra).toBe(false);
    expect(bundle!.tuning.town.shake).toMatchObject({ limitIp: false, limitDevice: false });
  });

  it('嘻哈男孩和论坛的事件键不再归到 town（裁定 22）', () => {
    const { bundle } = buildBundle(source());
    const f = bundle!.actionMap.features;
    expect(featureOfKey('hiphop.reward', f)).toBe('hiphop');
    expect(featureOfKey('post.create', f)).toBe('forum');
    expect(featureOfKey('broadcast', f)).toBe('town');
    expect(featureOfKey('krab.shake', f)).toBe('town');
    expect(bundle!.tasks.find((t) => t.id === 102)!.href).toBe('/town');
    expect(bundle!.tasks.find((t) => t.id === 109)!.href).toBe('/town');
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts`
Expected: FAIL（`bundle.goodsExchange` 为 undefined、`hiphop.reward` 归到 `town`）

- [ ] **Step 3: 实现**

`packages/config/src/tuning.ts`，在 `takeaway: z.object({...}),` 之后、`});` 之前加：

```ts
  town: z.object({
    broadcast: z.object({ minStar: int.min(0), cooldownSec: int.min(0), maxLen: int.min(1) }),
    npc: z.object({
      bigEaterLevelWeights: z.array(num.min(0)).length(5),
      bigEaterNum: z.tuple([int.min(1), int.min(1)]),
      wenjieNum: z.tuple([int.min(1), int.min(1)]),
      bro13Num: z.tuple([int.min(1), int.min(1)]),
    }),
    shake: z.object({
      base: int.min(1),
      rand: int.min(1),
      eggMod: int.min(1),
      eggTail: int.min(0),
      burgerEvery: int.min(1),
      burgerNum: int.min(1),
      krabCoinNum: int.min(1),
      limitIp: z.boolean(),
      limitDevice: z.boolean(),
    }),
    hammer: z.object({ cooldownHours: num.min(0), gapSec: int.min(0), coin: int.min(0), diamond: int.min(0) }),
    bless: z.object({ lampCoinBonus: num.min(0) }),
    news: z.object({ pageSize: int.min(1).max(200) }),
    rareExchange: z.boolean(),
    mysteryExclude: z.array(int),
    exchangeMaxNum: int.min(1),
  }),
```

`packages/config/data/game/tuning.json`，在 `"takeaway": {...}` 之后加（注意前一项末尾补逗号）：

```json
  "town": {
    "broadcast": { "minStar": 1, "cooldownSec": 30, "maxLen": 64 },
    "npc": {
      "bigEaterLevelWeights": [50, 25, 13, 9, 3],
      "bigEaterNum": [1, 3],
      "wenjieNum": [1, 20],
      "bro13Num": [1, 2]
    },
    "shake": {
      "base": 8000,
      "rand": 5000,
      "eggMod": 100,
      "eggTail": 88,
      "burgerEvery": 8,
      "burgerNum": 1,
      "krabCoinNum": 8,
      "limitIp": false,
      "limitDevice": false
    },
    "hammer": { "cooldownHours": 6, "gapSec": 90, "coin": 100000, "diamond": 8 },
    "bless": { "lampCoinBonus": 0.1 },
    "news": { "pageSize": 50 },
    "rareExchange": false,
    "mysteryExclude": [573, 574],
    "exchangeMaxNum": 99
  }
```

`packages/config/src/ids.ts`，`GOODS` 末尾 `shopJobHonor: 108, ...` 之后加：

```ts
  horn: 315, // 喇叭（小镇广播）
  thorHammer: 256, // 雷神锤
  krabBurger: 180, // 蟹黄堡（注意：fragmentBase 也是 180，碎片是 181~186）
  levelTicketBase: 240, // N 级食材兑换券 = 240 + N（241~245）
```

`packages/config/src/types.ts`，在 `export interface SeedExchange` 之前加：

```ts
/** 镇长兑换（设计数据 goods_exchange） */
export interface GoodsExchange {
  id: number;
  /** bg 蟹黄堡 / dt 美味券 / chip 碎片 / so 其他 */
  category: string;
  goodsId: number;
  num: number;
  need: Array<{ goodsId: number; num: number }>;
  /** 每人累计限兑次数；-1 不限 */
  times: number;
  /** 兑换后写新闻 */
  news: boolean;
}

/** 星愿（设计数据 bless） */
export interface Bless {
  id: number;
  name: string;
  /** 0 自选食材 / 2 道具 / 3 银币 / 4 钻石 / 5 随机食材 */
  type: 0 | 2 | 3 | 4 | 5;
  num: number;
  needAct: number;
  /** 食材类的等级区间 [低, 高] */
  levels: [number, number] | null;
  goodsId: number | null;
  /** 当天全镇的结算加成 */
  buff: Record<string, number>;
  odds: number;
}
```

并在 `ConfigBundle` 里 `seedExchange: SeedExchange[];` 下一行加：

```ts
  goodsExchange: GoodsExchange[];
  bless: Bless[];
```

`packages/config/src/raw.ts`，替换 `rawGoodsExchange` 和 `rawBless`：

```ts
export const rawGoodsExchange = z.object({
  id: int,
  category: z.string(),
  goodsId: int,
  num: int.min(1),
  needGoods: z.array(z.object({ type: z.literal('goods'), id: int, num: int.min(1) })).min(1),
  times: int,
  newsflag: int,
});
export const rawBless = z.object({
  id: int,
  name: z.string(),
  type: z.union([z.literal(0), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  num: int.min(1),
  needAct: int.min(0),
  value: z.object({ level: z.tuple([int, int]).optional(), goodsId: int.optional() }).nullable(),
  buff: z.record(z.number()),
  odds: int.min(0),
});
```

`packages/config/src/build.ts`：
1. 顶部类型导入里加 `Bless, GoodsExchange`（和 `SeedExchange` 同一个 import）。
2. 把现有的 `for (const e of goodsExRaw) {...}` 和 `for (const b of blessRaw) {...}` 两个校验循环替换为：

```ts
  // ---------- 小镇（子项目 4E-1） ----------
  const goodsExchange: GoodsExchange[] = goodsExRaw.map((e) => ({
    id: e.id,
    category: e.category,
    goodsId: e.goodsId,
    num: e.num,
    need: e.needGoods.map((n) => ({ goodsId: n.id, num: n.num })),
    times: e.times,
    news: e.newsflag === 1,
  }));
  unique(
    'goods_exchange',
    goodsExchange.map((e) => e.id),
  );
  for (const e of goodsExchange) {
    if (!goodsIds.has(e.goodsId)) errors.push(`goods_exchange ${e.id} references unknown goods ${e.goodsId}`);
    for (const n of e.need)
      if (!goodsIds.has(n.goodsId)) errors.push(`goods_exchange ${e.id} references unknown goods ${n.goodsId}`);
    if (e.times === 0 || e.times < -1) errors.push(`goods_exchange ${e.id} times must be -1 or positive`);
  }
  const bless: Bless[] = blessRaw.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    num: b.num,
    needAct: b.needAct,
    levels: b.value?.level ?? null,
    goodsId: b.value?.goodsId ?? null,
    buff: b.buff,
    odds: b.odds,
  }));
  unique(
    'bless',
    bless.map((b) => b.id),
  );
  for (const b of bless) {
    if (b.goodsId !== null && !goodsIds.has(b.goodsId)) errors.push(`bless ${b.id} references unknown goods ${b.goodsId}`);
    if (b.type === 2 && b.goodsId === null) errors.push(`bless ${b.id} needs goodsId`);
    if ((b.type === 0 || b.type === 5) && (b.levels === null || b.levels[0] < 1 || b.levels[1] > 6 || b.levels[0] > b.levels[1]))
      errors.push(`bless ${b.id} needs a level range within 1~6`);
  }
  // 喇叭、雷神锤、蟹黄堡、蟹币、N 级券、神秘券、神秘礼券、爆裂飞弹、幸运饼干、神灯
  for (const id of [1, 19, 20, 180, 240, 241, 242, 243, 244, 245, 256, 315, 389, 491])
    if (!goodsIds.has(id)) errors.push(`town references unknown goods ${id}`);
  for (const id of tuning.town.mysteryExclude)
    if (!foodIds.has(id)) errors.push(`tuning.town.mysteryExclude references unknown food ${id}`);
```

3. 返回体里把 `extra: { goodsExchange: goodsExRaw, bless: blessRaw },` 改为：

```ts
    goodsExchange,
    bless,
    extra: {},
```

（`unique` 是 build.ts 里已有的重复 id 检查函数，用法同 `unique('tasks', ...)`；`foodIds`、`goodsIds`、`tuning` 在这一段之前都已定义。若 `unique` 定义在更后面的位置导致使用顺序问题，把这两段放到 `tasks` 的 `unique(...)` 之后。）

`packages/config/src/runtime.ts`：
1. 类型导入加 `Bless, GoodsExchange`。
2. `GameConfig` 接口 `readonly seedExchange: ...` 下一行加：

```ts
  readonly goodsExchange: ReadonlyMap<number, GoodsExchange>;
  readonly bless: ReadonlyMap<number, Bless>;
  /** 许愿按 odds 抽（设计文档 裁定 7） */
  readonly blessPool: WeightedPool<Bless>;
```

3. `createGameConfig` 返回对象里 `seedExchange: new Map(...)` 下一行加：

```ts
    goodsExchange: new Map(bundle.goodsExchange.map((e) => [e.id, e])),
    bless: new Map(bundle.bless.map((b) => [b.id, b])),
    blessPool: buildPool(bundle.bless, (b) => b.odds),
```

`packages/config/data/game/action_map.json`：`"hiphop.": "town"` 改为 `"hiphop.": "hiphop"`，`"post.": "town"` 改为 `"post.": "forum"`。

`packages/config/data/designed/tasks.json`：id 102 和 109 两条的 `"href"` 改为 `"/town"`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/config exec vitest run && pnpm --filter @dt/config build && pnpm --filter @dt/config typecheck`
Expected: 全部 PASS；build 输出无错误

- [ ] **Step 5: 提交**

```bash
git add packages/config
git commit -m "feat(config): 小镇 tuning、镇长兑换和星愿类型化

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0014 和表类型

**Files:**
- Create: `apps/server/src/db/migrations/0014_town.ts`
- Modify: `apps/server/src/db/migrations/index.ts`
- Modify: `apps/server/src/db/schema.ts`
- Test: `apps/server/src/db/migrations/0014.test.ts`

**Interfaces:**
- Produces（kysely 表）：
  - `world_state.weather_changed_at: TsNullable`
  - `town_bless { shard_id, day: string, bless_id, rest_id, created_at: Ts }`，主键 `(shard_id, day)`
  - `town_rest { rest_id, hammer_at: TsNullable, broadcast_at: TsNullable, big_eater_gift: Default<boolean> }`
  - `town_shake { id: Generated<number>, shard_id, day, rest_id, ip: Default<string>, device: Default<string>, coin, created_at: Ts }`，唯一 `(shard_id, day, rest_id)`
  - `town_exchange_use { rest_id, exchange_id, times }`，主键 `(rest_id, exchange_id)`
  - 索引 `news_shard_id (shard_id, id desc)`、`news_shard_type (shard_id, type, id desc)`

- [ ] **Step 1: 写失败的测试** `apps/server/src/db/migrations/0014.test.ts`

```ts
import { sql } from 'kysely';
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

describe('迁移 0014', () => {
  it('星愿：每区服每天一行', async () => {
    const a = await newRest();
    const row = { shard_id: shard, day: '2026-09-30', bless_id: 1, rest_id: a, created_at: now };
    await db.insertInto('town_bless').values(row).execute();
    await expect(db.insertInto('town_bless').values({ ...row, bless_id: 2 }).execute()).rejects.toThrow();
    await db.insertInto('town_bless').values({ ...row, day: '2026-10-01' }).execute();
  });

  it('小镇个人状态：默认没领过大胃哥首次礼物', async () => {
    const a = await newRest();
    await db.insertInto('town_rest').values({ rest_id: a }).execute();
    expect(
      await db.selectFrom('town_rest').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({ rest_id: a, hammer_at: null, broadcast_at: null, big_eater_gift: false });
  });

  it('摇钱包：同店同一天只有一条；IP 和设备可以重复（开发期限制可关）', async () => {
    const a = await newRest();
    const b = await newRest();
    const row = { shard_id: shard, day: '2026-09-30', rest_id: a, ip: '1.1.1.1', device: 'dev-1', coin: 5, created_at: now };
    await db.insertInto('town_shake').values(row).execute();
    await expect(db.insertInto('town_shake').values(row).execute()).rejects.toThrow();
    await db.insertInto('town_shake').values({ ...row, rest_id: b }).execute();
  });

  it('兑换次数：每店每项一行', async () => {
    const a = await newRest();
    await db.insertInto('town_exchange_use').values({ rest_id: a, exchange_id: 2, times: 1 }).execute();
    await expect(
      db.insertInto('town_exchange_use').values({ rest_id: a, exchange_id: 2, times: 1 }).execute(),
    ).rejects.toThrow();
  });

  it('world_state 有可空的上次换天气时间；新闻有按 id 倒序的索引', async () => {
    const cols = await sql<{ is_nullable: string }>`
      select is_nullable from information_schema.columns
      where table_name = 'world_state' and column_name = 'weather_changed_at'`.execute(db);
    expect(cols.rows).toEqual([{ is_nullable: 'YES' }]);
    const idx = await sql<{ indexname: string }>`
      select indexname from pg_indexes where tablename = 'news' and indexname in ('news_shard_id', 'news_shard_type')
      order by indexname`.execute(db);
    expect(idx.rows.map((r) => r.indexname)).toEqual(['news_shard_id', 'news_shard_type']);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0014.test.ts`
Expected: FAIL（表不存在 / TS 报表名不存在）

- [ ] **Step 3: 实现**

`apps/server/src/db/migrations/0014_town.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table world_state add column weather_changed_at timestamptz`,
    sql`create table town_bless (
      shard_id integer not null references shard(id) on delete cascade,
      day text not null,
      bless_id smallint not null,
      rest_id integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null,
      primary key (shard_id, day)
    )`,
    sql`create table town_rest (
      rest_id integer primary key references restaurant(id) on delete cascade,
      hammer_at timestamptz,
      broadcast_at timestamptz,
      big_eater_gift boolean not null default false
    )`,
    sql`create table town_shake (
      id serial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      day text not null,
      rest_id integer not null references restaurant(id) on delete cascade,
      ip text not null default '',
      device text not null default '',
      coin integer not null check (coin >= 0),
      created_at timestamptz not null,
      unique (shard_id, day, rest_id)
    )`,
    sql`create index town_shake_ip on town_shake (shard_id, day, ip)`,
    sql`create index town_shake_device on town_shake (shard_id, day, device)`,
    sql`create table town_exchange_use (
      rest_id integer not null references restaurant(id) on delete cascade,
      exchange_id smallint not null,
      times integer not null check (times >= 0),
      primary key (rest_id, exchange_id)
    )`,
    sql`create index news_shard_id on news (shard_id, id desc)`,
    sql`create index news_shard_type on news (shard_id, type, id desc)`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists news_shard_type`.execute(db);
  await sql`drop index if exists news_shard_id`.execute(db);
  for (const t of ['town_exchange_use', 'town_shake', 'town_rest', 'town_bless']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`alter table world_state drop column if exists weather_changed_at`.execute(db);
}
```

`apps/server/src/db/migrations/index.ts`：加 `import * as m0014 from './0014_town';` 和 `'0014_town': m0014,`（和 0013 的写法一致）。

`apps/server/src/db/schema.ts`：
1. `WorldStateTable` 加一行 `weather_changed_at: TsNullable;`
2. 在 `TakeawayStateTable` 之前加：

```ts
export interface TownBlessTable {
  shard_id: number;
  day: string;
  bless_id: number;
  rest_id: number;
  created_at: Ts;
}

export interface TownRestTable {
  rest_id: number;
  hammer_at: TsNullable;
  broadcast_at: TsNullable;
  big_eater_gift: Default<boolean>;
}

export interface TownShakeTable {
  id: Generated<number>;
  shard_id: number;
  day: string;
  rest_id: number;
  ip: Default<string>;
  device: Default<string>;
  coin: number;
  created_at: Ts;
}

export interface TownExchangeUseTable {
  rest_id: number;
  exchange_id: number;
  times: number;
}
```

3. `DB` 接口里 `takeaway_state: TakeawayStateTable;` 附近加：

```ts
  town_bless: TownBlessTable;
  town_rest: TownRestTable;
  town_shake: TownShakeTable;
  town_exchange_use: TownExchangeUseTable;
```

- [ ] **Step 4: 迁移测试库并运行**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0014.test.ts`（测试库在 `test/globalSetup.ts` 里自动迁移）
Expected: PASS 5/5

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/db
git commit -m "feat(db): 迁移 0014 小镇表

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 新闻读取、首页头条、小镇模块骨架

**Files:**
- Create: `packages/shared/src/news.ts`
- Create: `packages/shared/src/schemas/town.ts`
- Modify: `packages/shared/src/index.ts`（导出以上两个文件）
- Modify: `packages/shared/src/schemas/restaurant.ts`（`RestaurantDto.headlines`）
- Modify: `apps/server/src/modules/news/news.ts`（`listNews`、`headlines`）
- Create: `apps/server/src/modules/town/service.ts`、`apps/server/src/modules/town/routes.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`、`apps/server/src/core/features.ts`
- Modify: `apps/server/src/modules/restaurant/rules.ts`、`apps/server/src/modules/restaurant/service.ts`
- Modify: `apps/web/src/views/RestaurantHomeView.test.ts`（示例数据补 `headlines`）
- Test: `apps/server/src/modules/news/news.test.ts`、`apps/server/src/modules/news/types.test.ts`

**Interfaces:**
- Produces:
  - `NEWS_TYPES: readonly string[]`、`BROADCAST_NEWS = 'town.broadcast'`（`@dt/shared`）
  - `NewsDto { id: number; type: string; restId: number | null; restName: string | null; params: Record<string, unknown>; createdAt: string }`
  - `NewsPageDto { items: NewsDto[]; hasMore: boolean }`、`HeadlinesDto { news: NewsDto[]; broadcast: NewsDto | null }`
  - `listNews(db, shardId, opts: { before?: number; limit: number; only?: string[]; not?: string[] }): Promise<NewsDto[]>`
  - `headlines(db, shardId): Promise<HeadlinesDto>`
  - `createTownService(d: GameDeps, world: WorldService)` 返回对象，本任务只有 `news(ctx, q: { before?: number }): Promise<NewsPageDto>`；后续任务往里加方法
  - `Game.town: TownService`；路由前缀 `/api/v1`，路径 `/town/...`
  - `RestaurantDto.headlines: HeadlinesDto`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/news/news.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { headlines, listNews, postNews } from './news';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('新闻读取（设计文档 §3.1）', () => {
  it('只读本区服，按 id 倒序，before 翻页；带当前店名，店不存在时为 null', async () => {
    const a = await newRestaurant(t);
    const other = await newRestaurant(t);
    await postNews(t.db, { shardId: a.shardId, type: 'star.up', restId: a.restaurantId, params: { star: 1 } });
    await postNews(t.db, { shardId: other.shardId, type: 'star.up', restId: other.restaurantId });
    await postNews(t.db, { shardId: a.shardId, type: 'weather.change', params: { from: 1, to: 2 } });
    await postNews(t.db, { shardId: a.shardId, type: 'restaurant.open', restId: 999_999_999 });
    await t.db.updateTable('restaurant').set({ name: '改过名' }).where('id', '=', a.restaurantId).execute();

    const page = await listNews(t.db, a.shardId, { limit: 10 });
    expect(page.map((n) => n.type)).toEqual(['restaurant.open', 'weather.change', 'star.up']);
    expect(page[0]).toMatchObject({ restId: 999_999_999, restName: null });
    expect(page[2]).toMatchObject({ restId: a.restaurantId, restName: '改过名', params: { star: 1 } });
    expect(typeof page[2]!.createdAt).toBe('string');

    const next = await listNews(t.db, a.shardId, { limit: 10, before: page[1]!.id });
    expect(next.map((n) => n.type)).toEqual(['star.up']);
  });

  it('头条：最新 3 条非广播 + 最新 1 条广播', async () => {
    const a = await newRestaurant(t);
    const s = a.shardId;
    await postNews(t.db, { shardId: s, type: 'town.broadcast', restId: a.restaurantId, params: { text: '旧' } });
    for (const star of [1, 2, 3, 4]) await postNews(t.db, { shardId: s, type: 'star.up', params: { star } });
    await postNews(t.db, { shardId: s, type: 'town.broadcast', restId: a.restaurantId, params: { text: '新' } });
    const h = await headlines(t.db, s);
    expect(h.news.map((n) => n.params.star)).toEqual([4, 3, 2]);
    expect(h.broadcast).toMatchObject({ type: 'town.broadcast', params: { text: '新' } });
    expect((await headlines(t.db, (await newRestaurant(t)).shardId)).broadcast).toBeNull();
  });

  it('小镇新闻接口：每页 pageSize 条，hasMore', async () => {
    const a = await newRestaurant(t);
    for (let i = 0; i < 52; i++) await postNews(t.db, { shardId: a.shardId, type: 'star.up', params: { star: i } });
    const p1 = await t.game.town.news(a, {});
    expect(p1.items).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    const p2 = await t.game.town.news(a, { before: p1.items[49]!.id });
    expect(p2.items).toHaveLength(2);
    expect(p2.hasMore).toBe(false);
  });

  it('首页概览带头条', async () => {
    const a = await newRestaurant(t);
    await postNews(t.db, { shardId: a.shardId, type: 'star.up', restId: a.restaurantId, params: { star: 1 } });
    const o = await t.game.restaurant.overview(a.restaurantId);
    expect(o.headlines.news).toHaveLength(1);
    expect(o.headlines.broadcast).toBeNull();
  });
});
```

`apps/server/src/modules/news/types.test.ts`（盘点代码里所有新闻类型，保证前端文案表不漏）：

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEWS_TYPES } from '@dt/shared';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('新闻类型清单', () => {
  it('代码里写入的每种新闻都在 NEWS_TYPES 里（前端据此保证每种都有文案）', () => {
    const root = join(__dirname, '..', '..');
    const found = new Set<string>();
    const re = /(?:opNews\([^,]+,\s*|postNews\([\s\S]{0,120}?type:\s*)'([\w.]+)'/g;
    for (const f of sources(root)) {
      for (const m of readFileSync(f, 'utf8').matchAll(re)) found.add(m[1]!);
    }
    expect(found.size).toBeGreaterThanOrEqual(25);
    expect([...found].filter((x) => !NEWS_TYPES.includes(x))).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/news`
Expected: FAIL（`listNews` / `NEWS_TYPES` / `t.game.town` 不存在）

- [ ] **Step 3: 实现**

`packages/shared/src/news.ts`：

```ts
/** 小镇广播的新闻类型 */
export const BROADCAST_NEWS = 'town.broadcast';

/** 代码里会写入的全部新闻类型；前端 utils/news.ts 必须为每一种写文案（types.test 钉住） */
export const NEWS_TYPES: readonly string[] = [
  'bar.cup',
  'bar.fg',
  'bar.num',
  'bar.slot',
  'equip.stress',
  'friend.weekly',
  'gem.broken',
  'gem.levelUp',
  'market.restock',
  'mc.champion',
  'mc.cook',
  'oil.expand',
  'plankton.appear',
  'plankton.driven',
  'rest.move',
  'rest.rename',
  'restaurant.open',
  'shop.special',
  'star.up',
  'takeaway.customer',
  'temple.explore.rare',
  'temple.guardian.rare',
  'tower.rank.week',
  'tower.shop.rare',
  'weather.change',
  'town.broadcast',
  'town.bless',
  'town.shake.lucky',
  'town.exchange',
];
```

`packages/shared/src/schemas/town.ts`：

```ts
import { z } from 'zod';

const id = z.number().int().positive();

export const npcKey = z.enum(['bigEater', 'wenjie', 'bro13']);
export type NpcKey = z.infer<typeof npcKey>;

export const townNewsQuery = z.object({ before: z.coerce.number().int().positive().optional() });
export const townBroadcastBody = z.object({ text: z.string().max(500) });
export const townTalkBody = z.object({ npc: npcKey });
export const townHammerBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('coin'), type: z.number().int().min(1).max(4) }),
  z.object({ mode: z.literal('diamond') }),
]);
export const townExchangeBody = z.object({ id, num: z.number().int().min(1).max(999) });
export const townLevelTicketBody = z.object({
  level: z.number().int().min(1).max(5),
  picks: z.array(z.object({ foodsId: id, num: z.number().int().min(1).max(999) })).min(1).max(30),
});
export const townMysteryTicketBody = z.object({ foodsId: id });
export const townFeastBody = z.object({ foodsId: id.optional() });

export interface NewsDto {
  id: number;
  type: string;
  restId: number | null;
  /** 当前店名；店已不存在时为 null */
  restName: string | null;
  params: Record<string, unknown>;
  createdAt: string;
}

export interface NewsPageDto {
  items: NewsDto[];
  hasMore: boolean;
}

export interface HeadlinesDto {
  news: NewsDto[];
  broadcast: NewsDto | null;
}

/** 小镇玩法获得的东西；银币、钻石的 id 为 null */
export interface TownRewardDto {
  kind: 'foods' | 'goods' | 'seed' | 'coin' | 'diamond';
  id: number | null;
  num: number;
}

export interface TalkResultDto {
  npc: NpcKey;
  talk: string;
  rewards: TownRewardDto[];
}

export interface ShakeResultDto {
  coin: number;
  egg: { goodsId: number; num: number } | null;
}

export interface HammerResultDto {
  from: number;
  to: number;
  gift: { goodsId: number; num: number };
  cooldownUntil: string;
}

export interface ExchangeResultDto {
  goodsId: number;
  num: number;
}

export interface TicketResultDto {
  foods: Array<{ foodsId: number; num: number }>;
}

export interface BlessDto {
  id: number;
  name: string;
  type: number;
  num: number;
  needAct: number;
  levels: [number, number] | null;
  goodsId: number | null;
  buff: Record<string, number>;
}

export interface WishResultDto {
  bless: BlessDto;
}

export interface FeastResultDto {
  rewards: TownRewardDto[];
}

export interface TownDto {
  now: string;
  star: number;
  coin: number;
  diamond: number;
  talked: Record<NpcKey, boolean>;
  /** 大胃哥的首次礼物已经领过 */
  bigEaterGift: boolean;
  shaken: boolean;
  broadcast: { horns: number; readyAt: string | null; minStar: number; maxLen: number };
  hammer: {
    has: boolean;
    /** 我的冷却结束时间 */
    readyAt: string | null;
    /** 全镇 90 秒间隔结束时间 */
    townReadyAt: string | null;
    coin: number;
    diamond: number;
  };
  weather: { id: number; name: string; until: string };
  bless: {
    today: BlessDto | null;
    restName: string | null;
    hasLamp: boolean;
    activation: number;
    feasted: boolean;
  };
}

export interface TownExchangeItemDto {
  id: number;
  category: string;
  goodsId: number;
  num: number;
  need: Array<{ goodsId: number; num: number; have: number }>;
  /** -1 不限 */
  times: number;
  used: number;
}

export interface TownExchangeDto {
  items: TownExchangeItemDto[];
  /** 下标 0~4 对应一到五级食材兑换券的持有数 */
  levelTickets: number[];
  mysteryTickets: number;
  /** 每级可以用 N 级券换的食材 id（下标 0 = 一级） */
  levelFoods: number[][];
  /** 神秘券可以换的 7 级食材 id */
  mysteryFoods: number[];
  maxNum: number;
}
```

`packages/shared/src/index.ts`：加 `export * from './news';` 和 `export * from './schemas/town';`。

`packages/shared/src/schemas/restaurant.ts`：顶部加 `import type { HeadlinesDto } from './town';`，`RestaurantDto` 的 `effects: EffectDto[];` 下一行加：

```ts
  /** 首页小镇新闻：最新 3 条 + 最新广播 */
  headlines: HeadlinesDto;
```

`apps/server/src/modules/news/news.ts` 末尾追加：

```ts
export interface ListNewsOptions {
  before?: number;
  limit: number;
  only?: string[];
  not?: string[];
}

/** 本区服新闻，按 id 倒序；店名取当前名字（左连接，店不存在时为 null） */
export async function listNews(db: Kysely<DB>, shardId: number, o: ListNewsOptions): Promise<NewsDto[]> {
  let q = db
    .selectFrom('news as n')
    .leftJoin('restaurant as r', 'r.id', 'n.rest_id')
    .select(['n.id', 'n.type', 'n.rest_id', 'r.name as rest_name', 'n.params', 'n.created_at'])
    .where('n.shard_id', '=', shardId);
  if (o.before !== undefined) q = q.where('n.id', '<', o.before);
  if (o.only && o.only.length > 0) q = q.where('n.type', 'in', o.only);
  if (o.not && o.not.length > 0) q = q.where('n.type', 'not in', o.not);
  const rows = await q.orderBy('n.id', 'desc').limit(o.limit).execute();
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    restId: r.rest_id,
    restName: r.rest_name ?? null,
    params: r.params,
    createdAt: r.created_at.toISOString(),
  }));
}

/** 首页头条（设计文档 裁定 21） */
export async function headlines(db: Kysely<DB>, shardId: number): Promise<HeadlinesDto> {
  const [news, bc] = await Promise.all([
    listNews(db, shardId, { limit: 3, not: [BROADCAST_NEWS] }),
    listNews(db, shardId, { limit: 1, only: [BROADCAST_NEWS] }),
  ]);
  return { news, broadcast: bc[0] ?? null };
}
```

并在文件顶部加 `import { BROADCAST_NEWS, type HeadlinesDto, type NewsDto } from '@dt/shared';`。

`apps/server/src/modules/town/service.ts`：

```ts
import type { NewsPageDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { listNews } from '../news/news';
import type { WorldService } from '../world/service';

export function createTownService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'town', source }, fn);
  void op;
  void world;

  return {
    async news(ctx: RestCtx, q: { before?: number }): Promise<NewsPageDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'town');
      const size = s.tuning.town.news.pageSize;
      const items = await listNews(d.db, ctx.shardId, { before: q.before, limit: size + 1 });
      return { items: items.slice(0, size), hasMore: items.length > size };
    },
  };
}

export type TownService = ReturnType<typeof createTownService>;
```

（`void op; void world;` 只在本任务里避免"未使用"报错，Task 4 起用上后删掉。）

`apps/server/src/modules/town/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { townNewsQuery } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TownService } from './service';

export function townRoutes(svc: TownService): FastifyPluginAsync {
  return async (r) => {
    r.get('/town/news', async (req) => ok(await svc.news(restCtxOf(req), parse(townNewsQuery, req.query))));
  };
}
```

`apps/server/src/game.ts`：import `createTownService, type TownService`；`Game` 接口加 `town: TownService;`；返回对象加 `town: createTownService(deps, world),`。

`apps/server/src/modules/index.ts`：import `townRoutes`，末尾加 `app.register(townRoutes(game.town), { prefix: '/api/v1' });`。

`apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 里 `'takeaway',` 之后加 `'town',`。

`apps/server/src/modules/restaurant/rules.ts`：`OverviewExtra` 加 `headlines: HeadlinesDto;`（从 `@dt/shared` 导入类型），`toRestaurantDto` 返回对象 `effects: ...` 之后加 `headlines: extra.headlines,`。

`apps/server/src/modules/restaurant/service.ts` 的 `overview`：`toRestaurantDto(..., { ... })` 的第五个参数里加 `headlines: await headlines(d.db, row.shard_id),`（从 `../news/news` 导入 `headlines`）。

`apps/web/src/views/RestaurantHomeView.test.ts`：示例 `RestaurantDto` 数据（含 `plaque2Cost` 的那个对象）里加 `headlines: { news: [], broadcast: null },`。

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/news src/modules/restaurant && pnpm typecheck`
Expected: PASS；typecheck 无错误

- [ ] **Step 5: 提交**

```bash
git add packages/shared apps/server/src apps/web/src/views/RestaurantHomeView.test.ts
git commit -m "feat(town): 新闻分页、首页头条、小镇模块骨架

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: 广播

**Files:**
- Create: `apps/server/src/modules/town/common.ts`
- Create: `apps/server/src/modules/town/broadcast.ts`
- Modify: `apps/server/src/modules/town/service.ts`、`apps/server/src/modules/town/routes.ts`
- Test: `apps/server/src/modules/town/broadcast.test.ts`

**Interfaces:**
- Consumes: `GOODS.horn`（Task 1）、`town_rest`（Task 2）、`listNews`（Task 3）
- Produces:
  - `townRest(o: Op): Promise<TownRestState>`、`setTownRest(o, patch: Partial<TownRestState>)`，`TownRestState = { hammer_at: Date | null; broadcast_at: Date | null; big_eater_gift: boolean }`
  - `cooldownError(what: string, until: Date, now: Date): AppError`（`ErrorCode.COOLDOWN`，params `{ what, seconds }`）
  - `assertVerified(o: Op): Promise<void>`
  - `activationPoints(db, config, restId, day): Promise<number>`
  - `TownService.broadcast(ctx, { text }): Promise<OpResult<{ text: string }>>`；路由 `POST /town/broadcast`

- [ ] **Step 1: 写失败的测试** `apps/server/src/modules/town/broadcast.test.ts`

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const ready = (patch = {}, goods: Record<number, number> = { 315: 2 }) =>
  newRestaurant(t, { patch: { star_level: 1, ...patch }, goods, verified: true });
const send = (ctx: RestCtx, text: string) => t.game.town.broadcast(ctx, { text });

describe('广播（设计文档 §3.2）', () => {
  it('成功：去掉首尾空白，扣 1 个喇叭，写广播新闻，计入支线"在小镇广播一次"', async () => {
    const a = await ready({ main_task_step: 50 });
    expect((await send(a, '  大家好  ')).data).toEqual({ text: '大家好' });
    expect(await goodsNum(t, a.restaurantId, 315)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1 });
    expect(n).toMatchObject({ type: 'town.broadcast', restId: a.restaurantId, params: { text: '大家好' } });
    const side = (await t.game.task.tasks(a)).side.find((x) => x.id === 109);
    expect(side).toMatchObject({ progress: 1, done: true });
  });

  it('64 个字可以，65 个字或全是空白不行', async () => {
    const a = await ready({}, { 315: 5 });
    await expect(send(a, '字'.repeat(65))).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'broadcast_text', max: 64 },
    });
    await expect(send(a, '   ')).rejects.toMatchObject({ params: { reason: 'broadcast_text' } });
    await send(a, '字'.repeat(64));
    expect(await goodsNum(t, a.restaurantId, 315)).toBe(4);
  });

  it('0 星、邮箱没验证、没有喇叭都不能广播', async () => {
    await expect(send(await ready({ star_level: 0 }), '你好')).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const unverified = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 315: 1 } });
    await expect(send(unverified, '你好')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    await expect(send(await ready({}, {}), '你好')).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 315, need: 1, have: 0 },
    });
  });

  it('30 秒冷却', async () => {
    const a = await ready();
    await send(a, '一');
    t.clock.advance(29_000);
    await expect(send(a, '二')).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'broadcast', seconds: 1 },
    });
    t.clock.advance(1_000);
    await send(a, '二');
    expect(await goodsNum(t, a.restaurantId, 315)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town/broadcast.test.ts`
Expected: FAIL（`t.game.town.broadcast is not a function`）

- [ ] **Step 3: 实现**

`apps/server/src/modules/town/common.ts`：

```ts
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { ErrorCode } from '@dt/shared';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { activationTotal } from '../task/rules';

export interface TownRestState {
  hammer_at: Date | null;
  broadcast_at: Date | null;
  big_eater_gift: boolean;
}

/** 本店的小镇状态，没有就建一行（调用方已锁店，不会并发） */
export async function townRest(o: Op): Promise<TownRestState> {
  await o.tx
    .insertInto('town_rest')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('town_rest')
    .select(['hammer_at', 'broadcast_at', 'big_eater_gift'])
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
}

export async function setTownRest(o: Op, patch: Partial<TownRestState>): Promise<void> {
  await o.tx.updateTable('town_rest').set(patch).where('rest_id', '=', o.rest.id).execute();
}

/** 冷却中：带剩余秒数（至少 1） */
export function cooldownError(what: string, until: Date, now: Date): AppError {
  const seconds = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
  return new AppError(ErrorCode.COOLDOWN, 400, { what, seconds });
}

/** 区服要求验证邮箱时（tuning.friend.requireVerifiedEmail），检查本店账号 */
export async function assertVerified(o: Op): Promise<void> {
  if (!o.tuning.friend.requireVerifiedEmail) return;
  const a = await o.tx
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', o.rest.account_id)
    .executeTakeFirstOrThrow();
  if (a.email_verified_at === null) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
}

/** 当日活跃度：算法同任务模块（activationTotal，计数键 act:<id>） */
export async function activationPoints(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  day: string,
): Promise<number> {
  const rows = await db
    .selectFrom('daily_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', restId)
    .where('day', '=', day)
    .where('key', 'like', 'act:%')
    .execute();
  const byKey = new Map(rows.map((r) => [r.key, r.count]));
  const acts = config.bundle.activationTasks.filter((a) => a.limitTimes > 0);
  return activationTotal(acts, new Map(acts.map((a) => [a.id, byKey.get(`act:${a.id}`) ?? 0])));
}
```

`apps/server/src/modules/town/broadcast.ts`：

```ts
import { GOODS } from '@dt/config';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opNews, type Op } from '../../core/op';
import { consumeGoods } from '../store/goods';
import { assertVerified, cooldownError, setTownRest, townRest } from './common';

/** 广播（设计文档 §3.2）：检查顺序 内容 → 星级 → 邮箱 → 冷却 → 喇叭 */
export async function broadcast(o: Op, raw: string): Promise<{ text: string }> {
  const t = o.tuning.town.broadcast;
  const text = raw.trim();
  if (text.length === 0 || [...text].length > t.maxLen) throw invalidState('broadcast_text', { max: t.maxLen });
  if (o.rest.star_level < t.minStar) throw requirement('star', { need: t.minStar });
  await assertVerified(o);
  const tr = await townRest(o);
  if (tr.broadcast_at) {
    const until = new Date(tr.broadcast_at.getTime() + t.cooldownSec * 1000);
    if (until > o.now) throw cooldownError('broadcast', until, o.now);
  }
  await consumeGoods(o, GOODS.horn, 1);
  await setTownRest(o, { broadcast_at: o.now });
  opNews(o, 'town.broadcast', { text });
  await emitAction(o, 'broadcast');
  return { text };
}
```

`service.ts`：删掉 `void op;`，import `broadcast`，返回对象加：

```ts
    broadcast(ctx: RestCtx, b: { text: string }) {
      return op(ctx, 'town.broadcast', (o) => broadcast(o, b.text));
    },
```

`routes.ts`：import `townBroadcastBody`、`okOp`，加：

```ts
    r.post('/town/broadcast', async (req) =>
      okOp(await svc.broadcast(restCtxOf(req), parse(townBroadcastBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town/broadcast.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/town
git commit -m "feat(town): 小镇广播

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: NPC 对话

**Files:**
- Create: `apps/server/src/modules/town/rules.ts`
- Create: `apps/server/src/modules/town/talk.ts`
- Modify: `apps/server/src/modules/town/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/town/rules.test.ts`、`apps/server/src/modules/town/talk.test.ts`

**Interfaces:**
- Consumes: `townRest` / `setTownRest`（Task 4）、`addSeeds(o, seedId, num)`（`modules/temple/common.ts`，已有）、`addFoods`、`grantGoodsOp`、`incrementDaily`
- Produces:
  - `rollRange(range: readonly [number, number], rng: Rng): number`
  - `pickBigEaterLevel(weights: readonly number[], rng: Rng): number`（1~5）
  - `NPC_TALK: Record<NpcKey, string>`、`BIG_EATER_FIRST_TALK: string`
  - `TownService.talk(ctx, { npc }): Promise<OpResult<TalkResultDto>>`；路由 `POST /town/talk`
  - 每日计数键 `town.talk.<npc>`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/town/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { pickBigEaterLevel, rollRange } from './rules';

const W = [50, 25, 13, 9, 3];

describe('小镇规则（纯函数）', () => {
  it('大胃哥按 [50,25,13,9,3] 抽等级', () => {
    expect(pickBigEaterLevel(W, sequenceRng([0]))).toBe(1);
    expect(pickBigEaterLevel(W, sequenceRng([0.5]))).toBe(2);
    expect(pickBigEaterLevel(W, sequenceRng([0.8]))).toBe(3);
    expect(pickBigEaterLevel(W, sequenceRng([0.96]))).toBe(4);
    expect(pickBigEaterLevel(W, sequenceRng([0.99]))).toBe(5);
  });

  it('rollRange 两端都能取到', () => {
    expect(rollRange([1, 3], sequenceRng([0]))).toBe(1);
    expect(rollRange([1, 3], sequenceRng([0.999]))).toBe(3);
    expect(rollRange([1, 20], sequenceRng([0.5]))).toBe(11);
  });
});
```

`apps/server/src/modules/town/talk.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const talk = (ctx: RestCtx, npc: 'bigEater' | 'wenjie' | 'bro13') => t.game.town.talk(ctx, { npc });

describe('NPC 对话（设计文档 §3.3）', () => {
  it('大胃哥：1~5 级食材 1~3 个 + 1 颗种子；第一次另送神秘食材兑换券，第二天不再送', async () => {
    const a = await newRestaurant(t);
    const first = (await talk(a, 'bigEater')).data;
    expect(first.talk).toBe('你! 很有个性是吧!');
    const [food, seed, gift] = first.rewards;
    expect(food!.kind).toBe('foods');
    expect(config.requireFood(food!.id!).level).toBeGreaterThanOrEqual(1);
    expect(config.requireFood(food!.id!).level).toBeLessThanOrEqual(5);
    expect(food!.num).toBeGreaterThanOrEqual(1);
    expect(food!.num).toBeLessThanOrEqual(3);
    expect(seed).toMatchObject({ kind: 'seed', num: 1 });
    expect(gift).toEqual({ kind: 'goods', id: 20, num: 1 });
    expect(await goodsNum(t, a.restaurantId, 20)).toBe(1);
    const seedRow = await t.db
      .selectFrom('rest_seed')
      .select('num')
      .where('rest_id', '=', a.restaurantId)
      .where('seed_id', '=', seed!.id!)
      .executeTakeFirstOrThrow();
    expect(seedRow.num).toBe(1);

    await expect(talk(a, 'bigEater')).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'talk' } });

    t.clock.set(gameTime('2026-10-01', 12));
    const next = (await talk(a, 'bigEater')).data;
    expect(next.talk).toBe('你真有品味! 我也是这样觉得的! 哈哈哈!');
    expect(next.rewards).toHaveLength(2);
    expect(await goodsNum(t, a.restaurantId, 20)).toBe(1);
  });

  it('雯姐送神秘礼券 1~20 张，13 哥送喇叭 1~2 个；各自每天一次', async () => {
    const a = await newRestaurant(t);
    const w = (await talk(a, 'wenjie')).data;
    expect(w.talk).toBe('用了飘柔就明显气质上来了!');
    expect(w.rewards).toHaveLength(1);
    expect(w.rewards[0]).toMatchObject({ kind: 'goods', id: 1 });
    expect(w.rewards[0]!.num).toBeGreaterThanOrEqual(1);
    expect(w.rewards[0]!.num).toBeLessThanOrEqual(20);
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(w.rewards[0]!.num);

    const b = (await talk(a, 'bro13')).data;
    expect(b.talk).toBe('爱就直接去做!!!');
    expect(b.rewards[0]).toMatchObject({ kind: 'goods', id: 315 });
    expect([1, 2]).toContain(b.rewards[0]!.num);

    await expect(talk(a, 'wenjie')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await expect(talk(a, 'bro13')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town/rules.test.ts src/modules/town/talk.test.ts`
Expected: FAIL（`./rules` 不存在）

- [ ] **Step 3: 实现**

`apps/server/src/modules/town/rules.ts`：

```ts
import { buildPool, pickWeighted, type NpcKey, type Rng } from '@dt/shared';

/** [min, max] 闭区间里的整数 */
export function rollRange(range: readonly [number, number], rng: Rng): number {
  return range[0] + rng.int(range[1] - range[0] + 1);
}

/** 大胃哥的食材等级（规格书 12.2：50% 1 级 / 25% 2 / 13% 3 / 9% 4 / 3% 5） */
export function pickBigEaterLevel(weights: readonly number[], rng: Rng): number {
  const pool = buildPool(
    weights.map((w, i) => ({ level: i + 1, w })),
    (x) => x.w,
  );
  return pickWeighted(pool, rng).level;
}

/** 台词照原版 NPCTools */
export const NPC_TALK: Record<NpcKey, string> = {
  bigEater: '你真有品味! 我也是这样觉得的! 哈哈哈!',
  wenjie: '用了飘柔就明显气质上来了!',
  bro13: '爱就直接去做!!!',
};
export const BIG_EATER_FIRST_TALK = '你! 很有个性是吧!';
```

`apps/server/src/modules/town/talk.ts`：

```ts
import { GOODS } from '@dt/config';
import { ErrorCode, gameDay, pickWeighted, type NpcKey, type TalkResultDto, type TownRewardDto } from '@dt/shared';
import { invalidState } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';
import { incrementDaily } from '../counter/dailyCounter';
import { grantGoodsOp } from '../store/goods';
import { addSeeds } from '../temple/common';
import { setTownRest, townRest } from './common';
import { BIG_EATER_FIRST_TALK, NPC_TALK, pickBigEaterLevel, rollRange } from './rules';

/** NPC 对话（设计文档 §3.3、裁定 6）：每个 NPC 每天一次 */
export async function talk(o: Op, npc: NpcKey): Promise<TalkResultDto> {
  const t = o.tuning.town.npc;
  if ((await incrementDaily(o.tx, o.rest.id, `town.talk.${npc}`, 1, gameDay(o.now))) > 1)
    throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'talk' });
  const rewards: TownRewardDto[] = [];
  let line = NPC_TALK[npc];
  if (npc === 'bigEater') {
    const pool = o.config.foodPools.get(pickBigEaterLevel(t.bigEaterLevelWeights, o.rng));
    if (!pool || pool.total <= 0) throw invalidState('no_foods');
    const food = pickWeighted(pool, o.rng);
    const num = rollRange(t.bigEaterNum, o.rng);
    await addFoods(o, food.id, num);
    rewards.push({ kind: 'foods', id: food.id, num });
    const seed = pickWeighted(o.config.seedPool, o.rng);
    await addSeeds(o, seed.id, 1);
    rewards.push({ kind: 'seed', id: seed.id, num: 1 });
    if (!(await townRest(o)).big_eater_gift) {
      await grantGoodsOp(o, GOODS.mysteryFoodExchange, 1);
      await setTownRest(o, { big_eater_gift: true });
      rewards.push({ kind: 'goods', id: GOODS.mysteryFoodExchange, num: 1 });
      line = BIG_EATER_FIRST_TALK;
    }
  } else {
    const goodsId = npc === 'wenjie' ? GOODS.mysteryTicket : GOODS.horn;
    const num = rollRange(npc === 'wenjie' ? t.wenjieNum : t.bro13Num, o.rng);
    await grantGoodsOp(o, goodsId, num);
    rewards.push({ kind: 'goods', id: goodsId, num });
  }
  restLog(o, 'town.talk', { npc, rewards });
  return { npc, talk: line, rewards };
}
```

`service.ts` 加：

```ts
    talk(ctx: RestCtx, b: { npc: NpcKey }) {
      return op(ctx, 'town.talk', (o) => talk(o, b.npc));
    },
```

`routes.ts` 加：

```ts
    r.post('/town/talk', async (req) => okOp(await svc.talk(restCtxOf(req), parse(townTalkBody, req.body))));
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/town
git commit -m "feat(town): NPC 每日对话（大胃哥、雯姐、13 哥）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 摇蟹老板钱包

**Files:**
- Create: `apps/server/src/modules/town/shake.ts`
- Create: `apps/server/test/town.ts`（测试辅助）
- Modify: `apps/server/src/modules/town/rules.ts`、`service.ts`、`routes.ts`
- Test: `apps/server/src/modules/town/rules.test.ts`（追加）、`apps/server/src/modules/town/shake.test.ts`

**Interfaces:**
- Consumes: `npcIdOf(db, shardId)`、`ensureNpc(...)`（`modules/npc/npc.ts`）、`withRestaurants`（`db/tx.ts`）、`createOp` / `flushOp`（`core/op.ts`）
- Produces:
  - `shakeCoin(star: number, s: Tuning['town']['shake'], rng: Rng): number`
  - `shakeEgg(id: number, s: Tuning['town']['shake']): { goodsId: number; num: number } | null`
  - `shake(me: Op, krab: Op, ctx: RestCtx): Promise<ShakeResultDto>`
  - `TownService.shake(ctx): Promise<OpResult<ShakeResultDto>>`；路由 `POST /town/shake`
  - 测试辅助 `krabFor(t: TestGame, shardId: number, coin: number): Promise<number>`、`setTownTuning(t, shardId, patch: object)`

**裁定（计划）**：设计文档说"不和玩家店一起加锁"，但扣蟹老板银币的 update 本身就会锁蟹老板那一行，和好友互动（按店号顺序锁两家）可能形成相反的加锁顺序。改为和双店操作一样，用 `withRestaurants` 按店号顺序同时锁住本店和蟹老板店，在两个 Op 上分别记账——效果和设计一致（原子、有多少给多少），并且不会死锁。

- [ ] **Step 1: 写失败的测试**

`rules.test.ts` 追加（顶部 import 加 `shakeCoin, shakeEgg` 和 `import { testConfig } from '../../../test/config';`）：

```ts
const S = testConfig().tuning.town.shake;

describe('摇钱包规则', () => {
  it('银币 = (8000 − rand[0,4999]) × 星级，至少 1', () => {
    expect(shakeCoin(2, S, sequenceRng([0]))).toBe(16000);
    expect(shakeCoin(2, S, sequenceRng([0.9999]))).toBe(6002);
    expect(shakeCoin(0, S, sequenceRng([0]))).toBe(1);
  });

  it('流水号尾数 88 掏出东西：百位以上 %8 = 1 给蟹黄堡，否则 8 个蟹币', () => {
    expect(shakeEgg(87, S)).toBeNull();
    expect(shakeEgg(88, S)).toEqual({ goodsId: 240, num: 8 });
    expect(shakeEgg(188, S)).toEqual({ goodsId: 180, num: 1 });
    expect(shakeEgg(988, S)).toEqual({ goodsId: 180, num: 1 });
    expect(shakeEgg(288, S)).toEqual({ goodsId: 240, num: 8 });
  });
});
```

`apps/server/test/town.ts`：

```ts
import { seededRng } from '@dt/shared';
import { ensureNpc } from '../src/modules/npc/npc';
import { testConfig } from './config';
import type { TestGame } from './game';

/** 本区服的蟹老板店（没有就建），并把它的银币设成 coin；返回店号 */
export async function krabFor(t: TestGame, shardId: number, coin: number): Promise<number> {
  const config = testConfig();
  const { id } = await ensureNpc(t.db, config, config.tuning.friend.npc, shardId, seededRng(1));
  await t.db.updateTable('restaurant').set({ coin }).where('id', '=', id).execute();
  return id;
}

/** 覆盖本区服的 town 数值（深合并），并清掉区服设置缓存 */
export async function setTownTuning(t: TestGame, shardId: number, town: Record<string, unknown>): Promise<void> {
  await t.db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override: JSON.stringify({ tuning: { town } }) })
    .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify({ tuning: { town } }) }))
    .execute();
  t.game.shards.invalidate(shardId);
}
```


`apps/server/src/modules/town/shake.test.ts`：

```ts
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { krabFor, setTownTuning } from '../../../test/town';
import type { RestCtx } from '../../core/deps';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const shake = (ctx: RestCtx) => t.game.town.shake(ctx);
const shakes = (restId: number) =>
  t.db.selectFrom('town_shake').selectAll().where('rest_id', '=', restId).execute();

describe('摇蟹老板钱包（设计文档 §3.4）', () => {
  it('从蟹老板店扣银币给我；计入活跃"摇蟹老板的钱袋"和支线 102', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 2, coin: 100, main_task_step: 50 } });
    const krab = await krabFor(t, a.shardId, 1_000_000);
    const { coin } = (await shake(a)).data;
    expect(coin).toBeGreaterThanOrEqual(6002);
    expect(coin).toBeLessThanOrEqual(16000);
    expect((await restRow(t, a.restaurantId)).coin).toBe(100 + coin);
    expect((await restRow(t, krab)).coin).toBe(1_000_000 - coin);
    expect((await t.game.task.activation(a)).items.find((i) => i.id === 9)!.count).toBe(1);
    expect((await t.game.task.tasks(a)).side.find((x) => x.id === 102)).toMatchObject({ done: true });
  });

  it('蟹老板钱不够时给剩下的；没钱或没有蟹老板店时报错，不写记录，之后还能摇', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 2 } });
    const krab = await krabFor(t, a.shardId, 3000);
    expect((await shake(a)).data.coin).toBe(3000);
    expect((await restRow(t, krab)).coin).toBe(0);

    const b = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 2 } });
    await expect(shake(b)).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'krab_broke' } });
    expect(await shakes(b.restaurantId)).toHaveLength(0);
    await krabFor(t, a.shardId, 50_000);
    expect((await shake(b)).data.coin).toBeGreaterThan(0);

    const lonely = await newRestaurant(t, { patch: { star_level: 2 } });
    await expect(shake(lonely)).rejects.toMatchObject({ params: { reason: 'krab_broke' } });
  });

  it('同一家店每天一次，第二天可以再摇；两个请求同时摇只成功一个', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1 } });
    await krabFor(t, a.shardId, 1_000_000);
    const both = await Promise.allSettled([shake(a), shake(a)]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(both.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'ALREADY_DONE', params: { what: 'shake' } },
    });
    t.clock.set(gameTime('2026-10-01', 12));
    await shake(a);
    expect(await shakes(a.restaurantId)).toHaveLength(2);
  });

  it('开发期默认不限 IP 和设备；打开开关后同 IP、同设备换店被拒', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1 } });
    const b = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 1 } });
    const c = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 1 } });
    const d = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 1 } });
    await krabFor(t, a.shardId, 1_000_000);
    await shake(a);
    await shake(b);
    await setTownTuning(t, a.shardId, { shake: { limitIp: true } });
    await expect(shake(c)).rejects.toMatchObject({ code: 'LIMIT_REACHED', params: { what: 'shake_device' } });
    await setTownTuning(t, a.shardId, { shake: { limitDevice: true } });
    const dev = 'device-abcdef12';
    await shake({ ...c, ip: '10.0.0.3', deviceId: dev });
    await expect(shake({ ...d, ip: '10.0.0.4', deviceId: dev })).rejects.toMatchObject({
      params: { what: 'shake_device' },
    });
  });

  it('流水号尾数 88：额外掏出蟹黄堡并写新闻', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1 } });
    await krabFor(t, a.shardId, 1_000_000);
    await sql`select setval('town_shake_id_seq', 187)`.execute(t.db);
    const r = (await shake(a)).data;
    const [row] = await shakes(a.restaurantId);
    expect(row!.id).toBe(188);
    expect(r.egg).toEqual({ goodsId: 180, num: 1 });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.shake.lucky'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { goodsId: 180, num: 1 } });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town/rules.test.ts src/modules/town/shake.test.ts`
Expected: FAIL（`shakeCoin` 不存在 / `t.game.town.shake is not a function`）

- [ ] **Step 3: 实现**

`rules.ts` 追加（import 加 `import { GOODS, type Tuning } from '@dt/config';`）：

```ts
type ShakeTuning = Tuning['town']['shake'];

/** 摇到的银币 = (base − rand[0, rand)) × 星级，至少 1（设计文档 §3.4） */
export function shakeCoin(star: number, s: ShakeTuning, rng: Rng): number {
  return Math.max(1, (s.base - rng.int(s.rand)) * star);
}

/** 流水号尾数彩蛋（设计文档 裁定 14） */
export function shakeEgg(id: number, s: ShakeTuning): { goodsId: number; num: number } | null {
  if (id % s.eggMod !== s.eggTail) return null;
  return Math.floor(id / s.eggMod) % s.burgerEvery === 1
    ? { goodsId: GOODS.krabBurger, num: s.burgerNum }
    : { goodsId: GOODS.krabCoin, num: s.krabCoinNum };
}
```

`apps/server/src/modules/town/shake.ts`：

```ts
import { ErrorCode, gameDay, type ShakeResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { grantGoodsOp } from '../store/goods';
import { shakeCoin, shakeEgg } from './rules';

async function shakenBy(o: Op, day: string, col: 'ip' | 'device', value: string): Promise<boolean> {
  const r = await o.tx
    .selectFrom('town_shake')
    .select('id')
    .where('shard_id', '=', o.shardId)
    .where('day', '=', day)
    .where(col, '=', value)
    .executeTakeFirst();
  return r !== undefined;
}

/** 摇蟹老板钱包（设计文档 §3.4、裁定 12~14）。me、krab 两家店已按店号顺序锁住 */
export async function shake(me: Op, krab: Op, ctx: RestCtx): Promise<ShakeResultDto> {
  const s = me.tuning.town.shake;
  const day = gameDay(me.now);
  const mine = await me.tx
    .selectFrom('town_shake')
    .select('id')
    .where('shard_id', '=', me.shardId)
    .where('day', '=', day)
    .where('rest_id', '=', me.rest.id)
    .executeTakeFirst();
  if (mine) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'shake' });
  const ip = ctx.ip ?? '';
  const device = ctx.deviceId ?? '';
  if (s.limitIp && ip !== '' && (await shakenBy(me, day, 'ip', ip))) throw limitReached('shake_device');
  if (s.limitDevice && device !== '' && (await shakenBy(me, day, 'device', device)))
    throw limitReached('shake_device');
  if (krab.rest.coin <= 0) throw invalidState('krab_broke');
  const coin = Math.min(krab.rest.coin, shakeCoin(me.rest.star_level, s, me.rng));
  spendCoin(krab, coin);
  gainCoin(me, coin);
  const row = await me.tx
    .insertInto('town_shake')
    .values({ shard_id: me.shardId, day, rest_id: me.rest.id, ip, device, coin, created_at: me.now })
    .returning('id')
    .executeTakeFirstOrThrow();
  const egg = shakeEgg(row.id, s);
  if (egg) {
    await grantGoodsOp(me, egg.goodsId, egg.num);
    opNews(me, 'town.shake.lucky', egg);
  }
  restLog(me, 'town.shake', { coin, egg });
  await emitAction(me, 'krab.shake');
  return { coin, egg };
}
```

`service.ts`：import `createOp, flushOp`（`../../core/op`）、`withRestaurants`（`../../db/tx`）、`invalidState`、`npcIdOf`（`../npc/npc`）、`shake`，返回对象加：

```ts
    /** 和蟹老板店一起按店号顺序加锁（计划裁定：避免和好友互动的锁顺序相反） */
    async shake(ctx: RestCtx): Promise<OpResult<ShakeResultDto>> {
      const settings = await d.shards.ensureFeature(ctx.shardId, 'town');
      const krabId = await npcIdOf(d.db, ctx.shardId);
      if (krabId === null) throw invalidState('krab_broke');
      return withRestaurants(d.db, [ctx.restaurantId, krabId], async (tx, rests) => {
        const me = createOp(d, tx, rests.get(ctx.restaurantId)!, settings, { source: 'town.shake', ctx });
        const krab = createOp(d, tx, rests.get(krabId)!, settings, {
          source: 'town.shake',
          now: me.now,
          rng: me.rng,
        });
        const data = await shake(me, krab, ctx);
        await flushOp(me);
        await flushOp(krab);
        return { data, events: me.events };
      });
    },
```

`routes.ts` 加：`r.post('/town/shake', async (req) => okOp(await svc.shake(restCtxOf(req))));`

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/town apps/server/test/town.ts
git commit -m "feat(town): 摇蟹老板钱包

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 雷神锤

**Files:**
- Create: `apps/server/src/modules/town/hammer.ts`
- Modify: `apps/server/src/modules/world/rules.ts`（`hammerPool`）
- Modify: `apps/server/src/modules/world/service.ts`（自动轮换写 `weather_changed_at`）
- Modify: `apps/server/src/modules/town/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/world/world.test.ts`（追加 `hammerPool`）、`apps/server/src/modules/town/hammer.test.ts`

**Interfaces:**
- Consumes: `townRest` / `setTownRest` / `cooldownError`（Task 4）、`world.ensure(shardId, now, tx)`、`hasValidHonor`、`spendCoin` / `spendDiamond`、`setWeather(t, shardId, weatherId)`（`test/takeaway.ts`，已有）
- Produces:
  - `HammerPick = { mode: 'coin'; type: number } | { mode: 'diamond' }`（`world/rules.ts`）
  - `hammerPool(config, hour, w: Tuning['world'], pick: HammerPick, currentId: number): WeightedPool<Weather>`
  - `useHammer(o: Op, pick: HammerPick): Promise<HammerResultDto>`
  - `TownService.hammer(ctx, pick): Promise<OpResult<HammerResultDto>>`；路由 `POST /town/hammer`
  - 新闻 `weather.change` 的 params 多一个可选 `by`（使用者店号）

- [ ] **Step 1: 写失败的测试**

`world.test.ts` 追加（import `hammerPool`）：

```ts
describe('雷神锤天气池（4E-1 设计文档 裁定 15）', () => {
  const w = config.tuning.world;
  it('白天按类型筛，含该类型的特殊天气，排除当前天气', () => {
    const ids = hammerPool(config, 12, w, { mode: 'coin', type: 1 }, 1).items.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([2, 3, 6]));
    expect(ids).not.toContain(1);
    for (const id of ids) expect(config.weather.get(id)!.type).toBe(1);
    for (const id of ids) expect([1, 3]).toContain(config.weather.get(id)!.daytime);
  });
  it('钻石只在特殊天气里抽；夜间只剩全天的特殊天气', () => {
    const day = hammerPool(config, 12, w, { mode: 'diamond' }, 1).items.map((x) => x.id);
    expect(day.sort((a, b) => a - b)).toEqual([6, 7, 18, 24, 27]);
    const night = hammerPool(config, 23, w, { mode: 'diamond' }, 7).items.map((x) => x.id);
    expect(night.sort((a, b) => a - b)).toEqual([18, 24, 27]);
  });
  it('夜间按类型筛时包括夜间专属天气', () => {
    const ids = hammerPool(config, 23, w, { mode: 'coin', type: 1 }, 28).items.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([2, 29, 31]));
    expect(ids).not.toContain(1);
  });
});
```

（`world.test.ts` 里已有 `config` 变量；没有的话加 `const config = testConfig();`。）

`apps/server/src/modules/town/hammer.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { setWeather } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const RICH = { coin: 1_000_000, diamond: 100 };
const holder = (shardId?: number) => newRestaurant(t, { shardId, patch: RICH, goods: { 256: 1 } });
const weatherOf = async (shardId: number) =>
  (await t.db.selectFrom('world_state').select('weather_id').where('shard_id', '=', shardId).executeTakeFirstOrThrow())
    .weather_id;
const coin = (ctx: RestCtx, type: number) => t.game.town.hammer(ctx, { mode: 'coin', type });

describe('雷神锤（设计文档 §3.5）', () => {
  it('银币方式：换成该类型里和当前不同的天气，扣 10 万银币，送爆裂飞弹，写新闻', async () => {
    const a = await holder();
    await setWeather(t, a.shardId, 1);
    const r = (await coin(a, 2)).data;
    expect(r.from).toBe(1);
    expect(config.weather.get(r.to)!.type).toBe(2);
    expect(r.gift).toEqual({ goodsId: 19, num: 1 });
    expect(await weatherOf(a.shardId)).toBe(r.to);
    expect((await restRow(t, a.restaurantId)).coin).toBe(900_000);
    expect(await goodsNum(t, a.restaurantId, 19)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['weather.change'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { from: 1, to: r.to, by: a.restaurantId } });
  });

  it('钻石方式：只出特殊天气，扣 8 钻石，送幸运饼干', async () => {
    const a = await holder();
    await setWeather(t, a.shardId, 1);
    const r = (await t.game.town.hammer(a, { mode: 'diamond' })).data;
    expect(config.weather.get(r.to)!.special).toBe(true);
    expect((await restRow(t, a.restaurantId)).diamond).toBe(92);
    expect(await goodsNum(t, a.restaurantId, 491)).toBe(1);
  });

  it('没有雷神锤不能用；冷却 6 小时', async () => {
    const none = await newRestaurant(t, { patch: RICH });
    await expect(coin(none, 1)).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'goods', id: 256 } });
    const a = await holder();
    await setWeather(t, a.shardId, 10);
    await coin(a, 1);
    t.clock.advance(6 * 3600_000 - 1000);
    await expect(coin(a, 2)).rejects.toMatchObject({ code: 'COOLDOWN', params: { what: 'hammer', seconds: 1 } });
    t.clock.advance(1000);
    await coin(a, 2);
  });

  it('全镇 90 秒间隔：别人刚用过、或刚自动轮换过都要等；同时使用只有一个成功', async () => {
    const a = await holder();
    const b = await holder(a.shardId);
    await setWeather(t, a.shardId, 1);
    await coin(a, 2);
    t.clock.advance(89_000);
    await expect(coin(b, 1)).rejects.toMatchObject({ code: 'COOLDOWN', params: { what: 'weather_gap', seconds: 1 } });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000);
    t.clock.advance(1000);
    await coin(b, 1);

    const c = await holder();
    await setWeather(t, c.shardId, 1);
    await t.game.world.changeWeather(c.shardId, latestSlot(t.clock.now, [12]), t.clock.now);
    await expect(coin(c, 2)).rejects.toMatchObject({ params: { what: 'weather_gap' } });

    const e = await holder();
    const f = await holder(e.shardId);
    await setWeather(t, e.shardId, 1);
    const both = await Promise.allSettled([coin(e, 2), coin(f, 3)]);
    expect(both.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('没有可换的天气时报错，不扣钱', async () => {
    const a = await holder();
    await setWeather(t, a.shardId, 1);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ tuning: { world: { dayWeightScale: 0 } } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(coin(a, 2)).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'no_weather' } });
    expect((await restRow(t, a.restaurantId)).coin).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/world src/modules/town/hammer.test.ts`
Expected: FAIL（`hammerPool` 不存在 / `t.game.town.hammer is not a function`）

- [ ] **Step 3: 实现**

`apps/server/src/modules/world/rules.ts` 追加：

```ts
export type HammerPick = { mode: 'coin'; type: number } | { mode: 'diamond' };

/**
 * 雷神锤天气池（4E-1 设计文档 裁定 15）：先按时段筛；银币方式按类型（包括该类型的特殊天气），
 * 钻石方式只要特殊天气；排除当前天气。权重和自动轮换相同
 */
export function hammerPool(
  config: GameConfig,
  hour: number,
  w: Tuning['world'],
  pick: HammerPick,
  currentId: number,
): WeightedPool<Weather> {
  const nightOdds = new Map(w.nightWeatherOdds);
  const allowed = isNight(hour, w) ? [2, 3] : [1, 3];
  const list = [...config.weather.values()]
    .filter(
      (x) =>
        allowed.includes(x.daytime) &&
        x.id !== currentId &&
        (pick.mode === 'diamond' ? x.special : x.type === pick.type),
    )
    .sort((a, b) => a.id - b.id);
  return buildPool(list, (x) => nightOdds.get(x.id) ?? (x.probability ?? 0) * w.dayWeightScale);
}
```

`apps/server/src/modules/world/service.ts` 的 `changeWeather`：`.set({ weather_id: w.id, weather_until: ..., updated_at: now })` 里加 `weather_changed_at: now,`。

`apps/server/src/modules/town/hammer.ts`：

```ts
import { GOODS } from '@dt/config';
import { gameParts, pickWeighted, type HammerResultDto } from '@dt/shared';
import { invalidState, notEnough } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { spendCoin, spendDiamond } from '../../core/resources';
import { grantGoodsOp, hasValidHonor } from '../store/goods';
import { hammerPool, type HammerPick } from '../world/rules';
import { cooldownError, setTownRest, townRest } from './common';

/**
 * 雷神锤（设计文档 §3.5、裁定 15~18）。调用前已确保 world_state 存在；
 * 在事务里锁住本区服 world_state 行再检查 90 秒间隔，两人同时使用只有一个成功
 */
export async function useHammer(o: Op, pick: HammerPick): Promise<HammerResultDto> {
  const h = o.tuning.town.hammer;
  if (!(await hasValidHonor(o, GOODS.thorHammer))) throw notEnough('goods', 1, 0, GOODS.thorHammer);
  const tr = await townRest(o);
  const cooldownMs = h.cooldownHours * 3600_000;
  if (tr.hammer_at) {
    const until = new Date(tr.hammer_at.getTime() + cooldownMs);
    if (until > o.now) throw cooldownError('hammer', until, o.now);
  }
  const ws = await o.tx
    .selectFrom('world_state')
    .select(['weather_id', 'weather_changed_at'])
    .where('shard_id', '=', o.shardId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (ws.weather_changed_at) {
    const until = new Date(ws.weather_changed_at.getTime() + h.gapSec * 1000);
    if (until > o.now) throw cooldownError('weather_gap', until, o.now);
  }
  const pool = hammerPool(o.config, gameParts(o.now).hour, o.tuning.world, pick, ws.weather_id);
  if (pool.total <= 0) throw invalidState('no_weather');
  if (pick.mode === 'coin') spendCoin(o, h.coin);
  else spendDiamond(o, h.diamond);
  const to = pickWeighted(pool, o.rng);
  await o.tx
    .updateTable('world_state')
    .set({ weather_id: to.id, weather_changed_at: o.now, updated_at: o.now })
    .where('shard_id', '=', o.shardId)
    .execute();
  const gift = pick.mode === 'coin' ? GOODS.missileBurst : GOODS.luckyCookie;
  await grantGoodsOp(o, gift, 1);
  await setTownRest(o, { hammer_at: o.now });
  opNews(o, 'weather.change', { from: ws.weather_id, to: to.id, by: o.rest.id });
  restLog(o, 'town.hammer', { mode: pick.mode, from: ws.weather_id, to: to.id });
  return {
    from: ws.weather_id,
    to: to.id,
    gift: { goodsId: gift, num: 1 },
    cooldownUntil: new Date(o.now.getTime() + cooldownMs).toISOString(),
  };
}
```

`service.ts`：删掉 `void world;`，import `useHammer`、`HammerPick`，加：

```ts
    hammer(ctx: RestCtx, pick: HammerPick) {
      return op(ctx, 'town.hammer', async (o) => {
        await world.ensure(o.shardId, o.now, o.tx);
        return useHammer(o, pick);
      });
    },
```

`routes.ts` 加：

```ts
    r.post('/town/hammer', async (req) =>
      okOp(await svc.hammer(restCtxOf(req), parse(townHammerBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/world src/modules/town`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/town apps/server/src/modules/world
git commit -m "feat(town): 雷神锤换天气

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: 兑换——镇长兑换、N 级食材兑换券、神秘食材兑换券

**Files:**
- Create: `apps/server/src/modules/town/exchange.ts`
- Modify: `apps/server/src/modules/town/rules.ts`（可兑食材列表）
- Modify: `apps/server/src/modules/town/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/town/rules.test.ts`（追加）、`apps/server/src/modules/town/exchange.test.ts`

**Interfaces:**
- Consumes: `GoodsExchange`、`config.goodsExchange`（Task 1）、`town_exchange_use`（Task 2）、`consumeGoods`、`grantGoodsOp`、`assertStoreRoom`、`addFoods`、`addFoodsMany`
- Produces:
  - `levelFoodIds(config: GameConfig, town: Tuning['town'], level: number): number[]`
  - `mysteryFoodIds(config: GameConfig, town: Tuning['town']): number[]`
  - `exchangeView(db, config, town: Tuning['town'], restId: number, now: Date): Promise<TownExchangeDto>`
  - `doExchange(o, id, num): Promise<ExchangeResultDto>`、`useLevelTicket(o, level, picks): Promise<TicketResultDto>`、`useMysteryTicket(o, foodsId): Promise<TicketResultDto>`
  - `TownService.exchangeView(ctx)`、`exchange(ctx, {id, num})`、`levelTicket(ctx, {level, picks})`、`mysteryTicket(ctx, {foodsId})`
  - 路由 `GET /town/exchange`、`POST /town/exchange`、`POST /town/level-ticket`、`POST /town/mystery-ticket`

- [ ] **Step 1: 写失败的测试**

`rules.test.ts` 追加（import 加 `levelFoodIds, mysteryFoodIds`）：

```ts
describe('可兑换的食材（设计文档 裁定 5）', () => {
  const config = testConfig();
  const town = config.tuning.town;
  it('稀有兑换关闭时：N 级券只换 odds = 100 的这一级食材；神秘券不能换 573、574', () => {
    const ids = levelFoodIds(config, town, 1);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(config.requireFood(id)).toMatchObject({ level: 1, odds: 100 });
    const m = mysteryFoodIds(config, town);
    expect(m.length).toBeGreaterThan(0);
    for (const id of m) expect(config.requireFood(id).level).toBe(7);
    expect(m).not.toContain(573);
    expect(m).not.toContain(574);
  });
  it('稀有兑换打开时不再限制', () => {
    const open = { ...town, rareExchange: true };
    expect(levelFoodIds(config, open, 1)).toHaveLength(config.foodsByLevel.get(1)!.length);
    expect(mysteryFoodIds(config, open)).toHaveLength(config.foodsByLevel.get(7)!.length);
  });
});
```

`apps/server/src/modules/town/exchange.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
const config = testConfig();
const lv1 = config.foodsByLevel.get(1)!;
const common = lv1.filter((f) => f.odds === 100);
const rare1 = lv1.find((f) => f.odds < 100)!;
const lv2 = config.foodsByLevel.get(2)![0]!;
const mystery = config.foodsByLevel.get(7)!.find((f) => f.id !== 573 && f.id !== 574)!;

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

describe('镇长兑换（设计文档 §3.6）', () => {
  it('兑换页：73 项、持有数、已兑次数、两种券和可换食材', async () => {
    const a = await newRestaurant(t, { goods: { 180: 10, 241: 2, 20: 1 } });
    const v = await t.game.town.exchangeView(a);
    expect(v.items).toHaveLength(73);
    expect(v.items.find((x) => x.id === 2)).toEqual({
      id: 2,
      category: 'bg',
      goodsId: 238,
      num: 1,
      need: [{ goodsId: 180, num: 8, have: 10 }],
      times: 1,
      used: 0,
    });
    expect(v.levelTickets).toEqual([2, 0, 0, 0, 0]);
    expect(v.mysteryTickets).toBe(1);
    expect(v.levelFoods[0]!.sort()).toEqual(common.map((f) => f.id).sort());
    expect(v.mysteryFoods).toContain(mystery.id);
    expect(v.maxNum).toBe(99);
  });

  it('限兑 1 次的项：扣材料、给道具、写新闻；第二次被拒', async () => {
    const a = await newRestaurant(t, { goods: { 180: 20 } });
    expect((await t.game.town.exchange(a, { id: 2, num: 1 })).data).toEqual({ goodsId: 238, num: 1 });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(12);
    expect(await goodsNum(t, a.restaurantId, 238)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.exchange'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { exchangeId: 2, goodsId: 238, num: 1 } });
    await expect(t.game.town.exchange(a, { id: 2, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'exchange', max: 1, used: 1 },
    });
    expect((await t.game.town.exchangeView(a)).items.find((x) => x.id === 2)!.used).toBe(1);
  });

  it('一次兑多份：限次项超出上限整单拒绝；材料按份数不够时什么都不扣', async () => {
    const a = await newRestaurant(t, { goods: { 180: 5 } });
    await expect(t.game.town.exchange(a, { id: 2, num: 2 })).rejects.toMatchObject({
      params: { what: 'exchange', max: 1, used: 0 },
    });
    await expect(t.game.town.exchange(a, { id: 1, num: 3 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 180, need: 6, have: 5 },
    });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(5);
    expect(await goodsNum(t, a.restaurantId, 139)).toBe(0);
    expect((await t.game.town.exchange(a, { id: 1, num: 2 })).data).toEqual({ goodsId: 139, num: 2 });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(1);
  });

  it('份数超过上限、兑换项不存在', async () => {
    const a = await newRestaurant(t, { goods: { 180: 500 } });
    await expect(t.game.town.exchange(a, { id: 1, num: 100 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'batch', max: 99 },
    });
    await expect(t.game.town.exchange(a, { id: 999, num: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_exchange' },
    });
  });
});

describe('食材兑换券（设计文档 §3.6）', () => {
  it('一级券：一次换多种普通食材，合计扣券', async () => {
    const a = await newRestaurant(t, { goods: { 241: 3 } });
    const [x, y] = common;
    const r = (await t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: x!.id, num: 2 }, { foodsId: y!.id, num: 1 }] }))
      .data;
    expect(r.foods).toEqual([
      { foodsId: x!.id, num: 2 },
      { foodsId: y!.id, num: 1 },
    ]);
    expect(await goodsNum(t, a.restaurantId, 241)).toBe(0);
    expect((await foodNum(t, a.restaurantId, x!.id)).num).toBe(2);
  });

  it('等级不符、不是普通食材、券不够都拒绝，不扣券', async () => {
    const a = await newRestaurant(t, { goods: { 241: 1 } });
    await expect(t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: lv2.id, num: 1 }] })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'foods_not_allowed', foodsId: lv2.id },
    });
    await expect(t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: rare1.id, num: 1 }] })).rejects.toMatchObject({
      params: { reason: 'foods_not_allowed' },
    });
    await expect(
      t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: common[0]!.id, num: 2 }] }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'goods', id: 241, need: 2, have: 1 } });
    expect(await goodsNum(t, a.restaurantId, 241)).toBe(1);
  });

  it('神秘券：换 1 个 7 级食材；573 不能换', async () => {
    const a = await newRestaurant(t, { goods: { 20: 2 } });
    expect((await t.game.town.mysteryTicket(a, { foodsId: mystery.id })).data).toEqual({
      foods: [{ foodsId: mystery.id, num: 1 }],
    });
    expect(await goodsNum(t, a.restaurantId, 20)).toBe(1);
    await expect(t.game.town.mysteryTicket(a, { foodsId: 573 })).rejects.toMatchObject({
      params: { reason: 'foods_not_allowed' },
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town/rules.test.ts src/modules/town/exchange.test.ts`
Expected: FAIL（`levelFoodIds` 不存在 / `t.game.town.exchangeView is not a function`）

- [ ] **Step 3: 实现**

`rules.ts` 追加（import 加 `type GameConfig`）：

```ts
type TownTuning = Tuning['town'];

/** N 级食材兑换券能换的食材：稀有兑换关闭时只要 odds = 100 的（设计文档 裁定 5） */
export function levelFoodIds(config: GameConfig, town: TownTuning, level: number): number[] {
  return (config.foodsByLevel.get(level) ?? [])
    .filter((f) => town.rareExchange || f.odds === 100)
    .map((f) => f.id);
}

/** 神秘食材兑换券能换的 7 级食材：稀有兑换关闭时去掉 mysteryExclude */
export function mysteryFoodIds(config: GameConfig, town: TownTuning): number[] {
  const ex = new Set(town.rareExchange ? [] : town.mysteryExclude);
  return (config.foodsByLevel.get(7) ?? []).filter((f) => !ex.has(f.id)).map((f) => f.id);
}
```

`apps/server/src/modules/town/exchange.ts`：

```ts
import { sql, type Kysely } from 'kysely';
import { GOODS, type GameConfig, type Tuning } from '@dt/config';
import type { ExchangeResultDto, TicketResultDto, TownExchangeDto } from '@dt/shared';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { addFoods, addFoodsMany } from '../cupboard/foods';
import { assertStoreRoom, consumeGoods, grantGoodsOp } from '../store/goods';
import { levelFoodIds, mysteryFoodIds } from './rules';

/** 持有数（过期的勋章算 0） */
export async function goodsCounts(
  db: Kysely<DB>,
  restId: number,
  ids: number[],
  now: Date,
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom('store_item')
    .select(['goods_id', 'num', 'expires_at'])
    .where('rest_id', '=', restId)
    .where('goods_id', 'in', ids)
    .execute();
  return new Map(
    rows.map((r) => [r.goods_id, r.expires_at !== null && r.expires_at <= now ? 0 : r.num]),
  );
}

/** 兑换页（设计文档 §3.6） */
export async function exchangeView(
  db: Kysely<DB>,
  config: GameConfig,
  town: Tuning['town'],
  restId: number,
  now: Date,
): Promise<TownExchangeDto> {
  const list = [...config.goodsExchange.values()].sort((a, b) => a.id - b.id);
  const levels = [1, 2, 3, 4, 5];
  const ids = new Set<number>([GOODS.mysteryFoodExchange, ...levels.map((l) => GOODS.levelTicketBase + l)]);
  for (const e of list) for (const n of e.need) ids.add(n.goodsId);
  const have = await goodsCounts(db, restId, [...ids], now);
  const used = new Map(
    (
      await db.selectFrom('town_exchange_use').select(['exchange_id', 'times']).where('rest_id', '=', restId).execute()
    ).map((r) => [r.exchange_id, r.times]),
  );
  return {
    items: list.map((e) => ({
      id: e.id,
      category: e.category,
      goodsId: e.goodsId,
      num: e.num,
      need: e.need.map((n) => ({ goodsId: n.goodsId, num: n.num, have: have.get(n.goodsId) ?? 0 })),
      times: e.times,
      used: used.get(e.id) ?? 0,
    })),
    levelTickets: levels.map((l) => have.get(GOODS.levelTicketBase + l) ?? 0),
    mysteryTickets: have.get(GOODS.mysteryFoodExchange) ?? 0,
    levelFoods: levels.map((l) => levelFoodIds(config, town, l)),
    mysteryFoods: mysteryFoodIds(config, town),
    maxNum: town.exchangeMaxNum,
  };
}

/** 镇长兑换：检查顺序 兑换项 → 份数上限 → 限兑次数 → 仓库空位 → 扣材料（不够整单回滚）→ 给道具 */
export async function doExchange(o: Op, id: number, num: number): Promise<ExchangeResultDto> {
  const e = o.config.goodsExchange.get(id);
  if (!e) throw invalidState('no_exchange');
  const max = o.tuning.town.exchangeMaxNum;
  if (num > max) throw limitReached('batch', { max });
  const row = await o.tx
    .selectFrom('town_exchange_use')
    .select('times')
    .where('rest_id', '=', o.rest.id)
    .where('exchange_id', '=', id)
    .executeTakeFirst();
  const used = row?.times ?? 0;
  if (e.times > 0 && used + num > e.times) throw limitReached('exchange', { max: e.times, used });
  await assertStoreRoom(o, e.goodsId);
  for (const n of e.need) await consumeGoods(o, n.goodsId, n.num * num);
  const got = e.num * num;
  await grantGoodsOp(o, e.goodsId, got);
  await o.tx
    .insertInto('town_exchange_use')
    .values({ rest_id: o.rest.id, exchange_id: id, times: num })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'exchange_id']).doUpdateSet({ times: sql<number>`town_exchange_use.times + ${num}` }),
    )
    .execute();
  if (e.news) opNews(o, 'town.exchange', { exchangeId: id, goodsId: e.goodsId, num: got });
  restLog(o, 'town.exchange', { exchangeId: id, num });
  return { goodsId: e.goodsId, num: got };
}

/** N 级食材兑换券：同一种食材的多次选择合并；合计扣券 */
export async function useLevelTicket(
  o: Op,
  level: number,
  picks: Array<{ foodsId: number; num: number }>,
): Promise<TicketResultDto> {
  const allowed = new Set(levelFoodIds(o.config, o.tuning.town, level));
  const merged = new Map<number, number>();
  for (const p of picks) {
    if (!allowed.has(p.foodsId)) throw invalidState('foods_not_allowed', { foodsId: p.foodsId });
    merged.set(p.foodsId, (merged.get(p.foodsId) ?? 0) + p.num);
  }
  const total = [...merged.values()].reduce((s, x) => s + x, 0);
  await consumeGoods(o, GOODS.levelTicketBase + level, total);
  await addFoodsMany(o, merged);
  restLog(o, 'town.levelTicket', { level, total });
  return { foods: [...merged].map(([foodsId, num]) => ({ foodsId, num })) };
}

/** 神秘食材兑换券：1 张换 1 个 7 级食材 */
export async function useMysteryTicket(o: Op, foodsId: number): Promise<TicketResultDto> {
  if (!mysteryFoodIds(o.config, o.tuning.town).includes(foodsId))
    throw invalidState('foods_not_allowed', { foodsId });
  await consumeGoods(o, GOODS.mysteryFoodExchange, 1);
  await addFoods(o, foodsId, 1);
  restLog(o, 'town.mysteryTicket', { foodsId });
  return { foods: [{ foodsId, num: 1 }] };
}
```

`service.ts` 加：

```ts
    async exchangeView(ctx: RestCtx): Promise<TownExchangeDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'town');
      return exchangeView(d.db, d.config, s.tuning.town, ctx.restaurantId, d.now());
    },
    exchange(ctx: RestCtx, b: { id: number; num: number }) {
      return op(ctx, 'town.exchange', (o) => doExchange(o, b.id, b.num));
    },
    levelTicket(ctx: RestCtx, b: { level: number; picks: Array<{ foodsId: number; num: number }> }) {
      return op(ctx, 'town.levelTicket', (o) => useLevelTicket(o, b.level, b.picks));
    },
    mysteryTicket(ctx: RestCtx, b: { foodsId: number }) {
      return op(ctx, 'town.mysteryTicket', (o) => useMysteryTicket(o, b.foodsId));
    },
```

`routes.ts` 加：

```ts
    r.get('/town/exchange', async (req) => ok(await svc.exchangeView(restCtxOf(req))));
    r.post('/town/exchange', async (req) =>
      okOp(await svc.exchange(restCtxOf(req), parse(townExchangeBody, req.body))),
    );
    r.post('/town/level-ticket', async (req) =>
      okOp(await svc.levelTicket(restCtxOf(req), parse(townLevelTicketBody, req.body))),
    );
    r.post('/town/mystery-ticket', async (req) =>
      okOp(await svc.mysteryTicket(restCtxOf(req), parse(townMysteryTicketBody, req.body))),
    );
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/town
git commit -m "feat(town): 镇长兑换、N 级和神秘食材兑换券

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 星愿——许愿、共飨、全镇结算加成、首页"今日星愿"

**Files:**
- Create: `apps/server/src/modules/town/bless.ts`
- Modify: `apps/server/src/modules/town/rules.ts`（`pickDistinct`、`feastAmount`、`blessFoodIds`）
- Modify: `apps/server/src/modules/settlement/runner.ts`（`bless` 填进 globals）
- Modify: `apps/server/src/modules/settlement/rates.ts`（挑剔率加 `bless` 项）
- Modify: `apps/server/src/modules/restaurant/service.ts`（首页加成加"今日星愿"）
- Modify: `apps/server/src/modules/town/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/town/rules.test.ts`（追加）、`apps/server/src/modules/town/bless.test.ts`、`apps/server/src/modules/settlement/rates.test.ts`（追加）

**Interfaces:**
- Consumes: `config.blessPool`、`config.bless`（Task 1）、`town_bless`（Task 2）、`activationPoints`（Task 4）、`incrementDaily`
- Produces:
  - `pickDistinct<T>(items: readonly T[], n: number, rng: Rng): T[]`
  - `feastAmount(b: Bless, lamp: boolean, lampCoinBonus: number): number`
  - `blessFoodIds(config: GameConfig, levels: [number, number]): number[]`
  - `blessDto(b: Bless): BlessDto`
  - `todayBless(db, config, shardId, now): Promise<{ bless: Bless; restId: number } | null>`
  - `wish(o): Promise<WishResultDto>`、`feast(o, foodsId?: number): Promise<FeastResultDto>`
  - `TownService.wish(ctx)`、`feast(ctx, { foodsId? })`；路由 `POST /town/wish`、`POST /town/feast`
  - 每日计数键 `town.feast`；新闻 `town.bless`（params `{ blessId, name }`）
  - 首页 `EffectDto`：`sourceType: 'bless'`，`name: '今日星愿：<名字>'`

- [ ] **Step 1: 写失败的测试**

`rules.test.ts` 追加（import 加 `blessFoodIds, feastAmount, pickDistinct`）：

```ts
describe('星愿规则（设计文档 §3.7、裁定 8、10）', () => {
  const config = testConfig();
  it('pickDistinct 不重复，数量不超过候选数', () => {
    const got = pickDistinct([1, 2, 3, 4], 3, sequenceRng([0.9, 0.9, 0.9]));
    expect(new Set(got).size).toBe(3);
    expect(pickDistinct([1, 2], 5, sequenceRng([0]))).toHaveLength(2);
  });
  it('神灯加成：银币多 10%，其他数量 +1', () => {
    const coin = config.bless.get(4)!;
    expect(feastAmount(coin, false, 0.1)).toBe(200_000);
    expect(feastAmount(coin, true, 0.1)).toBe(220_000);
    const goods = config.bless.get(6)!;
    expect(feastAmount(goods, true, 0.1)).toBe(31);
    expect(feastAmount(config.bless.get(1)!, true, 0.1)).toBe(4);
  });
  it('食材范围：区间内全部 1~6 级食材', () => {
    const ids = blessFoodIds(config, [1, 2]);
    expect(ids).toHaveLength(config.foodsByLevel.get(1)!.length + config.foodsByLevel.get(2)!.length);
  });
});
```

`apps/server/src/modules/town/bless.test.ts`：

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, roundOf } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { incrementDaily } from '../counter/dailyCounter';
import { listNews } from '../news/news';
import { settleShardRound } from '../settlement/runner';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

/** 直接定下今天的星愿 */
const setBless = (shardId: number, restId: number, blessId: number, day = DAY) =>
  t.db
    .insertInto('town_bless')
    .values({ shard_id: shardId, day, bless_id: blessId, rest_id: restId, created_at: t.clock.now })
    .execute();
/** 把今天的活跃度直接加到至少 points：逐项加满，直到够为止（全部加满共 170 分） */
const giveActivation = async (ctx: RestCtx, points: number) => {
  let sum = 0;
  for (const a of config.bundle.activationTasks.filter((x) => x.limitTimes > 0)) {
    if (sum >= points) break;
    await incrementDaily(t.db, ctx.restaurantId, `act:${a.id}`, a.limitTimes, DAY);
    sum += a.limitTimes * a.points;
  }
};

describe('许愿（设计文档 §3.7）', () => {
  it('持有神灯才能许愿；许到的星愿写新闻，神灯不消耗', async () => {
    const none = await newRestaurant(t);
    await expect(t.game.town.wish(none)).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { id: 389 } });
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    const { bless } = (await t.game.town.wish(a)).data;
    expect(config.bless.get(bless.id)!.name).toBe(bless.name);
    expect(await goodsNum(t, a.restaurantId, 389)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.bless'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { blessId: bless.id, name: bless.name } });
  });

  it('每区服每天只有第一个许愿的人生效；两人同时许愿只成功一个；第二天可以再许', async () => {
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    const b = await newRestaurant(t, { shardId: a.shardId, goods: { 389: 1 } });
    const both = await Promise.allSettled([t.game.town.wish(a), t.game.town.wish(b)]);
    expect(both.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(both.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { code: 'ALREADY_DONE', params: { what: 'wish' } },
    });
    t.clock.set(gameTime('2026-10-01', 12));
    await t.game.town.wish(b);
  });
});

describe('共飨（设计文档 §3.7、裁定 8~10）', () => {
  it('没人许愿、活跃度不够都不能领；领过一次不能再领', async () => {
    const a = await newRestaurant(t);
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({ params: { reason: 'no_bless' } });
    await setBless(a.shardId, a.restaurantId, 4);
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'activation', need: 80, have: 0 },
    });
    await giveActivation(a, 80);
    const before = (await restRow(t, a.restaurantId)).coin;
    expect((await t.game.town.feast(a, {})).data.rewards).toEqual([{ kind: 'coin', id: null, num: 200_000 }]);
    expect((await restRow(t, a.restaurantId)).coin).toBe(before + 200_000);
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'feast' } });
  });

  it('随机食材：区间内不重复的 num 种各 1 个；有神灯多一种', async () => {
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    await setBless(a.shardId, a.restaurantId, 1);
    await giveActivation(a, 60);
    const { rewards } = (await t.game.town.feast(a, {})).data;
    expect(rewards).toHaveLength(4);
    expect(new Set(rewards.map((r) => r.id)).size).toBe(4);
    for (const r of rewards) {
      expect(r).toMatchObject({ kind: 'foods', num: 1 });
      expect([1, 2]).toContain(config.requireFood(r.id!).level);
    }
  });

  it('自选食材：必须选区间里的；给 num 个', async () => {
    const a = await newRestaurant(t);
    await setBless(a.shardId, a.restaurantId, 3);
    await giveActivation(a, 120);
    const lv5 = config.foodsByLevel.get(5)![0]!;
    const lv1 = config.foodsByLevel.get(1)![0]!;
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({ params: { reason: 'foods_not_allowed' } });
    await expect(t.game.town.feast(a, { foodsId: lv1.id })).rejects.toMatchObject({
      params: { reason: 'foods_not_allowed' },
    });
    expect((await t.game.town.feast(a, { foodsId: lv5.id })).data.rewards).toEqual([
      { kind: 'foods', id: lv5.id, num: 1 },
    ]);
    expect((await foodNum(t, a.restaurantId, lv5.id)).num).toBe(1);
  });

  it('道具、钻石', async () => {
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    await setBless(a.shardId, a.restaurantId, 6);
    await giveActivation(a, 60);
    expect((await t.game.town.feast(a, {})).data.rewards).toEqual([{ kind: 'goods', id: 1, num: 31 }]);
    const b = await newRestaurant(t, { patch: { diamond: 0 } });
    await setBless(b.shardId, b.restaurantId, 5);
    await giveActivation(b, 150);
    expect((await t.game.town.feast(b, {})).data.rewards).toEqual([{ kind: 'diamond', id: null, num: 5 }]);
    expect((await restRow(t, b.restaurantId)).diamond).toBe(5);
  });
});

describe('全镇加成（设计文档 §3.7）', () => {
  it('当天的星愿 buff 进结算的各项汇总率；第二天不再有', async () => {
    const a = await newRestaurant(t, { patch: { coin: 1000, oil: 1000 } });
    await setBless(a.shardId, a.restaurantId, 1);
    const now = gameTime(DAY, 12);
    await settleShardRound(t.game.deps, t.game.world, a.shardId, roundOf(now), now);
    const rows = await t.db.selectFrom('income_round').select('rates').where('rest_id', '=', a.restaurantId).execute();
    const rates = rows[0]!.rates as { atRate: { parts: Record<string, number> } };
    expect(rates.atRate.parts.bless).toBe(0.05);

    const next = gameTime('2026-10-01', 12);
    t.clock.set(next);
    await settleShardRound(t.game.deps, t.game.world, a.shardId, roundOf(next), next);
    const rows2 = await t.db
      .selectFrom('income_round')
      .select('rates')
      .where('rest_id', '=', a.restaurantId)
      .orderBy('id', 'desc')
      .execute();
    expect((rows2[0]!.rates as { atRate: { parts: Record<string, number> } }).atRate.parts.bless).toBeUndefined();
  });

  it('首页"生效的加成"最前面是今日星愿，到当天结束', async () => {
    const a = await newRestaurant(t);
    await setBless(a.shardId, a.restaurantId, 4);
    const o = await t.game.restaurant.overview(a.restaurantId);
    expect(o.effects[0]).toEqual({
      sourceType: 'bless',
      sourceId: 4,
      name: '今日星愿：招财进宝',
      effects: { coinRate: 0.08 },
      expiresAt: gameTime('2026-10-01', 0).toISOString(),
    });
  });
});
```

`apps/server/src/modules/settlement/rates.test.ts` 追加：

```ts
  it('星愿的挑剔率计入（4E-1 裁定 11）', () => {
    const { rates: r } = rates({}, { bless: { spRate: 0.03 } });
    expect(r.spRate.parts.bless).toBe(0.03);
  });
```

（放进 `rates.test.ts` 已有的 `describe` 里，`rates` 是文件顶部已有的辅助函数。）

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town src/modules/settlement/rates.test.ts`
Expected: FAIL（`pickDistinct` 不存在 / `t.game.town.wish is not a function` / `parts.bless` 为 undefined）

- [ ] **Step 3: 实现**

`rules.ts` 追加（import 加 `type Bless`）：

```ts
/** 从候选里不重复地抽 n 个（候选不够时全给） */
export function pickDistinct<T>(items: readonly T[], n: number, rng: Rng): T[] {
  const a = [...items];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(a.length - i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

/** 共飨数量（设计文档 裁定 8）：有神灯时银币多 lampCoinBonus，其他 +1 */
export function feastAmount(b: Bless, lamp: boolean, lampCoinBonus: number): number {
  if (!lamp) return b.num;
  return b.type === 3 ? Math.round(b.num * (1 + lampCoinBonus)) : b.num + 1;
}

/** 星愿食材范围（设计文档 裁定 10）：区间内 1~6 级的全部食材 */
export function blessFoodIds(config: GameConfig, levels: [number, number]): number[] {
  const out: number[] = [];
  for (let l = Math.max(1, levels[0]); l <= Math.min(6, levels[1]); l++)
    for (const f of config.foodsByLevel.get(l) ?? []) out.push(f.id);
  return out;
}
```

`apps/server/src/modules/town/bless.ts`：

```ts
import type { Kysely } from 'kysely';
import { GOODS, type Bless, type GameConfig } from '@dt/config';
import {
  ErrorCode,
  gameDay,
  pickWeighted,
  type BlessDto,
  type FeastResultDto,
  type TownRewardDto,
  type WishResultDto,
} from '@dt/shared';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { gainCoin, gainDiamond } from '../../core/resources';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { addFoods, addFoodsMany } from '../cupboard/foods';
import { countGoods, grantGoodsOp } from '../store/goods';
import { activationPoints } from './common';
import { blessFoodIds, feastAmount, pickDistinct } from './rules';

export function blessDto(b: Bless): BlessDto {
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    num: b.num,
    needAct: b.needAct,
    levels: b.levels,
    goodsId: b.goodsId,
    buff: b.buff,
  };
}

/** 本区服今天（按 now 的游戏日）的星愿 */
export async function todayBless(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  now: Date,
): Promise<{ bless: Bless; restId: number } | null> {
  const r = await db
    .selectFrom('town_bless')
    .select(['bless_id', 'rest_id'])
    .where('shard_id', '=', shardId)
    .where('day', '=', gameDay(now))
    .executeTakeFirst();
  const b = r ? config.bless.get(r.bless_id) : undefined;
  return r && b ? { bless: b, restId: r.rest_id } : null;
}

/** 结算用：今天的星愿加成，没有时为 {} */
export async function blessBuff(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  now: Date,
): Promise<Record<string, number>> {
  return (await todayBless(db, config, shardId, now))?.bless.buff ?? {};
}

/** 许愿：持有神灯（不消耗）；主键 (区服, 游戏日) 保证每天只有第一个人生效 */
export async function wish(o: Op): Promise<WishResultDto> {
  const have = await countGoods(o, GOODS.magicLamp);
  if (have < 1) throw notEnough('goods', 1, have, GOODS.magicLamp);
  const b = pickWeighted(o.config.blessPool, o.rng);
  const ins = await o.tx
    .insertInto('town_bless')
    .values({ shard_id: o.shardId, day: gameDay(o.now), bless_id: b.id, rest_id: o.rest.id, created_at: o.now })
    .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
    .returning('bless_id')
    .executeTakeFirst();
  if (!ins) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'wish' });
  opNews(o, 'town.bless', { blessId: b.id, name: b.name });
  restLog(o, 'town.wish', { blessId: b.id });
  return { bless: blessDto(b) };
}

/** 共飨：检查顺序 有星愿 → 活跃度 → 今天没领过 → 发奖 */
export async function feast(o: Op, foodsId?: number): Promise<FeastResultDto> {
  const day = gameDay(o.now);
  const today = await todayBless(o.tx, o.config, o.shardId, o.now);
  if (!today) throw invalidState('no_bless');
  const b = today.bless;
  const act = await activationPoints(o.tx, o.config, o.rest.id, day);
  if (act < b.needAct) throw requirement('activation', { need: b.needAct, have: act });
  if ((await incrementDaily(o.tx, o.rest.id, 'town.feast', 1, day)) > 1)
    throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'feast' });
  const lamp = (await countGoods(o, GOODS.magicLamp)) > 0;
  const n = feastAmount(b, lamp, o.tuning.town.bless.lampCoinBonus);
  const rewards: TownRewardDto[] = [];
  if (b.type === 5) {
    const ids = pickDistinct(blessFoodIds(o.config, b.levels!), n, o.rng);
    await addFoodsMany(o, new Map(ids.map((id) => [id, 1])));
    for (const id of ids) rewards.push({ kind: 'foods', id, num: 1 });
  } else if (b.type === 0) {
    if (foodsId === undefined || !blessFoodIds(o.config, b.levels!).includes(foodsId))
      throw invalidState('foods_not_allowed', { foodsId: foodsId ?? null });
    await addFoods(o, foodsId, n);
    rewards.push({ kind: 'foods', id: foodsId, num: n });
  } else if (b.type === 2) {
    await grantGoodsOp(o, b.goodsId!, n);
    rewards.push({ kind: 'goods', id: b.goodsId, num: n });
  } else if (b.type === 3) {
    gainCoin(o, n);
    rewards.push({ kind: 'coin', id: null, num: n });
  } else {
    gainDiamond(o, n);
    rewards.push({ kind: 'diamond', id: null, num: n });
  }
  restLog(o, 'town.feast', { blessId: b.id, rewards });
  return { rewards };
}
```

`service.ts` 加：

```ts
    wish(ctx: RestCtx) {
      return op(ctx, 'town.wish', (o) => wish(o));
    },
    feast(ctx: RestCtx, b: { foodsId?: number }) {
      return op(ctx, 'town.feast', (o) => feast(o, b.foodsId));
    },
```

`routes.ts` 加：

```ts
    r.post('/town/wish', async (req) => okOp(await svc.wish(restCtxOf(req))));
    r.post('/town/feast', async (req) =>
      okOp(await svc.feast(restCtxOf(req), parse(townFeastBody, req.body ?? {}))),
    );
```

`apps/server/src/modules/settlement/runner.ts`：import `blessBuff`（`../town/bless`），`buildGlobals(...)` 的补丁对象里加 `bless: await blessBuff(d.db, d.config, shardId, now),`。

`apps/server/src/modules/settlement/rates.ts`：挑剔率 `const sp = part({ ... weather: v(w, 'spRate'), ... })` 里 `weather` 之后加 `bless: v(b, 'spRate'),`。

`apps/server/src/modules/restaurant/service.ts` 的 `overview`：把 `return toRestaurantDto(...)` 改为先存到 `dto`，再：

```ts
    const today = await todayBless(d.db, d.config, row.shard_id, now);
    if (today)
      dto.effects.unshift({
        sourceType: 'bless',
        sourceId: today.bless.id,
        name: `今日星愿：${today.bless.name}`,
        effects: today.bless.buff,
        expiresAt: gameTime(addDays(gameDay(now), 1), 0).toISOString(),
      });
    return dto;
```

（import `todayBless` 自 `../town/bless`，`addDays, gameDay, gameTime` 自 `@dt/shared`。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town src/modules/settlement src/modules/restaurant`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules
git commit -m "feat(town): 许愿、共飨和全镇星愿加成

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 小镇概览 `GET /town`；任务开放范围

**Files:**
- Create: `apps/server/src/modules/town/view.ts`
- Modify: `apps/server/src/modules/town/service.ts`、`routes.ts`
- Test: `apps/server/src/modules/town/view.test.ts`

**Interfaces:**
- Consumes: 前面各任务的表和函数：`townRest` 的列、`goodsCounts`（Task 8）、`todayBless` / `blessDto`（Task 9）、`activationPoints`（Task 4）、`world.ensure`
- Produces: `townView(d: GameDeps, world: WorldService, ctx: RestCtx): Promise<TownDto>`；`TownService.overview(ctx)`；路由 `GET /town`

- [ ] **Step 1: 写失败的测试** `apps/server/src/modules/town/view.test.ts`

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { setWeather } from '../../../test/takeaway';
import { krabFor } from '../../../test/town';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

describe('小镇概览（设计文档 §3.8）', () => {
  it('新店：什么都没做', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1, coin: 500, diamond: 7 } });
    await setWeather(t, a.shardId, 1);
    expect(await t.game.town.overview(a)).toEqual({
      now: gameTime(DAY, 12).toISOString(),
      star: 1,
      coin: 500,
      diamond: 7,
      talked: { bigEater: false, wenjie: false, bro13: false },
      bigEaterGift: false,
      shaken: false,
      broadcast: { horns: 0, readyAt: null, minStar: 1, maxLen: 64 },
      hammer: { has: false, readyAt: null, townReadyAt: null, coin: 100_000, diamond: 8 },
      weather: { id: 1, name: '晴', until: expect.any(String) },
      bless: { today: null, restName: null, hasLamp: false, activation: 0, feasted: false },
    });
  });

  it('做过各项之后：状态和冷却都反映出来', async () => {
    const a = await newRestaurant(t, {
      patch: { star_level: 1, coin: 1_000_000 },
      goods: { 315: 3, 256: 1, 389: 1 },
      verified: true,
    });
    await setWeather(t, a.shardId, 1);
    await krabFor(t, a.shardId, 1_000_000);
    await t.game.town.talk(a, { npc: 'bigEater' });
    await t.game.town.broadcast(a, { text: '你好' });
    await t.game.town.shake(a);
    await t.game.town.hammer(a, { mode: 'coin', type: 2 });
    const { bless } = (await t.game.town.wish(a)).data;
    const v = await t.game.town.overview(a);
    const now = gameTime(DAY, 12).getTime();
    expect(v.talked).toEqual({ bigEater: true, wenjie: false, bro13: false });
    expect(v.bigEaterGift).toBe(true);
    expect(v.shaken).toBe(true);
    expect(v.broadcast).toMatchObject({ horns: 2, readyAt: new Date(now + 30_000).toISOString() });
    expect(v.hammer).toMatchObject({
      has: true,
      readyAt: new Date(now + 6 * 3600_000).toISOString(),
      townReadyAt: new Date(now + 90_000).toISOString(),
    });
    expect(v.bless).toMatchObject({ today: { id: bless.id }, hasLamp: true, feasted: false });
    expect(v.bless.restName).toEqual(expect.any(String));
  });

  it('支线任务：广播、摇钱包开放；嘻哈男孩打赏、发帖仍隐藏', async () => {
    const a = await newRestaurant(t, { patch: { main_task_step: 50 } });
    const ids = (await t.game.task.tasks(a)).side.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([102, 109]));
    expect(ids).not.toContain(101);
    expect(ids).not.toContain(107);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town/view.test.ts`
Expected: FAIL（`t.game.town.overview is not a function`）

- [ ] **Step 3: 实现** `apps/server/src/modules/town/view.ts`

```ts
import { GOODS } from '@dt/config';
import { gameDay, type NpcKey, type TownDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import type { WorldService } from '../world/service';
import { blessDto, todayBless } from './bless';
import { activationPoints } from './common';
import { goodsCounts } from './exchange';

const NPCS: NpcKey[] = ['bigEater', 'wenjie', 'bro13'];
const later = (at: Date | null, ms: number, now: Date): string | null =>
  at && at.getTime() + ms > now.getTime() ? new Date(at.getTime() + ms).toISOString() : null;

/** 小镇概览（设计文档 §3.8）：只读，不加锁 */
export async function townView(d: GameDeps, world: WorldService, ctx: RestCtx): Promise<TownDto> {
  const s = await d.shards.ensureFeature(ctx.shardId, 'town');
  const t = s.tuning.town;
  const now = d.now();
  const day = gameDay(now);
  const restId = ctx.restaurantId;
  const rest = await d.db
    .selectFrom('restaurant')
    .select(['star_level', 'coin', 'diamond'])
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  const counters = new Map(
    (
      await d.db
        .selectFrom('daily_counter')
        .select(['key', 'count'])
        .where('rest_id', '=', restId)
        .where('day', '=', day)
        .where('key', 'like', 'town.%')
        .execute()
    ).map((r) => [r.key, r.count]),
  );
  const tr = await d.db
    .selectFrom('town_rest')
    .select(['hammer_at', 'broadcast_at', 'big_eater_gift'])
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  const shaken = await d.db
    .selectFrom('town_shake')
    .select('id')
    .where('shard_id', '=', ctx.shardId)
    .where('day', '=', day)
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  const goods = await goodsCounts(d.db, restId, [GOODS.horn, GOODS.thorHammer, GOODS.magicLamp], now);
  const snap = await world.ensure(ctx.shardId, now);
  const ws = await d.db
    .selectFrom('world_state')
    .select('weather_changed_at')
    .where('shard_id', '=', ctx.shardId)
    .executeTakeFirstOrThrow();
  const today = await todayBless(d.db, d.config, ctx.shardId, now);
  const blessRest = today
    ? await d.db.selectFrom('restaurant').select('name').where('id', '=', today.restId).executeTakeFirst()
    : undefined;
  return {
    now: now.toISOString(),
    star: rest.star_level,
    coin: rest.coin,
    diamond: rest.diamond,
    talked: Object.fromEntries(NPCS.map((n) => [n, (counters.get(`town.talk.${n}`) ?? 0) > 0])) as Record<
      NpcKey,
      boolean
    >,
    bigEaterGift: tr?.big_eater_gift ?? false,
    shaken: shaken !== undefined,
    broadcast: {
      horns: goods.get(GOODS.horn) ?? 0,
      readyAt: later(tr?.broadcast_at ?? null, t.broadcast.cooldownSec * 1000, now),
      minStar: t.broadcast.minStar,
      maxLen: t.broadcast.maxLen,
    },
    hammer: {
      has: (goods.get(GOODS.thorHammer) ?? 0) > 0,
      readyAt: later(tr?.hammer_at ?? null, t.hammer.cooldownHours * 3600_000, now),
      townReadyAt: later(ws.weather_changed_at, t.hammer.gapSec * 1000, now),
      coin: t.hammer.coin,
      diamond: t.hammer.diamond,
    },
    weather: { id: snap.weather.id, name: snap.weather.name, until: snap.weatherUntil.toISOString() },
    bless: {
      today: today ? blessDto(today.bless) : null,
      restName: blessRest?.name ?? null,
      hasLamp: (goods.get(GOODS.magicLamp) ?? 0) > 0,
      activation: await activationPoints(d.db, d.config, restId, day),
      feasted: (counters.get('town.feast') ?? 0) > 0,
    },
  };
}
```

`service.ts` 加：`overview(ctx: RestCtx): Promise<TownDto> { return townView(d, world, ctx); },`

`routes.ts` 加：`r.get('/town', async (req) => ok(await svc.overview(restCtxOf(req))));`

- [ ] **Step 4: 运行，确认通过，再跑服务端全量**

Run: `pnpm --filter @dt/server exec vitest run src/modules/town && pnpm --filter @dt/server test > .superpowers/sdd/server-test.log 2>&1; tail -5 .superpowers/sdd/server-test.log`
Expected: town PASS；服务端全量无失败

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/town
git commit -m "feat(town): 小镇概览接口

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: 前端基础——接口、天气名、新闻文案、奖励文案、错误文案

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`
- Modify: `apps/web/src/stores/catalog.ts`（`weatherName`）
- Create: `apps/web/src/utils/news.ts`、`apps/web/src/utils/rewards.ts`
- Modify: `apps/web/src/i18n/zh-CN.ts`
- Test: `apps/web/src/utils/news.test.ts`、`apps/web/src/i18n/zh-CN.test.ts`（追加）

**Interfaces:**
- Consumes: `@dt/shared` 的 `NEWS_TYPES`、`NewsDto`、`TownDto`、`TownExchangeDto`、各结果 DTO（Task 3）
- Produces:
  - `endpoints.town()`、`townNews(before?)`、`townExchange()`、`townBroadcast(text)`、`townTalk(npc)`、`townShake()`、`townHammer(body)`、`townExchangeDo(id, num)`、`townLevelTicket(level, picks)`、`townMysteryTicket(foodsId)`、`townWish()`、`townFeast(foodsId?)`
  - `catalog.weatherName(id): string`
  - `interface NewsNames { goodsName(id): string; foodName(id): string; mcName(id): string; weatherName(id): string; streetName(id): string }`（catalog store 本身就满足）
  - `newsText(n: NewsDto, names: NewsNames): string`、`newsTime(iso: string): string`、`NEWS_RENDERED: string[]`
  - `rewardText(r: TownRewardDto, names: { goodsName; foodName; seedName }): string`

- [ ] **Step 1: 写失败的测试**

`apps/web/src/utils/news.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { NEWS_TYPES, type NewsDto } from '@dt/shared';
import { NEWS_RENDERED, newsText } from './news';
import { rewardText } from './rewards';

const names = {
  goodsName: (id: number) => `道具${id}`,
  foodName: (id: number) => `食材${id}`,
  mcName: (id: number) => `特色菜${id}`,
  weatherName: (id: number) => (id === 1 ? '晴' : id === 13 ? '暴雨' : `天气${id}`),
  streetName: (id: number) => `街${id}`,
  seedName: (id: number) => `种子${id}`,
};
const n = (type: string, params: Record<string, unknown> = {}, restName: string | null = '小王的店'): NewsDto => ({
  id: 1,
  type,
  restId: restName ? 7 : null,
  restName,
  params,
  createdAt: '2026-09-30T04:00:00.000Z',
});

describe('新闻文案', () => {
  it('代码里每种新闻类型都有文案', () => {
    expect(NEWS_TYPES.filter((x) => !NEWS_RENDERED.includes(x))).toEqual([]);
  });

  it('小镇新增的几种', () => {
    expect(newsText(n('town.broadcast', { text: '大家好' }), names)).toBe('小王的店：大家好');
    expect(newsText(n('town.bless', { blessId: 1, name: '五谷丰登' }), names)).toBe('小王的店许愿得到星愿：五谷丰登');
    expect(newsText(n('town.shake.lucky', { goodsId: 180, num: 1 }), names)).toBe(
      '恭喜小王的店伸进蟹老板裤兜里掏出：道具180×1',
    );
    expect(newsText(n('town.exchange', { exchangeId: 2, goodsId: 238, num: 1 }), names)).toBe(
      '小王的店在镇长处兑换了 道具238×1',
    );
  });

  it('换天气：雷神锤写明是谁；自动轮换没有店名', () => {
    expect(newsText(n('weather.change', { from: 1, to: 13, by: 7 }), names)).toBe('小王的店使用雷神锤，晴转暴雨了');
    expect(newsText(n('weather.change', { from: 1, to: 13 }, null), names)).toBe('天气变了：晴转暴雨');
  });

  it('店不存在时用新闻里记下的名字，都没有时写"某家餐厅"；未知类型不报错', () => {
    expect(newsText(n('star.up', { star: 2, name: '旧名' }, null), names)).toBe('旧名升到了 2 星');
    expect(newsText(n('star.up', { star: 2 }, null), names)).toBe('某家餐厅升到了 2 星');
    expect(newsText(n('no.such.type'), names)).toBe('小镇发生了一件事');
  });
});

describe('奖励文案', () => {
  it('食材、道具、种子、银币、钻石', () => {
    expect(rewardText({ kind: 'foods', id: 101, num: 2 }, names)).toBe('食材101×2');
    expect(rewardText({ kind: 'goods', id: 20, num: 1 }, names)).toBe('道具20×1');
    expect(rewardText({ kind: 'seed', id: 3, num: 1 }, names)).toBe('种子3×1');
    expect(rewardText({ kind: 'coin', id: null, num: 200000 }, names)).toBe('银币 200,000');
    expect(rewardText({ kind: 'diamond', id: null, num: 5 }, names)).toBe('钻石 5');
  });
});
```

`apps/web/src/i18n/zh-CN.test.ts` 追加：

```ts
describe('小镇错误文案（4E-1）', () => {
  it('冷却、已做过、上限、状态', () => {
    expect(errorText('COOLDOWN', { what: 'broadcast', seconds: 12 })).toBe('广播冷却中，还要等 12 秒');
    expect(errorText('COOLDOWN', { what: 'hammer', seconds: 3700 })).toBe('雷神锤冷却中，还要等 1 小时 2 分钟');
    expect(errorText('COOLDOWN', { what: 'weather_gap', seconds: 30 })).toBe('刚换过天气，30 秒后才能再换');
    expect(errorText('ALREADY_DONE', { what: 'talk' })).toBe('今天已经聊过了');
    expect(errorText('ALREADY_DONE', { what: 'wish' })).toBe('今天已经有人许过愿了');
    expect(errorText('LIMIT_REACHED', { what: 'exchange', max: 1, used: 1 })).toBe('这一项每人限兑 1 次（已兑 1 次）');
    expect(errorText('INVALID_STATE', { reason: 'krab_broke' })).toBe('蟹老板的钱袋空空如也');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'activation', need: 80, have: 12 })).toBe(
      '活跃度不够（需要 80，当前 12）',
    );
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/utils/news.test.ts src/i18n/zh-CN.test.ts`
Expected: FAIL（`./news` 不存在；小镇错误文案落到默认文案）

- [ ] **Step 3: 实现**

`apps/web/src/utils/news.ts`：

```ts
import type { NewsDto } from '@dt/shared';
import { formatNum } from './format';

export interface NewsNames {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName(id: number): string;
  weatherName(id: number): string;
  streetName(id: number): string;
}

type P = Record<string, unknown>;
const num = (x: unknown) => Number(x ?? 0);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const WEEKLY: Record<string, string> = { 'flip.caught': '翻厨被夹', 'flip.flipped': '被翻厨', 'roach.kill': '灭蟑螂' };

const RENDER: Record<string, (w: string, p: P, x: NewsNames) => string> = {
  'bar.cup': (w, p) => `${w}在酒吧猜酒杯连中 ${num(p.times)} 次`,
  'bar.fg': (w, p) => `${w}在酒吧猜拳连胜 ${num(p.times)} 次`,
  'bar.num': (w) => `${w}在酒吧转数字转中了`,
  'bar.slot': (w, p, x) =>
    `${w}在酒吧拉霸拉到了 ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}×${num(p.num)}`,
  'equip.stress': (w, p, x) => `${w}把 ${x.goodsName(num(p.goodsId))} 强化到了 +${num(p.stress)}`,
  'friend.weekly': (w, p, x) =>
    `${w}获得上周${WEEKLY[str(p.key)] ?? '排行'}第 ${num(p.rank)} 名，奖励 ${x.goodsName(num(p.goodsId))}`,
  'gem.broken': (w, p, x) => `${w}升阶宝石失败，碎了 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
  'gem.levelUp': (w, p, x) => `${w}升阶出 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
  'market.restock': (_w, p, x) =>
    `菜场进货了：${(Array.isArray(p.foods) ? p.foods : []).map((id) => x.foodName(num(id))).join('、')}`,
  'mc.champion': (w, p) => `${w}成为昨日特色菜价值第一（${formatNum(num(p.value))}）`,
  'mc.cook': (w, p, x) => `${w}烹制出 ${x.mcName(num(p.mcId))}×${num(p.num)}`,
  'oil.expand': (w, p) => `${w}把油壶扩容到 ${num(p.level)} 级`,
  'plankton.appear': (w) => `痞老板赖在了${w}不走`,
  'plankton.driven': (w) => `${w}赶走了痞老板`,
  'rest.move': (w, p, x) => `${w}搬到了${x.streetName(num(p.to))}`,
  'rest.rename': (_w, p) => `${str(p.from)} 改名为 ${str(p.to)}`,
  'restaurant.open': (w) => `${w}开业了`,
  'shop.special': (_w, p, x) => `商店今日特价：${x.goodsName(num(p.goodsId))}`,
  'star.up': (w, p) => `${w}升到了 ${num(p.star)} 星`,
  'takeaway.customer': (w, p, x) => `${w}送外卖时遇到了${x.goodsName(num(p.goodsId))}`,
  'temple.explore.rare': (w, p, x) =>
    `${w}在神殿探险中发现了 ${(Array.isArray(p.foods) ? (p.foods as P[]) : [])
      .map((f) => `${x.foodName(num(f.foodsId))}×${num(f.num)}`)
      .join('、')}`,
  'temple.guardian.rare': (w, p, x) => `${w}击败守护兽获得 ${x.foodName(num(p.foodsId))}`,
  'tower.rank.week': (_w, p) =>
    `厨塔周榜：${(Array.isArray(p.top) ? (p.top as P[]) : [])
      .map((r) => `第 ${num(r.rank)} 名 ${str(r.name)}`)
      .join('，')}`,
  'tower.shop.rare': (w, p, x) => `${w}在厨塔商店兑换了 ${x.goodsName(num(p.goodsId))}`,
  'weather.change': (w, p, x) =>
    p.by !== undefined
      ? `${w}使用雷神锤，${x.weatherName(num(p.from))}转${x.weatherName(num(p.to))}了`
      : `天气变了：${x.weatherName(num(p.from))}转${x.weatherName(num(p.to))}`,
  'town.broadcast': (w, p) => `${w}：${str(p.text)}`,
  'town.bless': (w, p) => `${w}许愿得到星愿：${str(p.name)}`,
  'town.shake.lucky': (w, p, x) => `恭喜${w}伸进蟹老板裤兜里掏出：${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
  'town.exchange': (w, p, x) => `${w}在镇长处兑换了 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
};

/** 有文案的新闻类型（测试用来对照 NEWS_TYPES） */
export const NEWS_RENDERED: string[] = Object.keys(RENDER);

/** 新闻文案：店名用当前名字；店已不存在时用新闻里记下的名字，都没有时写"某家餐厅" */
export function newsText(n: NewsDto, x: NewsNames): string {
  const r = RENDER[n.type];
  if (!r) return '小镇发生了一件事';
  const who = n.restName ?? (str(n.params.name) || '某家餐厅');
  return r(who, n.params, x);
}

export function newsTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
```

`apps/web/src/utils/rewards.ts`：

```ts
import type { TownRewardDto } from '@dt/shared';
import { formatNum } from './format';

export function rewardText(
  r: TownRewardDto,
  x: { goodsName(id: number): string; foodName(id: number): string; seedName(id: number): string },
): string {
  switch (r.kind) {
    case 'foods':
      return `${x.foodName(r.id!)}×${r.num}`;
    case 'goods':
      return `${x.goodsName(r.id!)}×${r.num}`;
    case 'seed':
      return `${x.seedName(r.id!)}×${r.num}`;
    case 'coin':
      return `银币 ${formatNum(r.num)}`;
    default:
      return `钻石 ${r.num}`;
  }
}
```

`apps/web/src/stores/catalog.ts`：state 加 `weatherMap: new Map<number, string>(),`；`apply` 里加 `this.weatherMap = new Map(c.weather.map((w) => [w.id, w.name]));`；actions 加：

```ts
    weatherName(id: number): string {
      return this.weatherMap.get(id) ?? `天气${id}`;
    },
```

`apps/web/src/api/endpoints.ts`：类型导入加 `ExchangeResultDto, FeastResultDto, HammerResultDto, NewsPageDto, NpcKey, ShakeResultDto, TalkResultDto, TicketResultDto, TownDto, TownExchangeDto, WishResultDto`，`endpoints` 末尾加：

```ts
  town: () => api.get<TownDto>('/api/v1/town'),
  townNews: (before?: number) =>
    api.get<NewsPageDto>(before === undefined ? '/api/v1/town/news' : `/api/v1/town/news?before=${before}`),
  townExchange: () => api.get<TownExchangeDto>('/api/v1/town/exchange'),
  townBroadcast: (text: string) => api.post<{ text: string }>('/api/v1/town/broadcast', { text }),
  townTalk: (npc: NpcKey) => api.post<TalkResultDto>('/api/v1/town/talk', { npc }),
  townShake: () => api.post<ShakeResultDto>('/api/v1/town/shake'),
  townHammer: (body: { mode: 'coin'; type: number } | { mode: 'diamond' }) =>
    api.post<HammerResultDto>('/api/v1/town/hammer', body),
  townExchangeDo: (id: number, num: number) => api.post<ExchangeResultDto>('/api/v1/town/exchange', { id, num }),
  townLevelTicket: (level: number, picks: Array<{ foodsId: number; num: number }>) =>
    api.post<TicketResultDto>('/api/v1/town/level-ticket', { level, picks }),
  townMysteryTicket: (foodsId: number) => api.post<TicketResultDto>('/api/v1/town/mystery-ticket', { foodsId }),
  townWish: () => api.post<WishResultDto>('/api/v1/town/wish'),
  townFeast: (foodsId?: number) =>
    api.post<FeastResultDto>('/api/v1/town/feast', foodsId === undefined ? {} : { foodsId }),
```

`apps/web/src/i18n/zh-CN.ts`：
1. `REQUIREMENT.activation` 改为：

```ts
  activation: (p) =>
    p.have === undefined
      ? `活跃度不够（需要 ${String(p.need)}）`
      : `活跃度不够（需要 ${String(p.need)}，当前 ${String(p.have)}）`,
```

2. `LIMIT` 加：

```ts
  shake_device: () => '同一网络或设备今天已经摇过了',
  exchange: (p) => `这一项每人限兑 ${String(p.max)} 次（已兑 ${String(p.used)} 次）`,
```

3. `STATE` 加：

```ts
  broadcast_text: '广播内容要 1~64 个字',
  krab_broke: '蟹老板的钱袋空空如也',
  no_bless: '今天还没有人许愿',
  foods_not_allowed: '这个食材不能换',
  no_weather: '现在没有可以换的天气',
  no_exchange: '没有这个兑换项',
  no_foods: '这一级没有食材',
```

4. `ALREADY` 加：

```ts
  talk: '今天已经聊过了',
  shake: '蟹老板握紧了他的钱袋（今天已经摇过了）',
  wish: '今天已经有人许过愿了',
  feast: '今天已经共飨过了',
```

5. `errorText` 里 `if (code === 'COOLDOWN' && params.what === 'flip') ...` 之后加：

```ts
  if (code === 'COOLDOWN' && params.what === 'broadcast')
    return `广播冷却中，还要等 ${String(params.seconds)} 秒`;
  if (code === 'COOLDOWN' && params.what === 'weather_gap')
    return `刚换过天气，${String(params.seconds)} 秒后才能再换`;
  if (code === 'COOLDOWN' && params.what === 'hammer') {
    const m = Math.ceil(Number(params.seconds ?? 60) / 60);
    return `雷神锤冷却中，还要等 ${m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分钟` : `${m} 分钟`}`;
  }
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/utils src/i18n && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src
git commit -m "feat(web): 小镇接口、新闻和奖励文案、错误文案

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 小镇页——新闻标签、小镇标签、入口

**Files:**
- Create: `apps/web/src/views/TownView.vue`
- Create: `apps/web/src/components/town/NewsPanel.vue`、`apps/web/src/components/town/TownPanel.vue`、`apps/web/src/components/town/testData.ts`
- Modify: `apps/web/src/router.ts`、`apps/web/src/components/MoreLinks.vue`、`apps/web/src/views/WeatherView.vue`
- Test: `apps/web/src/components/town/NewsPanel.test.ts`、`apps/web/src/components/town/TownPanel.test.ts`

**Interfaces:**
- Consumes: Task 11 的 `endpoints.town*`、`newsText`、`newsTime`、`rewardText`、`catalog.weatherName`；`effectChips`（`utils/effects.ts`，已有）
- Produces:
  - `townData(patch?: Partial<TownDto>): TownDto`、`blessData(patch?: Partial<BlessDto>): BlessDto`（`components/town/testData.ts`）
  - `NewsPanel`、`TownPanel`：props `{ data: TownDto }`，emit `reload`
  - 路由 `/town`（`meta: { needRestaurant: true }`）；"更多 → 玩法"里"小镇"入口

- [ ] **Step 1: 写失败的测试**

`apps/web/src/components/town/testData.ts`：

```ts
import type { BlessDto, TownDto } from '@dt/shared';

export const blessData = (patch: Partial<BlessDto> = {}): BlessDto => ({
  id: 3,
  name: '心想事成',
  type: 0,
  num: 1,
  needAct: 120,
  levels: [5, 5],
  goodsId: null,
  buff: { expRate: 0.1 },
  ...patch,
});

export const townData = (patch: Partial<TownDto> = {}): TownDto => ({
  now: '2026-09-30T04:00:00.000Z',
  star: 1,
  coin: 1_000_000,
  diamond: 20,
  talked: { bigEater: false, wenjie: false, bro13: false },
  bigEaterGift: false,
  shaken: false,
  broadcast: { horns: 2, readyAt: null, minStar: 1, maxLen: 64 },
  hammer: { has: true, readyAt: null, townReadyAt: null, coin: 100_000, diamond: 8 },
  weather: { id: 1, name: '晴', until: '2026-09-30T06:00:00.000Z' },
  bless: { today: null, restName: null, hasLamp: false, activation: 0, feasted: false },
  ...patch,
});
```

`apps/web/src/components/town/NewsPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import NewsPanel from './NewsPanel.vue';
import { townData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { townNews: vi.fn(), townBroadcast: vi.fn() } }));

const item = (id: number, type = 'star.up', params: Record<string, unknown> = { star: 1 }): NewsDto => ({
  id,
  type,
  restId: 7,
  restName: '小王的店',
  params,
  createdAt: '2026-09-30T04:00:00.000Z',
});

describe('NewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('列出新闻，广播醒目；"加载更多"带上最后一条的 id', async () => {
    vi.mocked(endpoints.townNews)
      .mockResolvedValueOnce({ items: [item(9, 'town.broadcast', { text: '你好' }), item(8)], hasMore: true })
      .mockResolvedValueOnce({ items: [item(3)], hasMore: false });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    const rows = w.findAll('[data-testid="news-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('小王的店：你好');
    expect(rows[0]!.classes()).toContain('text-primary');
    await w.find('[data-testid="news-more"]').trigger('click');
    await flushPromises();
    expect(endpoints.townNews).toHaveBeenLastCalledWith(8);
    expect(w.findAll('[data-testid="news-row"]')).toHaveLength(3);
    expect(w.find('[data-testid="news-more"]').exists()).toBe(false);
  });

  it('广播：发送后清空输入、通知刷新、重新读第一页', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(endpoints.townBroadcast).mockResolvedValue({ text: '大家好' });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    await w.find('[data-testid="bc-input"]').setValue('大家好');
    await w.find('[data-testid="bc-send"]').trigger('click');
    await flushPromises();
    expect(endpoints.townBroadcast).toHaveBeenCalledWith('大家好');
    expect((w.find('[data-testid="bc-input"]').element as HTMLInputElement).value).toBe('');
    expect(w.emitted('reload')).toHaveLength(1);
    expect(endpoints.townNews).toHaveBeenCalledTimes(2);
  });

  it('没有喇叭或星级不够时按钮灰掉并写明原因', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
    const w = mount(NewsPanel, { props: { data: townData({ broadcast: { horns: 0, readyAt: null, minStar: 1, maxLen: 64 } }) } });
    await flushPromises();
    expect(w.find('[data-testid="bc-block"]').text()).toBe('没有喇叭（和 13 哥聊天可以拿到）');
    expect(w.find('[data-testid="bc-send"]').attributes('disabled')).toBeDefined();
    const low = mount(NewsPanel, { props: { data: townData({ star: 0 }) } });
    await flushPromises();
    expect(low.find('[data-testid="bc-block"]').text()).toBe('餐厅 1 星才能广播');
  });
});
```

`apps/web/src/components/town/TownPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import TownPanel from './TownPanel.vue';
import { blessData, townData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    townTalk: vi.fn(),
    townShake: vi.fn(),
    townWish: vi.fn(),
    townFeast: vi.fn(),
    townHammer: vi.fn(),
  },
}));

describe('TownPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('NPC：聊过的变灰；聊天后提示台词和奖励并通知刷新', async () => {
    vi.mocked(endpoints.townTalk).mockResolvedValue({
      npc: 'wenjie',
      talk: '用了飘柔就明显气质上来了!',
      rewards: [{ kind: 'goods', id: 1, num: 5 }],
    });
    const w = mount(TownPanel, { props: { data: townData({ talked: { bigEater: true, wenjie: false, bro13: false } }) } });
    expect(w.find('[data-testid="talk-bigEater"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="talk-wenjie"]').trigger('click');
    await flushPromises();
    expect(endpoints.townTalk).toHaveBeenCalledWith('wenjie');
    expect(useToastStore().items.at(-1)!.text).toBe('雯姐：用了飘柔就明显气质上来了! 获得 道具1×5');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('摇钱包：摇过的变灰；提示银币和彩蛋', async () => {
    expect(
      mount(TownPanel, { props: { data: townData({ shaken: true }) } }).find('[data-testid="shake"]').attributes('disabled'),
    ).toBeDefined();
    vi.mocked(endpoints.townShake).mockResolvedValue({ coin: 12000, egg: { goodsId: 180, num: 1 } });
    const w = mount(TownPanel, { props: { data: townData() } });
    await w.find('[data-testid="shake"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)!.text).toBe('摇到银币 12,000，还从裤兜里掏出了 道具180×1');
  });

  it('星愿：没人许愿时有神灯才能许；自选食材要先选', async () => {
    const none = mount(TownPanel, { props: { data: townData() } });
    expect(none.find('[data-testid="wish"]').attributes('disabled')).toBeDefined();
    expect(none.find('[data-testid="wish-block"]').text()).toBe('持有神灯才能许愿');

    const today = townData({
      bless: { today: blessData(), restName: '小李的店', hasLamp: false, activation: 130, feasted: false },
    });
    vi.mocked(endpoints.townFeast).mockResolvedValue({ rewards: [{ kind: 'foods', id: 501, num: 1 }] });
    const w = mount(TownPanel, { props: { data: today } });
    expect(w.find('[data-testid="bless-name"]').text()).toBe('心想事成');
    expect(w.find('[data-testid="bless-reward"]').text()).toBe('自选 5 级食材 ×1');
    expect(w.find('[data-testid="feast"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="feast-food"]').setValue('501');
    await w.find('[data-testid="feast"]').trigger('click');
    await flushPromises();
    expect(endpoints.townFeast).toHaveBeenCalledWith(501);
  });

  it('活跃度不够时共飨按钮灰掉并写明差多少', () => {
    const w = mount(TownPanel, {
      props: {
        data: townData({
          bless: { today: blessData({ type: 3, num: 200000, levels: null }), restName: '甲', hasLamp: true, activation: 30, feasted: false },
        }),
      },
    });
    expect(w.find('[data-testid="feast"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="feast-block"]').text()).toBe('今天活跃度 30，要 120 才能领');
    expect(w.find('[data-testid="bless-reward"]').text()).toBe('银币 200,000（持有神灯多领 10%）');
  });

  it('雷神锤：选类型用银币，或用钻石；冷却中全部灰掉', async () => {
    vi.mocked(endpoints.townHammer).mockResolvedValue({
      from: 1,
      to: 13,
      gift: { goodsId: 19, num: 1 },
      cooldownUntil: '2026-09-30T10:00:00.000Z',
    });
    const w = mount(TownPanel, { props: { data: townData() } });
    await w.find('[data-testid="hammer-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.townHammer).toHaveBeenCalledWith({ mode: 'coin', type: 2 });
    await w.find('[data-testid="hammer-diamond"]').trigger('click');
    await flushPromises();
    expect(endpoints.townHammer).toHaveBeenLastCalledWith({ mode: 'diamond' });
    const cool = mount(TownPanel, {
      props: { data: townData({ hammer: { has: true, readyAt: '2026-09-30T10:00:00.000Z', townReadyAt: null, coin: 100000, diamond: 8 } }) },
    });
    expect(cool.find('[data-testid="hammer-1"]').attributes('disabled')).toBeDefined();
    expect(cool.find('[data-testid="hammer-diamond"]').attributes('disabled')).toBeDefined();
  });
});
```


- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/town`
Expected: FAIL（`./NewsPanel.vue` 不存在）

- [ ] **Step 3: 实现**

`apps/web/src/components/town/NewsPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { BROADCAST_NEWS, type NewsDto, type TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { newsText, newsTime } from '../../utils/news';

const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const items = ref<NewsDto[]>([]);
const hasMore = ref(false);
const text = ref('');
const busy = ref(false);

async function load(more = false) {
  try {
    const last = items.value.at(-1);
    const page = await endpoints.townNews(more && last ? last.id : undefined);
    items.value = more ? [...items.value, ...page.items] : page.items;
    hasMore.value = page.hasMore;
  } catch (e) {
    toast.push(errorMessage(e, '读取新闻失败'), 'danger');
  }
}
onMounted(() => void load());

const block = computed(() => {
  const b = props.data.broadcast;
  if (props.data.star < b.minStar) return `餐厅 ${b.minStar} 星才能广播`;
  if (b.horns === 0) return '没有喇叭（和 13 哥聊天可以拿到）';
  if (b.readyAt) return '刚广播过，稍等一会儿';
  return '';
});

async function send() {
  if (busy.value) return;
  busy.value = true;
  try {
    await endpoints.townBroadcast(text.value);
    text.value = '';
    toast.push('广播已发出', 'success');
    emit('reload');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '广播失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="d-flex gap-1 mb-1">
    <input
      v-model="text"
      class="form-control form-control-sm"
      :maxlength="data.broadcast.maxLen"
      placeholder="对全镇说点什么"
      data-testid="bc-input"
    />
    <button
      class="btn btn-sm btn-primary text-nowrap"
      :disabled="busy || !!block || text.trim() === ''"
      data-testid="bc-send"
      @click="send"
    >
      广播
    </button>
  </div>
  <div class="small text-muted mb-2">
    喇叭 {{ data.broadcast.horns }} 个，每次用 1 个
    <span v-if="block" class="text-danger ms-1" data-testid="bc-block">{{ block }}</span>
  </div>
  <div
    v-for="n in items"
    :key="n.id"
    :class="['dt-row', 'small', { 'text-primary': n.type === BROADCAST_NEWS, 'fw-bold': n.type === BROADCAST_NEWS }]"
    data-testid="news-row"
  >
    <span class="text-muted text-nowrap">{{ newsTime(n.createdAt) }}</span>
    <span class="ms-1">{{ newsText(n, catalog) }}</span>
  </div>
  <div v-if="items.length === 0" class="text-muted small">还没有新闻</div>
  <button v-if="hasMore" class="btn btn-sm btn-outline-secondary mt-2" data-testid="news-more" @click="load(true)">
    加载更多
  </button>
</template>
```

`apps/web/src/components/town/TownPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NpcKey, TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { effectChips } from '../../utils/effects';
import { formatNum } from '../../utils/format';
import { rewardText } from '../../utils/rewards';

const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);

const NPCS: Array<{ key: NpcKey; name: string; desc: string }> = [
  { key: 'bigEater', name: '大胃哥', desc: '每天送 1~5 级食材和一颗种子' },
  { key: 'wenjie', name: '雯姐', desc: '每天送神秘礼券' },
  { key: 'bro13', name: '13 哥', desc: '每天送喇叭' },
];
const TYPES = [
  { type: 1, label: '晴类' },
  { type: 2, label: '雨类' },
  { type: 3, label: '雪冰类' },
  { type: 4, label: '风沙雾类' },
];

async function act<T>(fn: () => Promise<T>, done: (r: T) => string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    toast.push(done(await fn()), 'success');
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const rewards = (list: Parameters<typeof rewardText>[0][]) => list.map((r) => rewardText(r, catalog)).join('、');

function talk(key: NpcKey, name: string) {
  void act(() => endpoints.townTalk(key), (r) => `${name}：${r.talk} 获得 ${rewards(r.rewards)}`, '聊天失败');
}
function shake() {
  void act(
    () => endpoints.townShake(),
    (r) =>
      `摇到银币 ${formatNum(r.coin)}` +
      (r.egg ? `，还从裤兜里掏出了 ${catalog.goodsName(r.egg.goodsId)}×${r.egg.num}` : ''),
    '摇钱包失败',
  );
}

const bless = computed(() => props.data.bless.today);
const pick = ref('');
const blessFoods = computed(() => {
  const b = bless.value;
  if (!b || !b.levels) return [];
  return [...catalog.foodsMap.values()].filter((f) => f.level >= b.levels![0] && f.level <= b.levels![1]);
});
const blessReward = computed(() => {
  const b = bless.value;
  if (!b) return '';
  const lv = b.levels ? (b.levels[0] === b.levels[1] ? `${b.levels[0]}` : `${b.levels[0]}~${b.levels[1]}`) : '';
  const base =
    b.type === 5
      ? `${lv} 级随机食材 ${b.num} 种`
      : b.type === 0
        ? `自选 ${lv} 级食材 ×${b.num}`
        : b.type === 2
          ? `${catalog.goodsName(b.goodsId!)}×${b.num}`
          : b.type === 3
            ? `银币 ${formatNum(b.num)}`
            : `钻石 ${b.num}`;
  if (!props.data.bless.hasLamp) return base;
  return base + (b.type === 3 ? '（持有神灯多领 10%）' : '（持有神灯多领一份）');
});
const feastBlock = computed(() => {
  const b = bless.value;
  if (!b) return '';
  if (props.data.bless.feasted) return '今天已经领过了';
  if (props.data.bless.activation < b.needAct) return `今天活跃度 ${props.data.bless.activation}，要 ${b.needAct} 才能领`;
  return '';
});
function feast() {
  const foodsId = bless.value?.type === 0 ? Number(pick.value) : undefined;
  void act(() => endpoints.townFeast(foodsId), (r) => `共飨获得 ${rewards(r.rewards)}`, '共飨失败');
}
function wish() {
  void act(() => endpoints.townWish(), (r) => `许愿得到星愿：${r.bless.name}`, '许愿失败');
}

const hammerBlock = computed(() => {
  const h = props.data.hammer;
  if (!h.has) return '持有雷神锤才能使用';
  if (h.readyAt)
    return `冷却到 ${new Date(h.readyAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  if (h.townReadyAt) return '刚换过天气，稍等一会儿';
  return '';
});
function hammer(body: { mode: 'coin'; type: number } | { mode: 'diamond' }) {
  void act(
    () => endpoints.townHammer(body),
    (r) =>
      `${catalog.weatherName(r.from)}转${catalog.weatherName(r.to)}了，获得 ${catalog.goodsName(r.gift.goodsId)}×${r.gift.num}`,
    '换天气失败',
  );
}
</script>

<template>
  <h6 class="dt-section">NPC</h6>
  <div v-for="n in NPCS" :key="n.key" class="dt-row small">
    <b>{{ n.name }}</b>
    <span class="text-muted ms-1 flex-fill">{{ n.desc }}</span>
    <button
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || data.talked[n.key]"
      :data-testid="`talk-${n.key}`"
      @click="talk(n.key, n.name)"
    >
      {{ data.talked[n.key] ? '今天聊过了' : '聊天' }}
    </button>
  </div>

  <h6 class="dt-section">蟹老板的钱袋</h6>
  <div class="dt-row small">
    <span class="flex-fill">每天可以摇一次，摇到的银币和星级有关</span>
    <button class="btn btn-sm btn-outline-primary" :disabled="busy || data.shaken" data-testid="shake" @click="shake">
      {{ data.shaken ? '今天摇过了' : '摇一摇' }}
    </button>
  </div>

  <h6 class="dt-section">星愿</h6>
  <div v-if="bless" class="small">
    <div>
      <b data-testid="bless-name">{{ bless.name }}</b>
      <span class="text-muted ms-1">{{ data.bless.restName }} 许的愿，今天全镇生效</span>
    </div>
    <div class="d-flex flex-wrap gap-1 my-1">
      <span
        v-for="c in effectChips(bless.buff)"
        :key="c.text"
        :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
        >{{ c.text }}</span
      >
    </div>
    <div>共飨奖励：<span data-testid="bless-reward">{{ blessReward }}</span></div>
    <div class="d-flex gap-1 align-items-center mt-1">
      <select v-if="bless.type === 0" v-model="pick" class="form-select form-select-sm w-auto" data-testid="feast-food">
        <option value="">选择食材</option>
        <option v-for="f in blessFoods" :key="f.id" :value="String(f.id)">{{ f.name }}</option>
      </select>
      <button
        class="btn btn-sm btn-success"
        :disabled="busy || !!feastBlock || (bless.type === 0 && pick === '')"
        data-testid="feast"
        @click="feast"
      >
        共飨
      </button>
      <span v-if="feastBlock" class="text-danger" data-testid="feast-block">{{ feastBlock }}</span>
    </div>
  </div>
  <div v-else class="dt-row small">
    <span class="flex-fill">今天还没有人许愿。第一个许愿的人决定今天全镇的星愿</span>
    <button class="btn btn-sm btn-outline-primary" :disabled="busy || !data.bless.hasLamp" data-testid="wish" @click="wish">
      许愿
    </button>
  </div>
  <div v-if="!bless && !data.bless.hasLamp" class="small text-danger" data-testid="wish-block">持有神灯才能许愿</div>

  <h6 class="dt-section">雷神锤</h6>
  <div class="small mb-1">当前天气：<b>{{ data.weather.name }}</b></div>
  <div class="d-flex flex-wrap gap-1">
    <button
      v-for="x in TYPES"
      :key="x.type"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || !!hammerBlock"
      :data-testid="`hammer-${x.type}`"
      @click="hammer({ mode: 'coin', type: x.type })"
    >
      {{ x.label }}（{{ formatNum(data.hammer.coin) }} 银币）
    </button>
    <button
      class="btn btn-sm btn-outline-warning"
      :disabled="busy || !!hammerBlock"
      data-testid="hammer-diamond"
      @click="hammer({ mode: 'diamond' })"
    >
      召唤特殊天气（{{ data.hammer.diamond }} 钻石）
    </button>
  </div>
  <div v-if="hammerBlock" class="small text-danger mt-1" data-testid="hammer-block">{{ hammerBlock }}</div>
</template>
```


`apps/web/src/views/TownView.vue`：

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import ExchangePanel from '../components/town/ExchangePanel.vue';
import NewsPanel from '../components/town/NewsPanel.vue';
import TownPanel from '../components/town/TownPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

type Tab = 'news' | 'town' | 'exchange';
const KEY = 'dt_town_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'town' || v === 'exchange' ? v : 'news';
  } catch {
    return 'news';
  }
}
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'news', label: '新闻' },
  { key: 'town', label: '小镇' },
  { key: 'exchange', label: '兑换' },
];
const toast = useToastStore();
const catalog = useCatalogStore();
const tab = ref<Tab>(savedTab());
const data = ref<TownDto | null>(null);

/** 读取序号：几次读取同时进行时只采用最新一次的结果 */
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const v = await endpoints.town();
    if (mine === seq) data.value = v;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, '读取小镇失败'), 'danger');
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
onMounted(() => {
  void catalog.load();
  void load();
});
</script>

<template>
  <h5>小镇</h5>
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
  <ExchangePanel v-if="tab === 'exchange'" />
  <template v-else-if="data">
    <NewsPanel v-if="tab === 'news'" :data="data" @reload="load" />
    <TownPanel v-else :data="data" @reload="load" />
  </template>
</template>
```

（`ExchangePanel` 在 Task 13 创建；本任务先建一个只有 `<template><div /></template>` 的占位文件，Task 13 替换。）

`apps/web/src/router.ts`：`/takeaway` 那一条之后加：

```ts
  {
    path: '/town',
    name: 'town',
    component: () => import('./views/TownView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/components/MoreLinks.vue`："玩法"里 `{ to: '/takeaway', ... }` 之后加 `{ to: '/town', icon: 'bi-house-heart', label: '小镇' },`。

`apps/web/src/views/WeatherView.vue`：`holidayMultiplier` 那一段之后、`</div>` 之前加：

```vue
    <p class="small">
      持有雷神锤可以换天气：<RouterLink to="/town" data-testid="weather-hammer">去小镇</RouterLink>
    </p>
```

（`<script setup>` 里没有导入 `RouterLink` 的话加 `import { RouterLink } from 'vue-router';`。）

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/town && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src
git commit -m "feat(web): 小镇页（新闻、小镇两个标签）和入口

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 兑换标签——镇长兑换和兑换券

**Files:**
- Modify: `apps/web/src/components/town/ExchangePanel.vue`（替换占位）
- Create: `apps/web/src/components/town/TicketPanel.vue`
- Modify: `apps/web/src/components/town/testData.ts`（`exchangeData`）
- Test: `apps/web/src/components/town/ExchangePanel.test.ts`、`apps/web/src/components/town/TicketPanel.test.ts`

**Interfaces:**
- Consumes: `endpoints.townExchange()`、`townExchangeDo(id, num)`、`townLevelTicket(level, picks)`、`townMysteryTicket(foodsId)`（Task 11）
- Produces: `exchangeData(patch?): TownExchangeDto`；`ExchangePanel`（无 props，自己读取）；`TicketPanel`（props `{ data: TownExchangeDto }`，emit `reload`）

- [ ] **Step 1: 写失败的测试**

`testData.ts` 追加：

```ts
import type { TownExchangeDto } from '@dt/shared';

export const exchangeData = (patch: Partial<TownExchangeDto> = {}): TownExchangeDto => ({
  items: [
    { id: 1, category: 'bg', goodsId: 139, num: 1, need: [{ goodsId: 180, num: 2, have: 5 }], times: -1, used: 0 },
    { id: 2, category: 'bg', goodsId: 238, num: 1, need: [{ goodsId: 180, num: 8, have: 5 }], times: 1, used: 0 },
    { id: 3, category: 'bg', goodsId: 239, num: 1, need: [{ goodsId: 180, num: 1, have: 5 }], times: 1, used: 1 },
    { id: 40, category: 'dt', goodsId: 50, num: 1, need: [{ goodsId: 310, num: 3, have: 0 }], times: -1, used: 0 },
  ],
  levelTickets: [3, 0, 0, 0, 0],
  mysteryTickets: 1,
  levelFoods: [[101, 102], [201], [301], [401], [501]],
  mysteryFoods: [701, 702],
  maxNum: 99,
  ...patch,
});
```

（把这个 import 并到文件顶部已有的 `import type` 里。）

`ExchangePanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import ExchangePanel from './ExchangePanel.vue';
import { exchangeData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { townExchange: vi.fn(), townExchangeDo: vi.fn(), townLevelTicket: vi.fn(), townMysteryTicket: vi.fn() },
}));

describe('ExchangePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.townExchange).mockResolvedValue(exchangeData());
  });

  it('按分类显示；材料不够、次数用完的灰掉并写明', async () => {
    const w = mount(ExchangePanel);
    await flushPromises();
    expect(w.findAll('[data-testid^="ex-row-"]')).toHaveLength(3);
    expect(w.find('[data-testid="ex-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-row-2"]').text()).toContain('限兑 1 次，已兑 0 次');
    expect(w.find('[data-testid="ex-3"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-row-3"]').text()).toContain('已兑完');
    await w.find('[data-testid="cat-dt"]').trigger('click');
    expect(w.findAll('[data-testid^="ex-row-"]')).toHaveLength(1);
  });

  it('兑换多份后重新读取', async () => {
    vi.mocked(endpoints.townExchangeDo).mockResolvedValue({ goodsId: 139, num: 2 });
    const w = mount(ExchangePanel);
    await flushPromises();
    await w.find('[data-testid="ex-num-1"]').setValue(2);
    await w.find('[data-testid="ex-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.townExchangeDo).toHaveBeenCalledWith(1, 2);
    expect(endpoints.townExchange).toHaveBeenCalledTimes(2);
  });
});
```

`TicketPanel.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import TicketPanel from './TicketPanel.vue';
import { exchangeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { townLevelTicket: vi.fn(), townMysteryTicket: vi.fn() } }));

describe('TicketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('N 级券：填数量，合计不超过持有数才能换', async () => {
    vi.mocked(endpoints.townLevelTicket).mockResolvedValue({ foods: [{ foodsId: 101, num: 2 }] });
    const w = mount(TicketPanel, { props: { data: exchangeData() } });
    expect(w.find('[data-testid="lt-have"]').text()).toBe('持有 3 张');
    expect(w.find('[data-testid="lt-go"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="lt-num-101"]').setValue(2);
    await w.find('[data-testid="lt-num-102"]').setValue(2);
    expect(w.find('[data-testid="lt-go"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="lt-num-102"]').setValue(0);
    await w.find('[data-testid="lt-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.townLevelTicket).toHaveBeenCalledWith(1, [{ foodsId: 101, num: 2 }]);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('神秘券：选一种食材再换', async () => {
    vi.mocked(endpoints.townMysteryTicket).mockResolvedValue({ foods: [{ foodsId: 702, num: 1 }] });
    const w = mount(TicketPanel, { props: { data: exchangeData() } });
    expect(w.find('[data-testid="mt-go"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="mt-food"]').setValue('702');
    await w.find('[data-testid="mt-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.townMysteryTicket).toHaveBeenCalledWith(702);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/components/town/ExchangePanel.test.ts src/components/town/TicketPanel.test.ts`
Expected: FAIL（占位组件里找不到元素 / `./TicketPanel.vue` 不存在）

- [ ] **Step 3: 实现**

`apps/web/src/components/town/ExchangePanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { TownExchangeDto, TownExchangeItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import TicketPanel from './TicketPanel.vue';

const CATS = [
  { key: 'bg', label: '蟹黄堡' },
  { key: 'dt', label: '美味券' },
  { key: 'chip', label: '碎片' },
  { key: 'so', label: '其他' },
];
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<TownExchangeDto | null>(null);
const cat = ref('bg');
const nums = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.townExchange();
  } catch (e) {
    toast.push(errorMessage(e, '读取兑换失败'), 'danger');
  }
}
onMounted(() => void load());

const shown = computed(() => (data.value?.items ?? []).filter((x) => x.category === cat.value));
const numOf = (x: TownExchangeItemDto) => Math.max(1, Math.floor(Number(nums[x.id] ?? 1)) || 1);
const left = (x: TownExchangeItemDto) => (x.times > 0 ? x.times - x.used : Infinity);
function block(x: TownExchangeItemDto): string {
  if (left(x) <= 0) return '已兑完';
  const n = numOf(x);
  if (n > left(x)) return `最多还能兑 ${left(x)} 次`;
  if (n > (data.value?.maxNum ?? 99)) return `一次最多 ${data.value?.maxNum} 份`;
  if (x.need.some((m) => m.have < m.num * n)) return '材料不够';
  return '';
}

async function go(x: TownExchangeItemDto) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.townExchangeDo(x.id, numOf(x));
    toast.push(`兑换成功：${catalog.goodsName(r.goodsId)}×${r.num}`, 'success');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <template v-if="data">
    <ul class="nav nav-pills nav-fill small mb-2">
      <li v-for="c in CATS" :key="c.key" class="nav-item">
        <a
          :class="['nav-link', 'py-1', { active: cat === c.key }]"
          href="#"
          :data-testid="`cat-${c.key}`"
          @click.prevent="cat = c.key"
          >{{ c.label }}</a
        >
      </li>
    </ul>
    <div v-for="x in shown" :key="x.id" class="dt-row small" :data-testid="`ex-row-${x.id}`">
      <div class="flex-fill">
        <b>{{ catalog.goodsName(x.goodsId) }}×{{ x.num }}</b>
        <div class="text-muted">
          需要
          <span v-for="m in x.need" :key="m.goodsId" class="ms-1"
            >{{ catalog.goodsName(m.goodsId) }}×{{ m.num }}（有 {{ m.have }}）</span
          >
        </div>
        <div class="text-muted">
          {{ x.times > 0 ? `限兑 ${x.times} 次，已兑 ${x.used} 次` : '不限次数' }}
          <span v-if="block(x)" class="text-danger ms-1">{{ block(x) }}</span>
        </div>
      </div>
      <input
        v-model.number="nums[x.id]"
        type="number"
        min="1"
        :max="data.maxNum"
        class="form-control form-control-sm dt-num-input"
        :data-testid="`ex-num-${x.id}`"
      />
      <button
        class="btn btn-sm btn-outline-primary ms-1"
        :disabled="busy || !!block(x)"
        :data-testid="`ex-${x.id}`"
        @click="go(x)"
      >
        兑换
      </button>
    </div>
    <h6 class="dt-section">兑换券</h6>
    <TicketPanel :data="data" @reload="load" />
  </template>
</template>
```

`apps/web/src/components/town/TicketPanel.vue`：

```vue
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { TownExchangeDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: TownExchangeDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);

const level = ref(1);
const nums = reactive<Record<number, number>>({});
watch(level, () => {
  for (const k of Object.keys(nums)) delete nums[Number(k)];
});
const have = computed(() => props.data.levelTickets[level.value - 1] ?? 0);
const foods = computed(() => props.data.levelFoods[level.value - 1] ?? []);
const picks = computed(() =>
  foods.value
    .map((id) => ({ foodsId: id, num: Math.max(0, Math.floor(Number(nums[id] ?? 0)) || 0) }))
    .filter((p) => p.num > 0),
);
const total = computed(() => picks.value.reduce((s, p) => s + p.num, 0));

const mystery = ref('');

async function run(fn: () => Promise<{ foods: Array<{ foodsId: number; num: number }> }>) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await fn();
    toast.push(`换到 ${r.foods.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join('、')}`, 'success');
    for (const k of Object.keys(nums)) delete nums[Number(k)];
    mystery.value = '';
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
    <div class="d-flex align-items-center gap-1 mb-1">
      <select v-model.number="level" class="form-select form-select-sm w-auto" data-testid="lt-level">
        <option v-for="l in [1, 2, 3, 4, 5]" :key="l" :value="l">{{ l }} 级食材兑换券</option>
      </select>
      <span data-testid="lt-have">持有 {{ have }} 张</span>
    </div>
    <div class="text-muted mb-1">一张换一个同等级的普通食材，可以一次选多种</div>
    <div class="d-flex flex-wrap gap-1">
      <label v-for="id in foods" :key="id" class="dt-tile">
        {{ catalog.foodName(id) }}
        <input
          v-model.number="nums[id]"
          type="number"
          min="0"
          class="form-control form-control-sm dt-num-input"
          :data-testid="`lt-num-${id}`"
        />
      </label>
    </div>
    <button
      class="btn btn-sm btn-primary mt-1"
      :disabled="busy || total === 0 || total > have"
      data-testid="lt-go"
      @click="run(() => endpoints.townLevelTicket(level, picks))"
    >
      兑换（用 {{ total }} 张）
    </button>

    <div class="d-flex align-items-center gap-1 mt-3">
      <b>神秘食材兑换券</b>
      <span>持有 {{ data.mysteryTickets }} 张</span>
    </div>
    <div class="d-flex align-items-center gap-1 mt-1">
      <select v-model="mystery" class="form-select form-select-sm w-auto" data-testid="mt-food">
        <option value="">选择神秘食材</option>
        <option v-for="id in data.mysteryFoods" :key="id" :value="String(id)">{{ catalog.foodName(id) }}</option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || data.mysteryTickets === 0 || mystery === ''"
        data-testid="mt-go"
        @click="run(() => endpoints.townMysteryTicket(Number(mystery)))"
      >
        兑换
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/styles/main.css` 末尾加：

```css
/* 小镇兑换的数量输入框 */
.dt-num-input {
  width: 4.5rem;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/components/town && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src
git commit -m "feat(web): 小镇兑换标签（镇长兑换、兑换券）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 首页——小镇新闻块、"今日星愿"分组

**Files:**
- Create: `apps/web/src/components/town/HomeNews.vue`
- Modify: `apps/web/src/views/RestaurantHomeView.vue`
- Test: `apps/web/src/views/RestaurantHomeView.test.ts`（追加）

**Interfaces:**
- Consumes: `RestaurantDto.headlines`（Task 3）、`EffectDto` 来源 `bless`（Task 9）、`newsText`（Task 11）
- Produces: `HomeNews`（props `{ headlines: HeadlinesDto }`）

- [ ] **Step 1: 写失败的测试**（追加到 `RestaurantHomeView.test.ts`，用文件里已有的 `dto` 示例数据和 `mountView`）

```ts
  it('小镇新闻：最新广播 + 3 条新闻，点"更多"去小镇页', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      headlines: {
        broadcast: {
          id: 9,
          type: 'town.broadcast',
          restId: 7,
          restName: '小王的店',
          params: { text: '大家好' },
          createdAt: '2026-09-30T04:00:00.000Z',
        },
        news: [
          {
            id: 8,
            type: 'star.up',
            restId: 7,
            restName: '小王的店',
            params: { star: 2 },
            createdAt: '2026-09-30T03:00:00.000Z',
          },
        ],
      },
    });
    const w = await mountView();
    expect(w.find('[data-testid="home-broadcast"]').text()).toContain('小王的店：大家好');
    expect(w.findAll('[data-testid="home-news"]').map((x) => x.text())).toEqual([
      expect.stringContaining('小王的店升到了 2 星'),
    ]);
    expect(w.find('[data-testid="home-news-more"]').attributes('href')).toBe('/town');
  });

  it('生效的加成：今日星愿排在最前', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      ...dto,
      effects: [
        ...dto.effects,
        { sourceType: 'bless', sourceId: 4, name: '今日星愿：招财进宝', effects: { coinRate: 0.08 }, expiresAt: null },
      ],
    });
    const w = await mountView();
    expect(w.findAll('[data-testid="effect-group"]')[0]!.text()).toBe('今日星愿');
  });
```


- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/views/RestaurantHomeView.test.ts`
Expected: FAIL（找不到 `home-broadcast`；第一组不是"今日星愿"）

- [ ] **Step 3: 实现**

`apps/web/src/components/town/HomeNews.vue`：

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { HeadlinesDto } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { newsText } from '../../utils/news';

defineProps<{ headlines: HeadlinesDto }>();
const catalog = useCatalogStore();
</script>

<template>
  <div class="border rounded p-2 my-2 small">
    <div class="d-flex justify-content-between">
      <b>小镇新闻</b>
      <RouterLink to="/town" data-testid="home-news-more">更多</RouterLink>
    </div>
    <div v-if="headlines.broadcast" class="text-primary fw-bold dt-clamp1" data-testid="home-broadcast">
      【广播】{{ newsText(headlines.broadcast, catalog) }}
    </div>
    <div v-for="n in headlines.news" :key="n.id" class="dt-clamp1" data-testid="home-news">
      {{ newsText(n, catalog) }}
    </div>
    <div v-if="!headlines.broadcast && headlines.news.length === 0" class="text-muted">还没有新闻</div>
  </div>
</template>
```

`apps/web/src/views/RestaurantHomeView.vue`：
1. import `HomeNews from '../components/town/HomeNews.vue'`。
2. 主线任务块（`<div v-if="mainTask" ...>...</div>`）之后加 `<HomeNews :headlines="rest.headlines" />`。
3. `EFFECT_GROUPS` 数组最前面加 `{ type: 'bless', label: '今日星愿' },`。

- [ ] **Step 4: 运行，确认通过，再跑前端全量**

Run: `pnpm --filter @dt/web exec vitest run > .superpowers/sdd/web-test.log 2>&1; tail -5 .superpowers/sdd/web-test.log; pnpm --filter @dt/web typecheck && pnpm lint`
Expected: 前端全量 PASS；typecheck、lint 通过

- [ ] **Step 5: 提交**

```bash
git add apps/web/src
git commit -m "feat(web): 首页小镇新闻和今日星愿加成

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 端到端测试和文档

**Files:**
- Create: `apps/web/e2e/town.spec.ts`
- Modify: `docs/rules/收益与加成.md`（第 12 节）
- Modify: `docs/deploy.md`（迁移 0014）

**Interfaces:**
- Consumes: 全部前端和接口；`registerAndOpen(page, request)`（`e2e/helpers.ts`，已有）

- [ ] **Step 1: 写端到端测试** `apps/web/e2e/town.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('小镇：广播 → 和雯姐聊天 → 镇长兑换', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as {
    data: { id: number };
  };
  const restId = overview.data.id;
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    // 1 星、邮箱已验证；喇叭 2 个、蟹黄堡 5 个（换神秘食材随机劵 id 1 要 2 个）
    await client.query(`update restaurant set star_level = 1 where id = $1`, [restId]);
    await client.query(
      `update account set email_verified_at = now() where id = (select account_id from restaurant where id = $1)`,
      [restId],
    );
    await client.query(
      `insert into store_item (rest_id, goods_id, num) values ($1, 315, 2), ($1, 180, 5)
       on conflict (rest_id, goods_id) do update set num = excluded.num`,
      [restId],
    );

    await page.goto('/town');
    await page.getByTestId('tab-news').click();
    await page.getByTestId('bc-input').fill('端到端测试的广播');
    const sent = page.waitForResponse((r) => r.url().includes('/api/v1/town/broadcast'));
    await page.getByTestId('bc-send').click();
    expect((await sent).ok()).toBe(true);
    await expect(page.getByTestId('news-row').first()).toContainText('端到端测试的广播');

    await page.getByTestId('tab-town').click();
    await page.getByTestId('talk-wenjie').click();
    await expect(page.getByTestId('talk-wenjie')).toHaveText('今天聊过了');

    await page.getByTestId('tab-exchange').click();
    const done = page.waitForResponse((r) => r.url().endsWith('/api/v1/town/exchange') && r.request().method() === 'POST');
    await page.getByTestId('ex-1').click();
    expect((await done).ok()).toBe(true);
    await expect(page.getByTestId('ex-row-1')).toContainText('有 3');
  } finally {
    await client.end();
  }
});
```

- [ ] **Step 2: 重启开发服务并运行端到端**

按部署说明重启开发服务（结束旧的 tsx / vite 进程树 → `pnpm --filter @dt/config build` → `pnpm --filter @dt/server migrate:dev` → 后台 `pnpm dev`，等到 "became leader" 和 "Server listening"），然后：

Run: `pnpm --filter @dt/web e2e`
Expected: 全部 PASS（原有 11 条 + 新增 1 条）

- [ ] **Step 3: 写文档**

`docs/rules/收益与加成.md` 末尾新增：

```markdown
## 12. 小镇（子项目 4E-1）

"更多 → 玩法 → 小镇"，三个标签：新闻、小镇、兑换。首页显示最新一条广播和最新 3 条新闻。

- **新闻**：本区服的动态，按时间倒序，每页 50 条。
- **广播**：1 星以上、邮箱已验证，每次用 1 个喇叭，30 秒冷却，1~64 个字，纯文字。
- **NPC 对话**：每个 NPC 每天一次。
  - 大胃哥：1~5 级食材（1 级 50%、2 级 25%、3 级 13%、4 级 9%、5 级 3%）1~3 个，外加 1 颗种子；第一次对话另送 1 张神秘食材兑换券。
  - 雯姐：神秘礼券 1~20 张。
  - 13 哥：喇叭 1~2 个。
- **摇蟹老板钱包**：每天一次，得到 (8000 − 随机 0~4999) × 星级 银币（至少 1），从蟹老板店的银币里扣，不够时给剩下的。摇钱记录流水号尾数 88 时额外掏出蟹黄堡或 8 个蟹币。同 IP、同设备的限制目前关闭（tuning `town.shake.limitIp` / `limitDevice`）。
- **雷神锤**：持有雷神锤，每人冷却 6 小时，全镇两次换天气至少隔 90 秒（自动轮换也算）。
  - 选类型（晴 / 雨 / 雪冰 / 风沙雾）：10 万银币，送爆裂飞弹。
  - 召唤特殊天气：8 钻石，送幸运饼干。
  - 按当前时段（白天 / 夜间）的天气里抽，一定和当前天气不同，持续到下一次自动轮换。
- **兑换**：
  - 镇长兑换 73 项，部分每人限兑 1 次，一次可以兑多份（最多 99）。
  - 一到五级食材兑换券：一张换一个同等级的普通食材（掉率 100 的），可以一次选多种。
  - 神秘食材兑换券：一张换一个神秘食材（573、574 除外）。
- **星愿**：
  - 许愿：持有神灯（不消耗）。每个区服每天只有第一个许愿的人生效，按权重从 12 个星愿里抽一个。
  - 共飨：当天活跃度达到星愿的要求（60~150），每人每天一次。持有神灯时银币多 10%，随机食材多一种，其他数量 +1。
  - 全镇加成：从许愿起到当天结束，全镇每家店结算时加上星愿的加成（上座率、银币、经验或挑剔率）。首页"生效的加成"里显示"今日星愿"。
```

`docs/deploy.md`：在迁移 0013 那一条之后加：

```markdown
- 迁移 0014 给 `world_state` 加"上次换天气时间"，新建 `town_bless`（每区服每天的星愿）、`town_rest`（雷神锤、广播冷却和大胃哥首次礼物）、`town_shake`（摇钱包记录）、`town_exchange_use`（镇长兑换次数），并给 `news` 加两个按 id 倒序的索引
```

- [ ] **Step 4: 全量验证**

Run: `pnpm test > .superpowers/sdd/all-test.log 2>&1; tail -8 .superpowers/sdd/all-test.log; pnpm typecheck && pnpm lint`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add apps/web/e2e/town.spec.ts docs/rules docs/deploy.md
git commit -m "test(e2e): 小镇端到端；docs: 小镇规则和迁移 0014

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
