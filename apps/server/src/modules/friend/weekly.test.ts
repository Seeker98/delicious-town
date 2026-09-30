import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GOODS } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type TestGame,
} from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { incrementDaily } from '../counter/dailyCounter';
import { friendWeeklyJob, lastWeekCount, mondayOf, weeklyPeriod } from './weekly';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('周期', () => {
  it('2026-10-05 是周一；07:59 之前结算上上周，之后结算上周', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(weeklyPeriod(new Date('2026-10-04T23:58:00Z'))).toBe('2026-09-21'); // 北京时间 10-05 07:58
    expect(weeklyPeriod(new Date('2026-10-04T23:59:00Z'))).toBe('2026-09-28'); // 北京时间 10-05 07:59
  });
});

describe('周奖励（规格书 16）', () => {
  it('上周被夹最多 → 神之一手；被翻前 4 → 四种勋章；灭蟑螂前 2 → 午夜蟑螂杀手；重复执行不重复发', async () => {
    const shardId = await createShard(t.db);
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => newRestaurant(t, { shardId })));
    const ids = rs.map((r) => r.restaurantId);
    const put = (i: number, key: string, n: number, day = '2026-09-30') =>
      incrementDaily(t.db, ids[i]!, key, n, day);
    await put(0, 'flip.caught', 3);
    await put(1, 'flip.caught', 1);
    for (const [i, n] of [5, 4, 3, 2, 1].entries()) await put(i, 'flip.flipped', n);
    await put(2, 'roach.kill', 9);
    await put(3, 'roach.kill', 9);
    await put(4, 'roach.kill', 20, '2026-10-05'); // 本周的不算
    t.clock.set(new Date('2026-10-05T00:30:00Z')); // 北京时间周一 08:30
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: vi.fn() } };
    const job = friendWeeklyJob(t.game.deps);
    await runDueJobs(deps, [job], { shardIds: [shardId] });
    await runDueJobs(deps, [job], { shardIds: [shardId] });
    expect(await goodsNum(t, ids[0]!, GOODS.godsHand)).toBe(1);
    expect(await goodsNum(t, ids[1]!, GOODS.godsHand)).toBe(0);
    expect(await goodsNum(t, ids[0]!, GOODS.heartache)).toBe(1);
    expect(await goodsNum(t, ids[1]!, GOODS.firecracker)).toBe(1);
    expect(await goodsNum(t, ids[2]!, GOODS.lantern)).toBe(1);
    expect(await goodsNum(t, ids[3]!, GOODS.fu)).toBe(1);
    expect(await goodsNum(t, ids[2]!, GOODS.roachKiller)).toBe(1);
    expect(await goodsNum(t, ids[3]!, GOODS.roachKiller)).toBe(1);
    expect(await goodsNum(t, ids[4]!, GOODS.roachKiller)).toBe(0);
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(news.filter((n) => n.type === 'friend.weekly')).toHaveLength(7);
    t.clock.set(new Date());
  });
});

describe('改名费（规格书 02 §2.8）', () => {
  it('= 上周被放蟑螂数 × 100 × 等级 × (星级 + 1)', async () => {
    const a = await newRestaurant(t, {
      patch: { level: 10, star_level: 1, coin: 100_000 },
      goods: { 53: 1 },
    });
    t.clock.set(new Date('2026-10-07T04:00:00Z'));
    await incrementDaily(t.db, a.restaurantId, 'roach.laidOn', 2, '2026-09-29');
    await incrementDaily(t.db, a.restaurantId, 'roach.laidOn', 5, '2026-10-06'); // 本周的不算
    expect(await lastWeekCount(t.db, a.restaurantId, 'roach.laidOn', t.clock.now)).toBe(2);
    await t.game.growth.rename(a, `改${a.restaurantId}`);
    expect((await restRow(t, a.restaurantId)).coin).toBe(100_000 - 2 * 100 * 10 * 2);
    t.clock.set(new Date());
  });
});

describe('任务状态', () => {
  it('第 9 步"添加一位好友"看好友数（含蟹老板）；支线"被点赞 100 次"看被赞数', async () => {
    const [a, b] = await newPair(t, { patch: { main_task_step: 9 } });
    expect((await t.game.task.tasks(a)).main).toMatchObject({ step: 9, done: false });
    await befriend(t, a.restaurantId, b.restaurantId);
    expect((await t.game.task.tasks(a)).main).toMatchObject({ step: 9, progress: 1, done: true });
    await t.db
      .insertInto('event_counter')
      .values({ rest_id: a.restaurantId, key: 'thumbs.received', count: 100 })
      .execute();
    await t.db
      .updateTable('restaurant')
      .set({ main_task_step: 40 })
      .where('id', '=', a.restaurantId)
      .execute();
    const side = (await t.game.task.tasks(a)).side.find((x) => x.key === 'rest.thumbs');
    expect(side).toMatchObject({ progress: 100, done: true });
  });
});
