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
    zeroStar: ' (les restaurants 0 étoile ne sont pas affectés par la météo)',
    zeroStarLine: 'Les restaurants 0 étoile ne sont pas affectés par la météo',
    until: (time) => `Jusqu'à ${time}`,
    krabPre: "M. Krab est aujourd'hui dans la rue ",
    krabPost: ' : les restaurants de cette rue ont plus de chances de recevoir un client mystère.',
    holiday: (n) => `Jour de fête : taux d'obtention des Tickets Délice ×${n}`,
    hammer: 'Avec le Marteau de Thor, vous pouvez changer la météo : ',
    toSquare: 'Aller sur la Place',
  },
  invite: {
    title: 'Inviter des amis',
    loadFailed: 'Impossible de charger les invitations',
    copied: 'Copié',
    copyFailed: 'Impossible de copier ; sélectionnez et copiez vous-même',
    myCode: "Mon code d'invitation",
    copy: 'Copier',
    copyLink: 'Copier le lien',
    rules: (cap) =>
      `Vos amis reçoivent un pack de départ en ouvrant leur restaurant. Une fois leur e-mail vérifié, vous recevez une récompense quand leur restaurant atteint le niveau 10, puis le niveau 30. ${cap} ${plFr(cap, 'ami au plus compte', 'amis au plus comptent')} par mois.`,
    month: (n, cap) => `Comptés ce mois-ci : ${n} / ${cap}`,
    empty: "Vous n'avez encore invité personne",
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
