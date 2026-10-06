import type { FastifyPluginAsync } from 'fastify';
import { createRestaurantBody, pageQuery } from '@dt/shared';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireAccount, requireRestaurant } from '../../security/session';
import type { RestaurantService } from './service';

export function restaurantRoutes(svc: RestaurantService): FastifyPluginAsync {
  return async (r) => {
    r.post('/create', async (req) => {
      const session = requireAccount(req);
      const { name } = parse(createRestaurantBody, req.body);
      return ok(await svc.create(session, name));
    });
    r.get('/overview', async (req) => ok(await svc.overview(requireRestaurant(req).restaurantId)));
    r.get('/floor', async (req) => ok(await svc.floor(requireRestaurant(req).restaurantId)));
    r.get('/income', async (req) =>
      ok(await svc.income(requireRestaurant(req).restaurantId, parse(pageQuery, req.query))),
    );
    r.get('/buffs', async (req) => ok(await svc.buffs(requireRestaurant(req))));
    r.get('/log', async (req) =>
      ok(await svc.log(requireRestaurant(req).restaurantId, parse(pageQuery, req.query))),
    );
  };
}
