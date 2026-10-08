import { defineStore } from 'pinia';
import { DEFAULT_LOCALE, isLocale, type MeDto, type SelectShardResult } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { activeMessages } from '../i18n';
import { useFriendsStore } from './friends';
import { useLocaleStore } from './locale';
import { useMailStore } from './mail';
import { useRestaurantStore } from './restaurant';
import { useToastStore } from './toast';

/**
 * 换了一家店（退出、换号、换区服）就清掉记着的上一家店的东西：
 * - 餐厅：食谱页先按记着的店读列表、拼下一星要求的缓存键（性能排查终审遗留）
 * - 邮件未读数（30 秒内不重读）、好友申请红点：新账号最多看到 30 秒旧的数（稳健性批）
 */
function forgetOtherRestaurant(before: number | null, after: number | null) {
  const r = useRestaurantStore();
  if (r.rest && r.rest.id !== after) r.$reset();
  if (before !== after) {
    useMailStore().$reset();
    useFriendsStore().$reset();
  }
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
      const before = this.me?.restaurantId ?? null;
      this.me = me;
      forgetOtherRestaurant(before, me?.restaurantId ?? null);
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
        useMailStore().$reset();
        useFriendsStore().$reset();
      }
    },
    /** 进入一个区服（选区服页、我的账号页）：账号里的区服和店跟着改，记着的别家店清掉 */
    async enterShard(shardId: number): Promise<SelectShardResult> {
      const r = await endpoints.selectShard(shardId);
      const before = this.me?.restaurantId ?? null;
      if (this.me)
        this.me = { ...this.me, shardId: r.shardId, restaurantId: r.restaurantId, npcRestId: r.npcRestId };
      forgetOtherRestaurant(before, r.restaurantId);
      return r;
    },
  },
});
