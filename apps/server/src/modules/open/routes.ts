import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ErrorCode, openQuery, type Locale } from '@dt/shared';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { OpenData } from './data';

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** 重新编号前的编号：301 到新编号（设计 §5），路径前缀、查询串原样保留；旧号段和新号段不重叠，不会认错 */
function legacyRedirect(req: FastifyRequest, reply: FastifyReply, now: number) {
  const q = req.url.indexOf('?');
  const path = q >= 0 ? req.url.slice(0, q) : req.url;
  const to = path.replace(/[^/]+$/, String(now)) + (q >= 0 ? req.url.slice(q) : '');
  return reply.redirect(to, 301);
}

/** If-None-Match 里有没有这个 ETag：认弱 ETag（CDN 重新压缩时改成 W/）和逗号分隔的多个 */
/** 开放接口返回格式的版本：改了返回的结构（加减字段）要加一，ETag 带着它，客户端才会重新取（第 ⑧ 批审查） */
const OPEN_FORMAT = 2;

export function etagMatches(header: string | undefined, etag: string): boolean {
  return !!header && header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
}

/**
 * 开放接口（问题记录 142，设计 §2）：不用登录、任何网站都能跨域读（不带 cookie）、按 IP 单独限流、可缓存。
 * 配置不变结果就不变：按"语言 + 键"缓存算好的结果，ETag 带配置版本。
 * 本站的 Wiki 也用不带 cookie 的请求，所以一律回 *，响应不随来源变，共享缓存不会串（终审）
 */
/** 详情缓存最多留多少条（各语言合计）：一条约 1~2KB，2000 条几 MB */
const DETAIL_MAX = 2000;

export function openRoutes(
  data: OpenData,
  version: string,
  opts: { detailMax?: number } = {},
): FastifyPluginAsync {
  const detailMax = opts.detailMax ?? DETAIL_MAX;
  /**
   * 缓存序列化好的正文（质量期 ③）：列表只有几十个键，全留；详情（各语言合计两万多个）只留最近用过的，
   * 原来全部留对象，爬一遍就几十 MB，而且每次请求还要重新序列化。
   * 只缓存查得到的：不存在的 id 不进缓存
   */
  const lists = new Map<string, string>();
  const details = new Map<string, string>();
  const cached = <T>(lang: Locale, key: string, make: () => T | null): string | null => {
    const k = `${lang}:${key}`;
    const detail = key.includes('/');
    const store = detail ? details : lists;
    const hit = store.get(k);
    if (hit !== undefined) {
      // Map 按插入顺序：用到一次挪到最后，最久没用的在最前面
      if (detail) {
        store.delete(k);
        store.set(k, hit);
      }
      return hit;
    }
    const v = make();
    if (v === null) return null;
    const body = JSON.stringify(ok(v));
    store.set(k, body);
    if (detail && store.size > detailMax) store.delete(store.keys().next().value!);
    return body;
  };
  const langOf = (req: FastifyRequest): Locale => parse(openQuery, req.query).lang ?? 'zh-CN';
  const notFound = (id: number) => new AppError(ErrorCode.NOT_FOUND, 404, { what: 'open', id });
  /** 客户端带着同样的 ETag 时回 304、不带正文；查不到报 404，404 不带缓存头和 ETag */
  const send = <T>(
    req: FastifyRequest,
    reply: FastifyReply,
    lang: Locale,
    key: string,
    make: () => T | null,
  ) => {
    const etag = `"${version}:${OPEN_FORMAT}:${lang}:${key}"`;
    const cacheHeaders = () => reply.header('cache-control', 'public, max-age=3600').header('etag', etag);
    // ETag 只发给查得到的，带着它来的一定存在
    if (etagMatches(req.headers['if-none-match'], etag)) return cacheHeaders().code(304).send();
    const body = cached(lang, key, make);
    if (body === null) throw notFound(Number(key.split('/')[1]));
    cacheHeaders();
    return reply.type('application/json; charset=utf-8').send(body);
  };
  const config = { rateLimit: 'open' as const };

  return async (r) => {
    // 全局 CORS 只允许本站、带 cookie；开放接口改成任何网站都能读、不带 cookie（错误响应、预检也一样），
    // 并让别的网站读得到 ETag；预检允许对方要带的头（If-None-Match 等）
    r.addHook('onSend', async (req, reply, payload) => {
      reply.header('access-control-allow-origin', '*');
      reply.removeHeader('access-control-allow-credentials');
      reply.header('access-control-expose-headers', 'ETag');
      if (req.method === 'OPTIONS') {
        reply.header('access-control-allow-methods', 'GET, OPTIONS');
        reply.header(
          'access-control-allow-headers',
          req.headers['access-control-request-headers'] ?? 'If-None-Match',
        );
        reply.header('access-control-max-age', '86400');
      }
      return payload;
    });
    // 预检落在开放接口自己这里（不走全局 CORS 的"只许本站"）
    const preflight = async (_req: FastifyRequest, reply: FastifyReply) => reply.code(204).send();
    r.options('/', { config }, preflight);
    r.options('/*', { config }, preflight);
    // 开放接口下写错的路径也回 NOT_FOUND，带 * 和开放接口的限流
    r.setNotFoundHandler({}, async () => {
      throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'open' });
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
      const now = data.moved('goods', id);
      if (now !== undefined) return legacyRedirect(req, reply, now);
      return send(req, reply, lang, `goods/${id}`, () => data.goodsDetail(lang, id));
    });
    r.get('/foods', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'foods', () => data.foods(lang));
    });
    r.get('/foods/:id', { config }, async (req, reply) => {
      const lang = langOf(req);
      const { id } = parse(idParam, req.params);
      const now = data.moved('foods', id);
      if (now !== undefined) return legacyRedirect(req, reply, now);
      return send(req, reply, lang, `foods/${id}`, () => data.food(lang, id));
    });
    r.get('/cookbooks', { config }, async (req, reply) => {
      const lang = langOf(req);
      return send(req, reply, lang, 'cookbooks', () => data.cookbooks(lang));
    });
    r.get('/cookbooks/:id', { config }, async (req, reply) => {
      const lang = langOf(req);
      const { id } = parse(idParam, req.params);
      const now = data.moved('cookbooks', id);
      if (now !== undefined) return legacyRedirect(req, reply, now);
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
