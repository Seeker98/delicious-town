// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 食譜列表和詳情（問題記錄 272） */
export default {
  filters: { all: '全部', learnable: '可學', upgradable: '可升級', unlearned: '未學', learned: '已學' },
  loadFailed: '讀取食譜失敗',
  streetDesc: (desc: string) => `街道加成：${desc}`,
  moveHint: (star: number, need: string, gap: string) =>
    `本街剩下的菜全學會，也湊不夠升 ${star} 星要的 ${need} 道（還差 ${gap} 道）。本街學得差不多、幾天學不到新菜時，就換一條菜多的街。`,
  moveLink: '去搬家',
  /** 搬街提示關掉，到下一星前不再顯示（backlog 384） */
  moveHintClose: '本星不再提示',
  learnFailed: '學習失敗',
  maxed: '已滿級',
  lackFoods: '食材不夠',
  otherStreet: (street: string) => `搬到${street}才能學`,
  learn: '學習',
  upgrade: '升級',
  useMaster: (level: string) => `用${level}級萬能食材`,
  counts: (streetLearned: number, streetTotal: number, learned: string, total: string) =>
    `本街已學 ${streetLearned}/${streetTotal} · 共學會 ${learned} / ${total} 道`,
  info: (street: string, level: number, taste: string, coin: string) =>
    `${street} · 難度 ${level} · 口味 ${taste} · 售價 ${coin}`,
  grade: '品級',
  foodsNeeded: '所需食材',
};
