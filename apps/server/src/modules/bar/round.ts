import { ErrorCode } from '@dt/shared';
import type { Kysely } from 'kysely';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';

/** 酒吧扩展的游戏（子项目 4C-3、最后一颗糖）；局面存在 bar_round，结束就删 */
export type BarGame = 'devil' | 'memory' | 'darts' | 'nim' | 'spice' | 'deal';

/** 本店这个游戏进行中的局；调用方已锁店 */
export async function loadRound<T>(o: Op, game: BarGame): Promise<T | null> {
  const r = await o.tx
    .selectFrom('bar_round')
    .select('state')
    .where('rest_id', '=', o.rest.id)
    .where('game', '=', game)
    .executeTakeFirst();
  return r ? (r.state as T) : null;
}

/** 开新局：已有局时报 ALREADY_DONE（bar_round） */
export async function assertNoRound(o: Op, game: BarGame): Promise<void> {
  if (await loadRound(o, game)) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'bar_round' });
}

export async function saveRound(o: Op, game: BarGame, state: object): Promise<void> {
  const json = JSON.stringify(state);
  await o.tx
    .insertInto('bar_round')
    .values({ rest_id: o.rest.id, game, state: json, started_at: o.now, updated_at: o.now })
    .onConflict((oc) => oc.columns(['rest_id', 'game']).doUpdateSet({ state: json, updated_at: o.now }))
    .execute();
}

export async function endRound(o: Op, game: BarGame): Promise<void> {
  await o.tx.deleteFrom('bar_round').where('rest_id', '=', o.rest.id).where('game', '=', game).execute();
}

/** 概览用：不加锁读取 */
export async function peekRound<T>(db: Kysely<DB>, restId: number, game: BarGame): Promise<T | null> {
  const r = await db
    .selectFrom('bar_round')
    .select('state')
    .where('rest_id', '=', restId)
    .where('game', '=', game)
    .executeTakeFirst();
  return r ? (r.state as T) : null;
}

/** 概览用：一条查询读出本店所有进行中的局（不加锁） */
export async function peekRounds(db: Kysely<DB>, restId: number): Promise<Partial<Record<BarGame, unknown>>> {
  const rows = await db
    .selectFrom('bar_round')
    .select(['game', 'state'])
    .where('rest_id', '=', restId)
    .execute();
  return Object.fromEntries(rows.map((x) => [x.game, x.state])) as Partial<Record<BarGame, unknown>>;
}
