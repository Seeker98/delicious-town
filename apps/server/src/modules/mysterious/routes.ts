import type { FastifyPluginAsync } from 'fastify';
import {
  lessonIdParam,
  lessonLearnBody,
  lessonOpenBody,
  appraiseBody,
  mcCookBody,
  mcIdParam,
  mcLearnBody,
  remnantBody,
  tasteBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { MysteriousService } from './service';

export function mysteriousRoutes(svc: MysteriousService): FastifyPluginAsync {
  return async (r) => {
    r.get('/mc', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/mc/appraise', async (req) =>
      okOp(await svc.appraise(restCtxOf(req), parse(appraiseBody, req.body))),
    );
    r.post('/mc/remnant/sell', async (req) =>
      okOp(await svc.sellRemnant(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/remnant/exchange', async (req) =>
      okOp(await svc.exchangeFragments(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/remnant/decompose', async (req) =>
      okOp(await svc.decomposeRemnant(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/learn', async (req) => okOp(await svc.learn(restCtxOf(req), parse(mcLearnBody, req.body))));
    r.post('/mc/learnAll', async (req) => okOp(await svc.learnAll(restCtxOf(req))));
    r.get('/mc/:id/preview', async (req) =>
      ok(await svc.preview(restCtxOf(req), parse(mcIdParam, req.params).id)),
    );
    r.post('/mc/cook', async (req) => okOp(await svc.cook(restCtxOf(req), parse(mcCookBody, req.body))));
    r.post('/mc/dump', async (req) => okOp(await svc.dump(restCtxOf(req))));
    r.post('/mc/taste', async (req) => okOp(await svc.taste(restCtxOf(req), parse(tasteBody, req.body))));
    r.get('/mc/lessons', async (req) => ok(await svc.lessons(restCtxOf(req))));
    r.post('/mc/lesson/open', async (req) =>
      okOp(await svc.openLesson(restCtxOf(req), parse(lessonOpenBody, req.body))),
    );
    r.post('/mc/lesson/:id/learn', async (req) =>
      okOp(
        await svc.learnLesson(
          restCtxOf(req),
          parse(lessonIdParam, req.params).id,
          parse(lessonLearnBody, req.body),
        ),
      ),
    );
    r.post('/mc/lesson/close', async (req) => okOp(await svc.closeLesson(restCtxOf(req))));
  };
}
