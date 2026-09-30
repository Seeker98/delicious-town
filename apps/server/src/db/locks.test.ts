import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../test/config';
import { createShard } from '../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../test/game';
import { ensureNpc, npcInvite } from '../modules/npc/npc';
import { regenStrength } from '../modules/settlement/strength';
import { withRestaurant } from './tx';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 在另一个事务里锁住这家店，直到 release 被调用（模拟正在进行的双店操作） */
async function holdLock(restId: number) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const done = withRestaurant(t.db, restId, () => held);
  await new Promise((r) => setTimeout(r, 150));
  return async () => {
    release();
    await done;
  };
}

const TIMEOUT = 'timeout' as const;
const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);

describe('后台批量任务不和双店操作形成锁环（最终审查 Important 1）', () => {
  it('体力恢复不等被锁住的店：跳过它，其他店照常恢复', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId, patch: { strength: 0 } });
    const b = await newRestaurant(t, { shardId, patch: { strength: 0 } });
    const release = await holdLock(a.restaurantId);
    try {
      const r = await within(regenStrength(t.game.deps, shardId, 'p1', new Date()), 1500);
      expect(r).toEqual({ updated: 1 });
    } finally {
      await release();
    }
    expect((await restRow(t, a.restaurantId)).strength).toBe(0);
    expect((await restRow(t, b.restaurantId)).strength).toBeGreaterThan(0);
  });

  it('蟹老板发邀请不等被锁住的店（外键检查只要 KEY SHARE）', async () => {
    const shardId = await createShard(t.db);
    await ensureNpc(t.db, config, config.tuning.friend.npc, shardId, seededRng(1));
    const v = await newRestaurant(t, { shardId, verified: true });
    const release = await holdLock(v.restaurantId);
    try {
      expect(await within(npcInvite(t.db, { shardId }), 1500)).toBe(1);
    } finally {
      await release();
    }
  });
});
