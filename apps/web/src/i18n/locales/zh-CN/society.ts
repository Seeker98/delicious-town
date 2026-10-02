/** 协会：升星、油壶扩容、改名、搬家（问题记录 272） */
export default {
  title: '协会',
  links: {
    star: { label: '升星', desc: '等级、食谱、凭证够了就能升星' },
    oil: { label: '油壶扩容', desc: '提高油上限，减少停业' },
    rename: { label: '改名', desc: '需要改名卡' },
    move: { label: '搬家', desc: '换一条街，街道勋章跟着换' },
  },
  move: {
    title: '搬家',
    hint: (street: string, cost: string) =>
      `现在在 ${street}。需要 1 张搬家卡（持有搬家处工作证时免），花费约 ${cost} 银币（幸运时半价）。`,
    pick: '选择新街道',
    option: (name: string, cook: string) => `${name}（${cook}）`,
    btn: '搬家',
    done: (street: string) => `已经搬到 ${street}`,
    failed: '搬家失败',
  },
  oil: {
    title: (level: number, max: string) => `油壶扩容（当前 ${level} 级，上限 ${max}）`,
    next: (level: number, max: string) => `扩容到 ${level} 级后上限 ${max}`,
    maxed: '已经是最高级',
    btn: '扩容',
    done: '油壶扩容成功',
    failed: '扩容失败',
  },
  rename: {
    title: '改名',
    hint: '需要 1 张改名卡。新名字最多 9 个字，只能用中文、字母和数字，不能和本服其他餐厅重名。',
    placeholder: '新名字',
    btn: '改名',
    done: (name: string) => `已改名为「${name}」`,
    failed: '改名失败',
  },
  star: {
    title: (star: number) => `升星（当前 ${star} 星）`,
    notOpen: (star: number) => `${star} 星暂未开放`,
    award: '奖励：',
    maxed: '已经是最高星级',
    btn: (star: number) => `升到 ${star} 星`,
    done: (star: number) => `恭喜升到 ${star} 星！`,
    failed: '升星失败',
  },
  /** 升星、扩容的条件清单 */
  needs: { level: '餐厅等级', star: '星级', cookbooks: '已学食谱', coin: '银币' } as Record<string, string>,
  needLine: (label: string, have: string, need: string) => `${label}：${have} / ${need}`,
};
