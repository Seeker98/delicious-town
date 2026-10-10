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
  });

  it('未读数圆点（实心）上的字用对应的“上面的字”颜色，深色下不发虚', () => {
    expect(rule('.badge.rounded-pill.bg-danger')).toMatch(/color:\s*var\(--dt-on-danger\)/);
    expect(rule('.badge.rounded-pill.bg-primary')).toMatch(/color:\s*var\(--dt-on-primary\)/);
  });

  it('徽章：浅底深字，六种语气都有', () => {
    for (const t of ['primary', 'success', 'danger', 'warning', 'info', 'secondary'])
      expect(rule(`.badge.text-bg-${t},\n.badge:not(.rounded-pill).bg-${t}`), t).toMatch(
        new RegExp(
          `background-color:\\s*var\\(--dt-soft-${t}\\)\\s*!important;[^}]*color:\\s*var\\(--dt-ink-${t}\\)`,
        ),
      );
  });

  it('提示块：不用青色，info 也是紫水晶浅底', () => {
    expect(rule('.alert-info')).toMatch(/--bs-alert-bg:\s*var\(--dt-soft-primary\)/);
    expect(base).not.toMatch(/#0dcaf0|#cff4fc/i);
  });
});
