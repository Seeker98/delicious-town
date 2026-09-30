import type { FastifyPluginAsync } from 'fastify';
import {
  ErrorCode,
  adminLedgerQuery,
  adminRenameBody,
  auditQuery,
  createGrantBody,
  economyQuery,
  grantIconBody,
  grantListQuery,
  grantPreviewQuery,
  idParam,
  pageQuery,
  playerSearchQuery,
  reasonBody,
  roleBody,
  rollbackBody,
  saveOverrideBody,
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
      return ok(await players.ban(a, id(req), parse(reasonBody, req.body).reason));
    });
    r.post('/players/:id/unban', async (req) => {
      const a = await requireRole(db, req, 'mod');
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
