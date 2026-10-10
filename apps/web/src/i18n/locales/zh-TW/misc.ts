// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 兌換碼、天氣、邀請好友（問題記錄 272） */
export default {
  redeem: {
    title: '兌換碼',
    note: '兌換碼由運營發放, 不分大小寫；同一個碼每家店只能用一次, 獎勵當場到賬。',
  },
  weather: {
    loadFailed: '讀取天氣失敗',
    noEffect: '對經營沒有影響',
    zeroStar: ' (0 星餐廳不受天氣影響)',
    zeroStarLine: '0 星餐廳不受天氣影響',
    until: (time: string) => `持續到 ${time}`,
    /** 蟹老闆所在街道：前半句、街名（加粗）、後半句 */
    krabPre: '蟹老闆今天在 ',
    krabPost: ': 在這條街營業, 遇到神秘顧客的機會更大。',
    holiday: (n: number) => `今天是節日, 美味券掉落機率 ×${n}`,
    hammer: '持有雷神錘可以換天氣: ',
    toSquare: '去廣場',
  },
  invite: {
    title: '邀請好友',
    loadFailed: '讀取邀請資訊失敗',
    copied: '已複製',
    copyFailed: '複製失敗, 請手動選中複製',
    myCode: '我的邀請碼',
    copy: '複製',
    copyLink: '複製連結',
    rules: (cap: number, lv1: number, lv2: number) =>
      `好友開店就能領新手禮包；好友驗證郵箱後, 店鋪升到 ${lv1} 級、再升到 ${lv2} 級時, 你各得一份獎勵。每月最多計 ${cap} 人。`,
    month: (n: number, cap: number) => `本月已計 ${n} / ${cap}`,
    empty: '還沒有邀請到好友',
    level: (n: number) => `${n} 級`,
    noRest: '還沒開店',
    unverified: '還沒驗證郵箱',
    stage: {
      sent: (lv: number) => `${lv} 級獎勵已發`,
      pending: (lv: number) => `${lv} 級獎勵待發 (你在該區開店後補發)`,
      capped: (lv: number) => `${lv} 級獎勵超出本月上限`,
    },
  },
};
