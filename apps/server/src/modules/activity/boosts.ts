import type { Kysely } from 'kysely';
import type { BoostItem } from '@dt/shared';
import type { DB } from '../../db/schema';

export interface ActiveBoostRow {
  id: number;
  title: string;
  items: BoostItem[];
  endsAt: Date;
}

/**
 * 某区服此刻正在生效的全服加成活动（本区服的和全服的，148-4 设计 §6.2）：
 * 区服数值叠加用它，首页"生效的加成"也用它列出来（问题记录 294），两边口径一致
 */
export async function activeBoosts(db: Kysely<DB>, shardId: number, at: Date): Promise<ActiveBoostRow[]> {
  const rows = await db
    .selectFrom('activity')
    .select(['id', 'title', 'def', 'ends_at'])
    .where('kind', '=', 'boost')
    .where('deleted_at', 'is', null)
    .where('starts_at', '<=', at)
    .where('ends_at', '>', at)
    .where((eb) => eb.or([eb('shard_id', '=', shardId), eb('shard_id', 'is', null)]))
    .orderBy('ends_at')
    .orderBy('id')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    items: (r.def as { items: BoostItem[] }).items,
    endsAt: r.ends_at,
  }));
}
