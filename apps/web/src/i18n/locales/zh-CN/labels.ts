/** 界面上各处用的名称表（问题记录 272） */
export default {
  /** 顾客类型（规格书 01 §1.4） */
  customer: {
    '0': '空桌',
    '1': '普通顾客',
    '2': '挑剔顾客',
    '3': '蟑螂',
    '-3': '蟑螂 (已消灭)',
    '6': '章鱼哥',
    '7': '痞老板',
    '8': '蟹老板',
    '9': '白食',
  },
  grade: ['未学', '普通', '中品', '上品', '极品', '金牌', '珍品', '佳肴', '仙珍', '圣宴', '天馔'],
  rate: {
    atRate: { label: '上座率', percent: true },
    spRate: { label: '挑剔率', percent: true },
    coinRate: { label: '银币加成', percent: true },
    expRate: { label: '经验加成', percent: true },
    coinValue: { label: '每桌银币', percent: false },
    expValue: { label: '每桌经验', percent: false },
    oilRate: { label: '耗油加成', percent: true },
    oilValue: { label: '每桌耗油', percent: false },
    luck: { label: '幸运', percent: false },
  },
  part: {
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
    newbie: '新手经验',
    cte: '银币转经验',
  },
  taste: ['', '酸', '甘', '苦', '辛', '咸', '鲜'],
  /** 街道类型（问题记录 378 方案 C） */
  streetFocus: { coin: '银币街', balanced: '均衡街', exp: '经验街' },
  /** 厨具部位（下标 = part） */
  equipPart: ['', '铲', '刀', '锅', '瓶', '帽'],
  attr: {
    cook: '厨艺',
    cutting: '刀工',
    fire: '火候',
    season: '调味',
    creatives: '创意',
    luck: '幸运',
  },
  /** 特色菜的道（规格书 04 §4.1） */
  road: ['', '一道', '二道', '三道', '四道', '五道', '六道', '兽'],
  /** 外卖单品级（下标 = 品级，规格书 14.2） */
  takeawayGrade: ['', '普通', '中品', '上品', '极品', '金牌', '珍品', '佳肴'],
  /** 食材等级的显示名：7 级是神秘食材、9 级是万能食材 */
  foodLevel: (level: number) => (level === 7 ? '神秘' : level === 9 ? '万能' : `${level} 级`),
  /** 排行等大数：≥ 1 亿写 x.xx亿，≥ 1 万写 x.x万，否则 null（用千分位） */
  shortNum: (n: number): string | null =>
    Math.abs(n) >= 1e8
      ? `${(n / 1e8).toFixed(2)}亿`
      : Math.abs(n) >= 1e4
        ? `${(n / 1e4).toFixed(1)}万`
        : null,
};
