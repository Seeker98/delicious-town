import type { Messages } from '../..';

/** PNJ des pages de fonctionnalités (tickets 441, 443) */
const npc: Messages['npc'] = {
  mayor: {
    name: 'Maire Grosse Marmite',
    lines: [
      'Pâtés de crabe, Tickets Délice, fragments\u202f: échangez-les chez moi contre des objets rares.',
      'Où est passé le Garçon hip-hop aujourd’hui\u202f? Dites-le-moi\u202f: une bonne réponse vous vaut un bonus.',
      'Je suis le Maire Grosse Marmite. Passez discuter chaque jour\u202f: un ingrédient et une graine pour vous.',
    ],
  },
  bro13: {
    name: 'Frère 13',
    lines: [
      'Venez discuter avec moi chaque jour, je vous donne des klaxons.',
      'Un bon d’ingrédient s’échange contre un ingrédient ordinaire du même niveau\u202f; vous pouvez en choisir plusieurs.',
    ],
  },
  carmen: {
    name: 'Carmen',
    lines: [
      'Donnez-moi un bon d’ingrédient mystère et choisissez l’ingrédient mystère qui vous plaît.',
      'Les ingrédients mystères servent aux plats signature\u202f: choisissez bien.',
      'Première visite\u202f? Je vous offre un bon d’ingrédient mystère.',
    ],
  },
  gary: {
    name: 'Gary',
    lines: [
      'Fonds de développement de la ville\u202f: à l’échéance, vous récupérez l’essentiel du dépôt et une médaille d’EXP.',
      'Retirer avant l’échéance rend moins et sans médaille\u202f: réfléchissez bien.',
      'Chaque restaurant ne peut avoir qu’un dépôt à la fois.',
    ],
  },
  fanDao: {
    name: 'Le taoïste Fan',
    lines: [
      'Chaque expertise demande une recette mystère et un objet d’expertise.',
      'Une expertise réussie vous donne un fragment d’un plat signature\u202f; avec 3, vous l’apprenez.',
      'Les fragments inutiles se décomposent en éclats\u202f; assez d’éclats d’un niveau s’échangent contre 1 fragment d’un plat de ce niveau que vous ne connaissez pas.',
    ],
  },
  xiaoKai: {
    name: 'Kai',
    lines: [
      'Une tâche d’événement terminée\u202f? N’oubliez pas de réclamer la récompense.',
      'Les récompenses non réclamées sont envoyées par courrier à la fin de l’événement.',
    ],
  },
  links: {
    classroom: {
      label: 'Classe',
      desc: 'Enseigner, apprendre et apprendre en douce des plats signature',
    },
    mayor: {
      label: 'Maire Grosse Marmite',
      desc: 'Discussion quotidienne\u202f: ingrédient et graine\u202f; objets rares\u202f; où est le Garçon hip-hop',
    },
    bro13: {
      label: 'Frère 13',
      desc: 'Discussion quotidienne\u202f: des klaxons\u202f; échanger les bons d’ingrédients',
    },
    carmen: {
      label: 'Carmen',
      desc: 'Échanger les bons d’ingrédients mystères\u202f; un offert à la première visite',
    },
    fund: { label: 'Gary', desc: 'Fonds de développement de la ville' },
  },
  titles: {
    classroom: 'Classe',
    mayor: 'Échange d’objets rares',
    bro13: 'Échange d’ingrédients',
    carmen: 'Échange d’ingrédients mystères',
    fund: 'Fonds de développement de la ville',
  },
  /** 镇长页底部：兑换券分给了 13 哥和卡门 */
  ticketsHint:
    'Bons d’ingrédients\u202f: voir Frère 13\u202f; bons d’ingrédients mystères\u202f: voir Carmen —',
  off: 'Cette fonctionnalité n’est pas encore disponible sur ce serveur',
};
export default npc;
