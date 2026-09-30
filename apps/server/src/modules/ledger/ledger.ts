import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export interface LedgerEntry {
  restId: number;
  kind: 'goods' | 'foods' | 'coin' | 'diamond' | 'exp' | 'renown' | 'oil' | 'strength' | 'remnant' | 'seed';
  itemId?: number;
  delta: number;
  source: string;
  refRestId?: number;
}

export async function recordLedger(db: Kysely<DB>, entries: LedgerEntry[], at?: Date): Promise<void> {
  if (entries.length === 0) return;
  await db
    .insertInto('ledger')
    .values(
      entries.map((e) => ({
        rest_id: e.restId,
        kind: e.kind,
        item_id: e.itemId ?? null,
        delta: e.delta,
        source: e.source,
        ref_rest_id: e.refRestId ?? null,
        ...(at ? { created_at: at } : {}),
      })),
    )
    .execute();
}
