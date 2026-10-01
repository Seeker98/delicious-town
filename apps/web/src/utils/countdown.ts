import { computed, type ComputedRef } from 'vue';
import { useServerClock } from './serverClock';

/**
 * 距离某个时刻还剩几秒（向上取整，到点后为 0），按服务器时间算、每秒刷新；本机时钟不准也不影响（终审 I2）。
 * target 返回 null 表示没有冷却；serverNow 是读取数据时服务器给的时间
 */
export function useCountdown(
  target: () => string | null | undefined,
  serverNow: () => string | null | undefined,
): ComputedRef<number> {
  const clock = useServerClock(() => serverNow() ?? new Date().toISOString());
  return computed(() => {
    const t = target();
    return t ? clock.secondsLeft(t) : 0;
  });
}
