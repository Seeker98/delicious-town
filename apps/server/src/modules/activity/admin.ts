import { sql } from 'kysely';
import {
  ErrorCode,
  type ActivityInput,
  type ActivitySpec,
  type AdminActivityDto,
  type AdminActivityState,
} from '@dt/shared';
import { invalidState } from '../../core/errors';
import { notifySettingsChanged, type WarnLog } from '../../infra/settingsBus';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { checkNestedItems } from '../mail/reward';
import { activityCacheFor } from './active';

/** 后台限时活动（设计 §5.2）：开始后只能改标题、说明、延长结束时间；写操作都记审计 */
export function createAdminActivity(game: Game, log?: WarnLog) {
  const { db } = game.app;
  const now = () => game.deps.now();
  const cache = () => activityCacheFor(game.app.bus, game.deps);

  async function stateOf(r: {
    id: number;
    shard_id: number | null;
    starts_at: Date;
    ends_at: Date;
  }): Promise<AdminActivityState> {
    const t = now();
    if (t < r.starts_at) return 'pending';
    if (t < r.ends_at) return 'running';
    const shards =
      r.shard_id === null
        ? Number(
            (
              await db
                .selectFrom('shard')
                .select((eb) => eb.fn.countAll<number>().as('n'))
                .where('status', '=', 'open')
                .executeTakeFirstOrThrow()
            ).n,
          )
        : 1;
    const done = Number(
      (
        await db
          .selectFrom('activity_settle')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .where('activity_id', '=', r.id)
          .executeTakeFirstOrThrow()
      ).n,
    );
    return done >= shards ? 'settled' : 'settling';
  }

  async function participants(id: number): Promise<number> {
    const r = await sql<{ n: string }>`
      select count(*) as n from (
        select rest_id from activity_counter where activity_id = ${id}
        union select rest_id from activity_pass where activity_id = ${id}
      ) x`.execute(db);
    return Number(r.rows[0]?.n ?? 0);
  }

  const base = () =>
    db
      .selectFrom('activity as a')
      .leftJoin('account as u', 'u.id', 'a.actor_account_id')
      .selectAll('a')
      .select('u.username')
      .where('a.deleted_at', 'is', null);
  type Row = Awaited<ReturnType<ReturnType<typeof base>['executeTakeFirstOrThrow']>>;

  async function toDto(r: Row): Promise<AdminActivityDto> {
    return {
      id: r.id,
      shardId: r.shard_id,
      ...({ kind: r.kind, def: r.def } as ActivitySpec),
      title: r.title,
      body: r.body,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      minLevel: r.min_level,
      state: await stateOf(r),
      participants: await participants(r.id),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      actor: r.username,
    };
  }
  async function row(id: number): Promise<Row> {
    const r = await base().where('a.id', '=', id).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'activity', id });
    return r;
  }
  async function checkShard(shardId: number | null) {
    if (shardId === null) return;
    const s = await db.selectFrom('shard').select('id').where('id', '=', shardId).executeTakeFirst();
    if (!s) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'shard', id: shardId });
  }
  const values = (b: ActivityInput) => ({
    shard_id: b.shardId,
    kind: b.kind,
    title: b.title,
    body: b.body,
    starts_at: new Date(b.startsAt),
    ends_at: new Date(b.endsAt),
    min_level: b.minLevel,
    def: JSON.stringify(b.def),
  });
  /** 定义比较用规范化的 JSON：键排好序，字段顺序不同也算同一个定义 */
  const canon = (v: unknown): string =>
    JSON.stringify(v, (_k, x: unknown) =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(
            Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
          )
        : x,
    );

  /** 全服加成改动后：本进程立即清区服设置缓存，其他进程通过 settings-bus 清（148-4 设计 §6.2） */
  async function boostChanged(shardIds: Array<number | null>) {
    if (shardIds.includes(null)) {
      game.shards.invalidateAll();
      const shards = await db.selectFrom('shard').select('id').execute();
      for (const s of shards) await notifySettingsChanged(game.app.redis, s.id, log);
      return;
    }
    for (const id of new Set(shardIds as number[])) {
      game.shards.invalidate(id);
      await notifySettingsChanged(game.app.redis, id, log);
    }
  }

  async function audit(actor: AdminActor, action: string, id: number, detail?: Record<string, unknown>) {
    await writeAudit(db, { actor, action, target: `activity:${id}`, detail });
  }

  return {
    async list(): Promise<AdminActivityDto[]> {
      const rows = await base().orderBy('a.id', 'desc').limit(100).execute();
      return Promise.all(rows.map(toDto));
    },
    async one(id: number) {
      return toDto(await row(id));
    },
    async create(actor: AdminActor, b: ActivityInput): Promise<AdminActivityDto> {
      await checkShard(b.shardId);
      checkNestedItems(game.deps.config, b.def, 'def');
      const r = await db
        .insertInto('activity')
        .values({ ...values(b), actor_account_id: actor.accountId })
        .returning('id')
        .executeTakeFirstOrThrow();
      await audit(actor, 'activity.create', r.id, { ...b });
      cache().invalidate();
      if (b.kind === 'boost') await boostChanged([b.shardId]);
      return toDto(await row(r.id));
    },
    async update(actor: AdminActor, id: number, b: ActivityInput): Promise<AdminActivityDto> {
      const cur = await row(id);
      await checkShard(b.shardId);
      // 开始后定义没改时不查：进行中的活动里有上线后才下架的道具时，还要能延长结束时间（backlog #143）；
      // 开始前照查，那是最后能改定义的时候
      if (now() < cur.starts_at || canon(b.def) !== canon(cur.def))
        checkNestedItems(game.deps.config, b.def, 'def');
      const t = now();
      if (t >= cur.starts_at) {
        if (t >= cur.ends_at && new Date(b.endsAt).getTime() !== cur.ends_at.getTime())
          throw invalidState('ended');
        const locked =
          b.kind !== cur.kind ||
          b.shardId !== cur.shard_id ||
          new Date(b.startsAt).getTime() !== cur.starts_at.getTime() ||
          b.minLevel !== cur.min_level ||
          new Date(b.endsAt).getTime() < cur.ends_at.getTime() ||
          canon(b.def) !== canon(cur.def);
        if (locked) throw invalidState('locked_after_start');
      }
      await db
        .updateTable('activity')
        .set({ ...values(b), updated_at: sql<Date>`now()` })
        .where('id', '=', id)
        .execute();
      await audit(actor, 'activity.update', id, { ...b });
      cache().invalidate();
      if (b.kind === 'boost' || cur.kind === 'boost') await boostChanged([b.shardId, cur.shard_id]);
      return toDto(await row(id));
    },
    async end(actor: AdminActor, id: number): Promise<AdminActivityDto> {
      const cur = await row(id);
      const t = now();
      if (t < cur.starts_at || t >= cur.ends_at) throw invalidState('not_running');
      await db
        .updateTable('activity')
        .set({ ends_at: t, updated_at: sql<Date>`now()` })
        .where('id', '=', id)
        .execute();
      await audit(actor, 'activity.end', id);
      cache().invalidate();
      if (cur.kind === 'boost') await boostChanged([cur.shard_id]);
      return toDto(await row(id));
    },
    async remove(actor: AdminActor, id: number): Promise<void> {
      const cur = await row(id);
      if (now() >= cur.starts_at) throw invalidState('started');
      await db
        .updateTable('activity')
        .set({ deleted_at: sql<Date>`now()` })
        .where('id', '=', id)
        .execute();
      await audit(actor, 'activity.delete', id);
      cache().invalidate();
      if (cur.kind === 'boost') await boostChanged([cur.shard_id]);
    },
  };
}
