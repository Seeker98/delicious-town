import type { QuestDto, QuestsDto } from '@dt/shared';
import { CHAPTER_MARK } from '../src/modules/task/quests';
import type { TestGame } from './game';

/**
 * 让某个任务出现在任务列表里（问题记录 318）：之前各章的任务和章末、同一支线之前的档记为已领，
 * 等级、星级补到章节解锁要求，并标记老号已换算
 */
export async function showQuest(t: TestGame, restId: number, questId: number): Promise<void> {
  const b = t.deps.config.bundle;
  const q = b.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`unknown quest ${questId}`);
  const ids = [
    ...b.quests.filter((x) => x.line === null && x.chapter < q.chapter).map((x) => x.id),
    ...b.chapters.filter((c) => c.id < q.chapter).map((c) => CHAPTER_MARK + c.id),
    ...b.quests.filter((x) => q.line !== null && x.line === q.line && x.order < q.order).map((x) => x.id),
  ];
  if (ids.length > 0)
    await t.db
      .insertInto('quest_done')
      .values(ids.map((quest_id) => ({ rest_id: restId, quest_id })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  const need = b.chapters.filter((c) => c.id <= q.chapter);
  const rest = await t.db
    .selectFrom('restaurant')
    .select(['level', 'star_level'])
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  await t.db
    .updateTable('restaurant')
    .set({
      quest_version: 1,
      level: Math.max(rest.level, ...need.map((c) => c.needLevel)),
      star_level: Math.max(rest.star_level, ...need.map((c) => c.needStar)),
    })
    .where('id', '=', restId)
    .execute();
}

/** 在主线或支线当前档里按 id 找任务 */
export function questIn(list: QuestsDto, id: number): QuestDto | undefined {
  return list.main.find((x) => x.id === id) ?? list.lines.find((l) => l.quest?.id === id)?.quest ?? undefined;
}
