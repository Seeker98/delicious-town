import { seededRng } from '@dt/shared';
import { ensureNpc } from '../src/modules/npc/npc';
import { testConfig } from './config';
import type { TestGame } from './game';

/** 本区服的蟹老板店（没有就建），并把它的银币设成 coin；返回店号 */
export async function krabFor(t: TestGame, shardId: number, coin: number): Promise<number> {
  const config = testConfig();
  const { id } = await ensureNpc(t.db, config, config.tuning.friend.npc, shardId, seededRng(1));
  await t.db.updateTable('restaurant').set({ coin }).where('id', '=', id).execute();
  return id;
}

/** 覆盖本区服的任意 tuning 段（深合并），并清掉区服设置缓存 */
export async function setTuning(
  t: TestGame,
  shardId: number,
  tuning: Record<string, unknown>,
): Promise<void> {
  const override = JSON.stringify({ tuning });
  await t.db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override })
    .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override }))
    .execute();
  t.game.shards.invalidate(shardId);
}

/** 覆盖本区服的 town 数值（深合并），并清掉区服设置缓存 */
export function setTownTuning(t: TestGame, shardId: number, town: Record<string, unknown>): Promise<void> {
  return setTuning(t, shardId, { town });
}
