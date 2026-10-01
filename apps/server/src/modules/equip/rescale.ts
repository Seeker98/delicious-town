import { EQUIP_ATTRS, PART_MAIN, scaleToTotal, type EquipAttr } from '@dt/config';
import type { GameDeps } from '../../core/deps';
import { runSystemOp, type Op } from '../../core/op';
import { syncEquipEffects } from './effects';
import { attrCols, baseAttrs, boostAttrs } from './instances';
import { tableAt } from './rules';

const isAttr = (a: string | null): a is EquipAttr =>
  a !== null && (EQUIP_ATTRS as readonly string[]).includes(a);

/** 重算一家店的全部厨具；在锁店的事务里读，和玩家操作串行（终审 I3）。返回改了几件、有没有改到穿着的 */
async function rescaleRest(o: Op): Promise<{ total: number; changed: number; worn: boolean }> {
  const rows = await o.tx
    .selectFrom('equip')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .orderBy('id')
    .execute();
  let changed = 0;
  let worn = false;
  for (const e of rows) {
    const def = o.config.goods.get(e.goods_id)?.equip;
    if (!def) continue;
    const table = def.stressTable;
    const main = PART_MAIN[def.part]!;
    const base = scaleToTotal(baseAttrs(e), tableAt(table, 0), main);
    const logs = await o.tx
      .selectFrom('equip_stress_log')
      .select(['id', 'stress', 'attr', 'val'])
      .where('equip_id', '=', e.id)
      .where('success', '=', true)
      .where('stress', '<=', e.stress)
      .orderBy('id')
      .execute();
    // 同一等级有多条（回退后重强）时取最后一条
    const latest = new Map<number, (typeof logs)[number]>();
    for (const l of logs) latest.set(l.stress, l);
    const st = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
    for (let k = 1; k <= e.stress; k++) {
      const delta = tableAt(table, k) - tableAt(table, k - 1);
      const l = latest.get(k);
      // 记录缺失的等级（老数据），增量记到部位主属性
      st[l && isAttr(l.attr) ? l.attr : main] += delta;
      if (l && l.val !== delta)
        await o.tx.updateTable('equip_stress_log').set({ val: delta }).where('id', '=', l.id).execute();
    }
    const same =
      EQUIP_ATTRS.every((a) => baseAttrs(e)[a] === base[a] && boostAttrs(e)[a] === st[a]) &&
      e.min_level === def.minLevel;
    if (same) continue;
    await o.tx
      .updateTable('equip')
      .set({ ...attrCols('base_', base), ...attrCols('st_', st), min_level: def.minLevel })
      .where('id', '=', e.id)
      .execute();
    changed++;
    if (e.worn) worn = true;
  }
  // 穿着的厨具变了：重建缓存的厨具幸运和套装加成（终审 I2）
  if (worn) await syncEquipEffects(o);
  return { total: rows.length, changed, worn };
}

/**
 * 按当前配置的数值表重算已生成的厨具（问题记录 120、设计 §6）：基础缩放到 +0，强化增量按记录重写，
 * 穿戴等级跟配置。每家店一个锁店的短事务，不会和玩家的强化互相覆盖；幂等，部署改表后可以再跑
 */
export async function rescaleEquips(d: GameDeps): Promise<{ total: number; changed: number }> {
  const rests = await d.db
    .selectFrom('equip')
    .innerJoin('restaurant', 'restaurant.id', 'equip.rest_id')
    .select(['equip.rest_id', 'restaurant.shard_id'])
    .distinct()
    .orderBy('equip.rest_id')
    .execute();
  let total = 0;
  let changed = 0;
  for (const r of rests) {
    const res = await runSystemOp(
      d,
      r.shard_id,
      r.rest_id,
      { source: 'equip.rescale', now: d.now() },
      rescaleRest,
    );
    total += res.total;
    changed += res.changed;
  }
  return { total, changed };
}
