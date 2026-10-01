import type { Kysely } from 'kysely';
import type { NewbieCode } from '@dt/config';
import type { GuideCodeDto } from '@dt/shared';
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

/** 指引页：配置里的新手码在本店的状态（设计 §4.3）；只认系统账号建的码 */
export async function guideCodes(
  db: Kysely<DB>,
  codes: readonly NewbieCode[],
  restId: number,
): Promise<GuideCodeDto[]> {
  if (codes.length === 0) return [];
  const actor = await npcAccountId(db);
  const rest = await db
    .selectFrom('restaurant')
    .select('level')
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  const rows = await db
    .selectFrom('redeem_code as c')
    .leftJoin('redeem_use as u', (j) => j.onRef('u.code_id', '=', 'c.id').on('u.rest_id', '=', restId))
    .select(['c.code', 'c.disabled_at', 'c.actor_account_id', 'u.id as used'])
    .where(
      'c.code',
      'in',
      codes.map((c) => c.code),
    )
    .execute();
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return codes.map((c) => {
    const r = byCode.get(c.code);
    // 领过的码即使后来停用也显示"已领"
    const state: GuideCodeDto['state'] =
      !r || r.actor_account_id !== actor
        ? 'off'
        : r.used !== null
          ? 'used'
          : r.disabled_at
            ? 'off'
            : rest.level < c.minLevel
              ? 'level'
              : 'ok';
    return { code: c.code, minLevel: c.minLevel, items: c.items, state };
  });
}
