import type { RestLogDto } from '@dt/shared';
import type { Messages } from '../..';
import type { Names } from '../../../utils/events';
import { formatNum } from '../../../utils/format';
import fund from './fund';
import { awardWords, n, type P, plEn } from '../../helpers';

/** 天气四大类（镇长猜天气的消息用） */
const WT = ['', 'Sunny', 'Rain', 'Snow & ice', 'Wind, sand & fog'];
const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `Signature dish ${id}`;
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
/** 冰箱入库、抵债日志里的食材清单（冰箱收费 2026-10-22） */
const fridgeItems = (p: P, names: Names, sep: string) =>
  (Array.isArray(p.items) ? p.items : [])
    .map((f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`)
    .join(sep);
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `, net result ${d > 0 ? '+' : ''}${formatNum(d)}`;
}
const side = (p: P) => (p.side === 'buy' ? 'buy' : 'sell');

/** 食材等级的写法（交换食材的动态，问题记录 587） */
const lvText = (lv: number | undefined) => (lv === undefined ? '' : ` (level ${lv})`);

function describeFeed(
  item: RestLogDto,
  foodName: (id: number) => string,
  foodLevel?: (id: number) => number | undefined,
): string {
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
    case 'exchange': {
      if (typeof p.give !== 'number' || typeof p.take !== 'number')
        return p.result === 'caught'
          ? `${who} was caught trying to swap your locked ingredients`
          : `${who} swapped ingredients with you`;
      const give = `${foodName(p.give)}${lvText(foodLevel?.(p.give))}`;
      const take = `${foodName(p.take)}${lvText(foodLevel?.(p.take))}`;
      return p.result === 'caught'
        ? `${who} tried to swap ${give} for your locked ${take} and got caught, leaving you 2 ${foodName(p.give)}`
        : `${who} traded 1 ${give} for your 1 ${take}`;
    }
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
    case 'friend.accept':
      return `${who} accepted your friend request`;
    default:
      return item.type;
  }
}

/** Squidward's hygiene check (Town Commission 2026-10-16): facts only; a day or more left shows days and hours */
const leftH = (h: number) => (h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`);
function hygiene(p: P, names: Names): string {
  const [, m, d] = String(p.day ?? '').split('-');
  const rh = n(p, 'roachHours');
  const roach =
    rh > 0
      ? `roaches took up tables for ${formatNum(rh)} table-${plEn(rh, 'hour', 'hours')}`
      : 'no roaches took up tables';
  const auto = n(p, 'roachAuto') > 0 ? `, pest control killed ${n(p, 'roachAuto')}` : '';
  const mouse =
    n(p, 'mouse') > 0
      ? `mice came ${n(p, 'mouse')} ${plEn(n(p, 'mouse'), 'time', 'times')}, stole ${n(p, 'stolen')} ${plEn(n(p, 'stolen'), 'serving', 'servings')}, ${n(p, 'trapped')} trapped`
      : 'no mice came';
  const dev = (x: unknown, none: string) => {
    const o = x as P | null;
    return o && typeof o === 'object'
      ? `${names.goodsName(n(o, 'goodsId'))}: ${leftH(n(o, 'hours'))} left`
      : none;
  };
  return `Squidward's hygiene check (${Number(m)}/${Number(d)}): ${roach}${auto}; ${mouse}; ${dev(p.roachDevice, 'no roach control placed')}, ${dev(p.mouseDevice, 'no mouse control placed')}`;
}

const events: Messages['events'] = {
  gain: 'Gained',
  loss: 'Used',
  kind: {
    shiling: 'Seasonal points',
    coin: 'Coins',
    diamond: 'Diamonds',
    exp: 'EXP',
    renown: 'Renown',
    oil: 'Oil',
    strength: 'Stamina',
  },
  remnant: (names, id) => `${mcNameOf(names, id)} fragment`,
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
    'equip.stress': (p, names) =>
      `Enhancing ${names.goodsName(n(p, 'goodsId'))} to +${n(p, 'to')} ${p.success ? 'succeeded' : 'failed'}`,
    'achieve.got': (p, names) => {
      const name = names.achName?.(String(p.id ?? '')) ?? String(p.id ?? '');
      const trophy = p.trophy
        ? `, new trophy “${names.trophyName?.(String(p.trophy)) ?? String(p.trophy)}”`
        : '';
      return `${p.first ? 'First on the server to earn' : 'Achievement earned:'} “${name}”${n(p, 'pts') > 0 ? ` (+${n(p, 'pts')} pts)` : ''}${trophy}`;
    },
    'achieve.milestone': (p, names) =>
      `${formatNum(n(p, 'points'))} achievement points: ${names.frameName?.(n(p, 'frame')) ?? 'avatar frame'} unlocked`,
    'level.up': (p) => `Restaurant reached level ${n(p, 'to')}`,
    'table.auto': (p, names) => {
      const extra = [
        n(p, 'store') > 0 ? `used ${n(p, 'store')} ${names.goodsName(n(p, 'goodsId'))} from storage` : '',
        n(p, 'coin') > 0 ? `spent ${formatNum(n(p, 'coin'))} coins` : '',
      ].filter(Boolean);
      return `Level-up: ${n(p, 'num')} ${plEn(n(p, 'num'), 'table', 'tables')} set up automatically${extra.length ? ` (${extra.join(', ')})` : ''}`;
    },
    'table.autoFail': (p, names) =>
      p.reason === 'full'
        ? `Level-up raised the table limit by ${n(p, 'num')}, but your floors are full, so no table was set up. Gain a star, then buy ${names.goodsName(n(p, 'goodsId'))} at the shop`
        : `Level-up raised the table limit by ${n(p, 'num')}, but you didn't have ${formatNum(n(p, 'price'))} coins, so no table was set up. Buy ${names.goodsName(n(p, 'goodsId'))} at the shop when you can`,
    'star.up': (p) => `Restaurant reached ${n(p, 'star')} ${plEn(n(p, 'star'), 'star', 'stars')}`,
    'oil.expand': (p) => `Oil tank expanded to level ${n(p, 'level')} (max ${formatNum(n(p, 'oilMax'))})`,
    'rest.closed': () => 'Ran out of oil; the restaurant closed',
    'rest.reopen': () => 'Refilled the oil; the restaurant reopened',
    'rest.rename': (p) => `Restaurant renamed to "${String(p.to ?? '')}"`,
    'rest.move': () => 'The restaurant moved',
    'mouse.escape': () => 'A mouse came by, but luckily nothing happened',
    'mouse.trap': (p) =>
      `A mouse came for your ingredients and got caught in the mousetrap: got ${formatNum(n(p, 'coin'))} ${plEn(formatNum(n(p, 'coin')), 'coin', 'coins')}`,
    'mouse.steal': (p, names) => `A mouse stole ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'mouse.nothing': () => 'A mouse came by but stole nothing',
    'mouse.map': () => 'A mouse left an exploration map behind',
    'hygiene.report': (p, names) => hygiene(p, names),
    'krab.happy': () => 'Mr. Krab loved the meal',
    'krab.angry': () => 'Mr. Krab left disappointed',
    'krab.husky': () => "Mr. Krab petted the husky and didn't get angry",
    'krab.painting': () => 'Mr. Krab admired the painting and left satisfied',
    'krab.driven': () => 'Drove away the angry Mr. Krab',
    'plankton.appear': () => 'Plankton came to the restaurant',
    'plankton.driven': () => 'Drove Plankton away',
    'fridge.entry': (p, names) =>
      `Food went into the fridge (${fridgeItems(p, names, ', ')}); storage-in fee ${formatNum(n(p, 'coin'))} ${plEn(n(p, 'coin'), 'coin', 'coins')}${n(p, 'owed') > 0 ? `, ${formatNum(n(p, 'owed'))} unpaid and added to your fridge debt` : ''}`,
    'fridge.freeze': (p, names) =>
      `Put ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} in the fridge; storage-in fee ${formatNum(n(p, 'coin'))} ${plEn(n(p, 'coin'), 'coin', 'coins')}`,
    'fridge.fee': (p) =>
      `Fridge storage fee: ${n(p, 'kinds')} ${plEn(n(p, 'kinds'), 'kind', 'kinds')}${n(p, 'mult') > 1 ? ` (×${n(p, 'mult')})` : ''}, ${formatNum(n(p, 'fee'))} today, paid ${formatNum(n(p, 'paid'))}${n(p, 'debt') > 0 ? `, still owe ${formatNum(n(p, 'debt'))}` : ''}`,
    'fridge.seize': (p, names) =>
      `Fridge fees were overdue: sold ${fridgeItems(p, names, ', ')} for ${formatNum(n(p, 'coin'))} ${plEn(n(p, 'coin'), 'coin', 'coins')} to pay them${n(p, 'debt') > 0 ? `, still owe ${formatNum(n(p, 'debt'))}` : ', debt cleared'}`,
    'fridge.drop': (p, names) =>
      `The fridge was full; threw away ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'goods.drop': (p, names) =>
      `Over the holding limit; threw away ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'device.place': (p, names) => `Placed ${names.goodsName(n(p, 'goodsId'))}`,
    'device.breed': (p, names) =>
      `The painting brought forth ${names.foodName(n(p, 'foodsId'))} (${n(p, 'n')}/${n(p, 'of')})`,
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
      `"${String(p.byName ?? '')}" acquired your restaurant for ${formatNum(n(p, 'price'))} coins${n(p, 'got') > 0 ? `; you got ${formatNum(n(p, 'got'))} coins` : ''}`,
    'acquire.sold': (p) =>
      `"${String(p.to ?? '')}" bought "${String(p.name ?? '')}" from you; you got ${formatNum(n(p, 'got'))} coins`,
    'acquire.redeemed': (p) =>
      `Bought your restaurant back from "${String(p.from ?? '')}" for ${formatNum(n(p, 'price'))} coins`,
    'acquire.lost': (p) =>
      `"${String(p.name ?? '')}" bought itself back; you got ${formatNum(n(p, 'got'))} coins`,
    'acquire.released': (p) => `Let go of "${String(p.name ?? '')}"`,
    'acquire.freed': (p) => `"${String(p.byName ?? '')}" let go of your restaurant; it's independent again`,
    'acquire.dividend': (p) =>
      `Your cut from ${n(p, 'n')} restaurant(s) you own arrived: ${formatNum(n(p, 'coin'))} coins`,
    'acquire.tended': (p) =>
      p.n !== undefined
        ? `Tended the restaurant for your owner "${String(p.ownerName ?? '')}" and got ${n(p, 'n')} ingredients`
        : `Tended "${String(p.name ?? '')}" for ${formatNum(n(p, 'cost'))} coins${n(p, 'packs') > 0 ? ` and sent ${n(p, 'packs')} supply pack(s)` : ''}`,
    'acquire.tendedBy': (p) =>
      `Your owner "${String(p.ownerName ?? '')}" tended your restaurant${n(p, 'packs') > 0 ? ` and sent ${n(p, 'packs')} supply pack(s)` : ''}`,
    'acquire.refund': (p) => `The ${formatNum(n(p, 'coin'))} coins you gave your owner came back to you`,
    'acquire.autoReleased': (p) =>
      `"${String(p.name ?? '')}" wasn't tended for ${n(p, 'days')} days and was let go automatically`,
    'acquire.autoFreed': (p) =>
      `Your owner "${String(p.byName ?? '')}" didn't tend your restaurant for ${n(p, 'days')} days; it's independent again`,
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
    'jobCard.weekly': (p, names) =>
      `Ranked #${n(p, 'rank')} in the weekly Season ranking, drew the job permit “${names.goodsName(n(p, 'goodsId'))}”`,
    'jobCard.wage': (p, names) => `Collected a job permit wage (${names.goodsName(n(p, 'cardId'))})`,
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
    'mc.champion': (p, names) =>
      `Ranked #${n(p, 'rank')} in yesterday’s signature dish ranking, got ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'tower.rank.week': (p, names) =>
      `Ranked #${n(p, 'rank')} in the weekly Chef Tower ranking, got ${names.goodsName(n(p, 'goodsId'))}`,
    'town.exchange': (p) => `Exchanged ${n(p, 'num')} ${plEn(n(p, 'num'), 'time', 'times')} at the Guild`,
    'town.levelTicket': (p) =>
      `Used a level ${n(p, 'level')} ingredient voucher for ${n(p, 'total')} ${plEn(n(p, 'total'), 'ingredient', 'ingredients')}`,
    'town.mysteryTicket': (p, names) =>
      `Used a Mystery Ingredient Voucher for ${names.foodName(n(p, 'foodsId'))}`,
    'town.feast': () => 'Joined the feast at the square',
    'town.hammer': () => 'Struck the weather hammer and changed the weather',
    'weather.tool': (p, names) =>
      `Used ${names.goodsName(n(p, 'goodsId'))}: ${names.weatherName?.(n(p, 'from')) ?? ''} became ${names.weatherName?.(n(p, 'to')) ?? ''}`,
    'town.mayor': (p) =>
      p.type === undefined
        ? p.right
          ? "Answered Mayor Big Pot's question correctly"
          : "Got Mayor Big Pot's question wrong"
        : p.right
          ? `Guessed the mayor's weather right: ${WT[n(p, 'actual')] ?? ''}, got the Mayor's Recommendation`
          : `Missed the mayor's weather guess: it was ${WT[n(p, 'actual')] ?? ''} (you guessed ${WT[n(p, 'type')] ?? ''})`,
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
    'wealth.deposit': (p, names) =>
      `Deposited ${formatNum(n(p, 'coin'))} coins for ${n(p, 'days')} ${plEn(n(p, 'days'), 'day', 'days')}, earning ${names.goodsName(n(p, 'goodsId'))} ×${n(p, 'packs')}`,
    'wealth.claim': (p, names) =>
      `Claimed a deposit: ${formatNum(n(p, 'coin'))} coins back plus ${names.goodsName(n(p, 'goodsId'))} ×${n(p, 'packs')}`,
    'wealth.withdraw': (p) => `Withdrew a deposit early: got back ${formatNum(n(p, 'coin'))} coins`,
    'bulk.bid': (p, names) =>
      `Bulk subscription bid: ${names.foodName(n(p, 'foodsId'))} at ${formatNum(n(p, 'price'))} × ${n(p, 'qty')}, ${formatNum(n(p, 'frozen'))} coins frozen in total`,
    'bulk.won': (p, names) =>
      `Bulk subscription: got ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'won')} (bid ${n(p, 'qty')}) at ${formatNum(n(p, 'price'))}, paid ${formatNum(n(p, 'paid'))}, refunded ${formatNum(n(p, 'refunded'))}${n(p, 'toWallet') > 0 ? `; ${n(p, 'toWallet')} went to the exchange account` : ''}`,
    'bulk.lost': (p, names) =>
      `Bulk subscription: no ${names.foodName(n(p, 'foodsId'))}, refunded ${formatNum(n(p, 'refunded'))} coins${p.consolation ? ', got a consolation prize' : ''}`,
    'bulk.failed': (p, names) =>
      `Bulk subscription failed: not enough bids for ${names.foodName(n(p, 'foodsId'))}, refunded ${formatNum(n(p, 'refunded'))} coins`,
    'bulk.cancelled': (p, names) =>
      `Bulk subscription cancelled: ${names.foodName(n(p, 'foodsId'))}, refunded ${formatNum(n(p, 'refunded'))} coins`,
    'wishtree.wish': (p, names) =>
      `Made a wish at the Wishing Tree (the tree bears ${names.goodsName(n(p, 'goodsId'))} ×${n(p, 'num')})`,
    'wishtree.lost': (p, names) =>
      `Didn't win the Wishing Tree draw (the tree bore ${names.goodsName(n(p, 'goodsId'))} ×${n(p, 'num')}); consolation reward: ${awardWords(p.award, names, { coin: (s) => `${s} coins`, exp: (s) => `${s} EXP`, qty: (a, b) => `${a} ×${b}` }, formatNum)}`,
    'activity.claim': (p) => `Claimed rewards from the event "${String(p.title ?? '')}"`,
    'activity.unlock': (p) => `Unlocked premium rewards for the event "${String(p.title ?? '')}"`,
    'activity.exchange': (p) =>
      `Exchanged ${String(p.times ?? 1)} ${plEn(String(p.times ?? 1), 'time', 'times')} in the event "${String(p.title ?? '')}"`,
    'mail.claim': (p) => `Claimed the attachments of the mail "${String(p.title ?? '')}"`,
    'admin.rename': (p) =>
      `An admin renamed the restaurant from "${String(p.from ?? '')}" to "${String(p.to ?? '')}": ${String(p.reason ?? '')}`,
    'market.guess': (p, names) => {
      const got = ((p.goods ?? []) as Array<{ id: number; num: number }>)
        .map((g) => `${names.goodsName(g.id)} ×${g.num}`)
        .join(', ');
      return `Market guessing results: ${n(p, 'hits')} correct${got ? `; you got ${got}` : ''}`;
    },
    'market.guess.refund': (p) => {
      const [day, hour] = String(p.period ?? '').split('@');
      return `The market guessing round on ${day} at ${Number(hour)}:00 wasn't drawn; your entry fee was refunded`;
    },
  },
  feed: describeFeed,
};
export default events;
