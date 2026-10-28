/** 随机事件和问答（设计稿 2026-10-28） */
export default {
  quizTitle: '小镇问答',
  quizNight: (i: number, n: number) => `第 ${i} / ${n} 题`,
  ok: '知道了',
  later: '待会儿再说',
  next: '下一题',
  cost: (coin: string) => `花 ${coin} 银币`,
  correct: '答对了!',
  wrong: '答错了',
  until: (time: string) => `持续到 ${time}`,
  ticketName: '神秘礼券',
  failed: '操作失败',
  effectQuiz: '小镇问答',
};
