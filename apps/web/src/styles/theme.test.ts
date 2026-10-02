import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'main.css'), 'utf8');

function varOf(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`no ${name}`);
  return m[1]!;
}
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

describe('主题颜色（视觉规范 §2，终审 I3~I5）', () => {
  it('次要文字、按钮和链接的颜色在白底上对比度 ≥ 4.5', () => {
    expect(contrast(varOf('--dt-muted'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(varOf('--dt-primary-ink'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('按钮、链接、标签用可读的品牌色；勾选框、开关、聚焦光圈不再是 Bootstrap 蓝', () => {
    expect(css).toMatch(/--bs-link-color:\s*var\(--dt-primary-ink\)/);
    expect(css).toMatch(/\.btn-primary\s*\{[^}]*--bs-btn-bg:\s*var\(--dt-primary-ink\)/);
    expect(css).toMatch(/\.form-check-input:checked\s*\{[^}]*background-color:\s*var\(--dt-primary-ink\)/);
    expect(css).toMatch(/--bs-focus-ring-color:/);
    expect(css).toMatch(/--bs-btn-focus-shadow-rgb:\s*var\(--dt-primary-rgb\)/);
    expect(css).not.toMatch(/#0d6efd/i);
  });
});

describe('PR27 遗留：禁用按钮、危险和成功色、没用的样式', () => {
  it('禁用的主按钮变灰，不再是淡橙色', () => {
    expect(css).toMatch(/\.btn-primary\s*\{[^}]*--bs-btn-disabled-bg:\s*#f1f3f5/);
    // 禁用时文字仍可读：深灰字、不再叠加透明度（终审）
    expect(css).toMatch(/\.btn-primary\s*\{[^}]*--bs-btn-disabled-color:\s*#6c757d/);
    expect(css).toMatch(/--bs-btn-disabled-opacity:\s*1/);
    expect(contrast('#6c757d', '#f1f3f5')).toBeGreaterThanOrEqual(4);
    expect(css).toMatch(/\.btn-outline-primary\s*\{[^}]*--bs-btn-disabled-color:\s*#adb5bd/);
  });
  it('危险红、成功绿按视觉规范覆盖 Bootstrap；危险红在白底上可读', () => {
    expect(varOf('--bs-danger')).toBe('#c92a2a');
    expect(varOf('--bs-success')).toBe('#2b8a3e');
    expect(contrast(varOf('--bs-danger'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.btn-outline-danger\s*\{[^}]*--bs-btn-color:\s*#c92a2a/);
    expect(css).toMatch(/\.btn-danger\s*\{[^}]*--bs-btn-bg:\s*#c92a2a/);
    expect(css).toMatch(/\.btn-success\s*\{[^}]*--bs-btn-bg:\s*#2b8a3e/);
  });
  it('删掉已经没人用的 .dt-row', () => {
    expect(css).not.toMatch(/\.dt-row\s*\{/);
    expect(css).not.toMatch(/\.dt-row-actions/);
  });
});

describe('浅底深字（问题记录 216）', () => {
  const TONES = ['primary', 'success', 'danger', 'warning', 'info', 'secondary'] as const;
  function hslOf(name: string): [number, number, number] {
    const m = new RegExp(`${name}:\\s*hsl\\((\\d+),\\s*(\\d+)%,\\s*(\\d+)%\\)`).exec(css);
    if (!m) throw new Error(`no ${name}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function hex([h, s, l]: [number, number, number]): string {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(v * 255)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  it('每种语气色的浅底只拉高亮度（色相、饱和度不变），深字在浅底上对比度 ≥ 4.5', () => {
    for (const t of TONES) {
      const soft = hslOf(`--dt-soft-${t}`);
      const ink = hslOf(`--dt-ink-${t}`);
      expect(soft[0], t).toBe(ink[0]);
      expect(soft[1], t).toBe(ink[1]);
      expect(soft[2], t).toBeGreaterThanOrEqual(88);
      expect(contrast(hex(ink), hex(soft)), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('徽章（不含未读数圆点）改成浅底深字；进度条填充用中等亮度', () => {
    for (const t of TONES) {
      expect(css).toMatch(
        new RegExp(
          `\\.badge\\.text-bg-${t},\\s*\\.badge:not\\(\\.rounded-pill\\)\\.bg-${t}\\s*\\{[^}]*background-color:\\s*var\\(--dt-soft-${t}\\)\\s*!important;[^}]*color:\\s*var\\(--dt-ink-${t}\\)\\s*!important`,
        ),
      );
    }
    expect(css).toMatch(/\.progress-bar\.bg-warning\s*\{[^}]*var\(--dt-fill-warning\)/);
    expect(css).toMatch(/\.progress-bar\.bg-danger\s*\{[^}]*var\(--dt-fill-danger\)/);
    expect(css).not.toMatch(/#fd7e14|#40c057/);
  });
});
