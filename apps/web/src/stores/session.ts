import { defineStore } from 'pinia';
import { DEFAULT_LOCALE, isLocale, type MeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useLocaleStore } from './locale';

export const useSessionStore = defineStore('session', {
  state: () => ({ me: null as MeDto | null, loaded: false }),
  actions: {
    async load() {
      let me: MeDto | null = null;
      try {
        me = await endpoints.me();
      } catch {
        me = null;
      } finally {
        this.loaded = true;
      }
      await this.applyMe(me);
    },
    /**
     * 登录、注册、读到账号后调用（问题记录 272）：
     * - 没登录时在这个浏览器手动选过语言：以手选为准存到账号（只一次）
     * - 账号设过语言：切过去
     * - 没设过或值不合法：多语言上线前注册的都是中文玩家，用简中并存到账号，不按浏览器语言猜
     */
    async applyMe(me: MeDto | null) {
      this.me = me;
      if (!me) return;
      const locale = useLocaleStore();
      if (locale.pendingPick) {
        // 存失败就留着标记，下次读到账号再存
        if (me.lang === locale.locale) locale.clearPick();
        else
          await endpoints.setLang(locale.locale).then(
            () => locale.clearPick(),
            () => undefined,
          );
      } else if (isLocale(me.lang)) {
        if (me.lang !== locale.locale) await locale.set(me.lang);
      } else {
        if (locale.locale !== DEFAULT_LOCALE) await locale.set(DEFAULT_LOCALE);
        await endpoints.setLang(DEFAULT_LOCALE).catch(() => undefined);
      }
    },
    async logout() {
      try {
        await endpoints.logout();
      } finally {
        this.me = null;
      }
    },
  },
});
