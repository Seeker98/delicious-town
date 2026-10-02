// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 各頁共用的小工具文案：剩餘時間、加成、獎勵（問題記錄 272） */
export default {
  remain: {
    forever: '永久',
    minutes: (m: number) => `剩餘 ${m} 分鐘`,
    hours: (h: number) => `剩餘 ${h} 小時`,
    hoursMinutes: (h: number, m: number) => `剩餘 ${h} 小時 ${m} 分`,
  },
  /** 加成鍵的名稱（規格書 00 §0.6） */
  effects: {
    atRate: '上座率',
    spRate: '挑剔率',
    coinRate: '最終銀幣',
    expRate: '最終經驗',
    oilRate: '耗油',
    coinValue: '每桌銀幣',
    expValue: '每桌經驗',
    oilValue: '每桌耗油',
    luckValue: '幸運',
  },
  /** 一項加成："挑剔率+10%" */
  effect: (label: string, value: string) => `${label}${value}`,
  reward: {
    coin: (n: string) => `銀幣 ${n}`,
    diamond: (n: string) => `鑽石 ${n}`,
    exp: (n: string) => `經驗 ${n}`,
    hat: (prefix: string, name: string) => `${prefix}•${name}之帽`,
  },
};
