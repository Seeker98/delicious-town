# 界面改版 P2b 信息架构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全站一级分区用同一个标签页组件、当前标签写进网址；把分散的页面按设计 §4.4 合并（任务、食谱、厨具、银行、兑换码），排行子榜改下拉，按 §4.3 统一剩下的命名。

**Architecture:** 新增组合函数 `useTabQuery`（当前标签 = 网址 `?tab=` → 本地存储 → 第一个；切换时写回两处）和组件 `DtTabs`（`<button role="tab">` 的下划线标签栏，吸顶）。各页面改用这两个；被合并的页面（活跃、特色菜、进度一览、宝石、基金、理财）的内容抽成面板组件，放进宿主页面的标签里，旧路由改成跳转。

**Tech Stack:** Vue 3.5、vue-router 4、Pinia、Vitest + @vue/test-utils。

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md`（§4.2 第 5~8 条、§4.3、§4.4、§8）

## Global Constraints

- 所有 `dt` 前缀保持不变；现有本地存储键（`dt_town_tab`、`dt_temple_tab`、`dt_tower_tab`、`dt_takeaway_tab`、`dt_bar_tab`、`dt_rank_board`……）沿用，玩家记住的标签不丢。
- 菜园（`YardView.vue`、`components/yard/*`）一个都不改：菜园的标签页保持原样。
- 组件里不写 `<style>`、不写带颜色的 `style`；颜色只读令牌；不写裸色值。
- 旧网址全部保留可用（跳转到新位置，带上原来的参数）。
- 首屏信息量不能少于改前。
- 简中文案半角括号、“: ”“, ”；法文窄空格写 ` ` 转义（用 `.cjs` 脚本写）；繁中最后跑 `pnpm -F @dt/web i18n:tw`，不格式化繁中文件。
- 每个玩家看得到的 PR 加一条五种语言的更新记录。
- 不提交 `问题记录.md`、`apps/web/e2e/_*.cjs`、`apps/web/shots/`、`.superpowers/`；只 `git add` 明确路径。
- 推送前跑 `pnpm lint`、`pnpm format:check`、`pnpm typecheck; echo $?`、`pnpm vitest run --project web --project shared --project config`，并在只含已提交文件的干净副本里重跑一遍。
- e2e 不在 CI 里：改了 `data-testid` 或地址的，同步改 `apps/web/e2e` 里用到的地方（grep 确认）。

## Review Focus

1. 网址里带了不存在或被关掉的标签（`?tab=xyz`、`?tab=futures` 但期货关了）：打开第一个可用标签，并把网址改正，不显示空白面板。——测试在 Task 1（`useTabQuery` 用例）。
2. 本地存储读不到或值是乱的：按网址 → 第一个标签，不报错。——测试在 Task 1。
3. 切标签不丢页面上别的网址参数（食谱的 `street`、`filter`、`page`）；从旧地址跳过来带上原来的参数（`/cookbooks/progress?street=2` → `/cookbooks?street=2&tab=progress`）。——测试在 Task 1、Task 6。
4. 区服把银行的两项都关了：小镇不显示银行，直接打开 `/bank` 显示“暂未开放”；只关一项时只显示另一项的标签。——测试在 Task 8。
5. 老书签、老链接（`/rest/activation`、`/mc`、`/rest/gem`、`/society/fund`、`/society/wealth`、`/town?tab=fund`）都落到新位置的对应标签。——测试在 Task 5~8 的路由用例。

---

## File Structure

| 文件 | 职责 |
|---|---|
| Create `apps/web/src/composables/useTabQuery.ts` + test | 当前标签和网址、本地存储同步 |
| Create `apps/web/src/components/DtTabs.vue` + test | 一级标签栏（按钮、徽标、吸顶） |
| Modify `apps/web/src/styles/main.css` | `.dt-tabs-bar` 吸顶 |
| Modify 页面：Town、Temple、Tower、Takeaway、Bar、Exchange、Acquire、Friends、Cupboard、Store、Shop、Forum、Kuji | 改用 `DtTabs` + `useTabQuery` |
| Modify `apps/web/src/components/town/RankPanel.vue` + test | 子榜改下拉框 |
| Create `apps/web/src/components/tasks/ActivationPanel.vue`；Modify `RestTasksView.vue`；Delete `RestActivationView.vue` | 任务页加“今日”标签 |
| Create `apps/web/src/components/cookbook/{CookbookListPanel,McPanel,ProgressPanel}.vue`；Rewrite `CookbooksView.vue`；Delete `McView.vue`、`CookbookProgressView.vue` | 食谱页三个标签 |
| Create `apps/web/src/components/equip/GemPanel.vue`；Modify `EquipView.vue`；Delete `GemView.vue` | 厨具页两个标签 |
| Create `apps/web/src/views/BankView.vue` + test；Modify `SocietyView.vue`、`SocietyNpcView.vue`、`MapView.vue` | 银行 |
| Modify `RedeemView.vue`、`MailView.vue`、`GuideView.vue`、`AccountView.vue`、`RestaurantHomeView.vue` | 兑换码归一、邀请入口 |
| Create `apps/web/src/components/FeedRow.vue` + test；Modify `HomeFeed.vue`、`FriendsView.vue` | 动态同一种行 |
| Modify `apps/web/src/router.ts` + test | 旧地址跳转、新路由、元数据 |
| Modify i18n（5 种语言） | 银行、标签名、统一命名、更新记录 |

---

### Task 1: `useTabQuery` 和 `DtTabs`

**Files:**
- Create: `apps/web/src/composables/useTabQuery.ts`、`apps/web/src/composables/useTabQuery.test.ts`
- Create: `apps/web/src/components/DtTabs.vue`、`apps/web/src/components/DtTabs.test.ts`
- Modify: `apps/web/src/styles/main.css`

**Interfaces:**
- Produces（`useTabQuery.ts`）:
  ```ts
  export interface TabQueryOptions<T extends string> {
    /** 可用的标签（顺序就是显示顺序）；可以是 computed（功能开关、数据决定哪些可用） */
    tabs: MaybeRefOrGetter<readonly T[]>;
    /** 记住上次看的标签的本地存储键；不给就不记 */
    storageKey?: string;
    /** 网址参数名，默认 'tab'（一番赏用 'line'） */
    param?: string;
    /** 等于这个值时网址里不写参数（一番赏的普通线） */
    omitWhen?: T;
  }
  export function useTabQuery<T extends string>(opts: TabQueryOptions<T>): WritableComputedRef<T>;
  ```
  读：网址参数在 `tabs` 里 → 用它；否则本地存储的值在 `tabs` 里 → 用它；否则 `tabs[0]`。
  写：`router.replace({ query: { ...route.query, [param]: v } })`（等于 `omitWhen` 时删掉这个参数），并写本地存储（`try/catch`）。
  `tabs` 变化后当前值不再可用：用 `tabs[0]`，并改正网址（`router.replace`）。
- Produces（`DtTabs.vue`）:
  ```ts
  props: {
    modelValue: string;
    tabs: Array<{ key: string; label: string; badge?: number | string | null; testid?: string }>;
    /** data-testid 前缀，默认 'tab-'（交易所沿用 'ex-tab-'、收购 'acquire-tab-'） */
    testidPrefix?: string;
  }
  emits: { 'update:modelValue': [key: string] }
  ```
  渲染 `<div class="dt-tabs-bar"><ul class="nav nav-tabs" role="tablist"><li class="nav-item" v-for><button type="button" role="tab" class="nav-link" :class="{active}" :aria-selected :data-testid>label<span v-if="badge" class="badge rounded-pill bg-danger ms-1">badge</span></button></li></ul></div>`。只有一个标签时不渲染（返回空）。

- [ ] **Step 1: 写测试**

`useTabQuery.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useTabQuery, type TabQueryOptions } from './useTabQuery';

async function setup<T extends string>(path: string, opts: TabQueryOptions<T>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] });
  await router.push(path);
  let tab!: ReturnType<typeof useTabQuery<T>>;
  const C = defineComponent({ setup: () => ((tab = useTabQuery(opts)), () => h('div')) });
  mount(C, { global: { plugins: [router] } });
  await flushPromises();
  return { tab, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('useTabQuery（界面改版 P2b，设计 §4.2 第 6 条）', () => {
  const TABS = ['news', 'town', 'rank'] as const;

  it('网址里的标签优先；其次记住的；都没有用第一个', async () => {
    expect((await setup('/x?tab=rank', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('rank');
    localStorage.setItem('k', 'town');
    expect((await setup('/x', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('town');
    localStorage.clear();
    expect((await setup('/x', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('news');
  });

  it('网址、本地存储里是不存在的值：用第一个，不报错；本地存储抛异常也一样', async () => {
    localStorage.setItem('k', 'xyz');
    expect((await setup('/x?tab=abc', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('news');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect((await setup('/x', { tabs: TABS, storageKey: 'k' })).tab.value).toBe('news');
    vi.restoreAllMocks();
  });

  it('切换：写进网址（保留别的参数）和本地存储', async () => {
    const { tab, router } = await setup('/x?street=2&page=3', { tabs: TABS, storageKey: 'k' });
    tab.value = 'rank';
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ street: '2', page: '3', tab: 'rank' });
    expect(localStorage.getItem('k')).toBe('rank');
  });

  it('可用的标签变了（功能关了），当前的不再可用：回第一个并改正网址', async () => {
    const on = ref(true);
    const tabs = computed(() => (on.value ? ['spot', 'futures'] : ['spot']));
    const { tab, router } = await setup('/x?tab=futures', { tabs });
    expect(tab.value).toBe('futures');
    on.value = false;
    await flushPromises();
    expect(tab.value).toBe('spot');
    expect(router.currentRoute.value.query.tab).toBe('spot');
  });

  it('自定参数名、默认值不写进网址（一番赏 ?line=）', async () => {
    const { tab, router } = await setup('/x?line=deluxe', { tabs: ['normal', 'deluxe'], param: 'line', omitWhen: 'normal' });
    expect(tab.value).toBe('deluxe');
    tab.value = 'normal';
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
  });
});
```

`DtTabs.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DtTabs from './DtTabs.vue';

const TABS = [
  { key: 'a', label: '甲' },
  { key: 'b', label: '乙', badge: 2 },
];

describe('DtTabs（界面改版 P2b）', () => {
  it('按钮式标签，选中的有 active 和 aria-selected；徽标', () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: TABS } });
    const btns = w.findAll('button[role="tab"]');
    expect(btns.map((b) => b.text())).toEqual(['甲', '乙2']);
    expect(btns[0]!.classes()).toEqual(expect.arrayContaining(['nav-link', 'active']));
    expect(btns[0]!.attributes('aria-selected')).toBe('true');
    expect(btns[1]!.attributes('aria-selected')).toBe('false');
    expect(w.get('ul').classes()).toContain('nav-tabs');
    expect(w.get('[data-testid="tab-b"] .badge').text()).toBe('2');
  });

  it('点了发出新的值；自定 testid 前缀', async () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: TABS, testidPrefix: 'ex-tab-' } });
    await w.get('[data-testid="ex-tab-b"]').trigger('click');
    expect(w.emitted('update:modelValue')).toEqual([['b']]);
  });

  it('只有一个标签时不显示标签栏', () => {
    const w = mount(DtTabs, { props: { modelValue: 'a', tabs: [TABS[0]!] } });
    expect(w.find('ul').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/composables/useTabQuery.test.ts apps/web/src/components/DtTabs.test.ts`
Expected: FAIL（找不到模块）

- [ ] **Step 3: 实现**

`useTabQuery.ts`：

```ts
import { computed, toValue, watch, type MaybeRefOrGetter, type WritableComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 一级标签页的当前标签（界面改版设计 §4.2 第 6 条）：写进网址 ?tab=（能分享、能后退、刷新不丢），
 * 不带参数进来时打开上次看的（本地存储），都没有用第一个。取代各页面各写各的五种做法。
 */
export interface TabQueryOptions<T extends string> {
  tabs: MaybeRefOrGetter<readonly T[]>;
  storageKey?: string;
  param?: string;
  omitWhen?: T;
}

export function useTabQuery<T extends string>(opts: TabQueryOptions<T>): WritableComputedRef<T> {
  const route = useRoute();
  const router = useRouter();
  const param = opts.param ?? 'tab';
  const list = computed(() => toValue(opts.tabs));
  const saved = (): string | null => {
    if (!opts.storageKey) return null;
    try {
      return localStorage.getItem(opts.storageKey);
    } catch {
      return null;
    }
  };
  const pick = (): T => {
    const tabs = list.value;
    const q = route.query[param];
    if (typeof q === 'string' && tabs.includes(q as T)) return q as T;
    if (q === undefined && opts.omitWhen && tabs.includes(opts.omitWhen)) {
      // 默认值不写进网址的参数（一番赏）：没参数就是默认值，不看本地存储
      if (!opts.storageKey) return opts.omitWhen;
    }
    const s = saved();
    if (s !== null && tabs.includes(s as T)) return s as T;
    return (opts.omitWhen && tabs.includes(opts.omitWhen) ? opts.omitWhen : tabs[0]) as T;
  };
  const write = (v: T) => {
    const query = { ...route.query };
    if (opts.omitWhen !== undefined && v === opts.omitWhen) delete query[param];
    else query[param] = v;
    void router.replace({ query });
    if (opts.storageKey) {
      try {
        localStorage.setItem(opts.storageKey, v);
      } catch {
        // 存不了（隐私模式）也照样切换
      }
    }
  };
  const tab = computed<T>({ get: pick, set: write });
  // 可用的标签变了（功能关了、数据还没读到），当前的不再可用：回第一个并改正网址
  watch(list, (tabs) => {
    const q = route.query[param];
    if (typeof q === 'string' && !tabs.includes(q as T) && tabs.length > 0) write(tab.value);
  });
  return tab;
}
```

`DtTabs.vue`：

```vue
<script setup lang="ts">
/** 一级标签栏（界面改版设计 §4.2 第 5~7 条）：下划线式、吸顶；选中下划线的位置由 utils/tabsScroll.ts 负责 */
withDefaults(
  defineProps<{
    modelValue: string;
    tabs: Array<{ key: string; label: string; badge?: number | string | null; testid?: string }>;
    testidPrefix?: string;
  }>(),
  { testidPrefix: 'tab-' },
);
defineEmits<{ 'update:modelValue': [key: string] }>();
</script>

<template>
  <div v-if="tabs.length > 1" class="dt-tabs-bar">
    <ul class="nav nav-tabs" role="tablist">
      <li v-for="x in tabs" :key="x.key" class="nav-item" role="presentation">
        <button
          type="button"
          role="tab"
          :class="['nav-link', { active: x.key === modelValue }]"
          :aria-selected="x.key === modelValue"
          :data-testid="x.testid ?? `${testidPrefix}${x.key}`"
          @click="$emit('update:modelValue', x.key)"
        >
          {{ x.label
          }}<span v-if="x.badge" class="badge rounded-pill bg-danger ms-1">{{ x.badge }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
```

`main.css` 追加：

```css
/* 一级标签栏吸顶（界面改版设计 §4.2 第 7 条）：滚动时停在 48px 顶栏下面 */
.dt-tabs-bar {
  position: sticky;
  top: 48px;
  z-index: 10;
  margin: 0 -8px 8px;
  padding: 0 8px;
  background: var(--dt-surface);
}
```

（`.dt-main` 左右内边距是 8px，负外边距让标签栏的底色铺满宽度。）

- [ ] **Step 4: 跑测试，确认通过；提交**

Run: `pnpm vitest run --project web apps/web/src/composables apps/web/src/components/DtTabs.test.ts apps/web/src/styles`
Expected: PASS

```bash
git add apps/web/src/composables/useTabQuery.ts apps/web/src/composables/useTabQuery.test.ts apps/web/src/components/DtTabs.vue apps/web/src/components/DtTabs.test.ts apps/web/src/styles/main.css
git commit -m "feat(web): 统一的标签页：DtTabs 组件和 useTabQuery（网址、本地存储同步）（界面改版 P2b）"
```

---

### Task 2: 广场、神殿、厨塔、外卖、酒吧改用统一标签页

**Files:** `TownView.vue`、`TempleView.vue`、`TowerView.vue`、`TakeawayView.vue`、`BarView.vue` 和各自的测试；`apps/web/e2e` 里用到的地方。

**Interfaces:** Consumes `useTabQuery`、`DtTabs`。

每个页面：删掉自己的 `TABS` 状态初始化（`initialTab`/`savedTab`）、`watch` 写回和 `<ul class="nav nav-tabs">` 标记，换成：

```ts
const tab = useTabQuery({ tabs: TABS /* 或 computed */, storageKey: '原来的键' });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.xxx.tabs[k] })));
```

```vue
<DtTabs v-model="tab" :tabs="tabItems" />
```

| 页面 | 标签 | storageKey | 特别注意 |
|---|---|---|---|
| Town | `news, town, rank, wishtree`（wishtree 看功能开关，用 computed） | `dt_town_tab` | 原来只有网址里已有 `tab` 时才写网址；现在一律写（设计 §4.2 第 6 条）。`TownView` 里重复的 `MOVED` 跳转删掉（路由的 `beforeEnter` 已处理，Task 8 改目标）。本地存储里存过已搬走的值（`exchange`）时回 `news`：由 `useTabQuery` 的“不存在的值用第一个”覆盖 |
| Temple | `appraise, guardian, explore, trial, kraken` | `dt_temple_tab` | 无 |
| Tower | `tower, rank, shop` | `dt_tower_tab` | 无 |
| Takeaway | `orders, deliveries, riders`，标签名带数量（函数文案） | `dt_takeaway_tab` | 切换时要重新读数据：`watch(tab, load)` 保留 |
| Bar | 10 个游戏 | `dt_bar_tab` | 原来是胶囊，改成一级标签（设计 §4.2 第 5 条）；面板保持切换不卸载（原有测试） |

测试：原来断言 `a.nav-link`、`.dt-pills a`、本地存储键的，按新标记改（`button[role="tab"]`）；TownView 的“网址跟着标签走”测试改成“一律写网址”。e2e 里 `tab-*` 的 testid 不变。

- [ ] Step 1：先把各测试里对新行为的断言改好（网址一律带 `?tab=`、`button[role="tab"]`），跑一次确认失败
- [ ] Step 2：逐页改，每改一页跑那一页的测试
- [ ] Step 3：`pnpm vitest run --project web apps/web/src/views apps/web/src/components` 全过，提交 `refactor(web): 广场、神殿、厨塔、外卖、酒吧改用统一标签页（界面改版 P2b）`

---

### Task 3: 交易所、收购、好友、橱柜、仓库、商店、论坛、一番赏改用统一标签页

**Files:** `ExchangeView.vue`、`AcquireView.vue`、`FriendsView.vue`、`CupboardView.vue`、`StoreView.vue`、`ShopView.vue`、`ForumView.vue`、`KujiView.vue` 和测试；e2e。

| 页面 | 标签 | storageKey | 特别注意 |
|---|---|---|---|
| Exchange | `spot, futures, bulk`（computed，按功能和持仓） | 不记 | `testidPrefix: 'ex-tab-'`；原来只读一次网址，现在双向同步 |
| Acquire | `price, market, invest, mine` | 不记 | `testidPrefix: 'acquire-tab-'` |
| Friends | `friends, requests, find, feed`；`requests` 带待处理数徽标 | 不记 | 原来只认 `?tab=feed`，现在四个都认；切到 `feed` 时照旧读动态 |
| Cupboard | `cupboard, fridge`；`fridge` 带未读徽标 | 不记 | 切到 `fridge` 照旧 `openFridge()`（`watch(tab)`）；`tab-cupboard` 新增 testid |
| Store | `items, souvenirs, records` | 不记 | 切换时懒加载照旧 |
| Shop | `coin, black, special` | 不记 | 测试原来用 `a.nav-link` 按文字找，改成 `button[role="tab"]` |
| Forum | `FORUM_TABS`（共享包里） | 不记 | 原来是胶囊 `forum-tab-*`，改一级标签，`testidPrefix: 'forum-tab-'`；切换照旧重读列表 |
| Kuji | `normal, deluxe` | 不记 | `param: 'line'`、`omitWhen: 'normal'`（网址和原来一样）；`testidPrefix: 'kj-line-'`；`busy` 时原来禁用切换：`DtTabs` 不支持禁用，改成 `busy` 时忽略切换（`tab` 的 setter 外包一层） |

- [ ] Step 1：先改测试断言，确认失败
- [ ] Step 2：逐页改、逐页跑测试
- [ ] Step 3：全部页面测试通过，提交 `refactor(web): 交易所、收购、好友、橱柜、仓库、商店、论坛、一番赏改用统一标签页（界面改版 P2b）`

---

### Task 4: 排行子榜改下拉框

**Files:** `apps/web/src/components/town/RankPanel.vue` + test；`apps/web/e2e/hiphop-rank.spec.ts`（如用到 `rank-board-*`）。

- 分组仍是胶囊（`rank-group-*` 不变）；子榜（原来 `btn-group`，`subs.length > 1` 时）改成 `<select class="form-select form-select-sm w-auto" data-testid="rank-board-select" v-model="key">`，选项 `boardName(b.key)`。
- [ ] Step 1：测试：分组有多个子榜时有 `rank-board-select`，选项文字和顺序；选了另一个子榜会重读（`endpoints.rank` 用新 key 调用）。确认失败。
- [ ] Step 2：实现，跑测试，提交 `feat(web): 排行子榜改成下拉框，分区不超过两层（界面改版 P2b）`

---

### Task 5: 任务页加“今日”标签（签到和活跃并进来）

**Files:** Create `components/tasks/ActivationPanel.vue`（`RestActivationView.vue` 的脚本和模板原样搬过去，去掉“去任务”的链接）；`RestTasksView.vue` 改用 `useTabQuery({ tabs: ['today','main','weekly','side'] })` + `DtTabs`，`today` 显示 `ActivationPanel`，去掉“签到和活跃”链接；Delete `RestActivationView.vue`，测试改名为 `ActivationPanel.test.ts`（挂组件）；`router.ts`：`/rest/activation` → `{ path: '/rest/activation', redirect: '/rest/tasks?tab=today' }`；`utils/tasks.ts` 的 `TASK_TABS` 加 `'today'`（`firstClaimableTab` 不变）；首页“今日活跃”链接改 `/rest/tasks?tab=today`；各语言 `guide.ts` 里 `/rest/activation` 的链接改成新地址；e2e `business.spec.ts`。

- [ ] Step 1：测试：
  - `router.test`：`/rest/activation` 跳到 `/rest/tasks?tab=today`。
  - `RestTasksView.test`：标签是 今日、主线、每周、支线；`?tab=today` 显示签到（`signin` testid 在）；不带参数时第一个是“今日”。
  - `RestaurantHomeView.test`：`home-activation` 指向 `/rest/tasks?tab=today`。
  确认失败。
- [ ] Step 2：实现、跑测试（`RestTasksView`、`ActivationPanel`、`RestaurantHomeView`、`GuideView`、`router`），提交 `feat(web): 签到和今日活跃并进任务页的“今日”标签（界面改版 P2b）`

---

### Task 6: 食谱页三个标签：食谱、特色菜、进度一览

**Files:** `CookbooksView.vue` 的内容搬到 `components/cookbook/CookbookListPanel.vue`（含 street/filter/page 的网址同步；“进度一览”链接删掉）；`McView.vue` → `components/cookbook/McPanel.vue`（神殿鉴定、教室两个链接留在 `.dt-page-meta`）；`CookbookProgressView.vue` → `components/cookbook/ProgressPanel.vue`；新 `CookbooksView.vue` 只有 `DtTabs` + 三个面板（`tabs: ['list', 'mc', 'progress']`，`mc` 看 `mysterious` 功能开关；不记本地存储）；测试跟着搬；`router.ts`：`/mc` → 跳 `/cookbooks?tab=mc`，`/cookbooks/progress` → 跳 `/cookbooks` 带原参数加 `tab=progress`（函数 `redirect`），删两条路由的元数据；首页“特色菜”链接改 `/cookbooks?tab=mc`；e2e `mysterious.spec.ts`。

注意：`CookbookListPanel` 里“`street` 参数没了就回自己的街”的 watch 只在列表标签显示时生效；切到别的标签再切回来，网址里的 `street` 由 `useTabQuery` 保留（只改 `tab`）。

- [ ] Step 1：测试：
  - `router.test`：`/mc` → `/cookbooks?tab=mc`；`/cookbooks/progress?street=2&page=3` → `/cookbooks?street=2&page=3&tab=progress`。
  - 新 `CookbooksView.test`：三个标签；`?tab=progress` 显示 `progress-summary`；特色菜关了只有两个标签；切到特色菜再切回食谱，网址里的 `street=2` 还在。
  确认失败。
- [ ] Step 2：实现、跑测试，提交 `feat(web): 食谱页加特色菜、进度一览两个标签（界面改版 P2b）`

---

### Task 7: 厨具页两个标签：装备、宝石

**Files:** `GemView.vue` → `components/equip/GemPanel.vue`；`EquipView.vue` 顶部加 `DtTabs`（`equip, gem`，`gem` 无单独功能开关；不记本地存储），原内容放在 `tab === 'equip'` 里，`GemPanel` 在 `gem` 里；删“宝石”按钮；`router.ts`：`/rest/gem` → 跳 `/rest/equip?tab=gem`；`RestInfoView` 的 `/rest/equip#attr-points` 不变（默认标签是装备）。i18n：`equip.tabs = { equip: '装备', gem: '宝石' }`（en Gear / Gems，fr Équipement / Gemmes，es Equipo / Gemas）。

- [ ] Step 1：测试：`router.test` 跳转；`EquipView.test`：两个标签，`?tab=gem` 显示 `gem-intro`。确认失败。
- [ ] Step 2：实现、跑测试，提交 `feat(web): 厨具页加宝石标签（界面改版 P2b）`

---

### Task 8: 银行

**Files:** Create `views/BankView.vue` + test；`router.ts`：`/bank`（`needRestaurant`、`section: 'map'`、`title: t.nav.titles.bank`、`parent: '/map'`）；`/society/:npc` 去掉 `fund|wealth`，加两条跳转 `/society/fund` → `/bank?tab=fund`、`/society/wealth` → `/bank?tab=wealth`；`TOWN_MOVED.fund` → `/bank?tab=fund`；`SocietyNpcView.vue` 去掉 fund、wealth 分支；`SocietyView.vue` 去掉两张卡片；`MapView.vue` 买卖组加 `{ key: 'bank', to: '/bank', art: 'place-bank' }`，`fund`、`wealth` 两个功能都关时不显示；首页“理财到期”链接 → `/bank?tab=wealth`。

`BankView.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import DtTabs from '../components/DtTabs.vue';
import NpcCard from '../components/NpcCard.vue';
import FundPanel from '../components/town/FundPanel.vue';
import WealthPanel from '../components/town/WealthPanel.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { useRestaurantStore } from '../stores/restaurant';

/** 银行（界面改版设计 §4.4）：盖乐瑞的小镇发展基金和理财，从协会搬过来 */
const t = useT();
const restStore = useRestaurantStore();
const tabs = computed(() => (['fund', 'wealth'] as const).filter((k) => restStore.featureOn(k)));
const tab = useTabQuery({ tabs });
const items = computed(() => tabs.value.map((k) => ({ key: k, label: t.value.bank.tabs[k] })));
</script>

<template>
  <div v-if="tabs.length === 0" class="dt-empty" data-testid="bank-off">{{ t.bank.off }}</div>
  <template v-else>
    <DtTabs v-model="tab" :tabs="items" />
    <NpcCard :key="tab" :npc="tab === 'fund' ? 'gary' : 'garyWealth'" />
    <FundPanel v-if="tab === 'fund'" />
    <WealthPanel v-else />
  </template>
</template>
```

i18n 新增：`nav.titles.bank`（银行 / Bank / Banque / Banco）、`nav.map.places.bank`（`{ name: 银行, sub: 基金 · 理财 }`；en Fund · Savings，fr Fonds · Épargne，es Fondo · Ahorro）、`bank.tabs`（基金、理财 / Fund、Savings / Fonds、Épargne / Fondo、Ahorro）、`bank.off`（这个区服暂未开放银行 / The bank isn't open on this server / La banque n’est pas ouverte sur ce serveur / El banco no está abierto en este servidor）。

- [ ] Step 1：测试：
  - `BankView.test`：两个标签；`?tab=wealth` 显示 `wealth-panel` 和 `npc-garyWealth`；关了 `wealth` 只有基金且不显示标签栏；两个都关显示 `bank-off`。
  - `router.test`：`/society/fund`、`/society/wealth`、`/town?tab=fund` 的跳转；`/bank` 的元数据。
  - `MapView.test`：有银行；`fund`、`wealth` 都关时没有。
  - `SocietyView.test`：没有基金、理财两张卡片。
  确认失败。
- [ ] Step 2：实现、跑测试，提交 `feat(web): 新增银行：盖乐瑞的基金和理财从协会搬到小镇（界面改版 P2b）`

---

### Task 9: 兑换码归一、邀请入口

**Files:** `RedeemView.vue`：兑换框 + 新手兑换码列表（从 `GuideView` 搬来的 `guide-codes` 块，抽成 `components/NewbieCodes.vue`）+ 一行 `NavRow` 去邀请好友（`invite` 功能开关）；`MailView.vue`：`RedeemBox` 换成一行 `<RouterLink to="/redeem" class="dt-go" data-testid="mail-to-redeem">`；`GuideView.vue`：新手码块换成一行去兑换码的链接；`AccountView.vue`：去掉邀请码那一行；`router.ts`：`/invite` 的 `parent` 改 `/redeem`；首页“有可以领的新手兑换码”链接改 `/redeem`。

- [ ] Step 1：测试：
  - `RedeemView.test`：有兑换框、新手码列表（`guide-redeem-*`）、去邀请的链接（`invite` 关了没有）。
  - `MailView.test`：没有兑换框，有 `mail-to-redeem`。
  - `GuideView.test`：没有 `guide-codes`，有去兑换码的链接。
  - `AccountView.test`：没有邀请码那一行（`styles/links.test.ts` 里 `AccountView to="/invite"` 那条删掉）。
  - `router.test`：`/invite` 的上一级是 `/redeem`。
  确认失败。
- [ ] Step 2：实现、跑测试，提交 `feat(web): 兑换码只留一处，新手码和邀请好友也在里面（界面改版 P2b）`

---

### Task 10: 统一命名、动态同一种行

**Files:** i18n 五种语言；`SocietyNpcView.vue`；`components/FeedRow.vue` + test；`HomeFeed.vue`、`FriendsView.vue`。

命名（简中；en/fr/es 只改有冲突的）：

| 键 | 现在 | 改成 |
|---|---|---|
| `home.oilUpgrade` | 升级油壶 | 油壶扩容（en 改成和 `society.links.oil.label` 一样的 “Expand oil tank”） |
| `account.shards.title` | 选择区服 | 切换区服（en Switch server，fr Changer de serveur，es Cambiar de servidor） |
| `friends.exchange.title` | 交换食材 | 换食材 |
| `wiki.kinds.cookbooks` 和资料库里其他“菜谱” | 菜谱 | 食谱（只改资料库、指引、菜场文案里指“食谱”的地方） |
| `nav.news.more` | 更多 | 全部（en All，fr Tout，es Todo） |
| `friends.tabs.friends` | 好友 | 我的好友（en My friends，fr Mes amis，es Mis amigos） |
| `cupboard.tabs.cupboard` | 橱柜 | 常温（en Shelf，fr Étagère，es Estante） |
| `store.tabs.items` | 仓库 | 道具（en Items，fr Objets，es Objetos） |
| `tower.tabs.tower` | 厨塔 | 挑战（en Climb，fr Ascension，es Ascenso） |
| `store.shop.tabs.special` 及相关新闻、资料库、报错文案 | 今日特价 | 限时折扣（en Limited-time deals，fr Promos limitées，es Ofertas limitadas） |
| `activity.title`、`nav.links.activities`、`nav.map.places.activities.name` | 限时活动 | 活动 |

- `SocietyNpcView` 顶栏标题：有 NPC 的写“NPC 名 · 功能”（`t.npc.links[npc]` 的 name 和 label），教室只写“教室”。
- `FeedRow.vue`：props `{ item: FeedItem; showNew?: boolean }`，渲染 `div.dt-feed` → `span.dt-feed-time`（月-日 时:分）→ `feedLink` 链接或纯文字；`HomeFeed`、`FriendsView` 的动态标签都用它。

- [ ] Step 1：测试：
  - `zh-CN.test`（或新 `naming.test.ts`）逐条断言上表的简中值。
  - `SocietyNpcView.test`：镇长页顶栏标题是“镇长大胃锅 · 稀有道具兑换”，教室是“教室”。
  - `FeedRow.test`：时间、链接、`showNew` 小点；`FriendsView.test` 的动态标签用 `.dt-feed`。
  确认失败。
- [ ] Step 2：实现（文案用脚本写，法文转义照规则）；`pnpm -F @dt/web i18n:tw`；跑全部网页测试；提交 `feat(web): 统一命名；好友动态和首页动态同一种行（界面改版 P2b）`

---

### Task 11: 规范文档、更新记录、截图、开 PR

- [ ] 更新 `docs/design/视觉规范.md` 第 10 节：标签页统一（`DtTabs` + `useTabQuery`、吸顶、两层上限、子榜下拉）、合并后的页面。
- [ ] 更新记录 `ia1011`（日期按当天）：
  - zh-CN：`'签到和活跃并进任务页; 特色菜、进度一览并进食谱页; 宝石并进厨具页; 基金和理财搬到小镇的新地方“银行”; 新手兑换码和邀请都在“兑换码和邀请”里; 标签页统一写进网址, 能分享、后退不丢; 排行的子榜改成下拉框; 几处叫法统一 (今日特价改叫限时折扣, 限时活动改叫活动)'`（实际写时把“; ”按简中规则换成“；”）
  - en / fr / es 同义。
- [ ] 全量检查 + 干净副本重跑。
- [ ] 截图（同 P2a 的方式）：任务（今日、主线）、食谱（三个标签）、厨具（宝石）、银行（两个标签）、小镇、协会、兑换码、邮件、广场排行（下拉）、交易所、酒吧、一番赏；简中 390px 浅色深色、法文英文 360px；溢出 0、首屏行数不少于改前。放 `docs/design/改版-P2b/`。
- [ ] 整体审查（新的审查员）→ 修 Critical/Important（每条先写失败的测试）→ 小问题记 backlog。
- [ ] 推送开 PR：`feat: 界面改版 P2b 信息架构——统一标签页、任务食谱厨具合并、银行、兑换码归一、统一命名`。
