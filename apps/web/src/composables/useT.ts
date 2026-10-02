import { computed } from 'vue';
import { useLocaleStore } from '../stores/locale';

/** 模板里写 {{ t.home.signIn }}；切换语言时自动刷新（问题记录 272） */
export function useT() {
  const s = useLocaleStore();
  return computed(() => s.messages);
}
