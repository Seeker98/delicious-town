/** 任务状态条件能用的键（问题记录 318）；cookbooks.gradeN 另按正则认。服务端 task/service.ts 的 snapshot 负责算出这些值 */
export const QUEST_STATE_KEYS: ReadonlySet<string> = new Set([
  'cookbooks.learned',
  'cookbooks.foreignLearned',
  'rest.level',
  'rest.star',
  'friends.count',
  'rest.thumbs',
  'oil.level',
  'mc.learned',
  'yard.lands',
  'equip.maxStress',
  'takeaway.open',
]);

export const isQuestStateKey = (k: string): boolean =>
  QUEST_STATE_KEYS.has(k) || /^cookbooks\.grade\d+$/.test(k);
