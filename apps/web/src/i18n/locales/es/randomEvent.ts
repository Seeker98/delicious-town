import type { Messages } from '../..';

const randomEvent: Messages['randomEvent'] = {
  quizTitle: 'Concurso del pueblo',
  quizNight: (i, n) => `Pregunta ${i} de ${n}`,
  ok: 'Entendido',
  later: 'Más tarde',
  next: 'Siguiente pregunta',
  cost: (coin) => `Cuesta ${coin} monedas`,
  correct: '¡Correcto!',
  wrong: 'Respuesta incorrecta',
  until: (time) => `Hasta las ${time}`,
  ticketName: 'Vale misterioso',
  failed: 'Algo ha salido mal',
  effectQuiz: 'Concurso del pueblo',
};

export default randomEvent;
