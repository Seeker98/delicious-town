// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 通用文案（問題記錄 272） */
export default {
  loading: '載入中……',
  confirm: '確定',
  cancel: '取消',
  close: '關閉',
  decrease: '減少',
  increase: '增加',
  /** 步進器中間數字框的讀屏名字（沒傳 label 時，backlog P3） */
  quantity: '數量',
  language: '語言',
  appearance: '外觀',
  themeSystem: '跟隨系統',
  themeLight: '淺色',
  themeDark: '深色',
  /** 語言面板裡每種語言下面的小字（介面改版 P11）：用現在的語言再寫一遍 */
  langNames: { 'zh-CN': '簡體中文', 'zh-TW': '繁體中文', en: '英語', fr: '法語', es: '西班牙語' } as Record<
    string,
    string
  >,
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
  /** 等級環的讀屏文字（介面改版 P5） */
  levelRing: (level: number, pct: number) => `等級 ${level}, 經驗 ${pct}%`,
};
