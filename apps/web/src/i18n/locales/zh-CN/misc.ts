/** 兑换码、天气、邀请好友（问题记录 272） */
export default {
  redeem: {
    title: '兑换码',
    note: '兑换码由运营发放，不分大小写；同一个码每家店只能用一次，奖励当场到账。',
  },
  weather: {
    loadFailed: '读取天气失败',
    noEffect: '对经营没有影响',
    zeroStar: ' (0 星餐厅不受天气影响)',
    zeroStarLine: '0 星餐厅不受天气影响',
    until: (time: string) => `持续到 ${time}`,
    /** 蟹老板所在街道：前半句、街名（加粗）、后半句 */
    krabPre: '蟹老板今天在 ',
    krabPost: ': 在这条街营业，遇到神秘顾客的机会更大。',
    holiday: (n: number) => `今天是节日，美味券掉落概率 ×${n}`,
    hammer: '持有雷神锤可以换天气: ',
    toSquare: '去广场',
  },
  invite: {
    title: '邀请好友',
    loadFailed: '读取邀请信息失败',
    copied: '已复制',
    copyFailed: '复制失败，请手动选中复制',
    myCode: '我的邀请码',
    copy: '复制',
    copyLink: '复制链接',
    rules: (cap: number) =>
      `好友开店就能领新手礼包；好友验证邮箱后，店铺升到 10 级、再升到 30 级时，你各得一份奖励。每月最多计 ${cap} 人。`,
    month: (n: number, cap: number) => `本月已计 ${n} / ${cap}`,
    empty: '还没有邀请到好友',
    level: (n: number) => `${n} 级`,
    noRest: '还没开店',
    unverified: '还没验证邮箱',
    stage: {
      sent: (lv: number) => `${lv} 级奖励已发`,
      pending: (lv: number) => `${lv} 级奖励待发 (你在该区开店后补发)`,
      capped: (lv: number) => `${lv} 级奖励超出本月上限`,
    },
  },
};
