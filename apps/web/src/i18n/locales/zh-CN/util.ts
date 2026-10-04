/** 各页共用的小工具文案：剩余时间、加成、奖励（问题记录 272） */
export default {
  remain: {
    forever: '永久',
    minutes: (m: number) => `剩余 ${m} 分钟`,
    hours: (h: number) => `剩余 ${h} 小时`,
    hoursMinutes: (h: number, m: number) => `剩余 ${h} 小时 ${m} 分`,
    days: (d: number) => `剩余 ${d} 天`,
    daysHours: (d: number, h: number) => `剩余 ${d} 天 ${h} 小时`,
  },
  /** 加成键的名称（规格书 00 §0.6） */
  effects: {
    atRate: '上座率',
    spRate: '挑剔率',
    coinRate: '最终银币',
    expRate: '最终经验',
    oilRate: '耗油',
    coinValue: '每桌银币',
    expValue: '每桌经验',
    oilValue: '每桌耗油',
    luckValue: '幸运',
  },
  /** 一项加成："挑剔率+10%" */
  effect: (label: string, value: string) => `${label}${value}`,
  reward: {
    coin: (n: string) => `银币 ${n}`,
    diamond: (n: string) => `钻石 ${n}`,
    exp: (n: string) => `经验 ${n}`,
    renown: (n: string) => `声望 ${n}`,
    hat: (prefix: string, name: string) => `${prefix}•${name}之帽`,
  },
};
