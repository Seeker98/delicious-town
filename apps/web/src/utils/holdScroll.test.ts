import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdScroll } from './holdScroll';

/** 一行：离屏幕顶 top 像素、高 60；top 可以改，模拟重新渲染后挪了位置 */
function row(top: number) {
  const el = document.createElement('div');
  document.body.append(el);
  const box = { top };
  el.getBoundingClientRect = () => ({ top: box.top, bottom: box.top + 60 }) as DOMRect;
  return { el, box };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('列表重新读取后看着的行停在原处（橱柜分解后乱跳）', () => {
  it('上面插进一行：刚点的那行往下挪了 60，页面跟着往下滚 60', () => {
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const a = row(100);
    const b = row(160);
    const back = holdScroll([a.el, b.el], b.el);
    a.box.top += 60;
    b.box.top += 60;
    back();
    expect(scroll).toHaveBeenCalledWith({ top: 60, behavior: 'instant' });
  });

  it('刚点的那行用光拿掉了：按屏幕里还在的第一行算', () => {
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const a = row(100);
    const b = row(160);
    const c = row(220);
    const back = holdScroll([a.el, b.el, c.el], b.el);
    b.el.remove();
    a.box.top -= 40;
    back();
    expect(scroll).toHaveBeenCalledWith({ top: -40, behavior: 'instant' });
  });

  it('没挪（浏览器自己锚定过了）、或者屏幕外的行挪了：不滚', () => {
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const off = row(-500);
    const a = row(100);
    const back = holdScroll([off.el, a.el], a.el);
    off.box.top += 60;
    back();
    expect(scroll).not.toHaveBeenCalled();
  });
});
