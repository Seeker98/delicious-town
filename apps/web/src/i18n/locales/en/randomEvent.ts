import type { Messages } from '../..';

const randomEvent: Messages['randomEvent'] = {
  quizTitle: 'Town Quiz',
  quizNight: (i, n) => `Question ${i} of ${n}`,
  ok: 'Got it',
  later: 'Later',
  next: 'Next question',
  cost: (coin) => `Costs ${coin} coins`,
  correct: 'Correct!',
  wrong: 'Wrong answer',
  until: (time) => `Until ${time}`,
  ticketName: 'Mystery Voucher',
  failed: 'Something went wrong',
  effectQuiz: 'Town Quiz',
};

export default randomEvent;
