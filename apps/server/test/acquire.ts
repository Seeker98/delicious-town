import { createShard } from './fixtures';
import type { TestGame } from './game';

/** 新区服并打开收购（收购默认关） */
export async function acquireShard(t: TestGame): Promise<number> {
  const shardId = await createShard(t.db);
  await t.db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override: JSON.stringify({ features: { acquire: true } }) })
    .execute();
  t.game.shards.invalidate(shardId);
  return shardId;
}

/** 写一家店的收购状态（没有行就建，基础身价默认 100 万、热度 1） */
export async function setAcquireState(
  t: TestGame,
  restId: number,
  shardId: number,
  patch: {
    base?: number;
    heat?: number;
    owner_rest_id?: number | null;
    protected_until?: Date | null;
    list_rate?: number | null;
    list_until?: Date | null;
  } = {},
): Promise<void> {
  await t.db
    .insertInto('acquire_state')
    .values({ rest_id: restId, shard_id: shardId, base: 1_000_000, heat: 1, ...patch })
    .onConflict((oc) => oc.column('rest_id').doUpdateSet({ base: 1_000_000, heat: 1, ...patch }))
    .execute();
}

export const acquireStateOf = (t: TestGame, restId: number) =>
  t.db.selectFrom('acquire_state').selectAll().where('rest_id', '=', restId).executeTakeFirstOrThrow();
