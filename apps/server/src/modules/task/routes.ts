import type { FastifyPluginAsync } from 'fastify';
import { claimActivationBody, claimChapterBody, claimTaskBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TaskService } from './service';

export function taskRoutes(svc: TaskService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.tasks(restCtxOf(req))));
    r.get('/activation', async (req) => ok(await svc.activation(restCtxOf(req))));
    r.post('/claim', async (req) =>
      okOp(await svc.claimTask(restCtxOf(req), parse(claimTaskBody, req.body).taskId)),
    );
    // 章末奖励（问题记录 318）
    r.post('/chapter', async (req) =>
      okOp(await svc.claimChapter(restCtxOf(req), parse(claimChapterBody, req.body).chapterId)),
    );
    r.post('/activation/claim', async (req) =>
      okOp(await svc.claimActivation(restCtxOf(req), parse(claimActivationBody, req.body).points)),
    );
    r.post('/signin', async (req) => okOp(await svc.signIn(restCtxOf(req))));
  };
}
