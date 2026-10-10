import { ZodError } from 'zod';
import {
  fundErrors,
  wealthErrors,
  bulkErrors,
  wishTreeErrors,
  GOODS_TYPE,
  isFeatureEnabled,
  kujiErrors,
  slotFloorErrors,
  resolveShardSettings,
  retiredErrors,
  retiredOf,
  tuningRefs,
  DEFAULT_OFF_FEATURES,
} from '@dt/config';
import {
  ErrorCode,
  gameDay,
  type AdminShardDto,
  type BoostActivityDef,
  type ShardHistoryDto,
  type ShardSettingsDto,
} from '@dt/shared';
import { IMPLEMENTED_FEATURES } from '../../core/features';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { notifySettingsChanged, type WarnLog } from '../../infra/settingsBus';
import type { AdminActor } from './access';
import { writeAudit } from './audit';
import { diffPaths } from './diff';

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function createAdminShards(game: Game, log?: WarnLog) {
  const { db, redis, config } = game.app;

  /** 配置结构以外的路径（拼错的键、不存在的功能）：zod 会静默剥掉，必须显式拒绝，否则保存"成功"却没生效 */
  function unknownPaths(override: Record<string, unknown>): string[] {
    const bad: string[] = [];
    const walk = (o: Record<string, unknown>, base: unknown, prefix: string) => {
      for (const [k, v] of Object.entries(o)) {
        const path = prefix ? `${prefix}.${k}` : k;
        const b = asObject(base)[k];
        if (b === undefined) bad.push(path);
        else if (isPlain(v) && isPlain(b)) walk(v, b, path);
      }
    };
    const { features, ...rest } = override;
    walk(rest, { restaurant: config.bundle.restaurantDefaults, tuning: config.tuning }, '');
    if (features !== undefined) {
      if (!isPlain(features)) bad.push('features');
      else
        for (const name of Object.keys(features))
          if (!IMPLEMENTED_FEATURES.has(name)) bad.push(`features.${name}`);
    }
    return bad;
  }

  function validate(override: Record<string, unknown>): void {
    const bad = unknownPaths(override);
    if (bad.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: bad.map((path) => ({ path, message: 'unknown' })),
      });
    let resolved;
    try {
      resolved = resolveShardSettings(config, override);
    } catch (e) {
      if (e instanceof ZodError)
        throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
          issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      throw e;
    }
    // 一番赏的奖品引用、图标、档位（一番赏终审 I3）：和配置构建同一套检查，填错的道具 id 会让那一档的签永远抽不出去
    const kuji = kujiErrors(resolved.tuning.kuji, {
      goodsIds: new Set(config.goods.keys()),
      foodIds: new Set(config.foods.keys()),
      iconKeys: new Set(config.bundle.looks.icons.map((i) => i.key)),
      // 只看当月和以后的月度称号：过去月份的豪华池早存了快照，不挡以后正式调整档位（质量期 ② 终审）
      deluxeMonths: config.bundle.kujiDeluxeMonths.filter(
        (m) => m.month >= gameDay(game.deps.now()).slice(0, 7),
      ),
      activationPoints: new Set(config.bundle.activationRewards.map((r) => r.points)),
    });
    if (kuji.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: kuji.map((message) => ({ path: 'tuning.kuji', message })),
      });
    // 小镇发展基金（240-2）：和配置构建同一套检查
    const fund = fundErrors(resolved.tuning.fund, {
      honorIds: new Set(
        [...config.goods.values()].filter((g) => g.type === GOODS_TYPE.honor).map((g) => g.id),
      ),
    });
    if (fund.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: fund.map((message) => ({ path: 'tuning.fund', message })),
      });
    // 食材理财（理财设计 §3.1）：和配置构建同一套检查
    const wealth = wealthErrors(resolved.tuning.wealth, {
      packIds: new Set([...config.goods.values()].filter((g) => g.use?.kind === 'needFood').map((g) => g.id)),
    });
    if (wealth.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: wealth.map((message) => ({ path: 'tuning.wealth', message })),
      });
    // 特许大宗认购（大宗认购设计 §2.1）：和配置构建同一套检查
    const bulk = bulkErrors(resolved.tuning.bulk, { goodsIds: new Set(config.goods.keys()) });
    if (bulk.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: bulk.map((message) => ({ path: 'tuning.bulk', message })),
      });
    // 许愿树（许愿树设计 §2）：和配置构建同一套检查
    const wish = wishTreeErrors(resolved.tuning.wishTree, {
      goodsIds: new Set(config.goods.keys()),
      iconKeys: new Set(config.bundle.looks.icons.map((i) => i.key)),
    });
    if (wish.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: wish.map((message) => ({ path: 'tuning.wishTree', message })),
      });
    // 老虎机保底奖（backlog 1010）：和配置构建同一套检查
    const slot = slotFloorErrors(resolved.tuning.bar.slotFloorAwardId, config.bundle.slotAwards);
    if (slot.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: slot.map((message) => ({ path: 'tuning.bar.slotFloorAwardId', message })),
      });
    // 下架的道具、食材（问题记录 367）：和配置构建同一套检查，区服数值的奖励里不能再写它们
    const retired = retiredErrors(tuningRefs(resolved.tuning), retiredOf(config.bundle));
    if (retired.length > 0)
      throw new AppError(ErrorCode.INVALID_CONFIG, 400, {
        issues: retired.map((message) => ({ path: 'tuning', message })),
      });
  }

  async function assertShard(shardId: number): Promise<void> {
    const s = await db.selectFrom('shard').select('id').where('id', '=', shardId).executeTakeFirst();
    if (!s) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
  }

  /** 保存整份覆盖：校验 → 版本号乐观锁写入 → 历史和审计（同一事务）→ 清缓存并通知其他进程 */
  async function save(
    actor: AdminActor,
    shardId: number,
    override: Record<string, unknown>,
    note: string,
    expected: number | null,
    action: 'shard.override' | 'shard.rollback',
  ): Promise<{ version: number }> {
    await assertShard(shardId);
    validate(override);
    const version = await db.transaction().execute(async (tx) => {
      const cur = await tx
        .selectFrom('shard_config')
        .select(['version', 'override'])
        .where('shard_id', '=', shardId)
        .forUpdate()
        .executeTakeFirst();
      const curVersion = cur?.version ?? 0;
      if (expected !== null && expected !== curVersion)
        throw new AppError(ErrorCode.VERSION_CONFLICT, 409, { version: curVersion });
      const next = curVersion + 1;
      const now = game.deps.now();
      if (cur) {
        await tx
          .updateTable('shard_config')
          .set({ override: JSON.stringify(override), version: next, updated_at: now })
          .where('shard_id', '=', shardId)
          .execute();
      } else {
        const ins = await tx
          .insertInto('shard_config')
          .values({ shard_id: shardId, override: JSON.stringify(override), version: next, updated_at: now })
          .onConflict((oc) => oc.column('shard_id').doNothing())
          .returning('shard_id')
          .executeTakeFirst();
        if (!ins) throw new AppError(ErrorCode.VERSION_CONFLICT, 409, { version: curVersion });
      }
      await tx
        .insertInto('shard_config_history')
        .values({
          shard_id: shardId,
          version: next,
          override: JSON.stringify(override),
          actor_account_id: actor.accountId,
          note,
          created_at: now,
        })
        .execute();
      await writeAudit(tx, {
        actor,
        action,
        target: `shard:${shardId}`,
        detail: { version: next, note, changed: diffPaths(asObject(cur?.override), override) },
      });
      return next;
    });
    game.shards.invalidate(shardId);
    await notifySettingsChanged(redis, shardId, log);
    return { version };
  }

  return {
    async list(): Promise<AdminShardDto[]> {
      const rows = await db
        .selectFrom('shard')
        .leftJoin('restaurant', (j) =>
          j.onRef('restaurant.shard_id', '=', 'shard.id').on('restaurant.npc', '=', false),
        )
        .select(({ fn }) => [
          'shard.id',
          'shard.name',
          'shard.status',
          fn.count<number>('restaurant.id').as('restaurants'),
        ])
        .groupBy(['shard.id', 'shard.name', 'shard.status'])
        .orderBy('shard.id')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        restaurants: Number(r.restaurants),
      }));
    },

    async settings(shardId: number): Promise<ShardSettingsDto> {
      await assertShard(shardId);
      const row = await db
        .selectFrom('shard_config')
        .select(['version', 'override'])
        .where('shard_id', '=', shardId)
        .executeTakeFirst();
      const override = asObject(row?.override);
      const effective = resolveShardSettings(config, override);
      // 正在生效的全服加成（backlog 148-4）：以前前端从"最近 100 条活动"里筛，更早建的会漏
      const now = game.deps.now();
      const boosts = await db
        .selectFrom('activity')
        .select(['id', 'def', 'ends_at'])
        .where('kind', '=', 'boost')
        .where('starts_at', '<=', now)
        .where('ends_at', '>', now)
        .where((eb) => eb.or([eb('shard_id', 'is', null), eb('shard_id', '=', shardId)]))
        .orderBy('id')
        .execute();
      return {
        version: row?.version ?? 0,
        // 默认关的功能写成 false，后台据此显示和写覆盖（收购 PR 1）
        defaults: {
          features: Object.fromEntries(DEFAULT_OFF_FEATURES.map((f) => [f, false])),
          restaurant: config.bundle.restaurantDefaults,
          tuning: config.tuning,
        },
        override,
        effective: effective as unknown as Record<string, unknown>,
        features: [...IMPLEMENTED_FEATURES]
          .sort()
          .map((name) => ({ name, enabled: isFeatureEnabled(effective, name) })),
        docs: config.settingDocs,
        boosts: boosts.map((b) => ({
          id: b.id,
          items: (b.def as BoostActivityDef).items,
          endsAt: b.ends_at.toISOString(),
        })),
      };
    },

    save: (
      actor: AdminActor,
      shardId: number,
      b: { override: Record<string, unknown>; note: string; version: number },
    ) => save(actor, shardId, b.override, b.note, b.version, 'shard.override'),

    async history(shardId: number): Promise<ShardHistoryDto[]> {
      const rows = await db
        .selectFrom('shard_config_history as h')
        .leftJoin('account', 'account.id', 'h.actor_account_id')
        .select(['h.version', 'h.override', 'h.note', 'h.created_at', 'account.username'])
        .where('h.shard_id', '=', shardId)
        .orderBy('h.version', 'desc')
        .limit(51)
        .execute();
      return rows.slice(0, 50).map((r, i) => ({
        version: r.version,
        override: asObject(r.override),
        actor: r.username ?? null,
        note: r.note,
        changed: diffPaths(asObject(rows[i + 1]?.override), asObject(r.override)),
        at: r.created_at.toISOString(),
      }));
    },

    /** 回滚：把某个历史版本的覆盖再保存一版（历史里新增，不删旧版）；不检查版本号 */
    async rollback(actor: AdminActor, shardId: number, b: { version: number; note: string }) {
      const h = await db
        .selectFrom('shard_config_history')
        .select('override')
        .where('shard_id', '=', shardId)
        .where('version', '=', b.version)
        .executeTakeFirst();
      if (!h) throw new AppError(ErrorCode.NOT_FOUND, 404);
      return save(actor, shardId, asObject(h.override), b.note, null, 'shard.rollback');
    },
  };
}
