import type { Router } from 'vue-router';

/**
 * 发版后页面文件加载不到（问题记录 497）：页面是旧版本时开着的，点到还没加载过的页面，
 * 要的是旧版本的文件，发版后已经换掉了，浏览器报“Failed to fetch dynamically imported module”。
 * 这时刷新一次（转到要去的页面）就能拿到新版本；10 秒内又失败就不再刷，免得新版本真坏了时一直刷
 */
const KEY = 'dt_chunk_reload_at';
const WINDOW_MS = 10_000;

export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : '';
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(msg);
}

/** 断网时不刷（495~513 遗留）：加载失败是因为没网，刷了只会落到浏览器的离线页，也别占掉 10 秒的窗口 */
export function reloadOnce(
  to: string,
  go: (url: string) => void,
  now = Date.now(),
  online = typeof navigator === 'undefined' || navigator.onLine,
): boolean {
  if (!online) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // 存储不可用：照样刷，只是防不了连刷
  }
  go(to);
  return true;
}

/** 正在去的页面：导航开始时记下、结束时清掉。Vite 的预加载报错先到，那时地址还是当前页（终审） */
let pending: string | null = null;
export const chunkTarget = (): string | null => pending;

/** 路由上挂好：记下正在去的页面；加载分包失败时刷新到那里，别的错误照常打到控制台 */
export function installChunkReload(router: Router, go: (url: string) => void): void {
  router.beforeEach((to) => {
    pending = to.fullPath;
  });
  router.afterEach(() => {
    pending = null;
  });
  router.onError((err, to) => {
    pending = null;
    if (isChunkLoadError(err)) reloadOnce(to.fullPath, go);
    // 挂了 onError 以后 vue-router 不再自己打日志
    else console.error(err);
  });
}
