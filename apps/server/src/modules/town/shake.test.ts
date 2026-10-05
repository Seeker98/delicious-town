import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { krabFor, setTownTuning } from '../../../test/town';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { runDueJobs } from '../../worker/periodic';
import { listNews } from '../news/news';
import { npcIdOf } from '../npc/npc';
import { gid } from '../../../test/items';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const shake = (ctx: RestCtx) => t.game.town.shake(ctx);
const shakes = (restId: number) =>
  t.db.selectFrom('town_shake').selectAll().where('rest_id', '=', restId).execute();

describe('摇蟹老板钱包（设计文档 §3.4）', () => {
  it('从蟹老板店扣银币给我；计入活跃"摇蟹老板的钱袋"和支线 102', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 2, coin: 100 } });
    const krab = await krabFor(t, a.shardId, 1_000_000);
    const { coin } = (await shake(a)).data;
    expect(coin).toBeGreaterThanOrEqual(6002);
    expect(coin).toBeLessThanOrEqual(16000);
    expect((await restRow(t, a.restaurantId)).coin).toBe(100 + coin);
    expect((await restRow(t, krab)).coin).toBe(1_000_000 - coin);
    expect((await t.game.task.activation(a)).items.find((i) => i.id === 9)!.count).toBe(1);
    await showQuest(t, a.restaurantId, 3042);
    expect(questIn(await t.game.task.tasks(a), 3042)).toMatchObject({ done: true });
  });

  it('蟹老板钱不够时给剩下的；没钱或没有蟹老板店时报错，不写记录，之后还能摇', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 2 } });
    const krab = await krabFor(t, a.shardId, 3000);
    expect((await shake(a)).data.coin).toBe(3000);
    expect((await restRow(t, krab)).coin).toBe(0);

    const b = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 2 } });
    await expect(shake(b)).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'krab_broke' } });
    expect(await shakes(b.restaurantId)).toHaveLength(0);
    await krabFor(t, a.shardId, 50_000);
    expect((await shake(b)).data.coin).toBeGreaterThan(0);

    const lonely = await newRestaurant(t, { patch: { star_level: 2 } });
    await expect(shake(lonely)).rejects.toMatchObject({ params: { reason: 'krab_broke' } });
  });

  it('同一家店每天一次，第二天可以再摇；两个请求同时摇只成功一个', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1 } });
    await krabFor(t, a.shardId, 1_000_000);
    const both = await Promise.allSettled([shake(a), shake(a)]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(both.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'ALREADY_DONE', params: { what: 'shake' } },
    });
    t.clock.set(gameTime('2026-10-01', 12));
    await shake(a);
    expect(await shakes(a.restaurantId)).toHaveLength(2);
  });

  it('开发期默认不限 IP 和设备；打开开关后同 IP、同设备换店被拒', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1 } });
    const b = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 1 } });
    const c = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 1 } });
    const d = await newRestaurant(t, { shardId: a.shardId, patch: { star_level: 1 } });
    await krabFor(t, a.shardId, 1_000_000);
    await shake(a);
    await shake(b);
    await setTownTuning(t, a.shardId, { shake: { limitIp: true } });
    await expect(shake(c)).rejects.toMatchObject({ code: 'LIMIT_REACHED', params: { what: 'shake_device' } });
    await setTownTuning(t, a.shardId, { shake: { limitDevice: true } });
    const dev = 'device-abcdef12';
    await shake({ ...c, ip: '10.0.0.3', deviceId: dev });
    await expect(shake({ ...d, ip: '10.0.0.4', deviceId: dev })).rejects.toMatchObject({
      params: { what: 'shake_device' },
    });
  });

  it('流水号尾数 88：额外掏出蟹黄堡并写新闻', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1 } });
    await krabFor(t, a.shardId, 1_000_000);
    await sql`select setval('town_shake_id_seq', 187)`.execute(t.db);
    const r = (await shake(a)).data;
    const [row] = await shakes(a.restaurantId);
    expect(row!.id).toBe(188);
    expect(r.egg).toEqual({ goodsId: gid('蟹黄堡'), num: 1 });
    expect(await goodsNum(t, a.restaurantId, gid('蟹黄堡'))).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.shake.lucky'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { goodsId: gid('蟹黄堡'), num: 1 } });
  });

  it('蟹老板的钱袋：新建时和每天补货时补到 1000 万，比它多时不动（终审 C1）', async () => {
    const shardId = await createShard(t.db);
    const run = (name: string) =>
      runDueJobs(
        { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: vi.fn() } },
        t.game.jobs.filter((j) => j.name === name),
        { shardIds: [shardId] },
      );
    t.clock.set(gameTime(DAY, 0, 10));
    await run('npc-maintain');
    const krab = (await npcIdOf(t.db, shardId))!;
    expect((await restRow(t, krab)).coin).toBe(10_000_000);

    await t.db.updateTable('restaurant').set({ coin: 5 }).where('id', '=', krab).execute();
    await run('npc-restock');
    expect((await restRow(t, krab)).coin).toBe(10_000_000);

    await t.db.updateTable('restaurant').set({ coin: 20_000_000 }).where('id', '=', krab).execute();
    t.clock.set(gameTime('2026-10-01', 0, 10));
    await run('npc-restock');
    expect((await restRow(t, krab)).coin).toBe(20_000_000);
  });
});
