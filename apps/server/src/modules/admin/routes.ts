import type { FastifyPluginAsync } from 'fastify';
import {
  adminLedgerQuery,
  adminRenameBody,
  idParam,
  pageQuery,
  playerSearchQuery,
  reasonBody,
  roleBody,
  rollbackBody,
  saveOverrideBody,
  type AdminMeDto,
} from '@dt/shared';
import type { Game } from '../../game';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireRole } from './access';
import { createAdminPlayers } from './players';
import { createAdminShards } from './shards';

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
