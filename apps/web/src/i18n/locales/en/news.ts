import { SHARED_GOODS } from '@dt/shared';
import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { list, num, str, type P, plEn } from '../../helpers';

const WEEKLY: Record<string, string> = {
  'flip.caught': 'caught raiding pantries',
  'flip.flipped': 'pantries raided',
  'roach.kill': 'roaches squashed',
};
const ordinal = (k: number) => {
  const t = k % 100;
  if (t >= 11 && t <= 13) return `${k}th`;
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
};

/** 字母念出来以元音开头时用 an（an A prize、an S prize） */
const aPrize = (tier: string) => `${/^[AEFHILMNORSX]/.test(tier) ? 'an' : 'a'} ${tier} prize`;

/** Town Development Fund (240-2): one line per tier; unknown tier keys get a plain line */
function fundNews(w: string, p: P): string {
  const coin = formatNum(num(p.coin));
  if (p.tier === 'A')
    return `👑 Cornerstone capital makes its entrance! [${w}] injects ${coin} ${plEn(coin, 'coin', 'coins')} in one go and seizes the Town Development Fund's A-tier lead investor seat!`;
  if (p.tier === 'B')
    return `Big move! [${w}] has locked in ${coin} ${plEn(coin, 'coin', 'coins')} of Town Development Fund B-class units!`;
  if (p.tier === 'C')
    return `The real economy is bouncing back! [${w}] subscribed to ${coin} ${plEn(coin, 'coin', 'coins')} of Town Development Fund C-class units`;
  return `[${w}] deposited ${coin} ${plEn(coin, 'coin', 'coins')} into the Town Development Fund`;
}

function predictResult(p: P): string {
  const head = `Prediction "${str(p.title)}"`;
  if (p.outcome === null || p.outcome === undefined) {
    return `${head} was voided. Participants were refunded ${Math.round(num(p.voidRatio) * 100)}% of their net stake`;
  }
  const result = `${head} resolved: ${p.outcome ? 'Yes' : 'No'}`;
  const players = num(p.players);
  if (players === 0) return result;
  const winners = num(p.winners);
  return winners === 0
    ? `${result}. ${players} ${plEn(players, 'restaurant', 'restaurants')} took part, nobody got it right`
    : `${result}. ${players} ${plEn(players, 'restaurant', 'restaurants')} took part, ${winners} got it right, ${formatNum(num(p.paid))} ${plEn(formatNum(num(p.paid)), 'coin', 'coins')} paid out`;
}

const news: Messages['news'] = {
  render: {
    'bar.cup': (w, p) =>
      `${w} guessed the cup ${num(p.times)} ${plEn(num(p.times), 'time', 'times')} in a row at the bar`,
    'bar.fg': (w, p) =>
      `${w} won ${num(p.times)} ${plEn(num(p.times), 'round', 'rounds')} of rock-paper-scissors in a row at the bar`,
    'bar.num': (w) => `${w} hit the number on the bar's wheel`,
    'bar.slot': (w, p, x) =>
      `${w} won ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}×${num(p.num)} on the bar's slot machine`,
    'bar.devil': (w, p) =>
      `${w} downed three Devil's Chili cups without flinching and won ${num(p.payout)} Mystery ${plEn(num(p.payout), 'Voucher', 'Vouchers')}`,
    'bar.memory': (w) => `${w} remembered all 7 ingredients in Memory Mixing`,
    'bar.darts': (w) => `${w} hit three bullseyes in a row and left the bar owner speechless`,
    'equip.stress': (w, p, x) => `${w} enhanced ${x.goodsName(num(p.goodsId))} to +${num(p.stress)}`,
    'friend.weekly': (w, p, x) =>
      `${w} placed ${ordinal(num(p.rank))} last week (${WEEKLY[str(p.key)] ?? 'ranking'}) and won ${x.goodsName(num(p.goodsId))}`,
    'gem.broken': (w, p, x) =>
      `${w} failed a gem upgrade and shattered ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'gem.levelUp': (w, p, x) => `${w} upgraded a gem into ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'forum.pin': (w, p) => `${w}'s post "${str(p.title)}" was pinned`,
    'forum.feature': (w, p) => `${w}'s post "${str(p.title)}" was featured`,
    'hiphop.event': (w) => `${w} started a Hip-hop event!`,
    'hiphop.krab': (w, p, x) => `${w} got ${x.goodsName(SHARED_GOODS.krabCoin)}×${num(p.num)} by tipping`,
    'hiphop.weekly': (w, p, x) =>
      `Congratulations to ${w} for placing ${ordinal(num(p.rank))} in the weekly tips and winning ${x.goodsName(num(p.goodsId))} (160 hours)`,
    'market.manual': (w, p, x) =>
      `${w} restocked daily dishes: ${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join(', ')}`,
    'market.restock': (_w, p, x) =>
      `The market restocked: ${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join(', ')}`,
    'mc.champion': (w, p) => `${w} had yesterday's most valuable signature dish (${formatNum(num(p.value))})`,
    'mc.cook': (w, p, x) => `${w} cooked ${x.mcName(num(p.mcId))}×${num(p.num)}`,
    'oil.expand': (w, p) => `${w} expanded their oil tank to level ${num(p.level)}`,
    'plankton.appear': (w) => `Plankton has settled in at ${w} and won't leave`,
    'plankton.driven': (w) => `${w} drove Plankton away`,
    'rest.move': (w, p, x) => `${w} moved to ${x.streetName(num(p.to))}`,
    'rest.rename': (_w, p) => `${str(p.from)} is now called ${str(p.to)}`,
    'restaurant.open': (w) => `${w} opened for business`,
    'shop.special': (_w, p, x) => `Today's shop special: ${x.goodsName(num(p.goodsId))}`,
    'star.up': (w, p) => `${w} reached ${num(p.star)} ${plEn(num(p.star), 'star', 'stars')}`,
    'takeaway.customer': (w, p, x) => `${w} met ${x.goodsName(num(p.goodsId))} while delivering takeaway`,
    'temple.explore.rare': (w, p, x) =>
      `${w} found ${list(p.foods)
        .map((f) => `${x.foodName(num((f as P).foodsId))}×${num((f as P).num)}`)
        .join(', ')} exploring the temple`,
    'temple.guardian.rare': (w, p, x) =>
      `${w} defeated the guardian beast and got ${x.foodName(num(p.foodsId))}`,
    'activity.coopRank': (_w, p) =>
      `"${str(p.title)}" contribution ranking: ${list(p.top)
        .map((r) => `#${num((r as P).rank)} ${str((r as P).name)} (${formatNum(num((r as P).points))} pts)`)
        .join(', ')}`,
    'tower.rank.week': (_w, p) =>
      `Chef Tower weekly ranking: ${list(p.top)
        .map((r) => `#${num((r as P).rank)} ${str((r as P).name)}`)
        .join(', ')}`,
    'tower.shop.rare': (w, p, x) => `${w} redeemed ${x.goodsName(num(p.goodsId))} at the Chef Tower shop`,
    'tower.elder': (w, p, x) =>
      `${w} beat the Elder on floor ${num(p.floor)} of the Chef Tower and got ${x.goodsName(num(p.goodsId))}`,
    'weather.change': (w, p, x) =>
      p.by !== undefined
        ? `${w} used Thor's Hammer: ${x.weatherName(num(p.from))} turned to ${x.weatherName(num(p.to))}`
        : `The weather changed: ${x.weatherName(num(p.from))} turned to ${x.weatherName(num(p.to))}`,
    'town.broadcast': (w, p) => `${w}: ${str(p.text)}`,
    'town.bless': (w, p) => `${w} made a wish and received: ${str(p.blessName) || str(p.name)}`,
    'town.shake.lucky': (w, p, x) =>
      `Congratulations! ${w} reached into Mr. Krab's pocket and pulled out ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'kuji.big': (w, p) =>
      p.tier === 'last'
        ? `${w} drew the last ticket in ${p.line === 'deluxe' ? 'Deluxe ' : ''}Ichiban Kuji and took the Last Prize!`
        : `${w} won ${aPrize(str(p.tier))} in ${p.line === 'deluxe' ? 'Deluxe ' : ''}Ichiban Kuji!`,
    'kuji.win': (w, p) =>
      `${w} won ${aPrize(str(p.tier))} in ${p.line === 'deluxe' ? 'Deluxe ' : ''}Ichiban Kuji`,
    'fund.big': (w, p) => fundNews(w, p),
    'fund.deposit': (w, p) => fundNews(w, p),
    'icon.buy': (w, p, x) => `${w} bought the limited title "${x.icon?.(str(p.key))?.title ?? str(p.title)}"`,
    'town.exchange': (w, p, x) =>
      `${w} exchanged ${x.goodsName(num(p.goodsId))}×${num(p.num)} with the mayor`,
    'predict.result': (_w, p) => predictResult(p),
  },
  unknown: 'Something happened in town',
  someone: 'A restaurant',
};
export default news;
