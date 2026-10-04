import type { Messages } from '../..';
import { plFr } from '../../helpers';

const tower: Messages['tower'] = {
  title: 'Tour des chefs',
  tabs: { tower: 'Tour des chefs', rank: 'Classement des chefs', shop: 'Boutique de renommée' },
  loadFailed: 'Impossible de charger la Tour des chefs',
  noStrength: (n) => `Pas assez d'énergie (il en faut ${n})`,
  noMoreToday: "Plus de défis aujourd'hui",
  challengeFailed: 'Échec du défi',
  challenge: 'Défier',
  duel: {
    items: ['Couleur', 'Arôme', 'Goût', 'Forme', 'Nutrition'],
    test: (win) => `Entraînement : ${win ? 'gagné' : 'perdu'}`,
    win: 'Vous avez gagné',
    lose: 'Vous avez perdu',
    renown: (n) => `, renommée ${n > 0 ? '+' : ''}${n}`,
    rank: (n) => `, vous êtes maintenant ${n === 1 ? '1er' : `${n}e`}`,
    power: (name, power) => `${name} (puissance ${power})`,
    sum: 'Total',
    awards: (text) => `Obtenu : ${text}`,
  },
  floor: {
    needLevel: (n) => `Votre restaurant doit être niveau ${n}`,
    needPrev: (n) => `Battez d'abord l'étage ${n}`,
    night: (floor, hour) => `L'étage ${floor} et au-dessus ouvrent après ${hour} h`,
    tired: "Il est fatigué pour aujourd'hui",
    head: (power, left, total, tickets, strength) =>
      `Ma puissance ${power} · ${left}/${total} ${plFr(total, 'défi restant', 'défis restants')} aujourd'hui · Tickets de défi ${tickets} (à utiliser dans l'entrepôt, un défi de plus aujourd'hui) · Énergie ${strength}`,
    name: (floor, name) => `Étage ${floor} · ${name}`,
    power: (n) => `Puissance ${n}`,
    meta: (note, level, name, left, max) =>
      `« ${note} » À partir du niv. ${level} ; encore ${left}/${max} ${plFr(max, 'défi', 'défis')} contre ${name} aujourd'hui`,
    mc: (name, price) => ` ; plat signature du jour ${name} (${price} la part)`,
    test: (n) => `S'entraîner (${n} énergie)`,
    go: (n) => `Défier (${n} énergie)`,
  },
  friend: {
    loadFailed: 'Impossible de charger les duels',
    noMore: "Plus de duels contre lui aujourd'hui",
    failed: 'Échec du duel',
    btn: 'Duel',
    left: (n) => ` (encore ${n} aujourd'hui)`,
  },
  rank: {
    loadFailed: 'Impossible de charger le classement des chefs',
    top: (top, gap) =>
      `Pour défier le top ${top}, vous devez être classé à ${gap} ${plFr(gap, 'place', 'places')} au plus`,
    occupied: (n) => `Vous prenez la place ${n}`,
    occupyFailed: 'Impossible de prendre la place',
    myRank: 'Mon rang ',
    unranked: 'Non classé',
    rankN: (n) => `${n === 1 ? '1er' : `${n}e`}`,
    head: (left, strength) =>
      ` · encore ${left} ${plFr(left, 'défi', 'défis')} aujourd'hui · ${strength} énergie chacun`,
    weekly:
      'Nouveau classement chaque lundi à 0 h : les places 1 à 3, 4 à 8 et 9 à 15 reçoivent un coffret ; les trois premiers deviennent Dieu, Sage et Roi des chefs',
    slotName: (name, level) => `${name} (niv. ${level})`,
    empty: 'Libre',
    me: 'Moi',
    occupy: 'Prendre la place',
  },
  shop: {
    loadFailed: 'Impossible de charger la boutique de renommée',
    owned: 'Possédé',
    soldOut: 'Épuisé cette semaine',
    noRenown: 'Pas assez de renommée',
    got: (name, n) => `Obtenu : ${name}×${n}`,
    failed: "Échec de l'échange",
    renown: (n) => `Ma renommée ${n}`,
    rule: 'Les tickets Délice sont toujours disponibles ; les statues changent chaque semaine et vous ne pouvez en posséder qu’une',
    limitOne: '1 max',
    meta: (renown, bought, limit) => `${renown} renommée · cette semaine ${bought}/${limit}`,
    btn: 'Échanger',
  },
};
export default tower;
