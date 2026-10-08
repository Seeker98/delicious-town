/**
 * 支线“事件预测”的持有档（问题记录 515）：持有 100、200 份；区服把持有上限调低时按上限算
 * （终审：原来调到 200 以下这一档做不了，还挡住后面两档）。计数和任务名里的数都用这个
 */
export const holdStep = (n: 100 | 200, maxHold: number): number => Math.min(n, maxHold);
