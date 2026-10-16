import { sql } from 'kysely';
import type { AccessBanBody, AccessBanDto, AccessBanResultDto } from '@dt/shared';
import { invalidState } from '../../core/errors';
import { createAccessGuard, normalizeIpRule } from '../../security/accessBan';
import type { Game } from '../../game';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;
const SEEN_DAYS = 30;

/** 登录记录里用这个 IP（段）或设备登录过（ip 列是文本：只拿长得像 IP 的去比，免得转换出错） */
const seenBy = (kind: 'ip' | 'device', value: string) =>
  kind === 'device'
    ? sql<boolean>`lt.device_id = ${value}`
    : sql<boolean>`lt.ip ~ '^[0-9A-Fa-f:.]+$' and lt.ip::inet <<= ${value}::inet`;

/**
 * IP、设备封禁（2026-10-16 小号刷一番赏）：后台加、删名单，改完当场刷新本进程的名单（别的进程 30 秒内跟上）。
 * 可以一并永久封掉最近 30 天用它登录过的账号（管理员、协管不封）
 */
export function createAccessBans(game: Game) {
  const { db, sessions } = game.app;
  const guard = (game.app.accessGuard ??= createAccessGuard(db));

  function dtoOf(r: {
    id: number;
    kind: 'ip' | 'device';
    value: string;
    reason: string;
    actor: string | null;
    created_at: Date;
    accounts: number;
  }): AccessBanDto {
    return {
      id: r.id,
      kind: r.kind,
      value: r.value,
      reason: r.reason,
      actor: r.actor,
      createdAt: r.created_at.toISOString(),
      accounts: r.accounts,
    };
  }

  async function rowOf(id: number): Promise<AccessBanDto> {
    const r = await db
      .selectFrom('access_ban as b')
      .leftJoin('account as a', 'a.id', 'b.actor_account_id')
      .select(['b.id', 'b.kind', 'b.value', 'b.reason', 'b.created_at', 'a.username as actor'])
      .where('b.id', '=', id)
      .executeTakeFirstOrThrow();
    const n = await sql<{ n: number }>`
      select count(distinct lt.account_id)::int as n from login_trace lt
      where lt.last_seen > now() - make_interval(days => ${SEEN_DAYS}) and ${seenBy(r.kind, r.value)}`.execute(
      db,
    );
    return dtoOf({ ...r, accounts: n.rows[0]?.n ?? 0 });
  }

  return {
    async list(): Promise<AccessBanDto[]> {
      const ids = await db.selectFrom('access_ban').select('id').orderBy('id', 'desc').execute();
      return Promise.all(ids.map((r) => rowOf(r.id)));
    },

    async add(actor: AdminActor, b: AccessBanBody): Promise<AccessBanResultDto> {
      const value = b.kind === 'ip' ? normalizeIpRule(b.value) : DEVICE_RE.test(b.value) ? b.value : null;
      if (value === null) throw invalidState('ban_value');
      // 别把自己锁在外面：管理员当前的 IP 在这一段里就不让封
      if (b.kind === 'ip') {
        const self = await sql<{ hit: boolean }>`select ${actor.ip}::inet <<= ${value}::inet as hit`
          .execute(db)
          .catch(() => ({ rows: [{ hit: false }] }));
        if (self.rows[0]?.hit) throw invalidState('ban_self');
      }
      const result = await db.transaction().execute(async (tx) => {
        const row = await tx
          .insertInto('access_ban')
          .values({ kind: b.kind, value, reason: b.reason, actor_account_id: actor.accountId })
          .onConflict((oc) =>
            oc
              .columns(['kind', 'value'])
              .doUpdateSet({ reason: b.reason, actor_account_id: actor.accountId }),
          )
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, {
          actor,
          action: 'access.ban',
          target: `${b.kind}:${value}`,
          detail: { reason: b.reason, banAccounts: b.banAccounts },
        });
        let banned: number[] = [];
        if (b.banAccounts) {
          const { rows } = await sql<{ id: number }>`
            update account a set banned_at = now(), banned_until = null, ban_reason = ${b.reason}
            where a.role = 'player' and not a.is_system
              and not (a.banned_at is not null and a.banned_until is null)
              and exists (select 1 from login_trace lt where lt.account_id = a.id
                and lt.last_seen > now() - make_interval(days => ${SEEN_DAYS}) and ${seenBy(b.kind, value)})
            returning a.id`.execute(tx);
          banned = rows.map((r) => r.id).sort((x, y) => x - y);
          for (const id of banned)
            await writeAudit(tx, {
              actor,
              action: 'player.ban',
              target: `account:${id}`,
              detail: { reason: b.reason, days: 0, via: `${b.kind}:${value}` },
            });
        }
        return { id: row.id, banned };
      });
      for (const id of result.banned) await sessions.destroyAll(id);
      await guard.refresh();
      return { ban: await rowOf(result.id), bannedAccounts: result.banned };
    },

    async remove(actor: AdminActor, id: number): Promise<{ removed: boolean }> {
      const removed = await db.transaction().execute(async (tx) => {
        const r = await tx
          .deleteFrom('access_ban')
          .where('id', '=', id)
          .returning(['kind', 'value'])
          .executeTakeFirst();
        if (r)
          await writeAudit(tx, { actor, action: 'access.unban', target: `${r.kind}:${r.value}`, detail: {} });
        return !!r;
      });
      await guard.refresh();
      return { removed };
    },
  };
}
