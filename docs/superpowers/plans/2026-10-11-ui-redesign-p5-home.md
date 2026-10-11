# 界面改版 P5 首页（新方向）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户选定的样稿 B 重排首页：放大的场景头图、等级环、资源胶囊、营业状态卡（停业时整宽“加满油”）、上一轮统计块、今日 2×2 操作块；同时落下新方向的令牌、根页面大标题和几个通用件，供 P6、P7 用。

**Architecture:** 新令牌写进 `tokens.css`；顶栏按路由给根页面大标题、给 `meta.scene` 页面换成天空底色；首页拆出 `HomeScene`（头图）、`HomeStatus`（营业状态）两个组件，通用件 `DtLevelRing`、`DtResPill`、`DtStatTile` 放 `components/`；`RestaurantHomeView.vue` 只负责拼装和数据。所有现有 `data-testid` 保留（测试大量依赖），行为不变，只改结构和样式。

**Tech Stack:** Vue 3.5 + Pinia + Vitest（jsdom），CSS 令牌，SVG 雪碧图（`DtArt`）。

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md` 第 1.1 节（方向调整）、第 2~5 节；样稿 https://claude.ai/artifact/DPpPNDrEuLwu3VFXYK5jSA 的“首页 · B 小镇橱窗”。

## Global Constraints

- 裸色值只能写在 `tokens.css`（`theme.test`）；浅色、深色两套文字对比度 ≥ 4.5。
- `main.css` 顶层同一个类不定义两次（`mainCss.test`）。
- 简中文案用半角括号、“: ”“, ”；法文窄空格写 `\u202f` 转义（用 Edit 工具写，不用 Write/Bash）；繁中最后跑 `pnpm -F @dt/web i18n:tw`。
- 新的 Bootstrap Icons 符号要跑 `pnpm -F @dt/web icons`。
- 动效：按下 `scale(0.97)` 120ms；只动 transform 和 opacity；`prefers-reduced-motion` 下去掉位移。
- 整行可点 ≥ 40px，按钮 ≥ 32px；主操作按钮 46~48px 高。
- 每个 PR 一条五种语言的更新记录。
- 菜园不动。
- 提交前顺序：prettier → 测试（看 `web=0`）→ lint → commit。

## Review Focus

1. 营业状态的三种情况：停业（`state === 2`）、营业中油不满、油是满的（加油按钮灰掉、写“油是满的”）；银币不够加满时按钮写“加油”和实际花费（`refuelCost < refuelNeed`）。——测试在 Task 4。
2. 等级环在经验为 0、超过升级所需（满级或数据异常）时：百分比夹在 0~100，读屏文字正确。——测试在 Task 2。
3. 今日 2×2 在“签到读失败（`signedIn === null`）”“任务读失败（没有主线行）”“区服关掉任务功能”时：缺的块不留空洞，剩下的块照样排满。——测试在 Task 5。
4. 法文、西文 360px 下：资源胶囊、今日块、状态卡按钮不溢出、不截掉数字。——截图在 Task 7。
5. 深色模式下头图天空、山、地面用令牌色，店面插画保持原色、看得清。——截图在 Task 7，令牌测试在 Task 1。

---

### Task 1: 新方向令牌、根页面大标题、场景顶栏

**Files:**
- Modify: `apps/web/src/styles/tokens.css`（浅色、深色两块）
- Modify: `apps/web/src/styles/main.css`（`.dt-card` 圆角、`.dt-header-root`、`.dt-header-scene`）
- Modify: `apps/web/src/components/AppHeader.vue`
- Modify: `apps/web/src/router.ts`（首页路由 `meta.scene: true`）、`apps/web/src/nav/routeMeta.ts`（`RouteMeta` 类型加 `scene?: boolean`，如果类型在这里）
- Test: `apps/web/src/components/AppHeader.test.ts`、`apps/web/src/styles/theme.test.ts`（新令牌两套都有）

**Interfaces:**
- Produces: 令牌 `--dt-radius-lg`（16px）、`--dt-radius-sheet`（22px）、`--dt-shadow-card`（深色下 `none`）、`--dt-scene-sky`、`--dt-scene-hill`、`--dt-scene-ground`、`--dt-plate`；类 `.dt-header-root`、`.dt-header-scene`；路由元信息 `meta.scene`。

- [ ] **Step 1: 写失败的测试**

`AppHeader.test.ts` 加：

```ts
it('底部导航的根页面用大标题；带 meta.scene 的页面顶栏是天空底色（界面改版 P5）', async () => {
  const w = await mountAt('/'); // 用文件里现有的挂载帮手；没有就照现有测试的写法建 router
  expect(w.get('header').classes()).toContain('dt-header-root');
  expect(w.get('header').classes()).toContain('dt-header-scene');
  const sub = await mountAt('/rest/floor');
  expect(sub.get('header').classes()).not.toContain('dt-header-root');
  expect(sub.get('header').classes()).not.toContain('dt-header-scene');
});
```

`theme.test.ts` 加：新令牌在浅色、深色两块里都定义了：

```ts
it.each(['--dt-scene-sky', '--dt-scene-hill', '--dt-scene-ground', '--dt-plate', '--dt-shadow-card'])(
  '%s 浅色、深色都有（界面改版 P5）',
  (name) => {
    expect(lightBlock).toContain(`${name}:`);
    expect(darkBlock).toContain(`${name}:`);
  },
);
```

（`lightBlock`、`darkBlock` 用文件里现有的切块方法取；没有就按 `:root {` 和 `:root[data-theme="dark"]` 切。）

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm -F @dt/web exec vitest run src/components/AppHeader.test.ts src/styles/theme.test.ts`
Expected: 新加的用例 FAIL（类名不存在、令牌没定义）。

- [ ] **Step 3: 实现**

`tokens.css` 浅色块加：

```css
  --dt-radius-lg: 16px;
  --dt-radius-sheet: 22px;
  --dt-shadow-card: 0 6px 20px rgba(46, 26, 74, 0.1), 0 1px 4px rgba(46, 26, 74, 0.06);
  --dt-scene-sky: #e6dcf7;
  --dt-scene-hill: #d6c8ee;
  --dt-scene-ground: #cbbbe3;
  --dt-plate: #f6f0fd;
```

深色块加：

```css
  --dt-shadow-card: none;
  --dt-scene-sky: #2a2140;
  --dt-scene-hill: #332850;
  --dt-scene-ground: #3d3158;
  --dt-plate: #2a2335;
```

`main.css`：`.dt-card` 的 `border-radius` 改成 `var(--dt-radius-lg)`；`DtSheet` 面板的圆角改成 `var(--dt-radius-sheet)`；新增

```css
/* 底部导航的 6 个根页面：大标题（界面改版 P5，设计 §1.1 第 7 条） */
.dt-header-root .dt-header-title {
  font-size: 22px;
  font-weight: 700;
}
/* 有场景头图的页面：顶栏和天空同色、不画底线，像头图的一部分 */
.dt-header-scene {
  background: var(--dt-scene-sky);
  border-bottom-color: transparent;
}
```

`AppHeader.vue`：`<header class="dt-header" :class="{ 'dt-header-root': !parent && inGame, 'dt-header-scene': !!route.meta.scene }">`。首页路由加 `scene: true`。

- [ ] **Step 4: 跑测试，确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/styles apps/web/src/components/AppHeader.vue apps/web/src/components/AppHeader.test.ts apps/web/src/router.ts apps/web/src/nav
git commit -m "feat(web): 新方向令牌、根页面大标题、场景顶栏"
```

### Task 2: 通用件 DtLevelRing、DtResPill、DtStatTile

**Files:**
- Create: `apps/web/src/components/DtLevelRing.vue` + `.test.ts`
- Create: `apps/web/src/components/DtResPill.vue` + `.test.ts`
- Create: `apps/web/src/components/DtStatTile.vue` + `.test.ts`
- Modify: `apps/web/src/styles/main.css`
- Modify: `apps/web/src/i18n/locales/{zh-CN,en,fr,es}/common.ts`（`levelRing`）

**Interfaces:**
- Produces:
  - `<DtLevelRing :level="number" :percent="number" :size="72" />`：圆环进度 + “Lv”+等级数字；`percent` 夹到 0~100；根元素 `role="img"`，`aria-label` = `t.common.levelRing(level, percent)`（简中“等级 7, 经验 64%”）；圆环的进度弧 `data-testid="level-ring-arc"`，`stroke-dasharray` 按百分比算。
  - `<DtResPill :art="ArtName" :label="string" :tone="'danger' | undefined">值</DtResPill>`：胶囊，左图右值，`label` 给读屏（`visually-hidden`）；`tone="danger"` 时值是危险色。
  - `<DtStatTile :value="string" :label="string" :tone="'good' | 'bad' | undefined" />`：大数字 + 小标签的块。

- [ ] **Step 1: 写失败的测试**

```ts
// DtLevelRing.test.ts
it('百分比夹在 0~100，读屏写等级和经验百分比', () => {
  const w = mount(DtLevelRing, { props: { level: 7, percent: 64 } });
  expect(w.get('[role="img"]').attributes('aria-label')).toBe('等级 7, 经验 64%');
  expect(w.text()).toContain('7');
  const over = mount(DtLevelRing, { props: { level: 99, percent: 180 } });
  expect(over.get('[role="img"]').attributes('aria-label')).toBe('等级 99, 经验 100%');
  const under = mount(DtLevelRing, { props: { level: 1, percent: -5 } });
  expect(under.get('[data-testid="level-ring-arc"]').attributes('stroke-dasharray')).toMatch(/^0(\.0+)? /);
});
// DtResPill.test.ts
it('图形 + 值，名字给读屏；危险色', () => {
  const w = mount(DtResPill, { props: { art: 'res-oil', label: '油', tone: 'danger' }, slots: { default: '0' } });
  expect(w.get('use').attributes('href')).toContain('#res-oil');
  expect(w.get('.visually-hidden').text()).toBe('油');
  expect(w.classes()).toContain('is-danger');
});
// DtStatTile.test.ts
it('大数字和标签；好坏用颜色', () => {
  const w = mount(DtStatTile, { props: { value: '+491', label: '银币', tone: 'good' } });
  expect(w.get('.dt-stat-value').text()).toBe('+491');
  expect(w.get('.dt-stat-label').text()).toBe('银币');
  expect(w.classes()).toContain('is-good');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm -F @dt/web exec vitest run src/components/DtLevelRing.test.ts src/components/DtResPill.test.ts src/components/DtStatTile.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

`DtLevelRing.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '../composables/useT';

/** 等级环（界面改版 P5，样稿 B）：外圈是经验进度，中间是等级 */
const props = withDefaults(defineProps<{ level: number; percent: number; size?: number }>(), { size: 72 });
const t = useT();
const pct = computed(() => Math.max(0, Math.min(100, Math.round(props.percent))));
const R = 30;
const C = 2 * Math.PI * R;
const dash = computed(() => `${((pct.value / 100) * C).toFixed(1)} ${C.toFixed(1)}`);
</script>

<template>
  <div class="dt-level-ring" role="img" :aria-label="t.common.levelRing(level, pct)" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" viewBox="0 0 72 72" aria-hidden="true">
      <circle class="dt-level-ring-track" cx="36" cy="36" :r="R" />
      <circle class="dt-level-ring-arc" data-testid="level-ring-arc" cx="36" cy="36" :r="R" :stroke-dasharray="dash" transform="rotate(-90 36 36)" />
    </svg>
    <span class="dt-level-ring-text" aria-hidden="true"><small>Lv</small><b>{{ level }}</b></span>
  </div>
</template>
```

`DtResPill.vue`、`DtStatTile.vue` 按 Interfaces 写；CSS（`main.css`）：

```css
/* 等级环、资源胶囊、统计块（界面改版 P5） */
.dt-level-ring {
  position: relative;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--dt-surface);
  box-shadow: var(--dt-shadow-card);
}
.dt-level-ring-track,
.dt-level-ring-arc {
  fill: none;
  stroke-width: 5;
}
.dt-level-ring-track {
  stroke: var(--dt-line);
}
.dt-level-ring-arc {
  stroke: var(--dt-primary);
  stroke-linecap: round;
}
.dt-level-ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.dt-level-ring-text small {
  font-size: 11px;
  color: var(--dt-muted);
}
.dt-level-ring-text b {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}
.dt-res-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 34px;
  padding: 0 10px 0 6px;
  border-radius: 999px;
  border: 1px solid var(--dt-line);
  background: var(--dt-surface);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dt-res-pill.is-danger {
  color: var(--dt-ink-danger);
}
.dt-stat {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--dt-line);
  background: var(--dt-surface);
}
.dt-stat-value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dt-stat-label {
  font-size: 11px;
  color: var(--dt-muted);
}
.dt-stat.is-good .dt-stat-value {
  color: var(--dt-ink-success);
}
.dt-stat.is-bad .dt-stat-value {
  color: var(--dt-ink-danger);
}
```

文案 `common.levelRing`：简中 `(lv, pct) => \`等级 ${lv}, 经验 ${pct}%\``；英文 `Level ${lv}, ${pct}% XP`；法文 `Niveau ${lv}, ${pct}\u202f% d’expérience`；西文 `Nivel ${lv}, ${pct} % de experiencia`。

- [ ] **Step 4: 跑测试，确认通过** — 同 Step 2，Expected: PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(web): 等级环、资源胶囊、统计块"`

### Task 3: 首页场景头图 HomeScene

**Files:**
- Create: `apps/web/src/components/home/HomeScene.vue` + `.test.ts`
- Modify: `apps/web/src/views/RestaurantHomeView.vue`（用 `HomeScene` 换掉 `RestaurantHero`、经验条和 `.dt-page-meta` 一行）
- Modify: `apps/web/src/views/RestaurantHomeView.test.ts`（经验条的断言改成等级环）
- Modify: `apps/web/src/styles/main.css`、`apps/web/src/i18n/locales/{4}/home.ts`

**Interfaces:**
- Consumes: Task 1 的场景令牌；Task 2 的 `DtLevelRing`。
- Produces: `<HomeScene :door="number" :closed="boolean">` 插槽 `meta`（街道星级天气一行）；首页头图下方一行：`DtLevelRing` + 称号 + 经验数字（`data-testid="exp-text"`）。

做法：
- 头图 196px，左右顶到屏幕边（`margin: 0 calc(-1 * var(--dt-page-pad))`，用页面现有的左右内边距变量；没有变量就用 `-12px` 并在注释里写明来自 `.dt-main` 的内边距）。底是一段内联 SVG（天空、山坡、地面三块，`fill` 用 `var(--dt-scene-*)`），店面用现有 `restaurant.svg`（`<img>`）放大到约 300×100、靠下居中；门 `DtArt` 叠在门洞上（位置按放大比例换算）。
- 停业时招牌上挂一块红底白字“停业中”（`data-testid="scene-closed"`，文案 `home.closedSign`），不再在别处放“停业”标签。
- 头图左上角一行：街道 · 星级 · 天气（天气是去 `/weather` 的链接），右上角“碎片”小胶囊链接（原 `.dt-page-meta` 的两个链接搬进来，`dt-go` 类保留）。
- 头图下：等级环（72px，往上压进头图 30px）+ 称号（`IconTag`，`data-testid="my-icons"`）+ 经验数字 `exp-text`（“经验 15,610 / 24,500”）。`rest-level` 放在等级环的数字上。`exp-bar` 改为等级环的 `level-ring-arc`，测试相应改。

- [ ] **Step 1: 写失败的测试**（`HomeScene.test.ts`）

```ts
it('停业时招牌上挂“停业中”；营业时不挂', () => {
  expect(mount(HomeScene, { props: { door: 0, closed: true } }).find('[data-testid="scene-closed"]').text()).toBe('停业中');
  expect(mount(HomeScene, { props: { door: 0, closed: false } }).find('[data-testid="scene-closed"]').exists()).toBe(false);
});
it('门按装扮里选的画；找不到的门画木门', () => { /* 目录 looks.doors 放一扇 art: 'red' 的门，断言 #door-red；door: 999 断言 #door-wood */ });
```

`RestaurantHomeView.test.ts`：原来断言 `exp-bar` 宽度的用例改成断言 `level-ring-arc` 的 `stroke-dasharray` 和等级环的 `aria-label`；原来断言 `.dt-page-meta` 里天气、碎片链接的用例改成在 `home-hero` 里找。

- [ ] **Step 2: 跑测试，确认失败** — `pnpm -F @dt/web exec vitest run src/components/home src/views/RestaurantHomeView.test.ts`
- [ ] **Step 3: 实现**（按上面的做法）
- [ ] **Step 4: 跑测试，确认通过**
- [ ] **Step 5: 提交** — `feat(web): 首页场景头图和等级环`

### Task 4: 资源胶囊和营业状态卡 HomeStatus

**Files:**
- Create: `apps/web/src/components/home/HomeStatus.vue` + `.test.ts`
- Modify: `apps/web/src/views/RestaurantHomeView.vue`、`.test.ts`
- Modify: `apps/web/src/i18n/locales/{4}/home.ts`、`apps/web/src/styles/main.css`

**Interfaces:**
- Consumes: `DtResPill`；现有 `refuelNeed`、`refuelCost`、`endpoints.refuel`、`act`。
- Produces: `<HomeStatus :rest="RestaurantDto" :busy="boolean" @refuel>`；资源一行 `data-testid="home-resources"`：银币 `rest-coin`、体力 `rest-strength`、钻石、声望 `rest-renown` 四个胶囊（油不在这里，在状态卡里）。

状态卡（`data-testid="home-oil"`，主角卡片，`box-shadow: var(--dt-shadow-card)`）三种：
1. 停业（`rest.state === 2`）：左边 52px 浅红底块里放油滴图，标题 `home.statusClosed`（“油用光了, 餐厅停业”），一行 `油 0 / 1,000 · 加满就能继续营业`；下面整宽 46px 主按钮 `data-testid="refuel"`：`加满油`/`加油` + 银币图 + 花费。
2. 营业中、油不满：标题 `home.statusOpen`（“营业中”），一条油量进度条（`role="progressbar"`），右边次要胶囊按钮 `refuel`（“加满 · 1,000”）。
3. 油是满的：同 2，按钮灰掉，按钮文字换成 `home.oilFull`（“油是满的”）。
- 三种情况都有“油壶扩容”小链接（`oil-upgrade`，去 `/society/oil`）。

新文案（四种语言）：`statusClosed`、`statusClosedHint`（“加满就能继续营业”）、`statusOpen`、`oilLine(oil, max)`、`oilFull`、`refuelBig(full)`（“加满油”/“加油”）。

- [ ] **Step 1: 写失败的测试**（`HomeStatus.test.ts`）

```ts
it('停业：标题写油用光了，整宽主按钮写加满油和花费', () => {
  const w = mount(HomeStatus, { props: { rest: restWith({ state: 2, oil: 0, oilMax: 1000, coin: 5000 }), busy: false } });
  expect(w.text()).toContain('油用光了, 餐厅停业');
  const b = w.get('[data-testid="refuel"]');
  expect(b.classes()).toContain('dt-btn-block');
  expect(b.text()).toContain('加满油');
  expect(b.text()).toContain('1,000');
});
it('银币不够加满：写加油和实际花费', () => { /* coin: 300 → “加油”“300” */ });
it('油是满的：按钮灰掉，写油是满的', () => { /* oil: 1000 → disabled, “油是满的” */ });
it('营业中：有油量进度条，按钮是次要样式', () => { /* state: 1, oil: 640 → role=progressbar aria-valuenow=64，按钮没有 dt-btn-block */ });
it('点按钮发 refuel 事件', async () => { /* trigger click → emitted('refuel') */ });
```

（`restWith` 用 `RestaurantHomeView.test.ts` 现有的餐厅样例数据拼，放进测试里。）

- [ ] **Step 2~5**：跑失败 → 实现 → 跑通过 → `feat(web): 首页营业状态卡和资源胶囊`。`RestaurantHomeView.test.ts` 里断言 `refuel` 文字、`rest-coin` 等的用例按新结构改。

### Task 5: 上一轮统计块、今日 2×2

**Files:**
- Modify: `apps/web/src/views/RestaurantHomeView.vue`、`.test.ts`
- Modify: `apps/web/src/i18n/locales/{4}/home.ts`、`apps/web/src/styles/main.css`

**Interfaces:**
- Consumes: `DtStatTile`；现有 `signedIn`、`activeTotal`、`activeClaimable`、`mainTask`、`mainChapter`、`mainAllDone`、`claimTab`、`tasksTo`、`codesClaimable`、`showTasks`。

上一轮（`data-testid="last-round"`）：
- 区块标题“上一轮” + 右边“收益记录 ›”。
- 三个 `DtStatTile`：`+银币`（good）、`+经验`（good）、耗油（中性，标签“耗油”）；`last-round-line` 放在三块的容器上。
- 下面一行客人（`last-round-guests`，一行截断）+ 右边“楼层餐桌 ›”（有蟑螂时前面虫子图标 `home-floor-roach`）。
- 没有结算过：一行 `noRound` + 两个链接（和现在一样）。

今日（容器保留 `data-testid="home-todo"`）：
- 区块标题“今日”（新文案 `home.todayTitle`）+ 右边“任务 ›”（`home-tasks-link`，能领时带礼物 `home-tasks-gift`）。
- 2×2 操作块（`.dt-act-grid`，块 `.dt-act`，最小高 68px，16px 圆角）：
  1. 签到（`home-signin-row`）：没签是紫色实心块，整块是按钮 `home-signin`；签过是普通块，写“已签到”加对勾（`home-signed`）。`signedIn === null` 时不出这块。
  2. 主线（`main-task`）：能领时浅绿底，标题“领主线奖励”，下面任务名和进度；没完成写任务名和进度；章末、锁定、全做完照现在的文字。整块链接到 `tasksTo`。区服关掉任务且没有主线行时不出这块。
  3. 今日活跃（`home-activation`）：进度数字，能领时礼物图标（`home-activation-gift`）。
  4. 新手（`guide-hint`）：有码时“新手兑换码 · 有可以领的码”，10 级以下“新手指引”；都不满足时不出这块。
- 块数不满 4 个时按顺序排，不留空格子（CSS grid 自然排列；奇数时最后一块占满一行：`.dt-act:last-child:nth-child(odd) { grid-column: 1 / -1; }`）。
- 其余提醒（交易所 `home-exchange-row`、白食 `dine-card`、理财到期 `home-wealth-row`、`ActivityBanner`）放在 2×2 下面一张卡片里，保持行式。

- [ ] **Step 1: 写失败的测试**（加在 `RestaurantHomeView.test.ts`）

```ts
it('上一轮是三个统计块：银币、经验加号绿色，耗油中性（界面改版 P5）', async () => { /* 断言 .dt-stat 三个，前两个 is-good，第三个没有 is-good/is-bad */ });
it('今日 2×2：没签到时签到块是实心按钮；签过写已签到（界面改版 P5）', async () => { /* home-signin 有 dt-act-primary；signedIn true 时 home-signed */ });
it('签到读失败、没有新手提示时只剩两块，不留空格子', async () => { /* activation mock reject；level 30；断言 .dt-act 数量 = 2 */ });
it('主线能领时主线块是浅绿底，点了去第一个能领的标签', async () => { /* main-task 有 is-claim，href 是 tasksTo */ });
it('奇数块时最后一块占满一行', () => { /* 读 main.css：.dt-act:last-child:nth-child(odd) 有 grid-column: 1 / -1 */ });
```

- [ ] **Step 2~5**：跑失败 → 实现 → 跑通过 → `feat(web): 首页上一轮统计块和今日 2×2`。

### Task 6: 首页下半部分整理

**Files:**
- Modify: `apps/web/src/views/RestaurantHomeView.vue`、`.test.ts`、`apps/web/src/styles/main.css`

- “我的店”一张卡片，三行导航行（`.dt-nav-row`：图标、名称、当前值、`›`）：食谱 `home-cookbooks`（“食谱 · 0/3,810”）、特色菜 `home-special`、资产 `home-assets`（“资产 · 0”，右边“收购 ›”）。容器 `home-books` 保留。
- 设施：格子图形 22px → 32px，格子圆角 14px，名字和状态两行；其余（摆放、第二块牌匾）不动。
- 餐厅动态、小镇新闻、经营开关、生效的加成：只跟着新圆角走，不改结构。
- 测试：原来断言 `home-books` 里文字和链接的用例按导航行改；加一条“我的店三行都是整行可点的导航行”。
- 提交：`feat(web): 首页我的店导航行、设施格子放大`

### Task 7: 文档、更新记录、截图、终审、PR

- 视觉规范（`docs/design/视觉规范.md`）加一节“新方向（2026-10-11）”：设计 §1.1 的八条规则，新令牌，`DtLevelRing`、`DtResPill`、`DtStatTile`、`.dt-act` 的用法，根页面大标题和 `meta.scene`。
- 更新记录 `home1011b`（五种语言，`changelog.ts` 最上面）：首页重新排版——放大的店面图、等级环、营业状态卡（停业时一键加满油）、上一轮和今日的大块。
- 全量检查：lint、`prettier --check .`、分包类型检查、`pnpm vitest run --project web --project shared --project config`、干净副本重放。
- 截图（`docs/design/改版-P5/`）：改前（main 副本，5175）、改后（5174）；首页 简中 390 浅色/深色、法文/英文/西文 360 浅色；停业和营业两种状态（营业状态用测试号加满油后再截，或在 Playwright 里拦截 `/api/v1/restaurant` 把 `state` 改成 1、`oil` 改成 640）；所有截图横向溢出 0；README 写首屏能看到什么（主角是否在首屏），不再比行数。
- 新开的终审（opus），Important 先写失败测试再修，Minor 记 `docs/backlog.md`。
- 推送、开 PR：“feat: 界面改版 P5 首页——场景头图、等级环、营业状态卡、今日大块”。
