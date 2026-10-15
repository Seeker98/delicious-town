/** 更新记录、友情链接、顶栏时间（问题记录 348） */
export default {
  changelogTitle: '更新记录',
  linksTitle: '友情链接',
  linksEmpty: '还没有友情链接',
  linksEmptyBody: '做了和小镇有关的网站, 可以到论坛告诉管理员',
  linksLoadFailed: '读取友情链接失败',
  clockTitle: '当前时间 (北京时间)',
  /** 更新记录（界面改版 P11 报刊风） */
  newMark: '新',
  clTotal: (n: number) => `共 ${n} 条`,
  clLatest: (d: string) => `最近 ${d}`,
  clMore: (n: number) => `再看 ${n} 天`,
  /** 标题和说明之间的冒号 */
  clColon: ': ',
  /** 日期写法（界面改版 P11 更新记录、帮助中心）：月、日从 1 开始，星期 0 是周日 */
  monthDay: (m: number, d: number) => `${m} 月 ${d} 日`,
  ymd: (y: number, m: number, d: number) => `${y} 年 ${m} 月 ${d} 日`,
  monthShort: (m: number) => `${m} 月`,
  weekday: (w: number) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][w] ?? '',
  nextRound: (left: string) => `下一轮结算: ${left} 后`,
};
