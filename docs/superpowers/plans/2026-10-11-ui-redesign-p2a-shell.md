# 界面改版 P2a 外壳 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 换掉 2010 年代的外壳：顶栏显示页面标题、返回一律回逻辑上一级、底部导航的“更多”换成“小镇”页、账号类收进“我”、帮助类收进“帮助中心”；各页面去掉自己的标题行和“返回 xx”链接。

**Architecture:** 每个路由在 `meta` 里写 `section`（属于底部哪个入口）、`title`（取文案的函数）、`parent`（上一级地址，可以是函数）；`AppHeader` 读当前路由的这三项，页面需要动态标题（店名、帖子标题、NPC 名）时用 `usePageTitle()` 写进一个小 store。底部导航按 `section` 高亮。新增 `/map`（小镇）、`/me`（我）、`/help`（帮助中心）三个页面，都由“导航行”和“地方卡片”两种积木搭成。

**Tech Stack:** Vue 3.5、vue-router 4、Pinia、Vitest + @vue/test-utils、Playwright（截图）。

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md`（§4.1、§4.2、§4.3 中和外壳有关的命名、§5.2 导航行、§8）

## 范围：P2 拆成两个 PR

设计 §6.1 的 P2 一行内容很多（外壳 + 全站标签页统一 + 五处功能归并 + 命名），一个 PR 要改近百个文件。拆成两个依次合并的 PR（不叠：P2b 在 P2a 合并后从最新 main 开）：

- **P2a 外壳（本计划）**：路由元数据、顶栏、返回规则、底部导航、小镇页、“我”、帮助中心、各页面去掉标题行和返回链接、文案里写死的“更多 → 其他”路径、账号页改名“账号和设置”、装扮改名“装扮和称号”。
- **P2b 信息架构（另写计划）**：`DtTabs`/`useTabQuery` 统一标签页、任务合并、食谱和厨具加标签、银行、排行子榜下拉、兑换码归一、其余统一命名、好友动态和首页动态同一种行。

P2a 期间“银行”还没有：小镇页的买卖组先不放银行，基金和理财仍在协会里（P2b 搬）。

## Global Constraints

- 所有 `dt` 前缀保持不变。
- 菜园的文件（`YardView.vue`、`components/yard/*`）一个都不改：菜园页顶栏会显示“菜园”，页面里它自己的标题仍在（重复一行，接受）。
- 组件里不写 `<style>`、不写带颜色的 `style`；颜色只读令牌；不写裸色值（`mainCss.test.ts` 检查）。
- 紫色只给能点的东西；整行可点的导航行右边一个灰色 `›`。
- 界面动效 ≤ 300ms，只动 `transform`/`opacity`；悬停只写在 `(hover: hover) and (pointer: fine)` 里。
- 首屏信息量不能少于改前（截图逐页数行验收）。
- 旧网址全部保留可用（`/more` 跳 `/map`）。
- 简中文案用半角括号、“: ”“, ”；法文窄空格写 ` ` 转义（用 `.cjs` 脚本写）；繁中最后跑 `pnpm -F @dt/web i18n:tw`，不格式化繁中文件；英法西数量用 `plEn/plFr/plEs`。
- 每个玩家看得到的 PR 加一条五种语言的更新记录。
- 不提交 `问题记录.md`、`apps/web/e2e/_*.cjs`、`apps/web/shots/`、`.superpowers/`；只 `git add` 明确路径。
- 推送前跑：`pnpm lint`、`pnpm format:check`、`pnpm typecheck; echo $?`、`pnpm vitest run --project web --project shared --project config`。改了 `.gitignore` 覆盖的生成物要确认已提交（P1 的教训）。

## Review Focus

1. 直接打开深层页面（没有浏览历史，比如从书签打开 `/friends/123/flip`）：顶栏返回去它的逻辑上一级（`/friends/123`），不是首页，也不会退出网站。——测试在 Task 2（`AppHeader` 用例“没有历史也回上一级”）。
2. 动态标题的页面数据还没读回来（店名、帖子标题）：顶栏先显示路由的静态标题，不显示空白或 `undefined`；离开页面后动态标题不残留到下一页。——测试在 Task 2（`pageTitle` 用例）。
3. 区服关掉的功能（`disabledFeatures`）：小镇页、“我”、底部导航都不显示对应入口；底部导航少于 6 个时其余入口平分宽度。——测试在 Task 3、Task 4。
4. 没登录时打开公开页（资料库）：顶栏有标题、没有返回到游戏页面的箭头、没有“我”和邮件；登录页、注册页顶栏只显示游戏名。——测试在 Task 2。
5. 英法西长标题在顶栏：一行截断加省略号，不把邮件、头像挤出屏幕。——测试在 Task 2（标题有 `dt-clamp1` 类）+ Task 8 截图。

---

## File Structure

| 文件 | 职责 |
|---|---|
| Create `apps/web/src/nav/sections.ts` + test | `Section` 类型、底部 6 个入口的定义（地址、图标、文案键、功能开关） |
| Create `apps/web/src/nav/routeMeta.ts` + test | 路由元数据类型（`section`、`title`、`parent`）和 `routeTitle()`、`parentPath()` |
| Modify `apps/web/src/router.ts` + `router.test.ts` | 每个游戏内路由补元数据；新增 `/map`、`/me`、`/help`；`/more` 跳 `/map` |
| Create `apps/web/src/stores/pageTitle.ts` + test | 动态标题 store 和 `usePageTitle()` |
| Rewrite `apps/web/src/components/AppHeader.vue` + test | 返回（回上一级）、标题、时钟、邮件、“我” |
| Rewrite `apps/web/src/components/BottomNav.vue` + test | 6 个入口、按 `section` 高亮、`DtArt` 图标 |
| Delete `apps/web/src/components/MoreLinks.vue` + test、`apps/web/src/views/MoreView.vue` | 被小镇页、“我”、帮助中心取代 |
| Create `apps/web/src/views/MapView.vue` + test | 小镇：买卖、玩乐、公共三组地方卡片 |
| Create `apps/web/src/views/MeView.vue` + test | 我：店铺头、我的店、账号、帮助、后台 |
| Create `apps/web/src/views/HelpView.vue` + test | 帮助中心 |
| Create `apps/web/src/components/NavRow.vue` + test | 导航行（图标、名称、当前值、`›`），“我”和帮助中心共用 |
| Modify 约 45 个页面（Task 5 表） | 去掉标题行、`.dt-back`；动态标题改 `usePageTitle`；标题行右侧的东西改 `.dt-page-meta` |
| Modify `apps/web/src/styles/main.css` | 顶栏、底部导航、地方卡片、导航行、`.dt-page-meta` |
| Modify i18n（5 种语言）`nav.ts`、`account.ts`、`rest.ts`、`guide.ts`、`market.ts`、`site.ts` | 新文案、改名、更新记录 |
| Modify `docs/design/视觉规范.md`、`docs/design/文字链接-2026-10-07.md` | 顶栏、返回、导航行 |

---

### Task 1: 底部入口和路由元数据

**Files:**
- Create: `apps/web/src/nav/sections.ts`、`apps/web/src/nav/sections.test.ts`
- Create: `apps/web/src/nav/routeMeta.ts`、`apps/web/src/nav/routeMeta.test.ts`
- Modify: `apps/web/src/router.ts`、`apps/web/src/router.test.ts`
- Modify: `apps/web/src/i18n/locales/{zh-CN,en,fr,es}/nav.ts`（`tabs.map`、`titles` 一组新标题）

**Interfaces:**
- Produces（`nav/sections.ts`）:
  ```ts
  export type Section = 'home' | 'cookbooks' | 'cupboard' | 'market' | 'friends' | 'map';
  export interface SectionDef { key: Section; to: string; art: UiArtName; feature?: string }
  export const SECTIONS: readonly SectionDef[]; // 顺序：home / cookbooks / cupboard / market / friends / map
  export const ROOT_PATHS: ReadonlySet<string>; // 6 个入口的地址
  ```
- Produces（`nav/routeMeta.ts`）:
  ```ts
  import type { Messages } from '../i18n';
  export interface NavMeta {
    section?: Section;
    title?: (t: Messages) => string;
    parent?: string | ((to: RouteLocationNormalizedLoaded) => string);
  }
  declare module 'vue-router' { interface RouteMeta extends NavMeta {} }
  export function routeTitle(meta: NavMeta, t: Messages): string | null;
  export function parentPath(route: RouteLocationNormalizedLoaded): string | null; // 根页面返回 null
  ```

- [ ] **Step 1: 写测试**

`nav/sections.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { UI_ART } from '../art/generated/names';
import { ROOT_PATHS, SECTIONS } from './sections';

describe('底部入口（界面改版 P2a，设计 §4.1）', () => {
  it('六个入口：餐厅、食谱、橱柜、菜场、好友、小镇', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(['home', 'cookbooks', 'cupboard', 'market', 'friends', 'map']);
    expect([...ROOT_PATHS]).toEqual(['/', '/cookbooks', '/cupboard', '/market', '/friends', '/map']);
  });
  it('图标都在雪碧图里', () => {
    for (const s of SECTIONS) expect(UI_ART).toContain(s.art);
  });
});
```

`nav/routeMeta.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import zhCN from '../i18n/locales/zh-CN';
import { parentPath, routeTitle } from './routeMeta';

const route = (path: string, meta: object, params: Record<string, string> = {}) =>
  ({ path, meta, params, query: {}, hash: '', fullPath: path, name: undefined, matched: [], redirectedFrom: undefined }) as never;

describe('路由元数据（界面改版 P2a）', () => {
  it('标题按当前语言取', () => {
    expect(routeTitle({ title: (t) => t.bar.title }, zhCN)).toBe('酒吧');
    expect(routeTitle({}, zhCN)).toBeNull();
  });
  it('上一级：写死的地址、按参数算的地址；根页面没有上一级', () => {
    expect(parentPath(route('/bar', { parent: '/map' }))).toBe('/map');
    expect(
      parentPath(route('/friends/9/flip', { parent: (to: { params: { restId: string } }) => `/friends/${to.params.restId}` }, { restId: '9' })),
    ).toBe('/friends/9');
    expect(parentPath(route('/cookbooks', { section: 'cookbooks' }))).toBeNull();
  });
});
```

`router.test.ts` 末尾追加：

```ts
import zhCN from './i18n/locales/zh-CN';
import { ROOT_PATHS } from './nav/sections';

describe('导航元数据（界面改版 P2a，设计 §4.2）', () => {
  /** 游戏内页面：要开店的，或已开店时显示导航的 */
  const game = routes.filter((r) => !r.redirect && (r.meta?.needRestaurant || r.meta?.gameChrome));
  it('每个游戏内页面都有所属入口和标题', () => {
    for (const r of game) {
      expect(r.meta?.section, r.path).toBeTruthy();
      expect(typeof r.meta?.title, r.path).toBe('function');
      expect(r.meta!.title!(zhCN), r.path).toBeTruthy();
    }
  });
  it('除了底部 6 个入口，每个游戏内页面都有上一级', () => {
    for (const r of game) {
      if (ROOT_PATHS.has(r.path)) expect(r.meta?.parent, r.path).toBeUndefined();
      else expect(r.meta?.parent, r.path).toBeTruthy();
    }
  });
  it('新增小镇、我、帮助中心；旧的“更多”跳到小镇', () => {
    for (const p of ['/map', '/me', '/help']) expect(routes.some((r) => r.path === p)).toBe(true);
    expect(routes.find((r) => r.path === '/more')?.redirect).toBe('/map');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/nav apps/web/src/router.test.ts`
Expected: FAIL（找不到 `./sections`、`./routeMeta`）

- [ ] **Step 3: 写 `sections.ts`、`routeMeta.ts`**

```ts
// nav/sections.ts
import type { UiArtName } from '../art/generated/names';

/** 底部导航的 6 个入口（界面改版设计 §4.1）：每个页面属于其中一个，顶栏和底部导航据此显示 */
export type Section = 'home' | 'cookbooks' | 'cupboard' | 'market' | 'friends' | 'map';
export interface SectionDef {
  key: Section;
  to: string;
  art: UiArtName;
  /** 所属的区服功能；关掉时不显示（问题记录 248） */
  feature?: string;
}
export const SECTIONS: readonly SectionDef[] = [
  { key: 'home', to: '/', art: 'nav-home' },
  { key: 'cookbooks', to: '/cookbooks', art: 'nav-cookbooks', feature: 'cookbook' },
  { key: 'cupboard', to: '/cupboard', art: 'nav-cupboard', feature: 'cupboard' },
  { key: 'market', to: '/market', art: 'nav-market', feature: 'market' },
  { key: 'friends', to: '/friends', art: 'nav-friends', feature: 'friend' },
  { key: 'map', to: '/map', art: 'nav-map' },
];
export const ROOT_PATHS: ReadonlySet<string> = new Set(SECTIONS.map((s) => s.to));
```

```ts
// nav/routeMeta.ts
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { Messages } from '../i18n';
import type { Section } from './sections';

/** 路由元数据（界面改版设计 §4.2）：所属入口、标题、逻辑上一级 */
export interface NavMeta {
  section?: Section;
  title?: (t: Messages) => string;
  parent?: string | ((to: RouteLocationNormalizedLoaded) => string);
}
declare module 'vue-router' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface RouteMeta extends NavMeta {}
}

export function routeTitle(meta: NavMeta, t: Messages): string | null {
  return meta.title ? meta.title(t) : null;
}

export function parentPath(route: RouteLocationNormalizedLoaded): string | null {
  const p = route.meta.parent;
  if (!p) return null;
  return typeof p === 'function' ? p(route) : p;
}
```

- [ ] **Step 4: 新文案键**

`nav.ts`（四种语言；繁中在 Task 7 生成）：
- `tabs` 加 `map`：`'小镇'` / `'Town'` / `'Ville'` / `'Pueblo'`；`tabs.more` 删除。
- 加 `titles`（没有现成标题键的页面用）：

| 键 | zh-CN | en | fr | es |
|---|---|---|---|---|
| `floor` | 楼层餐桌 | Floors and tables | Étages et tables | Plantas y mesas |
| `income` | 收益记录 | Income log | Journal des revenus | Registro de ingresos |
| `info` | 餐厅信息 | Restaurant info | Infos du restaurant | Info del restaurante |
| `activation` | 签到和今日活跃 | Check-in and activity | Pointage et activité | Registro y actividad |
| `tasks` | 任务 | Quests | Quêtes | Misiones |
| `cookbooks` | 食谱 | Recipes | Recettes | Recetas |
| `cupboard` | 橱柜 | Pantry | Garde-manger | Despensa |
| `market` | 菜场 | Market | Marché | Mercado |
| `store` | 仓库 | Storage | Entrepôt | Almacén |
| `shop` | 商店 | Shop | Boutique | Tienda |
| `friends` | 好友 | Friends | Amis | Amigos |
| `friendRest` | 好友餐厅 | Friend's restaurant | Restaurant d'un ami | Restaurante de un amigo |
| `map` | 小镇 | Town | Ville | Pueblo |
| `me` | 我 | Me | Moi | Yo |
| `help` | 帮助中心 | Help center | Centre d'aide | Centro de ayuda |
| `weather` | 天气 | Weather | Météo | Tiempo |
| `cookbook` | 食谱详情 | Recipe | Recette | Receta |
| `equipDetail` | 厨具详情 | Cookware | Ustensile | Utensilio |
| `forumPost` | 帖子 | Post | Message | Publicación |
| `wikiItem` | 游戏资料 | Game data | Données du jeu | Datos del juego |

（`friends`、`cupboard`、`market`、`cookbooks` 和 `tabs` 里的同名词一致；对照 `docs/i18n-glossary.md`，不一致以术语表为准。）

- [ ] **Step 5: 路由补元数据、新增三个页面路由**

`router.ts` 顶部加 `import type { Messages } from './i18n';` 和一个小工具 `const T = (f: (t: Messages) => string) => f;`（只为类型推断）。按下表给每条路由的 `meta` 加 `section`、`title`、`parent`（不改原有的 `needRestaurant`、`gameChrome`、`public`）：

| 路由 | section | title | parent |
|---|---|---|---|
| `/` | home | `t.nav.tabs.rest` | — |
| `/rest/floor` | home | `t.nav.titles.floor` | `/` |
| `/rest/income` | home | `t.nav.titles.income` | `/` |
| `/rest/info` | home | `t.nav.titles.info` | `/me` |
| `/rest/activation` | home | `t.nav.titles.activation` | `/` |
| `/rest/tasks` | home | `t.nav.titles.tasks` | `/` |
| `/rest/look` | home | `t.rest.look.title` | `/me` |
| `/rest/equip` | home | `t.equip.title` | `/me` |
| `/rest/equip/:id` | home | `t.nav.titles.equipDetail` | `/rest/equip` |
| `/rest/gem` | home | `t.equip.gemPage.title` | `/rest/equip` |
| `/mc` | cookbooks | `t.mc.title` | `/cookbooks` |
| `/temple` | map | `t.temple.title` | `/map` |
| `/yard` | map | `t.yard.title` | `/map` |
| `/bar` | map | `t.bar.title` | `/map` |
| `/tower` | map | `t.tower.title` | `/map` |
| `/takeaway` | map | `t.takeaway.title` | `/map` |
| `/town` | map | `t.town.title` | `/map` |
| `/wiki` | map | `t.wiki.title` | `/help` |
| `/wiki/guide`、`/wiki/api` | map | `t.wiki.guide.title`、`t.wiki.api.title` | `/help` |
| `/wiki/goods/:id`、`/wiki/foods/:id`、`/wiki/cookbooks/:id`、`/wiki/streets/:id` | map | `t.nav.titles.wikiItem` | `/wiki` |
| `/wiki/:kind` | map | `t.wiki.title` | `/wiki` |
| `/changelog` | map | `t.site.changelogTitle` | `/help` |
| `/links` | map | `t.site.linksTitle` | `/help` |
| `/guide` | map | `t.guide.title` | `/help` |
| `/redeem` | map | `t.misc.redeem.title` | `/me` |
| `/invite` | map | `t.misc.invite.title` | `/me` |
| `/mail` | home | `t.mail.title` | `/` |
| `/activities` | map | `t.activity.title` | `/map` |
| `/cookbooks` | cookbooks | `t.nav.titles.cookbooks` | — |
| `/cookbooks/progress` | cookbooks | `t.cookbook.progress.title` | `/cookbooks` |
| `/cookbooks/:id` | cookbooks | `t.nav.titles.cookbook` | `/cookbooks` |
| `/cupboard` | cupboard | `t.nav.titles.cupboard` | — |
| `/market` | market | `t.nav.titles.market` | — |
| `/exchange` | map | `t.exchange.title` | `/map` |
| `/acquire` | map | `t.acquire.title` | `/map` |
| `/kuji` | map | `t.kuji.title` | `/map` |
| `/predict` | map | `t.predict.title` | `/map` |
| `/shop` | map | `t.nav.titles.shop` | `/map` |
| `/store` | home | `t.nav.titles.store` | `/me` |
| `/society` | map | `t.society.title` | `/map` |
| `/society/:npc` | map | `t.society.title` | `/society` |
| `/society/star`、`/oil`、`/rename`、`/move` | map | `t.society.title` | `/society` |
| `/weather` | home | `t.nav.titles.weather` | `/` |
| `/friends` | friends | `t.nav.titles.friends` | — |
| `/forum`、`/forum/new` | map | `t.forum.title` | `/map`、`/forum` |
| `/forum/:id/edit`、`/forum/:id` | map | `t.forum.title`、`t.nav.titles.forumPost` | `(to) => /forum/${id}`、`/forum` |
| `/friends/:restId` | friends | `t.nav.titles.friendRest` | `/friends` |
| `/friends/:restId/flip`、`/exchange` | friends | `t.friends.flip.title`、`t.friends.exchange.title` | `(to) => /friends/${restId}` |
| `/account` | map | `t.account.title` | `/me` |

新增（放在 `/more` 前面）：

```ts
  // 小镇、我、帮助中心（界面改版 P2a，设计 §4.1）
  {
    path: '/map',
    name: 'map',
    component: () => import('./views/MapView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.nav.titles.map) },
  },
  {
    path: '/me',
    name: 'me',
    component: () => import('./views/MeView.vue'),
    meta: { needRestaurant: true, section: 'map', title: T((t) => t.nav.titles.me), parent: '/' },
  },
  {
    path: '/help',
    name: 'help',
    component: () => import('./views/HelpView.vue'),
    meta: { gameChrome: true, section: 'map', title: T((t) => t.nav.titles.help), parent: '/me' },
  },
```

`/more` 改成 `{ path: '/more', redirect: '/map' },`。

注意：
- 路由 `parent` 用函数时，函数参数类型 `RouteLocationNormalizedLoaded`，取 `to.params.restId`、`to.params.id` 用 `String(...)`。
- `/rest/info`、`/rest/look`、`/rest/equip`、`/store` 的上一级是 `/me`（设计 §4.1：“我的店”收进“我”）；它们的 `section` 仍是 `home`（属于餐厅）。
- `/account`、`/redeem`、`/invite` 的 `section` 写 `map`：“我”从小镇所在的入口进（顶栏头像），底部没有“我”的入口。

- [ ] **Step 6: 跑测试，确认通过**

Run: `pnpm vitest run --project web apps/web/src/nav apps/web/src/router.test.ts`
Expected: PASS。`/map`、`/me`、`/help` 的页面文件 Task 4 才建：本步先建三个只有 `<template><div /></template>` 的占位文件，让路由的动态 import 能解析（Task 4 覆盖）。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/nav apps/web/src/router.ts apps/web/src/router.test.ts apps/web/src/views/MapView.vue apps/web/src/views/MeView.vue apps/web/src/views/HelpView.vue apps/web/src/i18n/locales/zh-CN/nav.ts apps/web/src/i18n/locales/en/nav.ts apps/web/src/i18n/locales/fr/nav.ts apps/web/src/i18n/locales/es/nav.ts
git commit -m "feat(web): 路由元数据：所属入口、标题、逻辑上一级；新增小镇、我、帮助中心路由（界面改版 P2a）"
```

（`nav.ts` 删 `tabs.more` 会让 `BottomNav.vue` 类型报错：本任务先保留 `tabs.more`，Task 3 删除。）

---

### Task 2: 动态标题和新顶栏

**Files:**
- Create: `apps/web/src/stores/pageTitle.ts`、`apps/web/src/stores/pageTitle.test.ts`
- Rewrite: `apps/web/src/components/AppHeader.vue`、`apps/web/src/components/AppHeader.test.ts`
- Modify: `apps/web/src/styles/main.css`（`.dt-header` 一组）

**Interfaces:**
- Consumes: Task 1 的 `routeTitle`、`parentPath`、`ROOT_PATHS`
- Produces（`stores/pageTitle.ts`）:
  ```ts
  export const usePageTitleStore: StoreDefinition<'pageTitle', { path: string | null; title: string | null }>;
  /** 页面里调用：标题跟着 get() 变；离开页面（卸载）时清掉 */
  export function usePageTitle(get: () => string | null | undefined): void;
  ```
- Produces: `AppHeader` 的 `data-testid`：`back`、`page-title`、`clock`（沿用 `HeaderClock`）、`mail-link`、`me-link`

- [ ] **Step 1: 写测试**

`stores/pageTitle.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { usePageTitle, usePageTitleStore } from './pageTitle';

beforeEach(() => setActivePinia(createPinia()));

describe('动态标题（界面改版 P2a）', () => {
  it('页面写进标题，数据变了跟着变；还没读回来（空）时不写', async () => {
    const name = ref<string | null>(null);
    const C = defineComponent({ setup: () => (usePageTitle(() => name.value), () => h('div')) });
    const w = mount(C);
    const s = usePageTitleStore();
    expect(s.title).toBeNull();
    name.value = '不会玩的店';
    await nextTick();
    expect(s.title).toBe('不会玩的店');
    w.unmount();
    expect(s.title).toBeNull();
  });
});
```

`components/AppHeader.test.ts`（整份替换；`mountHeader(path, { me, inGame })` 用内存路由挂到给定地址，路由表取 `router.ts` 的 `routes`，组件用 `{ template: '<div/>' }` 代替真实页面）：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import AppHeader from './AppHeader.vue';
import { routes } from '../router';
import { usePageTitleStore } from '../stores/pageTitle';
import { useSessionStore } from '../stores/session';

vi.mock('../api/endpoints', () => ({ endpoints: { mailUnread: vi.fn().mockResolvedValue({ unread: 0 }) } }));

const stub = { template: '<div/>' };
async function mountHeader(path: string, inGame = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes.map((r) => ('component' in r && r.component ? { ...r, component: stub, children: undefined } : r)) as never,
  });
  await router.push(path);
  const w = mount(AppHeader, { props: { inGame }, global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  useSessionStore().me = { restaurantId: 1, role: 'player' } as never;
});

describe('顶栏（界面改版 P2a，设计 §4.2）', () => {
  it('显示当前页的标题；根页面没有返回', async () => {
    const { w } = await mountHeader('/cookbooks');
    expect(w.get('[data-testid="page-title"]').text()).toBe('食谱');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
  });

  it('返回去逻辑上一级，没有浏览历史也一样（不回首页、不退出网站）', async () => {
    const { w, router } = await mountHeader('/friends/9/flip');
    await w.get('[data-testid="back"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/friends/9');
  });

  it('页面写了动态标题就用它（帖子标题、店名），没写用路由标题', async () => {
    const { w } = await mountHeader('/forum/3');
    expect(w.get('[data-testid="page-title"]').text()).toBe('帖子');
    usePageTitleStore().title = '新手怎么赚钱';
    await flushPromises();
    expect(w.get('[data-testid="page-title"]').text()).toBe('新手怎么赚钱');
  });

  it('标题一行截断，不把右边的邮件、“我”挤出去', async () => {
    const { w } = await mountHeader('/bar');
    expect(w.get('[data-testid="page-title"]').classes()).toContain('dt-clamp1');
    expect(w.find('[data-testid="mail-link"]').exists()).toBe(true);
    expect(w.get('[data-testid="me-link"]').attributes('href')).toBe('/me');
  });

  it('没登录看公开页：有标题，没有返回、邮件和“我”；登录页只显示游戏名', async () => {
    useSessionStore().me = null;
    const { w } = await mountHeader('/wiki', false);
    expect(w.get('[data-testid="page-title"]').text()).toBe('游戏资料');
    expect(w.find('[data-testid="back"]').exists()).toBe(false);
    expect(w.find('[data-testid="mail-link"]').exists()).toBe(false);
    expect(w.find('[data-testid="me-link"]').exists()).toBe(false);
    const login = await mountHeader('/login', false);
    expect(login.w.get('[data-testid="page-title"]').text()).toBe('美味小镇');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/stores/pageTitle.test.ts apps/web/src/components/AppHeader.test.ts`
Expected: FAIL（找不到 `./pageTitle`；顶栏没有 `page-title`）

- [ ] **Step 3: 写 `pageTitle.ts`**

```ts
import { defineStore } from 'pinia';
import { onBeforeUnmount, watchEffect } from 'vue';

/** 页面的动态标题（店名、帖子标题、NPC 名；界面改版 P2a）：顶栏优先显示它，没有时显示路由标题 */
export const usePageTitleStore = defineStore('pageTitle', {
  state: () => ({ title: null as string | null }),
});

export function usePageTitle(get: () => string | null | undefined): void {
  const s = usePageTitleStore();
  const stop = watchEffect(() => {
    s.title = get() || null;
  });
  onBeforeUnmount(() => {
    stop();
    s.title = null;
  });
}
```

- [ ] **Step 4: 重写 `AppHeader.vue`**

```vue
<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useT } from '../composables/useT';
import { parentPath, routeTitle } from '../nav/routeMeta';
import { useMailStore } from '../stores/mail';
import { usePageTitleStore } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
import HeaderClock from './HeaderClock.vue';

/**
 * 顶栏（界面改版设计 §4.2）：左边返回（回逻辑上一级）和当前页标题，右边游戏时间、邮件、“我”。
 * 根页面（底部 6 个入口）没有返回；页面自己的标题行已去掉，顶栏就是标题。
 */
const props = defineProps<{ inGame: boolean }>();
const route = useRoute();
const router = useRouter();
const t = useT();
const pageTitle = usePageTitleStore();
const restStore = useRestaurantStore();
const parent = computed(() => (props.inGame ? parentPath(route) : null));
const title = computed(() => pageTitle.title ?? routeTitle(route.meta, t.value) ?? t.value.nav.appName);
/** 头像：店名第一个字 */
const initial = computed(() => [...(restStore.rest?.name ?? '')][0] ?? '');
const mail = useMailStore();
watch(
  () => route.path,
  () => {
    if (props.inGame) void mail.refresh();
  },
  { immediate: true },
);
function back() {
  if (parent.value) void router.push(parent.value);
}
</script>

<template>
  <header class="dt-header">
    <button
      v-if="parent"
      type="button"
      class="dt-header-back"
      data-testid="back"
      :aria-label="t.nav.back"
      @click="back"
    >
      <i class="bi bi-chevron-left" aria-hidden="true"></i>
    </button>
    <h1 class="dt-header-title dt-clamp1" data-testid="page-title">{{ title }}</h1>
    <template v-if="inGame">
      <HeaderClock class="dt-header-clock" />
      <RouterLink
        to="/mail"
        class="dt-header-icon"
        data-testid="mail-link"
        :aria-label="mail.unread > 0 ? t.nav.mailUnread(mail.unread) : t.nav.mail"
      >
        <i class="bi bi-envelope" aria-hidden="true"></i>
        <span v-if="mail.unread > 0" class="badge rounded-pill bg-danger dt-mail-badge">{{ mail.unread }}</span>
      </RouterLink>
      <RouterLink to="/me" class="dt-header-me" data-testid="me-link" :aria-label="t.nav.titles.me">{{
        initial
      }}</RouterLink>
    </template>
  </header>
</template>
```

（原来的“点店名回首页”去掉：底部“餐厅”就是首页；没进游戏的页面不需要。`HeaderClock` 的 `data-testid` 不变。）

`main.css`：删掉旧的 `.dt-header`、`.dt-mail-icon`，加：

```css
/* ---------- 顶栏（界面改版 P2a，设计 §4.2） ---------- */
.dt-header {
  position: sticky;
  top: 0;
  z-index: 1020;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 8px;
  background: var(--dt-header-bg);
  border-bottom: 1px solid var(--dt-line);
}
.dt-header-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: -4px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--dt-muted);
  font-size: 18px;
}
.dt-header-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--dt-text);
}
.dt-header-clock {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--dt-muted);
}
.dt-header-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--dt-muted);
  font-size: 20px;
  line-height: 1;
}
.dt-header-me {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--dt-primary-soft);
  color: var(--dt-primary-ink);
  font-size: 13px;
  font-weight: 600;
}
@media (hover: hover) and (pointer: fine) {
  .dt-header-back:hover {
    background: var(--dt-surface-2);
  }
}
```

`HeaderClock.vue` 外层原来带的 `ms-auto me-3` 由调用处给，改为 `dt-header-clock` 后在 `HeaderClock.vue` 里不需要改。

- [ ] **Step 5: 跑测试，确认通过**

Run: `pnpm vitest run --project web apps/web/src/stores/pageTitle.test.ts apps/web/src/components/AppHeader.test.ts apps/web/src/components/HeaderClock.test.ts apps/web/src/styles`
Expected: PASS。`links.test.ts` 里 `BLOCK_BTN_LINK` 包含 `components/AppHeader.vue`：新顶栏不再用 `btn-link`，保留在集合里无害。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/stores/pageTitle.ts apps/web/src/stores/pageTitle.test.ts apps/web/src/components/AppHeader.vue apps/web/src/components/AppHeader.test.ts apps/web/src/styles/main.css
git commit -m "feat(web): 顶栏显示页面标题，返回回逻辑上一级，右边加“我”（界面改版 P2a）"
```

---

### Task 3: 底部导航

**Files:**
- Rewrite: `apps/web/src/components/BottomNav.vue`、`apps/web/src/components/BottomNav.test.ts`
- Delete: `apps/web/src/components/MoreLinks.vue`、`apps/web/src/components/MoreLinks.test.ts`、`apps/web/src/views/MoreView.vue`
- Modify: `apps/web/src/styles/main.css`（`.dt-bottom-nav` 一组；删 `.dt-more-*`）
- Modify: 四种语言 `nav.ts`（删 `tabs.more`、`groups`；`links` 里只被 `MoreLinks` 用的键在 Task 4 之后统一清理）

**Interfaces:**
- Consumes: `SECTIONS`、`route.meta.section`、`DtArt`
- Produces: 每个入口 `data-testid="tab-<key>"`；当前入口带 `aria-current="page"` 和 `.active`

- [ ] **Step 1: 写测试**（整份替换 `BottomNav.test.ts`；沿用原来的 `vi.mock('../api/endpoints')` 和好友红点两个用例，挂载时用带 `meta.section` 的路由）

```ts
const mountNav = async (path = '/', disabled: string[] = []) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: BottomNav, meta: { section: 'home' } },
      { path: '/cookbooks/:id?', component: BottomNav, meta: { section: 'cookbooks' } },
      { path: '/bar', component: BottomNav, meta: { section: 'map' } },
      { path: '/:p(.*)*', component: BottomNav },
    ],
  });
  useRestaurantStore().rest = { disabledFeatures: disabled } as never;
  await router.push(path);
  const w = mount(BottomNav, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};

describe('底部导航（界面改版 P2a，设计 §4.1）', () => {
  it('六个入口，“更多”换成“小镇”', async () => {
    const w = await mountNav();
    expect(w.findAll('[data-testid^="tab-"]').map((x) => x.text())).toEqual(['餐厅', '食谱', '橱柜', '菜场', '好友', '小镇']);
    expect(w.find('[data-testid="tab-more"]').exists()).toBe(false);
  });

  it('按所属入口高亮：在食谱详情页“食谱”亮，在酒吧“小镇”亮', async () => {
    const a = await mountNav('/cookbooks/12');
    expect(a.get('[data-testid="tab-cookbooks"]').attributes('aria-current')).toBe('page');
    const b = await mountNav('/bar');
    expect(b.get('[data-testid="tab-map"]').attributes('aria-current')).toBe('page');
    expect(b.get('[data-testid="tab-home"]').attributes('aria-current')).toBeUndefined();
  });

  it('区服关掉的功能不显示入口', async () => {
    const w = await mountNav('/', ['market']);
    expect(w.find('[data-testid="tab-market"]').exists()).toBe(false);
    expect(w.findAll('[data-testid^="tab-"]')).toHaveLength(5);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/components/BottomNav.test.ts`
Expected: FAIL（还有 `tab-more`，没有 `tab-map`）

- [ ] **Step 3: 重写 `BottomNav.vue`、删掉“更多”**

```vue
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useT } from '../composables/useT';
import { SECTIONS } from '../nav/sections';
import { useFriendsStore } from '../stores/friends';
import { useRestaurantStore } from '../stores/restaurant';
import DtArt from './DtArt.vue';

/** 底部导航（界面改版设计 §4.1）：6 个入口，按页面所属的入口高亮（详情页也亮） */
const t = useT();
const route = useRoute();
const restStore = useRestaurantStore();
const friends = useFriendsStore();
const tabs = computed(() => SECTIONS.filter((s) => !s.feature || restStore.featureOn(s.feature)));
const current = computed(() => route.meta.section ?? null);
const LABEL = { home: 'rest', cookbooks: 'cookbooks', cupboard: 'cupboard', market: 'market', friends: 'friends', map: 'map' } as const;
onMounted(() => friends.refreshPending());
watch(
  () => route.path,
  () => void friends.refreshPending(),
);
</script>

<template>
  <nav class="dt-bottom-nav">
    <RouterLink
      v-for="s in tabs"
      :key="s.key"
      :to="s.to"
      :class="['dt-tab', { active: current === s.key }]"
      :aria-current="current === s.key ? 'page' : undefined"
      :data-testid="`tab-${s.key}`"
    >
      <DtArt :name="s.art" :size="24" />
      <span class="dt-tab-label">{{ t.nav.tabs[LABEL[s.key]] }}</span>
      <span
        v-if="s.key === 'friends' && friends.pending > 0"
        class="badge rounded-pill bg-danger dt-tab-dot"
        data-testid="friend-dot"
        >{{ friends.pending }}</span
      >
    </RouterLink>
  </nav>
</template>
```

`main.css`：删掉 `.dt-bottom-nav a`、`.dt-bottom-nav a.router-link-exact-active`、`.dt-bottom-nav a.dt-more-on`、`.dt-more-grid`、`.dt-more-link`（含 `:hover`、`i`）、`.dt-more-backdrop`、`.dt-more-sheet`，`.dt-bottom-nav` 改为：

```css
/* ---------- 底部导航（界面改版 P2a，设计 §4.1） ---------- */
.dt-bottom-nav {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  z-index: 1030;
  display: flex;
  width: 100%;
  max-width: 720px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--dt-surface);
  border-top: 1px solid var(--dt-line);
}
.dt-tab {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 2px 4px;
  color: var(--dt-muted);
  text-decoration: none;
  font-size: 11px;
}
/* 法文、西文的入口名长：一行截断，不挤到隔壁（P1 截图里 Restaurant Recettes Garde-manger 连在一起） */
.dt-tab-label {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dt-tab .dt-art-ui {
  color: var(--dt-muted);
}
.dt-tab.active {
  color: var(--dt-primary-ink);
  font-weight: 600;
}
.dt-tab.active .dt-art-ui {
  color: var(--dt-primary-ink);
  fill-opacity: 0.4;
}
.dt-tab-dot {
  position: absolute;
  top: 2px;
  left: 55%;
}
@media (prefers-reduced-motion: no-preference) {
  .dt-tab:active .dt-art {
    transform: scale(0.92);
    transition: transform var(--dt-dur-press) var(--dt-ease-out);
  }
}
```

`index.html` 的 viewport 加 `viewport-fit=cover`（backlog：没有它 `env(safe-area-inset-bottom)` 一直是 0）：`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`；`.dt-main-nav` 的 `padding-bottom: 72px` 改成 `calc(64px + env(safe-area-inset-bottom, 0px))`，`.dt-toasts-bottom` 同理加上安全区（已有）。

删掉 `MoreLinks.vue`、`MoreLinks.test.ts`、`MoreView.vue`；四种语言 `nav.ts` 删 `tabs.more`、`groups`。

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm vitest run --project web apps/web/src/components apps/web/src/styles apps/web/src/i18n`
Expected: PASS（`i18n` 的键一致性要先跑 `pnpm -F @dt/web i18n:tw`）。`mainCss.test` 的“index.html 不禁止缩放”仍过（`viewport-fit` 不影响）。

- [ ] **Step 5: 提交**

```bash
git add -A apps/web/src/components/BottomNav.vue apps/web/src/components/BottomNav.test.ts apps/web/src/components/MoreLinks.vue apps/web/src/components/MoreLinks.test.ts apps/web/src/views/MoreView.vue apps/web/src/styles/main.css apps/web/index.html apps/web/src/i18n/locales
git commit -m "feat(web): 底部导航换成 6 个入口，“更多”换成“小镇”，按所属入口高亮（界面改版 P2a）"
```

---

### Task 4: 小镇、我、帮助中心

**Files:**
- Create: `apps/web/src/components/NavRow.vue` + test
- Rewrite（替换 Task 1 的占位）: `apps/web/src/views/MapView.vue`、`MeView.vue`、`HelpView.vue` + 三个 test
- Modify: `apps/web/src/styles/main.css`（`.dt-place-*`、`.dt-nav-row`、`.dt-group-*`）
- Modify: 四种语言 `nav.ts`（`map`、`me`、`help` 三组文案）、`account.ts`（`title` 改“账号和设置”）、`rest.ts`（`look.title` 改“装扮和称号”）

**Interfaces:**
- Consumes: `DtArt`、`restStore.featureOn`、`session.me.role`、`restStore.rest`
- Produces（`NavRow.vue`）: props `{ to: string; art: UiArtName; label: string; value?: string }`，渲染整行 `RouterLink`（`class="dt-nav-row"`），右侧灰色 `›`（CSS `::after`）
- Produces（`MapView.vue`）: 每个地方 `data-testid="place-<key>"`

文案（`nav.ts` 新增；繁中 Task 7 生成）：

```ts
  map: {
    groups: { trade: '买卖', play: '玩乐', public: '公共' },
    places: {
      shop: { name: '商店', sub: '银币商店 · 黑市' },
      exchange: { name: '交易所', sub: '现货 · 期货 · 大宗' },
      acquire: { name: '收购', sub: '身价榜 · 打理' },
      kuji: { name: '一番赏', sub: '本月主题' },
      predict: { name: '竞猜', sub: '下注会不会发生' },
      takeaway: { name: '外卖', sub: '接单 · 配送' },
      bar: { name: '酒吧', sub: '雯姐和小游戏' },
      temple: { name: '神殿', sub: '鉴定 · 试炼' },
      tower: { name: '厨塔', sub: '挑战 · 赛厨' },
      yard: { name: '菜园', sub: '种菜 · 池塘' },
      society: { name: '协会', sub: '升星 · 兑换' },
      town: { name: '广场', sub: '新闻 · 排行' },
      forum: { name: '论坛', sub: '闲聊 · 攻略' },
      activities: { name: '活动', sub: '限时活动' },
    },
  },
  me: {
    groups: { shop: '我的店', account: '账号', help: '帮助' },
    info: '餐厅信息',
    look: '装扮和称号',
    equip: '厨具',
    store: '仓库',
    redeem: '兑换码和邀请',
    settings: '账号和设置',
    shard: '切换区服',
    help: '帮助中心',
    admin: '管理后台',
    headLine: (user: string, street: string) => `${user} · ${street}`,
  },
  help: {
    guide: '游玩指引',
    wiki: '游戏资料',
    wikiGuide: '玩法攻略',
    api: '开放接口',
    changelog: '更新记录',
    links: '友情链接',
  },
```

en / fr / es 对照（地方名沿用各语言 `nav.links` 里的现有译名，副标题如下）：

| 键 | en | fr | es |
|---|---|---|---|
| groups | Trade / Play / Public | Commerce / Loisirs / Public | Comercio / Ocio / Público |
| shop.sub | Coin shop · Black market | Boutique · Marché noir | Tienda · Mercado negro |
| exchange.sub | Spot · Futures · Bulk | Comptant · À terme · En gros | Contado · Futuros · Al por mayor |
| acquire.sub | Values · Tending | Valeurs · Entretien | Valores · Cuidados |
| kuji.sub | This month's theme | Thème du mois | Tema del mes |
| predict.sub | Bet on what happens | Pariez sur l'avenir | Apuesta por lo que pase |
| takeaway.sub | Orders · Delivery | Commandes · Livraison | Pedidos · Entregas |
| bar.sub | Sister Wen and games | Sœur Wen et jeux | Hermana Wen y juegos |
| temple.sub | Appraisal · Trials | Expertise · Épreuves | Tasación · Pruebas |
| tower.sub | Climb · Duels | Ascension · Duels | Ascenso · Duelos |
| yard.sub | Crops · Pond | Cultures · Étang | Cultivos · Estanque |
| society.sub | Stars · Exchange | Étoiles · Échanges | Estrellas · Canjes |
| town.sub | News · Rankings | Nouvelles · Classements | Noticias · Clasificaciones |
| forum.sub | Chat · Tips | Discussions · Astuces | Charla · Consejos |
| activities.name / sub | Events / Limited-time events | Événements / Événements limités | Eventos / Eventos limitados |
| me.groups | My restaurant / Account / Help | Mon restaurant / Compte / Aide | Mi restaurante / Cuenta / Ayuda |
| me.look | Look and titles | Tenue et titres | Aspecto y títulos |
| me.redeem | Codes and invites | Codes et invitations | Códigos e invitaciones |
| me.settings | Account and settings | Compte et réglages | Cuenta y ajustes |
| help.wikiGuide | Strategy guide | Guide stratégique | Guía de estrategia |
| help.api | Open API | API ouverte | API abierta |

其余键（info、equip、store、shard、help、admin、guide、wiki、changelog、links、地方名）直接用该语言 `nav.links` 里同义的现有字符串。`account.title` 四种语言改成和 `me.settings` 一样；`rest.look.title` 改成和 `me.look` 一样（en 原来的 “Appearance” 和外观设置撞名）。

- [ ] **Step 1: 写测试**

`NavRow.test.ts`：

```ts
import { mount, RouterLinkStub } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NavRow from './NavRow.vue';

describe('导航行（界面改版 P2a，设计 §5.2）', () => {
  it('整行是一个链接：图标、名称、可选的当前值', () => {
    const w = mount(NavRow, {
      props: { to: '/account', art: 'me-settings', label: '账号和设置', value: '深色 · 简中' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(w.getComponent(RouterLinkStub).props('to')).toBe('/account');
    expect(w.classes()).toContain('dt-nav-row');
    expect(w.text()).toContain('账号和设置');
    expect(w.get('.dt-nav-row-value').text()).toBe('深色 · 简中');
  });
});
```

`MapView.test.ts`：

```ts
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import MapView from './MapView.vue';
import { useRestaurantStore } from '../stores/restaurant';

beforeEach(() => setActivePinia(createPinia()));
const mountMap = (disabled: string[] = []) => {
  useRestaurantStore().rest = { disabledFeatures: disabled } as never;
  return mount(MapView, { global: { stubs: { RouterLink: RouterLinkStub } } });
};

describe('小镇（界面改版 P2a，设计 §4.1）', () => {
  it('三组地方：买卖、玩乐、公共', () => {
    const w = mountMap();
    expect(w.findAll('.dt-section').map((x) => x.text())).toEqual(['买卖', '玩乐', '公共']);
    expect(w.get('[data-testid="place-bar"]').text()).toContain('酒吧');
    expect(w.get('[data-testid="place-bar"]').text()).toContain('雯姐和小游戏');
  });
  it('区服关掉的功能不显示', () => {
    const w = mountMap(['bar', 'kuji']);
    expect(w.find('[data-testid="place-bar"]').exists()).toBe(false);
    expect(w.find('[data-testid="place-kuji"]').exists()).toBe(false);
  });
});
```

`MeView.test.ts`：

```ts
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import MeView from './MeView.vue';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';

beforeEach(() => {
  setActivePinia(createPinia());
  useRestaurantStore().rest = { name: '不会玩', streetId: 1, streetName: '新手街', disabledFeatures: [] } as never;
});
const links = (w: ReturnType<typeof mount>) => w.findAllComponents(RouterLinkStub).map((l) => l.props('to'));

describe('我（界面改版 P2a，设计 §4.1）', () => {
  it('店铺头、我的店、账号、帮助', () => {
    useSessionStore().me = { role: 'player', username: 'u1' } as never;
    const w = mount(MeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(w.text()).toContain('不会玩');
    expect(links(w)).toEqual(['/rest/info', '/rest/look', '/rest/equip', '/store', '/redeem', '/account', '/shards', '/help']);
  });
  it('协管、管理员多一个后台入口', () => {
    useSessionStore().me = { role: 'admin', username: 'u1' } as never;
    const w = mount(MeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(links(w)).toContain('/admin');
  });
});
```

（店铺头第二行写“账号名 · 街道”：`MeDto` 没有区服名。）

`HelpView.test.ts`：

```ts
import { mount, RouterLinkStub } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HelpView from './HelpView.vue';

describe('帮助中心（界面改版 P2a，设计 §4.1）', () => {
  it('六个入口', () => {
    const w = mount(HelpView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toEqual([
      '/guide', '/wiki', '/wiki/guide', '/wiki/api', '/changelog', '/links',
    ]);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/components/NavRow.test.ts apps/web/src/views/MapView.test.ts apps/web/src/views/MeView.test.ts apps/web/src/views/HelpView.test.ts`
Expected: FAIL

- [ ] **Step 3: 写组件**

`NavRow.vue`：

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { UiArtName } from '../art/generated/names';
import DtArt from './DtArt.vue';

/** 导航行（界面改版设计 §5.2）：整行可点，图标、名称、当前值，右边灰色 ›（样式加） */
defineProps<{ to: string; art: UiArtName; label: string; value?: string }>();
</script>

<template>
  <RouterLink :to="to" class="dt-nav-row dt-tap">
    <DtArt :name="art" :size="22" />
    <span class="dt-nav-row-label">{{ label }}</span>
    <span v-if="value" class="dt-nav-row-value">{{ value }}</span>
  </RouterLink>
</template>
```

`MapView.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { UiArtName } from '../art/generated/names';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';

/** 小镇（界面改版设计 §4.1）：取代“更多”，按地方分三组 */
type PlaceKey = keyof ReturnType<typeof useT>['value']['nav']['map']['places'];
interface Place { key: PlaceKey; to: string; art: UiArtName; feature?: string }
const GROUPS: Array<{ key: 'trade' | 'play' | 'public'; places: Place[] }> = [
  {
    key: 'trade',
    places: [
      { key: 'shop', to: '/shop', art: 'place-shop', feature: 'shop' },
      { key: 'exchange', to: '/exchange', art: 'place-exchange', feature: 'exchange' },
      { key: 'acquire', to: '/acquire', art: 'place-acquire', feature: 'acquire' },
      { key: 'kuji', to: '/kuji', art: 'place-kuji', feature: 'kuji' },
      // 事件预测关掉后入口保留：页面只能查看持仓和结算（backlog 238-1）
      { key: 'predict', to: '/predict', art: 'place-predict' },
      { key: 'takeaway', to: '/takeaway', art: 'place-takeaway', feature: 'takeaway' },
    ],
  },
  {
    key: 'play',
    places: [
      { key: 'bar', to: '/bar', art: 'place-bar', feature: 'bar' },
      { key: 'temple', to: '/temple', art: 'place-temple', feature: 'temple' },
      { key: 'tower', to: '/tower', art: 'place-tower', feature: 'tower' },
      { key: 'yard', to: '/yard', art: 'place-yard', feature: 'yard' },
    ],
  },
  {
    key: 'public',
    places: [
      { key: 'society', to: '/society', art: 'place-society' },
      { key: 'town', to: '/town', art: 'place-plaza', feature: 'town' },
      { key: 'forum', to: '/forum', art: 'place-forum', feature: 'forum' },
      { key: 'activities', to: '/activities', art: 'place-activities', feature: 'activity' },
    ],
  },
];
const t = useT();
const restStore = useRestaurantStore();
const groups = computed(() =>
  GROUPS.map((g) => ({ ...g, places: g.places.filter((p) => !p.feature || restStore.featureOn(p.feature)) })).filter(
    (g) => g.places.length > 0,
  ),
);
</script>

<template>
  <section v-for="g in groups" :key="g.key">
    <h2 class="dt-section">{{ t.nav.map.groups[g.key] }}</h2>
    <div class="dt-place-grid">
      <RouterLink
        v-for="p in g.places"
        :key="p.key"
        :to="p.to"
        class="dt-place dt-tap"
        :data-testid="`place-${p.key}`"
      >
        <span class="dt-place-icon"><DtArt :name="p.art" :size="26" /></span>
        <span class="dt-place-name">{{ t.nav.map.places[p.key].name }}</span>
        <span class="dt-place-sub dt-clamp1">{{ t.nav.map.places[p.key].sub }}</span>
      </RouterLink>
    </div>
  </section>
</template>
```

（`h2.dt-section`：`.dt-section` 本来写在 `h6` 上，`h2` 的默认字号由 `.dt-section` 的 `font-size: 15px` 覆盖；`main.css` 的 `.dt-section` 加 `margin-bottom: 6px`。）

`MeView.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import NavRow from '../components/NavRow.vue';
import { useT } from '../composables/useT';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';

/** 我（界面改版设计 §4.1）：店铺头 + 我的店、账号、帮助；协管和管理员多一个后台 */
const t = useT();
const restStore = useRestaurantStore();
const session = useSessionStore();
const rest = computed(() => restStore.rest);
const staff = computed(() => Boolean(session.me && session.me.role !== 'player'));
const on = (f: string) => restStore.featureOn(f);
</script>

<template>
  <div v-if="rest" class="dt-me-head">
    <span class="dt-header-me dt-me-avatar">{{ [...rest.name][0] }}</span>
    <div class="dt-min0">
      <div class="dt-card-title dt-clamp1">{{ rest.name }}</div>
      <div class="dt-meta">{{ t.nav.me.headLine(session.me?.username ?? '', rest.streetName) }}</div>
    </div>
  </div>
  <h2 class="dt-section">{{ t.nav.me.groups.shop }}</h2>
  <div class="dt-group-card">
    <NavRow to="/rest/info" art="me-info" :label="t.nav.me.info" />
    <NavRow to="/rest/look" art="me-look" :label="t.nav.me.look" />
    <NavRow v-if="on('equip')" to="/rest/equip" art="me-equip" :label="t.nav.me.equip" />
    <NavRow v-if="on('store')" to="/store" art="me-store" :label="t.nav.me.store" />
  </div>
  <h2 class="dt-section">{{ t.nav.me.groups.account }}</h2>
  <div class="dt-group-card">
    <NavRow v-if="on('redeem')" to="/redeem" art="me-redeem" :label="t.nav.me.redeem" />
    <NavRow to="/account" art="me-settings" :label="t.nav.me.settings" />
    <NavRow to="/shards" art="me-shard" :label="t.nav.me.shard" />
  </div>
  <h2 class="dt-section">{{ t.nav.me.groups.help }}</h2>
  <div class="dt-group-card">
    <NavRow to="/help" art="me-help" :label="t.nav.me.help" />
    <NavRow v-if="staff" to="/admin" art="me-admin" :label="t.nav.me.admin" />
  </div>
</template>
```

（`/redeem` 页面现在只有兑换码；“兑换码和邀请”这一行在 P2b 兑换码归一时把邀请也放进去。P2a 先指向 `/redeem`，`/invite` 仍从账号页进。）

`HelpView.vue`：

```vue
<script setup lang="ts">
import NavRow from '../components/NavRow.vue';
import { useT } from '../composables/useT';

/** 帮助中心（界面改版设计 §4.1）：指引、资料库、攻略、开放接口、更新记录、友情链接 */
const t = useT();
</script>

<template>
  <div class="dt-group-card">
    <NavRow to="/guide" art="sec-tasks" :label="t.nav.help.guide" />
    <NavRow to="/wiki" art="nav-cookbooks" :label="t.nav.help.wiki" />
    <NavRow to="/wiki/guide" art="sec-star" :label="t.nav.help.wikiGuide" />
    <NavRow to="/wiki/api" art="me-settings" :label="t.nav.help.api" />
    <NavRow to="/changelog" art="sec-news" :label="t.nav.help.changelog" />
    <NavRow to="/links" art="place-forum" :label="t.nav.help.links" />
  </div>
</template>
```

`main.css` 追加：

```css
/* ---------- 小镇、我、帮助中心（界面改版 P2a） ---------- */
.dt-place-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.dt-place {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px 6px;
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-md);
  background: var(--dt-surface);
  color: var(--dt-text);
  text-decoration: none;
  text-align: center;
  min-width: 0;
}
.dt-place-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--dt-radius-sm);
  background: var(--dt-primary-soft);
}
.dt-place-name {
  font-size: 14px;
  font-weight: 600;
}
.dt-place-sub {
  max-width: 100%;
  font-size: 11px;
  color: var(--dt-muted);
}
.dt-group-card {
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-md);
  overflow: hidden;
}
.dt-nav-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  color: var(--dt-text);
  text-decoration: none;
  border-bottom: 1px solid var(--dt-line);
}
.dt-nav-row:last-child {
  border-bottom: 0;
}
.dt-nav-row-label {
  flex: 1 1 auto;
  min-width: 0;
}
.dt-nav-row-value {
  font-size: 12px;
  color: var(--dt-muted);
}
.dt-nav-row::after {
  content: '›';
  content: '›' / '';
  color: var(--dt-muted);
}
.dt-me-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px 4px;
}
.dt-me-avatar {
  width: 44px;
  height: 44px;
  font-size: 18px;
}
```

（`.dt-header-me` 已在 Task 2 定义；`main.css` 不能有重复的顶层选择器，`.dt-me-avatar` 单独写。）

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm -F @dt/web i18n:tw && pnpm vitest run --project web apps/web/src/components/NavRow.test.ts apps/web/src/views/MapView.test.ts apps/web/src/views/MeView.test.ts apps/web/src/views/HelpView.test.ts apps/web/src/views/AccountView.test.ts apps/web/src/views/RestLookView.test.ts apps/web/src/i18n apps/web/src/styles`
Expected: PASS（`AccountView.test`、`RestLookView.test` 如有断言旧标题文字，改成新名字）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/NavRow.vue apps/web/src/components/NavRow.test.ts apps/web/src/views/MapView.vue apps/web/src/views/MapView.test.ts apps/web/src/views/MeView.vue apps/web/src/views/MeView.test.ts apps/web/src/views/HelpView.vue apps/web/src/views/HelpView.test.ts apps/web/src/styles/main.css apps/web/src/i18n/locales apps/web/src/views/AccountView.test.ts apps/web/src/views/RestLookView.test.ts
git commit -m "feat(web): 小镇页、“我”、帮助中心（界面改版 P2a）"
```

---

### Task 5: 各页面去掉标题行和返回链接

**Files:**
- Modify: 下表的页面和它们的测试
- Modify: `apps/web/src/styles/main.css`（`.dt-page-meta`；删 `.dt-page-title`、`h5` 规则、`.dt-back`）
- Modify: `apps/web/src/styles/links.test.ts`（`.dt-back` 规则改成“不再出现 `.dt-back`”）

**Interfaces:**
- Consumes: `usePageTitle`（Task 2）
- Produces: `.dt-page-meta`（标题行右侧原来那些东西现在单独一行，右对齐、小字）

规则：
- 删掉页面最上面的 `<h5>` 和包着它的 `.dt-page-title`（标题由顶栏显示）。
- 标题行右侧原来有东西（钱包、按钮、链接）的，保留它们，外面包 `<div class="dt-page-meta">`。
- 标题是动态的（店名、帖子标题、NPC 名、天气名、带等级的标题），改成在 `<script setup>` 里 `usePageTitle(() => …)`，模板里删掉。
- `.dt-back` 链接全部删掉（顶栏返回取代）。
- 页面里的 `h6.dt-section` 不动。
- 菜园（`YardView.vue`、`FriendYard.vue`）和登录、注册、忘记密码、重置密码、开店页的卡片标题不动。

| 页面 | 改法 |
|---|---|
| `AccountView` | 删标题行 |
| `AcquireView` | 删 `h5` |
| `ActivitiesView` | 删 `h5` |
| `BarView` | 删 `h5`；钱包留在 `.dt-page-meta` |
| `ChangelogView`、`GuideView`、`InviteView`、`LinksView`、`RedeemView` | 删标题行 |
| `CookbookInfoView` | `usePageTitle(() => 食谱名)`；等级标签 `.dt-tag` 移到下面信息行的开头 |
| `CookbookProgressView` | 删 `h6` 标题行和“返回食谱” |
| `EquipDetailView` | `usePageTitle(() => equipName(...))`；`+强化` 移到 `dt-meta` 行开头 |
| `EquipView` | 删 `h5`；“共 N 件厨具”放 `.dt-page-meta` |
| `ExchangeView`、`KujiView`、`PredictView`、`RestLookView`、`SocietyMoveView`、`SocietyRenameView`、`SocietyView`、`TakeawayView`、`TempleView`、`TowerView`、`FriendExchangeView`、`FriendFlipView`、`GemView` | 删 `h5` |
| `ForumEditView` | `usePageTitle(() => 新帖/编辑)`，删标题行 |
| `ForumPostView` | `usePageTitle(() => data?.post.title)`；删“返回论坛” |
| `ForumView` | 删 `h5`；右侧的发帖按钮和提示留在 `.dt-page-meta` |
| `MailView` | 删 `h5`；“全部领取”按钮留在 `.dt-page-meta` |
| `McView` | 删 `h5`；神殿鉴定、教室两个链接留在 `.dt-page-meta` |
| `RestaurantHomeView` | `usePageTitle(() => rest?.name)`；删 `h5`，天气和切换区服两个链接留在 `.dt-page-meta` |
| `SocietyNpcView` | `usePageTitle(() => t.npc.titles[npc])`（P2b 改成“NPC 名 · 功能”）；删“返回协会”和 `h5` |
| `SocietyOilView`、`SocietyStarView` | `usePageTitle(() => 带等级的标题)`；删 `h5` |
| `TownView` | 删 `h5`；论坛链接留在 `.dt-page-meta` |
| `WeatherView` | `usePageTitle(() => 天气名)`；删 `h5`（天气图标不要了，顶栏只有文字） |
| `wiki/WikiApiView`、`WikiGuideView`、`WikiHomeView` | 删 `h5` 和返回 |
| `wiki/WikiCookbookView`、`WikiFoodView`、`WikiGoodsView`、`WikiStreetView` | `usePageTitle(() => 名字)`；名字后的 `.dt-tag` 移到下面第一行；删返回 |
| `wiki/WikiListView` | `usePageTitle(() => 类目名)`；“共 N 条”放 `.dt-page-meta`；删返回 |
| `FriendRestView` | 原来加粗的店名 `div` 删掉，`usePageTitle(() => 好友店名)` |
| `ShardSelectView` | 不在游戏内，`h6` 标题保留 |

`main.css`：

```css
/* 页面标题行右侧原来的东西（钱包、全部领取、链接）：标题已在顶栏，这里单独一行靠右（界面改版 P2a） */
.dt-page-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0 0 6px;
  font-size: 13px;
}
```

删掉 `.dt-page-title`、`.dt-page-title h5`、全局 `h5 { … }`（只给页面标题用，已无页面标题）、`.dt-back`、`.dt-back:hover`、`.dt-back::before`。

- [ ] **Step 1: 写测试**

`links.test.ts`：把“返回链接由样式在开头加‹”那条改成：

```ts
  it('页面里不再有自己的返回链接和标题行：返回和标题都在顶栏（界面改版 P2a）', () => {
    expect(css).not.toMatch(/\.dt-back\b/);
    const bad = GAME.filter((f) => /\bdt-back\b|<h5\b/.test(f.tpl)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
```

（`GAME` 已排除后台和菜园；登录、注册等不在游戏内的页面用的是 `h5.card-title`：把它们加进这条用例的排除名单 `['views/LoginView.vue', 'views/RegisterView.vue', 'views/ForgotPasswordView.vue', 'views/ResetPasswordView.vue', 'views/CreateRestaurantView.vue']`。）

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/styles/links.test.ts`
Expected: FAIL，列出上表的页面。

- [ ] **Step 3: 按表改页面**

逐个改。每改完几个页面跑一次这些页面的测试（`pnpm vitest run --project web apps/web/src/views/<名字>.test.ts`）；测试里断言 `h5`、`dt-back`、标题文字的，改成断言 `usePageTitleStore().title`（动态标题页）或删掉（静态标题由路由测试覆盖）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm vitest run --project web`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/views apps/web/src/components apps/web/src/styles
git commit -m "refactor(web): 页面去掉自己的标题行和返回链接，标题和返回都在顶栏（界面改版 P2a）"
```

---

### Task 6: 文案里写死的旧路径

**Files:**
- Modify: 四种语言 `guide.ts`（“兑换码在哪用”那条）、`market.ts`（新手提示那条）

- [ ] **Step 1: 写测试**（加到 `apps/web/src/i18n/zh-CN.test.ts` 末尾）

```ts
describe('文案里不再写“更多 → …”（界面改版 P2a：更多换成了小镇和“我”）', () => {
  it('五种语言都不出现旧路径', async () => {
    for (const l of ['zh-CN', 'en', 'fr', 'es'] as const) {
      const m = (await import(`./locales/${l}/index.ts`)).default;
      expect(JSON.stringify(m), l).not.toMatch(/更多 →|More →|Plus →|Más →/);
    }
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web apps/web/src/i18n/zh-CN.test.ts`
Expected: FAIL（zh-CN、en 有旧路径；fr、es 用的是各自的写法，按实际报错找）

- [ ] **Step 3: 改文案**

| 键 | zh-CN 新文案 |
|---|---|
| `guide` 里“兑换码在哪用” | `'“我 → 兑换码和邀请”, 或者邮箱页最上面的兑换框。'` |
| `market` 新手提示 | `'新来的？先去“我 → 帮助中心 → 游玩指引”看看, 还有新手兑换码哦。'` |

en：`'"Me → Codes and invites", or the redeem box at the top of the mail page.'`、`'New here? Check "Me → Help center → Guide" first. There\'s a starter code too.'`；fr、es 按各自 `nav.me` 的译名同样改写（法文冒号前的窄空格照规则写）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm -F @dt/web i18n:tw && pnpm vitest run --project web apps/web/src/i18n`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/i18n
git commit -m "fix(web): 文案里的“更多 → 其他”路径改成新的“我”和帮助中心（界面改版 P2a）"
```

---

### Task 7: 规范文档和更新记录

**Files:**
- Modify: `docs/design/视觉规范.md`（新 §10 导航：顶栏、返回、底部导航、导航行、地方卡片、`.dt-page-meta`；§3 页面标题一行改成“顶栏 17px”；§9 删 `.dt-back`）
- Modify: `docs/design/文字链接-2026-10-07.md`（开头加一段：P2a 起页面里不再有返回链接，`.dt-back` 已删；整行去别处的用 `NavRow`）
- Modify: `apps/web/src/data/changelog.ts`、四种语言 `site.ts`；生成繁中

- [ ] **Step 1: 更新记录**

`changelog.ts` 最前面加 `{ id: 'shell1011', date: '<合并当天的日期>' }`（按实际日期，保证从新到旧）。

| 语言 | 文案 |
|---|---|
| zh-CN | `'底部导航的“更多”换成“小镇”, 各个地方按买卖、玩乐、公共分组; 右上角头像进“我”: 餐厅信息、装扮、厨具、仓库、兑换码、设置和帮助中心都在里面; 每页的标题移到顶栏, 返回键回到上一级'` |
| en | `'"More" in the bottom bar is now "Town", with places grouped into Trade, Play and Public. Tap your avatar at the top right for "Me": restaurant info, look, cookware, storage, codes, settings and the help center. Page titles moved to the top bar, and the back button goes up one level'` |
| fr | `'« Plus » devient « Ville », avec les lieux classés en Commerce, Loisirs et Public. Touchez votre avatar en haut à droite pour « Moi »__N__: infos, tenue, ustensiles, entrepôt, codes, réglages et centre d'aide. Les titres sont dans la barre du haut et le bouton retour remonte d'un niveau'`（`«`、`»` 内侧和冒号前都是 ` `，用脚本写） |
| es | `'«Más» ahora es «Pueblo», con los lugares agrupados en Comercio, Ocio y Público. Toca tu avatar arriba a la derecha para «Yo»: info, aspecto, utensilios, almacén, códigos, ajustes y centro de ayuda. Los títulos están en la barra superior y el botón atrás sube un nivel'` |

- [ ] **Step 2: 跑测试**

Run: `pnpm -F @dt/web i18n:tw && pnpm vitest run --project web apps/web/src/data apps/web/src/i18n`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add docs/design/视觉规范.md docs/design/文字链接-2026-10-07.md apps/web/src/data/changelog.ts apps/web/src/i18n/locales
git commit -m "docs: 视觉规范加导航一节；feat: 外壳改版的更新记录（界面改版 P2a）"
```

---

### Task 8: 全量检查、截图对比、开 PR

- [ ] **Step 1: 全量检查**

```bash
pnpm lint
pnpm format:check
pnpm typecheck; echo "typecheck exit $?"
pnpm vitest run --project web --project shared --project config
```

再在只含已提交文件的干净副本里重跑一遍（`git worktree add --detach ../dt-ci HEAD` → `pnpm install --frozen-lockfile --prefer-offline` → config build → typecheck → 测试 → `pnpm -F @dt/web build`），防止 P1 那种“本地有、仓库没有”的文件。

- [ ] **Step 2: 截图对比**

沿用 P1 的方式（两个 vite：分支 5174、main 副本 5175，共用开发 API，登录态用 `delicious-town/apps/web/shots/ui563.json`）：
- 页面：首页、食谱、橱柜、菜场、好友、小镇、我、帮助中心、交易所、酒吧、神殿、协会、某个 NPC、论坛、资料库首页。
- 简中 390px 浅色、深色；法文和英文 360px 浅色（在账号页切语言，截完切回简中）。
- 每页记录：横向溢出（必须 0）、首屏行数（列表行、紧凑行、待办行、表格行、导航行、地方卡片），改后不能少于改前（去掉标题行后应该多出一行左右）。
- 顶栏长标题（法文“Infos du restaurant”、帖子标题）一行截断。
- 截图和表格放 `docs/design/改版-P2a/README.md`。

- [ ] **Step 3: 修截图发现的问题，提交截图，合入最新 main，推送开 PR**

PR 标题：`feat: 界面改版 P2a 外壳——顶栏标题和返回、底部导航“小镇”、我、帮助中心`。正文写做了什么、没做什么（P2b 的内容）、截图链接、测试结果；结尾带 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

## 执行后的整体审查

全部任务完成后派一个新的审查员看整个分支（同 P1），Review Focus 用上面五条。终审修掉的问题每条先写会失败的测试；没修的小问题记 `docs/backlog.md`。
