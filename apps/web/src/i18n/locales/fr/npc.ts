import type { Messages } from '../..';

/** PNJ des pages de fonctionnalités (tickets 441, 443) */
const npc: Messages['npc'] = {
  mayor: {
    name: 'Maire Grosse Marmite',
    lines: [
      'Pâtés de crabe, Tickets Délice, fragments : échangez-les chez moi contre des objets rares.',
      'Où est passé le Garçon hip-hop aujourd’hui ? Dites-le-moi : une bonne réponse vous vaut un bonus.',
      'Je suis le Maire Grosse Marmite. Marmite, pas Mangeur : ne me confondez pas avec Gros Mangeur.',
    ],
  },
  bro13: {
    name: 'Frère 13',
    lines: [
      'Venez discuter avec moi chaque jour, je vous donne un klaxon.',
      'Un bon d’ingrédient s’échange contre un ingrédient ordinaire du même niveau ; vous pouvez en choisir plusieurs.',
    ],
  },
  carmen: {
    name: 'Carmen',
    lines: [
      'Donnez-moi un bon d’ingrédient mystère et choisissez l’ingrédient mystère qui vous plaît.',
      'Les ingrédients mystères servent aux plats signature : choisissez bien.',
    ],
  },
  gary: {
    name: 'Gary',
    lines: [
      'Fonds de développement de la ville : à l’échéance, vous récupérez l’essentiel du dépôt et une médaille d’EXP.',
      'Retirer avant l’échéance rend moins et sans médaille : réfléchissez bien.',
      'Chaque restaurant ne peut avoir qu’un dépôt à la fois.',
    ],
  },
  fanDao: {
    name: 'Le taoïste Fan',
    lines: [
      'Chaque expertise demande une recette mystère et un objet d’expertise.',
      'Une expertise réussie vous donne un fragment d’un plat signature ; avec 3, vous l’apprenez.',
      'Les fragments inutiles se décomposent en éclats ; 3 éclats d’un niveau s’échangent contre 1 fragment de n’importe quel plat de ce niveau.',
    ],
  },
  xiaoKai: {
    name: 'Kai',
    lines: [
      'Une tâche d’événement terminée ? N’oubliez pas de réclamer la récompense.',
      'Les récompenses non réclamées sont envoyées par courrier à la fin de l’événement.',
    ],
  },
  links: {
    classroom: {
      label: 'Salle de classe',
      desc: 'Enseigner, apprendre et apprendre en douce des plats signature',
    },
    mayor: {
      label: 'Maire Grosse Marmite',
      desc: 'Échanger contre des objets rares ; lui dire où est le Garçon hip-hop',
    },
    bro13: { label: 'Frère 13', desc: 'Un klaxon par jour ; échanger les bons d’ingrédients' },
    carmen: { label: 'Carmen', desc: 'Échanger les bons d’ingrédients mystères' },
    fund: { label: 'Gary', desc: 'Fonds de développement de la ville' },
  },
  titles: {
    classroom: 'Salle de classe',
    mayor: 'Échange d’objets rares',
    bro13: 'Échange d’ingrédients',
    carmen: 'Échange d’ingrédients mystères',
    fund: 'Fonds de développement de la ville',
  },
  off: 'Cette fonctionnalité n’est pas encore disponible sur ce serveur',
};
export default npc;
