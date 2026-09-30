/** 顾客类型（规格书 01 §1.4） */
export const CUSTOMER_NAMES: Record<string, string> = {
  '0': '空桌',
  '1': '普通顾客',
  '2': '挑剔顾客',
  '3': '蟑螂',
  '-3': '蟑螂（已消灭）',
  '6': '章鱼哥',
  '7': '痞老板',
  '8': '蟹老板',
  '9': '白食',
};

export const GRADE_NAMES = [
  '未学',
  '普通',
  '中品',
  '上品',
  '极品',
  '金牌',
  '珍品',
  '佳肴',
  '仙珍',
  '圣宴',
  '天馔',
];

export const RATE_LABELS: Record<string, { label: string; percent: boolean }> = {
  atRate: { label: '上座率', percent: true },
  spRate: { label: '挑剔率', percent: true },
  coinRate: { label: '银币加成', percent: true },
  expRate: { label: '经验加成', percent: true },
  coinValue: { label: '每桌银币', percent: false },
  expValue: { label: '每桌经验', percent: false },
  oilRate: { label: '耗油加成', percent: true },
  oilValue: { label: '每桌耗油', percent: false },
  luck: { label: '幸运', percent: false },
};

export const PART_LABELS: Record<string, string> = {
  base: '基本',
  cookbook: '食谱',
  effects: '道具与荣誉',
  weather: '天气',
  bless: '祝福',
  renown: '负声望',
  float: '浮动',
  plaque: '集牌匾',
  honor: '集荣誉',
  pot: '集盆栽',
  painting: '集名画',
  spOverflow: '挑剔溢出',
  atOverflow: '上座溢出',
  starPotential: '星潜力',
  cte: '银币转经验',
};

export const TASTE_NAMES = ['', '酸', '甘', '苦', '辛', '咸', '鲜'];

export function pct(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return `${v >= 0 ? '+' : ''}${v}%`;
}

/** 厨具部位（下标 = part） */
export const PART_NAMES = ['', '铲', '刀', '锅', '瓶', '帽'];

export const ATTR_KEYS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;

export const ATTR_NAMES: Record<string, string> = {
  cook: '厨艺',
  cutting: '刀工',
  fire: '火候',
  season: '调味',
  creatives: '创意',
  luck: '幸运',
};

/** 特色菜的道（规格书 04 §4.1） */
export const ROAD_NAMES = ['', '一道', '二道', '三道', '四道', '五道', '六道', '兽'];

/** 外卖单品级（下标 = 品级，规格书 14.2） */
export const TAKEAWAY_GRADES = ['', '普通', '中品', '上品', '极品', '金牌', '珍品', '佳肴'];
