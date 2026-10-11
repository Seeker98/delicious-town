/** 酒吧的十个游戏（界面改版 P9）：首页一格一个，每个游戏单独一页 /bar/<游戏> */
export const BAR_GAMES = [
  'fg',
  'cup',
  'num',
  'slot',
  'devil',
  'memory',
  'darts',
  'nim',
  'spice',
  'deal',
] as const;
export type BarGame = (typeof BAR_GAMES)[number];

export const isBarGame = (x: unknown): x is BarGame =>
  typeof x === 'string' && (BAR_GAMES as readonly string[]).includes(x);
