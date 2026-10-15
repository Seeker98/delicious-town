// 接口输入的上限：服务端校验和网页提前拦共用（不带 zod，免得 zod 打进网页）

/** 补偿、邮件附件每项的上限 */
export const GRANT_LIMITS = { coin: 100_000_000, exp: 100_000_000, diamond: 100_000, item: 9999 } as const;

/** 邮件里命名帽子的名字长度、一封最多几顶 */
export const HAT_NAME_MAX = 8;
export const MAIL_HATS_MAX = 5;

/** 出价的单价上限（网页提前拦，backlog 大宗认购） */
export const BULK_PRICE_MAX = 1_000_000_000;

/** 友情链接（问题记录 348）：后台维护，游戏里“更多”能看到 */
export const LINK_NAME_MAX = 20;
export const LINK_NOTE_MAX = 60;
export const LINK_URL_MAX = 300;

/** 菜场一次最多买几个（接口校验；网页的“最多”也不超过它） */
export const MARKET_BUY_MAX = 1000;

/** 用户名：2~9 个字母、数字、下划线、减号或汉字 */
export const USERNAME_RE = /^[A-Za-z0-9_\-一-龥]{2,9}$/;
