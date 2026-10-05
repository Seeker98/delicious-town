# 重新编号 PR 3：菜谱存储位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 餐厅的学会记录（`restaurant_cookbooks.levels`，每道菜一个字节）按菜谱的“存储位”读写，不再按菜谱编号；本步存储位等于编号，库里数据不动，行为不变。

**Architecture:** 主表菜谱加 `slot`；`data/game/cookbook_slots.json` 记下一个可用的存储位（只增不复用）；配置的 `cookbookIndex` 提供 编号 → 存储位（`slotOf`）、存储位 → 编号（`idAt`）和字节串长度（`slots`），取代 `maxCookbookId`；服务端所有读写学会记录的地方改用存储位。服务端测试用的配置把存储位倒过来排（存储位 ≠ 编号），任何漏改的地方都会让测试失败。

**Tech Stack:** TypeScript、zod、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-05-id-renumber-design.md`（§2.3 存储位、§6 PR 3）

## Global Constraints

- 本步存储位 = 编号；`next` = 现有最大编号 + 1（20226）；真实配置下字节串长度、内容、行为都不变。
- 存储位只增不复用：删菜后它的存储位空着；新菜从 `next` 往后分。
- 迁移 0039、0040 是按当时的菜谱编号改写字节串的历史迁移，不改。
- 中文注释、提交说明；提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；只 `git add` 明确路径；推送前 `pnpm format:check`。

## Review Focus

1. 漏改的“按编号取学会记录”——服务端测试配置打乱存储位后整套测试兜底（Task 2）。
2. 字节串比 `slots` 短的老店（新街道上线前开的店）——`padLevels` 按 `slots` 补齐，`cookbook/rules.test.ts` 已有用例，改成按 `slots`。
3. 存储位重复、超出 `next`、缺失——构建报错（Task 1 测试）。
4. 新街道导入加了新菜：从 `next` 分配、写回 `next`；删了菜：存储位不复用（Task 3 测试）。
5. 排行榜按字节数数“学会几道”——与存储位无关，不改；结算、外卖、教学遗忘、缺料倾向、模拟器都要改（Task 2）。

---

### Task 1: 配置——存储位字段、`next`、索引

**Files:**
- Modify: `packages/config/src/raw.ts`（`masterCookbook` 加 `slot: int.min(0)`；新增 `cookbookSlotsFile = z.object({ next: int.min(1) }).strict()`）
- Modify: `packages/config/src/types.ts`（`Cookbook.slot: number`）
- Modify: `packages/config/src/source.ts`（加 `'game/cookbook_slots'`）
- Create: `packages/config/data/game/cookbook_slots.json`（`{ "next": 20226 }`）
- Modify: `packages/config/data/master/cookbooks.json`（每条加 `"slot": <id>`，用脚本，放在 `streetId` 前面不要求，键顺序以 `formatMaster` 输出为准）
- Modify: `packages/config/src/build.ts`（复制 `slot`；检查唯一、`< next`）
- Modify: `packages/config/src/runtime.ts`（`CookbookIndex` 加 `slotOf: Int32Array`（按编号，-1 = 没有）、`idAt: Int32Array`（按存储位，-1 = 空）、`slots: number`（= 最大存储位 + 1）；`GameConfig` 去掉 `maxCookbookId`）
- Test: `packages/config/src/build.test.ts`、`packages/config/src/runtime.test.ts`

- [ ] **Step 1: 失败的测试**

`build.test.ts`（“主表的检查”一组里加）：

```ts
  it('菜谱存储位：重复、超出 next 时构建报错（重新编号 PR 3）', () => {
    const src = source();
    const cookbooks = structuredClone(src['master/cookbooks']) as Array<{ id: number; slot: number }>;
    cookbooks[1]!.slot = cookbooks[0]!.slot;
    cookbooks[2]!.slot = 999_999;
    const { errors } = buildBundle({ ...src, 'master/cookbooks': cookbooks });
    expect(errors).toContain(`cookbooks: duplicate slot ${cookbooks[0]!.slot}`);
    expect(errors).toContain(`cookbook ${cookbooks[2]!.id} slot 999999 >= next 20226`);
  });
```

`runtime.test.ts`：

```ts
describe('菜谱存储位（重新编号 PR 3）', () => {
  it('编号 ↔ 存储位双向对得上；字节串长度 = 最大存储位 + 1', () => {
    const b = buildBundle(readSourceDir(defaultDataDir())).bundle!;
    const c = createGameConfig(b);
    for (const cb of b.cookbooks) {
      expect(c.cookbookIndex.slotOf[cb.id]).toBe(cb.slot);
      expect(c.cookbookIndex.idAt[cb.slot]).toBe(cb.id);
    }
    expect(c.cookbookIndex.slots).toBe(Math.max(...b.cookbooks.map((x) => x.slot)) + 1);
  });
  it('存储位和编号不同时照样对得上', () => {
    const b = buildBundle(readSourceDir(defaultDataDir())).bundle!;
    const n = b.cookbooks.length;
    const c = createGameConfig({ ...b, cookbooks: b.cookbooks.map((x, i) => ({ ...x, slot: n - 1 - i })) });
    expect(c.cookbookIndex.slots).toBe(n);
    expect(c.cookbookIndex.idAt[n - 1]).toBe(b.cookbooks[0]!.id);
    expect(c.cookbookIndex.slotOf[b.cookbooks[0]!.id]).toBe(n - 1);
  });
});
```

Run: `cd packages/config && npx vitest run src/build.test.ts src/runtime.test.ts -t "存储位"` → FAIL。

- [ ] **Step 2: 数据**：用 node 脚本给 `master/cookbooks.json` 每条加 `slot = id`（用 `formatMaster` 重写，规则说明里加一句“slot = 学会记录的存储位，只增不复用，下一个见 game/cookbook_slots.json”）；写 `game/cookbook_slots.json`。
- [ ] **Step 3: 实现** schema、类型、源文件清单、构建（复制 `slot`；`unique('cookbooks slot')` 报 `cookbooks: duplicate slot N`；超出报 `cookbook X slot N >= next M`）、运行时索引。`maxCookbookId` 删掉，编译错误指出所有用处（服务端在 Task 2 改）。
- [ ] **Step 4:** `cd packages/config && npx vitest run && npx tsc -p tsconfig.json --noEmit` → PASS。
- [ ] **Step 5: 提交**（配置包能单独通过；服务端此时编译不过，与 Task 2 合在一个推送里，PR 里按提交看）。

---

### Task 2: 服务端按存储位读写；测试配置打乱存储位

**Files:**
- Modify: `apps/server/test/config.ts`：`testConfig()` 的配置把存储位倒过来排（`slot = n - 1 - 序号`），注释写明这是有意的：让任何按编号取学会记录的代码在测试里失败。
- Modify（按编号取学会记录的地方，全部改成按存储位）：
  - `modules/cookbook/rules.ts`（`streetTargetGrade`、`foodsNeedFor`、`padLevels(levels, slots)`）
  - `modules/cookbook/service.ts`（列表、学菜、升级）
  - `core/scarcity.ts`
  - `modules/cupboard/service.ts`
  - `modules/mysterious/lesson.ts`（遍历已学：按存储位遍历，`idAt` 换回编号；遗忘清零按存储位）
  - `modules/restaurant/rules.ts`（新店字节串长度 `slots`）
  - `modules/settlement/tables.ts`（`splitLearned` 按存储位遍历、返回编号；取品级按存储位）
  - `modules/settlement/globals.ts`（`buildInput` 按存储位写）
  - `modules/takeaway/view.ts`、`modules/takeaway/deliver.ts`
  - `sim/bench.ts`、`sim/bot.ts`、`sim/explain.ts`、`sim/fast/bot.ts`、`sim/fast/state.ts`、`sim/fast/ops.ts`（凡按编号取）
- Modify：测试里按编号构造或读取字节串的（`cookbook.test.ts`、`lesson.test.ts`、`cupboard/scarcity.test.ts`、`sim/fast/bot.test.ts`、`sim/fast/parity.test.ts`、`cookbook/rules.test.ts` 等），改成经 `slotOf`。迁移 0039、0040 的测试不改（它们按当时的编号写，迁移本身就是按编号的）。

**Interfaces:**
- Consumes: Task 1 的 `cookbookIndex.slotOf / idAt / slots`。
- Produces: `cookbookIndex` 是唯一的换算入口；`splitLearned(levels, idx, streetId)` 的签名改成收 `CookbookIndex`（原来收按编号的 `street` 数组）。

- [ ] **Step 1:** 先只改 `test/config.ts`（打乱存储位），跑服务端测试，记下失败的用例（这是待改清单）。
- [ ] **Step 2:** 按上面的文件逐个改，`tsc` 无错后跑服务端全部测试，直到全过。
- [ ] **Step 3:** 再用真实配置（存储位 = 编号）跑一次：临时把 `test/config.ts` 的打乱关掉跑全部测试，确认也全过，然后恢复打乱。
- [ ] **Step 4: 提交。**

---

### Task 3: 新街道导入分配存储位；文档

**Files:**
- Modify: `packages/config/scripts/import-new-streets.ts`：已有的菜保留原 `slot`；新菜从 `cookbook_slots.json` 的 `next` 往后分，写回 `next`；删掉的菜不回收存储位。
- Create: `packages/config/src/streetImport.ts` 加 `assignSlots(prev: Array<{ id: number; slot: number }>, ids: number[], next: number): { slots: Map<number, number>; next: number }`，测试在 `streetImport.test.ts`。
- Modify: `docs/data-maintenance.md`：学会记录按存储位存，存储位只增不复用。

- [ ] **Step 1: 失败的测试**

```ts
describe('新菜谱分配存储位（重新编号 PR 3）', () => {
  it('已有的保留，新的从 next 往后，删掉的不回收', () => {
    const r = assignSlots([{ id: 10, slot: 5 }, { id: 11, slot: 6 }], [11, 12, 13], 7);
    expect([...r.slots]).toEqual([[11, 6], [12, 7], [13, 8]]);
    expect(r.next).toBe(9);
  });
});
```

- [ ] **Step 2-4:** 实现、接进导入脚本；用仓库外数据重跑导入，`git status` 无变化（已有菜存储位不变，`next` 不变）。
- [ ] **Step 5: 提交。**

---

### Task 4: 验证、PR、审查

- [ ] 配置包、服务端、前端全部测试；lint、typecheck、全仓库格式检查。
- [ ] 推送、开 PR；opus 审查整个分支，Critical / Important 先写测试再修，Minor 记 backlog。
