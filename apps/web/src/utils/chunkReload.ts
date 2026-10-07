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

export function reloadOnce(to: string, go: (url: string) => void, now = Date.now()): boolean {
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
