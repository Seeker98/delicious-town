import { GAME_TIME_ZONE, gameParts, gameTime } from '@dt/shared';

/**
 * 后台的 datetime-local 输入框按北京时间（游戏时间）填和显示，不看设备时区
 * （终审：运营的机器在伦敦，填 20:00 实际成了北京时间次日 03:00）
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** 时刻 → 输入框的值（北京时间，到分钟） */
export function toGameInput(d: Date): string {
  const p = gameParts(d);
  return `${p.day}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** 输入框的值（北京时间）→ ISO */
export function fromGameInput(v: string): string {
  const [day, hm] = v.split('T');
  const [h, m] = (hm ?? '0:0').split(':').map(Number);
  return gameTime(day!, h ?? 0, m ?? 0).toISOString();
}

/** 后台列表里的时间（北京时间） */
export const adminTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { timeZone: GAME_TIME_ZONE, hour12: false });
