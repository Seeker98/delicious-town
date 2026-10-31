import { onBeforeUnmount, onMounted } from 'vue';

/** 切回前台时，距上次读不到这么久就不重读（性能 2026-10-31） */
export const VISIBLE_REFRESH_MIN_MS = 60_000;

/**
 * 节流：记着上次读的时间，不到 minMs 不再读。
 * 原来首页、外卖、顶栏时钟、随机事件每次切回前台都马上重读（首页一次 5 个接口，一共约 7 个请求），
 * 来回切几下就是几十个请求；线上跨境往返慢，切回来反而卡
 */
export function createThrottle(minMs = VISIBLE_REFRESH_MIN_MS, now: () => number = Date.now) {
  let last = -Infinity;
  return {
    /** 刚读过（进页面、定时、操作完的重读都算） */
    touch() {
      last = now();
    },
    /** 距上次够久了就记下这次、返回 true；不够返回 false */
    take(): boolean {
      if (now() - last < minMs) return false;
      last = now();
      return true;
    },
  };
}

/**
 * 组件里用：页面从后台切回前台时调用 refresh，距上次读过不到 minMs 就跳过。
 * refresh 自己被别处调用（进页面、定时刷新）时要调返回的 touch，免得刚读完一切回来又读一次
 */
export function useVisibleRefresh(refresh: () => unknown, minMs = VISIBLE_REFRESH_MIN_MS) {
  const throttle = createThrottle(minMs);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && throttle.take()) void refresh();
  };
  onMounted(() => document.addEventListener('visibilitychange', onVisible));
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible));
  return { touch: throttle.touch };
}
