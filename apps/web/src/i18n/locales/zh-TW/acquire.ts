// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 packages/shared/src/zh-TW-overrides.json
/** 收購（問題記錄 421；改版 2026-10-16）。金額、百分數、倍數由呼叫方按語言格式化好再傳進來 */
export default {
  title: '收購',
  tabs: { price: '身價榜', market: '在售', invest: '投資榜', mine: '我的' },
  loadFailed: '讀取收購資訊失敗',
  failed: '操作失敗',
  /** 收購規則（介面改版 P8 使用者反饋：一條一行，不寫成一整段）；r 裡的數都已格式化 */
  ruleItems: (r: {
    mult: string;
    heatStep: string;
    minStar: number;
    maxPerDay: number;
    priceDays: number;
    newStarDays: number;
    firstStore: string;
    firstBurn: string;
    tax: string;
    listMin: string;
    listMax: string;
    resaleSeller: string;
    resaleStore: string;
    buyerStar: number;
    buyerDays: number;
    buyerPerDay: number;
    maxHoldings: number;
    cede: string;
    cedeTend: string;
    tendCost: string;
    tendMult: string;
    packStep: string;
    packMax: number;
    halfDays: number;
    stopDays: number;
    releaseDays: number;
    redeemOwner: string;
    redeemBurn: string;
    protectDays: number;
  }) => [
    `身價 = 近 ${r.priceDays} 天日均結算銀幣 × ${r.mult} × 熱度; 強收一次熱度 +${r.heatStep}, 每天往 1 回落`,
    `強收只能收沒有老闆的 ${r.minStar} 星以上的店, 每家每天最多被強收 ${r.maxPerDay} 次, 剛到 ${r.minStar} 星的店 ${r.newStarDays} 天內不能被收: 店得 ${r.firstStore}, 併購諮詢費 ${r.firstBurn} 銷燬, ${r.tax} 是稅`,
    `有老闆的店只能掛牌轉手 (身價的 ${r.listMin}~${r.listMax}): 原老闆得 ${r.resaleSeller}, 店得 ${r.resaleStore}, ${r.tax} 是稅`,
    `自己 ${r.buyerStar} 星以上、註冊滿 ${r.buyerDays} 天才能收購; 每天最多買 ${r.buyerPerDay} 家, 名下最多 ${r.maxHoldings} 家`,
    `被收購的店每輪結算讓 ${r.cede} 給老闆, 老闆當天打理過讓 ${r.cedeTend}; 前一天的抽成 00:05 發給老闆`,
    `老闆打理: 付這家店日均的 ${r.tendCost} (銷燬), 店之後的結算 × ${r.tendMult}, 日均每滿 ${r.packStep} 送店 1 個二級街市補給包 (最多 ${r.packMax} 個)`,
    `老闆 ${r.halfDays} 天沒打理抽成減半, ${r.stopDays} 天不再抽成, ${r.releaseDays} 天自動放手`,
    `被收購的店可以按基礎身價贖身: 老闆得 ${r.redeemOwner}, ${r.redeemBurn} 銷燬, ${r.tax} 是稅; 贖身後 ${r.protectDays} 天內不能被收購`,
  ],
  price: (coin: string) => `身價 ${coin}`,
  heat: (h: string) => `熱度 ${h}`,
  owner: (name: string) => `老闆: ${name}`,
  free: '自主經營',
  listed: (pct: string, coin: string, left: string) => `掛牌 ${pct}: ${coin} 銀幣, 還剩 ${left}`,
  protectedLeft: (left: string) => `保護期還剩 ${left}, 期間不能被強收`,
  acquire: '收購',
  buyListed: '買下',
  confirmAcquire: (name: string, coin: string, store: string, burn: string, tax: string) =>
    `花 ${coin} 銀幣收購「${name}」？\n「${name}」得 ${store} 銀幣, 併購諮詢費 ${burn} 銀幣銷燬, 稅 ${tax} 銀幣。`,
  confirmListed: (name: string, coin: string, seller: string, got: string, store: string, tax: string) =>
    `花 ${coin} 銀幣按掛牌價買下「${name}」？\n「${seller}」得 ${got} 銀幣, 「${name}」得 ${store} 銀幣, 稅 ${tax} 銀幣。`,
  bought: (name: string) => `「${name}」歸你了`,
  colHoldings: (n: number) => `名下 ${n} 家`,
  colValue: (coin: string) => `身價合計 ${coin}`,
  colDividend: (coin: string) => `累計抽成 ${coin}`,
  rankEmpty: '還沒有店上榜',
  marketEmpty: '現在沒有掛牌的店',
  investEmpty: '還沒有人收購過餐廳',
  myPrice: '我的身價',
  myPriceSub: (avg: string, mult: string, heat: string) => `日均 ${avg} × ${mult} · 熱度 ${heat}`,
  /** 被收購的店看到的一塊 */
  ownedTitle: '被收購中',
  ownedSince: (date: string) => `${date} 起`,
  cededToday: '今天已讓出',
  ceded30: '近 30 天讓出',
  cedeNow: '今天的抽成',
  cedeTended: '老闆打理過',
  cedeUntended: '老闆還沒打理',
  cedeHalf: '老闆沒打理, 減半',
  cedeStopped: '老闆太久沒打理',
  tendDays7: '近 7 天老闆打理',
  tendDaysVal: (n: number) => `${n} 天`,
  tendedLine: (time: string, mult: string, packs: number) =>
    `老闆 ${time} 打理了: 之後每輪結算 × ${mult}${packs > 0 ? `, 送了你 ${packs} 個二級街市補給包` : ''}`,
  untendedLine: (mult: string) => `老闆今天還沒打理; 打理以後, 之後每輪結算 × ${mult}`,
  redeemBtn: (coin: string) => `贖身 ${coin}`,
  ownedNote: (half: number, stop: number, release: number) =>
    `老闆 ${half} 天沒打理抽成減半, ${stop} 天不再抽成, ${release} 天自動放手。被收購期間不能收購別的店。`,
  confirmRedeem: (coin: string) => `花 ${coin} 銀幣贖身？`,
  confirmRedeemBody: (
    owner: string,
    got: string,
    gotPct: string,
    burn: string,
    burnPct: string,
    tax: string,
    taxPct: string,
    days: number,
  ) =>
    `老闆「${owner}」得 ${got} 銀幣 (${gotPct})\n贖身銷燬 ${burn} 銀幣 (${burnPct})\n稅 ${tax} 銀幣 (${taxPct})\n贖身按基礎身價, 不乘熱度。贖身後 ${days} 天內不能被收購, 以後結算不再讓給老闆。`,
  redeem: '贖身',
  redeemed: '贖身成功, 餐廳又自主經營了',
  ownedNoBuy: '被收購期間不能收購別的店',
  holdingsEmpty: '名下還沒有店。在身價榜、在售裡能收購別人的餐廳。',
  /** 名下的店 */
  pendingTotal: '今天待發抽成',
  pendingSub: '明天 00:05 到賬',
  yesterdayTotal: '昨天到賬',
  yesterdayPending: '還沒發',
  tendAllLine: (n: number, cost: string) => `${n} 家今天還沒打理, 一起打理付 ${cost} 銀幣`,
  allTended: '名下的店今天都打理過了',
  tendAll: '全部打理',
  tendAllDone: (n: number, cost: string) => `打理了 ${n} 家, 共付 ${cost} 銀幣`,
  holdTended: '今天打理過',
  holdNotTended: '今天沒打理',
  holdIdle: (days: number) => `${days} 天沒打理`,
  /** 關聯賬號的店不能打理（程式碼審查 2026-10-19） */
  holdLinked: '關聯賬號, 不能打理',
  holdSub: (avg: string, rate: string, pending: string) => `日均 ${avg} · 抽成 ${rate} · 今天待發 ${pending}`,
  holdHalfNote: (stopIn: number, releaseIn: number) =>
    `抽成減半; 再 ${stopIn} 天不打理就不再抽成, ${releaseIn} 天后自動放手`,
  holdStopNote: (releaseIn: number) => `已經不再抽成; ${releaseIn} 天后自動放手`,
  tendBtn: (cost: string) => `打理 ${cost}`,
  tendDone: (name: string, cost: string) => `打理了「${name}」, 付了 ${cost} 銀幣`,
  /** 名下一家的面板 */
  holdSheetSub: (price: string, avg: string) => `身價 ${price} · 日均 ${avg}`,
  tendTitle: '打理',
  tendPay: (pct: string) => `你付 (日均的 ${pct}, 銷燬)`,
  tendMultLine: '店今天之後的結算',
  tendPack: '送店',
  tendPackN: (n: number) => `${n} 個二級街市補給包`,
  tendPackNone: (step: string) => `日均不到 ${step}, 不送`,
  tendRate: '你今天的抽成',
  tendSheetBtn: (cost: string) => `打理 (付 ${cost})`,
  tendedSheet: (time: string) => `今天 ${time} 打理過了`,
  tendNote: '從打理那一刻起生效, 越早打理今天抽得越多。',
  list: '掛牌',
  unlist: '撤牌',
  release: '放手',
  listDone: (name: string) => `「${name}」掛牌了`,
  unlistDone: (name: string) => `「${name}」撤牌了`,
  confirmRelease: (name: string) => `放手「${name}」？\n不退錢, 店變回自主經營。`,
  releaseDone: (name: string) => `放手了「${name}」`,
  /** 首頁（被收購時）和對方餐廳頁的卡片 */
  homeOwned: (name: string) => `你的餐廳歸「${name}」所有`,
  homeLink: '讓渡、贖身',
  cardTitle: '收購',
  /** 介面改版 P8：整行點開的面板、名下的店面板、規則一行 */
  ownerTag: (name: string) => `老闆 ${name}`,
  listedTag: (pct: string) => `掛牌 ${pct}`,
  leftLine: (left: string) => `還剩 ${left}`,
  coinUnit: '銀幣',
  rulesTitle: '收購規則',
  rulesSub: (cede: string) => `強收只能收沒有老闆的店; 被收購的店每輪結算讓 ${cede} 給老闆`,
  holdingsTitle: '名下的店',
  holdCount: (n: number, max: number) => `${n} / ${max} 家`,
  holdHead: (n: number, max: number, left: number) => `${n} / ${max} 家 · 今天還能買 ${left} 家`,
  visit: '去店裡看看',
  goMarket: '去在售看看',
  /** 身價榜、在售點開的那家 */
  targetSub: (price: string, avg: string, heat: string) => `身價 ${price} · 日均 ${avg} · 熱度 ${heat}`,
  youPay: '你付',
  sellerGot: (name: string, pct: string) => `「${name}」得 (${pct})`,
  burnLine: (pct: string) => `併購諮詢費 (${pct}, 銷燬)`,
  taxLine: (pct: string) => `稅 (${pct})`,
  afterTitle: '收下以後',
  afterCede: '每天抽成約',
  afterCedeVal: (coin: string, pct: string) => `${coin} (${pct})`,
  afterTend: '打理的日子',
  afterTendVal: (pct: string, cost: string) => `${pct}, 付日均的 ${cost}`,
  payback: '回本約',
  paybackVal: (plain: number, tended: number) => `${plain} 天 · 天天打理 ${tended} 天`,
  afterHold: '收購後名下',
  buyNote: (half: number, stop: number, release: number, redeem: string, priceDays: number) =>
    `按近 ${priceDays} 天收入算, 店的收入變了抽成跟著變。${half} 天沒打理抽成減半, ${stop} 天不再抽成, ${release} 天自動放手。店可以隨時贖身, 那時你只拿回贖身價的 ${redeem}。`,
  ownedWhy: '有老闆的店不能強收, 只能等老闆掛牌後在「在售」裡買下。',
  /** 名下一家的掛牌 */
  rateLabel: '按身價的多少掛牌',
  listPrice: '掛牌價',
  listSellerGot: (pct: string) => `賣出後你得 (${pct})`,
  listNote: (days: number) => `有老闆的店只能掛牌轉手; ${days} 天后自動撤下。掛牌期間店也可以按掛牌價贖身。`,
};
