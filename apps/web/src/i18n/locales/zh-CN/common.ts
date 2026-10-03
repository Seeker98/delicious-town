/** 通用文案（问题记录 272） */
export default {
  loading: '加载中……',
  confirm: '确定',
  cancel: '取消',
  language: '语言',
  loadFailed: '读取失败',
  langLoadFailed: '切换语言失败，请检查网络后再试',
  /** 已切换，但没存到账号（backlog 多语言） */
  langSaveFailed: '语言已切换，但没能保存到账号，下次刷新会回到原来的语言',
  collapse: '收起',
  expand: '展开',
  prevPage: '上一页',
  nextPage: '下一页',
  all: '全部',
  other: '其他',
  opFailed: '操作失败',
  loadMore: '加载更多',
  /** 括号、冒号、分号：各语言写法不同，页面上不写死全角标点（backlog 多语言） */
  paren: (s: string) => `（${s}）`,
  parenOpen: '（',
  parenClose: '）',
  colon: (s: string) => `${s}：`,
  semi: '；',
};
