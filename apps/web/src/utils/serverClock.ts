import { onBeforeUnmount, ref, watch } from 'vue';
import { serverNowMs } from './serverNow';

/**
 * 按服务器时间走的"现在"（每秒更新）：serverNow 是读取数据时服务器给的时间。
 * 冷却按钮据此自己恢复，不用刷新页面；本机时钟不准也不影响（4E-1 终审 I1）。
 * 还没拿到（null）时按全站的服务器时差走，不按设备时间（backlog：/time 读失败时悄悄用了设备时间）
 */
export function useServerClock(serverNow: () => string | null | undefined) {
  /** 和这份数据里服务器时间的差；没有时为 null，按全站时差 */
  let offset: number | null = null;
  const tick = () => (offset === null ? serverNowMs() : Date.now() + offset);
  const now = ref(tick());
  const sync = () => {
    const v = serverNow();
    const t = v ? Date.parse(v) : NaN;
    offset = Number.isFinite(t) ? t - Date.now() : null;
    now.value = tick();
  };
  sync();
  watch(serverNow, sync);
  const timer = setInterval(() => {
    now.value = tick();
  }, 1000);
  onBeforeUnmount(() => clearInterval(timer));

  /** 还没到这个时间 */
  const pending = (iso: string | null): iso is string => iso !== null && Date.parse(iso) > now.value;
  /** 离这个时间还剩几秒（向上取整） */
  const secondsLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - now.value) / 1000));
  return { now, pending, secondsLeft };
}
