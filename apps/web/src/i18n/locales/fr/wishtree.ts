import type { Messages } from '../..';
import { plFr } from '../../helpers';

const wishtree: Messages['wishtree'] = {
  loadFailed: 'Impossible de charger l’Arbre à vœux',
  wishFailed: 'Impossible de faire un vœu',
  intro: 'Chaque jour, l’arbre donne un objet, et un des restaurants qui ont fait un vœu le remporte.',
  helpTitle: 'Comment fonctionne l’Arbre à vœux',
  helpSub: (hour) => `Tirage chaque jour à ${hour}h\u202f; un restaurant remporte l'objet et un titre`,
  help: (hour, minLevel, titleDays, titleName) => [
    `Tirage chaque jour à ${hour}\u202fh, et l’arbre donne un nouvel objet au même moment, le même pour tout le serveur`,
    `Les restaurants de niveau ${minLevel} ou plus peuvent faire 1 vœu par tour, gratuitement`,
    `Au tirage, 1 restaurant ayant fait un vœu est choisi au hasard\u202f: il reçoit l’objet et le titre «\u202f${titleName}\u202f» (valable ${titleDays} jours après réception), par courrier`,
    'Chaque restaurant qui ne gagne pas reçoit tout de suite une récompense aléatoire',
  ],
  off: 'L’Arbre à vœux n’est pas encore ouvert sur ce serveur',
  today: 'Aujourd’hui, l’arbre donne',
  entries: (n) => `${n} ${n === 1 ? 'vœu' : 'vœux'} pour l’instant`,
  drawAtLeft: (time, left) => `Tirage\u202f: ${time} (${left})`,
  free: (level) => `Un vœu gratuit par tour dès le niveau ${level}`,
  wish: 'Faire un vœu',
  wished: 'Vœu fait, en attente du tirage',
  need: (level) => `Votre restaurant doit être niveau ${level} pour faire un vœu`,
  needAge: (days) =>
    `Votre compte doit avoir au moins ${days} ${plFr(days, 'jour', 'jours')} pour faire un vœu`,
  needEmail: 'Vérifiez votre e-mail pour faire un vœu (s’il est erroné, modifiez-le dans Mon compte)',
  done: 'Vœu fait\u202f! Rendez-vous au tirage',
  none: (hour) => `Pas de tour en cours. L’arbre donne un nouvel objet chaque jour à ${hour}\u202fh`,
  recentTitle: 'Tours récents',
  noRecent: 'Aucun tirage pour l’instant',
  empty: 'Personne n’a fait de vœu',
  recentTitleLine: (day, prize) => `${day} · ${prize}`,
  winnerTail: (n) => ` a gagné · ${n} ${n === 1 ? 'vœu' : 'vœux'}`,
  mineTag: 'Gagné',
  lostTag: (award) => `Raté · ${award}`,
  pendingTag: 'Raté · lot en route',
  skippedTag: 'Raté · compte suspendu au tirage, pas de lot de consolation',
};
export default wishtree;
