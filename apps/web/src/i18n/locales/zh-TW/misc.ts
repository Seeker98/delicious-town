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
    zeroStarLine: '0 星餐廳不受天氣影響',
    until: (time: string) => `持續到 ${time}`,
    /** 蟹老闆所在街道：前半句、街名（加粗）、後半句 */
    krabPre: '蟹老闆今天在 ',
    krabPost: ': 在這條街營業, 遇到神秘顧客的機會更大。',
    holiday: (n: number) => `今天是節日, 美味券掉落機率 ×${n}`,
    /** 天氣改版（天氣改版設計）：頂部天氣卡、怎麼玩、預報、改天氣 */
    slot: (from: string, to: string, next: number) => `${from} ~ ${to} · ${next} 點換天`,
    coverSlot: (from: string, to: string, natural: string) => `${from} ~ ${to} · 之後回到${natural}`,
    /** 誰用什麼把天氣蓋了：人名、剩餘時間加粗（設計圖 Wx-B）；{ b } 是加粗的一段 */
    cover: (who: string, item: string, natural: string, now: string, minutes: number, next: number) => [
      { b: who },
      ` 用${item}把${natural}換成了${now}, 還剩 `,
      { b: `${minutes} 分鐘` },
      `。底下的天氣照常變化, ${next} 點會換天。`,
    ],
    someone: '有人',
    how: {
      title: '天氣怎麼玩',
      fold: '收起',
      unfold: '展開',
      lines: (hours: number[]) => [
        `天氣每 4 小時換一次 (${hours.join('、')} 點), 順著現在的天氣慢慢變: 晴天不會直接下雪, 雨要一級一級下大。`,
        '下面的預報是下一輪各類天氣的機率。',
        '天氣不好時, 用司天羅盤 (選一類) 或晴雨籤 (二選一) 改 1 小時, 全鎮都按改後的天氣經營。',
      ],
    },
    forecast: {
      title: '預報',
      next: (time: string) => `下一輪 ${time}`,
      note: '天氣會順著現在的走, 不會一下子從晴天跳到下雪。',
    },
    /** 天氣四大類（下標 = 類型） */
    types: ['', '晴', '雨', '雪冰', '風沙霧'],
    tools: {
      title: '改天氣',
      compassSub: '選一類天氣, 具體哪種看天意 · 改 1 小時',
      lotsSub: '搖出兩支天氣籤, 挑一支 · 改 1 小時',
      have: (n: number) => `持有 ${n}`,
      use: '使用',
      pick: '去選籤',
      toMayor: '鎮長那換',
      toShop: '去商店',
      rule: (hours: number) => `每人 ${hours} 小時用一次；有人剛改過的 1 小時裡不能再改。`,
      locked: (minutes: number, time: string) =>
        `別人剛改過天氣, ${minutes} 分鐘後 (${time} 以後) 才能再改。`,
      cooling: (used: string, ready: string) => `你 ${used} 用過, ${ready} 以後才能再用。`,
      done: (name: string, time: string) => `天氣改成了${name}, 持續到 ${time}`,
      failed: '改天氣失敗',
    },
    compass: {
      title: '司天羅盤: 選一類天氣',
      sub: '具體哪種看天意, 改 1 小時, 全鎮都按這個天氣經營。羅盤不會換出酸雨、冰凍。',
      cannot: '現在的天氣轉不到這一類',
      go: '用掉 1 個司天羅盤',
      pickFirst: '先選一類',
    },
    lots: {
      title: '晴雨籤',
      readySub: '搖出兩支天氣籤, 挑一支, 天氣改 1 小時。籤都順著現在的天氣來, 偶爾會搖出特殊天氣。',
      draw: '搖籤 (用掉 1 個晴雨籤)',
      pickTitle: '晴雨籤: 挑一支',
      pickSub: '籤已經搖出來了, 挑一支, 天氣改 1 小時。',
      lot: (n: number) => `籤${n === 1 ? '一' : '二'}`,
      take: (name: string) => `就要${name}`,
      countdown: (s: number) => `${s} 秒內不選, 自動用籤一`,
    },
  },
  invite: {
    title: '邀請好友',
    loadFailed: '讀取邀請資訊失敗',
    copied: '已複製',
    copyFailed: '複製失敗, 請手動選中複製',
    myCode: '我的邀請碼',
    copy: '複製邀請碼',
    copyLink: '複製註冊連結',
    rules: (cap: number, lv1: number, lv2: number) =>
      `好友開店就能領新手禮包；好友驗證郵箱後, 店鋪升到 ${lv1} 級、再升到 ${lv2} 級時, 你各得一份獎勵。每月最多計 ${cap} 人。`,
    month: (n: number, cap: number) => `本月已計 ${n} / ${cap}`,
    empty: '還沒有邀請到好友',
    /** 介面改版 P11：兌換碼頁的入口、規則拆成三格 */
    entrySub: (n: number, cap: number) => `本月已邀請 ${n} / ${cap} 人, 好友升級你也拿獎勵`,
    entrySubPlain: '好友升級你也拿獎勵',
    monthLabel: '本月已計',
    stepOpen: '好友開店',
    stepOpenGift: '新手禮包',
    stepLevel: (n: number) => `好友 ${n} 級`,
    stepYou: '你得一份',
    stepAgain: '再得一份',
    rulesShort: (cap: number) => `好友要先驗證郵箱才計數, 每月最多計 ${cap} 人。`,
    listTitle: '我邀請的好友',
    people: (n: number) => `${n} 人`,
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
