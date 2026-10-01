# 子项目 4C-3「酒吧扩展」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 酒吧新增魔鬼辣杯、记忆调酒、飞镖三个游戏，规则和随机数在服务端，前端只提交选择或点击时刻。

**Architecture:** 新表 `bar_round(rest_id, game, state jsonb)` 存进行中的局，一局结束就删除。三个游戏各一个服务端文件（`devil.ts`、`memory.ts`、`darts.ts`），纯计算放在 `rules.ts`。写操作走现有的 `runOp`（功能 `bar`）。前端酒吧页改成胶囊标签，新增三个面板。

**Tech Stack:** 同仓库（Fastify 5 + Kysely + PostgreSQL，Vue 3 + Pinia，Vitest，Playwright）。

**Spec:** `docs/superpowers/specs/2026-10-01-subproject4c3-bar-games-design.md`

**写法说明（执行方裁定）**：用户授权"写完直接做"。本计划把每条测试和核心算法写全；路由、DTO 组装、面板模板等样板代码在执行时直接写，不在计划里重复一遍。

## Global Constraints

- 回复、注释、文案用中文；不碰 `问题记录.md`。
- 时间一律用 `o.now` / `d.now()`；每日计数传 `gameDay(o.now)`。
- 秘密（特辣酒位置、老板分数）在结束前不进任何响应。
- 样式只写在 `main.css`，按 `docs/design/视觉规范.md`。
- 提交信息结尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **局面残留**：玩家关掉页面后再回来，能接着同一局，不能重复扣押注开新局。→ Task 3、4、5 的"同时开两局被拒"。
2. **时间窗被绕过**：记忆调酒提交时间早于展示结束、飞镖上报的经过时间大于服务端实际时间，都必须判无效。→ Task 4、5。
3. **并发**：同一家店同时两次"喝""投掷"，只能有一次生效。runOp 锁店，`bar_round` 读写都在锁内。→ Task 3 并发测试。
4. **宿醉叠加**：再次宿醉重新计时、不叠加，上座率只扣一次 10%。→ Task 3。
5. **每日上限跨天重置**。→ Task 4。

---

### Task 1: 配置、迁移、宿醉名称、新闻类型

**Files:** `packages/config/src/tuning.ts`、`packages/config/data/game/tuning.json`、`apps/server/src/db/migrations/0015_bar_round.ts`（+ index、schema、`0015.test.ts`）、`apps/server/src/modules/effects/naming.ts`、`packages/shared/src/news.ts`、`packages/config/src/build.test.ts`

**Produces:**
- `Tuning['bar']['devil' | 'memory' | 'darts']`：数值见设计文档 §3
- 表 `bar_round { rest_id, game: string, state: Json<Record<string, unknown>>, started_at: Ts, updated_at: Ts }`，主键 `(rest_id, game)`
- `effectSourceName({ sourceType: 'bar', sourceId: 1 }) === '宿醉'`
- `NEWS_TYPES` 增加 `bar.devil`、`bar.memory`、`bar.darts`

**Tests:**
- build.test：`bundle.tuning.bar.devil` 等于 `{ stakes: [1,5,10,20], cups: 6, rate: 1.4, hangoverMinutes: 60, hangoverAtRate: -0.1, newsSurvived: 3 }`；`memory.lengths = [3,5,7]`；`darts.cost = 2`。
- 0015.test：同店同游戏插两行被拒，不同游戏可以并存。
- naming 测试：`sourceType: 'bar'` 显示"宿醉"。

---

### Task 2: 纯规则

**Files:** `apps/server/src/modules/bar/rules.ts`（追加），`rules.test.ts`（追加）

**Produces:**

```ts
/** 魔鬼辣杯赔付：⌊押注 × rate^活过的杯数⌋ */
export function devilPayout(stake: number, survived: number, rate: number): number {
  return Math.floor(stake * rate ** survived + 1e-9);
}

/** 飞镖准星位置：三角波，周期 period，起点相位 phase ∈ [0,1)；返回 [-1, 1] */
export function dartX(elapsedMs: number, period: number, phase: number): number {
  const p = (((elapsedMs / period + phase) % 1) + 1) % 1;
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}

/** 按离靶心的距离给分；rings 按半径从小到大 */
export function dartScore(x: number, rings: ReadonlyArray<readonly [number, number]>): number {
  const d = Math.abs(x);
  for (const [r, s] of rings) if (d <= r + 1e-9) return s;
  return 0;
}

/** 记忆调酒的展示总时长和作答窗口 [最早, 最晚]（相对发出配方的时刻，毫秒） */
export function memoryWindow(len: number, m: MemoryTuning): { showMs: number; earliest: number; latest: number } {
  const showMs = len * m.flashMs + (len - 1) * m.gapMs;
  return { showMs, earliest: showMs - m.earlyMs, latest: showMs + m.answerBaseMs + len * m.answerPerItemMs };
}
```

**Tests（全部写全）：**

```ts
describe('酒吧扩展规则（4C-3）', () => {
  it('魔鬼辣杯赔付', () => {
    expect(devilPayout(10, 1, 1.4)).toBe(14);
    expect(devilPayout(10, 2, 1.4)).toBe(19);
    expect(devilPayout(10, 3, 1.4)).toBe(27);
    expect(devilPayout(1, 1, 1.4)).toBe(1);
  });
  it('飞镖三角波：相位 0 从 -1 出发，半周期到 1，一周期回到 -1', () => {
    expect(dartX(0, 1000, 0)).toBeCloseTo(-1);
    expect(dartX(250, 1000, 0)).toBeCloseTo(0);
    expect(dartX(500, 1000, 0)).toBeCloseTo(1);
    expect(dartX(750, 1000, 0)).toBeCloseTo(0);
    expect(dartX(1000, 1000, 0)).toBeCloseTo(-1);
    expect(dartX(0, 1000, 0.25)).toBeCloseTo(0);
  });
  it('飞镖得分环', () => {
    const rings = [[0.05, 50], [0.15, 25], [0.3, 10], [0.5, 5]] as const;
    expect(dartScore(0, rings)).toBe(50);
    expect(dartScore(-0.05, rings)).toBe(50);
    expect(dartScore(0.1, rings)).toBe(25);
    expect(dartScore(0.3, rings)).toBe(10);
    expect(dartScore(-0.45, rings)).toBe(5);
    expect(dartScore(0.9, rings)).toBe(0);
  });
  it('记忆调酒时间窗：3 种 = 3×600 + 2×200 = 2200ms 展示', () => {
    const m = testConfig().tuning.bar.memory;
    expect(memoryWindow(3, m)).toEqual({ showMs: 2200, earliest: 1900, latest: 2200 + 3000 + 4500 });
  });
});
```

---

### Task 3: 魔鬼辣杯（服务端）

**Files:** `apps/server/src/modules/bar/round.ts`（`loadRound / saveRound / endRound`）、`devil.ts`、`service.ts`、`routes.ts`、`packages/shared/src/schemas/bar.ts`（`barDevilStartBody { stake }`、`barDevilDrinkBody { cup: 0~5 }`、`DevilDto`）；测试 `devil.test.ts`

**Produces:**
- `DevilDto { stake: number; cups: Array<'me' | 'bartender' | null>; survived: number; result: 'win' | 'lose' | null; spiked: number | null; payout: number; hangoverUntil: string | null; lastBartender: number | null }`
- `TownService` 不涉及；`BarService.devilStart(ctx, {stake})`、`devilDrink(ctx, {cup})`

**算法：**
- start：
  1. `stakes` 不含 stake → `badInput('stake')`；
  2. 已有 devil 局 → `ALREADY_DONE { what: 'bar_round' }`；
  3. 扣礼券，`spiked = rng.int(cups)`，插入局面，`emitAction('bar.play')`、`emitAction('bar.devil')`。
- drink：
  1. 没有局 → `invalidState('no_round')`；`cup` 越界 → `badInput('cup')`；已喝过 → `ALREADY_DONE { what: 'cup_taken' }`。
  2. 玩家喝：
     - 是特辣酒 → 输：删局，`upsertEffectSource(tx, rest, { sourceType: 'bar', sourceId: 1, effects: { atRate: hangoverAtRate }, expiresAt: now + 60 分 })`，`invalidateAgg(o)`。
     - 否则 `survived += 1`。
  3. 调酒师喝：从剩下的杯里 `rng.int(剩余数)` 选一杯。
     - 是特辣酒 → 赢：赔付 `devilPayout`（`grantGoodsOp` 发神秘礼券），删局；`survived >= newsSurvived` 时写新闻 `bar.devil { stake, payout }`。
     - 否则保存局面。

**Tests（`createTestGame({ rng: () => sequenceRng([...]) })` 固定随机数；rng 顺序：开局的 spiked → 每回合调酒师的选杯）：**
- 开局扣押注，局面里 `spiked` 为 null、6 杯都是 null；押注 3 被拒；有局时再开被拒。
- 玩家第一杯就喝到（spiked=0，喝 0）→ `result: 'lose'`、`spiked: 0`；宿醉加成出现在 `listActiveEffects`，`atRate -0.1`，到期 = now + 1h；再次宿醉后仍只有一条、到期时间更新。
- 调酒师在第 2 杯喝到：spiked=5，rng 让调酒师选到剩余列表里 5 号 → 赢，`payout = ⌊10×1.4⌋ = 14`，礼券 +14。
- 玩家活过 3 杯（赢 ×2.744）写新闻 `bar.devil`。
- 喝已经喝过的杯被拒；没有局时喝被拒。
- 同一店两个 drink 并发：只有一个改变局面（另一个要么 `cup_taken` 要么正常走下一回合，不会两杯同时算）。

---

### Task 4: 记忆调酒（服务端）

**Files:** `memory.ts`、service、routes、shared（`barMemoryAnswerBody { answer: number[] (1~9 个，0~7) }`、`MemoryRoundDto`、`MemoryAnswerDto`）；测试 `memory.test.ts`

**Produces:**
- `MemoryRoundDto { level: number; seq: number[]; flashMs: number; gapMs: number; answerMs: number }`（answerMs = latest - showMs）
- `MemoryAnswerDto { correct: boolean; level: number; award: BarAwardDto | null; canNext: boolean; finished: boolean }`
- `BarService.memoryStart / memoryAnswer / memoryNext / memoryStop`

**算法：**
- start：
  1. 有局 → `ALREADY_DONE { what: 'bar_round' }`；
  2. 今日计数 `bar.memory` ≥ dailyMax → `limitReached('bar_daily', { max })`；
  3. 扣 cost，计数 +1，生成 `seq = lengths[0]` 个 `rng.int(ingredients)`，`shownAt = now`，`passed = false`，活跃同上。
- answer：
  1. 没局或 `passed` → `invalidState('no_round')`；
  2. `elapsed = now - shownAt`，不在 `[earliest, latest]` → 按答错；
  3. 长度不等或任一不同 → 答错：删局，返回 `correct: false, finished: true`；
  4. 答对：`randomAward(o, { level: awardLevels[level-1], noTicket: true })`；
     - 最后一关：删局，写新闻 `bar.memory`，计数 `bar.memory.perfect` +1，`finished: true`；
     - 否则 `passed = true` 保存，`canNext: true`。
- next：没局或没 `passed` → `invalidState('not_passed')`；生成下一关配方（长度 `lengths[level]`），`level + 1`，`passed = false`，`shownAt = now`。
- stop：删局（没局时也返回成功）。

**Tests（时钟用 `t.clock`）：**
- 开局扣 1 张，返回 3 个 0~7 的数；第二次开局被拒。
- 在 `showMs` 之后提交正确答案：答对、发奖励、`canNext`；`next` 返回 5 个、不扣礼券；再答对、`next` 返回 7 个；第三关答对：`finished`，新闻 `bar.memory`，可疑计数 +1。
- 提交太早（`earliest - 1`）→ 答错、局结束；提交太晚（`latest + 1`）→ 答错。
- 答错后已拿的奖励还在。
- 没答对就 `next` → `not_passed`。
- 每天 20 局：第 21 局被拒；第二天可以再玩。

---

### Task 5: 飞镖（服务端）

**Files:** `darts.ts`、service、routes、shared（`barDartsThrowBody { elapsedMs: int 0~600000 }`、`DartsDto`、`DartsAimDto`、`DartsThrowDto`）；测试 `darts.test.ts`

**Produces:**
- `DartsDto { throws: number[]; aiming: boolean }`；`DartsAimDto { period: number; phase: number }`
- `DartsThrowDto { x: number | null; score: number; throws: number[]; finished: boolean; boss: number[] | null; result: 'win' | 'draw' | 'lose' | null; award: BarAwardDto | null; refund: number }`

**算法：**
- start：有局被拒；今日计数 `bar.darts` 到上限被拒；扣 cost，计数 +1；`boss` 三镖按 `bossOdds` 权重抽；活跃同上。
- aim：没局 → `no_round`；`period = periodMs[0] + rng.int(periodMs[1] - periodMs[0] + 1)`，`phase = rng.next()`，`aim.at = now`，保存。
- throw：
  1. 没局 → `no_round`；没瞄准 → `invalidState('no_aim')`；
  2. `serverElapsed = now - aim.at`；`elapsedMs > serverElapsed + futureMs` 或 `elapsedMs < serverElapsed - latencyMs` → 这一镖 0 分（`x: null`）；否则 `x = dartX(elapsedMs, period, phase)`，`score = dartScore`；50 分时计数 `bar.darts.bull` +1；
  3. 清掉 `aim`，加入 throws；
  4. 投满 3 镖：比较总分。
     - 赢：`randomAward(level: 全 50 ? perfectLevel : winLevel)`，全 50 时写新闻 `bar.darts`；
     - 平：退 `tieRefund` 张礼券；
     - 输：什么都没有。
     - 删局，返回 boss。

**Tests：**
- 开局扣 2 张；DartsDto 里没有老板分数。
- 瞄准返回 900~1400 的周期；没瞄准就投被拒。
- 用 `t.clock` 控制：瞄准后时钟前进 500ms，上报 `elapsedMs` = 用 `dartX` 反算出的靶心时刻（`phase` 从响应里拿）→ 50 分；上报比服务端多 200ms → 0 分；上报比服务端少 2000ms → 0 分。
- 三镖：固定随机数让老板三镖 0 分、玩家投中 → 赢并发奖；全 50 分写新闻；玩家全 0、老板全 0 → 平，退 1 张；老板高 → 输。
- 每日上限 20。

---

### Task 6: 酒吧概览

**Files:** `view.ts`、shared `BarDto` 增加：
- `devil: { stakes: number[]; round: DevilDto | null }`
- `memory: { cost; played; max; round: { level: number; passed: boolean } | null }`
- `darts: { cost; played; max; round: DartsDto | null }`

**Tests:** view 测试（新增在 `pots.test.ts` 同目录的 `games.test.ts` 里）：
- 进行中的魔鬼辣杯局能读到杯子状态，但读不到特辣酒位置；
- 今日局数正确。

---

### Task 7~9: 前端三个面板

**Files:** `apps/web/src/components/bar/{DevilPanel,MemoryPanel,DartsPanel}.vue` + 测试；`views/BarView.vue`（胶囊标签、页面标题）；`api/endpoints.ts`；`i18n/zh-CN.ts`（`bar_round`、`cup_taken`、`no_round`、`not_passed`、`no_aim`、`bar_daily`、`stake`、`cup`）；`utils/news.ts`（`bar.devil`、`bar.memory`、`bar.darts` 文案）；`styles/main.css`（杯子、配料格、靶条）。

**Tests：**
- **DevilPanel**：
  - 没有局时显示押注选择，开局调用 `barDevilStart(5)`；
  - 有局时显示 6 杯，已喝的杯不能点；
  - 结束时亮出特辣酒、提示赔付或宿醉。
- **MemoryPanel**（假时钟）：
  - 开局后按 flashMs/gapMs 依次高亮，展示中按钮不能点；
  - 展示完点满即提交，提交的答案顺序正确；
  - 答对时出现"继续"和"收手"。
- **DartsPanel**（假时钟和 `performance.now`）：
  - 点"瞄准"后准星开始动；
  - 点"投掷"提交经过的毫秒数；
  - 三镖后显示老板分数和结果。
- **BarView**：7 个胶囊标签，选中项高亮。
- **news.test**：三种新新闻有文案（`NEWS_TYPES` 对照测试会自动覆盖）。

---

### Task 10: 端到端和文档

- `e2e/bar-games.spec.ts`：魔鬼辣杯押 1 张，一直点没喝过的杯直到出结果；飞镖开局，瞄准、投掷三次，看到结果。
- 规则文档第 9 节追加三个游戏；部署说明加迁移 0015。
- 全量 `pnpm test`、`typecheck`、`lint`、`prettier --check .`、e2e。
