# 限时活动 148-2 兑换活动 + 纪念品 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增活动类型"兑换活动"（活动货币按概率掉落、活动商店兑换、兑换期），和一种新道具类型"纪念品"（第一批 12 件）。

**Architecture:** 兑换活动复用 148-1 的活动表、行为事件处理器和 `activity_counter`（余额键 `m<i>`、已换次数键 `x<i>`）；掉落在事件处理器里用 `d.rng` 掷骰；兑换是新的锁店接口。纪念品是配置里的新文件，构建时并进道具表，类型 10，不占仓库格。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-activity-2-exchange-design.md`

## Global Constraints

- 货币 1~8 种，名字 1~6 字且不重复；掉落规则 1~20 条，概率 `0 < p ≤ 1` 最多 4 位小数，每次 1~99 个，每天上限 1~9999；兑换表 1~30 项，每项消耗 1~4 种（同货币不重复，个数 1~9999），每人次数 1~999；兑换期 0~168 小时，默认 24。
- 兑换接口 `{ index, times 1..99 }`；兑换期 = `ends_at + graceHours`。
- 错误：`invalidState('not_exchange' | 'exchange_closed' | 'no_item')`、`limitReached('activity_exchange', { limit, left })`、`notEnough('activity_currency', need, have, 货币下标)`。
- 个人日志 `activity.exchange` 要有中文文案。
- 纪念品 id 90001~90012，类型 `GOODS_TYPE.souvenir = 10`，coin/diamond 0，maxNum 99；不占仓库格、不能卖、不能用、不能丢。
- 测试从仓库根目录跑；`packages/config/data/game/*.json` 不跑 prettier；不碰 `问题记录.md`；测试库共用，测试里不要留下当前时间生效的全服（`shard_id` 为空）活动。

## Review Focus

1. **掉落的每天上限按规则分开计**：两条规则掉同一种货币时，各自有各自的上限，不能互相占用。→ Task 3 测试。
2. **兑换期边界**：`now = ends_at + graceHours` 时已不能兑换；`ends_at` 之后、兑换期之内能兑换但不再掉落。→ Task 3、Task 4 测试。
3. **兑换次数和余额同时检查**：余额够换 5 次、上限 3 次、已换 2 次时，换 2 次要报 `limitReached`，余额不变。→ Task 4 测试。
4. **纪念品不占仓库格**：仓库满了照样能领纪念品，仓库页的格子数不算纪念品（三处计算都要排除）。→ Task 5 测试。
5. **玩家页把兑换活动当成别的类型渲染**：兑换活动必须用兑换卡片，不能落到其他布局。→ Task 6 测试。

---

### Task 1: shared——兑换活动定义校验和 DTO 字段

**Files:**
- Modify: `packages/shared/src/schemas/activity.ts`
- Test: `packages/shared/src/schemas/activity.test.ts`（追加）

**Interfaces:**
- Produces: `exchangeDef`、`type ExchangeDef`；`ACTIVITY_KINDS` 含 `'exchange'`；`ActivitySpec` 含 `{ kind: 'exchange'; def: ExchangeDef }`；`ActivityDto` 加 `exchangeUntil: string | null`；`ActivityExchangeDto = { index: number; times: number; items: RewardItems }`。

- [ ] **Step 1: 写失败的测试**（追加）

```ts
describe('兑换活动定义（148-2 设计 §3）', () => {
  const award = { coin: 1 };
  const def = (patch: Record<string, unknown> = {}) => ({
    currencies: [{ name: '福' }, { name: '禄' }],
    drops: [{ key: 'market.buy', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
    shop: [{ cost: [{ currency: 0, num: 1 }, { currency: 1, num: 1 }], award, limit: 3 }],
    graceHours: 24,
    ...patch,
  });
  const ex = (patch: Record<string, unknown> = {}) => ({ ...base, kind: 'exchange', def: def(patch) });
  it('合法的能过', () => {
    expect(paths(ex())).toEqual([]);
  });
  it('货币名为空、超长、重名都报错', () => {
    expect(paths(ex({ currencies: [{ name: '' }] }))[0]).toMatch(/^def\.currencies\.0\.name:/);
    expect(paths(ex({ currencies: [{ name: '一二三四五六七' }] }))[0]).toMatch(/^def\.currencies\.0\.name:/);
    expect(paths(ex({ currencies: [{ name: '福' }, { name: '福' }] }))).toContain('def.currencies:duplicate_name');
  });
  it('引用不存在的货币、概率越界或超过 4 位小数、消耗为空或重复都报错', () => {
    expect(paths(ex({ drops: [{ key: 'market.buy', chance: 0.05, currency: 5, num: 1, dailyCap: 1 }] }))).toContain(
      'def.drops.0.currency:no_currency',
    );
    expect(paths(ex({ drops: [{ key: 'market.buy', chance: 0, currency: 0, num: 1, dailyCap: 1 }] }))[0]).toMatch(
      /^def\.drops\.0\.chance:/,
    );
    expect(
      paths(ex({ drops: [{ key: 'market.buy', chance: 0.00001, currency: 0, num: 1, dailyCap: 1 }] })),
    ).toContain('def.drops.0.chance:four_decimals');
    expect(paths(ex({ shop: [{ cost: [], award, limit: 1 }] }))[0]).toMatch(/^def\.shop\.0\.cost:/);
    expect(
      paths(
        ex({
          shop: [
            {
              cost: [
                { currency: 0, num: 1 },
                { currency: 0, num: 2 },
              ],
              award,
              limit: 1,
            },
          ],
        }),
      ),
    ).toContain('def.shop.0.cost:duplicate_currency');
    expect(paths(ex({ shop: [{ cost: [{ currency: 9, num: 1 }], award, limit: 1 }] }))).toContain(
      'def.shop.0.cost.0.currency:no_currency',
    );
  });
  it('兑换期默认 24 小时', () => {
    const { graceHours, ...rest } = def();
    void graceHours;
    const r = activityBody.parse({ ...base, kind: 'exchange', def: rest });
    expect((r.def as { graceHours: number }).graceHours).toBe(24);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/shared/src/schemas/activity.test.ts`
Expected: FAIL（kind 不接受 `exchange`）

- [ ] **Step 3: 实现**（`schemas/activity.ts`）

`ACTIVITY_KINDS` 改成 `['goals', 'grid', 'pass', 'boost', 'exchange'] as const`。在 `DEF_SCHEMAS` 之前加：

```ts
const fourDecimals = (n: number) => Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-6;
export const exchangeDef = z
  .object({
    currencies: z
      .array(z.object({ name: z.string().trim().min(1).max(6) }))
      .min(1)
      .max(8)
      .refine((cs) => new Set(cs.map((c) => c.name)).size === cs.length, { message: 'duplicate_name' }),
    drops: z
      .array(
        z.object({
          key: actionKey,
          chance: z
            .number()
            .gt(0)
            .max(1)
            .refine(fourDecimals, { message: 'four_decimals' }),
          currency: z.number().int().min(0),
          num: z.number().int().min(1).max(99),
          dailyCap: z.number().int().min(1).max(9999),
        }),
      )
      .min(1)
      .max(20),
    shop: z
      .array(
        z.object({
          cost: z
            .array(z.object({ currency: z.number().int().min(0), num: z.number().int().min(1).max(9999) }))
            .min(1)
            .max(4)
            .refine((c) => new Set(c.map((x) => x.currency)).size === c.length, {
              message: 'duplicate_currency',
            }),
          award: rewardItems,
          limit: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(30),
    graceHours: z.number().int().min(0).max(168).default(24),
  })
  .superRefine((d, ctx) => {
    const n = d.currencies.length;
    d.drops.forEach((r, i) => {
      if (r.currency >= n) ctx.addIssue({ code: 'custom', path: ['drops', i, 'currency'], message: 'no_currency' });
    });
    d.shop.forEach((s, i) =>
      s.cost.forEach((c, j) => {
        if (c.currency >= n)
          ctx.addIssue({ code: 'custom', path: ['shop', i, 'cost', j, 'currency'], message: 'no_currency' });
      }),
    );
  });
export type ExchangeDef = z.infer<typeof exchangeDef>;
```

`DEF_SCHEMAS` 加 `exchange: exchangeDef`；`ActivitySpec` 加 `| { kind: 'exchange'; def: ExchangeDef }`。`ActivityDto` 加：

```ts
  /** 兑换活动：结束后还能兑换到什么时候（ends_at + graceHours）；其他类型为 null */
  exchangeUntil: string | null;
```

再加：

```ts
export interface ActivityExchangeDto {
  index: number;
  times: number;
  items: RewardItems;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/shared/src/schemas/activity.test.ts && pnpm --filter @dt/shared typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): 兑换活动定义校验"
```

---

### Task 2: config——纪念品

**Files:**
- Create: `packages/config/data/game/souvenirs.json`
- Modify: `packages/config/src/ids.ts`（`GOODS_TYPE.souvenir = 10`）
- Modify: `packages/config/src/raw.ts`（`souvenirsFile`）
- Modify: `packages/config/src/source.ts`（加 `'game/souvenirs'`）
- Modify: `packages/config/src/build.ts`（并进道具表）
- Create: `packages/config/src/souvenir.ts`（`takesStoreSlot`）
- Create: `packages/config/src/souvenir.test.ts`
- Modify: `packages/config/src/index.ts`

**Interfaces:**
- Produces: `GOODS_TYPE.souvenir`、`takesStoreSlot(g: Goods | undefined): boolean`（非勋章、非纪念品才占格）

- [ ] **Step 1: 写失败的测试** `souvenir.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS_TYPE } from './ids';
import { createGameConfig } from './runtime';
import { takesStoreSlot } from './souvenir';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('纪念品（148-2 设计 §6）', () => {
  it('第一批 12 件进了道具表，类型是纪念品，不能卖也不能用', () => {
    const list = [...config.goods.values()].filter((g) => g.type === GOODS_TYPE.souvenir);
    expect(list.map((g) => g.id).sort()).toEqual(Array.from({ length: 12 }, (_, i) => 90001 + i));
    const g = config.requireGoods(90009);
    expect(g.name).toBe('小红旗徽章');
    expect(g.desc).toContain('国庆');
    expect(g).toMatchObject({ coin: 0, diamond: 0, maxNum: 99, use: null, equip: null, gem: null });
  });
  it('id 和已有道具冲突时构建报错', () => {
    const src = readSourceDir(defaultDataDir());
    const file = src['game/souvenirs'] as { souvenirs: Array<{ id: number }> };
    file.souvenirs[0]!.id = 1;
    const r = buildBundle(src);
    expect(r.bundle).toBeNull();
    expect(r.errors.join('\n')).toMatch(/goods/);
  });
  it('勋章和纪念品不占仓库格，其他道具占', () => {
    expect(takesStoreSlot(config.requireGoods(90001))).toBe(false);
    const honor = [...config.goods.values()].find((g) => g.type === GOODS_TYPE.honor)!;
    expect(takesStoreSlot(honor)).toBe(false);
    const item = [...config.goods.values()].find((g) => g.type === GOODS_TYPE.item)!;
    expect(takesStoreSlot(item)).toBe(true);
    expect(takesStoreSlot(undefined)).toBe(false);
  });
});
```

（`readSourceDir` 返回对象的键名、`requireGoods` 的位置以现有代码为准；不一致就按实际改，记 Ruling。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/config/src/souvenir.test.ts`
Expected: FAIL（`./souvenir` 不存在）

- [ ] **Step 3: 数据文件** `souvenirs.json`（规格书 §6.3 的 12 件，手工写，不跑 prettier）

```json
{
  "souvenirs": [
    { "id": 90001, "name": "新年铃铛", "holiday": "元旦", "desc": "新年第一天挂在门口的小铜铃，风一吹就叮当作响，提醒你今年也要好好开店。" },
    { "id": 90002, "name": "福字窗花", "holiday": "春节", "desc": "红纸剪出的倒福，贴在后厨窗上，年夜饭的香气从福字中间飘出去。" },
    { "id": 90003, "name": "走马灯", "holiday": "元宵", "desc": "灯里的小人儿端着汤圆转个不停，转一圈就是小镇一年的热闹。" },
    { "id": 90004, "name": "巧克力礼盒", "holiday": "情人节", "desc": "系着丝带的手工巧克力，据说是隔壁甜品店偷偷送来的。" },
    { "id": 90005, "name": "粽香荷包", "holiday": "端午", "desc": "缝着艾草和香料的小荷包，带着淡淡的粽叶清香。" },
    { "id": 90006, "name": "糖画风车", "holiday": "儿童节", "desc": "用麦芽糖画成的小风车，舍不得吃，一直摆在柜台上。" },
    { "id": 90007, "name": "鹊桥香囊", "holiday": "七夕", "desc": "绣着喜鹊的香囊，七夕那天店里的情侣座总是最先坐满。" },
    { "id": 90008, "name": "玉兔灯", "holiday": "中秋", "desc": "白纸扎成的兔子灯，点亮时正好照着桌上的月饼。" },
    { "id": 90009, "name": "小红旗徽章", "holiday": "国庆", "desc": "别在围裙上的小红旗，长假里每一桌客人都会多看两眼。" },
    { "id": 90010, "name": "南瓜灯", "holiday": "万圣夜", "desc": "刻着笑脸的南瓜，挖出来的南瓜肉第二天就做成了南瓜汤。" },
    { "id": 90011, "name": "姜饼屋", "holiday": "圣诞", "desc": "屋顶撒满糖霜的姜饼小屋，看起来比真正的店面还要温馨。" },
    { "id": 90012, "name": "金汤勺", "holiday": "开服纪念", "desc": "小镇开张那年发的纪念汤勺，勺柄上刻着第一位客人的名字。" }
  ]
}
```

- [ ] **Step 4: 类型、原始结构、加载**

`ids.ts`：`GOODS_TYPE` 加 `souvenir: 10,`。
`raw.ts`：

```ts
export const souvenirsFile = z
  .object({
    souvenirs: z.array(
      z.object({ id: int.min(1), name: z.string().min(1), holiday: z.string().min(1), desc: z.string().min(1) }).strict(),
    ),
  })
  .strict();
```

`source.ts`：列表里 `'game/newbie_codes',` 后加 `'game/souvenirs',`。

- [ ] **Step 5: 构建并进道具表**（`build.ts`）

`const newbieCodesRaw = parse(...)` 后加 `const souvenirsRaw = parse('game/souvenirs', raw.souvenirsFile);`，并把 `!souvenirsRaw ||` 加进提前返回的条件。把 `const goods = applyStressTables(builtGoods, ...)` 改成：

```ts
  // 纪念品（148-2 设计 §6）：配置里定义的永久道具，没有加成和用途；描述末尾注明节日
  const souvenirGoods: Goods[] = souvenirsRaw.souvenirs.map((s) => ({
    id: s.id,
    name: s.name,
    type: GOODS_TYPE.souvenir,
    deviceType: null,
    invalidHours: null,
    maxNum: 99,
    stackable: true,
    level: 1,
    coin: 0,
    diamond: 0,
    onSale: false,
    awardFlag: null,
    desc: `${s.desc}（${s.holiday}纪念品）`,
    value: null,
    effects: {},
    gift: null,
    use: null,
    equip: null,
    gem: null,
  }));
  const goods = [...applyStressTables(builtGoods, equipLore.stressTables, errors), ...souvenirGoods];
```

（后面原有的 `unique('goods', …)` 会检查 id 冲突。`Goods` 和 `GOODS_TYPE` 的 import 按文件现有写法补齐。）

`souvenir.ts`：

```ts
import { GOODS_TYPE } from './ids';
import type { Goods } from './types';

/** 占不占仓库格：勋章和纪念品不占（148-2 设计 §6.2）；配置里没有的道具不算 */
export function takesStoreSlot(g: Goods | undefined): boolean {
  return g !== undefined && g.type !== GOODS_TYPE.honor && g.type !== GOODS_TYPE.souvenir;
}
```

`index.ts` 加 `export { takesStoreSlot } from './souvenir';`。

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm --filter @dt/config build && pnpm vitest run packages/config`
Expected: PASS（其他按道具数量断言的测试如有失败，按纪念品新增 12 件调整断言并记 Ruling）

- [ ] **Step 7: Commit**

```bash
git add packages/config
git commit -m "feat(config): 纪念品道具类型和第一批 12 件"
```

---

### Task 3: 服务端——迁移 0023、掉落

**Files:**
- Create: `apps/server/src/db/migrations/0023_activity_exchange.ts`（+ `index.ts`）
- Modify: `apps/server/src/db/schema.ts`（kind 加 `'exchange'`）
- Modify: `apps/server/src/modules/activity/rules.ts`（`rewardsOf` 对 exchange 返回 `[]`；`exchangeUntil(spec, endsAt)`）
- Modify: `apps/server/src/modules/activity/handler.ts`（掉落）
- Create: `apps/server/src/modules/activity/exchange.test.ts`

**Interfaces:**
- Consumes: Task 1 `ExchangeDef`
- Produces: `dropDailyKey(activityId, ruleIndex)` = `` `act${id}:d${i}` ``；`currencyKey(i)` = `` `m${i}` ``；`exchangedKey(i)` = `` `x${i}` ``（都从 `rules.ts` 导出）；`exchangeUntil(spec: ActivitySpec, endsAt: Date): Date | null`

- [ ] **Step 1: 写失败的测试** `exchange.test.ts`（掉落部分）

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rng } from '@dt/shared';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

/** 可控随机数：rolls 里有值就按顺序取，取完一律 0.99（不命中） */
const rolls: number[] = [];
const rng: Rng = {
  next: () => rolls.shift() ?? 0.99,
  int: () => 0,
  intMin1: () => 1,
  chance: (p) => (rolls.shift() ?? 0.99) < p,
};
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => rng });
});
afterAll(() => t.close());

const H = 3_600_000;
const award = { coin: 10 };
const spec = (patch: Record<string, unknown> = {}) => ({
  kind: 'exchange' as const,
  def: {
    currencies: [{ name: '福' }, { name: '禄' }],
    drops: [
      { key: 'market.buy', chance: 0.5, currency: 0, num: 2, dailyCap: 5 },
      { key: 'market.buy', chance: 0.5, currency: 0, num: 1, dailyCap: 1 },
      { key: 'shop.buy', chance: 0.5, currency: 1, num: 1, dailyCap: 9 },
    ],
    shop: [{ cost: [{ currency: 0, num: 2 }], award, limit: 3 }],
    graceHours: 24,
    ...patch,
  },
});
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));

describe('兑换活动掉落（148-2 设计 §4）', () => {
  it('每条规则各掷一次：命中掉 num 个，不命中不掉；别的行为不掉', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    rolls.push(0.1, 0.9); // 规则 0 命中（+2），规则 1 不命中
    await act(r, 'market.buy');
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 2 });
    await act(r, 'oil.fill');
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 2 });
  });

  it('n 次事件掷 n 次；每条规则的每天上限分开计，跨游戏日重置', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec(), endsAt: new Date(t.clock.now.getTime() + 72 * H) });
    rolls.push(0.1, 0.1, 0.1, 0.1, 0.1, 0.1); // 规则 0：3 次全中（+6，上限 5）；规则 1：3 次全中（+3，上限 1）
    await act(r, 'market.buy', 3);
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 6 });
    t.clock.advance(24 * H);
    rolls.push(0.1, 0.9);
    await act(r, 'market.buy');
    expect(await counters(t, id, r.restaurantId)).toEqual({ m0: 8 });
    t.clock.advance(-24 * H);
  });

  it('结束后（兑换期内）不再掉落', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: spec(), endsAt: end });
    const back = t.clock.now;
    t.clock.set(new Date(end.getTime() + 1000));
    rolls.push(0.1, 0.1);
    await act(r, 'market.buy');
    t.clock.set(back);
    rolls.length = 0;
    expect(await counters(t, id, r.restaurantId)).toEqual({});
  });
});
```

（`newRestaurant` 和 `insertActivity` 见 `apps/server/test/`。`ActivitySpec` 的类型如果对 `spec()` 的返回报错，用 `as never` 断言。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/activity/exchange.test.ts`
Expected: FAIL（插入 `kind='exchange'` 违反检查约束）

- [ ] **Step 3: 迁移** `0023_activity_exchange.ts`

```ts
import { sql, type Kysely } from 'kysely';

/** 148-2：活动类型加上兑换活动 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost', 'exchange'))`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from activity where kind = 'exchange'`.execute(db);
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost'))`.execute(
    db,
  );
}
```

`index.ts` 登记 `'0023_activity_exchange': m0023`；`schema.ts` 的 kind 加 `'exchange'`。

- [ ] **Step 4: 规则**（`rules.ts`）

```ts
export const currencyKey = (i: number) => `m${i}`;
export const exchangedKey = (i: number) => `x${i}`;
export const dropDailyKey = (activityId: number, i: number) => `act${activityId}:d${i}`;

/** 兑换活动结束后还能兑换到什么时候（148-2 设计 §5）；其他类型为 null */
export function exchangeUntil(spec: ActivitySpec, endsAt: Date): Date | null {
  return spec.kind === 'exchange' ? new Date(endsAt.getTime() + spec.def.graceHours * 3_600_000) : null;
}
```

`rewardsOf` 开头的 `if (spec.kind === 'boost') return [];` 改成 `if (spec.kind === 'boost' || spec.kind === 'exchange') return [];`。

- [ ] **Step 5: 掉落**（`handler.ts` 的 `count`）

`count` 改为接收随机源：签名 `count(tx, a, restId, p, at, rng: Rng)`，调用处传 `d.rng()`（每个事件取一次）。在 `if (spec.kind === 'boost') return;` 后加：

```ts
  if (spec.kind === 'exchange') {
    const day = gameDay(at);
    for (const [i, rule] of spec.def.drops.entries()) {
      if (rule.key !== p.key) continue;
      let hits = 0;
      for (let k = 0; k < p.n; k++) if (rng.next() < rule.chance) hits++;
      if (hits === 0) continue;
      const dk = dropDailyKey(a.id, i);
      const add = Math.min(hits * rule.num, rule.dailyCap - (await getDaily(tx, restId, dk, day)));
      if (add <= 0) continue;
      await incrementDaily(tx, restId, dk, add, day);
      await bump(tx, a.id, restId, currencyKey(rule.currency), add);
    }
    return;
  }
```

（规则按定义顺序掷骰；测试里的 `rolls` 就是按这个顺序准备的。）

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/activity apps/server/src/db`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): 兑换活动的货币掉落；迁移 0023"
```

---

### Task 4: 服务端——兑换接口和 DTO

**Files:**
- Modify: `apps/server/src/modules/activity/rules.ts`（`scaleRewards`）
- Modify: `apps/server/src/modules/activity/service.ts`（`exchange`、DTO 的 `exchangeUntil`）
- Modify: `apps/server/src/modules/activity/routes.ts`
- Modify: `apps/web/src/utils/events.ts`（日志文案）、`apps/web/src/i18n/zh-CN.ts`（错误文案）
- Test: `apps/server/src/modules/activity/exchange.test.ts`（追加）、`rules.test.ts`（追加）

**Interfaces:**
- Produces: `scaleRewards(r: RewardItems, times: number): RewardItems`；`svc.exchange(ctx, id, index, times): Promise<OpResult<ActivityExchangeDto>>`；路由 `POST /activities/:id/exchange { index, times }`

- [ ] **Step 1: 写失败的测试**

`rules.test.ts` 追加：

```ts
describe('scaleRewards（148-2）', () => {
  it('数量乘次数，帽子重复次数', () => {
    expect(
      scaleRewards({ coin: 2, goods: [{ id: 5, num: 3 }], hats: [{ tier: 'jade', name: '甲' }] }, 2),
    ).toEqual({
      coin: 4,
      goods: [{ id: 5, num: 6 }],
      hats: [
        { tier: 'jade', name: '甲' },
        { tier: 'jade', name: '甲' },
      ],
    });
  });
});
```

（import 里加 `scaleRewards`。）

`exchange.test.ts` 追加：

```ts
describe('兑换（148-2 设计 §5）', () => {
  const svc = () => t.game.activity;
  const fund = async (id: number, restId: number, m0: number, m1 = 0) => {
    await t.db
      .insertInto('activity_counter')
      .values([
        { activity_id: id, rest_id: restId, key: 'm0', count: m0 },
        { activity_id: id, rest_id: restId, key: 'm1', count: m1 },
      ])
      .execute();
  };

  it('扣余额、记次数、奖励按次数发；列表带 exchangeUntil', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await fund(id, r.restaurantId, 10);
    const res = await svc().exchange(r, id, 0, 3);
    expect(res.data.items).toEqual({ coin: 30 });
    expect(await counters(t, id, r.restaurantId)).toMatchObject({ m0: 4, x0: 3 });
    const row = await t.db.selectFrom('restaurant').select('coin').where('id', '=', r.restaurantId).executeTakeFirstOrThrow();
    expect(row.coin).toBe(30);
    const a = (await svc().list(r)).items.find((x) => x.id === id)!;
    expect(a.exchangeUntil).not.toBeNull();
    expect(a.today).toEqual({ d0: 0, d1: 0, d2: 0 });
  });

  it('次数超限报 limitReached、余额不够报 NOT_ENOUGH，都不扣', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await fund(id, r.restaurantId, 10);
    await svc().exchange(r, id, 0, 2);
    await expect(svc().exchange(r, id, 0, 2)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await counters(t, id, r.restaurantId)).toMatchObject({ m0: 6, x0: 2 });
    const poor = await newRestaurant(t, { shardId });
    await fund(id, poor.restaurantId, 1);
    await expect(svc().exchange(poor, id, 0, 1)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await counters(t, id, poor.restaurantId)).toMatchObject({ m0: 1 });
  });

  it('兑换期内能换，兑换期结束时刻起不能换；项目不存在、不是兑换活动都报错', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: spec({ graceHours: 2 }), endsAt: end });
    await fund(id, r.restaurantId, 10);
    const back = t.clock.now;
    t.clock.set(new Date(end.getTime() + H));
    await svc().exchange(r, id, 0, 1);
    t.clock.set(new Date(end.getTime() + 2 * H));
    await expect(svc().exchange(r, id, 0, 1)).rejects.toMatchObject({ params: { reason: 'exchange_closed' } });
    t.clock.set(back);
    await expect(svc().exchange(r, id, 5, 1)).rejects.toMatchObject({ params: { reason: 'no_item' } });
    const goals = await insertActivity(t, {
      shardId,
      spec: { kind: 'goals', def: { goals: [{ key: 'signin', target: 1, award }] } },
    });
    await expect(svc().exchange(r, goals, 0, 1)).rejects.toMatchObject({ params: { reason: 'not_exchange' } });
  });

  it('同时发两个兑换请求，只成功到余额允许的次数', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await fund(id, r.restaurantId, 2);
    const rs = await Promise.allSettled([svc().exchange(r, id, 0, 1), svc().exchange(r, id, 0, 1)]);
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await counters(t, id, r.restaurantId)).toMatchObject({ m0: 0, x0: 1 });
  });

  it('兑换写个人日志 activity.exchange', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec(), title: '国庆集福' });
    await fund(id, r.restaurantId, 2);
    await svc().exchange(r, id, 0, 1);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'activity.exchange')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ title: '国庆集福', times: 1 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/activity/exchange.test.ts apps/server/src/modules/activity/rules.test.ts`
Expected: FAIL（`exchange` 不存在、`scaleRewards` 不存在）

- [ ] **Step 3: `scaleRewards`**（`rules.ts`）

```ts
/** 兑换多次时的奖励：数量乘次数，帽子重复次数（148-2 设计 §5） */
export function scaleRewards(r: RewardItems, times: number): RewardItems {
  const out: RewardItems = {};
  if (r.coin) out.coin = r.coin * times;
  if (r.diamond) out.diamond = r.diamond * times;
  if (r.exp) out.exp = r.exp * times;
  if (r.goods?.length) out.goods = r.goods.map((g) => ({ id: g.id, num: g.num * times }));
  if (r.foods?.length) out.foods = r.foods.map((f) => ({ id: f.id, num: f.num * times }));
  if (r.hats?.length) out.hats = Array.from({ length: times }, () => r.hats!).flat();
  return out;
}
```

- [ ] **Step 4: 服务**（`service.ts`）

DTO 里加 `exchangeUntil: exchangeUntil(specOf(row), row.ends_at)?.toISOString() ?? null,`。

`todayOf` 对兑换活动返回各掉落规则今天已掉的数量，键 `d<下标>`：

```ts
    if (spec.kind === 'exchange') {
      const keys = spec.def.drops.map((_, i) => dropDailyKey(row.id, i));
      const rows = await db
        .selectFrom('daily_counter')
        .select(['key', 'count'])
        .where('rest_id', '=', restId)
        .where('day', '=', gameDay(now))
        .where('key', 'in', keys)
        .execute();
      const by = new Map(rows.map((r) => [r.key, r.count]));
      return Object.fromEntries(spec.def.drops.map((_, i) => [`d${i}`, by.get(dropDailyKey(row.id, i)) ?? 0]));
    }
```

（放在 `if (spec.kind !== 'pass') return {};` 之前。）测试：在"扣余额、记次数…"用例里先掉落一次再断言 `a.today` 含 `d0`——如果用例里没有掉落，就断言 `a.today` 等于 `{ d0: 0, d1: 0, d2: 0 }`。

新增方法：

```ts
    exchange(ctx: RestCtx, id: number, index: number, times: number) {
      return op(ctx, async (o) => {
        const row = (await visible(o.tx, o.shardId)
          .where('id', '=', id)
          .where('starts_at', '<=', o.now)
          .executeTakeFirst()) as Row | undefined;
        if (!row) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'activity', id });
        const spec = specOf(row);
        if (spec.kind !== 'exchange') throw invalidState('not_exchange');
        if (o.now >= exchangeUntil(spec, row.ends_at)!) throw invalidState('exchange_closed');
        const item = spec.def.shop[index];
        if (!item) throw invalidState('no_item', { index });
        const p = await loadProgress(o.tx, row.id, o.rest.id);
        const done = p.counters[exchangedKey(index)] ?? 0;
        if (done + times > item.limit)
          throw limitReached('activity_exchange', { limit: item.limit, left: item.limit - done });
        for (const c of item.cost) {
          const need = c.num * times;
          const have = p.counters[currencyKey(c.currency)] ?? 0;
          if (have < need) throw notEnough('activity_currency', need, have, c.currency);
        }
        for (const c of item.cost) {
          const need = c.num * times;
          const r = await o.tx
            .updateTable('activity_counter')
            .set({ count: sql<string>`count - ${need}` })
            .where('activity_id', '=', row.id)
            .where('rest_id', '=', o.rest.id)
            .where('key', '=', currencyKey(c.currency))
            .where('count', '>=', String(need))
            .executeTakeFirst();
          if (Number(r.numUpdatedRows) !== 1) throw notEnough('activity_currency', need, 0, c.currency);
        }
        await o.tx
          .insertInto('activity_counter')
          .values({ activity_id: row.id, rest_id: o.rest.id, key: exchangedKey(index), count: times })
          .onConflict((oc) =>
            oc
              .columns(['activity_id', 'rest_id', 'key'])
              .doUpdateSet({ count: sql<string>`activity_counter.count + ${times}` }),
          )
          .execute();
        const items = scaleRewards(item.award, times);
        await grantRewardOp(o, items, {
          source: 'activity',
          logType: 'activity.exchange',
          logParams: {
            activityId: row.id,
            title: row.title,
            times,
            cost: item.cost.map((c) => ({ name: spec.def.currencies[c.currency]!.name, num: c.num * times })),
          },
        });
        return { index, times, items };
      });
    },
```

（import 补齐 `sql`、`limitReached`、`notEnough`、`exchangeUntil`、`exchangedKey`、`currencyKey`、`scaleRewards`。）

- [ ] **Step 5: 路由**（`routes.ts`）

```ts
const exchangeBody = z.object({ index: z.number().int().min(0).max(29), times: z.number().int().min(1).max(99) });
...
    r.post('/activities/:id/exchange', async (req) => {
      const b = parse(exchangeBody, req.body);
      return okOp(await svc.exchange(restCtxOf(req), id(req.params), b.index, b.times));
    });
```

- [ ] **Step 6: 前端文案**

`events.ts` 加：

```ts
  'activity.exchange': (p) => `在活动「${String(p.title ?? '')}」兑换了 ${String(p.times ?? 1)} 次`,
```

`zh-CN.ts` 的 `STATE` 加 `not_exchange: '这个活动不能兑换'`、`exchange_closed: '兑换期已经结束，活动货币已作废'`、`no_item: '没有这个兑换项'`。`LIMIT_REACHED` 和 `NOT_ENOUGH` 的文案用现有的通用文案即可；如果通用文案需要 `what`/`kind` 的中文名映射，就加上 `activity_exchange: '兑换次数'`、`activity_currency: '活动货币'`（以现有映射表为准，记 Ruling）。

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/activity apps/web/src/utils`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server apps/web/src/utils apps/web/src/i18n
git commit -m "feat(server): 兑换活动的兑换接口"
```

---

### Task 5: 服务端——纪念品不占仓库格

**Files:**
- Modify: `apps/server/src/modules/store/goods.ts:117`、`apps/server/src/modules/store/service.ts:80-81`、`apps/server/src/modules/shop/service.ts:77`
- Create: `apps/server/src/modules/store/souvenir.test.ts`

**Interfaces:**
- Consumes: Task 2 `takesStoreSlot`、`GOODS_TYPE.souvenir`

- [ ] **Step 1: 写失败的测试** `souvenir.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from './grant';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('纪念品（148-2 设计 §6.2）', () => {
  it('不占仓库格：仓库满了也能领；仓库页格子数不算纪念品', async () => {
    const r = await newRestaurant(t, { patch: { store_num: 1 }, goods: { 21: 1 } });
    await grantGoods(t.db, t.deps.config, r.restaurantId, 90009, 2, new Date());
    expect(await goodsNum(t, r.restaurantId, 90009)).toBe(2);
    const view = await t.game.store.list(r, {});
    expect(view.kinds).toBe(1);
    expect(view.items.find((i) => i.goodsId === 90009)).toMatchObject({ usable: false, sellPrice: null });
  });
  it('不能卖、不能丢', async () => {
    const r = await newRestaurant(t, { goods: { 90001: 1 } });
    await expect(t.game.shop.sell(r, { goodsId: 90001, num: 1 })).rejects.toMatchObject({ code: expect.any(String) });
    await expect(t.game.shop.discard(r, { goodsId: 90001 })).rejects.toMatchObject({
      params: { reason: 'not_discardable' },
    });
    expect(await goodsNum(t, r.restaurantId, 90001)).toBe(1);
  });
});
```

（`grantGoods`、`t.game.store.list`、`shop.sell`/`shop.discard` 的签名以现有代码为准；道具 21 是任意一个占格的普通道具，按测试配置里实际存在的 id 选，记 Ruling。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/store/souvenir.test.ts`
Expected: FAIL（仓库满时领不到纪念品，或 `kinds` 是 2）

- [ ] **Step 3: 实现**

三处 `?.type !== GOODS_TYPE.honor` 的格子计算改成 `takesStoreSlot(d.config.goods.get(r.goods_id))`（`goods.ts` 里是 `op.config`）。`grantGoodsOp` 里判断"新种类要占格"的地方，如果也是按 honor 判断，同样改成 `takesStoreSlot`（先 `grep -n "honor" apps/server/src/modules/store/grant.ts` 确认）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/store apps/server/src/modules/shop`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/store apps/server/src/modules/shop
git commit -m "feat(server): 纪念品不占仓库格"
```

---

### Task 6: 前端——兑换卡片、后台编辑器、仓库纪念品页

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`（`activityExchange`）
- Create: `apps/web/src/components/activity/ActivityExchange.vue`
- Modify: `apps/web/src/views/ActivitiesView.vue`
- Create: `apps/web/src/components/admin/activity/ExchangeEditor.vue`
- Modify: `apps/web/src/utils/activityForm.ts`（`defaultDef('exchange')`、错误文案）
- Modify: `apps/web/src/views/admin/AdminActivitiesView.vue`
- Modify: `apps/web/src/views/StoreView.vue`
- Test: `ActivitiesView.test.ts`、`AdminActivitiesView.test.ts`、`StoreView.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 `ExchangeDef`、`ActivityExchangeDto`；Task 4 路由

- [ ] **Step 1: 写失败的测试**

`ActivitiesView.test.ts`：mock 里加 `activityExchange: vi.fn()`，追加：

```ts
describe('ActivitiesView 兑换活动', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
  });
  const ex = (patch: Record<string, unknown> = {}) => ({
    ...base,
    id: 11,
    kind: 'exchange',
    def: {
      currencies: [{ name: '福' }, { name: '禄' }],
      drops: [{ key: 'market.buy', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [{ cost: [{ currency: 0, num: 2 }, { currency: 1, num: 1 }], award: { coin: 10 }, limit: 3 }],
      graceHours: 24,
    },
    counters: { m0: 5, m1: 0, x0: 1 },
    today: { 'd0': 3 },
    rewards: [],
    claimable: 0,
    exchangeUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...patch,
  });
  it('显示余额、掉落规则和兑换表；余额不够时按钮禁用', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({ items: [ex() as never], level: 10 });
    const w = mount(ActivitiesView);
    await flushPromises();
    const card = w.find('[data-testid="activity-11"]');
    expect(card.find('[data-testid="balance-11"]').text()).toContain('福 5');
    expect(card.find('[data-testid="balance-11"]').text()).toContain('禄 0');
    expect(card.text()).toContain('菜场买菜');
    expect(card.text()).toContain('5%');
    expect(card.text()).toContain('1/3');
    expect(card.find('[data-testid="exchange-11-0"]').attributes('disabled')).toBeDefined();
  });
  it('余额够时可以兑换，兑换后重新读取', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [ex({ counters: { m0: 5, m1: 2, x0: 1 } }) as never],
      level: 10,
    });
    vi.mocked(endpoints.activityExchange).mockResolvedValue({ index: 0, times: 1, items: { coin: 10 } } as never);
    const w = mount(ActivitiesView);
    await flushPromises();
    await w.find('[data-testid="exchange-11-0"]').trigger('click');
    await flushPromises();
    expect(endpoints.activityExchange).toHaveBeenCalledWith(11, 0, 1);
    expect(endpoints.activities).toHaveBeenCalledTimes(2);
  });
  it('结束后在兑换期内显示剩余时间', async () => {
    vi.mocked(endpoints.activities).mockResolvedValue({
      items: [ex({ state: 'ended', exchangeUntil: new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString() }) as never],
      level: 10,
    });
    const w = mount(ActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('兑换期，还剩 5 小时');
    expect(w.text()).not.toContain('未领的奖励');
  });
});
```


`AdminActivitiesView.test.ts` 追加：

```ts
describe('AdminActivitiesView 兑换活动', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({ version: 'x', goods: [], foods: [], streets: [], weather: [], devices: [] } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });
  it('货币、掉落（百分比换算）、兑换表、兑换期都进提交内容', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('exchange');
    await w.find('[data-testid="cur-name-0"]').setValue('福');
    await w.find('[data-testid="cur-add"]').trigger('click');
    await w.find('[data-testid="cur-name-1"]').setValue('禄');
    await w.find('[data-testid="drop-chance-0"]').setValue('5');
    await w.find('[data-testid="shop-cost-add-0"]').trigger('click');
    await w.find('[data-testid="shop-cost-cur-0-1"]').setValue('1');
    await w.find('[data-testid="ex-grace"]').setValue('48');
    await w.find('[data-testid="ac-title"]').setValue('集福');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('exchange');
    expect(b.def).toMatchObject({
      currencies: [{ name: '福' }, { name: '禄' }],
      drops: [{ key: 'signin', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [{ cost: [{ currency: 0, num: 1 }, { currency: 1, num: 1 }], limit: 1 }],
      graceHours: 48,
    });
  });
});
```

`StoreView.test.ts` 追加（mock、catalog 的准备照该文件现有写法；catalog 里放一件 type 10 的道具 90009 和一件 type 1 的道具）：

```ts
  it('纪念品单独一个标签页，仓库页不显示纪念品（148-2）', async () => {
    // 按该文件现有方式：catalog 加 { id: 90009, name: '小红旗徽章', type: 10, desc: '……（国庆纪念品）' }，
    // store 接口返回 items 含 90009 和一件普通道具
    const w = await mountStore();
    expect(w.text()).not.toContain('小红旗徽章');
    await w.find('[data-testid="tab-souvenirs"]').trigger('click');
    expect(w.find('[data-testid="souvenir-90009"]').text()).toContain('小红旗徽章');
    expect(w.find('[data-testid="souvenir-90009"]').text()).toContain('国庆纪念品');
  });
```

（`mountStore` 以该测试文件现有的挂载函数为准；没有就照现有用例写挂载，记 Ruling。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/ActivitiesView.test.ts apps/web/src/views/admin/AdminActivitiesView.test.ts apps/web/src/views/StoreView.test.ts`
Expected: FAIL

- [ ] **Step 3: 接口**（`endpoints.ts`）

```ts
  activityExchange: (id: number, index: number, times: number) =>
    api.post<ActivityExchangeDto>(`/api/v1/activities/${id}/exchange`, { index, times }),
```

- [ ] **Step 4: 玩家卡片** `components/activity/ActivityExchange.vue`

```vue
<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { ActivityDto, ExchangeDef } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { actionName } from '../../utils/activity';
import { rewardSummary } from '../../utils/reward';

/** 兑换活动卡片（148-2）：余额、掉落、兑换表 */
const props = defineProps<{ a: ActivityDto & { kind: 'exchange'; def: ExchangeDef }; busy: boolean; open: boolean }>();
const emit = defineEmits<{ exchange: [index: number, times: number] }>();
const catalog = useCatalogStore();
const times = reactive<Record<number, number>>({});
const bal = (i: number) => props.a.counters[`m${i}`] ?? 0;
const done = (i: number) => props.a.counters[`x${i}`] ?? 0;
const pct = (p: number) => `${Math.round(p * 10000) / 100}%`;
const affordable = computed(() =>
  props.a.def.shop.map((s, i) => {
    const n = times[i] ?? 1;
    return (
      props.open &&
      done(i) + n <= s.limit &&
      s.cost.every((c) => bal(c.currency) >= c.num * n)
    );
  }),
);
</script>

<template>
  <div class="mb-2" :data-testid="`balance-${a.id}`">
    <span v-for="(c, i) in a.def.currencies" :key="i" class="badge text-bg-warning me-1">{{ c.name }} {{ bal(i) }}</span>
  </div>
  <div class="small text-muted mb-2">
    <div v-for="(r, i) in a.def.drops" :key="i">
      {{ actionName(r.key) }} {{ pct(r.chance) }} 掉 {{ a.def.currencies[r.currency]?.name }} ×{{ r.num }}
      （今天 {{ a.today[`d${i}`] ?? 0 }}/{{ r.dailyCap }}）
    </div>
  </div>
  <div v-for="(s, i) in a.def.shop" :key="i" class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1">
    <span class="flex-fill small">
      {{ s.cost.map((c) => `${a.def.currencies[c.currency]?.name} ×${c.num}`).join(' + ') }}
      → {{ rewardSummary(s.award, catalog) }}
    </span>
    <span class="small text-muted">{{ done(i) }}/{{ s.limit }}</span>
    <input v-model.number="times[i]" type="number" min="1" class="form-control form-control-sm" style="width: 4rem" placeholder="1" />
    <button
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy || !affordable[i]"
      :data-testid="`exchange-${a.id}-${i}`"
      @click="emit('exchange', i, times[i] ?? 1)"
    >
      兑换
    </button>
  </div>
</template>
```

`ActivitiesView.vue`：
- import 组件，`<ActivityBoost …>` 后加 `<ActivityExchange v-else-if="a.kind === 'exchange'" :a="a" :busy="busy" :open="exchangeOpen(a)" @exchange="(i, n) => exchange(a, i, n)" />`；
- 加函数：
  - `exchangeOpen = (a) => a.exchangeUntil !== null && new Date(a.exchangeUntil).getTime() > Date.now()`；
  - `exchange = (a, i, n) => run(() => endpoints.activityExchange(a.id, i, n), '已兑换')`。
- 结束提示那一段改成：
  - 兑换活动在兑换期内显示 `兑换期，${timeLeft(a.exchangeUntil)}`（`timeLeft` 返回"还剩 X 小时"，拼成"兑换期，还剩 5 小时"）；
  - 兑换期过后显示"已结束，活动货币已作废"；
  - 其他类型保持原文案（boost 的文案问题在 backlog，不在本任务）。


- [ ] **Step 5: 后台编辑器** `components/admin/activity/ExchangeEditor.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ACTIVITY_ACTIONS, type ExchangeDef } from '@dt/shared';
import { rowKeys } from '../../../utils/activityForm';
import RewardItemsEditor from '../RewardItemsEditor.vue';

const props = defineProps<{ modelValue: ExchangeDef; errors: Record<string, string> }>();
const emit = defineEmits<{ 'update:modelValue': [ExchangeDef] }>();
type Def = ExchangeDef;
const patch = (p: Partial<Def>) => emit('update:modelValue', { ...props.modelValue, ...p });
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
const shopKeys = ref(rowKeys(props.modelValue.shop.length));
const setDrop = (i: number, p: Partial<Def['drops'][number]>) =>
  patch({ drops: props.modelValue.drops.map((d, j) => (j === i ? { ...d, ...p } : d)) });
const setShop = (i: number, p: Partial<Def['shop'][number]>) =>
  patch({ shop: props.modelValue.shop.map((s, j) => (j === i ? { ...s, ...p } : s)) });
const setCost = (i: number, k: number, p: Partial<Def['shop'][number]['cost'][number]>) =>
  setShop(i, { cost: props.modelValue.shop[i]!.cost.map((c, j) => (j === k ? { ...c, ...p } : c)) });
function addShop() {
  shopKeys.value = [...shopKeys.value, ...rowKeys(1)];
  patch({ shop: [...props.modelValue.shop, { cost: [{ currency: 0, num: 1 }], award: {} as never, limit: 1 }] });
}
function removeShop(i: number) {
  shopKeys.value = shopKeys.value.filter((_, j) => j !== i);
  patch({ shop: props.modelValue.shop.filter((_, j) => j !== i) });
}
const err = (k: string) => props.errors[k];
</script>

<template>
  <div class="small fw-bold">活动货币</div>
  <div v-if="err('def.currencies')" class="text-danger small">{{ err('def.currencies') }}</div>
  <div v-for="(c, i) in modelValue.currencies" :key="`c${i}`" class="d-flex gap-2 align-items-center py-1">
    <input
      class="form-control form-control-sm w-auto"
      maxlength="6"
      :value="c.name"
      :data-testid="`cur-name-${i}`"
      @input="patch({ currencies: modelValue.currencies.map((x, j) => (j === i ? { name: val($event) } : x)) })"
    />
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.currencies.length <= 1"
      @click="patch({ currencies: modelValue.currencies.filter((_, j) => j !== i) })"
    >
      删除
    </button>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mb-3"
    data-testid="cur-add"
    :disabled="modelValue.currencies.length >= 8"
    @click="patch({ currencies: [...modelValue.currencies, { name: '' }] })"
  >
    加一种货币
  </button>

  <div class="small fw-bold">掉落规则</div>
  <div v-for="(d, i) in modelValue.drops" :key="`d${i}`" class="d-flex flex-wrap gap-2 align-items-center py-1">
    <select class="form-select form-select-sm w-auto" :value="d.key" @change="setDrop(i, { key: val($event) })">
      <option v-for="(name, k) in ACTIVITY_ACTIONS" :key="k" :value="k">{{ name }}</option>
    </select>
    概率
    <input
      type="number"
      step="0.01"
      class="form-control form-control-sm"
      style="width: 5rem"
      :value="Math.round(d.chance * 10000) / 100"
      :data-testid="`drop-chance-${i}`"
      @input="setDrop(i, { chance: Math.round(num($event) * 100) / 10000 })"
    />%
    掉
    <select class="form-select form-select-sm w-auto" :value="d.currency" @change="setDrop(i, { currency: num($event) })">
      <option v-for="(c, k) in modelValue.currencies" :key="k" :value="k">{{ c.name || `货币 ${k + 1}` }}</option>
    </select>
    ×<input type="number" min="1" class="form-control form-control-sm" style="width: 4rem" :value="d.num" @input="setDrop(i, { num: num($event) })" />
    每天最多
    <input type="number" min="1" class="form-control form-control-sm" style="width: 5rem" :value="d.dailyCap" @input="setDrop(i, { dailyCap: num($event) })" />
    <button
      type="button"
      class="btn btn-sm btn-link text-danger"
      :disabled="modelValue.drops.length <= 1"
      @click="patch({ drops: modelValue.drops.filter((_, j) => j !== i) })"
    >
      删除
    </button>
    <span v-if="err(`def.drops.${i}.chance`)" class="text-danger small">{{ err(`def.drops.${i}.chance`) }}</span>
  </div>
  <button
    type="button"
    class="btn btn-sm btn-outline-primary mb-3"
    :disabled="modelValue.drops.length >= 20"
    @click="patch({ drops: [...modelValue.drops, { key: 'signin', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }] })"
  >
    加一条规则
  </button>

  <div class="small fw-bold">兑换表</div>
  <div v-for="(s, i) in modelValue.shop" :key="shopKeys[i]" class="border-bottom py-2">
    <div v-for="(c, k) in s.cost" :key="k" class="d-flex gap-2 align-items-center py-1">
      消耗
      <select
        class="form-select form-select-sm w-auto"
        :value="c.currency"
        :data-testid="`shop-cost-cur-${i}-${k}`"
        @change="setCost(i, k, { currency: num($event) })"
      >
        <option v-for="(cu, j) in modelValue.currencies" :key="j" :value="j">{{ cu.name || `货币 ${j + 1}` }}</option>
      </select>
      ×<input type="number" min="1" class="form-control form-control-sm" style="width: 5rem" :value="c.num" @input="setCost(i, k, { num: num($event) })" />
      <button
        type="button"
        class="btn btn-sm btn-link text-danger"
        :disabled="s.cost.length <= 1"
        @click="setShop(i, { cost: s.cost.filter((_, j) => j !== k) })"
      >
        删除
      </button>
    </div>
    <button
      type="button"
      class="btn btn-sm btn-link p-0"
      :data-testid="`shop-cost-add-${i}`"
      :disabled="s.cost.length >= 4"
      @click="setShop(i, { cost: [...s.cost, { currency: 0, num: 1 }] })"
    >
      加一种消耗
    </button>
    <RewardItemsEditor :model-value="s.award" :hats="true" :id-prefix="`shop${i}`" @update:model-value="setShop(i, { award: $event })" />
    <div class="d-flex gap-2 align-items-center">
      每人最多换
      <input type="number" min="1" class="form-control form-control-sm" style="width: 5rem" :value="s.limit" @input="setShop(i, { limit: num($event) })" />
      次
      <button type="button" class="btn btn-sm btn-link text-danger" :disabled="modelValue.shop.length <= 1" @click="removeShop(i)">
        删除这项
      </button>
    </div>
    <div v-for="(m, k) in errors" :key="k">
      <span v-if="String(k).startsWith(`def.shop.${i}.`)" class="text-danger small">{{ m }}</span>
    </div>
  </div>
  <button type="button" class="btn btn-sm btn-outline-primary my-2" :disabled="modelValue.shop.length >= 30" @click="addShop">
    加一项兑换
  </button>

  <div class="d-flex gap-2 align-items-center">
    兑换期（结束后还能兑换几小时）
    <input
      type="number"
      min="0"
      max="168"
      class="form-control form-control-sm"
      style="width: 5rem"
      :value="modelValue.graceHours"
      data-testid="ex-grace"
      @input="patch({ graceHours: num($event) })"
    />
  </div>
</template>
```

`activityForm.ts`：`defaultDef` 加 `'exchange'` 重载和分支：

```ts
  if (kind === 'exchange')
    return {
      currencies: [{ name: '' }],
      drops: [{ key: 'signin', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [{ cost: [{ currency: 0, num: 1 }], award: {} as Goal['award'], limit: 1 }],
      graceHours: 24,
    };
```

`TEXT` 加 `duplicate_name: '货币名不能重复'`、`no_currency: '请选择存在的货币'`、`four_decimals: '概率最多两位小数（百分比）'`、`duplicate_currency: '同一种货币只能列一次'`。

`AdminActivitiesView.vue`：`defs` 类型和初值加 `exchange: ExchangeDef`；`KIND` 加 `exchange: '兑换活动'`；类型下拉加 `<option value="exchange">兑换活动</option>`；编辑器分支加 `<ExchangeEditor v-else-if="kind === 'exchange'" v-model="defs.exchange" :errors="errors" />`。

- [ ] **Step 6: 仓库纪念品页**（`StoreView.vue`）

- `tab` 类型加 `'souvenirs'`；标签栏在"仓库"后加：

```vue
    <li class="nav-item">
      <a
        :class="['nav-link', { active: tab === 'souvenirs' }]"
        href="#"
        data-testid="tab-souvenirs"
        @click.prevent="tab = 'souvenirs'"
        >纪念品</a
      >
    </li>
```

- `groups` 的计算先过滤掉纪念品：`data.value.items.filter((it) => catalog.goodsMap.get(it.goodsId)?.type !== GOODS_TYPE_SOUVENIR)`（常量 `const GOODS_TYPE_SOUVENIR = 10;` 写在本文件，注释"和 @dt/config 的 GOODS_TYPE.souvenir 相同"）。
- 新增 `souvenirs = computed(() => data.value?.items.filter((it) => catalog.goodsMap.get(it.goodsId)?.type === GOODS_TYPE_SOUVENIR) ?? [])`。
- 模板：

```vue
  <template v-if="tab === 'souvenirs' && data">
    <div v-if="souvenirs.length === 0" class="text-muted small">还没有纪念品。参加节日限时活动可以兑换。</div>
    <div v-for="it in souvenirs" :key="it.goodsId" class="d-flex gap-2 border-bottom py-2" :data-testid="`souvenir-${it.goodsId}`">
      <GameImg :path="`goods/${catalog.goodsName(it.goodsId)}`" :alt="catalog.goodsName(it.goodsId)" fallback-icon="bi-gift" />
      <div class="flex-fill">
        <div><b>{{ catalog.goodsName(it.goodsId) }}</b> <span class="small text-muted">×{{ it.num }}</span></div>
        <div class="small text-muted">{{ catalog.goodsMap.get(it.goodsId)?.desc }}</div>
      </div>
    </div>
  </template>
```

（`GameImg` 的 import 按其他页面的写法补齐。）

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run apps/web`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src apps/server/src/modules/activity
git commit -m "feat(web): 兑换活动卡片、后台编辑器、仓库纪念品页"
```

---

### Task 7: 全量检查

- [ ] **Step 1:** `pnpm vitest run`（输出写到工作区文件，读尾部）→ 全部通过
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → 通过
- [ ] **Step 3:** `pnpm format:check` → 只允许 `问题记录.md` 报警
