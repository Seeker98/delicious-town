const KEY = 'dt_device_id';
let cached: string | null = null;

/** 设备标识：本地保存，只作为防小号的辅助信号；浏览器禁用存储时每次会话新生成 */
export function deviceId(): string {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
    if (!cached) {
      cached = crypto.randomUUID();
      localStorage.setItem(KEY, cached);
    }
  } catch {
    cached = crypto.randomUUID();
  }
  return cached;
}
