import type { FastifyPluginAsync } from 'fastify';
import {
  forumAdminBody,
  forumIdParam,
  forumListQuery,
  forumPostBody,
  forumReactBody,
  forumReplyBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ForumService } from './service';

export function forumRoutes(svc: ForumService): FastifyPluginAsync {
  return async (r) => {
    const id = (p: unknown) => parse(forumIdParam, p).id;
    r.post('/forum/posts/:id/replies', async (req) =>
      okOp(await svc.reply(restCtxOf(req), id(req.params), parse(forumReplyBody, req.body))),
    );
    r.delete('/forum/replies/:id', async (req) =>
      okOp(await svc.deleteReply(restCtxOf(req), id(req.params))),
    );
    r.post('/forum/posts/:id/react', async (req) =>
      okOp(await svc.react(restCtxOf(req), id(req.params), parse(forumReactBody, req.body).kind)),
    );
    r.post('/forum/posts/:id/admin', async (req) =>
      okOp(await svc.admin(restCtxOf(req), id(req.params), parse(forumAdminBody, req.body).action)),
    );
    r.get('/forum/posts', async (req) =>
      ok(await svc.list(restCtxOf(req), parse(forumListQuery, req.query))),
    );
    r.get('/forum/posts/:id', async (req) => okOp(await svc.detail(restCtxOf(req), id(req.params))));
    r.get('/forum/posts/:id/reads', async (req) => okOp(await svc.reads(restCtxOf(req), id(req.params))));
    r.post('/forum/posts', async (req) =>
      okOp(await svc.createPost(restCtxOf(req), parse(forumPostBody, req.body))),
    );
    r.put('/forum/posts/:id', async (req) =>
      okOp(await svc.editPost(restCtxOf(req), id(req.params), parse(forumPostBody, req.body))),
    );
    r.delete('/forum/posts/:id', async (req) => okOp(await svc.deletePost(restCtxOf(req), id(req.params))));
  };
}
