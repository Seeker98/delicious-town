import type { FastifyPluginAsync } from 'fastify';
import { localeSchema, randomEventAnswerBody, randomEventChooseBody } from '@dt/shared';
import { z } from 'zod';
import { restCtxOf } from '../../core/deps';
import { okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { RandomEventService } from './service';

const langQuery = z.object({ lang: localeSchema.optional() });
const idParams = z.object({ id: z.string().regex(/^\d{1,18}$/) });

/** 随机事件和问答（设计稿 2026-10-28 §9）：?lang= 按语言给文字 */
export function randomEventRoutes(svc: RandomEventService): FastifyPluginAsync {
  return async (r) => {
    const lang = (q: unknown) => parse(langQuery, q).lang ?? 'zh-CN';
    r.get('/random-events/current', async (req) => okOp(await svc.current(restCtxOf(req), lang(req.query))));
    r.post('/random-events/:id/choose', async (req) =>
      okOp(
        await svc.choose(
          restCtxOf(req),
          parse(idParams, req.params).id,
          parse(randomEventChooseBody, req.body).option,
          lang(req.query),
        ),
      ),
    );
    r.post('/random-events/:id/answer', async (req) =>
      okOp(
        await svc.answer(
          restCtxOf(req),
          parse(idParams, req.params).id,
          parse(randomEventAnswerBody, req.body),
          lang(req.query),
        ),
      ),
    );
    r.post('/random-events/:id/seen', async (req) =>
      okOp(await svc.seen(restCtxOf(req), parse(idParams, req.params).id)),
    );
  };
}
