// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 特色菜（問題記錄 272） */
export default {
  title: '特色菜',
  temple: '神殿鑑定',
  classroom: '教室',
  /** 介面改版 P7：神殿一行的說明、烹製面板標題 */
  templeSub: '鑑定神秘食譜得到殘卷, 3 張殘卷學會一道',
  cookTitle: (name: string) => `烹製「${name}」`,
  loadFailed: '讀取特色菜失敗',
  groups: {
    learnable: '可以學習',
    short: '殘卷不夠 (3 張學會一道)',
    learned: '已學會的菜 (殘卷可出售或分解)',
  },
  learnedAll: (n: number, names: string) => `學會了 ${n} 道特色菜: ${names}`,
  learnFailed: '學習失敗',
  levelUp: '熟練度升級了',
  bob: '海綿寶寶點了贊',
  cooked: (grade: string, lucky: boolean, num: string, price: string, extra: string) =>
    `烹製完成: ${grade}${lucky ? ' (幸運)' : ''} ${num} 份, 每份 ${price} 銀幣${extra ? `, ${extra}` : ''}`,
  cookFailed: '烹製失敗',
  dumpConfirm: '倒掉後剩下的份數全部作廢, 確定嗎？',
  dumped: '已倒掉',
  dumpFailed: '倒掉失敗',
  needStar: '1 星以後才能鑑定和烹製特色菜。',
  onSale: '在售: ',
  lucky: ' (幸運)',
  saleMeta: (left: string, total: string, price: string, eaten: number) =>
    `剩餘 ${left} / ${total} 份 · 每份 ${price} 銀幣 · 被品嚐 ${eaten} 次`,
  /** 賣給顧客時每份價值的倍率（問題記錄 412）；賽廚等其他地方按原價 */
  saleRate: (rate: string) => ` · 賣給顧客時 ×${rate} (普通顧客付一半)`,
  dump: '倒掉',
  learned: (n: number) => `已學 (${n})`,
  /** 分頁時：這一頁幾道 / 一共幾道 */
  learnedOf: (shown: number, total: number) => `已學 (${shown} / ${total})`,
  noLearned: '還沒有學會特色菜: 在神殿鑑定神秘食譜得到殘卷, 3 張殘卷就能學會。',
  dishMeta: (level: number | undefined, road: string, levelName: string) =>
    `${level ?? '?'} 級 · ${road} · ${levelName}`,
  proficiency: (cur: string, next: string | null) => `熟練度 ${cur}${next ? ` / ${next}` : ' (滿級)'}`,
  cook: '烹製',
  foods: '食材: ',
  cookie: (n: number) => `用幸運餅乾 (每批 1 個, 持有 ${n})`,
  batches: (n: number) => `${n} 批`,
  /** 按級、按道分頁（問題記錄 414） */
  filter: {
    all: '全部',
    allRoads: '全部道',
    level: (n: number) => `${n} 級`,
    count: (label: string, n: number) => `${label} (${n})`,
    none: '這一頁沒有',
    levelLabel: '按等級',
    roadLabel: '按道',
  },
  /** 碎片兌換指定殘卷（問題記錄 415） */
  exchange: {
    title: (n: number) => `碎片兌換: ${n} 張同級碎片換 1 張任選一道的殘卷 (只能選還沒學會、能鑑定出來的)`,
    have: (level: number, n: number) => `${level} 級碎片 ${n} 張`,
    pick: '選一道菜',
    btn: (n: number) => `換 ${n} 張`,
    done: (name: string, n: number) => `換到「${name}」殘卷 ${n} 張`,
    failed: '兌換失敗',
  },
  remnants: '殘卷',
  noRemnants: '沒有殘卷',
  groupTitle: (title: string, n: number) => `${title} (${n})`,
  learnAll: '全部學會',
  learnAllTotal: (n: number) => `全部學會 (含其他頁, 共 ${n} 道)`,
  remnantMeta: (level: number | undefined, road: string, coin: string) =>
    `${level ?? '?'} 級 · ${road} · 單價 ${coin}`,
  short: (n: number) => ` · 還差 ${n} 張`,
  learnedName: (name: string) => `學會了${name}`,
  learn: '學習',
  sold: '已出售',
  sellFailed: '出售失敗',
  sell: '出售',
  decomposed: '已分解',
  decomposeFailed: '分解失敗',
  decompose: '分解',
  /** 時令（天氣改版 PR②）：已學列表標當令、在售標應時、下鍋面板寫現在下鍋是否應時 */
  season: {
    now: (roads: string) => `現在當令: ${roads}`,
    roadTag: (road: string) => `${road} · 當令`,
    shiling: '應時',
    pts: (n: string) => ` · 已攢時令值 +${n}`,
    note: '在售那一批是下鍋時定的: 中途換天, 應時不變。',
    yes: '現在下鍋應時',
    yesText: (weather: string, road: string) =>
      ` · ${weather}, ${road}當令。整批賣完前顧客吃掉的每份都攢時令值。`,
    no: '現在下鍋不應時',
    noText: (
      road: string,
      weather: string,
      roads: string,
      hour: number,
      type: string,
      same: boolean,
      sure: boolean,
    ) =>
      ` · ${road}, ${weather}當令的是${roads}。${hour} 點換天, 預報${sure ? '多半' : '可能'}${same ? '還是' : '轉'}${type}。`,
  },
};
