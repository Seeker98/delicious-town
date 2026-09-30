import { sql } from 'kysely';
import {
  ErrorCode,
  type AccountRole,
  type AdminLedgerPageDto,
  type AdminRestaurantDto,
  type PageQuery,
  type PlayerBriefDto,
  type PlayerDetailDto,
  type PlayerRestaurantBriefDto,
} from '@dt/shared';
import { restLog, runSystemOp } from '../../core/op';
import { uniqueViolation } from '../../db/errors';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { renameProblem } from '../growth/rules';
import { cursorOf, incomePage, logPage, parseCursor } from '../restaurant/reads';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

/** LIKE 的通配符按字面匹配（Review Focus 1）；PostgreSQL 默认转义符是反斜杠 */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createAdminPlayers(game: Game) {
  const { db, sessions } = game.app;

  async function restaurantsOf(accountIds: number[]): Promise<Map<number, PlayerRestaurantBriefDto[]>> {
    const out = new Map<number, PlayerRestaurantBriefDto[]>();
    if (accountIds.length === 0) return out;
    const rows = await db
      .selectFrom('restaurant')
      .innerJoin('shard', 'shard.id', 'restaurant.shard_id')
      .select([
        'restaurant.id',
        'restaurant.account_id',
        'restaurant.shard_id',
        'shard.name as shard_name',
        'restaurant.name',
        'restaurant.level',
        'restaurant.star_level',
        'restaurant.state',
      ])
      .where('restaurant.account_id', 'in', accountIds)
      .orderBy('restaurant.shard_id')
      .execute();
    for (const r of rows) {
      const list = out.get(r.account_id) ?? [];
      list.push({
        id: r.id,
        shardId: r.shard_id,
        shardName: r.shard_name,
        name: r.name,
        level: r.level,
        star: r.star_level,
        state: r.state,
      });
      out.set(r.account_id, list);
    }
    return out;
  }

  async function accountRow(accountId: number) {
    const a = await db.selectFrom('account').selectAll().where('id', '=', accountId).executeTakeFirst();
    if (!a) throw new AppError(ErrorCode.NOT_FOUND, 404);
    return a;
  }

  async function restaurantRow(restId: number) {
    const r = await db
      .selectFrom('restaurant')
      .select(['id', 'shard_id', 'name'])
      .where('id', '=', restId)
      .executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    return r;
  }

  return {
    async search(q: string): Promise<PlayerBriefDto[]> {
      let ids: number[];
      if (/^\d+$/.test(q)) ids = [Number(q)];
      else {
        const prefix = `${likeEscape(q.toLowerCase())}%`;
        const byAccount = await db
          .selectFrom('account')
          .select('id')
          .where('is_system', '=', false)
          .where((eb) =>
            eb.or([
              eb(sql<string>`lower(username)`, 'like', prefix),
              eb(sql<string>`lower(email)`, 'like', prefix),
            ]),
          )
          .limit(50)
          .execute();
        const byShop = await db
          .selectFrom('restaurant')
          .select('account_id')
          .where('name', 'ilike', `%${likeEscape(q)}%`)
          .limit(50)
          .execute();
        ids = [...new Set([...byAccount.map((r) => r.id), ...byShop.map((r) => r.account_id)])].slice(0, 50);
      }
      if (ids.length === 0) return [];
      const accounts = await db
        .selectFrom('account')
        .select(['id', 'username', 'email', 'role', 'banned_at'])
        .where('is_system', '=', false)
        .where('id', 'in', ids)
        .orderBy('id')
        .execute();
      const rests = await restaurantsOf(accounts.map((a) => a.id));
      return accounts.map((a) => ({
        accountId: a.id,
        username: a.username,
        email: a.email,
        role: a.role,
        banned: a.banned_at !== null,
        restaurants: rests.get(a.id) ?? [],
      }));
    },

    async detail(accountId: number): Promise<PlayerDetailDto> {
      const a = await accountRow(accountId);
      const rests = await restaurantsOf([a.id]);
      return {
        accountId: a.id,
        username: a.username,
        email: a.email,
        role: a.role,
        banned: a.banned_at !== null,
        restaurants: rests.get(a.id) ?? [],
        emailVerified: a.email_verified_at !== null,
        bannedAt: a.banned_at?.toISOString() ?? null,
        banReason: a.ban_reason,
        createdAt: a.created_at.toISOString(),
      };
    },

    async restaurant(restId: number): Promise<AdminRestaurantDto> {
      await restaurantRow(restId);
      const who = await db
        .selectFrom('restaurant')
        .innerJoin('account', 'account.id', 'restaurant.account_id')
        .innerJoin('shard', 'shard.id', 'restaurant.shard_id')
        .select(['account.id as account_id', 'account.username', 'shard.name as shard_name'])
        .where('restaurant.id', '=', restId)
        .executeTakeFirstOrThrow();
      const [overview, store, cupboard, equips] = await Promise.all([
        game.restaurant.overview(restId),
        db
          .selectFrom('store_item')
          .select(['goods_id', 'num', 'expires_at'])
          .where('rest_id', '=', restId)
          .orderBy('goods_id')
          .execute(),
        db
          .selectFrom('cupboard_food')
          .select(['foods_id', 'num', 'fridge_num', 'locked'])
          .where('rest_id', '=', restId)
          .orderBy('foods_id')
          .execute(),
        db
          .selectFrom('equip as e')
          .select((eb) => [
            'e.id',
            'e.goods_id',
            'e.part',
            'e.stress',
            'e.worn',
            'e.locked',
            eb
              .selectFrom('equip_gem as g')
              .select((x) => x.fn.countAll<number>().as('n'))
              .whereRef('g.equip_id', '=', 'e.id')
              .as('gems'),
          ])
          .where('e.rest_id', '=', restId)
          .orderBy('e.part')
          .orderBy('e.id')
          .execute(),
      ]);
      return {
        overview,
        owner: { accountId: who.account_id, username: who.username },
        shardName: who.shard_name,
        store: store.map((s) => ({
          goodsId: s.goods_id,
          num: s.num,
          expiresAt: s.expires_at?.toISOString() ?? null,
        })),
        equips: equips.map((e) => ({
          id: e.id,
          goodsId: e.goods_id,
          part: e.part,
          stress: e.stress,
          worn: e.worn,
          locked: e.locked,
          gems: Number(e.gems ?? 0),
        })),
        cupboard: cupboard.map((c) => ({
          foodsId: c.foods_id,
          num: c.num,
          fridgeNum: c.fridge_num,
          locked: c.locked,
        })),
      };
    },

    async ledger(
      restId: number,
      q: PageQuery & { kind?: string; source?: string },
    ): Promise<AdminLedgerPageDto> {
      let s = db
        .selectFrom('ledger')
        .select(['id', 'kind', 'item_id', 'delta', 'source', 'created_at'])
        .where('rest_id', '=', restId);
      if (q.kind) s = s.where('kind', '=', q.kind);
      if (q.source) s = s.where('source', '=', q.source);
      if (q.before) {
        const c = parseCursor(q.before);
        s = c.id
          ? s.where((eb) =>
              eb.or([
                eb('created_at', '<', c.at),
                eb.and([eb('created_at', '=', c.at), eb('id', '<', Number(c.id))]),
              ]),
            )
          : s.where('created_at', '<', c.at);
      }
      const rows = await s
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(q.limit + 1)
        .execute();
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => ({
          kind: r.kind,
          itemId: r.item_id,
          delta: r.delta,
          source: r.source,
          at: r.created_at.toISOString(),
        })),
        nextBefore: rows.length > q.limit && last ? cursorOf(last.created_at, last.id) : null,
      };
    },

    log: (restId: number, q: PageQuery) => logPage(db, restId, q),
    income: (restId: number, q: PageQuery) => incomePage(db, restId, q),

    async ban(actor: AdminActor, accountId: number, reason: string): Promise<{ banned: boolean }> {
      if (accountId === actor.accountId) throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'self' });
      const target = await accountRow(accountId);
      if (target.role === 'admin' && actor.role !== 'admin')
        throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'admin' });
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('account')
          .set({ banned_at: game.deps.now(), ban_reason: reason })
          .where('id', '=', accountId)
          .execute();
        await writeAudit(tx, {
          actor,
          action: 'player.ban',
          target: `account:${accountId}`,
          detail: { reason },
        });
      });
      await sessions.destroyAll(accountId);
      return { banned: true };
    },

    async unban(actor: AdminActor, accountId: number): Promise<{ banned: boolean }> {
      const target = await accountRow(accountId);
      // 和封号对称：mod 解封 admin 等于恢复了一个管理员的权限
      if (target.role === 'admin' && actor.role !== 'admin')
        throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'admin' });
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('account')
          .set({ banned_at: null, ban_reason: null })
          .where('id', '=', accountId)
          .execute();
        await writeAudit(tx, { actor, action: 'player.unban', target: `account:${accountId}` });
      });
      return { banned: false };
    },

    /** 强制改店名：不收改名卡和银币，照样检查名称规则和重名 */
    async rename(
      actor: AdminActor,
      restId: number,
      rawName: string,
      reason: string,
    ): Promise<{ name: string }> {
      const rest = await restaurantRow(restId);
      const name = rawName.trim();
      const { tuning } = await game.shards.settings(rest.shard_id);
      const problem = renameProblem(name, tuning.growth.renameMaxLength);
      if (problem) throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: problem });
      await runSystemOp(game.deps, rest.shard_id, restId, { source: 'admin.rename' }, async (op) => {
        const from = op.rest.name;
        if (from === name) return;
        try {
          await op.tx.updateTable('restaurant').set({ name }).where('id', '=', restId).execute();
        } catch (e) {
          if (uniqueViolation(e) === 'restaurant_shard_name')
            throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
          throw e;
        }
        op.rest.name = name;
        restLog(op, 'admin.rename', { from, to: name, reason });
        await writeAudit(op.tx, {
          actor,
          action: 'restaurant.rename',
          target: `restaurant:${restId}`,
          detail: { from, to: name, reason },
        });
      });
      return { name };
    },

    async setRole(actor: AdminActor, accountId: number, role: AccountRole): Promise<{ role: AccountRole }> {
      if (accountId === actor.accountId) throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'self' });
      await accountRow(accountId);
      await db.transaction().execute(async (tx) => {
        await tx.updateTable('account').set({ role }).where('id', '=', accountId).execute();
        await writeAudit(tx, {
          actor,
          action: 'player.role',
          target: `account:${accountId}`,
          detail: { role },
        });
      });
      return { role };
    },
  };
}
