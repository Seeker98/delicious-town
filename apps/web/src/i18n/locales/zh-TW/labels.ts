// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 介面上各處用的名稱表（問題記錄 272） */
export default {
  /** 顧客類型（規格書 01 §1.4） */
  customer: {
    '0': '空桌',
    '1': '普通顧客',
    '2': '挑剔顧客',
    '3': '蟑螂',
    '-3': '蟑螂 (已消滅)',
    '6': '章魚哥',
    '7': '痞老闆',
    '8': '蟹老闆',
    '9': '白食',
  },
  grade: ['未學', '普通', '中品', '上品', '極品', '金牌', '珍品', '佳餚', '仙珍', '聖宴', '天饌'],
  rate: {
    atRate: { label: '上座率', percent: true },
    spRate: { label: '挑剔率', percent: true },
    coinRate: { label: '銀幣加成', percent: true },
    expRate: { label: '經驗加成', percent: true },
    coinValue: { label: '每桌銀幣', percent: false },
    expValue: { label: '每桌經驗', percent: false },
    oilRate: { label: '耗油加成', percent: true },
    oilValue: { label: '每桌耗油', percent: false },
    luck: { label: '幸運', percent: false },
  },
  part: {
    base: '基本',
    cookbook: '食譜',
    effects: '道具與榮譽',
    weather: '天氣',
    bless: '祝福',
    renown: '負聲望',
    float: '浮動',
    plaque: '集牌匾',
    honor: '集榮譽',
    pot: '集盆栽',
    painting: '集名畫',
    spOverflow: '挑剔溢位',
    atOverflow: '上座溢位',
    starPotential: '星潛力',
    newbie: '新手經驗',
    cte: '銀幣轉經驗',
  },
  taste: ['', '酸', '甘', '苦', '辛', '鹹', '鮮'],
  /** 街道類型（問題記錄 378 方案 C） */
  streetFocus: { coin: '銀幣街', balanced: '均衡街', exp: '經驗街' },
  /** 廚具部位（下標 = part） */
  equipPart: ['', '鏟', '刀', '鍋', '瓶', '帽'],
  attr: {
    cook: '廚藝',
    cutting: '刀工',
    fire: '火候',
    season: '調味',
    creatives: '創意',
    luck: '幸運',
  },
  /** 特色菜的道（規格書 04 §4.1） */
  road: ['', '一道', '二道', '三道', '四道', '五道', '六道', '獸'],
  /** 外賣單品級（下標 = 品級，規格書 14.2） */
  takeawayGrade: ['', '普通', '中品', '上品', '極品', '金牌', '珍品', '佳餚'],
  /** 食材等級的顯示名：7 級是神秘食材、9 級是萬能食材 */
  foodLevel: (level: number) => (level === 7 ? '神秘' : level === 9 ? '萬能' : `${level} 級`),
  /** 排行等大數：≥ 1 億寫 x.xx億，≥ 1 萬寫 x.x萬，否則 null（用千分位） */
  shortNum: (n: number): string | null =>
    Math.abs(n) >= 1e8
      ? `${(n / 1e8).toFixed(2)}億`
      : Math.abs(n) >= 1e4
        ? `${(n / 1e4).toFixed(1)}萬`
        : null,
};
