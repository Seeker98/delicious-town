import type { Messages } from '../..';
import { plFr } from '../../helpers';

const misc: Messages['misc'] = {
  redeem: {
    title: 'Code cadeau',
    note: "Les codes sont distribués par l'équipe du jeu et ne tiennent pas compte de la casse. Chaque restaurant peut utiliser un code une seule fois, et la récompense arrive aussitôt.",
  },
  weather: {
    loadFailed: 'Impossible de charger la météo',
    noEffect: "Aucun effet sur l'activité",
    zeroStarLine: 'Les restaurants 0 étoile ne sont pas affectés par la météo',
    until: (time) => `Jusqu'à ${time}`,
    krabPre: "M. Krab est aujourd'hui dans la rue ",
    krabPost: '\u202f: les restaurants de cette rue ont plus de chances de recevoir un client mystère.',
    holiday: (n) => `Jour de fête\u202f: taux d'obtention des Tickets Délice ×${n}`,
    slot: (from, to, next) => `${from} – ${to} · change à ${next} h`,
    coverSlot: (from, to, natural) => `${from} – ${to} · puis retour à ${natural}`,
    cover: (who, item, natural, now, minutes, next) =>
      `${who} a utilisé ${item} pour changer ${natural} en ${now}\u202f: encore ${minutes} min. La météo en dessous continue de changer\u202f; prochain changement à ${next} h.`,
    someone: "Quelqu'un",
    how: {
      title: 'Comment marche la météo',
      fold: 'Replier',
      unfold: 'Déplier',
      lines: (hours) => [
        `La météo change toutes les 4 heures (${hours.map((h) => `${h} h`).join(', ')}) et suit le temps actuel\u202f: pas de neige juste après le soleil, la pluie forcit petit à petit.`,
        'La prévision ci-dessous donne la probabilité de chaque type au prochain changement.',
        'Par mauvais temps, la boussole céleste (choisir un type) ou les bâtonnets du temps (un sur deux) changent la météo pour 1 heure, pour toute la ville.',
      ],
    },
    forecast: {
      title: 'Prévision',
      next: (time) => `Prochain à ${time}`,
      note: 'La météo suit le temps actuel\u202f: elle ne passe pas du soleil à la neige.',
    },
    types: ['', 'Beau', 'Pluie', 'Neige, glace', 'Vent, sable, brume'],
    tools: {
      title: 'Changer la météo',
      compassSub: 'Choisissez un type, le ciel décide du reste · 1 heure',
      lotsSub: 'Tirez deux bâtonnets, gardez-en un · 1 heure',
      have: (n) => `${n} en stock`,
      use: 'Utiliser',
      pick: 'Choisir',
      toMayor: 'Chez le maire',
      toShop: 'Boutique',
      rule: (hours) =>
        `Une fois toutes les ${hours} heures par joueur\u202f; personne ne peut rechanger la météo dans l'heure qui suit un changement.`,
      locked: (minutes, time) =>
        `Quelqu'un vient de changer la météo. Réessayez dans ${minutes} min (après ${time}).`,
      cooling: (used, ready) => `Vous en avez utilisé un à ${used}. Prochain usage après ${ready}.`,
      done: (name, time) => `La météo est maintenant ${name} jusqu'à ${time}`,
      failed: 'Impossible de changer la météo',
    },
    compass: {
      title: 'Boussole céleste\u202f: choisir un type',
      sub: "Le ciel choisit la météo exacte\u202f; elle dure 1 heure pour toute la ville. La boussole n'amène jamais de pluie acide ni de gel.",
      cannot: 'La météo actuelle ne peut pas passer à ce type',
      go: 'Utiliser 1 boussole céleste',
      pickFirst: "Choisissez d'abord un type",
    },
    lots: {
      title: 'Bâtonnets du temps',
      readySub:
        'Tirez deux bâtonnets et gardez-en un\u202f; la météo change pendant 1 heure. Ils suivent la météo actuelle, et parfois une météo spéciale sort.',
      draw: 'Tirer (utilise 1 bâtonnet du temps)',
      pickTitle: 'Bâtonnets du temps\u202f: gardez-en un',
      pickSub: 'Les bâtonnets sont sortis. Gardez-en un\u202f; la météo change pendant 1 heure.',
      lot: (n) => `Bâtonnet ${n}`,
      take: (name) => `Garder ${name}`,
      countdown: (s) => `Sans choix dans ${s} s, le bâtonnet 1 est utilisé`,
    },
  },
  invite: {
    title: 'Inviter des amis',
    loadFailed: 'Impossible de charger les invitations',
    copied: 'Copié',
    copyFailed: 'Impossible de copier\u202f; sélectionnez et copiez vous-même',
    myCode: "Mon code d'invitation",
    copy: 'Copier le code',
    copyLink: 'Copier le lien',
    rules: (cap, lv1, lv2) =>
      `Vos amis reçoivent un pack de départ en ouvrant leur restaurant. Une fois leur e-mail vérifié, vous recevez une récompense quand leur restaurant atteint le niveau ${lv1}, puis le niveau ${lv2}. ${cap} ${plFr(cap, 'ami au plus compte', 'amis au plus comptent')} par mois.`,
    month: (n, cap) => `Comptés ce mois-ci\u202f: ${n} / ${cap}`,
    empty: "Vous n'avez encore invité personne",
    entrySub: (n, cap) =>
      `${n} / ${cap} ${n > 1 ? 'invités' : 'invité'} ce mois-ci · gagnez des récompenses quand vos amis montent de niveau`,
    entrySubPlain: 'Gagnez des récompenses quand vos amis montent de niveau',
    monthLabel: 'Comptés ce mois-ci',
    stepOpen: 'L’ami ouvre',
    stepOpenGift: 'Pack de départ',
    stepLevel: (n) => `Ami au niveau ${n}`,
    stepYou: 'Vous en recevez un',
    stepAgain: 'Un de plus',
    rulesShort: (cap) =>
      `Un ami compte une fois son e-mail vérifié. ${cap} ${cap > 1 ? 'amis' : 'ami'} au plus par mois.`,
    listTitle: 'Mes amis invités',
    people: (n) => `${n} ${n > 1 ? 'personnes' : 'personne'}`,
    level: (n) => `Niveau ${n}`,
    noRest: 'Pas encore de restaurant',
    unverified: 'E-mail non vérifié',
    stage: {
      sent: (lv) => `Récompense du niveau ${lv} envoyée`,
      pending: (lv) =>
        `Récompense du niveau ${lv} en attente (envoyée quand vous ouvrirez un restaurant sur ce serveur)`,
      capped: (lv) => `Récompense du niveau ${lv} au-delà de la limite du mois`,
    },
  },
};
export default misc;
