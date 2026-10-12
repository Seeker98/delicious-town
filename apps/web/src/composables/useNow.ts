import { onUnmounted, ref, type Ref } from 'vue';
import { serverNowMs } from '../utils/serverNow';

/**
 * 页面上的“现在”（服务器时间，毫秒），每隔 everyMs 走一次；组件卸载时停（backlog P6、理财）：
 * 冷却到点、存款到期这类按时间变的状态，页面开着也会自己变
 */
export function useNow(everyMs = 15_000): Ref<number> {
  const now = ref(serverNowMs());
  const timer = setInterval(() => (now.value = serverNowMs()), everyMs);
  onUnmounted(() => clearInterval(timer));
  return now;
}
