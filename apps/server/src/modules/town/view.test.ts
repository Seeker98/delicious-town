import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { showQuest } from '../../../test/quests';
import { setWeather } from '../../../test/takeaway';
import { krabFor } from '../../../test/town';
import { GOODS } from '@dt/config';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

describe('小镇概览（设计文档 §3.8）', () => {
  it('新店：什么都没做', async () => {
    const a = await newRestaurant(t, { patch: { star_level: 1, coin: 500, diamond: 7 } });
    await setWeather(t, a.shardId, 1);
    expect(await t.game.town.overview(a)).toEqual({
      now: gameTime(DAY, 12).toISOString(),
      star: 1,
      coin: 500,
      diamond: 7,
      talked: { bigEater: false, wenjie: false, bro13: false },
      mayor: { answered: false, hiphopOut: false, hour: 9 },
      bigEaterGift: false,
      shaken: false,
      broadcast: { horns: 0, readyAt: null, minStar: 1, maxLen: 64 },
      hammer: { has: false, readyAt: null, townReadyAt: null, coin: 100_000, diamond: 8 },
      weather: { id: 1, name: '晴', until: expect.any(String) },
      bless: { today: null, restName: null, hasLamp: false, activation: 0, feasted: false },
    });
  });

  it('做过各项之后：状态和冷却都反映出来', async () => {
    const a = await newRestaurant(t, {
      patch: { star_level: 1, coin: 1_000_000 },
      goods: { [GOODS.horn]: 3, [GOODS.thorHammer]: 1, [GOODS.magicLamp]: 1 },
      verified: true,
    });
    await setWeather(t, a.shardId, 1);
    await krabFor(t, a.shardId, 1_000_000);
    await t.game.town.talk(a, { npc: 'bigEater' });
    await t.game.town.broadcast(a, { text: '你好' });
    await t.game.town.shake(a);
    await t.game.town.hammer(a, { mode: 'coin', type: 2 });
    const { bless } = (await t.game.town.wish(a)).data;
    const v = await t.game.town.overview(a);
    const now = gameTime(DAY, 12).getTime();
    expect(v.talked).toEqual({ bigEater: true, wenjie: false, bro13: false });
    expect(v.bigEaterGift).toBe(true);
    expect(v.shaken).toBe(true);
    expect(v.broadcast).toMatchObject({ horns: 2, readyAt: new Date(now + 30_000).toISOString() });
    expect(v.hammer).toMatchObject({
      has: true,
      readyAt: new Date(now + 6 * 3600_000).toISOString(),
      townReadyAt: new Date(now + 90_000).toISOString(),
    });
    expect(v.bless).toMatchObject({ today: { id: bless.id }, hasLamp: true, feasted: false });
    expect(v.bless.restName).toEqual(expect.any(String));
  });

  it('支线任务：广播、摇钱包、嘻哈男孩打赏（4E-2）、发帖（4E-3）都开放', async () => {
    const a = await newRestaurant(t);
    await showQuest(t, a.restaurantId, 2121);
    const list = await t.game.task.tasks(a);
    expect(list.main.map((x) => x.key)).toEqual(
      expect.arrayContaining(['broadcast', 'post.create|post.reply']),
    );
    expect(list.lines.map((l) => l.id)).toContain(2);
  });
});
