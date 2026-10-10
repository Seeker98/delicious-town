import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { foodPrice } from '../../core/prices';
import { refPrice } from '../exchange/ref';
import { futuresUnitPrice } from '../futures/rules';
import { openLot } from './open';
import { bulkCap, bulkGroup, bulkReserve } from './rules';

let t: TestGame;
let seed = 1;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(seed++) });
});
afterAll(() => t.close());

const lotsOf = (shardId: number) =>
  t.db.selectFrom('bulk_lot').selectAll().where('shard_id', '=', shardId).orderBy('opens_at').execute();

describe('开批次（大宗认购设计 §1.1）', () => {
  it('20 点前不开；到点开一批：份数、上限、成团、起拍价、名义结束、收盘时刻都对；同一天重跑不多开', async () => {
    const shardId = await createShard(t.db);
    const day = '2026-10-12';
    t.clock.set(gameTime(day, 19, 59));
    expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('early');
    t.clock.set(gameTime(day, 20, 1));
    expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
    const [lot] = await lotsOf(shardId);
    const c = t.game.deps.config;
    const tb = c.tuning.bulk;
    const food = c.requireFood(lot!.foods_id);
    expect(lot!.level).toBe(food.level);
    expect(lot!.qty).toBe(tb.qty[food.level - 1]);
    expect(lot!.cap).toBe(bulkCap(lot!.qty, tb));
    expect(lot!.group_qty).toBe(bulkGroup(lot!.qty, tb));
    const ref = await refPrice(
      t.db,
      c,
      c.tuning.exchange,
      c.tuning.market.levelPriceRate,
      shardId,
      food.id,
      day,
    );
    expect(Number(lot!.reserve)).toBe(
      bulkReserve(futuresUnitPrice(foodPrice(food, c.tuning.market), ref, c.tuning.futures), tb),
    );
    expect(lot!.opens_at.getTime()).toBe(gameTime(day, 20).getTime());
    const end = lot!.ends_at.getTime();
    expect(end - lot!.opens_at.getTime()).toBe(24 * 3_600_000);
    expect(lot!.close_at.getTime()).toBeLessThan(end);
    expect(lot!.close_at.getTime()).toBeGreaterThanOrEqual(end - 5 * 60_000);
    expect(lot!.status).toBe('open');
    expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('exists');
    expect(await lotsOf(shardId)).toHaveLength(1);
  });

  it('按权重选等级；连开几天，相邻两批不是同一种食材', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      bulk: { ...t.game.deps.config.tuning.bulk, levelWeights: [0, 0, 0, 1, 0] },
    });
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']) {
      t.clock.set(gameTime(day, 20, 1));
      expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
    }
    const lots = await lotsOf(shardId);
    expect(lots.map((l) => l.level)).toEqual([4, 4, 4, 4, 4]);
    for (let i = 1; i < lots.length; i++) expect(lots[i]!.foods_id).not.toBe(lots[i - 1]!.foods_id);
  });
});
