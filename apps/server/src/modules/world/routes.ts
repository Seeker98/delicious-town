import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ErrorCode, localeSchema, type Locale } from '@dt/shared';
import { parse } from '../../http/validate';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { requireAccount } from '../../security/session';
import { etagMatches } from '../open/routes';
import type { WorldService } from './service';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
let compressions = 0;
/** 目录一共现场压缩过几次（测试用：同一语言、同一压缩方式只压一次） */
export const catalogCompressions = () => compressions;

/**
 * 按 Accept-Encoding 选压缩方式（和全局压缩插件一致）：x-gzip、* 当 gzip；按 q 值取高的，一样高时 br 优先；
 * q=0 的不要；都不认就不压
 */
export function pickEncoding(header: string | string[] | undefined): 'br' | 'gzip' | null {
  const q = new Map<string, number>();
  for (const part of String(header ?? '')
    .toLowerCase()
    .split(',')) {
    const [name, ...params] = part.trim().split(';');
    const enc = name === 'x-gzip' ? 'gzip' : name!.trim();
    const qp = params.map((x) => x.trim()).find((x) => x.startsWith('q='));
    const v = qp ? Number(qp.slice(2)) : 1;
    if (!Number.isFinite(v)) continue;
    if (enc === '*') {
      for (const e of ['br', 'gzip']) if (!q.has(e)) q.set(e, v);
    } else q.set(enc, v);
  }
  const br = q.get('br') ?? 0;
  const gz = q.get('gzip') ?? 0;
  if (br <= 0 && gz <= 0) return null;
  return br >= gz ? 'br' : 'gzip';
}

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
  /**
   * 压好的正文按“语言:压缩方式”缓存（backlog 质量期第 ③ 批：第一次请求或换版本时每次现场压缩约 290KB）。
   * 存的是 Promise：同时来的请求共用一次压缩；压缩是异步的，不卡住别的请求
   */
  const zipped = new Map<string, Promise<Buffer>>();
  const zippedOf = (lang: Locale, enc: 'br' | 'gzip', body: string) => {
    const k = `${lang}:${enc}`;
    let z = zipped.get(k);
    if (!z) {
      compressions++;
      z =
        enc === 'br'
          ? brotli(body, {
              // 质量 10 比 11 快不少、只大一点；第一次请求要等它压完（审查 Minor）
              params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: 10,
                [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
              },
            })
          : gzipAsync(body, { level: 9 });
      zipped.set(k, z);
      z.catch(() => zipped.delete(k));
    }
    return z;
  };
  return async (r) => {
    r.get('/weather', async (req) => {
      const { shardId } = requireAccount(req).data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      return ok(await world.view(shardId));
    });
    /** 道具目录：?lang= 按语言返回名字（问题记录 272）；带 ETag，没变时回 304（质量期 ③） */
    // 自己压缩、缓存压好的正文，不走全局压缩
    r.get('/catalog', { compress: false }, async (req, reply) => {
      const lang = parse(z.object({ lang: localeSchema.optional() }), req.query).lang ?? 'zh-CN';
      const c = catalogOf(lang);
      // no-cache：浏览器每次都来问一下，没变就 304，前端代码不用改
      reply.header('etag', c.etag).header('cache-control', 'no-cache');
      // Vary 加在已有的后面，不覆盖（例如以后跨域改成按来源时的 Vary: Origin）
      const vary = reply.getHeader('vary');
      reply.header('vary', vary ? `${String(vary)}, accept-encoding` : 'accept-encoding');
      // 认弱 ETag（Cloudflare 压缩时改成 W/）和多个值（终审 Important 1）
      if (etagMatches(req.headers['if-none-match'], c.etag)) return reply.code(304).send();
      reply.type('application/json; charset=utf-8');
      const enc = pickEncoding(req.headers['accept-encoding']);
      if (!enc) return reply.send(c.body);
      return reply.header('content-encoding', enc).send(await zippedOf(lang, enc, c.body));
    });
  };
}
