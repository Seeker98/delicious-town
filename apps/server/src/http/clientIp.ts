import type { FastifyInstance } from 'fastify';

/**
 * 真实 IP：只有在服务器只接受 Cloudflare Tunnel 流量（TRUST_CF_HEADER=true）时才信任 CF-Connecting-IP，
 * 否则这个请求头可以被伪造。
 */
export function registerClientIp(app: FastifyInstance, trustCfHeader: boolean): void {
  app.decorateRequest('clientIp', '');
  app.addHook('onRequest', async (req) => {
    const cf = req.headers['cf-connecting-ip'];
    req.clientIp = trustCfHeader && typeof cf === 'string' && cf.length > 0 ? cf : req.ip;
  });
}
