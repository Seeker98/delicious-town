import type { FastifyPluginAsync } from 'fastify';
import { mailIdParam } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { MailService } from './service';

export function mailRoutes(svc: MailService): FastifyPluginAsync {
  return async (r) => {
    const id = (p: unknown) => parse(mailIdParam, p).id;
    r.get('/mail', async (req) => ok(await svc.list(restCtxOf(req))));
    r.get('/mail/unread', async (req) => ok(await svc.unread(restCtxOf(req))));
    r.post('/mail/claim-all', async (req) => okOp(await svc.claimAll(restCtxOf(req), req.log)));
    r.post('/mail/:id/read', async (req) => okOp(await svc.read(restCtxOf(req), id(req.params))));
    r.post('/mail/:id/claim', async (req) => okOp(await svc.claim(restCtxOf(req), id(req.params))));
    r.post('/mail/:id/delete', async (req) => okOp(await svc.remove(restCtxOf(req), id(req.params))));
  };
}
