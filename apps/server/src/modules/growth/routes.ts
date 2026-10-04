import type { FastifyPluginAsync } from 'fastify';
import {
  allocateBody,
  cookfoodsBody,
  drivePlanktonBody,
  moveBody,
  placeDeviceBody,
  renameBody,
  slotBody,
  toggleBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { GrowthService } from './service';

export function growthRoutes(svc: GrowthService): FastifyPluginAsync {
  return async (r) => {
    r.get('/star', async (req) => ok(await svc.starNeed(restCtxOf(req))));
    r.get('/oil', async (req) => ok(await svc.oilNeed(restCtxOf(req))));
    r.post('/allocate', async (req) =>
      okOp(await svc.allocate(restCtxOf(req), parse(allocateBody, req.body))),
    );
    r.post('/refuel', async (req) => okOp(await svc.refuel(restCtxOf(req))));
    r.post('/star-up', async (req) => okOp(await svc.starUp(restCtxOf(req))));
    r.post('/oil-expand', async (req) => okOp(await svc.oilExpand(restCtxOf(req))));
    r.get('/devices', async (req) => ok(await svc.devices(restCtxOf(req))));
    r.post('/device/place', async (req) =>
      okOp(await svc.placeDevice(restCtxOf(req), parse(placeDeviceBody, req.body))),
    );
    r.post('/device/remove', async (req) =>
      okOp(await svc.removeDevice(restCtxOf(req), parse(slotBody, req.body))),
    );
    r.post('/plaque2', async (req) => okOp(await svc.openPlaque2(restCtxOf(req))));
    r.post('/rename', async (req) =>
      okOp(await svc.rename(restCtxOf(req), parse(renameBody, req.body).name)),
    );
    r.get('/move', async (req) => ok(await svc.moveCost(restCtxOf(req))));
    r.post('/move', async (req) => okOp(await svc.move(restCtxOf(req), parse(moveBody, req.body).streetId)));
    r.post('/promo', async (req) => okOp(await svc.setPromo(restCtxOf(req), parse(toggleBody, req.body).on)));
    r.post('/cookfoods', async (req) =>
      okOp(await svc.setCookfoods(restCtxOf(req), parse(cookfoodsBody, req.body).flag)),
    );
    r.post('/cte', async (req) => okOp(await svc.setCte(restCtxOf(req), parse(toggleBody, req.body).on)));
    r.post('/plankton/drive', async (req) =>
      okOp(await svc.drivePlankton(restCtxOf(req), parse(drivePlanktonBody, req.body).way)),
    );
    r.post('/krab/drive', async (req) => okOp(await svc.driveKrab(restCtxOf(req))));
  };
}
