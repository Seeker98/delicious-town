import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ErrorCode, openQuery, type Locale } from '@dt/shared';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { OpenData } from './data';

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * 开放接口（问题记录 142，设计 §2）：不用登录、任何网站都能跨域读（不带 cookie）、按 IP 单独限流、可缓存。
 * 配置不变结果就不变：按"语言 + 键"缓存算好的结果，ETag 带配置版本
 */
export function openRoutes(data: OpenData, version: string): FastifyPluginAsync {
  const cache = new Map<string, unknown>();
  /** 只缓存查得到的：不存在的 id 不进缓存，免得随便传 id 把内存撑大（各类 id 有限，缓存最多几万条） */
  const cached = <T>(lang: Locale, key: string, make: () => T | null): T | null => {
    const k = `${lang}:${key}`;
    if (cache.has(k)) return cache.get(k) as T;
    const v = make();
    if (v !== null) cache.set(k, v);
    return v;
  };
  const langOf = (req: FastifyRequest): Locale => parse(openQuery, req.query).lang ?? 'zh-CN';
  const notFound = (id: number) => new AppError(ErrorCode.NOT_FOUND, 404, { what: 'open', id });
  /** 写缓存头；客户端带着同样的 ETag 时回 304、不带正文 */
  const send = <T>(
    req: FastifyRequest,
    reply: FastifyReply,
    lang: Locale,
    key: string,
    make: () => T | null,
  ) => {
    const etag = `"${version}:${lang}:${key}"`;
    reply.header('cache-control', 'public, max-age=3600').header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const body = cached(lang, key, make);
    if (body === null) throw notFound(Number(key.split('/')[1]));
    return ok(body);
  };
  const config = { rateLimit: 'open' as const };

  return async (r) => {
    // 全局 CORS 只允许本站、带 cookie；开放接口改成任何网站都能读、不带 cookie（错误响应也一样）
    r.addHook('onSend', async (_req, reply, payload) => {
      reply.header('access-control-allow-origin', '*');
      reply.removeHeader('access-control-allow-credentials');
      return payload;
    });
    r.get('/', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'index', () => data.index(lang));
    });
    r.get('/goods', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'goods', () => data.goods(lang));
    });
    r.get('/goods/:id', { config }, async (req, reply) => {
      const lang = langOf(req);
      const { id } = parse(idParam, req.params);
      return send(req, reply, lang, `goods/${id}`, () => data.goodsDetail(lang, id));
    });
    r.get('/foods', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'foods', () => data.foods(lang));
    });
    r.get('/foods/:id', { config }, async (req, reply) => {
      const lang = langOf(req);
      const { id } = parse(idParam, req.params);
      return send(req, reply, lang, `foods/${id}`, () => data.food(lang, id));
    });
    r.get('/cookbooks', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'cookbooks', () => data.cookbooks(lang));
    });
    r.get('/cookbooks/:id', { config }, async (req, reply) => {
      const lang = langOf(req);
      const { id } = parse(idParam, req.params);
      return send(req, reply, lang, `cookbooks/${id}`, () => data.cookbook(lang, id));
    });
    r.get('/equips', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'equips', () => data.equips(lang));
    });
    r.get('/streets', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'streets', () => data.streets(lang));
    });
  };
}
