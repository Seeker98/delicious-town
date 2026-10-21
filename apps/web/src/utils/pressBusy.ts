/**
 * 按钮“处理中”（界面第二批）：点了按钮、随后发出写请求时，给这个按钮标 aria-busy，请求结束再去掉。
 * 页面原来只把按钮灰掉（:disabled="busy"），分不清“正在处理”和“不能点”；
 * 标了 aria-busy 的按钮保持原来的颜色，超过 300 毫秒才把文字换成小转圈（base.css），快的请求看不出变化。
 * 只认 .btn，只认点完 1 秒内发出的请求（中间可能先等确认面板、先读一份数据）
 */
const WINDOW_MS = 1000;

let last: HTMLElement | null = null;
let lastAt = 0;
/** 同一个按钮同时有几个请求在路上：最后一个结束才去掉 */
const pending = new WeakMap<HTMLElement, number>();

function onClick(e: Event) {
  const btn = e.target instanceof Element ? e.target.closest<HTMLElement>('.btn') : null;
  if (!btn) return;
  last = btn;
  lastAt = performance.now();
}

export function installPressBusy(doc: Document = document): () => void {
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}

/** 写请求开始时调：返回结束时要调的函数；最近没点过按钮就什么都不做 */
export function markPressBusy(): () => void {
  const btn = last;
  if (!btn || !btn.isConnected || performance.now() - lastAt > WINDOW_MS) return () => {};
  pending.set(btn, (pending.get(btn) ?? 0) + 1);
  btn.setAttribute('aria-busy', 'true');
  return () => {
    const n = (pending.get(btn) ?? 1) - 1;
    if (n > 0) {
      pending.set(btn, n);
      return;
    }
    pending.delete(btn);
    btn.removeAttribute('aria-busy');
  };
}

/** 测试用：清掉记住的按钮 */
export function resetPressBusy(): void {
  last = null;
  lastAt = 0;
}
