import { gameParts } from '@dt/shared';

/** 审计动作的中文名（界面改版 P12 补全：后台和命令行写的每一种动作） */
export const ACTION_LABEL: Record<string, string> = {
  'shard.override': '修改区服数值',
  'shard.rollback': '回滚区服数值',
  'player.ban': '封号',
  'player.unban': '解封',
  'player.role': '修改角色',
  'restaurant.rename': '强制改名',
  'restaurant.icon.grant': '发个性图标',
  'restaurant.icon.revoke': '收回个性图标',
  'grant.create': '发放补偿',
  'grant.mail': '补偿改发邮件',
  'account.password': '玩家改密码',
  'mail.send': '发邮件',
  'mail.revoke': '撤回邮件',
  'code.create': '新建兑换码',
  'code.batch': '批量生成兑换码',
  'code.export': '导出兑换码',
  'code.disable': '停用兑换码',
  'code.enable': '启用兑换码',
  'title.create': '新建称号',
  'title.update': '修改称号',
  'title.delete': '删除称号',
  'announce.create': '新建公告',
  'announce.update': '修改公告',
  'announce.delete': '删除公告',
  'link.create': '新建友情链接',
  'link.update': '修改友情链接',
  'link.delete': '删除友情链接',
  'activity.create': '新建活动',
  'activity.update': '修改活动',
  'activity.end': '结束活动',
  'predict.create': '新建预测',
  'predict.resolve': '预测开奖',
  'predict.void': '预测作废',
  'futures.foods': '修改期货食材',
  'bulk.foods': '修改大宗认购食材',
  'bulk.sync': '同步大宗认购',
  'bulk.cancel': '取消大宗认购',
  'exchange.freeze': '冻结交易',
  'exchange.unfreeze': '解冻交易',
  'exchange.confiscate': '没收交易所挂单',
  'report.resolve': '处理举报',
  'report.reject': '驳回举报',
  'daily.publish': '发布日报',
  'daily.hide': '撤下日报',
  'daily.edit': '修改日报',
  'daily.regenerate': '重写日报',
};

/** 审计动作的颜色（界面改版 P12）：改数值红、处理举报琥珀、角色紫、其他灰 */
export function actionTone(action: string): 'd' | 'w' | 'p' | 'm' {
  if (action.startsWith('shard.')) return 'd';
  if (action.startsWith('report.')) return 'w';
  if (action === 'player.role') return 'p';
  return 'm';
}

/** 封号状态：封到哪天（北京时间“10/15”），没有到期时间就是永久 */
export function banText(until: string | null): string {
  if (!until) return '永久封号';
  const [, m, d] = gameParts(new Date(until)).day.split('-');
  return `封号到 ${Number(m)}/${Number(d)}`;
}

/** 统计图里的来源（流水的 source）写中文（界面改版 P12）：先认完整的名字，再认前缀 */
const SOURCE_EXACT: Record<string, string> = {
  settlement: '结算',
  'settlement.cookfoods': '结算做菜',
  'market.buy': '菜场购买',
  'market.guess': '菜场竞猜',
  'shop.buy': '商店购买',
  'shop.sell': '商店卖出',
  'mail.claim': '领邮件',
  'restaurant.create': '开店',
  'cookbook.learn': '学食谱',
  'equip.salvage': '分解厨具',
  'equip.sell': '卖厨具',
  'town.shake': '摇钱树',
  'icon.buy': '买图标',
  'admin.rename': '后台改名',
};
const SOURCE_PREFIX: Record<string, string> = {
  admin: '后台发放',
  grant: '后台发放',
  acquire: '收购',
  activation: '活跃',
  activity: '活动',
  bar: '酒吧',
  bulk: '大宗认购',
  cookbook: '食谱',
  cupboard: '橱柜',
  dine: '吃白食',
  equip: '厨具',
  exchange: '交易所',
  foods: '换食材',
  forum: '广场',
  friend: '好友',
  fund: '基金',
  futures: '期货',
  invite: '邀请',
  kuji: '一番赏',
  lesson: '课堂',
  mail: '邮件',
  market: '菜场',
  mc: '赛厨',
  mouse: '老鼠',
  oil: '加油',
  predict: '预测',
  redeem: '兑换码',
  report: '举报',
  roach: '蟑螂',
  settlement: '结算',
  shop: '商店',
  signin: '签到',
  store: '仓库',
  takeaway: '外卖',
  task: '任务',
  tower: '厨塔',
  town: '小镇',
  wealth: '理财',
  wishtree: '许愿树',
  yard: '菜园',
};
export function sourceLabel(source: string): string {
  return SOURCE_EXACT[source] ?? SOURCE_PREFIX[source.split('.')[0]!] ?? source;
}

/** 有开始、结束时间的东西（公告、兑换码、活动）现在的状态 */
export function periodText(startsAt: string | null, endsAt: string | null, now = Date.now()): string {
  if (startsAt && Date.parse(startsAt) > now) return '未开始';
  if (endsAt && Date.parse(endsAt) <= now) return '已结束';
  return '进行中';
}
export function periodTone(startsAt: string | null, endsAt: string | null, now = Date.now()): string {
  return periodText(startsAt, endsAt, now) === '进行中' ? 'is-ok' : '';
}
