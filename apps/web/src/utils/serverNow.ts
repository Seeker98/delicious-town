import { shallowRef } from 'vue';

/**
 * 按服务器时间的“现在”（backlog：一批倒计时用了设备时钟）。
 * 顶栏时钟读到服务器时间时记下和本机的差；没读到时差为 0，就是本机时间。
 * 时差是响应式的：页面数据比 /time 先回来时，用到它的 computed 和模板会跟着更新（终审 I1）
 */
const offset = shallowRef(0);

/** 读到服务器时间时调用 */
export function setServerOffset(serverIso: string): void {
  const t = Date.parse(serverIso);
  if (Number.isFinite(t)) offset.value = t - Date.now();
}

/** 按服务器时间的“现在”（毫秒） */
export const serverNowMs = (): number => Date.now() + offset.value;
