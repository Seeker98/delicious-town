import type { FastifyPluginAsync } from 'fastify';
import {
  adminFuturesQuery,
  adminFuturesUpdateBody,
  ErrorCode,
  adminLedgerQuery,
  adminRenameBody,
  activityBody,
  announcementBody,
  adminDailyEditBody,
  adminDailyListQuery,
  adminDailyParams,
  linkBody,
  auditQuery,
  createGrantBody,
  economyQuery,
  grantIconBody,
  createTitleBody,
  updateTitleBody,
  titleListQuery,
  grantListQuery,
  codeListQuery,
  grantPreviewQuery,
  idParam,
  banBody,
  launchCheckFixBody,
  reportListQuery,
  suspiciousQuery,
  exchangeConfiscateBody,
  exchangeFreezeBody,
  exchangeSuspiciousQuery,
  exchangeUnfreezeBody,
  predictCreateBody,
  predictResolveBody,
  predictVoidBody,
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
import { createAdminItems } from './items';
import { auditPage } from './audit';
import { createAdminGrants } from './grants';
import { createAdminIcons } from './icons';
import { createAdminTitles } from './titles';
import { createAdminFutures } from '../futures/admin';
import { createLaunchCheck } from './launch';
import { createAdminPlayers } from './players';
import { createAdminShards } from './shards';
import { createAdminMail } from '../mail/admin';
import { createAdminCodes } from '../redeem/admin';
import { createSuspicious } from '../ops/suspicious';
import { createExchangeAdmin } from '../exchange/admin';
import { createPredictAdmin } from '../predict/admin';
import { createAdminReports } from '../report/admin';
import { createAdminActivity } from '../activity/admin';
import { createAdminAnnounce } from '../announce/admin';
import { createAdminDaily } from '../daily/admin';
import { createSite } from '../site/service';
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
      return ok(await icons.grant(a, id(req), parse(grantIconBody, req.body)));
    });
    r.post('/restaurants/:id/icons/:iconId/revoke', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const iconId = Number((req.params as { iconId: string }).iconId);
      if (!Number.isInteger(iconId) || iconId <= 0) throw new AppError(ErrorCode.NOT_FOUND, 404);
      return ok(await icons.revoke(a, id(req), iconId));
    });

    const titles = createAdminTitles(game);
    r.get('/titles', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await titles.list(parse(titleListQuery, req.query).q));
    });
    r.post('/titles', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await titles.create(a, parse(createTitleBody, req.body)));
    });
    r.post('/titles/:id', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await titles.update(a, id(req), parse(updateTitleBody, req.body)));
    });
    r.post('/titles/:id/delete', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await titles.remove(a, id(req));
      return ok(null);
    });

    // 期货食材（期货设计 §5.3）
    const futures = createAdminFutures(game);
    r.get('/futures/foods', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await futures.list(parse(adminFuturesQuery, req.query).shardId));
    });
    r.post('/futures/foods', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await futures.update(a, parse(adminFuturesUpdateBody, req.body).items);
      return ok(null);
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

    const launch = createLaunchCheck(game, r.log);
    r.get('/launch-check', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await launch.check());
    });
    r.post('/launch-check/fix', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await launch.fix(a, parse(launchCheckFixBody, req.body)));
    });

    const items = createAdminItems(game.deps.config);
    r.get('/items', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(items.report());
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
    r.get('/suspicious/acquire', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await suspicious.acquireBlocks(parse(suspiciousQuery, req.query).shardId));
    });

    const exchangeAdmin = createExchangeAdmin(game);
    r.get('/suspicious/exchange', async (req) => {
      await requireRole(db, req, 'mod');
      const q = parse(exchangeSuspiciousQuery, req.query);
      return ok(await exchangeAdmin.suspicious(q.shardId, q.flag));
    });
    r.get('/exchange/frozen', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.frozen(parse(suspiciousQuery, req.query).shardId));
    });
    r.get('/exchange/maker', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.maker(parse(suspiciousQuery, req.query).shardId));
    });
    r.post('/exchange/freeze', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.freeze(a, parse(exchangeFreezeBody, req.body)));
    });
    r.post('/exchange/unfreeze', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await exchangeAdmin.unfreeze(a, parse(exchangeUnfreezeBody, req.body)));
    });
    r.post('/exchange/confiscate', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await exchangeAdmin.confiscate(a, parse(exchangeConfiscateBody, req.body)));
    });

    // 事件合约（238-1 设计 §6.3、§7.3）：协管出题和查看，管理员判定和作废
    const predictAdmin = createPredictAdmin(game);
    r.get('/predict', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await predictAdmin.list(parse(suspiciousQuery, req.query).shardId));
    });
    r.post('/predict', async (req) => {
      const a = await requireRole(db, req, 'mod');
      return ok(await predictAdmin.create(a, parse(predictCreateBody, req.body)));
    });
    r.post('/predict/:id/resolve', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const b = parse(predictResolveBody, req.body);
      return ok(await predictAdmin.resolve(a, id(req), b.outcome, b.note));
    });
    r.post('/predict/:id/void', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await predictAdmin.voidEvent(a, id(req), parse(predictVoidBody, req.body ?? {}).note));
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
      return ok(await codes.list(parse(codeListQuery, req.query)));
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
    r.post('/codes/:id/enable', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await codes.enable(a, id(req));
      return ok(null);
    });
    r.get('/codes/batches/:id/export', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await codes.exportBatch(a, id(req)));
    });

    const activities = createAdminActivity(game, r.log);
    r.get('/activities', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await activities.list());
    });
    r.get('/activities/:id', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await activities.one(id(req)));
    });
    r.post('/activities', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await activities.create(a, parse(activityBody, req.body)));
    });
    r.post('/activities/:id', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await activities.update(a, id(req), parse(activityBody, req.body)));
    });
    r.post('/activities/:id/end', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await activities.end(a, id(req)));
    });
    r.post('/activities/:id/delete', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await activities.remove(a, id(req));
      return ok(null);
    });
    // 小镇日报（2026-10-08）：看、发布、撤下、手改、重新生成，都要 admin
    const daily = createAdminDaily(game);
    r.get('/daily', async (req) => {
      await requireRole(db, req, 'admin');
      return ok(await daily.list(parse(adminDailyListQuery, req.query).shardId));
    });
    r.get('/daily/:shardId/:day', async (req) => {
      await requireRole(db, req, 'admin');
      const p = parse(adminDailyParams, req.params);
      return ok(await daily.detail(p.shardId, p.day));
    });
    r.post('/daily/:shardId/:day/publish', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const p = parse(adminDailyParams, req.params);
      return ok(await daily.publish(a, p.shardId, p.day));
    });
    r.post('/daily/:shardId/:day/hide', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const p = parse(adminDailyParams, req.params);
      return ok(await daily.hide(a, p.shardId, p.day));
    });
    r.post('/daily/:shardId/:day/edit', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const p = parse(adminDailyParams, req.params);
      return ok(await daily.edit(a, p.shardId, p.day, parse(adminDailyEditBody, req.body)));
    });
    r.post('/daily/:shardId/:day/regenerate', async (req) => {
      const a = await requireRole(db, req, 'admin');
      const p = parse(adminDailyParams, req.params);
      return ok(await daily.regenerate(a, p.shardId, p.day));
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

    // 友情链接（问题记录 348）
    const links = createSite(game).admin;
    r.get('/links', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await links.list());
    });
    r.post('/links', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await links.create(a, parse(linkBody, req.body)));
    });
    r.post('/links/:id', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await links.update(a, id(req), parse(linkBody, req.body)));
    });
    r.post('/links/:id/delete', async (req) => {
      const a = await requireRole(db, req, 'admin');
      await links.remove(a, id(req));
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

    const shards = createAdminShards(game, r.log);
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
