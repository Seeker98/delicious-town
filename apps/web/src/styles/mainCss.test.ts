import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allCss, readCss, stripComments } from './cssSource';

const css = allCss();

/** 顶层（不在 @media 里）的选择器 */
function topLevelSelectors(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of src.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      const sel = buf.trim();
      if (depth === 0 && !sel.startsWith('@')) out.push(...sel.split(',').map((s) => s.trim()));
      depth++;
      buf = '';
    } else if (ch === '}') {
      depth--;
      buf = '';
    } else buf += ch;
  }
  return out;
}

describe('main.css', () => {
  it('强调色文字和链接、按钮用同一个深橙色（问题记录 575：广播是亮橙、日报链接是深橙，看着不一样）', () => {
    const at = css.indexOf('.text-primary {');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('color: rgba(var(--dt-primary-ink-rgb), var(--bs-text-opacity, 1)) !important');
  });

  it('名字行放不下时右边的小字换到下一行，名字按字折行（终审 I1：菜场法文限购压在名字上）', () => {
    const at = css.indexOf('.dt-name-row {');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('flex-wrap: wrap');
  });

  it('同一个类不在顶层定义两次，免得后写的悄悄覆盖前面的（问题记录 212：.dt-chip 撞名）', () => {
    const seen = new Map<string, number>();
    for (const s of topLevelSelectors(css)) seen.set(s, (seen.get(s) ?? 0) + 1);
    // 令牌块（:root、[data-theme]）按层分开写是故意的：不随模式变的、浅色、深色、Bootstrap 映射（界面改版 P1）
    const dup = [...seen].filter(([s, n]) => n > 1 && !/^(:root|\[data-theme)/.test(s)).map(([s]) => s);
    expect(dup).toEqual([]);
  });

  it('手机上防误触放大、保留双指缩放（问题记录 329）：双击不放大；触屏上输入框字号至少 16px，点进去不自动放大', () => {
    expect(css).toMatch(/html {[^}]*touch-action: manipulation/);
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(coarse).toMatch(/.form-control-sm[^{]*{[^}]*font-size: 16px/);
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    expect(html).not.toMatch(/user-scalable=no|maximum-scale=1/);
  });
});

describe('触屏小号输入框和 btn-sm 等高（质量期 ①a）', () => {
  it('压行高只给单行的输入框和下拉，不碰多行的 textarea（发帖、回帖行距不变）', () => {
    const rule = css.match(/([^{}]+)\{\s*line-height: 1\.3125;/);
    expect(rule).not.toBeNull();
    const sels = rule![1]!
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((s) => s.trim());
    expect(sels).toEqual(['input.form-control-sm', 'select.form-select-sm']);
  });

  it('本页操作的文字链接（签到、加油）点击区域往外扩，不改排版（#189 遗留：签到约 28×21 太小）', () => {
    const rule = css.match(/\.dt-link-btn::before\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/inset:\s*-8px -6px/);
    expect(css).toMatch(/\.dt-link-btn\s*\{[^}]*position:\s*relative/);
  });
});

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

describe('顶栏可点的地方够大（界面改版 P2a 终审：设计 §8.3 按钮至少 32px）', () => {
  it('返回、邮件、“我”都至少 32×32', () => {
    for (const sel of ['.dt-header-back', '.dt-header-icon', '.dt-header-me']) {
      const at = css.indexOf(`${sel} {`);
      expect(at, sel).toBeGreaterThan(-1);
      const rule = css.slice(at, css.indexOf('}', at));
      const w = Number(/min-width:\s*(\d+)px/.exec(rule)?.[1] ?? /\bwidth:\s*(\d+)px/.exec(rule)?.[1] ?? 0);
      const h = Number(/min-height:\s*(\d+)px/.exec(rule)?.[1] ?? /\bheight:\s*(\d+)px/.exec(rule)?.[1] ?? 0);
      expect(w, sel).toBeGreaterThanOrEqual(32);
      expect(h, sel).toBeGreaterThanOrEqual(32);
    }
  });
});
