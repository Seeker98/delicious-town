import type { FastifyPluginAsync } from 'fastify';
import {
  takeawayClaimBody,
  takeawayDeliverBody,
  takeawayHireBody,
  takeawayOpenBody,
  takeawayRiderBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TakeawayService } from './service';

export function takeawayRoutes(svc: TakeawayService): FastifyPluginAsync {
  return async (r) => {
    r.get('/takeaway', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/takeaway/open', async (req) =>
      okOp(await svc.open(restCtxOf(req), parse(takeawayOpenBody, req.body))),
    );
    r.post('/takeaway/refresh', async (req) => okOp(await svc.refresh(restCtxOf(req))));
    r.post('/takeaway/deliver', async (req) =>
      okOp(await svc.deliver(restCtxOf(req), parse(takeawayDeliverBody, req.body))),
    );
    r.post('/takeaway/claim', async (req) =>
      okOp(await svc.claim(restCtxOf(req), parse(takeawayClaimBody, req.body))),
    );
    r.post('/takeaway/claim-all', async (req) => okOp(await svc.claimAll(restCtxOf(req))));
    r.get('/takeaway/candidates', async (req) => ok(await svc.candidates(restCtxOf(req))));
    r.post('/takeaway/hire', async (req) =>
      okOp(await svc.hire(restCtxOf(req), parse(takeawayHireBody, req.body))),
    );
    r.post('/takeaway/dismiss', async (req) =>
      okOp(await svc.dismiss(restCtxOf(req), parse(takeawayRiderBody, req.body))),
    );
  };
}
