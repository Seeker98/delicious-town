// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
import { SHARED_GOODS } from '@dt/shared';
import type { NewsNames } from '../../../utils/news';
import { formatNum } from '../../../utils/format';
import { list, num, str, table, type P } from '../../helpers';

/** 新聞文案（問題記錄 272）：服務端只存類型和引數 */
type NewsFn = (who: string, p: P, x: NewsNames) => string;
const news = table<NewsFn>();
const WEEKLY: Record<string, string> = {
  'flip.caught': '翻廚被夾',
  'flip.flipped': '被翻廚',
  'roach.kill': '滅蟑螂',
};

/** 小鎮發展基金（240-2）：按檔位選句子（使用者定的文案），店名帶【】；運營改了檔位 key 時用通用句 */
function fundNews(w: string, p: P): string {
  const coin = formatNum(num(p.coin));
  if (p.tier === 'A')
    return `👑 基石資本強勢進場！【${w}】一次性注資 ${coin} 銀幣，斬獲小鎮發展基金 A 級領投席位！`;
  if (p.tier === 'B') return `大手筆！【${w}】成功鎖倉 ${coin} 銀幣小鎮發展基金 B 類份額！`;
  if (p.tier === 'C') return `實體經濟復甦！【${w}】認購了 ${coin} 銀幣小鎮發展基金 C 類份額`;
  return `【${w}】向小鎮發展基金存入 ${coin} 銀幣`;
}

/** 事件預測開獎（問題記錄 268）：沒有發起人，文案不帶店名 */
function predictResult(p: P): string {
  const head = `事件預測「${str(p.title)}」`;
  if (p.outcome === null || p.outcome === undefined) {
    return `${head}已作廢，參與的店按淨投入的 ${Math.round(num(p.voidRatio) * 100)}% 退款`;
  }
  const result = `${head}開獎：結果為${p.outcome ? '是' : '否'}`;
  const players = num(p.players);
  if (players === 0) return result;
  const winners = num(p.winners);
  return winners === 0
    ? `${result}。${players} 家店參與，沒有人押對`
    : `${result}。${players} 家店參與，${winners} 家押對，共派出 ${formatNum(num(p.paid))} 銀幣`;
}

export default {
  render: news({
    // 改版前（問題記錄 427-5）的新聞沒有 round，按連中次數寫
    'bar.cup': (w, p) =>
      p.round == null
        ? `${w}在酒吧猜酒杯連中 ${num(p.times)} 次`
        : `${w}在酒吧猜酒杯連闖 ${num(p.round)} 輪，從 ${num(p.cups)} 個杯子裡猜中了骰子`,
    'bar.cup.big': (w, p) =>
      `${w}在酒吧猜酒杯闖過全部 ${num(p.round)} 輪，從 ${num(p.cups)} 個杯子裡猜中了骰子！`,
    'bar.fg': (w, p) => `${w}在酒吧猜拳連勝 ${num(p.times)} 次`,
    'bar.num': (w) => `${w}在酒吧轉數字轉中了`,
    'bar.slot': (w, p, x) =>
      `${w}在酒吧拉霸拉到了 ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}×${num(p.num)}`,
    'bar.devil': (w, p) => `${w}在魔鬼辣杯連喝三杯沒事，贏走 ${num(p.payout)} 張神秘禮券`,
    'bar.memory': (w) => `${w}在記憶調酒裡一口氣記住了 7 種配料`,
    'bar.spice': (w, p) => `${w}只用 ${num(p.tries)} 次就猜出了酒吧的秘製調料`,
    'bar.deal': (w, p, x) =>
      `${w}在一擲千金裡一路不成交，開啟自己的箱子拿到了${x.foodName(num(p.foodsId))}×${num(p.num)}`,
    'bar.darts': (w) => `${w}三鏢全中靶心，把酒吧老闆看呆了`,
    'equip.stress': (w, p, x) => `${w}把 ${x.goodsName(num(p.goodsId))} 強化到了 +${num(p.stress)}`,
    'friend.weekly': (w, p, x) =>
      `${w}獲得上週${WEEKLY[str(p.key)] ?? '排行'}第 ${num(p.rank)} 名，獎勵 ${x.goodsName(num(p.goodsId))}`,
    'gem.broken': (w, p, x) => `${w}升階寶石失敗，碎了 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'gem.levelUp': (w, p, x) => `${w}升階出 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'forum.pin': (w, p) => `${w}的帖子《${str(p.title)}》被置頂了`,
    'forum.feature': (w, p) => `${w}的帖子《${str(p.title)}》被加精了`,
    'hiphop.event': (w) => `${w}開啟了嘻哈活動！`,
    'hiphop.krab': (w, p, x) => `${w}通過打賞獲得 ${x.goodsName(SHARED_GOODS.krabCoin)}×${num(p.num)}`,
    'hiphop.weekly': (w, p, x) =>
      `恭喜${w}在每週打賞中獲得第 ${num(p.rank)} 名，獎勵 ${x.goodsName(num(p.goodsId))}（160 小時）`,
    'market.manual': (w, p, x) =>
      `${w}已進貨日常菜：${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join('、')}`,
    'market.restock': (_w, p, x) =>
      `菜場進貨了：${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join('、')}`,
    'mc.champion': (w, p) => `${w}成為昨日特色菜價值第一（${formatNum(num(p.value))}）`,
    'mc.cook': (w, p, x) => `${w}烹製出 ${x.mcName(num(p.mcId))}×${num(p.num)}`,
    'oil.expand': (w, p) => `${w}把油壺擴容到 ${num(p.level)} 級`,
    'plankton.appear': (w) => `痞老闆賴在了${w}不走`,
    'plankton.driven': (w) => `${w}趕走了痞老闆`,
    'rest.move': (w, p, x) => `${w}搬到了${x.streetName(num(p.to))}`,
    'rest.rename': (_w, p) => `${str(p.from)} 改名為 ${str(p.to)}`,
    'restaurant.open': (w) => `${w}開業了`,
    'shop.special': (_w, p, x) => `商店今日特價：${x.goodsName(num(p.goodsId))}`,
    'star.up': (w, p) => `${w}升到了 ${num(p.star)} 星`,
    'takeaway.customer': (w, p, x) => `${w}送外賣時遇到了${x.goodsName(num(p.goodsId))}`,
    'temple.explore.rare': (w, p, x) =>
      `${w}在神殿探險中發現了 ${list(p.foods)
        .map((f) => `${x.foodName(num((f as P).foodsId))}×${num((f as P).num)}`)
        .join('、')}`,
    'temple.guardian.rare': (w, p, x) => `${w}擊敗守護獸獲得 ${x.foodName(num(p.foodsId))}`,
    'activity.coopRank': (_w, p) =>
      `《${str(p.title)}》貢獻榜：${list(p.top)
        .map(
          (r) => `第 ${num((r as P).rank)} 名 ${str((r as P).name)}（${formatNum(num((r as P).points))} 分）`,
        )
        .join('、')}`,
    'tower.rank.week': (_w, p) =>
      `廚塔周榜：${list(p.top)
        .map((r) => `第 ${num((r as P).rank)} 名 ${str((r as P).name)}`)
        .join('，')}`,
    'tower.shop.rare': (w, p, x) => `${w}在廚塔商店兌換了 ${x.goodsName(num(p.goodsId))}`,
    'tower.elder': (w, p, x) =>
      `${w}打贏廚塔第 ${num(p.floor)} 層長老，得到了 ${x.goodsName(num(p.goodsId))}`,
    'weather.change': (w, p, x) =>
      p.by !== undefined
        ? `${w}使用雷神錘，${x.weatherName(num(p.from))}轉${x.weatherName(num(p.to))}了`
        : `天氣變了：${x.weatherName(num(p.from))}轉${x.weatherName(num(p.to))}`,
    'town.broadcast': (w, p) => `${w}：${str(p.text)}`,
    'town.bless': (w, p) => `${w}許願得到星願：${str(p.blessName) || str(p.name)}`,
    'town.shake.lucky': (w, p, x) =>
      `恭喜${w}伸進蟹老闆褲兜裡掏出：${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    // 豪華一番賞（240-2）的新聞帶 line: 'deluxe'
    'kuji.big': (w, p) =>
      p.tier === 'last'
        ? `${w}抽走了${p.line === 'deluxe' ? '豪華' : ''}一番賞的最後一張籤，拿下最後賞！`
        : `${w}在${p.line === 'deluxe' ? '豪華' : ''}一番賞抽中了 ${str(p.tier)} 賞！`,
    'kuji.win': (w, p) => `${w}在${p.line === 'deluxe' ? '豪華' : ''}一番賞抽中了 ${str(p.tier)} 賞`,
    'acquire.big': (w, p) =>
      `${w}以 ${formatNum(num(p.price))} 銀幣${p.way === 'listed' ? '買下' : '收購'}了「${str(p.name)}」`,
    'acquire.redeem': (w, p) => `${w}以 ${formatNum(num(p.price))} 銀幣贖回了自己`,
    'fund.big': (w, p) => fundNews(w, p),
    'fund.deposit': (w, p) => fundNews(w, p),
    'icon.buy': (w, p, x) => `${w}買下了限定稱號「${x.icon?.(str(p.key))?.title ?? str(p.title)}」`,
    'town.exchange': (w, p, x) => `${w}在鎮長大胃鍋處兌換了 ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'predict.result': (_w, p) => predictResult(p),
  }),
  /** 沒有文案的新聞類型 */
  unknown: '小鎮發生了一件事',
  /** 店已不存在、新聞裡也沒記名字時 */
  someone: '某家餐廳',
};
