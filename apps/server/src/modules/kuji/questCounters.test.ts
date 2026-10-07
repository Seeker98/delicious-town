import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';

/** 支线“一番赏”的计数（问题记录 515 支线扩充）：抽中 A 赏按池子分开记，豪华池另记张数和最后赏 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.kuji;
const count = (restId: number, key: string) => eventCount(t, restId, key);

/** 一家店把整池抽完 */
async function drawAll(line: 'normal' | 'deluxe') {
  const k = t.deps.config.tuning.kuji;
  const conf = line === 'deluxe' ? k.deluxe : k;
  const total = conf.tiers.reduce((a, x) => a + x.count, 0);
  const shardId = await createShard(t.db);
  const ticket = line === 'deluxe' ? GOODS.kujiDeluxeTicket : GOODS.kujiTicket;
  const r = await newRestaurant(t, { shardId, goods: { [ticket]: total } });
  for (let left = total; left > 0; left -= conf.maxDraw) await svc().draw(r, Math.min(conf.maxDraw, left), line);
  return { r, total };
}

describe('一番赏支线的计数（问题记录 515）', () => {
  it('普通池抽完：A 赏记一次，不记豪华池的', async () => {
    const { r } = await drawAll('normal');
    expect(await count(r.restaurantId, 'kuji.a')).toBe(1);
    expect(await count(r.restaurantId, 'kuji.deluxe.draw')).toBe(0);
    expect(await count(r.restaurantId, 'kuji.deluxe.a')).toBe(0);
  });

  it('豪华池抽完：张数、A 赏、最后赏都记；不记普通池的 A 赏', async () => {
    const { r, total } = await drawAll('deluxe');
    expect(await count(r.restaurantId, 'kuji.deluxe.draw')).toBe(total);
    expect(await count(r.restaurantId, 'kuji.deluxe.a')).toBe(1);
    expect(await count(r.restaurantId, 'kuji.deluxe.last')).toBe(1);
    expect(await count(r.restaurantId, 'kuji.a')).toBe(0);
    // 原来的“拿到一次最后赏”两个池都算
    expect(await count(r.restaurantId, 'kuji.last')).toBe(1);
  });
});
