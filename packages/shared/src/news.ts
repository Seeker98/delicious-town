/** 小镇广播的新闻类型 */
export const BROADCAST_NEWS = 'town.broadcast';

/** 按广播醒目显示的新闻：玩家喇叭、一番赏大赏（一番赏设计 §6）、猜酒杯通关等；首页和小镇新闻共用，两处一致 */
export const BROADCAST_STYLE_NEWS: readonly string[] = [
  BROADCAST_NEWS,
  'kuji.big',
  'fund.big',
  'bar.cup.big',
  'wishtree.win',
];
export const isBroadcastStyle = (type: string): boolean => BROADCAST_STYLE_NEWS.includes(type);

/** 代码里会写入的全部新闻类型；前端 utils/news.ts 必须为每一种写文案（types.test 钉住） */
export const NEWS_TYPES: readonly string[] = [
  // 成就全服首达（成就系统 2026-10-19）
  'achieve.first',
  'acquire.big',
  'acquire.redeem',
  'activity.coopRank',
  'bar.cup',
  'bar.cup.big',
  'bar.fg',
  'bar.num',
  'bar.slot',
  'bar.devil',
  'bar.memory',
  'bar.spice',
  'bar.deal',
  'bar.darts',
  'equip.stress',
  'friend.weekly',
  'gem.broken',
  'gem.levelUp',
  'market.restock',
  'market.manual',
  // 嘻哈男孩已删（天气改版 PR③）：旧新闻还在库里，留着让网页能显示
  'hiphop.event',
  'hiphop.krab',
  'hiphop.weekly',
  'shiling.weekly',
  'forum.pin',
  'forum.feature',
  'mc.champion',
  'mc.cook',
  'oil.expand',
  'plankton.appear',
  'plankton.driven',
  'rest.move',
  'rest.rename',
  'restaurant.open',
  'shop.special',
  'star.up',
  'takeaway.customer',
  'temple.explore.rare',
  'temple.guardian.rare',
  'tower.rank.week',
  'tower.shop.rare',
  'tower.elder',
  'weather.change',
  /** 司天罗盘、晴雨签改了天气（天气改版） */
  'weather.tool',
  'town.broadcast',
  'town.bless',
  'town.shake.lucky',
  'town.exchange',
  'kuji.big',
  'kuji.win',
  'fund.big',
  'fund.deposit',
  'predict.result',
  'bulk.deal',
  'wishtree.win',
  'icon.buy',
  /** 小镇委员会的公报（后台发） */
  'commission.notice',
];
