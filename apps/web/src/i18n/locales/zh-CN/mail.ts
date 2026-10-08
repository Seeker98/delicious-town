/** 邮箱和兑换码（问题记录 272） */
export default {
  title: '邮箱',
  loadFailed: '读取邮箱失败',
  claimFailed: '领取失败',
  deleteFailed: '删除失败',
  claimAllPartial: (claimed: number, failed: number) =>
    `领了 ${claimed} 封, 还有 ${failed} 封没领成, 稍后再试`,
  claimAll: '一键领取',
  empty: '没有邮件',
  claim: '领取',
  delete: '删除',
  daysLeft: (n: number) => ` · 还剩 ${n} 天`,
  needLevel: (n: number) => `· 需 ${n} 级`,
  claimed: '· 已领取',
  broken: '· 附件已失效, 请联系运营',
  items: (text: string) => `附件: ${text}`,
  redeem: {
    placeholder: '输入兑换码',
    label: '兑换码',
    btn: '兑换',
    done: (text: string) => `兑换成功: ${text}`,
    failed: '兑换失败',
  },
};
