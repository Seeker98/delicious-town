import type { FastifyPluginAsync } from 'fastify';
import { reportBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ReportService } from './service';

export function reportRoutes(svc: ReportService): FastifyPluginAsync {
  return async (r) => {
    r.post('/report', async (req) => okOp(await svc.report(restCtxOf(req), parse(reportBody, req.body))));
  };
}
