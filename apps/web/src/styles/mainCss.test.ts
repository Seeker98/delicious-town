import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'main.css'), 'utf8');

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
  it('同一个类不在顶层定义两次，免得后写的悄悄覆盖前面的（问题记录 212：.dt-chip 撞名）', () => {
    const seen = new Map<string, number>();
    for (const s of topLevelSelectors(css)) seen.set(s, (seen.get(s) ?? 0) + 1);
    const dup = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
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
