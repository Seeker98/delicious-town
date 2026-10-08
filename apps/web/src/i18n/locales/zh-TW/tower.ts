// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 廚塔：挑戰、賽廚榜、聲望商店、好友切磋（問題記錄 272） */
export default {
  title: '廚塔',
  tabs: { tower: '廚塔', rank: '賽廚榜', shop: '聲望商店' },
  loadFailed: '讀取廚塔失敗',
  noStrength: (n: number) => `體力不夠 (要 ${n})`,
  noMoreToday: '今天的挑戰次數用完了',
  challengeFailed: '挑戰失敗',
  challenge: '挑戰',
  duel: {
    /** 色香味形養（下標對應分數） */
    items: ['色', '香', '味', '形', '養'],
    test: (win: boolean) => `試打：${win ? '贏了' : '輸了'}`,
    win: '你贏了',
    lose: '你輸了',
    renown: (n: number) => `，聲望 ${n > 0 ? '+' : ''}${n}`,
    rank: (n: number) => `，你現在是第 ${n} 名`,
    power: (name: string, power: number) => `${name} (廚力 ${power})`,
    /** 比分（問題記錄 396）：我的票 : 對方的票 */
    votes: (me: number, them: number) => ` ${me}:${them}`,
    /** 票數持平、按上場評委的總分定勝負 */
    onTotal: ' (票數相同，比總分)',
    judgesTitle: '評委點評',
    judges: {
      yardSis: '菜園姐',
      xiaoC: '小c',
      wenjie: '雯姐',
      bro13: '13 哥',
      bigEater: '鎮長大胃鍋',
      fanDao: '飯老道',
      gary: '蓋樂瑞',
      gordon: '戈登',
      joe: '老喬',
      xiaoKai: '小凱',
    },
    /** 評委點評（問題記錄 431）：【評委 點評 我】：以[項]勝負，……，比分 我:對方 */
    judgeOn: (name: string) => `【${name} 點評 我】：`,
    itemVerdict: { win: '大獲全勝', close: '不分伯仲', lose: '全軍覆沒' },
    itemLine: (item: string, verdict: string) => `以[${item}]${verdict}`,
    commentSep: '，',
    judgeScore: (me: string, them: string) => `比分 ${me}:${them}`,
    /** 雙方比拼的特色菜（問題記錄 431） */
    dishes: (me: string, them: string) => `【${me}】 VS 【${them}】`,
    dish: (name: string, level: number) => `${name} (${level} 級)`,
    noDish: '無米之炊',
    /** 評委名字和關注的項目（規則說明用） */
    judgeFocus: (name: string, items: string) => `${name} (${items})`,
    itemSep: '、',
    verdict: { me: '投給你', them: '投給對方', tie: '平' },
    rulesTitle: '賽廚規則',
    rules: [
      '雙方按屬性算出色、香、味、形、養五項：色看廚藝、刀工，香看廚藝、調味，味看火候、調味，形看火候、刀工，養看火候、調味、刀工和在售的特色菜。創意越高、幸運越好，每項多加的隨機分越多。',
    ],
    /** 每局怎麼投票（backlog 396）：total 位評委裡請 n 位，先拿到 need 票的贏 */
    rulesVote: (total: number, n: number, need: number) =>
      `每局從 ${total} 位評委裡隨機請 ${n} 位，依次比雙方在他關注的幾項上的總分，高的一方得一票，先拿到 ${need} 票的贏；票數相同時比上場評委打的總分。`,
    /** 五項各看哪些屬性按區服的評分權重拼（backlog 396）；rules 是沒有權重時的說明 */
    rulesPart: (item: string, attrs: string[]) => `${item}看${attrs.join('、')}`,
    rulesMc: '在售的特色菜',
    rulesNone: (item: string) => `${item}只看隨機分`,
    rulesWeights: (parts: string[]) =>
      `雙方按屬性算出色、香、味、形、養五項：${parts.join('，')}。創意越高、幸運越好，每項多加的隨機分越多。`,
    rulesJudges: '評委和他們關注的項目：',
    awards: (text: string) => `得到 ${text}`,
    /** 打贏長老掉的廚具（backlog 408） */
    elderDrop: (name: string) => `長老掉落：${name}`,
  },
  /** 賽廚長老的裝備（問題記錄 408） */
  elder: {
    summary: (level: number, stress: number, pct: number) =>
      `長老裝備：${level} 級，全套強化 +${stress}${pct > 0 ? `；正式挑戰打贏有 ${pct}% 掉一件` : ''}`,
    points: (text: string) => `加點：${text}`,
    piece: (name: string, stress: number, text: string) => `${name} +${stress}：${text}`,
    attrs: (text: string) => `被挑戰時：${text}`,
    drops: (names: string) => `可能掉落：${names}`,
    sep: '、',
  },
  floor: {
    needLevel: (n: number) => `餐廳 ${n} 級才能挑戰`,
    needPrev: (n: number) => `先打贏第 ${n} 層`,
    night: (floor: number, hour: number) => `${floor} 層以上 ${hour} 點以後才能挑戰`,
    tired: '他今天已經累了',
    head: (power: number, left: number, total: number, tickets: number, strength: string) =>
      `我的進攻廚力 ${power} · 今日還能挑戰 ${left}/${total} 次 · 挑戰券 ${tickets} (在倉庫使用，當天多一次) · 體力 ${strength}`,
    name: (floor: number, name: string) => `${floor} 層 · ${name}`,
    power: (n: number) => `廚力 ${n}`,
    meta: (note: string, level: number, name: string, left: number, max: number) =>
      `「${note}」${level} 級起；今天還能挑戰${name} ${left}/${max} 次`,
    mc: (name: string, price: number) => `；今日特色菜 ${name} (每份 ${price})`,
    test: (n: number) => `試打 (${n} 體力)`,
    go: (n: number) => `挑戰 (${n} 體力)`,
  },
  friend: {
    loadFailed: '讀取切磋次數失敗',
    noMore: '今天和它切磋的次數用完了',
    failed: '切磋失敗',
    btn: '切磋',
    left: (n: number) => ` (今天還能 ${n} 次)`,
  },
  rank: {
    loadFailed: '讀取賽廚榜失敗',
    top: (top: number, gap: number) => `前 ${top} 名要在榜上、名次相差 ${gap} 以內才能挑戰`,
    occupied: (n: number) => `佔到了第 ${n} 名`,
    occupyFailed: '佔位失敗',
    myRank: '我的名次 ',
    unranked: '未上榜',
    rankN: (n: number) => `第 ${n} 名`,
    head: (left: number, strength: number) => ` · 今日還能挑戰 ${left} 次 · 每次 ${strength} 體力`,
    weekly: '每週一 0 點換新榜：第 1~3 名、4~8 名、9~15 名有名次禮包，前三名得廚神、廚聖、廚王',
    slotName: (name: string, level: number) => `${name} (${level} 級)`,
    empty: '空',
    me: '我',
    occupy: '佔位',
  },
  shop: {
    loadFailed: '讀取聲望商店失敗',
    owned: '已擁有',
    soldOut: '本週已兌完',
    noRenown: '聲望不夠',
    got: (name: string, n: number) => `換到了 ${name}×${n}`,
    failed: '兌換失敗',
    renown: (n: string) => `我的聲望 ${n}`,
    rule: '美味券、四級和五級食材隨機券常駐；雕像每週輪換，每人限擁有 1 個',
    limitOne: '限擁有 1 個',
    meta: (renown: string, bought: number, limit: number) => `${renown} 聲望 · 本週 ${bought}/${limit}`,
    btn: '兌換',
  },
};
