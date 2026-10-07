import { sql, type Kysely } from 'kysely';
import type { Food, GameConfig, Tuning } from '@dt/config';
import { seededRng, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { isEmptyTable } from '../interact/tables';
import { emptyCookbookLevels, initialTables } from '../restaurant/rules';
import { dineAccrual } from '../settlement/tables';
import { gameSeed } from '../../core/seed';

/** 系统账号的用户名：注册规则不允许 "~"，玩家不会撞名 */
export const NPC_USERNAME = '~krab';
const NPC_EMAIL = 'krab@npc.invalid';

export async function npcAccountId(db: Kysely<DB>): Promise<number> {
  // 已经有了就直接返回：insert … on conflict 即使没插入也会消耗一个账号自增 id（backlog 新手码）
  const found = await db
    .selectFrom('account')
    .select('id')
    .where('username', '=', NPC_USERNAME)
    .executeTakeFirst();
  if (found) return found.id;
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

/** 蟹老板橱柜里一种食材当天补到的数（问题记录 370）：按等级的区间随机，稀有食材按出现权重打折，至少 1 个 */
export function npcRestockTarget(
  food: Pick<Food, 'level' | 'odds'>,
  t: Tuning['friend']['npc'],
  rng: Rng,
): number {
  const [lo, hi] = t.restockRanges[food.level - 1] ?? [1, 1];
  const n = lo + rng.int(hi - lo + 1);
  return Math.max(1, Math.round((n * Math.min(food.odds, 100)) / 100));
}

/**
 * 蟹老板的橱柜（问题记录 370）：1~5 级所有（未下架的）食材都放，每种补到当天的随机数。
 * 只补不减：玩家换走、翻走的第二天补回来，比当天的数多的不动。返回补了几种。
 * 不在 1~5 级现有食材里的（以后下架的）删掉，免得还能被换走、翻走（审查 Important）；
 * 冰箱清空：玩家交换时给他的食材只进不出，满了会进冰箱、再满就每次写一条掉落日志（审查 Minor）
 */
export async function restockNpc(
  db: Kysely<DB>,
  config: GameConfig,
  t: Tuning['friend']['npc'],
  npcId: number,
  rng: Rng,
): Promise<number> {
  const have = new Map(
    (
      await db.selectFrom('cupboard_food').select(['foods_id', 'num']).where('rest_id', '=', npcId).execute()
    ).map((r) => [r.foods_id, r.num]),
  );
  const live = [1, 2, 3, 4, 5].flatMap((level) => config.foodsByLevel.get(level) ?? []);
  await db
    .deleteFrom('cupboard_food')
    .where('rest_id', '=', npcId)
    .where(
      'foods_id',
      'not in',
      live.map((f) => f.id),
    )
    .execute();
  await db
    .updateTable('cupboard_food')
    .set({ fridge_num: 0 })
    .where('rest_id', '=', npcId)
    .where('fridge_num', '>', 0)
    .execute();
  const rows: Array<{ rest_id: number; foods_id: number; num: number }> = [];
  for (const f of live) {
    const target = npcRestockTarget(f, t, rng);
    if ((have.get(f.id) ?? 0) < target) rows.push({ rest_id: npcId, foods_id: f.id, num: target });
  }
  if (rows.length > 0)
    await db
      .insertInto('cupboard_food')
      .values(rows)
      .onConflict((oc) =>
        oc.columns(['rest_id', 'foods_id']).doUpdateSet((eb) => ({ num: eb.ref('excluded.num') })),
      )
      .execute();
  return rows.length;
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
      .values({ rest_id: ins.id, levels: emptyCookbookLevels(config.cookbookIndex.slots) })
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
    { source: 'settlement', now, rng: seededRng(gameSeed(shardId, round, npcId)) },
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
      const foreignMs = op.tuning.settlement.roachForeignHours * 3_600_000;
      const tables = tr.tables.map((raw) => {
        // 玩家放的蟑螂待满 roachForeignHours 就跑掉，桌子空出来照常长系统蟑螂：
        // 一个人放的不能一直占着蟹老板的桌子（问题记录 457 后续，用户 2026-10-07 定）
        const tb =
          raw.customer === 3 && raw.roach?.by != null && now.getTime() - Date.parse(raw.roach.at) >= foreignMs
            ? { no: raw.no, floor: raw.floor, customer: 0 }
            : raw;
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
