import { SHARED_GOODS } from '@dt/shared';
import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { list, num, str, type P, plFr } from '../../helpers';

const WEEKLY: Record<string, string> = {
  'flip.caught': 'pris en fouillant les garde-mangers',
  'flip.flipped': 'garde-mangers fouillés',
  'roach.kill': 'cafards écrasés',
};
const rank = (k: number) => (k === 1 ? '1er' : `${k}e`);

/** Fonds de développement (240-2) : une phrase par rang ; rang inconnu → phrase simple */
function fundNews(w: string, p: P): string {
  const coin = formatNum(num(p.coin));
  if (p.tier === 'A')
    return `👑 Le capital pilier entre en force\u202f! [${w}] injecte ${coin} ${plFr(coin, 'pièce', 'pièces')} d'un coup et décroche le siège d'investisseur principal de rang A du Fonds de développement\u202f!`;
  if (p.tier === 'B')
    return `Coup de maître\u202f! [${w}] verrouille ${coin} ${plFr(coin, 'pièce', 'pièces')} en parts de classe B du Fonds de développement\u202f!`;
  if (p.tier === 'C')
    return `L'économie réelle redémarre\u202f! [${w}] a souscrit ${coin} ${plFr(coin, 'pièce', 'pièces')} en parts de classe C du Fonds de développement`;
  return `[${w}] a déposé ${coin} ${plFr(coin, 'pièce', 'pièces')} dans le Fonds de développement`;
}

function predictResult(p: P): string {
  const head = `Prédiction «\u202f${str(p.title)}\u202f»`;
  if (p.outcome === null || p.outcome === undefined) {
    return `${head} annulée. Les participants ont été remboursés à ${Math.round(num(p.voidRatio) * 100)}\u202f% de leur mise nette`;
  }
  const result = `${head}\u202f: résultat ${p.outcome ? 'Oui' : 'Non'}`;
  const players = num(p.players);
  if (players === 0) return result;
  const winners = num(p.winners);
  return winners === 0
    ? `${result}. ${players} ${plFr(players, 'restaurant a', 'restaurants ont')} participé, personne n'a deviné juste`
    : `${result}. ${players} ${plFr(players, 'restaurant a', 'restaurants ont')} participé, ${winners} ${plFr(winners, 'a', 'ont')} deviné juste, ${formatNum(num(p.paid))} ${plFr(formatNum(num(p.paid)), 'pièce versée', 'pièces versées')}`;
}

const news: Messages['news'] = {
  render: {
    // 改版前（问题记录 427-5）的新闻没有 round，按连中次数写
    'bar.cup': (w, p) =>
      p.round == null
        ? `${w} a trouvé le bon gobelet ${num(p.times)} fois de suite au bar`
        : `${w} a réussi ${num(p.round)} ${plFr(num(p.round), 'manche', 'manches')} du jeu des gobelets au bar et trouvé le dé parmi ${num(p.cups)} gobelets`,
    'bar.cup.big': (w, p) =>
      `${w} a réussi ${num(p.round)} ${plFr(num(p.round), 'manche', 'manches')} du jeu des gobelets au bar et trouvé le dé parmi ${num(p.cups)} gobelets\u202f!`,
    'bar.fg': (w, p) =>
      `${w} a gagné ${num(p.times)} ${plFr(num(p.times), 'manche', 'manches')} de pierre-feuille-ciseaux d'affilée au bar`,
    'bar.num': (w) => `${w} a touché le bon numéro à la roue du bar`,
    'bar.slot': (w, p, x) =>
      `${w} a gagné ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}\u202f×\u202f${num(p.num)} à la machine à sous du bar`,
    'bar.devil': (w, p) =>
      `${w} a bu trois Piments du Diable sans broncher et a gagné ${num(p.payout)} ${plFr(num(p.payout), 'bon', 'bons')} mystère`,
    'bar.memory': (w) => `${w} a retenu les 7 ingrédients du Cocktail Mémoire`,
    'bar.spice': (w, p) =>
      `${w} a trouvé le mélange secret du bar en seulement ${num(p.tries)} ${plFr(Number(p.tries), 'essai', 'essais')}`,
    'bar.deal': (w, p, x) =>
      `${w} a tout refusé au jeu «\u202fÀ prendre ou à laisser\u202f» et a ouvert ${x.foodName(num(p.foodsId))}\u202f×\u202f${num(p.num)}`,
    'bar.darts': (w) => `${w} a mis trois fléchettes dans le mille et a bluffé le patron du bar`,
    'equip.stress': (w, p, x) => `${w} a renforcé ${x.goodsName(num(p.goodsId))} à +${num(p.stress)}`,
    'friend.weekly': (w, p, x) =>
      `${w} a fini ${rank(num(p.rank))} la semaine dernière (${WEEKLY[str(p.key)] ?? 'classement'}) et gagne ${x.goodsName(num(p.goodsId))}`,
    'gem.broken': (w, p, x) =>
      `${w} a raté l'amélioration d'une gemme et a brisé ${x.goodsName(num(p.goodsId))}\u202f×\u202f${num(p.num)}`,
    'gem.levelUp': (w, p, x) =>
      `${w} a obtenu ${x.goodsName(num(p.goodsId))}\u202f×\u202f${num(p.num)} en améliorant une gemme`,
    'forum.pin': (w, p) => `Le message «\u202f${str(p.title)}\u202f» de ${w} a été épinglé`,
    'forum.feature': (w, p) => `Le message «\u202f${str(p.title)}\u202f» de ${w} a été mis en avant`,
    'hiphop.event': (w) => `${w} a lancé un événement hip-hop\u202f!`,
    'hiphop.krab': (w, p, x) =>
      `${w} a obtenu ${x.goodsName(SHARED_GOODS.krabCoin)}\u202f×\u202f${num(p.num)} en donnant des pourboires`,
    'hiphop.weekly': (w, p, x) =>
      `Bravo à ${w}, ${rank(num(p.rank))} du classement hebdomadaire des pourboires, qui gagne ${x.goodsName(num(p.goodsId))} (160 heures)`,
    'market.manual': (w, p, x) =>
      `${w} s'est réapprovisionné en plats du jour\u202f: ${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join(', ')}`,
    'market.restock': (_w, p, x) =>
      `Le marché s'est réapprovisionné\u202f: ${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join(', ')}`,
    'mc.champion': (w, p) =>
      `${w} avait hier le plat signature le plus précieux (${formatNum(num(p.value))})`,
    'mc.cook': (w, p, x) => `${w} a cuisiné ${x.mcName(num(p.mcId))}\u202f×\u202f${num(p.num)}`,
    'oil.expand': (w, p) => `${w} a agrandi son bidon d'huile au niveau ${num(p.level)}`,
    'plankton.appear': (w) => `Plancton s'est installé chez ${w} et refuse de partir`,
    'plankton.driven': (w) => `${w} a chassé Plancton`,
    'rest.move': (w, p, x) => `${w} a déménagé à ${x.streetName(num(p.to))}`,
    'rest.rename': (_w, p) => `${str(p.from)} s'appelle désormais ${str(p.to)}`,
    'restaurant.open': (w) => `${w} a ouvert ses portes`,
    'shop.special': (_w, p, x) => `Promotion du jour à la boutique\u202f: ${x.goodsName(num(p.goodsId))}`,
    'star.up': (w, p) => `${w} a atteint ${num(p.star)} ${plFr(num(p.star), 'étoile', 'étoiles')}`,
    'takeaway.customer': (w, p, x) => `${w} a croisé ${x.goodsName(num(p.goodsId))} en livrant à emporter`,
    'temple.explore.rare': (w, p, x) =>
      `${w} a trouvé ${list(p.foods)
        .map((f) => `${x.foodName(num((f as P).foodsId))}\u202f×\u202f${num((f as P).num)}`)
        .join(', ')} en explorant le temple`,
    'temple.guardian.rare': (w, p, x) =>
      `${w} a vaincu la bête gardienne et obtenu ${x.foodName(num(p.foodsId))}${p.num ? `\u202f×\u202f${num(p.num)}` : ''}`,
    'activity.coopRank': (_w, p) =>
      `Classement des contributions de «\u202f${str(p.title)}\u202f»\u202f: ${list(p.top)
        .map(
          (r) => `${rank(num((r as P).rank))} ${str((r as P).name)} (${formatNum(num((r as P).points))} pts)`,
        )
        .join(', ')}`,
    'tower.rank.week': (_w, p) =>
      `Classement hebdomadaire de la Tour des chefs\u202f: ${list(p.top)
        .map((r) => `${rank(num((r as P).rank))} ${str((r as P).name)}`)
        .join(', ')}`,
    'tower.shop.rare': (w, p, x) =>
      `${w} a échangé ${x.goodsName(num(p.goodsId))} à la boutique de la Tour des chefs`,
    'tower.elder': (w, p, x) =>
      `${w} a battu l’ancien du ${num(p.floor) === 1 ? '1er' : `${num(p.floor)}e`} étage de la Tour des chefs et a obtenu ${x.goodsName(num(p.goodsId))}`,
    'weather.change': (w, p, x) =>
      p.by !== undefined
        ? `${w} a utilisé le marteau de Thor\u202f: ${x.weatherName(num(p.from))} laisse place à ${x.weatherName(num(p.to))}`
        : `Le temps change\u202f: ${x.weatherName(num(p.from))} laisse place à ${x.weatherName(num(p.to))}`,
    'town.broadcast': (w, p) => `${w}\u202f: ${str(p.text)}`,
    'town.bless': (w, p) => `${w} a fait un vœu et reçu\u202f: ${str(p.blessName) || str(p.name)}`,
    'town.shake.lucky': (w, p, x) =>
      `Bravo\u202f! ${w} a plongé la main dans la poche de M. Krab et en a sorti ${x.goodsName(num(p.goodsId))}\u202f×\u202f${num(p.num)}`,
    'kuji.big': (w, p) =>
      p.tier === 'last'
        ? `${w} a tiré le dernier ticket de l'Ichiban Kuji${p.line === 'deluxe' ? ' de luxe' : ''} et remporte le Dernier Prix\u202f!`
        : `${w} a gagné le prix ${str(p.tier)} à l'Ichiban Kuji${p.line === 'deluxe' ? ' de luxe' : ''}\u202f!`,
    'kuji.win': (w, p) =>
      `${w} a gagné le prix ${str(p.tier)} à l'Ichiban Kuji${p.line === 'deluxe' ? ' de luxe' : ''}`,
    'acquire.big': (w, p) =>
      `${w} a ${p.way === 'listed' ? 'acheté' : 'racheté'} «\u202f${str(p.name)}\u202f» pour ${formatNum(num(p.price))} ${plFr(num(p.price), 'pièce', 'pièces')}`,
    'acquire.redeem': (w, p) =>
      `${w} s'est racheté pour ${formatNum(num(p.price))} ${plFr(num(p.price), 'pièce', 'pièces')}`,
    'fund.big': (w, p) => fundNews(w, p),
    'fund.deposit': (w, p) => fundNews(w, p),
    'icon.buy': (w, p, x) =>
      `${w} a acheté le titre limité «\u202f${x.icon?.(str(p.key))?.title ?? str(p.title)}\u202f»`,
    'town.exchange': (w, p, x) =>
      `${w} a échangé ${x.goodsName(num(p.goodsId))}\u202f×\u202f${num(p.num)} auprès du Maire Grosse Marmite`,
    'predict.result': (_w, p) => predictResult(p),
    'bulk.deal': (_w, p, x) =>
      `Souscription en gros\u202f: ${x.foodName(num(p.foodsId))}\u202f×\u202f${num(p.sold)} vendu à ${formatNum(num(p.price))} pièces, souscrit ${Math.round((num(p.demand) / Math.max(1, num(p.qty))) * 10) / 10} fois`,
  },
  unknown: "Il s'est passé quelque chose en ville",
  someone: 'Un restaurant',
  /** 目录里已经没有的星愿（下架去掉了），外文里不显示中文名 */
  blessGone: 'un vœu étoilé',
};
export default news;
