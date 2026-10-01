import { sql, type Kysely } from 'kysely';
import type { GameConfig, Tuning } from '@dt/config';
import { hashSeed, seededRng, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { isEmptyTable } from '../interact/tables';
import { emptyCookbookLevels, initialTables } from '../restaurant/rules';
import { dineAccrual } from '../settlement/tables';

/** 系统账号的用户名：注册规则不允许 "~"，玩家不会撞名 */
export const NPC_USERNAME = '~krab';
const NPC_EMAIL = 'krab@npc.invalid';

export async function npcAccountId(db: Kysely<DB>): Promise<number> {
  await sql`insert into account (username, password_hash, email, email_verified_at, is_system)
    values (${NPC_USERNAME}, '!', ${NPC_EMAIL}, now(), true) on conflict do nothing`.execute(db);
  const r = await db
    .selectFrom('account')
    .select('id')
    .where('username', '=', NPC_USERNAME)
    .executeTakeFirstOrThrow();
  return r.id;
}

export async function npcIdOf(db: Kysely<DB>, shardId: number): Promise<number | null> {
  const r = await db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('npc', '=', true)
    .executeTakeFirst();
  return r?.id ?? null;
}

/** 蟹老板的橱柜：清空后从 1~5 级食材里随机放 restockKinds 种、每种 restockNum 个；返回种数 */
export async function restockNpc(
  db: Kysely<DB>,
  config: GameConfig,
  t: Tuning['friend']['npc'],
  npcId: number,
  rng: Rng,
): Promise<number> {
  await db.deleteFrom('cupboard_food').where('rest_id', '=', npcId).execute();
  const pool = [1, 2, 3, 4, 5].flatMap((l) => config.foodsByLevel.get(l) ?? []);
  const want = Math.min(t.restockKinds, pool.length);
  const picked = new Set<number>();
  while (picked.size < want) picked.add(pool[rng.int(pool.length)]!.id);
  if (picked.size > 0)
    await db
      .insertInto('cupboard_food')
      .values([...picked].map((id) => ({ rest_id: npcId, foods_id: id, num: t.restockNum })))
      .execute();
  return picked.size;
}

/** 区服的蟹老板餐厅：没有就建（幂等）；新建时顺便补一次货 */
export async function ensureNpc(
  db: Kysely<DB>,
  config: GameConfig,
  t: Tuning['friend']['npc'],
  shardId: number,
  rng: Rng,
): Promise<{ id: number; created: boolean }> {
  const found = await npcIdOf(db, shardId);
  if (found !== null) return { id: found, created: false };
  const accountId = await npcAccountId(db);
  return db.transaction().execute(async (tx) => {
    const ins = await tx
      .insertInto('restaurant')
      .values({
        shard_id: shardId,
        account_id: accountId,
        name: t.name,
        level: t.level,
        coin: 0,
        diamond: 0,
        strength: 0,
        strength_max: 0,
        oil: t.oil,
        oil_max: t.oil,
        star_level: t.star,
        street_id: 0,
        renown: 0,
        attr_left: 0,
        table_num: t.tables,
        cupboard_num: 999,
        store_num: 0,
        foods_max_num: 999,
        foods_lock_num: 0,
        npc: true,
        avatar: t.avatar,
        door: t.door,
        notice: '欢迎光临蟹黄堡！',
      })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!ins) {
      const id = await npcIdOf(tx, shardId);
      if (id === null) throw new Error(`cannot create npc restaurant in shard ${shardId}: name taken`);
      return { id, created: false };
    }
    await tx
      .insertInto('restaurant_tables')
      .values({ rest_id: ins.id, tables: JSON.stringify(initialTables(t.tables)) })
      .execute();
    await tx
      .insertInto('restaurant_cookbooks')
      .values({ rest_id: ins.id, levels: emptyCookbookLevels(config.maxCookbookId) })
      .execute();
    await restockNpc(tx, config, t, ins.id, rng);
    return { id: ins.id, created: true };
  });
}

/**
 * 蟹老板向邮箱已验证、还没邀请过的店发好友申请（每家店只邀请一次，计划裁定 3）；
 * 已经是好友的只记邀请不发申请。返回发出的申请数
 */
export async function npcInvite(
  db: Kysely<DB>,
  where: { shardId?: number; accountId?: number; restId?: number },
): Promise<number> {
  const conds = [
    sql`not r.npc`,
    sql`a.email_verified_at is not null`,
    sql`not exists (select 1 from npc_invite i where i.rest_id = r.id)`,
  ];
  if (where.shardId !== undefined) conds.push(sql`r.shard_id = ${where.shardId}`);
  if (where.accountId !== undefined) conds.push(sql`r.account_id = ${where.accountId}`);
  if (where.restId !== undefined) conds.push(sql`r.id = ${where.restId}`);
  const res = await sql<{ to_rest: number }>`
    with picked as (
      select r.id, n.id as npc_id
      from restaurant r
      join account a on a.id = r.account_id
      join restaurant n on n.shard_id = r.shard_id and n.npc
      where ${sql.join(conds, sql` and `)}
    ), mark as (
      insert into npc_invite (rest_id) select id from picked on conflict do nothing returning rest_id
    )
    insert into friend_request (from_rest, to_rest)
    select p.npc_id, p.id from picked p join mark m on m.rest_id = p.id
    where not exists (select 1 from friend f where f.rest_id = p.id and f.friend_id = p.npc_id)
    on conflict do nothing
    returning to_rest`.execute(db);
  return res.rows.length;
}

/** 结算轮次里蟹老板只跑餐桌：白食累计（不扣蟹老板银币，设计文档 裁定 11）、空桌长蟑螂 */
export async function npcTableRound(
  d: GameDeps,
  shardId: number,
  round: number,
  now: Date,
): Promise<'settled' | 'skipped' | 'none'> {
  const npcId = await npcIdOf(d.db, shardId);
  if (npcId === null) return 'none';
  return runSystemOp(
    d,
    shardId,
    npcId,
    { source: 'settlement', now, rng: seededRng(hashSeed(shardId, round, npcId)) },
    async (op) => {
      const tr = await op.tx
        .selectFrom('restaurant_tables')
        .selectAll()
        .where('rest_id', '=', npcId)
        .executeTakeFirstOrThrow();
      if (tr.round_no >= round) return 'skipped';
      const rt = op.tuning.rest;
      const s = op.rest.star_level;
      const base = {
        oilBase: rt.oilBase,
        coinBase: rt.coinBase - Math.floor(s / 2),
        expBase: rt.expBase + Math.floor(s / 2),
      };
      const tables = tr.tables.map((tb) => {
        if (tb.customer === 9 && tb.freeloader) {
          const a = dineAccrual(tb.freeloader, now, s, base, op.rng);
          return {
            ...tb,
            freeloader: {
              ...tb.freeloader,
              coin: tb.freeloader.coin + a.loss,
              exp: tb.freeloader.exp + a.exp,
            },
          };
        }
        if (isEmptyTable(tb) && op.rng.chance(op.tuning.friend.npc.roachRate))
          return { no: tb.no, floor: tb.floor, customer: 3, roach: { by: null, at: now.toISOString() } };
        return tb;
      });
      await op.tx
        .updateTable('restaurant_tables')
        .set({ round_no: round, tables: JSON.stringify(tables) })
        .where('rest_id', '=', npcId)
        .execute();
      return 'settled';
    },
  );
}

const registered = new WeakSet<EventBus>();

/** 已验证邮箱的账号开新店时，蟹老板立即发申请 */
export function registerNpcHandlers(bus: EventBus): void {
  if (registered.has(bus)) return;
  registered.add(bus);
  bus.on('restaurant.created', async (tx, e) => {
    await npcInvite(tx, { restId: e.restId });
  });
}

/** 蟹老板的钱袋补到 amount，比它多时不动（4E-1 终审 C1：摇钱包从这里扣） */
export async function topUpNpcCoin(db: Kysely<DB>, restId: number, amount: number): Promise<void> {
  await db
    .updateTable('restaurant')
    .set({ coin: sql<number>`greatest(coin, ${amount})` })
    .where('id', '=', restId)
    .execute();
}
