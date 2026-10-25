# 乾坤通景巨屏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增后台专发的艺术品 30710《山河社稷 · 万象天工》乾坤通景巨屏：七项加成，外加摆放后每 2 小时孕育 1 份稀有食材、共 12 份。

**Architecture:** 加成全部走现有的“设施道具 value → 加成来源 → 结算 / 做特色菜”链路，只放开配置检查。孕育是新的：`restaurant_device` 加一列 `breed_done`，新模块 `growth/breed.ts` 负责计算份数、挑食材、发放；一个每分钟的周期任务（照期货交割）和摆放操作（覆盖前先补发）都调用它。

**Tech Stack:** TypeScript、Kysely + Postgres、Fastify 服务端、Vue 网页、vitest。

**Spec:** `docs/superpowers/specs/2026-10-25-art-scroll-design.md`

## Global Constraints

- 道具 30710：`src` "art"、`group` "artPainting"、`type` 3、`deviceType` 9、`level` 5、`coin` 0、`diamond` 0、`onSale` false、`maxNum` 99、`stackable` true、`awardFlag` null、`invalidHours` null，不设 `needStar`。
- `value` 原样：`{"time":24,"atRate":0.16,"atSoftCapAdd":0.14,"spRate":0.14,"spSoftCapAdd":0.12,"coinRate":0.5,"expRate":0.25,"mcGoldRate":0.25,"breedEveryHours":2,"breedTimes":12,"breedMaxLevel":5,"breedMaxOdds":65}`。
- 名字、简中说明照设计文档“道具数据”一节原文。
- 孕育参数不能进加成来源。
- 稀有 = `odds ≤ breedMaxOdds` 且等级 1 ~ `breedMaxLevel`、没退役；不用 `config.rareFoodPools`。
- 简中玩家文字用英文冒号、逗号后带空格，半角括号；繁中只用 `pnpm -F @dt/web i18n:tw` 生成，不格式化。
- 服务端测试不用 `vi.mock`。改了 `packages/config` 后先 `pnpm -F @dt/config build` 再跑服务端测试。
- 不写更新记录。只 `git add` 明确路径。

## Review Focus

1. 位置被覆盖时已经到点、任务还没发的份数：摆放先补发，再重置（Task 3 测试）。
2. 任务停了几小时再跑：一次补齐，不重复（Task 3 测试）。
3. 店换了街道：按孕育那一刻的街道挑（Task 2 用 `op.rest.street_id`，Task 3 测试）。
4. 橱柜满：进冰箱，不报错（Task 3 测试）。
5. 设施被延时加成拉长：仍然只有 12 份（Task 2 `breedDue` 测试）。

---

### Task 1: 配置：道具、检查、孕育参数

**Files:**
- Modify: `packages/config/src/ids.ts`（`ART_EFFECT_KEYS` 附近）
- Modify: `packages/config/src/build.ts:356-369`（艺术品检查）
- Modify: `packages/config/data/master/goods.json`（30709 那行之后）
- Modify: `packages/config/data/i18n/{en,es,fr}/goods.json`（`"30709"` 之后）
- Test: `packages/config/src/devicesExtra.test.ts`

**Interfaces:**
- Produces（从 `@dt/config` 导出）：
  - `ART_EFFECT_KEYS` 增加 `'coinRate'`、`'expRate'`、`'mcGoldRate'`
  - `ART_BREED_KEYS: readonly string[] = ['breedEveryHours', 'breedTimes', 'breedMaxLevel', 'breedMaxOdds']`
  - `interface ArtBreed { everyHours: number; times: number; maxLevel: number; maxOdds: number }`
  - `artBreedOf(effects: Record<string, number>): ArtBreed | null`：四个键都有时返回，否则 null
  - `artEffectsOf(effects: Record<string, number>): Record<string, number>`：去掉 `time` 和四个孕育键

- [ ] **Step 1: 改测试**

在 `devicesExtra.test.ts` 的“艺术品设施”describe 里：
- 第一条：`toHaveLength(18)` 改 19；加断言
  ```ts
  expect(b.goods.find((g) => g.id === 30710)).toMatchObject({
    name: '《山河社稷 · 万象天工》乾坤通景巨屏', deviceType: 9, onSale: false, coin: 0, diamond: 0,
    effects: { time: 24, atRate: 0.16, atSoftCapAdd: 0.14, spRate: 0.14, spSoftCapAdd: 0.12,
      coinRate: 0.5, expRate: 0.25, mcGoldRate: 0.25,
      breedEveryHours: 2, breedTimes: 12, breedMaxLevel: 5, breedMaxOdds: 65 },
  });
  expect(b.goods.find((g) => g.id === 30710)!.needStar).toBeUndefined();
  expect(b.shopPools.black).not.toContain(30710);
  ```
- 第二条（检查）：`g(30602).value = { time: 24, coinRate: 0.1 }` 改成 `luckValue: 1`，期望 `'goods 30602 art value key luckValue not allowed'`。
- 新加一条 `it('检查：孕育参数四个要么都有要么都没有，必须是正整数')`：把 30702 的 value 设成 `{ time: 24, breedEveryHours: 2 }`、30703 设成 `{ time: 24, breedEveryHours: 2, breedTimes: 1.5, breedMaxLevel: 5, breedMaxOdds: 65 }`，期望错误里有 `'goods 30702 art breed needs all of breedEveryHours, breedTimes, breedMaxLevel, breedMaxOdds'` 和 `'goods 30703 art value breedTimes must be a positive integer'`。
- 新加 `it('artBreedOf / artEffectsOf')`：对 30710 的 effects，`artBreedOf` 得 `{ everyHours: 2, times: 12, maxLevel: 5, maxOdds: 65 }`，`artEffectsOf` 不含 `time` 和 `breed*`、含 `coinRate: 0.5`；对 30609 的 effects，`artBreedOf` 为 null。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --project config src/devicesExtra.test.ts`
Expected: FAIL（找不到 30710、`artBreedOf` 未导出）

- [ ] **Step 3: 实现**

- `ids.ts` 加上面的常量和两个函数（`ART_BREED_KEYS` 键名到 `ArtBreed` 字段的对应：breedEveryHours→everyHours、breedTimes→times、breedMaxLevel→maxLevel、breedMaxOdds→maxOdds）。
- `build.ts` 艺术品检查：孕育键单独检查（正整数，否则 `art value <key> must be a positive integer`）；有任一孕育键但不全时报 `art breed needs all of breedEveryHours, breedTimes, breedMaxLevel, breedMaxOdds`；其余键照旧按 `ART_EFFECT_KEYS` 检查。
- `goods.json` 加一行，照 Global Constraints；`desc` 用设计文档原文。
- en/es/fr 的 `goods.json` 加 `"30710"` 的 name、desc，写法照 30709。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run --project config`
Expected: PASS（整个 config 项目，含翻译完整性检查）

- [ ] **Step 5: 提交**

```bash
pnpm -F @dt/config build
git add packages/config/src/ids.ts packages/config/src/build.ts packages/config/src/devicesExtra.test.ts packages/config/data/master/goods.json packages/config/data/i18n/en/goods.json packages/config/data/i18n/es/goods.json packages/config/data/i18n/fr/goods.json
git commit -m "feat: 艺术品乾坤通景巨屏配置：放开银币、经验、金牌加成和孕育参数"
```

---

### Task 2: 孕育：份数、挑食材、发放（含迁移）

**Files:**
- Create: `apps/server/src/db/migrations/0097_art_breed.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`（`RestaurantDeviceTable` 加 `breed_done: Generated<number>`，照该文件其他带默认值列的写法）
- Create: `apps/server/src/modules/growth/breed.ts`
- Test: `apps/server/src/modules/growth/breed.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `artBreedOf`、`ArtBreed`
- Produces（`growth/breed.ts`）：
  - `breedDue(o: { placedAt: Date; expiresAt: Date | null; now: Date; breed: ArtBreed }): number` — `floor((min(now, expiresAt ?? now) − placedAt) ÷ (everyHours 小时))`，夹在 0 ~ times
  - `breedNeed(o: Op): Promise<Map<number, number>>` — 本店现在街道上品级 0 的菜学会（1 品）的缺口：`needMapOf` 只传品级为 0 的菜，`maxGrade` 照 `opNeedMap`
  - `pickBreedFoods(need: ReadonlyMap<number, number>, num: number, rng: Rng, foods: GameConfig['foods'], breed: ArtBreed): number[]` — 缺口里只留 `level ≤ maxLevel && odds ≤ maxOdds && !retired` 的；有就按缺口加权抽、抽一个扣一个；没有就从 `level === maxLevel && odds ≤ maxOdds && !retired` 的食材里按 `weight` 抽
  - `grantBreed(op: Op, row: { slot: number; goods_id: number; placed_at: Date; expires_at: Date | null; breed_done: number }): Promise<number>` — 不是孕育道具返回 0；算 `breedDue(now = op.now)`，补发 `due − breed_done` 份：`addFoods(op, id, 1, { source: 'art.breed' })`，每份 `restLog(op, 'device.breed', { slot, goodsId, foodsId, n, of: times })`（n 是第几份），再把这一行的 `breed_done` 改成 `due`（`where rest_id, slot, placed_at` 都对上）；返回补发份数

- [ ] **Step 1: 写失败测试 `breed.test.ts`**

用 `createTestGame` / `newRestaurant` / `foodNum`（同 `futures/deliver.test.ts`）。孕育道具取 `const ART = 30710`、`const B = artBreedOf(config.requireGoods(ART).effects)!`。

- `breedDue`：放下后 1h59m → 0；2h → 1；24h → 12；30h 且 `expiresAt` 为放下 + 28.8h → 12（延时拉长也不超过 12）；`expiresAt` 为放下 + 5h、now 为 + 10h → 2。
- `pickBreedFoods`：
  - need 里同时有 odds 70 的大米（1 级）、odds 65 的香菇（3 级）、一种 6 级 odds ≤ 65 的食材：抽 20 次只出香菇，且香菇缺口为 2 时前两次是香菇、之后走兜底；
  - need 为空：抽 30 次，结果都在 `[鱼翅, 鲍鱼, 鱼肚, 燕窝, 虫草]`（按名字查 id）。
- `breedNeed`：建一家店，`patch.street_id` 设一条街，把这条街除一道菜以外都设成 1 品（`cookbooks`）；断言 `breedNeed` 的键正好是剩下那道菜 `needFoods[1]` 里橱柜不够的食材；已经学会的菜要的食材不在里面。
- `grantBreed`：在一个 `runSystemOp` 里，`restaurant_device` 先插一行 30710（`placed_at` = now − 5h、`expires_at` = placed + 24h、`breed_done` 0）：返回 2，橱柜多 2 份（从 `cupboard_food` 合计看），`rest_log` 有两条 `device.breed`，`n` 分别是 1、2，`of` 12，`breed_done` 变 2；再调一次返回 0。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/modules/growth/breed.test.ts`
Expected: FAIL（`./breed` 不存在）

- [ ] **Step 3: 迁移 0097**

`up`：`alter table restaurant_device add column breed_done smallint not null default 0`；`down` 删掉这一列。写法照 `0092_fridge_fee.ts`，注释写清用途。在 `index.ts` 登记。

- [ ] **Step 4: 实现 `growth/breed.ts`**

签名见 Interfaces。`grantBreed` 里食材 id 一次 `pickBreedFoods(await breedNeed(op), due − breed_done, op.rng, op.config.foods, breed)` 抽好。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd apps/server && npx vitest run src/modules/growth/breed.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/db/migrations/0097_art_breed.ts apps/server/src/db/migrations/index.ts apps/server/src/db/schema.ts apps/server/src/modules/growth/breed.ts apps/server/src/modules/growth/breed.test.ts
git commit -m "feat: 乾坤通景巨屏孕育：份数、挑稀有缺料、发进橱柜"
```

---

### Task 3: 接上摆放和每分钟任务

**Files:**
- Modify: `apps/server/src/modules/growth/devices.ts`
- Modify: `apps/server/src/modules/growth/breed.ts`（加任务）
- Modify: `apps/server/src/game.ts:161` 附近（登记任务）
- Test: `apps/server/src/modules/growth/growth2.test.ts`（摆放）、`apps/server/src/modules/growth/breed.test.ts`（任务）

**Interfaces:**
- Consumes: Task 1 `artEffectsOf`、`artBreedOf`；Task 2 `grantBreed`、`breedDue`
- Produces（`growth/breed.ts`）：
  - `deliverBreeds(d: GameDeps, shardId: number, now: Date, log?: { error(obj: object, msg: string): void }): Promise<{ granted: number; failed: number }>`
  - `breedJobs(d: GameDeps): PeriodicJob[]` — 一个任务 `{ name: 'art-breed', feature: 'restaurant', period: (now) => now.toISOString().slice(0, 16), run: ({ shardId, now, log }) => deliverBreeds(d, shardId, now, log) }`

- [ ] **Step 1: 写失败测试**

`growth2.test.ts` 艺术品 describe 里加（`const SCROLL = 30710`，店 `star_level` 1）：
- `it('乾坤通景巨屏：乐台、屏风都能摆，全店一件；加成里有银币、经验、金牌，没有孕育参数')`：两处都能摆（先屏风，到期后乐台），同时摆第二件报 `art_in_use`；`getEffectAgg` 的 `coinRate` ≈ 0.5、`expRate` ≈ 0.25、`mcGoldRate` ≈ 0.25、`atRate` ≈ 0.16，`breedTimes` 为 undefined。
- `it('乾坤通景巨屏：覆盖位置前先补发已到点的份数，新的一轮从 0 开始')`：摆上，`t.clock` 拨到 + 4h10m，不跑任务直接在同一位置摆另一件屏风画：橱柜多 2 份、`breed_done` 为 0、`goods_id` 是新画。

`breed.test.ts` 加：
- `it('任务：停了几小时再跑一次补齐，不重复；到 24 小时给满 12 份为止')`：插 30710 一行（`placed_at` = now − 7h），`deliverBreeds` → granted 3；再跑 → 0；时钟拨到 + 30h 再跑 → 本行合计 12。
- `it('任务：换了街道按新街道挑')`：同一家店先跑一次，把 `restaurant.street_id` 改掉，时钟拨 2h 再跑；新到的那份要么在新街 `breedNeed` 的键里，要么在 5 级兜底名单里。
- `it('任务：橱柜满了进冰箱，不报错')`：店 `cupboard_num` 设成已用格数，跑任务 → granted ≥ 1、`failed` 0，新食材在 `fridge_num`。
- `it('任务登记：art-breed 每分钟一次，挂在 restaurant')`：`breedJobs(t.game.deps)` 的 name、feature、`period(new Date('2026-10-10T04:05:30Z'))` 为 `'2026-10-10T04:05'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx vitest run src/modules/growth/breed.test.ts src/modules/growth/growth2.test.ts`
Expected: FAIL（`deliverBreeds` 不存在；加成里有 `breedTimes`；覆盖时份数没补）

- [ ] **Step 3: 实现**

- `devices.ts`：
  - 在 upsert 之前读这个位置现有的行（`selectAll ... forUpdate`），有就 `await grantBreed(op, old)`。
  - upsert 的 `values` 和 `doUpdateSet` 都带 `breed_done: 0`。
  - 加成来源用 `artEffectsOf(g.effects)`，替换现在的 `const { time: _time, ...effects } = g.effects`。
- `breed.ts`：`deliverBreeds` 照 `futures/deliver.ts` 的 `deliverDue`。
  - 查本区服的行：`restaurant_device` join `restaurant`（`shard_id`），`goods_id in` 配置里 `artBreedOf` 非空的道具编号；编号列表为空就直接返回。
  - 在代码里留下 `breedDue(now) > breed_done` 的，按 `placed_at` 排，最多 500 行。
  - 按店分组，每家店 `runSystemOp(d, shardId, restId, { source: 'art.breed', now }, ...)`：事务里按 `(rest_id, slot)` `forUpdate` 重读，`goods_id`、`placed_at` 都没变才 `grantBreed`。
  - 失败只 `log.error({ err, shardId, restId }, 'art breed failed')`，计 `failed`。
- `game.ts`：`jobs.push(...breedJobs(deps))`，紧跟 `futuresJobs`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && npx vitest run src/modules/growth src/modules/futures`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/growth/devices.ts apps/server/src/modules/growth/breed.ts apps/server/src/modules/growth/breed.test.ts apps/server/src/modules/growth/growth2.test.ts apps/server/src/game.ts
git commit -m "feat: 乾坤通景巨屏每分钟孕育任务；覆盖位置前补发已到点的份数"
```

---

### Task 4: 店铺动态文字

**Files:**
- Modify: `apps/web/src/i18n/locales/{zh-CN,en,es,fr}/events.ts`（`'device.place'` 之后）
- Generate: `apps/web/src/i18n/locales/zh-TW/events.ts`
- Test: 找到现有的店铺动态文字测试（`grep -rn "device.place" apps/web/src --include=*.test.ts`），在里面加；没有就加到 `apps/web/src/i18n/events.test.ts`

**Interfaces:**
- Consumes: Task 2 的日志 `device.breed`，参数 `{ slot, goodsId, foodsId, n, of }`

- [ ] **Step 1: 写失败测试**

`device.breed` 参数 `{ slot: 11, goodsId: 30710, foodsId: <香菇 id>, n: 3, of: 12 }`，简中渲染为 `画中孕育出 香菇 (3/12)`；英文含 `3/12` 和食材英文名。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --project web <测试文件>`
Expected: FAIL

- [ ] **Step 3: 实现**

- 简中：`'device.breed': (p, names) => \`画中孕育出 ${names.foodName(n(p, 'foodsId'))} (${n(p, 'n')}/${n(p, 'of')})\``
- 英、西、法：意思相同，照各自文件里 `device.place` 的写法。
- 然后 `pnpm -F @dt/web i18n:tw` 生成繁中。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run --project web src/i18n`
Expected: PASS（含各语言键齐全、繁中逐字比对的测试）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/i18n/locales/zh-CN/events.ts apps/web/src/i18n/locales/en/events.ts apps/web/src/i18n/locales/es/events.ts apps/web/src/i18n/locales/fr/events.ts apps/web/src/i18n/locales/zh-TW/events.ts <测试文件>
git commit -m "feat: 店铺动态显示画中孕育出的食材"
```

---

### Task 5: 全量检查

- [ ] **Step 1:** `pnpm -F @dt/config build`
- [ ] **Step 2:** 四个包分别跑类型检查（`pnpm -s -F @dt/<包> typecheck`，看退出码）。Expected: 都是 0。
- [ ] **Step 3:** `pnpm -s lint`、`npx prettier --check .`。Expected: 通过。
- [ ] **Step 4:** `npx vitest run --project web --project config --project shared` 和 `pnpm -F @dt/server test`（分开跑，别同时跑）。Expected: 全过。
- [ ] **Step 5:** 确认后台能发：找到后台给玩家发道具的入口（`grep -rn "attach\|goodsId" apps/server/src/modules/ops apps/server/src/modules/admin`），看它对道具有没有 `onSale`、`src` 之类的限制。在它现有的测试里加一条“能发 30710”的用例；如果有限制挡住了，停下来报告，不要擅自放开。
- [ ] **Step 6:** 有修正就按明确路径提交。
