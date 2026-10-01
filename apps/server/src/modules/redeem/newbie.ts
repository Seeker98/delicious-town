import type { Kysely } from 'kysely';
import type { NewbieCode } from '@dt/config';
import type { DB } from '../../db/schema';
import { npcAccountId } from '../npc/npc';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 新手码同步（问题记录 150，设计 §4.2）：没有就插入；系统账号建的按配置更新奖励、等级、说明；
 * 不碰停用状态和已用次数；后台手动建的同名码不覆盖
 */
export async function syncNewbieCodes(
  db: Kysely<DB>,
  codes: readonly NewbieCode[],
  log: { warn(o: object, m: string): void },
): Promise<{ inserted: number; updated: number; skipped: string[] }> {
  const actor = await npcAccountId(db);
  const out = { inserted: 0, updated: 0, skipped: [] as string[] };
  for (const c of codes) {
    const cur = await db
      .selectFrom('redeem_code')
      .select(['id', 'actor_account_id', 'items', 'min_level', 'note'])
      .where('code', '=', c.code)
      .executeTakeFirst();
    if (!cur) {
      const added = await db
        .insertInto('redeem_code')
        .values({
          code: c.code,
          kind: 'shared',
          items: JSON.stringify(c.items),
          min_level: c.minLevel,
          note: c.note,
          actor_account_id: actor,
        })
        .onConflict((oc) => oc.column('code').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (added) out.inserted++;
      continue;
    }
    if (cur.actor_account_id !== actor) {
      out.skipped.push(c.code);
      log.warn({ code: c.code }, 'newbie code taken by a manual code, skipped');
      continue;
    }
    if (same(cur.items, c.items) && cur.min_level === c.minLevel && cur.note === c.note) continue;
    await db
      .updateTable('redeem_code')
      .set({ items: JSON.stringify(c.items), min_level: c.minLevel, note: c.note })
      .where('id', '=', cur.id)
      .execute();
    out.updated++;
  }
  return out;
}
