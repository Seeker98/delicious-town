export const GAME_TIME_ZONE = 'Asia/Shanghai';
/** 北京时间固定 +8 小时，没有夏令时 */
const OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;
/** 结算每轮 4 分钟 */
export const ROUND_MS = 240_000;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: GAME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 游戏日（北京时间），格式 YYYY-MM-DD */
export function gameDay(date: Date = new Date()): string {
  return dayFormat.format(date);
}

export interface GameParts {
  day: string;
  hour: number;
  minute: number;
}

export function gameParts(date: Date): GameParts {
  const d = new Date(date.getTime() + OFFSET_MS);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 北京时间 day 的 hour:minute 对应的时刻 */
export function gameTime(day: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + hour * 3600_000 + minute * 60_000 - OFFSET_MS);
}

export function slotKey(day: string, hour: number): string {
  return `${day}@${String(hour).padStart(2, '0')}`;
}

export interface Slot {
  key: string;
  day: string;
  hour: number;
  start: Date;
}

function slot(day: string, hour: number): Slot {
  return { key: slotKey(day, hour), day, hour, start: gameTime(day, hour) };
}

/** hours（0~23 的整点）中最近一个已经到达的时点；今天还没到任何一个时取前一天的最后一个 */
export function latestSlot(now: Date, hours: readonly number[]): Slot {
  const { day, hour } = gameParts(now);
  const reached = hours.filter((h) => h <= hour);
  if (reached.length > 0) return slot(day, Math.max(...reached));
  return slot(addDays(day, -1), Math.max(...hours));
}

/** hours 中下一个时点（严格晚于当前小时） */
export function nextSlot(now: Date, hours: readonly number[]): Slot {
  const { day, hour } = gameParts(now);
  const later = hours.filter((h) => h > hour);
  if (later.length > 0) return slot(day, Math.min(...later));
  return slot(addDays(day, 1), Math.min(...hours));
}

export function roundOf(date: Date): number {
  return Math.floor(date.getTime() / ROUND_MS);
}

/** slotKey 的逆运算 */
export function parseSlotKey(key: string): Slot {
  const m = /^(\d{4}-\d{2}-\d{2})@(\d{2})$/.exec(key);
  if (!m) throw new Error(`bad slot key ${key}`);
  return slot(m[1]!, Number(m[2]));
}
