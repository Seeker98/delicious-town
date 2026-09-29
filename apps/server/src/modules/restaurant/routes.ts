import type { FastifyPluginAsync } from 'fastify';
import { createRestaurantBody } from '@dt/shared';
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
  };
}
