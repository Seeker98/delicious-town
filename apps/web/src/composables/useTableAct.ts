import type { Ref } from 'vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/**
 * 餐桌上的操作（自家楼层、好友餐厅共用）：忙着时不重复点；成功了提示、收起面板、重新读取，失败了报错
 */
export function useTableAct(busy: Ref<boolean>, picked: Ref<unknown>, load: () => Promise<void>) {
  const toast = useToastStore();
  return async function act(fn: () => Promise<unknown>, ok: string, fallback: string): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
      await fn();
      toast.push(ok);
      picked.value = null;
      await load();
    } catch (e) {
      toast.push(errorMessage(e, fallback), 'danger');
    } finally {
      busy.value = false;
    }
  };
}
