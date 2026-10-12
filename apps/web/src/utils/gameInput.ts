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

/** 后台的日期（北京时间），写成“2026/10/03”（界面改版 P12：玩家列表的注册日期） */
export function adminDate(iso: string): string {
  const [y, m, d] = gameParts(new Date(iso)).day.split('-');
  return `${y}/${m}/${d}`;
}

/**
 * 后台表格里的短时间（北京时间，界面改版 P12）：月日时分“10/12 06:57”；不是今年的才写年。
 * now 只给测试用
 */
export function adminShort(iso: string, now = new Date()): string {
  const p = gameParts(new Date(iso));
  const [y, m, d] = p.day.split('-');
  const md = `${Number(m)}/${Number(d)} ${pad(p.hour)}:${pad(p.minute)}`;
  return y === gameParts(now).day.slice(0, 4) ? md : `${y}/${md}`;
}

/** 后台的完整时间（北京时间），到分钟：“2026/10/9 21:18”（界面改版 P12：玩家详情的注册时间） */
export function adminMinute(iso: string): string {
  const p = gameParts(new Date(iso));
  const [y, m, d] = p.day.split('-');
  return `${y}/${Number(m)}/${Number(d)} ${pad(p.hour)}:${pad(p.minute)}`;
}
