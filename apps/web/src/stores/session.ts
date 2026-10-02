import { defineStore } from 'pinia';
import { isLocale, type MeDto } from '@dt/shared';
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
     * 登录、注册、读到账号后调用（问题记录 272）：账号设过语言就切过去；
     * 没设过（老账号）或值不合法就把当前语言存到账号
     */
    async applyMe(me: MeDto | null) {
      this.me = me;
      if (!me) return;
      const locale = useLocaleStore();
      if (isLocale(me.lang)) {
        if (me.lang !== locale.locale) await locale.set(me.lang);
      } else await endpoints.setLang(locale.locale).catch(() => undefined);
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
