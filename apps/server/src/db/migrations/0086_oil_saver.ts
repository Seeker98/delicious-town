import { sql, type Kysely } from 'kysely';

/**
 * 节油器改版（工单 2026-10-18；用户 2026-10-19 定迁移做法）：十件旧节油器按编号改成节油器、省油阀两类，定义在配置里。
 * - 仓库：中效（30202，现在是 12 钻的特级节油器）、特供（30207，现在是卖油翁的铜钱阀）并进中级节油器 30201
 * - 摆着、没到期的节油器（30201~30210）一律撤掉，换上一个刚摆上的卖油翁的铜钱阀（24 小时，总耗油 −90%），
 *   加成来源跟着重写、店标脏下一轮重算。设施的加成是摆放时抄进 effect_source 的，不改就会一直按旧值算到期
 * - 每个区服发一封全区邮件，附件一个卖油翁的铜钱阀（只有迁移前开的店看得到，见 mail/inbox）
 * down 不还原
 */
export const MID_SAVER = 30201;
export const COPPER_VALVE = 30207;
/** 卖油翁的铜钱阀的效果和时长：和配置里 30207 的 value 一致（配置测试对着查） */
export const COPPER_EFFECTS = { oilRate: -0.9 };
export const COPPER_HOURS = 24;
const MERGE = [30202, 30207];
const SAVERS: [number, number] = [30201, 30210];

export async function revampOilSavers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  log: (line: string) => void = console.log,
  /** 只给测试用：限定店和区服（测试库是共用的）；迁移本身不传，处理全部 */
  only: { restIds: number[]; shardIds: number[] } | null = null,
) {
  const n = (r: { numAffectedRows?: bigint }) => Number(r.numAffectedRows ?? 0);
  const inList = (col: string, ids: number[]) =>
    ids.length > 0 ? sql` and ${sql.ref(col)} in (${sql.join(ids)})` : sql` and false`;
  const rest = (col: string) => (only ? inList(col, only.restIds) : sql``);
  // 1. 仓库并进中级节油器
  for (const from of MERGE) {
    const r = await sql`insert into store_item (rest_id, goods_id, num, expires_at)
      select rest_id, ${MID_SAVER}, num, null from store_item where goods_id = ${from} and num > 0${rest('rest_id')}
      on conflict (rest_id, goods_id) do update set num = store_item.num + excluded.num`.execute(db);
    await sql`delete from store_item where goods_id = ${from}${rest('rest_id')}`.execute(db);
    log(`oil saver: store ${from} -> ${MID_SAVER}: ${n(r)}`);
  }
  // 2. 摆着的换成刚摆上的铜钱阀
  const placed = await sql<{ rest_id: number; slot: number }>`
    update restaurant_device set goods_id = ${COPPER_VALVE}, placed_at = now(),
      expires_at = now() + make_interval(hours => ${COPPER_HOURS})
    where goods_id between ${SAVERS[0]} and ${SAVERS[1]} and (expires_at is null or expires_at > now())${rest('rest_id')}
    returning rest_id, slot`.execute(db);
  for (const p of placed.rows) {
    await sql`insert into effect_source (rest_id, source_type, source_id, effects, expires_at)
      values (${p.rest_id}, 'device', ${p.slot}, ${JSON.stringify(COPPER_EFFECTS)}::jsonb,
        now() + make_interval(hours => ${COPPER_HOURS}))
      on conflict (rest_id, source_type, source_id)
      do update set effects = excluded.effects, expires_at = excluded.expires_at`.execute(db);
  }
  const rests = [...new Set(placed.rows.map((p) => p.rest_id))];
  if (rests.length > 0)
    await sql`update restaurant set effect_dirty = true where id in (${sql.join(rests)})`.execute(db);
  log(`oil saver: placed -> copper valve: ${placed.rows.length}`);
  // 3. 每个区服一封补偿邮件
  const shards = await sql<{
    id: number;
  }>`select id from shard where true${only ? inList('id', only.shardIds) : sql``} order by id`.execute(db);
  for (const s of shards.rows) {
    await sql`insert into mail (scope, shard_id, rest_id, min_level, title, body, tpl, tpl_params, items, source, actor_account_id, expires_at)
      values ('shard', ${s.id}, null, null, '节油器改版补偿',
        '节油器改版了: 摆着的节油器已经换成卖油翁的铜钱阀 (24 小时内总耗油 -90%), 仓库里的中效、特供节油器并成了中级节油器。附件再送每家一个卖油翁的铜钱阀。',
        'oilsaver.revamp', '{}'::jsonb, ${JSON.stringify({ goods: [{ id: COPPER_VALVE, num: 1 }] })}::jsonb,
        'oilsaver.revamp', null, now() + interval '30 days')`.execute(db);
  }
  log(`oil saver: compensation mail to ${shards.rows.length} shard(s)`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await revampOilSavers(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
