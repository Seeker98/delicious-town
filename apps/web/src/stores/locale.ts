import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from '@dt/shared';
import { loadMessages, setActive, type Messages } from '../i18n';
import zhCN from '../i18n/locales/zh-CN';
import { useCatalogStore } from './catalog';

const KEY = 'dt_locale';
/** 部署后旧翻译包 404 时自动刷新过一次的标记（本标签页内有效） */
const RELOAD_KEY = 'dt_locale_reloaded';
/** 刷新页面；单独拿出来便于测试替换 */
export const page = { reload: () => window.location.reload() };
/** 动态导入失败：部署后旧的分包文件没了，刷新一次拿新的入口就好 */
const isChunkError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed/i.test(e.message);
/** 每次切换的序号：快速连切时只认最后一次（backlog 多语言） */
let seq = 0;

/** ok 已切换；failed 加载失败、语言不变；stale 加载完时已经又选了别的语言，这次作废 */
export type SetResult = 'ok' | 'failed' | 'stale';
/** 没登录时手动选过语言、还没存到账号（登录后以它为准） */
const PICK_KEY = 'dt_locale_pick';
function saved(): Locale | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

function savedPick(): boolean {
  try {
    return localStorage.getItem(PICK_KEY) === '1';
  } catch {
    return false;
  }
}

/** 当前语言（问题记录 272）：切换时先加载翻译包，成功了才生效 */
export const useLocaleStore = defineStore('locale', {
  // 翻译包很大且不会改，不做深度响应化（backlog 多语言）
  state: () => ({
    locale: DEFAULT_LOCALE as Locale,
    messages: markRaw(zhCN) as Messages,
    pendingPick: savedPick(),
  }),
  actions: {
    /** 启动时：浏览器里存的 → 按浏览器语言判断 */
    async init(): Promise<SetResult> {
      const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
      return this.set(saved() ?? detectLocale(tags));
    },
    /**
     * 启动时最多等 ms 毫秒（backlog 多语言：以前等翻译包加载完才挂载，请求卡住就白屏）。
     * 超时就先按当前语言（简中）挂载，翻译包到了再切过去；返回 init 的结果，超时为 'timeout'
     */
    async initWithin(ms: number): Promise<SetResult | 'timeout'> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((r) => (timer = setTimeout(() => r('timeout'), ms)));
      try {
        return await Promise.race([this.init(), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    async set(l: Locale): Promise<SetResult> {
      const my = ++seq;
      let m: Messages;
      try {
        m = await loadMessages(l);
      } catch (e) {
        if (isChunkError(e)) {
          let reloaded = false;
          try {
            reloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
            sessionStorage.setItem(RELOAD_KEY, '1');
          } catch {
            reloaded = true;
          }
          if (!reloaded) page.reload();
        }
        return my === seq ? 'failed' : 'stale';
      }
      if (my !== seq) return 'stale';
      this.locale = l;
      this.messages = markRaw(m);
      setActive(l, m);
      document.documentElement.lang = l;
      try {
        localStorage.setItem(KEY, l);
      } catch {
        // 存储不可用时忽略
      }
      // 道具、食材、天气的名字跟着语言变（问题记录 272）：已经读过目录才重读
      const catalog = useCatalogStore();
      if (catalog.loaded) void catalog.reload(l).catch(() => undefined);
      return 'ok';
    },
    /** 没登录时手动选了语言：记下来，登录后存到账号而不是被账号语言覆盖 */
    markPick() {
      this.pendingPick = true;
      try {
        localStorage.setItem(PICK_KEY, '1');
      } catch {
        // 存储不可用时只在本页有效
      }
    },
    clearPick() {
      this.pendingPick = false;
      try {
        localStorage.removeItem(PICK_KEY);
      } catch {
        // 忽略
      }
    },
  },
});
