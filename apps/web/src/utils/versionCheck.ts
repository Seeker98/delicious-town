import { BUILD_RE } from '@dt/shared';

/**
 * 旧版本提醒（用户 2026-11-17 定：每次发版都强制刷新）。
 * 原来只有“发版自动刷新”（问题记录 497）：旧页面去拿已经删掉的页面文件、加载失败时才刷新；
 * 不换页面的玩家会一直跑旧代码。现在开着的页面定时读 /version.json（打包时生成，不缓存），
 * 版本号和自己的不同就弹不能关的框，只留“刷新”按钮（components/VersionGate.vue）
 */

/** 多久读一次 */
export const POLL_MS = 5 * 60_000;
/** 两次读之间至少隔多久（切回标签页、恢复联网都会立刻读一次） */
export const MIN_GAP_MS = 30_000;
/** 正在输入框里写东西时，弹框最多往后推多久 */
export const TYPING_GRACE_MS = 3 * 60_000;
/**
 * 为同一个新版本刷新过以后，多久之内不再弹（防连刷）：Cloudflare 各节点更新有先后，
 * 可能 version.json 已经是新的、刷新拿到的页面还是旧的
 */
export const RELOAD_COOLDOWN_MS = 2 * 60_000;

const RELOAD_KEY = 'dt_version_reload';

/** version.json 的内容里取版本号；格式不对（比如发版中途被兜底成首页）算没读到 */
export function parseBuild(x: unknown): string | null {
  if (typeof x !== 'object' || x === null) return null;
  const b = (x as { build?: unknown }).build;
  return typeof b === 'string' && BUILD_RE.test(b) ? b : null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** 读线上最新的版本号；断网、出错、格式不对都返回 null（下一轮再读） */
export async function fetchLatestBuild(
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  now = Date.now(),
): Promise<string | null> {
  try {
    // 地址带时间：中间哪一层没按 no-store 处理也读得到新的
    const r = await fetchImpl(`/version.json?t=${now}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return parseBuild(await r.json());
  } catch {
    return null;
  }
}

/** 开发环境没有 version.json，版本号是 dev，不检查 */
export const versionCheckEnabled = (mine: string, prod: boolean): boolean => prod && mine !== 'dev';

/** 线上版本和自己的不同（回滚到旧版本也算：页面要和线上一致） */
export const isOutdated = (latest: string | null, mine: string): boolean =>
  latest !== null && latest !== mine;

/** 正在输入框里写东西（有焦点、有内容）：先别弹框，免得刷新丢掉写了一半的帖子、留言 */
export function typingDraft(doc: Document = document): boolean {
  const el = doc.activeElement;
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return el.value.trim() !== '';
  if (el instanceof HTMLInputElement)
    return ['text', 'search', ''].includes(el.type) && el.value.trim() !== '';
  return el instanceof HTMLElement && el.isContentEditable === true && (el.textContent ?? '').trim() !== '';
}

/** 刷新前记下：为哪个版本、什么时候刷的 */
export function markReloadFor(build: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ build, at: now }));
  } catch {
    // 存储不可用：照样刷，只是防不了连刷
  }
}

/** 刚为这个版本刷新过、刷完还是旧页面：冷却期内先不弹 */
export function recentlyReloadedFor(build: string, now = Date.now()): boolean {
  try {
    const v = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null') as {
      build?: string;
      at?: number;
    } | null;
    return v?.build === build && typeof v.at === 'number' && now - v.at < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}
