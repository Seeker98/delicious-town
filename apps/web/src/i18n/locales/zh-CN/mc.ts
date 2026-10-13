/** 特色菜（问题记录 272） */
export default {
  title: '特色菜',
  temple: '神殿鉴定',
  classroom: '教室',
  /** 界面改版 P7：神殿一行的说明、烹制面板标题 */
  templeSub: '鉴定神秘食谱得到残卷, 3 张残卷学会一道',
  cookTitle: (name: string) => `烹制「${name}」`,
  loadFailed: '读取特色菜失败',
  groups: {
    learnable: '可以学习',
    short: '残卷不够 (3 张学会一道)',
    learned: '已学会的菜 (残卷可出售或分解)',
  },
  learnedAll: (n: number, names: string) => `学会了 ${n} 道特色菜: ${names}`,
  learnFailed: '学习失败',
  levelUp: '熟练度升级了',
  bob: '海绵宝宝点了赞',
  cooked: (grade: string, lucky: boolean, num: string, price: string, extra: string) =>
    `烹制完成: ${grade}${lucky ? ' (幸运)' : ''} ${num} 份, 每份 ${price} 银币${extra ? `, ${extra}` : ''}`,
  cookFailed: '烹制失败',
  dumpConfirm: '倒掉后剩下的份数全部作废, 确定吗？',
  dumped: '已倒掉',
  dumpFailed: '倒掉失败',
  needStar: '1 星以后才能鉴定和烹制特色菜。',
  onSale: '在售: ',
  lucky: ' (幸运)',
  saleMeta: (left: string, total: string, price: string, eaten: number) =>
    `剩余 ${left} / ${total} 份 · 每份 ${price} 银币 · 被品尝 ${eaten} 次`,
  /** 卖给顾客时每份价值的倍率（问题记录 412）；赛厨等其他地方按原价 */
  saleRate: (rate: string) => ` · 卖给顾客时 ×${rate}`,
  /** 普通顾客按比例点（特色菜卖法 2026-10-13）：比例、价钱都是区服数值 */
  normalSale: (share: string, price: string) => ` · 普通顾客约 ${share} 的桌点, 每份付 ${price}`,
  dump: '倒掉',
  learned: (n: number) => `已学 (${n})`,
  /** 分页时：这一页几道 / 一共几道 */
  learnedOf: (shown: number, total: number) => `已学 (${shown} / ${total})`,
  noLearned: '还没有学会特色菜: 在神殿鉴定神秘食谱得到残卷, 3 张残卷就能学会。',
  dishMeta: (level: number | undefined, road: string, levelName: string) =>
    `${level ?? '?'} 级 · ${road} · ${levelName}`,
  proficiency: (cur: string, next: string | null) => `熟练度 ${cur}${next ? ` / ${next}` : ' (满级)'}`,
  cook: '烹制',
  foods: '食材: ',
  cookie: (n: number) => `用幸运饼干 (每批 1 个, 持有 ${n})`,
  batches: (n: number) => `${n} 批`,
  /** 按级、按道分页（问题记录 414） */
  filter: {
    all: '全部',
    allRoads: '全部道',
    level: (n: number) => `${n} 级`,
    count: (label: string, n: number) => `${label} (${n})`,
    none: '这一页没有',
    levelLabel: '按等级',
    roadLabel: '按道',
  },
  /** 碎片兑换指定残卷（问题记录 415） */
  exchange: {
    title: (n: number) => `碎片兑换: ${n} 张同级碎片换 1 张任选一道的残卷 (只能选还没学会、能鉴定出来的)`,
    have: (level: number, n: number) => `${level} 级碎片 ${n} 张`,
    pick: '选一道菜',
    btn: (n: number) => `换 ${n} 张`,
    done: (name: string, n: number) => `换到「${name}」残卷 ${n} 张`,
    failed: '兑换失败',
  },
  remnants: '残卷',
  noRemnants: '没有残卷',
  groupTitle: (title: string, n: number) => `${title} (${n})`,
  learnAll: '全部学会',
  learnAllTotal: (n: number) => `全部学会 (含其他页, 共 ${n} 道)`,
  remnantMeta: (level: number | undefined, road: string, coin: string) =>
    `${level ?? '?'} 级 · ${road} · 单价 ${coin}`,
  short: (n: number) => ` · 还差 ${n} 张`,
  learnedName: (name: string) => `学会了${name}`,
  learn: '学习',
  sold: '已出售',
  sellFailed: '出售失败',
  sell: '出售',
  decomposed: '已分解',
  decomposeFailed: '分解失败',
  decompose: '分解',
  /** 时令（天气改版 PR②）：已学列表标当令、在售标应时、下锅面板写现在下锅是否应时 */
  season: {
    now: (roads: string) => `现在当令: ${roads}`,
    roadTag: (road: string) => `${road} · 当令`,
    shiling: '应时',
    pts: (n: string) => ` · 已攒时令值 +${n}`,
    note: '在售那一批是下锅时定的: 中途换天, 应时不变。',
    yes: '现在下锅应时',
    yesText: (weather: string, road: string) =>
      ` · ${weather}, ${road}当令。整批卖完前顾客吃掉的每份都攒时令值。`,
    no: '现在下锅不应时',
    noText: (
      road: string,
      weather: string,
      roads: string,
      hour: number,
      type: string,
      same: boolean,
      sure: boolean,
    ) =>
      ` · ${road}, ${weather}当令的是${roads}。${hour} 点换天, 预报${sure ? '多半' : '可能'}${same ? '还是' : '转'}${type}。`,
  },
};
