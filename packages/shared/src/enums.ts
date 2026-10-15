// 服务端和网页共用的取值（不带 zod，免得 zod 打进网页）

/** 赞助帽子档次的前缀（设计 §5）；放在 shared，服务端和前端共用 */
export const HAT_PREFIX = { jade: '玉', xuan: '铉' } as const;
export type HatTierKey = keyof typeof HAT_PREFIX;

/** 论坛（子项目 4E-3） */
export const FORUM_CATEGORIES = ['chat', 'guide', 'feedback'] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export const FORUM_TABS = ['all', 'chat', 'guide', 'feedback', 'featured'] as const;
export type ForumTab = (typeof FORUM_TABS)[number];

/** 举报的对象和原因；中文名给后台看 */
export const REPORT_TARGETS = ['post', 'reply', 'broadcast', 'rest_name', 'notice'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const REPORT_TARGET_NAMES: Record<ReportTarget, string> = {
  post: '帖子',
  reply: '回复',
  broadcast: '喇叭',
  rest_name: '店名',
  notice: '店铺公告',
};
export const REPORT_REASONS = ['abuse', 'porn', 'ad', 'politics', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_NAMES: Record<ReportReason, string> = {
  abuse: '辱骂',
  porn: '色情',
  ad: '广告',
  politics: '政治',
  other: '其他',
};

/** 可疑成交的标记（156-2 设计 §4） */
export const EXCHANGE_FLAGS = {
  same_ip: '同 IP',
  edge_price: '价格贴边',
  repeat_pair: '反复对倒',
  large: '大额',
} as const;
export type ExchangeFlag = keyof typeof EXCHANGE_FLAGS;

/** 付钱的顾客类型：普通、挑剔、章鱼哥、痞老板、蟹老板（不算空桌、蟑螂、白食）；结算和收益记录的“客人”列共用 */
export const PAYING_CUSTOMERS: readonly number[] = [1, 2, 6, 7, 8];
