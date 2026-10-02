import type { GameEvent, RestLogDto } from '@dt/shared';
import { describeFeed } from './feed';
import { formatNum } from './format';

export interface Names {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName?(id: number): string;
  seedName?(id: number): string;
}

const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `特色菜${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `种子${id}`;

const KIND_NAMES: Record<string, string> = {
  coin: '银币',
  diamond: '钻石',
  exp: '经验',
  renown: '声望',
  oil: '油',
  strength: '体力',
};

/** 合并同类型、同物品、同幸运标记的事件（一次得到很多东西时不刷屏），保持首次出现的顺序 */
export function mergeEvents(events: GameEvent[]): GameEvent[] {
  const out = new Map<string, GameEvent>();
  for (const e of events) {
    const key = `${e.type}:${e.kind}:${e.id ?? ''}:${e.name ?? ''}:${e.lucky ? 1 : 0}`;
    const cur = out.get(key);
    if (cur) cur.num += e.num;
    else out.set(key, { ...e });
  }
  return [...out.values()];
}

export function eventText(e: GameEvent, names: Names): string {
  return `${e.type === 'gain' ? '获得' : '消耗'} ${eventItem(e, names)}`;
}

/** 一次操作的所有得失合成一条提示（问题记录：弹出的消息框太多）；超过 max 项时只列前 max 项 */
export function eventsSummary(events: GameEvent[], names: Names, max = 8): string {
  const merged = mergeEvents(events);
  const items = [...merged.filter((e) => e.type === 'gain'), ...merged.filter((e) => e.type !== 'gain')];
  const shown = items.slice(0, max);
  const part = (type: 'gain' | 'loss') => {
    const xs = shown.filter((e) => (e.type === 'gain') === (type === 'gain')).map((e) => eventItem(e, names));
    return xs.length === 0 ? '' : `${type === 'gain' ? '获得' : '消耗'} ${xs.join('、')}`;
  };
  const text = [part('gain'), part('loss')].filter(Boolean).join('；');
  return items.length > max ? `${text} 等 ${items.length} 项` : text;
}

/** 一条得失的物品和数量（不含"获得 / 消耗"） */
function eventItem(e: GameEvent, names: Names): string {
  let what: string;
  if (e.kind === 'goods') what = `${names.goodsName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'foods') what = `${names.foodName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'remnant') what = `${mcNameOf(names, e.id ?? 0)}残卷×${formatNum(e.num)}`;
  else if (e.kind === 'seed') what = `${seedNameOf(names, e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'basket') what = `菜篮·${names.foodName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'activityCurrency') what = `${e.name ?? '活动货币'}×${formatNum(e.num)}（活动货币）`;
  else what = `${KIND_NAMES[e.kind] ?? e.kind} ${formatNum(e.num)}`;
  return `${what}${e.lucky ? '（幸运）' : ''}`;
}

type P = Record<string, unknown>;
const n = (p: P, k: string) => Number(p[k] ?? 0);

/** 可疑成交的所得进冷静期（156-2） */
const heldNote = (p: P) => (p.held ? '（可疑成交，所得冻结 24 小时）' : '');

/** 事件合约结算日志带净投入时写出本局盈亏（问题记录 254） */
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `，本局盈亏 ${d > 0 ? '+' : ''}${formatNum(d)}`;
}

const LOGS: Record<string, (p: P, names: Names) => string> = {
  'mc.learn': (p, names) => `学会了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
  'mc.levelUp': (p, names) => `「${mcNameOf(names, n(p, 'mcId'))}」熟练度升到 ${n(p, 'curlevel')} 级`,
  'mc.forget': (p, names) => {
    const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
    return `偷学失败，遗忘了 ${k} 道食谱${p.mcId ? `和特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
  },
  'temple.trial': (p, names) =>
    p.success
      ? `「${mcNameOf(names, n(p, 'mcId'))}」试炼成功：试炼价值 +${n(p, 'worth')}%、试炼经验 +${n(p, 'exp')}%`
      : `「${mcNameOf(names, n(p, 'mcId'))}」试炼失败`,
  'kraken.forget': (p, names) => `克拉肯很不满意，你遗忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
  'equip.stress': (p, names) =>
    `${names.goodsName(n(p, 'goodsId'))}强化到 +${n(p, 'to')}${p.success ? '成功' : '失败'}`,
  'level.up': (p) => `餐厅升到了 ${n(p, 'to')} 级`,
  'star.up': (p) => `餐厅升到了 ${n(p, 'star')} 星`,
  'oil.expand': (p) => `油壶扩容到 ${n(p, 'level')} 级（上限 ${formatNum(n(p, 'oilMax'))}）`,
  'rest.closed': () => '油用光了，餐厅停业',
  'rest.reopen': () => '加满了油，餐厅恢复营业',
  'rest.rename': (p) => `餐厅改名为「${String(p.to ?? '')}」`,
  'rest.move': () => '餐厅搬家了',
  'mouse.escape': () => '老鼠来了，幸运地躲过一劫',
  'mouse.trap': (p) => `捕鼠夹抓到了老鼠，得到 ${formatNum(n(p, 'coin'))} 银币`,
  'mouse.steal': (p, names) => `老鼠偷走了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
  'mouse.nothing': () => '老鼠来了，什么也没偷到',
  'mouse.map': () => '老鼠留下了一张探险图',
  'krab.happy': () => '蟹老板吃得很满意，回味无穷',
  'krab.angry': () => '蟹老板扫兴而归',
  'krab.husky': () => '蟹老板摸了摸二哈，没有生气',
  'krab.painting': () => '蟹老板欣赏名画，心满意足',
  'krab.driven': () => '赶走了生气的蟹老板',
  'plankton.appear': () => '痞老板来店里了',
  'plankton.driven': () => '赶走了痞老板',
  'fridge.drop': (p, names) => `冰箱满了，丢掉了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
  'goods.drop': (p, names) => `超过持有上限，丢掉了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
  'device.place': (p, names) => `摆放了 ${names.goodsName(n(p, 'goodsId'))}`,
  'store.use': (p, names) => `使用了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
  'admin.grant': (p) => `系统补偿：${String(p.reason ?? '')}`,
  redeem: (p) => `使用了兑换码 ${String(p.code ?? '')}`,
  // 问题记录 154：以下类型原来显示英文类型名
  'bar.darts': (p) => `酒吧飞镖${p.result === 'win' ? '赢了' : p.result === 'draw' ? '打平' : '输了'}`,
  'bar.devil': (p) =>
    p.result === 'win'
      ? `魔鬼辣杯撑过 ${n(p, 'survived')} 杯，赢了`
      : `魔鬼辣杯撑过 ${n(p, 'survived')} 杯，倒下了`,
  'bar.memory': (p) => `记忆调酒第 ${n(p, 'level')} 关${p.correct ? '调对了' : '没调对'}`,
  'dine.started': (p) => `去「${String(p.hostName ?? '')}」白食`,
  'dine.ended': (p) => `在「${String(p.hostName ?? '')}」白食结束`,
  'forum.post': (p) => `在论坛发了帖子 #${n(p, 'postId')}`,
  'forum.reply': (p) => `回复了论坛帖子 #${n(p, 'postId')}`,
  'forum.edit': (p) => `编辑了论坛帖子 #${n(p, 'postId')}`,
  'forum.delete': (p) => `删除了论坛帖子 #${n(p, 'postId')}`,
  'forum.reply.delete': (p) => `删除了在帖子 #${n(p, 'postId')} 的回复`,
  'forum.admin': (p) => `对论坛帖子 #${n(p, 'postId')} 做了管理操作`,
  'friend.weekly': (p, names) => `好友周榜第 ${n(p, 'rank')} 名，获得 ${names.goodsName(n(p, 'goodsId'))}`,
  'hiphop.event': () => '嘻哈男孩来店里办了活动',
  'hiphop.tip': () => '打赏了嘻哈男孩',
  'hiphop.wage': (p, names) => `领到嘻哈男孩的工资（${names.goodsName(n(p, 'cardId'))}）`,
  'hiphop.weekly': (p, names) => `嘻哈周榜第 ${n(p, 'rank')} 名，获得 ${names.goodsName(n(p, 'goodsId'))}`,
  'market.manual': (p) => `菜场手动进货，花费银币 ${formatNum(n(p, 'cost'))}`,
  'market.share': (p, names) => `你在菜场分享的 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} 被买走了`,
  'takeaway.open': () => '开通了外卖',
  'takeaway.refresh': (p) => `刷新了外卖订单（今天第 ${n(p, 'times')} 次）`,
  'takeaway.deliver': () => '派出了一单外卖',
  'takeaway.claim': (p) => (p.success ? `外卖送达，获得银币 ${formatNum(n(p, 'coin'))}` : '外卖配送失败'),
  'takeaway.rebate': (p) =>
    `当骑手送外卖，分到银币 ${formatNum(n(p, 'coin'))}、经验 ${formatNum(n(p, 'exp'))}`,
  'takeaway.hire': () => '雇了一位好友当骑手',
  'takeaway.dismiss': () => '和一位骑手结算后解约',
  'tower.rank.week': (p, names) =>
    `赛厨榜周榜第 ${n(p, 'rank')} 名，获得 ${names.goodsName(n(p, 'goodsId'))}`,
  'town.exchange': (p) => `在广场兑换了 ${n(p, 'num')} 次`,
  'town.levelTicket': (p) => `用 ${n(p, 'level')} 级食材兑换券换了 ${n(p, 'total')} 份食材`,
  'town.mysteryTicket': (p, names) => `用神秘食材券换到 ${names.foodName(n(p, 'foodsId'))}`,
  'town.feast': () => '参加了广场宴席',
  'town.hammer': () => '敲了天气锤，改变了天气',
  'town.mayor': (p) => (p.right ? '答对了镇长的问题' : '答错了镇长的问题'),
  'town.shake': (p) => `摇钱树摇到银币 ${formatNum(n(p, 'coin'))}`,
  'town.talk': () => '和广场上的居民聊了天',
  'town.wish': () => '在广场许了愿',
  'exchange.order': (p, names) =>
    `在交易所挂${p.side === 'buy' ? '买' : '卖'}单：${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}，单价 ${formatNum(n(p, 'price'))}${n(p, 'filled') > 0 ? `（当场成交 ${n(p, 'filled')} 个）` : ''}${heldNote(p)}`,
  'exchange.fill': (p, names) =>
    p.side === 'sell'
      ? `交易所卖单成交：${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}，单价 ${formatNum(n(p, 'price'))}，手续费 ${formatNum(n(p, 'fee'))}${p.held ? heldNote(p) : '（所得在交易所账户）'}`
      : `交易所买单成交：${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}，单价 ${formatNum(n(p, 'price'))}${p.held ? heldNote(p) : '（食材在交易所账户）'}`,
  'exchange.cancel': (p, names) =>
    `撤销交易所${p.side === 'buy' ? '买' : '卖'}单：${names.foodName(n(p, 'foodsId'))}，退回 ${n(p, 'left')} 个`,
  'exchange.expire': (p, names) =>
    `交易所${p.side === 'buy' ? '买' : '卖'}单过期：${names.foodName(n(p, 'foodsId'))}，剩余 ${n(p, 'left')} 个的冻结退回交易所账户`,
  'exchange.withdraw': (p, names) =>
    `从交易所账户取出：${[
      ...(n(p, 'coin') > 0 ? [`银币 ${formatNum(n(p, 'coin'))}`] : []),
      ...(Array.isArray(p.foods) ? p.foods : []).map(
        (f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`,
      ),
    ].join('、')}`,
  'predict.trade': (p) =>
    `预测「${String(p.title ?? '')}」${p.dir === 'sell' ? '卖出' : '买入'}${p.side === 'no' ? '否' : '是'} ${n(p, 'qty')} 份，成交额 ${formatNum(n(p, 'amount'))}，手续费 ${formatNum(n(p, 'fee'))}`,
  'predict.settle': (p) =>
    `预测「${String(p.title ?? '')}」结果为${p.outcome ? '是' : '否'}，结算得到 ${formatNum(n(p, 'coin'))} 银币${predictNet(p)}`,
  'predict.refund': (p) =>
    `预测「${String(p.title ?? '')}」已作废，退回 ${formatNum(n(p, 'coin'))} 银币${predictNet(p)}`,
  'activity.claim': (p) => `领取了活动「${String(p.title ?? '')}」的奖励`,
  'activity.unlock': (p) => `解锁了活动「${String(p.title ?? '')}」的进阶奖励`,
  'activity.exchange': (p) => `在活动「${String(p.title ?? '')}」兑换了 ${String(p.times ?? 1)} 次`,
  'mail.claim': (p) => `领取了邮件「${String(p.title ?? '')}」的附件`,
  'admin.rename': (p) =>
    `管理员把店名从「${String(p.from ?? '')}」改为「${String(p.to ?? '')}」：${String(p.reason ?? '')}`,
  'market.guess': (p) => `菜场竞猜开奖：猜中 ${n(p, 'hits')} 种`,
  'market.guess.refund': (p) => {
    const [day, hour] = String(p.period ?? '').split('@');
    return `菜场竞猜 ${day} ${Number(hour)} 点那一轮没有开奖，退还了报名费`;
  },
};

/** 个人日志；好友对我做的操作（好友动态类型）用动态的文案，没有文案时显示类型名 */
export function logText(l: RestLogDto, names: Names): string {
  const f = LOGS[l.type];
  return f ? f(l.params, names) : describeFeed(l, (id) => names.foodName(id));
}

/** 流水（道具流水页）的名称 */
export function recordLabel(r: { kind: string; itemId: number | null }, names: Names): string {
  if (r.kind === 'goods') return names.goodsName(r.itemId ?? 0);
  if (r.kind === 'foods') return names.foodName(r.itemId ?? 0);
  if (r.kind === 'remnant') return `${mcNameOf(names, r.itemId ?? 0)}残卷`;
  if (r.kind === 'seed') return seedNameOf(names, r.itemId ?? 0);
  if (r.kind === 'basket') return `菜篮·${names.foodName(r.itemId ?? 0)}`;
  return KIND_NAMES[r.kind] ?? r.kind;
}
