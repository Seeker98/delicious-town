import type { FastifyInstance } from 'fastify';

/**
 * 接口的安全响应头（安全审计 M2 2026-10-25）：接口只回 JSON，不该被当网页渲染、也不该被嵌进框里。
 * HSTS 不带 preload、不带 includeSubDomains（preload 进了浏览器内置列表很难撤，要用户拍板）；
 * 浏览器在 http 下会忽略 HSTS，本地开发不受影响。网页那边的头在 apps/web/public/_headers
 */
const HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

export function registerSecurityHeaders(app: FastifyInstance): void {
  // onRequest 里设：404、报错、被限流挡下的响应也都带上
  app.addHook('onRequest', async (_req, reply) => {
    reply.headers(HEADERS);
  });
}
