# 子项目 4E-2「嘻哈男孩、镇长问答、排行与排行奖励」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做嘻哈男孩（每日地点、打赏、蟹币）、镇长问答、打赏周榜和工作证工资、菜场手动进货，以及小镇页的排行榜（39 + 2 个榜）。

**Architecture:**
- 新模块 `modules/hiphop`：每日地点、打赏、周榜、工资。纯计算放 `rules.ts`。
- 新模块 `modules/rank`：每个榜一个查询，结果按（区服, 榜）缓存在进程内。
- 镇长问答放在 `modules/town/mayor.ts`，手动进货放在 `modules/market/manual.ts`。
- 买手动货要同时改两家店（买家和进货人），沿用摇钱包的 `withRestaurants` 加 `createOp` / `flushOp`。
- 前端：
  - 新组件 `HiphopCard` 嵌进 6 个地点页和店首页、好友店页；
  - 小镇页加"排行"标签，镇长问答放进 `TownPanel`；
  - 菜场页加手动进货。

**Tech Stack:** 同仓库（Fastify 5 + Kysely + PostgreSQL，Vue 3 + Pinia + Bootstrap 5，Vitest，Playwright）。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject4e2-hiphop-rank-design.md`

**写法说明**：沿用 4C-3 的写法，并经用户确认。本计划写全接口、核心算法和每条测试；路由注册、DTO 组装、模板等样板代码在执行时照邻近模块写，不在计划里重复。

## Global Constraints

- 回复、注释、文案用中文；不碰 `问题记录.md`（只读）。
- 时间一律用 `o.now` / `d.now()` / 任务的 `now`；每日计数传 `gameDay(o.now)`。
- 排行和周榜只算本区玩家店：`restaurant.npc = false`，且账号 `banned_at is null`。
- 嘻哈男孩的位置不能出现在小镇概览或任何"不在这里"的响应里。
- 样式只写在 `apps/web/src/styles/main.css`，按 `docs/design/视觉规范.md` 使用 `.dt-*` 类。
- 跑服务端测试：`pnpm --filter @dt/server exec vitest run <路径>`；全量：`pnpm test`。
- 提交信息结尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **位置泄漏**：`GET /hiphop` 地点不对时只能返回 `{here: false}`；打赏报 `not_here` 时也不能带出今天的地点。→ Task 3、Task 4 的断言。
2. **买手动货的分成**：两家店同时锁；进货人自己买不付钱也不分成；别人买到 99 份后再买被拒，进货人银币只加一次。→ Task 7 的并发和限购测试。
3. **跨天和时段**：9 点前没有嘻哈男孩，22 点后不能打赏；镇长 9 点前不占次数；周榜只算周一 0 点到周日这一周。→ Task 3、4、5、6。
4. **排行并列和"我"**：并列名次（1, 2, 2, 4）；我在 50 名外也给名次；值 0 的店不上榜，`me` 为 null。→ Task 2、Task 8。
5. **缓存过期**：缓存期内数据变化不影响结果，过期后更新；不同区服互不影响。→ Task 8。

---

### Task 1: 配置、迁移、共享类型、功能开关

**Files:**
- Modify: `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`
- Modify: `packages/config/src/ids.ts`、`packages/config/src/build.ts`（引用校验）
- Modify: `packages/config/src/build.test.ts`
- Create: `apps/server/src/db/migrations/0016_hiphop.ts`、`0016.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`
- Modify: `apps/server/src/core/features.ts`（加 `'hiphop'`）
- Create: `packages/shared/src/schemas/hiphop.ts`、`packages/shared/src/rank.ts`
- Modify: `packages/shared/src/index.ts`、`packages/shared/src/news.ts`
- Modify: `packages/shared/src/schemas/town.ts`、`packages/shared/src/schemas/market.ts`
- Modify: `apps/server/test/town.ts`（新增通用 `setTuning`）

**Interfaces — Produces:**

tuning（`tuning.json` 写入这些值，tuning.ts 用 zod 校验）：

```jsonc
"hiphop": {
  "hour": 9, "closeHour": 22, "weeklyHour": 23,
  "placeWeights": [[1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [9, 7]],
  "restActiveDays": 7,
  "worthBase": 35000, "worthMin": 1.25, "worthRand": 0.8,
  "krabRate": 0.1, "foodFactor": 1.5,
  "coinMax": 100000000, "coinWorthDiv": 5, "coinExpDiv": 210,
  "diamondMax": 9999, "diamondWorthNum": 10001, "diamondWorthDen": 3, "diamondExpMul": 50,
  "expJitter": 0.1, "requireVerifiedEmail": false,
  "weeklyCards": [108, 109, 107, 111, 110],
  "wages": [[107, 233], [108, 234], [109, 235], [111, 236], [110, 237]]
},
"rank": { "top": 50, "cacheSeconds": 60, "powerCacheSeconds": 600 }
// market 追加：
"manualCost": 1000000, "manualKinds": 4, "manualStock": 1000, "manualPersonMax": 99, "manualShare": 0.25
```

`ids.ts` 的 `GOODS` 追加：
- 工作证：`marketJobHonor: 107`、`renameJobHonor: 109`；
- 嘻哈和镇长：`hiphopCulture: 230`、`mayorFavor: 231`、`mayorAgainst: 232`；
- 蟹币：如果还没有 `krabCoin`，查 `ids.ts` 现有名字并复用，不要重复定义。

`build.ts` 校验：
- `weeklyCards`、`wages` 两边、230~232 都在道具表里；
- `placeWeights` 的 id ⊂ {1,2,3,4,5,6,9}；
- `wages` 的证 id 集合等于 `weeklyCards` 集合。

迁移 0016：

```ts
await sql`create table hiphop_day (
  shard_id integer not null references shard(id) on delete cascade,
  day text not null,
  place smallint not null,
  rest_id integer references restaurant(id) on delete set null,
  foods_id integer not null,
  worth integer not null,
  created_at timestamptz not null,
  primary key (shard_id, day)
)`.execute(db);
await sql`create table hiphop_tip (
  id serial primary key,
  shard_id integer not null references shard(id) on delete cascade,
  rest_id integer not null references restaurant(id) on delete cascade,
  kind text not null,
  num bigint not null,
  foods_id integer,
  worth bigint not null,
  krab_coin integer not null default 0,
  created_at timestamptz not null
)`.execute(db);
await sql`create index hiphop_tip_shard_time on hiphop_tip (shard_id, created_at)`.execute(db);
await sql`create index hiphop_tip_rest_time on hiphop_tip (rest_id, created_at)`.execute(db);
await sql`alter table market_item add column owner_rest_id integer references restaurant(id) on delete cascade`.execute(db);
```

`schema.ts` 的类型：
- `HiphopDayTable { shard_id; day: string; place: number; rest_id: Nullable<number>; foods_id; worth; created_at: Ts }`
- `HiphopTipTable { id: Generated<number>; shard_id; rest_id; kind: string; num: Int8; foods_id: Nullable<number>; worth: Int8; krab_coin: Default<number>; created_at: Ts }`

  `num` 和 `worth` 是 bigint：查 schema 里其他 bigint 列的写法（例如 `income_round` 或 `ledger.delta`），照抄。
- `MarketItemTable` 加 `owner_rest_id: Nullable<number>`。

`packages/shared/src/schemas/hiphop.ts`：

```ts
export const HIPHOP_PLACES = [1, 2, 3, 4, 5, 6, 9] as const;
export type HiphopPlace = (typeof HIPHOP_PLACES)[number];
export const HIPHOP_PLACE_NAMES: Record<HiphopPlace, string> = {
  1: '菜场', 2: '商店', 3: '酒吧', 4: '协会', 5: '厨塔', 6: '神殿', 9: '某家餐厅',
};
export const hiphopPlace = z.union(HIPHOP_PLACES.map((p) => z.literal(p)) as [...]); // 照 zod 写法
export const hiphopQuery = z
  .object({ place: z.coerce.number().int().optional(), restId: z.coerce.number().int().positive().optional() })
  .refine((q) => (q.place === undefined) !== (q.restId === undefined));
export const hiphopTipBody = z.object({
  place: hiphopPlace,
  restId: z.number().int().positive().optional(),
  kind: z.enum(['food', 'coin', 'diamond']),
  num: z.number().int().min(1),
  foodsId: z.number().int().positive().optional(),
});
export const mayorBody = z.object({ place: hiphopPlace });
export type HiphopSpotDto =
  | { here: false }
  | { here: true; place: HiphopPlace; restId: number | null; food: { id: number; level: number };
      worth: number; myWeekWorth: number; closeAt: string };
/** reply：thanks 没到门槛；wanted 到了门槛没中蟹币；krab 中了 */
export interface HiphopTipDto {
  worth: number; exp: number; krabCoin: number; tickets: number; rainbow: boolean;
  fresh: boolean; reply: 'thanks' | 'wanted' | 'krab';
}
```

`town.ts` 的改动：
- `TalkResultDto.npc` 改成 `NpcKey | 'mayor'`；
- `TownDto` 加 `mayor: { answered: boolean }`。

`market.ts` 的改动：
- `MarketItemDto` 加 `owner: { restId: number; name: string } | null`；
- `MarketDto` 加 `manual: { hasCard: boolean; cost: number }`；
- 新增 `ManualStockDto { foods: number[]; cost: number; renown: number }`。

`packages/shared/src/rank.ts`：

```ts
export interface RankBoardDef { key: string; group: string; label: string; reward?: string }
export const RANK_GROUPS: readonly string[] = ['收益', '食谱', '等级', '厨力', '声望', '赞', '灭蟑螂', '产蟑螂', '被翻厨', '酒吧', '特色菜', '打赏'];
/**
 * 41 个 key（顺序即页面顺序）：
 * income.coin.today / .round / .yesterday，income.exp.today / .round / .yesterday（label：银币今日、银币单轮……）
 * cookbook.7 佳肴、cookbook.6 珍品、cookbook.5 金牌、cookbook.4 极品、cookbook.1 已学
 * level 当前、power 当前、renown 当前、thumb.received 被赞、thumb.given 点赞
 * roach.kill.today / .yesterday / .thisWeek / .lastWeek（今日、昨日、本周、上周），roach.lay.* 同，flip.flipped.* 同
 * bar.fg.win 猜拳连胜、bar.fg.lose 猜拳连败、bar.cup.win 猜酒杯连胜、bar.cup.lose 猜酒杯连败、bar.num.win 转数字连中、bar.num.lose 转数字连不中
 * mc.today 今日价值、mc.yesterday 昨日价值、mc.best 历史价值、mc.times 总次数、mc.learned 已学
 * hiphop.week 本周、hiphop.lastWeek 上周
 * reward：mc.yesterday、flip.flipped.lastWeek、roach.kill.lastWeek、hiphop.week 四个，文字照设计文档 §2.6 奖励说明表
 */
export const RANK_BOARDS: readonly RankBoardDef[] = [/* 照上面注释逐项列出 */];
export const RANK_KEYS: ReadonlySet<string> = new Set(RANK_BOARDS.map((b) => b.key));
export interface RankRowDto { rank: number; restId: number; name: string; value: number }
export interface RankDto { key: string; rows: RankRowDto[]; me: { rank: number; value: number } | null; updatedAt: string }
```

`NEWS_TYPES` 追加：`hiphop.event`、`hiphop.krab`、`hiphop.weekly`、`market.manual`。

`IMPLEMENTED_FEATURES` 加 `'hiphop'`。

`test/town.ts` 新增：

```ts
/** 覆盖本区服的任意 tuning 段（深合并），并清掉区服设置缓存 */
export async function setTuning(t: TestGame, shardId: number, tuning: Record<string, unknown>): Promise<void>
```

`setTownTuning` 改为调用它。

- [ ] **Step 1: 写失败的测试**
  - `build.test.ts`：
    - `bundle.tuning.hiphop.weeklyCards` 等于 `[108,109,107,111,110]`，`wages` 的证集合等于 `weeklyCards` 集合；
    - `bundle.tuning.market.manualPersonMax === 99`；`bundle.tuning.rank.top === 50`；
    - 把 `placeWeights` 改成含 8 的拷贝时构建报错。
  - `0016.test.ts`：
    - 同区同一天插两行 `hiphop_day` 被拒；
    - `hiphop_tip` 插入后 `num` 能存 100000000；
    - `market_item.owner_rest_id` 可写、可为 null。
  - `packages/shared/src/rank.test.ts`：
    - `RANK_BOARDS.length === 41`，key 不重复；
    - 每个 group 都在 `RANK_GROUPS` 里；
    - `hiphop.week` 的 reward 含"工作证"。
  - `apps/server/src/core/features.test.ts`（没有就在 periodic.test 里）：`featureAvailable(默认设置, 'hiphop') === true`。
  - `town/view.test.ts`：两个 `toEqual` 加上 `mayor: { answered: false }`。这一行在 Task 5 才会变绿，本任务先不改它。

- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/config exec vitest run src/build.test.ts; pnpm --filter @dt/shared exec vitest run src/rank.test.ts; pnpm --filter @dt/server exec vitest run src/db/migrations/0016.test.ts`
  Expected: FAIL（`hiphop` 未定义、表不存在、`RANK_BOARDS` 不存在）。

- [ ] **Step 3: 实现**：照上面的 Produces 写。

- [ ] **Step 4: 运行，确认通过**：同上命令，并加跑 `pnpm typecheck`。
  Expected: PASS；typecheck 只在 `TownDto.mayor`、`MarketDto.manual`、`MarketItemDto.owner` 的使用处报错。为了让本任务独立通过，这三处先在服务端和前端测试数据里补默认值：`mayor: { answered: false }`、`manual: { hasCard: false, cost: 0 }`、`owner: null`。Task 5、7 再接上真实数据。

- [ ] **Step 5: 提交** `feat(hiphop): 配置、迁移 0016、共享类型、功能开关`

---

### Task 2: 纯规则

**Files:**
- Create: `apps/server/src/modules/hiphop/rules.ts`、`rules.test.ts`
- Create: `apps/server/src/modules/rank/ranking.ts`、`ranking.test.ts`
- Modify: `apps/server/src/modules/market/rules.ts`、`rules.test.ts`（追加手动进货的费用和声望）

**Interfaces — Produces:**

```ts
// hiphop/rules.ts
type H = Tuning['hiphop'];
/** 想要的食材价值：⌊单价 × 等级/(等级+1) × 数量⌋ */
export function foodWorth(coin: number, level: number, num: number): number {
  return Math.floor(coin * (level / (level + 1)) * num + 1e-9);
}
export function coinWorth(num: number, t: H): number { return Math.floor(num / t.coinWorthDiv); }
export function diamondWorth(num: number, t: H): number {
  return Math.floor((num * t.diamondWorthNum) / t.diamondWorthDen);
}
/** 打赏得到的经验：r ∈ [0,1) 产生 ±expJitter 的浮动 */
export function tipExp(kind: 'coin' | 'diamond', num: number, r: number, t: H): number {
  const base = kind === 'coin' ? num / t.coinExpDiv : num * t.diamondExpMul;
  return Math.floor(base * (1 + (r - 0.5) * 2 * t.expJitter));
}
/** 蟹币判定：r < 概率 即中；rainbow = 天气加成那一段让它中的（没有天气加成就不会中） */
export function krabRoll(
  r: number, t: H, weatherRate: number, isFood: boolean, luckRate: number,
): { hit: boolean; rainbow: boolean } {
  const mult = isFood ? t.foodFactor : 1;
  const without = t.krabRate * mult + luckRate / 10;
  const chance = (t.krabRate + weatherRate) * mult + luckRate / 10;
  const hit = r < chance;
  return { hit, rainbow: hit && weatherRate > 0 && r >= without };
}
/** 餐厅地点店主用食材打赏的额外礼券 */
export function tipTickets(num: number, level: number): number { return Math.floor(num / (6 - level)); }
/** 门槛 */
export function rollWorth(r: number, t: H): number { return Math.floor(t.worthBase * (t.worthMin + t.worthRand * r)); }
/** 周榜周期：最近一次已经过去的"周日 hour 点"所在周的周一 */
export function weekEndPeriod(now: Date, hour: number): string {
  const mon = mondayOf(gameParts(now).day);
  return now >= gameTime(addDays(mon, 6), hour) ? mon : addDays(mon, -7);
}
```

```ts
// rank/ranking.ts
export interface RankSource { restId: number; name: string; value: number; /** 同值时比较，越大越靠前 */ tie?: number }
/** 竞赛排名：值 desc、tie desc、店号 asc；值 ≤ 0 的去掉；值和 tie 都相同的名次相同（1,2,2,4） */
export function rankRows(rows: RankSource[]): Array<RankSource & { rank: number }>
```

```ts
// market/rules.ts 追加
/** 手动进货费用：today = 本次之前今天已进货次数 */
export function manualCost(today: number, t: MarketTuning): number {
  return t.manualCost * (1 + Math.max(today - 1, 0));
}
/** 声望（原版 count>4 → 500；count<2 → ×0.5） */
export function manualRenown(today: number, cost: number): number {
  if (today > 4) return 500;
  return Math.floor(((today < 2 ? 0.5 : 1) * cost) / 10000);
}
```

`mondayOf` 从 `modules/friend/weekly.ts` 导入。

- [ ] **Step 1: 写失败的测试**

```ts
describe('嘻哈男孩规则', () => {
  it('食材价值按等级折算', () => {
    expect(foodWorth(1000, 3, 10)).toBe(7500);
    expect(foodWorth(999, 1, 3)).toBe(1498);
  });
  it('银币和钻石价值', () => {
    expect(coinWorth(1_000_004, t)).toBe(200_000);
    expect(diamondWorth(3, t)).toBe(10001);
    expect(diamondWorth(1, t)).toBe(3333);
  });
  it('经验浮动 ±10%', () => {
    expect(tipExp('coin', 2100, 0.5, t)).toBe(10);
    expect(tipExp('coin', 21000, 0, t)).toBe(90);
    expect(tipExp('diamond', 2, 0.999999, t)).toBe(109);
  });
  it('蟹币：基础 10%，食材 ×1.5，天气加成带来的那一段标"虹"', () => {
    expect(krabRoll(0.09, t, 0, false, 0)).toEqual({ hit: true, rainbow: false });
    expect(krabRoll(0.1, t, 0, false, 0)).toEqual({ hit: false, rainbow: false });
    expect(krabRoll(0.14, t, 0, true, 0)).toEqual({ hit: true, rainbow: false });
    expect(krabRoll(0.15, t, 0.1, false, 0)).toEqual({ hit: true, rainbow: true });
    expect(krabRoll(0.12, t, 0, false, 0.3)).toEqual({ hit: true, rainbow: false });
  });
  it('额外礼券和门槛', () => {
    expect(tipTickets(10, 3)).toBe(3);
    expect(tipTickets(4, 5)).toBe(4);
    expect(rollWorth(0, t)).toBe(43750);
    expect(rollWorth(0.999, t)).toBe(71722);
  });
  it('周榜周期：周日 23 点前算上一周', () => {
    // 2026-10-04 是周日
    expect(weekEndPeriod(gameTime('2026-10-04', 22, 59), 23)).toBe('2026-09-21');
    expect(weekEndPeriod(gameTime('2026-10-04', 23), 23)).toBe('2026-09-28');
    expect(weekEndPeriod(gameTime('2026-10-05', 1), 23)).toBe('2026-09-28');
  });
});

describe('排行', () => {
  it('并列同名次，去掉值 0，同值同 tie 按店号', () => {
    const r = rankRows([
      { restId: 5, name: 'e', value: 10 },
      { restId: 2, name: 'b', value: 30 },
      { restId: 3, name: 'c', value: 10 },
      { restId: 4, name: 'd', value: 0 },
      { restId: 1, name: 'a', value: 5 },
    ]);
    expect(r.map((x) => [x.restId, x.rank])).toEqual([[2, 1], [3, 2], [5, 2], [1, 4]]);
  });
  it('tie 不同则不并列（等级同级比经验、周榜先到先排）', () => {
    const r = rankRows([
      { restId: 1, name: 'a', value: 10, tie: 5 },
      { restId: 2, name: 'b', value: 10, tie: 9 },
    ]);
    expect(r.map((x) => [x.restId, x.rank])).toEqual([[2, 1], [1, 2]]);
  });
});

describe('手动进货', () => {
  it('费用：第 1、2 次 100 万，第 3 次 200 万', () => {
    expect([0, 1, 2, 3].map((n) => manualCost(n, m))).toEqual([1e6, 1e6, 2e6, 3e6]);
  });
  it('声望：前 2 次减半，第 5 次起 500', () => {
    expect(manualRenown(0, 1e6)).toBe(50);
    expect(manualRenown(2, 2e6)).toBe(200);
    expect(manualRenown(5, 5e6)).toBe(500);
  });
});
```

`t` 用 `testConfig().tuning.hiphop`，`m` 用 `testConfig().tuning.market`。

- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/hiphop/rules.test.ts src/modules/rank/ranking.test.ts src/modules/market/rules.test.ts`
  Expected: FAIL（函数未定义）。

- [ ] **Step 3: 实现**：照 Produces 写。

- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。

- [ ] **Step 5: 提交** `feat(hiphop): 打赏、排行、手动进货的纯规则`

---

### Task 3: 每日地点、`GET /hiphop`、测试接口

**Files:**
- Create: `apps/server/src/modules/hiphop/day.ts`、`jobs.ts`、`service.ts`、`routes.ts`、`day.test.ts`
- Modify: `apps/server/src/game.ts`（`hiphop: createHiphopService(deps, world)`，`jobs.push(...hiphopJobs(deps))`）
- Modify: `apps/server/src/modules/index.ts`（注册 `hiphopRoutes`）
- Modify: `apps/server/src/http/testApi.ts`（`POST /hiphop`）

**Interfaces — Produces:**

```ts
// day.ts
export type HiphopDayRow = Selectable<DB['hiphop_day']>;
/** 今天的记录（不管时段）；没有返回 null */
export async function hiphopDay(db: Kysely<DB>, shardId: number, now: Date): Promise<HiphopDayRow | null>
/** 现在是否在出没时段：hour ≤ 当前游戏小时 < closeHour */
export function hiphopOut(now: Date, t: Tuning['hiphop']): boolean
/** 生成今天的记录（已有就不动），返回是否新建。rng 用 seededRng(hashSeed(shardId, 'hiphop', day)) */
export async function rollHiphopDay(d: GameDeps, shardId: number, day: string, now: Date): Promise<{ created: boolean; place: number; restId: number | null }>
/** 测试接口用：覆盖今天的地点 */
export async function forceHiphopDay(db: Kysely<DB>, shardId: number, now: Date, v: { place: number; restId?: number | null; foodsId?: number; worth?: number }): Promise<void>
```

`rollHiphopDay` 的步骤：
1. 按 `placeWeights` 抽地点。
2. 抽到 9 时查近 `restActiveDays` 天有 `income_round` 的玩家店。查询条件：join `restaurant` 要求 `npc=false`，join `account` 要求 `banned_at is null`，`created_at >= now - N 天`，distinct `rest_id`，按 id 排序。
   - 有店：均匀挑一家，进 `runSystemOp(d, shardId, restId, { source: 'hiphop.event', now })`，在里面 `grantGoodsOp(o, GOODS.hiphopCulture, 1)` 并 `opNews(o, 'hiphop.event', {})`。
   - 没有店：把 9 从权重表去掉，再抽一次公共地点。
3. 想要的食材：取 `config.foodPools.get(level)` 里 level 1~5 的全部食材，按 id 排序，均匀挑一种（不按 odds）。
4. 门槛：`rollWorth(rng.next(), t)`。
5. `insert ... on conflict do nothing`。

`jobs.ts`：

```ts
{ name: 'hiphop-daily', feature: 'hiphop',
  period: (now, s) => latestSlot(now, [s.tuning.hiphop.hour]).key,
  run: ({ shardId, period, now }) => rollHiphopDay(d, shardId, parseSlotKey(period).day, now) }
```

`service.spot(ctx, q)`：
- 先 `ensureFeature(ctx.shardId, 'hiphop')`。
- 没有记录、不在时段内、或者地点对不上时，返回 `{here:false}`。
  - 带 `place` 查询：今天的地点必须等于 `place` 且不是 9。
  - 带 `restId` 查询：今天的地点必须是 9，且 `rest_id === restId`。
- 在这里时返回 `myWeekWorth`：本周一 0 点起我的 `hiphop_tip.worth` 之和。
- `closeAt = gameTime(day, closeHour)`。

测试接口：`POST /api/v1/test/hiphop {shardId, place, restId?}`，需要登录，调用 `forceHiphopDay(game.app.db, shardId, game.deps.now(), ...)`。

- [ ] **Step 1: 写失败的测试**（`day.test.ts`；时钟设成 `gameTime(DAY, 12)`；用 `setTuning` 控制 `placeWeights`）

```ts
it('公共地点：只出现在那一页，其余地点和店都是 here:false', async () => {
  const a = await newRestaurant(t);
  await setTuning(t, a.shardId, { hiphop: { placeWeights: [[3, 1]] } });
  await rollHiphopDay(t.deps, a.shardId, DAY, t.clock.now);
  const spot = await t.game.hiphop.spot(a, { place: 3 });
  expect(spot).toMatchObject({ here: true, place: 3, restId: null, myWeekWorth: 0 });
  if (spot.here) {
    expect(spot.food.level).toBeGreaterThanOrEqual(1);
    expect(spot.worth).toBeGreaterThanOrEqual(43750);
  }
  for (const p of [1, 2, 4, 5, 6]) expect(await t.game.hiphop.spot(a, { place: p })).toEqual({ here: false });
  expect(await t.game.hiphop.spot(a, { restId: a.restaurantId })).toEqual({ here: false });
});
it('餐厅地点：只挑近 7 天有收益的玩家店；那家店得到嘻哈文化并写新闻', async () => {
  const shardId = await createShard(t.db);
  const idle = await newRestaurant(t, { shardId });
  const busy = await newRestaurant(t, { shardId });
  await insertIncome(t, busy.restaurantId, t.clock.now); // 本测试文件里的小工具：插一行 income_round
  await setTuning(t, shardId, { hiphop: { placeWeights: [[9, 1]] } });
  const r = await rollHiphopDay(t.deps, shardId, DAY, t.clock.now);
  expect(r).toMatchObject({ created: true, place: 9, restId: busy.restaurantId });
  expect(await goodsNum(t, busy.restaurantId, 230)).toBe(1);
  expect(await goodsNum(t, idle.restaurantId, 230)).toBe(0);
  expect(await t.game.hiphop.spot(idle, { restId: busy.restaurantId })).toMatchObject({ here: true, place: 9 });
  expect(await t.game.hiphop.spot(idle, { place: 1 })).toEqual({ here: false });
  // 新闻
  const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
  expect(news.map((n) => n.type)).toContain('hiphop.event');
});
it('没有活跃店时改抽公共地点', async () => {
  const shardId = await createShard(t.db);
  await setTuning(t, shardId, { hiphop: { placeWeights: [[9, 5], [2, 1]] } });
  expect(await rollHiphopDay(t.deps, shardId, DAY, t.clock.now)).toMatchObject({ place: 2, restId: null });
});
it('同一天只生成一次', async () => {
  const shardId = await createShard(t.db);
  const first = await rollHiphopDay(t.deps, shardId, DAY, t.clock.now);
  const again = await rollHiphopDay(t.deps, shardId, DAY, t.clock.now);
  expect(again.created).toBe(false);
  expect(again.place).toBe(first.place);
});
it('9 点前、22 点后都不在', async () => {
  const a = await newRestaurant(t);
  await setTuning(t, a.shardId, { hiphop: { placeWeights: [[1, 1]] } });
  await rollHiphopDay(t.deps, a.shardId, DAY, gameTime(DAY, 9));
  t.clock.set(gameTime(DAY, 8, 59));
  expect(await t.game.hiphop.spot(a, { place: 1 })).toEqual({ here: false });
  t.clock.set(gameTime(DAY, 22));
  expect(await t.game.hiphop.spot(a, { place: 1 })).toEqual({ here: false });
  t.clock.set(gameTime(DAY, 21, 59));
  expect(await t.game.hiphop.spot(a, { place: 1 })).toMatchObject({ here: true });
});
it('定时任务 9 点跑：周期键是当天', async () => {
  const shardId = await createShard(t.db);
  t.clock.set(gameTime(DAY, 9, 1));
  const ran = await runDueJobs({ db: t.db, shards: t.game.shards, now: t.deps.now, log: console }, t.game.jobs, { shardIds: [shardId] });
  expect(ran.filter((r) => r.job === 'hiphop-daily')).toEqual([{ shardId, job: 'hiphop-daily', period: `${DAY}@09`, ok: true }]);
});
```

`testApi.test.ts` 追加：登录后 `POST /api/v1/test/hiphop {shardId, place: 1}`，然后 `GET /api/v1/hiphop?place=1` 返回 `here: true`。照文件里现有登录、建店的写法。

- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/hiphop/day.test.ts src/http/testApi.test.ts`
  Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**：照 Produces 写；路由 `GET /hiphop` 用 `parse(hiphopQuery, req.query)`。

- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。

- [ ] **Step 5: 提交** `feat(hiphop): 每日出没地点、查看接口、测试接口`

---

### Task 4: 打赏

**Files:**
- Create: `apps/server/src/modules/hiphop/tip.ts`、`tip.test.ts`
- Modify: `apps/server/src/modules/hiphop/service.ts`、`routes.ts`（`POST /hiphop/tip`）

**Interfaces:**
- Consumes：
  - Task 2 的 `foodWorth`、`coinWorth`、`diamondWorth`、`tipExp`、`krabRoll`、`tipTickets`；
  - Task 3 的 `hiphopDay`、`hiphopOut`；
  - 现有的 `subFoods`、`spendCoin`、`spendDiamond`、`gainExp`、`grantGoodsOp`、`opLuck`、`world.ensure`、`emitAction`、`opNews`、`restLog`。
- Produces：`export async function tip(o: Op, world: WorldService, b: HiphopTipBody, ctx: RestCtx): Promise<HiphopTipDto>`，通过 `runOp(d, ctx, { feature: 'hiphop', source: 'hiphop.tip' }, ...)` 调用。

**算法**：

```ts
const t = o.tuning.hiphop;
const day = await hiphopDay(o.tx, o.shardId, o.now);
const here = day && hiphopOut(o.now, t) && day.place === b.place && (b.place !== 9 || day.rest_id === b.restId);
if (!here) throw invalidState('not_here');
if (t.requireVerifiedEmail) { /* 查 account.email_verified_at，空就 throw requirement('email') */ }
let worth = 0, exp = 0, fresh = true;
if (b.kind === 'food') {
  if (!b.foodsId) throw invalidState('no_food');
  await subFoods(o, b.foodsId, b.num);   // 不够时由它报 NOT_ENOUGH；参数照 foods.ts 现有签名
  if (b.foodsId === day.foods_id) {
    const f = o.config.requireFood(day.foods_id);
    worth = foodWorth(f.coin, f.level, b.num);
  } else fresh = false;
} else if (b.kind === 'coin') {
  if (b.num > t.coinMax) throw new AppError(ErrorCode.VALIDATION, 400, { max: t.coinMax });
  spendCoin(o, b.num);
  worth = coinWorth(b.num, t);
  exp = tipExp('coin', b.num, o.rng.next(), t);
} else {
  if (b.num > t.diamondMax) throw new AppError(ErrorCode.VALIDATION, 400, { max: t.diamondMax });
  spendDiamond(o, b.num);
  worth = diamondWorth(b.num, t);
  exp = tipExp('diamond', b.num, o.rng.next(), t);
}
if (exp > 0) gainExp(o, exp);
let krabCoin = 0, tickets = 0, rainbow = false;
let reply: HiphopTipDto['reply'] = 'thanks';
if (worth >= day.worth) {
  const weatherRate = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects.krabCoinRate ?? 0;
  const roll = krabRoll(o.rng.next(), t, weatherRate, b.kind === 'food', (await opLuck(o)).rate);
  reply = 'wanted';
  if (roll.hit) {
    reply = 'krab';
    rainbow = roll.rainbow;
    krabCoin = Math.floor(worth / day.worth);
    await grantGoodsOp(o, GOODS.krabCoin, krabCoin);
    if (b.kind === 'food' && day.place === 9 && day.rest_id === o.rest.id) {
      const f = o.config.requireFood(day.foods_id);
      tickets = tipTickets(b.num, f.level);
      await grantGoodsOp(o, GOODS.mysteryTicket, tickets);
    }
    opNews(o, 'hiphop.krab', { num: krabCoin });
  }
}
await o.tx.insertInto('hiphop_tip').values({ shard_id: o.shardId, rest_id: o.rest.id, kind: b.kind, num: b.num,
  foods_id: b.kind === 'food' ? b.foodsId! : null, worth, krab_coin: krabCoin, created_at: o.now }).execute();
await emitAction(o, 'hiphop.reward');
restLog(o, 'hiphop.tip', { kind: b.kind, num: b.num, foodsId: b.foodsId ?? null, worth, krabCoin, tickets });
return { worth, exp, krabCoin, tickets, rainbow, fresh, reply };
```

额外礼券只在中了蟹币时发，和原版一致（原版写在中蟹币的分支里）。

- [ ] **Step 1: 写失败的测试**（`tip.test.ts`）
  - 时钟：`gameTime(DAY, 12)`。
  - 随机数：`createTestGame({ rng: () => sequenceRng(script) })` 控制，`script` 每个测试前重设。
  - 今天的记录：`forceHiphopDay` 设定 `{ place: 1, foodsId: F, worth: W }`。`F` 取测试配置里任意一个 3 级食材。
  - 天气：`setWeather` 设成没有 `krabCoinRate` 的天气 1。

```ts
it('银币打赏：价值 num/5、经验浮动、写记录、完成支线', async () => {
  script = [0.5, 0.99]; // 经验浮动、蟹币不中
  const a = await newRestaurant(t, { patch: { coin: 10_000_000 } });
  await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 1, foodsId: F, worth: 50_000 });
  const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 1_000_000 });
  expect(r.data).toEqual({ worth: 200_000, exp: 4761, krabCoin: 0, tickets: 0, rainbow: false, fresh: true, reply: 'wanted' });
  expect((await restRow(t, a.restaurantId)).coin).toBe(9_000_000);
  const rows = await t.db.selectFrom('hiphop_tip').selectAll().where('rest_id', '=', a.restaurantId).execute();
  expect(rows).toHaveLength(1);
  expect(Number(rows[0]!.worth)).toBe(200_000);
  // 支线完成：照 town/view.test 里查任务状态的写法，断言 hiphop.reward 的支线已完成
});
it('中蟹币：⌊价值/门槛⌋ 个，写新闻', async () => {
  script = [0.5, 0.0];
  const a = await newRestaurant(t, { patch: { coin: 10_000_000 } });
  await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 1, foodsId: F, worth: 50_000 });
  const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 1_000_000 });
  expect(r.data).toMatchObject({ krabCoin: 4, reply: 'krab' });
  expect(await goodsNum(t, a.restaurantId, GOODS.krabCoin)).toBe(4);
});
it('没到门槛：不判蟹币', async () => {
  script = [0.5, 0.0];
  const a = await newRestaurant(t, { patch: { coin: 10_000_000 } });
  await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 1, foodsId: F, worth: 50_000 });
  const r = await t.game.hiphop.tip(a, { place: 1, kind: 'coin', num: 100_000 });
  expect(r.data).toMatchObject({ worth: 20_000, krabCoin: 0, reply: 'thanks' });
});
it('钻石打赏：价值 ×10001/3，经验 ×50', async () => {
  script = [0.5, 0.99];
  const a = await newRestaurant(t, { patch: { diamond: 100 } });
  await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 1, foodsId: F, worth: 50_000 });
  const r = await t.game.hiphop.tip(a, { place: 1, kind: 'diamond', num: 30 });
  expect(r.data).toMatchObject({ worth: 100_010, exp: 1500 });
  expect((await restRow(t, a.restaurantId)).diamond).toBe(70);
});
it('食材打赏：想要的按等级折算；别的食材价值 0 且 fresh=false', async () => {
  script = [0.99];
  const a = await newRestaurant(t, { foods: { [F]: 100, [G]: 10 } });
  await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 1, foodsId: F, worth: 999_999_999 });
  const f = testConfig().requireFood(F);
  const r1 = await t.game.hiphop.tip(a, { place: 1, kind: 'food', foodsId: F, num: 10 });
  expect(r1.data).toMatchObject({ worth: foodWorth(f.coin, f.level, 10), fresh: true, exp: 0 });
  const r2 = await t.game.hiphop.tip(a, { place: 1, kind: 'food', foodsId: G, num: 10 });
  expect(r2.data).toMatchObject({ worth: 0, fresh: false, reply: 'thanks' });
  expect(await foodNum(t, a.restaurantId, F)).toBe(90);
  expect(await foodNum(t, a.restaurantId, G)).toBe(0);
});
it('餐厅地点：店主自己用食材打赏中了蟹币多给礼券；别人不给', async () => {
  // 门槛设成 1，保证中门槛；script 每次给 0（蟹币必中）
});
it('拒绝：地点不对、22 点后、数量超上限、余额不足、邮箱开关', async () => {
  // place 2 → INVALID_STATE not_here，且错误参数里没有 place 字段；
  // 22:00 → not_here；
  // coin 100000001 → VALIDATION；
  // coin 余额 0 → NOT_ENOUGH；
  // setTuning requireVerifiedEmail=true 且未验证 → REQUIREMENT_NOT_MET email；verified:true 的店通过
});
```

`G` 是另一种食材。食材价值和礼券的期望值由 `foodWorth` 和 `tipTickets` 现算，不要硬编码测试配置里的单价。

- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/hiphop/tip.test.ts`
  Expected: FAIL（`tip` 不存在）。

- [ ] **Step 3: 实现**：照算法写。`subFoods`、`gainExp` 的参数以 `foods.ts` 和 `resources.ts` 的现有签名为准。

- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。

- [ ] **Step 5: 提交** `feat(hiphop): 打赏食材、银币、钻石，蟹币和礼券`

---

### Task 5: 镇长问答

**Files:**
- Create: `apps/server/src/modules/town/mayor.ts`、`mayor.test.ts`
- Modify: `apps/server/src/modules/town/service.ts`、`routes.ts`（`POST /town/mayor`）
- Modify: `apps/server/src/modules/town/view.ts`（`mayor.answered`）
- Modify: `apps/server/src/modules/town/view.test.ts`

**Interfaces — Produces:**

```ts
export const MAYOR_RIGHT = '谢谢你，我现在就去找他，好好弥补他！';
export const MAYOR_WRONG = '你觉得乱说一个位置我就会信吗！';
/** 镇长问答（设计文档 §2.3）：先看今天有没有记录，再占每日次数 */
export async function askMayor(o: Op, place: HiphopPlace): Promise<TalkResultDto> {
  const day = await hiphopDay(o.tx, o.shardId, o.now);
  if (!day) throw invalidState('hiphop_not_out');
  if ((await incrementDaily(o.tx, o.rest.id, 'town.talk.mayor', 1, gameDay(o.now))) > 1)
    throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'mayor' });
  const right = day.place === place;
  const goodsId = right ? GOODS.mayorFavor : GOODS.mayorAgainst;
  await grantGoodsOp(o, goodsId, 1);
  restLog(o, 'town.mayor', { place, right });
  return { npc: 'mayor', talk: right ? MAYOR_RIGHT : MAYOR_WRONG, rewards: [{ kind: 'goods', id: goodsId, num: 1 }] };
}
```

这个操作走 `runOp(feature 'town')`。

`view.ts` 的改动：`mayor: { answered: (await getDaily(d.db, restId, 'town.talk.mayor', day)) > 0 }`。

- [ ] **Step 1: 写失败的测试**
  - 9 点前（没有记录）：报 `INVALID_STATE hiphop_not_out`；记录生成后同一天还能答。
  - 答对（地点 3 答 3）：得到 231，回话 `MAYOR_RIGHT`；再答报 `ALREADY_DONE`。
  - 答错：得到 232。
  - 餐厅地点答 9 就算对，不管是哪家。
  - 概览：答过 `mayor.answered === true`；`view.test.ts` 的两个 `toEqual` 改成 `mayor: { answered: false }`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/town/mayor.test.ts src/modules/town/view.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。
- [ ] **Step 5: 提交** `feat(town): 镇长问答`

---

### Task 6: 打赏周榜和工作证工资

**Files:**
- Create: `apps/server/src/modules/hiphop/weekly.ts`、`weekly.test.ts`
- Modify: `apps/server/src/modules/hiphop/jobs.ts`

**Interfaces — Produces:**

```ts
/** [from, to) 时间范围内每家玩家店的打赏价值合计和最后一次打赏时间；周榜和排行共用 */
export async function tipTotals(db: Kysely<DB>, shardId: number, from: Date, to: Date): Promise<RankSource[]>
// value = sum(worth)；tie = -最后一次打赏时间毫秒（先到先排）；只含 npc=false 且账号未封禁
export async function awardWeekly(d: GameDeps, shardId: number, monday: string, now: Date): Promise<{ winners: number }>
export async function payWages(d: GameDeps, shardId: number, now: Date): Promise<{ paid: number }>
```

`awardWeekly`：
- 时间范围：`from = gameTime(monday, 0)`，`to = gameTime(addDays(monday, 6), weeklyHour)`。
- 用 `rankRows(await tipTotals(...))` 排名，取前 `weeklyCards.length` 行（按排序位置取，不按名次）。
- 第 i 个店在 `runSystemOp(d, shardId, restId, { source: 'hiphop.weekly', now })` 里 `grantGoodsOp(o, weeklyCards[i], 1)`，并 `opNews(o, 'hiphop.weekly', { rank: i + 1, goodsId })`。

`payWages`：
- 查本区持有有效工作证的玩家店：`store_item.goods_id in 证集合`，`num > 0`，`expires_at is null or > now`。
- 每行在系统操作里 `grantGoodsOp(o, wageOf(goodsId), 1)`。

`jobs.ts` 追加：

```ts
{ name: 'hiphop-weekly', feature: 'hiphop',
  period: (now, s) => weekEndPeriod(now, s.tuning.hiphop.weeklyHour),
  run: ({ shardId, period, now }) => awardWeekly(d, shardId, period, now) },
{ name: 'hiphop-wage', feature: 'hiphop',
  period: (now) => weeklyPeriod(now),
  run: ({ shardId, now }) => payWages(d, shardId, now) },
```

`weeklyPeriod` 从 `friend/weekly.ts` 导入。

- [ ] **Step 1: 写失败的测试**
  - 6 家店的本周打赏价值不同，其中一家 NPC 价值最高，另一家价值 0。跑 `awardWeekly`：
    - NPC 和价值 0 的店不在榜上；
    - 前 5 名依次得到 108、109、107、111、110；
    - 每张证到期时间 = now + 160 小时，从 `store_item.expires_at` 读；
    - 写了 5 条 `hiphop.weekly` 新闻。
  - 并列：两店同值，先打赏的那家拿 108。
  - 上周的打赏不算；周日 23 点后的打赏（直接插行造数据）也不算。
  - 工资：
    - 持 108 的店领到 234；
    - 持 107、110 的店领到 233 和 237；
    - 证过期的不领。
  - 定时任务：
    - 时钟设成周日 23:01 跑 `runDueJobs`，`hiphop-weekly` 的周期为本周一，再跑一次不重复；
    - 周一 07:59 跑出 `hiphop-wage`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/hiphop/weekly.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。
- [ ] **Step 5: 提交** `feat(hiphop): 打赏周榜、工作证工资`

---

### Task 7: 菜场手动进货和分成

**Files:**
- Create: `apps/server/src/modules/market/manual.ts`、`manual.test.ts`
- Modify: `apps/server/src/modules/market/service.ts`
  - `buyTx` 遇到手动货时走两家店的分支；
  - `view` 加 `owner` 和 `manual`。
- Modify: `apps/server/src/modules/market/routes.ts`（`POST /market/manual-stock`）

**Interfaces — Produces:**

```ts
/** 手动进货（设计文档 §2.5）。runOp(feature 'market', source 'market.manual') */
export async function manualStock(o: Op): Promise<ManualStockDto> {
  const t = o.tuning.market;
  if (!(await hasValidHonor(o, GOODS.marketJobHonor))) throw requirement('job_honor', { goodsId: GOODS.marketJobHonor });
  const day = gameDay(o.now);
  const today = await getDaily(o.tx, o.rest.id, 'market.manual', day);
  const cost = manualCost(today, t);
  spendCoin(o, cost);
  const renown = manualRenown(today, cost);
  gainRenown(o, renown);
  await incrementDaily(o.tx, o.rest.id, 'market.manual', 1, day);
  // 选食材：照 rollShelf 的 shelf 0 写法，kinds = manualKinds，等级按 dailyLevelWeights，同批不重复；用 o.rng
  const foods = rollManual(o.config, t, o.rng);   // 写在 market/rules.ts，返回 foodsId[]
  await o.tx.deleteFrom('market_item').where('shard_id', '=', o.shardId).where('owner_rest_id', '=', o.rest.id).execute();
  await o.tx.insertInto('market_item').values(foods.map((id) => ({
    shard_id: o.shardId, shelf: 0, period: `manual:${o.now.toISOString()}`, foods_id: id,
    stock: t.manualStock, hot: false, opened_at: o.now, owner_rest_id: o.rest.id,
  }))).execute();
  opNews(o, 'market.manual', { foods });
  restLog(o, 'market.manual', { cost, renown, foods });
  return { foods, cost, renown };
}
```

`period` 列是 text，手动货的值只用来区分，不参与任何周期逻辑：执行时先 grep 一下 `market_item.period` 的用处确认这一点。

**买手动货**：`buyTx` 读到 `item.owner_rest_id !== null` 时：

- **进货人自己买**：
  - 不扣钱，不检查 99 份限购；
  - 照常检查橱柜和单种上限，照常扣 `sold`；
  - 走原来的 `runOp`。
- **别人买**：改成：

  ```ts
  withRestaurants(d.db, [ctx.restaurantId, ownerId], async (tx, rests) => {
    const me = createOp(d, tx, rests.get(ctx.restaurantId)!, settings, { source: 'market.buy', ctx });
    const owner = createOp(d, tx, rests.get(ownerId)!, settings, { source: 'market.share', now: me.now, rng: me.rng });
    ...
    await flushOp(me);
    await flushOp(owner);
    return { data, events: me.events };
  })
  ```

  - 限购：只用 `claimLimit(me, item.id, \`rest:${me.rest.id}\`, num, t.manualPersonMax)`，不按设备和 IP 计。
  - 价格：照日常价 `unitPrice(0, ...)`。
  - 分成：`gainCoin(owner, Math.floor(paid * t.manualShare), { event: false })`。
  - 事件 `market.buy` 照发。

  先读 `withRestaurants` 和 `createOp` 的签名（`town/service.ts` 的 shake 有现成用法）。要先在锁外读出 `owner_rest_id` 才知道锁哪两家：锁住后重新读这件货，`owner_rest_id` 变了就报 `item_gone`。
- 进货人账号被删时，外键会级联删掉这件货。
- `buyTx` 现在是一个 `runOp`。把手动货的分支拆成单独的函数 `buyManual`，原来的路径不动。

**`view` 的改动**：
- 每件货的 `owner`：一次查出全部 `owner_rest_id` 对应的店名。
- 别人看手动货时，`limit` = `manualPersonMax`，`sharedBought` = 0。
- 自己看自己的货：`limit = stock`，`price` 照常显示，前端写"免费"。
- `manual`：`hasCard` 用 `validNum(...)`（`takeaway/view.ts` 有现成写法），`cost = manualCost(今天次数, t)`。

- [ ] **Step 1: 写失败的测试**（`manual.test.ts`）
  - 没证报 `REQUIREMENT_NOT_MET job_honor`。用 `grantGoods` 发 107（勋章要写有效期）：照 takeaway 测试里发 108 的写法。
  - 第 1、2、3 次分别扣 100 万、100 万、200 万；声望 +50、+50、+200。
  - 第二次进货后，货架上我的手动货只剩新的 4 件；系统日常货不受影响。
  - 别人买 10 份：
    - 付日常价 × 10；
    - 进货人银币 + ⌊货款 × 0.25⌋；
    - 买家拿到食材。
  - 别人累计买到 99 份后再买 1 份：报 `LIMIT_REACHED`，进货人银币不变。
  - 进货人自己买 500 份：不扣钱，进货人银币不变，`sold` + 500。
  - 并发：两个别人同时各买 60 份（`Promise.allSettled`）：都成功，进货人分成两次都到账；同一个人并发买 60 + 60：一成一败。
  - 日常货架刷新（`t.game.market.refresh(shardId, 0, slot, now)`）后，手动货也下架。
  - `view`：
    - 别人看到 `owner.name`、`limit 99`；
    - 自己看到 `manual.hasCard true`，`cost` 随次数变化。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/market/manual.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令，加跑 `src/modules/market/market.test.ts` 确认原有菜场测试不受影响。Expected: PASS。
- [ ] **Step 5: 提交** `feat(market): 菜场工作证手动进货、进货人分成`

---

### Task 8: 排行榜服务

**Files:**
- Create: `apps/server/src/modules/rank/boards.ts`、`service.ts`、`routes.ts`、`rank.test.ts`
- Modify: `apps/server/src/game.ts`、`apps/server/src/modules/index.ts`

**Interfaces — Produces:**

```ts
// boards.ts
export interface BoardCtx { db: Kysely<DB>; shardId: number; now: Date; config: GameConfig }
/** 每个 key 一个函数，返回本区玩家店的原始值（未排序、未截断） */
export const BOARD_SOURCES: Record<string, (c: BoardCtx) => Promise<RankSource[]>>;
// service.ts
export function createRankService(d: GameDeps): {
  board(ctx: RestCtx, key: string): Promise<RankDto>;
  /** 测试用 */
  clearCache(): void;
};
```

**每类的查询**：所有查询都 join `restaurant r` 加 `r.shard_id = shardId`、`r.npc = false`，再 join `account` 加 `banned_at is null`。这段写成 `playerRests(db, shardId)` 子查询，各榜共用。

- **时间范围**：
  - `dayRange(now, offset)`：`[gameTime(addDays(day, offset), 0), gameTime(addDays(day, offset + 1), 0))`；
  - 本周 / 上周：`[gameTime(mondayOf(day)), now]` 和 `[上周一 0 点, 本周一 0 点)`；
  - 每日计数类用 `day` 字符串范围，和 `friend/weekly.ts` 的 `sumBetween` 一样。
- **收益**：
  - `income.coin.today` 等：`sum(coin|exp)` where `created_at` 在范围内；
  - `income.*.round`：本区最近一个 `round_no` 的那一轮（子查询 `max(round_no)`，同样限定本区玩家店）。
- **食谱**：
  - 读全部玩家店的 `restaurant_cookbooks.levels`（Buffer），在服务里数 `>= N` 的字节个数；
  - `cookbook.1` = `levels` 里非 0 的个数。
- **等级**：`value = level`，`tie = exp`。
- **厨力**：
  - 对每家玩家店 `restPower(db, row, config.suits)`，`suits` 的字段名以 `equip/power.ts` 调用方为准；
  - 缓存时长用 `powerCacheSeconds`。
- **声望**：`renown`。
- **赞**：`thumb` 按 `to_rest` 或 `from_rest` 计数。
- **灭蟑螂、产蟑螂、被翻厨**：`daily_counter` 的 `roach.kill`、`roach.lay`、`flip.flipped`，按日期范围求和。
- **酒吧**：
  - `bar.fg.win`：`fg_result = 1` 的 `fg_times`；
  - `bar.fg.lose`：`fg_result = -1` 的 `fg_times`；
  - `cup`、`num` 同理。执行时先读 `bar/games.ts`，确认猜酒杯、转数字的"中 / 不中"各用哪个值，并在代码注释里写明。
- **特色菜**：
  - `mc.today`、`mc.yesterday`：`max(total_num::float8 * price)` 按 `created_at` 范围；
  - `mc.best`：`max` 不限时间；
  - `mc.times`：`count(*)`；
  - `mc.learned`：`rest_mc` 计数。
- **打赏**：`tipTotals`（Task 6）。

**缓存**：
- `Map<string, { at: number; rows: Array<RankSource & {rank}> }>`，键为 `${shardId}:${key}`。
- `at` 用 `d.now()` 的毫秒。过期判断用 `cacheSeconds`，厨力榜用 `powerCacheSeconds`。

**`board`**：
- `key` 不在 `RANK_KEYS` 里就报 `VALIDATION`。
- 先 `ensureFeature(ctx.shardId, 'town')`。
- `rows` 取前 `top` 行。
- `me` 在全量排序结果里找；找不到为 null。
- `updatedAt` 为缓存生成时间。

路由：`GET /rank/:key`，key 用 `z.string().max(40)` 解析。

- [ ] **Step 1: 写失败的测试**（`rank.test.ts`；每个用例用新区服隔离；每个用例前 `t.game.rank.clearCache()`）
  - `income.coin.today`：插 3 家店今天、昨天的 `income_round`。只算今天，排序正确；NPC 店和封禁账号的店不在榜上。
  - `income.coin.round`：两轮数据，只算最近一轮。
  - `level`：同级时经验高的在前，名次不并列。
  - `cookbook.7`：直接写 `levels` Buffer（`Buffer.from([0, 7, 8, 6, 7])` 的品级 ≥ 7 有 3 个）。
  - `roach.kill.thisWeek` / `lastWeek`：`daily_counter` 造数据，跨周正确。
  - `bar.fg.win`：`bar_state` 造 `fg_result=1, fg_times=4` 和 `fg_result=-1, fg_times=9` 两家：前者在连胜榜，后者在连败榜。
  - `mc.yesterday`：两批取单批最大值。
  - `hiphop.week`：同值时先打赏的在前。
  - `me`：造 55 家店，我是第 53 名：`rows` 长度 50，`me.rank === 53`；值为 0 的店 `me === null`。
  - 缓存：
    - 取一次后新增数据，60 秒内结果不变；`t.clock.advance(61_000)` 后更新；
    - 另一个区服不受影响；
    - 厨力榜 61 秒后仍是旧值，601 秒后更新。
  - 未知 key 报 `VALIDATION`。
  - 其余每个 key 至少跑一次不报错：`for (const b of RANK_BOARDS) await t.game.rank.board(a, b.key)`。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/server exec vitest run src/modules/rank/rank.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令。Expected: PASS。
- [ ] **Step 5: 提交** `feat(rank): 排行榜 41 个榜、短缓存`

---

### Task 9: 前端——嘻哈男孩卡片和地点页

**Files:**
- Create: `apps/web/src/components/hiphop/HiphopCard.vue`、`HiphopCard.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`（`hiphopSpot`、`hiphopTip`）
- Modify: `apps/web/src/i18n/zh-CN.ts`
  - STATE：`not_here: '嘻哈男孩不在这里'`、`hiphop_not_out: '嘻哈男孩今天还没出来，9 点以后再来问镇长吧'`、`no_food: '请选择要打赏的食材'`；
  - REQUIREMENT：`email: '打赏前要先验证邮箱'`。
- Modify: `apps/web/src/utils/news.ts`（`hiphop.event`、`hiphop.krab`、`hiphop.weekly`、`market.manual` 的文案）
- Modify: `apps/web/src/views/{MarketView,ShopView,BarView,SocietyView,TowerView,TempleView,RestaurantHomeView,FriendRestView}.vue`
- Modify: `apps/web/src/styles/main.css`

**组件约定**：
- props：`{ place?: HiphopPlace; restId?: number }`。挂载时调用 `endpoints.hiphopSpot(...)`，`here:false` 时不渲染任何元素（根节点 `v-if`）。
- 卡片结构（`.dt-card`）：
  - 标题"嘻哈男孩在这里卖艺"；
  - 台词"我想要 〈等级标签〉〈食材名〉（你有 N 份）"；
  - `dt-meta` 一行"单次打赏价值达到 {worth} 有机会捡到蟹币 · 本周你已打赏 {myWeekWorth}"；
  - 胶囊标签：食材 / 银币 / 钻石。
    - 食材：`<select>` 列出橱柜里的食材（从 `endpoints.cupboard()` 取，接口名以现有 endpoints 为准），默认选他想要的那种，旁边是数量输入。
    - 银币、钻石：各一个数量输入。
  - "打赏"按钮。
- 回话文案：
  - `thanks` → "感谢您的支持和鼓励，你们是我进步的动力！"；
  - `wanted` → "这些正是我需要的！谢谢！"；
  - `krab` → "你在旁边捡到 蟹币×N（虹）"，`rainbow` 时才加"（虹）"，有礼券时追加"、神秘礼券×M"；
  - `fresh=false` → 前面加一句"这些食材看起来不怎么新鲜的样子"；
  - 有经验时追加"额外获得经验 N"。
- 结果写在卡片里（`data-testid="hiphop-result"`），并 `emit('changed')` 让所在页面刷新余额。
- testid：`hiphop-card`、`hiphop-kind-food|coin|diamond`、`hiphop-num`、`hiphop-food`、`hiphop-tip`、`hiphop-result`。

**页面接入**：
- 地点和页面的对应：1 MarketView、2 ShopView、3 BarView、4 SocietyView、5 TowerView、6 TempleView。在各页标题下方放 `<HiphopCard :place="N" @changed="load" />`；页面没有 `load` 的照它现有的刷新函数名。
- 店首页放 `<HiphopCard :rest-id="自己的店号" />`，好友店页放 `<HiphopCard :rest-id="好友店号" />`。

- [ ] **Step 1: 写失败的测试**（`HiphopCard.test.ts`，mock `endpoints`）
  - `here:false` 时 `wrapper.html()` 为空注释（`find('[data-testid="hiphop-card"]').exists() === false`）。
  - `here:true`：
    - 显示想要的食材名；
    - 选银币、输 100000、点打赏：调用 `hiphopTip({ place: 1, kind: 'coin', num: 100000 })`，结果行为"感谢您的支持和鼓励，你们是我进步的动力！额外获得经验 476"。
  - 食材打赏默认选中想要的食材，调用参数带 `foodsId`。
  - `krab` + `rainbow` + `tickets` 的文案完整。
  - `news.test.ts`：4 种新闻都有文案（`types.test` 会钉住全覆盖）。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/web exec vitest run src/components/hiphop src/utils/news.test.ts`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令，加跑 `pnpm --filter @dt/web exec vitest run src/views`，确认 8 个页面的已有测试仍通过（在它们的 endpoints mock 里补 `hiphopSpot: vi.fn().mockResolvedValue({ here: false })`）。Expected: PASS。
- [ ] **Step 5: 提交** `feat(web): 嘻哈男孩卡片、地点页接入`

---

### Task 10: 前端——镇长问答、排行标签、手动进货

**Files:**
- Modify: `apps/web/src/components/town/TownPanel.vue`、`TownPanel.test.ts`、`testData.ts`
- Create: `apps/web/src/components/town/RankPanel.vue`、`RankPanel.test.ts`
- Modify: `apps/web/src/views/TownView.vue`、`TownView.test.ts`（标签 `rank`，`?tab=rank`）
- Modify: `apps/web/src/views/MarketView.vue`、`MarketView.test.ts`
- Modify: `apps/web/src/api/endpoints.ts`（`townMayor`、`rank`、`marketManualStock`）
- Modify: `apps/web/src/styles/main.css`

**约定**：
- **镇长问答**：
  - `TownPanel` 的 NPC 区，镇长一行写"告诉镇长嘻哈男孩今天在哪"，点开显示 7 个按钮（`HIPHOP_PLACE_NAMES`，testid `mayor-<id>`）。
  - 答过（`data.mayor.answered`）显示"今天已经告诉过镇长了"。
  - 回答后用现有 NPC 对话的结果展示方式，显示回话和道具。
- **排行**（`RankPanel`）：
  - 大类胶囊 `.dt-pills`（`RANK_GROUPS`），小类按钮组（`RANK_BOARDS` 里同组的项）。切换时调用 `endpoints.rank(key)`。
  - 顶部 `dt-meta`："每分钟更新 · 更新于 hh:mm"，有 `reward` 时另起一行显示。
  - 列表 `.dt-item`：名次、店名、值。
    - 店名：是自己就链到首页，否则链到好友店页，路由名以 router 为准。
    - 值：≥ 1 亿写"x.xx亿"，≥ 1 万写"x.x万"，否则原数。写成 `utils/format.ts` 里的 `shortNum`，已有同类函数就复用。
  - 自己那一行加 `.dt-item-me` 高亮；`me` 不在 `rows` 里时，在列表下方单独显示"我：第 N 名 · 值"。
  - 选中的榜记在 `localStorage`（try/catch）。
  - 页尾一行"赛厨榜在厨塔、克拉肯月榜在神殿查看"。
- **菜场**：
  - 有 `manual.hasCard` 时，日常货架标题右侧放按钮"手动进货（{cost} 银币）"（testid `market-manual`）。点击后调用接口，toast 显示"进货完成，声望 +N"并刷新页面。
  - 手动货在食材名下方写 `dt-meta`"{owner.name} 进的货"。自己的货写"自己的货，免费"，购买按钮价格显示 0。

- [ ] **Step 1: 写失败的测试**
  - `TownPanel`：
    - 未答时点"告诉镇长"再点 `mayor-3`，调用 `townMayor(3)` 并显示回话；
    - `answered:true` 时显示"今天已经告诉过镇长了"，不显示按钮。
  - `RankPanel`：
    - 默认第一个大类第一个榜，调用 `rank('income.coin.today')`；
    - 显示 3 行，自己那一行有 `dt-item-me`；
    - `me` 不在前列时底部显示"我：第 53 名"；
    - 切到"打赏"大类显示奖励说明含"工作证"；
    - `shortNum(123456789) === '1.23亿'`，`shortNum(45678) === '4.6万'`。
  - `TownView`：`?tab=rank` 时显示 `RankPanel`。
  - `MarketView`：
    - 有证时显示手动进货按钮和费用，点击后调用接口并刷新；
    - 手动货显示"小王 进的货"。
- [ ] **Step 2: 运行，确认失败**
  Run: `pnpm --filter @dt/web exec vitest run src/components/town src/views/TownView.test.ts src/views/MarketView.test.ts src/utils`
  Expected: FAIL。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行，确认通过**：同上命令，然后 `pnpm test`、`pnpm typecheck`、`pnpm lint`。Expected: 全部 PASS。
- [ ] **Step 5: 提交** `feat(web): 镇长问答、排行页、菜场手动进货`

---

### Task 11: 端到端和文档

**Files:**
- Create: `apps/web/e2e/hiphop-rank.spec.ts`
- Modify: `docs/rules/收益与加成.md`（新增一节：嘻哈男孩、镇长问答、工作证、手动进货、排行）
- Modify: `docs/deploy.md`（迁移 0016；上线前把 `hiphop.requireVerifiedEmail` 改为 true）

**端到端流程**（照 `bar-games.spec.ts` 的注册、建店写法）：
1. 从 `GET /api/v1/restaurant/overview` 拿到 `shardId`。
2. `POST /api/v1/test/hiphop {shardId, place: 1}`。
3. 打开菜场页，看到 `hiphop-card`；选银币，输 10000，点打赏，看到 `hiphop-result`。
4. 打开小镇页，点"告诉镇长"再点 `mayor-1`，看到"谢谢你"。
5. 打开 `/town?tab=rank`，点"打赏"大类，看到自己店名所在行有 `dt-item-me`。

- [ ] **Step 1: 写 e2e。**
- [ ] **Step 2: 跑 e2e。**
  Run: `pnpm --filter @dt/web e2e`
  Expected: 全部通过（含原有用例）。
- [ ] **Step 3: 写文档。**
- [ ] **Step 4: `pnpm test`、`pnpm typecheck`、`pnpm lint`、`npx prettier --check .`**
  Expected: PASS。
- [ ] **Step 5: 提交** `test(e2e): 嘻哈男孩、镇长、排行；docs: 规则和迁移 0016`
