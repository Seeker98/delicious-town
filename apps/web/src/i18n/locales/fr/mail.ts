import type { Messages } from '../..';
import { plFr } from '../../helpers';

const mail: Messages['mail'] = {
  title: 'Boîte aux lettres',
  loadFailed: 'Impossible de charger le courrier',
  claimFailed: 'Impossible de récupérer',
  deleteFailed: 'Échec de la suppression',
  claimAllPartial: (claimed, failed) =>
    `${claimed} ${plFr(claimed, 'récupéré', 'récupérés')}, ${failed} en échec. Réessayez plus tard.`,
  claimAll: 'Tout récupérer',
  empty: 'Aucun courrier',
  claim: 'Récupérer',
  delete: 'Supprimer',
  daysLeft: (n) => ` · encore ${n} ${plFr(n, 'jour', 'jours')}`,
  needLevel: (n) => `· niv. ${n} requis`,
  claimed: '· Récupéré',
  broken: "· La pièce jointe n'est plus valide, contactez le support",
  items: (text) => `Pièces jointes\u202f: ${text}`,
  expires: (n) => `Encore ${n} ${n === 1 ? 'jour' : 'jours'}`,
  redeemSub: 'Saisissez un code pour recevoir des récompenses',
  listTitle: 'Courrier',
  countLine: (n, can) => (can > 0 ? `${n} · ${can} à récupérer` : `${n}`),
  openLabel: (title) => `Ouvrir le courrier\u202f: ${title}`,
  iconMark: 'T',
  needLevelTag: (n) => `Niveau ${n} requis`,
  claimedTag: 'Récupéré',
  brokenTag: 'Pièce jointe invalide',
  emptyBody: 'Récompenses d’événements, lots de classement et compensations arrivent ici',
  itemsTitle: 'Pièces jointes',
  redeem: {
    placeholder: 'Saisissez un code cadeau',
    label: 'Code cadeau',
    btn: 'Utiliser',
    done: (text) => `Code utilisé\u202f: ${text}`,
    failed: "Échec de l'utilisation du code",
  },
};
export default mail;
