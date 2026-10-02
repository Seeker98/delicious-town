# 自由交易市场 156-2 进阶防作弊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在交易所撮合时当场判定关联账号和可疑成交：同设备不成交，四种可疑标记，可疑成交双方所得冻结 24 小时；后台加可疑成交列表、冻结交易所、没收冻结中的所得。

**Architecture:**
- 新文件 `modules/exchange/guard.ts`：关联账号查询、可疑标记纯函数、冻结检查。
- 撮合循环里：跳过同设备的挂单；每笔成交算标记，写进 `exchange_trade.flags`；有标记时双方所得写进 `exchange_hold`（吃单方也不当场到账）。
- 取出时先把到期的冻结记录转进可用余额。
- 新文件 `modules/exchange/admin.ts`：冻结、解冻、没收、列表，挂在后台路由上，并写审计日志。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely/Postgres、Vue 3、Vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-02-exchange-2-guard-design.md`

## Global Constraints

- **区服数值** `tuning.exchange.suspicious`：`traceDays 30`、`edgeHigh 1.8`、`edgeLow 0.6`、`repeatDays 7`、`repeatCount 3`、`largeAmount 1000000`、`holdHours 24`。
- **标记**：`same_ip`、`edge_price`、`repeat_pair`、`large`；中文：同 IP、价格贴边、反复对倒、大额。
- **同设备**（近 traceDays 天登录记录 + 本次请求的设备）：跳过这张挂单，不成交也不撤。
- **冷静期**：有任何标记，双方所得都写 `exchange_hold`（`held`，`release_at = now + holdHours`）。买单退回的差价照常当场退。
- **被冻结的店**：下单、取出报 `invalidState('exchange_frozen', { why: 冻结原因 })`。冻结原因不能放在 `reason` 键里：`invalidState` 会把参数展开，覆盖掉 `reason: 'exchange_frozen'`。
- **权限**：冻结、解冻、两个列表要 `mod`；没收要 `admin`。审计动作：`exchange.freeze`、`exchange.unfreeze`、`exchange.confiscate`。
- **测试约定**：测试从仓库根目录跑；不碰 `问题记录.md`；`packages/config/data/**/*.json` 不跑 prettier。

## Review Focus

1. **吃单方的可疑成交**：所得不能当场到账，必须进冻结；但买单的差价要照常退。→ Task 3 测试。
2. **同设备只看设备、不看 IP**：只共用 IP 的照常成交。设备 id 为空的登录记录不能当成"同设备"（不能把两个都没有设备 id 的号判成同设备）。→ Task 2 测试。
3. **反复对倒按账号算**：同一次下单里连续几笔成交也要累计，不分买卖方向。→ Task 3 测试。
4. **冻结时撤单的守恒**：冻结一家有多张挂单的店，剩余部分全部退进账户，盘口按食材 id 顺序加锁。→ Task 4 测试。
5. **没收不影响已解冻的**：已经 `released` 的记录不能被改成 `confiscated`。→ Task 4 测试。

---

### Task 1: config 和 shared——区服数值、接口类型、请求校验

**Files:**
- Modify: `packages/config/data/game/tuning.json`、`packages/config/src/tuning.ts`、`packages/config/data/game/setting_docs.json`
- Modify: `packages/shared/src/schemas/exchange.ts`
- Test: `packages/shared/src/schemas/exchange.test.ts`（追加）

**Interfaces:**
- Produces:
  - `Tuning['exchange']['suspicious']`；
  - `EXCHANGE_FLAGS`（标记 → 中文）；
  - `exchangeFreezeBody`、`exchangeUnfreezeBody`、`exchangeConfiscateBody`、`exchangeSuspiciousQuery`；
  - DTO：
    - `ExchangeHoldDto`；
    - `ExchangeMeDto` 加 `holds`、`frozen`；
    - `ExchangePlaceDto.fills[].held`；
    - `ExchangeSuspiciousRow`、`ExchangeFrozenRow`。

- [ ] **Step 1: 写失败的测试**（追加到 `exchange.test.ts`）

```ts
describe('交易所后台请求（156-2 设计 §6、§7）', () => {
  it('冻结要原因；没收按成交或按店二选一；列表可按标记筛选', () => {
    expect(exchangeFreezeBody.parse({ restId: 3, reason: '对倒' })).toEqual({ restId: 3, reason: '对倒' });
    expect(exchangeFreezeBody.safeParse({ restId: 3, reason: '' }).success).toBe(false);
    expect(exchangeConfiscateBody.parse({ tradeId: 5 })).toEqual({ tradeId: 5 });
    expect(exchangeConfiscateBody.parse({ restId: 7 })).toEqual({ restId: 7 });
    expect(exchangeConfiscateBody.safeParse({}).success).toBe(false);
    expect(exchangeSuspiciousQuery.parse({ shardId: '2', flag: 'large' })).toEqual({ shardId: 2, flag: 'large' });
    expect(exchangeSuspiciousQuery.safeParse({ shardId: '2', flag: 'nope' }).success).toBe(false);
    expect(EXCHANGE_FLAGS.same_ip).toBe('同 IP');
  });
});
```

import 改成 `import { EXCHANGE_FLAGS, exchangeConfiscateBody, exchangeFreezeBody, exchangeOrderBody, exchangeSuspiciousQuery } from './exchange';`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/shared/src/schemas/exchange.test.ts`
Expected: FAIL

- [ ] **Step 3: shared**（`schemas/exchange.ts` 追加和修改）

```ts
/** 可疑成交的标记（156-2 设计 §4） */
export const EXCHANGE_FLAGS = {
  same_ip: '同 IP',
  edge_price: '价格贴边',
  repeat_pair: '反复对倒',
  large: '大额',
} as const;
export type ExchangeFlag = keyof typeof EXCHANGE_FLAGS;

export const exchangeFreezeBody = z.object({
  restId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
});
export const exchangeUnfreezeBody = z.object({ restId: z.number().int().positive() });
export const exchangeConfiscateBody = z.union([
  z.object({ tradeId: z.number().int().positive() }).strict(),
  z.object({ restId: z.number().int().positive() }).strict(),
]);
export const exchangeSuspiciousQuery = z.object({
  shardId: z.coerce.number().int().positive(),
  flag: z.enum(['same_ip', 'edge_price', 'repeat_pair', 'large']).optional(),
});

export interface ExchangeHoldDto {
  coin: number;
  foodsId: number | null;
  num: number;
  releaseAt: string;
}

export interface ExchangeSuspiciousSide {
  restId: number;
  restName: string | null;
  accountId: number | null;
  username: string | null;
  /** 这笔成交在这一方名下的冻结记录状态；没有冻结记录为 null */
  hold: 'held' | 'released' | 'confiscated' | null;
}

export interface ExchangeSuspiciousRow {
  tradeId: number;
  at: string;
  foodsId: number;
  price: number;
  ref: number | null;
  qty: number;
  amount: number;
  flags: ExchangeFlag[];
  buyer: ExchangeSuspiciousSide;
  seller: ExchangeSuspiciousSide;
}

export interface ExchangeFrozenRow {
  restId: number;
  restName: string;
  username: string;
  reason: string;
  actor: string | null;
  at: string;
  /** 冻结中的所得合计 */
  heldCoin: number;
  heldFoods: number;
}
```

`ExchangeMeDto` 加：

```ts
  /** 冻结中（冷静期）的所得 */
  holds: ExchangeHoldDto[];
  /** 交易所被冻结时的原因 */
  frozen: { reason: string } | null;
```

`ExchangePlaceDto` 的 `fills` 改成 `Array<{ price: number; qty: number; held: boolean }>`。

- [ ] **Step 4: config**

`tuning.json` 的 `"exchange"` 里，在 `"refOverrides": {}` 前加：

```json
"suspicious": { "traceDays": 30, "edgeHigh": 1.8, "edgeLow": 0.6, "repeatDays": 7, "repeatCount": 3, "largeAmount": 1000000, "holdHours": 24 },
```

`tuning.ts` 的 `exchange` 里加：

```ts
    /** 进阶防作弊（156-2） */
    suspicious: z.object({
      traceDays: int.min(1),
      edgeHigh: z.number().min(1),
      edgeLow: z.number().positive().max(1),
      repeatDays: int.min(1),
      repeatCount: int.min(2),
      largeAmount: int.min(1),
      holdHours: int.min(0),
    }),
```

`setting_docs.json` 按 `tuning.exchange.maxQty` 的写法加叶子说明：

```json
    "tuning.exchange.suspicious.traceDays": "关联账号：看最近几天的登录记录（天）",
    "tuning.exchange.suspicious.edgeHigh": "成交价 ≥ 参考价 × 这个数算价格贴边（倍）",
    "tuning.exchange.suspicious.edgeLow": "成交价 ≤ 参考价 × 这个数算价格贴边（倍）",
    "tuning.exchange.suspicious.repeatDays": "同一对账号几天内反复成交（天）",
    "tuning.exchange.suspicious.repeatCount": "成交（算上这一笔）不少于几次算反复对倒（次）",
    "tuning.exchange.suspicious.largeAmount": "单笔成交额不少于多少算大额（银币）",
    "tuning.exchange.suspicious.holdHours": "可疑成交的所得冻结多久才能取出（小时）",
```

（如果说明测试要求给 `tuning.exchange.suspicious` 这个分组也写一条，按测试补上，记 Ruling。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @dt/config build && pnpm vitest run packages/shared packages/config`
Expected: PASS（服务端 DTO 缺 `holds`、`frozen`、`held` 的类型错误在 Task 3、4 补上）

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(shared,config): 交易所防作弊的区服数值和接口类型"
```

---

### Task 2: 服务端——迁移 0027、关联账号、可疑标记

**Files:**
- Create: `apps/server/src/db/migrations/0027_exchange_guard.ts`（+ `index.ts` 登记）
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/modules/exchange/guard.ts`、`guard.test.ts`

**Interfaces:**
- Produces:
  - `linkedAccounts(db, me: { accountId; ip; deviceId }, others: number[], days, now): Promise<Map<number, 'device' | 'ip'>>`；
  - `tradeFlags(x: { link: 'device' | 'ip' | undefined; price; qty; ref; pairCount: number }, s): ExchangeFlag[]`；
  - `frozenReason(db, restId): Promise<string | null>`。

- [ ] **Step 1: 写失败的测试** `guard.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createAccountRow } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { frozenReason, linkedAccounts, tradeFlags } from './guard';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const s = testConfig().tuning.exchange.suspicious;
async function trace(accountId: number, ip: string, deviceId: string | null) {
  await t.db.insertInto('login_trace').values({ account_id: accountId, ip, device_id: deviceId }).execute();
}

describe('关联账号（156-2 设计 §4.1）', () => {
  it('共用过设备算 device；只共用 IP 算 ip；本次请求的 IP 和设备也算；设备为空不算同设备', async () => {
    const me = await createAccountRow(t.db);
    const dev = await createAccountRow(t.db);
    const ip = await createAccountRow(t.db);
    const now = await createAccountRow(t.db);
    const none = await createAccountRow(t.db);
    const stranger = await createAccountRow(t.db);
    await trace(me, '10.0.0.1', 'device-aaaa1111');
    await trace(me, '10.0.0.9', null);
    await trace(dev, '10.9.9.9', 'device-aaaa1111');
    await trace(ip, '10.0.0.1', 'device-bbbb2222');
    await trace(now, '10.0.0.5', 'device-cccc3333');
    await trace(none, '10.7.7.7', null);
    await trace(stranger, '10.8.8.8', 'device-dddd4444');
    const m = await linkedAccounts(
      t.db,
      { accountId: me, ip: '10.0.0.5', deviceId: null },
      [dev, ip, now, none, stranger],
      s.traceDays,
      new Date(),
    );
    expect(m.get(dev)).toBe('device');
    expect(m.get(ip)).toBe('ip');
    expect(m.get(now)).toBe('ip');
    expect(m.has(none)).toBe(false);
    expect(m.has(stranger)).toBe(false);
  });
});

describe('可疑标记（156-2 设计 §4.2）', () => {
  const base = { link: undefined, price: 1000, qty: 1, ref: 1000, pairCount: 1 };
  it('正常成交没有标记；四种各自触发', () => {
    expect(tradeFlags(base, s)).toEqual([]);
    expect(tradeFlags({ ...base, link: 'ip' }, s)).toEqual(['same_ip']);
    expect(tradeFlags({ ...base, price: 1800 }, s)).toEqual(['edge_price']);
    expect(tradeFlags({ ...base, price: 600 }, s)).toEqual(['edge_price']);
    expect(tradeFlags({ ...base, price: 601 }, s)).toEqual([]);
    expect(tradeFlags({ ...base, pairCount: 3 }, s)).toEqual(['repeat_pair']);
    expect(tradeFlags({ ...base, pairCount: 2 }, s)).toEqual([]);
    expect(tradeFlags({ ...base, price: 1000, qty: 1000 }, s)).toEqual(['large']);
  });
});

describe('冻结检查', () => {
  it('没冻结为 null；冻结返回原因', async () => {
    expect(await frozenReason(t.db, 999_999_999)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/guard.test.ts`
Expected: FAIL（`./guard` 不存在）

- [ ] **Step 3: 迁移** `0027_exchange_guard.ts`

```ts
import { sql, type Kysely } from 'kysely';

/** 156-2：成交记录加账号和可疑标记；冷静期的冻结记录；冻结交易所的店 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table exchange_trade
    add column buyer_account_id integer,
    add column seller_account_id integer,
    add column flags text[] not null default '{}'`.execute(db);
  await sql`create index exchange_trade_pair on exchange_trade (buyer_account_id, seller_account_id, created_at)`.execute(db);
  await sql`create index exchange_trade_flagged on exchange_trade (shard_id, created_at) where flags <> '{}'`.execute(db);
  await sql`
    create table exchange_hold (
      id bigserial primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      trade_id bigint references exchange_trade(id) on delete set null,
      coin bigint not null default 0,
      foods_id integer,
      num integer not null default 0,
      release_at timestamptz not null,
      status text not null check (status in ('held', 'released', 'confiscated')),
      created_at timestamptz not null default now()
    )`.execute(db);
  await sql`create index exchange_hold_rest on exchange_hold (rest_id, status, release_at)`.execute(db);
  await sql`create index exchange_hold_trade on exchange_hold (trade_id)`.execute(db);
  await sql`
    create table exchange_freeze (
      rest_id integer primary key references restaurant(id) on delete cascade,
      reason text not null,
      actor_account_id integer,
      created_at timestamptz not null default now()
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table exchange_freeze`.execute(db);
  await sql`drop table exchange_hold`.execute(db);
  await sql`drop index exchange_trade_flagged`.execute(db);
  await sql`drop index exchange_trade_pair`.execute(db);
  await sql`alter table exchange_trade drop column flags, drop column seller_account_id, drop column buyer_account_id`.execute(db);
}
```

`migrations/index.ts` 登记 `'0027_exchange_guard': m0027`。

`schema.ts`：
- `ExchangeTradeTable` 加三列：

```ts
  buyer_account_id: Nullable<number>;
  seller_account_id: Nullable<number>;
  flags: ColumnType<string[], string[] | undefined, string[]>;
```

- 新表：

```ts
export interface ExchangeHoldTable {
  id: Generated<string>;
  rest_id: number;
  trade_id: string | null;
  coin: ColumnType<string, number | string | undefined, number | string>;
  foods_id: number | null;
  num: Default<number>;
  release_at: Ts;
  status: 'held' | 'released' | 'confiscated';
  created_at: TsDefault;
}
export interface ExchangeFreezeTable {
  rest_id: number;
  reason: string;
  actor_account_id: number | null;
  created_at: TsDefault;
}
```

- `DB` 里登记 `exchange_hold`、`exchange_freeze`。

- [ ] **Step 4: 实现** `guard.ts`

```ts
import type { Kysely } from 'kysely';
import type { ExchangeFlag } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { ExchangeTuning } from './rules';

type Suspicious = ExchangeTuning['suspicious'];

/**
 * 关联账号（156-2 设计 §4.1）：others 里每个账号和我的关系。
 * 共用过设备 → device（撮合时跳过）；只共用过 IP → ip（照常成交、标记）。设备 id 为空的记录不参与设备比对
 */
export async function linkedAccounts(
  db: Kysely<DB>,
  me: { accountId: number; ip: string; deviceId: string | null },
  others: number[],
  days: number,
  now: Date,
): Promise<Map<number, 'device' | 'ip'>> {
  const out = new Map<number, 'device' | 'ip'>();
  const ids = others.filter((x) => x !== me.accountId);
  if (ids.length === 0) return out;
  const since = new Date(now.getTime() - days * 86_400_000);
  const mine = await db
    .selectFrom('login_trace')
    .select(['ip', 'device_id'])
    .where('account_id', '=', me.accountId)
    .where('last_seen', '>=', since)
    .execute();
  const ips = new Set([me.ip, ...mine.map((x) => x.ip)]);
  const devices = new Set(
    [me.deviceId, ...mine.map((x) => x.device_id)].filter((x): x is string => typeof x === 'string' && x !== ''),
  );
  const rows = await db
    .selectFrom('login_trace')
    .select(['account_id', 'ip', 'device_id'])
    .where('account_id', 'in', ids)
    .where('last_seen', '>=', since)
    .execute();
  for (const r of rows) {
    if (r.device_id && devices.has(r.device_id)) out.set(r.account_id, 'device');
    else if (ips.has(r.ip) && out.get(r.account_id) !== 'device') out.set(r.account_id, 'ip');
  }
  return out;
}

/** 一笔成交的可疑标记（156-2 设计 §4.2）；pairCount 是这对账号近 repeatDays 天的成交笔数，算上这一笔 */
export function tradeFlags(
  x: { link: 'device' | 'ip' | undefined; price: number; qty: number; ref: number; pairCount: number },
  s: Suspicious,
): ExchangeFlag[] {
  const out: ExchangeFlag[] = [];
  if (x.link === 'ip') out.push('same_ip');
  if (x.price >= x.ref * s.edgeHigh || x.price <= x.ref * s.edgeLow) out.push('edge_price');
  if (x.pairCount >= s.repeatCount) out.push('repeat_pair');
  if (x.price * x.qty >= s.largeAmount) out.push('large');
  return out;
}

/** 店的交易所是否被冻结；冻结时返回原因 */
export async function frozenReason(db: Kysely<DB>, restId: number): Promise<string | null> {
  const r = await db.selectFrom('exchange_freeze').select('reason').where('rest_id', '=', restId).executeTakeFirst();
  return r?.reason ?? null;
}
```

（`login_trace` 的 `last_seen` 列名以 schema.ts 为准。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange apps/server/src/db`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): 交易所关联账号和可疑标记；迁移 0027"
```

---

### Task 3: 服务端——撮合里的跳过、标记和冷静期

**Files:**
- Modify: `apps/server/src/modules/exchange/service.ts`（`place`）
- Test: `apps/server/src/modules/exchange/guard-place.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `linkedAccounts`、`tradeFlags`、`frozenReason`
- Produces: `addHold(tx, restId, tradeId, coin, foodsId, num, releaseAt)`（`guard.ts` 导出）；`fills[].held`

- [ ] **Step 1: 写失败的测试** `guard-place.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};
async function trace(accountId: number, ip: string, deviceId: string | null) {
  await t.db.insertInto('login_trace').values({ account_id: accountId, ip, device_id: deviceId }).execute();
}
const holds = (restId: number) =>
  t.db.selectFrom('exchange_hold').select(['coin', 'foods_id', 'num', 'status']).where('rest_id', '=', restId).execute();
const lastTrade = (shardId: number) =>
  t.db.selectFrom('exchange_trade').select(['flags', 'buyer_account_id', 'seller_account_id']).where('shard_id', '=', shardId).orderBy('id', 'desc').executeTakeFirstOrThrow();

describe('撮合里的防作弊（156-2 设计 §4、§5）', () => {
  it('同设备的挂单跳过（挂单还在）；同 IP 照常成交、标记 same_ip、双方所得进冻结', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 2 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await trace(s.accountId, '10.1.1.1', 'dev-same-0001');
    await trace(b.accountId, '10.2.2.2', 'dev-same-0001');
    const r1 = await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(r1.data.fills).toEqual([]);

    const b2 = await trader(t, { shardId, coin: 1_000_000 });
    await trace(b2.accountId, '10.1.1.1', 'dev-other-0002');
    const r2 = await svc().place(b2, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(r2.data.fills).toEqual([{ price: f.coin, qty: 1, held: true }]);
    expect((await lastTrade(shardId)).flags).toEqual(['same_ip']);
    // 吃单方（买方）的食材不当场到账，进冻结；卖方银币进冻结，不进可用余额
    expect(await have(b2.restaurantId, f.id)).toBe(0);
    expect(await holds(b2.restaurantId)).toEqual([{ coin: '0', foods_id: f.id, num: 1, status: 'held' }]);
    const fee = Math.floor(f.coin * 0.05);
    expect(await holds(s.restaurantId)).toEqual([{ coin: String(f.coin - fee), foods_id: null, num: 0, status: 'held' }]);
    expect(await wallet(t, s.restaurantId)).toEqual({ coin: 0, foods: {} });
  });

  it('吃单方是买单、可疑成交：差价照常退，所得进冻结', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await trace(s.accountId, '10.3.3.3', null);
    await trace(b.accountId, '10.3.3.3', null);
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin + 100, qty: 1 });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000 - f.coin);
    expect(await holds(b.restaurantId)).toEqual([{ coin: '0', foods_id: f.id, num: 1, status: 'held' }]);
  });

  it('吃单方是卖单、可疑成交：银币不当场到账；挂单方买家的食材进冻结', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: Math.floor(f.coin * 1.9), qty: 1 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const r = await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    expect(r.data.fills[0]!.held).toBe(true);
    expect((await lastTrade(shardId)).flags).toEqual(['edge_price']);
    expect((await restRow(t, s.restaurantId)).coin).toBe(0);
    expect((await holds(s.restaurantId))[0]!.status).toBe('held');
    expect(await holds(b.restaurantId)).toEqual([{ coin: '0', foods_id: f.id, num: 1, status: 'held' }]);
    expect(await wallet(t, b.restaurantId)).toEqual({ coin: 0, foods: {} });
  });

  it('反复对倒按账号累计（同一次下单里的几笔也算），不分方向；记下双方账号', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const a = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    const b = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    await svc().place(a, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 }); // 第 1 笔：b 买 a
    await svc().place(a, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    await svc().place(a, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    const r = await svc().place(b, { foodsId: f.id, side: 'sell', price: f.coin, qty: 2 }); // 第 2、3 笔：a 买 b
    expect(r.data.fills.map((x) => x.held)).toEqual([false, true]);
    const tr = await lastTrade(shardId);
    expect(tr.flags).toEqual(['repeat_pair']);
    expect([tr.buyer_account_id, tr.seller_account_id]).toEqual([a.accountId, b.accountId]);
  });

  it('没有标记的成交照常到账', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const r = await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(r.data.fills).toEqual([{ price: f.coin, qty: 1, held: false }]);
    expect(await have(b.restaurantId, f.id)).toBe(1);
    expect(await holds(b.restaurantId)).toEqual([]);
  });

  it('被冻结的店不能下单', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId });
    await t.db.insertInto('exchange_freeze').values({ rest_id: r.restaurantId, reason: '对倒' }).execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      params: { reason: 'exchange_frozen' },
    });
  });
});
```

（`trader()` 会注册新店；`newRestaurant` 返回的 ctx 里 `ip` 是 `127.0.0.1`、`deviceId` 是 null。所有店的请求 IP 一样，所以 `linkedAccounts` 把"本次请求的 IP"加进集合后，会让所有测试里的成交都变成 `same_ip`。处理方法是测试店用不同的请求 IP：`trader()` 在返回前把 `ip` 改成 `10.99.<随机>.<随机>`。这一步写进 `test.ts` 的 `trader`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/guard-place.test.ts`
Expected: FAIL

- [ ] **Step 3: 测试工具**（`test.ts` 的 `trader`）

`return r;` 改成：

```ts
  // 每家测试店用不同的请求 IP：撮合会把"本次请求的 IP"算进关联判定（156-2）
  return { ...r, ip: `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` };
```

- [ ] **Step 4: 实现**

`guard.ts` 追加：

```ts
/** 冷静期的冻结记录（156-2 设计 §5） */
export async function addHold(
  db: Kysely<DB>,
  h: { restId: number; tradeId: string; coin: number; foodsId: number | null; num: number; releaseAt: Date },
): Promise<void> {
  await db
    .insertInto('exchange_hold')
    .values({
      rest_id: h.restId,
      trade_id: h.tradeId,
      coin: h.coin,
      foods_id: h.foodsId,
      num: h.num,
      release_at: h.releaseAt,
      status: 'held',
    })
    .execute();
}
```

`service.ts` 的 `place`：

1. 开头（门槛检查之前）：

```ts
    const frozen = await frozenReason(o.tx, o.rest.id);
    if (frozen !== null) throw invalidState('exchange_frozen', { why: frozen });
```

2. 读出 `book` 之后、循环之前：

```ts
    // 关联账号（156-2 设计 §4.1）：挂单方的账号和我共用过设备就跳过，只共用 IP 就标记
    const s = t.suspicious;
    const accOf = new Map<number, number>();
    if (book.length > 0) {
      const rs = await o.tx
        .selectFrom('restaurant')
        .select(['id', 'account_id'])
        .where('id', 'in', [...new Set(book.map((m) => m.rest_id))])
        .execute();
      for (const r of rs) accOf.set(r.id, r.account_id);
    }
    const links = await linkedAccounts(
      o.tx,
      { accountId: o.rest.account_id, ip: o.ctx?.ip ?? '', deviceId: o.ctx?.deviceId ?? null },
      [...new Set(accOf.values())],
      s.traceDays,
      o.now,
    );
    const pairSince = new Date(o.now.getTime() - s.repeatDays * 86_400_000);
    const releaseAt = new Date(o.now.getTime() + s.holdHours * 3_600_000);
```

3. 循环开头（`if (left === 0) break;` 之后）：

```ts
      const makerAcc = accOf.get(m.rest_id)!;
      const link = links.get(makerAcc);
      if (link === 'device') continue;
```

4. 写成交之前，算标记：

```ts
      const pair = await o.tx
        .selectFrom('exchange_trade')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('created_at', '>=', pairSince)
        .where((eb) =>
          eb.or([
            eb.and([eb('buyer_account_id', '=', o.rest.account_id), eb('seller_account_id', '=', makerAcc)]),
            eb.and([eb('buyer_account_id', '=', makerAcc), eb('seller_account_id', '=', o.rest.account_id)]),
          ]),
        )
        .executeTakeFirstOrThrow();
      const flags = tradeFlags({ link, price, qty: n, ref, pairCount: Number(pair.n) + 1 }, s);
      const held = flags.length > 0;
```

5. 写成交的 `values` 里加：

```ts
          buyer_account_id: buy === order ? o.rest.account_id : makerAcc,
          seller_account_id: sell === order ? o.rest.account_id : makerAcc,
          flags,
```

并把 `.execute()` 改成 `.returning('id').executeTakeFirstOrThrow()`，结果存为 `trade`。

6. 挂单方入账改成：

```ts
      const makerCoin = m.side === 'sell' ? price * n - fee : 0;
      const makerFoods = m.side === 'buy' ? n : 0;
      if (held)
        await addHold(o.tx, {
          restId: m.rest_id,
          tradeId: trade.id,
          coin: makerCoin,
          foodsId: makerFoods > 0 ? b.foodsId : null,
          num: makerFoods,
          releaseAt,
        });
      else if (m.side === 'sell') addCredit(credits, m.rest_id, makerCoin);
      else addCredit(credits, m.rest_id, 0, b.foodsId, n);
```

挂单方的日志参数加 `held`。

7. 吃单方到账改成：

```ts
      if (b.side === 'buy') {
        if (b.price > price) gainCoin(o, (b.price - price) * n, { source: 'exchange' });
        if (held)
          await addHold(o.tx, { restId: o.rest.id, tradeId: trade.id, coin: 0, foodsId: b.foodsId, num: n, releaseAt });
        else {
          const plan = await addFoods(o, b.foodsId, n, { source: 'exchange', keepDropped: true });
          if (plan.dropped > 0) addCredit(credits, o.rest.id, 0, b.foodsId, plan.dropped);
        }
      } else if (held)
        await addHold(o.tx, { restId: o.rest.id, tradeId: trade.id, coin: price * n - fee, foodsId: null, num: 0, releaseAt });
      else gainCoin(o, price * n - fee, { source: 'exchange' });
      fills.push({ price, qty: n, held });
```

8. `exchange.order` 日志参数加 `held: fills.some((x) => x.held)`。

（import 补齐 `addHold`、`frozenReason`、`linkedAccounts`、`tradeFlags`。`ref` 是前面已经算好的当天参考价。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange && pnpm --filter @dt/server typecheck`
Expected: PASS（`me` 缺 `holds`、`frozen` 的类型错误留到 Task 4）

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): 交易所撮合跳过同设备、标记可疑成交、冷静期"
```

---

### Task 4: 服务端——取出解冻、冻结和没收、后台路由

**Files:**
- Modify: `apps/server/src/modules/exchange/service.ts`（`withdraw`、`me`）
- Create: `apps/server/src/modules/exchange/admin.ts`、`admin.test.ts`
- Modify: `apps/server/src/modules/admin/routes.ts`、`apps/server/src/modules/admin/permissions.test.ts`

**Interfaces:**
- Consumes: Task 2、3
- Produces：
  - `createExchangeAdmin(game)`，含 `suspicious(shardId, flag?)`、`frozen(shardId)`、`freeze(actor, b)`、`unfreeze(actor, b)`、`confiscate(actor, b)`；
  - 路由：
    - `GET /admin/suspicious/exchange`、`GET /admin/exchange/frozen`（mod）；
    - `POST /admin/exchange/freeze`、`POST /admin/exchange/unfreeze`（mod）；
    - `POST /admin/exchange/confiscate`（admin）。

- [ ] **Step 1: 写失败的测试** `admin.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, type TestGame } from '../../../test/game';
import { createExchangeAdmin } from './admin';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const admin = () => createExchangeAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'admin' as const };
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;
const H = 3_600_000;

/** 造一笔大额可疑成交：卖方 s、买方 b，返回成交 id */
async function flaggedTrade(shardId: number) {
  const f = rare();
  const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 999 } });
  const qty = Math.ceil(1_000_000 / f.coin);
  await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty });
  const b = await trader(t, { shardId, coin: 100_000_000 });
  await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty });
  const tr = await t.db.selectFrom('exchange_trade').select('id').where('shard_id', '=', shardId).executeTakeFirstOrThrow();
  return { f, s, b, qty, tradeId: Number(tr.id) };
}

describe('冷静期取出（156-2 设计 §5）', () => {
  it('冻结中取不出；到时间取出转进可用余额；me 显示冻结中的记录', async () => {
    const shardId = await createShard(t.db);
    const { f, s, b, qty } = await flaggedTrade(shardId);
    expect((await svc().me(s)).holds).toHaveLength(1);
    const w1 = await svc().withdraw(b);
    expect(w1.data.foods).toEqual([]);
    const back = t.clock.now;
    t.clock.set(new Date(back.getTime() + 25 * H));
    try {
      const w2 = await svc().withdraw(b);
      expect(w2.data.foods).toEqual([{ foodsId: f.id, num: qty }]);
      expect((await svc().me(b)).holds).toEqual([]);
      const net = f.coin * qty - Math.floor(f.coin * qty * 0.05);
      expect((await svc().withdraw(s)).data.coin).toBe(net);
    } finally {
      t.clock.set(back);
    }
  });
});

describe('冻结和没收（156-2 设计 §6）', () => {
  it('冻结：撤掉全部挂单、剩余退进账户；下单和取出报 exchange_frozen；解冻恢复', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 3 });
    await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 2 });
    await admin().freeze(actor, { restId: r.restaurantId, reason: '对倒' });
    expect((await svc().me(r)).orders).toEqual([]);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: f.coin * 2, foods: { [f.id]: 3 } });
    expect((await svc().me(r)).frozen).toEqual({ reason: '对倒' });
    await expect(svc().withdraw(r)).rejects.toMatchObject({ params: { reason: 'exchange_frozen' } });
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject({
      params: { reason: 'exchange_frozen' },
    });
    await admin().unfreeze(actor, { restId: r.restaurantId });
    await svc().withdraw(r);
    expect((await foodNum(t, r.restaurantId, f.id)).num).toBe(10);
    const audit = await t.db.selectFrom('audit_log').select('action').where('target', '=', `rest:${r.restaurantId}`).execute();
    expect(audit.map((x) => x.action).sort()).toEqual(['exchange.freeze', 'exchange.unfreeze']);
  });

  it('按成交没收：双方冻结中的都没收，之后取不出；已解冻的不受影响；按店没收全部', async () => {
    const shardId = await createShard(t.db);
    const { s, b, tradeId } = await flaggedTrade(shardId);
    const res = await admin().confiscate(actor, { tradeId });
    expect(res.count).toBe(2);
    const st = await t.db.selectFrom('exchange_hold').select('status').where('trade_id', '=', String(tradeId)).execute();
    expect(st.map((x) => x.status)).toEqual(['confiscated', 'confiscated']);
    const back = t.clock.now;
    t.clock.set(new Date(back.getTime() + 25 * H));
    try {
      expect((await svc().withdraw(s)).data.coin).toBe(0);
      expect((await svc().withdraw(b)).data.foods).toEqual([]);
    } finally {
      t.clock.set(back);
    }
    const two = await flaggedTrade(shardId);
    await t.db.updateTable('exchange_hold').set({ status: 'released' }).where('rest_id', '=', two.b.restaurantId).execute();
    const r2 = await admin().confiscate(actor, { restId: two.b.restaurantId });
    expect(r2.count).toBe(0);
    const r3 = await admin().confiscate(actor, { restId: two.s.restaurantId });
    expect(r3.count).toBe(1);
  });

  it('可疑成交列表：按区服、按标记筛选，带双方信息和冻结状态；冻结名单', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const { s, b, tradeId } = await flaggedTrade(shardId);
    await flaggedTrade(other);
    const rows = await admin().suspicious(shardId);
    expect(rows.map((x) => x.tradeId)).toEqual([tradeId]);
    expect(rows[0]).toMatchObject({
      flags: ['large'],
      buyer: { restId: b.restaurantId, hold: 'held' },
      seller: { restId: s.restaurantId, hold: 'held' },
    });
    expect(await admin().suspicious(shardId, 'same_ip')).toEqual([]);
    await admin().freeze(actor, { restId: s.restaurantId, reason: '大额' });
    const frozen = await admin().frozen(shardId);
    expect(frozen).toEqual([expect.objectContaining({ restId: s.restaurantId, reason: '大额', heldFoods: 0 })]);
    expect(frozen[0]!.heldCoin).toBeGreaterThan(0);
  });
});
```

`permissions.test.ts` 的 `CASES`：
- 把 `['bar', 'surge', 'multi', 'redeem']` 改成加上 `'exchange'`；
- 再加：

```ts
  {
    method: 'GET',
    route: '/api/v1/admin/exchange/frozen',
    url: () => `/api/v1/admin/exchange/frozen?shardId=${ids.shardId}`,
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/exchange/freeze',
    url: () => '/api/v1/admin/exchange/freeze',
    body: () => ({ restId: ids.restId, reason: '权限测试' }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/exchange/unfreeze',
    url: () => '/api/v1/admin/exchange/unfreeze',
    body: () => ({ restId: ids.restId }),
    min: 'mod',
  },
  {
    method: 'POST',
    route: '/api/v1/admin/exchange/confiscate',
    url: () => '/api/v1/admin/exchange/confiscate',
    body: () => ({ restId: ids.restId }),
    min: 'admin',
  },
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/src/modules/exchange/admin.test.ts apps/server/src/modules/admin/permissions.test.ts`
Expected: FAIL

- [ ] **Step 3: 取出和 `me`**（`service.ts`）

`withdraw` 开头：

```ts
    const frozen = await frozenReason(o.tx, o.rest.id);
    if (frozen !== null) throw invalidState('exchange_frozen', { why: frozen });
    // 冷静期到了的冻结记录先转进可用余额（156-2 设计 §5）
    const due = await o.tx
      .updateTable('exchange_hold')
      .set({ status: 'released' })
      .where('rest_id', '=', o.rest.id)
      .where('status', '=', 'held')
      .where('release_at', '<=', o.now)
      .returning(['coin', 'foods_id', 'num'])
      .execute();
    if (due.length > 0) {
      const c = newCredits();
      for (const h of due) addCredit(c, o.rest.id, Number(h.coin), h.foods_id ?? undefined, h.num);
      await creditWallets(o.tx, c);
    }
```

`me` 的返回对象加：

```ts
      holds: (
        await d.db
          .selectFrom('exchange_hold')
          .select(['coin', 'foods_id', 'num', 'release_at'])
          .where('rest_id', '=', ctx.restaurantId)
          .where('status', '=', 'held')
          .orderBy('release_at')
          .execute()
      ).map((h) => ({ coin: Number(h.coin), foodsId: h.foods_id, num: h.num, releaseAt: h.release_at.toISOString() })),
      frozen: await (async () => {
        const r = await frozenReason(d.db, ctx.restaurantId);
        return r === null ? null : { reason: r };
      })(),
```

- [ ] **Step 4: 后台服务** `admin.ts`

```ts
import { sql } from 'kysely';
import type {
  ExchangeFlag,
  ExchangeFrozenRow,
  ExchangeSuspiciousRow,
  ExchangeSuspiciousSide,
} from '@dt/shared';
import type { Game } from '../../game';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { bookLock } from './service';
import { addCredit, creditWallets, newCredits } from './wallet';

const KEEP_DAYS = 7;
const LIMIT = 200;

/** 交易所后台（156-2 设计 §6、§7）：可疑成交列表、冻结名单、冻结、解冻、没收 */
export function createExchangeAdmin(game: Game) {
  const db = game.app.db;

  async function suspicious(shardId: number, flag?: ExchangeFlag): Promise<ExchangeSuspiciousRow[]> {
    const since = new Date(game.deps.now().getTime() - KEEP_DAYS * 86_400_000);
    let q = db
      .selectFrom('exchange_trade as t')
      .leftJoin('restaurant as rb', 'rb.id', 't.buyer_rest_id')
      .leftJoin('restaurant as rs', 'rs.id', 't.seller_rest_id')
      .leftJoin('account as ab', 'ab.id', 't.buyer_account_id')
      .leftJoin('account as as', 'as.id', 't.seller_account_id')
      .leftJoin('exchange_ref as r', (j) =>
        j
          .onRef('r.shard_id', '=', 't.shard_id')
          .onRef('r.foods_id', '=', 't.foods_id')
          .on('r.day', '=', sql<string>`(t.created_at at time zone 'Asia/Shanghai')::date`),
      )
      .select([
        't.id',
        't.created_at',
        't.foods_id',
        't.price',
        't.qty',
        't.flags',
        't.buyer_rest_id',
        't.seller_rest_id',
        't.buyer_account_id',
        't.seller_account_id',
        'rb.name as buyer_name',
        'rs.name as seller_name',
        'ab.username as buyer_user',
        'as.username as seller_user',
        'r.price as ref',
      ])
      .where('t.shard_id', '=', shardId)
      .where('t.created_at', '>=', since)
      .where(sql<boolean>`t.flags <> '{}'`);
    if (flag) q = q.where(sql<boolean>`${flag} = any(t.flags)`);
    const rows = await q.orderBy('t.id', 'desc').limit(LIMIT).execute();
    const holds = rows.length
      ? await db
          .selectFrom('exchange_hold')
          .select(['trade_id', 'rest_id', 'status'])
          .where('trade_id', 'in', rows.map((r) => r.id))
          .execute()
      : [];
    const holdOf = (tradeId: string, restId: number) =>
      holds.find((h) => h.trade_id === tradeId && h.rest_id === restId)?.status ?? null;
    const side = (
      restId: number,
      name: string | null,
      accountId: number | null,
      username: string | null,
      tradeId: string,
    ): ExchangeSuspiciousSide => ({ restId, restName: name, accountId, username, hold: holdOf(tradeId, restId) });
    return rows.map((r) => ({
      tradeId: Number(r.id),
      at: r.created_at.toISOString(),
      foodsId: r.foods_id,
      price: r.price,
      ref: r.ref ?? null,
      qty: r.qty,
      amount: r.price * r.qty,
      flags: r.flags as ExchangeFlag[],
      buyer: side(r.buyer_rest_id, r.buyer_name, r.buyer_account_id, r.buyer_user, r.id),
      seller: side(r.seller_rest_id, r.seller_name, r.seller_account_id, r.seller_user, r.id),
    }));
  }

  async function frozen(shardId: number): Promise<ExchangeFrozenRow[]> {
    const rows = await db
      .selectFrom('exchange_freeze as f')
      .innerJoin('restaurant as r', 'r.id', 'f.rest_id')
      .innerJoin('account as a', 'a.id', 'r.account_id')
      .leftJoin('account as x', 'x.id', 'f.actor_account_id')
      .select([
        'f.rest_id',
        'r.name',
        'a.username',
        'f.reason',
        'x.username as actor',
        'f.created_at',
        sql<string>`(select coalesce(sum(h.coin), 0) from exchange_hold h where h.rest_id = f.rest_id and h.status = 'held')`.as('held_coin'),
        sql<string>`(select coalesce(sum(h.num), 0) from exchange_hold h where h.rest_id = f.rest_id and h.status = 'held')`.as('held_foods'),
      ])
      .where('r.shard_id', '=', shardId)
      .orderBy('f.created_at', 'desc')
      .execute();
    return rows.map((r) => ({
      restId: r.rest_id,
      restName: r.name,
      username: r.username,
      reason: r.reason,
      actor: r.actor ?? null,
      at: r.created_at.toISOString(),
      heldCoin: Number(r.held_coin),
      heldFoods: Number(r.held_foods),
    }));
  }

  /** 冻结：写名单，撤掉全部挂单（剩余退进交易所账户，盘口按食材 id 顺序加锁） */
  async function freeze(actor: AdminActor, b: { restId: number; reason: string }) {
    const now = game.deps.now();
    await db.transaction().execute(async (tx) => {
      const rest = await tx.selectFrom('restaurant').select('shard_id').where('id', '=', b.restId).executeTakeFirstOrThrow();
      await tx
        .insertInto('exchange_freeze')
        .values({ rest_id: b.restId, reason: b.reason, actor_account_id: actor.accountId })
        .onConflict((oc) => oc.column('rest_id').doUpdateSet({ reason: b.reason, actor_account_id: actor.accountId }))
        .execute();
      const open = await tx
        .selectFrom('exchange_order')
        .select('foods_id')
        .distinct()
        .where('rest_id', '=', b.restId)
        .where('status', '=', 'open')
        .orderBy('foods_id')
        .execute();
      const c = newCredits();
      for (const { foods_id } of open) {
        await bookLock(tx, rest.shard_id, foods_id);
        const rows = await tx
          .updateTable('exchange_order')
          .set({ status: 'cancelled', closed_at: now })
          .where('rest_id', '=', b.restId)
          .where('foods_id', '=', foods_id)
          .where('status', '=', 'open')
          .returning(['side', 'price', 'qty', 'filled'])
          .execute();
        for (const r of rows) {
          const left = r.qty - r.filled;
          if (r.side === 'buy') addCredit(c, b.restId, r.price * left);
          else addCredit(c, b.restId, 0, foods_id, left);
        }
      }
      await creditWallets(tx, c);
      await writeAudit(tx, { actor, action: 'exchange.freeze', target: `rest:${b.restId}`, detail: { reason: b.reason } });
    });
    return { ok: true as const };
  }

  async function unfreeze(actor: AdminActor, b: { restId: number }) {
    await db.transaction().execute(async (tx) => {
      await tx.deleteFrom('exchange_freeze').where('rest_id', '=', b.restId).execute();
      await writeAudit(tx, { actor, action: 'exchange.unfreeze', target: `rest:${b.restId}` });
    });
    return { ok: true as const };
  }

  /** 没收冻结中的所得：按成交（双方）或按店（全部）；已解冻的不追回 */
  async function confiscate(actor: AdminActor, b: { tradeId: number } | { restId: number }) {
    return db.transaction().execute(async (tx) => {
      let q = tx.updateTable('exchange_hold').set({ status: 'confiscated' }).where('status', '=', 'held');
      q = 'tradeId' in b ? q.where('trade_id', '=', String(b.tradeId)) : q.where('rest_id', '=', b.restId);
      const rows = await q.returning(['coin', 'num']).execute();
      const coin = rows.reduce((s, r) => s + Number(r.coin), 0);
      const foods = rows.reduce((s, r) => s + r.num, 0);
      await writeAudit(tx, {
        actor,
        action: 'exchange.confiscate',
        target: 'tradeId' in b ? `exchange_trade:${b.tradeId}` : `rest:${b.restId}`,
        detail: { coin, foods, count: rows.length },
      });
      return { count: rows.length, coin, foods };
    });
  }

  return { suspicious, frozen, freeze, unfreeze, confiscate };
}
```

（`AdminActor` 的导出位置以 `admin/access.ts` 为准，`writeAudit` 接受事务。参考价按北京时间的日期关联；时区写法和 `gameDay` 不一致时，改用 `gameDay` 在 JS 里逐行查参考价，记 Ruling。）

`admin/routes.ts` 在 `/suspicious/redeem` 之后加：

```ts
    const exchangeAdmin = createExchangeAdmin(game);
    r.get('/suspicious/exchange', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(exchangeSuspiciousQuery, req.query);
      return ok(await exchangeAdmin.suspicious(q.shardId, q.flag));
    });
    r.get('/exchange/frozen', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.frozen(parse(suspiciousQuery, req.query).shardId));
    });
    r.post('/exchange/freeze', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.freeze(a, parse(exchangeFreezeBody, req.body)));
    });
    r.post('/exchange/unfreeze', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.unfreeze(a, parse(exchangeUnfreezeBody, req.body)));
    });
    r.post('/exchange/confiscate', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await exchangeAdmin.confiscate(a, parse(exchangeConfiscateBody, req.body)));
    });
```

（import 补齐。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run apps/server/src/modules/exchange apps/server/src/modules/admin && pnpm --filter @dt/server typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): 交易所冷静期取出、冻结、没收和后台路由"
```

---

### Task 5: 前端——交易所页的冻结、冷静期和日志

**Files:**
- Modify: `apps/web/src/views/ExchangeView.vue`、`ExchangeView.test.ts`
- Modify: `apps/web/src/utils/events.ts`、`events.test.ts`、`apps/web/src/i18n/zh-CN.ts`

- [ ] **Step 1: 写失败的测试**

`ExchangeView.test.ts` 追加（夹具 `me()` 里补 `holds: []`、`frozen: null`）：

```ts
describe('交易所页的防作弊提示（156-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [{ id: 11, name: '松露', level: 6 }],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(endpoints.tradeFoods).mockResolvedValue([{ foodsId: 11, ref: 1000, last: null, changePct: null }]);
    vi.mocked(endpoints.tradeBook).mockResolvedValue(book);
  });

  it('被冻结：顶部提示原因，下单和取出禁用', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me({ frozen: { reason: '对倒' } }));
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="ex-frozen"]').text()).toContain('对倒');
    expect(w.find('[data-testid="ex-submit"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ex-withdraw"]').attributes('disabled')).toBeDefined();
  });

  it('冻结中的所得：显示金额和最早解冻时间', async () => {
    const at = new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString();
    vi.mocked(endpoints.tradeMe).mockResolvedValue(
      me({
        holds: [
          { coin: 1200, foodsId: null, num: 0, releaseAt: at },
          { coin: 0, foodsId: 11, num: 2, releaseAt: at },
        ],
      }),
    );
    const w = mount(ExchangeView);
    await flushPromises();
    const text = w.find('[data-testid="ex-holds"]').text();
    expect(text).toContain('1,200');
    expect(text).toContain('松露×2');
    expect(text).toContain('还剩 5 小时');
  });

  it('下单有可疑成交时提示所得冻结', async () => {
    vi.mocked(endpoints.tradeMe).mockResolvedValue(me());
    vi.mocked(endpoints.tradePlace).mockResolvedValue({
      order: me().orders[0]!,
      fills: [{ price: 1010, qty: 2, held: true }],
    } as never);
    const w = mount(ExchangeView);
    await flushPromises();
    await w.find('[data-testid="ex-food-11"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ex-price"]').setValue('1010');
    await w.find('[data-testid="ex-qty"]').setValue('2');
    await w.find('[data-testid="ex-submit"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.text)).toContain('已成交 2 个，其中有可疑成交，所得冻结 24 小时');
  });
});
```

`events.test.ts` 的交易所日志用例追加一行：

```ts
    expect(log('exchange.fill', { side: 'buy', foodsId: 3, price: 100, qty: 2, fee: 0, held: true })).toBe(
      '交易所买单成交：食材3 ×2，单价 100（可疑成交，所得冻结 24 小时）',
    );
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/views/ExchangeView.test.ts apps/web/src/utils/events.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`ExchangeView.vue`：
- `blocked` 计算属性最前面加：`if (me.value?.frozen) return '交易所已被冻结';`
- 模板 `<h5>交易所</h5>` 后加：

```vue
  <div v-if="me?.frozen" class="alert alert-danger py-1 small" data-testid="ex-frozen">
    你的交易所已被冻结：{{ me.frozen.reason }}。有疑问请联系管理员。
  </div>
```

- "全部取出"按钮的 `:disabled` 加 `|| !!me.frozen`。
- 账户卡片下面加：

```vue
    <div v-if="me.holds.length > 0" class="small text-muted mb-3" data-testid="ex-holds">
      冻结中（可疑成交的冷静期）：{{ holdText }}，{{ timeLeft(me.holds[0]!.releaseAt) }}，到时可取
    </div>
```

- 脚本加：

```ts
import { timeLeft } from '../utils/activity';
const holdText = computed(() => {
  if (!me.value) return '';
  const coin = me.value.holds.reduce((s, h) => s + h.coin, 0);
  const foods = new Map<number, number>();
  for (const h of me.value.holds) if (h.foodsId !== null && h.num > 0) foods.set(h.foodsId, (foods.get(h.foodsId) ?? 0) + h.num);
  return [
    ...(coin > 0 ? [`银币 ${formatNum(coin)}`] : []),
    ...[...foods].map(([id, n]) => `${catalog.foodName(id)}×${n}`),
  ].join('、');
});
```

- 下单成功提示改成：

```ts
      const fills = (r as { fills: Array<{ qty: number; held: boolean }> }).fills;
      const n = fills.reduce((s, x) => s + x.qty, 0);
      if (n === 0) return '已挂单';
      const held = fills.some((x) => x.held) ? '，其中有可疑成交，所得冻结 24 小时' : '';
      return `已成交 ${n} 个${n < b.qty ? '，其余挂单中' : ''}${held}`;
```

`events.ts`：
- 定义 `const heldNote = (p: P) => (p.held ? '（可疑成交，所得冻结 24 小时）' : '')`；
- `exchange.fill` 的两种文案：买单把结尾的"（食材在交易所账户）"换成 `${p.held ? heldNote(p) : '（食材在交易所账户）'}`；卖单把"（所得在交易所账户）"同样处理；
- `exchange.order` 末尾加 `${heldNote(p)}`。

`zh-CN.ts` 的 `STATE` 加 `exchange_frozen: '交易所已被冻结，有疑问请联系管理员'`。带原因时用专门分支，放在已有的 `INVALID_STATE` 专门分支旁边：

```ts
  if (code === 'INVALID_STATE' && params.reason === 'exchange_frozen' && typeof params.why === 'string')
    return `交易所已被冻结：${params.why}。有疑问请联系管理员`;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web && pnpm --filter @dt/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 交易所页的冻结提示、冷静期和可疑成交提示"
```

---

### Task 6: 前端——后台"交易所"标签

**Files:**
- Modify: `apps/web/src/api/admin.ts`
- Create: `apps/web/src/components/admin/ExchangeGuardPanel.vue`、`ExchangeGuardPanel.test.ts`
- Modify: `apps/web/src/views/admin/AdminSuspiciousView.vue`（标签 `exchange`）

- [ ] **Step 1: 写失败的测试** `ExchangeGuardPanel.test.ts`

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExchangeSuspiciousRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import ExchangeGuardPanel from './ExchangeGuardPanel.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    suspiciousExchange: vi.fn(),
    exchangeFrozen: vi.fn(),
    exchangeFreeze: vi.fn(),
    exchangeUnfreeze: vi.fn(),
    exchangeConfiscate: vi.fn(),
  },
}));

const row: ExchangeSuspiciousRow = {
  tradeId: 9,
  at: '2026-10-02T00:00:00Z',
  foodsId: 11,
  price: 1900,
  ref: 1000,
  qty: 3,
  amount: 5700,
  flags: ['edge_price', 'same_ip'],
  buyer: { restId: 1, restName: '甲店', accountId: 11, username: 'alice', hold: 'held' },
  seller: { restId: 2, restName: '乙店', accountId: 12, username: 'bob', hold: 'held' },
};

describe('后台交易所标签（156-2 设计 §7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useCatalogStore().apply({ version: 'x', goods: [], foods: [{ id: 11, name: '松露', level: 6 }], streets: [], weather: [], devices: [] } as never);
    vi.mocked(adminApi.suspiciousExchange).mockResolvedValue([row]);
    vi.mocked(adminApi.exchangeFrozen).mockResolvedValue([
      { restId: 5, restName: '丙店', username: 'carl', reason: '对倒', actor: 'boss', at: '2026-10-02T00:00:00Z', heldCoin: 100, heldFoods: 0 },
    ]);
  });

  it('列表显示标记中文、双方、冻结状态；按标记筛选', async () => {
    useAdminStore().me = { accountId: 1, username: 'm', role: 'mod' };
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    const tr = w.find('[data-testid="exg-row-9"]');
    expect(tr.text()).toContain('价格贴边');
    expect(tr.text()).toContain('同 IP');
    expect(tr.text()).toContain('甲店');
    expect(tr.text()).toContain('冻结中');
    await w.find('[data-testid="exg-flag"]').setValue('large');
    await flushPromises();
    expect(adminApi.suspiciousExchange).toHaveBeenLastCalledWith(1, 'large');
  });

  it('协管：能冻结、能解冻，看不到没收按钮', async () => {
    useAdminStore().me = { accountId: 1, username: 'm', role: 'mod' };
    vi.spyOn(window, 'prompt').mockReturnValue('对倒');
    vi.mocked(adminApi.exchangeFreeze).mockResolvedValue({ ok: true } as never);
    vi.mocked(adminApi.exchangeUnfreeze).mockResolvedValue({ ok: true } as never);
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    expect(w.find('[data-testid="exg-confiscate-9"]').exists()).toBe(false);
    await w.find('[data-testid="exg-freeze-seller-9"]').trigger('click');
    await flushPromises();
    expect(adminApi.exchangeFreeze).toHaveBeenCalledWith({ restId: 2, reason: '对倒' });
    await w.find('[data-testid="exg-unfreeze-5"]').trigger('click');
    await flushPromises();
    expect(adminApi.exchangeUnfreeze).toHaveBeenCalledWith({ restId: 5 });
  });

  it('管理员：没收这笔先确认', async () => {
    useAdminStore().me = { accountId: 1, username: 'a', role: 'admin' };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(adminApi.exchangeConfiscate).mockResolvedValue({ count: 2, coin: 1, foods: 3 } as never);
    const w = mount(ExchangeGuardPanel);
    await flushPromises();
    await w.find('[data-testid="exg-confiscate-9"]').trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalled();
    expect(adminApi.exchangeConfiscate).toHaveBeenCalledWith({ tradeId: 9 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/web/src/components/admin/ExchangeGuardPanel.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`api/admin.ts`（类型 import 补齐）：

```ts
  suspiciousExchange: (shardId: number, flag?: string) =>
    api.get<ExchangeSuspiciousRow[]>(`${A}/suspicious/exchange${qs({ shardId, flag })}`),
  exchangeFrozen: (shardId: number) => api.get<ExchangeFrozenRow[]>(`${A}/exchange/frozen${qs({ shardId })}`),
  exchangeFreeze: (b: { restId: number; reason: string }) => api.post<{ ok: true }>(`${A}/exchange/freeze`, b),
  exchangeUnfreeze: (b: { restId: number }) => api.post<{ ok: true }>(`${A}/exchange/unfreeze`, b),
  exchangeConfiscate: (b: { tradeId: number } | { restId: number }) =>
    api.post<{ count: number; coin: number; foods: number }>(`${A}/exchange/confiscate`, b),
```

`ExchangeGuardPanel.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { EXCHANGE_FLAGS, type ExchangeFrozenRow, type ExchangeSuspiciousRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 后台"可疑数据 → 交易所"（156-2 设计 §7）：可疑成交、冻结名单、冻结/解冻/没收 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rows = ref<ExchangeSuspiciousRow[]>([]);
const frozen = ref<ExchangeFrozenRow[]>([]);
const flag = ref('');
const busy = ref(false);
const isAdmin = computed(() => admin.me?.role === 'admin');
const HOLD = { held: '冻结中', released: '已解冻', confiscated: '已没收' } as const;

async function load() {
  if (admin.shardId === null) return;
  try {
    [rows.value, frozen.value] = await Promise.all([
      adminApi.suspiciousExchange(admin.shardId, flag.value || undefined),
      adminApi.exchangeFrozen(admin.shardId),
    ]);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function run(fn: () => Promise<unknown>, ok: string) {
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
function freeze(restId: number) {
  const reason = window.prompt('冻结原因（玩家能看到）')?.trim();
  if (!reason) return;
  void run(() => adminApi.exchangeFreeze({ restId, reason }), '已冻结');
}
const unfreeze = (restId: number) => run(() => adminApi.exchangeUnfreeze({ restId }), '已解冻');
function confiscate(b: { tradeId: number } | { restId: number }) {
  if (!window.confirm('没收后不能恢复，确定吗？')) return;
  void run(() => adminApi.exchangeConfiscate(b), '已没收');
}
watch([flag, () => admin.shardId], () => void load());
onMounted(() => void load());
</script>

<template>
  <div class="d-flex align-items-center gap-2 mb-2 small">
    标记
    <select v-model="flag" class="form-select form-select-sm w-auto" data-testid="exg-flag">
      <option value="">全部</option>
      <option v-for="(label, k) in EXCHANGE_FLAGS" :key="k" :value="k">{{ label }}</option>
    </select>
    <span class="text-muted">近 7 天，最多 200 条</span>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>时间</th>
        <th>食材</th>
        <th>价格（参考价）</th>
        <th>数量 / 金额</th>
        <th>标记</th>
        <th>买方</th>
        <th>卖方</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.tradeId" :data-testid="`exg-row-${r.tradeId}`">
        <td>{{ new Date(r.at).toLocaleString('zh-CN') }}</td>
        <td>{{ catalog.foodName(r.foodsId) }}</td>
        <td>{{ formatNum(r.price) }}<span v-if="r.ref !== null" class="text-muted">（{{ formatNum(r.ref) }}）</span></td>
        <td>{{ r.qty }} / {{ formatNum(r.amount) }}</td>
        <td>
          <span v-for="f in r.flags" :key="f" class="badge text-bg-warning me-1">{{ EXCHANGE_FLAGS[f] }}</span>
        </td>
        <td>
          {{ r.buyer.restName ?? `店 ${r.buyer.restId}` }}<span class="text-muted">（{{ r.buyer.username ?? '?' }}）</span>
          <div v-if="r.buyer.hold" class="text-muted">{{ HOLD[r.buyer.hold] }}</div>
        </td>
        <td>
          {{ r.seller.restName ?? `店 ${r.seller.restId}` }}<span class="text-muted">（{{ r.seller.username ?? '?' }}）</span>
          <div v-if="r.seller.hold" class="text-muted">{{ HOLD[r.seller.hold] }}</div>
        </td>
        <td class="text-nowrap">
          <button type="button" class="btn btn-sm btn-link p-0 me-2" :disabled="busy" :data-testid="`exg-freeze-buyer-${r.tradeId}`" @click="freeze(r.buyer.restId)">冻结买方</button>
          <button type="button" class="btn btn-sm btn-link p-0 me-2" :disabled="busy" :data-testid="`exg-freeze-seller-${r.tradeId}`" @click="freeze(r.seller.restId)">冻结卖方</button>
          <button v-if="isAdmin" type="button" class="btn btn-sm btn-link text-danger p-0" :disabled="busy" :data-testid="`exg-confiscate-${r.tradeId}`" @click="confiscate({ tradeId: r.tradeId })">没收这笔</button>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-if="rows.length === 0" class="text-muted small mb-3">没有可疑成交</div>

  <h6 class="dt-section">冻结名单</h6>
  <div v-if="frozen.length === 0" class="text-muted small">没有被冻结的店</div>
  <div v-for="f in frozen" :key="f.restId" class="d-flex flex-wrap align-items-center gap-2 small border-bottom py-1">
    <span class="flex-fill">{{ f.restName }}（{{ f.username }}）：{{ f.reason }}<span class="text-muted"> · {{ f.actor ?? '?' }} · 冻结中所得 银币 {{ formatNum(f.heldCoin) }}、食材 {{ f.heldFoods }} 个</span></span>
    <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="busy" :data-testid="`exg-unfreeze-${f.restId}`" @click="unfreeze(f.restId)">解冻</button>
    <button v-if="isAdmin" type="button" class="btn btn-sm btn-outline-danger" :disabled="busy" :data-testid="`exg-confiscate-rest-${f.restId}`" @click="confiscate({ restId: f.restId })">没收全部冻结中所得</button>
  </div>
</template>
```

`AdminSuspiciousView.vue`：
- `Tab` 类型加 `'exchange'`，`TABS` 加 `['exchange', '交易所']`；
- `load()` 里 `exchange` 标签不发请求（由组件自己读）；
- 模板加 `<ExchangeGuardPanel v-if="tab === 'exchange'" />`，并 import。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/web && pnpm --filter @dt/web typecheck && pnpm --filter @dt/web lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 后台可疑数据的交易所标签"
```

---

### Task 7: 全量检查

- [ ] **Step 1:** `pnpm vitest run`（输出写到工作区文件，读尾部）→ 全部通过
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → 通过
- [ ] **Step 3:** `pnpm format:check` → 只允许 `问题记录.md` 报警
- [ ] **Step 4:** 重启开发服务（迁移 0027），跑 `apps/web/e2e/exchange.spec.ts`。它的两个新号来自同一台机器，会共用 IP。如果因此被标记为可疑、所得进入冻结，把用例改成断言"冻结中"的提示，或者在用例里把其中一个号的登录记录改成别的 IP（只改自己的号），记 Ruling。
