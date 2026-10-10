import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { openRound } from './open';

let t: TestGame;
let seed = 1;
beforeAll(async () => {
  t = await createTestGame({ rng: () => seededRng(seed++) });
});
afterAll(() => t.close());

const roundsOf = (shardId: number) =>
  t.db.selectFrom('wish_round').selectAll().where('shard_id', '=', shardId).orderBy('opens_at').execute();

describe('开一轮（许愿树设计 §1.1）', () => {
  it('到点前不开；到点开一轮，道具来自清单、起止对；同一天重跑不多开', async () => {
    const shardId = await createShard(t.db);
    const day = '2026-10-12';
    t.clock.set(gameTime(day, 19, 59));
    expect(await openRound(t.game.deps, shardId, t.clock.now)).toBe('early');
    t.clock.set(gameTime(day, 20, 1));
    expect(await openRound(t.game.deps, shardId, t.clock.now)).toBe('opened');
    const [r] = await roundsOf(shardId);
    const prizes = t.game.deps.config.tuning.wishTree.prizes;
    expect(prizes.some((p) => p.goods === r!.goods_id && p.num === r!.num)).toBe(true);
    expect(r!.opens_at.getTime()).toBe(gameTime(day, 20).getTime());
    expect(r!.ends_at.getTime()).toBe(gameTime('2026-10-13', 20).getTime());
    expect(r!.status).toBe('open');
    expect(await openRound(t.game.deps, shardId, t.clock.now)).toBe('exists');
    expect(await roundsOf(shardId)).toHaveLength(1);
  });

  it('只有一项的清单：一定是它', async () => {
    const shardId = await createShard(t.db);
    const only = t.game.deps.config.tuning.wishTree.prizes[6]!;
    await setTuning(t, shardId, { wishTree: { prizes: [only] } });
    t.clock.set(gameTime('2026-10-14', 20, 1));
    await openRound(t.game.deps, shardId, t.clock.now);
    const [r] = await roundsOf(shardId);
    expect([r!.goods_id, r!.num]).toEqual([only.goods, only.num]);
  });

  it('开奖时间提前、上一轮还没到点：不两轮同时开着（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    t.clock.set(gameTime('2026-10-15', 20, 1));
    expect(await openRound(t.game.deps, shardId, t.clock.now)).toBe('opened');
    await setTuning(t, shardId, { wishTree: { hour: 18 } });
    t.clock.set(gameTime('2026-10-16', 18, 1));
    expect(await openRound(t.game.deps, shardId, t.clock.now)).toBe('busy');
    expect(await roundsOf(shardId)).toHaveLength(1);
  });
});
