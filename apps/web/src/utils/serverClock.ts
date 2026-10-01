import { onBeforeUnmount, ref, watch } from 'vue';

/**
 * 按服务器时间走的"现在"（每秒更新）：serverNow 是读取数据时服务器给的时间。
 * 冷却按钮据此自己恢复，不用刷新页面；本机时钟不准也不影响（4E-1 终审 I1）
 */
export function useServerClock(serverNow: () => string) {
  let offset = 0;
  const now = ref(Date.now());
  const sync = () => {
    offset = Date.parse(serverNow()) - Date.now();
    now.value = Date.now() + offset;
  };
  sync();
  watch(serverNow, sync);
  const timer = setInterval(() => {
    now.value = Date.now() + offset;
  }, 1000);
  onBeforeUnmount(() => clearInterval(timer));

  /** 还没到这个时间 */
  const pending = (iso: string | null): iso is string => iso !== null && Date.parse(iso) > now.value;
  /** 离这个时间还剩几秒（向上取整） */
  const secondsLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - now.value) / 1000));
  return { now, pending, secondsLeft };
}
