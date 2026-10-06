import type { RestLogDto } from '@dt/shared';
import type { Messages } from '../..';
import type { Names } from '../../../utils/events';
import { formatNum } from '../../../utils/format';
import fund from './fund';
import { n, type P, plFr } from '../../helpers';

const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `Plat signature ${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `Graine ${id}`;
const holdHours = (p: P) => (p.holdHours === undefined ? 24 : n(p, 'holdHours'));
const heldNote = (p: P) =>
  p.held
    ? ` (transaction suspecte : gains gelés pendant ${holdHours(p)} ${plFr(holdHours(p), 'heure', 'heures')})`
    : '';
const coinFoods = (p: P, names: Names, coin: (s: string) => string) =>
  [
    ...(n(p, 'coin') > 0 ? [coin(formatNum(n(p, 'coin')))] : []),
    ...(Array.isArray(p.foods) ? p.foods : []).map(
      (f) => `${names.foodName(Number((f as P).foodsId))}\u202f×\u202f${Number((f as P).num)}`,
    ),
  ].join(', ');
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `, bilan ${d > 0 ? '+' : ''}${formatNum(d)}`;
}
const side = (p: P) => (p.side === 'buy' ? "d'achat" : 'de vente');

function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? "Quelqu'un");
  switch (item.type) {
    case 'takeaway.hired':
      return `${who} vous a embauché comme livreur`;
    case 'dine.start':
      return `${who} mange gratis à la table ${String(p.table)} de votre restaurant`;
    case 'dine.expelled':
      return `${who} vous a mis à la porte de son restaurant ; vous avez payé ${String(p.coin)} ${plFr(String(p.coin), 'pièce', 'pièces')}`;
    case 'roach.laid':
      return `${who} a lâché un cafard à la table ${String(p.table)} de votre restaurant`;
    case 'roach.killed':
      return `${who} a écrasé le cafard de votre table ${String(p.table)}`;
    case 'friend.refuel':
      return `${who} vous a ajouté ${String(p.oil)} d'huile`;
    case 'friend.flip':
      if (p.outcome === 'food')
        return `${who} a fouillé votre garde-manger et pris ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught')
        return `${who} s'est pris dans une tapette en fouillant votre garde-manger et vous a laissé ${String(p.coin)} ${plFr(String(p.coin), 'pièce', 'pièces')}`;
      return `${who} a fouillé votre garde-manger sans rien trouver`;
    case 'exchange':
      return p.result === 'caught'
        ? `${who} a été pris en voulant échanger vos ingrédients verrouillés`
        : `${who} a échangé des ingrédients avec vous`;
    case 'mc.eaten':
      return `${who} a goûté votre plat signature`;
    case 'lesson.taught':
      if (!p.success)
        return `${who} ${p.type === 2 ? "n'a pas réussi à espionner" : "n'a rien appris"} à votre cours`;
      return `${who} ${p.type === 2 ? 'a espionné avec succès' : 'a appris un plat signature'} à votre cours`;
    case 'thumb':
      return `${who} vous a donné un pouce levé`;
    case 'friend.apply':
      return `${who} vous a envoyé une demande d'ami`;
    case 'yard.helped': {
      const what = p.what === 'weed' ? 'a désherbé' : p.what === 'deworm' ? 'a déparasité' : 'a arrosé';
      return `${who} ${what} votre ${foodName(Number(p.foodsId))}`;
    }
    case 'yard.stolen': {
      const caught = p.punished
        ? `, s'est fait attraper par votre border collie et a laissé ${foodName(Number(p.punished))}`
        : '';
      return `${who} a volé votre ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
    case 'friend.accept':
      return `${who} a accepté votre demande d'ami`;
    default:
      return item.type;
  }
}

const events: Messages['events'] = {
  gain: 'Obtenu',
  loss: 'Dépensé',
  kind: {
    coin: 'Pièces',
    diamond: 'Diamants',
    exp: 'EXP',
    renown: 'Renommée',
    oil: 'Huile',
    strength: 'Énergie',
  },
  remnant: (names, id) => `Fragment de ${mcNameOf(names, id)}`,
  seed: (names, id) => seedNameOf(names, id),
  basket: (name) => `Panier · ${name}`,
  activityCurrency: (name, num) =>
    `${name ?? "Monnaie d'événement"}\u202f×\u202f${num} (monnaie d'événement)`,
  lucky: ' (chanceux)',
  sep: ', ',
  groupSep: ' ; ',
  more: (text, count) => `${text} et plus (${count} au total)`,
  logs: {
    'mc.learn': (p, names) => `A appris le plat signature « ${mcNameOf(names, n(p, 'mcId'))} »`,
    'mc.levelUp': (p, names) =>
      `Maîtrise de « ${mcNameOf(names, n(p, 'mcId'))} » au niveau ${n(p, 'curlevel')}`,
    'mc.forget': (p, names) => {
      const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
      const lost = typeof p.lost === 'number' ? p.lost : 0;
      if (typeof p.grades === 'number')
        return `Espionnage raté : ${k} ${plFr(k, 'recette a perdu', 'recettes ont perdu')} ${p.grades} ${plFr(p.grades, 'niveau de qualité', 'niveaux de qualité')}${lost > 0 ? `, dont ${lost} ${plFr(typeof p.lost === 'number' ? p.lost : 0, 'oubliée', 'oubliées')}` : ''}${p.mcId ? ` et vous avez oublié le plat signature « ${mcNameOf(names, n(p, 'mcId'))} »` : ''}`;
      return `Espionnage raté : ${k} ${plFr(k, 'recette oubliée', 'recettes oubliées')}${p.mcId ? ` ainsi que le plat signature « ${mcNameOf(names, n(p, 'mcId'))} »` : ''}`;
    },
    'temple.trial': (p, names) =>
      p.success
        ? `« ${mcNameOf(names, n(p, 'mcId'))} » a réussi l'épreuve : valeur d'épreuve +${n(p, 'worth')}\u202f%, EXP d'épreuve +${n(p, 'exp')}\u202f%`
        : `« ${mcNameOf(names, n(p, 'mcId'))} » a échoué à l'épreuve`,
    'kraken.forget': (p, names) =>
      `Le Kraken était mécontent ; vous avez oublié le plat signature « ${mcNameOf(names, n(p, 'mcId'))} »`,
    'equip.stress': (p, names) =>
      `Renforcement de ${names.goodsName(n(p, 'goodsId'))} à +${n(p, 'to')} : ${p.success ? 'réussi' : 'raté'}`,
    'level.up': (p) => `Le restaurant passe au niveau ${n(p, 'to')}`,
    'star.up': (p) => `Le restaurant atteint ${n(p, 'star')} ${plFr(n(p, 'star'), 'étoile', 'étoiles')}`,
    'oil.expand': (p) =>
      `Bidon d'huile agrandi au niveau ${n(p, 'level')} (max ${formatNum(n(p, 'oilMax'))})`,
    'rest.closed': () => "Plus d'huile : le restaurant a fermé",
    'rest.reopen': () => "Plein d'huile fait : le restaurant a rouvert",
    'rest.rename': (p) => `Restaurant renommé « ${String(p.to ?? '')} »`,
    'rest.move': () => 'Le restaurant a déménagé',
    'mouse.escape': () => "Une souris est passée, mais par chance rien n'est arrivé",
    'mouse.trap': (p) =>
      `La tapette a attrapé une souris : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce obtenue', 'pièces obtenues')}`,
    'mouse.steal': (p, names) =>
      `Une souris a volé ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'num')}`,
    'mouse.nothing': () => "Une souris est passée mais n'a rien volé",
    'mouse.map': () => "Une souris a laissé une carte d'exploration",
    'krab.happy': () => 'M. Krab a adoré le repas',
    'krab.angry': () => 'M. Krab est reparti déçu',
    'krab.husky': () => "M. Krab a caressé le husky et ne s'est pas fâché",
    'krab.painting': () => 'M. Krab a admiré le tableau et est reparti satisfait',
    'krab.driven': () => 'M. Krab en colère a été chassé',
    'plankton.appear': () => 'Plancton est venu au restaurant',
    'plankton.driven': () => 'Plancton a été chassé',
    'fridge.drop': (p, names) =>
      `Frigo plein : ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'num')} jeté`,
    'goods.drop': (p, names) =>
      `Limite de possession dépassée : ${names.goodsName(n(p, 'goodsId'))}\u202f×\u202f${n(p, 'num')} jeté`,
    'device.place': (p, names) => `A installé ${names.goodsName(n(p, 'goodsId'))}`,
    'store.use': (p, names) => `A utilisé ${names.goodsName(n(p, 'goodsId'))}\u202f×\u202f${n(p, 'num')}`,
    'admin.grant': (p) => `Compensation : ${String(p.reason ?? '')}`,
    redeem: (p) => `Code utilisé : ${String(p.code ?? '')}`,
    'bar.darts': (p) =>
      `Fléchettes au bar : ${p.result === 'win' ? 'victoire' : p.result === 'draw' ? 'égalité' : 'défaite'}`,
    'bar.devil': (p) =>
      p.result === 'win'
        ? `Piment du Diable : ${n(p, 'survived')} ${plFr(n(p, 'survived'), 'verre tenu', 'verres tenus')}, victoire`
        : `Piment du Diable : ${n(p, 'survived')} ${plFr(n(p, 'survived'), 'verre tenu', 'verres tenus')}, puis K.-O.`,
    'bar.memory': (p) => `Cocktail Mémoire niveau ${n(p, 'level')} : ${p.correct ? 'réussi' : 'raté'}`,
    'bar.nim': (p) =>
      `Le dernier bonbon (table ${p.table === 'expert' ? 'experts' : 'débutants'}) : ${p.result === 'win' ? 'gagné' : 'perdu'}`,
    'bar.spice': (p) =>
      p.result === 'win'
        ? `Mélange secret : trouvé à l’essai ${n(p, 'tries')}`
        : `Mélange secret : pas trouvé en ${n(p, 'tries')} essais`,
    'bar.deal': (p, names) =>
      p.result === 'deal'
        ? `À prendre ou à laisser : marché conclu pour ${formatNum(n(p, 'coin'))} pièces`
        : `À prendre ou à laisser : vous avez ouvert votre boîte et obtenu ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'num')}`,
    // 收购（问题记录 421）
    'acquire.bought': (p) =>
      `${p.way === 'listed' ? 'Achat de' : 'Rachat de'} « ${String(p.name ?? '')} »${p.way === 'listed' ? ' (en vente)' : ''} pour ${formatNum(n(p, 'price'))} pièces`,
    'acquire.taken': (p) =>
      `« ${String(p.byName ?? '')} » a racheté votre restaurant pour ${formatNum(n(p, 'price'))} pièces`,
    'acquire.sold': (p) =>
      `« ${String(p.to ?? '')} » vous a acheté « ${String(p.name ?? '')} » ; vous recevez ${formatNum(n(p, 'got'))} pièces`,
    'acquire.redeemed': (p) =>
      `Vous avez racheté votre restaurant à « ${String(p.from ?? '')} » pour ${formatNum(n(p, 'price'))} pièces`,
    'acquire.lost': (p) =>
      `« ${String(p.name ?? '')} » s’est racheté ; vous recevez ${formatNum(n(p, 'got'))} pièces`,
    'acquire.released': (p) => `Vous avez libéré « ${String(p.name ?? '')} »`,
    'acquire.freed': (p) =>
      `« ${String(p.byName ?? '')} » a libéré votre restaurant ; vous êtes de nouveau indépendant`,
    'acquire.dividend': (p) =>
      `Dividendes d'hier de vos ${n(p, 'n')} restaurant(s) : ${formatNum(n(p, 'coin'))} pièces`,
    'acquire.tended': (p) =>
      `Vous avez entretenu le restaurant pour votre propriétaire « ${String(p.ownerName ?? '')} » et reçu ${n(p, 'n')} ingrédients`,
    'dine.started': (p) => `A commencé à manger gratis chez « ${String(p.hostName ?? '')} »`,
    'dine.ended': (p) => `A fini de manger gratis chez « ${String(p.hostName ?? '')} »`,
    'forum.post': (p) => `A publié le sujet n° ${n(p, 'postId')} sur le forum`,
    'forum.reply': (p) => `A répondu au sujet n° ${n(p, 'postId')} du forum`,
    'forum.edit': (p) => `A modifié le sujet n° ${n(p, 'postId')} du forum`,
    'forum.delete': (p) => `A supprimé le sujet n° ${n(p, 'postId')} du forum`,
    'forum.reply.delete': (p) => `A supprimé une réponse dans le sujet n° ${n(p, 'postId')}`,
    'forum.admin': (p) => `A modéré le sujet n° ${n(p, 'postId')} du forum`,
    'friend.weekly': (p, names) =>
      `${n(p, 'rank')}e du classement hebdomadaire des amis, gagne ${names.goodsName(n(p, 'goodsId'))}`,
    'hiphop.event': () => 'Le Garçon hip-hop a organisé un événement au restaurant',
    'hiphop.tip': () => 'A donné un pourboire au Garçon hip-hop',
    'hiphop.wage': (p, names) => `A touché le salaire du Garçon hip-hop (${names.goodsName(n(p, 'cardId'))})`,
    'hiphop.weekly': (p, names) =>
      `${n(p, 'rank')}e du classement hip-hop hebdomadaire, gagne ${names.goodsName(n(p, 'goodsId'))}`,
    'market.manual': (p) =>
      `Réapprovisionnement manuel au marché pour ${formatNum(n(p, 'cost'))} ${plFr(formatNum(n(p, 'cost')), 'pièce', 'pièces')}`,
    'market.share': (p, names) =>
      `Vos ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'num')} partagés au marché ont été achetés`,
    'takeaway.open': () => 'A ouvert la vente à emporter',
    'takeaway.refresh': (p) => `A actualisé les commandes à emporter (${n(p, 'times')} fois aujourd'hui)`,
    'takeaway.deliver': () => 'A envoyé une commande à emporter',
    'takeaway.claim': (p) =>
      p.success
        ? `Commande livrée : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce obtenue', 'pièces obtenues')}`
        : 'La livraison a échoué',
    'takeaway.rebate': (p) =>
      `Livraison effectuée comme livreur : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce', 'pièces')} et ${formatNum(n(p, 'exp'))} EXP obtenus`,
    'takeaway.hire': () => 'A embauché un ami comme livreur',
    'takeaway.dismiss': () => 'A payé et libéré un livreur',
    'tower.rank.week': (p, names) =>
      `${n(p, 'rank')}e du classement hebdomadaire de la Tour des chefs, gagne ${names.goodsName(n(p, 'goodsId'))}`,
    'town.exchange': (p) => `A fait ${n(p, 'num')} ${plFr(n(p, 'num'), 'échange', 'échanges')} à la Guilde`,
    'town.levelTicket': (p) =>
      `A utilisé un bon d'ingrédients de niveau ${n(p, 'level')} pour ${n(p, 'total')} ${plFr(n(p, 'total'), 'ingrédient', 'ingrédients')}`,
    'town.mysteryTicket': (p, names) =>
      `A obtenu ${names.foodName(n(p, 'foodsId'))} avec un bon d'ingrédient mystère`,
    'town.feast': () => 'A participé au festin sur la place',
    'town.hammer': () => 'A frappé avec le marteau météo et changé le temps',
    'town.mayor': (p) =>
      p.right
        ? 'A bien répondu à la question du Maire Grosse Marmite'
        : 'A mal répondu à la question du Maire Grosse Marmite',
    'town.shake': (p) =>
      `A secoué l'arbre à pièces : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce', 'pièces')}`,
    'town.talk': () => 'A discuté avec les habitants',
    'town.wish': () => 'A fait un vœu sur la place',
    'exchange.order': (p, names) =>
      `Ordre ${side(p)} passé en bourse : ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'qty')} à ${formatNum(n(p, 'price'))} l'unité${n(p, 'filled') > 0 ? ` (${n(p, 'filled')} exécutés immédiatement)` : ''}${heldNote(p)}`,
    'exchange.fill': (p, names) =>
      p.side === 'sell'
        ? `Ordre de vente exécuté : ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'qty')} à ${formatNum(n(p, 'price'))} l'unité, frais ${formatNum(n(p, 'fee'))}${p.held ? heldNote(p) : ' (gains sur votre compte de bourse)'}`
        : `Ordre d'achat exécuté : ${names.foodName(n(p, 'foodsId'))}\u202f×\u202f${n(p, 'qty')} à ${formatNum(n(p, 'price'))} l'unité${p.held ? heldNote(p) : ' (ingrédients sur votre compte de bourse)'}`,
    'exchange.cancel': (p, names) =>
      `Ordre ${side(p)} annulé : ${names.foodName(n(p, 'foodsId'))}, ${n(p, 'left')} restitués`,
    'exchange.expire': (p, names) =>
      `Ordre ${side(p)} expiré : ${names.foodName(n(p, 'foodsId'))}, les ${n(p, 'left')} restants reviennent sur votre compte de bourse`,
    'exchange.withdraw': (p, names) =>
      `Retrait du compte de bourse : ${coinFoods(p, names, (c) => `${c} ${plFr(c, 'pièce', 'pièces')}`)}`,
    'exchange.freezeCancel': (p, names) =>
      `Bourse gelée, ordre ${side(p)} annulé : ${names.foodName(n(p, 'foodsId'))}, les ${n(p, 'left')} restants reviennent sur votre compte de bourse`,
    'exchange.confiscate': (p, names) =>
      `Gains gelés de la bourse confisqués : ${coinFoods(p, names, (c) => `${c} ${plFr(c, 'pièce', 'pièces')}`)}`,
    'predict.trade': (p) =>
      `Prédiction « ${String(p.title ?? '')} » : ${p.dir === 'sell' ? 'vendu' : 'acheté'} ${n(p, 'qty')} ${plFr(n(p, 'qty'), 'part', 'parts')} ${p.side === 'no' ? 'Non' : 'Oui'} pour ${formatNum(n(p, 'amount'))}, frais ${formatNum(n(p, 'fee'))}`,
    'predict.settle': (p) =>
      `Prédiction « ${String(p.title ?? '')} » : résultat ${p.outcome ? 'Oui' : 'Non'}, ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce reçue', 'pièces reçues')}${predictNet(p)}`,
    'predict.refund': (p) =>
      `Prédiction « ${String(p.title ?? '')} » annulée : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce remboursée', 'pièces remboursées')}${predictNet(p)}`,
    'kuji.buy': (p) =>
      `A acheté ${n(p, 'num')} ${plFr(n(p, 'num'), 'ticket', 'tickets')} d'Ichiban Kuji${p.line === 'deluxe' ? ' de luxe' : ''} pour ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce', 'pièces')}`,
    'kuji.activation': (p) =>
      `Récompense d'activité de ${n(p, 'points')} ${plFr(n(p, 'points'), 'point', 'points')} reçue, avec ${n(p, 'num')} ${plFr(n(p, 'num'), 'ticket', 'tickets')} d'Ichiban Kuji en bonus`,
    'kuji.draw': (p) => {
      const tiers = Object.entries((p.tiers ?? {}) as Record<string, number>)
        .map(([k, v]) => `prix ${k}\u202f×\u202f${v}`)
        .join(', ');
      return `A tiré ${n(p, 'num')} ${plFr(n(p, 'num'), 'ticket', 'tickets')} du tirage n° ${n(p, 'seq')} de l'Ichiban Kuji${p.line === 'deluxe' ? ' de luxe' : ''} : ${tiers}${p.last ? ', plus le Dernier Prix' : ''}`;
    },
    'fund.deposit': (p) =>
      `A déposé ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce', 'pièces')} dans le Fonds de développement (${fund.tierName(String(p.tier ?? ''))})`,
    'fund.claim': (p, names) =>
      `A récupéré son dépôt échu du Fonds de développement : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce', 'pièces')} et ${names.goodsName(n(p, 'medal'))}`,
    'fund.withdraw': (p) =>
      `A retiré son dépôt du Fonds de développement avant l'échéance : ${formatNum(n(p, 'coin'))} ${plFr(formatNum(n(p, 'coin')), 'pièce récupérée', 'pièces récupérées')}`,
    'activity.claim': (p) => `A récupéré les récompenses de l'événement « ${String(p.title ?? '')} »`,
    'activity.unlock': (p) =>
      `A débloqué les récompenses premium de l'événement « ${String(p.title ?? '')} »`,
    'activity.exchange': (p) =>
      `A fait ${String(p.times ?? 1)} ${plFr(String(p.times ?? 1), 'échange', 'échanges')} dans l'événement « ${String(p.title ?? '')} »`,
    'mail.claim': (p) => `A récupéré les pièces jointes du courrier « ${String(p.title ?? '')} »`,
    'admin.rename': (p) =>
      `Un administrateur a renommé le restaurant de « ${String(p.from ?? '')} » en « ${String(p.to ?? '')} » : ${String(p.reason ?? '')}`,
    'market.guess': (p) => `Résultat du pronostic du marché : ${n(p, 'hits')} bonnes réponses`,
    'market.guess.refund': (p) => {
      const [day, hour] = String(p.period ?? '').split('@');
      return `Le pronostic du marché du ${day} à ${Number(hour)} h n'a pas été tiré ; vos frais d'inscription ont été remboursés`;
    },
  },
  feed: describeFeed,
};
export default events;
