import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ErrorCode, localeSchema, type Locale } from '@dt/shared';
import { parse } from '../../http/validate';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { requireAccount } from '../../security/session';
import type { WorldService } from './service';

export function worldRoutes(world: WorldService): FastifyPluginAsync {
  /**
   * 目录按语言序列化一次、算好 ETag（质量期 ③）：约 290KB，原来每次请求都重新序列化、压缩，
   * 浏览器每次打开页面都整份重下。ETag 按内容算，配置或代码改了目录都会变
   */
  const cached = new Map<Locale, { body: string; etag: string }>();
  const catalogOf = (lang: Locale) => {
    let c = cached.get(lang);
    if (!c) {
      const body = JSON.stringify(ok(world.catalog(lang)));
      c = { body, etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"` };
      cached.set(lang, c);
    }
    return c;
  };
  return async (r) => {
    r.get('/weather', async (req) => {
      const { shardId } = requireAccount(req).data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      return ok(await world.view(shardId));
    });
    /** 道具目录：?lang= 按语言返回名字（问题记录 272）；带 ETag，没变时回 304（质量期 ③） */
    r.get('/catalog', async (req, reply) => {
      const lang = parse(z.object({ lang: localeSchema.optional() }), req.query).lang ?? 'zh-CN';
      const c = catalogOf(lang);
      // no-cache：浏览器每次都来问一下，没变就 304，前端代码不用改
      reply.header('etag', c.etag).header('cache-control', 'no-cache');
      if (req.headers['if-none-match'] === c.etag) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(c.body);
    });
  };
}
