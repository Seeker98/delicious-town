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

describe('控件（界面改版 P1，设计 §2.6、§2.7）', () => {
  it('按钮：圆角固定 16px（长文案折两行时不变大椭圆）；禁用灰底深灰字、不叠透明度', () => {
    const btn = rule('.btn');
    expect(btn).toMatch(/--bs-btn-border-radius:\s*var\(--dt-radius-pill\)/);
    expect(btn).toMatch(/--bs-btn-disabled-opacity:\s*1/);
    expect(rule('.btn-primary')).toMatch(/--bs-btn-disabled-bg:\s*var\(--dt-disabled-bg\)/);
    expect(rule('.btn-primary')).toMatch(/--bs-btn-disabled-color:\s*var\(--dt-disabled-text\)/);
    expect(rule('.btn-primary')).toMatch(/--bs-btn-color:\s*var\(--dt-on-primary\)/);
  });

  it('次要按钮是浅紫底（btn-outline-primary），中性按钮和写死的 btn-light 读令牌，危险是红描边', () => {
    expect(rule('.btn-outline-primary')).toMatch(/--bs-btn-bg:\s*var\(--dt-primary-soft\)/);
    expect(rule('.btn-outline-primary')).toMatch(/--bs-btn-color:\s*var\(--dt-primary-ink\)/);
    expect(rule('.btn-light')).toMatch(/--bs-btn-bg:\s*var\(--dt-surface-2\)/);
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
    expect(base).toMatch(
      /\.nav-tabs\.dt-tabs-ready::after\s*\{[^}]*transition:\s*transform var\(--dt-dur-base\)/,
    );
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

describe('终审修正（界面改版 P1）', () => {
  it('描边版和实心版看得出区别：买卖、是否、选中的食材（C2）', () => {
    expect(rule('.btn-outline-success')).toMatch(/--bs-btn-bg:\s*transparent/);
    expect(rule('.btn-outline-success')).toMatch(/--bs-btn-border-color:\s*var\(--dt-success\)/);
    expect(rule('.btn-outline-warning')).toMatch(/--bs-btn-bg:\s*transparent/);
    expect(rule('.btn-outline-warning')).toMatch(/--bs-btn-border-color:\s*var\(--dt-warning\)/);
    expect(rule('.btn-success')).toMatch(/--bs-btn-bg:\s*var\(--dt-soft-success\)/);
    expect(rule('.btn-warning')).toMatch(/--bs-btn-bg:\s*var\(--dt-warning\)/);
  });

  it('标签页的键盘焦点是紫色内圈，盖掉 Bootstrap 的蓝色光圈（I3）', () => {
    const r = rule('.nav-tabs .nav-link:focus-visible');
    expect(r).toMatch(/outline:\s*2px solid var\(--dt-primary\)/);
    expect(r).toMatch(/outline-offset:\s*-2px/);
    expect(r).toMatch(/box-shadow:\s*none/);
  });

  it('切换按钮（.active，如论坛点赞）选中时看得出来（I4）', () => {
    expect(rule('.btn-outline-primary.active')).toMatch(/--bs-btn-active-bg:\s*var\(--dt-primary\)/);
    expect(rule('.btn-outline-primary.active')).toMatch(/--bs-btn-active-color:\s*var\(--dt-on-primary\)/);
    expect(rule('.btn-outline-secondary.active')).toMatch(/--bs-btn-active-bg:\s*var\(--dt-text\)/);
    expect(rule('.btn-outline-secondary.active')).toMatch(/--bs-btn-active-color:\s*var\(--dt-surface\)/);
  });
});
