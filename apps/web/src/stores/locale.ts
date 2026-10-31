import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from '@dt/shared';
import { currentMessages, loadMessages, setActive, type Messages } from '../i18n';
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

/** 翻译包不做深度响应化；还没有时原样留空（markRaw 不能用在 undefined 上） */
const rawOrNone = (m: Messages | undefined) => (m ? markRaw(m) : m);

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
    // 启动时第一个翻译包到之前是空的（性能 2026-10-31：简中不再打进主包）；应用等有了才挂载，组件里照常当作有
    messages: rawOrNone(currentMessages()) as Messages,
    pendingPick: savedPick(),
  }),
  actions: {
    /**
     * 启动时：浏览器里存的 → 按浏览器语言判断（规则同 public/theme-init.js 提前下载的那个）。
     * 选的语言加载失败时用简中顶上（以前简中在主包里，失败也有字可显示）
     */
    async init(): Promise<SetResult> {
      const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
      const r = await this.set(saved() ?? detectLocale(tags));
      if (r === 'failed') await this.fallback();
      return r;
    },
    /**
     * 启动时最多等 ms 毫秒（backlog 多语言：以前等翻译包加载完才挂载，请求卡住就白屏）。
     * 超时就同时读简中，哪个先到先按哪个挂载，选的语言到了再切过去（简中不在主包里了，要读）；
     * 返回 init 的结果，超时为 'timeout'。返回后 messages 还是空的说明一个翻译包也没拿到（main.ts 显示加载失败）
     */
    async initWithin(ms: number): Promise<SetResult | 'timeout'> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((r) => (timer = setTimeout(() => r('timeout'), ms)));
      const first = this.init();
      try {
        const r = await Promise.race([first, timeout]);
        if (r !== 'timeout') return r;
      } finally {
        clearTimeout(timer);
      }
      // 简中也没拿到就接着等选的语言
      await Promise.race([first, this.fallback().then((ok) => (ok ? undefined : first))]);
      return 'timeout';
    },
    /**
     * 还一个翻译包都没有时先用简中：不改选的语言、不存进浏览器，选的那个到了 set 照常切过去（序号不变）。
     * 已经有了就不动；返回现在有没有翻译包
     */
    async fallback(): Promise<boolean> {
      if (this.messages) return true;
      let m: Messages;
      try {
        m = await loadMessages(DEFAULT_LOCALE);
      } catch {
        return !!this.messages;
      }
      if (!this.messages) {
        this.locale = DEFAULT_LOCALE;
        this.messages = markRaw(m);
        setActive(DEFAULT_LOCALE, m);
      }
      return true;
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
