import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import zhCN from '../i18n/locales/zh-CN';

/** 文字链接统一（问题记录 451，规范见 docs/design/文字链接-2026-10-07.md） */
const SRC = join(__dirname, '..');
const css = readFileSync(join(__dirname, 'main.css'), 'utf8');
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return vueFiles(p);
    return n.endsWith('.vue') ? [p] : [];
  });
}
const rel = (p: string) => relative(SRC, p).replaceAll('\\', '/');
/** 游戏页面：不含管理后台和菜园（菜园不考虑） */
const GAME = vueFiles(SRC)
  .map((p) => ({
    path: rel(p),
    tpl: readFileSync(p, 'utf8').split('<template>').slice(1).join('<template>'),
  }))
  .filter((f) => !f.path.includes('admin/') && !/yard/i.test(f.path));
/** 整块可点、text-reset 的按钮（公告、顶栏、顶栏时间、邮件标题）不是文字链接 */
const BLOCK_BTN_LINK = new Set([
  'components/AnnounceBanner.vue',
  'components/AppHeader.vue',
  'components/HeaderClock.vue',
  'views/MailView.vue',
]);

describe('文字链接统一（问题记录 451）', () => {
  it('全站链接不带下划线；返回链接由样式在开头加“‹”（读屏不读）', () => {
    expect(css).toMatch(/(^|\n)a\s*\{[^}]*text-decoration:\s*none/);
    expect(css).toMatch(/\.dt-back::before\s*\{[^}]*content:\s*'‹\\a0'\s*\/\s*''/);
  });

  it('没加类的链接（句子、列表里的名字）鼠标移上去或键盘选中时显示下划线：不只靠颜色区分（用户 2026-10-07 定）', () => {
    expect(css).toMatch(
      /a:not\(\[class\]\):hover,\s*a:not\(\[class\]\):focus-visible\s*\{[^}]*text-decoration:\s*underline/,
    );
  });

  it('本页操作用 .dt-link-btn，不再用带下划线、带内边距的 btn-link', () => {
    const bad = GAME.filter((f) => !BLOCK_BTN_LINK.has(f.path) && /\bbtn-link\b/.test(f.tpl)).map(
      (f) => f.path,
    );
    expect(bad).toEqual([]);
  });

  it('本页操作用按钮，不用 <a href="#">', () => {
    // 标签页、胶囊（带 active / nav-link）和底栏的“更多”是导航，不算
    const bad = GAME.flatMap((f) =>
      [...f.tpl.matchAll(/href="#"/g)]
        .map((m) => f.tpl.slice(f.tpl.lastIndexOf('<a', m.index), m.index! + 200))
        .filter((w) => !/nav-link|active|tab-more/.test(w))
        .map(() => f.path),
    );
    expect(bad).toEqual([]);
  });

  it('只加了 small 的链接（返回、入口）都归到 .dt-go 或 .dt-back；模板里不自己写“‹”', () => {
    const bad = GAME.flatMap((f) =>
      [...f.tpl.matchAll(/<RouterLink\b[^>]*\bclass="([^"]*)"/g)]
        .map((m) => m[1]!.split(/\s+/).filter((x) => x && x !== 'd-block' && !/^[mp][setbxy]?-\d$/.test(x)))
        // 只剩 small（外边距、d-block 不算）的就是文字入口或返回；底栏、整行等别的类不管
        .filter((toks) => toks.length === 1 && toks[0] === 'small')
        .map(() => f.path),
    );
    expect(bad).toEqual([]);
    expect(GAME.filter((f) => /‹/.test(f.tpl)).map((f) => f.path)).toEqual([]);
  });

  it('没加样式的入口、返回链接也归到 .dt-go / .dt-back（登录注册、选区服、账号、天气、食谱、游玩指引）', () => {
    const want: Array<[string, string]> = [
      ['views/AccountView.vue', 'to="/invite"'],
      ['views/CookbooksView.vue', 'to="/society/move"'],
      ['views/ForgotPasswordView.vue', 'to="/login"'],
      ['views/LoginView.vue', 'to="/register"'],
      ['views/LoginView.vue', 'to="/forgot-password"'],
      ['views/LoginView.vue', 'to="/wiki"'],
      ['views/RegisterView.vue', 'to="/login"'],
      ['views/ResetPasswordView.vue', 'to="/login"'],
      ['views/VerifyEmailView.vue', 'to="/shards"'],
      ['views/ShardSelectView.vue', 'to="/account"'],
      ['views/ShardSelectView.vue', 'to="/guide"'],
      ['views/WeatherView.vue', 'to="/town?tab=town"'],
      ['views/GuideView.vue', 'to="/wiki"'],
    ];
    const bad = want.filter(([path, to]) => {
      const tpl = GAME.find((f) => f.path === path)!.tpl;
      const at = tpl.indexOf(`<RouterLink ${to}`);
      return at < 0 || !/\bdt-(go|back)\b/.test(tpl.slice(at, tpl.indexOf('>', at)));
    });
    expect(bad).toEqual([]);
  });

  it('两列信息表（.dt-kv）右列里的入口和按钮可以换行：英、法、西文的长句不撑出手机屏幕（审查）', () => {
    const tpl = GAME.find((f) => f.path === 'views/AccountView.vue')!.tpl;
    for (const m of tpl.matchAll(/class="([^"]*\bdt-(?:go|link-btn)\b[^"]*)"/g))
      expect(m[1]).toMatch(/\btext-wrap\b/);
  });

  it('链接文案不自己写箭头（餐厅信息页的加点、厨具）', () => {
    expect(zhCN.rest.info.toPoints(3)).not.toMatch(/[→›]/);
    expect(zhCN.rest.info.toEquip).not.toMatch(/[→›]/);
  });
});
