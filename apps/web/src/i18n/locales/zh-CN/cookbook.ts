/** 食谱列表和详情（问题记录 272） */
export default {
  filters: { all: '全部', learnable: '可学', upgradable: '可升级', unlearned: '未学', learned: '已学' },
  loadFailed: '读取食谱失败',
  streetDesc: (desc: string) => `街道特点：${desc}`,
  learnFailed: '学习失败',
  maxed: '已满级',
  lackFoods: '食材不够',
  otherStreet: (street: string) => `搬到${street}才能学`,
  learn: '学习',
  upgrade: '升级',
  useMaster: (level: string) => `用${level}级万能食材`,
  counts: (streetLearned: number, streetTotal: number, learned: string, total: string) =>
    `本街已学 ${streetLearned}/${streetTotal} · 共学会 ${learned} / ${total} 道`,
  info: (street: string, level: number, taste: string, coin: string) =>
    `${street} · 难度 ${level} · 口味 ${taste} · 售价 ${coin}`,
  grade: '品级',
  foodsNeeded: '所需食材',
};
