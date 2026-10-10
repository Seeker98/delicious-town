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

/** [文字, 底色]：每套模式都要 ≥ 4.5（界面改版设计 §2.1） */
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
    expect(LIGHT.get('--dt-primary')).toBe('#7442b8');
    expect(DARK.get('--dt-primary')).toBe('#b48bea');
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
