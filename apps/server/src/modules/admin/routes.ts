import type { FastifyPluginAsync } from 'fastify';
import {
  ErrorCode,
  adminLedgerQuery,
  adminRenameBody,
  announcementBody,
  auditQuery,
  createGrantBody,
  economyQuery,
  grantIconBody,
  grantListQuery,
  grantPreviewQuery,
  idParam,
  banBody,
  reportListQuery,
  suspiciousQuery,
  resolveReportBody,
  rejectReportBody,
  pageQuery,
  playerSearchQuery,
  roleBody,
  rollbackBody,
  saveOverrideBody,
  sendMailBody,
  createSharedCodeBody,
  createBatchBody,
  settlementQuery,
  shardQuery,
  type AdminMeDto,
} from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireRole } from './access';
import { auditPage } from './audit';
import { createAdminGrants } from './grants';
import { createAdminIcons } from './icons';
import { createAdminPlayers } from './players';
import { createAdminShards } from './shards';
import { createAdminMail } from '../mail/admin';
import { createAdminCodes } from '../redeem/admin';
import { createSuspicious } from '../ops/suspicious';
import { createAdminReports } from '../report/admin';
import { createAdminAnnounce } from '../announce/admin';
import { distribution, economy, settlementRounds } from './stats';

/** 后台路由（/api/v1/admin）：每个处理函数第一步都是 requireRole */
export function adminRoutes(game: Game): FastifyPluginAsync {
  const db = game.app.db;
  return async (r) => {
    r.get('/me', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const dto: AdminMeDto = { accountId: a.accountId, username: a.username, role: a.role };
      return ok(dto);
    });

    const players = createAdminPlayers(game);
    const id = (req: { params: unknown }) => parse(idParam, req.params).id;
    r.get('/players', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.search(parse(playerSearchQuery, req.query).q));
    });
    r.get('/players/:id', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.detail(id(req)));
    });
    r.get('/restaurants/:id', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.restaurant(id(req)));
    });
    r.get('/restaurants/:id/ledger', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.ledger(id(req), parse(adminLedgerQuery, req.query)));
    });
    r.get('/restaurants/:id/log', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.log(id(req), parse(pageQuery, req.query)));
    });
    r.get('/restaurants/:id/income', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await players.income(id(req), parse(pageQuery, req.query)));
    });
    r.post('/players/:id/ban', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const b = parse(banBody, req.body);
      return ok(await players.ban(a, id(req), b.reason, b.days));
    });
    r.post('/players/:id/unban', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await players.unban(a, id(req)));
    });
    r.post('/restaurants/:id/rename', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const b = parse(adminRenameBody, req.body);
      return ok(await players.rename(a, id(req), b.name, b.reason));
    });
    r.post('/players/:id/role', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await players.setRole(a, id(req), parse(roleBody, req.body).role));
    });

    const icons = createAdminIcons(game);
    r.get('/restaurants/:id/icons', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await icons.list(id(req)));
    });
    r.post('/restaurants/:id/icons', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await icons.grant(a, id(req), parse(grantIconBody, req.body).key));
    });
    r.post('/restaurants/:id/icons/:iconId/revoke', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const iconId = Number((req.params as { iconId: string }).iconId);
      if (!Number.isInteger(iconId) || iconId <= 0) throw new AppError(ErrorCode.NOT_FOUND, 404);
      return ok(await icons.revoke(a, id(req), iconId));
    });

    const grants = createAdminGrants(game);
    r.get('/grants/preview', async (req) => {
      await requireRole(db, req, 'admin');
      const q = parse(grantPreviewQuery, req.query);
      return ok(await grants.preview(q.shardId, q.minLevel));
    });
    r.post('/grants', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await grants.create(a, parse(createGrantBody, req.body)));
    });
    r.get('/grants', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await grants.list(parse(grantListQuery, req.query).shardId));
    });

    const mails = createAdminMail(game);
    r.get('/mails', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await mails.list({ shardId: parse(grantListQuery, req.query).shardId }));
    });
    r.post('/mails', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await mails.send(a, parse(sendMailBody, req.body)));
    });
    r.post('/mails/:id/revoke', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await mails.revoke(a, id(req)));
    });

    const suspicious = createSuspicious(game);
    r.get('/suspicious/bar', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await suspicious.bar(parse(suspiciousQuery, req.query).shardId));
    });
    r.get('/suspicious/surge', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(suspiciousQuery, req.query);
      return ok(await suspicious.surge(q.shardId, q.day));
    });
    r.get('/suspicious/multi', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await suspicious.multi(parse(suspiciousQuery, req.query).shardId));
    });
    r.get('/suspicious/redeem', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await suspicious.redeemLocked(parse(suspiciousQuery, req.query).shardId));
    });

    const reports = createAdminReports(game);
    r.get('/reports', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await reports.list(parse(reportListQuery, req.query)));
    });
    r.get('/reports/:id', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await reports.detail(id(req)));
    });
    r.post('/reports/:id/resolve', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await reports.resolve(a, id(req), parse(resolveReportBody, req.body)));
    });
    r.post('/reports/:id/reject', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await reports.reject(a, id(req), parse(rejectReportBody, req.body)));
    });

    const codes = createAdminCodes(game);
    r.get('/codes', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await codes.list({ shardId: parse(grantListQuery, req.query).shardId }));
    });
    r.post('/codes', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await codes.createShared(a, parse(createSharedCodeBody, req.body)));
    });
    r.post('/codes/batch', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await codes.createBatch(a, parse(createBatchBody, req.body)));
    });
    r.post('/codes/:id/disable', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await codes.disable(a, id(req));
      return ok(null);
    });
    r.get('/codes/batches/:id/export', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await codes.exportBatch(a, id(req)));
    });

    const announces = createAdminAnnounce(game);
    r.get('/announcements', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await announces.list());
    });
    r.post('/announcements', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await announces.create(a, parse(announcementBody, req.body)));
    });
    r.post('/announcements/:id', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await announces.update(a, id(req), parse(announcementBody, req.body)));
    });
    r.post('/announcements/:id/delete', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await announces.remove(a, id(req));
      return ok(null);
    });

    r.get('/stats/economy', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(economyQuery, req.query);
      return ok(await economy(db, q.shardId, q.from, q.to, game.deps.now()));
    });
    r.get('/stats/distribution', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await distribution(db, parse(shardQuery, req.query).shardId));
    });
    r.get('/stats/settlement', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(settlementQuery, req.query);
      return ok(await settlementRounds(db, q.shardId, q.rounds));
    });

    r.get('/audit', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await auditPage(db, parse(auditQuery, req.query)));
    });

    const shards = createAdminShards(game);
    r.get('/shards', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.list());
    });
    r.get('/shards/:id/settings', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.settings(id(req)));
    });
    r.post('/shards/:id/override', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await shards.save(a, id(req), parse(saveOverrideBody, req.body)));
    });
    r.get('/shards/:id/history', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.history(id(req)));
    });
    r.post('/shards/:id/rollback', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await shards.rollback(a, id(req), parse(rollbackBody, req.body)));
    });
  };
}
