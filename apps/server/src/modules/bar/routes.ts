import type { FastifyPluginAsync } from 'fastify';
import {
  barCupBody,
  barDartsThrowBody,
  barDevilDrinkBody,
  barDevilStartBody,
  barExchangeBody,
  barFgBody,
  barMemoryAnswerBody,
  barNimFirstBody,
  barNimStartBody,
  barNimTakeBody,
  barSpiceGuessBody,
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
    r.post('/bar/memory/start', async (req) => okOp(await svc.memoryStart(restCtxOf(req))));
    r.post('/bar/memory/answer', async (req) =>
      okOp(await svc.memoryAnswer(restCtxOf(req), parse(barMemoryAnswerBody, req.body))),
    );
    r.post('/bar/memory/next', async (req) => okOp(await svc.memoryNext(restCtxOf(req))));
    r.post('/bar/memory/stop', async (req) => okOp(await svc.memoryStop(restCtxOf(req))));
    r.post('/bar/nim/start', async (req) =>
      okOp(await svc.nimStart(restCtxOf(req), parse(barNimStartBody, req.body))),
    );
    r.post('/bar/nim/first', async (req) =>
      okOp(await svc.nimFirst(restCtxOf(req), parse(barNimFirstBody, req.body))),
    );
    r.post('/bar/spice/start', async (req) => okOp(await svc.spiceStart(restCtxOf(req))));
    r.post('/bar/spice/guess', async (req) =>
      okOp(await svc.spiceGuess(restCtxOf(req), parse(barSpiceGuessBody, req.body))),
    );
    r.post('/bar/nim/take', async (req) =>
      okOp(await svc.nimTake(restCtxOf(req), parse(barNimTakeBody, req.body))),
    );
    r.post('/bar/darts/start', async (req) => okOp(await svc.dartsStart(restCtxOf(req))));
    r.post('/bar/darts/aim', async (req) => okOp(await svc.dartsAim(restCtxOf(req))));
    r.post('/bar/darts/throw', async (req) =>
      okOp(await svc.dartsThrow(restCtxOf(req), parse(barDartsThrowBody, req.body))),
    );
  };
}
