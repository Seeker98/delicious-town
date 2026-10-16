/** 收购（问题记录 421；改版 2026-10-16）。金额、百分数、倍数由调用方按语言格式化好再传进来 */
export default {
  title: '收购',
  tabs: { price: '身价榜', market: '在售', invest: '投资榜', mine: '我的' },
  loadFailed: '读取收购信息失败',
  failed: '操作失败',
  /** 收购规则（界面改版 P8 用户反馈：一条一行，不写成一整段）；r 里的数都已格式化 */
  ruleItems: (r: {
    mult: string;
    heatStep: string;
    minStar: number;
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
    `身价 = 近 7 天日均结算银币 × ${r.mult} × 热度; 强收一次热度 +${r.heatStep}, 每天往 1 回落`,
    `强收只能收没有老板的 ${r.minStar} 星以上的店, 每家每天最多被强收 1 次, 刚到 ${r.minStar} 星的店 ${r.newStarDays} 天内不能被收: 店得 ${r.firstStore}, 并购咨询费 ${r.firstBurn} 销毁, ${r.tax} 是税`,
    `有老板的店只能挂牌转手 (身价的 ${r.listMin}~${r.listMax}): 原老板得 ${r.resaleSeller}, 店得 ${r.resaleStore}, ${r.tax} 是税`,
    `自己 ${r.buyerStar} 星以上、注册满 ${r.buyerDays} 天才能收购; 每天最多买 ${r.buyerPerDay} 家, 名下最多 ${r.maxHoldings} 家`,
    `被收购的店每轮结算让 ${r.cede} 给老板, 老板当天打理过让 ${r.cedeTend}; 前一天的抽成 00:05 发给老板`,
    `老板打理: 付这家店日均的 ${r.tendCost} (销毁), 店之后的结算 × ${r.tendMult}, 日均每满 ${r.packStep} 送店 1 个二级街市补给包 (最多 ${r.packMax} 个)`,
    `老板 ${r.halfDays} 天没打理抽成减半, ${r.stopDays} 天不再抽成, ${r.releaseDays} 天自动放手`,
    `被收购的店可以按基础身价赎身: 老板得 ${r.redeemOwner}, ${r.redeemBurn} 销毁, ${r.tax} 是税; 赎身后 ${r.protectDays} 天内不能被收购`,
  ],
  price: (coin: string) => `身价 ${coin}`,
  heat: (h: string) => `热度 ${h}`,
  owner: (name: string) => `老板: ${name}`,
  free: '自主经营',
  listed: (pct: string, coin: string, left: string) => `挂牌 ${pct}: ${coin} 银币, 还剩 ${left}`,
  protectedLeft: (left: string) => `保护期还剩 ${left}, 期间不能被强收`,
  acquire: '收购',
  buyListed: '买下',
  confirmAcquire: (name: string, coin: string, store: string, burn: string, tax: string) =>
    `花 ${coin} 银币收购「${name}」？\n「${name}」得 ${store} 银币, 并购咨询费 ${burn} 银币销毁, 税 ${tax} 银币。`,
  confirmListed: (name: string, coin: string, seller: string, got: string, store: string, tax: string) =>
    `花 ${coin} 银币按挂牌价买下「${name}」？\n「${seller}」得 ${got} 银币, 「${name}」得 ${store} 银币, 税 ${tax} 银币。`,
  bought: (name: string) => `「${name}」归你了`,
  colHoldings: (n: number) => `名下 ${n} 家`,
  colValue: (coin: string) => `身价合计 ${coin}`,
  colDividend: (coin: string) => `累计抽成 ${coin}`,
  rankEmpty: '还没有店上榜',
  marketEmpty: '现在没有挂牌的店',
  investEmpty: '还没有人收购过餐厅',
  myPrice: '我的身价',
  myPriceSub: (avg: string, mult: string, heat: string) => `日均 ${avg} × ${mult} · 热度 ${heat}`,
  /** 被收购的店看到的一块 */
  ownedTitle: '被收购中',
  ownedSince: (date: string) => `${date} 起`,
  cededToday: '今天已让出',
  ceded30: '近 30 天让出',
  cedeNow: '今天的抽成',
  cedeTended: '老板打理过',
  cedeUntended: '老板还没打理',
  cedeHalf: '老板没打理, 减半',
  cedeStopped: '老板太久没打理',
  tendDays7: '近 7 天老板打理',
  tendDaysVal: (n: number) => `${n} 天`,
  tendedLine: (time: string, mult: string, packs: number) =>
    `老板 ${time} 打理了: 之后每轮结算 × ${mult}${packs > 0 ? `, 送了你 ${packs} 个二级街市补给包` : ''}`,
  untendedLine: (mult: string) => `老板今天还没打理; 打理以后, 之后每轮结算 × ${mult}`,
  redeemBtn: (coin: string) => `赎身 ${coin}`,
  ownedNote: (half: number, stop: number, release: number) =>
    `老板 ${half} 天没打理抽成减半, ${stop} 天不再抽成, ${release} 天自动放手。被收购期间不能收购别的店。`,
  confirmRedeem: (coin: string) => `花 ${coin} 银币赎身？`,
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
    `老板「${owner}」得 ${got} 银币 (${gotPct})\n赎身销毁 ${burn} 银币 (${burnPct})\n税 ${tax} 银币 (${taxPct})\n赎身按基础身价, 不乘热度。赎身后 ${days} 天内不能被收购, 以后结算不再让给老板。`,
  redeem: '赎身',
  redeemed: '赎身成功, 餐厅又自主经营了',
  ownedNoBuy: '被收购期间不能收购别的店',
  holdingsEmpty: '名下还没有店。在身价榜、在售里能收购别人的餐厅。',
  /** 名下的店 */
  pendingTotal: '今天待发抽成',
  pendingSub: '明天 00:05 到账',
  yesterdayTotal: '昨天到账',
  yesterdayPending: '还没发',
  tendAllLine: (n: number, cost: string) => `${n} 家今天还没打理, 一起打理付 ${cost} 银币`,
  allTended: '名下的店今天都打理过了',
  tendAll: '全部打理',
  tendAllDone: (n: number, cost: string) => `打理了 ${n} 家, 共付 ${cost} 银币`,
  holdTended: '今天打理过',
  holdNotTended: '今天没打理',
  holdIdle: (days: number) => `${days} 天没打理`,
  holdSub: (avg: string, rate: string, pending: string) => `日均 ${avg} · 抽成 ${rate} · 今天待发 ${pending}`,
  holdHalfNote: (stopIn: number, releaseIn: number) =>
    `抽成减半; 再 ${stopIn} 天不打理就不再抽成, ${releaseIn} 天后自动放手`,
  holdStopNote: (releaseIn: number) => `已经不再抽成; ${releaseIn} 天后自动放手`,
  tendBtn: (cost: string) => `打理 ${cost}`,
  tendDone: (name: string, cost: string) => `打理了「${name}」, 付了 ${cost} 银币`,
  /** 名下一家的面板 */
  holdSheetSub: (price: string, avg: string) => `身价 ${price} · 日均 ${avg}`,
  tendTitle: '打理',
  tendPay: (pct: string) => `你付 (日均的 ${pct}, 销毁)`,
  tendMultLine: '店今天之后的结算',
  tendPack: '送店',
  tendPackN: (n: number) => `${n} 个二级街市补给包`,
  tendPackNone: (step: string) => `日均不到 ${step}, 不送`,
  tendRate: '你今天的抽成',
  tendSheetBtn: (cost: string) => `打理 (付 ${cost})`,
  tendedSheet: (time: string) => `今天 ${time} 打理过了`,
  tendNote: '从打理那一刻起生效, 越早打理今天抽得越多。',
  list: '挂牌',
  unlist: '撤牌',
  release: '放手',
  listDone: (name: string) => `「${name}」挂牌了`,
  unlistDone: (name: string) => `「${name}」撤牌了`,
  confirmRelease: (name: string) => `放手「${name}」？\n不退钱, 店变回自主经营。`,
  releaseDone: (name: string) => `放手了「${name}」`,
  /** 首页（被收购时）和对方餐厅页的卡片 */
  homeOwned: (name: string) => `你的餐厅归「${name}」所有`,
  homeLink: '让渡、赎身',
  cardTitle: '收购',
  /** 界面改版 P8：整行点开的面板、名下的店面板、规则一行 */
  ownerTag: (name: string) => `老板 ${name}`,
  listedTag: (pct: string) => `挂牌 ${pct}`,
  leftLine: (left: string) => `还剩 ${left}`,
  coinUnit: '银币',
  rulesTitle: '收购规则',
  rulesSub: (cede: string) => `强收只能收没有老板的店; 被收购的店每轮结算让 ${cede} 给老板`,
  holdingsTitle: '名下的店',
  holdCount: (n: number, max: number) => `${n} / ${max} 家`,
  holdHead: (n: number, max: number, left: number) => `${n} / ${max} 家 · 今天还能买 ${left} 家`,
  visit: '去店里看看',
  goMarket: '去在售看看',
  /** 身价榜、在售点开的那家 */
  targetSub: (price: string, avg: string, heat: string) => `身价 ${price} · 日均 ${avg} · 热度 ${heat}`,
  youPay: '你付',
  sellerGot: (name: string, pct: string) => `「${name}」得 (${pct})`,
  burnLine: (pct: string) => `并购咨询费 (${pct}, 销毁)`,
  taxLine: (pct: string) => `税 (${pct})`,
  afterTitle: '收下以后',
  afterCede: '每天抽成约',
  afterCedeVal: (coin: string, pct: string) => `${coin} (${pct})`,
  afterTend: '打理的日子',
  afterTendVal: (pct: string, cost: string) => `${pct}, 付日均的 ${cost}`,
  payback: '回本约',
  paybackVal: (plain: number, tended: number) => `${plain} 天 · 天天打理 ${tended} 天`,
  afterHold: '收购后名下',
  buyNote: (half: number, stop: number, release: number, redeem: string) =>
    `按近 7 天收入算, 店的收入变了抽成跟着变。${half} 天没打理抽成减半, ${stop} 天不再抽成, ${release} 天自动放手。店可以随时赎身, 那时你只拿回赎身价的 ${redeem}。`,
  ownedWhy: '有老板的店不能强收, 只能等老板挂牌后在「在售」里买下。',
  /** 名下一家的挂牌 */
  rateLabel: '按身价的多少挂牌',
  listPrice: '挂牌价',
  listSellerGot: (pct: string) => `卖出后你得 (${pct})`,
  listNote: (days: number) => `有老板的店只能挂牌转手; ${days} 天后自动撤下。挂牌期间店也可以按挂牌价赎身。`,
};
