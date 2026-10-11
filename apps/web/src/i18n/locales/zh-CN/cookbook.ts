/** 食谱列表和详情（问题记录 272） */
export default {
  filters: { all: '全部', learnable: '可学', upgradable: '可升级', unlearned: '未学', learned: '已学' },
  loadFailed: '读取食谱失败',
  streetDesc: (desc: string) => `街道加成: ${desc}`,
  moveHint: (star: number, need: string, gap: string) =>
    `本街剩下的菜全学会, 也凑不够升 ${star} 星要的 ${need} 道 (还差 ${gap} 道)。本街学得差不多、几天学不到新菜时, 就换一条菜多的街。`,
  moveLink: '去搬家',
  /** 搬街提示关掉，到下一星前不再显示（backlog 384） */
  moveHintClose: '本星不再提示',
  learnFailed: '学习失败',
  maxed: '已满级',
  lackFoods: '食材不够',
  otherStreet: (street: string) => `搬到${street}才能学`,
  learn: '学习',
  upgrade: '升级',
  useMaster: (level: string) => `用 ${level} 级万能`,
  /** 街道下拉框的读屏名（界面改版 P7） */
  streetPick: '换街道',
  counts: (streetLearned: number, streetTotal: number, learned: string, total: string) =>
    `本街已学 ${streetLearned}/${streetTotal} · 共学会 ${learned} / ${total} 道`,
  info: (street: string, level: number, taste: string, coin: string) =>
    `${street} · 难度 ${level} · 口味 ${taste} · 售价 ${coin}`,
  grade: '品级',
  foodsNeeded: '所需食材',
  /** 界面改版 P7：食谱详情的说明、“有几个”、几个品级并成一行 */
  missNote: '红色是不够的',
  haveShort: (n: number) => `有 ${n}`,
  gradeRange: (from: string, to: string) => `${from}~${to}`,
  /** 食谱进度一览（问题记录：食谱页加进度一览） */
  progress: {
    link: '进度一览',
    back: '返回食谱',
    summary: (grade: string, n: string, total: string, pct: string) =>
      `${grade}及以上: ${n} / ${total} (${pct})`,
    note: '每格是这一品级及以上的道数；当前所在的街高亮, 学满的标绿。',
    /** 界面改版 P7：街道表格上面的小标题 */
    byStreet: '各条街',
    street: '街道',
    all: '全部',
    loadFailed: '读取食谱进度失败',
  },
};
