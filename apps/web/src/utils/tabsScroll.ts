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

/** 竖着滚滚轮时横着滑标签栏：放得下、已经滑到头、本来就是横向滚动时不管（让页面照常滚） */
export function wheelTabs(c: HTMLElement, e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'preventDefault'>): void {
  if (c.scrollWidth <= c.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  const max = c.scrollWidth - c.clientWidth;
  if ((e.deltaY < 0 && c.scrollLeft <= 0) || (e.deltaY > 0 && c.scrollLeft >= max - 1)) return;
  c.scrollLeft = Math.min(max, Math.max(0, c.scrollLeft + e.deltaY));
  e.preventDefault();
}

export function markOverflow(c: HTMLElement): void {
  c.classList.toggle('dt-tabs-more', c.scrollLeft + c.clientWidth < c.scrollWidth - 1);
}

/** 选中下划线（界面改版 P1）：写出选中标签相对标签栏的位置；第二次起才开过渡，免得首次从左边滑进来 */
export function placeIndicator(c: HTMLElement): void {
  // 只在真变了的时候写：写属性会惊动 installTabsScroll 的 MutationObserver，没变也写就会每帧循环（终审 C1）
  const a = c.querySelector<HTMLElement>('.nav-link.active');
  const x = `${a ? a.offsetLeft : 0}px`;
  const w = `${a ? a.offsetWidth : 0}`;
  if (c.style.getPropertyValue('--dt-tab-x') !== x) c.style.setProperty('--dt-tab-x', x);
  if (c.style.getPropertyValue('--dt-tab-w') !== w) c.style.setProperty('--dt-tab-w', w);
  if (!c.dataset.dtTabPlaced) c.dataset.dtTabPlaced = '1';
  else if (!c.classList.contains('dt-tabs-ready')) c.classList.add('dt-tabs-ready');
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
      placeIndicator(c);
      markOverflow(c);
    }
  };
  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(schedule);
  // characterData：标签文字变了（未读数、切语言）宽度跟着变，下划线也要跟（backlog P1）
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  // 网页字体晚到时标签变宽
  void document.fonts?.ready.then(schedule);
  const onScroll = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.classList.contains('nav-tabs')) markOverflow(t);
  };
  root.addEventListener('scroll', onScroll, true);
  // 鼠标滚轮横着滑标签栏（电脑上没有滚动条，标签放不下时原来只能按住 Shift 滚）
  const onWheel = (e: WheelEvent) => {
    const c = e.target instanceof Element ? e.target.closest<HTMLElement>('.nav-tabs') : null;
    if (c) wheelTabs(c, e);
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    observer.disconnect();
    root.removeEventListener('scroll', onScroll, true);
    root.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', schedule);
  };
}
