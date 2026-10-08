/**
 * 按服务器时间的“现在”（backlog：一批倒计时用了设备时钟）。
 * 顶栏时钟读到服务器时间时记下和本机的差；没读到时差为 0，就是本机时间
 */
let offset = 0;

/** 读到服务器时间时调用一次 */
export function setServerOffset(serverIso: string): void {
  const t = Date.parse(serverIso);
  if (Number.isFinite(t)) offset = t - Date.now();
}

/** 按服务器时间的“现在”（毫秒） */
export const serverNowMs = (): number => Date.now() + offset;
