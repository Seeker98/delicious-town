import type { Messages } from '../..';
import { n, num, str, plFr } from '../../helpers';

const server: Messages['server'] = {
  mail: {
    'activity.unclaimed': {
      title: (p) => `Récompenses non récupérées : « ${str(p.activity)} »`,
      body: () =>
        "Il vous restait ces récompenses à récupérer à la fin de l'événement : les voici par courrier.",
    },
    'activity.rank': {
      title: (p) => `« ${str(p.activity)} » : récompense de la ${n(p, 'rank')}e place au classement`,
      body: () =>
        "Merci pour votre contribution à l'effort commun du serveur. Voici votre récompense de classement.",
    },
    grant: { title: () => 'Compensation', body: null },
    'invite.welcome': {
      title: () => 'Bienvenue en ville',
      body: () => 'Un ami vous a invité : voici un pack de départ.',
    },
    'invite.reward': {
      title: () => "Récompense d'invitation",
      body: (p) =>
        `« ${str(p.rest)} », que vous avez invité, a atteint le niveau ${n(p, 'level')}. Merci d'avoir fait venir un ami en ville !`,
    },
    'hat.upgrade': {
      title: () => 'Chapeau de parrain amélioré',
      body: (p) => `Votre restaurant a atteint 6 étoiles : ${str(p.jade)} devient ${str(p.xuan)}.`,
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
        return `Votre contenu (${str(p.targetName)}) enfreint les règles et a été ${what}.${ban}\nNote : ${str(p.note)}`;
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
      title: (from, to) => `M. Krab sera-t-il dans les rues ${from} à ${to} demain ?`,
      desc: (hour) =>
        `Selon l'emplacement choisi par le système demain à ${hour} h ; les déplacements après qu'on l'a chassé ne comptent pas.`,
      note: (day, hour, street) => `${day}, ${hour} h : M. Krab est apparu dans la rue ${street}`,
    },
    hiphop: {
      title: (place) =>
        place === null
          ? "Le Garçon hip-hop ira-t-il demain dans le restaurant d'un joueur ?"
          : `Le Garçon hip-hop sera-t-il demain à : ${place} ?`,
      desc: (hour) => `Selon l'endroit où le Garçon hip-hop apparaît demain à ${hour} h.`,
      note: (day, place) => `${day} : le Garçon hip-hop est apparu à : ${place}`,
    },
    market: {
      title: (hour, level) =>
        `Le rayon du marché du jour aura-t-il des ingrédients rares de niveau ${level} aujourd'hui à ${hour} h ?`,
      desc: (hour) =>
        `Selon le rayon du jour approvisionné par le système à ${hour} h ; les réapprovisionnements des joueurs ne comptent pas.`,
      yes: (day, hour, level, foods) =>
        `${day}, ${hour} h : le rayon du jour avait des ingrédients rares de niveau ${level} : ${foods}`,
      no: (day, hour, level) =>
        `${day}, ${hour} h : le rayon du jour n'avait aucun ingrédient rare de niveau ${level}`,
    },
    weather: {
      title: (hour, type) =>
        `La météo tirée automatiquement aujourd'hui à ${hour} h sera-t-elle de type ${type} ?`,
      desc: (hour) =>
        `Selon la météo tirée par le système à ${hour} h ; les changements faits ensuite avec le Marteau de Thor ne comptent pas.`,
      note: (day, hour, weather, type) =>
        `${day}, ${hour} h : la météo automatique était ${weather} (${type})`,
      hammer: (weather) =>
        ` ; quelqu'un l'a ensuite changée en ${weather} avec le Marteau de Thor, ce qui ne compte pas`,
      types: ['', 'ensoleillé', 'pluie', 'neige', 'vent/sable/brouillard'],
    },
    stats: {
      title: "Les pièces gagnées aujourd'hui par tout le serveur dépasseront-elles celles d'hier ?",
      desc: (close) =>
        `Selon les pièces gagnées aujourd'hui par tous les restaurants du serveur ; tranché après 0 h demain. Seul un total strictement supérieur à hier compte pour « Oui ». Les échanges ferment à ${close} h.`,
      note: (day, today, prevDay, yesterday) => `${day} : ${today} ; ${prevDay} : ${yesterday}`,
    },
    voidMissing: 'Données manquantes, annulé automatiquement',
  },
  talk: {
    bigEater: "Vous avez du goût ! C'est aussi mon avis ! Hahaha !",
    carmenFirst: 'Première visite ? Prenez ce bon d’ingrédient mystère.',
    bigEaterFirst: 'Vous ! Vous avez du caractère, hein !',
    wenjie: 'Avec Rejoice, on gagne tout de suite en allure !',
    bro13: 'Si tu aimes, fonce !!!',
    mayorRight: 'Merci, je vais le voir tout de suite pour me faire pardonner !',
    mayorWrong: "Vous croyez que je vais gober n'importe quel endroit ?!",
  },
  takeawayFail: [
    'Coincé dans un énorme bouchon !',
    'Le pneu avant a crevé !',
    'Une ex bloquait la route !',
    'Le scooter électrique est tombé en panne de batterie !',
    'Une chute !',
    'Trop de commandes à la fois !',
    "Le client n'était pas content !",
    'Le client a annulé la commande !',
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
    bless: (name) => `Vœu du jour : ${name}`,
  },
};
export default server;
