import type { RestLogDto } from '@dt/shared';
import type { Names } from '../../../utils/events';
import { formatNum } from '../../../utils/format';
import fund from './fund';
import { n, table, type P } from '../../helpers';

/** 得失提示、个人日志、好友动态的文案（问题记录 272） */
type LogFn = (p: P, names: Names) => string;
const logs = table<LogFn>();
const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `特色菜${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `种子${id}`;
/** 可疑成交的所得进冷静期（156-2） */
/** 冻结几小时：日志里带 holdHours（backlog 156-2），旧日志没有时是 24 */
const holdHours = (p: P) => (p.holdHours === undefined ? 24 : n(p, 'holdHours'));
const heldNote = (p: P) => (p.held ? ` (可疑成交, 所得冻结 ${holdHours(p)} 小时)` : '');
/** 银币和食材清单：交易所取出、没收共用 */
const coinFoods = (p: P, names: Names, coin: (s: string) => string, sep: string) =>
  [
    ...(n(p, 'coin') > 0 ? [coin(formatNum(n(p, 'coin')))] : []),
    ...(Array.isArray(p.foods) ? p.foods : []).map(
      (f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`,
    ),
  ].join(sep);
/** 事件合约结算日志带净投入时写出本局盈亏（问题记录 254） */
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `, 本局盈亏 ${d > 0 ? '+' : ''}${formatNum(d)}`;
}

/** 好友动态的一行文案（服务端只存结构化参数） */
function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? '有人');
  switch (item.type) {
    case 'takeaway.hired':
      return `${who} 雇你当了外卖骑手`;
    case 'dine.start':
      return `${who} 在你店里第 ${String(p.table)} 桌白食`;
    case 'dine.expelled':
      return `${who} 把你请出了店, 你赔了 ${String(p.coin)} 银币`;
    case 'roach.laid':
      return `${who} 在你店里第 ${String(p.table)} 桌放了一只蟑螂`;
    case 'roach.killed':
      return `${who} 帮你消灭了第 ${String(p.table)} 桌的蟑螂`;
    case 'friend.refuel':
      return `${who} 帮你加了 ${String(p.oil)} 油`;
    case 'friend.flip':
      if (p.outcome === 'food') return `${who} 翻了你的橱柜, 拿走了 ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught') return `${who} 翻你的橱柜被老鼠夹夹住, 掉了 ${String(p.coin)} 银币给你`;
      return `${who} 翻了你的橱柜, 什么也没拿到`;
    case 'exchange':
      return p.result === 'caught' ? `${who} 偷换你锁定的食材被抓住了` : `${who} 和你交换了食材`;
    case 'mc.eaten':
      return `${who} 品尝了你的特色菜`;
    case 'lesson.taught':
      if (!p.success) return `${who} 在你的课上${p.type === 2 ? '偷学失败' : '没学会'}`;
      return `${who} 在你的课上${p.type === 2 ? '偷学成功' : '学会了特色菜'}`;
    case 'forum.replied':
      return p.toFloor
        ? `${who} 回复了你在「${String(p.title ?? '')}」的 #${String(p.toFloor)}`
        : `${who} 回复了你的帖子「${String(p.title ?? '')}」`;
    case 'thumb':
      return `${who} 给你点了赞`;
    case 'friend.apply':
      return `${who} 申请加你为好友`;
    case 'yard.helped': {
      const what = p.what === 'weed' ? '除了草' : p.what === 'deworm' ? '除了虫' : '浇了水';
      return `${who} 帮你的${foodName(Number(p.foodsId))}${what}`;
    }
    case 'yard.stolen': {
      const caught = p.punished ? `, 被边牧逮住, 留下了 ${foodName(Number(p.punished))}` : '';
      return `${who} 偷走了你的 ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
    case 'friend.accept':
      return `${who} 同意了你的好友申请`;
    default:
      return item.type;
  }
}

export default {
  gain: '获得',
  loss: '消耗',
  /** 得失的资源名 */
  kind: {
    coin: '银币',
    diamond: '钻石',
    exp: '经验',
    renown: '声望',
    oil: '油',
    strength: '体力',
  },
  remnant: (names: Names, id: number) => `${mcNameOf(names, id)}残卷`,
  seed: (names: Names, id: number) => seedNameOf(names, id),
  basket: (name: string) => `菜篮·${name}`,
  activityCurrency: (name: string | undefined, num: string) => `${name ?? '活动货币'}×${num} (活动货币)`,
  lucky: ' (幸运)',
  /** 列表分隔：同类之间、得失之间 */
  sep: '、',
  groupSep: '；',
  more: (text: string, count: number) => `${text} 等 ${count} 项`,
  logs: logs({
    'mc.learn': (p, names) => `学会了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
    'mc.levelUp': (p, names) => `「${mcNameOf(names, n(p, 'mcId'))}」熟练度升到 ${n(p, 'curlevel')} 级`,
    'mc.forget': (p, names) => {
      const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
      const lost = typeof p.lost === 'number' ? p.lost : 0;
      if (typeof p.grades === 'number')
        return `偷学失败, ${k} 道食谱降了 ${p.grades} 品${lost > 0 ? `, 其中 ${lost} 道忘了` : ''}${p.mcId ? `, 还忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
      return `偷学失败, 遗忘了 ${k} 道食谱${p.mcId ? `和特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
    },
    'temple.trial': (p, names) =>
      p.success
        ? `「${mcNameOf(names, n(p, 'mcId'))}」试炼成功: 试炼价值 +${n(p, 'worth')}%、试炼经验 +${n(p, 'exp')}%`
        : `「${mcNameOf(names, n(p, 'mcId'))}」试炼失败`,
    'kraken.forget': (p, names) => `克拉肯很不满意, 你遗忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
    'equip.stress': (p, names) =>
      `${names.goodsName(n(p, 'goodsId'))}强化到 +${n(p, 'to')}${p.success ? '成功' : '失败'}`,
    'level.up': (p) => `餐厅升到了 ${n(p, 'to')} 级`,
    'star.up': (p) => `餐厅升到了 ${n(p, 'star')} 星`,
    'oil.expand': (p) => `油壶扩容到 ${n(p, 'level')} 级 (上限 ${formatNum(n(p, 'oilMax'))})`,
    'rest.closed': () => '油用光了, 餐厅停业',
    'rest.reopen': () => '加满了油, 餐厅恢复营业',
    'rest.rename': (p) => `餐厅改名为「${String(p.to ?? '')}」`,
    'rest.move': () => '餐厅搬家了',
    'mouse.escape': () => '老鼠来了, 幸运地躲过一劫',
    'mouse.trap': (p) => `捕鼠夹抓到了老鼠, 得到 ${formatNum(n(p, 'coin'))} 银币`,
    'mouse.steal': (p, names) => `老鼠偷走了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'mouse.nothing': () => '老鼠来了, 什么也没偷到',
    'mouse.map': () => '老鼠留下了一张探险图',
    'krab.happy': () => '蟹老板吃得很满意, 回味无穷',
    'krab.angry': () => '蟹老板扫兴而归',
    'krab.husky': () => '蟹老板摸了摸二哈, 没有生气',
    'krab.painting': () => '蟹老板欣赏名画, 心满意足',
    'krab.driven': () => '赶走了生气的蟹老板',
    'plankton.appear': () => '痞老板来店里了',
    'plankton.driven': () => '赶走了痞老板',
    'fridge.drop': (p, names) => `冰箱满了, 丢掉了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'goods.drop': (p, names) => `超过持有上限, 丢掉了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'device.place': (p, names) => `摆放了 ${names.goodsName(n(p, 'goodsId'))}`,
    'store.use': (p, names) => `使用了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'admin.grant': (p) => `系统补偿: ${String(p.reason ?? '')}`,
    redeem: (p) => `使用了兑换码 ${String(p.code ?? '')}`,
    // 问题记录 154：以下类型原来显示英文类型名
    'bar.darts': (p) => `酒吧飞镖${p.result === 'win' ? '赢了' : p.result === 'draw' ? '打平' : '输了'}`,
    'bar.devil': (p) =>
      p.result === 'win'
        ? `魔鬼辣杯撑过 ${n(p, 'survived')} 杯, 赢了`
        : `魔鬼辣杯撑过 ${n(p, 'survived')} 杯, 倒下了`,
    'bar.memory': (p) => `记忆调酒第 ${n(p, 'level')} 关${p.correct ? '调对了' : '没调对'}`,
    'bar.nim': (p) =>
      `最后一颗糖 (${p.table === 'expert' ? '高手桌' : '新手桌'}) ${p.result === 'win' ? '赢了' : '输了'}`,
    'bar.cup': (p) =>
      p.result === 'lose'
        ? `猜酒杯第 ${n(p, 'round')} 轮猜错了`
        : p.result === 'clear'
          ? `猜酒杯 ${n(p, 'round')} 轮全部猜中, 得到 ${n(p, 'awards')} 份奖励`
          : `猜酒杯闯过 ${n(p, 'round')} 轮后收手, 得到 ${n(p, 'awards')} 份奖励`,
    'bar.spice': (p) =>
      p.result === 'win' ? `秘制调料第 ${n(p, 'tries')} 次猜中了` : `秘制调料 ${n(p, 'tries')} 次都没猜中`,
    'bar.deal': (p, names) =>
      p.result === 'deal'
        ? `一掷千金成交, 得到 ${formatNum(n(p, 'coin'))} 银币`
        : `一掷千金打开自己的箱子, 得到${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    // 收购（问题记录 421）
    'acquire.bought': (p) =>
      `花 ${formatNum(n(p, 'price'))} 银币${p.way === 'listed' ? '买下了挂牌的' : '收购了'}「${String(p.name ?? '')}」`,
    'acquire.taken': (p) => `「${String(p.byName ?? '')}」花 ${formatNum(n(p, 'price'))} 银币收购了你的餐厅`,
    'acquire.sold': (p) =>
      `名下的「${String(p.name ?? '')}」被「${String(p.to ?? '')}」买走, 你得到 ${formatNum(n(p, 'got'))} 银币`,
    'acquire.redeemed': (p) =>
      `花 ${formatNum(n(p, 'price'))} 银币从「${String(p.from ?? '')}」手里赎回了自己的餐厅`,
    'acquire.lost': (p) => `「${String(p.name ?? '')}」赎回了自己, 你得到 ${formatNum(n(p, 'got'))} 银币`,
    'acquire.released': (p) => `放手了名下的「${String(p.name ?? '')}」`,
    'acquire.freed': (p) => `「${String(p.byName ?? '')}」放手了你的餐厅, 你又自主经营了`,
    'acquire.dividend': (p) => `昨天名下 ${n(p, 'n')} 家店分红共 ${formatNum(n(p, 'coin'))} 银币`,
    'acquire.tended': (p) => `替老板「${String(p.ownerName ?? '')}」打理了餐厅, 得到 ${n(p, 'n')} 份食材`,
    'dine.started': (p) => `去「${String(p.hostName ?? '')}」白食`,
    'dine.ended': (p) => `在「${String(p.hostName ?? '')}」白食结束`,
    /** 白食者吃完走了（店主那边，问题记录 553）；店主得到的道具或银币写在后面（565） */
    'dine.left': (p, names) => {
      const a = (p.award ?? null) as { kind?: string; id?: number | null; num?: number } | null;
      const got = !a?.num
        ? ''
        : a.kind === 'goods'
          ? `, 你得到了 ${names.goodsName(Number(a.id))}×${a.num}`
          : `, 你得到了 ${formatNum(a.num)} 银币`;
      return `${String(p.byName ?? '有人')} 在你店里第 ${n(p, 'table')} 桌吃完白食走了, 吃走了 ${formatNum(n(p, 'coin'))} 银币${got}`;
    },
    'forum.post': (p) => `在论坛发了帖子 #${n(p, 'postId')}`,
    'forum.reply': (p) => `回复了论坛帖子 #${n(p, 'postId')}`,
    'forum.edit': (p) => `编辑了论坛帖子 #${n(p, 'postId')}`,
    'forum.delete': (p) => `删除了论坛帖子 #${n(p, 'postId')}`,
    'forum.reply.delete': (p) => `删除了在帖子 #${n(p, 'postId')} 的回复`,
    'forum.admin': (p) => `对论坛帖子 #${n(p, 'postId')} 做了管理操作`,
    'friend.weekly': (p, names) => `好友周榜第 ${n(p, 'rank')} 名, 获得 ${names.goodsName(n(p, 'goodsId'))}`,
    'hiphop.event': () => '嘻哈男孩来店里办了活动',
    'hiphop.tip': () => '打赏了嘻哈男孩',
    'hiphop.wage': (p, names) => `领到嘻哈男孩的工资 (${names.goodsName(n(p, 'cardId'))})`,
    'hiphop.weekly': (p, names) => `嘻哈周榜第 ${n(p, 'rank')} 名, 获得 ${names.goodsName(n(p, 'goodsId'))}`,
    'market.manual': (p) => `菜场手动进货, 花费银币 ${formatNum(n(p, 'cost'))}`,
    'market.share': (p, names) =>
      p.byName
        ? `${String(p.byName)} 买走了你手动进货的 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}, 你分得 ${formatNum(n(p, 'coin'))} 银币`
        : `你手动进货的 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} 被买走了`,
    'takeaway.open': () => '开通了外卖',
    'takeaway.refresh': (p) => `刷新了外卖订单 (今天第 ${n(p, 'times')} 次)`,
    'takeaway.deliver': () => '派出了一单外卖',
    'takeaway.claim': (p) => (p.success ? `外卖送达, 获得银币 ${formatNum(n(p, 'coin'))}` : '外卖配送失败'),
    'takeaway.rebate': (p) =>
      `当骑手送外卖, 分到银币 ${formatNum(n(p, 'coin'))}、经验 ${formatNum(n(p, 'exp'))}`,
    'takeaway.hire': () => '雇了一位好友当骑手',
    'takeaway.dismiss': () => '和一位骑手结算后解约',
    'tower.rank.week': (p, names) =>
      `赛厨榜周榜第 ${n(p, 'rank')} 名, 获得 ${names.goodsName(n(p, 'goodsId'))}`,
    'town.exchange': (p) => `在协会兑换了 ${n(p, 'num')} 次`,
    'town.levelTicket': (p) => `用 ${n(p, 'level')} 级食材兑换券换了 ${n(p, 'total')} 份食材`,
    'town.mysteryTicket': (p, names) => `用神秘食材券换到 ${names.foodName(n(p, 'foodsId'))}`,
    'town.feast': () => '参加了广场宴席',
    'town.hammer': () => '敲了天气锤, 改变了天气',
    'town.mayor': (p) => (p.right ? '答对了镇长大胃锅的问题' : '答错了镇长大胃锅的问题'),
    'town.shake': (p) => `摇钱树摇到银币 ${formatNum(n(p, 'coin'))}`,
    'town.talk': () => '和小镇居民聊了天',
    'town.wish': () => '在广场许了愿',
    'exchange.order': (p, names) =>
      `在交易所挂${p.side === 'buy' ? '买' : '卖'}单: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}, 单价 ${formatNum(n(p, 'price'))}${n(p, 'filled') > 0 ? ` (当场成交 ${n(p, 'filled')} 个)` : ''}${heldNote(p)}`,
    'exchange.fill': (p, names) =>
      p.side === 'sell'
        ? `交易所卖单成交: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}, 单价 ${formatNum(n(p, 'price'))}, 手续费 ${formatNum(n(p, 'fee'))}${p.held ? heldNote(p) : ' (所得在交易所账户)'}`
        : `交易所买单成交: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}, 单价 ${formatNum(n(p, 'price'))}${p.held ? heldNote(p) : ' (食材在交易所账户)'}`,
    'exchange.cancel': (p, names) =>
      `撤销交易所${p.side === 'buy' ? '买' : '卖'}单: ${names.foodName(n(p, 'foodsId'))}, 退回 ${n(p, 'left')} 个`,
    'futures.order': (p, names) =>
      `下了期货单: ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')}, 付定金 ${formatNum(n(p, 'deposit'))} 银币`,
    'futures.cancel': (p, names) =>
      `撤销期货单: ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')}, 定金 ${formatNum(n(p, 'deposit'))} 银币没收`,
    'futures.delivered': (p, names) =>
      `期货到货: ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')}${n(p, 'toWallet') > 0 ? `, 其中 ${n(p, 'toWallet')} 份进了交易所账户` : ''}`,
    'futures.defaulted': (p, names) =>
      `期货违约: 银币不够付尾款, ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')} 没有交货, 定金 ${formatNum(n(p, 'deposit'))} 银币没收`,
    'futures.refunded': (p, names) =>
      `期货单撤销: ${names.foodName(n(p, 'foodsId'))} 已经没有了, 退回定金 ${formatNum(n(p, 'deposit'))} 银币`,
    'exchange.expire': (p, names) =>
      `交易所${p.side === 'buy' ? '买' : '卖'}单过期: ${names.foodName(n(p, 'foodsId'))}, 剩余 ${n(p, 'left')} 个的冻结退回交易所账户`,
    'exchange.withdraw': (p, names) => `从交易所账户取出: ${coinFoods(p, names, (c) => `银币 ${c}`, '、')}`,
    'exchange.freezeCancel': (p, names) =>
      `交易所被冻结, ${p.side === 'buy' ? '买' : '卖'}单撤销: ${names.foodName(n(p, 'foodsId'))}, 剩余 ${n(p, 'left')} 个退回交易所账户`,
    'exchange.confiscate': (p, names) =>
      `交易所冻结中的所得被没收: ${coinFoods(p, names, (c) => `银币 ${c}`, '、')}`,
    'predict.trade': (p) =>
      `预测「${String(p.title ?? '')}」${p.dir === 'sell' ? '卖出' : '买入'}${p.side === 'no' ? '否' : '是'} ${n(p, 'qty')} 份, 成交额 ${formatNum(n(p, 'amount'))}, 手续费 ${formatNum(n(p, 'fee'))}`,
    'predict.settle': (p) =>
      `预测「${String(p.title ?? '')}」结果为${p.outcome ? '是' : '否'}, 结算得到 ${formatNum(n(p, 'coin'))} 银币${predictNet(p)}`,
    'predict.refund': (p) =>
      `预测「${String(p.title ?? '')}」已作废, 退回 ${formatNum(n(p, 'coin'))} 银币${predictNet(p)}`,
    // 豪华一番赏（240-2）的记录带 line: 'deluxe'
    'kuji.buy': (p) =>
      `买了${p.line === 'deluxe' ? '豪华签券' : '一番赏抽赏券'} ×${n(p, 'num')}, 花费 ${formatNum(n(p, 'coin'))} 银币`,
    'kuji.activation': (p) => `领取活跃 ${n(p, 'points')} 点奖励, 另得一番赏抽赏券 ×${n(p, 'num')}`,
    'kuji.draw': (p) => {
      const tiers = Object.entries((p.tiers ?? {}) as Record<string, number>)
        .map(([k, v]) => `${k} 赏 ×${v}`)
        .join('、');
      return `${p.line === 'deluxe' ? '豪华' : ''}一番赏第 ${n(p, 'seq')} 池抽了 ${n(p, 'num')} 张: ${tiers}${p.last ? ', 并拿下最后赏' : ''}`;
    },
    // 小镇发展基金（backlog 基金）：档位名跟着发展基金页的叫法
    'fund.deposit': (p) =>
      `向小镇发展基金存入 ${formatNum(n(p, 'coin'))} 银币 (${fund.tierName(String(p.tier ?? ''))})`,
    'fund.claim': (p, names) =>
      `领取小镇发展基金: 拿回 ${formatNum(n(p, 'coin'))} 银币和${names.goodsName(n(p, 'medal'))}`,
    'fund.withdraw': (p) => `提前取出小镇发展基金, 拿回 ${formatNum(n(p, 'coin'))} 银币`,
    // 食材理财（理财设计 2026-10-10）
    'wealth.deposit': (p, names) =>
      `存入理财 ${formatNum(n(p, 'coin'))} 银币, ${n(p, 'days')} 天后得${names.goodsName(n(p, 'goodsId'))}×${n(p, 'packs')}`,
    'wealth.claim': (p, names) =>
      `领取理财: 拿回 ${formatNum(n(p, 'coin'))} 银币和${names.goodsName(n(p, 'goodsId'))}×${n(p, 'packs')}`,
    'wealth.withdraw': (p) => `提前取出理财, 拿回 ${formatNum(n(p, 'coin'))} 银币`,
    'activity.claim': (p) => `领取了活动「${String(p.title ?? '')}」的奖励`,
    'activity.unlock': (p) => `解锁了活动「${String(p.title ?? '')}」的进阶奖励`,
    'activity.exchange': (p) => `在活动「${String(p.title ?? '')}」兑换了 ${String(p.times ?? 1)} 次`,
    'mail.claim': (p) => `领取了邮件「${String(p.title ?? '')}」的附件`,
    'admin.rename': (p) =>
      `管理员把店名从「${String(p.from ?? '')}」改为「${String(p.to ?? '')}」: ${String(p.reason ?? '')}`,
    'market.guess': (p) => `菜场竞猜开奖: 猜中 ${n(p, 'hits')} 种`,
    'market.guess.refund': (p) => {
      const [day, hour] = String(p.period ?? '').split('@');
      return `菜场竞猜 ${day} ${Number(hour)} 点那一轮没有开奖, 退还了报名费`;
    },
  }),
  feed: (item: RestLogDto, foodName: (id: number) => string) => describeFeed(item, foodName),
};
