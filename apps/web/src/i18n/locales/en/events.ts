import type { RestLogDto } from '@dt/shared';
import type { Messages } from '../..';
import type { Names } from '../../../utils/events';
import { formatNum } from '../../../utils/format';
import fund from './fund';
import { n, type P, plEn } from '../../helpers';

const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `Signature dish ${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `Seed ${id}`;
const holdHours = (p: P) => (p.holdHours === undefined ? 24 : n(p, 'holdHours'));
const heldNote = (p: P) =>
  p.held
    ? ` (suspicious trade: proceeds frozen for ${holdHours(p)} ${plEn(holdHours(p), 'hour', 'hours')})`
    : '';
const coinFoods = (p: P, names: Names, coin: (s: string) => string) =>
  [
    ...(n(p, 'coin') > 0 ? [coin(formatNum(n(p, 'coin')))] : []),
    ...(Array.isArray(p.foods) ? p.foods : []).map(
      (f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`,
    ),
  ].join(', ');
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `, net result ${d > 0 ? '+' : ''}${formatNum(d)}`;
}
const side = (p: P) => (p.side === 'buy' ? 'buy' : 'sell');

function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? 'Someone');
  switch (item.type) {
    case 'takeaway.hired':
      return `${who} hired you as a delivery rider`;
    case 'dine.start':
      return `${who} is eating for free at table ${String(p.table)} in your restaurant`;
    case 'dine.expelled':
      return `${who} sent you out of their restaurant; you paid ${String(p.coin)} ${plEn(String(p.coin), 'coin', 'coins')}`;
    case 'roach.laid':
      return `${who} left a roach at table ${String(p.table)} in your restaurant`;
    case 'roach.killed':
      return `${who} squashed the roach at your table ${String(p.table)}`;
    case 'friend.refuel':
      return `${who} added ${String(p.oil)} oil for you`;
    case 'friend.flip':
      if (p.outcome === 'food') return `${who} raided your pantry and took ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught')
        return `${who} got caught in a mousetrap raiding your pantry and dropped ${String(p.coin)} ${plEn(String(p.coin), 'coin', 'coins')} for you`;
      return `${who} raided your pantry but found nothing`;
    case 'exchange':
      return p.result === 'caught'
        ? `${who} was caught trying to swap your locked ingredients`
        : `${who} swapped ingredients with you`;
    case 'mc.eaten':
      return `${who} tasted your signature dish`;
    case 'lesson.taught':
      if (!p.success)
        return `${who} ${p.type === 2 ? 'failed to sneak a lesson' : "didn't learn anything"} in your class`;
      return `${who} ${p.type === 2 ? 'snuck a lesson' : 'learned a signature dish'} in your class`;
    case 'forum.replied':
      return p.toFloor
        ? `${who} replied to your reply #${String(p.toFloor)} in "${String(p.title ?? '')}"`
        : `${who} replied to your post "${String(p.title ?? '')}"`;
    case 'thumb':
      return `${who} gave you a thumbs-up`;
    case 'friend.apply':
      return `${who} sent you a friend request`;
    case 'yard.helped': {
      // 除虫不用 debugged：那是程序员的双关（backlog 多语言）
      const what = p.what === 'weed' ? 'weeded' : p.what === 'deworm' ? 'got rid of the bugs on' : 'watered';
      return `${who} ${what} your ${foodName(Number(p.foodsId))}`;
    }
    case 'yard.stolen': {
      const caught = p.punished
        ? `, got caught by your border collie and left ${foodName(Number(p.punished))} behind`
        : '';
      return `${who} stole your ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
    case 'friend.accept':
      return `${who} accepted your friend request`;
    default:
      return item.type;
  }
}

const events: Messages['events'] = {
  gain: 'Gained',
  loss: 'Used',
  kind: {
    coin: 'Coins',
    diamond: 'Diamonds',
    exp: 'EXP',
    renown: 'Renown',
    oil: 'Oil',
    strength: 'Stamina',
  },
  remnant: (names, id) => `${mcNameOf(names, id)} fragment`,
  seed: (names, id) => seedNameOf(names, id),
  basket: (name) => `Basket · ${name}`,
  activityCurrency: (name, num) => `${name ?? 'Event currency'}×${num} (event currency)`,
  lucky: ' (lucky)',
  sep: ', ',
  groupSep: '; ',
  more: (text, count) => `${text} and more (${count} in total)`,
  logs: {
    'mc.learn': (p, names) => `Learned the signature dish "${mcNameOf(names, n(p, 'mcId'))}"`,
    'mc.levelUp': (p, names) =>
      `"${mcNameOf(names, n(p, 'mcId'))}" mastery reached level ${n(p, 'curlevel')}`,
    'mc.forget': (p, names) => {
      const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
      const lost = typeof p.lost === 'number' ? p.lost : 0;
      if (typeof p.grades === 'number')
        return `Sneaking a lesson failed: ${k} ${plEn(k, 'recipe', 'recipes')} dropped ${p.grades} ${plEn(p.grades, 'grade', 'grades')}${lost > 0 ? `, ${lost} of them forgotten` : ''}${p.mcId ? `, and you forgot the signature dish "${mcNameOf(names, n(p, 'mcId'))}"` : ''}`;
      return `Sneaking a lesson failed: forgot ${k} ${plEn(k, 'recipe', 'recipes')}${p.mcId ? ` and the signature dish "${mcNameOf(names, n(p, 'mcId'))}"` : ''}`;
    },
    'temple.trial': (p, names) =>
      p.success
        ? `"${mcNameOf(names, n(p, 'mcId'))}" passed the trial: trial value +${n(p, 'worth')}%, trial EXP +${n(p, 'exp')}%`
        : `"${mcNameOf(names, n(p, 'mcId'))}" failed the trial`,
    'kraken.forget': (p, names) =>
      `The Kraken was displeased; you forgot the signature dish "${mcNameOf(names, n(p, 'mcId'))}"`,
    'equip.stress': (p, names) =>
      `Enhancing ${names.goodsName(n(p, 'goodsId'))} to +${n(p, 'to')} ${p.success ? 'succeeded' : 'failed'}`,
    'level.up': (p) => `Restaurant reached level ${n(p, 'to')}`,
    'star.up': (p) => `Restaurant reached ${n(p, 'star')} ${plEn(n(p, 'star'), 'star', 'stars')}`,
    'oil.expand': (p) => `Oil tank expanded to level ${n(p, 'level')} (max ${formatNum(n(p, 'oilMax'))})`,
    'rest.closed': () => 'Ran out of oil; the restaurant closed',
    'rest.reopen': () => 'Refilled the oil; the restaurant reopened',
    'rest.rename': (p) => `Restaurant renamed to "${String(p.to ?? '')}"`,
    'rest.move': () => 'The restaurant moved',
    'mouse.escape': () => 'A mouse came by, but luckily nothing happened',
    'mouse.trap': (p) =>
      `The mousetrap caught a mouse: got ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}`,
    'mouse.steal': (p, names) => `A mouse stole ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'mouse.nothing': () => 'A mouse came by but stole nothing',
    'mouse.map': () => 'A mouse left an exploration map behind',
    'krab.happy': () => 'Mr. Krab loved the meal',
    'krab.angry': () => 'Mr. Krab left disappointed',
    'krab.husky': () => "Mr. Krab petted the husky and didn't get angry",
    'krab.painting': () => 'Mr. Krab admired the painting and left satisfied',
    'krab.driven': () => 'Drove away the angry Mr. Krab',
    'plankton.appear': () => 'Plankton came to the restaurant',
    'plankton.driven': () => 'Drove Plankton away',
    'fridge.drop': (p, names) =>
      `The fridge was full; threw away ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'goods.drop': (p, names) =>
      `Over the holding limit; threw away ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'device.place': (p, names) => `Placed ${names.goodsName(n(p, 'goodsId'))}`,
    'store.use': (p, names) => `Used ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'admin.grant': (p) => `Compensation: ${String(p.reason ?? '')}`,
    redeem: (p) => `Redeemed code ${String(p.code ?? '')}`,
    'bar.darts': (p) => `Bar darts: ${p.result === 'win' ? 'won' : p.result === 'draw' ? 'draw' : 'lost'}`,
    'bar.devil': (p) =>
      p.result === 'win'
        ? `Devil's Chili: survived ${n(p, 'survived')} ${plEn(n(p, 'survived'), 'cup', 'cups')} and won`
        : `Devil's Chili: survived ${n(p, 'survived')} ${plEn(n(p, 'survived'), 'cup', 'cups')}, then went down`,
    'bar.memory': (p) =>
      `Memory Mixing level ${n(p, 'level')}: ${p.correct ? 'got it right' : 'got it wrong'}`,
    'bar.nim': (p) =>
      `Last Candy (${p.table === 'expert' ? 'expert' : 'beginner'} table): ${p.result === 'win' ? 'won' : 'lost'}`,
    'bar.cup': (p) =>
      p.result === 'lose'
        ? `Cup game: wrong guess in round ${n(p, 'round')}`
        : p.result === 'clear'
          ? `Cup game: cleared all ${n(p, 'round')} rounds, ${n(p, 'awards')} ${plEn(n(p, 'awards'), 'reward', 'rewards')}`
          : `Cup game: stopped after ${n(p, 'round')} ${plEn(n(p, 'round'), 'round', 'rounds')}, ${n(p, 'awards')} ${plEn(n(p, 'awards'), 'reward', 'rewards')}`,
    'bar.spice': (p) =>
      p.result === 'win'
        ? `Secret Blend: cracked on try ${n(p, 'tries')}`
        : `Secret Blend: not cracked in ${n(p, 'tries')} tries`,
    'bar.deal': (p, names) =>
      p.result === 'deal'
        ? `Deal or No Deal: took the deal for ${formatNum(n(p, 'coin'))} coins`
        : `Deal or No Deal: opened your box and got ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'num')}`,
    // 收购（问题记录 421）
    'acquire.bought': (p) =>
      `${p.way === 'listed' ? 'Bought the listed' : 'Acquired'} "${String(p.name ?? '')}" for ${formatNum(n(p, 'price'))} coins`,
    'acquire.taken': (p) =>
      `"${String(p.byName ?? '')}" acquired your restaurant for ${formatNum(n(p, 'price'))} coins`,
    'acquire.sold': (p) =>
      `"${String(p.to ?? '')}" bought "${String(p.name ?? '')}" from you; you got ${formatNum(n(p, 'got'))} coins`,
    'acquire.redeemed': (p) =>
      `Bought your restaurant back from "${String(p.from ?? '')}" for ${formatNum(n(p, 'price'))} coins`,
    'acquire.lost': (p) =>
      `"${String(p.name ?? '')}" bought itself back; you got ${formatNum(n(p, 'got'))} coins`,
    'acquire.released': (p) => `Let go of "${String(p.name ?? '')}"`,
    'acquire.freed': (p) => `"${String(p.byName ?? '')}" let go of your restaurant; it's independent again`,
    'acquire.dividend': (p) =>
      `Yesterday's dividends from ${n(p, 'n')} restaurant(s) you own: ${formatNum(n(p, 'coin'))} coins`,
    'acquire.tended': (p) =>
      `Tended the restaurant for your owner "${String(p.ownerName ?? '')}" and got ${n(p, 'n')} ingredients`,
    'dine.started': (p) => `Started eating for free at "${String(p.hostName ?? '')}"`,
    'dine.ended': (p) => `Finished eating for free at "${String(p.hostName ?? '')}"`,
    'dine.left': (p, names) => {
      const a = (p.award ?? null) as { kind?: string; id?: number | null; num?: number } | null;
      const got = !a?.num
        ? ''
        : a.kind === 'goods'
          ? `; you got ${names.goodsName(Number(a.id))}×${a.num}`
          : `; you got ${formatNum(a.num)} ${plEn(String(a.num), 'coin', 'coins')}`;
      const coin = n(p, 'coin');
      return `${String(p.byName ?? 'Someone')} finished eating for free at table ${n(p, 'table')} and left, taking ${formatNum(coin)} ${plEn(String(coin), 'coin', 'coins')}${got}`;
    },
    'forum.post': (p) => `Posted forum thread #${n(p, 'postId')}`,
    'forum.reply': (p) => `Replied to forum thread #${n(p, 'postId')}`,
    'forum.edit': (p) => `Edited forum thread #${n(p, 'postId')}`,
    'forum.delete': (p) => `Deleted forum thread #${n(p, 'postId')}`,
    'forum.reply.delete': (p) => `Deleted a reply in thread #${n(p, 'postId')}`,
    'forum.admin': (p) => `Moderated forum thread #${n(p, 'postId')}`,
    'friend.weekly': (p, names) =>
      `Ranked #${n(p, 'rank')} in the weekly friend ranking, got ${names.goodsName(n(p, 'goodsId'))}`,
    'hiphop.event': () => 'The Hip-hop Boy held an event at the restaurant',
    'hiphop.tip': () => 'Tipped the Hip-hop Boy',
    'hiphop.wage': (p, names) => `Collected the Hip-hop Boy's wage (${names.goodsName(n(p, 'cardId'))})`,
    'hiphop.weekly': (p, names) =>
      `Ranked #${n(p, 'rank')} in the weekly Hip-hop ranking, got ${names.goodsName(n(p, 'goodsId'))}`,
    'market.manual': (p) =>
      `Restocked at the market manually for ${formatNum(n(p, 'cost'))} ${plEn(formatNum(n(p, 'cost')), 'coin', 'coins')}`,
    'market.share': (p, names) =>
      p.byName
        ? `${String(p.byName)} bought ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} from your manual restock; you got ${formatNum(n(p, 'coin'))} ${plEn(String(n(p, 'coin')), 'coin', 'coins')}`
        : `Your manually restocked ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} was bought`,
    'takeaway.open': () => 'Opened takeaway service',
    'takeaway.refresh': (p) =>
      `Refreshed takeaway orders (${n(p, 'times')} ${plEn(n(p, 'times'), 'time', 'times')} today)`,
    'takeaway.deliver': () => 'Sent out a takeaway order',
    'takeaway.claim': (p) =>
      p.success
        ? `Takeaway delivered: got ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}`
        : 'Takeaway delivery failed',
    'takeaway.rebate': (p) =>
      `Delivered as a rider: got ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')} and ${formatNum(n(p, 'exp'))} EXP`,
    'takeaway.hire': () => 'Hired a friend as a rider',
    'takeaway.dismiss': () => 'Paid off and let go of a rider',
    'tower.rank.week': (p, names) =>
      `Ranked #${n(p, 'rank')} in the weekly Chef Tower ranking, got ${names.goodsName(n(p, 'goodsId'))}`,
    'town.exchange': (p) => `Exchanged ${n(p, 'num')} ${plEn(n(p, 'num'), 'time', 'times')} at the Guild`,
    'town.levelTicket': (p) =>
      `Used a level ${n(p, 'level')} ingredient voucher for ${n(p, 'total')} ${plEn(n(p, 'total'), 'ingredient', 'ingredients')}`,
    'town.mysteryTicket': (p, names) =>
      `Used a Mystery Ingredient Voucher for ${names.foodName(n(p, 'foodsId'))}`,
    'town.feast': () => 'Joined the feast at the square',
    'town.hammer': () => 'Struck the weather hammer and changed the weather',
    'town.mayor': (p) =>
      p.right ? "Answered Mayor Big Pot's question correctly" : "Got Mayor Big Pot's question wrong",
    'town.shake': (p) =>
      `Shook the money tree for ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}`,
    'town.talk': () => 'Chatted with the townsfolk',
    'town.wish': () => 'Made a wish at the square',
    'exchange.order': (p, names) =>
      `Placed a ${side(p)} order on the exchange: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')} at ${formatNum(n(p, 'price'))} each${n(p, 'filled') > 0 ? ` (${n(p, 'filled')} filled immediately)` : ''}${heldNote(p)}`,
    'exchange.fill': (p, names) =>
      p.side === 'sell'
        ? `Sell order filled: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')} at ${formatNum(n(p, 'price'))} each, fee ${formatNum(n(p, 'fee'))}${p.held ? heldNote(p) : ' (proceeds in your exchange account)'}`
        : `Buy order filled: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')} at ${formatNum(n(p, 'price'))} each${p.held ? heldNote(p) : ' (ingredients in your exchange account)'}`,
    'exchange.cancel': (p, names) =>
      `Cancelled a ${side(p)} order: ${names.foodName(n(p, 'foodsId'))}, ${n(p, 'left')} returned`,
    'futures.order': (p, names) =>
      `Ordered futures: ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')}, paid a deposit of ${formatNum(n(p, 'deposit'))} coins`,
    'futures.cancel': (p, names) =>
      `Cancelled futures: ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')}, deposit of ${formatNum(n(p, 'deposit'))} coins lost`,
    'futures.delivered': (p, names) =>
      `Futures delivered: ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')}${n(p, 'toWallet') > 0 ? `, ${n(p, 'toWallet')} went to your exchange account` : ''}`,
    'futures.defaulted': (p, names) =>
      `Futures defaulted: not enough coins for the balance, ${names.foodName(n(p, 'foodsId'))}×${n(p, 'qty')} not delivered, deposit of ${formatNum(n(p, 'deposit'))} coins lost`,
    'futures.refunded': (p, names) =>
      `Futures cancelled: ${names.foodName(n(p, 'foodsId'))} no longer exists, deposit of ${formatNum(n(p, 'deposit'))} coins refunded`,
    'exchange.expire': (p, names) =>
      `A ${side(p)} order expired: ${names.foodName(n(p, 'foodsId'))}, the remaining ${n(p, 'left')} went back to your exchange account`,
    'exchange.withdraw': (p, names) =>
      `Withdrew from your exchange account: ${coinFoods(p, names, (c) => `${c} ${plEn(c, 'coin', 'coins')}`)}`,
    'exchange.freezeCancel': (p, names) =>
      `Your exchange was frozen and a ${side(p)} order was cancelled: ${names.foodName(n(p, 'foodsId'))}, the remaining ${n(p, 'left')} went back to your exchange account`,
    'exchange.confiscate': (p, names) =>
      `Frozen exchange proceeds were confiscated: ${coinFoods(p, names, (c) => `${c} ${plEn(c, 'coin', 'coins')}`)}`,
    'predict.trade': (p) =>
      `Prediction "${String(p.title ?? '')}": ${p.dir === 'sell' ? 'sold' : 'bought'} ${n(p, 'qty')} ${p.side === 'no' ? 'No' : 'Yes'} shares for ${formatNum(n(p, 'amount'))}, fee ${formatNum(n(p, 'fee'))}`,
    'predict.settle': (p) =>
      `Prediction "${String(p.title ?? '')}" resolved ${p.outcome ? 'Yes' : 'No'}: received ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}${predictNet(p)}`,
    'predict.refund': (p) =>
      `Prediction "${String(p.title ?? '')}" was voided: refunded ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}${predictNet(p)}`,
    'kuji.buy': (p) =>
      `Bought ${n(p, 'num')} ${p.line === 'deluxe' ? 'Deluxe ' : ''}Ichiban Kuji ${plEn(n(p, 'num'), 'ticket', 'tickets')} for ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}`,
    'kuji.activation': (p) =>
      `Claimed the ${n(p, 'points')}-point activity reward and got ${n(p, 'num')} bonus Ichiban Kuji ${plEn(n(p, 'num'), 'ticket', 'tickets')}`,
    'kuji.draw': (p) => {
      const tiers = Object.entries((p.tiers ?? {}) as Record<string, number>)
        .map(([k, v]) => `${k} prize ×${v}`)
        .join(', ');
      return `Drew ${n(p, 'num')} from ${p.line === 'deluxe' ? 'Deluxe ' : ''}Ichiban Kuji pool #${n(p, 'seq')}: ${tiers}${p.last ? ', plus the Last Prize' : ''}`;
    },
    'fund.deposit': (p) =>
      `Deposited ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')} into the Town Development Fund (${fund.tierName(String(p.tier ?? ''))})`,
    'fund.claim': (p, names) =>
      `Claimed a matured Town Development Fund deposit: got back ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')} and ${names.goodsName(n(p, 'medal'))}`,
    'fund.withdraw': (p) =>
      `Withdrew a Town Development Fund deposit early: got back ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}`,
    'activity.claim': (p) => `Claimed rewards from the event "${String(p.title ?? '')}"`,
    'activity.unlock': (p) => `Unlocked premium rewards for the event "${String(p.title ?? '')}"`,
    'activity.exchange': (p) =>
      `Exchanged ${String(p.times ?? 1)} ${plEn(String(p.times ?? 1), 'time', 'times')} in the event "${String(p.title ?? '')}"`,
    'mail.claim': (p) => `Claimed the attachments of the mail "${String(p.title ?? '')}"`,
    'admin.rename': (p) =>
      `An admin renamed the restaurant from "${String(p.from ?? '')}" to "${String(p.to ?? '')}": ${String(p.reason ?? '')}`,
    'market.guess': (p) => `Market guessing results: ${n(p, 'hits')} correct`,
    'market.guess.refund': (p) => {
      const [day, hour] = String(p.period ?? '').split('@');
      return `The market guessing round on ${day} at ${Number(hour)}:00 wasn't drawn; your entry fee was refunded`;
    },
  },
  feed: describeFeed,
};
export default events;
