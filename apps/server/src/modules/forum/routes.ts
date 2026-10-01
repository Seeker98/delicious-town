import type { FastifyPluginAsync } from 'fastify';
import { forumIdParam, forumPostBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ForumService } from './service';

export function forumRoutes(svc: ForumService): FastifyPluginAsync {
  return async (r) => {
    const id = (p: unknown) => parse(forumIdParam, p).id;
    r.post('/forum/posts', async (req) =>
      okOp(await svc.createPost(restCtxOf(req), parse(forumPostBody, req.body))),
    );
    r.put('/forum/posts/:id', async (req) =>
      okOp(await svc.editPost(restCtxOf(req), id(req.params), parse(forumPostBody, req.body))),
    );
    r.delete('/forum/posts/:id', async (req) => okOp(await svc.deletePost(restCtxOf(req), id(req.params))));
  };
}
