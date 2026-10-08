import { defineStore } from 'pinia';
import { DEFAULT_LOCALE, isLocale, type MeDto, type SelectShardResult } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { activeMessages } from '../i18n';
import { useLocaleStore } from './locale';
import { useRestaurantStore } from './restaurant';
import { useToastStore } from './toast';

/**
 * 记着的餐厅不是现在这家店（退出、换号、换区服）就清掉（性能排查终审遗留）：
 * 食谱页先按记着的店读列表、拼下一星要求的缓存键，同一个标签页里换号后会用上一家店的数字
 */
function forgetOtherRestaurant(restaurantId: number | null) {
  const r = useRestaurantStore();
  if (r.rest && r.rest.id !== restaurantId) r.$reset();
}

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
      forgetOtherRestaurant(me?.restaurantId ?? null);
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
        // 跟随账号语言加载失败：提示，先用当前语言（backlog 多语言：以前静默用简中）
        if (me.lang !== locale.locale && (await locale.set(me.lang)) === 'failed')
          useToastStore().push(activeMessages().common.langLoadFailed, 'danger');
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
        useRestaurantStore().$reset();
      }
    },
    /** 进入一个区服（选区服页、我的账号页）：账号里的区服和店跟着改，记着的别家店清掉 */
    async enterShard(shardId: number): Promise<SelectShardResult> {
      const r = await endpoints.selectShard(shardId);
      if (this.me)
        this.me = { ...this.me, shardId: r.shardId, restaurantId: r.restaurantId, npcRestId: r.npcRestId };
      forgetOtherRestaurant(r.restaurantId);
      return r;
    },
  },
});
