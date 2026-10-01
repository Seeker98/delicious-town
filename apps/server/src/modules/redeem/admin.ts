import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  type AdminCodeDto,
  type CreateBatchInput,
  type CreateSharedCodeInput,
  type RewardItems,
} from '@dt/shared';
import type { DB } from '../../db/schema';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { checkRewardItems } from '../mail/reward';
import { randomCode } from './code';

const LIST_MAX = 100;
const RETRIES = 5;

interface CodeRow {
  id: number;
  kind: 'shared' | 'single';
  code: string;
  batch_id: number | null;
  items: unknown;
  shard_id: number | null;
  min_level: number | null;
  max_uses: number | null;
  used_count: number;
  starts_at: Date | null;
  ends_at: Date | null;
  note: string;
  disabled_at: Date | null;
  created_at: Date;
  username: string | null;
}

const toDto = (r: CodeRow, batch?: { count: number; used: number; disabled: boolean }): AdminCodeDto => ({
  id: r.id,
  kind: r.kind,
  code: batch ? null : r.code,
  batchId: r.batch_id,
  count: batch?.count ?? 1,
  usedCount: batch?.used ?? r.used_count,
  maxUses: r.max_uses,
  items: r.items as RewardItems,
  shardId: r.shard_id,
  minLevel: r.min_level,
  startsAt: r.starts_at?.toISOString() ?? null,
  endsAt: r.ends_at?.toISOString() ?? null,
  note: r.note,
  disabled: batch?.disabled ?? r.disabled_at !== null,
  actor: r.username,
  createdAt: r.created_at.toISOString(),
});

/** 后台兑换码（设计 裁定 13~17、§6）：通用码逐个建，一次性码按批建、按批停用和导出；写操作都写审计 */
export function createAdminCodes(game: Game) {
  const { db, config } = game.app;

  const rows = (k: Kysely<DB>) =>
    k
      .selectFrom('redeem_code as c')
      .leftJoin('account as a', 'a.id', 'c.actor_account_id')
      .select([
        'c.id',
        'c.kind',
        'c.code',
        'c.batch_id',
        'c.items',
        'c.shard_id',
        'c.min_level',
        'c.max_uses',
        'c.used_count',
        'c.starts_at',
        'c.ends_at',
        'c.note',
        'c.disabled_at',
        'c.created_at',
        'a.username',
      ]);

  async function batchDto(k: Kysely<DB>, batchId: number): Promise<AdminCodeDto> {
    const first = await rows(k).where('c.id', '=', batchId).executeTakeFirst();
    if (!first) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'code_batch', id: batchId });
    const agg = await k
      .selectFrom('redeem_code')
      .select([
        sql<string>`count(*)`.as('count'),
        sql<string>`coalesce(sum(used_count), 0)`.as('used'),
        sql<boolean>`bool_and(disabled_at is not null)`.as('disabled'),
      ])
      .where('batch_id', '=', batchId)
      .executeTakeFirstOrThrow();
    return toDto(first, { count: Number(agg.count), used: Number(agg.used), disabled: agg.disabled });
  }

  async function checkInput(b: { items: RewardItems; shardId?: number }) {
    checkRewardItems(config, b.items);
    if (b.shardId) {
      const shard = await db.selectFrom('shard').select('id').where('id', '=', b.shardId).executeTakeFirst();
      if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
    }
  }

  const common = (b: CreateSharedCodeInput | CreateBatchInput, actor: AdminActor) => ({
    items: JSON.stringify(b.items),
    shard_id: b.shardId ?? null,
    min_level: b.minLevel ?? null,
    starts_at: b.startsAt ? new Date(b.startsAt) : null,
    ends_at: b.endsAt ? new Date(b.endsAt) : null,
    note: b.note,
    actor_account_id: actor.accountId,
  });

  return {
    /** 最近 100 行：通用码逐行，一次性码按批合成一行；指定区服时也列出不限区服的 */
    async list(q: { shardId?: number }): Promise<AdminCodeDto[]> {
      let shared = rows(db).where('c.kind', '=', 'shared');
      let firsts = rows(db).where('c.kind', '=', 'single').whereRef('c.id', '=', 'c.batch_id');
      if (q.shardId) {
        shared = shared.where((eb) =>
          eb.or([eb('c.shard_id', '=', q.shardId!), eb('c.shard_id', 'is', null)]),
        );
        firsts = firsts.where((eb) =>
          eb.or([eb('c.shard_id', '=', q.shardId!), eb('c.shard_id', 'is', null)]),
        );
      }
      const [s, f] = await Promise.all([
        shared.orderBy('c.id', 'desc').limit(LIST_MAX).execute(),
        firsts.orderBy('c.id', 'desc').limit(LIST_MAX).execute(),
      ]);
      const aggs = f.length
        ? await db
            .selectFrom('redeem_code')
            .select([
              'batch_id',
              sql<string>`count(*)`.as('count'),
              sql<string>`coalesce(sum(used_count), 0)`.as('used'),
              sql<boolean>`bool_and(disabled_at is not null)`.as('disabled'),
            ])
            .where(
              'batch_id',
              'in',
              f.map((r) => r.id),
            )
            .groupBy('batch_id')
            .execute()
        : [];
      const aggOf = new Map(aggs.map((a) => [a.batch_id, a]));
      const out = [
        ...s.map((r) => toDto(r)),
        ...f.map((r) => {
          const a = aggOf.get(r.id);
          return toDto(r, {
            count: Number(a?.count ?? 1),
            used: Number(a?.used ?? 0),
            disabled: a?.disabled ?? r.disabled_at !== null,
          });
        }),
      ];
      return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.id - x.id).slice(0, LIST_MAX);
    },

    /** 建通用码：不填码就随机生成（撞重换一个）；自定的码已存在时报错 */
    async createShared(actor: AdminActor, b: CreateSharedCodeInput): Promise<AdminCodeDto> {
      await checkInput(b);
      const id = await db.transaction().execute(async (tx) => {
        let row: { id: number } | undefined;
        for (let i = 0; i < (b.code ? 1 : RETRIES) && !row; i++) {
          row = await tx
            .insertInto('redeem_code')
            .values({
              ...common(b, actor),
              code: b.code ?? randomCode(),
              kind: 'shared',
              max_uses: b.maxUses ?? null,
            })
            .onConflict((oc) => oc.column('code').doNothing())
            .returning('id')
            .executeTakeFirst();
        }
        if (!row)
          throw new AppError(ErrorCode.VALIDATION_FAILED, 400, {
            issues: [{ path: 'code', message: 'taken' }],
          });
        await writeAudit(tx, {
          actor,
          action: 'code.create',
          target: `code:${row.id}`,
          detail: {
            code: b.code ?? null,
            items: b.items,
            shardId: b.shardId ?? null,
            maxUses: b.maxUses ?? null,
          },
        });
        return row.id;
      });
      return toDto(await rows(db).where('c.id', '=', id).executeTakeFirstOrThrow());
    },

    /** 批量一次性码：每个码只能用一次；batch_id = 这批第一个码的 id */
    async createBatch(actor: AdminActor, b: CreateBatchInput): Promise<AdminCodeDto> {
      if (b.count > config.tuning.redeem.batchMax)
        throw new AppError(ErrorCode.VALIDATION_FAILED, 400, {
          issues: [{ path: 'count', message: 'too_big', max: config.tuning.redeem.batchMax }],
        });
      await checkInput(b);
      const batchId = await db.transaction().execute(async (tx) => {
        const values = common(b, actor);
        const ids: number[] = [];
        for (let round = 0; round < RETRIES && ids.length < b.count; round++) {
          const fresh = new Set<string>();
          while (fresh.size < b.count - ids.length) fresh.add(randomCode());
          const got = await tx
            .insertInto('redeem_code')
            .values([...fresh].map((code) => ({ ...values, code, kind: 'single' as const, max_uses: 1 })))
            .onConflict((oc) => oc.column('code').doNothing())
            .returning('id')
            .execute();
          ids.push(...got.map((r) => r.id));
        }
        if (ids.length < b.count) throw new AppError(ErrorCode.INTERNAL, 500);
        const first = Math.min(...ids);
        await tx.updateTable('redeem_code').set({ batch_id: first }).where('id', 'in', ids).execute();
        await writeAudit(tx, {
          actor,
          action: 'code.batch',
          target: `code_batch:${first}`,
          detail: { count: b.count, items: b.items, shardId: b.shardId ?? null, note: b.note },
        });
        return first;
      });
      return batchDto(db, batchId);
    },

    /** 停用；属于某批时整批停用 */
    async disable(actor: AdminActor, id: number): Promise<void> {
      const row = await db
        .selectFrom('redeem_code')
        .select(['id', 'batch_id'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'code', id });
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('redeem_code')
          .set({ disabled_at: sql<Date>`now()` })
          .where((eb) => (row.batch_id === null ? eb('id', '=', id) : eb('batch_id', '=', row.batch_id)))
          .where('disabled_at', 'is', null)
          .execute();
        await writeAudit(tx, {
          actor,
          action: 'code.disable',
          target: row.batch_id === null ? `code:${id}` : `code_batch:${row.batch_id}`,
        });
      });
    },

    /** 导出整批的码（发给赞助者用） */
    async exportBatch(actor: AdminActor, batchId: number): Promise<{ codes: string[] }> {
      const list = await db
        .selectFrom('redeem_code')
        .select('code')
        .where('batch_id', '=', batchId)
        .orderBy('id')
        .execute();
      if (list.length === 0)
        throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'code_batch', id: batchId });
      await writeAudit(db, { actor, action: 'code.export', target: `code_batch:${batchId}` });
      return { codes: list.map((r) => r.code) };
    },
  };
}
