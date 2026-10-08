import { sql } from 'kysely';
import {
  ErrorCode,
  REPORT_TARGET_NAMES,
  type ReportCaseDto,
  type ReportDetailDto,
  type ReportStatus,
} from '@dt/shared';
import { invalidState } from '../../core/errors';
import { restLog, runSystemOp, type Op } from '../../core/op';
import { uniqueViolation } from '../../db/errors';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { createAdminPlayers } from '../admin/players';
import { syncPostNews } from '../forum/posts';
import { renameProblem } from '../growth/rules';
import { sendMail } from '../mail/send';
import { loadTarget } from './targets';

const LIST_MAX = 100;
const ACTION_TEXT: Record<string, string> = { delete: '删除', clear: '清空', rename: '强制改名' };

/** 后台举报处理（设计 §3.3）：列表、详情、处理（按类型操作内容、可封号）、驳回；邮件和审计 */
export function createAdminReports(game: Game) {
  const db = game.app.db;
  const players = createAdminPlayers(game);

  const base = () =>
    db
      .selectFrom('report_case as c')
      .innerJoin('restaurant as r', 'r.id', 'c.target_rest_id')
      .innerJoin('account as a', 'a.id', 'c.target_account_id')
      .leftJoin('account as h', 'h.id', 'c.handled_by')
      .selectAll('c')
      .select(['r.name as rest_name', 'a.username', 'h.username as handler']);
  type Row = Awaited<ReturnType<ReturnType<typeof base>['executeTakeFirstOrThrow']>>;
  const toDto = (r: Row): ReportCaseDto => ({
    id: r.id,
    shardId: r.shard_id,
    targetType: r.target_type,
    targetId: r.target_id,
    targetRestId: r.target_rest_id,
    targetRestName: r.rest_name,
    targetAccountId: r.target_account_id,
    targetUsername: r.username,
    snapshot: r.snapshot,
    status: r.status,
    reporterCount: r.reporter_count,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    handledBy: r.handler,
    handledAt: r.handled_at?.toISOString() ?? null,
    action: r.action,
    banDays: r.ban_days,
    note: r.note,
  });
  async function row(id: number): Promise<Row> {
    const r = await base().where('c.id', '=', id).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'report', id });
    return r;
  }
  /** 举报人列表：用调用方的事务读，不另占一个连接（backlog 6B-1） */
  const reporters = (k: Op['tx'], caseId: number) =>
    k.selectFrom('report_entry').select('reporter_rest_id').where('case_id', '=', caseId).execute();

  /** 按类型处理内容；内容已经不在（或已不是这家店的）时不做操作，返回 none */
  async function act(o: Op, c: Row, note: string, newName: string | undefined): Promise<string> {
    const target = await loadTarget(o.tx, c.target_type, c.target_id);
    // 内容已不在、换了店，或作者已经改过（和举报时的快照不同）：不动内容，只结案（设计 §3.3，终审 I3）
    if (!target || target.restId !== c.target_rest_id || target.text !== c.snapshot) return 'none';
    switch (c.target_type) {
      case 'post':
        await o.tx
          .updateTable('forum_post')
          .set({ deleted_at: o.now })
          .where('id', '=', c.target_id)
          .execute();
        await syncPostNews(o, c.target_id, null);
        return 'delete';
      case 'reply':
        await o.tx
          .updateTable('forum_reply')
          .set({ deleted_at: o.now })
          .where('id', '=', c.target_id)
          .execute();
        return 'delete';
      case 'broadcast':
        await o.tx.deleteFrom('news').where('id', '=', c.target_id).execute();
        return 'delete';
      case 'notice':
        if (target.text === '') return 'none';
        await o.tx.updateTable('restaurant').set({ notice: '' }).where('id', '=', c.target_rest_id).execute();
        return 'clear';
      case 'rest_name': {
        const name = (newName ?? `餐厅${c.target_rest_id}`).trim();
        const problem = renameProblem(name, o.tuning.growth.renameMaxLength);
        if (problem) throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: problem });
        const from = o.rest.name;
        if (from === name) return 'none';
        try {
          await o.tx.updateTable('restaurant').set({ name }).where('id', '=', c.target_rest_id).execute();
        } catch (e) {
          // 带上被占用的名字：没填新名时用的是默认名，后台据此提示"填一个新店名"（backlog 6B-1）
          if (uniqueViolation(e) === 'restaurant_shard_name')
            throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409, { name });
          throw e;
        }
        o.rest.name = name;
        restLog(o, 'admin.rename', { from, to: name, reason: note });
        return 'rename';
      }
    }
  }

  async function mailReporters(o: Op, c: Row, body: string, key: 'report.handled' | 'report.rejected') {
    for (const r of await reporters(o.tx, c.id))
      await sendMail(o.tx, {
        scope: 'rest',
        shardId: c.shard_id,
        restId: r.reporter_rest_id,
        minLevel: null,
        title: '举报结果',
        body,
        tpl: { key, params: { target: c.target_type } },
        items: null,
        source: 'report',
        actorAccountId: null,
      });
  }

  return {
    async list(q: { shardId?: number; status?: ReportStatus }): Promise<ReportCaseDto[]> {
      const status = q.status ?? 'open';
      let s = base().where('c.status', '=', status);
      if (q.shardId) s = s.where('c.shard_id', '=', q.shardId);
      s =
        status === 'open'
          ? s.orderBy('c.reporter_count', 'desc').orderBy('c.updated_at', 'desc')
          : s.orderBy('c.handled_at', 'desc');
      return (await s.orderBy('c.id', 'desc').limit(LIST_MAX).execute()).map(toDto);
    },

    async detail(id: number): Promise<ReportDetailDto> {
      const c = await row(id);
      const target = await loadTarget(db, c.target_type, c.target_id);
      const entries = await db
        .selectFrom('report_entry as e')
        .innerJoin('restaurant as r', 'r.id', 'e.reporter_rest_id')
        .select(['r.name', 'e.reason', 'e.detail', 'e.created_at'])
        .where('e.case_id', '=', id)
        .orderBy('e.id')
        .execute();
      const prior = await db
        .selectFrom('report_case')
        .select(sql<string>`count(*)`.as('n'))
        .where('target_account_id', '=', c.target_account_id)
        .where('status', '=', 'resolved')
        .where('id', '<>', id)
        .executeTakeFirstOrThrow();
      return {
        ...toDto(c),
        current: target && target.restId === c.target_rest_id ? target.text : null,
        entries: entries.map((e) => ({
          restName: e.name,
          reason: e.reason,
          detail: e.detail,
          createdAt: e.created_at.toISOString(),
        })),
        priorCases: Number(prior.n),
      };
    },

    /** 处理：内容操作、结案、审计、邮件在被举报的店上一个事务；封号在事务提交后复用玩家页的封号 */
    async resolve(actor: AdminActor, id: number, b: { note: string; banDays?: 0 | 1 | 7; newName?: string }) {
      const c = await row(id);
      if (c.status !== 'open') throw invalidState('report_closed');
      if (b.banDays === 0 && actor.role !== 'admin')
        throw new AppError(ErrorCode.FORBIDDEN, 403, { reason: 'ban_days' });
      // 封号会被拒的（封自己、协管封管理员）先报错，免得内容已处理、邮件已发而封号失败（终审 I2）
      if (b.banDays !== undefined) await players.checkBan(actor, c.target_account_id, b.banDays);
      const typeName = REPORT_TARGET_NAMES[c.target_type];
      await runSystemOp(game.deps, c.shard_id, c.target_rest_id, { source: 'report.resolve' }, async (o) => {
        const locked = await o.tx
          .selectFrom('report_case')
          .select('status')
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (locked.status !== 'open') throw invalidState('report_closed');
        const action = await act(o, c, b.note, b.newName);
        await o.tx
          .updateTable('report_case')
          .set({
            status: 'resolved',
            handled_by: actor.accountId,
            handled_at: o.now,
            action,
            ban_days: b.banDays ?? null,
            note: b.note,
          })
          .where('id', '=', id)
          .execute();
        await writeAudit(o.tx, {
          actor,
          action: 'report.resolve',
          target: `report:${id}`,
          detail: {
            type: c.target_type,
            targetId: c.target_id,
            action,
            banDays: b.banDays ?? null,
            note: b.note,
          },
        });
        await mailReporters(o, c, `你举报的${typeName}已处理，感谢你维护小镇。`, 'report.handled');
        const ban =
          b.banDays === undefined ? '' : b.banDays === 0 ? '账号永久封禁。' : `账号封禁 ${b.banDays} 天。`;
        // 内容已经不在（action = none）时不说"因违规已记录违规"（backlog 6B-1）
        const what = action === 'none' ? '被认定违规，已记录在案' : `因违规已被${ACTION_TEXT[action]}`;
        await sendMail(o.tx, {
          scope: 'rest',
          shardId: c.shard_id,
          restId: c.target_rest_id,
          minLevel: null,
          title: '违规处理通知',
          body: `你的${typeName}${what}。${ban}\n说明: ${b.note}`,
          tpl: {
            key: 'report.penalty',
            params: { target: c.target_type, action, banDays: b.banDays ?? null, note: b.note },
          },
          items: null,
          source: 'report',
          actorAccountId: null,
        });
      });
      if (b.banDays !== undefined) await players.ban(actor, c.target_account_id, b.note, b.banDays);
      return toDto(await row(id));
    },

    async reject(actor: AdminActor, id: number, b: { note: string }) {
      const c = await row(id);
      if (c.status !== 'open') throw invalidState('report_closed');
      const typeName = REPORT_TARGET_NAMES[c.target_type];
      await runSystemOp(game.deps, c.shard_id, c.target_rest_id, { source: 'report.reject' }, async (o) => {
        const done = await o.tx
          .updateTable('report_case')
          .set({
            status: 'rejected',
            handled_by: actor.accountId,
            handled_at: o.now,
            action: 'none',
            note: b.note,
          })
          .where('id', '=', id)
          .where('status', '=', 'open')
          .returning('id')
          .executeTakeFirst();
        if (!done) throw invalidState('report_closed');
        await writeAudit(o.tx, {
          actor,
          action: 'report.reject',
          target: `report:${id}`,
          detail: { note: b.note },
        });
        await mailReporters(o, c, `你举报的${typeName}经核实未违规。`, 'report.rejected');
      });
      return toDto(await row(id));
    },
  };
}
