import { computed, onBeforeUnmount, ref, type ComputedRef } from 'vue';

/** 距离某个时刻还剩几秒（向上取整，到点后为 0）；每秒刷新一次。target 返回 null 表示没有冷却 */
export function useCountdown(target: () => string | null | undefined): ComputedRef<number> {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), 1000);
  onBeforeUnmount(() => clearInterval(timer));
  return computed(() => {
    const t = target();
    if (!t) return 0;
    return Math.max(0, Math.ceil((new Date(t).getTime() - now.value) / 1000));
  });
}
