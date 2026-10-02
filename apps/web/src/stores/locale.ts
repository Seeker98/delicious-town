import { defineStore } from 'pinia';
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from '@dt/shared';
import { loadMessages, setActive, type Messages } from '../i18n';
import zhCN from '../i18n/locales/zh-CN';
import { useCatalogStore } from './catalog';

const KEY = 'dt_locale';
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
  state: () => ({ locale: DEFAULT_LOCALE as Locale, messages: zhCN as Messages, pendingPick: savedPick() }),
  actions: {
    /** 启动时：浏览器里存的 → 按浏览器语言判断 */
    async init() {
      const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
      await this.set(saved() ?? detectLocale(tags));
    },
    /** 加载失败返回 false，保持原语言 */
    async set(l: Locale): Promise<boolean> {
      let m: Messages;
      try {
        m = await loadMessages(l);
      } catch {
        return false;
      }
      this.locale = l;
      this.messages = m;
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
      return true;
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
