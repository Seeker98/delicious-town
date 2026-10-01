import type { Kysely } from 'kysely';
import { EQUIP_ATTRS, PART_MAIN, scaleToTotal, type EquipAttr, type GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { attrCols, baseAttrs, boostAttrs } from './instances';

const isAttr = (a: string | null): a is EquipAttr =>
  a !== null && (EQUIP_ATTRS as readonly string[]).includes(a);

/**
 * 按当前配置的数值表重算已生成的厨具（问题记录 120、设计 §6）：基础缩放到 +0，强化增量按记录重写，
 * 穿戴等级跟配置；幂等，部署改表后可以再跑
 */
export async function rescaleEquips(
  db: Kysely<DB>,
  config: GameConfig,
): Promise<{ total: number; changed: number }> {
  return db.transaction().execute(async (tx) => {
    const rows = await tx.selectFrom('equip').selectAll().orderBy('id').execute();
    let changed = 0;
    for (const e of rows) {
      const def = config.goods.get(e.goods_id)?.equip;
      if (!def) continue;
      const table = def.stressTable;
      const main = PART_MAIN[def.part]!;
      const base = scaleToTotal(baseAttrs(e), table[0]!, main);
      const logs = await tx
        .selectFrom('equip_stress_log')
        .select(['id', 'stress', 'attr', 'val'])
        .where('equip_id', '=', e.id)
        .where('success', '=', true)
        .where('stress', '<=', e.stress)
        .orderBy('id')
        .execute();
      const latest = new Map<number, (typeof logs)[number]>();
      for (const l of logs) latest.set(l.stress, l);
      const st = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
      for (let k = 1; k <= e.stress; k++) {
        const delta = (table[k] ?? table[table.length - 1]!) - (table[k - 1] ?? table[table.length - 1]!);
        const l = latest.get(k);
        st[l && isAttr(l.attr) ? l.attr : main] += delta;
        if (l && l.val !== delta)
          await tx.updateTable('equip_stress_log').set({ val: delta }).where('id', '=', l.id).execute();
      }
      const same =
        EQUIP_ATTRS.every((a) => baseAttrs(e)[a] === base[a] && boostAttrs(e)[a] === st[a]) &&
        e.min_level === def.minLevel;
      if (same) continue;
      await tx
        .updateTable('equip')
        .set({ ...attrCols('base_', base), ...attrCols('st_', st), min_level: def.minLevel })
        .where('id', '=', e.id)
        .execute();
      changed++;
    }
    return { total: rows.length, changed };
  });
}
