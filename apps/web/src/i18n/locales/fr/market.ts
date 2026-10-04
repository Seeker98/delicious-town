import type { Messages } from '../..';
import { plFr } from '../../helpers';

const market: Messages['market'] = {
  sections: {
    daily: 'Marché du jour',
    special: 'Marché des promos',
    premium: "Marché premium (collier d'amour requis)",
  },
  specialNote: (min) =>
    `e-mail vérifié requis, 1 de chaque par personne ; un achat par réseau toutes les ${min} min`,
  manualConfirm: (cost, time) =>
    `Dépenser ${cost} ${plFr(cost, 'pièce', 'pièces')} pour mettre 4 plats du jour en rayon ? Ils seront retirés au prochain réapprovisionnement (${time}).`,
  manualDone: (renown) => `Réapprovisionné. Renommée +${renown}`,
  manualFailed: 'Échec du réapprovisionnement',
  buyFailed: "Échec de l'achat",
  capShared: (shared, can) =>
    `Votre réseau ou appareil en a déjà acheté ${shared} ce tour-ci (limite par restaurant, appareil et réseau). Vous pouvez encore en acheter ${can}`,
  capSlots: "Votre garde-manger n'a plus d'emplacement libre. Libérez-en un d'abord",
  capFull: (max) => `Votre garde-manger est plein pour cet ingrédient (max ${max} chacun)`,
  capRoom: (max, have, room) =>
    `Max ${max} par ingrédient ; vous en avez ${have}, vous pouvez donc en acheter ${room} de plus`,
  guessFailed: 'Échec du pronostic',
  loadFailed: 'Impossible de charger le marché',
  nextStock: (time) => `Prochain arrivage ${time}`,
  manualBtn: (cost) => `Réapprovisionner (${cost} ${plFr(cost, 'pièce', 'pièces')})`,
  specialWait: (min) =>
    `Vous venez d'acheter une promo. Votre réseau doit attendre ${min} min avant la suivante`,
  empty: 'Rien en rayon pour le moment',
  hot: 'Populaire',
  ownFree: 'Votre propre stock, gratuit',
  stockedBy: (name) => `Mis en rayon par ${name}`,
  left: (n) => `Reste ${n}`,
  priceLine: (price, left, bought, limit) =>
    `${price} ${plFr(price, 'pièce', 'pièces')} · reste ${left} · acheté ${bought}/${limit}`,
  buy: 'Acheter',
  guess: {
    title: 'Pronostic du marché',
    hint: (hour) => `Devinez ce que vendra le prochain marché du jour (${hour} h)`,
    last: (n) => `La dernière fois : ${n} ${plFr(n, 'bonne réponse', 'bonnes réponses')}`,
    joined: (list) => `Inscrit : ${list}`,
    rule: (max, cost) => `Choisissez jusqu'à ${max}, coût : ${cost} ${plFr(cost, 'bon', 'bons')} mystère`,
    join: (n) => `S'inscrire (${n} ${plFr(n, 'choisi', 'choisis')})`,
  },
  sis: {
    name: 'Sœur du Potager',
    chat: [
      'Nouveau ? Jetez d’abord un œil à « Plus → Autres → Guide ». Il y a aussi un code de bienvenue.',
      'Chaque ingrédient a une limite dans le garde-manger, n’en achetez pas trop d’un coup.',
      'La météo influence vos clients. Pensez à regarder le temps du jour.',
      'Les ingrédients universels de niveau 1 et 2 s’échangent contre des rares au garde-manger. À partir du niveau 3, ils servent seulement à remplacer un ingrédient pour apprendre une recette.',
      'Le marché du jour se réapprovisionne toutes les deux heures en journée.',
      'Le marché des promos se réapprovisionne toutes les heures. C’est là que les ingrédients de haut niveau sont les moins chers.',
      'Récoltez votre potager dès qu’il est mûr, sinon quelqu’un va le voler.',
      'Mes légumes sont les plus frais de la ville !',
      'Plus vous savez cuisiner de plats, plus vous avez de clients.',
      'Pointez chaque jour sur l’accueil pour recevoir un cadeau.',
      'M. Krab est encore venu marchander. Pff.',
      'Sœur Wen offre des bons sur la place tous les jours. Allez discuter avec elle.',
      'Le Gros Mangeur peut dévorer la moitié de mon étal en une journée.',
      'Passez sur la place : répondez bien à la question du maire et vous gagnez un prix.',
      'Les ingrédients semblent chers, mais une bonne recette est vite rentabilisée.',
      'Un bon pronostic au marché rapporte de beaux prix.',
      'Plus d’amis, c’est plus d’entraide et de meilleures affaires.',
      'Faites une pause si vous êtes fatigué. L’énergie remonte un peu à chaque tour.',
      'Une question ? Consultez la section « Guides » du forum.',
      'Le marché premium ne se réapprovisionne que trois fois par jour. Ratez-le et il faudra attendre.',
    ],
    specialLeft: (n) => `Encore ${n} ${plFr(n, 'promo', 'promos')}. Faites vite !`,
    specialSoldOut: (time) => `Les promos sont épuisées. Prochain arrivage à ${time}.`,
    nextDaily: (time) => `Le marché du jour se réapprovisionne à ${time}. Repassez voir.`,
    guessOpen: 'Vous n’avez pas encore fait votre pronostic pour ce tour. Essayez ci-dessous ?',
    hasCard:
      'Vous avez un permis de travail du marché. Réapprovisionnez vous-même si vous ne voulez pas attendre.',
    cupboardFull: 'Votre garde-manger est plein. Faites de la place avant d’acheter.',
  },
};
export default market;
