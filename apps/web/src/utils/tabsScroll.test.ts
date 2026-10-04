import { describe, expect, it } from 'vitest';
import { markOverflow, revealActive } from './tabsScroll';

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
