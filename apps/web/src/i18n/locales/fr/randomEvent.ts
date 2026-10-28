import type { Messages } from '../..';

const randomEvent: Messages['randomEvent'] = {
  quizTitle: 'Quiz du village',
  quizNight: (i, n) => `Question ${i} sur ${n}`,
  ok: 'Compris',
  later: 'Plus tard',
  next: 'Question suivante',
  cost: (coin) => `Coûte ${coin} pièces`,
  correct: 'Bonne réponse\u202f!',
  wrong: 'Mauvaise réponse',
  until: (time) => `Jusqu’à ${time}`,
  ticketName: 'Bon mystère',
  failed: 'Une erreur est survenue',
  effectQuiz: 'Quiz du village',
};

export default randomEvent;
