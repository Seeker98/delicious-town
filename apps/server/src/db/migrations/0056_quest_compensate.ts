import { sql, type Kysely } from 'kysely';

/**
 * 任务奖励调整后给老玩家补发（问题记录 515，终审）：
 * - 升一星（2068）改成先发鉴定、探险、学第一道特色菜要用的东西，原来鉴定（2081）、探险（2085）给的神秘食谱、探险图挪了过去；
 *   已经领过 2068 的，没做鉴定的补神秘食谱和美味印章、没做探险的补探险图、还没学会特色菜（2082）的补 9 张一级残卷碎片
 * - 升二星（2126）多给 1 张外卖券：已经领过、还没开外卖的补 1 张
 * 一家店一封系统邮件；按来源去重，迁移重跑不会重复发
 */
const SOURCE = 'quest.compensate.515';
const RECIPE = 10811;
const SEAL = 10812;
const MAP = 10704;
const SHARD1 = 10801;
const TICKET = 10302;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function compensate(db: Kysely<any>): Promise<void> {
  const { rows } = await sql<{ rest_id: number; shard_id: number; done: number[]; takeaway: boolean }>`
    select r.id as rest_id, r.shard_id,
      array(select q.quest_id from quest_done q where q.rest_id = r.id and q.quest_id in (2068, 2081, 2082, 2085, 2126)) as done,
      exists(select 1 from takeaway_state t where t.rest_id = r.id) as takeaway
    from restaurant r
    where not r.npc
      and exists(select 1 from quest_done q where q.rest_id = r.id and q.quest_id in (2068, 2126))
      and not exists(select 1 from mail m where m.rest_id = r.id and m.source = ${SOURCE})
    order by r.id`.execute(db);
  for (const r of rows) {
    const done = new Set(r.done.map(Number));
    const goods: Array<{ id: number; num: number }> = [];
    if (done.has(2068)) {
      if (!done.has(2081)) goods.push({ id: RECIPE, num: 1 }, { id: SEAL, num: 1 });
      if (!done.has(2085)) goods.push({ id: MAP, num: 1 });
      if (!done.has(2082)) goods.push({ id: SHARD1, num: 9 });
    }
    if (done.has(2126) && !r.takeaway) goods.push({ id: TICKET, num: 1 });
    if (goods.length === 0) continue;
    await db
      .insertInto('mail')
      .values({
        scope: 'rest',
        shard_id: r.shard_id,
        rest_id: r.rest_id,
        min_level: null,
        title: '任务奖励调整补发',
        body: '升到一星、二星的任务奖励调整了，补上你还没拿到的道具。',
        items: JSON.stringify({ goods }),
        tpl: 'quest.compensate',
        tpl_params: JSON.stringify({}),
        source: SOURCE,
        actor_account_id: null,
      })
      .execute();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await compensate(db);
}

// 补发的邮件领了就是领了，不撤回
export async function down(): Promise<void> {}
