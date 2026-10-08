import type { Messages } from '../..';
import { n, num, str, plFr } from '../../helpers';

const server: Messages['server'] = {
  mail: {
    'activity.unclaimed': {
      title: (p) => `Récompenses non récupérées\u202f: «\u202f${str(p.activity)}\u202f»`,
      body: () =>
        "Il vous restait ces récompenses à récupérer à la fin de l'événement\u202f: les voici par courrier.",
    },
    'activity.rank': {
      title: (p) =>
        `«\u202f${str(p.activity)}\u202f»\u202f: récompense de la ${n(p, 'rank')}e place au classement`,
      body: () =>
        "Merci pour votre contribution à l'effort commun du serveur. Voici votre récompense de classement.",
    },
    grant: { title: () => 'Compensation', body: null },
    'quest.compensate': {
      title: () => 'Complément de récompenses de quêtes',
      body: () =>
        'Les récompenses pour passer à 1 et 2 étoiles ont changé\u202f: voici les objets que vous n’aviez pas encore reçus.',
    },
    'invite.welcome': {
      title: () => 'Bienvenue en ville',
      body: () => 'Un ami vous a invité\u202f: voici un pack de départ.',
    },
    'invite.reward': {
      title: () => "Récompense d'invitation",
      body: (p) =>
        `«\u202f${str(p.rest)}\u202f», que vous avez invité, a atteint le niveau ${n(p, 'level')}. Merci d'avoir fait venir un ami en ville\u202f!`,
    },
    'hat.upgrade': {
      title: () => 'Chapeau de parrain amélioré',
      body: (p) => `Votre restaurant a atteint 6 étoiles\u202f: ${str(p.jade)} devient ${str(p.xuan)}.`,
    },
    'report.handled': {
      title: () => 'Résultat du signalement',
      body: (p) => `Le contenu signalé (${str(p.targetName)}) a été traité. Merci de veiller sur la ville.`,
    },
    'report.rejected': {
      title: () => 'Résultat du signalement',
      body: (p) => `Le contenu signalé (${str(p.targetName)}) a été vérifié et n'enfreint pas les règles.`,
    },
    'report.penalty': {
      title: () => "Avis d'infraction",
      body: (p) => {
        const actions: Record<string, string> = {
          delete: 'supprimé',
          clear: 'effacé',
          rename: 'renommé d’office',
        };
        const what = actions[str(p.action)] ?? 'enregistré comme infraction';
        const ban =
          p.banDays === null || p.banDays === undefined
            ? ''
            : num(p.banDays) === 0
              ? ' Votre compte est banni définitivement.'
              : ` Votre compte est banni pendant ${num(p.banDays)} ${plFr(num(p.banDays), 'jour', 'jours')}.`;
        return `Votre contenu (${str(p.targetName)}) enfreint les règles et a été ${what}.${ban}\nNote\u202f: ${str(p.note)}`;
      },
    },
  },
  reportTargets: {
    post: 'message',
    reply: 'réponse',
    broadcast: 'klaxon',
    rest_name: 'nom de restaurant',
    notice: 'annonce du restaurant',
  },
  predict: {
    krab: {
      title: (from, to) => `M. Krab sera-t-il dans les rues ${from} à ${to} demain\u202f?`,
      desc: (hour) =>
        `Selon l'emplacement choisi par le système demain à ${hour} h\u202f; les déplacements après qu'on l'a chassé ne comptent pas.`,
      note: (day, hour, street) => `${day}, ${hour} h\u202f: M. Krab est apparu dans la rue ${street}`,
    },
    hiphop: {
      title: (place) =>
        place === null
          ? "Le Garçon hip-hop ira-t-il demain dans le restaurant d'un joueur\u202f?"
          : `Le Garçon hip-hop sera-t-il demain à\u202f: ${place}\u202f?`,
      desc: (hour) => `Selon l'endroit où le Garçon hip-hop apparaît demain à ${hour} h.`,
      note: (day, place) => `${day}\u202f: le Garçon hip-hop est apparu à\u202f: ${place}`,
    },
    market: {
      title: (hour, level) =>
        `Le rayon du marché du jour aura-t-il des ingrédients rares de niveau ${level} aujourd'hui à ${hour} h\u202f?`,
      desc: (hour) =>
        `Selon le rayon du jour approvisionné par le système à ${hour} h\u202f; les réapprovisionnements des joueurs ne comptent pas.`,
      yes: (day, hour, level, foods) =>
        `${day}, ${hour} h\u202f: le rayon du jour avait des ingrédients rares de niveau ${level}\u202f: ${foods}`,
      no: (day, hour, level) =>
        `${day}, ${hour} h\u202f: le rayon du jour n'avait aucun ingrédient rare de niveau ${level}`,
    },
    weather: {
      title: (hour, type) =>
        `La météo tirée automatiquement aujourd'hui à ${hour} h sera-t-elle de type ${type}\u202f?`,
      desc: (hour) =>
        `Selon la météo tirée par le système à ${hour} h\u202f; les changements faits ensuite avec le Marteau de Thor ne comptent pas.`,
      note: (day, hour, weather, type) =>
        `${day}, ${hour} h\u202f: la météo automatique était ${weather} (${type})`,
      hammer: (weather) =>
        `\u202f; quelqu'un l'a ensuite changée en ${weather} avec le Marteau de Thor, ce qui ne compte pas`,
      types: ['', 'ensoleillé', 'pluie', 'neige', 'vent/sable/brouillard'],
    },
    stats: {
      title: "Les pièces gagnées aujourd'hui par tout le serveur dépasseront-elles celles d'hier\u202f?",
      desc: (close) =>
        `Selon les pièces gagnées aujourd'hui par tous les restaurants du serveur\u202f; tranché après 0 h demain. Seul un total strictement supérieur à hier compte pour «\u202fOui\u202f». Les échanges ferment à ${close} h.`,
      note: (day, today, prevDay, yesterday) =>
        `${day}\u202f: ${today}\u202f; ${prevDay}\u202f: ${yesterday}`,
    },
    voidMissing: 'Données manquantes, annulé automatiquement',
  },
  talk: {
    bigEater: "Vous avez du goût\u202f! C'est aussi mon avis\u202f! Hahaha\u202f!",
    carmenFirst: 'Première visite\u202f? Prenez ce bon d’ingrédient mystère.',
    bigEaterFirst: 'Vous\u202f! Vous avez du caractère, hein\u202f!',
    wenjie: 'Avec Rejoice, on gagne tout de suite en allure\u202f!',
    bro13: 'Si tu aimes, fonce\u202f!!!',
    mayorRight: 'Merci, je vais le voir tout de suite pour me faire pardonner\u202f!',
    mayorWrong: "Vous croyez que je vais gober n'importe quel endroit\u202f?!",
  },
  takeawayFail: [
    'Coincé dans un énorme bouchon\u202f!',
    'Le pneu avant a crevé\u202f!',
    'Une ex bloquait la route\u202f!',
    'Le scooter électrique est tombé en panne de batterie\u202f!',
    'Une chute\u202f!',
    'Trop de commandes à la fois\u202f!',
    "Le client n'était pas content\u202f!",
    'Le client a annulé la commande\u202f!',
  ],
  appraiseFail: [
    "Ce n'est qu'un tas de papier toilette",
    'Juste des gribouillis illisibles',
    "L'écriture est couverte de graisse, on ne lit rien",
    "Ce n'est qu'un vieux menu périmé",
  ],
  effect: {
    device: 'Équipement',
    equip: 'Ustensiles',
    hangover: 'Gueule de bois',
    suit: (name, need) => `${name} (${need} ${plFr(need, 'pièce', 'pièces')})`,
    suitFallback: 'Ensemble',
    bless: (name) => `Vœu du jour\u202f: ${name}`,
  },
};
export default server;
