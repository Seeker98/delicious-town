import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { plFr } from '../../helpers';

/** Commission de la ville (2026-10-16) : page, fonctions, répliques et points du jour */
const commission: Messages['commission'] = {
  title: 'Commission de la ville',
  briefTitle: 'Points du jour',
  briefHint: 'Touchez une ligne pour les voir',
  noticesTitle: 'Communiqués de la commission',
  noticesEmpty: 'La commission n’a encore publié aucun communiqué.',
  noticesFoot: 'Les communiqués paraissent aussi dans les nouvelles de la Place.',
  newTag: 'Nouveau',
  loadFailed: 'Impossible de charger la commission',
  members: {
    mayor: {
      name: 'Maire Grosse Marmite',
      role: 'Président',
      duty: 'Dirige la commission et publie les communiqués',
      lines: [
        'Nous sommes six, chacun son portefeuille. Quand une règle change, on l’annonce d’abord ici.',
        'Les communiqués paraissent aussi dans les nouvelles. Si vous en avez raté un, il est ici.',
      ],
    },
    squid: {
      name: 'Carlo',
      role: 'Commissaire à la santé et à la sécurité alimentaire',
      duty: 'Cafards, souris et hygiène du restaurant',
      lines: [
        'Un cafard sur une table occupée, et cette table ne rapporte rien ce tour-ci.',
        'La tapette passe en premier\u202f: une souris prise vous laisse quelques pièces.',
        'Les équipements anti-nuisibles vont dans les emplacements 4 et 5, ouverts à 2 étoiles.',
        'Chaque jour à 0 h, j’inspecte les restaurants de 2 étoiles et plus, et je note le résultat dans l’activité du restaurant.',
      ],
    },
    fandao: {
      name: 'Le taoïste Fan',
      role: 'Commissaire au climat et à la météo',
      duty: 'Météo et saisons',
      lines: [
        'Chaque changement de temps est consigné dans les nouvelles.',
        'Par temps spécial, tous les plats signature sont de saison.',
      ],
    },
    garden: {
      name: 'Sœur du Potager',
      role: 'Commissaire aux marchés et à la concurrence',
      duty: 'Marché et Bourse',
      lines: [
        'Quand un lot du marché des promos est épuisé, attendez le suivant.',
        'Tout ingrédient s’échange à la Bourse, mais le système ne traite que les rares.',
      ],
    },
    gary: {
      name: 'Gary',
      role: 'Commissaire à l’économie et aux finances',
      duty: 'Fonds de développement et épargne',
      lines: [
        'Fonds de développement de la ville\u202f: à l’échéance, vous récupérez l’essentiel du dépôt et une médaille d’EXP.',
        'Placements\u202f: attendez l’échéance et vous récupérez toutes vos pièces, avec des colis de ravitaillement en guise d’intérêts.',
      ],
    },
    bro13: {
      name: 'Frère 13',
      role: 'Commissaire à la communication',
      duty: 'Klaxons et Journal de la ville',
      lines: [
        'Venez discuter avec moi chaque jour, je vous donne des klaxons.',
        'Un coup de klaxon et toute la ville vous entend.',
      ],
    },
  },
  brief: {
    squid: (kills, visits, steals) =>
      `La ville a tué ${formatNum(kills)} ${plFr(kills, 'cafard', 'cafards')} aujourd’hui\u202f; les souris sont venues ${formatNum(visits)} fois et ont volé ${formatNum(steals)} fois`,
    fandao: (weather, time) => `${weather} en ce moment, change à ${time}`,
    garden: (n, names) =>
      `Marché des promos, ${n} ${plFr(n, 'article restant', 'articles restants')}\u202f: ${names}`,
    /** 特价菜场食材名之间 */
    sep: ', ',
    gardenMore: (names) => `${names}, etc.`,
    gardenNone: (time) => `Marché des promos épuisé\u202f; prochain lot à ${time}`,
    gary: (coin) => `Pièces de la ville dans le Fonds et l’épargne\u202f: ${coin}`,
    bro13: (title) => `Journal\u202f: ${title}`,
    bro13None: 'Pas encore de journal',
    off: 'Pas ouvert sur ce serveur',
  },
  sheet: {
    duty: 'Portefeuille',
    today: 'La ville aujourd’hui',
    mine: 'Votre restaurant',
    mineNone: 'Pas encore inspecté',
    tapHint: 'Touchez le portrait pour une autre réplique',
    rule: 'Une inspection par jour à 0 h, pour les restaurants de 2 étoiles et plus. Les cafards posés par des amis ne comptent pas',
    go: {
      squid: 'Voir mes inspections',
      fandao: 'Voir la météo',
      garden: 'Aller au Marché',
      gary: 'Aller à la Banque',
      bro13: 'Aller sur la Place',
    },
  },
};
export default commission;
