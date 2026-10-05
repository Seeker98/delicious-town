/**
 * 赛厨评委（问题记录 396）：每局从这 10 位里抽几位，各自比双方在关注项目上的和。
 * 项目下标：0 色、1 香、2 味、3 形、4 养。名字在网页各语言的 tower.duel.judges 里
 */
export const DUEL_JUDGES = [
  { id: 'yardSis', items: [0, 3, 4] }, // 菜园姐
  { id: 'xiaoC', items: [1, 2, 3] }, // 小c
  { id: 'wenjie', items: [2, 3, 4] }, // 雯姐
  { id: 'bro13', items: [0, 2, 4] }, // 13 哥
  { id: 'bigEater', items: [0, 1, 4] }, // 大胃哥
  { id: 'fanDao', items: [1, 2] }, // 饭老道
  { id: 'gary', items: [1, 3] }, // 盖乐瑞
  { id: 'oldPoor', items: [3, 4] }, // 老穷头
  { id: 'carmen', items: [0, 1] }, // 卡门
  { id: 'xiaoKai', items: [2, 4] }, // 小凯
] as const satisfies ReadonlyArray<{ id: string; items: readonly number[] }>;

export type DuelJudgeId = (typeof DUEL_JUDGES)[number]['id'];

export const DUEL_JUDGE_ITEMS: ReadonlyMap<DuelJudgeId, readonly number[]> = new Map(
  DUEL_JUDGES.map((j) => [j.id, j.items]),
);
