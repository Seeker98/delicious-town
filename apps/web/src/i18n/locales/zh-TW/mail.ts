// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 郵箱和兌換碼（問題記錄 272） */
export default {
  title: '郵箱',
  loadFailed: '讀取郵箱失敗',
  claimFailed: '領取失敗',
  deleteFailed: '刪除失敗',
  claimAllPartial: (claimed: number, failed: number) =>
    `領了 ${claimed} 封，還有 ${failed} 封沒領成，稍後再試`,
  claimAll: '一鍵領取',
  empty: '沒有郵件',
  claim: '領取',
  delete: '刪除',
  daysLeft: (n: number) => ` · 還剩 ${n} 天`,
  needLevel: (n: number) => `· 需 ${n} 級`,
  claimed: '· 已領取',
  broken: '· 附件已失效，請聯絡運營',
  items: (text: string) => `附件: ${text}`,
  redeem: {
    placeholder: '輸入兌換碼',
    label: '兌換碼',
    btn: '兌換',
    done: (text: string) => `兌換成功: ${text}`,
    failed: '兌換失敗',
  },
};
