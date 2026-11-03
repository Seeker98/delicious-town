/**
 * 列表重新读取后，让玩家看着的那一行停在原处（橱柜分解、合成后列表乱跳）：分解出的低级食材插在上面、
 * 用光的一种整行拿掉时，iPhone 的 Safari 没有滚动锚定，页面不跟着滚，看着的行就跳走了。
 * 读取前调用：记下 prefer（刚点的那一行）和屏幕里各行离屏幕顶多远；渲染完调用返回的函数，
 * 按顺序找第一个还在页面上的行，它挪了多少就把页面滚多少。浏览器自己锚定过的，算出来是 0，不再动
 */
export function holdScroll(rows: Iterable<Element>, prefer?: Element | null): () => void {
  const h = window.innerHeight;
  const seen = new Map<Element, number>();
  const note = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (!seen.has(el) && r.bottom > 0 && r.top < h) seen.set(el, r.top);
  };
  if (prefer) note(prefer);
  for (const el of rows) note(el);
  return () => {
    for (const [el, top] of seen) {
      if (!el.isConnected) continue;
      const d = el.getBoundingClientRect().top - top;
      if (Math.abs(d) >= 1) window.scrollBy({ top: d, behavior: 'instant' });
      return;
    }
  };
}
