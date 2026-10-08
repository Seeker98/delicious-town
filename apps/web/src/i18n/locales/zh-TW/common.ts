// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 通用文案（問題記錄 272） */
export default {
  loading: '載入中……',
  confirm: '確定',
  cancel: '取消',
  language: '語言',
  loadFailed: '讀取失敗',
  langLoadFailed: '切換語言失敗, 請檢查網路後再試',
  offline: '網路斷了, 連上後再點一次',
  /** 已切換，但沒存到賬號（backlog 多語言） */
  langSaveFailed: '語言已切換, 但沒能儲存到賬號, 下次重新整理會回到原來的語言',
  collapse: '收起',
  expand: '展開',
  prevPage: '上一頁',
  nextPage: '下一頁',
  all: '全部',
  other: '其他',
  opFailed: '操作失敗',
  loadMore: '載入更多',
  /** 括號、冒號、分號：各語言寫法不同，頁面上不寫死全形標點（backlog 多語言） */
  paren: (s: string) => ` (${s})`,
  /** 名字×數量（backlog #116：法文兩邊加空格） */
  qty: (name: string, num: string | number) => `${name}×${num}`,
  /** 名字和數量分開渲染時中間的乘號（名字是連結時） */
  times: '×',
  parenOpen: ' (',
  parenClose: ')',
  colon: (s: string) => `${s}: `,
  semi: '；',
};
