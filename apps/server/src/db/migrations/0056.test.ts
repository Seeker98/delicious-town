import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { compensate } from './0056_quest_compensate';

const db = testDb();
afterAll(() => db.destroy());

const RECIPE = 10811;
const SEAL = 10812;
const MAP = 10704;
const SHARD1 = 10801;
const TICKET = 10302;

describe('迁移 0056：任务奖励调整后给老玩家补发（问题记录 515 终审）', () => {
  it('按领过、没领过的任务补；一家店一封邮件；什么都不缺的不发；再跑一次不重复发', async () => {
    const shardId = await createShard(db);
    const rest = async () => createRestaurantFull(db, shardId, await createAccountRow(db));
    const [a, b, c, d] = [await rest(), await rest(), await rest(), await rest()];
    const done = (restId: number, ids: number[]) =>
      db
        .insertInto('quest_done')
        .values(ids.map((quest_id) => ({ rest_id: restId, quest_id })))
        .execute();
    // a：领过升一星，第 4 章一个都没做；领过升二星，没开外卖
    await done(a, [2068, 2126]);
    // b：领过升一星，做过鉴定、学会了特色菜，没做探险
    await done(b, [2068, 2081, 2082]);
    // c：领过升二星，已经开了外卖；没领过升一星（升一星以后照新奖励拿）
    await done(c, [2126]);
    await db.insertInto('takeaway_state').values({ rest_id: c, opened_at: new Date() }).execute();
    // d：都没到
    await compensate(db);
    await compensate(db);
    const mails = await db
      .selectFrom('mail')
      .select(['rest_id', 'scope', 'tpl', 'items'])
      .where('rest_id', 'in', [a, b, c, d])
      .orderBy('rest_id')
      .execute();
    expect(mails).toEqual([
      {
        rest_id: a,
        scope: 'rest',
        tpl: 'quest.compensate',
        items: {
          goods: [
            { id: RECIPE, num: 1 },
            { id: SEAL, num: 1 },
            { id: MAP, num: 1 },
            { id: SHARD1, num: 9 },
            { id: TICKET, num: 1 },
          ],
        },
      },
      { rest_id: b, scope: 'rest', tpl: 'quest.compensate', items: { goods: [{ id: MAP, num: 1 }] } },
    ]);
  });
});
