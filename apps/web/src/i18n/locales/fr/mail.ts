import type { Messages } from '../..';

const mail: Messages['mail'] = {
  title: 'Boîte aux lettres',
  loadFailed: 'Impossible de charger le courrier',
  claimFailed: 'Impossible de récupérer',
  deleteFailed: 'Échec de la suppression',
  claimAllPartial: (claimed, failed) => `${claimed} récupéré(s), ${failed} en échec. Réessayez plus tard.`,
  claimAll: 'Tout récupérer',
  empty: 'Aucun courrier',
  claim: 'Récupérer',
  delete: 'Supprimer',
  daysLeft: (n) => ` · encore ${n} jour(s)`,
  needLevel: (n) => `· niv. ${n} requis`,
  claimed: '· Récupéré',
  broken: "· La pièce jointe n'est plus valide, contactez le support",
  items: (text) => `Pièces jointes : ${text}`,
  redeem: {
    placeholder: 'Saisissez un code cadeau',
    label: 'Code cadeau',
    btn: 'Utiliser',
    done: (text) => `Code utilisé : ${text}`,
    failed: "Échec de l'utilisation du code",
  },
};
export default mail;
