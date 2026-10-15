// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 更新記錄、友情連結、頂欄時間（問題記錄 348） */
export default {
  changelogTitle: '更新記錄',
  linksTitle: '友情連結',
  linksEmpty: '還沒有友情連結',
  linksEmptyBody: '做了和小鎮有關的網站, 可以到論壇告訴管理員',
  linksLoadFailed: '讀取友情連結失敗',
  clockTitle: '當前時間 (北京時間)',
  /** 更新記錄（介面改版 P11 報刊風） */
  newMark: '新',
  clTotal: (n: number) => `共 ${n} 條`,
  clLatest: (d: string) => `最近 ${d}`,
  clMore: (n: number) => `再看 ${n} 天`,
  /** 標題和說明之間的冒號 */
  clColon: ': ',
  /** 日期寫法（介面改版 P11 更新記錄、幫助中心）：月、日從 1 開始，星期 0 是週日 */
  monthDay: (m: number, d: number) => `${m} 月 ${d} 日`,
  ymd: (y: number, m: number, d: number) => `${y} 年 ${m} 月 ${d} 日`,
  monthShort: (m: number) => `${m} 月`,
  weekday: (w: number) => ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][w] ?? '',
  nextRound: (left: string) => `下一輪結算: ${left} 後`,
};
