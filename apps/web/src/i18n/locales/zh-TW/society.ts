// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 協會：升星、油壺擴容、改名、搬家（問題記錄 272） */
export default {
  title: '協會',
  links: {
    star: { label: '升星', desc: '等級、食譜、憑證夠了就能升星' },
    oil: { label: '油壺擴容', desc: '提高油上限, 減少停業' },
    rename: { label: '改名', desc: '需要改名卡' },
    move: { label: '搬家', desc: '換一條街, 街道勳章跟著換' },
  },
  move: {
    title: '搬家',
    hint: (street: string, cost: string) =>
      `現在在 ${street}。需要 1 張搬家卡 (持有搬家處工作證時免), 花費約 ${cost} 銀幣 (幸運時半價)。`,
    pick: '選擇新街道',
    bonus: (desc: string) => `街道加成: ${desc}`,
    option: (name: string, cook: string) => `${name} (${cook})`,
    btn: '搬家',
    done: (street: string) => `已經搬到 ${street}`,
    failed: '搬家失敗',
  },
  oil: {
    title: (level: number, max: string) => `油壺擴容 (當前 ${level} 級, 上限 ${max})`,
    next: (level: number, max: string) => `擴容到 ${level} 級後上限 ${max}`,
    maxed: '已經是最高階',
    btn: '擴容',
    done: '油壺擴容成功',
    failed: '擴容失敗',
  },
  rename: {
    title: '改名',
    hint: '需要 1 張改名卡。新名字最多 9 個字, 只能用中文、字母和數字, 不能和本服其他餐廳重名。',
    placeholder: '新名字',
    btn: '改名',
    done: (name: string) => `已改名為「${name}」`,
    failed: '改名失敗',
  },
  star: {
    title: (star: number) => `升星 (當前 ${star} 星)`,
    notOpen: (star: number) => `${star} 星暫未開放`,
    award: '獎勵: ',
    maxed: '已經是最高星級',
    btn: (star: number) => `升到 ${star} 星`,
    done: (star: number) => `恭喜升到 ${star} 星！`,
    failed: '升星失敗',
  },
  /** 升星、擴容的條件清單 */
  needs: { level: '餐廳等級', star: '星級', cookbooks: '已學食譜', coin: '銀幣' } as Record<string, string>,
  needLine: (label: string, have: string, need: string) => `${label}: ${have} / ${need}`,
};
