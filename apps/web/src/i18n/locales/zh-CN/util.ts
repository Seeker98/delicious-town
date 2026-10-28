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
    mcGoldRate: '特色菜金牌',
    killRoachNoStrengthRate: '灭蟑螂免体力',
    taNeedtimeRate: '外卖配送时间',
    taCoinRate: '外卖银币',
    taExpRate: '外卖经验',
    taSuccessoddsRate: '外卖成功率',
    /** 艺术品设施抬软上限（2026-10-17）：玩家文字不写“软上限”，写白话 */
    atSoftCapAdd: '满座容量',
    spSoftCapAdd: '贵客容量',
  },
  /** 一项加成："挑剔率+10%" */
  effect: (label: string, value: string) => `${label}${value}`,
  reward: {
    coin: (n: string) => `银币 ${n}`,
    diamond: (n: string) => `钻石 ${n}`,
    exp: (n: string) => `经验 ${n}`,
    renown: (n: string) => `声望 ${n}`,
    hat: (prefix: string, name: string) => `${prefix}•${name}之帽`,
    /** 称号（问题记录 539）：定制称号的名字在所有语言里都是原文 */
    icon: (title: string) => `称号「${title}」`,
    iconDays: (n: number) => ` (领取后 ${n} 天)`,
    iconUntil: (time: string) => ` (到 ${time})`,
    iconExpired: (title: string) => `称号「${title}」已过期`,
  },
};
