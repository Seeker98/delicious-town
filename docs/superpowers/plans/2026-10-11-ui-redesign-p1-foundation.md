# 界面改版 P1 地基 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全站换上紫水晶配色和深色模式，Bootstrap 的变量和组件长相全部由我们的令牌接管，并搭好 SVG 图形的基础设施和第一批图形；页面布局不动（布局在 P2 以后）。

**Architecture:** 样式拆成三层：`tokens.css`（颜色、字体、间距、圆角、阴影、动效令牌，浅色和深色两套）、`base.css`（把 Bootstrap 的变量和组件样式接到令牌上）、`main.css`（`dt-*` 组件和页面样式，只读令牌，不写裸色值）。深色模式靠 `<html data-theme data-bs-theme>`，页面渲染前由 `index.html` 里的内联脚本写好，运行时由 `utils/theme.ts` 管理。图形是 `src/art/` 下的单个 SVG 文件，脚本拼成两张雪碧图，组件 `DtArt` 用 `<use>` 引用。

**Tech Stack:** Vue 3.5、Vite 7、Bootstrap 5.3.8（只用 CSS）、Vitest + jsdom、Playwright（截图）。

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md`（第 2 节、第 3 节，第 6.1 节的 P1 行，第 8 节）

## Global Constraints

- 所有 `dt` 前缀（CSS 类、CSS 变量、本地存储键、cookie、包名）保持不变，不改名。
- 菜园的文件（`YardView.vue`、`components/yard/*`）一个都不改。
- 组件里不写 `<style>`、不写带颜色的 `style="..."`；样式写在 `apps/web/src/styles/` 下。
- `main.css`、`base.css` 里不出现裸色值（`#xxx`、`rgb(数字…)`），颜色只读令牌；裸色值只能出现在 `tokens.css`。
- 所有写字的颜色在浅色、深色两套里对比度都 ≥ 4.5。
- 界面动效 ≤ 300ms，只动 `transform` 和 `opacity`；`prefers-reduced-motion: reduce` 时不做位移和缩放；悬停效果只写在 `@media (hover: hover) and (pointer: fine)` 里。
- 简中玩家文案用半角括号（外侧两边空格、挨中文标点不加）、“: ”“, ”；法文窄空格写 `\u202f` 转义（用 `.cjs` 占位脚本写，Write/Edit 会解码转义）；繁中最后跑 `pnpm -F @dt/web i18n:tw`，不格式化繁中文件。
- 每个玩家看得到的 PR 加一条五种语言的更新记录（`apps/web/src/data/changelog.ts` + 各语言 `site.ts`）。
- 不提交 `问题记录.md`、`apps/web/e2e/_*.cjs`、`apps/web/shots/`、`.superpowers/`；只 `git add` 明确路径。
- 推送前跑：`pnpm lint`、`pnpm format:check`、`pnpm -F @dt/web typecheck; echo $?`（看退出码）、`pnpm vitest run --project web --project shared --project config`。

## Review Focus

1. 本地存储读不到或值是乱的（隐私模式抛异常、手改成 `"blue"`）：按“跟随系统”处理，页面照常打开，不报错。——测试在 Task 2（`theme.test.ts` 的“读设置”用例和内联脚本用例）。
2. 深色模式下模板里写死的 Bootstrap 浅色类（`bg-light`、`bg-white`、`text-dark`、`btn-light`、`text-bg-light`、`badge bg-warning text-dark`）：仍然是深底浅字、读得清。——测试在 Task 3（`base.test.ts` 的“写死的浅色类”用例）。
3. 选了“跟随系统”时系统切换深浅色：页面立刻跟着变；选了浅色或深色时系统切换不影响。——测试在 Task 2（`installThemeWatcher` 用例）。
4. 英法西长文案在按钮里折成两行：按钮是圆角矩形，不变成大椭圆、不撑出屏幕。——测试在 Task 4（按钮圆角是固定 16px，不是 999px）。
5. 深色模式下的禁用按钮、未读数圆点（`badge rounded-pill bg-danger`）：文字仍可读。——测试在 Task 1（禁用色对比度）和 Task 3（实心圆点字色用 `--dt-on-danger`）。

---

## File Structure

| 文件 | 职责 |
|---|---|
| Create `apps/web/src/styles/tokens.css` | 所有令牌：不随模式变的（字体、间距、圆角、动效、紫水晶色阶）、浅色一套、深色一套 |
| Create `apps/web/src/styles/base.css` | Bootstrap 变量映射、Bootstrap 组件和工具类的重新定义、全局字体和焦点框 |
| Modify `apps/web/src/styles/main.css` | 删掉顶部的旧令牌和 Bootstrap 覆盖（搬到前两个文件），其余 `dt-*` 样式的裸色值换成令牌 |
| Create `apps/web/src/styles/cssSource.ts` | 测试用：按加载顺序读出三份 CSS |
| Rewrite `apps/web/src/styles/theme.test.ts` | 两套令牌齐全、对比度 |
| Create `apps/web/src/styles/base.test.ts` | Bootstrap 接管、写死的浅色类、按钮形状 |
| Modify `apps/web/src/styles/mainCss.test.ts`、`links.test.ts` | 读三份 CSS；去掉旧色值断言；加“无裸色值” |
| Create `apps/web/src/utils/theme.ts` + `theme.test.ts` | 读写主题设置、应用到 `<html>`、跟随系统 |
| Modify `apps/web/index.html` | 渲染前的内联主题脚本、`theme-color` |
| Create `apps/web/src/components/ThemeSelect.vue` + test | 外观三选一 |
| Modify `apps/web/src/views/AccountView.vue` + test | 加“外观”一行 |
| Modify `apps/web/src/main.ts` | 引入新样式、启动主题监听 |
| Modify `apps/web/src/utils/tabsScroll.ts` + test | 标签页选中下划线的位置（滑动动画） |
| Modify `apps/web/src/i18n/locales/{zh-CN,en,fr,es}/common.ts`、`site.ts`；生成 zh-TW | 外观文案、更新记录 |
| Modify `apps/web/src/data/changelog.ts` | 更新记录 |
| Create `apps/web/scripts/gen-art.mjs` | 拼雪碧图、生成名字表 |
| Create `apps/web/src/art/ui/*.svg`、`apps/web/src/art/content/*.svg` | 第一批图形 |
| Create `apps/web/src/art/generated/{ui.svg,content.svg,names.ts}` | 生成物（提交） |
| Create `apps/web/src/art/art.test.ts` | 图形规则、名字唯一、体积上限 |
| Create `apps/web/src/components/DtArt.vue` + test | 引用图形 |
| Create `apps/web/src/views/dev/ArtGalleryView.vue` | 开发用图库 |
| Modify `apps/web/src/router.ts` + `router.test.ts` | `/dev/art`（只在开发环境） |
| Modify `apps/web/package.json` | `art` 脚本 |
| Rewrite `docs/design/视觉规范.md` | 新版视觉规范 |
| Create `docs/design/改版-P1/` | 改前改后截图和说明 |

---

### Task 1: 令牌层和色彩测试

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/cssSource.ts`
- Rewrite: `apps/web/src/styles/theme.test.ts`
- Modify: `apps/web/src/main.ts:1-3`

**Interfaces:**
- Produces: CSS 变量（下表的名字是后面所有任务的契约）
  - 模式无关：`--dt-font-sans`、`--dt-font-serif`、`--dt-space-1…6`、`--dt-radius-xs|sm|md|pill`、`--dt-ease-out`、`--dt-ease-drawer`、`--dt-dur-press|fast|base|panel`、`--dt-amethyst-50…900`
  - 每套模式都有：`--dt-bg`、`--dt-surface`、`--dt-surface-2`、`--dt-line`、`--dt-line-strong`、`--dt-text`、`--dt-muted`、`--dt-primary`、`--dt-primary-rgb`、`--dt-primary-hover`、`--dt-primary-ink`、`--dt-primary-ink-rgb`、`--dt-primary-ink-hover`、`--dt-primary-soft`、`--dt-on-primary`、`--dt-success`、`--dt-success-rgb`、`--dt-danger`、`--dt-danger-rgb`、`--dt-on-danger`、`--dt-warning`、`--dt-warning-rgb`、`--dt-disabled-bg`、`--dt-disabled-text`、`--dt-scrim`、`--dt-shadow-float`、`--dt-header-bg`、`--dt-soft-{primary,success,danger,warning,info,secondary}`、`--dt-ink-{同上}`、`--dt-fill-{同上}`、`color-scheme`
  - 兼容旧名：`--dt-primary-dark`（= `--dt-primary-hover`）、`--dt-success-soft`（= `--dt-soft-success`）、`--dt-danger-soft`、`--dt-warning-soft`
- Produces: `cssSource.ts` 导出 `readCss(name: 'tokens' | 'base' | 'main'): string` 和 `allCss(): string`（按 tokens → base → main 拼接）

- [ ] **Step 1: 写测试 `cssSource.ts` 和新的 `theme.test.ts`**

`apps/web/src/styles/cssSource.ts`：

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 样式测试读源文件用：三层按加载顺序（tokens → base → main） */
export type CssName = 'tokens' | 'base' | 'main';
export function readCss(name: CssName): string {
  return readFileSync(join(__dirname, `${name}.css`), 'utf8');
}
export function allCss(): string {
  return (['tokens', 'base', 'main'] as const).map(readCss).join('\n');
}
/** 去掉注释（注释里常写“#189”这类编号，不能当色值） */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
```

`apps/web/src/styles/theme.test.ts`（整份替换）：

```ts
import { describe, expect, it } from 'vitest';
import { readCss, stripComments } from './cssSource';

const tokens = stripComments(readCss('tokens'));

/** 取出某个选择器开头的块里的 --dt-* 定义 */
function block(selector: string): Map<string, string> {
  const at = tokens.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = tokens.slice(tokens.indexOf('{', at) + 1, tokens.indexOf('}', at));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--dt-[\w-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}
const LIGHT = block(":root,\n[data-theme='light']");
const DARK = block("[data-theme='dark']");

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
function hex(mode: Map<string, string>, name: string): string {
  const v = mode.get(name);
  if (!v || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`${name} 不是 6 位色值: ${v}`);
  return v;
}

/** [文字, 底色]：每套模式都要 ≥ 4.5（设计 §2.1） */
const PAIRS: [string, string][] = [
  ...['--dt-text', '--dt-muted', '--dt-primary-ink', '--dt-success', '--dt-danger', '--dt-warning'].flatMap(
    (fg) => ['--dt-bg', '--dt-surface', '--dt-surface-2'].map((bg) => [fg, bg] as [string, string]),
  ),
  ['--dt-on-primary', '--dt-primary'],
  ['--dt-on-primary', '--dt-primary-hover'],
  ['--dt-on-danger', '--dt-danger'],
  ['--dt-disabled-text', '--dt-disabled-bg'],
  ...['primary', 'success', 'danger', 'warning', 'info', 'secondary'].map(
    (t) => [`--dt-ink-${t}`, `--dt-soft-${t}`] as [string, string],
  ),
];

describe('令牌（界面改版 P1，设计 §2.1）', () => {
  it('浅色、深色两套定义同一组令牌', () => {
    expect([...DARK.keys()].sort()).toEqual([...LIGHT.keys()].sort());
  });

  it.each([
    ['浅色', LIGHT],
    ['深色', DARK],
  ] as const)('%s：所有写字的颜色对比度 ≥ 4.5', (_, mode) => {
    for (const [fg, bg] of PAIRS) {
      expect(contrast(hex(mode, fg), hex(mode, bg)), `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('主色是紫水晶色，不再是橙色', () => {
    expect(LIGHT.get('--dt-primary')).toBe('#7442B8');
    expect(DARK.get('--dt-primary')).toBe('#B48BEA');
    expect(tokens).not.toMatch(/#d9480f|#c2410c/i);
  });

  it('rgb 三元组和对应的色值一致', () => {
    for (const mode of [LIGHT, DARK]) {
      for (const n of ['primary', 'primary-ink', 'success', 'danger', 'warning']) {
        const h = hex(mode, `--dt-${n}`);
        const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
        expect(mode.get(`--dt-${n}-rgb`), n).toBe(rgb);
      }
    }
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/styles/theme.test.ts`
Expected: FAIL（`ENOENT … tokens.css`）

- [ ] **Step 3: 写 `tokens.css`**

```css
/*
 * 令牌（界面改版设计 §2）：颜色只在这里写色值，其他样式只读变量。
 * 第一块不随深浅色变；第二块浅色（没有 data-theme 时也是浅色）；第三块深色。
 * 子元素上写 data-theme 也生效（开发用图库并排预览两种模式）。
 */
:root {
  --dt-font-sans:
    system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  --dt-font-serif: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', STSong, SimSun, serif;
  --dt-space-1: 4px;
  --dt-space-2: 8px;
  --dt-space-3: 12px;
  --dt-space-4: 16px;
  --dt-space-5: 20px;
  --dt-space-6: 24px;
  --dt-radius-xs: 4px;
  --dt-radius-sm: 10px;
  --dt-radius-md: 14px;
  /* 按钮、胶囊：一行时是胶囊，英法西长文案折成两行时是圆角矩形（不用 999px，会变大椭圆） */
  --dt-radius-pill: 16px;
  --dt-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --dt-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --dt-dur-press: 120ms;
  --dt-dur-fast: 150ms;
  --dt-dur-base: 200ms;
  --dt-dur-panel: 280ms;
  --dt-amethyst-50: #f7f2fd;
  --dt-amethyst-100: #eee4fb;
  --dt-amethyst-200: #dcc8f6;
  --dt-amethyst-300: #c3a3ee;
  --dt-amethyst-400: #a57be2;
  --dt-amethyst-500: #8b5cd0;
  --dt-amethyst-600: #7442b8;
  --dt-amethyst-700: #5f3499;
  --dt-amethyst-800: #4a2878;
  --dt-amethyst-900: #2e1a4a;
}
:root,
[data-theme='light'] {
  color-scheme: light;
  --dt-bg: #F4F1F8;
  --dt-surface: #FFFFFF;
  --dt-surface-2: #FAF8FC;
  --dt-line: #E8E2F0;
  --dt-line-strong: #D6CDE2;
  --dt-text: #221A2E;
  --dt-muted: #6E6680;
  --dt-primary: #7442B8;
  --dt-primary-rgb: 116, 66, 184;
  --dt-primary-hover: #643A9F;
  --dt-primary-ink: #6B3BAE;
  --dt-primary-ink-rgb: 107, 59, 174;
  --dt-primary-ink-hover: #5F3499;
  --dt-primary-soft: #EEE4FB;
  --dt-on-primary: #FFFFFF;
  --dt-success: #2F7A3A;
  --dt-success-rgb: 47, 122, 58;
  --dt-danger: #B42D2D;
  --dt-danger-rgb: 180, 45, 45;
  --dt-on-danger: #FFFFFF;
  --dt-warning: #8A5A00;
  --dt-warning-rgb: 138, 90, 0;
  --dt-disabled-bg: #E8E2F0;
  --dt-disabled-text: #5E5670;
  --dt-scrim: rgba(23, 19, 29, 0.4);
  --dt-shadow-float: 0 6px 20px rgba(46, 26, 74, 0.14), 0 1px 4px rgba(46, 26, 74, 0.08);
  --dt-header-bg: #FFFFFF;
  --dt-soft-primary: #EEE4FB;
  --dt-ink-primary: #5F3499;
  --dt-fill-primary: #A57BE2;
  --dt-soft-success: #E6F4E8;
  --dt-ink-success: #2F7A3A;
  --dt-fill-success: #7CC488;
  --dt-soft-danger: #FBEAEA;
  --dt-ink-danger: #B42D2D;
  --dt-fill-danger: #E88A8A;
  --dt-soft-warning: #FBF0D6;
  --dt-ink-warning: #8A5A00;
  --dt-fill-warning: #F0BE5A;
  --dt-soft-info: #EFEBF5;
  --dt-ink-info: #4E4660;
  --dt-fill-info: #B7AEC6;
  --dt-soft-secondary: #EEECF1;
  --dt-ink-secondary: #5A5466;
  --dt-fill-secondary: #BDB7C6;
  --dt-primary-dark: var(--dt-primary-hover);
  --dt-success-soft: var(--dt-soft-success);
  --dt-danger-soft: var(--dt-soft-danger);
  --dt-warning-soft: var(--dt-soft-warning);
}
[data-theme='dark'] {
  color-scheme: dark;
  --dt-bg: #17131D;
  --dt-surface: #211B2A;
  --dt-surface-2: #2A2335;
  --dt-line: #342C40;
  --dt-line-strong: #463C55;
  --dt-text: #EFEAF6;
  --dt-muted: #A99FBA;
  --dt-primary: #B48BEA;
  --dt-primary-rgb: 180, 139, 234;
  --dt-primary-hover: #C3A0F2;
  --dt-primary-ink: #C3A0F2;
  --dt-primary-ink-rgb: 195, 160, 242;
  --dt-primary-ink-hover: #D2B4F5;
  --dt-primary-soft: #382A50;
  --dt-on-primary: #1D1430;
  --dt-success: #7FCF8A;
  --dt-success-rgb: 127, 207, 138;
  --dt-danger: #F29191;
  --dt-danger-rgb: 242, 145, 145;
  --dt-on-danger: #1D1430;
  --dt-warning: #F0C060;
  --dt-warning-rgb: 240, 192, 96;
  --dt-disabled-bg: #342C40;
  --dt-disabled-text: #A99FBA;
  --dt-scrim: rgba(0, 0, 0, 0.55);
  --dt-shadow-float: 0 6px 20px rgba(0, 0, 0, 0.45);
  --dt-header-bg: #211B2A;
  --dt-soft-primary: #382A50;
  --dt-ink-primary: #D2B4F5;
  --dt-fill-primary: #9B6BE0;
  --dt-soft-success: #1F3324;
  --dt-ink-success: #7FCF8A;
  --dt-fill-success: #4E9A5A;
  --dt-soft-danger: #3A2024;
  --dt-ink-danger: #F29191;
  --dt-fill-danger: #C25A5A;
  --dt-soft-warning: #3A2E14;
  --dt-ink-warning: #F0C060;
  --dt-fill-warning: #B8862A;
  --dt-soft-info: #2C2638;
  --dt-ink-info: #CFC6DD;
  --dt-fill-info: #6F6585;
  --dt-soft-secondary: #2A2731;
  --dt-ink-secondary: #C4BFCC;
  --dt-fill-secondary: #6B6575;
  --dt-primary-dark: var(--dt-primary-hover);
  --dt-success-soft: var(--dt-soft-success);
  --dt-danger-soft: var(--dt-soft-danger);
  --dt-warning-soft: var(--dt-soft-warning);
}
```

注意：prettier 会把色值转成小写，测试里的 `toBe('#7442B8')` 要和格式化后的写法一致——格式化后把测试里的期望值也改成小写（`'#7442b8'`、`'#b48bea'`），`hex()` 的正则已经大小写都认。

在 `main.ts` 第 3 行 `import './styles/icons.css';` 之后加 `import './styles/tokens.css';`（`base.css` 在 Task 3 加）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm -F @dt/web exec prettier --write src/styles/tokens.css && pnpm vitest run --project web src/styles/theme.test.ts`
Expected: PASS（4 个用例）。如果“rgb 三元组”失败，按报错改 `-rgb` 值。

- [ ] **Step 5: 从 `main.css` 删掉旧令牌**

删掉 `main.css` 第 1~50 行整个 `:root { … }`（旧橙色令牌、`--bs-*` 覆盖、HSL 色阶）。`--bs-*` 的映射在 Task 3 写进 `base.css`。此时页面会暂时缺 Bootstrap 映射，Task 3 补上；本任务不单独推送。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/styles/tokens.css apps/web/src/styles/cssSource.ts apps/web/src/styles/theme.test.ts apps/web/src/styles/main.css apps/web/src/main.ts
git commit -m "feat(web): 紫水晶令牌，浅色深色两套（界面改版 P1）"
```

---

### Task 2: 主题设置（读写、渲染前脚本、跟随系统、外观选项）

**Files:**
- Create: `apps/web/src/utils/theme.ts`
- Test: `apps/web/src/utils/theme.test.ts`
- Modify: `apps/web/index.html`
- Create: `apps/web/src/components/ThemeSelect.vue`
- Test: `apps/web/src/components/ThemeSelect.test.ts`
- Modify: `apps/web/src/views/AccountView.vue:90-92`、`apps/web/src/views/AccountView.test.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/i18n/locales/{zh-CN,en,fr,es}/common.ts`

**Interfaces:**
- Consumes: Task 1 的 `[data-theme='dark']` 令牌块
- Produces（`utils/theme.ts`）:
  - `export type ThemePref = 'system' | 'light' | 'dark'`
  - `export type ThemeMode = 'light' | 'dark'`
  - `export const THEME_KEY = 'dt_theme'`
  - `export const THEME_COLOR: Record<ThemeMode, string>`（`{ light: '#ffffff', dark: '#211b2a' }`）
  - `export function readThemePref(): ThemePref`
  - `export function systemDark(): boolean`
  - `export function resolveTheme(pref: ThemePref, sysDark: boolean): ThemeMode`
  - `export function applyTheme(mode: ThemeMode, doc?: Document): void`
  - `export function setThemePref(pref: ThemePref): void`
  - `export function installThemeWatcher(): () => void`
- Produces: i18n 键 `common.appearance`、`common.themeSystem`、`common.themeLight`、`common.themeDark`；组件 `ThemeSelect`（`data-testid="theme-select"`）

- [ ] **Step 1: 写 `theme.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  installThemeWatcher,
  readThemePref,
  resolveTheme,
  setThemePref,
  THEME_KEY,
} from './theme';

/** 假的系统深浅色：可以手动触发 change */
function fakeMatchMedia(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.add(f),
    removeEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.delete(f),
  };
  window.matchMedia = vi.fn().mockReturnValue(mq) as never;
  return {
    flip(v: boolean) {
      mq.matches = v;
      for (const f of listeners) f({ matches: v });
    },
    count: () => listeners.size,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-bs-theme');
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
});
afterEach(() => vi.restoreAllMocks());

describe('主题设置（界面改版 P1，设计 §2.2）', () => {
  it('读设置：没存过、存了乱值、本地存储抛异常，都按跟随系统', () => {
    expect(readThemePref()).toBe('system');
    localStorage.setItem(THEME_KEY, 'blue');
    expect(readThemePref()).toBe('system');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readThemePref()).toBe('dark');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readThemePref()).toBe('system');
  });

  it('跟随系统时看系统，选了浅色深色就按选的', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('应用：<html> 写 data-theme 和 data-bs-theme，地址栏颜色跟着变', () => {
    applyTheme('dark');
    const html = document.documentElement;
    expect(html.dataset.theme).toBe('dark');
    expect(html.getAttribute('data-bs-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#211b2a');
  });

  it('改设置：存下来并立刻生效；存不了也照样生效', () => {
    fakeMatchMedia(false);
    setThemePref('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    setThemePref('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('跟随系统时系统切换，页面跟着变；选了浅色时不跟', () => {
    const sys = fakeMatchMedia(false);
    const stop = installThemeWatcher();
    sys.flip(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePref('light');
    sys.flip(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
    expect(sys.count()).toBe(0);
  });

  it('index.html 的渲染前脚本：和 theme.ts 同样的规则，坏值和异常都不报错', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    const src = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(src).toBeTruthy();
    expect(src).toContain(THEME_KEY);
    const run = () => new Function(src!)();
    fakeMatchMedia(true);
    run();
    expect(document.documentElement.dataset.theme).toBe('dark');
    localStorage.setItem(THEME_KEY, 'light');
    run();
    expect(document.documentElement.dataset.theme).toBe('light');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(run).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/utils/theme.test.ts`
Expected: FAIL（`Cannot find module './theme'`）

- [ ] **Step 3: 写 `utils/theme.ts` 和 `index.html` 的脚本**

`apps/web/src/utils/theme.ts`：

```ts
/**
 * 深色模式（界面改版设计 §2.2）：跟随系统 / 浅色 / 深色，只存在本机。
 * 页面渲染前 index.html 的内联脚本已按同样规则写好 data-theme，这里负责运行中切换和跟随系统。
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';
export const THEME_KEY = 'dt_theme';
/** 地址栏颜色：和顶栏一致 */
export const THEME_COLOR: Record<ThemeMode, string> = { light: '#ffffff', dark: '#211b2a' };
const QUERY = '(prefers-color-scheme: dark)';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function resolveTheme(pref: ThemePref, sysDark: boolean): ThemeMode {
  return pref === 'system' ? (sysDark ? 'dark' : 'light') : pref;
}

export function applyTheme(mode: ThemeMode, doc: Document = document): void {
  const html = doc.documentElement;
  html.dataset.theme = mode;
  html.setAttribute('data-bs-theme', mode);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // 存不了（隐私模式）也照样切换，只是下次打开不记得
  }
  applyTheme(resolveTheme(pref, systemDark()));
}

/** 选了“跟随系统”时，系统切换深浅色立刻跟着变；返回取消监听的函数 */
export function installThemeWatcher(): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  const onChange = (e: { matches: boolean }) => {
    if (readThemePref() === 'system') applyTheme(e.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
```

`apps/web/index.html` 整份：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <title>美味小镇</title>
    <!-- 深色模式（界面改版 P1）：渲染前写好 data-theme，免得先白后黑闪一下；规则同 src/utils/theme.ts -->
    <script>
      (function () {
        var pref = 'system';
        try {
          var v = localStorage.getItem('dt_theme');
          if (v === 'light' || v === 'dark') pref = v;
        } catch (e) {}
        var dark =
          pref === 'dark' ||
          (pref === 'system' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        var mode = dark ? 'dark' : 'light';
        var html = document.documentElement;
        html.setAttribute('data-theme', mode);
        html.setAttribute('data-bs-theme', mode);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#211b2a' : '#ffffff');
      })();
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm vitest run --project web src/utils/theme.test.ts src/styles/mainCss.test.ts`
Expected: PASS（`mainCss.test` 里“index.html 不禁止缩放”那条仍过）

- [ ] **Step 5: 写外观文案和 `ThemeSelect` 的测试**

四种语言的 `common.ts` 在 `language` 那一行后面加（键名一致；繁中在 Task 9 统一生成）：

| 键 | zh-CN | en | fr | es |
|---|---|---|---|---|
| `appearance` | `'外观'` | `'Appearance'` | `'Apparence'` | `'Apariencia'` |
| `themeSystem` | `'跟随系统'` | `'Match system'` | `'Comme le système'` | `'Según el sistema'` |
| `themeLight` | `'浅色'` | `'Light'` | `'Clair'` | `'Claro'` |
| `themeDark` | `'深色'` | `'Dark'` | `'Sombre'` | `'Oscuro'` |

`apps/web/src/components/ThemeSelect.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeSelect from './ThemeSelect.vue';
import { THEME_KEY } from '../utils/theme';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as never;
});

describe('ThemeSelect（外观三选一）', () => {
  it('默认选中跟随系统，三个选项', () => {
    const w = mount(ThemeSelect);
    const sel = w.get('[data-testid="theme-select"]').element as HTMLSelectElement;
    expect(sel.value).toBe('system');
    expect([...sel.options].map((o) => o.value)).toEqual(['system', 'light', 'dark']);
    expect([...sel.options].map((o) => o.text)).toEqual(['跟随系统', '浅色', '深色']);
  });

  it('选深色：存下来、页面立刻变深', async () => {
    const w = mount(ThemeSelect);
    await w.get('[data-testid="theme-select"]').setValue('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
```

- [ ] **Step 6: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/components/ThemeSelect.test.ts`
Expected: FAIL（找不到 `ThemeSelect.vue`）

- [ ] **Step 7: 写 `ThemeSelect.vue`，接进账号页和 `main.ts`**

`apps/web/src/components/ThemeSelect.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useT } from '../composables/useT';
import { readThemePref, setThemePref, type ThemePref } from '../utils/theme';

/** 外观：跟随系统 / 浅色 / 深色（界面改版 P1）；只存在本机，改了立刻生效 */
const t = useT();
const pref = ref<ThemePref>(readThemePref());
function pick(e: Event) {
  pref.value = (e.target as HTMLSelectElement).value as ThemePref;
  setThemePref(pref.value);
}
</script>

<template>
  <select
    class="form-select form-select-sm w-auto"
    :value="pref"
    :aria-label="t.common.appearance"
    data-testid="theme-select"
    @change="pick"
  >
    <option value="system">{{ t.common.themeSystem }}</option>
    <option value="light">{{ t.common.themeLight }}</option>
    <option value="dark">{{ t.common.themeDark }}</option>
  </select>
</template>
```

`AccountView.vue`：在 `<dd data-testid="acc-lang"><LangSelect /></dd>` 后面加

```vue
      <dt>{{ t.common.appearance }}</dt>
      <dd data-testid="acc-theme"><ThemeSelect /></dd>
```

并在 `<script setup>` 顶部加 `import ThemeSelect from '../components/ThemeSelect.vue';`。

`AccountView.test.ts`：在已有的“账号信息”用例里（找 `acc-lang` 的断言）加一行 `expect(w.find('[data-testid="acc-theme"] [data-testid="theme-select"]').exists()).toBe(true);`。

`main.ts`：顶部加 `import { applyTheme, installThemeWatcher, readThemePref, resolveTheme, systemDark } from './utils/theme';`，在 `const pinia = createPinia();` 之前加：

```ts
// 深色模式（界面改版 P1）：index.html 已在渲染前写好；这里再应用一次（脚本被拦时兜底）并跟随系统切换
applyTheme(resolveTheme(readThemePref(), systemDark()));
installThemeWatcher();
```

- [ ] **Step 8: 跑测试，确认通过**

Run: `pnpm vitest run --project web src/components/ThemeSelect.test.ts src/views/AccountView.test.ts src/i18n`
Expected: PASS。`src/i18n` 里的“各语言键一致”会因为 zh-TW 还没生成而失败——先跑 `pnpm -F @dt/web i18n:tw` 再跑一次，应全部通过。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/utils/theme.ts apps/web/src/utils/theme.test.ts apps/web/index.html apps/web/src/components/ThemeSelect.vue apps/web/src/components/ThemeSelect.test.ts apps/web/src/views/AccountView.vue apps/web/src/views/AccountView.test.ts apps/web/src/main.ts apps/web/src/i18n/locales
git commit -m "feat(web): 深色模式设置：跟随系统、浅色、深色，渲染前就定好不闪（界面改版 P1）"
```

---

### Task 3: Bootstrap 接管（变量、写死的浅色类、语义色）

**Files:**
- Create: `apps/web/src/styles/base.css`
- Test: `apps/web/src/styles/base.test.ts`
- Modify: `apps/web/src/main.ts`（引入 `base.css`）
- Modify: `apps/web/src/styles/main.css`（删掉搬走的 Bootstrap 覆盖）

**Interfaces:**
- Consumes: Task 1 的令牌
- Produces: `base.css`；`main.ts` 的样式顺序为 `bootstrap.min.css → icons.css → tokens.css → base.css → main.css`

- [ ] **Step 1: 写 `base.test.ts`（本任务的部分）**

```ts
import { describe, expect, it } from 'vitest';
import { readCss, stripComments } from './cssSource';

const base = stripComments(readCss('base'));
const rule = (sel: string) => {
  const at = base.indexOf(`${sel} {`);
  if (at < 0) throw new Error(`no rule ${sel}`);
  return base.slice(at, base.indexOf('}', at));
};

describe('Bootstrap 接管（界面改版 P1，设计 §2.8）', () => {
  it('Bootstrap 的全局变量都读我们的令牌；子元素写 data-theme 时也重新解析', () => {
    const r = rule(':root,\n[data-theme]');
    for (const [bs, dt] of [
      ['--bs-body-bg', '--dt-surface'],
      ['--bs-body-color', '--dt-text'],
      ['--bs-secondary-color', '--dt-muted'],
      ['--bs-border-color', '--dt-line'],
      ['--bs-primary-rgb', '--dt-primary-rgb'],
      ['--bs-success-rgb', '--dt-success-rgb'],
      ['--bs-danger-rgb', '--dt-danger-rgb'],
      ['--bs-warning-rgb', '--dt-warning-rgb'],
      ['--bs-link-color', '--dt-primary-ink'],
      ['--bs-body-font-family', '--dt-font-sans'],
    ])
      expect(r, bs).toMatch(new RegExp(`${bs}:\\s*var\\(${dt}\\)`));
  });

  it('模板里写死的浅色类在深色模式下也是深底浅字', () => {
    expect(rule('.bg-white')).toMatch(/background-color:\s*var\(--dt-surface\)\s*!important/);
    expect(rule('.bg-light')).toMatch(/background-color:\s*var\(--dt-surface-2\)\s*!important/);
    expect(rule('.text-dark')).toMatch(/color:\s*var\(--dt-text\)\s*!important/);
    expect(rule('.text-muted')).toMatch(/color:\s*var\(--dt-muted\)\s*!important/);
    expect(rule('.text-bg-light')).toMatch(/var\(--dt-soft-secondary\)/);
    expect(rule('.btn-light')).toMatch(/--bs-btn-bg:\s*var\(--dt-surface-2\)/);
  });

  it('未读数圆点（实心）上的字用对应的“上面的字”颜色，深色下不发虚', () => {
    expect(rule('.badge.rounded-pill.bg-danger')).toMatch(/color:\s*var\(--dt-on-danger\)/);
    expect(rule('.badge.rounded-pill.bg-primary')).toMatch(/color:\s*var\(--dt-on-primary\)/);
  });

  it('徽章：浅底深字，六种语气都有', () => {
    for (const t of ['primary', 'success', 'danger', 'warning', 'info', 'secondary'])
      expect(rule(`.badge.text-bg-${t},\n.badge:not(.rounded-pill).bg-${t}`), t).toMatch(
        new RegExp(`background-color:\\s*var\\(--dt-soft-${t}\\)\\s*!important;[^}]*color:\\s*var\\(--dt-ink-${t}\\)`),
      );
  });

  it('提示块：不用青色，info 也是紫水晶浅底', () => {
    expect(rule('.alert-info')).toMatch(/--bs-alert-bg:\s*var\(--dt-soft-primary\)/);
    expect(base).not.toMatch(/#0dcaf0|#cff4fc/i);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/styles/base.test.ts`
Expected: FAIL（`ENOENT … base.css`）

- [ ] **Step 3: 写 `base.css` 的变量和工具类部分**

```css
/*
 * Bootstrap 接管（界面改版设计 §2.8）：Bootstrap 只提供排版和工具类，长相全部读我们的令牌。
 * 选择器带 [data-theme]：子元素切换模式时这些映射也跟着重新解析（变量引用在声明处就算好，不随继承更新）。
 */
:root,
[data-theme] {
  --bs-font-sans-serif: var(--dt-font-sans);
  --bs-body-font-family: var(--dt-font-sans);
  --bs-body-bg: var(--dt-surface);
  --bs-body-color: var(--dt-text);
  --bs-emphasis-color: var(--dt-text);
  --bs-heading-color: var(--dt-text);
  --bs-secondary-color: var(--dt-muted);
  --bs-secondary-bg: var(--dt-surface-2);
  --bs-tertiary-color: var(--dt-muted);
  --bs-tertiary-bg: var(--dt-surface-2);
  --bs-border-color: var(--dt-line);
  --bs-border-color-translucent: var(--dt-line);
  --bs-primary: var(--dt-primary);
  --bs-primary-rgb: var(--dt-primary-rgb);
  --bs-success: var(--dt-success);
  --bs-success-rgb: var(--dt-success-rgb);
  --bs-danger: var(--dt-danger);
  --bs-danger-rgb: var(--dt-danger-rgb);
  --bs-warning: var(--dt-warning);
  --bs-warning-rgb: var(--dt-warning-rgb);
  --bs-primary-bg-subtle: var(--dt-soft-primary);
  --bs-success-bg-subtle: var(--dt-soft-success);
  --bs-danger-bg-subtle: var(--dt-soft-danger);
  --bs-warning-bg-subtle: var(--dt-soft-warning);
  --bs-primary-border-subtle: var(--dt-line-strong);
  --bs-success-border-subtle: var(--dt-fill-success);
  --bs-danger-border-subtle: var(--dt-fill-danger);
  --bs-warning-border-subtle: var(--dt-fill-warning);
  --bs-link-color: var(--dt-primary-ink);
  --bs-link-color-rgb: var(--dt-primary-ink-rgb);
  --bs-link-hover-color: var(--dt-primary-ink-hover);
  --bs-link-hover-color-rgb: var(--dt-primary-ink-rgb);
  --bs-focus-ring-color: rgba(var(--dt-primary-rgb), 0.35);
}
body {
  font-family: var(--dt-font-sans);
  /* 数字等宽：数量、价格、排行上下对齐（设计 §2.3） */
  font-variant-numeric: tabular-nums;
}
/* 模板里写死的浅色类：深色模式下 Bootstrap 不会自动换，这里接到令牌上（Review Focus 2） */
.bg-white {
  background-color: var(--dt-surface) !important;
}
.bg-light {
  background-color: var(--dt-surface-2) !important;
}
.text-dark {
  color: var(--dt-text) !important;
}
.text-muted {
  color: var(--dt-muted) !important;
}
.text-bg-light {
  color: var(--dt-ink-secondary) !important;
  background-color: var(--dt-soft-secondary) !important;
}
/* 强调色文字和链接、按钮同一种紫（问题记录 575 的规则沿用） */
.text-primary {
  color: rgba(var(--dt-primary-ink-rgb), var(--bs-text-opacity, 1)) !important;
}
/* 徽章：浅底深字（问题记录 216 的规则沿用）；未读数圆点（rounded-pill）保持实心 */
.badge {
  --bs-badge-font-weight: 500;
  --bs-badge-border-radius: var(--dt-radius-xs);
}
.badge.text-bg-primary,
.badge:not(.rounded-pill).bg-primary {
  background-color: var(--dt-soft-primary) !important;
  color: var(--dt-ink-primary) !important;
}
.badge.text-bg-success,
.badge:not(.rounded-pill).bg-success {
  background-color: var(--dt-soft-success) !important;
  color: var(--dt-ink-success) !important;
}
.badge.text-bg-danger,
.badge:not(.rounded-pill).bg-danger {
  background-color: var(--dt-soft-danger) !important;
  color: var(--dt-ink-danger) !important;
}
.badge.text-bg-warning,
.badge:not(.rounded-pill).bg-warning {
  background-color: var(--dt-soft-warning) !important;
  color: var(--dt-ink-warning) !important;
}
.badge.text-bg-info,
.badge:not(.rounded-pill).bg-info {
  background-color: var(--dt-soft-info) !important;
  color: var(--dt-ink-info) !important;
}
.badge.text-bg-secondary,
.badge:not(.rounded-pill).bg-secondary {
  background-color: var(--dt-soft-secondary) !important;
  color: var(--dt-ink-secondary) !important;
}
.badge.rounded-pill {
  border-radius: 999px;
}
.badge.rounded-pill.bg-danger {
  color: var(--dt-on-danger);
}
.badge.rounded-pill.bg-primary {
  color: var(--dt-on-primary);
}
/* 提示块：浅底深字、无边框；info 不用青色（设计 §2.1） */
.alert {
  --bs-alert-border-radius: var(--dt-radius-sm);
  --bs-alert-padding-x: 12px;
  --bs-alert-padding-y: 6px;
  --bs-alert-border-color: transparent;
}
.alert-danger {
  --bs-alert-bg: var(--dt-soft-danger);
  --bs-alert-color: var(--dt-ink-danger);
  --bs-alert-link-color: var(--dt-ink-danger);
}
.alert-warning {
  --bs-alert-bg: var(--dt-soft-warning);
  --bs-alert-color: var(--dt-ink-warning);
  --bs-alert-link-color: var(--dt-ink-warning);
}
.alert-success {
  --bs-alert-bg: var(--dt-soft-success);
  --bs-alert-color: var(--dt-ink-success);
  --bs-alert-link-color: var(--dt-ink-success);
}
.alert-info {
  --bs-alert-bg: var(--dt-soft-primary);
  --bs-alert-color: var(--dt-ink-primary);
  --bs-alert-link-color: var(--dt-ink-primary);
}
.alert-secondary {
  --bs-alert-bg: var(--dt-soft-secondary);
  --bs-alert-color: var(--dt-ink-secondary);
  --bs-alert-link-color: var(--dt-ink-secondary);
}
/* 进度条：轨道浅紫、填充中等亮度（问题记录 212 的规则沿用） */
.progress {
  --bs-progress-bg: var(--dt-primary-soft);
  --bs-progress-border-radius: 999px;
  --bs-progress-bar-bg: var(--dt-primary);
}
.progress-bar.bg-primary {
  background-color: var(--dt-fill-primary) !important;
}
.progress-bar.bg-success {
  background-color: var(--dt-fill-success) !important;
}
.progress-bar.bg-danger {
  background-color: var(--dt-fill-danger) !important;
}
.progress-bar.bg-warning {
  background-color: var(--dt-fill-warning) !important;
}
.progress-bar.bg-info {
  background-color: var(--dt-fill-info) !important;
}
.progress-bar.bg-secondary {
  background-color: var(--dt-fill-secondary) !important;
}
/* 表格：细线、表头小号次要色 */
.table {
  --bs-table-bg: transparent;
  --bs-table-color: var(--dt-text);
  --bs-table-border-color: var(--dt-line);
  --bs-table-striped-bg: var(--dt-surface-2);
  --bs-table-hover-bg: var(--dt-surface-2);
  --bs-table-active-bg: var(--dt-primary-soft);
}
.table > thead th {
  color: var(--dt-muted);
  font-weight: 500;
  font-size: 12px;
}
.table-success {
  --bs-table-bg: var(--dt-soft-success);
  --bs-table-color: var(--dt-ink-success);
}
.table-danger {
  --bs-table-bg: var(--dt-soft-danger);
  --bs-table-color: var(--dt-ink-danger);
}
/* 卡片、列表组、弹窗 */
.card {
  --bs-card-bg: var(--dt-surface);
  --bs-card-border-color: var(--dt-line);
  --bs-card-border-radius: var(--dt-radius-md);
}
.list-group {
  --bs-list-group-bg: var(--dt-surface);
  --bs-list-group-color: var(--dt-text);
  --bs-list-group-border-color: var(--dt-line);
  --bs-list-group-action-hover-bg: var(--dt-surface-2);
  --bs-list-group-action-color: var(--dt-text);
}
.modal {
  --bs-modal-bg: var(--dt-surface);
  --bs-modal-border-color: var(--dt-line);
  --bs-modal-border-radius: var(--dt-radius-md);
  --bs-modal-box-shadow: var(--dt-shadow-float);
}
.modal-backdrop {
  --bs-backdrop-bg: var(--dt-scrim);
  --bs-backdrop-opacity: 1;
}
```

`main.ts` 在 `import './styles/tokens.css';` 后面加 `import './styles/base.css';`。

从 `main.css` 删掉已经搬进 `base.css` 的规则：`.text-primary`、全部 `.badge…` 规则、全部 `.progress-bar.bg-…` 规则（原文件第 1163~1212 行一带）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm -F @dt/web exec prettier --write src/styles/base.css && pnpm vitest run --project web src/styles/base.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/styles/base.css apps/web/src/styles/base.test.ts apps/web/src/styles/main.css apps/web/src/main.ts
git commit -m "feat(web): Bootstrap 变量和浅色类全部接到令牌上，深色模式下也读得清（界面改版 P1）"
```

---

### Task 4: 控件重新定义（按钮、输入、勾选、标签页、胶囊、焦点、动效）

**Files:**
- Modify: `apps/web/src/styles/base.css`（追加）
- Modify: `apps/web/src/styles/main.css`（删掉旧的按钮、标签页、胶囊、勾选、动效规则）
- Modify: `apps/web/src/utils/tabsScroll.ts`、`apps/web/src/utils/tabsScroll.test.ts`
- Test: `apps/web/src/styles/base.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 令牌（含 `--dt-radius-pill: 16px`、动效令牌）
- Produces: `tabsScroll.ts` 新增 `export function placeIndicator(c: HTMLElement): void`，在标签栏上写 `--dt-tab-x`（px）、`--dt-tab-w`（无单位数字，像素宽）并在首次定位后加 `.dt-tabs-ready`

- [ ] **Step 1: 追加测试**

在 `base.test.ts` 末尾追加：

```ts
describe('控件（界面改版 P1，设计 §2.6、§2.7）', () => {
  it('按钮：圆角固定 16px（长文案折两行时不变大椭圆）；禁用灰底深灰字、不叠透明度', () => {
    const btn = rule('.btn');
    expect(btn).toMatch(/--bs-btn-border-radius:\s*var\(--dt-radius-pill\)/);
    expect(btn).toMatch(/--bs-btn-disabled-opacity:\s*1/);
    expect(rule('.btn-primary')).toMatch(/--bs-btn-disabled-bg:\s*var\(--dt-disabled-bg\)/);
    expect(rule('.btn-primary')).toMatch(/--bs-btn-disabled-color:\s*var\(--dt-disabled-text\)/);
    expect(rule('.btn-primary')).toMatch(/--bs-btn-color:\s*var\(--dt-on-primary\)/);
  });

  it('次要按钮是浅紫底（btn-outline-primary），危险是红描边', () => {
    expect(rule('.btn-outline-primary')).toMatch(/--bs-btn-bg:\s*var\(--dt-primary-soft\)/);
    expect(rule('.btn-outline-primary')).toMatch(/--bs-btn-color:\s*var\(--dt-primary-ink\)/);
    expect(rule('.btn-outline-danger')).toMatch(/--bs-btn-color:\s*var\(--dt-danger\)/);
    expect(rule('.btn-outline-danger')).toMatch(/--bs-btn-bg:\s*transparent/);
  });

  it('筛选胶囊选中是深色实心，不用紫色（和“操作”分开）', () => {
    const on = rule('.dt-pills a.active:not(.btn),\n.dt-pills button.active:not(.btn)');
    expect(on).toMatch(/background:\s*var\(--dt-text\)/);
    expect(on).toMatch(/color:\s*var\(--dt-surface\)/);
  });

  it('标签页：下划线式，选中下划线只用 transform 移动', () => {
    const ind = rule('.nav-tabs::after');
    expect(ind).toMatch(/transform:\s*translateX\(var\(--dt-tab-x, 0px\)\) scaleX\(var\(--dt-tab-w, 0\)\)/);
    expect(base).toMatch(/\.nav-tabs\.dt-tabs-ready::after\s*\{[^}]*transition:\s*transform var\(--dt-dur-base\)/);
  });

  it('动效：按下缩到 97%，只在不要求减少动态时；悬停只给鼠标', () => {
    const motion = base.slice(base.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion).toMatch(/:active[^{]*\{[^}]*transform:\s*scale\(0\.97\)/);
    expect(base).not.toMatch(/transition:\s*all/);
    expect(base).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/);
    expect(base).not.toMatch(/@media \(hover: hover\)\s*\{/);
  });

  it('键盘焦点：紫色外圈', () => {
    expect(base).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--dt-primary\)/);
  });
});
```

在 `apps/web/src/utils/tabsScroll.test.ts` 末尾追加：

```ts
describe('选中下划线（界面改版 P1）', () => {
  it('写出选中标签的位置和宽度，首次定位后才开动画', async () => {
    const { placeIndicator } = await import('./tabsScroll');
    document.body.innerHTML =
      '<ul class="nav nav-tabs"><li><a class="nav-link">A</a></li><li><a class="nav-link active">B</a></li></ul>';
    const c = document.querySelector<HTMLElement>('.nav-tabs')!;
    const a = c.querySelector<HTMLElement>('.nav-link.active')!;
    Object.defineProperty(a, 'offsetLeft', { value: 64 });
    Object.defineProperty(a, 'offsetWidth', { value: 48 });
    placeIndicator(c);
    expect(c.style.getPropertyValue('--dt-tab-x')).toBe('64px');
    expect(c.style.getPropertyValue('--dt-tab-w')).toBe('48');
    expect(c.classList.contains('dt-tabs-ready')).toBe(false);
    placeIndicator(c);
    expect(c.classList.contains('dt-tabs-ready')).toBe(true);
  });

  it('没有选中的标签：宽度 0', async () => {
    const { placeIndicator } = await import('./tabsScroll');
    document.body.innerHTML = '<ul class="nav nav-tabs"><li><a class="nav-link">A</a></li></ul>';
    const c = document.querySelector<HTMLElement>('.nav-tabs')!;
    placeIndicator(c);
    expect(c.style.getPropertyValue('--dt-tab-w')).toBe('0');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/styles/base.test.ts src/utils/tabsScroll.test.ts`
Expected: FAIL（找不到 `.btn {` 规则、`placeIndicator` 不存在）

- [ ] **Step 3: 在 `base.css` 末尾追加控件样式**

```css
/* ---------- 控件（设计 §2.6、§2.7） ---------- */
:focus-visible {
  outline: 2px solid var(--dt-primary);
  outline-offset: 2px;
}
/* 按钮四种：实心紫（主操作）、浅紫（次要，沿用 btn-outline-primary）、纯文字、红描边（危险） */
.btn {
  --bs-btn-border-radius: var(--dt-radius-pill);
  --bs-btn-font-weight: 500;
  --bs-btn-disabled-opacity: 1;
  --bs-btn-focus-box-shadow: 0 0 0 2px var(--dt-surface), 0 0 0 4px var(--dt-primary);
}
.btn-sm {
  --bs-btn-border-radius: var(--dt-radius-pill);
}
.btn-primary {
  --bs-btn-color: var(--dt-on-primary);
  --bs-btn-bg: var(--dt-primary);
  --bs-btn-border-color: var(--dt-primary);
  --bs-btn-hover-color: var(--dt-on-primary);
  --bs-btn-hover-bg: var(--dt-primary-hover);
  --bs-btn-hover-border-color: var(--dt-primary-hover);
  --bs-btn-active-color: var(--dt-on-primary);
  --bs-btn-active-bg: var(--dt-primary-hover);
  --bs-btn-active-border-color: var(--dt-primary-hover);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: var(--dt-disabled-bg);
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
.btn-outline-primary {
  --bs-btn-color: var(--dt-primary-ink);
  --bs-btn-bg: var(--dt-primary-soft);
  --bs-btn-border-color: var(--dt-primary-soft);
  --bs-btn-hover-color: var(--dt-primary-ink-hover);
  --bs-btn-hover-bg: var(--dt-primary-soft);
  --bs-btn-hover-border-color: var(--dt-line-strong);
  --bs-btn-active-color: var(--dt-primary-ink-hover);
  --bs-btn-active-bg: var(--dt-primary-soft);
  --bs-btn-active-border-color: var(--dt-line-strong);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: var(--dt-disabled-bg);
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
/* 中性按钮（切换区服、全部卸下等）：细边、正文色 */
.btn-outline-secondary,
.btn-outline-dark,
.btn-light {
  --bs-btn-color: var(--dt-text);
  --bs-btn-bg: var(--dt-surface-2);
  --bs-btn-border-color: var(--dt-line);
  --bs-btn-hover-color: var(--dt-text);
  --bs-btn-hover-bg: var(--dt-surface-2);
  --bs-btn-hover-border-color: var(--dt-line-strong);
  --bs-btn-active-color: var(--dt-text);
  --bs-btn-active-bg: var(--dt-line);
  --bs-btn-active-border-color: var(--dt-line-strong);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: var(--dt-disabled-bg);
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
.btn-link {
  --bs-btn-color: var(--dt-primary-ink);
  --bs-btn-hover-color: var(--dt-primary-ink-hover);
  --bs-btn-active-color: var(--dt-primary-ink-hover);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  text-decoration: none;
}
.btn-outline-danger {
  --bs-btn-color: var(--dt-danger);
  --bs-btn-bg: transparent;
  --bs-btn-border-color: var(--dt-danger);
  --bs-btn-hover-color: var(--dt-danger);
  --bs-btn-hover-bg: var(--dt-soft-danger);
  --bs-btn-hover-border-color: var(--dt-danger);
  --bs-btn-active-color: var(--dt-danger);
  --bs-btn-active-bg: var(--dt-soft-danger);
  --bs-btn-active-border-color: var(--dt-danger);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: transparent;
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
.btn-danger {
  --bs-btn-color: var(--dt-on-danger);
  --bs-btn-bg: var(--dt-danger);
  --bs-btn-border-color: var(--dt-danger);
  --bs-btn-hover-color: var(--dt-on-danger);
  --bs-btn-hover-bg: var(--dt-danger);
  --bs-btn-hover-border-color: var(--dt-danger);
  --bs-btn-active-color: var(--dt-on-danger);
  --bs-btn-active-bg: var(--dt-danger);
  --bs-btn-active-border-color: var(--dt-danger);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: var(--dt-disabled-bg);
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
/* 绿色、黄色按钮不在按钮四种里：按语义浅底（用的地方 P3~P8 逐个改掉） */
.btn-success,
.btn-outline-success {
  --bs-btn-color: var(--dt-ink-success);
  --bs-btn-bg: var(--dt-soft-success);
  --bs-btn-border-color: var(--dt-soft-success);
  --bs-btn-hover-color: var(--dt-ink-success);
  --bs-btn-hover-bg: var(--dt-soft-success);
  --bs-btn-hover-border-color: var(--dt-fill-success);
  --bs-btn-active-color: var(--dt-ink-success);
  --bs-btn-active-bg: var(--dt-soft-success);
  --bs-btn-active-border-color: var(--dt-fill-success);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: var(--dt-disabled-bg);
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
.btn-warning,
.btn-outline-warning {
  --bs-btn-color: var(--dt-ink-warning);
  --bs-btn-bg: var(--dt-soft-warning);
  --bs-btn-border-color: var(--dt-soft-warning);
  --bs-btn-hover-color: var(--dt-ink-warning);
  --bs-btn-hover-bg: var(--dt-soft-warning);
  --bs-btn-hover-border-color: var(--dt-fill-warning);
  --bs-btn-active-color: var(--dt-ink-warning);
  --bs-btn-active-bg: var(--dt-soft-warning);
  --bs-btn-active-border-color: var(--dt-fill-warning);
  --bs-btn-disabled-color: var(--dt-disabled-text);
  --bs-btn-disabled-bg: var(--dt-disabled-bg);
  --bs-btn-disabled-border-color: var(--dt-disabled-bg);
}
/* 输入框、下拉框 */
.form-control,
.form-select {
  color: var(--dt-text);
  background-color: var(--dt-surface-2);
  border-color: var(--dt-line);
  border-radius: var(--dt-radius-sm);
}
.form-control-sm,
.form-select-sm {
  border-radius: var(--dt-radius-sm);
}
.form-control::placeholder {
  color: var(--dt-muted);
}
.form-control:focus,
.form-select:focus {
  color: var(--dt-text);
  background-color: var(--dt-surface);
  border-color: var(--dt-primary);
  box-shadow: 0 0 0 3px rgba(var(--dt-primary-rgb), 0.2);
}
.form-control:disabled,
.form-select:disabled {
  color: var(--dt-disabled-text);
  background-color: var(--dt-disabled-bg);
}
/* 勾选框、开关 */
.form-check-input {
  background-color: var(--dt-surface-2);
  border-color: var(--dt-line-strong);
}
.form-check-input:checked {
  background-color: var(--dt-primary);
  border-color: var(--dt-primary);
}
.form-check-input:focus {
  border-color: var(--dt-primary);
  box-shadow: 0 0 0 3px rgba(var(--dt-primary-rgb), 0.2);
}
/* 一级标签页：下划线式；选中的下划线是标签栏的 ::after，位置由 utils/tabsScroll.ts 写进变量 */
.nav-tabs {
  --bs-nav-tabs-border-color: var(--dt-line);
  --bs-nav-tabs-link-active-bg: transparent;
  --bs-nav-tabs-link-active-color: var(--dt-text);
  --bs-nav-tabs-link-active-border-color: transparent;
  --bs-nav-tabs-link-hover-border-color: transparent;
  position: relative;
}
.nav-tabs .nav-link {
  border: 0;
  background: none;
  color: var(--dt-muted);
  font-weight: 500;
}
.nav-tabs .nav-link.active {
  color: var(--dt-text);
  font-weight: 600;
}
.nav-tabs::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 1px;
  height: 2px;
  border-radius: 2px;
  background: var(--dt-primary);
  transform-origin: left;
  transform: translateX(var(--dt-tab-x, 0px)) scaleX(var(--dt-tab-w, 0));
}
/* 筛选胶囊：选中深色实心（设计 §2.6），不用紫色 */
.dt-pills a:not(.btn),
.dt-pills button:not(.btn) {
  font-size: 13px;
  padding: 2px 10px;
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-pill);
  color: var(--dt-muted);
  background: transparent;
  text-decoration: none;
}
.dt-pills a.active:not(.btn),
.dt-pills button.active:not(.btn) {
  color: var(--dt-surface);
  background: var(--dt-text);
  border-color: var(--dt-text);
}
.dt-pills button:not(.btn):disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 动效（设计 §2.5）：只动 transform、颜色；系统要求减少动态时不缩放、下划线不滑 */
@media (prefers-reduced-motion: no-preference) {
  .btn,
  .dt-tap,
  .dt-pills a:not(.btn),
  .dt-pills button:not(.btn) {
    transition:
      transform var(--dt-dur-press) var(--dt-ease-out),
      background-color var(--dt-dur-fast) ease,
      color var(--dt-dur-fast) ease,
      border-color var(--dt-dur-fast) ease;
  }
  .btn:not(:disabled):active,
  .dt-tap:active,
  .dt-pills a:not(.btn):active,
  .dt-pills button:not(.btn):not(:disabled):active {
    transform: scale(0.97);
  }
  .nav-tabs.dt-tabs-ready::after {
    transition: transform var(--dt-dur-base) var(--dt-ease-out);
  }
}
@media (hover: hover) and (pointer: fine) {
  .dt-tap:hover {
    background: var(--dt-primary-soft);
  }
  .dt-pills a:not(.btn):not(.active):hover,
  .dt-pills button:not(.btn):not(.active):not(:disabled):hover {
    background: var(--dt-surface-2);
  }
  .nav-tabs .nav-link:not(.active):hover {
    color: var(--dt-text);
  }
}
```

从 `main.css` 删掉被取代的规则：`.btn-primary`、`.btn`、`.btn-danger`、`.btn-success`、`.btn-outline-primary`、`.btn-outline-danger`、`.nav-tabs .nav-link`（颜色那条，保留 `white-space: nowrap; margin-bottom: 0` 和窄屏内边距两条 `@media`——把 `white-space`、`margin-bottom` 合并进 `base.css` 的 `.nav-tabs .nav-link`）、`.nav-tabs .nav-link.active`、`.form-control:focus, .form-select:focus`、`.dt-pills a:not(.btn)…` 各条、整段 `@media (prefers-reduced-motion: no-preference)` 和 `@media (hover: hover)`、`.form-check-input:checked`、`.form-check-input:focus`、`.form-switch …:focus:not(:checked)`。`main.css` 里 `.nav-tabs { flex-wrap… }` 那条保留（横向滑动），但其中 `box-shadow: inset 0 -1px 0 var(--bs-nav-tabs-border-color, #dee2e6)` 的兜底色改成 `var(--dt-line)`。

- [ ] **Step 4: `tabsScroll.ts` 加 `placeIndicator` 并在 `sync` 里调用**

在 `markOverflow` 后面加：

```ts
/** 选中下划线（界面改版 P1）：写出选中标签相对标签栏的位置；第二次起才开过渡，免得首次从左边滑进来 */
export function placeIndicator(c: HTMLElement): void {
  const a = c.querySelector<HTMLElement>('.nav-link.active');
  c.style.setProperty('--dt-tab-x', `${a ? a.offsetLeft : 0}px`);
  c.style.setProperty('--dt-tab-w', `${a ? a.offsetWidth : 0}`);
  if (c.dataset.dtTabPlaced) c.classList.add('dt-tabs-ready');
  else c.dataset.dtTabPlaced = '1';
}
```

在 `sync` 的循环里，`markOverflow(c);` 前面加一行 `placeIndicator(c);`。

- [ ] **Step 5: 跑测试，确认通过**

Run: `pnpm -F @dt/web exec prettier --write src/styles/base.css src/styles/main.css && pnpm vitest run --project web src/styles src/utils/tabsScroll.test.ts`
Expected: `base.test`、`tabsScroll.test` PASS。`mainCss.test`、`links.test` 此时可能因为读的是 `main.css` 单个文件而失败——Task 5 修。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/styles/base.css apps/web/src/styles/base.test.ts apps/web/src/styles/main.css apps/web/src/utils/tabsScroll.ts apps/web/src/utils/tabsScroll.test.ts
git commit -m "feat(web): 按钮、输入框、标签页、胶囊、焦点框和按压动效换新（界面改版 P1）"
```

---

### Task 5: `main.css` 去掉裸色值，样式测试读三层

**Files:**
- Modify: `apps/web/src/styles/main.css`
- Modify: `apps/web/src/styles/mainCss.test.ts`、`apps/web/src/styles/links.test.ts`

**Interfaces:**
- Consumes: Task 1 的令牌、`cssSource.ts`
- Produces: `main.css` 只读令牌

- [ ] **Step 1: 改测试：读三层、加“无裸色值”**

`mainCss.test.ts`：
- 第 5 行改为 `import { allCss, readCss, stripComments } from './cssSource';` 和 `const css = allCss();`（删掉 `readFileSync(join(__dirname, 'main.css'))` 那行和不再需要的 import；`index.html` 那条仍用 `readFileSync`，保留它需要的 import）。
- “强调色文字……问题记录 575”用例里的期望改为 `'color: rgba(var(--dt-primary-ink-rgb), var(--bs-text-opacity, 1)) !important'`（不变），它现在在 `base.css` 里，`allCss()` 能找到。
- 末尾追加：

```ts
describe('颜色只读令牌（界面改版 P1）', () => {
  it('base.css、main.css 不写裸色值（色值只在 tokens.css）', () => {
    for (const name of ['base', 'main'] as const) {
      const src = stripComments(readCss(name)).replace(/url\("data:[^"]*"\)/g, '');
      expect(src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g) ?? [], name).toEqual([]);
    }
  });

  it('最小字号 11px（不再有 9px 的未读数）', () => {
    const sizes = [...stripComments(allCss()).matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });
});
```

`links.test.ts` 第 8 行改为 `const css = allCss();`，加 `import { allCss } from './cssSource';`，删掉不再用的 `readFileSync` 读 `main.css`（`readdirSync`、`readFileSync` 读 `.vue` 仍要用，保留）。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/styles`
Expected: FAIL，“不写裸色值”列出 `main.css` 里的 `#fff`、`#eee` 等。

- [ ] **Step 3: 按下表替换 `main.css` 的裸色值**

| 原值（行号是改动前的） | 用途 | 换成 |
|---|---|---|
| `#fff`（84 `.dt-app`、113 底栏、132 时钟卡片、238 更多面板、271、688 卡片、896、960、1006、1045） | 底色 | `var(--dt-surface)` |
| `#eee`（114）、`#e9ecef`（268、840）、`#dee2e6`（312）、`#f1e6da`（492、689、782） | 边线 | `var(--dt-line)` |
| `#f1f3f5`（171、216、276、297、1062） | 浅底 | `var(--dt-surface-2)` |
| `#e9ecef`（824 胶囊悬停，已在 Task 4 删掉） | — | — |
| `#666`（118）、`#495057`（210、434、725）、`#868e96`（287、298） | 次要字 | `var(--dt-muted)` |
| `#333`（133）、`#212529`（1094） | 正文 | `var(--dt-text)` |
| `#ebfbee`（290、359、584、1018） | 成功浅底 | `var(--dt-soft-success)` |
| `#b2f2bb`（291、1019） | 成功边 | `var(--dt-fill-success)` |
| `#2b8a3e`（360、576、585） | 成功字、边 | `var(--dt-success)` |
| `#fff5f5`（363、1029） | 危险浅底 | `var(--dt-soft-danger)` |
| `#c92a2a`（364、1031） | 危险字 | `var(--dt-danger)` |
| `#ffa8a8`（1030） | 危险边 | `var(--dt-fill-danger)` |
| `#e7f5ff`、`#1864ab`（593、594 `.dt-buy-tag`） | “收”标签 | `var(--dt-soft-primary)`、`var(--dt-ink-primary)` |
| `#fff4e6`（1074 靶 r5、1106 `.dt-item-me`） | 品牌浅底 | `var(--dt-primary-soft)` |
| `#ffe8cc`（1078 靶 r10） | 靶第二圈 | `color-mix(in srgb, var(--dt-primary) 30%, var(--dt-surface))` |
| `#ffc078`（1082 靶 r25） | 靶第三圈 | `color-mix(in srgb, var(--dt-primary) 60%, var(--dt-surface))` |
| `#ffc078`（1127 `.dt-exp-bar`） | 经验条 | `var(--dt-fill-primary)` |
| `rgba(0, 0, 0, 0.3)`（225 更多面板遮罩） | 遮罩 | `var(--dt-scrim)` |
| `#000`（757、758 `mask-image`） | 渐隐遮罩（不是颜色） | `black` |
| `rgba(var(--dt-primary-rgb), 0.5)`（446 标签焦点） | — | 删掉整条（Task 4 的全局 `:focus-visible` 取代；标签在滑动容器里，`base.css` 的 `.nav-tabs .nav-link:focus-visible` 写 `outline-offset: -2px` 画在里面，见下） |

另外：
- `.dt-mail-badge` 的 `font-size: 9px` → `11px`。
- `.dt-header`：`background: var(--dt-header-bg)`、加 `border-bottom: 1px solid var(--dt-line)`、`color: var(--dt-primary-ink)`。
- `.dt-bottom-nav a.router-link-exact-active`、`.dt-bottom-nav a.dt-more-on`、`.dt-more-link i`、`.dt-section` 的 `border-left`、`.dt-nim-candy`、`.dt-cup i`、`.dt-hiphop`、`.dt-deal-mine`、`.dt-guess-pick`：`var(--dt-primary)` 保持不变（已是令牌）。
- `.dt-card`：`border-radius: var(--dt-radius-md)`；`.dt-note`：`border-radius: var(--dt-radius-sm)`；`.dt-toast-pill` 加 `box-shadow: var(--dt-shadow-float)`。
- `.dt-link-btn:focus-visible`、`.dt-pills …:focus-visible` 各条删掉（全局 `:focus-visible` 取代）。

`base.css` 的 `.nav-tabs .nav-link` 后面补：

```css
/* 键盘焦点画在标签里面：画在外面会被横向滑动的容器裁掉（backlog #116 的规则沿用） */
.nav-tabs .nav-link:focus-visible {
  outline-offset: -2px;
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm -F @dt/web exec prettier --write src/styles && pnpm vitest run --project web src/styles`
Expected: PASS（`theme`、`base`、`mainCss`、`links` 全部）。“同一个类不在顶层定义两次”现在检查三层拼接——如果 `base.css` 和 `main.css` 有同名顶层选择器，把 `main.css` 里那条合并进 `base.css`。

- [ ] **Step 5: 跑整个网页测试**

Run: `pnpm vitest run --project web`
Expected: PASS。组件测试断言的是类名和文字，本批没改模板（除账号页），不应失败；如有失败，读报错，只修因样式文件拆分引起的（例如测试直接读 `main.css` 找某条规则——改为 `allCss()`）。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/styles
git commit -m "refactor(web): main.css 的颜色全部换成令牌，样式测试读三层（界面改版 P1）"
```

---

### Task 6: 图形基础设施（雪碧图脚本、`DtArt`、规则测试、图库页）

**Files:**
- Create: `apps/web/scripts/gen-art.mjs`
- Modify: `apps/web/package.json`（`"art": "node scripts/gen-art.mjs"`）
- Create: `apps/web/src/art/ui/nav-home.svg`、`apps/web/src/art/content/res-coin-silver.svg`（各一个，作为脚本的输入样例；其余在 Task 7）
- Create: `apps/web/src/art/generated/ui.svg`、`content.svg`、`names.ts`（脚本生成）
- Create: `apps/web/src/art/art.test.ts`
- Create: `apps/web/src/components/DtArt.vue`、`apps/web/src/components/DtArt.test.ts`
- Create: `apps/web/src/views/dev/ArtGalleryView.vue`
- Modify: `apps/web/src/router.ts`、`apps/web/src/router.test.ts`
- Modify: `apps/web/src/styles/main.css`（`.dt-art`、图库样式）

**Interfaces:**
- Produces（`art/generated/names.ts`，脚本生成）:
  - `export const UI_ART = ['nav-home', …] as const;`
  - `export const CONTENT_ART = ['res-coin-silver', …] as const;`
  - `export type UiArtName = (typeof UI_ART)[number];`
  - `export type ContentArtName = (typeof CONTENT_ART)[number];`
  - `export type ArtName = UiArtName | ContentArtName;`
- Produces（`DtArt.vue`）: props `{ name: ArtName; size?: number /* 默认 24 */; label?: string }`；渲染 `<svg class="dt-art dt-art-ui|dt-art-content" …><use href="雪碧图#name"/></svg>`；有 `label` 时 `role="img"` + `aria-label`，否则 `aria-hidden="true"`
- 画法契约：
  - 文件名就是名字：小写字母、数字、连字符；界面图标以 `nav-`、`place-`、`me-`、`fac-`、`slot-`、`sec-` 开头，内容图形以 `res-` 开头（食材 `food-`、道具 `goods-`、NPC `npc-` 在后面批次加）。
  - 根元素 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">`。
  - 界面图标（D 单色紫调）：只用 `currentColor`，不写色值；描边 `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`；填充 `fill="currentColor"` 且**不写** `fill-opacity`（由外层 CSS 的 `fill-opacity` 统一给浅色调，选中时加深）；不需要填充的路径写 `fill="none"`。
  - 内容图形（B 无描边扁平）：写固定色值；不写 `stroke` 色值以外的描边宽度外的东西；细节线用 `stroke="#2b1f3d" stroke-opacity="0.38"` 或 `stroke="#fff"`。
  - 都不能有 `<script`、`<style`、`href=`、`xlink:href`、`<image`、`<text`。

- [ ] **Step 1: 写两个样例图形**

`apps/web/src/art/ui/nav-home.svg`（餐厅，店面）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M9 20h30v20H9z" fill="currentColor"/><path d="M9 20h30v20H9zM20 40V29h8v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 20l4-10h26l4 10c0 3-2 5-4.5 5S32 23 32 20c0 3-2 5-4 5s-4-2-4-5c0 3-2 5-4 5s-4-2-4-5c0 3-2 5-4.5 5S7 23 7 20z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
```

`apps/web/src/art/content/res-coin-silver.svg`（银币）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="#D7DCE6"/><circle cx="24" cy="24" r="11.5" fill="#EEF1F6"/><path d="M24 17l1.8 5.2 5.2 1.8-5.2 1.8L24 31l-1.8-5.2L17 24l5.2-1.8z" fill="#B9C0CE"/></svg>
```

- [ ] **Step 2: 写 `art.test.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CONTENT_ART, UI_ART } from './generated/names';

const ROOT = __dirname;
const svgs = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((n) => n.endsWith('.svg'))
    .map((n) => ({ name: n.slice(0, -4), src: readFileSync(join(ROOT, dir, n), 'utf8') }));
const UI = svgs('ui');
const CONTENT = svgs('content');

describe('图形（界面改版 P1，设计 §3）', () => {
  it('名字规则、48×48、没有脚本和外链', () => {
    for (const { name, src } of [...UI, ...CONTENT]) {
      expect(name, name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(src, name).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48">/);
      expect(src, name).not.toMatch(/<script|<style|href=|<image|<text/i);
    }
  });

  it('界面图标只用 currentColor，不写色值、不写 fill-opacity（跟主题和深色自动变）', () => {
    for (const { name, src } of UI) {
      expect(name).toMatch(/^(nav|place|me|fac|slot|sec)-/);
      expect(src.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [], name).toEqual([]);
      expect(src, name).not.toMatch(/fill-opacity/);
    }
  });

  it('内容图形以分类前缀开头', () => {
    for (const { name } of CONTENT) expect(name).toMatch(/^(res|food|goods|npc|empty)-/);
  });

  it('生成的名字表和源文件一致（改了图形要跑 pnpm -F @dt/web art）', () => {
    expect([...UI_ART]).toEqual(UI.map((s) => s.name).sort());
    expect([...CONTENT_ART]).toEqual(CONTENT.map((s) => s.name).sort());
    const all = [...UI_ART, ...CONTENT_ART];
    expect(new Set(all).size).toBe(all.length);
  });

  it('体积上限：两张雪碧图压缩后合计 ≤ 25KB，加上头图 ≤ 120KB（设计 §3.5）', () => {
    const gz = (p: string) => gzipSync(readFileSync(p)).length;
    const sprites = gz(join(ROOT, 'generated/ui.svg')) + gz(join(ROOT, 'generated/content.svg'));
    expect(sprites).toBeLessThanOrEqual(25 * 1024);
    let scenes = 0;
    try {
      for (const n of readdirSync(join(ROOT, 'scene'))) scenes += gz(join(ROOT, 'scene', n));
    } catch {
      // 头图在 P3 以后才有
    }
    expect(sprites + scenes).toBeLessThanOrEqual(120 * 1024);
  });
});
```

- [ ] **Step 3: 跑测试，确认失败**

Run: `pnpm vitest run --project web src/art/art.test.ts`
Expected: FAIL（找不到 `./generated/names`）

- [ ] **Step 4: 写 `gen-art.mjs`，生成雪碧图**

```js
// 图形雪碧图（界面改版 P1，设计 §3.4）：src/art/{ui,content}/*.svg → src/art/generated/{ui,content}.svg + names.ts
// 用法：pnpm -F @dt/web art
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../src/art');
const OUT = join(ART, 'generated');
mkdirSync(OUT, { recursive: true });

function build(family) {
  const dir = join(ART, family);
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.svg'))
    .map((n) => n.slice(0, -4))
    .sort();
  const symbols = names.map((name) => {
    const src = readFileSync(join(dir, `${name}.svg`), 'utf8').trim();
    const m = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(src);
    if (!m) throw new Error(`${family}/${name}.svg: 不是单个 <svg> 根元素`);
    const viewBox = /viewBox="([^"]+)"/.exec(m[1])?.[1];
    if (viewBox !== '0 0 48 48') throw new Error(`${family}/${name}.svg: viewBox 必须是 0 0 48 48`);
    return `<symbol id="${name}" viewBox="${viewBox}">${m[2].trim()}</symbol>`;
  });
  writeFileSync(
    join(OUT, `${family}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`,
  );
  return names;
}

const ui = build('ui');
const content = build('content');
const list = (a) => a.map((n) => `  '${n}',`).join('\n');
writeFileSync(
  join(OUT, 'names.ts'),
  `// 由 pnpm -F @dt/web art 生成，不要手改\nexport const UI_ART = [\n${list(ui)}\n] as const;\nexport const CONTENT_ART = [\n${list(content)}\n] as const;\nexport type UiArtName = (typeof UI_ART)[number];\nexport type ContentArtName = (typeof CONTENT_ART)[number];\nexport type ArtName = UiArtName | ContentArtName;\n`,
);
console.log(`ui ${ui.length}, content ${content.length}`);
```

`package.json` 的 `scripts` 里加 `"art": "node scripts/gen-art.mjs",`。

Run: `pnpm -F @dt/web art`
Expected: 输出 `ui 1, content 1`，生成三个文件。

- [ ] **Step 5: 跑测试，确认通过**

Run: `pnpm vitest run --project web src/art/art.test.ts`
Expected: PASS

- [ ] **Step 6: 写 `DtArt` 的测试**

`apps/web/src/components/DtArt.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DtArt from './DtArt.vue';

describe('DtArt（界面改版 P1）', () => {
  it('界面图标引用 ui 雪碧图，默认 24px，装饰性的不让读屏读', () => {
    const w = mount(DtArt, { props: { name: 'nav-home' } });
    const svg = w.get('svg');
    expect(svg.classes()).toEqual(['dt-art', 'dt-art-ui']);
    expect(svg.attributes('width')).toBe('24');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(w.get('use').attributes('href')).toMatch(/ui\.svg#nav-home$/);
  });

  it('内容图形引用 content 雪碧图；有 label 时是一张有名字的图', () => {
    const w = mount(DtArt, { props: { name: 'res-coin-silver', size: 16, label: '银币' } });
    const svg = w.get('svg');
    expect(svg.classes()).toContain('dt-art-content');
    expect(svg.attributes('role')).toBe('img');
    expect(svg.attributes('aria-label')).toBe('银币');
    expect(svg.attributes('aria-hidden')).toBeUndefined();
    expect(w.get('use').attributes('href')).toMatch(/content\.svg#res-coin-silver$/);
  });
});
```

Run: `pnpm vitest run --project web src/components/DtArt.test.ts`
Expected: FAIL（找不到 `DtArt.vue`）

- [ ] **Step 7: 写 `DtArt.vue` 和样式**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import contentUrl from '../art/generated/content.svg?url';
import uiUrl from '../art/generated/ui.svg?url';
import { UI_ART, type ArtName } from '../art/generated/names';

/**
 * 图形（界面改版设计 §3.4）：界面图标是单色紫调（颜色跟文字色走、填充深浅由 CSS 的 fill-opacity 给），
 * 内容图形是固定色的扁平图。雪碧图第一次用到时下载，之后走缓存。
 */
const props = withDefaults(defineProps<{ name: ArtName; size?: number; label?: string }>(), { size: 24 });
const isUi = computed(() => (UI_ART as readonly string[]).includes(props.name));
const href = computed(() => `${isUi.value ? uiUrl : contentUrl}#${props.name}`);
</script>

<template>
  <svg
    :class="['dt-art', isUi ? 'dt-art-ui' : 'dt-art-content']"
    :width="size"
    :height="size"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <use :href="href" />
  </svg>
</template>
```

`main.css` 末尾追加：

```css
/* ---------- 图形（界面改版设计 §3） ---------- */
.dt-art {
  flex-shrink: 0;
  vertical-align: middle;
}
/* 界面图标：描边是文字色，填充是同色的浅调；选中时（父元素 .active / aria-current）加深 */
.dt-art-ui {
  color: var(--dt-primary-ink);
  fill-opacity: 0.18;
}
.active > .dt-art-ui,
[aria-current='page'] > .dt-art-ui {
  fill-opacity: 0.4;
}
```

Run: `pnpm vitest run --project web src/components/DtArt.test.ts`
Expected: PASS。如果 jsdom 下 `?url` 导入报错，在 `apps/web/src/env.d.ts` 确认有 `/// <reference types="vite/client" />`（提供 `*?url` 的类型），Vitest 走 Vite 管线会把 `?url` 解析成路径字符串。

- [ ] **Step 8: 图库页和路由**

`apps/web/src/views/dev/ArtGalleryView.vue`：

```vue
<script setup lang="ts">
import DtArt from '../../components/DtArt.vue';
import { CONTENT_ART, UI_ART } from '../../art/generated/names';

/** 开发用图库（界面改版设计 §3.5）：浅色、深色并排看所有图形；生产构建不包含这个页面 */
const MODES = ['light', 'dark'] as const;
</script>

<template>
  <div class="dt-gallery">
    <section v-for="m in MODES" :key="m" :data-theme="m" :data-bs-theme="m" class="dt-gallery-pane">
      <h6 class="dt-section">{{ m }} · ui {{ UI_ART.length }}</h6>
      <div class="dt-gallery-grid">
        <figure v-for="n in UI_ART" :key="n" class="dt-gallery-item">
          <DtArt :name="n" :size="32" />
          <span class="dt-gallery-active"><DtArt :name="n" :size="32" /></span>
          <figcaption>{{ n }}</figcaption>
        </figure>
      </div>
      <h6 class="dt-section">{{ m }} · content {{ CONTENT_ART.length }}</h6>
      <div class="dt-gallery-grid">
        <figure v-for="n in CONTENT_ART" :key="n" class="dt-gallery-item">
          <span class="dt-gallery-tile"><DtArt :name="n" :size="36" /></span>
          <figcaption>{{ n }}</figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>
```

`main.css` 追加（只给图库用）：

```css
.dt-gallery {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dt-gallery-pane {
  background: var(--dt-surface);
  color: var(--dt-text);
  padding: 8px;
  border-radius: var(--dt-radius-md);
}
.dt-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 6px;
}
.dt-gallery-item {
  margin: 0;
  text-align: center;
  font-size: 11px;
  color: var(--dt-muted);
  overflow-wrap: anywhere;
}
.dt-gallery-active > .dt-art-ui {
  fill-opacity: 0.4;
}
.dt-gallery-tile {
  display: inline-flex;
  padding: 6px;
  border-radius: var(--dt-radius-sm);
  background: var(--dt-surface-2);
}
```

`router.ts`：在 `{ path: '/:pathMatch(.*)*', redirect: '/' },` 之前加

```ts
  // 开发用图库（界面改版 P1）：只在开发环境注册，生产构建里连页面文件都不打包
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/art',
          name: 'dev-art',
          component: () => import('./views/dev/ArtGalleryView.vue'),
          meta: { public: true },
        } satisfies RouteRecordRaw,
      ]
    : []),
```

`router.test.ts` 末尾追加：

```ts
describe('开发用图库（界面改版 P1）', () => {
  it('测试环境（DEV）注册了 /dev/art，不用登录', () => {
    const r = routes.find((x) => x.path === '/dev/art');
    expect(r?.meta).toEqual({ public: true });
  });
});
```

- [ ] **Step 9: 跑测试和构建，确认生产构建不含图库**

Run: `pnpm vitest run --project web src/art src/components/DtArt.test.ts src/router.test.ts`
Expected: PASS

Run: `pnpm -F @dt/web build && grep -rl "dt-gallery" apps/web/dist/assets/*.js | wc -l`
Expected: 构建成功；输出 `0`（生产包里没有图库代码）。

- [ ] **Step 10: 提交**

```bash
git add apps/web/scripts/gen-art.mjs apps/web/package.json apps/web/src/art apps/web/src/components/DtArt.vue apps/web/src/components/DtArt.test.ts apps/web/src/views/dev/ArtGalleryView.vue apps/web/src/router.ts apps/web/src/router.test.ts apps/web/src/styles/main.css
git commit -m "feat(web): 图形雪碧图、DtArt 组件和开发用图库（界面改版 P1）"
```

---

### Task 7: 第一批图形（界面图标 + 资源）

**Files:**
- Create: `apps/web/src/art/ui/*.svg`（下表 49 个，含 Task 6 的 `nav-home`）
- Create: `apps/web/src/art/content/*.svg`（下表 12 个，含 Task 6 的 `res-coin-silver`）
- Regenerate: `apps/web/src/art/generated/*`

**Interfaces:**
- Consumes: Task 6 的画法契约、`gen-art.mjs`、`art.test.ts`
- Produces: 下表的图形名（P2 以后用 `DtArt` 引用这些名字）

这是绘制任务：每个图形按 Task 6 的画法契约手写 SVG。风格参考（用户 2026-10-10 选定的样张）：界面图标——2px 圆头描边 + 同色浅调填充，几何、圆润，主体占 48×48 中间约 36×36；内容图形——无描边平涂，2~4 个固定色，细节用半透明深线或白线。

界面图标（D 单色紫调）：

| 名字 | 画什么 | 名字 | 画什么 |
|---|---|---|---|
| `nav-home` | 带遮阳篷的店面（已有） | `nav-cookbooks` | 翻开的菜谱书 |
| `nav-cupboard` | 双开门橱柜 | `nav-market` | 菜篮子 |
| `nav-friends` | 两个人头像 | `nav-map` | 折叠地图 + 定位点 |
| `place-shop` | 带价签的店面 | `place-exchange` | 三根 K 线 |
| `place-bank` | 带柱子的银行 + 硬币 | `place-acquire` | 房子 + 钥匙 |
| `place-kuji` | 抽签筒 | `place-predict` | 水晶球 |
| `place-takeaway` | 外卖电动车 | `place-bar` | 带泡沫的啤酒杯 |
| `place-temple` | 三柱神殿 | `place-tower` | 顶着厨师帽的塔 |
| `place-yard` | 发芽的小苗 | `place-society` | 带小旗的会馆 |
| `place-plaza` | 喷泉 | `place-forum` | 两个对话气泡 |
| `place-activities` | 日历 + 星星 | `me-info` | 名片 |
| `me-look` | T 恤 | `me-equip` | 锅铲和刀交叉 |
| `me-store` | 纸箱 | `me-redeem` | 礼物盒 |
| `me-settings` | 齿轮 | `me-shard` | 两个相反的箭头 |
| `me-help` | 问号气泡 | `me-admin` | 盾牌 |
| `me-mail` | 信封 | `me-logout` | 门 + 向外箭头 |
| `fac-poster` | 宣传海报 | `fac-trophy` | 奖杯 |
| `fac-oilsaver` | 油壶 + 小叶子 | `fac-mousetrap` | 捕鼠夹 |
| `fac-roach` | 喷雾瓶 | `fac-plaque` | 挂着的牌匾 |
| `slot-spatula` | 锅铲 | `slot-knife` | 菜刀 |
| `slot-pot` | 炒锅 | `slot-bottle` | 调料瓶 |
| `slot-hat` | 厨师帽 | `sec-tasks` | 勾选清单 |
| `sec-news` | 报纸 | `sec-feed` | 带波纹的铃铛 |
| `sec-weather` | 太阳 + 云 | `sec-star` | 星星 |
| `sec-oil` | 油壶 | `sec-rank` | 领奖台 |
| `sec-bonus` | 向上的箭头 + 火花 | | |

资源（B 无描边扁平）：

| 名字 | 画什么 | 主色 |
|---|---|---|
| `res-coin-silver` | 银币（已有） | `#D7DCE6` / `#EEF1F6` |
| `res-coin-gold` | 金币 | `#F7C04A` / `#FBD77E` |
| `res-diamond` | 钻石 | `#8FD3F4` |
| `res-strength` | 闪电（体力） | `#FFD45C` |
| `res-oil` | 油滴 | `#F2A93B` |
| `res-exp` | 带星的徽章（经验） | `#A57BE2` |
| `res-prestige` | 月桂环（声望） | `#6CBF6A` |
| `res-voucher` | 神秘礼券（票券） | `#F4A7B9` |
| `res-medal` | 街道勋章（绶带奖牌） | `#F07B5A` / `#F7C04A` |
| `res-fragment` | 残卷碎片（撕开的纸） | `#FFF3DC` |
| `res-gem` | 宝石（六边形切面） | `#B794E6` |
| `res-ticket` | 入场券、抽赏券 | `#6AB0E6` |

- [ ] **Step 1: 画完界面图标，生成，跑规则测试**

Run: `pnpm -F @dt/web art && pnpm vitest run --project web src/art/art.test.ts`
Expected: 输出 `ui 49, content …`；PASS（名字前缀、无色值、无 fill-opacity）

- [ ] **Step 2: 画完资源图形，生成，跑规则测试**

Run: `pnpm -F @dt/web art && pnpm vitest run --project web src/art/art.test.ts`
Expected: 输出 `ui 49, content 12`；PASS（体积上限也过）

- [ ] **Step 3: 在图库里自查**

Run: 开发服务器在跑时打开 `http://localhost:5173/dev/art`（主目录的开发服占着 5173 时，在 worktree 里用 `pnpm -F @dt/web exec vite --port 5174` 起一个只有网页的服务，图库页不需要登录和接口）。
检查：浅色、深色两栏里每个图形都清楚；界面图标选中态（第二个）比普通态明显更实；内容图形在深色底块上不发虚；没有图形缺角或超出边框。有问题就改 SVG、重新生成。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/art
git commit -m "feat(web): 第一批图形：界面图标 49 个、资源 12 个（界面改版 P1）"
```

---

### Task 8: 改写视觉规范、更新记录、繁中

**Files:**
- Rewrite: `docs/design/视觉规范.md`
- Modify: `apps/web/src/data/changelog.ts`、`apps/web/src/i18n/locales/{zh-CN,en,fr,es}/site.ts`
- Regenerate: `apps/web/src/i18n/locales/zh-TW/*`

**Interfaces:**
- Consumes: 前面所有任务的令牌名、类名、组件名

- [ ] **Step 1: 改写 `docs/design/视觉规范.md`**

整份替换为新版，结构：

1. 开头三行：日期 2026-10-11；来源“界面改版设计（docs/superpowers/specs/2026-10-10-ui-redesign-design.md）P1”；实现位置“`apps/web/src/styles/` 三层：`tokens.css`（只有这里写色值）、`base.css`（Bootstrap 接管和控件）、`main.css`（`dt-*` 组件和页面）；组件里不写 `<style>` 和带颜色的 `style`”。
2. §1 颜色：照抄设计 §2.1 的令牌表，加一句“写样式只用用途令牌（`--dt-text`、`--dt-primary-ink`……），不直接用色阶”。
3. §2 深色模式：设计 §2.2 的四条 + “新写的样式在两种模式下都要截图看过”。
4. §3 字号和层级：设计 §2.3 的表；注明“P2 之前页面标题仍是页面里的 `h5` / `.dt-page-title`，18px”。
5. §4 间距、圆角、阴影：设计 §2.4。
6. §5 能点和不能点、按钮四种：设计 §2.6 的表 + 现有类名对应：主操作 `btn-primary`、次要 `btn-outline-primary`（现在是浅紫底）、中性 `btn-outline-secondary`、纯文字 `dt-link-btn` / `btn-link`、危险 `btn-outline-danger`；绿色黄色按钮不要再新用。
7. §6 控件：标签页（下划线式，`utils/tabsScroll.ts` 负责下划线位置）、胶囊（选中深色实心）、徽章、提示块（`alert-*` 已是浅底深字，info 是紫）、进度条。
8. §7 动效：设计 §2.5。
9. §8 图形：设计 §3.1、§3.4 的画法契约和 `DtArt` 用法、`pnpm -F @dt/web art`、图库 `/dev/art`。
10. §9 原视觉规范里仍然有效的条目原样保留：列表行 `.dt-item`、紧凑行 `.dt-feed`、卡片、名字截断、文字链接（`.dt-go`、`.dt-back`、`.dt-link-btn`）、空状态、响应式（720px、360px、`.dt-shrink`、超过四列转置、剩余时间写法、`plEn/plFr/plEs`、网格 4 列）。

- [ ] **Step 2: 更新记录**

`changelog.ts` 数组最前面加 `{ id: 'theme1011', date: '2026-10-11' },`。

各语言 `site.ts` 的 `changelog` 对象最前面加：

| 语言 | 文案 |
|---|---|
| zh-CN | `theme1011: '界面换成紫水晶配色, 按钮、输入框、标签页都换了新样子; 加了深色模式, 在“我的账号 → 外观”里选跟随系统、浅色或深色',` |
| en | `theme1011: 'New amethyst look: buttons, inputs and tabs are restyled. Dark mode is here: pick Match system, Light or Dark under My account → Appearance.',` |
| fr | `theme1011: 'Nouveau thème améthyste : boutons, champs et onglets redessinés. Le mode sombre arrive : choisissez Comme le système, Clair ou Sombre dans Mon compte → Apparence.',` |
| es | `theme1011: 'Nuevo tema amatista: botones, campos y pestañas renovados. Llega el modo oscuro: elige Según el sistema, Claro u Oscuro en Mi cuenta → Apariencia.',` |

法文冒号前是窄不换行空格：先把 fr 文案里的两处 `' :'` 写成占位 `__NNBSP__:`，再用一次性脚本替换成 `\u202f` 转义（Write/Edit 会解码转义，直接写会变成真字符）：

```bash
node -e "const f='apps/web/src/i18n/locales/fr/site.ts';const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('__NNBSP__',String.fromCharCode(92)+'u202f'))"
```

核对 `apps/web/src/i18n/locales/fr/site.ts` 里“Mon compte”一句的冒号前是 `\u202f` 六个字符；简中确认用的是“, ”“; ”“: ”（不是全角）。把“我的账号”和“外观”与 `account.ts` 的 `title`、`common.ts` 的 `appearance` 对一下，一致。

- [ ] **Step 3: 生成繁中，跑 i18n 和更新记录测试**

Run: `pnpm -F @dt/web i18n:tw && pnpm vitest run --project web src/i18n src/data/changelog.test.ts`
Expected: PASS（各语言键一致、标点规则、更新记录日期从新到旧）

- [ ] **Step 4: 提交**

```bash
git add docs/design/视觉规范.md apps/web/src/data/changelog.ts apps/web/src/i18n/locales
git commit -m "docs: 新版视觉规范；feat: 紫水晶配色和深色模式的更新记录（界面改版 P1）"
```

---

### Task 9: 全量检查、截图对比、开 PR

**Files:**
- Create: `docs/design/改版-P1/README.md` 和截图（jpg）
- 临时（不提交）：`apps/web/e2e/_p1shots.cjs`

- [ ] **Step 1: 全量检查**

Run（在 worktree 根目录）:

```bash
pnpm lint
pnpm format:check
pnpm -F @dt/web typecheck; echo "web typecheck exit $?"
pnpm vitest run --project web --project shared --project config
```

Expected: lint、格式无报错；typecheck 退出码 0；测试全部通过。`format:check` 报繁中文件时不要格式化它们，重新跑 `pnpm -F @dt/web i18n:tw`。本批没改服务端和配置，服务端测试不跑（需要的话 `pnpm infra:test && pnpm --filter @dt/server test`）。

- [ ] **Step 2: 截图对比（改前用 main，改后用本分支）**

写临时脚本 `apps/web/e2e/_p1shots.cjs`（不提交）：用 Playwright 打开以下页面，每页截首屏（不是整页），宽度 390 和 360、浅色和深色（通过 `localStorage.setItem('dt_theme', 'dark')` 后刷新）、语言 zh-CN 和 fr：首页、食谱、橱柜、交易所（现货、期货）、酒吧、神殿、账号、资料库首页、`/dev/art`。登录用开发库里现有的 e2e 测试号（不要新建账号；`apps/web/e2e/` 里已有的辅助函数怎么登录就怎么登录）。
改前截图：在主目录之外，用 `git worktree add ../dt-ui-before origin/main` 起一份 main，端口 5175 只起网页（接口走同一个开发 API），跑同一个脚本；截完 `git worktree remove ../dt-ui-before`。
检查（逐张看）：
- 没有横向滚动条（脚本里断言 `document.documentElement.scrollWidth <= innerWidth`）。
- 深色下没有白底块、看不清的字、发白的输入框和下拉框。
- 按钮、标签页、胶囊、徽章、提示块都是新样子，看不出 Bootstrap 默认的蓝色或灰色。
- 首屏内容和改前一样多（P1 不动布局，行数应该相同）。
把两组截图压成 jpg（质量 70）放进 `docs/design/改版-P1/`，`README.md` 写一张表：页面 | 宽度 | 模式 | 改前 | 改后 | 首屏行数改前 / 改后 | 问题。

- [ ] **Step 3: 修截图里发现的问题**

每个问题：先确认是不是令牌或 `base.css` 漏了映射（优先在那里修，一处修全站）；只有页面特有的才改 `main.css` 里的对应 `dt-*` 规则。修完重跑 Step 1 和相应截图。

- [ ] **Step 4: 提交截图，合入最新 main，推送开 PR**

```bash
git add docs/design/改版-P1
git commit -m "docs: 界面改版 P1 改前改后截图"
git fetch origin && git merge origin/main
pnpm vitest run --project web
git push -u origin feat/ui-redesign
```

PR 标题：`feat: 界面改版 P1 地基——紫水晶配色、深色模式、Bootstrap 接管、图形基础设施`。正文：做了什么（按任务列）、没做什么（布局、导航、页面结构在 P2 以后）、截图对比的链接（`docs/design/改版-P1/README.md`）、测试结果；结尾带 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
用 `"C:\Program Files\GitHub CLI\gh.exe" pr create` 开 PR。开好后用 ccd_pr 工具绑定 PR、看 CI。
