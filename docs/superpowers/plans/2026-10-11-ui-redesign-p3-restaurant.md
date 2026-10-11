# 界面改版 P3 餐厅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把餐厅区域的 8 个页面（首页、楼层、收益、餐厅信息、装扮、厨具含宝石和厨具详情、任务、活动）套上设计 §5 的页面模式，并做出后面几批共用的通用件：数量步进器、底部面板、确认面板、空状态、加载骨架、区域头图。

**Architecture:** 新通用件放在 `apps/web/src/components/`（`DtStepper`、`DtSheet`、`DtConfirmHost`、`DtEmpty`、`DtSkeleton`、`RestaurantHero`），确认走一个 pinia store（`useConfirmStore().ask()` 返回 Promise）。挂了确认宿主时弹底部面板，没挂时退回浏览器确认框，现有测试里对 `window.confirm` 的模拟不用改。头图是独立的场景图 `src/art/scene/restaurant.svg`（`<img>`），门是内容图形 `door-*`，按配置里每扇门的 `art` 叠在头图的门洞上。服务端只多给首页概况一个 `door` 字段。

**Tech Stack:** Vue 3.5、vue-router 4、Pinia、Vitest（jsdom）、Kysely（服务端一处查询）、`@dt/config` 构建校验。

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md`（§2.6~2.8、§3、§5、§6.1 P3 行、§8）。用户 2026-10-11 定的 5 条：放餐厅头图（72px，门跟“装扮”里选的门）；Bootstrap 类名保留，在 `base.css` 里写成完整定义、P9 去掉 Bootstrap 组件部分时验证，逐页只换结构写法；首页资源图标换成彩色扁平图；新通用件 P3 先用在这 8 页；任务列表改成一张卡片里多行。

## Global Constraints

- 不写裸色值：`main.css`、`base.css`、组件 `<style>` 只用 `tokens.css` 的令牌（`theme.test.ts` 检查）。内容图形和头图是固定色，写在 SVG 文件里。
- 文案：简中半角括号、“: ”“, ”（带空格）；法文窄空格写 `\u202f` 转义（脚本里用 `String.fromCharCode(92)` 拼）；繁中最后跑 `pnpm -F @dt/web i18n:tw`，不格式化。
- 改了 `packages/config` 先 `pnpm -F @dt/config build`。改了图形跑 `pnpm -F @dt/web art`（生成文件提交）。
- 体积：两张雪碧图压缩后合计 ≤ 25KB，加头图 ≤ 120KB（`art.test.ts`）。
- 菜园（`YardView.vue`、`components/yard/*`）不改。
- 整行可点 ≥ 40px，按钮 ≥ 32px；“减少动态效果”下没有位移动画；`:focus-visible` 紫色外圈。
- 推送前：`pnpm lint`、`pnpm format:check`、`pnpm typecheck`（看退出码）、`pnpm vitest run --project web --project shared --project config`、服务端相关测试；干净副本重跑一遍。
- 一条五种语言的更新记录（`ui3-1011` 起名按当天）。

## Review Focus

1. 两个确认同时要弹（前一个还开着又点了另一个危险操作）：前一个按“取消”结束，只显示新的；按 Esc、点遮罩都是取消；关掉后焦点回到原来的按钮。——测试在 Task 2。
2. 步进器里打空、打字母、打超过上限或负数、上限变小（比如体力用掉了）：失焦时夹到 [min, max]，加减按钮到头变灰，不会把 NaN 发给服务端。——测试在 Task 1。
3. 配置里新加了一扇门却没画图：配置构建报错；网页测试检查每扇门的 `art` 都有 `door-*` 图形；万一运行时找不到（旧目录缓存），头图显示木门，不空着。——测试在 Task 4。
4. 深色模式下头图上的字：店名、等级叠在头图上要能读（字放在令牌色的底板上，对比度 ≥ 4.5）；头图本身固定色，放在深色底块上不刺眼。——测试在 Task 4（底板颜色用令牌，`theme.test` 覆盖），截图人工看。
5. 首屏密度：首页加头图后首屏行数比改前最多少 1 行；其余页面不少于改前。——截图表在 Task 11。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `components/DtStepper.vue` + test | 数量步进器：− 数字 +，夹在 [min, max]，中间仍是 `<input type="number">`（`data-testid` 照传，现有 `setValue` 测试不用改） |
| `components/DtSheet.vue` + test | 底部面板：遮罩、拖手、标题、内容插槽；Esc 和遮罩关闭；打开时焦点进面板，关掉回到原处 |
| `stores/confirm.ts` + test | `ask({ title, body?, ok?, danger? }): Promise<boolean>`；没挂宿主时退回 `window.confirm` |
| `components/DtConfirmHost.vue` + test | 在 `App.vue` 挂一次，用 `DtSheet` 显示当前确认 |
| `components/DtEmpty.vue` + test | 空状态：内容图形、为什么空、去哪里获得（可选链接） |
| `components/DtSkeleton.vue` + test | 加载骨架：N 行灰条，`aria-busy`，读屏读“加载中” |
| `components/RestaurantHero.vue` + test | 餐厅头图：场景图 + 门 + 叠字插槽 |
| `art/scene/restaurant.svg` | 头图（320×72 的 viewBox，固定色） |
| `art/content/door-*.svg`（8 个）、`empty-equip.svg`、`empty-activity.svg` | 门、空状态图形 |
| `packages/config/data/game/looks.json`、`src/raw.ts`、`src/build.ts` | 门加 `art`，校验 |
| `packages/shared/src/schemas/world.ts`、`restaurant.ts` | `LooksDto.doors[].art`、`RestaurantDto.door` |
| `apps/server/src/modules/restaurant/service.ts` | 概况带 `door` |
| 8 个页面及其组件 | 套模式 |

---

### Task 1: 数量步进器 DtStepper

**Files:** Create `apps/web/src/components/DtStepper.vue`、`DtStepper.test.ts`；Modify `src/styles/main.css`（`.dt-stepper`）。

**Interfaces — Produces:** `<DtStepper v-model="n" :min="1" :max="99" :step="1" testid="levelup-num-44" :disabled="busy" :aria-label="…" />`；`modelValue: number`；`update:modelValue` 只发夹好的整数。

- [ ] Step 1：测试（先失败）：
  - 点 + 加一、点 − 减一；到 max 时 + 变灰，到 min 时 − 变灰。
  - 输入框 `setValue('7')` → 发 7；`setValue('')`、`setValue('abc')` 失焦后回到 min（不发 NaN）；`setValue('500')`（max 99）失焦后变 99；`setValue('3.5')` → 3。
  - `max` 从 10 改成 4、当前是 8 → 发 4。
  - `testid` 落在 `<input>` 上；按钮有 `aria-label`（`t.common.decrease` / `increase`，新文案：减少 / 增加；Decrease / Increase；Diminuer / Augmenter；Disminuir / Aumentar）。
- [ ] Step 2：实现：

```vue
<script setup lang="ts">
import { watch } from 'vue';
import { useT } from '../composables/useT';

/** 数量步进器（界面改版设计 §5 第 6 条）：取代固定宽度的数字框；中间仍能直接打字，失焦时夹到范围里 */
const props = withDefaults(
  defineProps<{ modelValue: number; min?: number; max?: number; step?: number; testid?: string; disabled?: boolean }>(),
  { min: 0, max: Number.MAX_SAFE_INTEGER, step: 1, testid: undefined, disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [n: number] }>();
const t = useT();
const clamp = (n: number) => Math.min(props.max, Math.max(props.min, Math.floor(Number.isFinite(n) ? n : props.min)));
const set = (n: number) => {
  const v = clamp(n);
  if (v !== props.modelValue) emit('update:modelValue', v);
};
function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const n = Number(raw);
  // 打字时只在是合法数字时跟着变，空的、半截的等失焦再处理
  if (raw !== '' && Number.isFinite(n)) set(n);
}
function onBlur(e: Event) {
  const el = e.target as HTMLInputElement;
  set(Number(el.value === '' ? Number.NaN : el.value));
  el.value = String(clamp(props.modelValue));
}
// 上限变小（体力用掉了）：当前值跟着夹
watch(() => [props.min, props.max], () => set(props.modelValue));
</script>

<template>
  <div class="dt-stepper">
    <button type="button" :aria-label="t.common.decrease" :disabled="disabled || modelValue <= min" @click="set(modelValue - step)">−</button>
    <input type="number" inputmode="numeric" :min="min" :max="max" :value="modelValue" :disabled="disabled" :data-testid="testid" @input="onInput" @blur="onBlur" />
    <button type="button" :aria-label="t.common.increase" :disabled="disabled || modelValue >= max" @click="set(modelValue + step)">+</button>
  </div>
</template>
```

  CSS：`.dt-stepper { display: inline-flex; align-items: center; height: 32px; border: 1px solid var(--dt-line-strong); border-radius: var(--dt-radius-pill); overflow: hidden; }`，按钮 32px 宽、无边框、`color: var(--dt-primary-ink)`，禁用时 `var(--dt-disabled-text)`；输入框 48px 宽、居中、`font-variant-numeric: tabular-nums`、去掉浏览器自带的上下箭头。
- [ ] Step 3：跑 `pnpm vitest run src/components/DtStepper.test.ts`，通过；提交 `feat(web): 数量步进器 DtStepper（界面改版 P3）`。

---

### Task 2: 底部面板和确认面板

**Files:** Create `components/DtSheet.vue` + test、`stores/confirm.ts` + test、`components/DtConfirmHost.vue` + test；Modify `App.vue`、`main.css`（`.dt-sheet*`）、i18n `common`（`cancel`、`confirm` 已有就复用）。

**Interfaces — Produces:**
- `<DtSheet :open="x" :title="…" @close="…"><template #default/><template #actions/></DtSheet>`
- `useConfirmStore().ask({ title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean>`
- `useConfirmStore().hosts`（宿主计数）；没有宿主时 `ask` 返回 `Promise.resolve(window.confirm(body ? `${title}\n${body}` : title))`。

- [ ] Step 1：测试（先失败）：
  - store：没宿主时调 `window.confirm`（spy），返回它的结果；有宿主时不调，`current` 是这次的请求；`answer(true)` 让 Promise 得 true；开着一个再 `ask` 另一个 → 前一个得 false，`current` 换成新的。
  - `DtSheet`：`open` 时渲染 `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 指向标题；按 Esc、点遮罩都发 `close`；打开后焦点在面板里第一个按钮，关掉后回到打开前的元素。
  - `DtConfirmHost`：挂上后 `hosts` 为 1、卸载回 0；显示标题、正文；`danger` 时确认按钮是 `btn-outline-danger`，否则 `btn-primary`；点确认 → true，点取消 → false。
- [ ] Step 2：实现。`DtSheet` 用 `<Teleport to="body">`，遮罩 `var(--dt-scrim)`，面板 `var(--dt-surface)`、上圆角 `var(--dt-radius-md)`、`var(--dt-shadow-float)`；进场在 `prefers-reduced-motion: no-preference` 下从下方 `translateY(100%)` 滑入，`var(--dt-dur-panel)` + `var(--dt-ease-drawer)`，否则只淡入。打开时给 `body` 加 `overflow: hidden`，关掉恢复。`App.vue` 在 `<EventToast>` 前加 `<DtConfirmHost />`。
- [ ] Step 3：跑这三个测试文件和 `App` 相关测试，通过；提交 `feat(web): 底部面板和确认面板（界面改版 P3）`。

---

### Task 3: 空状态和加载骨架

**Files:** Create `components/DtEmpty.vue` + test、`components/DtSkeleton.vue` + test、`art/content/empty-equip.svg`、`art/content/empty-activity.svg`；Modify `main.css`（`.dt-empty` 改成新样子、`.dt-skel`）；跑 `pnpm -F @dt/web art`。

**Interfaces — Produces:** `<DtEmpty art="empty-equip" :title="…" :body="…" :to="'/temple'" :link="…" testid="…" />`；`<DtSkeleton :rows="4" />`。

- [ ] Step 1：测试（先失败）：`DtEmpty` 渲染图形（`DtArt`，`aria-hidden`）、标题、正文，有 `to` 时一个 `.dt-go` 链接；`DtSkeleton` 渲染 N 个 `.dt-skel-row`，外层 `aria-busy="true"`，有一段 `visually-hidden` 的 `t.common.loading`。`art.test` 的名字表测试会因为新图形失败，跑 `art` 后通过。
- [ ] Step 2：画两张图（48×48，B 风格平涂，`empty-` 前缀）：空的厨具架（锅铲挂钩、空挂钩）、日历上一个问号。实现组件：`.dt-empty` 居中、图形 64px、标题 14px 粗体、正文 13px `var(--dt-muted)`；骨架行 12px 高、`var(--dt-surface-2)` 底，`prefers-reduced-motion: no-preference` 时 1.2s 明暗呼吸（只动 `opacity`）。
- [ ] Step 3：跑测试和 `art.test.ts`，提交 `feat(web): 空状态和加载骨架（界面改版 P3）`。

---

### Task 4: 门的数据和餐厅头图

**Files:**
- Modify `packages/config/data/game/looks.json`（每扇门加 `art`：wood、red、glass、bamboo、iron、arch、pirate、krabby）、`packages/config/src/raw.ts`（`art: z.string().regex(/^[a-z]+$/)`）、`packages/config/src/build.ts`（`art` 不能重复）+ `build.test.ts`。
- Modify `packages/shared/src/schemas/world.ts`（`LooksDto.doors` 加 `art: string`）、`packages/shared/src/schemas/restaurant.ts`（`RestaurantDto` 加 `door: number`）。
- Modify `apps/server/src/modules/restaurant/service.ts`（概况查询带上 `restaurants.door`，`rules.ts` 的 DTO 组装加 `door`）+ 服务端概况测试。
- Create `apps/web/src/art/content/door-{wood,red,glass,bamboo,iron,arch,pirate,krabby}.svg`、`apps/web/src/art/scene/restaurant.svg`、`components/RestaurantHero.vue` + test；Modify `art/art.test.ts`（内容前缀加 `door`；场景图：名字规则、`viewBox="0 0 320 72"`、没有脚本外链；每扇门的 `art` 都有图形）、`views/dev/ArtGalleryView.vue`（列出场景图和门）。

**Interfaces — Produces:** `<RestaurantHero :door="rest.door"><slot /></RestaurantHero>`：读 `catalog.looks?.doors` 找 `art`，找不到用 `wood`；场景图用 `new URL('../art/scene/restaurant.svg', import.meta.url).href`（`artAssets` 的 `inlineLimit` 已经让 SVG 不内联）。

- [ ] Step 1：测试（先失败）：
  - config：门缺 `art`、两扇门 `art` 重复 → 构建报错。
  - server：概况里有 `door`，换门后变。
  - web：`RestaurantHero` 渲染 `<img alt="" loading="lazy">`、门的 `DtArt name="door-red"`（door 1）、找不到时 `door-wood`；插槽内容在叠字层里；叠字层有 `.dt-hero-plate` 类（令牌底色）。`art.test`：每扇门（从 `@dt/config` 的生成包里读）都有 `door-<art>`。
- [ ] Step 2：实现。头图画法：浅紫灰的街道底、店面（招牌条、遮阳棚条纹、两扇窗、门洞留空），右侧三分之二是店面、左侧留给叠字；门图形 48×48，在头图里按 40px 叠到门洞位置。深色模式下头图外层加 `var(--dt-surface-2)` 底块、图片 `opacity` 不变。叠字底板 `.dt-hero-plate`：`background: color-mix(in srgb, var(--dt-surface) 85%, transparent)`，文字 `var(--dt-text)`。
- [ ] Step 3：`pnpm -F @dt/config build`、`pnpm -F @dt/web art`，跑 config、shared、server 概况测试和 web 的 `art.test`、`RestaurantHero.test`，通过；提交 `feat: 门配图形、首页概况带当前的门，餐厅头图（界面改版 P3）`。

---

### Task 5: 首页

**Files:** Modify `views/RestaurantHomeView.vue` + test、`main.css`。

- [ ] Step 1：测试（先失败），改 `RestaurantHomeView.test`：
  - 顶部是 `RestaurantHero`（`data-testid="home-hero"`），里面有街道、星级、等级、停业和称号标签；原来的第一行不在了。
  - 资源行用 `DtArt`：`res-coin-silver`、`res-diamond`、`res-strength`、`res-prestige`、`res-oil`；经验条里是 `res-exp`；原来的 `bi-coin`、`bi-gem`、`bi-lightning`、`bi-award`、`bi-droplet` 不在了。读屏文字（`visually-hidden` 或 `title`）保留。
  - 设施格子用 `fac-*` 界面图标（`fac-poster`、`fac-trophy`、`fac-oilsaver`、`fac-mousetrap`、`fac-roach`、`fac-plaque`，按设施键对应，不写编号）。
  - 各区块标题前有 `sec-*` 图标：今日待办 `sec-tasks`、小镇新闻 `sec-news`、餐厅动态 `sec-feed`、设施 `sec-star`、生效的加成 `sec-bonus`。
  - 两处确认（升级设施、二级牌匾）改走 `useConfirmStore().ask`：没宿主时仍调 `window.confirm`，原测试不用改；新加一条：有宿主时不调 `window.confirm`，`ask` 收到的 `danger` 是 false、`ok` 是对应按钮文案。
  - 概况没读回来时显示 `DtSkeleton`（`data-testid="home-skeleton"`），不再空白。
- [ ] Step 2：实现。头图里叠：第一行“街道 · N 星”（13px），第二行等级（20px 粗），第三行状态标签。经验条紧跟头图。资源两列网格保留，图标 16px。
- [ ] Step 3：跑 `RestaurantHomeView.test`、全量 web 测试，提交 `feat(web): 首页加餐厅头图、资源和设施配图（界面改版 P3）`。

---

### Task 6: 楼层、收益、餐厅信息

**Files:** Modify `components/TableGrid.vue` + test、`views/RestFloorView.vue` + test、`views/RestIncomeView.vue` + test、`views/RestInfoView.vue` + test、`main.css`。

- [ ] Step 1：测试（先失败）：
  - `TableGrid`：每桌是 `.dt-table-cell`（4 列网格，选中 `aria-pressed="true"`）；有蟑螂的桌 `.is-roach`、白食的桌 `.is-freeloader`；楼层切换是筛选胶囊 `.dt-pills`（不再是一排按钮）。
  - 楼层：选中桌的详情在 `.dt-card`（`data-testid="table-detail"`），灭蟑螂是主按钮、赶白食是危险描边按钮。
  - 收益：加成收进 `.dt-card` 里的 `<details>`；记录表 `.dt-num-table`（数字列右对齐、等宽数字）；今天的小计是键值行。
  - 餐厅信息：属性、容量用 `.dt-kv`（`dl`，每项一对 `dt`/`dd`）；个人日志每条一行 `.dt-feed`（时间写月日时分）；还没读回来时 `DtSkeleton`；没有日志时 `DtEmpty`（不配图，只文字）。
- [ ] Step 2：实现。`.dt-num-table td { font-variant-numeric: tabular-nums; }`；`.dt-table-cell` 最小高 56px、圆角 `var(--dt-radius-sm)`、`var(--dt-line)` 边；蟑螂 `var(--dt-ink-danger)` 字和 `var(--dt-soft-danger)` 底；选中 2px `var(--dt-primary)` 边。
- [ ] Step 3：跑这四个测试文件和好友餐厅页测试（也用 `TableGrid`），提交 `feat(web): 楼层、收益、餐厅信息套用行和卡片（界面改版 P3）`。

---

### Task 7: 装扮和称号

**Files:** Modify `views/RestLookView.vue` + test、`main.css`。

- [ ] Step 1：测试（先失败）：
  - 头像、门是选择胶囊 `.dt-choice`（选中 `aria-pressed="true"`），门的胶囊里有 `door-*` 图形；当前门的胶囊不能点。
  - 公告栏、限定称号、个性图标各在一张 `.dt-card` 里；限定称号每个一行 `.dt-item`（名字、说明、价格和剩余天数，右边按钮）；个性图标每个一行，右边是开关（`role="switch"`、`aria-checked`）。
  - 买称号走 `ask`（`ok` 是“购买”，正文写银币数）。
- [ ] Step 2：实现。`.dt-choice` 用浅紫描边胶囊，选中实心紫（与筛选胶囊区分：筛选是正文色实心）。开关用 P1 已有的 `.form-switch` 样式。
- [ ] Step 3：跑测试，提交 `feat(web): 装扮页改成选择胶囊和行（界面改版 P3）`。

---

### Task 8: 厨具、宝石、厨具详情

**Files:** Modify `views/EquipView.vue` + test、`components/equip/AttrPoints.vue`、`components/equip/GemPanel.vue` + test、`views/EquipDetailView.vue` + test、`main.css`。

- [ ] Step 1：测试（先失败）：
  - 部位格子用 `slot-*` 图标（铲 `slot-spatula`、刀 `slot-knife`、锅 `slot-pot`、瓶 `slot-bottle`、帽 `slot-hat`，按部位编号 1~5 对应，部位编号是 `PART_NAMES` 已有的键）。
  - “预设”“一键处理”打开 `DtSheet`（`data-testid="sheet-presets"`、`sheet-batch"`），不再在页面中间展开；面板里原来的 testid 都在。
  - 删除预设、一键处理走 `ask`（一键处理 `danger: true`）。
  - 一件厨具都没有时（`o.count === 0`）部位下面显示 `DtEmpty art="empty-equip"`，写去哪里获得（神殿鉴定、厨塔），链接到 `/temple`。
  - 加点用 `DtStepper`（testid 仍是 `add-<属性>`，原测试的 `setValue` 照常）。
  - 宝石：升级组数用 `DtStepper`（`levelup-num-<id>`）；没有宝石时 `DtEmpty`（不配图）。
  - 厨具详情：回退强化、拆宝石、分解、出售走 `ask`；分解、出售 `danger: true`；属性表 `.dt-num-table`；强化、宝石两块各一张 `.dt-card`。
- [ ] Step 2：实现。属性表数字等宽右对齐。
- [ ] Step 3：跑这几个测试文件，提交 `feat(web): 厨具页部位配图、预设和一键处理放进底部面板、确认改面板（界面改版 P3）`。

---

### Task 9: 任务

**Files:** Modify `components/QuestCard.vue` + test、`views/RestTasksView.vue` + test、`components/tasks/ActivationPanel.vue` + test、`main.css`。

- [ ] Step 1：测试（先失败）：
  - `QuestCard` 渲染成一行 `.dt-item.dt-quest`（不再是带边框的卡片）：名字、奖励一行小字、右边是进度数字或“领奖”按钮；没完成的下面一条 4px 进度条；可领的行 `.is-ready`（左边 3px 紫色竖条）；已领的 `.is-claimed`（次要色）。
  - 任务页：主线、补领、每周、支线各自的任务都在一张 `.dt-card` 里，行之间细线分隔；章末、每周全完成按钮在卡片底部。
  - 今日：还没读回来时 `DtSkeleton`；活跃格子保持网格。
- [ ] Step 2：实现。
- [ ] Step 3：跑测试，提交 `feat(web): 任务改成卡片里的行（界面改版 P3）`。

---

### Task 10: 活动

**Files:** Modify `views/ActivitiesView.vue` + test、`components/activity/ActivityExchange.vue` + test、`main.css`。

- [ ] Step 1：测试（先失败）：
  - 没有活动时 `DtEmpty art="empty-activity"`（`data-testid="activity-empty"`），写“现在没有活动, 开了会在首页提示”。
  - 解锁战令走 `ask`。
  - 兑换次数用 `DtStepper`（testid `times-<id>-<i>` 不变）。
  - 还没读回来时 `DtSkeleton`。
- [ ] Step 2：实现。
- [ ] Step 3：跑测试，提交 `feat(web): 活动页空状态、兑换步进器、确认面板（界面改版 P3）`。

---

### Task 11: 规范、更新记录、截图、审查、PR

- [ ] `docs/design/视觉规范.md`：§5 补“通用件”一节（`DtStepper`、`DtSheet`、确认、`DtEmpty`、`DtSkeleton`、头图的写法和什么时候用）；§2.8 写明“Bootstrap 类名保留、`base.css` 是完整定义，P9 验证”。
- [ ] 更新记录（五种语言）：首页有了自己的店面图, 门跟装扮里选的一样；银币、钻石这些换成彩色小图；确认改成从下面弹出的面板；加减数量用 − + 按钮；任务列表更紧凑；厨具的预设和一键处理在底部面板里。
- [ ] 全量检查 + 干净副本重跑。
- [ ] 截图（同 P2b 的方式）：首页、楼层、收益、餐厅信息、装扮、厨具、宝石、任务（今日、主线）、活动，外加确认面板打开时的首页一张；简中 390px 浅色深色、法文英文 360px；溢出 0；首屏行数表（Review Focus 5）。放 `docs/design/改版-P3/`。
- [ ] 整体审查（新的审查员）→ 修 Critical/Important（先写失败的测试）→ 小问题记 backlog。
- [ ] 推送开 PR：`feat: 界面改版 P3 餐厅——头图、步进器、底部面板和确认、空状态和骨架`。
