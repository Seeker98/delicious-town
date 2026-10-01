import type { FastifyPluginAsync } from 'fastify';
import {
  barCupBody,
  barDevilDrinkBody,
  barDevilStartBody,
  barExchangeBody,
  barFgBody,
  barNumBody,
  barSlotBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { BarService } from './service';

export function barRoutes(svc: BarService): FastifyPluginAsync {
  return async (r) => {
    r.get('/bar', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/bar/fg', async (req) => okOp(await svc.fg(restCtxOf(req), parse(barFgBody, req.body))));
    r.post('/bar/cup', async (req) => {
      parse(barCupBody, req.body);
      return okOp(await svc.cup(restCtxOf(req)));
    });
    r.post('/bar/num', async (req) => okOp(await svc.num(restCtxOf(req), parse(barNumBody, req.body))));
    r.post('/bar/exchange', async (req) =>
      okOp(await svc.exchange(restCtxOf(req), parse(barExchangeBody, req.body))),
    );
    r.post('/bar/slot', async (req) => okOp(await svc.slot(restCtxOf(req), parse(barSlotBody, req.body))));
    r.post('/bar/devil/start', async (req) =>
      okOp(await svc.devilStart(restCtxOf(req), parse(barDevilStartBody, req.body))),
    );
    r.post('/bar/devil/drink', async (req) =>
      okOp(await svc.devilDrink(restCtxOf(req), parse(barDevilDrinkBody, req.body))),
    );
  };
}
