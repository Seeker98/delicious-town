import { defineStore } from 'pinia';
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from '@dt/shared';
import { loadMessages, setActive, type Messages } from '../i18n';
import zhCN from '../i18n/locales/zh-CN';

const KEY = 'dt_locale';
function saved(): Locale | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

/** 当前语言（问题记录 272）：切换时先加载翻译包，成功了才生效 */
export const useLocaleStore = defineStore('locale', {
  state: () => ({ locale: DEFAULT_LOCALE as Locale, messages: zhCN as Messages }),
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
      return true;
    },
  },
});
