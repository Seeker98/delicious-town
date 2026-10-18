import { describe, expect, it } from 'vitest';
import { markOverflow, revealActive, wheelTabs } from './tabsScroll';

/** jsdom 没有排版：手动给容器和标签设位置 */
function bar(opts: { left: number; width: number; scrollWidth: number; active: [number, number] }) {
  const c = document.createElement('ul');
  c.className = 'nav nav-tabs';
  const a = document.createElement('a');
  a.className = 'nav-link active';
  c.appendChild(a);
  c.scrollLeft = 0;
  Object.defineProperty(c, 'clientWidth', { value: opts.width });
  Object.defineProperty(c, 'scrollWidth', { value: opts.scrollWidth });
  c.getBoundingClientRect = () => ({ left: opts.left, right: opts.left + opts.width }) as DOMRect;
  a.getBoundingClientRect = () => ({ left: opts.active[0], right: opts.active[1] }) as DOMRect;
  return c;
}

describe('标签页横向滑动（问题记录 100 终审）', () => {
  it('选中的标签在右边看不见时，横向滑过去让它整个露出来；已经看得见就不动', () => {
    const c = bar({ left: 0, width: 340, scrollWidth: 530, active: [380, 520] });
    revealActive(c);
    expect(c.scrollLeft).toBe(180);
    const visible = bar({ left: 0, width: 340, scrollWidth: 530, active: [10, 120] });
    revealActive(visible);
    expect(visible.scrollLeft).toBe(0);
  });

  it('右边还有没露出来的标签时加渐隐提示，滑到底就去掉', () => {
    const c = bar({ left: 0, width: 340, scrollWidth: 530, active: [0, 100] });
    markOverflow(c);
    expect(c.classList.contains('dt-tabs-more')).toBe(true);
    c.scrollLeft = 190;
    markOverflow(c);
    expect(c.classList.contains('dt-tabs-more')).toBe(false);
  });
});

describe('鼠标滚轮横滑标签栏（成就页审查：电脑上没滚动条滑不动）', () => {
  const wheel = (deltaY: number, deltaX = 0) => {
    let prevented = false;
    return {
      deltaY,
      deltaX,
      preventDefault: () => (prevented = true),
      get prevented() {
        return prevented;
      },
    };
  };
  it('放不下时竖着滚就横着滑，并拦下页面滚动；滑到头或放得下时不管', () => {
    const c = bar({ left: 0, width: 340, scrollWidth: 530, active: [0, 100] });
    const e = wheel(100);
    wheelTabs(c, e);
    expect(c.scrollLeft).toBe(100);
    expect(e.prevented).toBe(true);
    const back = wheel(-300);
    wheelTabs(c, back);
    expect(c.scrollLeft).toBe(0);
    const atStart = wheel(-50);
    wheelTabs(c, atStart);
    expect(atStart.prevented).toBe(false);
    const fits = bar({ left: 0, width: 340, scrollWidth: 340, active: [0, 100] });
    const f = wheel(100);
    wheelTabs(fits, f);
    expect(f.prevented).toBe(false);
  });
});

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

describe('下划线不会自己触发自己（终审 C1）', () => {
  it('位置没变时再定位一次：不改任何属性，不惊动 MutationObserver（以前每帧循环）', async () => {
    const { placeIndicator } = await import('./tabsScroll');
    document.body.innerHTML = '<ul class="nav nav-tabs"><li><a class="nav-link active">A</a></li></ul>';
    const c = document.querySelector<HTMLElement>('.nav-tabs')!;
    placeIndicator(c);
    placeIndicator(c);
    const records: MutationRecord[] = [];
    const mo = new MutationObserver((r) => records.push(...r));
    mo.observe(c, { attributes: true });
    placeIndicator(c);
    records.push(...mo.takeRecords());
    mo.disconnect();
    expect(records).toEqual([]);
  });

  it('标签文字变了（未读数、切语言）：下划线宽度跟着变（backlog P1）', async () => {
    const { installTabsScroll } = await import('./tabsScroll');
    document.body.innerHTML = '<ul class="nav nav-tabs"><li><a class="nav-link active">A</a></li></ul>';
    const c = document.querySelector<HTMLElement>('.nav-tabs')!;
    const a = c.querySelector<HTMLElement>('.nav-link')!;
    let w = 40;
    Object.defineProperty(a, 'offsetWidth', { get: () => w });
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    const stop = installTabsScroll(document.body);
    await frame();
    expect(c.style.getPropertyValue('--dt-tab-w')).toBe('40');
    w = 64;
    a.firstChild!.textContent = 'A 12';
    await Promise.resolve();
    await frame();
    expect(c.style.getPropertyValue('--dt-tab-w')).toBe('64');
    stop();
  });
});
