import { SHARED_GOODS } from '@dt/shared';
import type { NewsNames } from '../../../utils/news';
import { formatNum } from '../../../utils/format';
import { list, num, str, table, type P } from '../../helpers';

/** 新闻文案（问题记录 272）：服务端只存类型和参数 */
type NewsFn = (who: string, p: P, x: NewsNames) => string;
const news = table<NewsFn>();
const WEEKLY: Record<string, string> = {
  'flip.caught': '翻厨被夹',
  'flip.flipped': '被翻厨',
  'roach.kill': '灭蟑螂',
};

/** 事件预测开奖（问题记录 268）：没有发起人，文案不带店名 */
function predictResult(p: P): string {
  const head = `事件预测「${str(p.title)}」`;
  if (p.outcome === null || p.outcome === undefined) {
    return `${head}已作废，参与的店按净投入的 ${Math.round(num(p.voidRatio) * 100)}% 退款`;
  }
  const result = `${head}开奖：结果为${p.outcome ? '是' : '否'}`;
  const players = num(p.players);
  if (players === 0) return result;
  const winners = num(p.winners);
  return winners === 0
    ? `${result}。${players} 家店参与，没有人押对`
    : `${result}。${players} 家店参与，${winners} 家押对，共派出 ${formatNum(num(p.paid))} 银币`;
}

export default {
  render: news({
    'bar.cup': (w, p) => `${w}在酒吧猜酒杯连中 ${num(p.times)} 次`,
    'bar.fg': (w, p) => `${w}在酒吧猜拳连胜 ${num(p.times)} 次`,
    'bar.num': (w) => `${w}在酒吧转数字转中了`,
    'bar.slot': (w, p, x) =>
      `${w}在酒吧拉霸拉到了 ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}×${num(p.num)}`,
    'bar.devil': (w, p) => `${w}在魔鬼辣杯连喝三杯没事，赢走 ${num(p.payout)} 张神秘礼券`,
    'bar.memory': (w) => `${w}在记忆调酒里一口气记住了 7 种配料`,
    'bar.darts': (w) => `${w}三镖全中靶心，把酒吧老板看呆了`,
    'equip.stress': (w, p, x) => `${w}把 ${x.goodsName(num(p.goodsId))} 强化到了 +${num(p.stress)}`,
    'friend.weekly': (w, p, x) =>
      `${w}获得上周${WEEKLY[str(p.key)] ?? '排行'}第 ${num(p.rank)} 名，奖励 ${x.goodsName(num(p.goodsId))}`,
    'gem.broken': (w, p, x) => `${w}升阶宝石失败，碎了 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'gem.levelUp': (w, p, x) => `${w}升阶出 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'forum.pin': (w, p) => `${w}的帖子《${str(p.title)}》被置顶了`,
    'forum.feature': (w, p) => `${w}的帖子《${str(p.title)}》被加精了`,
    'hiphop.event': (w) => `${w}开启了嘻哈活动！`,
    'hiphop.krab': (w, p, x) => `${w}通过打赏获得 ${x.goodsName(SHARED_GOODS.krabCoin)}×${num(p.num)}`,
    'hiphop.weekly': (w, p, x) =>
      `恭喜${w}在每周打赏中获得第 ${num(p.rank)} 名，奖励 ${x.goodsName(num(p.goodsId))}（160 小时）`,
    'market.manual': (w, p, x) =>
      `${w}已进货日常菜：${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join('、')}`,
    'market.restock': (_w, p, x) =>
      `菜场进货了：${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join('、')}`,
    'mc.champion': (w, p) => `${w}成为昨日特色菜价值第一（${formatNum(num(p.value))}）`,
    'mc.cook': (w, p, x) => `${w}烹制出 ${x.mcName(num(p.mcId))}×${num(p.num)}`,
    'oil.expand': (w, p) => `${w}把油壶扩容到 ${num(p.level)} 级`,
    'plankton.appear': (w) => `痞老板赖在了${w}不走`,
    'plankton.driven': (w) => `${w}赶走了痞老板`,
    'rest.move': (w, p, x) => `${w}搬到了${x.streetName(num(p.to))}`,
    'rest.rename': (_w, p) => `${str(p.from)} 改名为 ${str(p.to)}`,
    'restaurant.open': (w) => `${w}开业了`,
    'shop.special': (_w, p, x) => `商店今日特价：${x.goodsName(num(p.goodsId))}`,
    'star.up': (w, p) => `${w}升到了 ${num(p.star)} 星`,
    'takeaway.customer': (w, p, x) => `${w}送外卖时遇到了${x.goodsName(num(p.goodsId))}`,
    'temple.explore.rare': (w, p, x) =>
      `${w}在神殿探险中发现了 ${list(p.foods)
        .map((f) => `${x.foodName(num((f as P).foodsId))}×${num((f as P).num)}`)
        .join('、')}`,
    'temple.guardian.rare': (w, p, x) => `${w}击败守护兽获得 ${x.foodName(num(p.foodsId))}`,
    'activity.coopRank': (_w, p) =>
      `《${str(p.title)}》贡献榜：${list(p.top)
        .map(
          (r) => `第 ${num((r as P).rank)} 名 ${str((r as P).name)}（${formatNum(num((r as P).points))} 分）`,
        )
        .join('、')}`,
    'tower.rank.week': (_w, p) =>
      `厨塔周榜：${list(p.top)
        .map((r) => `第 ${num((r as P).rank)} 名 ${str((r as P).name)}`)
        .join('，')}`,
    'tower.shop.rare': (w, p, x) => `${w}在厨塔商店兑换了 ${x.goodsName(num(p.goodsId))}`,
    'weather.change': (w, p, x) =>
      p.by !== undefined
        ? `${w}使用雷神锤，${x.weatherName(num(p.from))}转${x.weatherName(num(p.to))}了`
        : `天气变了：${x.weatherName(num(p.from))}转${x.weatherName(num(p.to))}`,
    'town.broadcast': (w, p) => `${w}：${str(p.text)}`,
    'town.bless': (w, p) => `${w}许愿得到星愿：${str(p.blessName) || str(p.name)}`,
    'town.shake.lucky': (w, p, x) =>
      `恭喜${w}伸进蟹老板裤兜里掏出：${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'kuji.big': (w, p) =>
      p.tier === 'last'
        ? `${w}抽走了一番赏的最后一张签，拿下最后赏！`
        : `${w}在一番赏抽中了 ${str(p.tier)} 赏！`,
    'kuji.win': (w, p) => `${w}在一番赏抽中了 ${str(p.tier)} 赏`,
    'icon.buy': (w, p, x) => `${w}买下了限定称号「${x.icon?.(str(p.key))?.title ?? str(p.title)}」`,
    'town.exchange': (w, p, x) => `${w}在镇长处兑换了 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'predict.result': (_w, p) => predictResult(p),
  }),
  /** 没有文案的新闻类型 */
  unknown: '小镇发生了一件事',
  /** 店已不存在、新闻里也没记名字时 */
  someone: '某家餐厅',
};
