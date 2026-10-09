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

type Loc = Pick<Location, 'pathname' | 'search' | 'hash' | 'assign' | 'reload'>;

/**
 * 刷新到要去的页面：地址栏已经是那一页（后退、前进时浏览器先换了地址）就原地刷新，
 * 不然 assign 会多压一条记录、把“前进”的记录清掉（backlog）；别的情况照常转过去
 */
export function goOrReload(loc: Loc = location): (url: string) => void {
  return (url) => {
    if (loc.pathname + loc.search + loc.hash === url) loc.reload();
    else loc.assign(url);
  };
}

/** 报错里加载失败的文件地址（绝对或 /assets/ 开头的相对地址） */
function failedUrls(err: unknown): string[] {
  const msg = err instanceof Error ? err.message : '';
  return msg.match(/(?:https?:\/\/[^\s'"]+|\/assets\/[^\s'"]+)\.(?:js|css)/g) ?? [];
}

/**
 * 刷新前先强制重拉加载失败的那几个文件，再转到要去的页面（稳健性批）：/assets 缓存一年（immutable），
 * 文件不在时 SPA 兜底回 200 的 index.html，浏览器会把它当成这个 JS 缓存住；回滚、revert 让文件名回到原值时
 * 就一直读到错的。重拉最多等 3 秒，拉不到也照样刷新
 */
export function bustThenGo(err: unknown, go: (url: string) => void): (url: string) => void {
  return (url) => {
    // 读完响应体：只等到响应头就跳页的话，缓存可能只写了一半（终审）
    const bust = Promise.all(
      failedUrls(err).map((u) =>
        fetch(u, { cache: 'reload' })
          .then((r) => r.arrayBuffer())
          .catch(() => undefined),
      ),
    );
    const timeout = new Promise((r) => setTimeout(r, 3000));
    void Promise.race([bust, timeout]).finally(() => {
      // 真正刷新时再记一次时间：10 秒窗口从这里算，不被上面最多 3 秒的等待吃掉（终审）
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        // 存储不可用时忽略
      }
      go(url);
    });
  };
}

/** 正在去的页面：导航开始时记下、结束时清掉。Vite 的预加载报错先到，那时地址还是当前页（终审） */
let pending: string | null = null;
export const chunkTarget = (): string | null => pending;

/**
 * 路由上挂好：记下正在去的页面；加载分包失败时刷新到那里，别的错误照常打到控制台。
 * 断网时不刷，调 onOffline 提示一句（稳健性批：原来点了没反应）
 */
export function installChunkReload(
  router: Router,
  go: (url: string) => void,
  onOffline: () => void = () => undefined,
): void {
  router.beforeEach((to) => {
    pending = to.fullPath;
  });
  router.afterEach(() => {
    pending = null;
  });
  router.onError((err, to) => {
    pending = null;
    if (isChunkLoadError(err)) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) onOffline();
      else reloadOnce(to.fullPath, bustThenGo(err, go));
    }
    // 挂了 onError 以后 vue-router 不再自己打日志
    else console.error(err);
  });
}
