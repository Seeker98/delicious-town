import type { Locale } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useLocaleStore } from '../stores/locale';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { useT } from './useT';

/**
 * 换语言（问题记录 272；界面改版 P11 从下拉框挪到语言面板）：改了立刻生效；登录状态下同时存到账号。
 * 返回是否换成了：加载期间又选了别的语言、翻译包加载失败都算没换成
 */
export function useLangPick() {
  const locale = useLocaleStore();
  const session = useSessionStore();
  const toast = useToastStore();
  const t = useT();
  return async function pick(l: Locale): Promise<boolean> {
    const r = await locale.set(l);
    // stale：加载期间又选了别的语言，以那次为准
    if (r === 'stale') return false;
    if (r === 'failed') {
      toast.push(t.value.common.langLoadFailed, 'danger');
      return false;
    }
    if (session.me)
      // 存到账号失败要说一声：不然下次刷新会回到账号原来的语言（backlog 多语言）
      await endpoints.setLang(l).catch(() => toast.push(t.value.common.langSaveFailed, 'danger'));
    else locale.markPick();
    return true;
  };
}
