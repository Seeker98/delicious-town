/**
 * 一级标签页不换行、放不下时横向滑动（问题记录 100）。全局装一次：
 * - 选中的标签变了（点击、记住的标签、?tab= 深链）时，把它横向滑进可见范围，只动标签栏、不动整页；
 * - 右边还有没露出来的标签时加 .dt-tabs-more（右边渐隐），提示可以滑
 */
export function revealActive(c: HTMLElement): void {
  const a = c.querySelector<HTMLElement>('.nav-link.active');
  if (!a) return;
  const box = c.getBoundingClientRect();
  const r = a.getBoundingClientRect();
  if (r.left < box.left) c.scrollLeft -= box.left - r.left;
  else if (r.right > box.right) c.scrollLeft += r.right - box.right;
}

export function markOverflow(c: HTMLElement): void {
  c.classList.toggle('dt-tabs-more', c.scrollLeft + c.clientWidth < c.scrollWidth - 1);
}

export function installTabsScroll(root: HTMLElement = document.body): () => void {
  const lastActive = new WeakMap<HTMLElement, Element | null>();
  let pending = 0;
  const sync = () => {
    pending = 0;
    for (const c of root.querySelectorAll<HTMLElement>('.nav-tabs')) {
      const active = c.querySelector('.nav-link.active');
      if (lastActive.get(c) !== active) {
        lastActive.set(c, active);
        revealActive(c);
      }
      markOverflow(c);
    }
  };
  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const onScroll = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.classList.contains('nav-tabs')) markOverflow(t);
  };
  root.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    observer.disconnect();
    root.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', schedule);
  };
}
