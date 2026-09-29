export const GAME_TIME_ZONE = 'Asia/Shanghai';

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
